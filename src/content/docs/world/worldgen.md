---
title: World Generation
description: Chunk sources, the ~33-layer Java-parity GenLayer biome pipeline, and the worldgen overhaul (commit 720e1a77) that rewrote neoLegacy terrain to match decompiled Java LCE.
---

World generation in neoLegacy is split into three cooperating pieces: a
**`ChunkSource`** that fills a chunk's block array with terrain, a **GenLayer
stack** that decides which biome sits at every column, and per-biome
**decorators / features** that scatter ores, trees, plants and structures on top.
Because neoLegacy is a direct C++ port of the decompiled Java LCE codebase, these
classes mirror `net.minecraft.world.level.*` almost one-for-one.

This page covers the chunk/level source hierarchy and the GenLayer pipeline, and
calls out the **worldgen overhaul in commit `720e1a77`** ("changed world
generation according to java"), which is the single biggest divergence from the
older 4J-modified generator. Biomes have their own page
([Biomes](/slop-docs/world/biomes/)); features and structures are on
[Structures & Features](/slop-docs/world/structures/); the fog/portal side of the
three dimensions is on [Dimensions](/slop-docs/world/dimensions/).

Files: `ChunkSource.h`, `LevelSource.h`, `RandomLevelSource.h/.cpp`,
`FlatLevelSource.*`, `CustomLevelSource.*`, `HellRandomLevelSource.*`,
`HellFlatLevelSource.*`, `TheEndLevelRandomLevelSource.*`, `ReadOnlyChunkCache.h`,
`Layer.h/.cpp`, `BiomeSource.h/.cpp`, and ~33 `*Layer.h` headers.

## ChunkSource — the terrain producer

`class ChunkSource` (`ChunkSource.h:51`) is the abstract interface that turns
`(chunkX, chunkZ)` into a `LevelChunk`. Every generator and the caching decorator
implement it. The key pure-virtuals:

| Method | Purpose |
|--------|---------|
| `getChunk(x, z)` | return a loaded/cached chunk (or generate on miss) |
| `create(x, z)` | actually generate a new chunk's blocks |
| `postProcess(parent, x, z)` | second pass — decoration, features, structure carving |
| `hasChunk(x, z)` | is this chunk resident? |
| `getMobsAt(cat, x, y, z)` | biome/structure spawn list at a position |
| `findNearestMapFeature(level, name, x, y, z)` | locate a structure for maps / `/locate`-style lookups |
| `recreateLogicStructuresForChunk(cx, cz)` | rebuild "logic structures" (e.g. Nether fortress bridges) after loading from disk |
| `save`, `tick`, `shouldSave`, `gatherStats` | lifecycle + the F3 stats string |

`ChunkSource` also stores console-specific world-size fields directly:
`m_XZSize` (the world's max XZ extent) and, under `_LARGE_WORLDS`, three
`m_*EdgeMoat` flags. Console worlds are **finite** — the width constants live in
`ChunkSource.h:8-49`:

| Constant | Value | Notes |
|----------|-------|-------|
| `LEVEL_WIDTH_CLASSIC` | 54 | legacy TU map size (`LEVEL_LEGACY_WIDTH`) |
| `LEVEL_WIDTH_SMALL` | 64 | |
| `LEVEL_WIDTH_MEDIUM` | 192 (`3*64`) | |
| `LEVEL_WIDTH_LARGE` | 320 (`5*64`) | `LEVEL_MAX_WIDTH` under `_LARGE_WORLDS` |
| `HELL_LEVEL_SCALE_*` | 3 / 3 / 6 / 8 | Nether compression per size (comment: "Scale was 8 in the Java game, but that would make our nether tiny") |
| `END_LEVEL_SCALE` | 3 | End is fixed at 18×18 (`54 / 3`) for all platforms |

This finite, size-tiered world is a fundamental LCE difference from Java's
infinite terrain and is baked into the `ChunkSource` base rather than any one
generator.

### LevelSource — the read interface

`class LevelSource` (`LevelSource.h:9`) is a separate, smaller interface: the
read-only view of block/biome/light data that gameplay code queries. `Level`
(`Level.h:55`) and `Region` (`Region.h:9`, a bounded view) both implement it. It
exposes `getTile`, `getData`, `getMaterial`, `getBiome`, `getBiomeSource`,
`getBrightness`, `getDirectSignal`, and `getLightColor` (annotated `4J - brought
forward from 1.8.2, added tileId`). Do not confuse `ChunkSource` (produces chunks)
with `LevelSource` (reads a live level).

## The ChunkSource / LevelSource hierarchy

`grep 'public ChunkSource\|public LevelSource'`:

| Class | Base | Role |
|-------|------|------|
| `RandomLevelSource` | `ChunkSource` | overworld terrain (Perlin noise + biome surface) |
| `FlatLevelSource` | `ChunkSource` | superflat |
| `CustomLevelSource` | `ChunkSource` | debug heightmap override (`_OVERRIDE_HEIGHTMAP`) |
| `HellRandomLevelSource` | `ChunkSource` | Nether terrain |
| `HellFlatLevelSource` | `ChunkSource` | superflat Nether (debug) |
| `TheEndLevelRandomLevelSource` | `ChunkSource` | End islands |
| `ReadOnlyChunkCache` | `ChunkSource` | caching decorator wrapping a real source |
| `Level` | `LevelSource` | the live world |
| `Region` | `LevelSource` | bounded snapshot for rendering / lighting |

Which source a dimension uses is decided by `Dimension::createRandomLevelSource()`
(`Dimension.cpp:77`) — it returns a `FlatLevelSource` for `LevelType::lvl_flat`,
otherwise a `RandomLevelSource`. `HellDimension` and `TheEndDimension` override it
with their own sources (see [Dimensions](/slop-docs/world/dimensions/)).

## RandomLevelSource — overworld terrain

`class RandomLevelSource : public ChunkSource` (`RandomLevelSource.h:15`) is the
heart of overworld generation. It holds a bank of `PerlinNoise` generators
(`lperlinNoise1/2`, `perlinNoise1/3`, `scaleNoise`, `depthNoise`, `forestNoise`,
and floating-island noise) and generation constants:

| Constant | Value |
|----------|-------|
| `CHUNK_HEIGHT` | 8 |
| `CHUNK_WIDTH` | 4 |
| `FLOATING_ISLANDS` | `false` |
| `SNOW_CUTOFF`, `SNOW_SCALE` | tuning doubles for the snow line |

Terrain is built at the coarse 4×8×4 noise grid (`CHUNK_WIDTH`/`CHUNK_HEIGHT`) and
trilinearly interpolated up to full block resolution in `prepareHeights`.
`RandomLevelSource` owns the structure generators as members — `caveFeature`,
`strongholdFeature`, `villageFeature`, `mineShaftFeature`, `scatteredFeature`,
`canyonFeature`, and the neoLegacy-new **`oceanMonument`** (`RandomLevelSource.cpp:37-43`).

## The worldgen overhaul — commit 720e1a77

Commit **`720e1a77`** ("feat: oceanMonument / feat: Mesa biomes / **feat: changed
world generation according to java** / fix: swamp hut changed to spruce", touching
~50 files) replaced the older 4J-modified generator with one that follows the
decompiled Java LCE pipeline. Three things changed.

### 1. Surface building moved into the biomes

Before the overhaul, `RandomLevelSource::buildSurfaces(xOffs, zOffs, blocks,
biomes)` walked every column itself, picking `topMaterial` / `material` per biome
inline and stamping bedrock/stone/sand. The overhaul deleted that body and now
delegates to each biome's `buildSurfaceAtDefault(...)`:

```cpp
b->buildSurfaceAtDefault(level, random, blocks.data, blockData.data,
    ...);   // RandomLevelSource.cpp:386
```

The signature also gained a **block-data channel** — `buildSurfaces` went from
`(…, byteArray blocks, BiomeArray biomes)` to `(…, byteArray blocks, byteArray
blockData, BiomeArray biomes)` — so biomes like Mesa can write per-block *data
values* (stained-clay colors) during surface build, matching Java's `ChunkPrimer`
(the comment at `RandomLevelSource.cpp:421` notes the block/data arrays are
"equivalent to Java's ChunkPrimer data"). This is what lets
[Mesa biomes](/slop-docs/world/biomes/) render banded terracotta.

### 2. The GenLayer stack was rebuilt to Java parity

`Layer::getDefaultLayers` (`Layer.cpp:22`) was rewritten. The old version was a
hand-tuned 4J stack whose own comments admitted it lacked "shores, swamprivers,
region hills etc." and hacked mushroom-island placement "to here … about 1/8 of
the original size". The new stack is the canonical Java layer chain, adds several
previously-missing layers, and — crucially — its `Layer` constructors now take the
**world seed** as their first argument (`make_shared<IslandLayer>(seed, 1)` vs the
old seedless `IslandLayer(1)`), so per-layer RNG is seeded the Java way.

### 3. Ocean Monument + Mesa were introduced

The commit added `OceanMonumentFeature` / `OceanMonumentPieces` (1660 lines of
piece code), `MesaBiome`, the `DeepOceanLayer` / `RemoveTooMuchOceanLayer` /
`RareBiomeLayer` layers, and switched the swamp hut's wood to spruce. Ocean
Monument and Mesa are covered in [Structures & Features](/slop-docs/world/structures/)
and [Biomes](/slop-docs/world/biomes/).

## The GenLayer stack

`class Layer` (`Layer.h:11`) is the base for the biome-selection pipeline. Each
layer wraps a `parent` layer and produces an `intArray` region on demand via the
pure-virtual `getArea(xo, yo, w, h)`. Seeding is per-layer: a layer mixes the world
seed with its own `seedMixup` constant, and `initRandom(x, y)` re-seeds for each
sampled position — this is what makes worldgen deterministic. Static helpers
`isOcean(id)` and `isSame(a, b)` are shared by many layers.

`Layer::getDefaultLayers(seed, levelType, superflatConfig)` (`Layer.cpp:22`) wires
the whole chain and returns a **3-element `LayerArray`**: a full-resolution biome
layer, a `VoronoiZoom` fuzzy-edge layer, and the un-voronoi'd biome layer again
(used where the raw biome id is wanted). The chain, in order:

**Continent shaping (the "island" branch):**

`IslandLayer` → `FuzzyZoomLayer` → `AddIslandLayer` → `ZoomLayer` →
`AddIslandLayer`×3 → **`RemoveTooMuchOceanLayer`** → `AddSnowLayer` →
`AddIslandLayer` → **`AddEdgeLayer`×3** (cool/heat/special edges) → `ZoomLayer`×2 →
`AddIslandLayer` → **`DeepOceanLayer`** → `ZoomLayer`.

**Rivers (a parallel branch):**

`ZoomLayer` → `RiverInitLayer` → `ZoomLayer`×N → `RiverLayer` → `SmoothLayer`.

**Biome assignment:**

`BiomeInitLayer` (places base biomes; also handles `largeBiomes` / `customized`) →
`ZoomLayer` → **`BiomeEdgeLayer`** → **`RegionHillsLayer`** (adds hill/plateau
variants using a separate noise layer) → **`RareBiomeSpotLayer`** (sunflower plains
etc.) → a zoom loop that folds in `AddIslandLayer`, `AddMushroomIslandLayer`,
`GrowMushroomIslandLayer` and `ShoreLayer` at specific zoom depths → `SmoothLayer`.

**Merge:** `RiverMixerLayer` carves the river branch into the biome branch →
`VoronoiZoom` produces the fuzzy 1:1 output.

`zoomLevel` defaults to 4, rises to 6 for `LevelType::lvl_largeBiomes`, and is read
from a `CustomizableSourceSettings` for `lvl_customized` (biome size + river size).

### The ~33 layer classes

| Layer | Job |
|-------|-----|
| `IslandLayer` | seeds the initial land/ocean grid |
| `FuzzyZoomLayer`, `ZoomLayer`, `SmoothZoomLayer` | scale up 1→2 with jitter / without |
| `AddIslandLayer` | grow land, fill single-cell holes |
| `RemoveTooMuchOceanLayer` | *(new)* thin out excessive ocean |
| `DeepOceanLayer` | *(new)* mark ocean interiors as deep ocean |
| `AddSnowLayer` | assign cold/warm/temperate climate bands |
| `AddEdgeLayer` | cool-warm, heat-ice and special edge transitions |
| `AddMushroomIslandLayer`, `GrowMushroomIslandLayer` | rare mushroom islands |
| `BiomeInitLayer` | pick the actual biome per climate cell |
| `BiomeEdgeLayer` | *(new)* smooth incompatible biome borders |
| `BiomeOverrideLayer` | debug biome override (`_BIOME_OVERRIDE`) |
| `RegionHillsLayer` | inject hills / plateaus / mutations |
| `RareBiomeLayer`, `RareBiomeSpotLayer` | *(new/expanded)* rare mutated-biome spots |
| `RiverInitLayer`, `RiverLayer`, `RiverMixerLayer`, `SwampRiversLayer` | river network |
| `ShoreLayer` | beaches / shore edges |
| `SmoothLayer` | de-noise final boundaries |
| `TemperatureLayer`, `TemperatureMixerLayer`, `DownfallLayer`, `DownfallMixerLayer` | climate grids (present in the module; the default overworld chain reads climate from noise) |
| `FlatLayer` | single-biome output for superflat |
| `LightLayer` | light-variety enum shared by `LevelSource` |
| `DataLayer` | the packed grid backing store |

Layers `RemoveTooMuchOceanLayer`, `DeepOceanLayer`, `BiomeEdgeLayer` and the
expanded `RareBiome*` layers were added by / around the overhaul (their `.cpp`
files appear in commit `720e1a77`). Namespace stub:
`net.minecraft.world.level.newbiome.layer.h`.

## BiomeSource — the runtime lookup

`class BiomeSource` (`BiomeSource.h:13`) wraps the compiled layer chain and is what
`Level::getBiomeSource()` returns. It caches results in a `BiomeCache`
(`CACHE_DIAMETER = 256`) and answers `getBiome(x, z)`, block-wise
`getBiomeBlock(...)`, plus climate queries (`getTemperature`, `getDownfall`) and
biome searches (`findBiome`, `containsOnly`). `RandomLevelSource` calls
`getBiomeBlock(...)` at `RandomLevelSource.cpp:419` to fetch the 16×16 biome grid
for a chunk before running terrain + per-biome surface build.

The Nether and End instead use a **`FixedBiomeSource`** (a single biome
everywhere): `FixedBiomeSource(Biome::hell, …)` and `FixedBiomeSource(Biome::sky,
…)`, wired in `HellDimension::init` and `TheEndDimension::init`.

## Related pages

- [Biomes](/slop-docs/world/biomes/) — the ~30 biome classes and their decorators
- [Structures & Features](/slop-docs/world/structures/) — Features and StructureFeatures
- [Dimensions](/slop-docs/world/dimensions/) — how each dimension picks its ChunkSource
- [Minecraft.World Overview](/slop-docs/world/overview/) — the staticCtor bootstrap

---
title: Biomes
description: The ~30 Biome classes, the id-keyed biome table, BiomeSource/BiomeDecorator, and the neoLegacy additions — Mesa, Deep Ocean, flower forest, roofed forest and the mutated "M" variants.
---

A **Biome** carries everything region-specific about a patch of world: its color,
top/fill blocks, temperature and downfall, mob spawn lists, and a `BiomeDecorator`
that places its trees, flowers, ores and other features. neoLegacy is a direct C++
port of decompiled Java LCE, so the class is `Biome` (the pre-flattening
`net.minecraft.world.level.biome`), and every biome is a `new` in one big
`staticCtor` with a hard-coded numeric id.

Files: `Biome.h`, `Biome.cpp`, `BiomeSource.h/.cpp`, `BiomeDecorator.h/.cpp`,
`BiomeCache.h`, `FixedBiomeSource.h`, plus ~20 subclass headers (`OceanBiome.h`,
`PlainsBiome.h`, `DesertBiome.h`, `ForestBiome.h`, `TaigaBiome.h`, `SwampBiome.h`,
`RiverBiome.h`, `IceBiome.h`, `MushroomIslandBiome.h`, `BeachBiome.h`,
`StoneBeachBiome.h`, `JungleBiome.h`, `ExtremeHillsBiome.h`, `RainforestBiome.h`,
`SavannaBiome.h`, `MesaBiome.h`, `MutatedBiome.h`, `HellBiome.h`, `TheEndBiome.h`).

## Base class

`class Biome` (`Biome.h:24`). The registry is a single flat array —
`static Biome *biomes[257]` (`Biome.h:30`) — indexed by biome id, plus ~60 named
static pointers (`Biome::ocean`, `Biome::plains`, …, `Biome::mesaPlateauM`). The
per-biome state (`Biome.h:100`+):

| Field | Meaning |
|-------|---------|
| `m_name` | display name (`wstring`) |
| `id` | numeric biome id (const) |
| `topMaterial` / `topMaterialData` | surface block + data (grass, sand, …) |
| `material` / `materialData` | fill block below the surface (usually dirt/stone) |
| `depth` / `scale` | terrain base height + variance |
| `temperature` / `downfall` | climate (drives snow vs rain, grass tint) |
| `snowCovered` / `_hasRain` | precipitation flags |
| `m_grassColor` / `m_foliageColor` / `m_waterColor` / `m_skyColor` | `eMinecraftColour` tints |
| `decorator` | the `BiomeDecorator *` that places features |
| `GRASS_COLOR_NOISE` | per-biome `PerlinNoise` for grass-color jitter |
| `DOUBLE_PLANT_GENERATOR` | a shared `DoublePlantFeature` (sunflowers / tall flowers) |

The constructor (`Biome.cpp:127`) registers `this` into `biomes[id]`, builds a
`BiomeDecorator`, and seeds a **default mob spawn table** every biome inherits:
sheep/pig/cow/chicken as friendlies; spider/zombie/skeleton/creeper/slime plus a
rare enderman and witch as enemies; squid as a water friendly; bat as ambient
(`Biome.cpp:157-176`). Subclasses append or override these.

### Fluent setup

Biomes are configured with chained mutators returning `this`, e.g.
`setColor`, `setName`, `setTemperatureAndDownfall`, `setDepthAndScale`,
`setNoRain`, `setSnowCovered`, `setLeafColor`, and
`setLeafFoliageWaterSkyColor(grass, foliage, water, sky)`. A representative
registration:

```cpp
Biome::plains = (new PlainsBiome(1,false))->setColor(0x8db360)->setName(L"Plains")
    ->setTemperatureAndDownfall(0.8f, 0.4f)
    ->setLeafFoliageWaterSkyColor(eMinecraftColour_Grass_Plains, ...);
// Biome.cpp:83
```

### Mob spawn buckets

Spawning reads typed vectors of `Biome::MobSpawnerData` (a `WeighedRandomItem`
holding an `eINSTANCEOF mobClass` + weight + min/max count, `Biome.h:121`):
`enemies`, `friendlies`, `waterFriendlies`, `friendlies_chicken`,
`friendlies_wolf`, `friendlies_mushroomcow`, `ambientFriendlies`.
`getMobs(MobCategory*)` (`Biome.cpp`) picks the right bucket for a spawn attempt.

## The biome table

`Biome::staticCtor()` (`Biome.cpp:80`) fills `biomes[]`. **Base biomes** occupy
ids 0–39; the **mutated / "M" and technical variants** are placed sparsely from 129
upward, matching the Java LCE id assignment exactly.

### Base biomes (ids 0–39)

| id | `Biome::` | Class | Name |
|----|-----------|-------|------|
| 0 | `ocean` | `OceanBiome` | Ocean |
| 1 | `plains` | `PlainsBiome` | Plains |
| 2 | `desert` | `DesertBiome` | Desert |
| 3 | `extremeHills` | `ExtremeHillsBiome` | Extreme Hills |
| 4 | `forest` | `ForestBiome` | Forest |
| 5 | `taiga` | `TaigaBiome` | Taiga |
| 6 | `swampland` | `SwampBiome` | Swampland |
| 7 | `river` | `RiverBiome` | River |
| 8 | `hell` | `HellBiome` | Hell (Nether) |
| 9 | `sky` | `TheEndBiome` | Sky (End) |
| 10 | `frozenOcean` | `OceanBiome` | Frozen Ocean |
| 11 | `frozenRiver` | `RiverBiome` | Frozen River |
| 12 | `iceFlats` | `IceBiome` | Ice Plains |
| 13 | `iceMountains` | `IceBiome` | Ice Mountains |
| 14 | `mushroomIsland` | `MushroomIslandBiome` | Mushroom Island |
| 15 | `mushroomIslandShore` | `MushroomIslandBiome` | Mushroom Island Shore |
| 16 | `beaches` | `BeachBiome` | Beach |
| 17 | `desertHills` | `DesertBiome` | Desert Hills |
| 18 | `forestHills` | `ForestBiome` | Forest Hills |
| 19 | `taigaHills` | `TaigaBiome` | Taiga Hills |
| 20 | `smallerExtremeHills` | `ExtremeHillsBiome` | Extreme Hills Edge |
| 21 | `jungle` | `JungleBiome` | Jungle |
| 22 | `jungleHills` | `JungleBiome` | Jungle Hills |
| 23 | `jungleEdge` | `JungleBiome` | Jungle Edge |
| 24 | `deepOcean` | `OceanBiome` | **Deep Ocean** |
| 25 | `stoneBeach` | `StoneBeachBiome` | Stone Beach |
| 26 | `coldBeach` | `BeachBiome` | Cold Beach |
| 27 | `birchForest` | `ForestBiome`(type 2) | Birch Forest |
| 28 | `birchForestHills` | `ForestBiome`(type 2) | Birch Forest Hills |
| 29 | `roofedForest` | `ForestBiome`(type 3) | **Roofed Forest** |
| 30 | `coldTaiga` | `TaigaBiome` | Cold Taiga |
| 31 | `coldTaigaHills` | `TaigaBiome` | Cold Taiga Hills |
| 32 | `megaTaiga` | `TaigaBiome`(type 1) | Mega Taiga |
| 33 | `megaTaigaHills` | `TaigaBiome`(type 2) | Mega Taiga Hills |
| 34 | `extremeHills_plus` | `ExtremeHillsBiome` | Extreme Hills+ |
| 35 | `savanna` | `SavannaBiome` | **Savanna** |
| 36 | `savannaPlateau` | `SavannaBiome` | Savanna Plateau |
| 37 | `mesa` | `MesaBiome` | **Mesa** |
| 38 | `mesaPlateauF` | `MesaBiome`(plateau, trees) | Mesa Plateau F |
| 39 | `mesaPlateau` | `MesaBiome`(plateau) | Mesa Plateau |

### Mutated / technical variants (ids 129–167)

| id | `Biome::` | Class | Name |
|----|-----------|-------|------|
| 129 | `sunflowersPlains` | `PlainsBiome`(sunflower) | **Sunflowers Plains** |
| 130 | `desertM` | `DesertBiome` | Desert M |
| 131 | `extremeHillsM` | mutated `ExtremeHillsBiome` | Extreme Hills M |
| 132 | `flowerForest` | `ForestBiome`(type 1) | **Flower Forest** |
| 133 | `taigaM` | `TaigaBiome` | Taiga M |
| 134 | `swamplandM` | `SwampBiome` | Swampland M |
| 140 | `iceSpikes` | `IceBiome`(spikes) | **Ice Spikes** |
| 149 | `jungleM` | `JungleBiome` | Jungle M |
| 151 | `jungleEdgeM` | `JungleBiome` | Jungle Edge M |
| 155 | `birchForestM` | `ForestBiome::MutatedBirchForestBiome` | Birch Forest M |
| 156 | `birchForestHillsM` | `ForestBiome::MutatedBirchForestBiome` | Birch Forest Hills M |
| 157 | `roofedForestM` | `ForestBiome::MutatedForestBiome` | Roofed Forest M |
| 158 | `coldTaigaM` | `TaigaBiome` | Cold Taiga M |
| 160 | `redwoodTaiga` | `TaigaBiome`(type 1) | Mega Spruce Taiga |
| 161 | `redwoodTaigaHills` | `TaigaBiome`(type 2) | Mega Spruce Taiga Hills |
| 162 | `extremeHills_plusM` | mutated `ExtremeHillsBiome` | Extreme Hills+ M |
| 163 | `savannaM` | `MutatedSavannaBiome` | Savanna M |
| 164 | `savannaPlateauM` | `MutatedSavannaBiome` | Savanna Plateau M |
| 165 | `mesaBryce` | `MesaBiome` | Mesa (Bryce) |
| 166 | `mesaPlateauFM` | `MesaBiome`(plateau, trees) | Mesa Plateau F M |
| 167 | `mesaPlateauM` | `MesaBiome`(plateau) | Mesa Plateau M |

The `id + 128` offset for mutated biomes is the Java convention; e.g. Sunflower
Plains (129) = Plains (1) + 128, Savanna M (163) = Savanna (35) + 128.

## Biome subclasses

Each subclass overrides tree/flower/decoration behaviour. Constructor int flags
select the sub-variant (e.g. `ForestBiome(id, type)` where 0=oak, 1=flower,
2=birch, 3=roofed; `TaigaBiome(id, type)` where 1/2=mega/redwood).

| Class | Distinguishing behaviour |
|-------|--------------------------|
| `OceanBiome` | ocean / frozen ocean / deep ocean; no trees |
| `PlainsBiome` | grass + flowers; sunflower variant when constructed `(id, true)` |
| `DesertBiome` | sand surface, `setNoRain`, dead bushes, cacti, desert wells |
| `ForestBiome` | oak/birch/roofed/flower trees; overrides grass + flower + double-plant selection |
| `TaigaBiome` | spruce/pine, mega-spruce variants |
| `SwampBiome` | swamp trees, water lilies, dark grass tint |
| `RiverBiome` | flat, negative depth channel |
| `IceBiome` | snow-covered; ice-spikes variant |
| `MushroomIslandBiome` | mycelium surface, mooshroom-only spawns |
| `BeachBiome` / `StoneBeachBiome` | sand vs stone shoreline |
| `JungleBiome` | jungle trees + melons; edge variant suppresses large trees |
| `ExtremeHillsBiome` | high `scale`; emerald/silverfish; `createMutatedBiome(id)` builds the M copy |
| `SavannaBiome` / `MutatedSavannaBiome` | acacia trees, `setNoRain`, hot-dry tint |
| `MesaBiome` | banded terracotta surface (see below) |
| `HellBiome` | Nether — used via `FixedBiomeSource` |
| `TheEndBiome` | End — used via `FixedBiomeSource` |
| `RainforestBiome` | present in the module; jungle-family variant |

### MutatedBiome

`class MutatedBiome : public Biome` (`MutatedBiome.h:4`) is the base for "M"
variants. It wraps a `m_baseBiome` and delegates most queries to it while
overriding `getTreeFeature`, `decorate`, `getGrassColor`, `getFolageColor`,
`getCreatureProbability`, `getRandomDoublePlantType`, and `buildSurfaceAt`. Some
mutated biomes are built with a dedicated helper — `ExtremeHillsBiome` exposes
`createMutatedBiome(id)` (used for ids 131/162) — while forest variants use the
nested `ForestBiome::MutatedBirchForestBiome` / `MutatedForestBiome` classes.

### MesaBiome — banded terracotta

`class MesaBiome : public Biome` (`MesaBiome.h:14`) is a neoLegacy/TU31 addition
and the reason surface-building moved into biomes (see
[World Generation](/slop-docs/world/worldgen/)). It generates a **64-band color
map** (`BAND_COUNT = 64`) of stained/hardened clay data values using a
`PerlinSimplexNoise`, writing per-block *data* into the ChunkPrimer data channel.
Band color constants (`MesaBiome.h:20-25`):

| Constant | Data value |
|----------|-----------|
| `BAND_WHITE` | 0 |
| `BAND_ORANGE` | 1 |
| `BAND_YELLOW` | 4 |
| `BAND_SILVER` | 8 |
| `BAND_BROWN` | 12 |
| `BAND_RED` | 14 |

The constructor `MesaBiome(id, isMesaPlateau, hasTrees)` selects flat mesa vs
plateau and whether the plateau grows trees (the "F" variants).

## BiomeDecorator — feature placement

`class BiomeDecorator` (`BiomeDecorator.h`) holds the pool of `Feature *` a biome
draws from and per-feature counts. Its `decorate(level, random, xo, zo)` is what a
biome's `decorate()` override calls to scatter content. The feature slots include
the standard ores (`coalOreFeature`, `ironOreFeature`, `goldOreFeature`,
`redStoneOreFeature`, `diamondOreFeature`, `lapisOreFeature`) plus **granite /
diorite / andesite ore features** (`graniteOreFeature`, `dioriteOreFeature`,
`andesiteOreFeature`) — the polished-stone variants — and an expanded flower set:
`yellowFlowerFeature`, `roseFlowerFeature`, `blueOrchidFeature`, `alliumFeature`,
`azureBluetFeature`, `oxeyeDaisyFeature`, four tulip colors, plus a
`doublePlantFeature` (sunflowers / tall flowers / large ferns).

Counts (`flowerCount`, `grassCount`, `treeCount`, `doublePlantCount`,
`waterlilyCount`, `reedsCount`, `cactusCount`, etc.) are tuned per biome. The base
`Biome` constructor sets `flowerCount = 2`, `grassCount = 1` as defaults
(`Biome.cpp:151-152`). The `TheEndBiomeDecorator` variant handles the featureless
End.

## BiomeSource & FixedBiomeSource

The overworld uses `BiomeSource` (the compiled GenLayer chain, cached in a
`BiomeCache`); see [World Generation](/slop-docs/world/worldgen/). The Nether and
End use `FixedBiomeSource(Biome::hell, …)` / `FixedBiomeSource(Biome::sky, …)`,
returning one biome everywhere — set in `HellDimension::init` /
`TheEndDimension::init`.

## neoLegacy delta vs vanilla TU19

Added over the TU19 base (most in the biome update commits and the `720e1a77`
overhaul):

- **Mesa family** (37–39, 165–167) with 64-band terracotta surface builder.
- **Deep Ocean** (24) — placed by the new `DeepOceanLayer`; also the **Ocean
  Monument** spawn biome (see [Structures & Features](/slop-docs/world/structures/)).
- **Roofed Forest** (29) + **Flower Forest** (132) + **Sunflowers Plains** (129).
- **Savanna** family (35, 36, 163, 164) with acacia trees.
- **Mega Taiga / Redwood Taiga** (32, 33, 160, 161).
- Full **mutated "M" variant** set at the Java `+128` ids.
- Melon generation added to Jungle/Savanna decorators (`MelonFeature`).

## Related pages

- [World Generation](/slop-docs/world/worldgen/) — the GenLayer stack that assigns these biomes
- [Structures & Features](/slop-docs/world/structures/) — the Features a decorator places
- [Blocks / Tiles](/slop-docs/world/blocks/) — the terracotta, acacia and packed-ice blocks these biomes place

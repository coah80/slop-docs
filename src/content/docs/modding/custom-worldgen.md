---
title: Custom World Generation
description: A full worked example — add a new Feature subclass to neoLegacy end to end, modeled on how MelonFeature and DoublePlantFeature are actually placed today.
---

This page covers adding things that generate *inside* chunks after terrain — ores,
plants, blobs, small decorations. The unit of that work is a **`Feature`**
(`Feature.h`). We use two real neoLegacy features as templates:
**`MelonFeature`** (`MelonFeature.cpp` — a minimal scatter-place feature) and
**`DoublePlantFeature`** (`DoublePlantFeature.cpp` — the sunflower/tall-plant
feature added for neoLegacy), plus the `BiomeDecorator` that drives them.

Read [Getting Started](/slop-docs/modding/getting-started/) first, and pair this
with [Adding Biomes](/slop-docs/modding/adding-biomes/) (which wires the biome
side) and the [World Generation reference](/slop-docs/world/worldgen/).

For the worked example we'll add a **BasaltColumnFeature**: it scatters a few
short pillars of stone on the surface, deliberately close to `MelonFeature` so
you can diff it against a merged feature.

## The `Feature` interface

Every generatable decoration derives from `Feature` (`Feature.h:5`):

```cpp
// Feature.h
class Feature
{
public:
    Feature();
    Feature(bool doUpdate);
    virtual bool place(Level *level, Random *random, int x, int y, int z) = 0;   // the one you must implement
    virtual bool placeWithIndex(Level*, Random*, int x, int y, int z, int idx, int radius) { return false; }
    virtual void init(double V1, double V2, double V3) {};
    virtual void applyFeature(Level *level, Random *random, int xChunk, int zChunk);
protected:
    virtual void placeBlock(Level *level, int x, int y, int z, int tile);
    virtual void placeBlock(Level *level, int x, int y, int z, int tile, int data);
};
```

`place` is the only pure-virtual — it does the work and returns whether it placed
anything. `init` is optional (trees use it for size params; see
`BiomeDecorator.cpp:141` calling `tree->init(1,1,1)`).

## Step 0 — study the minimal template

`MelonFeature` is the smallest complete feature in the tree
(`MelonFeature.h`/`MelonFeature.cpp`):

```cpp
// MelonFeature.h
class MelonFeature : public Feature
{
public:
    virtual bool place(Level *level, Random *random, int x, int y, int z);
};
```

```cpp
// MelonFeature.cpp — the whole thing
bool MelonFeature::place(Level *level, Random *random, int x, int y, int z)
{
    for (int i = 0; i < 64; i++)
    {
        int x2 = x + random->nextInt(8) - random->nextInt(8);
        int y2 = y + random->nextInt(4) - random->nextInt(4);
        int z2 = z + random->nextInt(8) - random->nextInt(8);
        if (level->isEmptyTile(x2, y2, z2) && level->getTile(x2, y2 - 1, z2) == Tile::grass_Id)
        {
            if (Tile::melon->mayPlace(level, x2, y2, z2))
            {
                level->setTileAndData(x2, y2, z2, Tile::melon_block_Id, 0, Tile::UPDATE_CLIENTS);
            }
        }
    }
    return true;
}
```

The recurring shape (also in `DoublePlantFeature::place`,
`DoublePlantFeature.cpp:17-43`): **64 scatter attempts** around the given
`(x,y,z)` using the `+ nextInt(8) - nextInt(8)` / `+ nextInt(4) - nextInt(4)`
offset idiom, each attempt validated (empty target, right block below,
`mayPlace`) before writing with `setTileAndData(..., Tile::UPDATE_CLIENTS)`.

Key `Level` calls a feature uses:

| Call | Purpose | Source |
|------|---------|--------|
| `level->getTile(x,y,z)` | read a block id | `Level.h:200` |
| `level->isEmptyTile(x,y,z)` | is the cell air | used `MelonFeature.cpp:13` |
| `level->setTileAndData(x,y,z,id,data,flags)` | write a block | `MelonFeature.cpp:17` |
| `Tile::xxx->mayPlace(level,x,y,z)` | can this block legally sit here | `MelonFeature.cpp:15` |
| `level->getTopSolidBlock(x,z)` / `getHeightmap(x,z)` | surface height | `BiomeDecorator.cpp:114`/`:142` |

`Tile::UPDATE_CLIENTS` is the write-flag constant used throughout worldgen.

## Step 1 — the Feature header

Create `Minecraft.World/BasaltColumnFeature.h`, mirroring `MelonFeature.h`:

```cpp
// BasaltColumnFeature.h
#pragma once
#include "Feature.h"

class Level;
class Random;

class BasaltColumnFeature : public Feature
{
public:
    virtual bool place(Level *level, Random *random, int x, int y, int z);
};
```

If your feature needs a parameter (e.g. `DoublePlantFeature` carries an
`m_plantType`, `DoublePlantFeature.h:9`, set via `setPlantType`), add it as a
member with a setter — the decorator sets it before calling `place`.

## Step 2 — implement `place`

Create `Minecraft.World/BasaltColumnFeature.cpp`, following the melon shape but
building a short vertical pillar per hit:

```cpp
// BasaltColumnFeature.cpp
#include "stdafx.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.level.tile.h"
#include "BasaltColumnFeature.h"

bool BasaltColumnFeature::place(Level *level, Random *random, int x, int y, int z)
{
    bool placed = false;

    for (int i = 0; i < 64; i++)
    {
        int x2 = x + random->nextInt(8) - random->nextInt(8);
        int y2 = y + random->nextInt(4) - random->nextInt(4);
        int z2 = z + random->nextInt(8) - random->nextInt(8);

        // must be empty, sitting on solid stone-ish ground
        if (!level->isEmptyTile(x2, y2, z2)) continue;
        if (level->getTile(x2, y2 - 1, z2) != Tile::stone_Id) continue;

        int height = random->nextInt(3) + 1;   // 1..3 tall
        for (int h = 0; h < height; h++)
        {
            if (y2 + h >= Level::maxBuildHeight - 1) break;
            level->setTileAndData(x2, y2 + h, z2, Tile::stone_Id, 0, Tile::UPDATE_CLIENTS);
        }
        placed = true;
    }

    return placed;
}
```

Note the `y2 + h >= Level::maxBuildHeight - 1` guard — `DoublePlantFeature.cpp:27`
does the same (`by >= Level::maxBuildHeight - 1 || by < 1`) to avoid writing out
of bounds. Return `true` if you placed anything (melon always returns `true`;
double-plant tracks a `placed` flag — either is fine).

## Step 3 — decorator wiring: two ways to run a feature

There are two idioms in the codebase for actually invoking a feature during
generation. Pick one.

### Idiom A — count-driven, via `BiomeDecorator`

The shared decorator constructs a feature once in `_init` and runs it `count`
times. For example dead bush (`BiomeDecorator.cpp:243-252`):

```cpp
DeadBushFeature *deadBushFeature = nullptr;
if (deadBushCount > 0) deadBushFeature = new DeadBushFeature(Tile::deadbush_Id);
for (int i = 0; i < deadBushCount; i++)
{
    int x = xo + random->nextInt(16) + 8;
    int y = random->nextInt(Level::genDepth);
    int z = zo + random->nextInt(16) + 8;
    deadBushFeature->place(level, random, x, y, z);
}
if (deadBushFeature != nullptr) delete deadBushFeature;
```

To add your feature this way: give it a count field on `BiomeDecorator.h`
(alongside `deadBushCount` et al., `BiomeDecorator.h:65-82`), default it in
`_init` (`BiomeDecorator.cpp:83-100`), and add a placement loop in
`decorate()` (`:103-359`). Then biomes set the count in their constructor (see
[Adding Biomes → Step 3](/slop-docs/modding/adding-biomes/#step-3--wire-up-the-decorator)).
The `x = xo + nextInt(16) + 8`, `z = zo + nextInt(16) + 8` offset is the standard
per-chunk placement origin.

### Idiom B — biome-local, override `Biome::decorate`

If the feature only belongs to one biome, don't touch the shared decorator —
override that biome's `decorate` and place it directly. `JungleBiome` does this
for melons (`JungleBiome.cpp:58-86`):

```cpp
// JungleBiome.cpp:75 — the melon block, run after the base decorate
PIXBeginNamedEvent(0, "Adding melons");
if (random->nextInt(4) == 0) // ~1 in 4 chunks
{
    int x = xo + random->nextInt(16) + 8;
    int z = zo + random->nextInt(16) + 8;
    int y = random->nextInt(Level::genDepth);
    MelonFeature *melonFeature = new MelonFeature();
    melonFeature->place(level, random, x, y, z);
    delete melonFeature;
}
PIXEndNamedEvent();
```

Note it calls `Biome::decorate(level, random, xo, zo)` first (`JungleBiome.cpp:60`)
so the ores/plants/liquids still run, then adds its own passes. For Basalt Columns
in your Ashland biome, drop the equivalent block into `AshlandBiome::decorate`:

```cpp
// AshlandBiome::decorate
Biome::decorate(level, random, xo, zo);

if (random->nextInt(3) == 0)
{
    int x = xo + random->nextInt(16) + 8;
    int z = zo + random->nextInt(16) + 8;
    int y = level->getHeightmap(x, z);
    BasaltColumnFeature *f = new BasaltColumnFeature();
    f->place(level, random, x, y, z);
    delete f;
}
```

Idiom B is simpler and doesn't perturb any other biome — prefer it unless the
feature is genuinely cross-biome.

## GenLayer vs Feature — know which one you need

The two systems are distinct:

- **`Feature`** (this page) decorates *inside a chunk after terrain* — plants,
  ores, small structures. Runs per-chunk during `BiomeDecorator::decorate` /
  `Biome::decorate`.
- **`GenLayer`** (`Layer.h` + the `*Layer.cpp` family) decides *which biome id*
  each column gets, before terrain. See the pipeline in
  [World Generation](/slop-docs/world/worldgen/):
  `IslandLayer` → zoom/edge/river layers → `BiomeInitLayer` → `RegionHillsLayer`
  → `RareBiomeLayer` → … .

If you want a new *plant/ore/blob*, write a `Feature` (this page). If you want a
new *biome to appear*, that's the layer side — covered in
[Adding Biomes → Step 6](/slop-docs/modding/adding-biomes/#step-6--slot-it-into-the-biome-selection-layer).

### Modifying an existing GenLayer

If you do need to touch the layer pipeline, `BiomeInitLayer::getArea`
(`BiomeInitLayer.cpp:78-174`) is the canonical read-parent/emit-child pattern
every layer follows:

```cpp
intArray b = parent->getArea(xo, yo, w, h);       // pull the layer below
intArray result = IntCache::allocate(w * h);      // scratch buffer
for (int y = 0; y < h; y++)
  for (int x = 0; x < w; x++) {
    initRandom(x + xo, y + yo);                    // seed the deterministic RNG
    int val = b[x + y * w];
    result[x + y * w] = /* transform val */;
  }
return result;
```

`initRandom(worldX, worldZ)` + `nextRandom(n)` (used at `:91`, `:119`) give the
per-position deterministic randomness — always use these, never a fresh
`Random`, or generation won't be reproducible from the seed. `IntCache::allocate`
is a pooled buffer; don't `new int[]`.

## Step 4 — add the source file to the build

Add `BasaltColumnFeature.cpp` to `Minecraft.World/cmake/sources/Common.cmake`
(the same file where mesa's new feature `.cpp`s were listed in `720e1a77`).
Headers aren't listed; `.cpp` files are.

## Textures and blocks

A feature only ever places *existing* blocks (`Tile::stone_Id`,
`Tile::melon_block_Id`, `Tile::double_plant_Id`). If your feature needs a *new*
block, that block is its own task — add it first following
[Adding Blocks](/slop-docs/modding/adding-blocks/) (which covers the tile
registration, texture/icon wiring, and localization), then reference its
`Tile::xxx_Id` from your feature's `place`.

## Testing checklist

- [ ] `BasaltColumnFeature.cpp` is in `cmake/sources/Common.cmake`; builds clean.
- [ ] `place` never writes above `Level::maxBuildHeight - 1` or below `y < 1`.
- [ ] Every write is preceded by a validity check (`isEmptyTile`, ground check, `mayPlace` where relevant) — mirror `MelonFeature.cpp:13-15`.
- [ ] Placement uses the deterministic chunk `random` passed into `decorate`, not a new `Random` — same seed must give same world.
- [ ] Generate a fresh world in the target biome and confirm the feature appears at a plausible density.
- [ ] Regenerate the same seed twice — output is identical (determinism check).
- [ ] Save/reload: placed blocks persist (they're normal `setTileAndData` writes, so this should be automatic).
- [ ] If using Idiom B, you called `Biome::decorate(...)` first so ores/liquids still generate.

## Could not verify

- `MelonFeature`/`DoublePlantFeature` and `Feature`/`BiomeDecorator` are all
  read directly from source. The `Tile::maxBuildHeight`/`genDepth`/`UPDATE_CLIENTS`
  constants are used as the code uses them; their exact numeric values were not
  re-read for this page (they're the standard 128-height LCE constants).

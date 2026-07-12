---
title: "Template: Random Wooden House"
description: A complete, copy-paste worldgen mod — a Feature that scatters small wooden houses across the surface, wired into a biome the neoLegacy way.
---

This is a **complete mod recipe**. Follow it top to bottom and you get a new
worldgen `Feature` — **`RandomHouseFeature`** — that scatters small plank-and-log
huts across the surface of a biome, with rarity you control. It is modeled on two
features that ship in neoLegacy today: **`MelonFeature`** (`MelonFeature.cpp` — the
smallest complete scatter feature) and **`HouseFeature`** (`HouseFeature.cpp` — the
real cobblestone-hut builder used by the swamp witch hut), plus the
`BiomeDecorator`/biome wiring that `PlainsBiome` uses to drop sunflowers.

If you want the *concepts* behind any step, keep these open:
[Custom World Generation](/slop-docs/modding/custom-worldgen/),
[World Generation reference](/slop-docs/world/worldgen/),
[Adding Biomes](/slop-docs/modding/adding-biomes/), and the
[Block IDs reference](/slop-docs/reference/block-ids/). New to the build?
Start with [Getting Started](/slop-docs/modding/getting-started/).

Everything below lives in `Minecraft.World/` unless stated otherwise.

## What we're building

`RandomHouseFeature` places, in one attempt:

- a solid square footprint check (won't build on a slope or in water),
- four **log** corner posts (`Tile::log_Id`, id 17),
- **plank** walls (`Tile::planks_Id`, id 5) with one glass window per side,
- a flat **plank** roof,
- a wooden door (`Tile::wooden_door`) via `DoorItem::place`,
- a **torch** inside so it doesn't spawn mobs.

It is driven from a biome's `decorate()` override, exactly like `PlainsBiome`
drives its sunflower `DoublePlantFeature` — no central feature registry exists;
biomes call features directly (see `BiomeDecorator.cpp`).

## Files you will create

| File | Purpose |
|------|---------|
| `RandomHouseFeature.h` | the `Feature` subclass declaration |
| `RandomHouseFeature.cpp` | the `place()` implementation |

## Files you will edit

| File | Change | Anchor |
|------|--------|--------|
| `PlainsBiome.h` / `PlainsBiome.cpp` | scatter the feature from `decorate()` | `PlainsBiome.cpp:48` |
| `cmake/sources/Common.cmake` | add the two new files to the build | `Common.cmake:1533` |

---

## Step 1 — the `Feature` interface

Every generatable decoration derives from `Feature` (`Feature.h:5`). The only
method you must implement is `place`:

```cpp
// Feature.h (excerpt)
class Feature
{
public:
    Feature();
    Feature(bool doUpdate);
    virtual bool place(Level *level, Random *random, int x, int y, int z) = 0;
    virtual void init(double V1, double V2, double V3) {};
protected:
    virtual void placeBlock(Level *level, int x, int y, int z, int tile);
    virtual void placeBlock(Level *level, int x, int y, int z, int tile, int data);
};
```

`place()` returns whether it placed anything. The two protected `placeBlock`
overloads route through the `doUpdate` flag: `doUpdate == true` sets tiles with
`Tile::UPDATE_ALL`, otherwise `Tile::UPDATE_CLIENTS` (`Feature.cpp:26`). For
worldgen we want the cheap client-only path, so we pass `doUpdate = false` (the
default) and mostly call `level->setTileAndData(..., Tile::UPDATE_CLIENTS)`
directly, the way `HouseFeature` does.

## Step 2 — study the two real templates

**`MelonFeature`** is the minimal scatter loop (`MelonFeature.cpp`): it tries 64
random offsets around `(x,y,z)`, and where the ground is grass and the space is
empty it drops a melon:

```cpp
// MelonFeature.cpp (real neoLegacy source)
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
                level->setTileAndData(x2, y2, z2, Tile::melon_block_Id, 0, Tile::UPDATE_CLIENTS);
        }
    }
    return true;
}
```

**`HouseFeature`** (`HouseFeature.cpp`) is the real building routine used for the
swamp witch hut. It does the two things our house needs and `MelonFeature` does
not:

1. **Drops to the ground** and validates the footprint before building —

   ```cpp
   // HouseFeature.cpp — walk down to the first solid block
   while (y > 0 && !level->getMaterial(x, y - 1, z)->blocksMotion())
       y--;
   ```

   then it bails out (`return false`) if any tile under the footprint isn't solid
   or is ice (`HouseFeature.cpp:29-30`). That's what keeps buildings from sinking
   into ponds or floating over cliffs.

2. **Places a door and interior torches** —

   ```cpp
   DoorItem::place(level, xx, y0, zz, dir, Tile::wooden_door);   // HouseFeature.cpp:140
   ...
   level->setTileAndData(xx, y0 + 2, zz, Tile::torch_Id, 0, Tile::UPDATE_CLIENTS); // :183
   ```

Our `RandomHouseFeature` keeps `HouseFeature`'s footprint validation but builds a
simpler, deterministic 5×5 hut so the code is short enough to read in one screen.

## Step 3 — tile IDs we'll use

These are `static const int` constants on `Tile` (`Tile.h`). Confirmed values:

| Constant | ID | Source |
|----------|----|--------|
| `Tile::planks_Id` | 5 | `Tile.h:226` |
| `Tile::cobblestone_Id` | 4 | `Tile.h:225` |
| `Tile::log_Id` | 17 | `Tile.h:240` |
| `Tile::glass_Id` | 20 | `Tile.h:245` |
| `Tile::torch_Id` | 50 | `Tile.h:278` |
| `Tile::wooden_door_Id` | 64 | `Tile.h:294` |
| `Tile::grass_Id` | 2 | `Tile.h:223` |

`Tile::wooden_door` (not the `_Id`) is the `Tile*` passed to `DoorItem::place`, as
in `HouseFeature.cpp:140`. Full table on the [Block IDs reference](/slop-docs/reference/block-ids/).

Level API we call (all `Level.h`):

| Call | Meaning | Source |
|------|---------|--------|
| `getHeightmap(x, z)` | topmost gen height at column | `Level.h:243` |
| `getMaterial(x, y, z)` | `Material*` of a tile | `Level.h:221` |
| `getTile(x, y, z)` | tile id | `Level.h:200` |
| `isEmptyTile(x, y, z)` | air check | `Level.h:202` |
| `setTileAndData(x,y,z,tile,data,flags)` | place a tile | `Level.h:220` |

`Tile::UPDATE_CLIENTS` / `Tile::UPDATE_ALL` are the update-flag constants (see
`Feature.cpp:30-34`).

---

## Step 4 — create `RandomHouseFeature.h`

```cpp
// RandomHouseFeature.h
#pragma once
#include "Feature.h"

class Level;
class Random;

class RandomHouseFeature : public Feature
{
public:
    // doUpdate defaults false — worldgen uses client-only tile updates,
    // matching MelonFeature / HouseFeature.
    RandomHouseFeature(bool doUpdate = false);
    virtual bool place(Level *level, Random *random, int x, int y, int z);
};
```

We keep the header as thin as `MelonFeature.h` — one constructor, one `place`.

## Step 5 — create `RandomHouseFeature.cpp`

This mirrors `HouseFeature`'s structure: drop to ground, validate the footprint,
then build. The includes match what `HouseFeature.cpp` uses (`DoorItem` lives in
`net.minecraft.world.item.h`).

```cpp
// RandomHouseFeature.cpp
#include "stdafx.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.level.tile.h"
#include "net.minecraft.world.item.h"
#include "RandomHouseFeature.h"

RandomHouseFeature::RandomHouseFeature(bool doUpdate) : Feature(doUpdate)
{
}

bool RandomHouseFeature::place(Level *level, Random *random, int x, int y, int z)
{
    // 1. Drop to the first solid block, exactly like HouseFeature.cpp.
    while (y > 0 && !level->getMaterial(x, y - 1, z)->blocksMotion())
        y--;

    const int HALF = 2;            // 5x5 footprint
    const int WALL = 3;            // wall height (floor -> under roof)
    int x0 = x - HALF, z0 = z - HALF;
    int x1 = x + HALF, z1 = z + HALF;
    int y0 = y;                    // floor level

    // 2. Validate the footprint: every column below the floor must be solid
    //    ground, and the footprint volume must be clear. Bail if not.
    for (int xx = x0; xx <= x1; xx++)
    {
        for (int zz = z0; zz <= z1; zz++)
        {
            if (!level->getMaterial(xx, y0 - 1, zz)->blocksMotion())
                return false;      // slope / water / overhang -> skip
            for (int yy = y0; yy <= y0 + WALL; yy++)
            {
                if (!level->isEmptyTile(xx, yy, zz))
                    return false;  // something in the way
            }
        }
    }

    // 3. Build the shell: log corners, plank walls, plank roof.
    for (int xx = x0; xx <= x1; xx++)
    {
        for (int zz = z0; zz <= z1; zz++)
        {
            bool edge = (xx == x0 || xx == x1 || zz == z0 || zz == z1);
            bool corner = (xx == x0 || xx == x1) && (zz == z0 || zz == z1);

            for (int yy = y0; yy <= y0 + WALL; yy++)
            {
                int tile = -1;
                if (yy == y0 + WALL)               tile = Tile::planks_Id;   // roof
                else if (corner)                   tile = Tile::log_Id;      // posts
                else if (edge)                     tile = Tile::planks_Id;   // walls
                // interior stays air

                if (tile >= 0)
                    level->setTileAndData(xx, yy, zz, tile, 0, Tile::UPDATE_CLIENTS);
            }
        }
    }

    // 4. One glass window in the centre of each wall (mid height).
    int wy = y0 + 1;
    level->setTileAndData(x,  wy, z0, Tile::glass_Id, 0, Tile::UPDATE_CLIENTS);
    level->setTileAndData(x,  wy, z1, Tile::glass_Id, 0, Tile::UPDATE_CLIENTS);
    level->setTileAndData(x0, wy, z,  Tile::glass_Id, 0, Tile::UPDATE_CLIENTS);

    // 5. Door in the +X wall centre. Clear the two-tall opening first, then
    //    place the door the same way HouseFeature.cpp:140 does.
    level->setTileAndData(x1, y0,     z, 0, 0, Tile::UPDATE_CLIENTS);
    level->setTileAndData(x1, y0 + 1, z, 0, 0, Tile::UPDATE_CLIENTS);
    DoorItem::place(level, x1, y0, z, 2 /*facing +X*/, Tile::wooden_door);

    // 6. Interior torch on the floor so the hut is lit (no mob spawns).
    level->setTileAndData(x, y0, z, Tile::torch_Id, 0, Tile::UPDATE_CLIENTS);

    return true;
}
```

### Why these choices match the codebase

- **`getMaterial(...)->blocksMotion()`** is the exact footprint test `HouseFeature`
  uses (`HouseFeature.cpp:10`, `:29`). It's how the game distinguishes "ground"
  from air/water/plants.
- **`Tile::UPDATE_CLIENTS`** everywhere: this is what `HouseFeature` and
  `MelonFeature` both pass during generation. `UPDATE_ALL` triggers neighbor
  physics (falling gravel, water flow) which you do not want mid-chunk-build.
- **`DoorItem::place(level, x, y, z, dir, Tile*)`** — the door direction argument.
  `HouseFeature.cpp:134-138` maps door sides to `dir` 0..3; `2` faces +X.

---

## Step 6 — wire it into a biome

There is **no central feature registry** in neoLegacy. Features run because a
biome's `decorate()` scatters them, then chains to `Biome::decorate()`. This is
exactly how `PlainsBiome` places sunflowers (`PlainsBiome.cpp:72-83`):

```cpp
// PlainsBiome.cpp:48 — the real per-biome decorate() override
void PlainsBiome::decorate(Level* level, Random* rand, int xo, int zo)
{
    ...
    if (_plains)
    {
        DOUBLE_PLANT_GENERATOR->setPlantType(TallGrass2::SUNFLOWER);
        for (int i1 = 0; i1 < 10; ++i1)
        {
            int j1 = xo + rand->nextInt(16) + 8;
            int k1 = zo + rand->nextInt(16) + 8;
            int l1 = rand->nextInt(level->getHeightmap(j1, k1) + 32);
            DOUBLE_PLANT_GENERATOR->place(level, rand, j1, l1, k1);
        }
    }
    Biome::decorate(level, rand, xo, zo);   // <-- always chain to base last
}
```

`xo`/`zo` are the chunk's block-origin; the `+ random->nextInt(16) + 8` pattern
(seen all over `BiomeDecorator.cpp`, e.g. `:110-114`) picks a scatter point inside
the decoration window for the chunk. We do the same.

### 6a — add the generator member to `PlainsBiome.h`

`PlainsBiome` already overrides `decorate()`, so we only add the feature pointer:

```cpp
// PlainsBiome.h — inside the class body
#include "Feature.h"          // add near the top with the other includes
...
protected:
    bool _plains;
    RandomHouseFeature *houseFeature = nullptr;   // <-- add
protected:
    PlainsBiome(int id, bool plains);
    void decorate(Level* level, Random* rand, int xo, int zo) override;   // already present
```

Add `class RandomHouseFeature;` as a forward declaration at the top of
`PlainsBiome.h`, or include `RandomHouseFeature.h` in the `.cpp`.

### 6b — construct it and scatter it in `PlainsBiome.cpp`

Add the include, build the feature in the constructor, and scatter it at the top
of `decorate()`:

```cpp
// PlainsBiome.cpp — add with the other includes
#include "RandomHouseFeature.h"

// In the constructor PlainsBiome::PlainsBiome(int id, bool plains) (PlainsBiome.cpp:7):
    houseFeature = new RandomHouseFeature(false);

// At the TOP of PlainsBiome::decorate(...) (before the existing body):
    // Rarity: ~1 house attempt per 20 decorated chunks. Raise the modulus to
    // make them rarer, lower it to make them common.
    if (rand->nextInt(20) == 0)
    {
        int hx = xo + rand->nextInt(16) + 8;
        int hz = zo + rand->nextInt(16) + 8;
        int hy = level->getHeightmap(hx, hz);
        houseFeature->place(level, rand, hx, hy, hz);
    }
```

Leave the rest of `PlainsBiome::decorate()` (the sunflower loop and the closing
`Biome::decorate(level, rand, xo, zo);`) untouched.

### Rarity control, precisely

- **`rand->nextInt(N) == 0`** gates one attempt per ~N chunks. `N = 20` is a good
  "occasional landmark" rate; `N = 4` makes them common; `N = 200` makes them a
  rare find. This is the same idiom `BiomeDecorator.cpp:315` uses for pumpkins
  (`random->nextInt(32) == 0`).
- To place **more than one per chunk** when the gate passes, wrap the placement in
  a `for (int i = 0; i < count; i++)` loop like the sunflower loop above.
- Because `place()` returns `false` and builds nothing on a bad footprint, most
  water/slope attempts simply no-op — you don't need extra guarding.

---

## Step 7 — register the files in the build

neoLegacy uses a flat CMake source list. Add both new files next to the other
features in `cmake/sources/Common.cmake` (the feature block runs `~1505-1560`;
`MelonFeature` is at `Common.cmake:1533-1534`):

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/PumpkinFeature.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/PumpkinFeature.h"
  "${CMAKE_CURRENT_SOURCE_DIR}/MelonFeature.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/MelonFeature.h"
  "${CMAKE_CURRENT_SOURCE_DIR}/RandomHouseFeature.cpp"   # <-- add
  "${CMAKE_CURRENT_SOURCE_DIR}/RandomHouseFeature.h"     # <-- add
  "${CMAKE_CURRENT_SOURCE_DIR}/ReedsFeature.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/ReedsFeature.h"
```

`PlainsBiome.cpp`/`.h` are already listed (`Common.cmake:1369-1370`), so no build
change is needed for the biome edit.

---

## Step 8 — strings, textures, loc

None required. `RandomHouseFeature` only places existing tiles (planks, log,
glass, torch, door), each of which already has its icon, sound, and description id
registered in `Tile::staticCtor()` (`Tile.cpp:359`+). There is no new item, block,
or user-facing string, so there is nothing to add to the localization tables or
texture atlas.

If you later swap in a *new* block for the walls, that block is its own project —
see [Adding Blocks](/slop-docs/modding/adding-blocks/) and
[Textures & Assets](/slop-docs/modding/textures-assets/).

---

## Build + test checklist

1. **Compiles** — configure/build the `Minecraft.World` target. If CMake doesn't
   pick up the new files, delete the CMake cache and re-configure so
   `Common.cmake` is re-globbed.
2. **Links** — a missing `RandomHouseFeature.cpp` in `Common.cmake` shows up as an
   unresolved-symbol error for `RandomHouseFeature::place`. Re-check Step 7.
3. **Generate a fresh plains world** — houses only appear in newly generated
   chunks, so make a new world (or fly to ungenerated terrain).
4. **Rarity sanity** — with `nextInt(20)` you should see a hut every few chunks in
   plains. If you see none, temporarily set the gate to `rand->nextInt(2) == 0`,
   confirm they appear, then restore the value.
5. **Footprint behaves** — huts should never appear half-sunk in ponds or floating
   over cliffs. If they do, verify the Step 2 `blocksMotion()` check wasn't
   dropped.
6. **Door + torch** — the +X wall has a working wooden door and the interior is
   lit (no mobs spawn inside at night).
7. **Multiplayer** — worldgen runs server-side; because we use
   `Tile::UPDATE_CLIENTS`, the finished chunk syncs to clients normally. Nothing
   extra to send. See [Multiplayer Packets](/slop-docs/modding/multiplayer-packets/)
   only if you later add tile entities.

## Extending it

- **Different biomes** — repeat Step 6 in `ForestBiome`, `SavannaBiome`, etc. Each
  biome that overrides `decorate()` follows the same shape (chain to
  `Biome::decorate()` last). See [Adding Biomes](/slop-docs/modding/adding-biomes/).
- **Randomized size** — pull `HALF`/`WALL` from `random->nextInt(...)` the way
  `HouseFeature.cpp:13-15` randomizes width/height/depth.
- **Loot / interior blocks** — add a chest tile entity inside. That's a block-entity
  project; start from [Tile Entities](/slop-docs/world/tile-entities/) and
  [Custom Containers](/slop-docs/modding/custom-containers/).
- **A whole village of them** — that crosses into the `StructureFeature` system
  (village pieces, structure starts). See
  [Custom Structures](/slop-docs/modding/custom-structures/) and
  [Structures reference](/slop-docs/world/structures/).

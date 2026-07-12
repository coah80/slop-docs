---
title: "Template: Random Wooden House"
description: A complete starter mod that adds a randomly spawning wooden house with custom loot.
---

In this tutorial you are going to add a small wooden house that spawns randomly in the overworld during world generation. It will have oak plank walls, a door, a window, and a chest filled with loot from a custom loot table. The house will only appear in grassy biomes (plains, forest, etc.) and will space itself out so you do not get clusters of houses everywhere.

By the end you will understand how these systems work together:

- **StructureFeature** for deciding where houses can spawn
- **StructurePiece** for placing the actual blocks
- **Biome checks** for restricting placement to certain biomes
- **Ground level detection** for making sure houses sit on the surface
- **Loot tables** for filling chests with random items
- **Registration** in the world generation pipeline

If any of this is new to you, the [Custom Structures](/slop-docs/modding/custom-structures/) page explains the full StructureFeature framework in detail, and [Custom World Generation](/slop-docs/modding/custom-worldgen/) covers the generation pipeline end to end.

## What we are building

A 7x5x7 wooden house (outer dimensions) with:

- Oak plank walls and floor
- Oak log corner pillars
- A cobblestone foundation row
- One door on the front face
- Glass pane windows on the sides
- A chest in the back corner with random loot
- A torch on the back wall

Nothing fancy. The point is to learn the systems, not build a mansion.

## Files you will create

| File | Purpose |
|------|---------|
| `Minecraft.World/WoodenHouseFeature.h` | StructureFeature subclass, decides which chunks get a house |
| `Minecraft.World/WoodenHouseFeature.cpp` | Grid-based placement logic and biome checks |
| `Minecraft.World/WoodenHousePiece.h` | StructurePiece subclass, places blocks |
| `Minecraft.World/WoodenHousePiece.cpp` | Block placement, loot generation |
| `Minecraft.World/WoodenHouseStart.h` | StructureStart subclass, glue between feature and piece |
| `Minecraft.World/WoodenHouseStart.cpp` | Finds ground level, creates the piece |

## Files you will modify

| File | What you change |
|------|----------------|
| `Minecraft.World/RandomLevelSource.h` | Add `WoodenHouseFeature *woodenHouseFeature` member |
| `Minecraft.World/RandomLevelSource.cpp` | Create the feature, call `apply()` and `postProcess()` |
| `cmake/Sources.cmake` | Add new source files |

## Includes you will add

**In `WoodenHouseFeature.cpp`**:

```cpp
#include "stdafx.h"
#include "WoodenHouseFeature.h"
#include "WoodenHouseStart.h"
#include "BiomeSource.h"
#include "Biome.h"
#include "Level.h"
```

**In `WoodenHouseStart.cpp`**:

```cpp
#include "stdafx.h"
#include "WoodenHouseStart.h"
#include "WoodenHousePiece.h"
#include "Level.h"
```

**In `WoodenHousePiece.cpp`**:

```cpp
#include "stdafx.h"
#include "WoodenHousePiece.h"
#include "Tile.h"
#include "Item.h"
#include "Level.h"
```

**In `RandomLevelSource.h`**, add at the top with the other includes:

```cpp
#include "WoodenHouseFeature.h"
```

`RandomLevelSource.cpp` already includes all the umbrella headers it needs (`net.minecraft.world.level.levelgen.structure.h`, etc.), so no changes there. The key includes it uses:

```cpp
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.level.biome.h"
#include "net.minecraft.world.level.levelgen.h"
#include "net.minecraft.world.level.levelgen.feature.h"
#include "net.minecraft.world.level.levelgen.structure.h"
```

## Sources.cmake entries

Add all three new `.cpp` files to `MINECRAFT_WORLD_SOURCES` in `cmake/Sources.cmake`:

```cmake
"WoodenHouseFeature.cpp"
"WoodenHousePiece.cpp"
"WoodenHouseStart.cpp"
```

## Step 1: The StructureFeature (where houses spawn)

The `StructureFeature` is the entry point. It decides which chunks get a house. We need to override two methods: `isFeatureChunk()` to check if a chunk is valid, and `createStructureStart()` to kick off generation.

For spacing, we will use a grid system similar to how villages work. We divide the world into cells and pick one random spot per cell. This gives us even distribution without clustering.

### WoodenHouseFeature.h

```cpp
#pragma once
#include "StructureFeature.h"

class BiomeSource;

class WoodenHouseFeature : public StructureFeature
{
public:
    WoodenHouseFeature(int worldSize);

protected:
    virtual bool isFeatureChunk(int chunkX, int chunkZ, bool bIsSuperflat = false) override;
    virtual StructureStart *createStructureStart(int chunkX, int chunkZ) override;

private:
    int m_spacing;      // grid cell size in chunks
    int m_separation;   // minimum distance between houses in chunks
    int m_worldSize;    // world size in chunks (for bounds checking)

    static const int SEED_SALT = 14357621;
};
```

The `SEED_SALT` is just a large number we mix into the random seed so our placement grid does not line up with villages or other structures. Pick any big number that is not already used by another structure.

### WoodenHouseFeature.cpp

```cpp
#include "stdafx.h"
#include "WoodenHouseFeature.h"
#include "WoodenHouseStart.h"
#include "BiomeSource.h"
#include "Biome.h"
#include "Level.h"

WoodenHouseFeature::WoodenHouseFeature(int worldSize)
    : m_worldSize(worldSize)
{
    m_spacing = 24;      // one cell every 24 chunks
    m_separation = 8;    // at least 8 chunks apart
}

bool WoodenHouseFeature::isFeatureChunk(int chunkX, int chunkZ, bool bIsSuperflat)
{
    // Grid-based placement, same approach as VillageFeature.
    // Divide world into cells of m_spacing chunks, pick one
    // random position per cell, then check biome.

    int cellX = chunkX;
    int cellZ = chunkZ;

    if (cellX < 0) cellX -= m_spacing - 1;
    if (cellZ < 0) cellZ -= m_spacing - 1;

    cellX /= m_spacing;
    cellZ /= m_spacing;

    // Deterministic random for this cell
    Random cellRandom(
        (long long)cellX * 341873128712LL +
        (long long)cellZ * 132897987541LL +
        level->getSeed() + SEED_SALT
    );

    int targetX = cellX * m_spacing + cellRandom.nextInt(m_spacing - m_separation);
    int targetZ = cellZ * m_spacing + cellRandom.nextInt(m_spacing - m_separation);

    if (chunkX != targetX || chunkZ != targetZ)
        return false;

    // Bounds check: do not spawn near the world edge
    int halfWorld = m_worldSize / 2;
    if (chunkX < -halfWorld + 2 || chunkX > halfWorld - 2)
        return false;
    if (chunkZ < -halfWorld + 2 || chunkZ > halfWorld - 2)
        return false;

    // Biome check: only spawn in grassy biomes
    if (level->getBiomeSource() != nullptr)
    {
        Biome *biome = level->getBiomeSource()->getBiome(
            chunkX * 16 + 8, chunkZ * 16 + 8);

        if (biome != Biome::plains &&
            biome != Biome::forest &&
            biome != Biome::forestHills &&
            biome != Biome::taiga &&
            biome != Biome::taigaHills)
        {
            return false;
        }
    }

    return true;
}

StructureStart *WoodenHouseFeature::createStructureStart(int chunkX, int chunkZ)
{
    return new WoodenHouseStart(level, random, chunkX, chunkZ);
}
```

A few things to note:

- The grid math with negative coordinates needs the `cellX -= m_spacing - 1` adjustment. Without it, integer division rounds toward zero instead of toward negative infinity, and the grid breaks for negative chunk coordinates.
- We check the biome at the center of the chunk (`chunkX * 16 + 8`), not the corner. This avoids edge cases at biome boundaries.
- The bounds check keeps houses away from the world edge. Console worlds are finite, so we need to be careful about this.

For more on how `isFeatureChunk()` fits into the overall pipeline, see [Custom Structures](/slop-docs/modding/custom-structures/).

## Step 2: The StructureStart (glue between feature and piece)

The `StructureStart` is a thin wrapper that creates the piece list and sets the Y position. For our single-room house, there is only one piece.

### WoodenHouseStart.h

```cpp
#pragma once
#include "StructureStart.h"

class Level;

class WoodenHouseStart : public StructureStart
{
public:
    WoodenHouseStart(Level *level, Random *random, int chunkX, int chunkZ);
};
```

### WoodenHouseStart.cpp

```cpp
#include "stdafx.h"
#include "WoodenHouseStart.h"
#include "WoodenHousePiece.h"
#include "Level.h"

WoodenHouseStart::WoodenHouseStart(
    Level *level, Random *random, int chunkX, int chunkZ
) : StructureStart()
{
    int blockX = chunkX * 16;
    int blockZ = chunkZ * 16;

    // Find ground level at the center of the chunk.
    // getHeightmap() returns the top solid block Y at a given (x, z).
    int groundY = level->getHeightmap(blockX + 8, blockZ + 8);

    // Clamp to reasonable range. Do not build underground or in the sky.
    if (groundY < 4)
        groundY = 4;
    if (groundY > 200)
        groundY = 200;

    // Pick a random orientation (0-3 maps to N/E/S/W)
    int orientation = random->nextInt(4);

    // Create the house piece at ground level
    WoodenHousePiece *house = new WoodenHousePiece(
        0, blockX + 4, groundY, blockZ + 4, orientation);

    pieces.push_back(house);
    calculateBoundingBox();
}
```

The ground level detection is straightforward: `getHeightmap()` gives us the Y of the highest non-air block. We build the house right on top of that. The `+4` offset centers the house roughly in the chunk so it does not hang over chunk boundaries.

## Step 3: The StructurePiece (placing the blocks)

This is where the real work happens. The `StructurePiece` subclass places every block of the house during `postProcess()`. All coordinates in `postProcess()` are local to the piece, and the base class methods handle rotating them into world space based on the piece's orientation.

### WoodenHousePiece.h

```cpp
#pragma once
#include "StructurePiece.h"

class WoodenHousePiece : public StructurePiece
{
public:
    WoodenHousePiece(int genDepth, int x, int y, int z, int orientation);

    virtual bool postProcess(Level *level, Random *random,
                             BoundingBox *chunkBB) override;

private:
    void generateLoot(Level *level, Random *random,
                      int x, int y, int z, BoundingBox *chunkBB);

    // House dimensions (outer)
    static const int WIDTH = 7;
    static const int HEIGHT = 5;
    static const int DEPTH = 7;
};
```

### WoodenHousePiece.cpp

This is the longest file. We will go through it in sections.

#### Constructor and bounding box

```cpp
#include "stdafx.h"
#include "WoodenHousePiece.h"
#include "Tile.h"
#include "Item.h"
#include "Level.h"

WoodenHousePiece::WoodenHousePiece(
    int genDepth, int x, int y, int z, int orient)
    : StructurePiece(genDepth)
{
    this->orientation = orient;

    // Set bounding box based on orientation.
    // The base class coordinate translation methods use this box
    // to convert local coords to world coords.
    switch (orient)
    {
    case 0: // North
    case 2: // South
        boundingBox = new BoundingBox(x, y, z, x + WIDTH - 1, y + HEIGHT - 1, z + DEPTH - 1);
        break;
    case 1: // East
    case 3: // West
        boundingBox = new BoundingBox(x, y, z, x + DEPTH - 1, y + HEIGHT - 1, z + WIDTH - 1);
        break;
    }
}
```

The bounding box swap for east/west orientations is important. When the house faces east or west, its width and depth are swapped in world space. If you skip this the coordinate translation goes wrong and you get a mangled building.

#### postProcess: placing the blocks

```cpp
bool WoodenHousePiece::postProcess(
    Level *level, Random *random, BoundingBox *chunkBB)
{
    // Bail if this piece does not overlap the chunk being processed.
    // Use boundingBox->intersects() since isInChunk() takes a ChunkPos*,
    // not a BoundingBox*.
    if (boundingBox->intersects(*chunkBB) == false)
        return false;

    int oakPlanks    = Tile::wood_Id;          // 5
    int oakLog       = Tile::treeTrunk_Id;     // 17
    int cobblestone  = Tile::stoneBrick_Id;    // 4
    int glass        = Tile::thinGlass_Id;     // 102 (glass pane)
    int torch        = Tile::torch_Id;         // 50
    int oakDoor      = Tile::door_wood_Id;     // 64

    // --- Foundation ---
    // Fill the bottom row with cobblestone.
    // generateBox(level, chunkBB, x0, y0, z0, x1, y1, z1, edgeTile, fillTile, replaceAir)
    generateBox(level, chunkBB,
        0, 0, 0,
        WIDTH - 1, 0, DEPTH - 1,
        cobblestone, cobblestone, false);

    // Fill columns down from the foundation to the ground.
    // This handles uneven terrain so the house does not float.
    for (int x = 0; x < WIDTH; x++)
    {
        for (int z = 0; z < DEPTH; z++)
        {
            fillColumnDown(level, cobblestone, 0, x, -1, z, chunkBB);
        }
    }

    // --- Floor ---
    generateBox(level, chunkBB,
        1, 0, 1,
        WIDTH - 2, 0, DEPTH - 2,
        oakPlanks, oakPlanks, false);

    // --- Walls ---
    // Hollow box: oak plank edges, air inside
    generateBox(level, chunkBB,
        0, 1, 0,
        WIDTH - 1, HEIGHT - 2, DEPTH - 1,
        oakPlanks, 0, false);

    // --- Corner pillars (oak logs) ---
    for (int y = 0; y < HEIGHT; y++)
    {
        placeBlock(level, oakLog, 0, 0, y, 0, chunkBB);
        placeBlock(level, oakLog, 0, WIDTH - 1, y, 0, chunkBB);
        placeBlock(level, oakLog, 0, 0, y, DEPTH - 1, chunkBB);
        placeBlock(level, oakLog, 0, WIDTH - 1, y, DEPTH - 1, chunkBB);
    }

    // --- Roof (flat, oak planks) ---
    generateBox(level, chunkBB,
        0, HEIGHT - 1, 0,
        WIDTH - 1, HEIGHT - 1, DEPTH - 1,
        oakPlanks, oakPlanks, false);

    // --- Door (front wall, centered) ---
    // Clear the door opening
    placeBlock(level, 0, 0, 3, 1, 0, chunkBB);  // bottom half
    placeBlock(level, 0, 0, 3, 2, 0, chunkBB);  // top half

    // Place the door blocks (data values control which half)
    int doorData = getOrientationData(oakDoor, 0);
    placeBlock(level, oakDoor, doorData, 3, 1, 0, chunkBB);        // bottom
    placeBlock(level, oakDoor, doorData | 8, 3, 2, 0, chunkBB);    // top (bit 3 = upper)

    // --- Windows (side walls, one on each side) ---
    // Left wall window (x=0, z=3, y=2)
    placeBlock(level, glass, 0, 0, 2, 3, chunkBB);

    // Right wall window (x=WIDTH-1, z=3, y=2)
    placeBlock(level, glass, 0, WIDTH - 1, 2, 3, chunkBB);

    // --- Torch (back wall, centered) ---
    // Torch data: 1=east, 2=west, 3=south, 4=north, 5=floor
    int torchData = getOrientationData(torch, 4);
    placeBlock(level, torch, torchData, 3, 2, DEPTH - 2, chunkBB);

    // --- Chest with loot (back corner) ---
    generateLoot(level, random, 1, 1, DEPTH - 2, chunkBB);

    return true;
}
```

A few things worth calling out:

- `generateBox()` with fill tile `0` creates a hollow box (walls only, air inside). This is the fastest way to build a room.
- `fillColumnDown()` extends the foundation into the ground so the house looks right on sloped terrain. Without this, houses on hills would float.
- `getOrientationData()` rotates block metadata (like door facing direction) to match the piece orientation. If you hardcode the data values instead, the door and torch will face the wrong way when the house spawns rotated.
- All placement calls are clipped to `chunkBB` by the base class. This is critical. If you skip the bounding box, the structure system will try to load ungenerated chunks and crash.

For the full list of placement methods available on `StructurePiece`, see the [Structures](/slop-docs/world/structures/) reference page.

## Step 4: The loot table

Now for the fun part. We need to fill that chest with random items. We will do it manually with weighted random selection so you can see exactly how it works. The items are split into two pools: basic supplies and rare goodies.

For more on how the loot system works under the hood, check out [Custom Loot & Drops](/slop-docs/modding/custom-loot/).

#### The generateLoot method

Add this to `WoodenHousePiece.cpp`:

```cpp
void WoodenHousePiece::generateLoot(
    Level *level, Random *random,
    int x, int y, int z, BoundingBox *chunkBB)
{
    // Convert local coords to world coords
    int worldX = getWorldX(x, z);
    int worldY = getWorldY(y);
    int worldZ = getWorldZ(x, z);

    // Make sure we are inside the chunk being processed
    if (!chunkBB->isInside(worldX, worldY, worldZ))
        return;

    // Place the chest block
    placeBlock(level, Tile::chest_Id, 0, x, y, z, chunkBB);

    // Get the tile entity for the chest we just placed
    shared_ptr<ChestTileEntity> chest =
        dynamic_pointer_cast<ChestTileEntity>(
            level->getTileEntity(worldX, worldY, worldZ));

    if (chest == nullptr)
        return;

    // Build the loot table.
    // Each entry: item ID, data value, min count, max count, weight.
    // Higher weight = more likely to be picked.

    // Pool 1: basic supplies (roll 3-5 times)
    int basicItems[][5] = {
        { Item::bread_Id,          0, 1, 3, 10 },  // bread, common
        { Item::apple_Id,          0, 1, 2, 8 },   // apple
        { Item::coal_Id,           0, 1, 4, 7 },   // coal
        { Item::arrow_Id,          0, 2, 6, 5 },   // arrows
        { Item::seeds_wheat_Id,    0, 2, 4, 6 },   // wheat seeds
    };
    int basicCount = sizeof(basicItems) / sizeof(basicItems[0]);

    // Pool 2: rare goodies (roll 1-2 times)
    int rareItems[][5] = {
        { Item::ironIngot_Id,      0, 1, 3, 10 },  // iron ingot
        { Item::goldIngot_Id,      0, 1, 2, 5 },   // gold ingot
        { Item::diamond_Id,        0, 1, 1, 2 },   // diamond, very rare
        { Item::saddle_Id,         0, 1, 1, 3 },   // saddle
        { Item::bow_Id,            0, 1, 1, 4 },   // bow
    };
    int rareCount = sizeof(rareItems) / sizeof(rareItems[0]);

    // Roll basic pool
    int basicRolls = 3 + random->nextInt(3);  // 3-5 rolls
    for (int i = 0; i < basicRolls; i++)
    {
        // Pick a weighted random entry
        int totalWeight = 0;
        for (int j = 0; j < basicCount; j++)
            totalWeight += basicItems[j][4];

        int roll = random->nextInt(totalWeight);
        int cumulative = 0;

        for (int j = 0; j < basicCount; j++)
        {
            cumulative += basicItems[j][4];
            if (roll < cumulative)
            {
                int count = basicItems[j][2] +
                    random->nextInt(basicItems[j][3] - basicItems[j][2] + 1);

                shared_ptr<ItemInstance> item(
                    new ItemInstance(basicItems[j][0], count, basicItems[j][1]));

                // Place in a random slot
                chest->setItem(random->nextInt(chest->getContainerSize()), item);
                break;
            }
        }
    }

    // Roll rare pool
    int rareRolls = 1 + random->nextInt(2);  // 1-2 rolls
    for (int i = 0; i < rareRolls; i++)
    {
        int totalWeight = 0;
        for (int j = 0; j < rareCount; j++)
            totalWeight += rareItems[j][4];

        int roll = random->nextInt(totalWeight);
        int cumulative = 0;

        for (int j = 0; j < rareCount; j++)
        {
            cumulative += rareItems[j][4];
            if (roll < cumulative)
            {
                int count = rareItems[j][2] +
                    random->nextInt(rareItems[j][3] - rareItems[j][2] + 1);

                shared_ptr<ItemInstance> item(
                    new ItemInstance(rareItems[j][0], count, rareItems[j][1]));

                chest->setItem(random->nextInt(chest->getContainerSize()), item);
                break;
            }
        }
    }
}
```

The loot table uses two pools with different purposes. The basic pool gives you food and common resources. The rare pool has a small chance at diamonds and other valuable stuff. The weights control how often each item shows up. Bread with weight 10 is five times more likely than diamond with weight 2.

:::note
If you want to reuse existing loot tables (like the dungeon chest loot), you can call `createChest()` from the base `StructurePiece` class instead. That method takes a `WeighedTreasureArray` and a roll count, and handles the chest placement and item generation for you. We are doing it manually here so you can see how the system works.
:::

## Step 5: Register in world generation

The last step is hooking our structure into `RandomLevelSource` so it actually runs during world gen.

### Modify RandomLevelSource.h

Add a member for our feature alongside the existing ones:

```cpp
// In RandomLevelSource.h, in the private/protected section:
#include "WoodenHouseFeature.h"

// Add this next to the other structure feature members:
WoodenHouseFeature *woodenHouseFeature;
```

### Modify RandomLevelSource.cpp

Three changes here.

**In the constructor**, create the feature:

```cpp
// In RandomLevelSource::RandomLevelSource(), after the other feature constructors:
woodenHouseFeature = new WoodenHouseFeature(m_XZSize);
```

**In the `create()` method**, add the structure layout pass. Find where the other structures call `apply()` and add ours:

```cpp
// In RandomLevelSource::create(), after the other structure apply calls:
if (generateStructures)
{
    // ... existing structure apply calls ...
    woodenHouseFeature->apply(this, level, xOffs, zOffs, blocks);
}
```

**In `postProcess()`**, add the block placement pass. Find where the other structures call `postProcess()` and add ours:

```cpp
// In RandomLevelSource::postProcess(), after the other structure postProcess calls:
woodenHouseFeature->postProcess(level, random, chunkX, chunkZ);
```

The order matters here. Structures that call `apply()` during `create()` get their footprint carved into the terrain. Then during `postProcess()`, the interior blocks (chests, doors, torches) get placed. This two-phase approach is how all LCE structures work.

## How it all connects

Here is the full flow from world generation to a finished house:

```
World generates chunk at (X, Z)
    |
    v
RandomLevelSource::create()
    calls woodenHouseFeature->apply()
        |
        v
    StructureFeature::addFeature()
        calls isFeatureChunk(X, Z)
            -> grid math: is this the chosen chunk in its cell?
            -> biome check: is this plains/forest/taiga?
            -> bounds check: not too close to world edge?
            |
            v (all checks pass)
        calls createStructureStart(X, Z)
            -> WoodenHouseStart constructor
                -> finds ground level with getHeightmap()
                -> picks random orientation
                -> creates WoodenHousePiece
                -> calculateBoundingBox()
            |
            v
    Structure is cached in memory
    |
    v
RandomLevelSource::postProcess()
    calls woodenHouseFeature->postProcess()
        |
        v
    For each cached structure overlapping this chunk:
        calls WoodenHouseStart::postProcess()
            |
            v
        calls WoodenHousePiece::postProcess()
            -> places cobblestone foundation
            -> fills columns down for terrain blending
            -> builds oak plank walls (hollow box)
            -> adds corner log pillars
            -> flat oak plank roof
            -> door, windows, torch
            -> chest with weighted random loot
```

## Build and test

Build the project:

```bash
cmake --build build --config Release
```

Create a new world and explore plains or forest biomes. With a spacing of 24 chunks, you should find roughly one house every 384 blocks on average.

If houses are not showing up:

1. **Check the biome.** Houses only spawn in the five biomes we listed. Make sure you are in the right one.
2. **Check the spacing.** 24 chunks is pretty spread out. Try lowering `m_spacing` to 8 temporarily for testing.
3. **Check the console/log for crashes.** A bounding box error will usually crash during chunk generation. Make sure all your `placeBlock` calls use the `chunkBB` parameter.

## What to try next

Now that you have a working structure, here are some ideas to build on it:

- **Add a peaked roof** instead of the flat one. Use stairs blocks (`Tile::stairs_wood_Id`) placed with different data values for each side.
- **Randomize materials.** Check the biome in `postProcess()` and swap to spruce planks in taiga, or sandstone in deserts (if you add desert to the allowed biomes list).
- **Add a villager.** Spawn an NPC inside the house during `postProcess()` using `level->addFreshEntity()`. See [Adding Entities](/slop-docs/modding/adding-entities/) for how entity spawning works.
- **Make a multi-room variant.** Override `addChildren()` in your piece to recursively add more rooms, like how strongholds and mineshafts build their layouts. The [Structures](/slop-docs/world/structures/) page has the full breakdown of how piece chaining works.
- **Add a chimney.** Stack a few cobblestone blocks on the roof with a fire block on top (check that fire does not spread to the wood first).
- **Custom loot tiers.** Scale the loot table based on distance from spawn. Houses farther out could have better items.
- **Add it to superflat.** Register the feature in `FlatLevelSource` the same way you did in `RandomLevelSource`.

The structure system is very flexible once you understand the StructureFeature, StructureStart, and StructurePiece pattern. Every vanilla structure in the game, from village houses to nether fortresses, follows this exact same flow.

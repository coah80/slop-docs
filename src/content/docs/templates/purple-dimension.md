---
title: "Template: Purple Dimension"
description: A complete starter mod that adds a new dimension with custom terrain, fog, blocks, and a portal.
---

This template walks you through building a fully working custom dimension from scratch. By the end, you will have a Purple Dimension with purple grass, purple stone, thick purple fog, floating terrain, and a portal to get there and back.

## What you will build

- **PurpleDimension** class (dimension ID 3) with purple fog and permanent twilight
- **PurpleChunkSource** that generates floating islands out of purple stone
- **Two custom tiles**: Purple Stone and Purple Grass
- **A portal block** that teleports players between the Overworld and the Purple Dimension
- All the registration and wiring to make it work in-game

## Systems you will learn

- Subclassing `Dimension` and overriding sky, fog, and spawn behavior
- Writing a `ChunkSource` with noise-based terrain
- Registering custom tiles (blocks) with materials and properties
- Building portal logic with `HalfTransparentTile` and `ServerPlayer` tick handling
- Hooking everything into the factory methods and static constructors

If any of these systems are new to you, the reference pages go deeper:
- [Custom Dimensions](/slop-docs/modding/custom-dimensions/) covers every virtual method on `Dimension`
- [Adding Blocks](/slop-docs/modding/adding-blocks/) covers the full `Tile` registration system
- [Fog & Sky](/slop-docs/modding/fog-sky/) covers the rendering pipeline for fog colors
- [Custom Materials](/slop-docs/modding/custom-materials/) covers `Material` behavior flags
- [Custom World Generation](/slop-docs/modding/custom-worldgen/) covers noise and feature placement

## Files you will create

All new files go in the `Minecraft.World/` directory unless noted otherwise. You will create these from scratch:

| File | What it is |
|------|-----------|
| `Minecraft.World/PurpleStoneTile.h` | Header for the purple stone block |
| `Minecraft.World/PurpleStoneTile.cpp` | Implementation for purple stone (just a constructor) |
| `Minecraft.World/PurpleGrassTile.h` | Header for the purple grass block |
| `Minecraft.World/PurpleGrassTile.cpp` | Implementation for purple grass (just a constructor) |
| `Minecraft.World/PurplePortalTile.h` | Header for the portal block |
| `Minecraft.World/PurplePortalTile.cpp` | Implementation for the portal (frame check, teleport trigger) |
| `Minecraft.World/PurpleBiome.h` | Header for the purple biome |
| `Minecraft.World/PurpleBiome.cpp` | Implementation (grass color, foliage color, sky color) |
| `Minecraft.World/PurpleChunkSource.h` | Header for the terrain generator |
| `Minecraft.World/PurpleChunkSource.cpp` | Implementation (noise pipeline, floating islands) |
| `Minecraft.World/PurpleDimension.h` | Header for the dimension class |
| `Minecraft.World/PurpleDimension.cpp` | Implementation (fog, sky, spawn rules) |

That is 6 header files and 6 source files, 12 total.

## Files you will modify

These files already exist. You will add small pieces to each one:

| File | What you change |
|------|----------------|
| `Minecraft.World/Tile.h` | Add tile IDs and static pointers for purple stone, purple grass, and the portal |
| `Minecraft.World/Tile.cpp` | Add static definitions and register all 3 tiles in `Tile::staticCtor()` |
| `Minecraft.World/Biome.h` | Add `static Biome *purple` pointer |
| `Minecraft.World/Biome.cpp` | Add biome registration in the init block |
| `Minecraft.World/Dimension.cpp` | Add `if (id == 3) return new PurpleDimension();` to the `getNew()` factory |
| `Minecraft.World/Entity.h` | Add `virtual void handleInsidePurplePortal() {}` |
| `Minecraft.World/Player.h` | Add `bool isInsidePurplePortal` flag and override declaration |
| `Minecraft.World/Player.cpp` | Implement `handleInsidePurplePortal()` |
| `Minecraft.Client/ServerPlayer.cpp` | Add portal tick handling alongside existing Nether/End portal logic |
| `Minecraft.Client/LevelRenderer.h` | Expand `MAX_LEVEL_RENDER_SIZE` and `DIMENSION_OFFSETS` arrays from size 3 to 4 |
| `Minecraft.Client/LevelRenderer.cpp` | Add 4th element to both arrays, update `getDimensionIndexFromId()`, `getGlobalChunkCount()`, and `isGlobalIndexInSameDimension()` |
| `Minecraft.World/net.minecraft.world.level.dimension.h` | Add `#include "PurpleDimension.h"` to the umbrella header |
| `cmake/Sources.cmake` | Add all 6 new `.cpp` files to the `MINECRAFT_WORLD_SOURCES` list |

## Step 1: Create the Purple Stone tile

Start with the blocks, since the chunk source and dimension will reference them. Purple Stone is the base terrain block for the dimension, like how the Aether uses holystone.

**`PurpleStoneTile.h`**
```cpp
#pragma once
#include "Tile.h"

class PurpleStoneTile : public Tile
{
public:
    PurpleStoneTile(int id);
};
```

**`PurpleStoneTile.cpp`**
```cpp
#include "stdafx.h"
#include "PurpleStoneTile.h"

PurpleStoneTile::PurpleStoneTile(int id) : Tile(id, Material::stone)
{
}
```

That is it for the class. All the interesting stuff happens during registration. Open `Tile.h` and add:

```cpp
// Forward declaration
class PurpleStoneTile;

// Inside the Tile class, with the other static pointers
static PurpleStoneTile *purpleStoneTile;
static const int purpleStone_Id = 200;
```

Then in `Tile.cpp`, add the static definition and register it inside `Tile::staticCtor()`:

```cpp
PurpleStoneTile *Tile::purpleStoneTile = NULL;

// Inside Tile::staticCtor():
Tile::purpleStoneTile = (PurpleStoneTile *)(new PurpleStoneTile(200))
    ->setDestroyTime(1.5f)
    ->setExplodeable(10)
    ->setSoundType(Tile::SOUND_STONE)
    ->setTextureName(L"purpleStone")
    ->setDescriptionId(IDS_TILE_PURPLE_STONE)
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_block, Item::eMaterial_stone);
```

Pick IDs that are not already taken. 200 and 201 are used here as examples. Check your project for conflicts. See [Getting Started](/slop-docs/modding/getting-started/) for finding available IDs.

## Step 2: Create the Purple Grass tile

Purple Grass goes on top of purple stone, like how regular grass sits on dirt. Same pattern as above.

**`PurpleGrassTile.h`**
```cpp
#pragma once
#include "Tile.h"

class PurpleGrassTile : public Tile
{
public:
    PurpleGrassTile(int id);
};
```

**`PurpleGrassTile.cpp`**
```cpp
#include "stdafx.h"
#include "PurpleGrassTile.h"

PurpleGrassTile::PurpleGrassTile(int id) : Tile(id, Material::dirt)
{
}
```

Register it the same way. In `Tile.h`:

```cpp
class PurpleGrassTile;

static PurpleGrassTile *purpleGrassTile;
static const int purpleGrass_Id = 201;
```

In `Tile.cpp`:

```cpp
PurpleGrassTile *Tile::purpleGrassTile = NULL;

// Inside Tile::staticCtor():
Tile::purpleGrassTile = (PurpleGrassTile *)(new PurpleGrassTile(201))
    ->setDestroyTime(0.6f)
    ->setExplodeable(3)
    ->setSoundType(Tile::SOUND_GRASS)
    ->setTextureName(L"purpleGrass")
    ->setDescriptionId(IDS_TILE_PURPLE_GRASS)
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_block, Item::eMaterial_dirt);
```

Both tiles will need textures. The `setTextureName()` call tells the game which texture to look up. You will need to add `purpleStone` and `purpleGrass` entries to the texture atlas. See [Block Textures](/slop-docs/modding/block-textures/) for how that works.

## Step 3: Create the PurpleBiome

The dimension needs a biome to control surface blocks, mob spawning, and decoration. For a simple first pass, use a custom biome with no mobs and basic trees.

**`PurpleBiome.h`**
```cpp
#pragma once
#include "Biome.h"

class PurpleBiome : public Biome
{
public:
    PurpleBiome(int id);
    virtual int getGrassColor();
    virtual int getFolageColor();
    virtual int getSkyColor(float temp);
};
```

**`PurpleBiome.cpp`**
```cpp
#include "stdafx.h"
#include "PurpleBiome.h"
#include "BiomeDecorator.h"

PurpleBiome::PurpleBiome(int id) : Biome(id)
{
    // Clear default mob spawning (empty dimension for now)
    enemies.clear();
    friendlies.clear();
    friendlies_chicken.clear();
    friendlies_wolf.clear();
    waterFriendlies.clear();

    // Surface blocks
    topMaterial = (byte) Tile::purpleGrass_Id;
    material = (byte) Tile::purpleStone_Id;

    // Keep the default BiomeDecorator for basic trees and flowers.
    // You can swap in a custom one later.
}

int PurpleBiome::getGrassColor()
{
    return 0x9B30FF;  // purple tint for grass overlay
}

int PurpleBiome::getFolageColor()
{
    return 0x7B2FBE;  // purple tint for leaves
}

int PurpleBiome::getSkyColor(float temp)
{
    return 0x6A0DAD;  // deep purple sky
}
```

Register the biome in `Biome.h`:

```cpp
static Biome *purple;
```

And in `Biome.cpp`:

```cpp
Biome *Biome::purple = NULL;

// In the biome initialization block:
Biome::purple = (new PurpleBiome(24))
    ->setColor(0x9B30FF)
    ->setName(L"Purple")
    ->setNoRain()
    ->setTemperatureAndDownfall(0.5f, 0.0f);
```

Use a biome ID that does not conflict with existing ones. The Aether uses 23, so 24 is a safe pick.

## Step 4: Create the PurpleChunkSource

This is the terrain generator. It creates floating islands out of purple stone, then paints the top layer with purple grass. The approach is the same one the Aether uses (Perlin noise for island shapes), but simplified.

**`PurpleChunkSource.h`**
```cpp
#pragma once
#include "ChunkSource.h"

class Level;
class Random;
class PerlinNoise;
class LevelChunk;
class ProgressListener;

class PurpleChunkSource : public ChunkSource
{
public:
    PurpleChunkSource(Level *level, __int64 seed);
    ~PurpleChunkSource();

    virtual bool hasChunk(int x, int y);
    virtual LevelChunk *getChunk(int x, int z);
    virtual LevelChunk *create(int x, int z);
    virtual void lightChunk(LevelChunk *lc);
    virtual void postProcess(ChunkSource *parent, int x, int z);
    virtual bool save(bool force, ProgressListener *progressListener);
    virtual bool tick();
    virtual bool shouldSave();
    virtual wstring gatherStats();
    virtual vector<Biome::MobSpawnerData *> *getMobsAt(
        MobCategory *mobCategory, int x, int y, int z);
    virtual TilePos *findNearestMapFeature(
        Level *level, const wstring& featureName, int x, int y, int z);

private:
    void prepareHeights(int xOffs, int zOffs, byteArray& blocks);
    void buildSurfaces(int xOffs, int zOffs, byteArray& blocks);
    double *getHeights(double *buffer, int x, int y, int z,
                       int xSize, int ySize, int zSize);

    Level *level;
    Random *random;
    Random *pprandom;
    PerlinNoise *lperlinNoise1;
    PerlinNoise *lperlinNoise2;
    PerlinNoise *perlinNoise1;
    PerlinNoise *islandNoise;
    PerlinNoise *depthNoise;
};
```

**`PurpleChunkSource.cpp`**
```cpp
#include "stdafx.h"
#include "PurpleChunkSource.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.level.biome.h"
#include "net.minecraft.world.level.chunk.h"
#include "PerlinNoise.h"
#include "Random.h"
#include "Mth.h"

static const int CHUNK_WIDTH = 4;
static const int CHUNK_HEIGHT = 8;

PurpleChunkSource::PurpleChunkSource(Level *level, __int64 seed)
{
    m_XZSize = level->getLevelData()->getXZSize();
    this->level = level;

    random = new Random(seed);
    pprandom = new Random(seed);

    lperlinNoise1 = new PerlinNoise(random, 16);
    lperlinNoise2 = new PerlinNoise(random, 16);
    perlinNoise1 = new PerlinNoise(random, 8);
    islandNoise = new PerlinNoise(random, 4);
    depthNoise = new PerlinNoise(random, 16);
}

PurpleChunkSource::~PurpleChunkSource()
{
    delete random;
    delete pprandom;
    delete lperlinNoise1;
    delete lperlinNoise2;
    delete perlinNoise1;
    delete islandNoise;
    delete depthNoise;
}
```

### The getChunk method

This is the main entry point. It allocates a block array, runs `prepareHeights` to fill in the terrain shape, then runs `buildSurfaces` to paint the top layer.

```cpp
LevelChunk *PurpleChunkSource::getChunk(int xOffs, int zOffs)
{
    random->setSeed(xOffs * 341873128712l + zOffs * 132897987541l);

    BiomeArray biomes;
    unsigned int blocksSize = Level::genDepth * 16 * 16;
    byte *tileData = (byte *)XPhysicalAlloc(
        blocksSize, MAXULONG_PTR, 4096, PAGE_READWRITE);
    XMemSet128(tileData, 0, blocksSize);
    byteArray blocks = byteArray(tileData, blocksSize);

    level->getBiomeSource()->getBiomeBlock(
        biomes, xOffs * 16, zOffs * 16, 16, 16, true);

    prepareHeights(xOffs, zOffs, blocks);
    buildSurfaces(xOffs, zOffs, blocks);

    LevelChunk *levelChunk = new LevelChunk(level, blocks, xOffs, zOffs);
    XPhysicalFree(tileData);

    delete biomes.data;
    return levelChunk;
}
```

### prepareHeights: the noise sampling

This method samples noise at intervals and fills blocks where the noise value is positive. The noise controls the island shapes. Where the combined noise is above zero, place purple stone. Where it is zero or below, leave air.

```cpp
void PurpleChunkSource::prepareHeights(int xOffs, int zOffs, byteArray& blocks)
{
    int xSize = CHUNK_WIDTH + 1;
    int ySize = Level::genDepth / CHUNK_HEIGHT + 1;
    int zSize = CHUNK_WIDTH + 1;

    double *heights = getHeights(
        NULL,
        xOffs * CHUNK_WIDTH, 0, zOffs * CHUNK_WIDTH,
        xSize, ySize, zSize);

    for (int cx = 0; cx < CHUNK_WIDTH; cx++)
    {
        for (int cz = 0; cz < CHUNK_WIDTH; cz++)
        {
            for (int cy = 0; cy < ySize - 1; cy++)
            {
                // Corners of this noise cell
                double v000 = heights[((cx + 0) * zSize + (cz + 0)) * ySize + (cy + 0)];
                double v001 = heights[((cx + 0) * zSize + (cz + 0)) * ySize + (cy + 1)];
                double v100 = heights[((cx + 1) * zSize + (cz + 0)) * ySize + (cy + 0)];
                double v101 = heights[((cx + 1) * zSize + (cz + 0)) * ySize + (cy + 1)];
                double v010 = heights[((cx + 0) * zSize + (cz + 1)) * ySize + (cy + 0)];
                double v011 = heights[((cx + 0) * zSize + (cz + 1)) * ySize + (cy + 1)];
                double v110 = heights[((cx + 1) * zSize + (cz + 1)) * ySize + (cy + 0)];
                double v111 = heights[((cx + 1) * zSize + (cz + 1)) * ySize + (cy + 1)];

                int blockStepY = CHUNK_HEIGHT;
                int blockStepXZ = 16 / CHUNK_WIDTH;

                // Trilinear interpolation within this cell
                for (int dy = 0; dy < blockStepY; dy++)
                {
                    double ty = (double)dy / blockStepY;
                    double d00 = v000 + (v001 - v000) * ty;
                    double d10 = v100 + (v101 - v100) * ty;
                    double d01 = v010 + (v011 - v010) * ty;
                    double d11 = v110 + (v111 - v110) * ty;

                    for (int dx = 0; dx < blockStepXZ; dx++)
                    {
                        double tx = (double)dx / blockStepXZ;
                        double dz0 = d00 + (d10 - d00) * tx;
                        double dz1 = d01 + (d11 - d01) * tx;

                        for (int dz = 0; dz < blockStepXZ; dz++)
                        {
                            double tz = (double)dz / blockStepXZ;
                            double val = dz0 + (dz1 - dz0) * tz;

                            int bx = cx * blockStepXZ + dx;
                            int by = cy * blockStepY + dy;
                            int bz = cz * blockStepXZ + dz;
                            int offs = (bx * 16 + bz) * Level::genDepth + by;

                            int tileId = 0;
                            if (val > 0)
                            {
                                tileId = Tile::purpleStone_Id;
                            }
                            blocks[offs] = (byte)tileId;
                        }
                    }
                }
            }
        }
    }

    delete[] heights;
}
```

### getHeights: the noise pipeline

This is where the island shapes come from. It combines multiple noise layers to produce floating terrain. The island noise creates scattered clusters, and the slide functions at the top and bottom force terrain to zero near the world ceiling and floor.

```cpp
double *PurpleChunkSource::getHeights(double *buffer,
    int x, int y, int z, int xSize, int ySize, int zSize)
{
    int total = xSize * zSize * ySize;
    if (buffer == NULL)
        buffer = new double[total];

    // Sample noise fields
    double *noise1 = lperlinNoise1->getRegion(
        NULL, x, y, z, xSize, ySize, zSize,
        684.412, 684.412, 684.412);
    double *noise2 = lperlinNoise2->getRegion(
        NULL, x, y, z, xSize, ySize, zSize,
        684.412, 684.412, 684.412);
    double *blendNoise = perlinNoise1->getRegion(
        NULL, x, y, z, xSize, ySize, zSize,
        684.412 / 80.0, 684.412 / 160.0, 684.412 / 80.0);
    double *islands = islandNoise->getRegion(
        NULL, x, z, xSize, zSize, 1.121, 1.121, 0);
    double *depth = depthNoise->getRegion(
        NULL, x, z, xSize, zSize, 200.0, 200.0, 0);

    int idx = 0;
    int idx2d = 0;

    for (int xx = 0; xx < xSize; xx++)
    {
        for (int zz = 0; zz < zSize; zz++)
        {
            // Island threshold: only generate terrain where this is high enough
            double islandVal = (islands[idx2d] + 256) / 512.0;
            double islandThreshold = islandVal * 100 - 60;

            double depthVal = depth[idx2d] / 8000.0;
            if (depthVal < 0) depthVal = -depthVal * 0.3;
            depthVal = depthVal * 3 - 2;
            if (depthVal < 0) depthVal = depthVal / 2;
            if (depthVal > 1) depthVal = 1;
            depthVal = depthVal / 8;

            idx2d++;

            for (int yy = 0; yy < ySize; yy++)
            {
                double n1 = noise1[idx] / 512.0;
                double n2 = noise2[idx] / 512.0;
                double blend = (blendNoise[idx] / 10.0 + 1) / 2.0;

                double val;
                if (blend < 0)
                    val = n1;
                else if (blend > 1)
                    val = n2;
                else
                    val = n1 + (n2 - n1) * blend;

                // Vertical center bias: terrain clusters around y=64
                double centerBias = ((double)yy - (ySize / 2.0 + depthVal)) * 12.0;
                if (centerBias > 0) centerBias *= 1.5;
                val = val - centerBias;

                // Island threshold masking
                if (islandThreshold < 0)
                    val = val + islandThreshold;

                // Top slide: force zero near ceiling
                if (yy > ySize - 4)
                {
                    double slide = (yy - (ySize - 4)) / 3.0;
                    val = val * (1 - slide) + -3000 * slide;
                }
                // Bottom slide: force zero near floor
                if (yy < 8)
                {
                    double slide = (8 - yy) / 7.0;
                    val = val * (1 - slide) + -30 * slide;
                }

                buffer[idx] = val;
                idx++;
            }
        }
    }

    delete[] noise1;
    delete[] noise2;
    delete[] blendNoise;
    delete[] islands;
    delete[] depth;

    return buffer;
}
```

### buildSurfaces: painting the top layer

Walk each column from top to bottom. When you hit the first purple stone block, replace it with purple grass. The next few blocks below become purple stone (they already are, so nothing to do). This is the same approach the Aether uses with its `buildSurfaces` method.

```cpp
void PurpleChunkSource::buildSurfaces(int xOffs, int zOffs, byteArray& blocks)
{
    for (int x = 0; x < 16; x++)
    {
        for (int z = 0; z < 16; z++)
        {
            int run = -1;
            int runDepth = 3;

            for (int y = Level::genDepthMinusOne; y >= 0; y--)
            {
                int offs = (x * 16 + z) * Level::genDepth + y;
                int old = blocks[offs];

                if (old == 0)
                {
                    // Air resets the run
                    run = -1;
                }
                else if (old == Tile::purpleStone_Id)
                {
                    if (run == -1)
                    {
                        // First stone from the top: replace with grass
                        run = runDepth;
                        blocks[offs] = (byte)Tile::purpleGrass_Id;
                    }
                    else if (run > 0)
                    {
                        // Below the grass: keep as purple stone
                        run--;
                    }
                }
            }
        }
    }
}
```

### Boilerplate methods

These are the same for basically every custom chunk source:

```cpp
LevelChunk *PurpleChunkSource::create(int x, int z)
{
    return getChunk(x, z);
}

void PurpleChunkSource::lightChunk(LevelChunk *lc)
{
    lc->recalcHeightmap();
}

void PurpleChunkSource::postProcess(ChunkSource *parent, int xt, int zt)
{
    HeavyTile::instaFall = true;
    int xo = xt * 16;
    int zo = zt * 16;

    pprandom->setSeed(level->getSeed());
    __int64 xScale = pprandom->nextLong() / 2 * 2 + 1;
    __int64 zScale = pprandom->nextLong() / 2 * 2 + 1;
    pprandom->setSeed(((xt * xScale) + (zt * zScale)) ^ level->getSeed());

    Biome *biome = level->getBiome(xo + 16, zo + 16);
    biome->decorate(level, pprandom, xo, zo);

    HeavyTile::instaFall = false;
}

bool PurpleChunkSource::hasChunk(int x, int y) { return true; }
bool PurpleChunkSource::save(bool force, ProgressListener *p) { return true; }
bool PurpleChunkSource::tick() { return false; }
bool PurpleChunkSource::shouldSave() { return true; }
wstring PurpleChunkSource::gatherStats() { return L"PurpleChunkSource"; }

TilePos *PurpleChunkSource::findNearestMapFeature(
    Level *level, const wstring& featureName, int x, int y, int z)
{
    return NULL;
}

vector<Biome::MobSpawnerData *> *PurpleChunkSource::getMobsAt(
    MobCategory *mobCategory, int x, int y, int z)
{
    Biome *biome = level->getBiome(x, z);
    if (biome == NULL) return NULL;
    return biome->getMobs(mobCategory);
}
```

## Step 5: Create the PurpleDimension class

Now the dimension itself. This ties together the chunk source, the fog color, sky behavior, and spawn rules.

**`PurpleDimension.h`**
```cpp
#pragma once
#include "Dimension.h"

class PurpleDimension : public Dimension
{
public:
    virtual void init();
    virtual ChunkSource *createRandomLevelSource() const;
    virtual float getTimeOfDay(__int64 time, float a) const;
    virtual float *getSunriseColor(float td, float a);
    virtual Vec3 *getFogColor(float td, float a) const;
    virtual bool isNaturalDimension();
    virtual bool mayRespawn() const;
    virtual bool hasGround();
    virtual float getCloudHeight();
    virtual bool isValidSpawn(int x, int z) const;
    virtual Pos *getSpawnPos();
    int getSpawnYPosition();
    virtual bool isFoggyAt(int x, int z);
    virtual bool hasBedrockFog();
    double getClearColorScale();
};
```

`getSpawnYPosition()` and `getClearColorScale()` are not virtual in the base `Dimension` class, so marking them `virtual` here would not actually override anything. If you want them to dispatch polymorphically (through a `Dimension*` pointer), you need to first add `virtual` to their declarations in `Dimension.h`. For this template they work fine as non-virtual since the `PurpleDimension` object is used directly.

**`PurpleDimension.cpp`**
```cpp
#include "stdafx.h"
#include "PurpleDimension.h"
#include "PurpleChunkSource.h"
#include "FixedBiomeSource.h"
#include "net.minecraft.world.level.biome.h"

void PurpleDimension::init()
{
    biomeSource = new FixedBiomeSource(Biome::purple, 0.5f, 0.0f);
    id = 3;
    hasCeiling = false;
    ultraWarm = false;
}

ChunkSource *PurpleDimension::createRandomLevelSource() const
{
    return new PurpleChunkSource(level, level->getSeed());
}
```

### Time of day

Return a constant `0.75f` for permanent sunrise/twilight. This gives the dimension a perpetual dim purple mood without being pitch black.

```cpp
float PurpleDimension::getTimeOfDay(__int64 time, float a) const
{
    return 0.75f;  // permanent twilight
}
```

For reference, the Aether uses `0.0f` (permanent noon) and the Nether uses `0.5f` (permanent midnight). Check [Custom Dimensions](/slop-docs/modding/custom-dimensions/) for the full table.

### Fog color

This is where the purple identity comes from. Return a static purple fog color. Since time of day is locked, there is no need to modulate by brightness.

```cpp
Vec3 *PurpleDimension::getFogColor(float td, float a) const
{
    float r = 0.35f;
    float g = 0.10f;
    float b = 0.50f;
    return Vec3::newTemp(r, g, b);
}
```

These values give a rich dark purple. If you want something lighter, bump all three channels up. If you want it to pulse or shift over time, multiply by a `Mth::sin()` of `td`. See [Fog & Sky](/slop-docs/modding/fog-sky/) for examples of time-varying fog.

### Sunrise and sky settings

No sunrise effect. The dimension has permanent twilight, so a sunrise gradient would look wrong.

```cpp
float *PurpleDimension::getSunriseColor(float td, float a)
{
    return NULL;
}
```

### Spawn and world behavior

```cpp
bool PurpleDimension::isNaturalDimension()
{
    return false;  // no normal day/night mob spawning
}

bool PurpleDimension::mayRespawn() const
{
    return false;  // dying sends you back to Overworld
}

bool PurpleDimension::hasGround()
{
    return true;  // has a ground plane for rendering
}

float PurpleDimension::getCloudHeight()
{
    return (float)Level::genDepth + 16;  // clouds slightly above normal
}

bool PurpleDimension::isValidSpawn(int x, int z) const
{
    int topTile = level->getTopTile(x, z);
    if (topTile == 0) return false;
    return Tile::tiles[topTile]->material->blocksMotion();
}

Pos *PurpleDimension::getSpawnPos()
{
    return new Pos(0, 64, 0);
}

int PurpleDimension::getSpawnYPosition()
{
    return 64;
}

bool PurpleDimension::isFoggyAt(int x, int z)
{
    return true;  // thick fog everywhere, like the Nether
}

bool PurpleDimension::hasBedrockFog()
{
    return false;  // no bedrock-level fog darkening
}

double PurpleDimension::getClearColorScale()
{
    return 1.0;  // full brightness sky, no underground dimming
}
```

Setting `isFoggyAt` to `true` pulls the fog close, which makes the purple fog thick and visible. If you want a more open feel, return `false` and the fog will stay at normal render distance.

## Step 6: Create the Purple Portal tile

The portal is a `HalfTransparentTile` that sits inside a frame and teleports entities. This tutorial uses an obsidian frame activated by right-clicking with a purple stone block, but you can use any frame material and activation method you like.

**`PurplePortalTile.h`**
```cpp
#pragma once
#include "HalfTransparentTile.h"

class Level;
class Entity;

class PurplePortalTile : public HalfTransparentTile
{
public:
    PurplePortalTile(int id);

    bool trySpawnPortal(Level *level, int x, int y, int z, bool actuallySpawn);
    virtual void entityInside(Level *level, int x, int y, int z,
                              shared_ptr<Entity> entity);
    virtual int getResource(int data, Random *random, int playerBonusLevel);
};
```

**`PurplePortalTile.cpp`**
```cpp
#include "stdafx.h"
#include "PurplePortalTile.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.entity.h"

PurplePortalTile::PurplePortalTile(int id)
    : HalfTransparentTile(id, L"purplePortal", Material::portal, false)
{
    setTicking(true);
}

int PurplePortalTile::getResource(int data, Random *random, int playerBonusLevel)
{
    return 0;  // portal blocks don't drop anything
}
```

### Frame validation and spawning

The portal frame is 4 wide by 5 tall, made of obsidian. The interior is 2 wide by 3 tall. This follows the same pattern as the Aether portal (which uses glowstone). Adjust the frame block check if you want a different material.

```cpp
bool PurplePortalTile::trySpawnPortal(Level *level, int x, int y, int z,
                                       bool actuallySpawn)
{
    // Figure out portal orientation
    int xd = 0, zd = 0;
    if (level->getTile(x - 1, y, z) == Tile::obsidian_Id ||
        level->getTile(x + 1, y, z) == Tile::obsidian_Id) xd = 1;
    if (level->getTile(x, y, z - 1) == Tile::obsidian_Id ||
        level->getTile(x, y, z + 1) == Tile::obsidian_Id) zd = 1;
    if (xd == zd) return false;  // must be oriented one way, not both

    // Validate the full frame
    for (int xx = -1; xx <= 2; xx++)
    {
        for (int yy = -1; yy <= 3; yy++)
        {
            bool isCorner = (xx == -1 || xx == 2) && (yy == -1 || yy == 3);
            if (isCorner) continue;  // skip corners

            bool isEdge = (xx == -1) || (xx == 2) || (yy == -1) || (yy == 3);
            int t = level->getTile(x + xd * xx, y + yy, z + zd * xx);

            if (isEdge)
            {
                if (t != Tile::obsidian_Id) return false;
            }
            else
            {
                if (t != 0) return false;  // interior must be air
            }
        }
    }

    if (!actuallySpawn) return true;

    // Fill the interior with portal blocks
    level->noNeighborUpdate = true;
    for (int xx = 0; xx < 2; xx++)
    {
        for (int yy = 0; yy < 3; yy++)
        {
            level->setTile(x + xd * xx, y + yy, z + zd * xx,
                           Tile::purplePortalTile_Id);
        }
    }
    level->noNeighborUpdate = false;
    return true;
}
```

### Entity teleportation

When an entity walks into the portal block, set a flag that gets picked up in the player tick.

```cpp
void PurplePortalTile::entityInside(Level *level, int x, int y, int z,
                                     shared_ptr<Entity> entity)
{
    if (entity->riding == NULL && entity->rider.lock() == NULL)
    {
        entity->handleInsidePurplePortal();
    }
}
```

## Step 7: Wire up portal teleportation on the player

You need to add a few things to the entity and player classes.

### Entity.h

Add a virtual method with an empty body:

```cpp
virtual void handleInsidePurplePortal() {}
```

### Player.h

Add a flag:

```cpp
bool isInsidePurplePortal = false;
```

Override the method:

```cpp
virtual void handleInsidePurplePortal();
```

### Player.cpp

```cpp
void Player::handleInsidePurplePortal()
{
    if (changingDimensionDelay > 0)
    {
        changingDimensionDelay = 10;
        return;
    }
    isInsidePurplePortal = true;
}
```

### ServerPlayer tick

In `ServerPlayer`'s tick method, add a block alongside the existing Nether/End/Aether portal handling:

```cpp
else if (isInsidePurplePortal)
{
    portalTime += 1 / 80.0f;
    if (portalTime >= 1)
    {
        portalTime = 1;
        changingDimensionDelay = 10;

        // Toggle between Overworld (0) and Purple Dimension (3)
        int targetDimension = (dimension == 3) ? 0 : 3;

        server->getPlayers()->toggleDimension(
            dynamic_pointer_cast<ServerPlayer>(shared_from_this()),
            targetDimension);
    }
    isInsidePurplePortal = false;
}
```

The `portalTime` counter takes about 4 seconds (80 ticks) to fill. The player sees the portal overlay during this time, then gets teleported.

## Step 8: Portal activation trigger

You need a way to light the portal. The simplest approach: when the player right-clicks an obsidian frame with a purple stone block, try to spawn the portal.

In `PurpleStoneTile`, you could add a `useOn` override, but the cleaner place is in the item's `useOn` method. If purple stone has a standard `TileItem`, add this check to `TileItem::useOn()` or create a custom item subclass.

A simpler option is to add the check in `BucketItem.cpp` like the Aether does, or in the `use` handler of whatever item you want as the activator. Here is the pattern:

```cpp
// When the player uses purple stone on a block:
if (itemId == Tile::purpleStone_Id)
{
    // Check if we're clicking inside an obsidian frame
    if (level->getTile(xt, yt - 1, zt) == Tile::obsidian_Id ||
        level->getTile(xt, yt, zt - 1) == Tile::obsidian_Id ||
        level->getTile(xt, yt, zt + 1) == Tile::obsidian_Id)
    {
        if (Tile::purplePortalTile->trySpawnPortal(level, xt, yt, zt, true))
        {
            return true;
        }
    }
}
```

Where you put this depends on your activation method. The Aether puts its check in `BucketItem` (water bucket inside glowstone frame). You could put yours in a custom item's `useOn`, or hook into the tile placement logic.

## Step 9: Register everything

Here is a checklist of every file you need to touch.

### Tile.h and Tile.cpp

Already covered in Steps 1 and 2. You also need the portal tile:

In `Tile.h`:
```cpp
class PurplePortalTile;
static PurplePortalTile *purplePortalTile;
static const int purplePortalTile_Id = 202;
```

In `Tile.cpp`:
```cpp
PurplePortalTile *Tile::purplePortalTile = NULL;

// Inside Tile::staticCtor():
Tile::purplePortalTile = (PurplePortalTile *)
    ((new PurplePortalTile(202))
        ->setDestroyTime(-1)
        ->setSoundType(Tile::SOUND_GLASS)
        ->setLightEmission(0.75f))
    ->setTextureName(L"purplePortal");
```

The `-1` destroy time makes the portal unbreakable by hand, like vanilla portals.

### Biome.h and Biome.cpp

Already covered in Step 3.

### Dimension.cpp (factory method)

Add your dimension to `Dimension::getNew()`:

```cpp
Dimension *Dimension::getNew(int id)
{
    if (id == -1) return new HellDimension();
    if (id == 0)  return new NormalDimension();
    if (id == 1)  return new TheEndDimension();
    if (id == 2)  return new AetherDimension();
    if (id == 3)  return new PurpleDimension();  // <-- add this
    return NULL;
}
```

### Entity.h

Add the empty virtual:
```cpp
virtual void handleInsidePurplePortal() {}
```

### Player.h and Player.cpp

Add the flag and override as shown in Step 7.

### ServerPlayer.cpp

Add the portal tick handling as shown in Step 7.

### net.minecraft.world.level.dimension.h (umbrella header)

This file lives at `Minecraft.World/net.minecraft.world.level.dimension.h`. It includes every dimension header so other files can just include the umbrella. Add your new dimension at the end:

```cpp
#pragma once

#include "Dimension.h"
#include "HellDimension.h"
#include "NormalDimension.h"
#include "TheEndDimension.h"
#include "PurpleDimension.h"  // add this line
```

Any file that includes this umbrella header (like `MultiPlayerChunkCache.cpp` and `Dimension.cpp`) will automatically pick up your new dimension. If you skip this, you will get "undeclared identifier" errors when `Dimension::getNew()` tries to construct a `PurpleDimension`.

### cmake/Sources.cmake

Open `cmake/Sources.cmake` and find the `MINECRAFT_WORLD_SOURCES` list. It is a long alphabetical list of `.cpp` files. Add your 6 new files in roughly alphabetical order. Find the `Player.cpp` line and add yours nearby:

```cmake
set(MINECRAFT_WORLD_SOURCES
        ...
        "PlainsBiome.cpp"
        "Player.cpp"
        ...
        "PurpleBiome.cpp"           # add these 6 lines
        "PurpleChunkSource.cpp"
        "PurpleDimension.cpp"
        "PurpleGrassTile.cpp"
        "PurplePortalTile.cpp"
        "PurpleStoneTile.cpp"
        ...
)
```

The exact position does not matter for the build, but keeping it alphabetical makes it easier to find later. All 6 files go in `MINECRAFT_WORLD_SOURCES`, not `MINECRAFT_CLIENT_SOURCES`, because they are in the `Minecraft.World/` directory.

## Step 10: Update the LevelRenderer

The renderer needs to know about the new dimension or blocks will stop rendering past a certain distance. Two static arrays control per-dimension render limits, and a few helper functions use them.

In `LevelRenderer.h`, expand both arrays from 3 to 4:

```cpp
static const int MAX_LEVEL_RENDER_SIZE[4];
static const int DIMENSION_OFFSETS[4];
```

In `LevelRenderer.cpp`, add the 4th element to each array. Use 80 for the Purple Dimension since it should be overworld-sized:

```cpp
const int LevelRenderer::MAX_LEVEL_RENDER_SIZE[4] = { 80, 44, 44, 80 };
```

For `DIMENSION_OFFSETS`, each value is the cumulative sum of `renderSize^2 * CHUNK_Y_COUNT` for all previous dimensions. `CHUNK_Y_COUNT` is `maxBuildHeight / 16` (256 / 16 = 16):

```cpp
const int LevelRenderer::DIMENSION_OFFSETS[4] = {
    0,
    (80 * 80 * CHUNK_Y_COUNT),
    (80 * 80 * CHUNK_Y_COUNT) + (44 * 44 * CHUNK_Y_COUNT),
    (80 * 80 * CHUNK_Y_COUNT) + (44 * 44 * CHUNK_Y_COUNT) + (44 * 44 * CHUNK_Y_COUNT)
};
```

Then update `getDimensionIndexFromId()` to handle id=3:

```cpp
if (id == 3) return 3;
return (3 - id) % 3;
```

Without this, the fallthrough math maps id=3 back to index 0 (Overworld), which causes the wrong offset and corrupts rendering.

Also update `getGlobalChunkCount()` and `isGlobalIndexInSameDimension()` to account for 4 dimensions instead of 3. These functions loop over or index into the arrays above, so anywhere you see a hardcoded `3` as the array bound, change it to `4`.

If you skip this step, the dimension will load and generate correctly but blocks will turn invisible past a certain distance. That is the most common symptom of a missing renderer registration.

## Step 11: Add textures

You need texture files for:

- `purpleStone` - a stone-like texture in purple tones
- `purpleGrass` - a grass texture with purple coloring (top, sides, bottom)
- `purplePortal` - the portal swirl effect (you can reuse the nether portal texture and recolor it)

See [Block Textures](/slop-docs/modding/block-textures/) for how to add entries to the texture atlas and set up multi-face textures for the grass block.

## Full file list

Here is every file involved, for quick reference:

| File | Action |
|------|--------|
| `PurpleStoneTile.h/.cpp` | New: purple stone block class |
| `PurpleGrassTile.h/.cpp` | New: purple grass block class |
| `PurpleBiome.h/.cpp` | New: biome with purple colors and surface |
| `PurpleChunkSource.h/.cpp` | New: terrain generator |
| `PurpleDimension.h/.cpp` | New: dimension class |
| `PurplePortalTile.h/.cpp` | New: portal block |
| `Tile.h` | Modified: add static pointers and IDs for 3 new tiles |
| `Tile.cpp` | Modified: add static definitions and registrations |
| `Biome.h` | Modified: add `static Biome *purple` |
| `Biome.cpp` | Modified: add biome registration |
| `Dimension.cpp` | Modified: add `id == 3` case to factory |
| `Entity.h` | Modified: add `handleInsidePurplePortal()` virtual |
| `Player.h` | Modified: add portal flag and override |
| `Player.cpp` | Modified: implement `handleInsidePurplePortal()` |
| `ServerPlayer.cpp` | Modified: add portal tick logic |
| `Minecraft.Client/LevelRenderer.h` | Modified: expand `MAX_LEVEL_RENDER_SIZE[3]` to `[4]` and `DIMENSION_OFFSETS[3]` to `[4]` |
| `Minecraft.Client/LevelRenderer.cpp` | Modified: add 4th element to both arrays, update `getDimensionIndexFromId()`, `getGlobalChunkCount()`, and `isGlobalIndexInSameDimension()` to handle id=3 |
| `cmake/Sources.cmake` | Modified: add new source files |

## Build and test

### Regenerate and build

After making all changes, you need to regenerate the cmake project and build:

1. Run cmake to regenerate your project files. From your build directory:
   ```
   cmake ..
   ```
   If you forgot to add files to `Sources.cmake`, cmake will succeed but you will get linker errors later.

2. Build the project. Fix any compile errors before moving on.

### Launch and test in-game

1. Start a new world in creative mode
2. Open your inventory and grab obsidian blocks and purple stone blocks
3. Build a portal frame: 4 blocks wide, 5 blocks tall (same shape as a nether portal). The corners are optional, just like a nether portal
4. Activate it by right-clicking the inside of the frame with a purple stone block (or whatever activation method you wired up in Step 8)
5. The inside of the frame should fill with purple portal blocks
6. Walk into the portal and wait about 4 seconds. You will see a portal overlay effect
7. You should teleport to the Purple Dimension

### What to look for

When it is working correctly:
- Thick purple fog everywhere
- Floating islands made of purple stone with purple grass on top
- Permanent twilight (dim lighting, no day/night cycle)
- Walking back into a portal in the Purple Dimension takes you back to the Overworld

### Common build errors

**"undeclared identifier PurpleDimension"** in `Dimension.cpp`: You forgot to add the include to the umbrella header. Open `Minecraft.World/net.minecraft.world.level.dimension.h` and add `#include "PurpleDimension.h"`.

**"unresolved external symbol"** or linker errors mentioning Purple-something: You forgot to add the `.cpp` files to `cmake/Sources.cmake`. Add all 6 files to the `MINECRAFT_WORLD_SOURCES` list and re-run cmake.

**"undeclared identifier PurpleBiome"** in `Biome.cpp`: You need to include `PurpleBiome.h` at the top of `Biome.cpp`, or add it to whatever umbrella header `Biome.cpp` uses for biome includes.

**Blocks turn invisible past a certain distance**: You forgot to update the `LevelRenderer` arrays. Go back to Step 10 and make sure both `MAX_LEVEL_RENDER_SIZE` and `DIMENSION_OFFSETS` have 4 elements, and that `getDimensionIndexFromId()` handles `id == 3`.

**Portal does nothing when you step in**: Check that `handleInsidePurplePortal()` exists on both `Entity.h` (empty body) and `Player.h`/`Player.cpp` (sets the flag). Then check that `ServerPlayer.cpp` has the tick handler that reads `isInsidePurplePortal`.

**Crash on entering the dimension**: Make sure the dimension ID in `Dimension::getNew()` (where you check `id == 3`) matches the ID you set in `PurpleDimension::init()` (where you write `id = 3`). If these do not match, the game will either crash or load the wrong dimension.

**Purple grass and stone are untextured (pink/black checkerboard)**: You have not added texture files yet. See Step 11 for what textures you need. The blocks will work mechanically without textures, they just look wrong.

## What to try next

Once the basic dimension works, here are some things to build on top of it:

- **Custom ores**: Add purple ore tiles that generate inside purple stone. Use `OreFeature` in your biome decorator with `Tile::purpleStone_Id` as the replacement target. See [Adding Blocks](/slop-docs/modding/adding-blocks/) for the ore tile pattern.
- **Custom trees**: Create a tree feature that generates purple wood and purple leaves. Override `getTreeFeature()` on your biome.
- **Ambient particles**: Add floating purple particles using `animateTick()` on your purple grass tile. See [Custom Particles](/slop-docs/modding/custom-particles/).
- **Custom structures**: Place structures like towers or ruins during `postProcess()`. See [Custom Structures](/slop-docs/modding/custom-structures/).
- **Custom mobs**: Add enemies and friendlies to the biome's mob lists. See [Adding Entities](/slop-docs/modding/adding-entities/).
- **Better terrain**: Tweak the noise parameters in `getHeights()` for different island sizes and shapes. Add a carving noise layer to cut holes into the terrain.
- **Custom light ramp**: Override `updateLightRamp()` on `PurpleDimension` to give the dimension a purple ambient glow, similar to how the Nether has a faint red ambient light.
- **Portal particle effects**: Add a purple particle effect around the portal frame. The Nether portal does this with `animateTick()`.
- **ColourTable integration**: Add a `Purple_Fog_Colour` entry to the colour table so texture packs can override your fog color without code changes. See [Fog & Sky](/slop-docs/modding/fog-sky/) for how the colour table works.

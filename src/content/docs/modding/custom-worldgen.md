---
title: Custom World Generation
description: How to modify terrain generation in LCE.
---

LCE world generation follows the same pipeline as legacy console Minecraft: a `ChunkSource` generates raw terrain, `BiomeDecorator` places ores and vegetation, and a `Layer` stack picks biome placement. Once you understand these systems, you can add new ores, trees, structures, and even completely custom terrain shapes.

## Generation pipeline

```
Layer stack (biome selection)
    |
    v
ChunkSource::create()          -- raw terrain heightmap
    |
    v
ChunkSource::postProcess()     -- structures, ores, vegetation
    |
    v
ChunkSource::lightChunk()      -- lighting pass (4J addition)
```

The overworld uses `RandomLevelSource`, the Nether uses `HellRandomLevelSource`, The End uses `TheEndLevelRandomLevelSource`, superflat uses `FlatLevelSource`, and custom heightmaps use `CustomLevelSource`.

## ChunkSource

`ChunkSource` (`Minecraft.World/ChunkSource.h`) is the abstract base for all terrain generators:

```cpp
class ChunkSource {
public:
    int m_XZSize;  // world size in chunks

    virtual bool hasChunk(int x, int y) = 0;
    virtual LevelChunk *getChunk(int x, int z) = 0;
    virtual LevelChunk *create(int x, int z) = 0;
    virtual void postProcess(ChunkSource *parent, int x, int z) = 0;
    virtual void lightChunk(LevelChunk *lc) {}       // 4J addition
    virtual bool save(bool force, ProgressListener *progressListener) = 0;
    virtual bool tick() = 0;
    virtual bool shouldSave() = 0;
    virtual wstring gatherStats() = 0;
    virtual vector<Biome::MobSpawnerData *> *getMobsAt(...) = 0;
    virtual TilePos *findNearestMapFeature(...) = 0;

    // 4J additions:
    virtual bool reallyHasChunk(int x, int z) { ... }
    virtual bool saveAllEntities() { ... }
    virtual void getCache(vector<LevelChunk *> *buffer) { ... }
    virtual void dataReceived(int x, int z) { ... }
};
```

### RandomLevelSource (overworld)

`RandomLevelSource` (`Minecraft.World/RandomLevelSource.h`) generates the overworld. Here's what's important:

- **7 Perlin noise layers** shape the terrain: `lperlinNoise1` (16 octaves), `lperlinNoise2` (16 octaves), `perlinNoise1` (8 octaves), `scaleNoise`, `depthNoise`, `forestNoise`, plus one more
- **Large features** get applied during `create()`: caves (`LargeCaveFeature`), canyons (`CanyonFeature`)
- **Structures** get applied during `postProcess()`: strongholds, villages, mineshafts, scattered features (temples)
- **Edge falloff**: the console edition applies terrain falloff near world borders to create ocean edges
- **pprandom**: 4J addition, a separate `Random` instance for thread-safe parallel processing

```cpp
RandomLevelSource::RandomLevelSource(Level *level, __int64 seed, bool generateStructures) {
    caveFeature = new LargeCaveFeature();
    strongholdFeature = new StrongholdFeature();
    villageFeature = new VillageFeature(0, m_XZSize);
    mineShaftFeature = new MineShaftFeature();
    scatteredFeature = new RandomScatteredLargeFeature();
    canyonFeature = new CanyonFeature();

    random = new Random(seed);
    lperlinNoise1 = new PerlinNoise(random, 16);
    lperlinNoise2 = new PerlinNoise(random, 16);
    perlinNoise1  = new PerlinNoise(random, 8);
    // ... more noise layers
}
```

Key constants:

- `FLOATING_ISLANDS = false`: When true, terrain generates without ground level (unused in release)
- `CHUNK_HEIGHT = 8`, `CHUNK_WIDTH = 4`: Noise sample resolution

### HellRandomLevelSource (Nether)

`HellRandomLevelSource` generates the Nether with these differences from the overworld:

- **5 Perlin noise layers**: `lperlinNoise1`, `lperlinNoise2`, `perlinNoise1`, `perlinNoise2`, `perlinNoise3` (extra `perlinNoise2`/`3` vs overworld)
- **`netherBridgeFeature`**: Public member, so the spawning system can check fortress bounds for mob spawns
- **`caveFeature`**: Uses `LargeHellCaveFeature` instead of `LargeCaveFeature`
- Same `CHUNK_HEIGHT = 8`, `CHUNK_WIDTH = 4` as the overworld
- Has `pprandom` (4J addition)

### TheEndLevelRandomLevelSource (End)

Generates The End with reversed noise resolution:

- `CHUNK_HEIGHT = 4`, `CHUNK_WIDTH = 8` (opposite of the overworld's 8/4)
- Simpler terrain: just floating islands of end stone

### FlatLevelSource (Superflat)

The simplest chunk source. Generates flat terrain and only has one structure: `villageFeature`. Has `pprandom` (4J addition).

### CustomLevelSource (Custom heightmaps)

For tutorial worlds and special content. Has a `_OVERRIDE_HEIGHTMAP` define that's enabled when not building a content package:

```cpp
#ifndef _CONTENT_PACKAGE
#define _OVERRIDE_HEIGHTMAP
#endif
```

When enabled, it gains:
- `m_heightmapOverride` / `m_waterheightOverride`: Byte arrays for externally-defined terrain shapes
- All the standard structure features: stronghold, village, mineshaft, canyon, cave
- `calcWaterDepths()`: Calculates water depth based on the override heightmap
- Has `pprandom` and `perlinNoise3` for additional noise

World size is defined by constants in `ChunkSource.h`:

| Constant | Value | Description |
|---|---|---|
| `LEVEL_MAX_WIDTH` | `5*64` (large) or `54` | Overworld size in chunks |
| `HELL_LEVEL_MAX_SCALE` | `8` (large) or `3` | Nether scale factor |
| `END_LEVEL_MAX_WIDTH` | `18` | End dimension size |

## Feature system

`Feature` (`Minecraft.World/Feature.h`) is the abstract base class for all decorative world generation elements:

```cpp
class Feature {
public:
    Feature();
    Feature(bool doUpdate);

    virtual bool place(Level *level, Random *random, int x, int y, int z) = 0;
    virtual void init(double V1, double V2, double V3) {}
    virtual bool placeWithIndex(Level *level, Random *random, int x, int y, int z, int index)
        { return place(level, random, x, y, z); }

protected:
    virtual void placeBlock(Level *level, int x, int y, int z, int tile);
    virtual void placeBlock(Level *level, int x, int y, int z, int tile, int data);
};
```

Every Feature subclass implements `place()` to generate blocks at a given position. The `doUpdate` constructor parameter controls whether placed blocks trigger neighbor updates. The `placeBlock()` helpers handle setting tiles in the level. `init()` takes three doubles for parameterizing the feature (used by `BasicTree` for height/width/density). `placeWithIndex()` is used when the same feature needs different behavior for different placements.

### Built-in Feature subclasses

| Feature class | File | What it generates |
|---|---|---|
| `OreFeature` | `OreFeature.h` | Ore veins (ellipsoidal clusters) |
| `TreeFeature` | `TreeFeature.h` | Oak trees (with optional jungle variant) |
| `BasicTree` | `BasicTree.h` | Complex large trees with branching limbs |
| `BirchFeature` | `BirchFeature.h` | Birch trees |
| `PineFeature` | `PineFeature.h` | Pine/spruce trees (no constructor args) |
| `SpruceFeature` | `SpruceFeature.h` | Spruce trees (takes `doUpdate` flag) |
| `SwampTreeFeature` | `SwampTreeFeature.h` | Swamp trees with vines |
| `MegaTreeFeature` | `MegaTreeFeature.h` | Large 2x2 trees |
| `GroundBushFeature` | `GroundBushFeature.h` | Small jungle bushes (1-block trunk) |
| `HugeMushroomFeature` | `HugeMushroomFeature.h` | Giant mushrooms |
| `FlowerFeature` | `FlowerFeature.h` | Flowers (any single-block plant) |
| `TallGrassFeature` | `TallGrassFeature.h` | Tall grass patches |
| `CactusFeature` | `CactusFeature.h` | Cactus columns |
| `ReedsFeature` | `ReedsFeature.h` | Sugar cane |
| `ClayFeature` | `ClayFeature.h` | Clay patches |
| `SandFeature` | `SandFeature.h` | Sand/gravel patches |
| `LakeFeature` | `LakeFeature.h` | Surface/underground lakes |
| `SpringFeature` | `SpringFeature.h` | Water/lava springs |
| `DungeonFeature` | `DungeonFeature.h` | Monster spawner rooms |
| `DesertWellFeature` | `DesertWellFeature.h` | Desert wells |
| `BonusChestFeature` | `BonusChestFeature.h` | Starting bonus chest |
| `SpikeFeature` | `SpikeFeature.h` | End spikes (obsidian pillars) |
| `EndPodiumFeature` | `EndPodiumFeature.h` | End exit portal podium |
| `VinesFeature` | `VinesFeature.h` | Vine patches on surfaces |
| `HellSpringFeature` | `HellSpringFeature.h` | Nether lava/water springs |
| `HellFireFeature` | `HellFireFeature.h` | Nether fire patches |
| `LightGemFeature` | `LightGemFeature.h` | Glowstone clusters |
| `HellPortalFeature` | `HellPortalFeature.h` | Nether portal frames (unused in vanilla) |

### Adding a custom ore

`OreFeature` generates ellipsoidal ore veins. Constructor parameters:

```cpp
OreFeature(int tileId, int count);                   // replaces stone by default
OreFeature(int tileId, int count, int targetTileId);  // replaces a specific tile
```

- `tileId` is the ore block ID to place
- `count` is the vein size (number of placement iterations; vanilla uses 7-32)
- `targetTileId` is what block to replace (defaults to `Tile::rock_Id`, which is stone)

The `place()` method creates a tube-shaped vein between two random endpoints, placing ore blocks in an ellipsoidal pattern around the tube. The internal `_init()` method stores the tile, count, and target.

**To add a new ore**, register an `OreFeature` in `BiomeDecorator::_init()` and call it in `decorateOres()`:

```cpp
// In BiomeDecorator::_init()
myCustomOreFeature = new OreFeature(Tile::myOre_Id, 8);  // vein size 8

// In BiomeDecorator::decorateOres()
decorateDepthSpan(6, myCustomOreFeature, 0, Level::genDepth / 4);
// 6 attempts per chunk, between y=0 and y=genDepth/4
```

For a Nether ore, use the three-argument constructor to replace netherrack instead of stone:

```cpp
new OreFeature(Tile::myNetherOre_Id, 14, Tile::hellRock_Id);
```

The decoration helpers control how often and where features get placed:

| Method | Parameters | Behavior |
|---|---|---|
| `decorateDepthSpan(count, feature, y0, y1)` | count, feature, min Y, max Y | Places `count` times at random Y between y0 and y1 |
| `decorateDepthAverage(count, feature, yMid, ySpan)` | count, feature, center Y, spread | Places near a center height (used for lapis) |
| `decorate(count, feature)` | count, feature | Places at surface height |

### Adding a custom tree

Trees are `Feature` subclasses. There are several tree types you can use or extend:

#### TreeFeature (standard oak/jungle tree)

```cpp
TreeFeature(bool doUpdate);
TreeFeature(bool doUpdate, int baseHeight, int trunkType, int leafType, bool addJungleFeatures);
```

- `baseHeight`: Minimum trunk height (default oak is 4)
- `trunkType`: Tile ID for trunk blocks (e.g., `Tile::treeTrunk_Id`)
- `leafType`: Tile ID for leaf blocks (e.g., `Tile::leaves_Id`)
- `addJungleFeatures`: When true, adds vines and cocoa beans via `addVine()`

#### BasicTree (complex large tree)

The most complex tree feature. Uses a branching algorithm with:

- `init(heightInit, widthInit, foliageDensityInit)`: Three parameters controlling size
- `axisConversionArray`: Converts between primary/secondary/tertiary axes
- `foliageCoords`: Array of `[x, y, z, branchBaseY]` for each leaf cluster
- Methods: `prepare()`, `crossection()`, `treeShape()`, `foliageShape()`, `foliageCluster()`, `limb()`, `makeFoliage()`, `trimBranches()`, `makeTrunk()`, `makeBranches()`, `checkLine()`, `checkLocation()`

Fields controlling the shape: `height`, `trunkHeight`, `trunkHeightScale`, `branchDensity`, `branchSlope`, `widthScale`, `foliageDensity`, `trunkWidth`, `heightVariance`, `foliageHeight`.

#### MegaTreeFeature (2x2 trunk trees)

```cpp
MegaTreeFeature(bool doUpdate, int baseHeight, int trunkType, int leafType);
```

Used for jungle trees and large spruce. Has `placeLeaves()` for the crown and uses a 2x2 trunk pattern.

#### Other tree features

| Feature | Constructor | Notes |
|---------|------------|-------|
| `PineFeature` | No args | Standard pine shape, no configuration |
| `SpruceFeature` | `SpruceFeature(bool doUpdate)` | Spruce shape with doUpdate flag |
| `SwampTreeFeature` | No args | Oak-like tree with `addVine()` for dangling vines |
| `GroundBushFeature` | `GroundBushFeature(int trunkType, int leafType)` | 1-block trunk with a ball of leaves. Used in jungle biomes |
| `BirchFeature` | `BirchFeature.h` | Standard birch tree shape |

#### Hooking trees into biomes

Biomes return their tree type through `getTreeFeature()`:

```cpp
virtual Feature *getTreeFeature(Random *random);
```

To add a custom tree, either subclass `Feature` directly or create a `TreeFeature` with custom block types. Then override `getTreeFeature()` in your biome to return it:

```cpp
Feature *MyBiome::getTreeFeature(Random *random)
{
    if (random->nextInt(5) == 0)
        return mySpecialTree;
    return new TreeFeature(false);  // default oak otherwise
}
```

Similarly, `getGrassFeature()` controls what ground cover a biome generates:

```cpp
virtual Feature *getGrassFeature(Random *random);
```

## BiomeDecorator

`BiomeDecorator` (`Minecraft.World/BiomeDecorator.h`) is the main decoration orchestrator. Each biome owns a `BiomeDecorator` that runs during `postProcess()`.

### Feature instances

The decorator creates these feature instances in `_init()`:

| Field | Feature type | What it makes |
|-------|-------------|---------------|
| `clayFeature` | `ClayFeature` | Clay deposits |
| `sandFeature` | `SandFeature` | Sand deposits |
| `gravelFeature` | `SandFeature` | Gravel deposits (uses SandFeature with gravel tile) |
| `dirtOreFeature` | `OreFeature` | Dirt pockets in stone |
| `gravelOreFeature` | `OreFeature` | Gravel pockets in stone |
| `coalOreFeature` | `OreFeature` | Coal ore |
| `ironOreFeature` | `OreFeature` | Iron ore |
| `goldOreFeature` | `OreFeature` | Gold ore |
| `redStoneOreFeature` | `OreFeature` | Redstone ore |
| `diamondOreFeature` | `OreFeature` | Diamond ore |
| `lapisOreFeature` | `OreFeature` | Lapis lazuli ore |
| `yellowFlowerFeature` | `FlowerFeature` | Dandelions |
| `roseFlowerFeature` | `FlowerFeature` | Roses |
| `brownMushroomFeature` | `FlowerFeature` | Brown mushrooms |
| `redMushroomFeature` | `FlowerFeature` | Red mushrooms |
| `hugeMushroomFeature` | `HugeMushroomFeature` | Giant mushrooms |
| `reedsFeature` | `ReedsFeature` | Sugar cane |
| `cactusFeature` | `CactusFeature` | Cactus |
| `waterlilyFeature` | `FlowerFeature` | Lily pads |

### Decoration counts

These fields control how many times each feature runs per chunk:

```cpp
int waterlilyCount = 0;
int treeCount = 0;
int flowerCount = 2;
int grassCount = 1;
int deadBushCount = 0;
int mushroomCount = 0;
int reedsCount = 0;
int cactusCount = 0;
int gravelCount = 1;
int sandCount = 3;
int clayCount = 1;
int hugeMushrooms = 0;
bool liquids = true;
```

Biome subclasses (like `DesertBiome`, `ForestBiome`, `JungleBiome`) are `friend` classes of `BiomeDecorator` and can directly change these counts. The full friend list:

- `DesertBiome`
- `ForestBiome`
- `PlainsBiome`
- `SwampBiome`
- `TaigaBiome`
- `MushroomIslandBiome`
- `BeachBiome`
- `JungleBiome`

If you're adding a new biome and want custom decoration counts, add your biome class as a friend in `BiomeDecorator.h`.

### Decoration order

The `decorate()` method runs in this order:

1. **Ores**: `decorateOres()` places dirt, gravel, coal, iron, gold, redstone, diamond, lapis
2. **Sand, clay, gravel**: surface deposits
3. **Trees**: uses `biome->getTreeFeature(random)` for biome-specific trees
4. **Huge mushrooms**: mushroom island biome feature
5. **Flowers**: yellow flowers and roses
6. **Grass**: uses `biome->getGrassFeature(random)`
7. **Dead bushes, waterlilies, mushrooms**
8. **Reeds (sugar cane), pumpkins, cactus**
9. **Liquid springs**: water and lava underground

### Ore generation depths

From `decorateOres()` in `BiomeDecorator.cpp`:

| Ore | Attempts/chunk | Y range | Method |
|---|---|---|---|
| Dirt | 20 | 0 to genDepth | `decorateDepthSpan` |
| Gravel | 10 | 0 to genDepth | `decorateDepthSpan` |
| Coal | 20 | 0 to genDepth | `decorateDepthSpan` |
| Iron | 20 | 0 to genDepth/2 | `decorateDepthSpan` |
| Gold | 2 | 0 to genDepth/4 | `decorateDepthSpan` |
| Redstone | 8 | 0 to genDepth/8 | `decorateDepthSpan` |
| Diamond | 1 | 0 to genDepth/8 | `decorateDepthSpan` |
| Lapis | 1 | centered at genDepth/8 | `decorateDepthAverage` |

To add a new ore, add a new `Feature *` field to `BiomeDecorator`, initialize it in `_init()`, and call it from `decorateOres()`.

### TheEndBiomeDecorator

The End has its own decorator that extends `BiomeDecorator`:

```cpp
class TheEndBiomeDecorator : public BiomeDecorator {
protected:
    Feature *spikeFeature;      // obsidian pillars
    Feature *endPodiumFeature;  // exit portal
    virtual void decorate();

    static SPIKE SpikeValA[8];  // 8 predefined spike positions
};
```

The `SPIKE` struct holds `iChunkX`, `iChunkZ`, `x`, `z`, and `radius` for each obsidian pillar. The 8 spike positions are hardcoded in `SpikeValA`.

## Layer system (biome placement)

The `Layer` class (`Minecraft.World/Layer.h`) is the building block for biome map generation. Layers form a chain where each layer transforms the output of its parent:

```cpp
class Layer {
protected:
    shared_ptr<Layer> parent;

public:
    static LayerArray getDefaultLayers(__int64 seed, LevelType *levelType);

    Layer(__int64 seedMixup);
    virtual void init(__int64 seed);
    virtual void initRandom(__int64 x, __int64 y);
    virtual intArray getArea(int xo, int yo, int w, int h) = 0;

protected:
    int nextRandom(int max);
};
```

### Built-in layers

The layer chain processes biome IDs through a series of transformations:

| Layer | File | Purpose |
|---|---|---|
| `IslandLayer` | `IslandLayer.h` | Seed layer: random land/ocean |
| `FuzzyZoomLayer` | `FuzzyZoomLayer.h` | Fuzzy upscale (adds noise) |
| `ZoomLayer` | `ZoomLayer.h` | Clean 2x upscale |
| `AddIslandLayer` | `AddIslandLayer.h` | Adds land patches to ocean |
| `AddSnowLayer` | `AddSnowLayer.h` | Marks cold regions |
| `AddMushroomIslandLayer` | `AddMushroomIslandLayer.h` | Places mushroom islands |
| `BiomeInitLayer` | `BiomeInitLayer.h` | Assigns actual biome IDs |
| `RegionHillsLayer` | `RegionHillsLayer.h` | Creates hill variants |
| `RiverInitLayer` | `RiverInitLayer.h` | Seeds river generation |
| `RiverLayer` | `RiverLayer.h` | Generates rivers |
| `RiverMixerLayer` | `RiverMixerLayer.h` | Merges rivers with biomes |
| `ShoreLayer` | `ShoreLayer.h` | Adds beach biomes |
| `SwampRiversLayer` | `SwampRiversLayer.h` | Swamp-specific rivers |
| `SmoothLayer` | `SmoothLayer.h` | Smooths biome edges |
| `SmoothZoomLayer` | `SmoothZoomLayer.h` | Smooth upscale |
| `TemperatureLayer` | `TemperatureLayer.h` | Temperature map |
| `TemperatureMixerLayer` | `TemperatureMixerLayer.h` | Merges temperature data |
| `DownfallLayer` | `DownfallLayer.h` | Rainfall/downfall map |
| `DownfallMixerLayer` | `DownfallMixerLayer.h` | Merges rainfall data |
| `BiomeOverrideLayer` | `BiomeOverrideLayer.h` | Console-specific biome overrides |

The static method `Layer::getDefaultLayers()` builds the full chain for a given seed and level type.

### Full layer pipeline

The default layer chain runs roughly like this:

1. `IslandLayer` (seed layer: 10% land, 90% ocean)
2. `FuzzyZoomLayer` (noise upscale)
3. `AddIslandLayer` (add more land)
4. `ZoomLayer` (clean upscale)
5. `AddIslandLayer` (more land)
6. Split into two branches:
   - **Biome branch**: `ZoomLayer` -> `BiomeInitLayer` -> `ZoomLayer` (x2) -> `RegionHillsLayer` -> `ZoomLayer` (x zoomLevel, with `AddIslandLayer`, `AddMushroomIslandLayer`, `GrowMushroomIslandLayer`, `ShoreLayer`, `SwampRiversLayer` inserts) -> `SmoothLayer`
   - **River branch**: `RiverInitLayer` -> `ZoomLayer` (x6) -> `RiverLayer` -> `SmoothLayer`
7. `RiverMixerLayer` (merge biome + river branches)
8. `VoronoiZoom` (final upscale to block resolution)
9. `BiomeOverrideLayer` (console-specific)

Temperature and downfall layers run in parallel and get merged through their respective mixer layers.

### Adding a custom biome layer

To insert a new layer into the chain:

1. Subclass `Layer`:
   ```cpp
   class MyCustomLayer : public Layer {
   public:
       MyCustomLayer(__int64 seed, shared_ptr<Layer> parent)
           : Layer(seed) { this->parent = parent; }

       intArray getArea(int xo, int yo, int w, int h) override {
           intArray parentData = parent->getArea(xo, yo, w, h);
           intArray result;
           result.data = new int[w * h];
           result.length = w * h;

           for (int i = 0; i < w * h; i++) {
               // Transform biome IDs here
               result.data[i] = parentData.data[i];
           }
           return result;
       }
   };
   ```

2. Insert it into the layer chain in `Layer::getDefaultLayers()`.

### Adding a new biome to the layer system

To make a new biome appear in world generation:

1. Define the biome in `Biome.h` with a static pointer and register it in `Biome::staticCtor()`
2. Add the biome ID to `BiomeInitLayer`'s allowed biome list
3. Optionally add hill/shore variants in `RegionHillsLayer` and `ShoreLayer`
4. Add temperature/rainfall properties so the layer system can categorize it

## Structure features

Large structures use a two-class hierarchy:

- `LargeFeature` is the base class for features that span multiple chunks
- `StructureFeature` extends `LargeFeature` with caching and chunk-level decision making

```cpp
class StructureFeature : public LargeFeature {
protected:
    virtual bool isFeatureChunk(int x, int z, bool bIsSuperflat = false) = 0;
    virtual StructureStart *createStructureStart(int x, int z) = 0;
};
```

Built-in structure features:

| Class | Description |
|---|---|
| `StrongholdFeature` | End portal strongholds |
| `VillageFeature` | NPC villages |
| `MineShaftFeature` | Abandoned mineshafts |
| `NetherBridgeFeature` | Nether fortresses |
| `RandomScatteredLargeFeature` | Temples, witch huts |

### Adding a custom structure

To add a new structure feature:

1. **Subclass `StructureFeature`**:

```cpp
class MyStructureFeature : public StructureFeature {
public:
    MyStructureFeature() {}

protected:
    bool isFeatureChunk(int x, int z, bool bIsSuperflat) override {
        // Decide if this chunk should have a structure.
        // Use a spacing grid like villages, or a probability check like mineshafts.
        // Example: 1 in 100 chunks
        return random.nextInt(100) == 0;
    }

    StructureStart *createStructureStart(int x, int z) override {
        return new MyStructureStart(x, z);
    }
};
```

2. **Subclass `StructureStart`**:

```cpp
class MyStructureStart : public StructureStart {
public:
    MyStructureStart(int x, int z) : StructureStart(x, z) {
        // Create the root piece
        MyRootPiece *root = new MyRootPiece(0, x * 16, 64, z * 16);
        pieces.push_back(root);
        root->addChildren(root, &pieces, random);
        calculateBoundingBox();
    }
};
```

3. **Subclass `StructurePiece`** for each room/corridor type. Implement `postProcess()` to place blocks and `addChildren()` to recursively spawn more pieces.

4. **Register it** in `RandomLevelSource`'s constructor and call it during `postProcess()`:

```cpp
// In RandomLevelSource constructor:
myStructure = new MyStructureFeature();

// In RandomLevelSource::postProcess():
myStructure->postProcess(this, chunkX, chunkZ);
```

See the [Structures](/slop-docs/world/structures/) page for details on every built-in structure type, piece weights, and the full `StructurePiece` API.

## Nether generation customization

The Nether uses `HellRandomLevelSource`, which has its own set of features you can modify:

- **Cave carving**: Uses `LargeHellCaveFeature` instead of the Overworld's `LargeCaveFeature`
- **Fortress**: `netherBridgeFeature` is a public member
- **Nether-specific features** used during decoration:
  - `HellFireFeature`: Places fire blocks on netherrack
  - `LightGemFeature`: Generates glowstone clusters hanging from ceilings
  - `HellSpringFeature`: Lava and water springs in nether walls
  - `HellPortalFeature`: Portal frame generation (not used in vanilla)
  - `FlowerFeature`: Brown mushrooms in the nether

To add custom Nether generation, modify `HellRandomLevelSource::postProcess()` or add features to the Hell biome's decorator.

## End generation customization

The End uses `TheEndLevelRandomLevelSource` with `TheEndBiomeDecorator`. Custom features:

- **Obsidian spikes**: `SpikeFeature` with 8 predefined positions in `SpikeValA`
- **Exit portal**: `EndPodiumFeature` at the world origin
- **No ores, no trees, no water**: The End decorator only places spikes and the podium

The `SPIKE` struct defines each pillar:
```cpp
typedef struct {
    int iChunkX;  // chunk X coordinate
    int iChunkZ;  // chunk Z coordinate
    int x;        // block X position
    int z;        // block Z position
    int radius;   // pillar radius
} SPIKE;
```

## Biome-specific decoration overrides

Each biome can customize decoration by being a `friend` of `BiomeDecorator` and directly modifying counts. Here are the patterns used by built-in biomes:

| Biome | Key overrides |
|-------|--------------|
| `DesertBiome` | `deadBushCount = 2`, `cactusCount = 10`, `reedsCount = 50` |
| `ForestBiome` | `treeCount = 10`, `grassCount = 2` |
| `PlainsBiome` | `treeCount = -999` (disabled), `grassCount = 10`, `flowerCount = 4` |
| `SwampBiome` | `treeCount = 2`, `waterlilyCount = 4`, `mushroomCount = 8`, `reedsCount = 10` |
| `TaigaBiome` | `treeCount = 10`, `grassCount = 1` |
| `MushroomIslandBiome` | `hugeMushrooms = 1`, `mushroomCount = 1` |
| `BeachBiome` | defaults (very sparse) |
| `JungleBiome` | `treeCount = 50`, `grassCount = 25`, `flowerCount = 4`, `waterlilyCount` varies |

To customize a biome's tree selection, override `getTreeFeature()`. Different biomes return different features:

- **Forest**: 1/5 chance birch, 1/10 chance fancy oak, otherwise normal oak
- **Taiga**: Alternates between `SpruceFeature` and `PineFeature`
- **Jungle**: Mix of `MegaTreeFeature`, `TreeFeature` with jungle flags, `GroundBushFeature`
- **Swamp**: Always `SwampTreeFeature`
- **Plains**: Default base `getTreeFeature()` (standard oak), though `treeCount = -999` means trees are effectively disabled

## Key source files

- `Minecraft.World/ChunkSource.h` for the abstract chunk generator
- `Minecraft.World/RandomLevelSource.h` / `.cpp` for the overworld terrain generator
- `Minecraft.World/HellRandomLevelSource.h` for the Nether terrain generator
- `Minecraft.World/TheEndLevelRandomLevelSource.h` for the End terrain generator
- `Minecraft.World/FlatLevelSource.h` for superflat generation
- `Minecraft.World/CustomLevelSource.h` for custom heightmap generation
- `Minecraft.World/Feature.h` for the abstract decoration feature
- `Minecraft.World/OreFeature.h` / `.cpp` for ore vein generation
- `Minecraft.World/TreeFeature.h` for standard tree generation
- `Minecraft.World/BasicTree.h` for complex tree generation
- `Minecraft.World/MegaTreeFeature.h` for 2x2 trunk tree generation
- `Minecraft.World/BiomeDecorator.h` / `.cpp` for the decoration orchestrator
- `Minecraft.World/TheEndBiomeDecorator.h` for End-specific decoration
- `Minecraft.World/Layer.h` for the biome layer base class
- `Minecraft.World/Biome.h` for biome definitions
- `Minecraft.World/BiomeSource.h` for biome map caching and lookups
- `Minecraft.World/StructureFeature.h` for the large structure base class
- `Minecraft.World/StructurePiece.h` for the structure piece base class

---
title: Adding Blocks
description: Step-by-step guide to adding new blocks (tiles) to LCE.
---

Blocks in LCE are called **tiles**. Every block in the game (stone, dirt, furnaces, doors, you name it) is either a subclass or direct instance of the `Tile` class defined in `Minecraft.World/Tile.h`. This guide walks you through creating a new tile from scratch, based on how existing tiles work in the source code.

## Overview of the Tile System

The base `Tile` class gives you:

- A **numeric ID** (`int id`) that uniquely identifies the tile in the world
- **Material** (`Material *material`) that controls interaction behavior (flammable, solid, etc.)
- **Properties** like destroy speed, explosion resistance, sound type, and light emission
- **Render shape** constants (`SHAPE_BLOCK`, `SHAPE_CROSS_TEXTURE`, `SHAPE_STAIRS`, etc.)
- **Virtual methods** for behavior: `tick()`, `use()`, `attack()`, `neighborChanged()`, `onPlace()`, `onRemove()`, and more

All tiles are stored in the static array `Tile::tiles[4096]`. The `Tile` constructor automatically registers itself:

```cpp
// From Tile::_init()
Tile::tiles[id] = this;
this->id = id;
```

## Step 1: Create a Tile Subclass

Create two new files in `Minecraft.World/`: a header and an implementation file.

**`MyCustomTile.h`**
```cpp
#pragma once
#include "Tile.h"

class Random;
class Level;
class Player;

class MyCustomTile : public Tile
{
public:
    MyCustomTile(int id);

    // Override behavior as needed
    virtual void tick(Level *level, int x, int y, int z, Random *random);
    virtual bool use(Level *level, int x, int y, int z,
                     shared_ptr<Player> player, int clickedFace,
                     float clickX, float clickY, float clickZ,
                     bool soundOnly = false);
    virtual int getResource(int data, Random *random, int playerBonusLevel);
    virtual int getResourceCount(Random *random);
};
```

**`MyCustomTile.cpp`**
```cpp
#include "stdafx.h"
#include "MyCustomTile.h"
#include "net.minecraft.world.item.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.entity.player.h"

MyCustomTile::MyCustomTile(int id) : Tile(id, Material::stone)
{
    // The Tile constructor calls _init(), which:
    //   - Sets tiles[id] = this
    //   - Defaults: destroySpeed=0, explosionResistance=0
    //   - Sets soundType = SOUND_NORMAL, friction = 0.6
}

void MyCustomTile::tick(Level *level, int x, int y, int z, Random *random)
{
    // Called each tick if setTicking(true) was used during registration.
    // Example: check neighbors, spawn particles, change state, etc.
}

bool MyCustomTile::use(Level *level, int x, int y, int z,
                       shared_ptr<Player> player, int clickedFace,
                       float clickX, float clickY, float clickZ,
                       bool soundOnly)
{
    // Called when the player right-clicks/uses the block.
    // Return true if the interaction was handled.
    return false;
}

int MyCustomTile::getResource(int data, Random *random, int playerBonusLevel)
{
    // What item ID drops when the block is mined.
    // Return the tile's own ID to drop itself.
    return id;
}

int MyCustomTile::getResourceCount(Random *random)
{
    // How many items drop. Default is 1.
    return 1;
}
```

The `Tile` constructor takes up to three parameters:

```cpp
Tile(int id, Material *material, bool isSolidRender = true);
```

The third parameter `isSolidRender` controls whether the block counts as opaque for lighting and rendering. Set it to `false` for transparent or non-full blocks (like glass or fences).

## Step 2: Choose a Material

The `Material` class determines the fundamental behavior of a block. Here are the available materials from `Material.h`:

| Material | Class | Properties | Description |
|----------|-------|------------|-------------|
| `Material::air` | `GasMaterial` | gas (non-solid, non-blocking) | Empty space |
| `Material::grass` | `Material` | (default) | Grass blocks |
| `Material::dirt` | `Material` | (default) | Dirt, gravel |
| `Material::wood` | `Material` | flammable | Wooden blocks |
| `Material::stone` | `Material` | notAlwaysDestroyable | Stone, ores, bricks |
| `Material::metal` | `Material` | notAlwaysDestroyable | Iron/gold/diamond blocks |
| `Material::heavyMetal` | `Material` | notAlwaysDestroyable, notPushable | Anvils, enchanting tables |
| `Material::water` | `LiquidMaterial` | destroyOnPush | Water |
| `Material::lava` | `LiquidMaterial` | destroyOnPush | Lava |
| `Material::leaves` | `Material` | flammable, neverBuildable, destroyOnPush | Leaf blocks |
| `Material::plant` | `DecorationMaterial` | destroyOnPush | Flowers, saplings |
| `Material::replaceable_plant` | `DecorationMaterial` | flammable, destroyOnPush, replaceable | Tall grass, vines |
| `Material::sponge` | `Material` | (default) | Sponge |
| `Material::cloth` | `Material` | flammable | Wool, carpet |
| `Material::fire` | `GasMaterial` | destroyOnPush | Fire |
| `Material::sand` | `Material` | (default) | Sand, soul sand |
| `Material::decoration` | `DecorationMaterial` | destroyOnPush | Redstone dust, rails, levers |
| `Material::clothDecoration` | `DecorationMaterial` | flammable | Carpet-like decorations |
| `Material::glass` | `Material` | neverBuildable, destroyedByHand | Glass blocks |
| `Material::buildable_glass` | `Material` | destroyedByHand | Beacon, daylight sensor |
| `Material::explosive` | `Material` | flammable, neverBuildable | TNT |
| `Material::coral` | `Material` | destroyOnPush | Coral blocks |
| `Material::ice` | `Material` | neverBuildable, destroyedByHand | Ice |
| `Material::topSnow` | `DecorationMaterial` | replaceable, neverBuildable, notAlwaysDestroyable, destroyOnPush | Snow layer |
| `Material::snow` | `Material` | notAlwaysDestroyable | Snow block |
| `Material::cactus` | `Material` | neverBuildable, destroyOnPush | Cactus |
| `Material::clay` | `Material` | (default) | Clay blocks |
| `Material::vegetable` | `Material` | destroyOnPush | Pumpkins, melons |
| `Material::egg` | `Material` | destroyOnPush | Dragon egg |
| `Material::portal` | `PortalMaterial` | notPushable | Portal blocks |
| `Material::cake` | `Material` | destroyOnPush | Cake |
| `Material::web` | `WebMaterial` | notAlwaysDestroyable, destroyOnPush | Cobwebs (4J uses WebMaterial subclass) |
| `Material::piston` | `Material` | notPushable | Piston heads/extensions |

Pass the material to the `Tile` constructor:

```cpp
MyCustomTile::MyCustomTile(int id) : Tile(id, Material::stone)
```

## Step 3: Register in Tile::staticCtor()

Open `Minecraft.World/Tile.cpp` and add your registration inside `Tile::staticCtor()`. You'll also need a static pointer declaration in `Tile.h`.

**In `Tile.h`**, add a forward declaration and static pointer:

```cpp
// Forward declaration near the top of Tile.h
class MyCustomTile;

// Inside the Tile class, with the other static tile pointers
static MyCustomTile *myCustomTile;
```

**In `Tile.cpp`**, add the static definition and registration:

```cpp
// Static definition (near the other static Tile* definitions)
MyCustomTile *Tile::myCustomTile = NULL;

// Inside Tile::staticCtor(), add with the other registrations:
Tile::myCustomTile = (MyCustomTile *)(new MyCustomTile(160))
    ->setDestroyTime(3.0f)
    ->setExplodeable(10)
    ->setSoundType(Tile::SOUND_STONE)
    ->setTextureName(L"myCustomTile")
    ->setDescriptionId(IDS_TILE_MY_CUSTOM)
    ->setUseDescriptionId(IDS_DESC_MY_CUSTOM);
```

Pick an unused ID. See [Getting Started](/slop-docs/modding/getting-started/) for help finding available IDs.

## Step 4: Add to the Umbrella Header

Open `Minecraft.World/net.minecraft.world.level.tile.h` and add your new header:

```cpp
#include "MyCustomTile.h"
```

This lets any `.cpp` file that includes the tile umbrella see your class. `Tile.cpp` already includes this umbrella, so it will find your header through it. If you skip this step, you will get "no such file or directory" errors.

## Step 5: Add to Sources.cmake

Open `cmake/Sources.cmake` and add your `.cpp` file to the `MINECRAFT_WORLD_SOURCES` list:

```cmake
"MyCustomTile.cpp"
```

Only `.cpp` files go here, not headers. CMake prepends the `Minecraft.World/` directory automatically. After changing this file, re-run CMake:

```bash
cd build
cmake ..
```

## Step 6: Set Properties

All property setters return `Tile*`, so you can chain them together in the builder pattern. Here's what's available:

### Destroy Time and Resistance

```cpp
->setDestroyTime(3.0f)      // How long to mine (seconds-ish). 0 = instant break.
->setExplodeable(10)         // Explosion resistance. Higher = more resistant.
->setIndestructible()        // Cannot be broken (like bedrock, uses -1.0f internally)
```

Real examples from the source:
- Dirt: `setDestroyTime(0.5f)`
- Stone: `setDestroyTime(1.5f)`, `setExplodeable(10)`
- Obsidian: `setDestroyTime(50.0f)`, `setExplodeable(2000)`
- Bedrock: `setIndestructible()`, `setExplodeable(6000000)`

### Sound Type

```cpp
->setSoundType(Tile::SOUND_STONE)
```

Available sound types:

| Constant | Used For |
|----------|----------|
| `SOUND_NORMAL` | Default / redstone dust |
| `SOUND_WOOD` | Wood, torches, fire |
| `SOUND_GRAVEL` | Gravel, dirt, farmland |
| `SOUND_GRASS` | Grass, leaves, flowers, TNT |
| `SOUND_STONE` | Stone, ores, bricks |
| `SOUND_METAL` | Iron/gold/diamond blocks, rails |
| `SOUND_GLASS` | Glass, ice, portals |
| `SOUND_CLOTH` | Wool, carpet, snow, cactus |
| `SOUND_SAND` | Sand, soul sand |
| `SOUND_SNOW` | Snow |
| `SOUND_LADDER` | Ladders |
| `SOUND_ANVIL` | Anvils |

### Light

```cpp
->setLightEmission(15 / 16.0f)  // How much light the block emits (0.0 to 1.0)
->setLightBlock(3)               // How much light the block absorbs (0-255)
```

Real examples:
- Torch: `setLightEmission(15 / 16.0f)`
- Glowstone: `setLightEmission(1.0f)`
- Lava: `setLightEmission(1.0f)`, `setLightBlock(255)`
- Water: `setLightBlock(3)`
- Leaves: `setLightBlock(1)`

### Render Shape

Override `getRenderShape()` in your subclass to return one of the `SHAPE_*` constants:

```cpp
int MyCustomTile::getRenderShape()
{
    return Tile::SHAPE_BLOCK;  // Standard full cube
}
```

Key shape constants defined in `Tile.h`:

| Constant | Value | Used For |
|----------|-------|----------|
| `SHAPE_INVISIBLE` | -1 | Air, moving pistons |
| `SHAPE_BLOCK` | 0 | Standard full cube |
| `SHAPE_CROSS_TEXTURE` | 1 | Flowers, saplings, tall grass |
| `SHAPE_TORCH` | 2 | Torches |
| `SHAPE_FIRE` | 3 | Fire |
| `SHAPE_WATER` | 4 | Water/lava |
| `SHAPE_DOOR` | 7 | Doors |
| `SHAPE_STAIRS` | 10 | Stairs |
| `SHAPE_FENCE` | 11 | Fences |
| `SHAPE_CACTUS` | 13 | Cactus |
| `SHAPE_BED` | 14 | Beds |

### Other Properties

```cpp
->setTicking(true)           // Enable tick() updates for this tile
->setNotCollectStatistics()  // Exclude from statistics tracking
->sendTileData()             // Send data bits to clients (for blocks with aux data)
->disableMipmap()            // Disable texture mipmapping (used for cross-texture plants)
->setBaseItemTypeAndMaterial(Item::eBaseItemType_block, Item::eMaterial_stone)
                             // Set creative inventory category
```

### Collision Shape

Override `setShape()` to define a non-full bounding box:

```cpp
// In your constructor or updateDefaultShape():
setShape(0.0f, 0.0f, 0.0f, 1.0f, 0.5f, 1.0f);  // Half-slab height
```

The six parameters are: `x0, y0, z0, x1, y1, z1` (in block-space, 0.0 to 1.0).

## Step 7: Add Behavior

### Tick Updates

If you called `setTicking(true)` during registration, the `tick()` method will be called periodically:

```cpp
void MyCustomTile::tick(Level *level, int x, int y, int z, Random *random)
{
    // Check conditions, modify neighbors, etc.
}
```

### Player Interaction (Right-Click)

Override `use()` to handle right-click interactions:

```cpp
bool MyCustomTile::use(Level *level, int x, int y, int z,
                       shared_ptr<Player> player, int clickedFace,
                       float clickX, float clickY, float clickZ,
                       bool soundOnly)
{
    // Open a GUI, toggle state, etc.
    // Return true if the interaction was consumed.
    return true;
}
```

Note: the `soundOnly` parameter is a 4J addition. When true, the game only wants you to play the interaction sound without actually doing anything. Check this flag if your `use()` has side effects.

### Player Attack (Left-Click)

Override `attack()` for left-click behavior:

```cpp
void MyCustomTile::attack(Level *level, int x, int y, int z,
                          shared_ptr<Player> player)
{
    // Handle left-click (e.g., note blocks play sound on attack)
}
```

### Block Drops

Control what drops when the block is mined:

```cpp
int MyCustomTile::getResource(int data, Random *random, int playerBonusLevel)
{
    // Return the item ID to drop.
    // Return the tile ID itself to drop the block:
    return id;
    // Or return a different item, like OreTile does:
    // if (id == Tile::coalOre_Id) return Item::coal_Id;
}

int MyCustomTile::getResourceCount(Random *random)
{
    // How many items drop. Can use random for variable drops.
    return 1;
}
```

For blocks that also drop XP, override `spawnResources()`:

```cpp
void MyCustomTile::spawnResources(Level *level, int x, int y, int z,
                                   int data, float odds, int playerBonus)
{
    Tile::spawnResources(level, x, y, z, data, odds, playerBonus);
    int xpAmount = Mth::nextInt(level->random, 2, 5);
    popExperience(level, x, y, z, xpAmount);
}
```

### Neighbor Updates

React when an adjacent block changes:

```cpp
void MyCustomTile::neighborChanged(Level *level, int x, int y, int z, int type)
{
    // 'type' is the ID of the neighboring tile that changed.
    // Used by redstone, rails, torches, etc.
}
```

### Placement and Removal

```cpp
void MyCustomTile::onPlace(Level *level, int x, int y, int z)
{
    // Called when the block is placed in the world.
}

void MyCustomTile::onRemove(Level *level, int x, int y, int z, int id, int data)
{
    // Called when the block is removed from the world.
    // 'id' and 'data' are what the block was before removal.
}
```

### Entity Stepping

Override `stepOn()` to react when an entity walks on the block:

```cpp
void MyCustomTile::stepOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity)
{
    // E.g., FarmTile converts to dirt when stomped on
}
```

### Placement Data

Override `getPlacedOnFaceDataValue()` to set metadata based on how the block was placed:

```cpp
int MyCustomTile::getPlacedOnFaceDataValue(Level *level, int x, int y, int z,
                                            int face, float clickX, float clickY,
                                            float clickZ, int itemValue)
{
    // 'face' is which face of the adjacent block was clicked
    // Return the data value for the placed block
    return 0;
}
```

### Placed-By Context

Override `setPlacedBy()` to get the entity that placed the block:

```cpp
void MyCustomTile::setPlacedBy(Level *level, int x, int y, int z, shared_ptr<Mob> by)
{
    // Used by pistons, skulls, etc. to set facing based on player direction
}
```

## Step 8: Add the TileItem

For tiles with IDs 0 through 255, the end of `Tile::staticCtor()` automatically creates a `TileItem` for any tile that doesn't already have a custom item:

```cpp
for (int i = 0; i < 256; i++)
{
    if (Tile::tiles[i] != NULL && Item::items[i] == NULL)
    {
        Item::items[i] = new TileItem(i - 256);
        Tile::tiles[i]->init();
    }
}
```

If your tile needs special item behavior (multiple sub-types, custom icons, colored variants), register a custom `TileItem` subclass before this loop runs. The codebase has plenty of examples:

```cpp
// Wool has colored variants
Item::items[Tile::cloth_Id] = ( new ClothTileItem(Tile::cloth_Id - 256) )
    ->setTextureName(L"cloth")
    ->setDescriptionId(IDS_TILE_CLOTH);

// Logs have tree-type variants
Item::items[Tile::treeTrunk_Id] = ( new TreeTileItem(Tile::treeTrunk_Id - 256, treeTrunk) )
    ->setTextureName(L"log")
    ->setDescriptionId(IDS_TILE_LOG);

// Slabs need special stacking behavior
Item::items[Tile::stoneSlabHalf_Id] = ( new StoneSlabTileItem(
    Tile::stoneSlabHalf_Id - 256,
    Tile::stoneSlabHalf, Tile::stoneSlab, false) )
    ->setTextureName(L"stoneSlab")
    ->setDescriptionId(IDS_TILE_STONESLAB);
```

## Step 9: Creative Inventory

To make your tile show up in the creative inventory, set its base item type and material during registration:

```cpp
->setBaseItemTypeAndMaterial(Item::eBaseItemType_block, Item::eMaterial_stone)
```

The `eBaseItemType` enum controls which tab the item appears on, and `eMaterial` controls sorting within that tab. Here are the common base item types:

| Type | Usage |
|------|-------|
| `eBaseItemType_block` | Solid decorative blocks |
| `eBaseItemType_structblock` | Structural blocks (bricks, nether brick) |
| `eBaseItemType_structwoodstuff` | Wooden planks |
| `eBaseItemType_stairs` | Stair blocks |
| `eBaseItemType_slab` / `eBaseItemType_halfslab` | Slab blocks |
| `eBaseItemType_fence` | Fences and walls |
| `eBaseItemType_door` | Doors and trapdoors |
| `eBaseItemType_torch` | Torches and light sources |
| `eBaseItemType_device` | Functional blocks (furnace, workbench, enchanting table) |
| `eBaseItemType_rail` | Rail blocks |
| `eBaseItemType_button` | Buttons |
| `eBaseItemType_pressureplate` | Pressure plates |
| `eBaseItemType_piston` | Pistons |
| `eBaseItemType_chest` | Chests |

---

## Block type recipes

Below are guides for every major type of block you can add. Each one builds on the basic tile pattern from above.

### Transparent blocks (TransparentTile)

For blocks like glass, ice, or portals that let you see through them.

```cpp
#include "TransparentTile.h"

class MyGlassTile : public TransparentTile
{
public:
    MyGlassTile(int id)
        : TransparentTile(id, Material::glass, false)
        //                     ^material        ^allowSame
    {
    }
};
```

`TransparentTile` extends `Tile` and gives you:

- `allowSame` flag: When false, adjacent faces between two of the same block are hidden (like glass panes not rendering where they touch). When true, all faces render
- `blocksLight()`: Returns false by default
- `isSolidRender()`: Returns false
- `shouldRenderFace()`: Checks the `allowSame` flag to decide

The constructor's third parameter is `isSolidRender`, which defaults to `false`. The `allowSame` flag is passed as the third argument to the `TransparentTile` constructor (not the `Tile` one).

### Overlay transparent blocks (HalfTransparentTile)

For blocks with an overlay texture on top of a base texture (like stained glass or colored ice).

```cpp
#include "HalfTransparentTile.h"

class MyOverlayTile : public HalfTransparentTile
{
public:
    MyOverlayTile(int id)
        : HalfTransparentTile(id, L"myOverlayTexture", Material::glass, false)
        //                        ^overlay texture      ^material       ^allowSame
    {
    }
};
```

`HalfTransparentTile` is a separate class from `TransparentTile`. Both extend `Tile` directly. The difference is the overlay `texture` field (a `wstring`) that gets registered through `registerIcons()`. `ChunkRebuildData` is a friend class so it can access the overlay texture during rendering.

### Blocks with persistent data (EntityTile)

For blocks that need to store data beyond the 4-bit metadata, like chests, furnaces, or signs.

```cpp
#include "EntityTile.h"
#include "TileEntity.h"

class MyStorageTile : public EntityTile
{
public:
    MyStorageTile(int id)
        : EntityTile(id, Material::wood)
    {
    }

    // Required: create the TileEntity that holds your data
    virtual shared_ptr<TileEntity> newTileEntity(Level *level)
    {
        return make_shared<MyStorageTileEntity>();
    }
};
```

`EntityTile` extends `Tile` and adds:

- `newTileEntity(Level *)`: Pure virtual. You must return a `shared_ptr<TileEntity>`. This is called when the block is placed
- `onPlace()`: Automatically registers the TileEntity with the level
- `onRemove()`: Automatically unregisters the TileEntity
- `triggerEvent()`: Forwards block events to the TileEntity

Your `TileEntity` subclass must implement `clone()` (a pure virtual added by 4J). It also gets `load()` and `save()` for NBT serialization, and optionally `tick()` for per-tick updates.

The `TileEntity` has a `RenderRemoveStage` enum (4J addition) for managing render state:
- `e_RenderRemoveStageKeep`: Normal state
- `e_RenderRemoveStageFlaggedAtChunk`: Marked for removal at chunk level
- `e_RenderRemoveStageRemove`: Ready to be removed from render

### Gravity-affected blocks (HeavyTile)

For blocks that fall when unsupported, like sand and gravel.

```cpp
#include "HeavyTile.h"

class MyFallingTile : public HeavyTile
{
public:
    MyFallingTile(int id)
        : HeavyTile(id)  // uses Material::sand by default
    {
    }

    // Optional: do something when the block lands
    virtual void onLand(Level *level, int xt, int yt, int zt, int data)
    {
        // e.g., anvils deal damage, concrete powder checks for water
    }

    // Optional: do something while falling
    virtual void falling(shared_ptr<FallingTile> entity)
    {
        // Modify the falling entity (e.g., set damage values)
    }
};
```

`HeavyTile` extends `Tile` and provides:

- `instaFall`: A static bool. When true, blocks fall instantly instead of spawning a `FallingTile` entity (used during world generation)
- `checkSlide()`: Called from `onPlace()` and `neighborChanged()`. Checks if the space below is free and starts the fall
- `isFree()`: Static method that checks if a position can be fallen through
- `getTickDelay()`: Override this to control how fast the block starts falling after being unsupported
- Two constructor overloads: one takes just an ID (defaults to `Material::sand`), the other takes an ID and explicit `Material`

### Plant blocks (Bush)

For blocks that sit on top of other blocks and break when unsupported, like flowers, saplings, and tall grass.

```cpp
#include "Bush.h"

class MyPlantTile : public Bush
{
public:
    MyPlantTile(int id)
        : Bush(id)  // uses Material::plant by default
    {
    }

    // Optional: control what blocks this can be placed on
    virtual bool mayPlaceOn(int tile)
    {
        // Default only allows grass and dirt
        return tile == Tile::grass_Id || tile == Tile::dirt_Id;
    }
};
```

`Bush` extends `Tile` and gives you:

- `mayPlaceOn(tile)`: Virtual method for controlling valid support blocks. Default is grass/dirt
- `mayPlace(level, x, y, z)`: Checks `mayPlaceOn()` for the block below
- `canSurvive(level, x, y, z)`: Similar to `mayPlace` but used for ongoing checks
- `checkAlive()`: Called from `neighborChanged()` and `tick()`. Drops the block if `canSurvive()` fails
- `neighborChanged()`: Calls `checkAlive()` automatically
- `getRenderShape()`: Returns `SHAPE_CROSS_TEXTURE` by default
- `getAABB()`: Returns null (no collision box)
- `isSolidRender()`: Returns false
- `isCubeShaped()`: Returns false
- `blocksLight()`: Returns false

### Crop blocks (CropTile)

For blocks that grow through stages, like wheat, carrots, and potatoes.

```cpp
#include "CropTile.h"

class MyCustomCrop : public CropTile
{
public:
    MyCustomCrop(int id) : CropTile(id) {}

    // What seed item drops
    virtual int getBaseSeedId() { return Item::mySeeds_Id; }

    // What the grown plant drops
    virtual int getBasePlantId() { return Item::myHarvest_Id; }
};
```

`CropTile` extends `Bush` and adds:

- `tick()`: Handles growth. Each tick has a chance to advance the growth stage based on `getGrowthSpeed()`
- `getGrowthSpeed()`: Calculates growth rate based on farmland below, nearby water, and light level
- `growCropsToMax()`: Instantly sets the crop to full growth (used by bone meal)
- `getBaseSeedId()` / `getBasePlantId()`: Virtual methods controlling drops
- `spawnResources()`: Drops seeds at any stage, plus the plant item only at full growth
- `mayPlaceOn()`: Only allows farmland
- `getRenderShape()`: Returns `SHAPE_CROSS_TEXTURE`

Crop data values 0-7 represent growth stages, with 7 being fully grown.

### Directional blocks (DirectionalTile)

For blocks that face a direction, like beds, pumpkins, fence gates, and repeaters.

```cpp
#include "DirectionalTile.h"

class MyDirectionalTile : public DirectionalTile
{
public:
    MyDirectionalTile(int id)
        : DirectionalTile(id, Material::wood)
    {
    }
};
```

`DirectionalTile` extends `Tile` and provides:

- `DIRECTION_MASK = 0x3`: Bottom 2 bits of metadata store the direction (0-3)
- `DIRECTION_INV_MASK = 0xC`: Upper 2 bits, available for other data
- `getDirection(data)`: Static method to extract the direction from metadata

Blocks that use `DirectionalTile` include `BedTile`, `PumpkinTile`, `FenceGateTile`, `DiodeTile` (repeaters), and `CocoaTile`. You'll typically set the direction in `setPlacedBy()` based on the player's facing.

### Stair blocks (StairTile)

Stairs delegate almost everything to a base tile. This is an unusual pattern where the stair block wraps another block.

```cpp
#include "StairTile.h"

// In Tile::staticCtor():
Tile::myStairs = (new StairTile(161, Tile::myBaseTile, 0))
    ->setDestroyTime(2.0f)
    ->setSoundType(Tile::SOUND_STONE);
```

`StairTile` extends `Tile` and stores a pointer to a `base` tile and `basedata`. Nearly every method delegates to the base tile:

- `getTexture()`, `getLightColor()`, `getBrightness()`, `getExplosionResistance()`, `getRenderLayer()`, `getTickDelay()` all call the base tile's version
- `animateTick()`, `attack()`, `destroy()`, `handleEntityInside()`, `onPlace()`, `onRemove()`, `stepOn()`, `tick()`, `use()`, `wasExploded()`, `setPlacedBy()` all delegate too
- The stair handles its own shape calculation through `setBaseShape()`, `setStepShape()`, and `setInnerPieceShape()`

Key constants:
- `UPSIDEDOWN_BIT = 4`: When set in metadata, the stair is upside-down
- `DIR_EAST = 0`, `DIR_WEST = 1`, `DIR_SOUTH = 2`, `DIR_NORTH = 3`
- `DEAD_SPACES[8][2]`: Array controlling which parts of the stair shape are "dead" (cut away)

`Tile` is a friend class of `StairTile`.

### Slab blocks (HalfSlabTile)

Slabs have a special half/full system where two half-slabs combine into a full block.

```cpp
#include "HalfSlabTile.h"

class MySlabTile : public HalfSlabTile
{
public:
    MySlabTile(int id, bool fullSize)
        : HalfSlabTile(id, fullSize, Material::stone)
    {
    }

    // Required: return the name for each sub-type
    virtual int getAuxName(int auxValue) { return IDS_TILE_MYSLAB; }
};
```

`HalfSlabTile` extends `Tile` and provides:

- `TYPE_MASK = 7`: Bottom 3 bits store the slab variant (up to 8 types)
- `TOP_SLOT_BIT = 8`: When set, the slab is in the top half of the block
- `fullSize`: When true, this is the double-slab variant
- `getAuxName()`: Pure virtual. Returns a string ID for each sub-type
- `getPlacedOnFaceDataValue()`: Sets `TOP_SLOT_BIT` when placed on the underside of a block
- `getSpawnResourcesAuxValue()`: Strips the `TOP_SLOT_BIT` for drops
- `isHalfSlab()`: Static method to check if a tile ID is a slab

You need to register two tiles: the half slab and the full slab. Then register a `StoneSlabTileItem` (or similar) that handles combining halves.

### Liquid blocks (LiquidTile)

For blocks that flow, like water and lava. This is a complex system with two subclasses.

```cpp
#include "LiquidTileDynamic.h"
#include "LiquidTileStatic.h"
```

`LiquidTile` extends `Tile` and provides the base for all liquid behavior:

- `getFlow()`: Calculates flow direction as a `Vec3`
- `getDepth()` / `getRenderedDepth()`: Liquid depth from metadata
- `getHeight()`: Static method converting data to rendered height
- `getSlopeAngle()`: Static method for the visual slope
- `fizz()`: Plays the steam sound when lava meets water
- `handleEntityInside()`: Pushes entities based on flow direction
- `getTickDelay()`: Water ticks every 5, lava every 30 (in the Overworld)

The liquid system has two concrete classes:

**`LiquidTileDynamic`**: Active, flowing liquid. Handles spread logic:
- `trySpreadTo()`: Tries to flow into an adjacent block
- `getSlopeDistance()` / `getSpread()`: Pathfinding for flow direction
- `canSpreadTo()` / `isWaterBlocking()`: Checks if flow is blocked
- `setStatic()`: Converts to `LiquidTileStatic` when flow stabilizes
- 4J addition: `iterativeTick()` with a `deque<LiquidTickData>` for iterative processing instead of recursive

**`LiquidTileStatic`**: Stable liquid at rest:
- `setDynamic()`: Converts back to `LiquidTileDynamic` when disturbed
- `isFlammable()`: Checks if lava should ignite nearby blocks

### Redstone blocks (RedStoneDustTile)

For blocks that carry redstone signals.

```cpp
#include "RedStoneDustTile.h"
```

`RedStoneDustTile` extends `Tile` directly and provides:

- `shouldSignal` flag: Temporarily disabled during power calculation to prevent feedback loops
- `toUpdate` set: `unordered_set<TilePos>` tracking positions that need power recalculation
- `updatePowerStrength()`: Two overloads. Propagates signal strength through the wire network
- `checkCornerChangeAt()`: Handles vertical wire connections around block corners
- `getSignal()` / `getDirectSignal()`: Returns signal strength for a given face
- `isSignalSource()`: Returns true (this block is a signal source)
- `shouldConnectTo()` / `shouldReceivePowerFrom()`: Static methods for determining wire connections

Redstone connections use 4 texture variants: `TEXTURE_CROSS`, `TEXTURE_LINE`, `TEXTURE_CROSS_OVERLAY`, `TEXTURE_LINE_OVERLAY`.

### Piston blocks (PistonBaseTile)

Pistons are among the most complex blocks in the game.

```cpp
#include "PistonBaseTile.h"
```

`PistonBaseTile` extends `Tile` and has:

- `MAX_PUSH_DEPTH = 12`: Maximum number of blocks a piston can push
- `EXTENDED_BIT = 8`: Metadata flag for extended state
- `isSticky`: Whether this is a sticky piston
- `ignoreUpdate()`: Thread-local static (TLS) to prevent recursive neighbor updates
- `checkIfExtend()`: Checks if the piston should extend based on redstone signals
- `getNeighborSignal()`: Checks all faces except the piston face for signals
- `canPush()`: Static method checking if the block chain can be pushed
- `isPushable()`: Static method checking if a single block can be pushed
- `createPush()`: Executes the push, moving up to 12 blocks
- `stopSharingIfServer()`: 4J addition for multiplayer block sharing
- `TRIGGER_EXTEND = 0`, `TRIGGER_CONTRACT = 1`: Block event types
- `getFacing()` / `isExtended()`: Static helpers for reading metadata
- `getNewFacing()`: Static method to calculate facing from player position

### Redstone torch blocks (NotGateTile)

The redstone torch has burnout prevention logic.

Key details from the source:
- `Toggle` inner class stores position + game time of each toggle
- `recentToggles`: Static map tracking recent toggles per position
- `RECENT_TOGGLE_TIMER = 60`: Ticks before a toggle record expires
- `MAX_RECENT_TOGGLES = 8`: Maximum toggles before burnout

### Tripwire blocks (TripWireSourceTile)

- `WIRE_DIST_MAX = 42`: Maximum tripwire length in blocks
- Uses bitmask constants: `MASK_DIR`, `MASK_ATTACHED`, `MASK_POWERED`
- `calculateState()`: Scans the wire in both directions to update state

### Rail blocks (RailTile)

Rails have an inner `Rail` class that manages connections between rail segments:

- `RAIL_DATA_BIT = 8`: Powered rail activation bit
- `RAIL_DIRECTION_MASK = 7`: Bottom 3 bits store rail shape (straight, curve, slope)
- The inner `Rail` class handles connection logic, checking neighbor rails and updating shapes

---

## Complete Example: Adding a Ruby Ore

Here's a full walkthrough based on the existing `OreTile` pattern.

**`RubyOreTile.h`**
```cpp
#pragma once
#include "Tile.h"

class Random;

class RubyOreTile : public Tile
{
public:
    RubyOreTile(int id);
    virtual int getResource(int data, Random *random, int playerBonusLevel);
    virtual int getResourceCount(Random *random);
    virtual void spawnResources(Level *level, int x, int y, int z,
                                int data, float odds, int playerBonusLevel);
};
```

**`RubyOreTile.cpp`**
```cpp
#include "stdafx.h"
#include "RubyOreTile.h"
#include "net.minecraft.world.item.h"
#include "net.minecraft.world.level.h"

RubyOreTile::RubyOreTile(int id) : Tile(id, Material::stone)
{
}

int RubyOreTile::getResource(int data, Random *random, int playerBonusLevel)
{
    // Drop your custom ruby item (assuming you registered it)
    return Item::ruby_Id;  // You would define this in Item.h
}

int RubyOreTile::getResourceCount(Random *random)
{
    return 1;
}

void RubyOreTile::spawnResources(Level *level, int x, int y, int z,
                                  int data, float odds, int playerBonusLevel)
{
    Tile::spawnResources(level, x, y, z, data, odds, playerBonusLevel);
    // Drop experience orbs
    int xpAmount = Mth::nextInt(level->random, 2, 5);
    popExperience(level, x, y, z, xpAmount);
}
```

**Registration in `Tile.h`:**
```cpp
class RubyOreTile;
// ...
static Tile *rubyOre;
static const int rubyOre_Id = 160;  // Pick an unused ID
```

**Registration in `Tile.cpp`:**
```cpp
Tile *Tile::rubyOre = NULL;

// Inside Tile::staticCtor():
Tile::rubyOre = (new RubyOreTile(160))
    ->setDestroyTime(3.0f)
    ->setExplodeable(5)
    ->setSoundType(Tile::SOUND_STONE)
    ->setTextureName(L"oreRuby")
    ->setDescriptionId(IDS_TILE_RUBY_ORE)
    ->setUseDescriptionId(IDS_DESC_RUBY_ORE);
```

**Add to the umbrella header (`net.minecraft.world.level.tile.h`):**
```cpp
#include "RubyOreTile.h"
```

**Add to `cmake/Sources.cmake`** (only the `.cpp` file, not the header):
```cmake
"RubyOreTile.cpp"
```

Re-run CMake, rebuild, and the block will be available in-game.

## Related Guides

- [Getting Started](/slop-docs/modding/getting-started/) for environment setup and the staticCtor pattern
- [Adding Items](/slop-docs/modding/adding-items/) to create matching items for your blocks
- [Blocks Reference](/slop-docs/world/blocks/) for the full Tile class documentation
- [Custom World Generation](/slop-docs/modding/custom-worldgen/) to make your blocks generate in the world

---
title: Getting Started with Modding
description: The definitive guide to setting up and making changes to the LCE codebase.
---

This is the complete guide to modding the LCE codebase. It covers how the registration systems work, how to add new blocks, items, entities, recipes, and more. Before you start, make sure you can build the project by following the [Building & Compiling](/slop-docs/overview/building/) guide.

## Prerequisites

- **CMake** 3.10+
- **MSVC** (Visual Studio 2022 recommended)
- **C++11** (set via `CMAKE_CXX_STANDARD 11` in the CMakeLists.txt)
- A working LCE build (see [Building & Compiling](/slop-docs/overview/building/))
- Basic C++ knowledge (inheritance, pointers, `shared_ptr`)

## Project Structure

```
LCEMP/
├── CMakeLists.txt              # Build system root
├── cmake/
│   └── Sources.cmake           # File lists for both targets
├── Minecraft.World/            # Static library (game logic)
│   ├── Tile.h / Tile.cpp       # Block (tile) base class + registration
│   ├── Item.h / Item.cpp       # Item base class + registration
│   ├── Entity.h                # Base entity class
│   ├── Mob.h                   # Living entity base (AI, pathfinding)
│   ├── Recipes.h / Recipes.cpp # Crafting recipe system
│   ├── FurnaceRecipes.cpp      # Smelting recipes
│   ├── Enchantment.h/.cpp      # Enchantment registration
│   ├── Biome.h / Biome.cpp     # Biome registration
│   ├── EntityIO.cpp            # Entity type registry
│   ├── TileEntity.cpp          # Tile entity type registry
│   ├── Minecraft.World.cpp     # Static constructor call order
│   ├── OreTile.h/.cpp          # Example: Tile subclass (ores)
│   ├── FoodItem.h/.cpp         # Example: Item subclass (food)
│   ├── WeaponItem.h/.cpp       # Example: Item subclass (swords)
│   ├── ArmorItem.h/.cpp        # Example: Item subclass (armor)
│   ├── Creeper.h/.cpp          # Example: Entity subclass
│   └── ...                     # ~700 more source files
├── Minecraft.Client/           # Win32 executable (rendering, UI)
│   ├── EntityRenderDispatcher  # Maps entity types to renderers
│   ├── TileRenderer            # Block rendering
│   └── ...                     # ~450 more source files
└── Common/                     # Shared utilities (inside Client/)
```

**MinecraftWorld** is a static library that holds all game logic: tiles, items, entities, levels, networking, and more. **MinecraftClient** is the executable that handles rendering, input, and the UI, and it links against MinecraftWorld.

## Where to Add New Code

All game content (blocks, items, entities) lives in the `Minecraft.World/` directory. When you add new files:

1. Create your `.h` and `.cpp` files in `Minecraft.World/`
2. Add the `.cpp` file to `cmake/Sources.cmake` (see below)
3. Add your `.h` file to the right umbrella header (see below)
4. Include the right umbrella headers in your `.cpp`

If your mod needs rendering changes (new entity renderer, new block render shape, new particle), you will also need files in `Minecraft.Client/`. Add those to `MINECRAFT_CLIENT_SOURCES` in `Sources.cmake`.

### Adding Files to Sources.cmake

This is the part most people trip on. Open `cmake/Sources.cmake` and you'll see two big lists: `MINECRAFT_WORLD_SOURCES` and `MINECRAFT_CLIENT_SOURCES`. Only `.cpp` files go here, not headers. Each entry is a quoted relative path, one per line:

```cmake
set(MINECRAFT_WORLD_SOURCES
        "AABB.cpp"
        "Abilities.cpp"
        "AbstractContainerMenu.cpp"
        # ... hundreds more ...
        "MyCustomTile.cpp"          # <-- add yours here
)
```

The list is roughly alphabetical, so slot your file in the right spot. For files in `Minecraft.Client/`, some live in subdirectories:

```cmake
set(MINECRAFT_CLIENT_SOURCES
        "AbstractTexturePack.cpp"
        "Common/Audio/SoundEngine.cpp"
        "Common/UI/UIScene.cpp"
        # ...
)
```

CMake prepends the module directory automatically (`Minecraft.World/` or `Minecraft.Client/`), so you just write the filename or subdirectory path relative to that folder.

After changing `Sources.cmake`, you need to re-run CMake to regenerate the build:

```bash
cd build
cmake ..
```

If you're using Visual Studio, it will usually detect the change and prompt you to reload. If it doesn't, re-run CMake manually.

### Umbrella Headers

The codebase uses umbrella headers (also called aggregate headers) to pull in related classes. Instead of including every individual header, you include one umbrella and it pulls in everything for that subsystem. Your `.cpp` files will usually start with one or more of these:

```cpp
#include "stdafx.h"                            // Precompiled header (always first)
#include "net.minecraft.world.level.tile.h"    // All tile classes
#include "net.minecraft.world.item.h"          // All item classes
#include "net.minecraft.world.entity.h"        // Entity classes
#include "net.minecraft.world.level.h"         // Level, LevelSource, LevelChunk
#include "net.minecraft.world.entity.animal.h" // Animal entities
#include "net.minecraft.world.entity.monster.h"// Monster entities
#include "net.minecraft.world.item.crafting.h" // Recipe classes
#include "net.minecraft.world.item.enchantment.h" // Enchantment classes
#include "net.minecraft.world.level.biome.h"   // Biome classes
#include "net.minecraft.world.level.dimension.h" // Dimension classes
#include "com.mojang.nbt.h"                    // NBT serialization
```

These mirror the original Java package structure. Each one is just a small file that includes all the headers in that subsystem. For example, `net.minecraft.world.level.dimension.h` looks like this:

```cpp
#pragma once

#include "Dimension.h"
#include "HellDimension.h"
#include "NormalDimension.h"
#include "TheEndDimension.h"
```

**When you create a new class, add your header to the matching umbrella header.** If you make a new tile called `RubyOreTile`, add `#include "RubyOreTile.h"` to `net.minecraft.world.level.tile.h`. If you make a new monster, add it to `net.minecraft.world.entity.monster.h`. This way, any `.cpp` file that already includes the umbrella header will automatically see your new class.

If you skip this step, other files that need your class won't find it, and you'll get "no such file or directory" errors when they try to include it through the umbrella.

## The Static Constructor Pattern

LCE uses a **static constructor** (`staticCtor`) pattern to register all game objects at startup. This is the main way content gets added to the game.

### How It Works

Each major system has a `staticCtor()` method that creates and configures every instance of that type. These get called once during game initialization, before any level is loaded. The call order is defined in `Minecraft.World.cpp` inside `MinecraftWorld_RunStaticCtors()`:

```cpp
void MinecraftWorld_RunStaticCtors()
{
    Packet::staticCtor();

    // The ordering inside this block matters. Don't change it.
    {
        MaterialColor::staticCtor();
        Material::staticCtor();
        Tile::staticCtor();         // Registers all blocks
        HatchetItem::staticCtor();  // Sets up tool effectiveness
        PickaxeItem::staticCtor();
        ShovelItem::staticCtor();
        BlockReplacements::staticCtor();
        Biome::staticCtor();        // Registers all biomes
        Item::staticCtor();         // Registers all items
        FurnaceRecipes::staticCtor();
        Recipes::staticCtor();      // Registers all crafting recipes
        Stats::staticCtor();
        Skeleton::staticCtor();
        PigZombie::staticCtor();
        TileEntity::staticCtor();   // Registers tile entity types
        EntityIO::staticCtor();     // Registers entity types
        MobCategory::staticCtor();
        Item::staticInit();
        LevelChunk::staticCtor();
        LevelType::staticCtor();
        MineShaftPieces::staticCtor();
        StrongholdFeature::staticCtor();
        VillagePieces::Smithy::staticCtor();
        VillageFeature::staticCtor();
        RandomScatteredLargeFeature::staticCtor();
    }

    EnderMan::staticCtor();
    PotionBrewing::staticCtor();
    Enchantment::staticCtor();      // Registers all enchantments
    SharedConstants::staticCtor();
    // ... more after this
}
```

**The order inside the braces matters.** Materials must exist before Tiles. Tiles must exist before Items (because `Item::staticCtor` references tiles). Items must exist before Recipes. Don't rearrange these unless you know what you're doing.

### Where to Register What

Here's the quick reference. When you add something new, put your registration code in the matching `staticCtor()`:

| You're adding... | Register it in... | File |
|---|---|---|
| A new block (tile) | `Tile::staticCtor()` | `Tile.cpp` |
| A new item | `Item::staticCtor()` | `Item.cpp` |
| A new crafting recipe | `Recipes` constructor | `Recipes.cpp` |
| A new smelting recipe | `FurnaceRecipes` constructor | `FurnaceRecipes.cpp` |
| A new entity type | `EntityIO::staticCtor()` | `EntityIO.cpp` |
| A new tile entity type | `TileEntity::staticCtor()` | `TileEntity.cpp` |
| A new biome | `Biome::staticCtor()` | `Biome.cpp` |
| A new enchantment | `Enchantment::staticCtor()` | `Enchantment.cpp` |
| A new packet type | `Packet::staticCtor()` | `Packet.cpp` |

You don't need to touch `Minecraft.World.cpp` unless you're adding an entirely new system that needs its own `staticCtor()` call in `MinecraftWorld_RunStaticCtors()`. For tiles, items, entities, and everything else listed above, just add your code inside the existing `staticCtor()` for that system.

### The Builder Pattern

Every registration call uses a builder pattern where setters return `this`, so you can chain calls:

```cpp
Tile::obsidian = (new ObsidianTile(49))
    ->setDestroyTime(50.0f)
    ->setExplodeable(2000)
    ->setSoundType(Tile::SOUND_STONE)
    ->setTextureName(L"obsidian")
    ->setDescriptionId(IDS_TILE_OBSIDIAN)
    ->setUseDescriptionId(IDS_DESC_OBSIDIAN);
```

This pattern is used for tiles, items, biomes, and enchantments.

## Adding a New Block (Tile)

Blocks are called "Tiles" in this codebase (from the Java Edition naming). Here's the full process.

### Step 1: Pick an ID

Tile IDs go from 0 to 4095 (`TILE_NUM_COUNT`), but the automatic TileItem loop only covers 0 through 255. The existing codebase uses IDs up to about 171 (`woolCarpet_Id`), with some gaps. Check `Tile.h` for the full list of `static const int` ID constants to find unused slots.

Some known unused IDs in the 0 to 255 range: 146 to 152, 154, 157 to 170, 172 to 255. There are also gaps in the lower ranges if you look carefully.

For IDs above 255, you can still register tiles, but you'll need to create a custom item for them manually since the automatic TileItem loop only covers 0 to 255.

### Step 2: Create the Tile Subclass

Make a header file. At minimum you need a constructor and a `GetType()` override. Here's a simple solid block:

```cpp
// MyCustomTile.h
#pragma once
#include "Tile.h"

class MyCustomTile : public Tile
{
public:
    MyCustomTile(int id) : Tile(id, Material::stone) {}
};
```

If your block drops a different item when broken (like ore blocks do), override `getResource()`:

```cpp
// MyOreTile.h
#pragma once
#include "Tile.h"

class Random;

class MyOreTile : public Tile
{
public:
    MyOreTile(int id) : Tile(id, Material::stone) {}

    virtual int getResource(int data, Random *random, int playerBonusLevel);
    virtual int getResourceCount(Random *random);
};
```

Look at `OreTile.cpp` for the full pattern. It returns different item IDs based on which ore it is and handles experience orb spawning.

### Step 3: Register in Tile::staticCtor()

Open `Tile.cpp` and add your tile to `Tile::staticCtor()`. Add a static pointer in `Tile.h` first:

```cpp
// In Tile.h, add with the other static pointers:
static Tile *myCustomTile;

// And an ID constant:
static const int myCustomTile_Id = 200;  // Pick an unused ID
```

Then in `Tile.cpp`:

```cpp
// In Tile.cpp, add the static member definition at the top:
Tile *Tile::myCustomTile = NULL;

// In Tile::staticCtor(), add:
Tile::myCustomTile = (new MyCustomTile(200))
    ->setDestroyTime(3.0f)           // Time to break (obsidian is 50, stone is 1.5)
    ->setExplodeable(10)             // Explosion resistance
    ->setSoundType(Tile::SOUND_STONE)// Break/place/step sounds
    ->setTextureName(L"myCustom")    // Texture name for the resource system
    ->setDescriptionId(IDS_TILE_STONE)  // Display name string ID
    ->setUseDescriptionId(IDS_DESC_STONE); // Tooltip string ID
```

### Step 4: Include Your Header

Add `#include "MyCustomTile.h"` to the aggregate header `net.minecraft.world.level.tile.h`, or include it directly in `Tile.cpp`.

### Step 5: Add to Sources.cmake

Add `MyCustomTile.cpp` to the `MINECRAFT_WORLD_SOURCES` list in `cmake/Sources.cmake`.

### Step 6: The TileItem

For IDs 0 to 255, the loop at the end of `Tile::staticCtor()` automatically creates a `TileItem` for every tile that doesn't already have a custom item entry:

```cpp
for (int i = 0; i < 256; i++)
{
    if (Tile::tiles[i] != NULL)
    {
        if (Item::items[i] == NULL)
        {
            Item::items[i] = new TileItem(i - 256);
            Tile::tiles[i]->init();
        }
    }
}
```

This means if your tile ID is below 256, you get an item form for free. For IDs 256 and above, create a custom item in `Item::staticCtor()`.

### Available Tile Setters

Here are the main setters you can chain when registering a tile:

| Setter | What it does |
|--------|-------------|
| `setDestroyTime(float)` | How long it takes to break. -1 means indestructible (bedrock) |
| `setExplodeable(float)` | Explosion resistance. Obsidian is 2000, stone is 10 |
| `setSoundType(SoundType*)` | Break/place/step sounds. Options: `SOUND_STONE`, `SOUND_WOOD`, `SOUND_GRAVEL`, `SOUND_GRASS`, `SOUND_METAL`, `SOUND_GLASS`, `SOUND_CLOTH`, `SOUND_SAND`, `SOUND_SNOW`, `SOUND_LADDER`, `SOUND_ANVIL` |
| `setTextureName(wstring)` | Texture resource name |
| `setDescriptionId(int)` | Display name string ID |
| `setUseDescriptionId(int)` | Tooltip string ID |
| `setLightEmission(float)` | How much light it emits (0 to 1, glowstone is 1.0) |
| `setLightBlock(int)` | How much light it blocks (0 to 255, water is 3) |
| `setBaseItemTypeAndMaterial(int, int)` | Item category and material for crafting/sorting |
| `sendTileData()` | Tells the network to sync aux data for this tile |
| `setNotCollectStatistics()` | Excludes from stats tracking |
| `disableMipmap()` | Turns off mipmapping (used for cross-shaped tiles like flowers) |
| `setShape(x0,y0,z0,x1,y1,z1)` | Custom bounding box (default is 0,0,0 to 1,1,1) |

### Tile Virtual Methods You Can Override

Look at existing subclasses for examples. The most useful overrides:

| Method | Purpose | Example Class |
|--------|---------|--------------|
| `getResource(data, random, bonus)` | What item drops when broken | `OreTile` |
| `getResourceCount(random)` | How many items drop | `OreTile` |
| `use(level, x, y, z, player)` | Right-click behavior | `WorkbenchTile`, `ChestTile` |
| `tick(level, x, y, z, random)` | Random tick behavior | `CropTile`, `Sapling` |
| `neighborChanged(level, x, y, z, id)` | React to neighbor block changes | `RedStoneDustTile` |
| `onPlace(level, x, y, z)` | Called when placed in the world | `FurnaceTile` |
| `onRemoving(level, x, y, z, data)` | Called when removed from the world | `ChestTile` |
| `attack(level, x, y, z, player)` | Left-click behavior | `MusicTile` |
| `spawnResources(level, x, y, z, ...)` | Custom drop logic with experience | `OreTile` |
| `getSignal(level, x, y, z, dir)` | Redstone signal output | `LeverTile` |
| `shouldTileTick(level, x, y, z)` | Whether random ticks do anything | Various |

## Adding a New Item

### Step 1: Pick an ID

Item IDs are offset by 256 internally. The `Item` constructor adds 256 to whatever you pass in:

```cpp
Item::Item(int id) : id(256 + id)
{
    maxStackSize = Item::MAX_STACK_SIZE;  // 64 by default
}
```

So `new Item(4)` creates an item with internal `id == 260`. This offset keeps item IDs separate from tile IDs (tiles use 0 through 255 in the item array, items start at 256).

Check `Item.h` for existing ID constants to avoid collisions. The codebase uses IDs up to about `netherQuartz_Id` (406 internal, 150 constructor param). Music disc records use IDs in the 2256-2267 range, so avoid those too.

### Step 2: Choose or Create a Subclass

The codebase has several item subclasses you can use or extend:

| Class | Purpose | Key Fields |
|-------|---------|-----------|
| `Item` | Base class, simple item | `maxStackSize`, `maxDamage` |
| `FoodItem` | Edible items | `nutrition`, `saturationModifier`, `isMeat` |
| `WeaponItem` | Swords | `damage`, `tier` |
| `ArmorItem` | Armor pieces | `slot`, `defense`, `armorType` |
| `PickaxeItem` | Pickaxes | `tier`, effectiveness table |
| `ShovelItem` | Shovels | `tier`, effectiveness table |
| `HatchetItem` | Axes | `tier`, effectiveness table |
| `HoeItem` | Hoes | `tier` |
| `BowItem` | Bows | Charge-up use animation |
| `BucketItem` | Buckets | Fluid interaction |
| `DyePowderItem` | Dyes | Color aux values |
| `TileItem` | Item form of a block | References a `Tile` |

For a simple food item:

```cpp
// MyFood.h
#pragma once
#include "FoodItem.h"

class MyFood : public FoodItem
{
public:
    // id, nutrition, saturation modifier, is meat
    MyFood(int id) : FoodItem(id, 6, 0.8f, false) {}
};
```

### Step 3: Register in Item::staticCtor()

Add a static pointer in `Item.h`:

```cpp
static Item *myFood;
static const int myFood_Id = 256 + 200;  // Internal ID (pass 200 to constructor)
```

Then in `Item.cpp`:

```cpp
// Static member definition:
Item *Item::myFood = NULL;

// In Item::staticCtor():
Item::myFood = (new MyFood(200))
    ->setTextureName(L"myFood")
    ->setDescriptionId(IDS_ITEM_APPLE)     // Reuse an existing name for testing
    ->setUseDescriptionId(IDS_DESC_APPLE);
```

### Step 4: Add to Umbrella Header and Sources.cmake

If you made a new `.h` file for an Item subclass, add it to the item umbrella header `net.minecraft.world.item.h`:

```cpp
#include "MyFood.h"
```

Then add your `.cpp` file to `MINECRAFT_WORLD_SOURCES` in `cmake/Sources.cmake`. Only `.cpp` files go here, not headers.

### Tool Tiers

If you're making a new tool or weapon, you'll use the existing tier system:

```cpp
const Tier *Tier::WOOD   = new Tier(0, 59,   2, 0, 15);  // level, durability, speed, damage, enchantValue
const Tier *Tier::STONE  = new Tier(1, 131,  4, 1, 5);
const Tier *Tier::IRON   = new Tier(2, 250,  6, 2, 14);
const Tier *Tier::DIAMOND= new Tier(3, 1561, 8, 3, 10);
const Tier *Tier::GOLD   = new Tier(0, 32,  12, 0, 22);
```

To add a new tier, create a new `Tier` constant and use it in your tool/weapon constructor.

### Armor Materials

For custom armor, use or create an `ArmorMaterial`:

```cpp
// Existing materials:
const ArmorMaterial *ArmorMaterial::CLOTH;    // Leather
const ArmorMaterial *ArmorMaterial::CHAIN;    // Chainmail
const ArmorMaterial *ArmorMaterial::IRON;
const ArmorMaterial *ArmorMaterial::GOLD;
const ArmorMaterial *ArmorMaterial::DIAMOND;
```

Each material defines durability and protection per slot (head, torso, legs, feet). The `ArmorItem` constructor takes the material, a model index (for rendering), and a slot constant (`SLOT_HEAD`, `SLOT_TORSO`, `SLOT_LEGS`, `SLOT_FEET`).

## Adding Crafting Recipes

Recipes are registered in the `Recipes` constructor in `Recipes.cpp`. There are two types.

### Shaped Recipes

Use `addShapedRecipy()` with a shape pattern. The format is a bit unusual because 4J adapted Java's varargs approach to C++:

```cpp
// Makes 4 wooden planks from 1 oak log
addShapedRecipy(new ItemInstance(Tile::wood, 4, 0),  // Result: 4 planks
    L"sczg",         // Type string (internal, always ends in a type marker)
    L"#",            // Shape: single item in one row

    L'#', new ItemInstance(Tile::treeTrunk, 1, 0),  // '#' = oak log
    L'S');           // Terminator
```

For a 3x3 recipe like a pickaxe:

```cpp
addShapedRecipy(new ItemInstance(Item::pickAxe_iron),
    L"wcicg",        // Type markers
    L"XXX",          // Top row: 3 iron
    L" # ",          // Middle row: stick in center
    L" # ",          // Bottom row: stick in center

    L'#', Item::stick,       // '#' = stick
    L'X', Item::ironIngot,   // 'X' = iron ingot
    L'T');                   // Terminator
```

The type string at the start (`L"sczg"`, `L"wcicg"`, etc.) encodes the parameter types. The exact format is quirky, but you can follow existing recipes as templates. The key thing is matching the characters in the shape to the mapping at the end.

Recipe category classes handle groups of similar recipes:

| Class | What it registers |
|-------|------------------|
| `ToolRecipies` | Pickaxes, shovels, axes, hoes, shears |
| `WeaponRecipies` | Swords |
| `ArmorRecipes` | All armor pieces |
| `StructureRecipies` | Building blocks (stairs, slabs, walls, fences) |
| `OreRecipies` | Ore blocks, ingot blocks, dye conversions |
| `FoodRecipies` | Food items (bread, cake, cookies, etc.) |
| `ClothDyeRecipes` | Wool dyeing |

### Shapeless Recipes

Use `addShapelessRecipy()` for recipes where position doesn't matter:

```cpp
addShapelessRecipy(new ItemInstance(Item::dye_powder, 2, DyePowderItem::YELLOW),
    new ItemInstance(Tile::flower),
    L'T');  // Terminator
```

### Furnace Recipes

Smelting recipes are registered in the `FurnaceRecipes` constructor in `FurnaceRecipes.cpp`:

```cpp
// addFurnaceRecipy(input tile/item ID, result ItemInstance, experience value)
addFurnaceRecipy(Tile::ironOre_Id, new ItemInstance(Item::ironIngot), 0.7f);
addFurnaceRecipy(Item::porkChop_raw_Id, new ItemInstance(Item::porkChop_cooked), 0.35f);
```

The first parameter is the raw item/tile ID (not offset). The third parameter is the experience value awarded when the result is collected from the furnace.

## Adding a New Entity

Entities are more involved than blocks or items. You need to register the entity type, add AI (for mobs), handle serialization, and add a renderer on the client side.

### Step 1: Create the Entity Class

All entities inherit from `Entity`. Mobs inherit from `Mob`. Hostile mobs inherit from `Monster`. Animals inherit from `Animal`.

The hierarchy:

```
Entity
├── Mob
│   ├── Monster (hostile)
│   │   ├── Creeper
│   │   ├── Zombie
│   │   ├── Skeleton
│   │   └── ...
│   ├── Animal (passive)
│   │   ├── Cow
│   │   ├── Pig
│   │   ├── Sheep
│   │   └── ...
│   ├── WaterAnimal
│   └── Villager
├── ItemEntity (dropped items)
├── PrimedTnt
├── FallingTile
├── Minecart
├── Boat
├── Arrow
├── Fireball
└── ...
```

Every entity class needs two things: a `GetType()` override that returns a unique `eINSTANCEOF` enum value, and a static `create()` function:

```cpp
// MyMob.h
#pragma once
#include "Monster.h"

class MyMob : public Monster
{
public:
    eINSTANCEOF GetType() { return eTYPE_MYMOB; }  // You need to add this to the enum
    static Entity *create(Level *level) { return new MyMob(level); }

    MyMob(Level *level);

    virtual bool useNewAi() { return true; }  // Use GoalSelector AI
    virtual int getMaxHealth();

protected:
    virtual void defineSynchedData();
    virtual void tick();
    virtual int getHurtSound();
    virtual int getDeathSound();
    virtual int getDeathLoot();

public:
    virtual void addAdditonalSaveData(CompoundTag *entityTag);
    virtual void readAdditionalSaveData(CompoundTag *tag);
};
```

### Step 2: Add the eINSTANCEOF Enum Value

The type system uses the `eINSTANCEOF` enum (defined in `Arrays.h` or a similar header). Add your new type:

```cpp
eTYPE_MYMOB,  // Add this to the eINSTANCEOF enum
```

### Step 3: Register in EntityIO::staticCtor()

In `EntityIO.cpp`, add your entity to the registry:

```cpp
// Basic registration (not spawnable with eggs):
setId(MyMob::create, eTYPE_MYMOB, L"MyMob", 200);

// With spawn egg colors (makes it spawnable in creative):
setId(MyMob::create, eTYPE_MYMOB, L"MyMob", 200,
    eMinecraftColour_Mob_Creeper_Colour1,  // Egg primary color
    eMinecraftColour_Mob_Creeper_Colour2,  // Egg secondary color
    IDS_CREEPER);                          // Name string ID
```

The numeric ID (200 in this example) is used for NBT serialization and spawn egg items. Pick one that doesn't collide with existing entity IDs.

### Step 4: Set Up AI (for Mobs)

Mobs use the `GoalSelector` system. In your constructor, add goals with priorities:

```cpp
MyMob::MyMob(Level *level) : Monster(level)
{
    // Lower number = higher priority
    goalSelector.addGoal(0, new FloatGoal(this));
    goalSelector.addGoal(1, new MeleeAttackGoal(this, 1.0, false));
    goalSelector.addGoal(2, new RandomStrollGoal(this, 0.8));
    goalSelector.addGoal(3, new LookAtPlayerGoal(this, eTYPE_PLAYER, 8.0f));
    goalSelector.addGoal(4, new RandomLookAroundGoal(this));

    targetSelector.addGoal(0, new HurtByTargetGoal(this, false));
    targetSelector.addGoal(1, new NearestAttackableTargetGoal(this, eTYPE_PLAYER, 16.0f, 0, true));
}
```

Each `Goal` has four methods: `canUse()` (should this goal activate?), `start()` (begin executing), `tick()` (run each game tick), and `stop()` (clean up). There are 40+ built-in goals. Check the source for classes ending in `Goal` for the full list.

### Step 5: Add a Renderer (Client Side)

In `EntityRenderDispatcher.cpp`, the constructor maps `eINSTANCEOF` types to renderers:

```cpp
renderers[eTYPE_MYMOB] = new HumanoidMobRenderer(new ZombieModel(), 0.5f);
```

For a simple mob, you can reuse an existing model and renderer. For a custom look, you'd need to create a new `Model` subclass and potentially a new `MobRenderer` subclass. Look at existing renderers for the pattern:

| Renderer | Used by |
|----------|---------|
| `HumanoidMobRenderer` | Skeleton, PigZombie (humanoid shape) |
| `ZombieRenderer` | Zombie (humanoid with extended arms) |
| `CreeperRenderer` | Creeper (custom model) |
| `PigRenderer` | Pig (quadruped with saddle) |
| `CowRenderer` | Cow, MushroomCow |
| `SheepRenderer` | Sheep (with fur layer) |
| `SlimeRenderer` | Slime (translucent layers) |
| `MobRenderer` | Generic base for any mob |

### Step 6: Handle Serialization

Override `addAdditonalSaveData` and `readAdditionalSaveData` to save/load your entity's custom data with NBT:

```cpp
void MyMob::addAdditonalSaveData(CompoundTag *tag)
{
    Monster::addAdditonalSaveData(tag);
    tag->putInt(L"MyCustomValue", myValue);
}

void MyMob::readAdditionalSaveData(CompoundTag *tag)
{
    Monster::readAdditionalSaveData(tag);
    myValue = tag->getInt(L"MyCustomValue");
}
```

## Adding Tile Entities

Tile entities are blocks that store extra data (chests, furnaces, signs, etc.). They tick independently and can hold inventory or other state.

### Step 1: Create the Tile Entity Class

```cpp
// MyTileEntity.h
#pragma once
#include "TileEntity.h"

class MyTileEntity : public TileEntity
{
public:
    eINSTANCEOF GetType() { return eTYPE_MYTILEENTITY; }
    static TileEntity *create() { return new MyTileEntity(); }

    virtual void load(CompoundTag *tag);
    virtual void save(CompoundTag *tag);
    virtual void tick();
};
```

### Step 2: Register It

In `TileEntity.cpp`, inside `TileEntity::staticCtor()`:

```cpp
TileEntity::setId(MyTileEntity::create, eTYPE_MYTILEENTITY, L"MyTileEntity");
```

The string ID is used for NBT serialization.

### Step 3: Connect to Your Tile

Your tile class needs to create the tile entity when the block is placed. Override `newTileEntity()` in your tile subclass to return a new instance of your tile entity.

## Adding Enchantments

Enchantments are registered in `Enchantment::staticCtor()` in `Enchantment.cpp`. Each enchantment has an ID (0 to 255), a rarity, and a category (armor, weapon, digger, bow).

Existing enchantment subclasses:

| Class | Examples |
|-------|---------|
| `ProtectionEnchantment` | All, Fire, Fall, Explosion, Projectile protection |
| `DamageEnchantment` | Sharpness, Smite, Bane of Arthropods |
| `KnockbackEnchantment` | Knockback |
| `FireAspectEnchantment` | Fire Aspect |
| `DiggingEnchantment` | Efficiency |
| `UntouchingEnchantment` | Silk Touch |
| `DigDurabilityEnchantment` | Unbreaking |
| `LootBonusEnchantment` | Looting, Fortune |
| `ArrowDamageEnchantment` | Power |
| `ArrowKnockbackEnchantment` | Punch |
| `ArrowFireEnchantment` | Flame |
| `ArrowInfiniteEnchantment` | Infinity |
| `OxygenEnchantment` | Respiration |
| `WaterWorkerEnchantment` | Aqua Affinity |
| `ThornsEnchantment` | Thorns |

The rarity values control how often enchantments show up at the enchanting table:

| Constant | Meaning |
|----------|---------|
| `FREQ_COMMON` | Shows up often |
| `FREQ_UNCOMMON` | Shows up sometimes |
| `FREQ_RARE` | Shows up rarely |
| `FREQ_VERY_RARE` | Shows up very rarely (Silk Touch, Infinity) |

Enchantment IDs are grouped: 0 to 7 for armor, 16 to 21 for weapons, 32 to 35 for digger tools, 48 to 51 for bows.

## Adding Biomes

Biomes are registered in `Biome::staticCtor()` in `Biome.cpp`. The array holds 256 slots. Existing biomes use IDs 0 to 22.

```cpp
Biome::ocean = (new OceanBiome(0))
    ->setColor(0x000070)
    ->setName(L"Ocean")
    ->setDepthAndScale(-1, 0.4f)
    ->setLeafFoliageWaterSkyColor(...);
```

To add a new biome, create a `Biome` subclass and register it with an unused ID. You'll also need to integrate it into the world generation layer pipeline if you want it to actually generate. The layer system (`AddIslandLayer`, `AddMushroomIslandLayer`, `AddSnowLayer`, etc.) controls which biomes appear where.

## Adding Packets (Networking)

If your mod needs to sync custom data between server and client, you'll need a new packet type. Packets inherit from `Packet` and implement:

- `write(BitStream *)` to serialize data
- `read(BitStream *)` to deserialize data
- `handle(PacketListener *)` to process on the receiving end

Register new packets in `Packet::staticCtor()`. The existing codebase has 98 packet types (IDs 0 through 255 with many gaps).

:::caution
Networking changes can break multiplayer compatibility. If you add a new packet, both the host and all clients need the same version of the code.
:::

## The Synched Entity Data System

Entities can sync simple data fields automatically over the network using `SynchedEntityData`. This is how the game keeps things like mob health, entity flags, and held items in sync.

In your entity's `defineSynchedData()`:

```cpp
void MyMob::defineSynchedData()
{
    Monster::defineSynchedData();  // Call parent first
    entityData.define(DATA_MY_VALUE, (byte)0);  // Register a synced byte
}
```

Supported data types: `byte` (type 0), `short` (type 1), `int` (type 2), `float` (type 3), `wstring` (type 4), `ItemInstance` (type 5). The data ID must be unique per entity class. Check parent classes to avoid collisions.

## Debug Build Features

Building in Debug mode (`cmake --build . --config Debug`) enables two extra compile defines:

- **`_DEBUG_MENUS_ENABLED`** turns on in-game debug menus and overlays
- **`_DEBUG`** enables assertions, extra validation, and debug console output

These are very useful while developing. You can check current block/entity states, teleport, change game modes, and more through the debug menus.

## Texture and Resource Names

Tiles and items both use `setTextureName(L"name")` to specify their texture. The actual texture lookup happens through the `IconRegister` system on the client side. Tiles can override `registerIcons(IconRegister *iconRegister)` for custom multi-face textures (like furnaces that have different top/front/side textures).

The texture name you pass to `setTextureName` needs to match an entry in the resource archives. For testing, you can reuse existing texture names.

## String IDs and Localization

The `setDescriptionId()` and `setUseDescriptionId()` methods take integer string IDs (like `IDS_TILE_STONE`, `IDS_DESC_STONE`). These map to localized strings in the resource system. For testing, reuse existing string IDs. For a proper mod, you'd need to add new string entries to the localization tables.

## Common Build Errors

When you're starting out, you'll hit build errors. Here's what the most common ones mean and how to fix them.

### "unresolved external symbol" / "undefined reference to X"

You wrote a function or method in a `.h` file but the `.cpp` file that defines it isn't in the build. Open `cmake/Sources.cmake` and make sure your `.cpp` file is listed in the right source list (`MINECRAFT_WORLD_SOURCES` or `MINECRAFT_CLIENT_SOURCES`). Then re-run CMake.

This also happens if you declare a static member in a header but forget to define it in the `.cpp`:

```cpp
// In MyTile.h:
static Tile *myTile;           // declared

// In MyTile.cpp (easy to forget this part):
Tile *Tile::myTile = NULL;     // defined
```

### "cannot open include file" / "no such file or directory"

The compiler can't find a header you're trying to include. Common causes:

- **Typo in the filename.** Double-check the exact spelling and case.
- **Forgot to add your header to the umbrella header.** If another `.cpp` file includes `net.minecraft.world.level.tile.h` expecting to find your tile class, but you didn't add your header to that umbrella, it won't be found.
- **Wrong path.** Headers in `Minecraft.World/` can be included directly by name. Headers in subdirectories need the relative path (like `"x64headers/SomeHeader.h"`).

### "redefinition of" / "already defined in"

Your header is getting included more than once without a guard. Make sure every `.h` file starts with `#pragma once`. If you already have it, check whether you accidentally defined a function body in the header that's getting compiled into multiple `.cpp` files. Move the definition to a `.cpp` file, or mark it `inline`.

### "cannot convert from X to Y"

A type mismatch. The most common ones in this codebase:

- **`shared_ptr` vs raw pointer.** Entities and players use `shared_ptr<>`. If a function expects `shared_ptr<Player>` and you're passing a raw `Player *`, use `shared_from_this()` or wrap it.
- **`int` vs `unsigned int`.** Some tile/item IDs are signed, some are unsigned. Cast if needed.
- **`wchar_t *` vs `std::wstring`.** String literals in this codebase use `L"wide strings"`. If a function wants `std::wstring`, the literal will convert automatically. Going the other way, use `.c_str()`.

### "stdafx.h not found" or weird errors at the top of a .cpp file

Every `.cpp` file in this project must have `#include "stdafx.h"` as the very first include. Not second, not after your own headers. First. This is the precompiled header and MSVC will ignore everything above it.

## Common Pitfalls

### Tile isn't showing up in-game
- Make sure it has a non-NULL entry in `Tile::tiles[]` at the right index
- Make sure a matching `TileItem` or custom item exists in `Item::items[]`
- If the ID is above 255, you need to create the item manually

### Item crashes when used
- Check that your `staticCtor()` registration runs before anything tries to reference the item
- Make sure you're not colliding with an existing ID
- Verify the constructor parameter is the right offset (remember the +256)

### Entity doesn't spawn
- Check that `EntityIO::staticCtor()` has the registration
- Verify the `eINSTANCEOF` enum value exists and is unique
- Make sure the `create()` function is static and returns `new YourEntity(level)`

### Static constructor ordering crash
- If you reference a tile in `Item::staticCtor()` but that tile was registered after your reference point in `Tile::staticCtor()`, you'll get a null pointer
- Keep the call order in `MinecraftWorld_RunStaticCtors()` intact
- Materials before Tiles before Items before Recipes

### Multiplayer desync
- If you add a new tile or item, all players need the same build
- New packets need matching IDs on both sides
- `SynchedEntityData` field IDs must be consistent

## Testing Your Changes

### Build and run

After making changes, rebuild and run:

```bash
cd build
cmake --build . --config Debug
```

Use Debug mode while developing. It enables debug menus and assertions that will catch problems early. Once everything works, switch to Release for performance.

Run the game from Visual Studio (F5) or from the command line:

```bash
Minecraft.Client.exe
```

### What to check in-game

**For new blocks:** Open creative mode, find your block in the inventory (or use `/give` if you set up commands). Place it, break it, check that the right item drops. Look at the texture. Walk into it to test collision.

**For new items:** Check that it appears in the creative inventory. If it's a food item, eat it. If it's a tool, try mining with it. If it's armor, equip it and check the defense value.

**For new entities:** Spawn it with a spawn egg (if you registered one) or through debug menus. Watch its AI. Does it pathfind? Does it attack? Does it drop loot when killed? Save and reload the world to test serialization.

**For recipes:** Open a crafting table and check that your recipe shows up with the right ingredients and result.

### Smoke test before big changes

Before you start adding something new, do a quick sanity check: change something small in the existing code (like the destroy time of stone), build, run, and verify the change works in-game. This confirms your build pipeline is set up correctly. If that small change doesn't work, fix your setup before writing new code.

### Multiplayer testing

To test with two players on the same machine, run two instances with different names:

```bash
Minecraft.Client.exe -name Host
Minecraft.Client.exe -name Client -ip 127.0.0.1
```

The first instance hosts. The second connects to it over localhost. Both need the same build.

## Tips

- The codebase uses `shared_ptr<>` heavily for entities and players. Watch for lifetime issues when storing references.
- Use `-name`, `-ip`, and `-port` launch arguments for testing multiplayer (see [Building & Compiling](/slop-docs/overview/building/))
- Start by modifying existing content before trying to add entirely new things. Change a tile's destroy time or an item's stack size to make sure your build pipeline works.
- Read existing subclasses. `OreTile`, `FoodItem`, and `Creeper` are all clean, well-structured examples to learn from.
- The `// 4J` comments throughout the code mark changes 4J Studios made for the console port. These are useful context for understanding why something works a certain way.

## Next Steps

- [Adding Blocks](/slop-docs/modding/adding-blocks/) for a detailed tile creation walkthrough
- [Adding Items](/slop-docs/modding/adding-items/) for a detailed item creation walkthrough

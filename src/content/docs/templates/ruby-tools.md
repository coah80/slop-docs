---
title: "Template: Ruby Ore & Tools"
description: A complete starter mod that adds a new ore, gem, tools, armor, recipes, and world generation.
---

This is a self-contained template for adding a full ore-to-tools pipeline to LCE. Copy it, swap "Ruby" for your material name, adjust the numbers, and you have a working mod.

We are building all of this from scratch:

- Ruby ore block (spawns underground)
- Ruby gem item (drops from the ore)
- Ruby storage block (9 gems to 1 block, reversible)
- Ruby tool tier (sits between iron and diamond)
- All 5 ruby tools (sword, pickaxe, shovel, axe, hoe)
- Ruby armor material with all 4 pieces
- Crafting, smelting, and storage recipes
- Ore world generation with configurable Y levels and vein size
- Texture registration for everything

If you have not set up a build environment yet, start with [Getting Started](/slop-docs/modding/getting-started/).

## Files you will create

| File | Purpose |
|------|---------|
| `Minecraft.World/RubyOreTile.h` | Ore block header |
| `Minecraft.World/RubyOreTile.cpp` | Ore block with drops, Fortune, XP |

That is it for new files. Everything else goes into existing files. Ruby tools, armor, and items are all created inside `Item::staticCtor()` using existing tool/armor classes. You do not need custom subclasses for those.

## Files you will modify

| File | What you change |
|------|----------------|
| `Minecraft.World/Tile.h` | Add `rubyOre`, `rubyBlock` static pointers and ID constants |
| `Minecraft.World/Tile.cpp` | Static defs, `const int` defs, register blocks in `staticCtor()` |
| `Minecraft.World/Item.h` | Add gem, tool, armor pointers, IDs, and `Item::Tier::RUBY` |
| `Minecraft.World/Item.cpp` | Static defs, tier def, register everything in `staticCtor()`, update `getTierItemId()` |
| `Minecraft.World/ArmorItem.h` | Add `ArmorItem::ArmorMaterial::RUBY` and `rubyArray[]` |
| `Minecraft.World/ArmorItem.cpp` | Define armor material, update `getTierItemId()` |
| `Minecraft.World/ToolRecipies.cpp` | Add ruby to tool recipe arrays in `_init()` |
| `Minecraft.World/WeaponRecipies.cpp` | Add ruby to weapon recipe arrays in `_init()` |
| `Minecraft.World/ArmorRecipes.cpp` | Add ruby to armor arrays in `_init()`, update `GetArmorType()` |
| `Minecraft.World/OreRecipies.h` | Bump `MAX_ORE_RECIPES` from 5 to 6 |
| `Minecraft.World/OreRecipies.cpp` | Add ruby block storage recipe in `_init()` |
| `Minecraft.World/FurnaceRecipes.cpp` | Add ruby ore smelting recipe |
| `Minecraft.World/BiomeDecorator.h` | Add `rubyOreFeature` pointer |
| `Minecraft.World/BiomeDecorator.cpp` | Create feature in `_init()`, add to `decorateOres()` |
| `Minecraft.Client/PreStitchedTextureMap.cpp` | Register UV entries in `loadUVs()` for block and item textures |
| `cmake/Sources.cmake` | Add new source file |

## Includes you will add

**In `RubyOreTile.cpp`**, you need these includes:

```cpp
#include "stdafx.h"
#include "RubyOreTile.h"
#include "net.minecraft.world.item.h"
#include "net.minecraft.world.level.h"
```

`net.minecraft.world.item.h` is the umbrella header that pulls in `Item.h`, `ItemInstance.h`, and all the item-related classes. `net.minecraft.world.level.h` gets you `Level`, `Random`, `Mth`, and other level utilities.

**In `Tile.cpp`**, add at the top with the other tile includes:

```cpp
#include "RubyOreTile.h"
```

The rest of the files you are modifying (`Item.cpp`, `ArmorItem.cpp`, `ToolRecipies.cpp`, etc.) already include the headers they need. You are just adding new code to existing functions.

## Sources.cmake entry

Add your new ore tile to `MINECRAFT_WORLD_SOURCES` in `cmake/Sources.cmake`:

```cmake
"RubyOreTile.cpp"
```

Header files are not listed in Sources.cmake. Only `.cpp` files.

## 1. Plan your IDs

Every tile and item needs a unique numeric ID. Tiles occupy IDs 0 through 4095. Items offset by 256 internally, so when you pass `151` to an Item constructor, the real ID becomes `407`.

Pick a block of unused IDs and write them down before you touch any code. Here is the full set for this template:

| Name | Type | Constructor arg | Final ID |
|------|------|----------------|----------|
| Ruby Ore | Tile | `160` | `160` |
| Ruby Block | Tile | `161` | `161` |
| Ruby (gem) | Item | `151` | `407` |
| Ruby Sword | Item | `152` | `408` |
| Ruby Shovel | Item | `153` | `409` |
| Ruby Pickaxe | Item | `154` | `410` |
| Ruby Axe | Item | `155` | `411` |
| Ruby Hoe | Item | `156` | `412` |
| Ruby Helmet | Item | `157` | `413` |
| Ruby Chestplate | Item | `158` | `414` |
| Ruby Leggings | Item | `159` | `415` |
| Ruby Boots | Item | `160` | `416` |

Scan `Tile.h` and `Item.h` for existing ID constants to make sure nothing overlaps.

:::tip[Customizing]
To make this template your own, just replace these IDs and every instance of "Ruby"/"ruby" with your material name. The rest of the structure stays the same.
:::

## 2. The ore block

The ore is a Tile subclass that drops a gem item instead of itself, awards XP, and supports Fortune.

### RubyOreTile.h

Create `Minecraft.World/RubyOreTile.h`:

```cpp
#pragma once
#include "Tile.h"

class Random;
class Level;

class RubyOreTile : public Tile
{
public:
    RubyOreTile(int id);

    virtual int getResource(int data, Random *random, int playerBonusLevel);
    virtual int getResourceCount(Random *random);
    virtual int getResourceCountForLootBonus(int bonusLevel, Random *random);
    virtual void spawnResources(Level *level, int x, int y, int z,
                                int data, float odds, int playerBonusLevel);

protected:
    virtual int getSpawnResourcesAuxValue(int data);
};
```

### RubyOreTile.cpp

Create `Minecraft.World/RubyOreTile.cpp`:

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
    // Return the gem item ID, not the block itself.
    // Change this to return `id` if your ore should drop as a block (like iron/gold).
    return Item::ruby_Id;
}

int RubyOreTile::getResourceCount(Random *random)
{
    // How many items drop per block. 1 is standard for most ores.
    return 1;
}

int RubyOreTile::getResourceCountForLootBonus(int bonusLevel, Random *random)
{
    // Fortune enchantment logic. Same formula the vanilla ores use.
    if (bonusLevel > 0)
    {
        int bonus = random->nextInt(bonusLevel + 2) - 1;
        if (bonus < 0) bonus = 0;
        return getResourceCount(random) * (bonus + 1);
    }
    return getResourceCount(random);
}

void RubyOreTile::spawnResources(Level *level, int x, int y, int z,
                                  int data, float odds, int playerBonusLevel)
{
    Tile::spawnResources(level, x, y, z, data, odds, playerBonusLevel);

    // XP orbs on mine. Vanilla ranges: coal 0-2, diamond/emerald 3-7, lapis/quartz 2-5.
    int xp = Mth::nextInt(level->random, 3, 7);
    popExperience(level, x, y, z, xp);
}

int RubyOreTile::getSpawnResourcesAuxValue(int data)
{
    // Aux value for the dropped item. 0 for most ores.
    // Lapis returns DyePowderItem::BLUE here because it drops dye.
    return 0;
}
```

The five methods you care about:

- `getResource()` controls *what* drops (gem vs. block)
- `getResourceCount()` controls *how many* drop
- `getResourceCountForLootBonus()` handles Fortune scaling
- `spawnResources()` handles XP orb spawning
- `getSpawnResourcesAuxValue()` sets the aux/data value on the dropped item

## 3. Register tiles

### Tile.h

Add these with the other static members:

```cpp
// Forward declaration (near the top)
class RubyOreTile;

// Static members (inside the Tile class)
static Tile *rubyOre;
static const int rubyOre_Id = 160;

static Tile *rubyBlock;
static const int rubyBlock_Id = 161;
```

### Tile.cpp

Static definitions (near the other `Tile *` defs):

```cpp
Tile *Tile::rubyOre = NULL;
Tile *Tile::rubyBlock = NULL;
```

`const int` definitions (at the bottom with the rest):

```cpp
const int Tile::rubyOre_Id;
const int Tile::rubyBlock_Id;
```

Inside `Tile::staticCtor()`:

```cpp
// Ruby Ore
Tile::rubyOre = (new RubyOreTile(Tile::rubyOre_Id))
    ->setDestroyTime(3.0f)
    ->setExplodeable(5)
    ->setSoundType(Tile::SOUND_STONE)
    ->setTextureName(L"oreRuby")
    ->setDescriptionId(IDS_TILE_RUBY_ORE)
    ->setUseDescriptionId(IDS_DESC_RUBY_ORE);

// Ruby Block (storage, like diamond block)
Tile::rubyBlock = (new MetalTile(Tile::rubyBlock_Id))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_block, Item::eMaterial_diamond)
    ->setDestroyTime(5.0f)
    ->setExplodeable(10)
    ->setSoundType(Tile::SOUND_METAL)
    ->setTextureName(L"blockRuby")
    ->setDescriptionId(IDS_TILE_RUBY_BLOCK)
    ->setUseDescriptionId(IDS_DESC_RUBY_BLOCK);
```

`MetalTile` is the same class that gold and diamond storage blocks use. It is just a solid block with no special logic. See [Adding Blocks](/slop-docs/modding/adding-blocks/) for more on tile properties.

## 4. The gem item

The gem itself is a plain `Item` with no special behavior. Think diamonds and emeralds.

### Item.h

```cpp
static Item *ruby;
static const int ruby_Id = 407;
```

### Item.cpp

Static definition:

```cpp
Item *Item::ruby = NULL;
```

Inside `Item::staticCtor()`:

```cpp
Item::ruby = (new Item(151))
    ->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_diamond)
    ->setTextureName(L"ruby")
    ->setDescriptionId(IDS_ITEM_RUBY)
    ->setUseDescriptionId(IDS_DESC_RUBY);
```

Constructor arg `151` + offset `256` = final ID `407`. See [Adding Items](/slop-docs/modding/adding-items/) for more on the item system.

## 5. Tool tier

Tool tiers control mining speed, damage, durability, and enchantability. Here are the vanilla tiers for reference:

```cpp
// Tier(level, uses, speed, damage, enchantValue)
WOOD    = new Tier(0,   59,  2, 0, 15);
STONE   = new Tier(1,  131,  4, 1,  5);
IRON    = new Tier(2,  250,  6, 2, 14);
DIAMOND = new Tier(3, 1561,  8, 3, 10);
GOLD    = new Tier(0,   32, 12, 0, 22);
```

| Field | What it does |
|-------|-------------|
| `level` | Mining level. 0 = wood/gold, 1 = stone, 2 = iron, 3 = diamond |
| `uses` | Durability (total uses before breaking) |
| `speed` | Mining speed multiplier |
| `damage` | Base attack damage bonus |
| `enchantValue` | How well it accepts enchantments (higher = better) |

### Item.h

Inside the `Tier` class (which is nested inside `Item`):

```cpp
static const Tier *RUBY;
```

### Item.cpp

With the other tier definitions:

```cpp
const Item::Tier *Item::Tier::RUBY = new Item::Tier(2, 750, 7, 2, 12);
```

Ruby sits between iron and diamond: mining level 2, 750 durability, speed 7, damage bonus 2, enchant value 12. Tweak these to taste.

### Repair material

So that ruby tools can be repaired with rubies on an anvil, add a check to `Item::Tier::getTierItemId()` in `Item.cpp`:

```cpp
int Item::Tier::getTierItemId() const
{
    // ... existing checks for WOOD, STONE, IRON, DIAMOND, GOLD ...
    if (this == RUBY) return Item::ruby_Id;
    return -1;
}
```

This covers all tools that use the RUBY tier in one place.

## 6. Register all 5 tools

### Item.h

```cpp
static Item *sword_ruby;
static Item *shovel_ruby;
static Item *pickAxe_ruby;
static Item *hatchet_ruby;
static Item *hoe_ruby;

static const int sword_ruby_Id    = 408;
static const int shovel_ruby_Id   = 409;
static const int pickAxe_ruby_Id  = 410;
static const int hatchet_ruby_Id  = 411;
static const int hoe_ruby_Id      = 412;
```

### Item.cpp

Static definitions:

```cpp
Item *Item::sword_ruby   = NULL;
Item *Item::shovel_ruby  = NULL;
Item *Item::pickAxe_ruby = NULL;
Item *Item::hatchet_ruby = NULL;
Item *Item::hoe_ruby     = NULL;
```

Inside `Item::staticCtor()`:

```cpp
Item::sword_ruby = (new WeaponItem(152, Item::Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_sword, eMaterial_diamond)
    ->setTextureName(L"swordRuby")
    ->setDescriptionId(IDS_ITEM_SWORD_RUBY)
    ->setUseDescriptionId(IDS_DESC_SWORD);

Item::shovel_ruby = (new ShovelItem(153, Item::Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_shovel, eMaterial_diamond)
    ->setTextureName(L"shovelRuby")
    ->setDescriptionId(IDS_ITEM_SHOVEL_RUBY)
    ->setUseDescriptionId(IDS_DESC_SHOVEL);

Item::pickAxe_ruby = (new PickaxeItem(154, Item::Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_pickaxe, eMaterial_diamond)
    ->setTextureName(L"pickaxeRuby")
    ->setDescriptionId(IDS_ITEM_PICKAXE_RUBY)
    ->setUseDescriptionId(IDS_DESC_PICKAXE);

Item::hatchet_ruby = (new HatchetItem(155, Item::Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_hatchet, eMaterial_diamond)
    ->setTextureName(L"hatchetRuby")
    ->setDescriptionId(IDS_ITEM_HATCHET_RUBY)
    ->setUseDescriptionId(IDS_DESC_HATCHET);

Item::hoe_ruby = (new HoeItem(156, Item::Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_hoe, eMaterial_diamond)
    ->setTextureName(L"hoeRuby")
    ->setDescriptionId(IDS_ITEM_HOE_RUBY)
    ->setUseDescriptionId(IDS_DESC_HOE);
```

Each tool class (`WeaponItem`, `PickaxeItem`, `ShovelItem`, `HatchetItem`, `HoeItem`) takes the item ID and a tier reference. The `setUseDescriptionId` reuses the generic tool descriptions since "A sword" or "A pickaxe" is the same regardless of material.

## 7. Armor material and pieces

### ArmorMaterial

Armor materials define per-slot protection, durability, and enchant value. Vanilla materials for reference:

```cpp
// ArmorItem::ArmorMaterial(durabilityMultiplier, slotProtections[], enchantValue)
CLOTH   = new ArmorItem::ArmorMaterial(5,  clothArray,   15);  // leather
CHAIN   = new ArmorItem::ArmorMaterial(15, chainArray,   12);
IRON    = new ArmorItem::ArmorMaterial(15, ironArray,      9);
GOLD    = new ArmorItem::ArmorMaterial(7,  goldArray,     25);
DIAMOND = new ArmorItem::ArmorMaterial(33, diamondArray,  10);
```

The `slotProtections` array is `{helmet, chestplate, leggings, boots}`. Durability per slot is `durabilityMultiplier * baseHealth`, where base health is `{11, 16, 15, 13}`.

### ArmorItem.h

Inside the `ArmorMaterial` class (which is nested inside `ArmorItem`), add alongside the other arrays and material pointers:

```cpp
static const int rubyArray[];
static const ArmorMaterial *RUBY;
```

### ArmorItem.cpp

```cpp
const int ArmorItem::ArmorMaterial::rubyArray[] = {3, 7, 5, 3};
const ArmorItem::ArmorMaterial *ArmorItem::ArmorMaterial::RUBY =
    new ArmorItem::ArmorMaterial(25, ArmorItem::ArmorMaterial::rubyArray, 12);
```

That gives us 18 total defense (3+7+5+3), multiplier 25, enchant value 12. Between iron and diamond for both protection and durability.

| Piece | Base Health | x25 | Durability |
|-------|-----------|-----|-----------|
| Helmet | 11 | 25 | 275 |
| Chestplate | 16 | 25 | 400 |
| Leggings | 15 | 25 | 375 |
| Boots | 13 | 25 | 325 |

Add a repair check in `ArmorMaterial::getTierItemId()`:

```cpp
int ArmorMaterial::getTierItemId()
{
    // ... existing checks ...
    if (this == RUBY) return Item::ruby_Id;
    return -1;
}
```

### Armor pieces in Item.h

```cpp
static ArmorItem *helmet_ruby;
static ArmorItem *chestplate_ruby;
static ArmorItem *leggings_ruby;
static ArmorItem *boots_ruby;

static const int helmet_ruby_Id      = 413;
static const int chestplate_ruby_Id  = 414;
static const int leggings_ruby_Id    = 415;
static const int boots_ruby_Id       = 416;
```

### Armor pieces in Item.cpp

Static definitions:

```cpp
ArmorItem *Item::helmet_ruby     = NULL;
ArmorItem *Item::chestplate_ruby = NULL;
ArmorItem *Item::leggings_ruby   = NULL;
ArmorItem *Item::boots_ruby      = NULL;
```

Inside `Item::staticCtor()`:

```cpp
Item::helmet_ruby = (ArmorItem *)(
    (new ArmorItem(157, ArmorItem::ArmorMaterial::RUBY, 5, ArmorItem::SLOT_HEAD))
    ->setBaseItemTypeAndMaterial(eBaseItemType_helmet, eMaterial_diamond)
    ->setTextureName(L"helmetRuby")
    ->setDescriptionId(IDS_ITEM_HELMET_RUBY)
    ->setUseDescriptionId(IDS_DESC_HELMET_RUBY));

Item::chestplate_ruby = (ArmorItem *)(
    (new ArmorItem(158, ArmorItem::ArmorMaterial::RUBY, 5, ArmorItem::SLOT_TORSO))
    ->setBaseItemTypeAndMaterial(eBaseItemType_chestplate, eMaterial_diamond)
    ->setTextureName(L"chestplateRuby")
    ->setDescriptionId(IDS_ITEM_CHESTPLATE_RUBY)
    ->setUseDescriptionId(IDS_DESC_CHESTPLATE_RUBY));

Item::leggings_ruby = (ArmorItem *)(
    (new ArmorItem(159, ArmorItem::ArmorMaterial::RUBY, 5, ArmorItem::SLOT_LEGS))
    ->setBaseItemTypeAndMaterial(eBaseItemType_leggings, eMaterial_diamond)
    ->setTextureName(L"leggingsRuby")
    ->setDescriptionId(IDS_ITEM_LEGGINGS_RUBY)
    ->setUseDescriptionId(IDS_DESC_LEGGINGS_RUBY));

Item::boots_ruby = (ArmorItem *)(
    (new ArmorItem(160, ArmorItem::ArmorMaterial::RUBY, 5, ArmorItem::SLOT_FEET))
    ->setBaseItemTypeAndMaterial(eBaseItemType_boots, eMaterial_diamond)
    ->setTextureName(L"bootsRuby")
    ->setDescriptionId(IDS_ITEM_BOOTS_RUBY)
    ->setUseDescriptionId(IDS_DESC_BOOTS_RUBY));
```

The `ArmorItem` constructor takes `(id, material, renderIndex, slot)`. Render index `5` is a new custom slot for our ruby armor textures. The `(ArmorItem *)` cast is needed because the chained `set*` calls return `Item *`.

## 8. Recipes

### Tool recipes

In `ToolRecipies.cpp`, inside `ToolRecipies::_init()`, add after the existing gold entries:

```cpp
ADD_OBJECT(map[0], Item::ruby);
ADD_OBJECT(map[1], Item::pickAxe_ruby);
ADD_OBJECT(map[2], Item::shovel_ruby);
ADD_OBJECT(map[3], Item::hatchet_ruby);
ADD_OBJECT(map[4], Item::hoe_ruby);
```

### Weapon recipes

In `WeaponRecipies.cpp`, inside `WeaponRecipies::_init()`:

```cpp
ADD_OBJECT(map[0], Item::ruby);
ADD_OBJECT(map[1], Item::sword_ruby);
```

The recipe system auto-generates the standard stick + material patterns for you. See [Adding Recipes](/slop-docs/modding/adding-recipes/) for details on how the shaped recipe arrays work.

### Armor recipes

In `ArmorRecipes.cpp`, inside `ArmorRecipes::_init()`:

```cpp
ADD_OBJECT(map[0], Item::ruby);
ADD_OBJECT(map[1], Item::helmet_ruby);
ADD_OBJECT(map[2], Item::chestplate_ruby);
ADD_OBJECT(map[3], Item::leggings_ruby);
ADD_OBJECT(map[4], Item::boots_ruby);
```

Also update `ArmorRecipes::GetArmorType()` so quick-equip works:

```cpp
case Item::helmet_ruby_Id:
    return eArmorType_Helmet;
case Item::chestplate_ruby_Id:
    return eArmorType_Chestplate;
case Item::leggings_ruby_Id:
    return eArmorType_Leggings;
case Item::boots_ruby_Id:
    return eArmorType_Boots;
```

### Storage block recipe

In `OreRecipies.h`, bump the max:

```cpp
#define MAX_ORE_RECIPES 6  // was 5
```

In `OreRecipies.cpp`, inside `OreRecipies::_init()`:

```cpp
ADD_OBJECT(map[5], Tile::rubyBlock);
ADD_OBJECT(map[5], new ItemInstance(Item::ruby, 9));
```

This registers both directions automatically: 9 rubies in a 3x3 makes 1 block, and 1 block in the grid makes 9 rubies.

### Smelting recipe

In `FurnaceRecipes.cpp`, inside the constructor:

```cpp
addFurnaceRecipy(Tile::rubyOre_Id, new ItemInstance(Item::ruby), 1.0f);
```

The third arg is the XP reward. Vanilla uses `0.7f` for iron, `1.0f` for gold/diamond. This recipe mainly matters for silk-touched ore.

## 9. World generation

Ore generation happens in `BiomeDecorator`. The game uses `OreFeature` to place veins of a specific tile in stone underground.

### How it works

`OreFeature(tileId, veinSize)` creates a feature that replaces stone with your ore in blob-shaped clusters. The decorator then calls one of two placement methods:

**`decorateDepthSpan(count, feature, yMin, yMax)`** picks a random Y uniformly between `yMin` and `yMax`. Most ores use this.

**`decorateDepthAverage(count, feature, yCenter, ySpread)`** uses a triangular distribution centered on `yCenter`. Lapis uses this for a bell-curve effect.

Vanilla ore generation for reference:

| Ore | Vein Size | Veins/Chunk | Y Range | Method |
|-----|----------|-------------|---------|--------|
| Coal | 16 | 20 | 0-128 | depthSpan |
| Iron | 8 | 20 | 0-64 | depthSpan |
| Gold | 8 | 2 | 0-32 | depthSpan |
| Redstone | 7 | 8 | 0-16 | depthSpan |
| Diamond | 7 | 1 | 0-16 | depthSpan |
| Lapis | 6 | 1 | ~16 center | depthAverage |

Height values derive from `Level::genDepth` (128). So `/2` = 64, `/4` = 32, `/8` = 16.

### BiomeDecorator.h

Add the feature pointer in the protected section:

```cpp
Feature *rubyOreFeature;
```

### BiomeDecorator.cpp

Inside `_init()`:

```cpp
rubyOreFeature = new OreFeature(Tile::rubyOre_Id, 4);
```

Vein size 4 means small clusters. Diamond uses 7 for comparison.

Inside `decorateOres()`, before `level->setInstaTick(false)`:

```cpp
decorateDepthSpan(1, rubyOreFeature, 0, Level::genDepth / 8);
```

That is 1 vein attempt per chunk, from Y=0 to Y=16. Small veins, low generation rate, deep underground only. Rubies will be rare. Bump the first arg (vein count) or the Y range to make them more common.

For more on custom generation including biome-specific spawning, see [Custom World Generation](/slop-docs/modding/custom-worldgen/).

:::note[Existing worlds]
Ore generation only runs when new chunks are created. If you load an existing world, you will only find rubies in chunks you have not explored yet.
:::

## 10. Textures

Every `setTextureName()` call maps to a real texture file. You need to provide all of these.

### Block textures (terrain atlas)

| Texture name | Description |
|-------------|------------|
| `oreRuby` | Ruby ore block face |
| `blockRuby` | Ruby storage block face |

### Item textures (items atlas)

| Texture name | Description |
|-------------|------------|
| `ruby` | Ruby gem icon |
| `swordRuby` | Ruby sword icon |
| `shovelRuby` | Ruby shovel icon |
| `pickaxeRuby` | Ruby pickaxe icon |
| `hatchetRuby` | Ruby axe icon |
| `hoeRuby` | Ruby hoe icon |
| `helmetRuby` | Ruby helmet icon |
| `chestplateRuby` | Ruby chestplate icon |
| `leggingsRuby` | Ruby leggings icon |
| `bootsRuby` | Ruby boots icon |

### Armor model textures

Armor also needs two model layer images that render on the player body. Layer 1 covers helmet, chestplate, and boots. Layer 2 covers leggings. The render index `5` we used in the ArmorItem constructors tells the renderer which layer files to look for.

See [Block Textures](/slop-docs/modding/block-textures/) and [Texture Packs](/slop-docs/modding/texture-packs/) for atlas file paths and format details.

## 11. String table entries

Every `setDescriptionId()` and `setUseDescriptionId()` references a string constant. Add all of these to your string table header:

```
IDS_TILE_RUBY_ORE         / IDS_DESC_RUBY_ORE
IDS_TILE_RUBY_BLOCK       / IDS_DESC_RUBY_BLOCK
IDS_ITEM_RUBY             / IDS_DESC_RUBY
IDS_ITEM_SWORD_RUBY
IDS_ITEM_SHOVEL_RUBY
IDS_ITEM_PICKAXE_RUBY
IDS_ITEM_HATCHET_RUBY
IDS_ITEM_HOE_RUBY
IDS_ITEM_HELMET_RUBY      / IDS_DESC_HELMET_RUBY
IDS_ITEM_CHESTPLATE_RUBY  / IDS_DESC_CHESTPLATE_RUBY
IDS_ITEM_LEGGINGS_RUBY    / IDS_DESC_LEGGINGS_RUBY
IDS_ITEM_BOOTS_RUBY       / IDS_DESC_BOOTS_RUBY
```

Tool description IDs (`IDS_DESC_SWORD`, `IDS_DESC_PICKAXE`, etc.) are reused from vanilla since the description text is the same for every material.

## 12. Build system

Add your new source file to `cmake/Sources.cmake` under `MINECRAFT_WORLD_SOURCES`:

```cmake
"RubyOreTile.cpp"
```

Only `.cpp` files go in Sources.cmake. Headers are found through `#include` directives.

## File checklist

Here is every file this template touches, in order:

| File | Change |
|------|--------|
| `Minecraft.World/RubyOreTile.h` | **New file** |
| `Minecraft.World/RubyOreTile.cpp` | **New file** |
| `Minecraft.World/Tile.h` | Add `rubyOre`, `rubyBlock` pointers + IDs |
| `Minecraft.World/Tile.cpp` | Static defs, `const int` defs, `staticCtor()` registration |
| `Minecraft.World/Item.h` | Add gem, tools, armor pointers + IDs, `Item::Tier::RUBY` |
| `Minecraft.World/Item.cpp` | Static defs, `Item::Tier::RUBY` def, `staticCtor()` registration, `getTierItemId()` |
| `Minecraft.World/ArmorItem.h` | Add `ArmorItem::ArmorMaterial::RUBY` + `rubyArray` |
| `Minecraft.World/ArmorItem.cpp` | Define armor material, update `getTierItemId()` |
| `Minecraft.World/ToolRecipies.cpp` | Add ruby to tool recipe arrays |
| `Minecraft.World/WeaponRecipies.cpp` | Add ruby to weapon recipe arrays |
| `Minecraft.World/ArmorRecipes.cpp` | Add ruby to armor arrays + `GetArmorType()` |
| `Minecraft.World/OreRecipies.h` | Bump `MAX_ORE_RECIPES` to 6 |
| `Minecraft.World/OreRecipies.cpp` | Add ruby block recipe |
| `Minecraft.World/FurnaceRecipes.cpp` | Add ruby ore smelting |
| `Minecraft.World/BiomeDecorator.h` | Add `rubyOreFeature` pointer |
| `Minecraft.World/BiomeDecorator.cpp` | Create feature, add to `decorateOres()` |
| `cmake/Sources.cmake` | Add new source files |

## Build and test

Build the project:

```bash
cmake --build build --config Release
```

Load a **new world** (existing chunks will not have ruby ore). Verify all of these work:

1. Ruby ore spawns below Y=16
2. Mining it drops rubies and XP orbs (3-7 XP)
3. Fortune increases ruby drops
4. Silk Touch drops the ore block itself
5. Ruby ore smelts into a ruby in the furnace
6. 9 rubies craft into a ruby block and back
7. All 5 tools craft correctly at a workbench
8. All 4 armor pieces craft correctly
9. Tools and armor can be repaired with rubies on an anvil
10. Tool durability, speed, and damage feel right

If nothing spawns, double-check that you made a new world. Existing chunks will not have ruby ore.

## Making it your own

To turn this into a different material (sapphire, amethyst, titanium, whatever):

1. Find-and-replace `Ruby`/`ruby` with your material name
2. Pick new unused IDs in the same ranges
3. Adjust the tier numbers (`Tier` constructor) for your desired balance
4. Adjust the armor material numbers for protection and durability
5. Change the XP range in `spawnResources()` if you want
6. Change vein size and Y range in `BiomeDecorator` for rarity
7. Create your own textures
8. Update all string table entries

The structure stays identical. Only the names and numbers change.

## Related docs

- [Adding Blocks](/slop-docs/modding/adding-blocks/)
- [Adding Items](/slop-docs/modding/adding-items/)
- [Adding Recipes](/slop-docs/modding/adding-recipes/)
- [Custom World Generation](/slop-docs/modding/custom-worldgen/)
- [Block Textures](/slop-docs/modding/block-textures/)
- [Texture Packs](/slop-docs/modding/texture-packs/)
- [Full Ore Guide](/slop-docs/modding/full-ore/) (longer version with more background)

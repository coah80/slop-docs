---
title: Making a Full Ore
description: End-to-end tutorial for adding a completely new ore to LCE, from block to tools to armor.
---

This is the big one. We are going to add a brand new ore to the game from absolute scratch. By the end of this guide you will have:

- A **ruby ore** block that spawns underground
- A **ruby gem** item that drops when you mine it
- A **ruby block** for storage (9 rubies = 1 block)
- A full set of **ruby tools** (sword, pickaxe, shovel, axe, hoe)
- A full set of **ruby armor** (helmet, chestplate, leggings, boots)
- **Smelting** and **crafting recipes** for everything
- **World generation** so rubies actually show up in your world

It is a lot of steps, but each one is small. Let's go.

## Before you start

Make sure you can build the project. See [Getting Started](/slop-docs/modding/getting-started/) if you have not done that yet. You will also want to be familiar with [Adding Blocks](/slop-docs/modding/adding-blocks/) and [Adding Items](/slop-docs/modding/adding-items/) since this guide builds on both of those.

## Step 1: Pick your IDs

Every tile and item needs a unique numeric ID. Tiles use IDs 0 through 4095. Items use IDs that start at 256 internally (the constructor adds 256 to whatever you pass in).

For this guide we will use:

| Thing | Type | ID constant |
|---|---|---|
| Ruby Ore block | Tile | `160` |
| Ruby Block | Tile | `161` |
| Ruby gem | Item | `407` (pass `151` to constructor) |
| Ruby Sword | Item | `408` (pass `152`) |
| Ruby Shovel | Item | `409` (pass `153`) |
| Ruby Pickaxe | Item | `410` (pass `154`) |
| Ruby Axe | Item | `411` (pass `155`) |
| Ruby Hoe | Item | `412` (pass `156`) |
| Ruby Helmet | Item | `413` (pass `157`) |
| Ruby Chestplate | Item | `414` (pass `158`) |
| Ruby Leggings | Item | `415` (pass `159`) |
| Ruby Boots | Item | `416` (pass `160`) |

Check your codebase to make sure these are not already taken. Look through `Tile.h` and `Item.h` for existing ID constants.

## Step 2: Create the ore block

The ore block is a `Tile` subclass. In LCE, the existing ores (coal, iron, gold, diamond, emerald) all use the `OreTile` class. We could add our ruby to that class, but for a mod it is cleaner to make our own.

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
    // Drop the ruby gem item, not the ore block itself
    return Item::ruby_Id;
}

int RubyOreTile::getResourceCount(Random *random)
{
    return 1;
}

int RubyOreTile::getResourceCountForLootBonus(int bonusLevel, Random *random)
{
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

    // Drop experience orbs when mined (like diamond/emerald)
    int xpAmount = Mth::nextInt(level->random, 3, 7);
    popExperience(level, x, y, z, xpAmount);
}

int RubyOreTile::getSpawnResourcesAuxValue(int data)
{
    return 0;
}
```

This follows the same pattern as the real `OreTile` class. The key methods are:

- **`getResource()`** returns the item ID that drops when you break the block. We return `Item::ruby_Id` so it drops a ruby gem instead of the ore block itself.
- **`getResourceCount()`** returns how many items drop. 1 is standard for most ores.
- **`getResourceCountForLootBonus()`** handles the Fortune enchantment. The formula is the same one `OreTile` uses: if Fortune level is > 0, roll `nextInt(level + 2) - 1`, clamp to 0, and multiply by the base count.
- **`spawnResources()`** calls the parent first (which spawns the item drops), then spawns experience orbs. `Mth::nextInt(level->random, 3, 7)` gives 3 to 7 XP, same range as diamond and emerald ore.
- **`getSpawnResourcesAuxValue()`** returns the aux/data value for the dropped item. We return 0 (no variant). Lapis ore returns `DyePowderItem::BLUE` here since it drops blue dye.

### How existing ores do it

For reference, here is how the real `OreTile::getResource()` works:

```cpp
int OreTile::getResource(int data, Random *random, int playerBonusLevel)
{
    if (id == Tile::coalOre_Id) return Item::coal_Id;
    if (id == Tile::diamondOre_Id) return Item::diamond_Id;
    if (id == Tile::lapisOre_Id) return Item::dye_powder_Id;
    if (id == Tile::emeraldOre_Id) return Item::emerald_Id;
    if (id == Tile::netherQuartz_Id) return Item::netherQuartz_Id;
    return id;  // iron and gold drop themselves (need smelting)
}
```

Notice that iron and gold return `id` (the ore block itself) because they need to be smelted into ingots. Our ruby drops a gem directly, like diamond.

### XP values per ore type

The real `OreTile::spawnResources()` only drops XP when the drop item is different from the block itself (so iron and gold ore give no XP). Here are the ranges:

| Ore | XP Range |
|-----|---------|
| Coal | 0-2 |
| Diamond | 3-7 |
| Emerald | 3-7 |
| Lapis | 2-5 |
| Nether Quartz | 2-5 |
| Iron/Gold | 0 (drops the block itself) |

We went with 3-7 for ruby to match diamond.

## Step 3: Register the ore block in Tile

### In Tile.h

Add the forward declaration and static members:

```cpp
// Near the top, with other forward declarations
class RubyOreTile;

// Inside the Tile class, with other static tile pointers
static Tile *rubyOre;
static const int rubyOre_Id = 160;

// Ruby storage block (like diamond block / iron block)
static Tile *rubyBlock;
static const int rubyBlock_Id = 161;
```

### In Tile.cpp

Add the static definitions near the other `Tile *` definitions:

```cpp
Tile *Tile::rubyOre = NULL;
Tile *Tile::rubyBlock = NULL;
```

Then inside `Tile::staticCtor()`, register both blocks:

```cpp
// Ruby Ore - same hardness as other ores (3.0 destroy, 5.0 blast)
Tile::rubyOre = (new RubyOreTile(160))
    ->setDestroyTime(3.0f)
    ->setExplodeable(5)
    ->setSoundType(Tile::SOUND_STONE)
    ->setTextureName(L"oreRuby")
    ->setDescriptionId(IDS_TILE_RUBY_ORE)
    ->setUseDescriptionId(IDS_DESC_RUBY_ORE);

// Ruby Block - storage block, same stats as diamond block
Tile::rubyBlock = (new MetalTile(161))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_block, Item::eMaterial_diamond)
    ->setDestroyTime(5.0f)
    ->setExplodeable(10)
    ->setSoundType(Tile::SOUND_METAL)
    ->setTextureName(L"blockRuby")
    ->setDescriptionId(IDS_TILE_RUBY_BLOCK)
    ->setUseDescriptionId(IDS_DESC_RUBY_BLOCK);
```

The ruby block uses `MetalTile` just like the gold block and diamond block do. It is a simple solid block with no special behavior.

Also add the `const int` definitions at the bottom of `Tile.cpp` with the others:

```cpp
const int Tile::rubyOre_Id;
const int Tile::rubyBlock_Id;
```

## Step 4: Create the ruby gem item

The ruby gem is a plain `Item`, just like diamond and emerald.

### In Item.h

Add the static pointer and ID constant:

```cpp
// With other static Item pointers
static Item *ruby;

// With other ID constants
static const int ruby_Id = 407;
```

### In Item.cpp

Add the static definition:

```cpp
Item *Item::ruby = NULL;
```

Then inside `Item::staticCtor()`:

```cpp
Item::ruby = (new Item(151))
    ->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_diamond)
    ->setTextureName(L"ruby")
    ->setDescriptionId(IDS_ITEM_RUBY)
    ->setUseDescriptionId(IDS_DESC_RUBY);
```

The constructor takes `151` because the `Item` constructor adds 256 internally, giving us final ID `407`. The `eMaterial_diamond` puts it in the same creative inventory category as other gems.

For comparison, here is how diamond and emerald are registered:

```cpp
Item::diamond = (new Item(8))       // 256 + 8 = 264
    ->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_diamond)
    ->setTextureName(L"diamond")
    ->setDescriptionId(IDS_ITEM_DIAMOND)
    ->setUseDescriptionId(IDS_DESC_DIAMONDS);

Item::emerald = (new Item(132))     // 256 + 132 = 388
    ->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_emerald)
    ->setTextureName(L"emerald")
    ->setDescriptionId(IDS_ITEM_EMERALD)
    ->setUseDescriptionId(IDS_DESC_EMERALD);
```

Same pattern. Nothing fancy.

## Step 5: Define a tool tier

Tool tiers control how fast tools mine, how much damage they deal, how durable they are, and how well they enchant. The existing tiers are defined in `Item.cpp`:

```cpp
const _Tier *_Tier::WOOD    = new _Tier(0,   59,  2, 0, 15);
const _Tier *_Tier::STONE   = new _Tier(1,  131,  4, 1,  5);
const _Tier *_Tier::IRON    = new _Tier(2,  250,  6, 2, 14);
const _Tier *_Tier::DIAMOND = new _Tier(3, 1561,  8, 3, 10);
const _Tier *_Tier::GOLD    = new _Tier(0,   32, 12, 0, 22);
```

The `Tier` constructor takes five arguments:

| Parameter | What it does |
|---|---|
| `level` | Mining level (0 = wood/gold, 1 = stone, 2 = iron, 3 = diamond) |
| `uses` | Durability (number of uses before the tool breaks) |
| `speed` | Mining speed multiplier |
| `damage` | Base attack damage bonus |
| `enchantmentValue` | How well it takes enchantments (higher = better) |

For ruby, let's make a tier between iron and diamond:

### In Item.h

Inside the `Tier` class, add a new static constant:

```cpp
static const Tier *RUBY;
```

### In Item.cpp

Add the tier definition with the others:

```cpp
const _Tier *_Tier::RUBY = new _Tier(2, 750, 7, 2, 12);
```

This gives ruby:
- Mining level 2 (same as iron, can mine everything iron can)
- 750 durability (between iron's 250 and diamond's 1561)
- Speed 7 (between iron's 6 and diamond's 8)
- Damage bonus 2 (same as iron)
- Enchantment value 12 (decent)

Feel free to tweak these numbers to whatever feels right for your mod.

### Repair item

The `Tier::getTierItemId()` method uses pointer identity checks to find the repair item. For built-in tiers (WOOD, STONE, IRON, DIAMOND, GOLD), it returns the right item. For custom tiers like RUBY, it returns `-1` by default.

To make ruby tools repairable with rubies, you have two options:

1. **Override `isValidRepairItem()`** on each tool class to check for `Item::ruby`.
2. **Add a check to `getTierItemId()`** in `Item.cpp`:

```cpp
int Tier::getTierItemId()
{
    // ... existing checks ...
    if (this == RUBY) return Item::ruby_Id;
    return -1;
}
```

Option 2 is simpler since it covers all tools that use the RUBY tier at once.

## Step 6: Define an armor material

Armor materials work similarly to tool tiers. They are defined in `ArmorItem.cpp`:

```cpp
const _ArmorMaterial *_ArmorMaterial::CLOTH   = new _ArmorMaterial(5,  clothArray,   15);
const _ArmorMaterial *_ArmorMaterial::CHAIN   = new _ArmorMaterial(15, chainArray,   12);
const _ArmorMaterial *_ArmorMaterial::IRON    = new _ArmorMaterial(15, ironArray,      9);
const _ArmorMaterial *_ArmorMaterial::GOLD    = new _ArmorMaterial(7,  goldArray,     25);
const _ArmorMaterial *_ArmorMaterial::DIAMOND = new _ArmorMaterial(33, diamondArray,  10);
```

The `ArmorMaterial` constructor takes:

| Parameter | What it does |
|---|---|
| `durabilityMultiplier` | Multiplied by per-slot base health to get total durability |
| `slotProtections[]` | Array of 4 defense values: {helmet, chestplate, leggings, boots} |
| `enchantmentValue` | How well it takes enchantments |

The per-slot base health values are `{11, 16, 15, 13}` for helmet, chestplate, leggings, boots. So an iron chestplate has `16 * 15 = 240` durability.

### In ArmorItem.h

Inside the `ArmorMaterial` class:

```cpp
static const int rubyArray[];
static const ArmorMaterial *RUBY;
```

### In ArmorItem.cpp

```cpp
const int _ArmorMaterial::rubyArray[] = {3, 7, 5, 3};
const _ArmorMaterial *_ArmorMaterial::RUBY = new _ArmorMaterial(25, _ArmorMaterial::rubyArray, 12);
```

This gives ruby armor:
- 18 total defense (between iron's 15 and diamond's 20)
- Durability multiplier of 25 (between iron's 15 and diamond's 33)
- Enchantment value of 12

### Resulting durability

| Piece | Base Health | Multiplier | Total Durability |
|-------|-------------|-----------|-----------------|
| Ruby Helmet | 11 | 25 | 275 |
| Ruby Chestplate | 16 | 25 | 400 |
| Ruby Leggings | 15 | 25 | 375 |
| Ruby Boots | 13 | 25 | 325 |

### Repair item

Just like tool tiers, `ArmorMaterial::getTierItemId()` uses pointer identity checks. Add a check for RUBY:

```cpp
int ArmorMaterial::getTierItemId()
{
    // ... existing checks ...
    if (this == RUBY) return Item::ruby_Id;
    return -1;
}
```

## Step 7: Create the tools

Now we register all five ruby tools. Each tool type is a different class:

| Tool | Class | Base Attack Damage | Total Damage (with +2 tier bonus) |
|---|---|---|---|
| Sword | `WeaponItem` | 4 | 6 |
| Pickaxe | `PickaxeItem` | 2 | 4 |
| Shovel | `ShovelItem` | 1 | 3 |
| Axe | `HatchetItem` | 3 | 5 |
| Hoe | `HoeItem` | N/A | N/A |

### In Item.h

Add the static pointers and IDs:

```cpp
// Ruby tools
static Item *sword_ruby;
static Item *shovel_ruby;
static Item *pickAxe_ruby;
static Item *hatchet_ruby;
static Item *hoe_ruby;

// Ruby tool IDs
static const int sword_ruby_Id    = 408;
static const int shovel_ruby_Id   = 409;
static const int pickAxe_ruby_Id  = 410;
static const int hatchet_ruby_Id  = 411;
static const int hoe_ruby_Id      = 412;
```

### In Item.cpp

Add the static definitions:

```cpp
Item *Item::sword_ruby   = NULL;
Item *Item::shovel_ruby  = NULL;
Item *Item::pickAxe_ruby = NULL;
Item *Item::hatchet_ruby = NULL;
Item *Item::hoe_ruby     = NULL;
```

Then register them inside `Item::staticCtor()`:

```cpp
Item::sword_ruby    = (new WeaponItem(152, _Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_sword, eMaterial_diamond)
    ->setTextureName(L"swordRuby")
    ->setDescriptionId(IDS_ITEM_SWORD_RUBY)
    ->setUseDescriptionId(IDS_DESC_SWORD);

Item::shovel_ruby   = (new ShovelItem(153, _Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_shovel, eMaterial_diamond)
    ->setTextureName(L"shovelRuby")
    ->setDescriptionId(IDS_ITEM_SHOVEL_RUBY)
    ->setUseDescriptionId(IDS_DESC_SHOVEL);

Item::pickAxe_ruby  = (new PickaxeItem(154, _Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_pickaxe, eMaterial_diamond)
    ->setTextureName(L"pickaxeRuby")
    ->setDescriptionId(IDS_ITEM_PICKAXE_RUBY)
    ->setUseDescriptionId(IDS_DESC_PICKAXE);

Item::hatchet_ruby  = (new HatchetItem(155, _Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_hatchet, eMaterial_diamond)
    ->setTextureName(L"hatchetRuby")
    ->setDescriptionId(IDS_ITEM_HATCHET_RUBY)
    ->setUseDescriptionId(IDS_DESC_HATCHET);

Item::hoe_ruby      = (new HoeItem(156, _Tier::RUBY))
    ->setBaseItemTypeAndMaterial(eBaseItemType_hoe, eMaterial_diamond)
    ->setTextureName(L"hoeRuby")
    ->setDescriptionId(IDS_ITEM_HOE_RUBY)
    ->setUseDescriptionId(IDS_DESC_HOE);
```

Notice how the `setUseDescriptionId` reuses the existing tool description IDs (`IDS_DESC_SWORD`, `IDS_DESC_PICKAXE`, etc.). The description that says "A sword" or "A pickaxe" is the same for every material. You only need new IDs for the item name itself.

## Step 8: Create the armor

Armor pieces use the `ArmorItem` class. Each piece needs an armor material, a render index, and a slot constant.

### In Item.h

```cpp
// Ruby armor
static ArmorItem *helmet_ruby;
static ArmorItem *chestplate_ruby;
static ArmorItem *leggings_ruby;
static ArmorItem *boots_ruby;

// Ruby armor IDs
static const int helmet_ruby_Id      = 413;
static const int chestplate_ruby_Id  = 414;
static const int leggings_ruby_Id    = 415;
static const int boots_ruby_Id       = 416;
```

### In Item.cpp

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

The `ArmorItem` constructor takes `(id, material, renderIndex, slot)`. The `renderIndex` controls which armor texture layer is used for rendering. Pick `5` for a new custom layer (existing materials use 0 through 4).

The `(ArmorItem *)` cast is needed because the chained `set*` methods return `Item *`, but the static pointer is `ArmorItem *`.

## Step 9: Add crafting recipes

### Tool recipes

The easy way is to plug into the existing `ToolRecipies` and `WeaponRecipies` systems. These loop over parallel arrays of materials and tool items.

In `ToolRecipies.cpp`, inside `ToolRecipies::_init()`, add a sixth material column:

```cpp
// After the existing ADD_OBJECT lines for gold:
ADD_OBJECT(map[0], Item::ruby);          // material

ADD_OBJECT(map[1], Item::pickAxe_ruby);  // pickaxe
ADD_OBJECT(map[2], Item::shovel_ruby);   // shovel
ADD_OBJECT(map[3], Item::hatchet_ruby);  // axe
ADD_OBJECT(map[4], Item::hoe_ruby);      // hoe
```

In `WeaponRecipies.cpp`, inside `WeaponRecipies::_init()`:

```cpp
ADD_OBJECT(map[0], Item::ruby);          // material
ADD_OBJECT(map[1], Item::sword_ruby);    // sword
```

The recipe system will automatically create the standard shaped recipes (stick + material in the right pattern) for all your tools. Since `Item::ruby` is an `Item *` (not a `Tile *`), the Object class will tag it as `eType_ITEM`, and the loop will use `i` in the type string. This means ruby tools need exact rubies (no aux value wildcard), which is what you want.

### Armor recipes

Same idea. In `ArmorRecipes.cpp`, inside `ArmorRecipes::_init()`:

```cpp
ADD_OBJECT(map[0], Item::ruby);            // material
ADD_OBJECT(map[1], Item::helmet_ruby);     // helmet
ADD_OBJECT(map[2], Item::chestplate_ruby); // chestplate
ADD_OBJECT(map[3], Item::leggings_ruby);   // leggings
ADD_OBJECT(map[4], Item::boots_ruby);      // boots
```

Also update `ArmorRecipes::GetArmorType()` to recognize the new IDs so quick equip works:

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

### Storage block recipe (9 rubies = 1 block)

In `OreRecipies.h`, bump `MAX_ORE_RECIPES` from 5 to 6:

```cpp
#define MAX_ORE_RECIPES 6
```

In `OreRecipies.cpp`, inside `OreRecipies::_init()`, add:

```cpp
ADD_OBJECT(map[5], Tile::rubyBlock);
ADD_OBJECT(map[5], new ItemInstance(Item::ruby, 9));
```

This automatically creates both directions: 9 rubies in a 3x3 grid makes 1 ruby block, and 1 ruby block in a 1x1 grid makes 9 rubies. The `addRecipes()` loop handles both.

## Step 10: Add the smelting recipe

If you want ruby ore to be smeltable (for example, when silk-touched), add a furnace recipe.

In `FurnaceRecipes.cpp`, inside the `FurnaceRecipes` constructor:

```cpp
addFurnaceRecipy(Tile::rubyOre_Id, new ItemInstance(Item::ruby), 1.0f);
```

The third argument is the experience value. Iron gives `0.7f`, gold and diamond give `1.0f`. Using `1.0f` makes sense for a rare gem.

For reference, here is how the existing ore smelting recipes look:

```cpp
addFurnaceRecipy(Tile::ironOre_Id,    new ItemInstance(Item::ironIngot), .7f);
addFurnaceRecipy(Tile::goldOre_Id,    new ItemInstance(Item::goldIngot), 1);
addFurnaceRecipy(Tile::diamondOre_Id, new ItemInstance(Item::diamond),   1);
addFurnaceRecipy(Tile::emeraldOre_Id, new ItemInstance(Item::emerald),   1);
```

## Step 11: Add world generation

This is where your ore actually shows up in the ground. The game uses `OreFeature` to scatter ore veins through chunks, and `BiomeDecorator` controls where and how often.

### How OreFeature works

`OreFeature` takes a tile ID and a vein size:

```cpp
OreFeature(int tile, int count);
```

The `count` is the maximum number of blocks in a single vein. For reference, here are all the existing ore features:

| Ore | Vein Size | Veins/Chunk | Height Range | Method |
|-----|----------|-------------|-------------|--------|
| Dirt | 32 | 20 | 0 to 128 | `decorateDepthSpan` |
| Gravel | 32 | 10 | 0 to 128 | `decorateDepthSpan` |
| Coal | 16 | 20 | 0 to 128 | `decorateDepthSpan` |
| Iron | 8 | 20 | 0 to 64 | `decorateDepthSpan` |
| Gold | 8 | 2 | 0 to 32 | `decorateDepthSpan` |
| Redstone | 7 | 8 | 0 to 16 | `decorateDepthSpan` |
| Diamond | 7 | 1 | 0 to 16 | `decorateDepthSpan` |
| Lapis | 6 | 1 | centered on 16 | `decorateDepthAverage` |

Height values are based on `Level::genDepth` which is 128. So `Level::genDepth / 2` is 64, `Level::genDepth / 4` is 32, `Level::genDepth / 8` is 16.

### Adding ruby to BiomeDecorator

In `BiomeDecorator.h`, add a new feature pointer in the protected section:

```cpp
Feature *rubyOreFeature;
```

In `BiomeDecorator.cpp`, inside `_init()`:

```cpp
rubyOreFeature = new OreFeature(Tile::rubyOre_Id, 4);
```

A vein size of 4 makes ruby pretty rare per vein (smaller than diamond's 7).

Then inside `decorateOres()`, add the generation call. Put it after the existing ore lines but before `level->setInstaTick(false)`:

```cpp
decorateDepthSpan(1, rubyOreFeature, 0, Level::genDepth / 8);
```

This generates 1 vein attempt per chunk, between Y=0 and Y=16. Same height range as diamond but with a smaller vein size. Rubies will be rare.

### The two placement methods

`BiomeDecorator` has two methods for placing ore at different height distributions:

**`decorateDepthSpan(count, feature, y0, y1)`** picks a random Y between `y0` and `y1` with a uniform distribution. Most ores use this.

```cpp
// Uniform distribution between y0 and y1
int y = random->nextInt(y1 - y0) + y0;
```

**`decorateDepthAverage(count, feature, yMid, ySpan)`** uses a triangular distribution centered on `yMid`. Lapis uses this. The Y value clusters around the center and gets rarer toward the edges.

```cpp
// Triangular distribution centered on yMid
int y = random->nextInt(ySpan) + random->nextInt(ySpan) + (yMid - ySpan);
```

Pick whichever distribution makes sense for your ore. For ruby we went with the simpler uniform span.

### Biome-specific generation

If you want your ore to only spawn in certain biomes (like emerald only spawns in extreme hills), you can skip `BiomeDecorator` and add generation directly in the biome's `decorate()` method instead.

Here is how emerald does it in `ExtremeHillsBiome.cpp`:

```cpp
void ExtremeHillsBiome::decorate(Level *level, Random *random, int xo, int zo)
{
    Biome::decorate(level, random, xo, zo);

    int emeraldCount = 3 + random->nextInt(6);
    for (int d = 0; d < emeraldCount; d++)
    {
        int x = xo + random->nextInt(16);
        int y = random->nextInt((Level::genDepth / 4) - 4) + 4;
        int z = zo + random->nextInt(16);
        int tile = level->getTile(x, y, z);
        if (tile == Tile::rock_Id)
        {
            level->setTileNoUpdate(x, y, z, Tile::emeraldOre_Id);
        }
    }
}
```

This places emerald ore directly by replacing stone blocks, without using `OreFeature` at all. It is a simpler approach when you want single-block deposits instead of veins.

## Step 12: Textures

You need textures for every new block and item. The texture names you passed to `setTextureName()` map to actual image files in the texture atlas.

### Block textures needed

| Texture name | What it is |
|---|---|
| `oreRuby` | The ruby ore block face |
| `blockRuby` | The ruby storage block face |

### Item textures needed

| Texture name | What it is |
|---|---|
| `ruby` | The ruby gem item |
| `swordRuby` | Ruby sword |
| `shovelRuby` | Ruby shovel |
| `pickaxeRuby` | Ruby pickaxe |
| `hatchetRuby` | Ruby axe |
| `hoeRuby` | Ruby hoe |
| `helmetRuby` | Ruby helmet |
| `chestplateRuby` | Ruby chestplate |
| `leggingsRuby` | Ruby leggings |
| `bootsRuby` | Ruby boots |

Block textures go in the terrain atlas and item textures go in the items atlas. See the texture packs documentation for the exact file paths on your target platform.

### Armor model textures

Armor also needs model textures that get rendered on the player body. These are separate from the inventory icon textures. You will need two armor layer images (layer 1 for helmet/chestplate/boots, layer 2 for leggings). The render index `5` we picked earlier tells the renderer to look for these custom layer files.

## Step 13: String IDs

Every `setDescriptionId()` and `setUseDescriptionId()` call references a string constant from the string table. You need to add entries for all the new names:

- `IDS_TILE_RUBY_ORE` / `IDS_DESC_RUBY_ORE`
- `IDS_TILE_RUBY_BLOCK` / `IDS_DESC_RUBY_BLOCK`
- `IDS_ITEM_RUBY` / `IDS_DESC_RUBY`
- `IDS_ITEM_SWORD_RUBY`
- `IDS_ITEM_SHOVEL_RUBY`
- `IDS_ITEM_PICKAXE_RUBY`
- `IDS_ITEM_HATCHET_RUBY`
- `IDS_ITEM_HOE_RUBY`
- `IDS_ITEM_HELMET_RUBY` / `IDS_DESC_HELMET_RUBY`
- `IDS_ITEM_CHESTPLATE_RUBY` / `IDS_DESC_CHESTPLATE_RUBY`
- `IDS_ITEM_LEGGINGS_RUBY` / `IDS_DESC_LEGGINGS_RUBY`
- `IDS_ITEM_BOOTS_RUBY` / `IDS_DESC_BOOTS_RUBY`

These go in the string table header. The exact location depends on your platform, but look at how existing string IDs are defined and follow the same pattern.

## Step 14: Update umbrella headers and cmake

### Add to the umbrella header

Open `Minecraft.World/net.minecraft.world.level.tile.h` and add your ore tile header:

```cpp
#include "RubyOreTile.h"
```

This lets any `.cpp` file that includes the tile umbrella header see your new class. Without this, you will get "no such file or directory" errors when `Tile.cpp` tries to use `RubyOreTile`.

### Add to Sources.cmake

Add your new `.cpp` file to `cmake/Sources.cmake` in the `MINECRAFT_WORLD_SOURCES` list:

```cmake
"RubyOreTile.cpp"
```

Only `.cpp` files go in `Sources.cmake`, not headers. CMake prepends the `Minecraft.World/` directory automatically, so you just write the filename. After changing `Sources.cmake`, re-run CMake to regenerate the build:

```bash
cd build
cmake ..
```

## Build and test

Rebuild the project and load up a new world. You should be able to:

1. Find ruby ore underground (below Y=16)
2. Mine it and get ruby gems (with 3-7 XP)
3. Craft ruby tools and armor at a workbench
4. Smelt ruby ore in a furnace (for silk-touched ore)
5. Compact 9 rubies into a ruby block and back
6. Repair ruby tools and armor on an anvil with rubies

If ore is not showing up, make sure you created a **new world** after adding the generation code. Existing chunks that were already generated will not have ruby ore in them.

## Quick reference: files you touched

| File | What you changed |
|---|---|
| `Minecraft.World/RubyOreTile.h` | New file (ore block class) |
| `Minecraft.World/RubyOreTile.cpp` | New file (ore block implementation) |
| `Minecraft.World/net.minecraft.world.level.tile.h` | Added `#include "RubyOreTile.h"` |
| `Minecraft.World/Tile.h` | Added `rubyOre`, `rubyBlock` pointers and IDs |
| `Minecraft.World/Tile.cpp` | Registered both blocks in `staticCtor()` |
| `Minecraft.World/Item.h` | Added ruby gem + all tool/armor pointers and IDs, plus `Tier::RUBY` |
| `Minecraft.World/Item.cpp` | Registered all items in `staticCtor()`, defined `_Tier::RUBY` |
| `Minecraft.World/ArmorItem.h` | Added `ArmorMaterial::RUBY` and `rubyArray` |
| `Minecraft.World/ArmorItem.cpp` | Defined the ruby armor material |
| `Minecraft.World/ToolRecipies.cpp` | Added ruby to tool recipe arrays |
| `Minecraft.World/WeaponRecipies.cpp` | Added ruby to weapon recipe arrays |
| `Minecraft.World/ArmorRecipes.cpp` | Added ruby to armor recipe arrays + `GetArmorType()` |
| `Minecraft.World/OreRecipies.h` | Bumped `MAX_ORE_RECIPES` to 6 |
| `Minecraft.World/OreRecipies.cpp` | Added ruby block recipe |
| `Minecraft.World/FurnaceRecipes.cpp` | Added ruby ore smelting recipe |
| `Minecraft.World/BiomeDecorator.h` | Added `rubyOreFeature` pointer |
| `Minecraft.World/BiomeDecorator.cpp` | Created feature and added to `decorateOres()` |
| `cmake/Sources.cmake` | Added new source files |

## Related guides

- [Adding Blocks](/slop-docs/modding/adding-blocks/) for more details on the tile system
- [Adding Items](/slop-docs/modding/adding-items/) for more details on the item system
- [Adding Recipes](/slop-docs/modding/adding-recipes/) for the full recipe type string encoding
- [Custom World Generation](/slop-docs/modding/custom-worldgen/) for more generation options

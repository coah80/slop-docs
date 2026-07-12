---
title: Adding Items
description: Step-by-step guide to adding new items to LCE.
---

Items in LCE are managed by the `Item` class defined in `Minecraft.World/Item.h`. Every holdable object (tools, food, materials, armor) is an `Item` subclass registered in `Item::staticCtor()`. This guide covers how to create and register new items based on the actual source code.

## Overview of the item system

The `Item` base class gives you:

- A **numeric ID** where the constructor parameter is offset by 256 (so `new Item(4)` creates ID 260)
- **Properties** like max stack size, max damage (durability), texture, and description
- **Virtual methods** for behavior: `use()`, `useOn()`, `hurtEnemy()`, `mineBlock()`, and more
- **Classification** through `eBaseItemType` and `eMaterial` enums for creative inventory sorting

All items are stored in `Item::items`, an `ItemArray` of size 32000:

```cpp
Item::Item(int id) : id( 256 + id )
{
    maxStackSize = 64;  // MAX_STACK_SIZE from Container
    maxDamage = 0;
    craftingRemainingItem = NULL;
    rarity = Item::eMinecraftRarity::common;
    // Writes itself into items[this->id]
}
```

## Step 1: Create an item subclass

Create a header and implementation file in `Minecraft.World/`.

**`MyCustomItem.h`**
```cpp
#pragma once
#include "Item.h"

class Player;
class Level;
class Mob;

class MyCustomItem : public Item
{
public:
    MyCustomItem(int id);

    // Override whichever behaviors you need:
    virtual shared_ptr<ItemInstance> use(shared_ptr<ItemInstance> itemInstance,
                                         Level *level,
                                         shared_ptr<Player> player);
    virtual bool useOn(shared_ptr<ItemInstance> itemInstance,
                       shared_ptr<Player> player, Level *level,
                       int x, int y, int z, int face,
                       float clickX, float clickY, float clickZ,
                       bool bTestUseOnOnly = false);
    virtual bool hurtEnemy(shared_ptr<ItemInstance> itemInstance,
                           shared_ptr<Mob> mob,
                           shared_ptr<Mob> attacker);
};
```

**`MyCustomItem.cpp`**
```cpp
#include "stdafx.h"
#include "MyCustomItem.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.level.h"

MyCustomItem::MyCustomItem(int id) : Item(id)
{
    // Item(id) sets this->id = 256 + id
    // Defaults: maxStackSize=64, maxDamage=0
}

shared_ptr<ItemInstance> MyCustomItem::use(shared_ptr<ItemInstance> itemInstance,
                                            Level *level,
                                            shared_ptr<Player> player)
{
    // Called when the player right-clicks with this item in hand
    // (not aiming at a block).
    return itemInstance;
}

bool MyCustomItem::useOn(shared_ptr<ItemInstance> itemInstance,
                          shared_ptr<Player> player, Level *level,
                          int x, int y, int z, int face,
                          float clickX, float clickY, float clickZ,
                          bool bTestUseOnOnly)
{
    // Called when the player right-clicks a block while holding this item.
    // Return true if the interaction was handled.
    return false;
}

bool MyCustomItem::hurtEnemy(shared_ptr<ItemInstance> itemInstance,
                              shared_ptr<Mob> mob,
                              shared_ptr<Mob> attacker)
{
    // Called when this item is used to hit a mob.
    // Return true to indicate the item was used in combat.
    // Optionally damage the item:
    // itemInstance->hurt(1, attacker);
    return false;
}
```

## Step 2: Register in Item::staticCtor()

Add your item to `Item::staticCtor()` in `Item.cpp`. You will also need a static pointer and ID constant in `Item.h`.

**In `Item.h`**, add:

```cpp
// Static pointer (with the other static Item pointers)
static Item *myCustomItem;

// ID constant (pick an unused value)
static const int myCustomItem_Id = 407;
```

**In `Item.cpp`**, add:

```cpp
// Static definition (near the other static Item* definitions)
Item *Item::myCustomItem = NULL;

// Inside Item::staticCtor():
Item::myCustomItem = ( new MyCustomItem(151) )  // 256 + 151 = 407
    ->setTextureName(L"myCustomItem")
    ->setDescriptionId(IDS_ITEM_MY_CUSTOM)
    ->setUseDescriptionId(IDS_DESC_MY_CUSTOM);
```

Remember: the constructor parameter is `desired_id - 256`. So for item ID 407, pass 151.

## Step 3: Add to umbrella header and Sources.cmake

If you created a new `.h` file for your item subclass, add it to the item umbrella header `Minecraft.World/net.minecraft.world.item.h`:

```cpp
#include "MyCustomItem.h"
```

Then add your `.cpp` file to `cmake/Sources.cmake` in the `MINECRAFT_WORLD_SOURCES` list:

```cmake
"MyCustomItem.cpp"
```

Only `.cpp` files go in `Sources.cmake`, not headers. CMake prepends the `Minecraft.World/` directory automatically. After changing this file, re-run CMake:

```bash
cd build
cmake ..
```

If your item is a plain `Item` with no subclass (just `new Item(id)`), you can skip this step since there are no new files to add.

## Step 4: Set properties

All property setters return `Item*` for chaining. Here is every setter available on the `Item` class.

### Stack size

```cpp
->setMaxStackSize(16)   // Default is 64
->setMaxStackSize(1)    // Non-stackable (tools, weapons, armor)
```

### Durability

```cpp
->setMaxDamage(250)     // Item breaks after 250 uses. Setting this implies maxStackSize=1.
```

Tier-based durability for tools (from `Item::Tier`):

| Tier | Uses | Speed | Damage Bonus | Enchantability |
|------|------|-------|--------------|----------------|
| WOOD | 59 | 2 | 0 | 15 |
| STONE | 131 | 4 | 1 | 5 |
| IRON | 250 | 6 | 2 | 14 |
| DIAMOND | 1561 | 8 | 3 | 10 |
| GOLD | 32 | 12 | 0 | 22 |

### Display

```cpp
->setTextureName(L"myItem")                    // Texture lookup name
->setDescriptionId(IDS_ITEM_MY_ITEM)           // Localized name string ID
->setUseDescriptionId(IDS_DESC_MY_ITEM)        // Localized description string ID
->handEquipped()                                // Render held in hand like a tool
```

`handEquipped()` sets `isHandEquipped = true`, which makes the item render at an angle in the player's hand instead of flat.

### Creative inventory

```cpp
->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_diamond)
```

This controls where your item shows up in the creative inventory on the console crafting UI.

Common `eBaseItemType` values for items:

| Type | Usage |
|------|-------|
| `eBaseItemType_sword` | Swords |
| `eBaseItemType_shovel` | Shovels |
| `eBaseItemType_pickaxe` | Pickaxes |
| `eBaseItemType_hatchet` | Axes |
| `eBaseItemType_hoe` | Hoes |
| `eBaseItemType_helmet` / `chestplate` / `leggings` / `boots` | Armor |
| `eBaseItemType_bow` | Bows and arrows |
| `eBaseItemType_treasure` | Ingots, gems, nuggets |
| `eBaseItemType_seed` | Seeds |
| `eBaseItemType_utensil` | Buckets, bottles |
| `eBaseItemType_devicetool` | Flint and steel, shears |
| `eBaseItemType_pockettool` | Compass, clock, map |
| `eBaseItemType_rod` | Fishing rod, carrot on a stick |
| `eBaseItemType_HangingItem` | Paintings, item frames, signs |
| `eBaseItemType_giltFruit` | Golden apple, golden carrot |

Common `eMaterial` values:

| Material | Usage |
|----------|-------|
| `eMaterial_wood` | Wood-tier items |
| `eMaterial_stone` | Stone-tier items |
| `eMaterial_iron` | Iron-tier items |
| `eMaterial_gold` | Gold-tier items |
| `eMaterial_diamond` | Diamond-tier items |
| `eMaterial_cloth` | Leather items |
| `eMaterial_chain` | Chain armor |
| `eMaterial_emerald` | Emerald items |

### Rarity

```cpp
->setRarity(Item::eMinecraftRarity::rare)     // Aqua-colored name
->setRarity(Item::eMinecraftRarity::epic)     // Magenta-colored name
```

Default is `common` (white name). The `uncommon` rarity gives a yellow name.

### Crafting remainder

```cpp
->setCraftingRemainingItem(Item::bucket_empty)  // Leaves empty bucket after crafting
```

When this item is used as an ingredient in a recipe, the crafting remainder item goes back into the crafting grid.

### Stacked by data

```cpp
->setStackedByData(true)  // Items with different aux values stack separately
```

Used by golden apples (regular vs enchanted) and other items where aux value matters for stacking.

### Potion brewing

```cpp
->setPotionBrewingFormula(PotionBrewing::MOD_REDSTONE)  // Acts as brewing ingredient
```

## Creating tool items

Tools use the `Item::Tier` system for durability, speed, and damage. Each tool type has its own subclass.

### Weapon (Sword)

```cpp
class WeaponItem : public Item
{
    int damage;            // 4 + tier->getAttackDamageBonus()
    const Tier *tier;
public:
    WeaponItem(int id, const Tier *tier);
    // hurtEnemy: damages item by 1 per hit
    // mineBlock: damages item by 2 per block mined
    // getAttackDamage: returns damage
    // canDestroySpecial: true for webs
};
```

Registration example:

```cpp
Item::sword_iron = ( new WeaponItem(11, _Tier::IRON) )
    ->setBaseItemTypeAndMaterial(eBaseItemType_sword, eMaterial_iron)
    ->setTextureName(L"swordIron")
    ->setDescriptionId(IDS_ITEM_SWORD_IRON)
    ->setUseDescriptionId(IDS_DESC_SWORD);
```

### Pickaxe

```cpp
class PickaxeItem : public DiggerItem
{
public:
    PickaxeItem(int id, const Tier *tier);
    // Base attack damage: 2 + tier bonus
    // canDestroySpecial: tier level checks for specific ores
    // getDestroySpeed: tier speed on diggable tiles + metal/stone materials
};
```

Registration:

```cpp
Item::pickAxe_diamond = ( new PickaxeItem(22, _Tier::DIAMOND) )
    ->setBaseItemTypeAndMaterial(eBaseItemType_pickaxe, eMaterial_diamond)
    ->setTextureName(L"pickaxeDiamond")
    ->setDescriptionId(IDS_ITEM_PICKAXE_DIAMOND)
    ->setUseDescriptionId(IDS_DESC_PICKAXE);
```

### Shovel, Axe, Hoe

Same pattern: `ShovelItem(id, tier)` with base attack 1, `HatchetItem(id, tier)` with base attack 3, `HoeItem(id, tier)` with no attack bonus. See [Tools & Weapons](/slop-docs/world/items/tools/) for full details on each.

## Creating armor items

`ArmorItem` takes an armor material, a render index, and a slot:

```cpp
class ArmorItem : public Item
{
public:
    static const int SLOT_HEAD = 0;
    static const int SLOT_TORSO = 1;
    static const int SLOT_LEGS = 2;
    static const int SLOT_FEET = 3;

    ArmorItem(int id, const ArmorMaterial *armorType, int renderIndex, int slot);
    // Durability = healthPerSlot[slot] * material->getDurabilityMultiplier()
    // healthPerSlot = {11, 16, 15, 13} (head, torso, legs, feet)
    // Defense from material->slotProtections[slot]
};
```

Armor materials defined in `ArmorItem::ArmorMaterial`:

| Material | Dur. Mult. | Defense (H/C/L/B) | Enchantability |
|----------|-----------|-------------------|----------------|
| `CLOTH` | 5 | 1/3/2/1 | 15 |
| `CHAIN` | 15 | 2/5/4/1 | 12 |
| `IRON` | 15 | 2/6/5/2 | 9 |
| `GOLD` | 7 | 2/5/3/1 | 25 |
| `DIAMOND` | 33 | 3/8/6/3 | 10 |

Registration example (iron helmet):

```cpp
Item::helmet_iron = (ArmorItem *)( ( new ArmorItem(50,
    ArmorItem::ArmorMaterial::IRON, 2, ArmorItem::SLOT_HEAD) )
    ->setBaseItemTypeAndMaterial(eBaseItemType_helmet, eMaterial_iron)
    ->setTextureName(L"helmetIron")
    ->setDescriptionId(IDS_ITEM_HELMET_IRON)
    ->setUseDescriptionId(IDS_DESC_HELMET_IRON) );
```

Note the cast to `ArmorItem *`. This is needed because the chained setters return `Item*`, but the static pointer is `ArmorItem *`.

## Creating food items

`FoodItem` adds eating behavior. Constructor:

```cpp
FoodItem(int id, int nutrition, float saturationMod, bool isMeat);
```

Saturation modifier constants from `FoodConstants`:

| Constant | Value |
|----------|-------|
| `FOOD_SATURATION_POOR` | 0.1 |
| `FOOD_SATURATION_LOW` | 0.3 |
| `FOOD_SATURATION_NORMAL` | 0.6 |
| `FOOD_SATURATION_GOOD` | 0.8 |
| `FOOD_SATURATION_MAX` | 1.0 |
| `FOOD_SATURATION_SUPERNATURAL` | 1.2 |

The `isMeat` flag tells the game this food counts as meat for wolves (they only eat meat).

Additional food methods:

```cpp
->setEatEffect(MobEffect::hunger->id, 30, 0, .8f)  // Status effect on eat
//             effectId, durationSeconds, amplifier, probability
->setCanAlwaysEat()  // Can eat even when food bar is full (golden apple)
```

Registration examples:

```cpp
// Simple food
Item::bread = ( new FoodItem(41, 5, FoodConstants::FOOD_SATURATION_NORMAL, false) )
    ->setTextureName(L"bread")
    ->setDescriptionId(IDS_ITEM_BREAD)
    ->setUseDescriptionId(IDS_DESC_BREAD);

// Meat with low saturation
Item::porkChop_raw = ( new FoodItem(63, 3, FoodConstants::FOOD_SATURATION_LOW, true) )
    ->setTextureName(L"porkchopRaw")
    ->setDescriptionId(IDS_ITEM_PORKCHOP_RAW)
    ->setUseDescriptionId(IDS_DESC_PORKCHOP_RAW);

// Food with negative effect (30% chance of Hunger for 30 seconds)
Item::chicken_raw = (new FoodItem(109, 2, FoodConstants::FOOD_SATURATION_LOW, true))
    ->setEatEffect(MobEffect::hunger->id, 30, 0, .3f)
    ->setTextureName(L"chickenRaw")
    ->setDescriptionId(IDS_ITEM_CHICKEN_RAW)
    ->setUseDescriptionId(IDS_DESC_CHICKEN_RAW);

// Food with guaranteed poison effect
Item::spiderEye = (new FoodItem(119, 2, FoodConstants::FOOD_SATURATION_GOOD, false))
    ->setEatEffect(MobEffect::poison->id, 5, 0, 1.0f)
    ->setTextureName(L"spiderEye")
    ->setDescriptionId(IDS_ITEM_SPIDER_EYE)
    ->setUseDescriptionId(IDS_DESC_SPIDER_EYE);

// Golden apple: always edible, supernatural saturation, regeneration effect
Item::apple_gold = ( new GoldenAppleItem(66, 4,
    FoodConstants::FOOD_SATURATION_SUPERNATURAL, false) )
    ->setCanAlwaysEat()
    ->setEatEffect(MobEffect::regeneration->id, 5, 0, 1.0f)
    ->setBaseItemTypeAndMaterial(eBaseItemType_giltFruit, eMaterial_apple)
    ->setTextureName(L"appleGold")
    ->setDescriptionId(IDS_ITEM_APPLE_GOLD);
```

The eating duration is a constant `EAT_DURATION = (int)(20 * 1.6)` (about 32 ticks, roughly 1.6 seconds).

## Creating simple material items

A lot of items have no special behavior. They are just `new Item(id)` with properties set:

```cpp
// Simple crafting material
Item::diamond = ( new Item(8) )
    ->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_diamond)
    ->setTextureName(L"diamond")
    ->setDescriptionId(IDS_ITEM_DIAMOND)
    ->setUseDescriptionId(IDS_DESC_DIAMONDS);

// Hand-held item (renders like a tool)
Item::stick = ( new Item(24) )
    ->setTextureName(L"stick")
    ->handEquipped()
    ->setDescriptionId(IDS_ITEM_STICK)
    ->setUseDescriptionId(IDS_DESC_STICK);

// Stackable utility item with reduced stack size
Item::bucket_empty = ( new BucketItem(69, 0) )
    ->setBaseItemTypeAndMaterial(eBaseItemType_utensil, eMaterial_water)
    ->setTextureName(L"bucket")
    ->setDescriptionId(IDS_ITEM_BUCKET)
    ->setUseDescriptionId(IDS_DESC_BUCKET)
    ->setMaxStackSize(16);
```

## Key virtual methods reference

| Method | When Called | Default Return |
|--------|------------|----------------|
| `use(itemInstance, level, player)` | Right-click with item in hand (not on a block) | Returns `itemInstance` unchanged |
| `useOn(itemInstance, player, level, x, y, z, face, ...)` | Right-click on a block | Returns `false` |
| `hurtEnemy(itemInstance, mob, attacker)` | Hit a mob with the item | Returns `false` |
| `mineBlock(itemInstance, level, tile, x, y, z, owner)` | Break a block with the item | Returns `false` (no durability cost by default) |
| `getAttackDamage(entity)` | Query attack damage | Returns `1` |
| `getDestroySpeed(itemInstance, tile)` | Query mining speed against a tile | Returns `1.0` |
| `canDestroySpecial(tile)` | Whether this item can harvest the tile | Returns `false` |
| `useTimeDepleted(itemInstance, level, player)` | Eating/drinking/blocking timer finishes | Returns `itemInstance` |
| `getUseAnimation(itemInstance)` | Returns `UseAnim_eat`, `UseAnim_block`, etc. | Returns `UseAnim_none` |
| `getUseDuration(itemInstance)` | How long in ticks the use action takes | Returns `0` |
| `releaseUsing(itemInstance, level, player, durationLeft)` | Use action interrupted (e.g., bow release) | Does nothing |
| `inventoryTick(itemInstance, level, owner, slot, selected)` | Called each tick while in inventory | Does nothing |
| `getEnchantmentValue()` | Enchantability for the enchanting table | Returns `0` |
| `isValidRepairItem(source, repairItem)` | Whether repairItem can repair this on an anvil | Returns `false` |
| `isFoil(itemInstance)` | Whether to render with enchantment glint | Returns `itemInstance->isEnchanted()` |
| `getRarity(itemInstance)` | Color tier of the item name | Returns `this->rarity` |

## Complete example: Adding a ruby item

**`Item.h`** additions:

```cpp
static Item *ruby;
static const int ruby_Id = 407;
```

**`Item.cpp`** additions:

```cpp
Item *Item::ruby = NULL;

// Inside Item::staticCtor():
Item::ruby = ( new Item(151) )  // 256 + 151 = 407
    ->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_emerald)
    ->setTextureName(L"ruby")
    ->setDescriptionId(IDS_ITEM_RUBY)
    ->setUseDescriptionId(IDS_DESC_RUBY);
```

This creates a simple gem item, similar to how emeralds and diamonds are registered. Pair it with a [Ruby Ore block](/slop-docs/modding/adding-blocks/) that drops this item.

## Related guides

- [Getting Started](/slop-docs/modding/getting-started/) for environment setup and the staticCtor pattern
- [Adding Blocks](/slop-docs/modding/adding-blocks/) to create blocks that drop your custom items
- [Adding Recipes](/slop-docs/modding/adding-recipes/) to make your items craftable
- [Item System Overview](/slop-docs/world/items/overview/) for the full Item class reference

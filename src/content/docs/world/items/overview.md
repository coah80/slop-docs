---
title: Item System Overview
description: Core architecture of the LCE item system, including the base Item class, ItemInstance, registration, and ID offset.
---

The item system in LCE is built around the `Item` base class. Every non-block item gets a numeric ID starting at **256** (the `id` you pass to the constructor gets +256 added internally). The global registry has room for up to **32,000** slots.

## Sub-Pages

- [Tools & Weapons](/slop-docs/world/items/tools/) - Swords, pickaxes, axes, shovels, hoes, shears. Tool tiers, durability, speed, damage.
- [Armor](/slop-docs/world/items/armor/) - All armor materials, defense values, durability, slots, leather dyeing.
- [Food](/slop-docs/world/items/food/) - Nutrition, saturation, effects, all food types.
- [Combat Items](/slop-docs/world/items/combat/) - Bow, arrows, snowballs, ender pearls, fire charges, potions.
- [Music Discs](/slop-docs/world/items/music-discs/) - All disc IDs, field names, how records work.
- [Decorative & Placement](/slop-docs/world/items/decorative/) - Paintings, item frames, signs, buckets, dyes, maps, books, beds.
- [Raw Materials](/slop-docs/world/items/materials/) - Ingots, diamonds, redstone, glowstone dust, string, leather, and crafting ingredients.
- [Special Items](/slop-docs/world/items/special/) - Spawn eggs, enchanted books, written books, fireworks, name tags.

## Item Base Class

**Files:** `Minecraft.World/Item.h`, `Minecraft.World/Item.cpp`

The `Item` class extends `enable_shared_from_this<Item>` so it can create `shared_ptr` references to itself when needed by the engine.

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `ITEM_NUM_COUNT` | 32000 | Maximum possible items in the registry |
| `MAX_STACK_SIZE` | 64 | Default max stack size (from `Container::LARGE_MAX_STACK_SIZE`) |
| `ICON_COLUMNS` | 16 | Columns in the item texture atlas |
| `ICON_DESCRIPTION_PREFIX` | `"item."` | Prefix for icon description lookup (static wstring) |

### All Member Variables

| Variable | Type | Access | Default | Purpose |
|----------|------|--------|---------|---------|
| `id` | `const int` | public | 256 + constructor param | Unique item identifier, set once in the constructor |
| `maxStackSize` | `int` | protected | 64 | Maximum number per inventory slot |
| `maxDamage` | `int` | private | 0 | Maximum durability (0 means the item can't be damaged) |
| `icon` | `Icon*` | protected | `NULL` | Texture icon reference, set during `registerIcons()` |
| `m_iBaseItemType` | `int` | protected | `eBaseItemType_undefined` (0) | Crafting menu item type classification |
| `m_iMaterial` | `int` | protected | `eMaterial_undefined` (0) | Crafting menu material classification |
| `m_handEquipped` | `bool` | protected | `false` | Whether item renders held in hand like a tool |
| `m_isStackedByData` | `bool` | protected | `false` | Whether aux data differentiates stack types (used by golden apples) |
| `craftingRemainingItem` | `Item*` | private | `NULL` | Item left in crafting grid after use (e.g., empty bucket) |
| `potionBrewingFormula` | `wstring` | private | `""` (empty) | Potion brewing modifier string |
| `descriptionId` | `unsigned int` | private | (uninitialized) | Localized name string ID from string table |
| `useDescriptionId` | `unsigned int` | private | (uninitialized) | Localized description string ID from string table |
| `m_textureName` | `wstring` | private | `""` (empty) | Texture resource name for atlas lookup |

### Static Items Array

```cpp
static ItemArray items;  // size: ITEM_NUM_COUNT (32000)
```

Every `Item` constructor writes itself into this array at index `256 + id`. Anything in the game that needs an item (inventory, crafting, drops) looks it up by index.

### Constructor

```cpp
Item::Item(int id) : id(256 + id)
{
    maxStackSize = Item::MAX_STACK_SIZE;  // 64
    maxDamage = 0;
    icon = NULL;
    m_handEquipped = false;
    m_isStackedByData = false;
    craftingRemainingItem = NULL;
    potionBrewingFormula = L"";
    m_iMaterial = eMaterial_undefined;
    m_iBaseItemType = eBaseItemType_undefined;
    m_textureName = L"";

    if (items[256 + id] != NULL)
    {
        // "CONFLICT @ id" debug message
    }
    items[256 + id] = this;
}
```

The constructor takes the given ID, adds 256 to it, and registers the item into the global `items` array at that index. If the slot is already taken, a debug message gets printed. All defaults are set here, so subclasses only need to override what they change.

### Builder-Pattern Setters

All setter methods return `Item*` (or a subclass pointer) so you can chain them together:

```cpp
Item *setTextureName(const wstring &name);     // Sets m_textureName for atlas lookup
Item *setMaxStackSize(int max);                // Override default 64
Item *setBaseItemTypeAndMaterial(int iType, int iMaterial);  // Crafting menu classification
Item *setMaxDamage(int maxDamage);             // Set durability (protected, used by subclasses)
Item *setDescriptionId(unsigned int id);       // Localized item name
Item *setUseDescriptionId(unsigned int id);    // Localized item description
Item *setCraftingRemainingItem(Item *item);     // Item left after crafting (e.g., bucket)
Item *setPotionBrewingFormula(const wstring &formula);  // Brewing ingredient modifier (protected)
Item *setStackedByData(bool isStackedByData);  // Aux-value-based stacking (protected)
Item *handEquipped();                          // Sets m_handEquipped = true
```

### All Virtual Methods

These are every virtual method on the `Item` base class. Subclasses override the ones they need.

| Method | Return | Default Behavior | When Called |
|--------|--------|-----------------|------------|
| `useOn(itemInstance, player, level, x, y, z, face, clickX, clickY, clickZ, bTestUseOnOnly)` | `bool` | Returns `false` | Right-click on a block face. The `bTestUseOnOnly` param is `true` when the game is just checking for tooltip display, not actually doing the action. |
| `use(itemInstance, level, player)` | `shared_ptr<ItemInstance>` | Returns the item unchanged | Right-click in air (not aiming at a block) |
| `useTimeDepleted(itemInstance, level, player)` | `shared_ptr<ItemInstance>` | Returns the item unchanged | When the use duration timer runs out (eating, drinking) |
| `getDestroySpeed(itemInstance, tile)` | `float` | Returns `1.0f` | Mining speed multiplier against a specific tile |
| `hurtEnemy(itemInstance, mob, attacker)` | `bool` | Returns `false` | When hitting a mob. Return true if the item was used in combat. |
| `mineBlock(itemInstance, level, tile, x, y, z, owner)` | `bool` | Returns `false` | When a block is mined with this item. The `tile` param is the tile ID. |
| `getAttackDamage(entity)` | `int` | Returns `1` | Query base attack damage value |
| `canDestroySpecial(tile)` | `bool` | Returns `false` | Whether this tool can harvest a specific tile (e.g., iron pickaxe can harvest gold ore) |
| `interactEnemy(itemInstance, mob)` | `bool` | Returns `false` | When right-clicking a mob with this item |
| `isHandEquipped()` | `bool` | Returns `m_handEquipped` | Whether to render the item as a hand-held tool |
| `isMirroredArt()` | `bool` | Returns `false` | Whether the item sprite should be horizontally mirrored (fishing rod uses this) |
| `getUseAnimation(itemInstance)` | `UseAnim` | Returns `UseAnim_none` | Animation type when using the item |
| `getUseDuration(itemInstance)` | `int` | Returns `0` | How long the use action takes in ticks |
| `releaseUsing(itemInstance, level, player, durationLeft)` | `void` | No-op | Called when the use button is released early (bow charging) |
| `isFoil(itemInstance)` | `bool` | Returns `true` if `itemInstance->isEnchanted()` | Whether the item has an enchantment glint |
| `getRarity(itemInstance)` | `const Rarity*` | Returns `Rarity::rare` if enchanted, otherwise `Rarity::common` | Item rarity (affects name color) |
| `isEnchantable(itemInstance)` | `bool` | Returns `true` if `getMaxStackSize() == 1 && canBeDepleted()` | Whether item can go on the enchanting table |
| `getEnchantmentValue()` | `int` | Returns `0` | Enchantability score for the enchanting table RNG |
| `isValidRepairItem(source, repairItem)` | `bool` | Returns `false` | Whether the given item can repair this one in an anvil |
| `isComplex()` | `bool` | Returns `false` | Whether item needs special network sync (maps use this) |
| `appendHoverText(itemInstance, player, lines, advanced, unformattedStrings)` | `void` | No-op | Add extra lines to the item tooltip |
| `getHoverName(itemInstance)` | `wstring` | Returns `app.GetString(getDescriptionId(itemInstance))` | Get the display name of the item |
| `getColor(item, spriteLayer)` | `int` | Returns `0xFFFFFF` (white) | Tint color for a sprite layer (leather armor uses this) |
| `hasMultipleSpriteLayers()` | `bool` | Returns `false` | Whether the item uses layered sprites (leather armor overlay) |
| `getLayerIcon(auxValue, spriteLayer)` | `Icon*` | Returns `getIcon(auxValue)` | Get the icon for a specific sprite layer |
| `inventoryTick(itemInstance, level, owner, slot, selected)` | `void` | No-op | Called each tick while the item is in an inventory |
| `onCraftedBy(itemInstance, level, player)` | `void` | No-op | Called when the item is crafted by a player |
| `registerIcons(iconRegister)` | `void` | Registers `m_textureName` with the icon register | Called during texture loading to register the item's icon |
| `shouldMoveCraftingResultToInventory(instance)` | `bool` | Returns `true` | Whether the crafted result should auto-move to inventory (4J addition) |
| `shouldOverrideMultiplayerNBT()` | `bool` | Returns `true` | Whether NBT should be synced in multiplayer |
| `TestUse(level, player)` | `bool` | Returns `false` | Pre-check before `use()` is called |
| `getIconType()` | `int` | Returns `Icon::TYPE_ITEM` | Whether this is an item or tile icon |
| `getIcon(auxValue)` | `Icon*` | Returns `icon` | Get the icon for a given aux value |
| `getMaxStackSize()` | `int` | Returns `maxStackSize` | Maximum stack size |
| `getLevelDataForAuxValue(auxValue)` | `int` | Returns `0` | Convert aux value to level data |
| `getDescriptionId(iData)` | `unsigned int` | Returns `descriptionId` | Get the string table ID, optionally for a specific data value |
| `getDescriptionId(instance)` | `unsigned int` | Returns `descriptionId` | Get the string table ID for an item instance |
| `getUseDescriptionId()` | `unsigned int` | Returns `useDescriptionId` | Get the use description string table ID |
| `getUseDescriptionId(instance)` | `unsigned int` | Returns `useDescriptionId` | Get the use description for a specific instance |
| `getPotionBrewingFormula()` | `wstring` | Returns `potionBrewingFormula` | Get the brewing formula string |
| `hasPotionBrewingFormula()` | `bool` | Returns `!potionBrewingFormula.empty()` | Whether this item has a brewing formula |

### Non-Virtual Public Methods

| Method | Return | Purpose |
|--------|--------|---------|
| `getBaseItemType()` | `int` | Returns `m_iBaseItemType` |
| `getMaterial()` | `int` | Returns `m_iMaterial` |
| `getIcon(itemInstance)` | `Icon*` | Calls `getIcon(itemInstance->getAuxValue())` |
| `useOn(itemInstance, level, x, y, z, face, bTestUseOnOnly)` | `const bool` | Simplified `useOn` without player/click params, always returns `false` |
| `isStackedByData()` | `bool` | Returns `m_isStackedByData` |
| `getMaxDamage()` | `int` | Returns `maxDamage` |
| `canBeDepleted()` | `bool` | Returns `maxDamage > 0 && !m_isStackedByData` |
| `getDescription()` | `LPCWSTR` | Looks up localized name from string table |
| `getDescription(instance)` | `LPCWSTR` | Looks up localized name for a specific instance |
| `getCraftingRemainingItem()` | `Item*` | Returns `craftingRemainingItem` |
| `hasCraftingRemainingItem()` | `bool` | Returns `craftingRemainingItem != NULL` |
| `getName()` | `wstring` | Returns empty string (not fully implemented) |

### UseAnim Enum

**File:** `Minecraft.World/UseAnim.h`

```cpp
enum UseAnim {
    UseAnim_none,   // No animation
    UseAnim_eat,    // Eating food
    UseAnim_drink,  // Drinking potions
    UseAnim_block,  // Blocking with sword
    UseAnim_bow     // Drawing a bow
};
```

### Rarity Levels

**File:** `Minecraft.World/Rarity.h`

| Rarity | Usage |
|--------|-------|
| `common` | Most items |
| `uncommon` | Enchanted items, enchanted books (with stored enchantments) |
| `rare` | Enchanted items (base class default), golden apples (aux 0), music discs |
| `epic` | Enchanted golden apples (aux > 0) |

Note: the base `Item::getRarity()` returns `Rarity::rare` when enchanted, while `Rarity::common` is the default. The `uncommon` rarity is used by `EnchantedBookItem` which overrides `getRarity()`.

## ItemInstance

**Files:** `Minecraft.World/ItemInstance.h`, `Minecraft.World/ItemInstance.cpp`

`ItemInstance` represents a specific stack of items sitting in an inventory or out in the world. It wraps an `Item` with a count, auxiliary data, and NBT tag data. It also extends `enable_shared_from_this<ItemInstance>`.

### Static Constants

| Constant | Type | Value | Purpose |
|----------|------|-------|---------|
| `TAG_ENCH_ID` | `const wchar_t*` | `"id"` | NBT tag key for enchantment ID |
| `TAG_ENCH_LEVEL` | `const wchar_t*` | `"lvl"` | NBT tag key for enchantment level |

### Member Variables

| Field | Type | Access | Purpose |
|-------|------|--------|---------|
| `id` | `int` | public | Item ID (matches `Item::id`) |
| `count` | `int` | public | Stack count |
| `popTime` | `int` | public | Pickup animation timer |
| `tag` | `CompoundTag*` | public | NBT data (enchantments, display name, repair cost, etc.) |
| `auxValue` | `int` | private | Auxiliary/damage value. For tools, this tracks durability damage. For other items, it's metadata. |
| `m_bForceNumberDisplay` | `bool` | private | Forces count display in the trading menu (4J addition) |
| `frame` | `shared_ptr<ItemFrame>` | private | Reference to the item frame holding this item (TU9 addition) |

### Constructors

```cpp
ItemInstance(Tile *tile);                        // From a tile, count 1, aux 0
ItemInstance(Tile *tile, int count);              // From a tile with count
ItemInstance(Tile *tile, int count, int auxValue); // From a tile with count and aux
ItemInstance(Item *item);                        // From an item, count 1, aux 0
ItemInstance(MapItem *item, int count);           // From a map item (4J addition)
ItemInstance(Item *item, int count);              // From an item with count
ItemInstance(Item *item, int count, int auxValue); // From an item with count and aux
ItemInstance(int id, int count, int damage);      // From raw ID, count, and damage
```

All constructors call `_init(id, count, auxValue)` which sets `popTime = 0`, `tag = NULL`, `frame = nullptr`, and `m_bForceNumberDisplay = false`.

### Static Factory

```cpp
static shared_ptr<ItemInstance> fromTag(CompoundTag *itemTag);
```

Creates an `ItemInstance` from NBT data. Returns `nullptr` if the loaded item doesn't exist in the registry.

### Key Methods

| Method | Purpose |
|--------|---------|
| `getItem()` | Returns `Item::items[id]`, the Item definition for this instance |
| `remove(count)` | Splits off `count` items into a new instance, copies NBT tag. Clamps remaining count to 0. |
| `copy()` | Creates a full deep copy including NBT tag |
| `copy_not_shared()` | Same but returns raw pointer (used by recipe code) |
| `save(compoundTag)` | Writes `id` (short), `Count` (byte), `Damage` (short), and `tag` to NBT |
| `load(compoundTag)` | Reads back from NBT |
| `hurt(i, owner)` | Applies durability damage. Checks Unbreaking enchantment. Skips damage in creative mode. Breaks the item if damage exceeds max. |
| `enchant(enchantment, level)` | Adds an enchantment entry to the `ench` list tag |
| `isEnchanted()` | Returns true if the `ench` tag exists |
| `getEnchantmentTags()` | Returns the `ListTag<CompoundTag>` of enchantments |
| `getHoverName()` | Returns custom display name from `tag.display.Name`, or falls back to `Item::getHoverName()` |
| `setHoverName(name)` | Sets a custom name in `tag.display.Name` |
| `hasCustomHoverName()` | Checks if `tag.display.Name` exists |
| `getBaseRepairCost()` | Returns `tag.RepairCost` (int), or 0 if not set |
| `setRepairCost(cost)` | Sets `tag.RepairCost` |
| `isStackable()` | Returns `getMaxStackSize() > 1 && (!isDamageableItem() || !isDamaged())` |
| `isDamageableItem()` | Returns true if `maxDamage > 0` |
| `isDamaged()` | Returns true if damageable and `auxValue > 0` |
| `getDamageValue()` | Returns `auxValue` |
| `getAuxValue()` | Returns `auxValue` |
| `setAuxValue(value)` | Sets `auxValue` |
| `sameItem(b)` | Checks if `id` and `auxValue` match (ignores count) |
| `sameItemWithTags(b)` | Checks `id`, `auxValue`, and NBT tag equality |
| `matches(a, b)` | Static method: full equality check including count and tags |
| `tagMatches(a, b)` | Static method: checks only NBT tag equality |
| `equals(ii)` | Checks `id`, `count`, and `auxValue` (no tag check) |

### Durability System (hurt method)

The `hurt()` method is the core durability system:

1. If the item isn't damageable (`maxDamage == 0`), do nothing.
2. If damage amount > 0 and the owner is a player, check the Unbreaking enchantment via `EnchantmentHelper::getDigDurability()`. On client side, always assume no damage (prevents desync). On server, roll a random check.
3. Skip damage in creative mode (`abilities.instabuild`).
4. Add `i` to `auxValue`.
5. If `auxValue > maxDamage`, call `owner->breakItem()`, set count to 0, reset auxValue to 0.

### NBT Structure

When saved, an `ItemInstance` writes:

```
{
    id: short       // Item ID
    Count: byte     // Stack size
    Damage: short   // Aux/damage value
    tag: {          // Optional NBT
        ench: [     // Enchantment list
            { id: short, lvl: short }
        ]
        display: {
            Name: string    // Custom name
            color: int      // Leather armor color
        }
        RepairCost: int     // Anvil repair cost
        4jdata: int         // 4J-specific data
    }
}
```

### 4J-Specific Methods

| Method | Purpose |
|--------|---------|
| `set4JData(data)` | Stores a custom int in `tag.4jdata` |
| `get4JData()` | Reads `tag.4jdata`, returns 0 if not set |
| `hasPotionStrengthBar()` | Returns true for potions (id == potion and auxValue != 0) |
| `GetPotionStrength()` | Decodes potion strength from aux value bitmask |
| `ForceNumberDisplay(bForce)` | Forces count display in trading menu |
| `GetForceNumberDisplay()` | Returns the force display flag |
| `isFramed()` | Returns `frame != NULL` |
| `setFramed(frame)` | Sets the item frame reference |
| `getFrame()` | Returns the item frame reference |

## Item Registration System

All items get registered in `Item::staticCtor()` inside `Item.cpp`. This method creates each item with `new`, sets properties through builder-pattern chaining, and the `Item` constructor automatically drops each item into the global `Item::items` array at index `256 + id`.

```cpp
// Example from staticCtor():
Item::sword_wood = (new WeaponItem(12, _Tier::WOOD))
    ->setBaseItemTypeAndMaterial(eBaseItemType_sword, eMaterial_wood)
    ->setTextureName(L"swordWood")
    ->setDescriptionId(IDS_ITEM_SWORD_WOOD)
    ->setUseDescriptionId(IDS_DESC_SWORD);
```

After `staticCtor()` runs, `Item::staticInit()` gets called separately (after other static constructors like Recipes) and builds item statistics through `Stats::buildItemStats()`.

### Initialization Order

1. `Item::staticCtor()` - creates all items, sets properties
2. `Recipes::staticCtor()` - registers all crafting recipes (needs items to exist first)
3. `FurnaceRecipes::staticCtor()` - registers smelting recipes
4. `Item::staticInit()` - builds stats (must be after recipe constructors)

## Class Hierarchy

```
Item (base class, extends enable_shared_from_this<Item>)
  |
  +-- WeaponItem          (swords)
  +-- DiggerItem           (base for mining tools)
  |     +-- PickaxeItem
  |     +-- ShovelItem
  |     +-- HatchetItem    (axes)
  +-- HoeItem
  +-- ArmorItem
  +-- FoodItem
  |     +-- BowlFoodItem       (mushroom stew)
  |     +-- GoldenAppleItem
  |     +-- SeedFoodItem        (carrots, potatoes)
  +-- BowItem
  +-- FishingRodItem
  +-- ShearsItem
  +-- BucketItem
  +-- FlintAndSteelItem
  +-- EnderpearlItem
  +-- PotionItem
  +-- BedItem
  +-- DoorItem
  +-- SignItem
  +-- SeedItem
  +-- TilePlanterItem      (places a tile: cake, redstone repeater, etc.)
  +-- TileItem             (block-as-item wrapper)
  +-- ComplexItem
  |     +-- MapItem
  +-- RecordingItem        (music discs)
  +-- EnchantedBookItem
  +-- MonsterPlacerItem    (spawn eggs)
  +-- BookItem
  +-- BottleItem           (glass bottles)
  +-- CoalItem
  +-- DyePowderItem
  +-- RedStoneItem
  +-- SaddleItem
  +-- SnowballItem
  +-- EggItem
  +-- BoatItem
  +-- MinecartItem
  +-- CompassItem
  +-- ClockItem
  +-- EnderEyeItem
  +-- ExperienceItem       (bottle o' enchanting)
  +-- FireChargeItem
  +-- HangingEntityItem    (paintings, item frames)
  +-- SkullItem
  +-- MilkBucketItem
  +-- CarrotOnAStickItem
```

## Material and Type Classification

The crafting menu uses two enums to sort items for filtering. These were added by 4J Studios for the console edition's crafting UI. Both are anonymous enums defined inside the `Item` class.

### eMaterial Enum

The crafting menu uses this to group items by material:

| Value | Name | Example Items |
|-------|------|--------------|
| 0 | `undefined` | Generic items |
| 1 | `wood` | Wood tools, sticks, doors |
| 2 | `stone` | Stone tools |
| 3 | `iron` | Iron tools, iron armor, iron door |
| 4 | `gold` | Gold tools, gold armor, gold nugget |
| 5 | `diamond` | Diamond tools, diamond armor |
| 6 | `cloth` | Leather armor, painting |
| 7 | `chain` | Chain armor |
| 8 | `detector` | Detector rail |
| 9 | `lapis` | Lapis lazuli |
| 10 | `music` | Music discs |
| 11 | `dye` | Dye powder |
| 12 | `sand` | Sand-related |
| 13 | `brick` | Brick-related |
| 14 | `clay` | Clay-related |
| 15 | `snow` | Snow-related |
| 16 | `bow` | Bow |
| 17 | `arrow` | Arrows |
| 18 | `compass` | Compass |
| 19 | `clock` | Clock |
| 20 | `map` | Map |
| 21 | `pumpkin` | Pumpkin seeds |
| 22 | `glowstone` | Glowstone |
| 23 | `water` | Bucket (water) |
| 24 | `trap` | Trapdoor |
| 25 | `flintandsteel` | Flint and Steel |
| 26 | `shears` | Shears |
| 27 | `piston` | Piston |
| 28 | `stickypiston` | Sticky Piston |
| 29 | `gate` | Fence Gate |
| 30 | `stoneSmooth` | Smooth Stone |
| 31 | `netherbrick` | Nether Brick |
| 32 | `ender` | Eye of Ender |
| 33 | `glass` | Glass Bottle |
| 34 | `blaze` | Brewing Stand |
| 35 | `magic` | Enchanting-related |
| 36 | `melon` | Melon seeds, Speckled Melon |
| 37 | `setfire` | Fire Charge |
| 38 | `sprucewood` | Spruce wood stairs |
| 39 | `birchwood` | Birch wood stairs |
| 40 | `junglewood` | Jungle wood stairs |
| 41 | `emerald` | Emerald |
| 42 | `quartz` | Nether Quartz |
| 43 | `apple` | Golden Apple |
| 44 | `carrot` | Golden Carrot, Carrot on a Stick |

### eBaseItemType Enum

This groups items by what they actually do:

| Value | Name | Example Items |
|-------|------|--------------|
| 0 | `undefined` | Generic items |
| 1 | `sword` | All swords |
| 2 | `shovel` | All shovels |
| 3 | `pickaxe` | All pickaxes |
| 4 | `hatchet` | All axes |
| 5 | `hoe` | All hoes |
| 6 | `door` | Wood door, iron door |
| 7 | `helmet` | All helmets |
| 8 | `chestplate` | All chestplates |
| 9 | `leggings` | All leggings |
| 10 | `boots` | All boots |
| 11 | `ingot` | (Defined but unused; iron/gold ingots use `treasure` instead) |
| 12 | `rail` | Rails |
| 13 | `block` | Block items |
| 14 | `pressureplate` | Pressure plates |
| 15 | `stairs` | Stairs |
| 16 | `cloth` | Wool |
| 17 | `dyepowder` | Dye powder |
| 18 | `structwoodstuff` | Wood structure items |
| 19 | `structblock` | Structure blocks |
| 20 | `slab` | Double slabs |
| 21 | `halfslab` | Half slabs |
| 22 | `torch` | Torches, fire charges |
| 23 | `bow` | Bow, arrows |
| 24 | `pockettool` | Compass, clock, map, eye of ender |
| 25 | `utensil` | Buckets, bowl, cauldron, glass bottle |
| 26 | `piston` | Pistons |
| 27 | `devicetool` | Flint and steel, shears |
| 28 | `fence` | Fences |
| 29 | `device` | Brewing stand |
| 30 | `treasure` | Diamond, iron/gold ingots, gold nugget, emerald |
| 31 | `seed` | Seeds |
| 32 | `HangingItem` | Painting, item frame, sign |
| 33 | `button` | Buttons |
| 34 | `chest` | Chests |
| 35 | `rod` | Fishing rod, carrot on a stick |
| 36 | `giltFruit` | Golden apple, speckled melon |
| 37 | `carpet` | Carpets |

The enum also has `eBaseItemType_MAXTYPES` as a sentinel value at the end.

## MinecraftConsoles differences

MinecraftConsoles expands the item system pretty significantly. Here's what changes:

### New item classes

| Class | Purpose |
|---|---|
| `FireworksItem` | Firework rockets. Has NBT tag constants for firework data (`TAG_FIREWORKS`, `TAG_EXPLOSION`, `TAG_EXPLOSIONS`, `TAG_FLIGHT`). Explosion types go from `TYPE_SMALL` (0) through `TYPE_BURST` (4). Places a `FireworksRocketEntity` on use. |
| `FireworksChargeItem` | Firework stars. Multi-layer sprite with explosion tag reading for tooltip display. |
| `NameTagItem` | Name tags for naming mobs. Uses `interactEnemy` to apply the item's custom name to a mob. |
| `LeashItem` | Leads/leashes. `useOn` attaches leashed mobs to fences via `bindPlayerMobs`. Has a test method `bindPlayerMobsTest` for UI tooltip checks. |
| `EmptyMapItem` | Empty maps (separate from `MapItem`). Extends `ComplexItem` and creates a new map on `use()`. In LCEMP, map creation is handled within `MapItem` itself. |
| `SpawnEggItem` | Replaces `MonsterPlacerItem`. Same spawn limit system but adds `eSpawnResult_FailTooManyBats` for the new bat mob. The class name change reflects the vanilla Minecraft naming. |
| `SimpleFoiledItem` | A generic item that always shows the enchantment glint. Used for the Nether Star. |
| `WrittenBookItem` | Written (signed) books with title, author, and pages. Has validation for tag structure. In LCEMP, books don't have the signed/written variant. Note: the implementation exists only as a commented-out Java pseudocode block in the header. |

### Renamed items

Some items got renamed between LCEMP and MinecraftConsoles:

| LCEMP name | MinecraftConsoles name |
|---|---|
| `monsterPlacer` | `spawnEgg` |
| `sulphur` | `gunpowder` |
| `milk` | `bucket_milk` |
| `diode` | `repeater` |
| `netherStalkSeeds` | `netherwart_seeds` |
| `boots_cloth` / `helmet_cloth` / etc. | `boots_leather` / `helmet_leather` / etc. |

### New static item fields

These items exist in MinecraftConsoles but not LCEMP:

- `fireworks`, `fireworksCharge`
- `nameTag`, `lead` (leash)
- `netherStar`
- `horseArmorMetal`, `horseArmorGold`, `horseArmorDiamond`
- `minecart_hopper`, `minecart_tnt`
- `comparator` (separate from the diode/repeater)
- `emptyMap` (separate from filled map)

### Class hierarchy additions

The hierarchy gains `SpawnEggItem` (replacing `MonsterPlacerItem`), `FireworksItem`, `FireworksChargeItem`, `NameTagItem`, `LeashItem`, `SimpleFoiledItem`, `EmptyMapItem`, and `WrittenBookItem`.

---
title: Armor
description: ArmorItem class, armor materials, defense values, durability multipliers, slot system, and leather dyeing via NBT.
---

The armor system uses `ArmorItem` to handle wearable protection. There are five material tiers and four equipment slots.

**Key source files:** `Minecraft.World/ArmorItem.h`, `Minecraft.World/ArmorItem.cpp`

## ArmorItem

Each `ArmorItem` is built with an `ArmorMaterial`, an icon index, and a slot index.

### Constructor

```cpp
ArmorItem(int id, const ArmorMaterial *armorType, int icon, int slot);
```

| Parameter | Description |
|-----------|-------------|
| `id` | Item ID offset (constructor adds 256) |
| `armorType` | Pointer to an `ArmorMaterial` constant |
| `icon` | Which armor model texture layer to use (0-4 for vanilla materials) |
| `slot` | Which body slot (0=head, 1=torso, 2=legs, 3=feet) |

The constructor sets:
- `maxStackSize = 1`
- `maxDamage = healthPerSlot[slot] * armorType->getDurabilityMultiplier()`

### Member variables

| Field | Type | Description |
|-------|------|-------------|
| `slot` | `int` | Equipment slot index |
| `defense` | `int` | Defense points for this piece (from `armorType->slotProtections[slot]`) |
| `modelIndex` | `int` | Texture layer index for rendering |
| `armorType` | `const ArmorMaterial *` | The material this armor is made from |

## ArmorMaterial

**Defined in:** `ArmorItem::ArmorMaterial` (nested class in `ArmorItem.h`), instantiated as `_ArmorMaterial`

### Constructor

```cpp
ArmorMaterial(int durabilityMultiplier, const int slotProtections[4], int enchantmentValue);
```

| Parameter | Description |
|-----------|-------------|
| `durabilityMultiplier` | Multiplied by per-slot base health to get total durability |
| `slotProtections` | Array of 4 defense values: {helmet, chestplate, leggings, boots} |
| `enchantmentValue` | How well this armor takes enchantments |

### Material definitions

```cpp
const ArmorMaterial *CLOTH   = new ArmorMaterial( 5, {1,3,2,1}, 15);
const ArmorMaterial *CHAIN   = new ArmorMaterial(15, {2,5,4,1}, 12);
const ArmorMaterial *IRON    = new ArmorMaterial(15, {2,6,5,2},  9);
const ArmorMaterial *GOLD    = new ArmorMaterial( 7, {2,5,3,1}, 25);
const ArmorMaterial *DIAMOND = new ArmorMaterial(33, {3,8,6,3}, 10);
```

| Material | Durability Multiplier | Defense (H/C/L/B) | Total Defense | Enchantability |
|----------|----------------------|-------------------|---------------|----------------|
| Cloth (Leather) | 5 | 1 / 3 / 2 / 1 | 7 | 15 |
| Chain | 15 | 2 / 5 / 4 / 1 | 12 | 12 |
| Iron | 15 | 2 / 6 / 5 / 2 | 15 | 9 |
| Gold | 7 | 2 / 5 / 3 / 1 | 11 | 25 |
| Diamond | 33 | 3 / 8 / 6 / 3 | 20 | 10 |

### Repair items

The `getTierItemId()` method uses pointer identity checks (comparing `this` against static constants) to return the repair item:

| Material | Repair Item |
|----------|-------------|
| Cloth | Leather (`Item::leather`, ID 334) |
| Chain | Iron Ingot (`Item::ironIngot`, ID 265) |
| Iron | Iron Ingot (`Item::ironIngot`, ID 265) |
| Gold | Gold Ingot (`Item::goldIngot`, ID 266) |
| Diamond | Diamond (`Item::diamond`, ID 264) |

If none match (custom material), returns `0`.

## Armor Slots

| Constant | Value | Slot Name |
|----------|-------|-----------|
| `SLOT_HEAD` | 0 | Helmet |
| `SLOT_TORSO` | 1 | Chestplate |
| `SLOT_LEGS` | 2 | Leggings |
| `SLOT_FEET` | 3 | Boots |

## Health Per Slot (Base Durability)

Durability is calculated as `healthPerSlot[slot] * durabilityMultiplier`.

```cpp
static const int healthPerSlot[] = {11, 16, 15, 13};
```

| Slot | Base Health | Purpose |
|------|-------------|---------|
| Helmet | 11 | Multiplied by material multiplier for final durability |
| Chestplate | 16 | Highest base, so chestplates are always the most durable |
| Leggings | 15 | Second highest |
| Boots | 13 | Third highest |

## Complete Armor Table

| Piece | ID | Material | Defense | Durability | Enchantability |
|-------|-----|----------|---------|-----------|----------------|
| Leather Helmet | 298 | Cloth | 1 | 55 (11*5) | 15 |
| Leather Chestplate | 299 | Cloth | 3 | 80 (16*5) | 15 |
| Leather Leggings | 300 | Cloth | 2 | 75 (15*5) | 15 |
| Leather Boots | 301 | Cloth | 1 | 65 (13*5) | 15 |
| Chain Helmet | 302 | Chain | 2 | 165 (11*15) | 12 |
| Chain Chestplate | 303 | Chain | 5 | 240 (16*15) | 12 |
| Chain Leggings | 304 | Chain | 4 | 225 (15*15) | 12 |
| Chain Boots | 305 | Chain | 1 | 195 (13*15) | 12 |
| Iron Helmet | 306 | Iron | 2 | 165 (11*15) | 9 |
| Iron Chestplate | 307 | Iron | 6 | 240 (16*15) | 9 |
| Iron Leggings | 308 | Iron | 5 | 225 (15*15) | 9 |
| Iron Boots | 309 | Iron | 2 | 195 (13*15) | 9 |
| Diamond Helmet | 310 | Diamond | 3 | 363 (11*33) | 10 |
| Diamond Chestplate | 311 | Diamond | 8 | 528 (16*33) | 10 |
| Diamond Leggings | 312 | Diamond | 6 | 495 (15*33) | 10 |
| Diamond Boots | 313 | Diamond | 3 | 429 (13*33) | 10 |
| Gold Helmet | 314 | Gold | 2 | 77 (11*7) | 25 |
| Gold Chestplate | 315 | Gold | 5 | 112 (16*7) | 25 |
| Gold Leggings | 316 | Gold | 3 | 105 (15*7) | 25 |
| Gold Boots | 317 | Gold | 1 | 91 (13*7) | 25 |

## Chain armor: not craftable

In the Java source, chain armor is crafted using fire blocks (`Tile::fire`). But 4J Studios commented this out in the `ArmorRecipes` class:

```cpp
// 4J-PB - removing the chain armour, since we show all possible recipes
// in the xbox game, and it's not one you can make
// ADD_OBJECT(map[0],Tile::fire);
```

Chain armor still exists in the game (IDs 302-305), but there is no crafting recipe for it. It can only be obtained through other means like mob drops or commands.

## Leather Armor Dyeing

Leather armor (`ArmorMaterial::CLOTH`) supports custom colors through NBT. The color data lives at `tag.display.color` as an integer.

### Default color

When no custom color is set, `getColor()` returns `DEFAULT_LEATHER_COLOR`, which maps to `eMinecraftColour_Armour_Default_Leather_Colour`.

### Sprite layers

Leather armor has two sprite layers (checked via `hasMultipleSpriteLayers()`):
1. **Base layer** (`getIcon(0)`) gets tinted with the custom color
2. **Overlay layer** (`getIcon(1)`) renders untinted, providing detail that stays the same regardless of dye

This dual-layer system is why leather armor always has those little accent details that stay the same color even when you dye it.

### Empty slot icons

`getEmptyIcon()` returns the grayscale armor slot icon shown in the player's armor equipment slots when no armor is equipped.

### How dyeing works

Dyeing happens through the `ArmorDyeRecipe` crafting recipe, which combines leather armor with one or more `DyePowderItem` instances. See [Crafting & Recipes](/slop-docs/world/crafting/) for the details on that system.

## ArmorItem methods

| Method | Description |
|--------|-------------|
| `getMaterial()` | Returns the `ArmorMaterial` pointer |
| `getDefense()` | Returns defense value for this piece |
| `getColor(ItemInstance *)` | Returns custom color from NBT, or default |
| `hasMultipleSpriteLayers()` | Returns `true` only for `CLOTH` material |
| `getIcon(int layer)` | Layer 0 = base, layer 1 = overlay (CLOTH only) |
| `getEmptyIcon()` | Grayscale slot icon for empty armor slots |
| `isValidRepairItem(source, repair)` | Checks if repair item matches material's `getTierItemId()` |
| `getEnchantmentValue()` | Returns the material's enchantment value |

## MinecraftConsoles differences

The armor system is mostly unchanged. Same five materials, same defense values, same durability multipliers.

The main difference is naming: the `CLOTH` material's item fields are renamed from `_cloth` to `_leather` (e.g., `boots_cloth` becomes `boots_leather`, `helmet_cloth` becomes `helmet_leather`, etc.). This is just a naming cleanup to match vanilla Minecraft's conventions. The `ArmorMaterial` enum value itself is still `CLOTH` internally.

MinecraftConsoles also adds **horse armor** items (`horseArmorMetal`, `horseArmorGold`, `horseArmorDiamond`), but those are not wearable by players. They are equipment for the new horse entity. Horse armor protection values are defined in `EntityHorse` as `ARMOR_PROTECTION[4]` for none/iron/gold/diamond.

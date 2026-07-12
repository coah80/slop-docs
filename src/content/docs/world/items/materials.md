---
title: Raw Materials
description: Ingots, gems, redstone dust, glowstone dust, and other crafting ingredients registered as simple Item instances.
---

Raw materials are the crafting ingredients and resource items in LCE. Most of them are just plain `Item` instances registered in `Item::staticCtor()` with no special subclass. A few have their own classes for placement or potion brewing.

## Simple Material Items

These items are registered as `new Item(id)` with builder-pattern config. They don't override `useOn`, `use`, or any other methods beyond their stack and texture settings.

| Item | ID | Texture Name | Notes |
|------|----|-------------|-------|
| Diamond | 264 | `diamond` | `eBaseItemType_treasure`, `eMaterial_diamond`; repair item for Diamond tier |
| Iron Ingot | 265 | `ingotIron` | `eBaseItemType_treasure`, `eMaterial_iron`; repair item for Iron tier |
| Gold Ingot | 266 | `ingotGold` | `eBaseItemType_treasure`, `eMaterial_gold`; repair item for Gold tier |
| Stick | 280 | `stick` | Hand-equipped (`handEquipped()` called) |
| Bowl | 281 | `bowl` | `eBaseItemType_utensil`, `eMaterial_wood`; max stack 64 |
| Feather | 288 | `feather` | Crafting ingredient for arrows |
| Gunpowder (sulphur) | 289 | `sulphur` | Brewing formula: `MOD_GUNPOWDER` |
| Wheat | 296 | `wheat` | Crafting ingredient for bread, cake |
| Flint | 318 | `flint` | Crafting ingredient for flint and steel, arrows |
| Leather | 334 | `leather` | Repair item for Leather (cloth) armor |
| Brick | 336 | `brick` | Crafting ingredient for brick blocks |
| Clay Ball | 337 | `clay` | Smelts into brick |
| Paper | 339 | `paper` | Crafting ingredient for books, maps |
| Slime Ball | 341 | `slimeball` | Crafting ingredient for sticky pistons, magma cream |
| Glowstone Dust | 348 | `yellowDust` | Brewing formula: `MOD_GLOWSTONE` |
| Bone | 352 | `bone` | Hand-equipped; crafts into bone meal (dye aux 15) |
| Sugar | 353 | `sugar` | Brewing formula: `MOD_SUGAR` |
| Blaze Rod | 369 | `blazeRod` | Hand-equipped; crafts into blaze powder |
| Ghast Tear | 370 | `ghastTear` | Brewing formula: `MOD_GHASTTEARS` |
| Gold Nugget | 371 | `goldNugget` | `eBaseItemType_treasure`, `eMaterial_gold`; 9 craft into gold ingot |
| Fermented Spider Eye | 376 | `fermentedSpiderEye` | Brewing formula: `MOD_FERMENTEDEYE` |
| Blaze Powder | 377 | `blazePowder` | Brewing formula: `MOD_BLAZEPOWDER` |
| Magma Cream | 378 | `magmaCream` | Brewing formula: `MOD_MAGMACREAM` |
| Glistering Melon | 382 | `speckledMelon` | `eBaseItemType_giltFruit`, `eMaterial_melon`; brewing: `MOD_SPECKLEDMELON` |
| Emerald | 388 | `emerald` | `eBaseItemType_treasure`, `eMaterial_emerald`; villager trading currency |
| Nether Brick (item) | 405 | `netherbrick` | Crafts into nether brick blocks |
| Nether Quartz | 406 | `netherquartz` | Crafts into quartz blocks |

## Special Material Classes

These materials have their own subclasses with extra behavior.

### CoalItem

**Files:** `Minecraft.World/CoalItem.h`, `Minecraft.World/CoalItem.cpp`

| Property | Value |
|----------|-------|
| ID | 263 |
| Stacked By Data | Yes |
| Max Damage | 0 |

Uses `auxValue` to tell apart Coal (0) and Charcoal (1, constant `CHAR_COAL`). The `getDescriptionId` method returns `IDS_ITEM_CHARCOAL` for aux 1 and `IDS_ITEM_COAL` for aux 0.

### RedStoneItem

**Files:** `Minecraft.World/RedStoneItem.h`, `Minecraft.World/RedStoneItem.cpp`

| Property | Value |
|----------|-------|
| ID | 331 |
| Brewing Formula | `MOD_REDSTONE` |

Overrides `useOn` to place redstone dust tile (`Tile::redStoneDust`) on the target block face. Also works as a potion brewing ingredient.

### SeedItem

**Files:** `Minecraft.World/SeedItem.h`, `Minecraft.World/SeedItem.cpp`

Seeds are plantable items that place crop tiles on farmland. The constructor takes a `resultId` (the tile to place) and a `targetLand` (the tile the seed must be placed on). The `useOn` method only works on the top face (`face == 1`). It checks that the block below is the target land and the block above is empty, then places the result tile.

| Item | ID | Result Tile | Target Land | Notes |
|------|----|------------|-------------|-------|
| Wheat Seeds | 295 | `Tile::crops_Id` | `Tile::farmland_Id` | |
| Pumpkin Seeds | 361 | `Tile::pumpkinStem_Id` | `Tile::farmland_Id` | `eBaseItemType_seed`, `eMaterial_pumpkin` |
| Melon Seeds | 362 | `Tile::melonStem_Id` | `Tile::farmland_Id` | `eBaseItemType_seed`, `eMaterial_melon` |
| Nether Wart | 372 | `Tile::netherStalk_Id` | `Tile::hellSand_Id` | Brewing formula: `MOD_NETHERWART` |

### Arrow

| Property | Value |
|----------|-------|
| ID | 262 |
| Class | `Item` |

A simple item with no special behavior. Gets consumed by `BowItem` when firing. See [Combat Items](/slop-docs/world/items/combat/) for bow mechanics.

## Potion Brewing Ingredients

Several material items are tagged with potion brewing formulas through `setPotionBrewingFormula()`. You can put these items in a brewing stand to modify potions.

| Item | ID | Brewing Formula |
|------|-----|----------------|
| Gunpowder | 289 | `MOD_GUNPOWDER` |
| Redstone | 331 | `MOD_REDSTONE` |
| Glowstone Dust | 348 | `MOD_GLOWSTONE` |
| Sugar | 353 | `MOD_SUGAR` |
| Ghast Tear | 370 | `MOD_GHASTTEARS` |
| Nether Wart | 372 | `MOD_NETHERWART` |
| Spider Eye | 375 | `MOD_SPIDEREYE` |
| Fermented Spider Eye | 376 | `MOD_FERMENTEDEYE` |
| Blaze Powder | 377 | `MOD_BLAZEPOWDER` |
| Magma Cream | 378 | `MOD_MAGMACREAM` |
| Glistering Melon | 382 | `MOD_SPECKLEDMELON` |
| Golden Carrot | 396 | `MOD_GOLDENCARROT` |

See [Effects (Potions)](/slop-docs/world/effects/) for the full potion system.

## MinecraftConsoles differences

MinecraftConsoles adds one new material item and renames another:

### New items

- **Nether Star** (ID 399, `netherStar`) is added as a drop from the Wither boss. It's a `SimpleFoiledItem` (icon name: `nether_star`), meaning `isFoil` always returns `true` so it shows the enchantment glint effect. Used as a crafting ingredient for beacons.

### Renamed items

- `sulphur` is renamed to `gunpowder` (`gunpowder_Id = 289`). The texture name also changes from `sulphur` to `gunpowder`. This matches vanilla Minecraft naming.

The rest of the raw materials (ingots, gems, redstone, glowstone dust, sticks, brewing ingredients, etc.) are the same between the two codebases. Same IDs, same brewing formulas, same properties.

---
title: Combat Items
description: Bow draw mechanics, ender pearls, snowballs, fire charges, potions, and other projectile items.
---

Combat items cover ranged weapons and throwable projectiles. For melee weapons (swords), check out [Tools & Weapons](/slop-docs/world/items/tools/).

## BowItem

**Files:** `Minecraft.World/BowItem.h`, `Minecraft.World/BowItem.cpp`

| Property | Value |
|----------|-------|
| ID | 261 |
| Max Durability | 384 |
| Max Draw Duration | 20 ticks (1 second) |
| Enchantability | 1 |
| Stack Size | 1 |
| Use Animation | `UseAnim_bow` |
| Base Item Type | `eBaseItemType_bow` |
| Material | `eMaterial_bow` |

### Draw Mechanics

The bow uses `releaseUsing` instead of `useTimeDepleted`. When the player lets go of the use button, power is calculated like this:

```cpp
int timeHeld = getUseDuration(itemInstance) - durationLeft;
float pow = timeHeld / (float)MAX_DRAW_DURATION;
pow = ((pow * pow) + pow * 2) / 3;
if (pow < 0.1) return;  // too short, no shot
if (pow > 1) pow = 1;   // capped at max
```

The arrow entity gets created with velocity `pow * 2.0f`. Fully drawn arrows (pow == 1.0) are flagged as **critical** via `setCritArrow(true)`.

The max use duration is `20 * 60 * 60` ticks (one hour), so the player has plenty of time to hold the draw.

### Enchantment Support

| Enchantment | Effect |
|-------------|--------|
| Power (`arrowBonus`) | Adds `level * 0.5 + 0.5` to arrow base damage |
| Punch (`arrowKnockback`) | Sets arrow knockback to the enchantment level |
| Flame (`arrowFire`) | Sets arrow on fire for 100 ticks |
| Infinity (`arrowInfinite`) | Fires without consuming arrows; arrows drop with `PICKUP_CREATIVE_ONLY` |

Creative mode and the Infinity enchantment both let you fire without using up arrows from inventory. The `use()` method checks for either `instabuild` or having arrows before starting the draw.

### Durability

Uses **1 durability per shot**, applied through `itemInstance->hurt(1, player)`.

### Draw Icons

Three pull textures are registered (`bow_pull_0`, `bow_pull_1`, `bow_pull_2`) via the `TEXTURE_PULL` array. The `getDrawnIcon(int amount)` method returns the right icon based on draw progress. The constant `BOW_ICONS_COUNT = 3` defines the number of draw stages.

## PotionItem

**Files:** `Minecraft.World/PotionItem.h`, `Minecraft.World/PotionItem.cpp`

| Property | Value |
|----------|-------|
| ID | 373 |
| Drink Duration | 32 ticks (`(int)(20 * 1.6)`) |
| Stack Size | 1 |
| Use Animation | `UseAnim_drink` |

Potions use `auxValue` to encode the potion type and modifiers. The static method `isThrowable(auxValue)` checks if a potion is a splash potion. When thrown, a `ThrownPotion` entity gets created.

The item has multiple sprite layers (base + overlay for liquid color) and caches mob effects per aux value in an `unordered_map<int, vector<MobEffectInstance*>*>`. Three icons are registered: `DEFAULT_ICON`, `THROWABLE_ICON`, and `CONTENTS_ICON`. The `getIcon` and `getLayerIcon` methods pick the right sprites based on whether the potion is throwable and which sprite layer is being drawn.

For the full potion effect system, see [Effects (Potions)](/slop-docs/world/effects/).

## Throwable Items

All throwable items work the same way: right-click calls `use()`, which decreases the stack, plays a bow-like sound, and spawns a projectile entity on the server side.

### SnowballItem

**Files:** `Minecraft.World/SnowballItem.h`, `Minecraft.World/SnowballItem.cpp`

| Property | Value |
|----------|-------|
| ID | 332 |
| Stack Size | 16 |
| Projectile Entity | `Snowball` |

Spawns a `Snowball` entity on use. Does knockback but no damage to most mobs. Blazes are the exception, taking 3 damage. Creative mode doesn't consume the snowball.

### EnderpearlItem

**Files:** `Minecraft.World/EnderpearlItem.h`, `Minecraft.World/EnderpearlItem.cpp`

| Property | Value |
|----------|-------|
| ID | 368 |
| Stack Size | 16 |
| Projectile Entity | `ThrownEnderpearl` |

Spawns a `ThrownEnderpearl` entity on use. Teleports the player to where it lands and deals 5 fall damage. You can't throw one while riding an entity (`player->riding != NULL`). Creative mode doesn't consume the pearl.

Note: The original Java code disabled ender pearl use in Creative mode entirely, but 4J commented that out ("Not sure why this was disabled for creative mode") and instead just skips consuming the item.

### EggItem

**Files:** `Minecraft.World/EggItem.h`, `Minecraft.World/EggItem.cpp`

| Property | Value |
|----------|-------|
| ID | 344 |
| Stack Size | 16 |
| Projectile Entity | `ThrownEgg` |

Spawns a `ThrownEgg` entity. There's a 1/8 chance of spawning a chicken on impact, and a further 1/32 chance of spawning four chickens instead. Creative mode doesn't consume the egg.

### ExperienceItem (Bottle o' Enchanting)

**Files:** `Minecraft.World/ExperienceItem.h`, `Minecraft.World/ExperienceItem.cpp`

| Property | Value |
|----------|-------|
| ID | 384 |
| Stack Size | 64 |
| Projectile Entity | `ThrownExpBottle` |
| Foil Effect | Always (`isFoil` returns `true`) |

Spawns a `ThrownExpBottle` entity that releases experience orbs when it hits something. Always shows the enchantment glint. Creative mode doesn't consume the bottle.

## FireChargeItem

**Files:** `Minecraft.World/FireChargeItem.h`, `Minecraft.World/FireChargeItem.cpp`

| Property | Value |
|----------|-------|
| ID | 385 |
| Stack Size | 64 |
| Base Item Type | `eBaseItemType_torch` |
| Material | `eMaterial_setfire` |

Unlike other combat items, fire charges use `useOn` instead of `use`. You have to target a block face. The fire charge offsets the position by the face direction and checks if the target space is air (tile ID 0). If so, it places a fire block there and plays the `FIRE_IGNITE` sound. It's consumed on use (unless you're in Creative mode).

There's also a secondary icon (`dragonFireball`) registered via `registerIcons`. When the aux value is > 0, `getIcon` returns this alternative icon instead of the default. This is used by the Ender Dragon's fireball projectile.

## Potion Brewing Ingredients

Several items are tagged with potion brewing formulas through `setPotionBrewingFormula()`. See [Raw Materials](/slop-docs/world/items/materials/) for the full brewing ingredient table.

## Combat Item ID Registry

| ID | Item | Type |
|----|------|------|
| 261 | Bow | BowItem |
| 262 | Arrow | Item |
| 332 | Snowball | SnowballItem |
| 344 | Egg | EggItem |
| 368 | Ender Pearl | EnderpearlItem |
| 373 | Potion | PotionItem |
| 384 | Bottle o' Enchanting | ExperienceItem |
| 385 | Fire Charge | FireChargeItem |

## MinecraftConsoles differences

The combat item system is mostly the same, but MinecraftConsoles adds firework rockets as a placeable/launchable item:

- **`FireworksItem`** (ID 401) uses `useOn` to place a `FireworksRocketEntity` on a block face. It reads explosion data from NBT tags (`TAG_FIREWORKS`, `TAG_EXPLOSIONS`, `TAG_FLIGHT`, etc.) and supports five explosion shape types: small ball (`TYPE_SMALL` = 0), large ball (`TYPE_BIG` = 1), star (`TYPE_STAR` = 2), creeper face (`TYPE_CREEPER` = 3), and burst (`TYPE_BURST` = 4). Each explosion entry can have trail (`TAG_E_TRAIL`) and flicker (`TAG_E_FLICKER`) flags plus custom colors (`TAG_E_COLORS`) and fade colors (`TAG_E_FADECOLORS`). The base item type is `eBaseItemType_fireworks`.
- **`FireworksChargeItem`** (ID 402) is a multi-layer sprite item that reads its tooltip text from the explosion compound tag. Has its own overlay icon and uses `getExplosionTagField` to pull specific fields out of the explosion NBT data. Also uses `eBaseItemType_fireworks`.

The `BowItem`, `PotionItem`, `SnowballItem`, `EnderpearlItem`, `EggItem`, `ExperienceItem`, and `FireChargeItem` classes are all the same between the two codebases.

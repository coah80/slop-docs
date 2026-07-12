---
title: Enchantment & Effect IDs
description: Every enchantment and mob-effect ID registered in neoLegacy, extracted from source.
---

Complete registry of the 27 enchantments and 23 mob effects registered at
engine boot. Both tables are extracted verbatim from source:

- **Enchantments:** `Minecraft.World/Enchantment.cpp:54-102` (the block of
  `new …Enchantment(id, freq, …)` calls inside `Enchantment::staticCtor()`).
- **Mob effects:** `Minecraft.World/MobEffect.cpp:47-81` (the block of
  `new MobEffect(id, isBad, color)` calls inside `MobEffect::staticCtor()`).

Both static constructors run during boot from `MinecraftWorld_RunStaticCtors()`
(`Minecraft.World/Minecraft.World.cpp`): `MobEffect::staticCtor()` at line 42,
`Enchantment::staticCtor()` at line 74. Display names below are the resolved
English strings from
[`stringsGeneric.xml`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/Windows64Media/loc/stringsGeneric.xml)
(each `IDS_…` constant → its `<value>`).

For the systems that consume these registries, see
[Enchantments](/slop-docs/world/enchantments/) and
[Mob Effects & Potions](/slop-docs/world/effects/).

## Enchantments

Enchantments are registered into a fixed 256-slot array
(`EnchantmentArray Enchantment::enchantments(256)`, `Enchantment.cpp:13`). Each
is constructed with a hard-coded ID, a **frequency** (weight for the enchanting
table), and an **applicable-to category** (`EnchantmentCategory`,
`EnchantmentCategory.h`). IDs are grouped by item family and are **not
contiguous** — armor 0–9, weapon 16–21, digger 32–35, bow 48–51, fishing rod
64–65, treasure 70.

### ID table

| ID | Static field | Class | Display name | Applicable to | Max lvl | Frequency |
|---:|---|---|---|---|:---:|---|
| 0 | `allDamageProtection` | `ProtectionEnchantment` (ALL) | Protection | armor | 4 | Common (10) |
| 1 | `fireProtection` | `ProtectionEnchantment` (FIRE) | Fire Protection | armor | 4 | Uncommon (5) |
| 2 | `fallProtection` | `ProtectionEnchantment` (FALL) | Feather Falling | armor (feet) | 4 | Uncommon (5) |
| 3 | `explosionProtection` | `ProtectionEnchantment` (EXPLOSION) | Blast Protection | armor | 4 | Rare (2) |
| 4 | `projectileProtection` | `ProtectionEnchantment` (PROJECTILE) | Projectile Protection | armor | 4 | Uncommon (5) |
| 5 | `drownProtection` | `OxygenEnchantment` | Respiration | armor (head) | 3 | Rare (2) |
| 6 | `waterWorker` | `WaterWorkerEnchantment` | Aqua Affinity | armor (head) | 1 | Rare (2) |
| 7 | `thorns` | `ThornsEnchantment` | Thorns | armor (torso) | 3 | Very rare (1) |
| 8 | `waterWalker` | `WaterWalkerEnchantment` | Depth Strider | armor (feet) | 3 | Rare (2) |
| 9 | `frostWalker` | `FrostWalkerEnchantment` | Frost Walker | armor (feet) | 2 | Rare (2) |
| 16 | `damageBonus` | `DamageEnchantment` (ALL) | Sharpness | weapon | 5 | Common (10) |
| 17 | `damageBonusUndead` | `DamageEnchantment` (UNDEAD) | Smite | weapon | 5 | Uncommon (5) |
| 18 | `damageBonusArthropods` | `DamageEnchantment` (ARTHROPODS) | Bane of Arthropods | weapon | 5 | Uncommon (5) |
| 19 | `knockback` | `KnockbackEnchantment` | Knockback | weapon | 2 | Uncommon (5) |
| 20 | `fireAspect` | `FireAspectEnchantment` | Fire Aspect | weapon | 2 | Rare (2) |
| 21 | `lootBonus` | `LootBonusEnchantment` (weapon) | Looting | weapon | 3 | Rare (2) |
| 32 | `diggingBonus` | `DiggingEnchantment` | Efficiency | digger | 5 | Common (10) |
| 33 | `untouching` | `UntouchingEnchantment` | Silk Touch | digger | 1 | Very rare (1) |
| 34 | `digDurability` | `DigDurabilityEnchantment` | Unbreaking | digger | 3 | Uncommon (5) |
| 35 | `resourceBonus` | `LootBonusEnchantment` (digger) | Fortune | digger | 3 | Rare (2) |
| 48 | `arrowBonus` | `ArrowDamageEnchantment` | Power | bow | 5 | Common (10) |
| 49 | `arrowKnockback` | `ArrowKnockbackEnchantment` | Punch | bow | 2 | Rare (2) |
| 50 | `arrowFire` | `ArrowFireEnchantment` | Flame | bow | 1 | Rare (2) |
| 51 | `arrowInfinite` | `ArrowInfiniteEnchantment` | Infinity | bow | 1 | Very rare (1) |
| 64 | `lure` | `LureEnchantment` | Lure | fishing rod | 3 | Rare (2) |
| 65 | `luckOfTheSea` | `LuckOfTheSeaEnchantment` | Luck of the Sea | fishing rod | 3 | Rare (2) |
| 70 | `mending` | `MendingEnchantment` | Mending | all (damageable) | 1 | Rare (2) |

Notes:

- **`ProtectionEnchantment`** carries a `type` field (ALL/FIRE/FALL/EXPLOSION/
  PROJECTILE) that selects its display name from
  `ProtectionEnchantment::names[]` (`ProtectionEnchantment.cpp:7`). The FALL type
  (Feather Falling) overrides its category to `armor_feet` in the constructor
  (`ProtectionEnchantment.cpp:14`); the other four are `armor`.
- **`DamageEnchantment`** likewise carries ALL/UNDEAD/ARTHROPODS and picks its
  name from `DamageEnchantment::names[]` (`DamageEnchantment.cpp:6`). Its
  `canEnchant` also allows axes (`HatchetItem`) in addition to swords
  (`DamageEnchantment.cpp:57`).
- **`LootBonusEnchantment`** is registered twice — once for `weapon` (Looting,
  id 21) and once for `digger` (Fortune, id 35). It swaps its description ID to
  `IDS_ENCHANTMENT_LOOT_BONUS_DIGGER` when the category is `digger`
  (`LootBonusEnchantment.cpp:7`).

### Frequency (rarity) constants

Passed as the second constructor argument; higher = more common in the
enchanting table. Defined in `Enchantment.h:15-18`.

| Constant | Value |
|---|---:|
| `FREQ_COMMON` | 10 |
| `FREQ_UNCOMMON` | 5 |
| `FREQ_RARE` | 2 |
| `FREQ_VERY_RARE` | 1 |

### Treasure enchantments

An enchantment is added to `validEnchantments` (the pool the enchanting table
can roll) only if `isTreasureEnchantment()` returns `false`
(`Enchantment.cpp:97`). The base returns `false` (`Enchantment.h:88`); two
overrides return `true`, so these are **treasure-only** (obtainable via loot,
fishing, or trades but never the enchanting table):

| ID | Enchantment | Override |
|---:|---|---|
| 9 | Frost Walker | `FrostWalkerEnchantment.h:16` |
| 70 | Mending | `MendingEnchantment.h:13` |

Both are post-TU19 backports. See
[neoLegacy Additions](/slop-docs/features/neolegacy-additions/) for the wider
set of backported content.

### Applicable-to categories

The category decides which items can receive an enchantment, resolved in
`EnchantmentCategory::canEnchant()` (`EnchantmentCategory.cpp:16`).

| Category | Matches item type |
|---|---|
| `all` | any item (always true) |
| `armor` | any `ArmorItem` |
| `armor_head` | `ArmorItem` in the head slot |
| `armor_torso` | `ArmorItem` in the torso slot |
| `armor_legs` | `ArmorItem` in the legs slot |
| `armor_feet` | `ArmorItem` in the feet slot |
| `weapon` | `WeaponItem` (swords) |
| `digger` | `DiggerItem` (pickaxes/shovels/axes) |
| `bow` | `BowItem` |
| `fishing_rod` | `FishingRodItem` |

## Mob effects

Effects are registered into a fixed array `MobEffect::effects[NUM_EFFECTS]`
(`MobEffect.cpp:12`) plus 23 named static pointers. IDs run **1–23**
contiguously (slot 0 / `voidEffect` is null). Eight further slots
`reserved_24`…`reserved_31` are declared and set to `null`
(`MobEffect.cpp:73-80`) — placeholders with no effect registered.

The **beneficial / harmful** flag is the second constructor argument (`isBad` →
`_isHarmful`). It affects duration scaling: harmful effects get a `0.5×`
duration modifier by default (`MobEffect.cpp:92-98`).

### ID table

| ID | Static field | Class | Display name | Nature | Instant? |
|---:|---|---|---|---|:---:|
| 1 | `movementSpeed` | `MobEffect` | Speed | Beneficial | No |
| 2 | `movementSlowdown` | `MobEffect` | Slowness | Harmful | No |
| 3 | `digSpeed` | `MobEffect` | Haste | Beneficial | No |
| 4 | `digSlowdown` | `MobEffect` | Mining Fatigue | Harmful | No |
| 5 | `damageBoost` | `AttackDamageMobEffect` | Strength | Beneficial | No |
| 6 | `heal` | `InstantenousMobEffect` | Instant Health | Beneficial | Yes |
| 7 | `harm` | `InstantenousMobEffect` | Instant Damage | Harmful | Yes |
| 8 | `jump` | `MobEffect` | Jump Boost | Beneficial | No |
| 9 | `confusion` | `MobEffect` | Nausea | Harmful | No |
| 10 | `regeneration` | `MobEffect` | Regeneration | Beneficial | No |
| 11 | `damageResistance` | `MobEffect` | Resistance | Beneficial | No |
| 12 | `fireResistance` | `MobEffect` | Fire Resistance | Beneficial | No |
| 13 | `waterBreathing` | `MobEffect` | Water Breathing | Beneficial | No |
| 14 | `invisibility` | `MobEffect` | Invisibility | Beneficial | No |
| 15 | `blindness` | `MobEffect` | Blindness | Harmful | No |
| 16 | `nightVision` | `MobEffect` | Night Vision | Beneficial | No |
| 17 | `hunger` | `MobEffect` | Hunger | Harmful | No |
| 18 | `weakness` | `AttackDamageMobEffect` | Weakness | Harmful | No |
| 19 | `poison` | `MobEffect` | Poison | Harmful | No |
| 20 | `wither` | `MobEffect` | Wither | Harmful | No |
| 21 | `healthBoost` | `HealthBoostMobEffect` | Health Boost | Beneficial | No |
| 22 | `absorption` | `AbsoptionMobEffect` | Absorption | Beneficial | No |
| 23 | `saturation` | `InstantenousMobEffect` | Saturation | Beneficial | Yes |

"Instant?" marks the three effects implemented by `InstantenousMobEffect`
(heal/harm/saturation), which apply once via `applyInstantenousEffect()` rather
than ticking. `AbsoptionMobEffect` is spelled that way in source
(`MobEffect.cpp:71`).

### Attribute modifiers

Six effects attach an `AttributeModifier` to a
[`SharedMonsterAttributes`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/SharedMonsterAttributes.h)
value via `addAttributeModifier(...)` at registration (`MobEffect.cpp:50-70`):

| ID | Effect | Attribute | Amount | Operation |
|---:|---|---|---:|---|
| 1 | Speed | `MOVEMENT_SPEED` | +0.2 | multiply total |
| 2 | Slowness | `MOVEMENT_SPEED` | −0.15 | multiply total |
| 5 | Strength | `ATTACK_DAMAGE` | +3 | multiply total |
| 18 | Weakness | `ATTACK_DAMAGE` | +2 | addition |
| 21 | Health Boost | `MAX_HEALTH` | +4 | addition |

The effective amount scales with the amplifier: `amount × (amplifier + 1)`
(`MobEffect::getAttributeModifierValue`, `MobEffect.cpp:388`).

### Duration modifiers

Some effects override the default duration scaling with `setDurationModifier(…)`
at registration; the rest use the default (`1.0` for beneficial, `0.5` for
harmful, set in the constructor at `MobEffect.cpp:92-98`).

| ID | Effect | Duration modifier | Source |
|---:|---|---:|---|
| 3 | Haste | 1.5 | `MobEffect.cpp:52` |
| 9 | Nausea | 0.25 | `MobEffect.cpp:58` |
| 10 | Regeneration | 0.25 | `MobEffect.cpp:59` |
| 15 | Blindness | 0.25 | `MobEffect.cpp:64` |
| 19 | Poison | 0.25 | `MobEffect.cpp:68` |
| 20 | Wither | 0.25 | `MobEffect.cpp:69` |

### Reserved slots

`reserved_24`…`reserved_31` are declared as static fields (`MobEffect.cpp:38-45`)
and explicitly set to `nullptr` in `staticCtor()` (`MobEffect.cpp:73-80`). No
effect is registered for IDs 24–31; they exist only to reserve the array range.

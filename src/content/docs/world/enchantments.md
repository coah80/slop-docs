---
title: Enchantments
description: The Enchantment registry in neoLegacy — 27 enchantments with hard-coded IDs, cost/level formulas, and the post-TU19 Depth Strider, Frost Walker, Mending, Lure and Luck of the Sea backports.
---

Enchantments in neoLegacy are a direct C++ port of the Java LCE `Enchantment`
hierarchy. Every enchantment is a subclass of `Enchantment` constructed once, at
boot, into a fixed 256-slot array indexed by numeric ID. There is no dynamic
registry, no data pack: the whole table is built inline in
`Enchantment::staticCtor()`.

Files: `Enchantment.h`, `Enchantment.cpp`, one `*Enchantment.h`/`.cpp` pair per
subclass, plus `EnchantmentCategory.h`, `EnchantmentHelper.cpp`, and the UI
(`EnchantmentMenu`, `EnchantmentTableTile`, `EnchantmentTableEntity`).

## Base class

`class Enchantment` (`Enchantment.h:8`) holds the registry and the shared cost
model. The registry is a 256-wide array, **not** an auto-incrementing list —
IDs are hard-coded and sparse:

```cpp
EnchantmentArray Enchantment::enchantments = EnchantmentArray( 256 );
vector<Enchantment *> Enchantment::validEnchantments;
```

Each enchantment also gets a named `static Enchantment *` pointer
(`allDamageProtection`, `frostWalker`, `mending`, `luckOfTheSea`, …,
`Enchantment.h:21-57`).

### Frequency (rarity)

Selection weight is a `frequency` constant baked in at construction
(`Enchantment.h:15-18`):

| Constant | Value | Rarity |
|----------|-------|--------|
| `FREQ_COMMON` | 10 | common |
| `FREQ_UNCOMMON` | 5 | uncommon |
| `FREQ_RARE` | 2 | rare |
| `FREQ_VERY_RARE` | 1 | very rare |

### Cost model

The base cost formula (`Enchantment.cpp:142`) is `getMinCost(level) = 1 + level * 10`,
`getMaxCost(level) = getMinCost(level) + 5`. Most subclasses override these to
match vanilla enchantability windows (see the table below). `getMinLevel()`
returns 1 and `getMaxLevel()` returns 1 on the base class; subclasses override
`getMaxLevel()`.

### Treasure enchantments

`isTreasureEnchantment()` returns `false` on the base class. Treasure
enchantments (Frost Walker, Mending) return `true`, which excludes them from
`validEnchantments`: after building the table, `staticCtor()` copies only
non-treasure enchantments into that vector (`Enchantment.cpp:94-101`), so the
enchanting table can never roll them.

## Registration

Everything is wired in `Enchantment::staticCtor()` (`Enchantment.cpp:54`), called
from the master bootstrap `MinecraftWorld_RunStaticCtors()`
(`Minecraft.World.cpp`). Each line is a `new Subclass(id, freq[, type])`; the
constructor calls `_init(id)` which stores `this` into `enchantments[id]` and
`DEBUG_BREAK()`s on a duplicate ID (`Enchantment.cpp:104-115`).

```cpp
frostWalker  = new FrostWalkerEnchantment(9, FREQ_RARE);
lure         = new LureEnchantment(64, FREQ_RARE);
luckOfTheSea = new LuckOfTheSeaEnchantment(65, FREQ_RARE);
mending      = new MendingEnchantment(70, FREQ_RARE);
```

## The 27 registered enchantments

IDs are grouped by equipment class (armor 0–9, weapon 16–21, digger 32–35, bow
48–51, fishing rod 64–65, misc 70). Values below are read directly from the
subclass `.cpp` files.

| ID | Static field | Class | In-game name | Max lvl | Freq | Category |
|----|--------------|-------|--------------|---------|------|----------|
| 0 | `allDamageProtection` | `ProtectionEnchantment(ALL)` | Protection | 4 | common | armor |
| 1 | `fireProtection` | `ProtectionEnchantment(FIRE)` | Fire Protection | 4 | uncommon | armor |
| 2 | `fallProtection` | `ProtectionEnchantment(FALL)` | Feather Falling | 4 | uncommon | armor_feet |
| 3 | `explosionProtection` | `ProtectionEnchantment(EXPLOSION)` | Blast Protection | 4 | rare | armor |
| 4 | `projectileProtection` | `ProtectionEnchantment(PROJECTILE)` | Projectile Protection | 4 | uncommon | armor |
| 5 | `drownProtection` | `OxygenEnchantment` | Respiration | 3 | rare | armor_head |
| 6 | `waterWorker` | `WaterWorkerEnchantment` | Aqua Affinity | 1 | rare | armor_head |
| 7 | `thorns` | `ThornsEnchantment` | Thorns | 3 | very rare | armor |
| 8 | `waterWalker` | `WaterWalkerEnchantment` | **Depth Strider** | 3 | rare | armor_feet |
| 9 | `frostWalker` | `FrostWalkerEnchantment` | **Frost Walker** (treasure) | 2 | rare | armor_feet |
| 16 | `damageBonus` | `DamageEnchantment(ALL)` | Sharpness | 5 | common | weapon |
| 17 | `damageBonusUndead` | `DamageEnchantment(UNDEAD)` | Smite | 5 | uncommon | weapon |
| 18 | `damageBonusArthropods` | `DamageEnchantment(ARTHROPODS)` | Bane of Arthropods | 5 | uncommon | weapon |
| 19 | `knockback` | `KnockbackEnchantment` | Knockback | 2 | uncommon | weapon |
| 20 | `fireAspect` | `FireAspectEnchantment` | Fire Aspect | 2 | rare | weapon |
| 21 | `lootBonus` | `LootBonusEnchantment(weapon)` | Looting | 3 | rare | weapon |
| 32 | `diggingBonus` | `DiggingEnchantment` | Efficiency | 5 | common | digger |
| 33 | `untouching` | `UntouchingEnchantment` | Silk Touch | 1 | very rare | digger |
| 34 | `digDurability` | `DigDurabilityEnchantment` | Unbreaking | 3 | uncommon | digger |
| 35 | `resourceBonus` | `LootBonusEnchantment(digger)` | Fortune | 3 | rare | digger |
| 48 | `arrowBonus` | `ArrowDamageEnchantment` | Power | 5 | common | bow |
| 49 | `arrowKnockback` | `ArrowKnockbackEnchantment` | Punch | 2 | rare | bow |
| 50 | `arrowFire` | `ArrowFireEnchantment` | Flame | 1 | rare | bow |
| 51 | `arrowInfinite` | `ArrowInfiniteEnchantment` | Infinity | 1 | very rare | bow |
| 64 | `lure` | `LureEnchantment` | **Lure** | 3 | rare | fishing_rod |
| 65 | `luckOfTheSea` | `LuckOfTheSeaEnchantment` | **Luck of the Sea** | 3 | rare | fishing_rod |
| 70 | `mending` | `MendingEnchantment` | **Mending** (treasure) | 1 | rare | all |

That is 27 registered enchantments. IDs 10–15, 22–31, 36–47, 52–63, 66–69 are
holes in the array. `validEnchantments` (what the table can roll) is these 27
minus the two treasure enchantments (Frost Walker, Mending) → 25.

## Categories

`EnchantmentCategory` (`EnchantmentCategory.h`) is a fixed set of item-class
gates, not a data structure you register into: `all`, `armor`, `armor_feet`,
`armor_legs`, `armor_torso`, `armor_head`, `weapon`, `digger`, `bow`,
`fishing_rod`. `canEnchant(item)` (`Enchantment.cpp:186`) delegates to
`category->canEnchant(item->getItem())`. Note `DamageEnchantment` overrides this
to also allow axes (`HatchetItem`) even though its category is `weapon`
(`DamageEnchantment.cpp:57`).

## Cost formulas by subclass

Overridden `getMinCost` / `getMaxCost` define each enchantment's enchantability
window. Selected values from source:

| Class | getMinCost(level) | getMaxCost(level) |
|-------|-------------------|-------------------|
| `Enchantment` (base) | `1 + level*10` | `min + 5` |
| `ProtectionEnchantment` | `minCost[type] + (level-1)*levelCost[type]` | `min + levelCostSpan[type]` |
| `DamageEnchantment` | `minCost[type] + (level-1)*levelCost[type]` | `min + levelCostSpan[type]` |
| `OxygenEnchantment` (Respiration) | `10 * level` | `min + 30` |
| `WaterWorkerEnchantment` (Aqua Affinity) | `1` | `min + 40` |
| `WaterWalkerEnchantment` (Depth Strider) | `1 + (level-1)*10` | `min + 15` |
| `FrostWalkerEnchantment` (Frost Walker) | `level * 10` | `min + 15` |
| `LureEnchantment` | `9*level + 6` | `Enchantment::getMinCost(level) + 50` |
| `LuckOfTheSeaEnchantment` | `9*level + 6` | `Enchantment::getMinCost(level) + 50` |
| `MendingEnchantment` | `level * 25` | `min + 50` |

`ProtectionEnchantment`'s per-type arrays (`ProtectionEnchantment.cpp:7-10`):
`minCost = {1,10,5,5,3}`, `levelCost = {11,8,6,8,6}`, `levelCostSpan = {20,12,10,12,15}`
indexed by `ALL, FIRE, FALL, EXPLOSION, PROJECTILE`. `DamageEnchantment`'s
(`DamageEnchantment.cpp:7-9`): `minCost = {1,5,5}`, `levelCost = {11,8,8}`,
`levelCostSpan = {20,20,20}` indexed by `ALL, UNDEAD, ARTHROPODS`.

## Depth Strider vs Frost Walker (the two "walker" enchantments)

The naming is easy to confuse because the port keeps the legacy field names.
There are three water/feet-related armor enchantments:

- **`drownProtection` = `OxygenEnchantment` (id 5)** — Respiration, extends
  underwater breathing, `armor_head`.
- **`waterWorker` = `WaterWorkerEnchantment` (id 6)** — Aqua Affinity, faster
  underwater mining, `armor_head`, single level.
- **`waterWalker` = `WaterWalkerEnchantment` (id 8)** — **Depth Strider**,
  `armor_feet`, up to level 3. This is the underwater-movement-speed enchantment,
  present in the TU19 base.
- **`frostWalker` = `FrostWalkerEnchantment` (id 9)** — **Frost Walker**, a
  post-TU19 backport, `armor_feet`, up to level 2, and a treasure enchantment
  (never rolls at the table).

### Frost Walker mechanics

`FrostWalkerEnchantment::freezeNearby()` (`FrostWalkerEnchantment.cpp:29`) turns
water into frosted ice under a walking, on-ground wearer. The radius is
`2 + enchLevel` (clamped to 16), and each candidate block must be flush water
(`Material::water`, data 0) with air above before `Tile::frosted_ice` is placed:

```cpp
if (Tile::frosted_ice->mayPlace(level, bx, by, bz))
{
    level->setTileAndData(bx, by, bz, Tile::frosted_ice_Id, 0, Tile::UPDATE_ALL);
}
```

This is the enchantment that motivated the `FrostedIceTile` / packed-ice block
additions. See [Blocks](/slop-docs/world/blocks/) for the frosted-ice tile.

### Mending

`MendingEnchantment` (`MendingEnchantment.cpp`) is a treasure enchantment,
category `all`, single level, cost `level*25 .. level*25+50`. Its `canEnchant`
override accepts any damageable item (`item->isDamageableItem()`), not just a
fixed category.

## Fishing rod: Lure and Luck of the Sea

Both are `fishing_rod`-category, `FREQ_RARE`, max level 3, and share the same
cost window (`9*level + 6` .. `Enchantment::getMinCost(level) + 50`). Their
`.cpp` headers credit the reference decomp
(`// Source: https://github.com/GRAnimated/MinecraftLCE`). They are the two rod
enchantments the enchanting table can roll (neither is treasure).

## Enchanting table mechanics

The three enchantment offers are computed by `EnchantmentMenu`
(`EnchantmentMenu.cpp`) server-side. Bookshelves are counted in the 5×5 ring
around the table, requiring a clear gap between table and shelf
(`EnchantmentMenu.cpp:129-172`); the counter can reach the standard 15-shelf max.
Each slot's level is `EnchantmentHelper::getEnchantmentCost(random, slot, bookcases, item)`
(`EnchantmentMenu.cpp:177`).

The cost function (`EnchantmentHelper.cpp:303`) is the updated 1.3-era formula —
its own comment reads `// 4J Stu - Updated function to 1.3 version for TU7`:

```cpp
if (bookcases > 15) bookcases = 15;
int selected = random->nextInt(8) + 1 + (bookcases >> 1) + random->nextInt(bookcases + 1);
if (slot == 0) return max((selected / 3), 1);
if (slot == 1) return max(selected, bookcases * 2);
return selected;                       // slot 2
```

The three costs are sorted ascending, then `EnchantmentHelper::selectEnchantment`
rolls the actual enchantment(s) per slot. Enchanting an item consumes the seed
(`player->enchantmentSeed = random.nextInt(1000000)`, `EnchantmentMenu.cpp:265`),
so re-inserting the same item after a bookshelf change re-rolls. Books route to
`Item::enchanted_book` and use `addEnchantment`; tools use `item->enchant(...)`
(`EnchantmentMenu.cpp:241-254`).

## neoLegacy / 4J delta vs vanilla TU19

- **Frost Walker** (`FrostWalkerEnchantment`, id 9) is a post-TU19 backport,
  paired with the frosted-ice / packed-ice blocks.
- **Mending** (`MendingEnchantment`, id 70) is a post-TU19 treasure enchantment;
  it sits alone in the misc/treasure ID band well above the vanilla ranges.
- **Lure** and **Luck of the Sea** (ids 64/65) fill out the fishing-rod category.
- Both Frost Walker and Mending are treasure enchantments, so the pool the table
  can roll (`validEnchantments`) is 25, not 27.
- The enchanting-cost formula is the TU7-era 1.3 version, not the original TU19
  base formula, with the bookshelf count capped at 15.

## Related pages

- [Effects & Potions](/slop-docs/world/effects/)
- [Blocks](/slop-docs/world/blocks/) — frosted ice / packed ice
- [Container Menus](/slop-docs/world/containers/) — `EnchantmentMenu`
- [Minecraft.World Overview](/slop-docs/world/overview/)

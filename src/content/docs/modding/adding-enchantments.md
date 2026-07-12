---
title: Adding Enchantments
description: Step-by-step guide to adding new enchantments to LCE.
---

import { Aside } from '@astrojs/starlight/components';

This guide covers the LCE enchantment system: how to create enchantment subclasses, register them, define cost curves, implement damage/protection modifiers, set up compatibility rules, and how the enchanting table's selection algorithm works. It also covers the anvil combining system from `RepairMenu`.

For advanced enchantment tricks (conflict overrides, pushing past level limits, enchantments that do completely new things), see [Custom Enchantments](/slop-docs/modding/custom-enchantments/).

## Enchantment system overview

The enchantment system spans several files in `Minecraft.World/`:

| File | Purpose |
|------|---------|
| `Enchantment.h` / `.cpp` | Base class, static registry, frequency constants |
| `EnchantmentCategory.h` | Item type categories (armor, weapon, digger, bow) |
| `EnchantmentInstance.h` | Pairs an enchantment with a level (used in selection) |
| `EnchantmentHelper.h` / `.cpp` | Static utilities: damage calculation, enchanting table algorithm |
| `EnchantmentMenu.h` / `.cpp` | The enchanting table container/UI |
| `RepairMenu.h` / `.cpp` | The anvil container: combining, renaming, enchantment merging |
| Subclasses | `ProtectionEnchantment`, `DamageEnchantment`, `ThornsEnchantment`, etc. |

## Step 1: Create an enchantment subclass

### Header (`Minecraft.World/MyEnchantment.h`)

```cpp
#pragma once
#include "Enchantment.h"

class MyEnchantment : public Enchantment
{
public:
    MyEnchantment(int id, int frequency);

    virtual int getMinCost(int level);
    virtual int getMaxCost(int level);
    virtual int getMaxLevel();

    // Override one or both of these for combat enchantments:
    virtual int getDamageProtection(int level, DamageSource *source);
    virtual int getDamageBonus(int level, shared_ptr<Mob> target);

    // Override for custom compatibility rules:
    virtual bool isCompatibleWith(Enchantment *other) const;
};
```

### Implementation (`Minecraft.World/MyEnchantment.cpp`)

```cpp
#include "MyEnchantment.h"

MyEnchantment::MyEnchantment(int id, int frequency)
    : Enchantment(id, frequency, EnchantmentCategory::weapon)
{
    setDescriptionId(IDS_ENCHANTMENT_MY_ENCH);
}

int MyEnchantment::getMinCost(int level)
{
    return 5 + (level - 1) * 10;
}

int MyEnchantment::getMaxCost(int level)
{
    return getMinCost(level) + 20;
}

int MyEnchantment::getMaxLevel()
{
    return 3;
}

int MyEnchantment::getDamageBonus(int level, shared_ptr<Mob> target)
{
    // Example: flat bonus per level
    return level * 2;
}

bool MyEnchantment::isCompatibleWith(Enchantment *other) const
{
    // Incompatible with other damage enchantments
    return dynamic_cast<DamageEnchantment *>(other) == NULL;
}
```

## Step 2: The enchantment base class

The `Enchantment` constructor automatically registers itself into the global `enchantments[256]` array:

```cpp
Enchantment::Enchantment(int id, int frequency,
    const EnchantmentCategory *category)
    : id(id), frequency(frequency), category(category)
{
    _init(id);  // Stores 'this' in enchantments[id]
}
```

If you use a duplicate ID, it triggers `__debugbreak()` in debug builds.

### Key virtual methods

| Method | Default | Purpose |
|--------|---------|---------|
| `getMinLevel()` | 1 | Minimum enchantment level |
| `getMaxLevel()` | 1 | Maximum enchantment level |
| `getMinCost(level)` | `1 + level * 10` | Minimum enchantment value for this level to show up |
| `getMaxCost(level)` | `getMinCost(level) + 5` | Maximum enchantment value for this level |
| `getFrequency()` | Constructor arg | Weight in random selection |
| `getDamageProtection(level, source)` | 0 | Damage reduction points |
| `getDamageBonus(level, target)` | 0 | Extra damage dealt |
| `isCompatibleWith(other)` | `this != other` | Can coexist on the same item |
| `canEnchant(item)` | Delegates to category | Whether this enchantment applies to the item |

### Frequency constants

Frequency controls how likely the enchantment is to be picked from the candidate pool (higher = more common):

| Constant | Value | Examples |
|----------|-------|---------|
| `FREQ_COMMON` | 10 | Protection, Sharpness, Efficiency, Power |
| `FREQ_UNCOMMON` | 5 | Fire Protection, Smite, Knockback, Unbreaking |
| `FREQ_RARE` | 2 | Blast Protection, Fire Aspect, Looting, Fortune, Flame, Punch |
| `FREQ_VERY_RARE` | 1 | Silk Touch, Thorns, Infinity |

## Step 3: Enchantment categories

`EnchantmentCategory` decides which items an enchantment can go on:

| Category | Constant | Items |
|----------|----------|-------|
| All items | `EnchantmentCategory::all` | Everything |
| Any armor | `EnchantmentCategory::armor` | Helmets, chestplates, leggings, boots |
| Boots only | `EnchantmentCategory::armor_feet` | Boots |
| Leggings only | `EnchantmentCategory::armor_legs` | Leggings |
| Chestplate only | `EnchantmentCategory::armor_torso` | Chestplates |
| Helmet only | `EnchantmentCategory::armor_head` | Helmets |
| Weapons | `EnchantmentCategory::weapon` | Swords (and axes via override) |
| Diggers | `EnchantmentCategory::digger` | Pickaxes, shovels, axes |
| Bows | `EnchantmentCategory::bow` | Bows |

The category check happens through `EnchantmentCategory::canEnchant(Item *item)`, which uses a `dynamic_cast` chain to figure out the item type:

```cpp
bool EnchantmentCategory::canEnchant(Item *item) const
{
    if (this == all) return true;

    if (dynamic_cast<ArmorItem *>(item) != NULL)
    {
        if (this == armor) return true;
        ArmorItem *ai = (ArmorItem *) item;
        if (ai->slot == ArmorItem::SLOT_HEAD) return this == armor_head;
        if (ai->slot == ArmorItem::SLOT_LEGS) return this == armor_legs;
        if (ai->slot == ArmorItem::SLOT_TORSO) return this == armor_torso;
        if (ai->slot == ArmorItem::SLOT_FEET) return this == armor_feet;
        return false;
    }
    else if (dynamic_cast<WeaponItem *>(item) != NULL)
        return this == weapon;
    else if (dynamic_cast<DiggerItem *>(item) != NULL)
        return this == digger;
    else if (dynamic_cast<BowItem *>(item) != NULL)
        return this == bow;
    return false;
}
```

### Overriding canEnchant

Some enchantments override `canEnchant` to work on items outside their category. For example, `DamageEnchantment` (Sharpness/Smite/Bane) also works on axes:

```cpp
bool DamageEnchantment::canEnchant(shared_ptr<ItemInstance> item)
{
    HatchetItem *hatchet = dynamic_cast<HatchetItem *>(item->getItem());
    if (hatchet) return true;
    return Enchantment::canEnchant(item);
}
```

Similarly, `ThornsEnchantment` has category `armor_torso` but overrides `canEnchant` to accept any `ArmorItem`:

```cpp
bool ThornsEnchantment::canEnchant(shared_ptr<ItemInstance> item)
{
    ArmorItem *armor = dynamic_cast<ArmorItem *>(item->getItem());
    if (armor) return true;
    return Enchantment::canEnchant(item);
}
```

And `DiggingEnchantment` (Efficiency) accepts shears in addition to digger tools:

```cpp
bool DiggingEnchantment::canEnchant(shared_ptr<ItemInstance> item)
{
    ShearsItem *shears = dynamic_cast<ShearsItem *>(item->getItem());
    if (shears) return true;
    return Enchantment::canEnchant(item);
}
```

## Step 4: Register the enchantment

Add your enchantment to `Enchantment::staticCtor()` in `Minecraft.World/Enchantment.cpp`:

```cpp
// 1. Declare in Enchantment.h:
static Enchantment *myEnchantment;

// 2. Initialize in Enchantment.cpp (top of file):
Enchantment *Enchantment::myEnchantment = NULL;

// 3. Create in staticCtor():
void Enchantment::staticCtor()
{
    // ... existing enchantments ...

    myEnchantment = new MyEnchantment(64, FREQ_UNCOMMON);

    // The loop at the end collects all non-null entries
    // into validEnchantments automatically:
    for (unsigned int i = 0; i < 256; ++i)
    {
        Enchantment *enchantment = enchantments[i];
        if (enchantment != NULL)
        {
            validEnchantments.push_back(enchantment);
        }
    }
}
```

### Enchantment ID ranges

Vanilla enchantments use these ID ranges:

| Range | Category |
|-------|----------|
| 0-7 | Armor enchantments |
| 16-21 | Weapon enchantments |
| 32-35 | Tool/digger enchantments |
| 48-51 | Bow enchantments |

Pick an ID that doesn't collide with existing enchantments. IDs 0-255 are valid. Gaps between ranges (8-15, 22-31, 36-47, 52-63, 64-255) are all open.

## Step 5: Compatibility rules

The `isCompatibleWith()` method controls which enchantments can live on the same item. This check gets used in two places: the enchanting table algorithm (when picking bonus enchantments) and the anvil (when combining items).

### Default behavior

```cpp
bool Enchantment::isCompatibleWith(Enchantment *other) const
{
    return this != other;  // Only incompatible with itself
}
```

### Protection enchantment compatibility

`ProtectionEnchantment` has a more specific rule. Protection types are mutually exclusive (you can't have both Protection and Fire Protection), but Feather Falling works with all other protection types:

```cpp
bool ProtectionEnchantment::isCompatibleWith(Enchantment *other) const
{
    ProtectionEnchantment *pe =
        dynamic_cast<ProtectionEnchantment *>(other);
    if (pe != NULL)
    {
        if (pe->type == this->type) return false;
        if (this->type == FALL || pe->type == FALL) return true;
        return false;
    }
    return Enchantment::isCompatibleWith(other);
}
```

### Damage enchantment compatibility

All damage enchantments (Sharpness, Smite, Bane of Arthropods) are mutually exclusive:

```cpp
bool DamageEnchantment::isCompatibleWith(Enchantment *other) const
{
    return dynamic_cast<DamageEnchantment *>(other) == NULL;
}
```

### Silk Touch and Fortune

These two are also mutually exclusive, but through a different mechanism. Each one checks the other's ID directly:

```cpp
// UntouchingEnchantment (Silk Touch)
bool UntouchingEnchantment::isCompatibleWith(Enchantment *other) const
{
    return other->id != Enchantment::lootBonusDigger->id;  // Not compatible with Fortune
}

// LootBonusEnchantment (Fortune/Looting)
bool LootBonusEnchantment::isCompatibleWith(Enchantment *other) const
{
    return other->id != Enchantment::untouching->id;  // Not compatible with Silk Touch
}
```

<Aside type="note">
`LootBonusEnchantment` is used for both Fortune (ID 35, digger category) and Looting (ID 21, weapon category). The Silk Touch incompatibility only matters for Fortune since Looting can't go on digger tools anyway.
</Aside>

## Step 6: Damage and protection modifiers

### Protection modifiers

`getDamageProtection()` returns a protection value that feeds into `EnchantmentHelper::getDamageProtection()`. The total across all armor pieces is capped at 25, then randomized:

```cpp
// From EnchantmentHelper.cpp:
// Sum all protection values from armor pieces
if (sum > 25) sum = 25;
return ((sum + 1) >> 1) + random.nextInt((sum >> 1) + 1);
```

Here's how `ProtectionEnchantment` calculates protection based on type:

```cpp
int ProtectionEnchantment::getDamageProtection(
    int level, DamageSource *source)
{
    if (source->isBypassInvul()) return 0;

    float protect = (6 + level * level) / 3.0f;

    if (type == ALL)       return floor(protect * 0.75f);
    if (type == FIRE)      return floor(protect * 1.25f);  // fire only
    if (type == FALL)      return floor(protect * 2.5f);   // fall only
    if (type == EXPLOSION) return floor(protect * 1.5f);   // explosion only
    if (type == PROJECTILE)return floor(protect * 1.5f);   // projectile only
    return 0;
}
```

The protection values per level work out to:

| Level | Base `(6+l*l)/3` | ALL (x0.75) | FIRE (x1.25) | FALL (x2.5) | EXPLOSION (x1.5) | PROJECTILE (x1.5) |
|-------|-------------------|-------------|--------------|-------------|-------------------|--------------------|
| 1 | 2.33 | 1 | 2 | 5 | 3 | 3 |
| 2 | 3.33 | 2 | 4 | 8 | 5 | 5 |
| 3 | 5.00 | 3 | 6 | 12 | 7 | 7 |
| 4 | 7.33 | 5 | 9 | 18 | 11 | 11 |

Remember, the total across all armor pieces is capped at 25 before the randomization step. A full set of Protection IV gives 20 raw points against all damage types.

### Damage modifiers

`getDamageBonus()` returns extra damage dealt to a target. The `DamageEnchantment` class checks the target's `MobType`:

```cpp
int DamageEnchantment::getDamageBonus(
    int level, shared_ptr<Mob> target)
{
    if (type == ALL)
        return floor(level * 2.75f);        // Sharpness
    if (type == UNDEAD && target->getMobType() == UNDEAD)
        return floor(level * 4.5f);          // Smite
    if (type == ARTHROPODS && target->getMobType() == ARTHROPOD)
        return floor(level * 4.5f);          // Bane of Arthropods
    return 0;
}
```

| Level | Sharpness (ALL, x2.75) | Smite/Bane (x4.5, matching target) |
|-------|------------------------|------------------------------------|
| 1 | 2 | 4 |
| 2 | 5 | 9 |
| 3 | 8 | 13 |
| 4 | 11 | 18 |
| 5 | 13 | 22 |

The total bonus from all enchantments on the weapon gets randomized in `EnchantmentHelper::getDamageBonus()`:

```cpp
if (sum > 0)
{
    return 1 + random.nextInt(sum);
}
return 0;
```

So the actual bonus is random between 1 and the calculated sum. Sharpness V gives between 1 and 13 extra damage per hit.

### Thorns: a special case

`ThornsEnchantment` doesn't use `getDamageProtection` or `getDamageBonus`. Instead, it has static helper methods that are called from the damage pipeline:

```cpp
// 15% chance per level to reflect damage
bool ThornsEnchantment::shouldHit(int level, Random *random)
{
    if (level <= 0) return false;
    return random->nextFloat() < 0.15f * level;
}

// Reflected damage: 1-4 random, or (level - 10) if level > 10
int ThornsEnchantment::getDamage(int level, Random *random)
{
    if (level > 10) return level - 10;
    return 1 + random->nextInt(4);
}
```

When Thorns triggers, it costs 3 durability on the armor piece. When it doesn't trigger but the piece has Thorns, it costs 1 durability. This is handled by `doThornsAfterAttack()`.

| Level | Trigger chance | Reflected damage |
|-------|---------------|-----------------|
| 1 | 15% | 1-4 random |
| 2 | 30% | 1-4 random |
| 3 | 45% | 1-4 random |

## Step 7: Hook into the damage pipeline

To make your enchantment actually do something, you need to connect it with `EnchantmentHelper`. The helper uses an **iteration pattern** that walks through all enchantments on an item:

```cpp
// EnchantmentHelper iterates enchantments on items via:
void runIterationOnItem(EnchantmentIterationMethod &method,
    shared_ptr<ItemInstance> piece);

void runIterationOnInventory(EnchantmentIterationMethod &method,
    ItemInstanceArray inventory);
```

For protection and damage enchantments, the base class `getDamageProtection()` and `getDamageBonus()` methods get called automatically by the existing iteration methods. You don't need any extra wiring.

For special effects (like Thorns), add a helper function in `EnchantmentHelper`:

```cpp
// In EnchantmentHelper.h:
static int getMyEnchantmentLevel(shared_ptr<Inventory> inventory);

// In EnchantmentHelper.cpp:
int EnchantmentHelper::getMyEnchantmentLevel(
    shared_ptr<Inventory> inventory)
{
    return getEnchantmentLevel(
        Enchantment::myEnchantment->id,
        inventory->getSelected());
}
```

Then call this from the relevant game logic (like `Mob::hurt()`, `Mob::doHurtTarget()`, etc.).

## The enchanting table algorithm

Understanding how the enchanting table picks enchantments is important for tuning your enchantment's cost curves. The algorithm has three stages: calculate the enchantment value for each slot, pick which enchantments apply, and apply them to the item.

### Bookshelf detection

`EnchantmentMenu::slotsChanged()` scans a 5x5 area (2 blocks out) around the enchanting table to count bookshelves. The scan checks two layers (table height and one above):

```cpp
for (int dx = -1; dx <= 1; dx++)
{
    for (int dz = -1; dz <= 1; dz++)
    {
        if ((dx != 0 || dz != 0)
            && level->isEmptyBlock(tableX + dx, tableY, tableZ + dz)
            && level->isEmptyBlock(tableX + dx, tableY + 1, tableZ + dz))
        {
            // Check for bookshelves at distance 2
            if (level->getBlock(tableX + dx * 2, tableY, tableZ + dz * 2)
                    == Block::bookshelf) bookcases++;
            if (level->getBlock(tableX + dx * 2, tableY + 1, tableZ + dz * 2)
                    == Block::bookshelf) bookcases++;
            // ... corner checks too
        }
    }
}
```

The key detail: there must be an air block between the table and the bookshelf. If you put a torch or carpet between them, it blocks that bookshelf from counting. The maximum useful count is 15.

### Calculate the enchantment cost

`EnchantmentHelper::getEnchantmentCost()` figures out the enchantment value for each of the three table slots:

```cpp
int getEnchantmentCost(Random *random, int slot,
    int bookcases, shared_ptr<ItemInstance> item)
{
    int itemValue = item->getItem()->getEnchantmentValue();
    if (itemValue <= 0) return 0;  // Not enchantable

    if (bookcases > 15) bookcases = 15;  // Cap at 15

    int selected = random->nextInt(8) + 1
                 + (bookcases >> 1)
                 + random->nextInt(bookcases + 1);

    if (slot == 0) return max(selected / 3, 1);  // Top slot (cheapest)
    if (slot == 1) return max(selected, bookcases * 2);  // Middle slot
    return selected;                               // Bottom slot (raw)
}
```

Some concrete numbers for the bottom slot (slot 2):

| Bookshelves | Minimum | Maximum | Average |
|-------------|---------|---------|---------|
| 0 | 1 | 8 | ~5 |
| 5 | 3 | 18 | ~10 |
| 10 | 6 | 25 | ~15 |
| 15 | 8 | 30 | ~20 |

The middle slot (slot 1) has a guaranteed minimum of `bookcases * 2`, so with 15 bookshelves it's always at least 30. The top slot divides by 3 and floors at 1, giving the cheapest option.

### Books get special treatment

When you enchant a book, `EnchantmentMenu::clickMenuButton()` forces the result to have exactly one enchantment instead of potentially multiple:

```cpp
if (dynamic_cast<BookItem *>(item->getItem()) != NULL)
{
    // Books get a single random enchantment from validEnchantments
    // at a random valid level
}
```

This means enchanted books from the enchanting table always have exactly one enchantment.

### Select enchantments

`EnchantmentHelper::selectEnchantment()` picks which enchantments and levels to apply:

1. **Calculate item bonus**: Take the item's `getEnchantmentValue()`, halve it, add 1, then add two random rolls within that range. This produces a number between 2 and `enchantmentValue + 1`.
2. **Combine with cost**: `enchantmentValue = itemBonus + enchantmentCost`
3. **Apply deviation**: Random +/-15% adjustment. Specifically: `value += round(value * (random_float * 2 - 1) * 0.15)`.
4. **Find candidates**: For each registered enchantment, loop through all its valid levels (1 through `getMaxLevel()`). If `enchantmentValue` falls within `[getMinCost(level), getMaxCost(level)]`, that enchantment at that level is a valid candidate.
5. **Weighted selection**: Pick the first enchantment from candidates using `WeighedRandom` (by `getFrequency()`).
6. **Bonus enchantments**: Loop with `random.nextInt(50) <= bonusChance`, halving `bonusChance` each time. Each iteration removes candidates that are incompatible with already-selected enchantments (using `isCompatibleWith()`) and picks another weighted random enchantment from what's left.

```cpp
// Simplified flow:
int bonusChance = enchantmentValue / 2;
while (random->nextInt(50) <= bonusChance)
{
    // Remove incompatible enchantments from candidates
    // Pick another random enchantment
    bonusChance >>= 1;  // Halve the chance each round
}
```

The bonus enchantment loop is how you get multiple enchantments on one item. With higher enchantment values, the initial `bonusChance` is higher, making multi-enchantment results more likely.

### Apply to item

`EnchantmentHelper::enchantItem()` applies the selected enchantments. Enchantments are stored in the item's NBT data under the `"ench"` tag (or `"StoredEnchantments"` for enchanted books):

```cpp
// Each enchantment is a compound tag with:
tag->putShort(TAG_ENCH_ID, enchantment->id);
tag->putShort(TAG_ENCH_LEVEL, level);
```

## Exact cost curves for every enchantment

These are the `getMinCost(level)` and `getMaxCost(level)` values for each vanilla enchantment. The enchanting table picks your enchantment when the calculated enchantment value falls within the min-max range for a given level.

### Protection enchantments

All five protection types use array-based cost curves. The arrays are indexed by the protection type:

```cpp
// ProtectionEnchantment.cpp
static int minCost[] = {1, 10, 5, 5, 3};      // ALL, FIRE, FALL, EXPLOSION, PROJECTILE
static int levelCost[] = {11, 8, 6, 8, 6};
static int levelCostSpan[] = {20, 12, 10, 12, 15};
```

Formula: `minCost = base + (level - 1) * levelCost`, `maxCost = minCost + levelCostSpan`.

| Enchantment | Level 1 | Level 2 | Level 3 | Level 4 |
|-------------|---------|---------|---------|---------|
| **Protection** | 1-21 | 12-32 | 23-43 | 34-54 |
| **Fire Protection** | 10-22 | 18-30 | 26-38 | 34-46 |
| **Feather Falling** | 5-15 | 11-21 | 17-27 | 23-33 |
| **Blast Protection** | 5-17 | 13-25 | 21-33 | 29-41 |
| **Projectile Protection** | 3-18 | 9-24 | 15-30 | 21-36 |

### Damage enchantments

Also array-based, indexed by damage type:

```cpp
// DamageEnchantment.cpp
static int minCost[] = {1, 5, 5};       // ALL, UNDEAD, ARTHROPODS
static int levelCost[] = {11, 8, 8};
static int levelCostSpan[] = {20, 20, 20};
```

| Enchantment | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
|-------------|---------|---------|---------|---------|---------|
| **Sharpness** | 1-21 | 12-32 | 23-43 | 34-54 | 45-65 |
| **Smite** | 5-25 | 13-33 | 21-41 | 29-49 | 37-57 |
| **Bane of Arthropods** | 5-25 | 13-33 | 21-41 | 29-49 | 37-57 |

### Bow enchantments

Each bow enchantment has its own simple formula:

| Enchantment | Max Level | Min Cost Formula | Max Cost Formula |
|-------------|-----------|-----------------|-----------------|
| **Power** | 5 | `1 + (level-1) * 10` | `minCost + 15` |
| **Punch** | 2 | `12 + (level-1) * 20` | `minCost + 25` |
| **Flame** | 1 | `20` | `50` |
| **Infinity** | 1 | `20` | `50` |

| Enchantment | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
|-------------|---------|---------|---------|---------|---------|
| **Power** | 1-16 | 11-26 | 21-36 | 31-46 | 41-56 |
| **Punch** | 12-37 | 32-57 | -- | -- | -- |
| **Flame** | 20-50 | -- | -- | -- | -- |
| **Infinity** | 20-50 | -- | -- | -- | -- |

### Weapon enchantments

| Enchantment | Max Level | Min Cost Formula | Max Cost Formula |
|-------------|-----------|-----------------|-----------------|
| **Knockback** | 2 | `5 + 20 * (level-1)` | `minCost + 50` |
| **Fire Aspect** | 2 | `10 + 20 * (level-1)` | `minCost + 50` |
| **Looting** | 3 | `15 + (level-1) * 9` | `minCost + 50` |

Note: Knockback, Fire Aspect, and Looting all use `Enchantment::getMinCost()` (the base class default: `1 + level * 10`) for computing `maxCost`, not their own overridden `getMinCost()`. This is a quirk of the code. The `maxCost` formula `getMinCost(level) + 50` calls the base class version, giving `(1 + level * 10) + 50`.

| Enchantment | Level 1 | Level 2 | Level 3 |
|-------------|---------|---------|---------|
| **Knockback** | 5-61 | 25-71 | -- |
| **Fire Aspect** | 10-61 | 30-71 | -- |
| **Looting** | 15-61 | 24-71 | 33-81 |

### Tool enchantments

| Enchantment | Max Level | Min Cost Formula | Max Cost Formula |
|-------------|-----------|-----------------|-----------------|
| **Efficiency** | 5 | `1 + 10 * (level-1)` | `minCost + 50` |
| **Silk Touch** | 1 | `15` | `minCost + 50` |
| **Unbreaking** | 3 | `5 + (level-1) * 8` | `minCost + 50` |
| **Fortune** | 3 | `15 + (level-1) * 9` | `minCost + 50` |

Same quirk as weapon enchantments: Efficiency and Silk Touch use the base class `getMinCost()` for maxCost. Unbreaking uses the base class `Enchantment::getMinCost(level)` for maxCost, same as Knockback, Fire Aspect, etc.

| Enchantment | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
|-------------|---------|---------|---------|---------|---------|
| **Efficiency** | 1-61 | 11-71 | 21-81 | 31-91 | 41-101 |
| **Silk Touch** | 15-65 | -- | -- | -- | -- |
| **Unbreaking** | 5-61 | 13-71 | 21-81 | -- | -- |
| **Fortune** | 15-61 | 24-71 | 33-81 | -- | -- |

### Other armor enchantments

| Enchantment | Max Level | Min Cost Formula | Max Cost Formula |
|-------------|-----------|-----------------|-----------------|
| **Respiration** | 3 | `10 * level` | `minCost + 30` |
| **Aqua Affinity** | 1 | `1` | `minCost + 40` |
| **Thorns** | 3 | `10 + 20 * (level-1)` | `minCost + 50` |

| Enchantment | Level 1 | Level 2 | Level 3 |
|-------------|---------|---------|---------|
| **Respiration** | 10-40 | 20-50 | 30-60 |
| **Aqua Affinity** | 1-41 | -- | -- |
| **Thorns** | 10-61 | 30-71 | 50-81 |

<Aside type="tip">
To tune when your custom enchantment appears at the enchanting table, think about the bottom slot's value range. With 15 bookshelves, the bottom slot generates values between 8 and 30 (plus the item's enchantment value bonus). Set your `getMinCost()` and `getMaxCost()` ranges to overlap with the values you want to target.
</Aside>

## The anvil combining system

The anvil uses `RepairMenu::createResult()` to figure out what happens when you combine two items or apply an enchanted book.

### How combining works

When you put two items in the anvil, the code walks through each enchantment on the second item (the "sacrifice") and tries to merge it onto the first item (the "target"):

1. **Check compatibility**: For each enchantment on the sacrifice, check if it's compatible with all enchantments already on the target (using `isCompatibleWith()`). If not, it gets skipped and adds 1 to the cost as a penalty.
2. **Same enchantment merge**: If both items have the same enchantment:
   - Same level: the result is `level + 1` (capped at `getMaxLevel()`)
   - Different levels: take the higher one
3. **New enchantment**: If the target doesn't have this enchantment, it gets added at the sacrifice's level.

```cpp
// Simplified from RepairMenu::createResult()
for each enchantment on sacrifice:
    if (targetHasEnchantment(ench.id))
        if (target.level == sacrifice.level)
            newLevel = min(target.level + 1, ench.getMaxLevel());
        else
            newLevel = max(target.level, sacrifice.level);
    else
        newLevel = sacrifice.level;

    // Check compatibility with all other enchantments on target
    for each other enchantment on target:
        if (!ench.isCompatibleWith(other))
            skip this enchantment, price += 1;
```

### Cost calculation

The anvil cost has two parts: **price** (the base cost) and **tax** (the prior work penalty).

**Price** is built up from:
- Each enchantment that gets applied adds a fee based on rarity:

| Rarity | Fee (normal item) | Fee (from book) |
|--------|-------------------|-----------------|
| Common (freq 10) | 1 per level | 1 per level |
| Uncommon (freq 5) | 2 per level | 1 per level |
| Rare (freq 2) | 4 per level | 2 per level |
| Very Rare (freq 1) | 8 per level | 4 per level |

The rarity fee is derived from the enchantment's frequency: `FREQ_COMMON` maps to 1, `FREQ_UNCOMMON` to 2, `FREQ_RARE` to 4, `FREQ_VERY_RARE` to 8. When applying from an enchanted book, these fees are halved.

- Renaming adds 1 to the price
- If the target item is damaged and the sacrifice can repair it, the repair cost is added

**Tax** is the prior work penalty. Each time an item goes through the anvil, a `RepairCost` NBT tag gets incremented. The formula is `tax = 2^repairCost - 1`. So the first anvil use costs 0 extra, the second costs 1, the third costs 3, the fourth costs 7, etc.

The total cost is `price + leftTax + rightTax`. If this exceeds 39 (the 40-level cap), the anvil says "Too Expensive!" and refuses to combine.

```cpp
// From RepairMenu::createResult()
if (price + tax > 39)
{
    // "Too Expensive!" -- operation not allowed
    resultSlots[0] = nullptr;
    return;
}
```

<Aside type="caution">
The prior work penalty grows fast. After just 6 anvil uses, the tax alone is 63, which is already past the cap. Plan your combining order carefully if you're building up an item through multiple anvil operations.
</Aside>

### Enchanted book halving

When the sacrifice item is an enchanted book (instead of a tool/weapon/armor), the rarity fees are halved. This is why books are the preferred way to apply expensive enchantments like Silk Touch or Infinity.

## Existing enchantment reference

### Armor enchantments (IDs 0-7)

| ID | Name | Class | Category | Freq | Max Level |
|----|------|-------|----------|------|-----------|
| 0 | Protection | `ProtectionEnchantment` (ALL) | `armor` | 10 | 4 |
| 1 | Fire Protection | `ProtectionEnchantment` (FIRE) | `armor` | 5 | 4 |
| 2 | Feather Falling | `ProtectionEnchantment` (FALL) | `armor_feet` | 5 | 4 |
| 3 | Blast Protection | `ProtectionEnchantment` (EXPLOSION) | `armor` | 2 | 4 |
| 4 | Projectile Protection | `ProtectionEnchantment` (PROJECTILE) | `armor` | 5 | 4 |
| 5 | Respiration | `OxygenEnchantment` | `armor_head` | 2 | 3 |
| 6 | Aqua Affinity | `WaterWorkerEnchantment` | `armor_head` | 2 | 1 |
| 7 | Thorns | `ThornsEnchantment` | `armor_torso` | 1 | 3 |

### Weapon enchantments (IDs 16-21)

| ID | Name | Class | Category | Freq | Max Level |
|----|------|-------|----------|------|-----------|
| 16 | Sharpness | `DamageEnchantment` (ALL) | `weapon` | 10 | 5 |
| 17 | Smite | `DamageEnchantment` (UNDEAD) | `weapon` | 5 | 5 |
| 18 | Bane of Arthropods | `DamageEnchantment` (ARTHROPODS) | `weapon` | 5 | 5 |
| 19 | Knockback | `KnockbackEnchantment` | `weapon` | 5 | 2 |
| 20 | Fire Aspect | `FireAspectEnchantment` | `weapon` | 2 | 2 |
| 21 | Looting | `LootBonusEnchantment` | `weapon` | 2 | 3 |

### Tool enchantments (IDs 32-35)

| ID | Name | Class | Category | Freq | Max Level |
|----|------|-------|----------|------|-----------|
| 32 | Efficiency | `DiggingEnchantment` | `digger` | 10 | 5 |
| 33 | Silk Touch | `UntouchingEnchantment` | `digger` | 1 | 1 |
| 34 | Unbreaking | `DigDurabilityEnchantment` | `digger` | 5 | 3 |
| 35 | Fortune | `LootBonusEnchantment` | `digger` | 2 | 3 |

### Bow enchantments (IDs 48-51)

| ID | Name | Class | Category | Freq | Max Level |
|----|------|-------|----------|------|-----------|
| 48 | Power | `ArrowDamageEnchantment` | `bow` | 10 | 5 |
| 49 | Punch | `ArrowKnockbackEnchantment` | `bow` | 2 | 2 |
| 50 | Flame | `ArrowFireEnchantment` | `bow` | 2 | 1 |
| 51 | Infinity | `ArrowInfiniteEnchantment` | `bow` | 1 | 1 |

## Enchantment level names

The game can display enchantment levels up to 10 using `Enchantment::getLevelString()`. The levels map to localized strings:

| Level | String ID |
|-------|-----------|
| 1 | `IDS_ENCHANTMENT_LEVEL_1` ("I") |
| 2 | `IDS_ENCHANTMENT_LEVEL_2` ("II") |
| 3 | `IDS_ENCHANTMENT_LEVEL_3` ("III") |
| 4 | `IDS_ENCHANTMENT_LEVEL_4` ("IV") |
| 5 | `IDS_ENCHANTMENT_LEVEL_5` ("V") |
| 6-10 | `IDS_ENCHANTMENT_LEVEL_6` through `IDS_ENCHANTMENT_LEVEL_10` |

If you make an enchantment with `getMaxLevel()` higher than 10, the level display won't have a name for it. It'll just show the numeric value.

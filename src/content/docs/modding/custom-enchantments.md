---
title: Custom Enchantments
description: Deep dive into LCE's enchantment system with advanced customization examples.
---

import { Aside } from '@astrojs/starlight/components';

This guide goes beyond the basics covered in [Adding Enchantments](/slop-docs/modding/adding-enchantments/). Here you'll learn how the enchantment system actually works under the hood, how to bend the conflict rules, push enchantment levels past their normal limits, and build enchantments that do things the vanilla system never did.

If you haven't read the adding enchantments guide yet, start there. This page assumes you already know how to create a basic `Enchantment` subclass and register it.

## How the Enchantment Class Works

Every enchantment in the game inherits from the `Enchantment` base class in `Minecraft.World/Enchantment.h`. The class manages a global registry, frequency-based weighting for the enchanting table, and virtual methods that subclasses override to define behavior.

### The Registry

Enchantments live in a static array of 256 slots:

```cpp
// Enchantment.h
static EnchantmentArray enchantments;  // 256 entries
static vector<Enchantment *> validEnchantments;
```

When you construct an `Enchantment`, the `_init()` method slots it into the array by ID:

```cpp
void Enchantment::_init(int id)
{
    if (enchantments[id] != NULL)
    {
        app.DebugPrintf("Duplicate enchantment id!");
        __debugbreak();
    }
    enchantments[id] = this;
}
```

After all enchantments are created in `staticCtor()`, a loop at the end collects every non-null entry into `validEnchantments`. This second list is what the enchanted book loot system uses to pick random enchantments.

### Frequency (Rarity)

The `frequency` field controls how likely an enchantment is to be selected when the enchanting table is picking candidates. It's the weight used in `WeighedRandom` selection. Four constants are defined:

| Constant | Value | What it means |
|----------|-------|---------------|
| `FREQ_COMMON` | 10 | Shows up a lot. Protection, Sharpness, Efficiency, Power. |
| `FREQ_UNCOMMON` | 5 | Less common. Fire Protection, Smite, Knockback, Unbreaking. |
| `FREQ_RARE` | 2 | Hard to get. Blast Protection, Fire Aspect, Looting, Fortune, Flame, Punch. |
| `FREQ_VERY_RARE` | 1 | Almost never shows up. Silk Touch, Thorns, Infinity. |

Higher frequency = more likely to be picked. A `FREQ_COMMON` enchantment is 10x more likely to be chosen than a `FREQ_VERY_RARE` one when both are in the candidate pool.

### Categories and Slots

`EnchantmentCategory` determines which items an enchantment can go on. The check happens through `canEnchant(Item *item)` which uses `dynamic_cast` to figure out the item type:

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

This is why enchantments like Sharpness don't normally show up on pickaxes. The category check gates what's even considered as a candidate.

## All Existing Enchantments

Here's every enchantment in the game with its internal details:

### Armor (IDs 0-7)

| ID | Name | Class | Type | Category | Freq | Max Lvl |
|----|------|-------|------|----------|------|---------|
| 0 | Protection | `ProtectionEnchantment` | ALL | `armor` | 10 | 4 |
| 1 | Fire Protection | `ProtectionEnchantment` | FIRE | `armor` | 5 | 4 |
| 2 | Feather Falling | `ProtectionEnchantment` | FALL | `armor_feet` | 5 | 4 |
| 3 | Blast Protection | `ProtectionEnchantment` | EXPLOSION | `armor` | 2 | 4 |
| 4 | Projectile Protection | `ProtectionEnchantment` | PROJECTILE | `armor` | 5 | 4 |
| 5 | Respiration | `OxygenEnchantment` | - | `armor_head` | 2 | 3 |
| 6 | Aqua Affinity | `WaterWorkerEnchantment` | - | `armor_head` | 2 | 1 |
| 7 | Thorns | `ThornsEnchantment` | - | `armor_torso` | 1 | 3 |

### Weapons (IDs 16-21)

| ID | Name | Class | Type | Category | Freq | Max Lvl |
|----|------|-------|------|----------|------|---------|
| 16 | Sharpness | `DamageEnchantment` | ALL | `weapon` | 10 | 5 |
| 17 | Smite | `DamageEnchantment` | UNDEAD | `weapon` | 5 | 5 |
| 18 | Bane of Arthropods | `DamageEnchantment` | ARTHROPODS | `weapon` | 5 | 5 |
| 19 | Knockback | `KnockbackEnchantment` | - | `weapon` | 5 | 2 |
| 20 | Fire Aspect | `FireAspectEnchantment` | - | `weapon` | 2 | 2 |
| 21 | Looting | `LootBonusEnchantment` | - | `weapon` | 2 | 3 |

### Tools (IDs 32-35)

| ID | Name | Class | Type | Category | Freq | Max Lvl |
|----|------|-------|------|----------|------|---------|
| 32 | Efficiency | `DiggingEnchantment` | - | `digger` | 10 | 5 |
| 33 | Silk Touch | `UntouchingEnchantment` | - | `digger` | 1 | 1 |
| 34 | Unbreaking | `DigDurabilityEnchantment` | - | `digger` | 5 | 3 |
| 35 | Fortune | `LootBonusEnchantment` | - | `digger` | 2 | 3 |

### Bows (IDs 48-51)

| ID | Name | Class | Type | Category | Freq | Max Lvl |
|----|------|-------|------|----------|------|---------|
| 48 | Power | `ArrowDamageEnchantment` | - | `bow` | 10 | 5 |
| 49 | Punch | `ArrowKnockbackEnchantment` | - | `bow` | 2 | 2 |
| 50 | Flame | `ArrowFireEnchantment` | - | `bow` | 2 | 1 |
| 51 | Infinity | `ArrowInfiniteEnchantment` | - | `bow` | 1 | 1 |

### Available ID Ranges

IDs 8-15, 22-31, 36-47, and 52-255 are all free to use. Pick something that makes sense. If you're adding more armor enchantments, use 8+. More weapon stuff, start at 22. You get the idea.

## How Enchantment Conflicts Work

### The Default Rule

The base `isCompatibleWith()` is simple. An enchantment is only incompatible with itself:

```cpp
bool Enchantment::isCompatibleWith(Enchantment *other) const
{
    return this != other;
}
```

So by default, any two different enchantments can coexist on the same item.

### Protection Conflicts

The protection enchantments have the most interesting conflict logic. Protection types (Protection, Fire Protection, Blast Protection, Projectile Protection) are all mutually exclusive with each other. But Feather Falling is the exception. It plays nice with all of them:

```cpp
bool ProtectionEnchantment::isCompatibleWith(Enchantment *other) const
{
    ProtectionEnchantment *pe =
        dynamic_cast<ProtectionEnchantment *>(other);
    if (pe != NULL)
    {
        // Same type? Always incompatible.
        if (pe->type == this->type) return false;
        // Feather Falling gets a pass.
        if (this->type == FALL || pe->type == FALL) return true;
        // Everything else conflicts.
        return false;
    }
    return Enchantment::isCompatibleWith(other);
}
```

This means you can have Feather Falling + Protection on boots, but you can't have Protection + Fire Protection on the same chestplate.

### Damage Conflicts

All three damage enchantments (Sharpness, Smite, Bane of Arthropods) are mutually exclusive. The check is a one-liner:

```cpp
bool DamageEnchantment::isCompatibleWith(Enchantment *other) const
{
    return dynamic_cast<DamageEnchantment *>(other) == NULL;
}
```

If the other enchantment is any kind of `DamageEnchantment`, they conflict.

### Silk Touch vs Fortune

Silk Touch and Fortune conflict with each other through both sides. `UntouchingEnchantment` checks:

```cpp
bool UntouchingEnchantment::isCompatibleWith(Enchantment *other) const
{
    return Enchantment::isCompatibleWith(other)
        && other->id != resourceBonus->id;
}
```

And `LootBonusEnchantment` checks the reverse:

```cpp
bool LootBonusEnchantment::isCompatibleWith(Enchantment *other) const
{
    return Enchantment::isCompatibleWith(other)
        && other->id != untouching->id;
}
```

<Aside type="tip">
Compatibility is checked from the perspective of the enchantment that's already on the item. If enchantment A is on the item and the algorithm is considering adding B, it calls `A->isCompatibleWith(B)`. Both sides should agree, otherwise weird things can happen depending on which one got picked first.
</Aside>

### Where Conflicts Are Enforced

Conflicts are enforced in two places:

1. **Enchanting table**: `EnchantmentHelper::selectEnchantment()` removes incompatible candidates each round when building multi-enchantment results.
2. **Anvil**: `RepairMenu::createResult()` checks `isCompatibleWith()` against all existing enchantments on the input item. Incompatible enchantments get skipped (but still charge a cost as an "incompatibility fee").

```cpp
// From selectEnchantment - enchanting table conflict check:
for (auto it = availableEnchantments->begin();
     it != availableEnchantments->end();)
{
    int nextEnchantment = it->first;
    bool valid = true;

    for (auto resIt = results->begin();
         resIt != results->end(); ++resIt)
    {
        EnchantmentInstance *current = *resIt;
        if (!current->enchantment->isCompatibleWith(
                Enchantment::enchantments[nextEnchantment]))
        {
            valid = false;
            break;
        }
    }

    if (!valid)
        it = availableEnchantments->erase(it);
    else
        ++it;
}
```

## Making Conflicting Enchantments Work Together

Want Protection + Fire Protection on the same piece of armor? Or Sharpness + Smite on the same sword? You just need to change the `isCompatibleWith()` method.

### Example: Allow All Protection Types Together

Override `ProtectionEnchantment::isCompatibleWith()` to always return true for other protection types:

```cpp
bool ProtectionEnchantment::isCompatibleWith(Enchantment *other) const
{
    // Allow all protection types to coexist
    return Enchantment::isCompatibleWith(other);
}
```

That's it. The base class check (`this != other`) already prevents duplicate enchantments. By removing the `ProtectionEnchantment`-specific logic, all protection types can stack on the same armor piece.

### Example: Allow Sharpness + Smite + Bane Together

Same idea for damage enchantments:

```cpp
bool DamageEnchantment::isCompatibleWith(Enchantment *other) const
{
    // Allow all damage types to coexist
    return Enchantment::isCompatibleWith(other);
}
```

Now a sword can have Sharpness V, Smite V, and Bane of Arthropods V all at once.

### Example: Allow Silk Touch + Fortune

Remove the cross-check from both sides:

```cpp
// UntouchingEnchantment.cpp
bool UntouchingEnchantment::isCompatibleWith(Enchantment *other) const
{
    return Enchantment::isCompatibleWith(other);
}

// LootBonusEnchantment.cpp
bool LootBonusEnchantment::isCompatibleWith(Enchantment *other) const
{
    return Enchantment::isCompatibleWith(other);
}
```

<Aside type="caution">
If Silk Touch and Fortune are both on a tool, which one wins? That depends on the mining code. Silk Touch is checked first via `EnchantmentHelper::hasSilkTouch()`. If you want Fortune to also apply when Silk Touch is present, you'll need to change the mining logic in the tile's `spawnResources()` method. Just removing the conflict doesn't change the gameplay behavior by itself.
</Aside>

### Making a New Enchantment Conflict With Existing Ones

If your custom enchantment should conflict with something specific, override `isCompatibleWith()` and check by ID or by type:

```cpp
bool MyEnchantment::isCompatibleWith(Enchantment *other) const
{
    // Incompatible with Knockback (ID 19)
    if (other->id == Enchantment::knockback->id) return false;

    // Incompatible with all DamageEnchantments
    if (dynamic_cast<DamageEnchantment *>(other) != NULL) return false;

    return Enchantment::isCompatibleWith(other);
}
```

## Adding New Enchantment Tiers and Levels

### Increasing Max Level

The simplest change. Just return a higher number from `getMaxLevel()`:

```cpp
int MyEnchantment::getMaxLevel()
{
    return 10;  // Vanilla max is usually 5
}
```

But there's a catch. The level display system in `Enchantment::getLevelString()` only has strings defined for levels 1 through 10:

```cpp
wstring Enchantment::getLevelString(int level)
{
    int stringId = IDS_ENCHANTMENT_LEVEL_1;
    switch(level)
    {
    case 2:  stringId = IDS_ENCHANTMENT_LEVEL_2; break;
    case 3:  stringId = IDS_ENCHANTMENT_LEVEL_3; break;
    case 4:  stringId = IDS_ENCHANTMENT_LEVEL_4; break;
    case 5:  stringId = IDS_ENCHANTMENT_LEVEL_5; break;
    case 6:  stringId = IDS_ENCHANTMENT_LEVEL_6; break;
    case 7:  stringId = IDS_ENCHANTMENT_LEVEL_7; break;
    case 8:  stringId = IDS_ENCHANTMENT_LEVEL_8; break;
    case 9:  stringId = IDS_ENCHANTMENT_LEVEL_9; break;
    case 10: stringId = IDS_ENCHANTMENT_LEVEL_10; break;
    };
    return app.GetString(stringId);
}
```

If you go above level 10, the tooltip will just show the level 1 string (the default case). You'd need to either add more string IDs or override `getFullname()` to handle higher levels.

### Adjusting Cost Curves for Higher Levels

When you increase the max level, you also need to make sure your `getMinCost()` and `getMaxCost()` curves make sense. The enchanting table only picks a level if the calculated enchantment value falls within `[getMinCost(level), getMaxCost(level)]`.

Here's a practical example. Say you want Sharpness to go up to level 10. The vanilla `DamageEnchantment` cost curve is:

```cpp
// Vanilla Sharpness (type ALL): minCost base = 1, levelCost = 11
int DamageEnchantment::getMinCost(int level)
{
    return minCost[type] + (level - 1) * levelCost[type];
}
// Level 1: minCost = 1
// Level 5: minCost = 45
// Level 10: minCost = 100  <-- way beyond the table's max
```

The enchanting table's max enchantment value tops out around 50 (with 15 bookshelves). So levels above 5 or 6 would never appear on the enchanting table. If you want higher levels to be obtainable through the table, compress the cost curve:

```cpp
int MyDamageEnchantment::getMinCost(int level)
{
    return 1 + (level - 1) * 5;  // Tighter spacing
}

int MyDamageEnchantment::getMaxCost(int level)
{
    return getMinCost(level) + 15;  // Wider window
}
```

Or just accept that high levels are only available through commands and anvils.

### Example: Raising All Vanilla Enchantment Levels

If you want to blanket-raise the max level for all enchantments, you could modify the base class:

```cpp
// In Enchantment.h, change the default:
virtual int getMaxLevel() { return 5; }
```

But that's a blunt approach. Each subclass that already overrides `getMaxLevel()` won't be affected. You'd need to change each subclass individually. A cleaner approach is to modify each one:

```cpp
// ProtectionEnchantment.cpp
int ProtectionEnchantment::getMaxLevel()
{
    return 8;  // Was 4
}

// DamageEnchantment.cpp
int DamageEnchantment::getMaxLevel()
{
    return 10;  // Was 5
}
```

## How Enchantments Get Applied to Items

Enchantments are stored as NBT data on the `ItemInstance`. The `enchant()` method on `ItemInstance` adds the enchantment ID and level to a tag list stored under the key `"ench"`.

### The Tag Structure

Each enchantment on an item is a `CompoundTag` with two short values:

- `TAG_ENCH_ID` - the enchantment's numeric ID
- `TAG_ENCH_LEVEL` - the level

These tags are stored in a `ListTag<CompoundTag>` accessible via `item->getEnchantmentTags()`.

### Reading Enchantments From an Item

`EnchantmentHelper::getEnchantmentLevel()` reads a specific enchantment's level from an item:

```cpp
int EnchantmentHelper::getEnchantmentLevel(
    int enchantmentId, shared_ptr<ItemInstance> piece)
{
    if (piece == NULL) return 0;

    ListTag<CompoundTag> *enchantmentTags =
        piece->getEnchantmentTags();
    if (enchantmentTags == NULL) return 0;

    for (int i = 0; i < enchantmentTags->size(); i++)
    {
        int type = enchantmentTags->get(i)->getShort(
            (wchar_t *)ItemInstance::TAG_ENCH_ID);
        int level = enchantmentTags->get(i)->getShort(
            (wchar_t *)ItemInstance::TAG_ENCH_LEVEL);

        if (type == enchantmentId) return level;
    }
    return 0;
}
```

There's also an inventory-wide version that checks all items and returns the best (highest) level found.

### Writing Enchantments to an Item

`EnchantmentHelper::setEnchantments()` takes a map of `{id: level}` and writes them all to the item's tag:

```cpp
void EnchantmentHelper::setEnchantments(
    unordered_map<int, int> *enchantments,
    shared_ptr<ItemInstance> item)
{
    ListTag<CompoundTag> *list = new ListTag<CompoundTag>();

    for (auto it = enchantments->begin();
         it != enchantments->end(); ++it)
    {
        CompoundTag *tag = new CompoundTag();
        tag->putShort((wchar_t *)ItemInstance::TAG_ENCH_ID,
            (short) it->first);
        tag->putShort((wchar_t *)ItemInstance::TAG_ENCH_LEVEL,
            (short) it->second);
        list->add(tag);
    }

    if (list->size() > 0)
        item->addTagElement(L"ench", list);
    else if (item->hasTag())
        item->getTag()->remove(L"ench");
}
```

### Enchanted Books Are Different

Enchanted books store their enchantments under the `"StoredEnchantments"` tag instead of `"ench"`. The `EnchantedBookItem::addEnchantment()` method handles this. It also has deduplication logic: if the book already has the enchantment at a lower level, it upgrades it instead of adding a duplicate.

### The Enchanting Table Flow

When a player clicks a slot on the enchanting table, here's what happens:

1. `EnchantmentMenu::clickMenuButton()` gets called with the slot index (0-2)
2. It checks `costs[i] > 0`, the item exists, and the player has enough levels (or is in creative)
3. It calls `EnchantmentHelper::selectEnchantment()` to pick which enchantments and levels to apply
4. **For books**: only one randomly chosen enchantment from the result is kept (`randomIndex = random.nextInt(size)`)
5. **For regular items**: all selected enchantments are applied via `item->enchant()`
6. The player's XP levels are withdrawn
7. `slotsChanged()` is called to recalculate costs for any remaining operations

## How Enchantments Affect Gameplay

### Damage Calculation

When a player attacks a mob, the game checks for damage enchantments through `EnchantmentHelper::getDamageBonus()`. Here's the flow:

1. The helper iterates over enchantments on the held item
2. For each enchantment, it calls `getDamageBonus(level, target)`
3. The results are summed up
4. If the sum is greater than 0, the final bonus is `1 + random.nextInt(sum)`

So the damage bonus is randomized. A Sharpness V sword has a max bonus of `floor(5 * 2.75) = 13`, but the actual bonus each hit will be somewhere between 1 and 13.

The `DamageEnchantment` class calculates per-level bonuses like this:

```cpp
// Sharpness (ALL): 2.75 per level, works on everything
if (type == ALL)
    return Mth::floor(level * 2.75f);

// Smite (UNDEAD): 4.5 per level, only vs undead
if (type == UNDEAD && target->getMobType() == UNDEAD)
    return Mth::floor(level * 4.5f);

// Bane (ARTHROPODS): 4.5 per level, only vs arthropods
if (type == ARTHROPODS && target->getMobType() == ARTHROPOD)
    return Mth::floor(level * 4.5f);
```

### Armor Protection Calculation

Protection enchantments feed into `EnchantmentHelper::getDamageProtection()`:

1. The helper iterates over all armor pieces
2. For each enchantment on each piece, it calls `getDamageProtection(level, source)`
3. Sum is capped at 25
4. Final protection value is randomized: `((sum + 1) >> 1) + random.nextInt((sum >> 1) + 1)`

The protection formula per enchantment type uses a base calculation of `(6 + level * level) / 3.0f`, then applies a multiplier based on the type:

| Type | Multiplier | When it applies |
|------|-----------|-----------------|
| ALL (Protection) | 0.75x | All damage types |
| FIRE | 1.25x | Fire damage only |
| FALL | 2.5x | Fall damage only |
| EXPLOSION | 1.5x | Explosion damage only |
| PROJECTILE | 1.5x | Projectile damage only |

Specialized protection is stronger against its specific damage type, but Protection (ALL) works against everything.

Fire Protection also reduces burn duration by 15% per level. Blast Protection reduces explosion knockback by 15% per level. These are handled separately in `ProtectionEnchantment::getFireAfterDampener()` and `getExplosionKnockbackAfterDampener()`.

### Thorns

Thorns is a special case. It doesn't use the standard `getDamageProtection` or `getDamageBonus` methods. Instead, `ThornsEnchantment::doThornsAfterAttack()` is called from the damage pipeline:

```cpp
void ThornsEnchantment::doThornsAfterAttack(
    shared_ptr<Entity> source, shared_ptr<Mob> target,
    Random *random)
{
    int level = EnchantmentHelper::getArmorThorns(target);
    shared_ptr<ItemInstance> item =
        EnchantmentHelper::getRandomItemWith(
            Enchantment::thorns, target);

    if (shouldHit(level, random))
    {
        source->hurt(DamageSource::thorns(target),
            getDamage(level, random));
        source->playSound(eSoundType_DAMAGE_THORNS,
            .5f, 1.0f);

        if (item != NULL)
            item->hurt(3, target);  // Extra durability cost
    }
    else
    {
        if (item != NULL)
            item->hurt(1, target);  // Still costs durability
    }
}
```

Thorns always costs durability on the armor piece when the wearer is hit, even if it doesn't trigger the reflect. When it does trigger, it costs 3 durability instead of 1.

### Other Enchantment Effects

Most other enchantments are checked by specific helper methods. Each one just calls `getEnchantmentLevel()` for the relevant enchantment ID:

| Helper Method | Enchantment | Checked on |
|---------------|-------------|------------|
| `getKnockbackBonus()` | Knockback | Held item |
| `getFireAspect()` | Fire Aspect | Carried item |
| `getOxygenBonus()` | Respiration | Armor |
| `getDiggingBonus()` | Efficiency | Held item |
| `getDigDurability()` | Unbreaking | Held item |
| `hasSilkTouch()` | Silk Touch | Held item |
| `getDiggingLootBonus()` | Fortune | Held item |
| `getKillingLootBonus()` | Looting | Held item |
| `hasWaterWorkerBonus()` | Aqua Affinity | Armor |

### Unbreaking's Durability Check

Unbreaking has a neat probability mechanic. Instead of reducing damage, it gives a random chance to skip durability loss entirely:

```cpp
bool DigDurabilityEnchantment::shouldIgnoreDurabilityDrop(
    shared_ptr<ItemInstance> item, int level, Random *random)
{
    // Armor has a 40% chance to NOT benefit from Unbreaking
    ArmorItem *armor = dynamic_cast<ArmorItem *>(item->getItem());
    if (armor && random->nextFloat() < 0.6f) return false;

    // Otherwise: (level)/(level+1) chance to ignore damage
    return random->nextInt(level + 1) > 0;
}
```

So Unbreaking III on a non-armor item skips durability loss 75% of the time (`3/4`). On armor, it first has a 40% chance to not even check, making it less effective on armor pieces.

## Registering a New Enchantment

### Step-by-Step

1. **Pick an unused ID** (see the ID ranges table above)

2. **Add a static pointer** in `Enchantment.h`:
```cpp
static Enchantment *myEnchantment;
```

3. **Initialize it to NULL** in `Enchantment.cpp`:
```cpp
Enchantment *Enchantment::myEnchantment = NULL;
```

4. **Create the instance** in `Enchantment::staticCtor()`, before the loop:
```cpp
myEnchantment = new MyEnchantment(64, FREQ_UNCOMMON);
```

5. **Include the header** in `net.minecraft.world.item.enchantment.h`:
```cpp
#include "MyEnchantment.h"
```

6. **Add to the build** in `cmake/Sources.cmake`

The loop at the end of `staticCtor()` will automatically pick up your enchantment and add it to `validEnchantments`.

### The /enchant Command

The `EnchantItemCommand` lets you apply enchantments via command. It calls `item->enchant()` directly, so any registered enchantment works with it automatically. No extra wiring needed.

### Game Rules

The `AddEnchantmentRuleDefinition` class lets game rules apply enchantments to items. It reads an `enchantmentId` and `enchantmentLevel` from the rule definition and applies them. It does cap the level at `getMaxLevel()` for the enchantment, so keep that in mind if you're relying on game rules to apply enchantments above the normal max.

## Building Enchantments That Do New Things

The vanilla enchantment system only has two built-in "effect channels": damage bonus (`getDamageBonus()`) and damage protection (`getDamageProtection()`). Everything else is handled by reading the enchantment level directly and hooking into specific game code.

So if you want your enchantment to do something new (not just more damage or more protection), you need to:

1. Create the enchantment class (for registration, costs, and compatibility)
2. Add a helper method to `EnchantmentHelper` to read the level
3. Hook into the relevant game code to use that level

### The Pattern

Every non-damage/non-protection enchantment follows this pattern:

**Step 1: Enchantment class** (just for registration and table appearance)
```cpp
class MyEnchantment : public Enchantment
{
public:
    MyEnchantment(int id, int frequency)
        : Enchantment(id, frequency, EnchantmentCategory::weapon)
    {
        setDescriptionId(IDS_ENCHANTMENT_MY_ENCH);
    }
    int getMinCost(int level) { return 10 + (level - 1) * 15; }
    int getMaxCost(int level) { return getMinCost(level) + 30; }
    int getMaxLevel() { return 3; }
};
```

**Step 2: Helper method** to read the level from items
```cpp
// EnchantmentHelper.h
static int getMyEnchantmentLevel(shared_ptr<Inventory> inventory);

// EnchantmentHelper.cpp
int EnchantmentHelper::getMyEnchantmentLevel(
    shared_ptr<Inventory> inventory)
{
    return getEnchantmentLevel(
        Enchantment::myEnchantment->id,
        inventory->getSelected());
}
```

**Step 3: Hook into gameplay** wherever the effect should happen

This is the creative part. Here are some example hooks:

| What you want | Where to hook |
|---|---|
| Heal on hit | `Mob::doHurtTarget()` or the attack code after damage is dealt |
| Freeze water on walk | `Player` movement tick, after position updates |
| Double drops | The tile's `spawnResources()` method |
| Speed boost | `Mob::getWalkingSpeedModifier()` |
| Extra XP | The XP orb spawning code in `Mob::dropExperience()` |
| Fire immunity | `Mob::hurt()` damage type check |
| Teleport on hit | After the attack lands in the combat code |
| Auto-smelt drops | The tile's `getDrops()` or `spawnResources()` method |

### Where to Check: Held Item vs Armor

Use the right lookup method:

- **Held item**: `getEnchantmentLevel(id, inventory->getSelected())`
- **Single armor piece**: `getEnchantmentLevel(id, armorItem)`
- **Best level across all armor**: `getEnchantmentLevel(id, inventory->armor)` (the array version picks the highest)
- **Any equipment slot**: `getEnchantmentLevel(id, mob->getEquipmentSlots())`

## Real Examples

### Example 1: Lifesteal Enchantment

A weapon enchantment that heals the attacker when they deal damage:

**`LifestealEnchantment.h`**
```cpp
#pragma once
#include "Enchantment.h"

class LifestealEnchantment : public Enchantment
{
public:
    LifestealEnchantment(int id, int frequency);

    virtual int getMinCost(int level);
    virtual int getMaxCost(int level);
    virtual int getMaxLevel();
    virtual bool isCompatibleWith(Enchantment *other) const;
};
```

**`LifestealEnchantment.cpp`**
```cpp
#include "stdafx.h"
#include "LifestealEnchantment.h"

LifestealEnchantment::LifestealEnchantment(int id, int frequency)
    : Enchantment(id, frequency, EnchantmentCategory::weapon)
{
    setDescriptionId(IDS_ENCHANTMENT_LIFESTEAL);
}

int LifestealEnchantment::getMinCost(int level)
{
    return 10 + (level - 1) * 15;
}

int LifestealEnchantment::getMaxCost(int level)
{
    return getMinCost(level) + 30;
}

int LifestealEnchantment::getMaxLevel()
{
    return 3;
}

bool LifestealEnchantment::isCompatibleWith(Enchantment *other) const
{
    return Enchantment::isCompatibleWith(other);
}
```

Then add a helper method so the combat code can check for it:

```cpp
// EnchantmentHelper.h
static int getLifestealLevel(shared_ptr<Inventory> inventory);

// EnchantmentHelper.cpp
int EnchantmentHelper::getLifestealLevel(
    shared_ptr<Inventory> inventory)
{
    return getEnchantmentLevel(
        Enchantment::lifesteal->id,
        inventory->getSelected());
}
```

And hook it into the attack code where damage is dealt. You'd heal the player by `level` health after a successful hit.

### Example 2: Frost Walker (Boots Enchantment)

A boots enchantment that freezes water when you walk over it:

**`FrostWalkerEnchantment.h`**
```cpp
#pragma once
#include "Enchantment.h"

class FrostWalkerEnchantment : public Enchantment
{
public:
    FrostWalkerEnchantment(int id, int frequency);

    virtual int getMinCost(int level);
    virtual int getMaxCost(int level);
    virtual int getMaxLevel();
    virtual bool isCompatibleWith(Enchantment *other) const;
};
```

**`FrostWalkerEnchantment.cpp`**
```cpp
#include "stdafx.h"
#include "FrostWalkerEnchantment.h"

FrostWalkerEnchantment::FrostWalkerEnchantment(int id, int frequency)
    : Enchantment(id, frequency, EnchantmentCategory::armor_feet)
{
    setDescriptionId(IDS_ENCHANTMENT_FROST_WALKER);
}

int FrostWalkerEnchantment::getMinCost(int level)
{
    return 10 + (level - 1) * 10;
}

int FrostWalkerEnchantment::getMaxCost(int level)
{
    return getMinCost(level) + 15;
}

int FrostWalkerEnchantment::getMaxLevel()
{
    return 2;
}

bool FrostWalkerEnchantment::isCompatibleWith(Enchantment *other) const
{
    // Incompatible with Feather Falling
    if (other->id == Enchantment::fallProtection->id) return false;
    return Enchantment::isCompatibleWith(other);
}
```

Register it at ID 8 (first unused armor slot):

```cpp
// In Enchantment::staticCtor()
frostWalker = new FrostWalkerEnchantment(8, FREQ_RARE);
```

The actual water-freezing logic would go in the player's movement tick. Check for the enchantment on the boots, then scan nearby water blocks and replace them with ice. The radius could scale with the level (2 + level blocks).

### Example 3: Making Sharpness Go to Level 10

No new class needed. Just change `DamageEnchantment::getMaxLevel()`:

```cpp
int DamageEnchantment::getMaxLevel()
{
    return 10;  // Was 5
}
```

And adjust the cost curve so higher levels are reachable:

```cpp
int DamageEnchantment::getMinCost(int level)
{
    return minCost[type] + (level - 1) * 6;  // Tighter spacing (was 11)
}
```

The damage bonus scales automatically since `getDamageBonus()` uses the level directly in its formula. Sharpness X would give `floor(10 * 2.75) = 27` max bonus damage.

### Example 4: Auto-Smelt Enchantment

A tool enchantment that smelts blocks as you mine them. This one shows the full pattern for a non-combat enchantment:

**Registration:**
```cpp
// Enchantment.h
static Enchantment *autoSmelt;

// Enchantment.cpp
Enchantment *Enchantment::autoSmelt = NULL;

// In staticCtor():
autoSmelt = new AutoSmeltEnchantment(36, FREQ_RARE);
```

**The enchantment class** is minimal (just costs and compatibility):
```cpp
class AutoSmeltEnchantment : public Enchantment
{
public:
    AutoSmeltEnchantment(int id, int freq)
        : Enchantment(id, freq, EnchantmentCategory::digger) {
        setDescriptionId(IDS_ENCHANTMENT_AUTO_SMELT);
    }
    int getMinCost(int level) { return 15; }
    int getMaxCost(int level) { return 65; }
    int getMaxLevel() { return 1; }
    bool isCompatibleWith(Enchantment *other) const {
        // Incompatible with Silk Touch
        if (other->id == untouching->id) return false;
        return Enchantment::isCompatibleWith(other);
    }
};
```

**The helper method:**
```cpp
static bool hasAutoSmelt(shared_ptr<Inventory> inventory) {
    return getEnchantmentLevel(Enchantment::autoSmelt->id,
        inventory->getSelected()) > 0;
}
```

**The gameplay hook** goes in the tile mining code, where you'd check `hasAutoSmelt()` and replace drops with their smelted versions.

## Related Guides

- [Adding Enchantments](/slop-docs/modding/adding-enchantments/) for the basics of creating and registering enchantments
- [Adding Items](/slop-docs/modding/adding-items/) for creating items your enchantments can go on
- [Getting Started](/slop-docs/modding/getting-started/) for build setup and the staticCtor pattern

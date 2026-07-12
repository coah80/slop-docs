---
title: "Template: Enchantment & Potion"
description: A complete starter mod that adds a Vampiric enchantment and a Levitation potion effect.
---

import { Aside } from '@astrojs/starlight/components';

This template walks you through adding two new gameplay features from scratch: a **Vampiric** sword enchantment that heals you when you hit something, and a **Levitation** potion effect that makes entities float upward. By the end, both will be fully registered, brewable, and showing up on the enchanting table.

If you haven't set up your build environment yet, start with [Getting Started](/slop-docs/modding/getting-started/) first. This tutorial assumes you can already compile and run the game.

## Files you will create

| File | Purpose |
|------|---------|
| `Minecraft.World/VampiricEnchantment.h` | Enchantment subclass header |
| `Minecraft.World/VampiricEnchantment.cpp` | Cost curves, max level, compatibility logic |

The Levitation potion effect does not need new files. You add it directly to the existing `MobEffect.h` and `MobEffect.cpp`.

## Files you will modify

| File | What you change |
|------|----------------|
| `Minecraft.World/Enchantment.h` | Add `static Enchantment *vampiric` pointer |
| `Minecraft.World/Enchantment.cpp` | Initialize pointer, create instance in `staticCtor()` |
| `Minecraft.World/net.minecraft.world.item.enchantment.h` | Add `#include "VampiricEnchantment.h"` |
| `Minecraft.World/EnchantmentHelper.h` | Add `getVampiricLevel()` static method |
| `Minecraft.World/EnchantmentHelper.cpp` | Implement `getVampiricLevel()` |
| `Minecraft.World/Mob.cpp` | Add heal logic to `doHurtTarget()` |
| `Minecraft.World/MobEffect.h` | Rename `reserved_25` to `levitation` |
| `Minecraft.World/MobEffect.cpp` | Create the effect, add tick logic in `isDurationEffectTick()` and `applyEffectTick()` |
| `Minecraft.World/PotionBrewing.h` | Add `MOD_PHANTOMMEMBRANE` formula constant |
| `Minecraft.World/PotionBrewing.cpp` | Define formula, map brew value to Levitation in `staticCtor()` |
| `Minecraft.World/Item.cpp` | Chain `setPotionBrewingFormula()` onto the ingredient item |
| `cmake/Sources.cmake` | Add `VampiricEnchantment.cpp` |

## Includes you will add

**In `Minecraft.World/net.minecraft.world.item.enchantment.h`**, add at the bottom:

```cpp
#include "VampiricEnchantment.h"
```

This is the umbrella header that all files needing enchantment classes include. The existing file has:

```cpp
#include "DamageEnchantment.h"
#include "DigDurabilityEnchantment.h"
// ... other enchantments ...
#include "ThornsEnchantment.h"
```

**In `VampiricEnchantment.cpp`**:

```cpp
#include "stdafx.h"
#include "VampiricEnchantment.h"
#include "KnockbackEnchantment.h"
```

**In `Mob.cpp`**, it already includes `net.minecraft.world.item.enchantment.h`, so `EnchantmentHelper` and your new enchantment are already visible. No new includes needed.

## Sources.cmake entry

Add the new enchantment file to `MINECRAFT_WORLD_SOURCES` in `cmake/Sources.cmake`:

```cmake
"VampiricEnchantment.cpp"
```

## What we're building

| Feature | What it does |
|---------|-------------|
| Vampiric (enchantment) | Sword enchantment. Heals the attacker for 1 HP per level when they deal melee damage. Conflicts with Knockback. Shows up on the enchanting table and in loot. |
| Levitation (potion effect) | Status effect. Makes entities float upward at a speed that scales with the amplifier. Brewable from Awkward Potion + Phantom Membrane (or any item you pick). Supports extended duration via Redstone. |

---

## Part 1: Vampiric Enchantment

### 1.1 Pick an ID and plan the enchantment

We need an unused enchantment ID. Vanilla weapon enchantments use IDs 16-21, so we'll grab **22** (the first open slot after Looting). For a refresher on the full ID map, see [Custom Enchantments](/slop-docs/modding/custom-enchantments/).

Here's what we want:

- **Category:** `weapon` (swords only)
- **Frequency:** `FREQ_RARE` (2) so it feels special but not impossible to find
- **Max level:** 3
- **Conflict:** Incompatible with Knockback (you shouldn't be knocking enemies away if you're trying to lifesteal off them)

### 1.2 Create the header

Create `Minecraft.World/VampiricEnchantment.h`:

```cpp
#pragma once
#include "Enchantment.h"

class VampiricEnchantment : public Enchantment
{
public:
    VampiricEnchantment(int id, int frequency);

    virtual int getMinCost(int level);
    virtual int getMaxCost(int level);
    virtual int getMaxLevel();
    virtual bool isCompatibleWith(Enchantment *other) const;
};
```

Nothing fancy here. We extend `Enchantment` and override the methods that control cost curves, max level, and compatibility. We don't need `getDamageBonus()` or `getDamageProtection()` because our effect (healing) doesn't fit into either of those channels.

### 1.3 Create the implementation

Create `Minecraft.World/VampiricEnchantment.cpp`:

```cpp
#include "stdafx.h"
#include "VampiricEnchantment.h"
#include "KnockbackEnchantment.h"

VampiricEnchantment::VampiricEnchantment(int id, int frequency)
    : Enchantment(id, frequency, EnchantmentCategory::weapon)
{
    setDescriptionId(IDS_ENCHANTMENT_VAMPIRIC);
}

int VampiricEnchantment::getMinCost(int level)
{
    // Level 1: 15, Level 2: 25, Level 3: 35
    return 15 + (level - 1) * 10;
}

int VampiricEnchantment::getMaxCost(int level)
{
    return getMinCost(level) + 30;
}

int VampiricEnchantment::getMaxLevel()
{
    return 3;
}

bool VampiricEnchantment::isCompatibleWith(Enchantment *other) const
{
    // Don't allow Vampiric + Knockback on the same sword
    if (other->id == Enchantment::knockback->id)
        return false;

    return Enchantment::isCompatibleWith(other);
}
```

Let's talk about the cost curve. With 15 bookshelves, the enchanting table's bottom slot generates values roughly between 9 and 31 (plus the item's enchantment value bonus). Our level 1 range of 15-45 means it starts showing up at mid-level enchantment power. Level 3 needs a value of at least 35, so you'll mostly see that from high-bookshelf rolls. For more on how cost curves interact with the table, see [Adding Enchantments](/slop-docs/modding/adding-enchantments/).

<Aside type="tip">
If you want Vampiric to also conflict with the damage enchantments (Sharpness, Smite, Bane), add a `dynamic_cast` check: `if (dynamic_cast<DamageEnchantment *>(other) != NULL) return false;`. That would make it a standalone weapon enchantment that doesn't stack with damage boosters.
</Aside>

### 1.4 Register the enchantment

Three changes across two files.

**In `Enchantment.h`**, add the static pointer with the other enchantment declarations:

```cpp
// After the existing static pointers (knockback, fireAspect, etc.)
static Enchantment *vampiric;
```

**In `Enchantment.cpp`**, initialize it to NULL at the top of the file:

```cpp
Enchantment *Enchantment::vampiric = NULL;
```

Then create it inside `staticCtor()`, before the loop that populates `validEnchantments`:

```cpp
void Enchantment::staticCtor()
{
    // ... existing enchantments ...

    vampiric = new VampiricEnchantment(22, FREQ_RARE);

    // The existing loop picks up all non-null entries:
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

**In `net.minecraft.world.item.enchantment.h`**, add the include:

```cpp
#include "VampiricEnchantment.h"
```

That's it for registration. The enchanting table will now consider Vampiric as a candidate for swords, and enchanted books with Vampiric can appear in loot chest rolls because `validEnchantments` is used by the loot system.

### 1.5 Add a string ID for the name

You need to define `IDS_ENCHANTMENT_VAMPIRIC` in the string table so the tooltip shows "Vampiric" instead of garbage. The exact process depends on your string table setup, but the gist is: add a new entry with the display name "Vampiric" and map the constant to that entry's ID.

### 1.6 Add a helper method

We need a way for the combat code to check if the player's held weapon has Vampiric and at what level.

**In `EnchantmentHelper.h`:**

```cpp
static int getVampiricLevel(shared_ptr<Inventory> inventory);
```

**In `EnchantmentHelper.cpp`:**

```cpp
int EnchantmentHelper::getVampiricLevel(
    shared_ptr<Inventory> inventory)
{
    return getEnchantmentLevel(
        Enchantment::vampiric->id,
        inventory->getSelected());
}
```

This follows the same pattern as `getKnockbackBonus()`, `getFireAspect()`, and the other weapon enchantment helpers. For background on how `getEnchantmentLevel` reads the NBT tags, see [Custom Enchantments](/slop-docs/modding/custom-enchantments/).

### 1.7 Hook into the damage pipeline

Now for the fun part. We need to heal the attacker after they deal damage. The best place to do this is in `Mob::doHurtTarget()`, right after the damage is applied.

**In `Mob.cpp`**, find `doHurtTarget()`. After the target takes damage successfully, add the heal:

```cpp
bool Mob::doHurtTarget(shared_ptr<Entity> target)
{
    // ... existing damage calculation and application ...

    // After the target is hurt and damage was dealt:
    // Mob does not have an inventory member, only Player does.
    // We need to check if this Mob is actually a Player first.
    if (shared_ptr<Player> player = dynamic_pointer_cast<Player>(
            shared_from_this()))
    {
        int vampiricLevel = EnchantmentHelper::getVampiricLevel(
            player->inventory);

        if (vampiricLevel > 0)
        {
            // Heal 1 HP per enchantment level
            int healAmount = vampiricLevel;
            if (this->getHealth() < this->getMaxHealth())
            {
                this->heal(healAmount);
            }
        }
    }

    // ... rest of the method (fire aspect, knockback, etc.) ...
    return true;
}
```

<Aside type="caution">
Make sure you put the heal code after the point where the target's `hurt()` call returns true. If the attack missed or was blocked, you don't want to heal. Check the return value of the `hurt()` call if one is available at that point in the code.
</Aside>

The heal is simple and predictable: Vampiric I heals 1 HP (half a heart), Vampiric II heals 2 HP (one heart), Vampiric III heals 3 HP (one and a half hearts). No randomness, no percentage scaling. It's strong enough to matter in sustained combat without being broken on a single hit.

### 1.8 Verify it works

At this point, Vampiric is fully functional. You can test it with:

1. **Enchanting table:** Place a sword on the table with 15 bookshelves. It should occasionally appear as a candidate, especially at higher enchantment costs.
2. **Command:** `/enchant @p 22 3` gives you Vampiric III directly.
3. **Anvil:** Enchanted books with Vampiric can be combined onto swords. The anvil will block combining Vampiric + Knockback because of our compatibility rule.
4. **Loot:** Enchanted books in dungeon/temple chests can now roll Vampiric since it's in `validEnchantments`.

---

## Part 2: Levitation Potion Effect

### 2.1 Pick an ID and plan the effect

The `MobEffect` registry has 32 slots. Vanilla LCEMP uses IDs 1-19, and slots 20-31 are reserved and set to NULL. We'll use **ID 25** (IDs 20-23 are taken in the MC build, so picking 25 keeps us safe if you ever want MC compatibility).

For a full breakdown of the effect registry, see [Custom Potions & Brewing](/slop-docs/modding/custom-potions/).

Our Levitation effect:

- **Harmful:** Yes (being forced upward is generally bad)
- **Color:** A light blue/white (we'll use a custom color or borrow one)
- **Behavior:** Every tick, push the entity upward. Speed scales with amplifier.
- **Duration modifier:** 0.5 (harmful effects default to half duration)

### 2.2 Rename the reserved slot

**In `MobEffect.h`**, find the reserved slot declaration and rename it:

```cpp
// Change this:
static MobEffect *reserved_25;

// To this:
static MobEffect *levitation;
```

### 2.3 Create the effect

**In `MobEffect.cpp`**, replace the reserved_25 initialization with your effect:

```cpp
MobEffect *MobEffect::levitation =
    (new MobEffect(25, true, eMinecraftColour_Effect_WaterBreathing))
        ->setDescriptionId(IDS_POTION_LEVITATION)
        ->setPostfixDescriptionId(IDS_POTION_LEVITATION_POSTFIX)
        ->setIcon(MobEffect::e_MobEffectIcon_JumpBoost);
```

We're borrowing Water Breathing's light blue color for the particles. If you want a unique color, add a new `eMinecraftColour` constant. The icon uses the Jump Boost icon as a placeholder. You can add a custom icon if you have sprite sheet space.

<Aside type="note">
The `true` in the constructor marks this as a harmful effect. That automatically sets `durationModifier` to 0.5, which means Levitation potions last half as long as their beneficial counterparts. If you want it to last even shorter (like Poison at 0.25), chain `.setDurationModifier(.25)` after the constructor.
</Aside>

### 2.4 Implement the tick logic

Levitation needs to run every single tick to smoothly push entities upward. We need to touch two methods.

**First, in `isDurationEffectTick()`**, add Levitation so it fires every tick:

```cpp
bool MobEffect::isDurationEffectTick(
    int remainingDuration, int amplification)
{
    if (id == regeneration->id || id == poison->id)
    {
        int interval = 25 >> amplification;
        if (interval > 0)
            return (remainingDuration % interval) == 0;
        return true;
    }
    else if (id == hunger->id)
    {
        return true;
    }
    else if (id == levitation->id)
    {
        return true;  // Every tick
    }
    return false;
}
```

**Then, in `applyEffectTick()`**, add the floating behavior:

```cpp
void MobEffect::applyEffectTick(
    shared_ptr<Mob> mob, int amplification)
{
    // ... existing effects (regeneration, poison, hunger, heal, harm) ...

    else if (id == levitation->id)
    {
        // Push the entity upward each tick
        // Base speed: 0.05 blocks/tick, scales with amplifier
        double liftSpeed = 0.05 * (double)(amplification + 1);
        mob->yd += liftSpeed;

        // Cancel fall damage accumulation while floating
        mob->fallDistance = 0.0f;
    }
}
```

The speed scaling works out to:

| Level | Amplifier | Lift per tick | Blocks per second |
|-------|-----------|--------------|-------------------|
| I | 0 | 0.05 | ~1.0 |
| II | 1 | 0.10 | ~2.0 |
| III | 2 | 0.15 | ~3.0 |

We also reset `fallDistance` each tick so the entity doesn't accumulate fall damage while floating. When the effect wears off, they'll start falling and `fallDistance` will build up normally from that point.

<Aside type="caution">
We're adding to `yd` (the Y velocity) rather than setting it. This means gravity still pulls down each tick, and our lift counteracts it. At Levitation I, the entity gently floats upward. Without the effect, gravity pulls at about 0.08 blocks/tick, so Levitation I at 0.05 actually won't overcome gravity on its own. If you want even level I to cause floating, bump the base speed to 0.10 or higher. Tune this to taste.
</Aside>

If you want Levitation I to reliably make entities float (not just slow their fall), change the base speed:

```cpp
// Alternative: stronger base lift that clearly overcomes gravity
double liftSpeed = 0.10 * (double)(amplification + 1);
```

### 2.5 Add string IDs

Like with the enchantment, you need string table entries:

- `IDS_POTION_LEVITATION` for the effect name ("Levitation")
- `IDS_POTION_LEVITATION_POSTFIX` for the potion name suffix ("of Levitation")

These show up in the potion tooltip and inventory name.

---

## Part 3: Brewing Recipe for Levitation

### 3.1 How brewing works (quick version)

LCE uses a bitfield system for potions. Every potion is a 15-bit integer where specific bits encode which effect is active, whether it's extended, amplified, or throwable. Ingredients have formula strings that flip bits. For the full explanation, see [Custom Potions & Brewing](/slop-docs/modding/custom-potions/).

The key bits:

| Bits | Purpose |
|------|---------|
| 0-3 | Which effect |
| 4 | Enabler (set by Nether Wart) |
| 5 | Amplifier (set by Glowstone) |
| 6 | Duration extension (set by Redstone) |
| 13 | Functional potion marker |
| 14 | Splash/throwable |

We need an unused combination of bits 0-3. Looking at what's taken:

| Bits 3210 | Effect | Taken? |
|-----------|--------|--------|
| `0111` | -- | Free |
| `1101` | -- | Free |
| `1110` | -- | Free |
| `1111` | -- | Free |

We'll use `1101` (bits 0, 2, and 3 set, bit 1 clear) for Levitation.

### 3.2 Define the ingredient formula

**In `PotionBrewing.h`**, add the formula constant:

```cpp
static const wstring MOD_PHANTOMMEMBRANE;
```

**In `PotionBrewing.cpp`**, define it:

```cpp
const wstring PotionBrewing::MOD_PHANTOMMEMBRANE =
    L"+0-1+2+3&4-4+13";
```

This sets bits 0, 2, 3 (giving our `1101` pattern), clears bit 1, requires the Awkward Potion enabler bit (4), consumes it, and marks it as functional (bit 13). For a full explanation of the formula syntax, see [Custom Potions & Brewing](/slop-docs/modding/custom-potions/).

<Aside type="note">
We're using Phantom Membrane as the ingredient because it fits thematically (phantoms float). You can use any item you want. If you're adding a brand new item, see [Adding Items](/slop-docs/modding/adding-items/). If you want to reuse an existing item, just assign this formula to it instead.
</Aside>

### 3.3 Assign the formula to an item

**In `Item.cpp`**, when the ingredient item is created, chain the formula:

```cpp
// If using an existing item, find where it's created and add:
Item::phantomMembrane = (new Item(PHANTOM_MEMBRANE_ID))
    ->setTextureName(L"phantomMembrane")
    ->setDescriptionId(IDS_ITEM_PHANTOM_MEMBRANE)
    ->setPotionBrewingFormula(PotionBrewing::MOD_PHANTOMMEMBRANE);
```

If you're attaching this to an item that already exists (like a Feather or something), just find that item's creation line and chain `->setPotionBrewingFormula(PotionBrewing::MOD_PHANTOMMEMBRANE)` onto it.

Once an item has `setPotionBrewingFormula()` called on it, the brewing stand accepts it as an ingredient automatically. No other wiring needed.

### 3.4 Map the brew value to the Levitation effect

The brewing system needs to know that our bit pattern (`1101` in bits 0-3) should produce the Levitation effect. This happens in `PotionBrewing::staticCtor()`.

**In `PotionBrewing.cpp`**, inside `staticCtor()`, add these entries:

```cpp
// Duration formula: bits 0, 2, 3 must be set, bit 1 must be clear
// The "0+6" part means: base duration value is bit 0's contribution,
// plus bit 6 if Redstone was added (for extended duration)
potionEffectDuration.insert(intStringMap::value_type(
    MobEffect::levitation->getId(),
    L"0 & !1 & 2 & 3 & 0+6"
));

// Amplifier formula: bit 5 = Glowstone was added
potionEffectAmplifier.insert(intStringMap::value_type(
    MobEffect::levitation->getId(),
    L"5"
));
```

The duration formula checks that our bit pattern (`1101`) is present, then uses `0+6` for the duration value. Without Redstone (bit 6 clear), duration is short. With Redstone (bit 6 set), it's longer. For the full formula syntax breakdown, see [Custom Potions & Brewing](/slop-docs/modding/custom-potions/).

### 3.5 The full brewing chain

With everything in place, here's what the brewing chain looks like:

| Step | Input | Ingredient | Output |
|------|-------|-----------|--------|
| 1 | Water Bottle | Nether Wart | Awkward Potion |
| 2 | Awkward Potion | Phantom Membrane | Potion of Levitation |
| 3 | Potion of Levitation | Redstone | Potion of Levitation (Extended) |
| 4 | Potion of Levitation | Glowstone | Potion of Levitation II |
| 5 | Any Levitation potion | Gunpowder | Splash Potion of Levitation |

Steps 3-5 work automatically. Redstone's formula (`-5+6-7`) sets the duration extension bit. Glowstone's formula (`+5-6-7`) sets the amplifier bit. Gunpowder's formula (`+14`) sets the throwable bit. You don't need to write any extra code for those.

### 3.6 Potion color

The potion liquid color comes from the `MobEffect`'s color. We used `eMinecraftColour_Effect_WaterBreathing` (light blue), so the liquid will be light blue. If you want something different, define a new `eMinecraftColour` constant and pass it to the constructor.

---

## Part 4: Where Vampiric Shows Up

Because we registered Vampiric with `FREQ_RARE` and the `weapon` category, it automatically works in all the right places:

- **Enchanting table:** Considered as a candidate for swords. `FREQ_RARE` (weight 2) makes it about as common as Fire Aspect or Looting.
- **Enchanted book loot:** The `validEnchantments` list (built at the end of `staticCtor()`) is what the loot system uses. Vampiric books can now appear in dungeon and temple chests.
- **Anvil:** Players can apply Vampiric books to swords. The Knockback conflict blocks that combo, and the rarity fee is 4 per level from a sword or 2 per level from a book.
- **/enchant command:** Works automatically. `/enchant @p 22 3` gives Vampiric III.

---

## Part 5: Build and Test

### 5.1 Update the build system

**In `cmake/Sources.cmake`**, add the new source file to `MINECRAFT_WORLD_SOURCES`:

```cmake
"VampiricEnchantment.cpp"
```

### 5.2 Build and test

Build the project:

```bash
cmake --build build --config Release
```

Launch the game and run through this test checklist:

**Vampiric Enchantment:**
- [ ] `/enchant @p 22 1` applies Vampiric I to a held sword
- [ ] Tooltip shows "Vampiric I" on the sword
- [ ] Hitting a mob heals you by half a heart (1 HP)
- [ ] `/enchant @p 22 3` gives Vampiric III, heals 1.5 hearts per hit
- [ ] Vampiric cannot be combined with Knockback via anvil
- [ ] Vampiric appears as a candidate on the enchanting table with 15 bookshelves

**Levitation Effect:**
- [ ] `/effect @p 25 30 0` gives Levitation I for 30 seconds
- [ ] You float upward while the effect is active
- [ ] `/effect @p 25 30 1` gives Levitation II (faster float)
- [ ] No fall damage while floating
- [ ] Fall damage starts when the effect wears off and you drop
- [ ] Particles appear around the player (light blue swirls)

**Brewing:**
- [ ] Phantom Membrane is accepted in the brewing stand ingredient slot
- [ ] Awkward Potion + Phantom Membrane = Potion of Levitation
- [ ] Potion of Levitation + Redstone = Potion of Levitation (Extended)
- [ ] Potion of Levitation + Glowstone = Potion of Levitation II
- [ ] Any Levitation potion + Gunpowder = Splash version
- [ ] Drinking the potion applies the Levitation effect
- [ ] Splash version affects nearby mobs

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| Enchantment doesn't appear on the table | `getMinCost(1)` is too high for the table's value range (max ~31 with 15 bookshelves) | Lower `getMinCost()` or widen the cost window |
| Potion has no effect when drunk | `isDurationEffectTick()` returns false for your effect ID | Add your effect to the `isDurationEffectTick()` method |
| Brewing produces a Water Bottle | Formula failed a `&` requirement check | Trace the formula manually; usually means you didn't start from Awkward Potion |
| Heal doesn't trigger on hit | Heal code is placed before the `hurt()` call succeeds | Move the heal after the point where damage is confirmed |
| Wrong particle color | Borrowed another effect's `eMinecraftColour` | Define a custom color constant |

## Related guides

- [Getting Started](/slop-docs/modding/getting-started/) for build setup
- [Adding Enchantments](/slop-docs/modding/adding-enchantments/) for enchantment system basics
- [Custom Enchantments](/slop-docs/modding/custom-enchantments/) for advanced enchantment techniques
- [Custom Potions & Brewing](/slop-docs/modding/custom-potions/) for the full brewing system reference
- [Adding Items](/slop-docs/modding/adding-items/) if you need to create a new ingredient item
- [Adding Recipes](/slop-docs/modding/adding-recipes/) for crafting recipe setup

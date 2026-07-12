---
title: Custom Potions & Brewing
description: How LCE's potion system works, and how to add new effects, ingredients, and brewing recipes.
---

import { Aside } from '@astrojs/starlight/components';

This guide covers the LCE potion and brewing system end to end: how `MobEffect` defines status effects, how `MobEffectInstance` tracks duration and amplifier on a mob, how the bitfield-based brewing chain works, how splash potions apply area damage, how effects render on screen, and how to add your own custom effects and ingredients.

For the world-facing reference (all effect stats, tick intervals, brewing tables), see [Effects (Potions)](/slop-docs/world/effects/).

## Key files

| File | Purpose |
|------|---------|
| `MobEffect.h` / `.cpp` | Base effect class, static registry of all 19 effects |
| `InstantenousMobEffect.h` | Subclass for instant effects (Heal, Harm) |
| `MobEffectInstance.h` / `.cpp` | An active effect on a mob: ID + duration + amplifier |
| `PotionBrewing.h` / `.cpp` | Bitfield brewing system, formula parser, effect resolution |
| `PotionItem.h` / `.cpp` | The potion item: drinking, throwing, tooltips, colors |
| `ThrownPotion.h` / `.cpp` | Splash potion projectile entity |
| `BrewingStandTileEntity.h` / `.cpp` | The brewing stand block: ticking, applying ingredients |
| `Mob.h` / `.cpp` | Effect storage on entities, tick loop, speed/jump modifiers |
| `Item.h` / `.cpp` | `setPotionBrewingFormula()` on ingredient items |
| `GameRenderer.cpp` | Screen effects: blindness fog, night vision, nausea |

## How MobEffect works

`MobEffect` is the base class for all status effects. Each effect gets a numeric ID, a color, and a harmful/beneficial flag. The class stores all effects in a static array:

```cpp
static const int NUM_EFFECTS = 32;
static MobEffect *effects[NUM_EFFECTS];
```

The constructor automatically registers the effect into this array at its ID slot:

```cpp
MobEffect::MobEffect(int id, bool isHarmful, eMinecraftColour color)
    : id(id), _isHarmful(isHarmful), color(color)
{
    descriptionId = -1;
    m_postfixDescriptionId = -1;
    icon = e_MobEffectIcon_None;
    _isDisabled = false;

    effects[id] = this;

    if (isHarmful)
        durationModifier = .5;
    else
        durationModifier = 1.0;
}
```

Notice that harmful effects default to half duration modifier. This means potions with harmful effects last shorter by default.

### The effect registry

All 19 vanilla effects are created as static globals in `MobEffect.cpp`. Each one chains together setters in a builder pattern:

```cpp
MobEffect *MobEffect::movementSpeed =
    (new MobEffect(1, false, eMinecraftColour_Effect_MovementSpeed))
        ->setDescriptionId(IDS_POTION_MOVESPEED)
        ->setPostfixDescriptionId(IDS_POTION_MOVESPEED_POSTFIX)
        ->setIcon(MobEffect::e_MobEffectIcon_Speed);

MobEffect *MobEffect::poison =
    (new MobEffect(19, true, eMinecraftColour_Effect_Poison))
        ->setDescriptionId(IDS_POTION_POISON)
        ->setPostfixDescriptionId(IDS_POTION_POISON_POSTFIX)
        ->setDurationModifier(.25)
        ->setIcon(MobEffect::e_MobEffectIcon_Poison);
```

### Complete effect table

| ID | Static Name | Harmful | Duration Modifier | Notes |
|----|-------------|---------|-------------------|-------|
| 1 | `movementSpeed` | No | 1.0 | Speed |
| 2 | `movementSlowdown` | Yes | 0.5 | Slowness |
| 3 | `digSpeed` | No | 1.5 | Haste |
| 4 | `digSlowdown` | Yes | 0.5 | Mining Fatigue |
| 5 | `damageBoost` | No | 1.0 | Strength |
| 6 | `heal` | No | 1.0 | Instant Health (InstantenousMobEffect) |
| 7 | `harm` | Yes | 0.5 | Instant Damage (InstantenousMobEffect) |
| 8 | `jump` | No | 1.0 | Jump Boost |
| 9 | `confusion` | Yes | 0.25 | Nausea |
| 10 | `regeneration` | No | 0.25 | Regeneration |
| 11 | `damageResistance` | No | 1.0 | Resistance |
| 12 | `fireResistance` | No | 1.0 | Fire Resistance |
| 13 | `waterBreathing` | No | 1.0 | Water Breathing |
| 14 | `invisibility` | No | 1.0 | Invisibility |
| 15 | `blindness` | Yes | 0.25 | Blindness |
| 16 | `nightVision` | No | 1.0 | Night Vision |
| 17 | `hunger` | Yes | 0.5 | Hunger |
| 18 | `weakness` | Yes | 0.5 | Weakness |
| 19 | `poison` | Yes | 0.25 | Poison |
| 20-31 | `reserved_20` through `reserved_31` | -- | -- | All NULL, open for custom effects |

The reserved slots (20-31) are already there waiting for you. You just need to fill them in.

## MobEffectInstance: effects on entities

`MobEffectInstance` is the runtime container for an active effect on a mob. It holds three things:

- **id** (byte): Which `MobEffect` this is
- **duration** (short): Ticks remaining
- **amplifier** (byte): Potency level (0 = level I, 1 = level II, etc.)

### The tick loop

Every game tick, `Mob::tickEffects()` iterates through `activeEffects` (an `unordered_map<int, MobEffectInstance *>`). For each effect, it calls `MobEffectInstance::tick()`:

```cpp
bool MobEffectInstance::tick(shared_ptr<Mob> target)
{
    if (duration > 0)
    {
        if (MobEffect::effects[id]->isDurationEffectTick(duration, amplifier))
        {
            applyEffect(target);
        }
        tickDownDuration();
    }
    return duration > 0;
}
```

When `tick()` returns false (duration ran out), the effect gets removed from the mob.

### isDurationEffectTick: when effects fire

Not every effect runs every tick. `isDurationEffectTick()` controls the interval:

```cpp
bool MobEffect::isDurationEffectTick(int remainingDuration, int amplification)
{
    if (id == regeneration->id || id == poison->id)
    {
        // Tick intervals: 25, 12, 6.. (halved per amplifier level)
        int interval = 25 >> amplification;
        if (interval > 0)
            return (remainingDuration % interval) == 0;
        return true;
    }
    else if (id == hunger->id)
    {
        return true;  // Every single tick
    }
    return false;
}
```

So Regeneration I heals every 25 ticks (1.25 seconds), Regeneration II heals every 12 ticks, and so on. Poison works the same way. Hunger fires every tick.

<Aside type="tip">
Most effects (Speed, Jump Boost, Resistance, etc.) never return `true` from `isDurationEffectTick()`. They don't fire periodic ticks at all. Instead, other parts of the code check `hasEffect()` directly. Only Regeneration, Poison, and Hunger actually tick on a schedule.
</Aside>

### applyEffectTick: what effects actually do

This is where the real work happens:

```cpp
void MobEffect::applyEffectTick(shared_ptr<Mob> mob, int amplification)
{
    if (id == regeneration->id)
    {
        if (mob->getHealth() < mob->getMaxHealth())
            mob->heal(1);
    }
    else if (id == poison->id)
    {
        if (mob->getHealth() > 1)  // Poison can't kill you
            mob->hurt(DamageSource::magic, 1);
    }
    else if (id == hunger->id && dynamic_pointer_cast<Player>(mob) != NULL)
    {
        dynamic_pointer_cast<Player>(mob)->causeFoodExhaustion(
            FoodConstants::EXHAUSTION_MINE * (amplification + 1));
    }
    else if ((id == heal->id && !mob->isInvertedHealAndHarm())
          || (id == harm->id && mob->isInvertedHealAndHarm()))
    {
        mob->heal(6 << amplification);
    }
    else if ((id == harm->id && !mob->isInvertedHealAndHarm())
          || (id == heal->id && mob->isInvertedHealAndHarm()))
    {
        mob->hurt(DamageSource::magic, 6 << amplification);
    }
}
```

Notice the `isInvertedHealAndHarm()` check. Undead mobs return true for this, which makes Heal damage them and Harm heal them. Classic Minecraft behavior.

### Updating an existing effect

When a mob already has an effect and gets the same one again, `MobEffectInstance::update()` picks the better one:

```cpp
void MobEffectInstance::update(MobEffectInstance *takeOver)
{
    if (takeOver->amplifier > this->amplifier)
    {
        this->amplifier = takeOver->amplifier;
        this->duration = takeOver->duration;
    }
    else if (takeOver->amplifier == this->amplifier
          && this->duration < takeOver->duration)
    {
        this->duration = takeOver->duration;
    }
}
```

Higher amplifier always wins. Same amplifier, longer duration wins.

## The brewing system (bitfield magic)

This is the most interesting part. LCE uses a **simplified** bitfield-based brewing system (4J's version, not the original Notch bit-twiddling madness). Every potion is represented by a 15-bit integer. Ingredients work by flipping specific bits in that integer according to a formula string.

### The potion bitfield

The 15-bit brew value encodes everything about a potion:

| Bits | Purpose |
|------|---------|
| 0-3 | Effect identifier (which potion effect) |
| 4 | Enabler bit (set by Nether Wart) |
| 5 | Amplifier flag (set by Glowstone) |
| 6 | Duration extension (set by Redstone) |
| 7 | Unused in simplified brewing |
| 13 | Functional potion marker |
| 14 | Throwable bit (set by Gunpowder, makes it a splash potion) |

### Brewing formulas

Each ingredient item has a formula string that says which bits to set or clear. The formula language works like this:

| Symbol | Meaning |
|--------|---------|
| `+N` | Set bit N |
| `-N` | Clear bit N |
| `!N` | Toggle bit N |
| `&N` | Require bit N to be set (otherwise brewing fails) |
| `&!N` | Require bit N to be clear |

Here are all the ingredient formulas (simplified brewing mode):

```cpp
const wstring PotionBrewing::MOD_NETHERWART    = L"+4&!13";
const wstring PotionBrewing::MOD_SUGAR          = L"-0+1-2-3&4-4+13";
const wstring PotionBrewing::MOD_GHASTTEARS     = L"+0-1-2-3&4-4+13";
const wstring PotionBrewing::MOD_SPIDEREYE      = L"-0-1+2-3&4-4+13";
const wstring PotionBrewing::MOD_FERMENTEDEYE   = L"-0+3-4+13";
const wstring PotionBrewing::MOD_SPECKLEDMELON  = L"+0-1+2-3&4-4+13";
const wstring PotionBrewing::MOD_BLAZEPOWDER    = L"+0-1-2+3&4-4+13";
const wstring PotionBrewing::MOD_GOLDENCARROT   = L"-0+1+2-3+13&4-4";
const wstring PotionBrewing::MOD_MAGMACREAM     = L"+0+1-2-3&4-4+13";
const wstring PotionBrewing::MOD_REDSTONE        = L"-5+6-7";
const wstring PotionBrewing::MOD_GLOWSTONE       = L"+5-6-7";
const wstring PotionBrewing::MOD_GUNPOWDER       = L"+14";
```

### The formula parser

The `applyBrew()` function walks through the formula string character by character. It's not complicated, but seeing exactly how it works clears up a lot of confusion:

```cpp
int PotionBrewing::applyBrew(int brew, const wstring &formula)
{
    int result = brew;
    int index = 0;
    int len = formula.length();

    while (index < len)
    {
        wchar_t c = formula[index];

        if (c == '+')
        {
            // Set a bit
            index++;
            int bit = parseBitNumber(formula, index);
            result = applyBrewBit(result, bit, true);
        }
        else if (c == '-')
        {
            // Clear a bit
            index++;
            int bit = parseBitNumber(formula, index);
            result = applyBrewBit(result, bit, false);
        }
        else if (c == '!')
        {
            // Toggle a bit
            index++;
            int bit = parseBitNumber(formula, index);
            result ^= (1 << bit);
        }
        else if (c == '&')
        {
            // Requirement check
            index++;
            bool wantClear = false;
            if (index < len && formula[index] == '!')
            {
                wantClear = true;
                index++;
            }
            int bit = parseBitNumber(formula, index);
            bool bitIsSet = (brew & (1 << bit)) != 0;

            if (wantClear && bitIsSet) return 0;   // Fail: bit should be clear
            if (!wantClear && !bitIsSet) return 0;  // Fail: bit should be set
        }
        else
        {
            index++;
        }
    }
    return result;
}
```

The key thing to notice: when a requirement (`&`) fails, the function returns 0. That means the brew value becomes 0 (a Water Bottle), which effectively means "nothing happened." The brewing stand then checks the result against the original, and if they match, the brew doesn't go through.

<Aside type="note">
`applyBrewBit()` is a simple helper that either sets or clears a single bit: `result | (1 << bit)` or `result & ~(1 << bit)`.
</Aside>

### Tracing through a brew: step by step

Let's walk through making a Potion of Swiftness from scratch.

**Water Bottle to Awkward Potion:** Start with brew value `0` (all bits zero). Add Nether Wart, formula `+4&!13`:

1. `+4`: Set bit 4. Result: `0b10000` = 16
2. `&!13`: Require bit 13 to be clear. It is (we started at 0). Passes.

Final result: **16** (Awkward Potion).

**Awkward Potion to Swiftness:** Brew value is 16 (`0b10000`). Add Sugar, formula `-0+1-2-3&4-4+13`:

1. `-0`: Clear bit 0 (already clear). Still 16.
2. `+1`: Set bit 1. Result: `0b10010` = 18.
3. `-2`: Clear bit 2. Still 18.
4. `-3`: Clear bit 3. Still 18.
5. `&4`: Require bit 4 to be set. It is. Passes.
6. `-4`: Clear bit 4. Result: `0b00010` = 2.
7. `+13`: Set bit 13. Result: `0b10000000000010` = 8194.

Final result: **8194** (Potion of Swiftness).

**Making it a splash potion:** Brew value is 8194. Add Gunpowder, formula `+14`:

1. `+14`: Set bit 14. Result: `0b110000000000010` = 24578.

Final result: **24578** (Splash Potion of Swiftness).

### How formulas map to effects

The `PotionBrewing::staticCtor()` method sets up two maps: `potionEffectDuration` and `potionEffectAmplifier`. These map effect IDs to formula strings that get evaluated against the brew value to determine if the effect is present, and how strong it is:

```cpp
// Duration formulas (which bits must be set for this effect to be active)
potionEffectDuration[regeneration->getId()]    = L"0 & !1 & !2 & !3 & 0+6";
potionEffectDuration[movementSpeed->getId()]   = L"!0 & 1 & !2 & !3 & 1+6";
potionEffectDuration[fireResistance->getId()]  = L"0 & 1 & !2 & !3 & 0+6";
potionEffectDuration[heal->getId()]            = L"0 & !1 & 2 & !3";
potionEffectDuration[poison->getId()]          = L"!0 & !1 & 2 & !3 & 2+6";
potionEffectDuration[weakness->getId()]        = L"!0 & !1 & !2 & 3 & 3+6";
potionEffectDuration[harm->getId()]            = L"!0 & !1 & 2 & 3";
potionEffectDuration[movementSlowdown->getId()]= L"!0 & 1 & !2 & 3 & 3+6";
potionEffectDuration[damageBoost->getId()]     = L"0 & !1 & !2 & 3 & 3+6";
potionEffectDuration[nightVision->getId()]     = L"!0 & 1 & 2 & !3 & 2+6";
potionEffectDuration[invisibility->getId()]    = L"!0 & 1 & 2 & 3 & 2+6";

// Amplifier formulas (bit 5 = glowstone was added)
potionEffectAmplifier[movementSpeed->getId()]   = L"5";
potionEffectAmplifier[regeneration->getId()]     = L"5";
potionEffectAmplifier[damageBoost->getId()]      = L"5";
potionEffectAmplifier[poison->getId()]           = L"5";
potionEffectAmplifier[harm->getId()]             = L"5";
potionEffectAmplifier[heal->getId()]             = L"5";
// ... and more
```

The duration formula is what `getEffects()` evaluates. If the parsed result is greater than 0, the effect is active on this potion. The format `0+6` means "bit 0 plus bit 6": the parser adds the values together. If bit 6 is set (Redstone was added), the duration value is higher, which produces a longer-lasting potion.

### Duration calculation

Once `getEffects()` determines an effect is present, it computes the duration in ticks:

```cpp
// 3, 8, 13, 18.. minutes
duration = (TICKS_PER_SECOND * 60) * (duration * 3 + (duration - 1) * 2);
duration >>= amplifier;
duration = (int) Math::round((double) duration * effect->getDurationModifier());

if ((brew & THROWABLE_MASK) != 0)
{
    duration = (int) Math::round((double) duration * .75 + .5);
}
```

Breaking this down:

- **Base formula:** `(20 * 60) * (d * 3 + (d - 1) * 2)` where `d` is the raw duration value from the formula. For `d=1` that's 3 minutes (3600 ticks). For `d=2` that's 8 minutes (9600 ticks).
- **Amplifier halving:** `duration >>= amplifier`. Level II halves the duration. Level III quarters it.
- **Duration modifier:** Multiplied by the effect's `durationModifier` field. Poison's is 0.25, so a 3-minute base becomes 45 seconds.
- **Splash penalty:** Splash potions get 75% of the drinkable duration.

### Items and their formulas

Each ingredient item has its formula set during item registration in `Item.cpp`:

```cpp
Item::sugar       = (new Item(97))->setPotionBrewingFormula(PotionBrewing::MOD_SUGAR);
Item::ghastTear   = (new Item(114))->setPotionBrewingFormula(PotionBrewing::MOD_GHASTTEARS);
Item::spiderEye   = (new FoodItem(119, ...))->setPotionBrewingFormula(PotionBrewing::MOD_SPIDEREYE);
Item::blazePowder = (new Item(121))->setPotionBrewingFormula(PotionBrewing::MOD_BLAZEPOWDER);
// etc.
```

The brewing stand checks `item->hasPotionBrewingFormula()` to decide if something can be used as an ingredient.

## The brewing stand

`BrewingStandTileEntity` handles the actual brewing process. It has 4 slots: 3 potion slots (bottom) and 1 ingredient slot (top).

### The tick loop

Every tick, if `isBrewable()` returns true, a 20-second countdown starts:

```cpp
void BrewingStandTileEntity::tick()
{
    if (brewTime > 0)
    {
        brewTime--;
        if (brewTime == 0)
        {
            doBrew();  // Apply the ingredient
            setChanged();
        }
        else if (!isBrewable())
        {
            brewTime = 0;  // Ingredient was removed
        }
    }
    else if (isBrewable())
    {
        brewTime = TICKS_PER_SECOND * BREWING_TIME_SECONDS; // 400 ticks
        ingredientId = items[INGREDIENT_SLOT]->id;
    }
}
```

The `isBrewable()` check validates that there is an ingredient with a formula and at least one potion slot has an item that would actually change after applying the formula. If removing the ingredient mid-brew wouldn't matter (because the `ingredientId` is cached), the code still resets because `isBrewable()` rechecks the slot contents.

### Applying an ingredient

When brewing completes, `doBrew()` calls `applyIngredient()` on each potion slot:

```cpp
int BrewingStandTileEntity::applyIngredient(
    int currentBrew, shared_ptr<ItemInstance> ingredient)
{
    if (Item::items[ingredient->id]->hasPotionBrewingFormula())
    {
        return PotionBrewing::applyBrew(
            currentBrew,
            Item::items[ingredient->id]->getPotionBrewingFormula());
    }
    return currentBrew;
}
```

The `doBrew()` method loops through all 3 potion slots. For each one that has a water bottle or existing potion, it reads the current aux value (the brew integer), runs `applyIngredient()`, and writes the result back as the new aux value. It also consumes one of the ingredient item.

## Drinkable vs splash potions

The throwable bit (bit 14) is the only difference between drinkable and splash potions. Gunpowder's formula is simply `+14`, which sets that bit.

### Drinking a potion

When you drink a potion, `PotionItem::useTimeDepleted()` runs:

```cpp
shared_ptr<ItemInstance> PotionItem::useTimeDepleted(
    shared_ptr<ItemInstance> instance, Level *level, shared_ptr<Player> player)
{
    if (!player->abilities.instabuild) instance->count--;

    if (!level->isClientSide)
    {
        vector<MobEffectInstance *> *effects = getMobEffects(instance);
        if (effects != NULL)
        {
            for (auto it = effects->begin(); it != effects->end(); ++it)
            {
                player->addEffect(new MobEffectInstance(*it));
            }
        }
    }

    // Return empty glass bottle
    if (!player->abilities.instabuild)
    {
        if (instance->count <= 0)
            return shared_ptr<ItemInstance>(new ItemInstance(Item::glassBottle));
        else
            player->inventory->add(
                shared_ptr<ItemInstance>(new ItemInstance(Item::glassBottle)));
    }
    return instance;
}
```

The drink animation takes 32 ticks (1.6 seconds), stored as `DRINK_DURATION`.

### Throwing a splash potion

When `PotionItem::use()` detects the throwable bit, it spawns a `ThrownPotion` projectile instead of starting the drink animation:

```cpp
if (isThrowable(instance->getAuxValue()))
{
    if (!player->abilities.instabuild) instance->count--;
    level->playSound(player, eSoundType_RANDOM_BOW, 0.5f, ...);
    if (!level->isClientSide)
        level->addEntity(shared_ptr<ThrownPotion>(
            new ThrownPotion(level, player, instance->getAuxValue())));
    return instance;
}
```

The thrown potion uses gravity of `0.05`, throw power of `0.5`, and an upward angle offset of `-20` degrees (thrown slightly upward).

### Splash potion hit

When a `ThrownPotion` hits something, `onHit()` applies effects to all mobs in a 4-block radius:

```cpp
void ThrownPotion::onHit(HitResult *res)
{
    if (!level->isClientSide)
    {
        vector<MobEffectInstance *> *mobEffects =
            Item::potion->getMobEffects(potionValue);

        if (mobEffects != NULL && !mobEffects->empty())
        {
            AABB *aoe = bb->grow(SPLASH_RANGE, SPLASH_RANGE / 2, SPLASH_RANGE);
            vector<shared_ptr<Entity>> *entities =
                level->getEntitiesOfClass(typeid(Mob), aoe);

            for (auto it = entities->begin(); it != entities->end(); ++it)
            {
                shared_ptr<Mob> e = dynamic_pointer_cast<Mob>(*it);
                double dist = distanceToSqr(e);
                if (dist < SPLASH_RANGE_SQ)
                {
                    double scale = 1.0 - (sqrt(dist) / SPLASH_RANGE);
                    if (e == res->entity)
                        scale = 1;  // Direct hit = full strength

                    for (auto itMEI = mobEffects->begin(); ...)
                    {
                        MobEffectInstance *effect = *itMEI;
                        int id = effect->getId();
                        if (MobEffect::effects[id]->isInstantenous())
                        {
                            // Instant effects scale potency by distance
                            MobEffect::effects[id]->applyInstantenousEffect(
                                this->owner, e, effect->getAmplifier(), scale);
                        }
                        else
                        {
                            // Duration effects: scale duration by distance
                            int duration = (int)(scale * effect->getDuration() + .5);
                            if (duration > TICKS_PER_SECOND)
                                e->addEffect(new MobEffectInstance(
                                    id, duration, effect->getAmplifier()));
                        }
                    }
                }
            }
        }
        // Spawn splash particles
        level->levelEvent(LevelEvent::PARTICLES_POTION_SPLASH, ...);
        remove();
    }
}
```

The scaling works like this:

- **Distance scaling:** `scale = 1.0 - (distance / 4.0)`. At the center, scale is 1.0. At 2 blocks away, scale is 0.5. At 4 blocks, scale is 0 (no effect).
- **Direct hit:** Always gets `scale = 1.0` regardless of distance.
- **Instant effects** (Heal, Harm): The scale multiplies the potency. A half-strength Instant Health II heals less.
- **Duration effects** (everything else): The scale multiplies the remaining duration. If the base duration is 3600 ticks and scale is 0.5, you get 1800 ticks.
- **Minimum threshold:** Effects with a scaled duration of 20 ticks (1 second) or less don't get applied at all.

<Aside type="note">
The area of effect box is `SPLASH_RANGE` (4.0) in X and Z, but only `SPLASH_RANGE / 2` (2.0) in the Y axis. This means the vertical reach is shorter than the horizontal reach.
</Aside>

## Particle system

Mobs with active effects emit colored particles. In `Mob::tickEffects()`, every other tick (50% chance), a `mobSpell` particle gets spawned with the blended color of all active effects:

```cpp
if (random->nextBoolean())
{
    int colorValue = entityData->getInteger(DATA_EFFECT_COLOR_ID);
    if (colorValue > 0)
    {
        double red   = (double)((colorValue >> 16) & 0xff) / 255.0;
        double green = (double)((colorValue >> 8)  & 0xff) / 255.0;
        double blue  = (double)((colorValue >> 0)  & 0xff) / 255.0;

        level->addParticle(eParticleType_mobSpell,
            x + (random->nextDouble() - 0.5) * bbWidth,
            y + random->nextDouble() * bbHeight - heightOffset,
            z + (random->nextDouble() - 0.5) * bbWidth,
            red, green, blue);
    }
}
```

The color is computed by `PotionBrewing::getColorValue()`, which blends colors from all active effects weighted by amplifier level (higher amplifier = that color counts more toward the blend).

Each `MobEffect` has a color set via `eMinecraftColour` in its constructor. When the `effectsDirty` flag is set (after adding or removing effects), the combined color gets recalculated and synced to clients through entity data at index `DATA_EFFECT_COLOR_ID` (8).

## Screen effects

Some effects change how the game renders. These are handled in `GameRenderer.cpp` and `LocalPlayer.cpp`.

### Blindness

Blindness replaces the normal fog with a very close black fog at 5 blocks distance. The implementation fades in over the last 20 ticks of the effect:

```cpp
// GameRenderer.cpp
if (mob->hasEffect(MobEffect::blindness))
{
    int blindDuration = mob->getEffect(MobEffect::blindness)->getDuration();
    float fogEnd = 5.0f;
    if (blindDuration < 20)
        fogEnd = 5.0f + (farPlaneDistance - 5.0f)
                 * (1.0f - (float)blindDuration / 20.0f);
    // Set fog start/end to fogEnd
}
```

Blindness also prevents sprinting. In `LocalPlayer.cpp`, the sprint check includes `hasEffect(MobEffect::blindness)` as a blocker.

### Night vision

Night vision brightens the entire lightmap so everything renders at full brightness. In `GameRenderer.cpp`, the game calculates a brightness factor:

- While active: full brightness (factor 1.0)
- In the last 10 seconds (200 ticks): the factor oscillates using a sine wave, creating a "flickering" effect that warns you the potion is about to wear off

```cpp
// Simplified from GameRenderer.cpp
if (player->hasEffect(MobEffect::nightVision))
{
    int duration = player->getEffect(MobEffect::nightVision)->getDuration();
    if (duration > 200)
        brightness = 1.0f;
    else
        brightness = 0.7f + sin((float)(duration) * PI * 0.2f) * 0.3f;
    // Apply brightness to lightmap
}
```

### Nausea

Nausea uses the same visual effect as the Nether portal, but with different parameters. When you have Nausea active, `LocalPlayer.cpp` increments the portal time counter (the same one used when you stand in a portal). The twist is that in `GameRenderer.cpp`, the rotation multiplier changes:

- Normal portal: multiplier of **20** (slow, subtle warping)
- Nausea: multiplier of **7** (fast, aggressive warping)

The `Gui` class also suppresses the purple portal overlay texture when the warping is caused by Nausea instead of an actual portal.

## How effects modify gameplay

Several parts of `Mob` check for active effects and change behavior:

### Movement speed

```cpp
float Mob::getWalkingSpeedModifier()
{
    float speed = 1.0f;
    if (hasEffect(MobEffect::movementSpeed))
        speed *= 1.0f + .2f * (getEffect(MobEffect::movementSpeed)->getAmplifier() + 1);
    if (hasEffect(MobEffect::movementSlowdown))
        speed *= 1.0f - .15f * (getEffect(MobEffect::movementSlowdown)->getAmplifier() + 1);
    return speed;
}
```

Speed I gives +20% speed per amplifier level. Slowness gives -15% per level.

### Jump boost

```cpp
void Mob::jumpFromGround()
{
    yd = 0.42f;
    if (hasEffect(MobEffect::jump))
        yd += (getEffect(MobEffect::jump)->getAmplifier() + 1) * .1f;
}
```

Each jump boost level adds 0.1 to the base Y velocity of 0.42.

### Damage resistance

In `Mob::getDamageAfterMagicAbsorb()`, resistance reduces incoming damage:

```cpp
if (hasEffect(MobEffect::damageResistance))
{
    int absorbValue = (getEffect(MobEffect::damageResistance)->getAmplifier() + 1) * 5;
    int absorb = 25 - absorbValue;
    int v = (damage) * absorb + dmgSpill;
    damage = v / 25;
}
```

Each level of Resistance removes 20% of incoming damage (5/25 per level). Resistance V makes you immune to all non-bypass damage.

### Other checks

- **Fire Resistance**: Blocks fire/lava damage entirely in `Mob::hurt()`
- **Water Breathing**: Prevents drowning in `Mob::aiStep()`
- **Invisibility**: Sets the mob's invisible flag
- **Weakness**: Sets the mob's weakened flag

## MC (MinecraftConsoles) differences

The MinecraftConsoles build adds 4 new effects and changes how some existing effects work:

### New effects (IDs 20-23)

| ID | Name | Harmful | Tick interval | Notes |
|----|------|---------|---------------|-------|
| 20 | Wither | Yes | `40 >> amplifier` (40, 20, 10...) | Like Poison but can kill |
| 21 | Health Boost | No | Passive | Adds max health via attribute modifier |
| 22 | Absorption | No | Passive | Adds temporary absorption hearts |
| 23 | Saturation | No | Every tick | Restores hunger/saturation |

Wither works like Poison (deals 1 damage per interval) but with a 40-tick base interval instead of 25, and it can kill you (no `health > 1` check).

### Attribute modifier system

In the MC build, several effects switch from direct gameplay checks to attribute modifiers:

- **Strength** becomes `AttackDamageMobEffect`, adding `+3 * (amplifier + 1)` attack damage via an attribute modifier
- **Weakness** becomes `AttackDamageMobEffect`, subtracting `-4 * (amplifier + 1)` attack damage
- **Slowness** adds a movement speed modifier of `-0.15 * (amplifier + 1)`
- **Health Boost** adds a max health modifier of `+4 * (amplifier + 1)` (extra hearts)

These modifiers get applied in `onEffectAdded()` and removed in `onEffectRemoved()`. The attribute system means other mods can interact with these values more cleanly than the old direct-check approach.

<Aside type="caution">
If you're targeting the LCEMP build, the attribute modifier system isn't present. Stick with the direct gameplay checks shown in the earlier sections.
</Aside>

## Creating a custom MobEffect

### Step 1: Pick an ID

IDs 20-31 are reserved and set to NULL in the LCEMP build. If targeting MC, IDs 20-23 are taken, so use 24-31. Pick one of those.

### Step 2: Add the effect

In `MobEffect.cpp`, replace one of the reserved slots:

```cpp
MobEffect *MobEffect::reserved_24 =
    (new MobEffect(24, false, eMinecraftColour_Effect_MovementSpeed))
        ->setDescriptionId(IDS_POTION_MY_EFFECT)
        ->setPostfixDescriptionId(IDS_POTION_MY_EFFECT_POSTFIX)
        ->setIcon(MobEffect::e_MobEffectIcon_Speed);
```

You will also want to rename the static pointer in `MobEffect.h`:

```cpp
// Change this:
static MobEffect *reserved_24;

// To this:
static MobEffect *myCustomEffect;
```

And update the `.cpp` file to match.

### Step 3: Add a color

If you want a unique particle color, you will need to add a new `eMinecraftColour` constant for your effect. Use that in the constructor instead of borrowing an existing color. The color shows up in two places: the swirling particles around the mob, and the color blend when multiple effects are active.

### Step 4: Implement the effect logic

Add your effect's behavior to `applyEffectTick()`:

```cpp
void MobEffect::applyEffectTick(shared_ptr<Mob> mob, int amplification)
{
    // ... existing effects ...

    else if (id == myCustomEffect->id)
    {
        // Example: heal 2 HP per tick
        if (mob->getHealth() < mob->getMaxHealth())
            mob->heal(2 * (amplification + 1));
    }
}
```

If your effect needs to fire on a schedule (like Regeneration does every 25 ticks), also add it to `isDurationEffectTick()`:

```cpp
bool MobEffect::isDurationEffectTick(int remainingDuration, int amplification)
{
    // ... existing effects ...

    else if (id == myCustomEffect->id)
    {
        int interval = 40 >> amplification;  // 40, 20, 10 ticks...
        if (interval > 0)
            return (remainingDuration % interval) == 0;
        return true;
    }

    return false;
}
```

If your effect should be active constantly (like speed or jump boost), you don't need to touch `isDurationEffectTick()` at all. Just check for it directly in the relevant gameplay code (like `getWalkingSpeedModifier()`).

### Step 5: For instant effects

If you want an instant effect (like Heal or Harm), subclass `InstantenousMobEffect` instead:

```cpp
// MyInstantEffect.h
#pragma once
#include "MobEffect.h"

class MyInstantEffect : public MobEffect
{
public:
    MyInstantEffect(int id, bool isHarmful, eMinecraftColour color);
    bool isInstantenous();
    bool isDurationEffectTick(int remainingDuration, int amplification);
};
```

`InstantenousMobEffect` just returns true from `isInstantenous()` and true from `isDurationEffectTick()`. For instant effects, implement your logic in `applyInstantenousEffect()` instead of `applyEffectTick()`. The `applyInstantenousEffect()` method also receives a `scale` parameter, which splash potions use to reduce potency at range.

### Step 6: Add a screen effect (optional)

If you want your effect to change how the game looks, you'll need to add rendering code in `GameRenderer.cpp`. Follow the same pattern as the existing effects:

```cpp
// In GameRenderer.cpp, where blindness/night vision are handled:
if (mob->hasEffect(MobEffect::myCustomEffect))
{
    int duration = mob->getEffect(MobEffect::myCustomEffect)->getDuration();
    // Your rendering changes here (fog, lightmap, overlay, etc.)
}
```

Common approaches:
- **Fog changes**: Modify `fogStart` and `fogEnd` (like Blindness does)
- **Lightmap changes**: Scale the brightness values in the lightmap (like Night Vision does)
- **Overlay**: Draw a fullscreen texture overlay using the `Gui` class
- **Camera effects**: Modify the view rotation or FOV

## Adding a new brewing ingredient

### Step 1: Write a formula

Figure out which bits your ingredient should flip. Refer to the bit layout and the effect-to-bit mapping in `staticCtor()`.

For example, say you want a new ingredient that makes a Potion of Haste (dig speed, effect ID 3). Looking at the existing patterns, bits 0-3 encode the effect type. You need to pick a unique combination of bits 0-3 that isn't taken, then require bit 4 (enabler) and set bit 13 (functional marker).

Here's which bit 0-3 combinations are already used:

| Bits 3210 | Effect |
|-----------|--------|
| `0001` | Regeneration |
| `0010` | Swiftness |
| `0011` | Fire Resistance |
| `0100` | Poison |
| `0101` | Instant Health |
| `0110` | Night Vision |
| `1000` | Weakness |
| `1001` | Strength |
| `1010` | Slowness |
| `1110` | Invisibility |
| `1100` | Instant Damage |

Unused combinations include `0111`, `1011`, `1101`, and `1111`. Pick one of those for your new effect.

### Step 2: Define the formula constant

Add your formula to `PotionBrewing.h` and `PotionBrewing.cpp`:

```cpp
// PotionBrewing.h
static const wstring MOD_MYINGREDIENT;

// PotionBrewing.cpp (inside the #if _SIMPLIFIED_BREWING block)
const wstring PotionBrewing::MOD_MYINGREDIENT = L"+0+1+2-3&4-4+13";
```

This formula:
- Sets bits 0, 1, 2 (giving `0111`)
- Clears bit 3
- Requires bit 4 to be set (needs Awkward Potion base)
- Clears bit 4 (consumed the enabler)
- Sets bit 13 (marks it as a functional potion)

### Step 3: Assign the formula to an item

In `Item.cpp`, when creating (or modifying) the item, chain `setPotionBrewingFormula()`:

```cpp
Item::myNewItem = (new Item(200))
    ->setTextureName(L"myNewItem")
    ->setDescriptionId(IDS_ITEM_MY_NEW_ITEM)
    ->setPotionBrewingFormula(PotionBrewing::MOD_MYINGREDIENT);
```

That's it. The brewing stand will now accept this item as an ingredient, because `hasPotionBrewingFormula()` checks if the formula string is non-empty.

### Step 4: Add duration and amplifier formulas

If your new brew value should produce a new effect, you need to add entries to the duration and amplifier maps in `PotionBrewing::staticCtor()`:

```cpp
potionEffectDuration.insert(intStringMap::value_type(
    MobEffect::myCustomEffect->getId(),
    L"0 & 1 & 2 & !3 & 0+6"  // Bits 0,1,2 set, bit 3 clear
));

// If you want glowstone to boost it:
potionEffectAmplifier.insert(intStringMap::value_type(
    MobEffect::myCustomEffect->getId(),
    L"5"  // Bit 5 = amplifier flag
));
```

The duration formula `0 & 1 & 2 & !3 & 0+6` means: check that bits 0, 1, and 2 are set and bit 3 is clear, then the duration value is the value of bit 0 plus the value of bit 6. If bit 6 is set (Redstone was added), the duration is higher.

### Step 5: Add the potion color

`PotionBrewing::getColorValue()` caches the color for each brew value. When `getEffects()` resolves the effects for a brew value, the color is computed by blending the `MobEffect` colors of all active effects on that potion. If your effect uses a unique `eMinecraftColour`, the potion liquid color updates automatically.

### Step 6: Tooltip text

`PotionItem::appendHoverText()` builds the tooltip by calling `getMobEffects()` and listing each effect with its amplifier and duration. Your custom effect will show up here automatically as long as it has a `descriptionId` set. The format is: effect name, then the roman numeral level, then the duration in `m:ss` format.

## Modifying the existing brewing chain

### Changing what an ingredient does

Just edit the formula string. For example, to make Sugar also set bit 5 (amplifier):

```cpp
// Before:
const wstring PotionBrewing::MOD_SUGAR = L"-0+1-2-3&4-4+13";

// After:
const wstring PotionBrewing::MOD_SUGAR = L"-0+1-2-3&4-4+13+5";
```

### Changing effect duration

The base duration formula is: `(TICKS_PER_SECOND * 60) * (duration * 3 + (duration - 1) * 2)`. This gives 3 minutes for duration=1, 8 minutes for duration=2, etc. The result then gets halved per amplifier level and scaled by the effect's `durationModifier`.

To change how long a specific effect lasts, you can:

1. Change the `durationModifier` on the `MobEffect` (affects all potions with this effect)
2. Change the duration formula in `staticCtor()` (affects which bit patterns produce longer durations)
3. Modify the duration calculation in `getEffects()` directly

### Removing an ingredient

Set the item's formula to an empty string, or just don't call `setPotionBrewingFormula()` on it.

### Adding Fermented Spider Eye inversions

Fermented Spider Eye's formula (`-0+3-4+13`) works differently from other ingredients. It doesn't require the enabler bit (`&4`), so it can modify already-functional potions. It clears bit 0 and sets bit 3, which shifts the effect to a different bit pattern. This is how Swiftness becomes Slowness, Night Vision becomes Invisibility, etc.

To make your custom potion invertible with Fermented Spider Eye, just make sure that clearing bit 0 and setting bit 3 on your brew value maps to a different valid entry in the `potionEffectDuration` table.

## Network sync

When a server adds or removes an effect on a mob, it sends packets to clients:

- `UpdateMobEffectPacket`: Sends effect ID, amplifier, and duration
- `RemoveMobEffectPacket`: Sends the effect ID to remove

The `Mob::onEffectAdded()` and `Mob::onEffectRemoved()` methods handle sending these packets. Effects also get saved to NBT when the world saves:

```cpp
// Saving:
tag->putByte(L"Id", (BYTE) effect->getId());
tag->putByte(L"Amplifier", (BYTE) effect->getAmplifier());
tag->putInt(L"Duration", effect->getDuration());

// Loading:
int id = effectTag->getByte(L"Id");
int amplifier = effectTag->getByte(L"Amplifier");
int duration = effectTag->getInt(L"Duration");
activeEffects.insert(..., new MobEffectInstance(id, duration, amplifier));
```

Custom effects with IDs 20-31 will save and load fine since the NBT just stores the raw ID. The only requirement is that the effect is registered in the `effects[]` array when the world loads.

## Quick reference: ingredient to effect

| Ingredient | Formula Constant | Potion Produced |
|------------|-----------------|-----------------|
| Nether Wart | `MOD_NETHERWART` | Awkward Potion (base for all) |
| Sugar | `MOD_SUGAR` | Swiftness |
| Ghast Tear | `MOD_GHASTTEARS` | Regeneration |
| Spider Eye | `MOD_SPIDEREYE` | Poison |
| Fermented Spider Eye | `MOD_FERMENTEDEYE` | Weakness (or inverts other potions) |
| Glistering Melon | `MOD_SPECKLEDMELON` | Instant Health |
| Blaze Powder | `MOD_BLAZEPOWDER` | Strength |
| Golden Carrot | `MOD_GOLDENCARROT` | Night Vision |
| Magma Cream | `MOD_MAGMACREAM` | Fire Resistance |
| Redstone | `MOD_REDSTONE` | Extends duration |
| Glowstone | `MOD_GLOWSTONE` | Increases amplifier (level II) |
| Gunpowder | `MOD_GUNPOWDER` | Makes it a splash potion |

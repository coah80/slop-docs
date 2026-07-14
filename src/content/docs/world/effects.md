---
title: Effects & Potions
description: The MobEffect status-effect registry and the PotionBrewing bit-formula system in neoLegacy, including the Leaping and Water Breathing brew recipes.
---

Status effects and brewing are two separate systems in neoLegacy. `MobEffect`
is the registry of the 23 potion/status effects and their per-tick behaviour.
`PotionBrewing` is a self-contained bit-formula engine that maps a 15-bit "brew"
integer to a set of `MobEffectInstance`s. Neither is a data-driven registry —
both are built inline in a `staticCtor()`.

Files: `MobEffect.h`, `MobEffect.cpp`, `PotionBrewing.h`, `PotionBrewing.cpp`,
`PotionItem.h`, `ThrownPotion.h`, plus the UI
(`BrewingStandTile`, `BrewingStandTileEntity`, `BrewingStandMenu`) and the
`/effect` command (`EffectCommand`).

## MobEffect

`class MobEffect` (`MobEffect.h:10`) stores every effect in a fixed 32-slot
array indexed by ID, with 23 populated slots and 8 explicitly-reserved ones:

```cpp
static const int NUM_EFFECTS = 32;
static MobEffect *effects[NUM_EFFECTS];
```

Named `static MobEffect *` pointers (`MobEffect.h:43-74`) run
`voidEffect`, `movementSpeed` … `saturation`, then `reserved_24` …
`reserved_31`.

### Registration

`MobEffect::staticCtor()` (`MobEffect.cpp:47`) builds each effect with the fluent
builder pattern. The constructor stores `this` into `effects[id]` and defaults
the duration modifier (0.5 for harmful, 1.0 otherwise, `MobEffect.cpp:83-100`):

```cpp
movementSpeed = (new MobEffect(1, false, eMinecraftColour_Effect_MovementSpeed))
    ->setDescriptionId(IDS_POTION_MOVESPEED)
    ->setPostfixDescriptionId(IDS_POTION_MOVESPEED_POSTFIX)
    ->setIcon(MobEffect::e_MobEffectIcon_Speed)
    ->addAttributeModifier(SharedMonsterAttributes::MOVEMENT_SPEED,
        eModifierId_POTION_MOVESPEED, 0.2f, AttributeModifier::OPERATION_MULTIPLY_TOTAL);
```

`setIcon` takes an `EMobEffectIcon` enum (`MobEffect.h:13-38`) — a 4J change from
the Java `x + y*8` sprite index (the old signature is left commented at
`MobEffect.cpp:103`).

### The 23 registered effects

Values are read from `MobEffect.cpp:50-72`. "Bad" is the `isHarmful` flag;
harmful effects get a 0.5× base duration modifier unless overridden.

| ID | Field | Class | Bad | Duration mod | Attribute modifier |
|----|-------|-------|-----|--------------|--------------------|
| 1 | `movementSpeed` | `MobEffect` | no | 1.0 | MOVEMENT_SPEED ×+0.2 |
| 2 | `movementSlowdown` | `MobEffect` | yes | 0.5 | MOVEMENT_SPEED ×−0.15 |
| 3 | `digSpeed` | `MobEffect` | no | 1.5 | — |
| 4 | `digSlowdown` | `MobEffect` | yes | 0.5 | — |
| 5 | `damageBoost` | `AttackDamageMobEffect` | no | 1.0 | ATTACK_DAMAGE ×+3 |
| 6 | `heal` | `InstantenousMobEffect` | no | — | — (instant) |
| 7 | `harm` | `InstantenousMobEffect` | yes | — | — (instant) |
| 8 | `jump` | `MobEffect` | no | 1.0 | — |
| 9 | `confusion` (Nausea) | `MobEffect` | yes | 0.25 | — |
| 10 | `regeneration` | `MobEffect` | no | 0.25 | — |
| 11 | `damageResistance` | `MobEffect` | no | 1.0 | — |
| 12 | `fireResistance` | `MobEffect` | no | 1.0 | — |
| 13 | `waterBreathing` | `MobEffect` | no | 1.0 | — |
| 14 | `invisibility` | `MobEffect` | no | 1.0 | — |
| 15 | `blindness` | `MobEffect` | yes | 0.25 | — |
| 16 | `nightVision` | `MobEffect` | no | 1.0 | — |
| 17 | `hunger` | `MobEffect` | yes | 0.5 | — |
| 18 | `weakness` | `AttackDamageMobEffect` | yes | 0.5 | ATTACK_DAMAGE +2 (additive) |
| 19 | `poison` | `MobEffect` | yes | 0.25 | — |
| 20 | `wither` | `MobEffect` | yes | 0.25 | — |
| 21 | `healthBoost` | `HealthBoostMobEffect` | no | 1.0 | MAX_HEALTH +4 (additive) |
| 22 | `absorption` | `AbsoptionMobEffect` | no | 1.0 | — |
| 23 | `saturation` | `InstantenousMobEffect` | no | — | — (instant) |

ID 0 (`voidEffect`) is `nullptr`. IDs 24–31 (`reserved_24`..`reserved_31`) are
`nullptr` placeholders. `[sic]` on the class name `AbsoptionMobEffect` — the
typo is in the source.

### Effect subclasses

Only four subclasses exist beyond the base `MobEffect`:

- **`InstantenousMobEffect`** — heal, harm, saturation. `isInstantenous()`
  returns true, so brewing clamps duration to 1 tick.
- **`AttackDamageMobEffect`** — strength (`damageBoost`) and weakness.
- **`HealthBoostMobEffect`** — health boost (`healthBoost`).
- **`AbsoptionMobEffect`** [sic] — absorption.

### Per-tick behaviour

The base class hard-codes the periodic logic in `applyEffectTick`
(`MobEffect.cpp:128`) and `isDurationEffectTick` (`MobEffect.cpp:214`) via
`id ==` comparisons rather than virtual dispatch (a comment notes this may move
to subclasses "in the future"). Notable values:

| Effect | Tick interval | Effect per tick |
|--------|---------------|-----------------|
| regeneration | `50 >> amplifier` (50, 25, 12, 6…) | heal 1 |
| poison | `25 >> amplifier` (25, 12, 6…) | 1 magic damage, never below 1 HP |
| wither | `40 >> amplifier` | 1 wither damage |
| hunger | every tick | food exhaustion × (amp+1) |

Instant heal/harm scale as `4 << amplification` / `6 << amplification`
(`MobEffect.cpp:166-173`), inverted for undead via `isInvertedHealAndHarm()`.

Attribute modifiers are applied through `addAttributeModifiers` /
`removeAttributeModifiers` (`MobEffect.cpp:360-386`), with the effective value
scaled by `amplifier + 1` (`getAttributeModifierValue`, `MobEffect.cpp:388`).

## PotionBrewing

`PotionBrewing` (`PotionBrewing.h`) does not store recipes as ingredient→result
pairs. Instead a potion is a **15-bit integer "brew"** (`BREW_MASK = 0x7fff`),
each ingredient toggles bits via a small string formula, and the resulting effect
set is derived by evaluating per-effect boolean formulas against the bits.

### Simplified brewing

neoLegacy ships with the 4J "simplified brewing" path enabled
(`PotionBrewing.h:16-18`):

```cpp
static const bool SIMPLIFIED_BREWING = true;
#define _SIMPLIFIED_BREWING 1
```

The `#define` gates which set of ingredient/effect formula constants compile in.
The alternate (original) formulas are still present in the source under
`#else` but are dead code in this build. `BREWING_TIME_SECONDS = 20`.

### Ingredient formulas

Each ingredient is a `static const wstring MOD_*` (`PotionBrewing.cpp:68-85`) of
bit ops: `+n` set bit n, `-n` clear bit n, `!n` toggle, `&n` require bit n set.
The simplified set:

| Ingredient | Formula |
|------------|---------|
| `MOD_WATER` | `` (empty) |
| `MOD_SUGAR` | `-0+1-2-3&4-4+13` |
| `MOD_GHASTTEARS` | `+0-1-2-3&4-4+13` |
| `MOD_SPIDEREYE` | `-0-1+2-3&4-4+13` |
| `MOD_FERMENTEDEYE` | `-0+3-4+13` |
| `MOD_SPECKLEDMELON` | `+0-1+2-3&4-4+13` |
| `MOD_BLAZEPOWDER` | `+0-1-2+3&4-4+13` |
| `MOD_GOLDENCARROT` | `-0+1+2-3+13&4-4` |
| `MOD_MAGMACREAM` | `+0+1-2-3&4-4+13` |
| `MOD_REDSTONE` | `-5+6-7` (extends duration) |
| `MOD_GLOWSTONE` | `+5-6-7` (increases amplification) |
| `MOD_GUNPOWDER` | `+14` (makes splash) |
| `MOD_RABBITS_FOOT` | `+0+1-2+3&4-4+13` |
| `MOD_PUFFERFISH` | `+0+1+2+3&4-4+13` |
| `MOD_NETHERWART` | `+4&!13` |

Bit 4 is the "enabler" lit by nether wart; bit 13 marks a functional potion; bit
14 is the throwable/splash flag (`THROWABLE_BIT = 14`). Nether wart's `&!13`
guard is a 4J fix (`#81196`) so it can't be re-applied to an already-functional
potion.

`applyBrew(currentBrew, formula)` (`PotionBrewing.cpp:760`) walks a formula and
mutates the brew integer accordingly. `applyBrewBit` handles the four operators.

### Effect formulas

`staticCtor()` (`PotionBrewing.cpp:105`) loads two maps keyed by `MobEffect` ID:
`potionEffectDuration` (does this effect apply, and at what base tier) and
`potionEffectAmplifier` (glowstone tier). The simplified duration formulas:

| Effect | Duration formula |
|--------|------------------|
| regeneration | `0 & !1 & !2 & !3 & 0+6` |
| movementSpeed | `!0 & 1 & !2 & !3 & 1+6` |
| fireResistance | `0 & 1 & !2 & !3 & 0+6` |
| heal | `0 & !1 & 2 & !3` |
| poison | `!0 & !1 & 2 & !3 & 2+6` |
| weakness | `!0 & !1 & !2 & 3 & 3+6` |
| harm | `!0 & !1 & 2 & 3` |
| movementSlowdown | `!0 & 1 & !2 & 3 & 3+6` |
| damageBoost | `0 & !1 & !2 & 3 & 3+6` |
| nightVision | `!0 & 1 & 2 & !3 & 2+6` |
| invisibility | `!0 & 1 & 2 & 3 & 2+6` |
| **jump (Leaping)** | `0 & 1 & !2 & 3 & 0+6` |
| **waterBreathing** | `0 & 1 & 2 & 3 & 0+6` |

`getEffects(brew, includeDisabledEffects)` (`PotionBrewing.cpp:558`) iterates the
effect table, evaluates each duration formula with `parseEffectFormulaValue`, and
for a positive result builds a `MobEffectInstance`. Non-instant durations expand
to `TICKS_PER_SECOND * 60 * (dur*3 + (dur-1)*2)` minutes (3, 8, 13, 18…),
right-shifted by amplifier, scaled by the effect's duration modifier, and cut to
75% if the splash bit is set (`PotionBrewing.cpp:599-608`).

### Fixed splash IDs

`PotionBrewing.h:8-14` hard-codes a few named brew integers used by dispense /
splash logic: `POTION_ID_SPLASH_DAMAGE = 32732`, `POTION_ID_SPLASH_WEAKNESS =
32696`, `POTION_ID_SPLASH_SLOWNESS = 32698`, `POTION_ID_SPLASH_POISON = 32660`,
`POTION_ID_HEAL = 16341`, `POTION_ID_SWIFTNESS = 16274`,
`POTION_ID_FIRE_RESISTANCE = 16307`.

### Appearance / smell names

Un-brewed or nonsense brews get a flavor name from `DEFAULT_APPEARANCES[]`
(`PotionBrewing.cpp:8-42`) — the classic "Mundane", "Thick", "Awkward" prefix
table, selected via `getAppearanceValue` (5 named bits → 0–31 index).

## Worked trace: drinking a potion, applied each tick, expiring

This joins the two systems — `PotionBrewing` produces the effect set, `MobEffect`
runs it per tick on the drinker.

**1 — Drink completes.** When the drink animation finishes, `PotionItem::useTimeDepleted`
(`PotionItem.cpp:78`) decrements the stack (`:80`) and, server-side (`:82`), resolves
the potion's effects: `getMobEffects(instance)` (`:84`) → `getMobEffects(auxValue)`
(`:65`), which caches `PotionBrewing::getEffects(auxValue, false)` (`:72`) — the
bit-formula evaluation from above. For each result it calls
`player->addEffect(new MobEffectInstance(effect))` (`:89`), then returns an empty
glass bottle (`:97`).

**2 — Store the effect (`addEffect`).** `LivingEntity::addEffect` (`LivingEntity.cpp:655`)
first gates on `canBeAffected` (`:657`). If the effect id is already active it merges
via `effectInst->update(newEffect)` + `onEffectUpdated` (`:665-667`); otherwise it
inserts into `activeEffects` and calls `onEffectAdded` (`:671-672`) — which applies any
attribute modifiers (speed, strength) immediately.

**3 — Per-tick pump (`tickEffects`).** Every tick, `LivingEntity::baseTick`
(`LivingEntity.cpp:201`) calls `tickEffects()` (`:287` → `:514`). It walks
`activeEffects` and calls `effect->tick(self)` on each (`:521`).
`MobEffectInstance::tick` (`MobEffectInstance.cpp:103`): if `duration > 0` and
`MobEffect::effects[id]->isDurationEffectTick(duration, amplifier)` returns true
(`:107`) — this is the `50 >> amp` / `25 >> amp` interval gate — it calls
`applyEffect(target)` (`:109`), which dispatches
`MobEffect::effects[id]->applyEffectTick(mob, amplifier)` (`:125`) (regen heals 1,
poison deals 1, etc.). Then `tickDownDuration()` decrements (`:111/116`) and it
returns `duration > 0`.

**4 — Expiry.** When `tick` returns `false` (duration hit 0), `tickEffects` erases the
entry, calls `onEffectRemoved(effect)` (which strips the attribute modifiers), and
deletes it (`LivingEntity.cpp:525-527`). Every 30 s of remaining duration it instead
fires `onEffectUpdated` to resync the client timer (`:531-535`).

**5 — Particles / ambient path.** After the walk, if `effectsDirty` it recomputes the
swirl colour and the ambient flag — `PotionBrewing::getColorValue` and
`areAllEffectsAmbient` over the active set (`:560-561`) — stored in the entity's
`DATA_EFFECT_COLOR_ID`/`DATA_EFFECT_AMBIENCE_ID` data watchers. Ambient effects
(beacon range, the `ambient` flag) emit far fewer particles (`:587`). A beacon feeds
this same path by re-`addEffect`ing its buff with the ambient flag each cycle, so the
per-tick machinery above is identical whether the source is a drink or a beacon.

## Leaping and Water Breathing potions (TU31)

Both are present in the simplified brewing table above:

- **Potion of Leaping** — effect `jump` (id 8), duration formula
  `0 & 1 & !2 & 3 & 0+6`. Brewed with a **Rabbit's Foot** (`MOD_RABBITS_FOOT`,
  `+0+1-2+3&4-4+13`), whose bit pattern matches the jump formula. The rabbit foot
  itself is a neoLegacy item addition (see [Items](/slop-docs/world/items/)).
- **Potion of Water Breathing** — effect `waterBreathing` (id 13), formula
  `0 & 1 & 2 & 3 & 0+6`. Brewed with a **Pufferfish** (`MOD_PUFFERFISH`,
  `+0+1+2+3&4-4+13`).

Redstone (`MOD_REDSTONE`) extends either; glowstone (`MOD_GLOWSTONE`) raises
amplification where the effect has an entry in `potionEffectAmplifier`. Note that
`jump` has a glowstone amplifier entry (`PotionBrewing.cpp:131`) but
`waterBreathing` does not — Water Breathing has no level II.

## neoLegacy / 4J delta vs vanilla TU19

- **Simplified brewing is on** (`_SIMPLIFIED_BREWING 1`). The original
  boil/shake/stir bit-cellular-automaton path (`boil`, `shake`, `stirr`) is
  compiled out.
- **Leaping** and **Water Breathing** brews are wired through the rabbit-foot
  and pufferfish ingredient formulas; the rabbit foot is itself a post-TU19 item.
- Nether wart's formula carries the `&!13` bug-fix guard (`#81196`).
- The effect registry is 23 populated + 8 reserved slots; the reserved band is
  neoLegacy headroom, all `nullptr`.
- The `setIcon` sprite-index signature was replaced with an `EMobEffectIcon`
  enum.

## Related pages

- [Enchantments](/slop-docs/world/enchantments/)
- [Items](/slop-docs/world/items/) — pufferfish, rabbit's foot, potion items
- [Container Menus](/slop-docs/world/containers/) — `BrewingStandMenu`
- [Minecraft.World Overview](/slop-docs/world/overview/)

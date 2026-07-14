---
title: Custom AI Behaviors
description: A worked example of writing a new Goal subclass, wiring it onto a mob's goal selectors with the right priority and control flags, plus a tour of the ~49 built-in goals and how TU31's flint-and-steel creeper ignition modifies interaction behavior.
---

Mob AI in neoLegacy is the classic Java-LCE **goal system**: each mob owns two
`GoalSelector`s, every discrete behavior is a `Goal` subclass, and the selector
runs the highest-priority set of goals that can currently coexist. There is no
central registry — a mob installs its goals in its own constructor. neoLegacy
ships **~49 goals** (everything from `FloatGoal` to `TradeWithPlayerGoal`), and
adding your own is a matter of subclassing `Goal` and calling `addGoal`.

This page walks through writing a custom goal end-to-end, then explains how
priorities and control flags actually resolve, and finishes with TU31's
flint-and-steel **creeper ignition** as a real example of overriding interaction
behavior. Every claim is grounded in the source: `Goal.h`/`Goal.cpp`,
`GoalSelector.cpp`, and the concrete goals like `MeleeAttackGoal.cpp` and
`SwellGoal.cpp`.

Related reading: [AI Goals](/slop-docs/world/ai-goals/) (the reference catalogue),
[Adding Entities](/slop-docs/modding/adding-entities/) (the mob these goals hang
off), and [Entities](/slop-docs/world/entities/) for the hierarchy.

## The Goal contract

Every goal derives from `class Goal` (`Goal.h`). The full virtual interface:

```cpp
class Goal
{
public:
    virtual bool canUse() = 0;          // may this goal START now?
    virtual bool canContinueToUse();    // may it KEEP running? (default: canUse())
    virtual bool canInterrupt();        // can a higher goal preempt it? (default: true)
    virtual void start();               // called once when the goal begins
    virtual void stop();                // called once when it ends
    virtual void tick();                // called every tick while active
    virtual void setRequiredControlFlags(int flags);
    virtual int  getRequiredControlFlags();
    virtual void setLevel(Level *level);   // 4J: re-wire when loaded from a schematic
};
```

Only `canUse()` is pure-virtual; the rest have sensible defaults in `Goal.cpp`:

- `canContinueToUse()` defaults to `canUse()` (`Goal.cpp:9`) — the goal keeps
  running as long as it could start.
- `canInterrupt()` defaults to `true` (`Goal.cpp:14`) — a lower-priority goal can
  be preempted by a higher one. Override to `false` for a goal that must finish.
- `start`/`stop`/`tick` default to no-ops.

### Control flags

`setRequiredControlFlags` declares which shared controls the goal drives, so the
selector knows which goals conflict. The three flags (`Control.h`):

| Flag | Value | Meaning |
|------|-------|---------|
| `Control::MoveControlFlag` | `1` | The goal moves the mob (navigation) |
| `Control::LookControlFlag` | `2` | The goal aims the mob's head |
| `Control::JumpControlFlag` | `4` | The goal drives jumping |

`MeleeAttackGoal` sets `MoveControlFlag | LookControlFlag` (`MeleeAttackGoal.cpp:18`)
because it both paths toward and faces the target; `SwellGoal` sets only
`MoveControlFlag` (`SwellGoal.cpp:13`). Two active goals that share **any**
control-flag bit cannot coexist — see the priority section below.

## Worked example — a "circle the player" goal

Say you want a mob that, once it has a target, orbits it instead of walking
straight in. Create `Minecraft.World/CirclePlayerGoal.h`, modeled on the shape of
`MeleeAttackGoal.h`:

```cpp
#pragma once

#include "Goal.h"

class PathfinderMob;

class CirclePlayerGoal : public Goal
{
private:
    PathfinderMob *mob;
    double speedModifier;
    int recalcTimer;

public:
    CirclePlayerGoal(PathfinderMob *mob, double speedModifier);

    virtual bool canUse();
    virtual bool canContinueToUse();
    virtual void start();
    virtual void stop();
    virtual void tick();
};
```

Then `CirclePlayerGoal.cpp`. Note the include block — every goal that touches
navigation, control, or sensing pulls in the `net.minecraft.world.entity.ai.*`
namespace stubs, exactly as `MeleeAttackGoal.cpp:1` does:

```cpp
#include "stdafx.h"
#include "net.minecraft.world.entity.h"
#include "net.minecraft.world.entity.monster.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.entity.ai.control.h"
#include "net.minecraft.world.entity.ai.navigation.h"
#include "net.minecraft.world.entity.ai.sensing.h"
#include "net.minecraft.world.phys.h"
#include "CirclePlayerGoal.h"

CirclePlayerGoal::CirclePlayerGoal(PathfinderMob *mob, double speedModifier)
{
    this->mob = mob;
    this->speedModifier = speedModifier;
    this->recalcTimer = 0;

    // We move AND face the target, so we claim both controls:
    setRequiredControlFlags(Control::MoveControlFlag | Control::LookControlFlag);
}

bool CirclePlayerGoal::canUse()
{
    shared_ptr<LivingEntity> target = mob->getTarget();
    if (target == nullptr) return false;
    if (!target->isAlive()) return false;
    // only orbit once we're already close
    return mob->distanceToSqr(target) < 12 * 12;
}

bool CirclePlayerGoal::canContinueToUse()
{
    shared_ptr<LivingEntity> target = mob->getTarget();
    return target != nullptr && target->isAlive();
}

void CirclePlayerGoal::start()
{
    recalcTimer = 0;
}

void CirclePlayerGoal::stop()
{
    mob->getNavigation()->stop();
}

void CirclePlayerGoal::tick()
{
    shared_ptr<LivingEntity> target = mob->getTarget();
    if (target == nullptr) return;

    // face the target every tick
    mob->getLookControl()->setLookAt(target, 30, 30);

    if (--recalcTimer <= 0)
    {
        recalcTimer = 10;
        // pick a point 90 degrees around the target and path to it
        double ang = atan2(mob->z - target->z, mob->x - target->x) + 0.6;
        double r = 4.0;
        double tx = target->x + cos(ang) * r;
        double tz = target->z + sin(ang) * r;
        mob->getNavigation()->moveTo(tx, mob->y, tz, speedModifier);
    }
}
```

The patterns to copy from the real goals:

- **Cache the owning `PathfinderMob*` in the ctor.** Goals hold a raw back-pointer
  to their mob (`MeleeAttackGoal.cpp:14`, `SwellGoal.cpp:12`). The mob owns the
  goal via its `GoalSelector`, which deletes it (`GoalSelector.cpp:23`), so no
  ownership cycle.
- **Read the target through `mob->getTarget()`**, which returns
  `shared_ptr<LivingEntity>`. Always null-check and `isAlive()`-check
  (`MeleeAttackGoal.cpp:44`).
- **Drive movement via `mob->getNavigation()`** and aim via
  `mob->getLookControl()->setLookAt(...)` (`MeleeAttackGoal.cpp:78`).
- **`canContinueToUse()` is usually looser than `canUse()`** — start when close,
  keep going while the target merely exists.

## Installing the goal on a mob

Goals are added in the mob's constructor via its two selectors. Every mob has:

- **`goalSelector`** — movement and action goals (float, stroll, attack, look).
- **`targetSelector`** — target-acquisition goals (`HurtByTargetGoal`,
  `NearestAttackableTargetGoal`, …). These set the value `getTarget()` returns.

`addGoal(int prio, Goal *goal)` (`GoalSelector.h:31`) takes an integer priority
where **lower means more important**. Here is the real Endermite constructor
(`Endermite.cpp:48`) — a textbook layout:

```cpp
goalSelector.addGoal(1, new FloatGoal(this));                          // don't drown
goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.0, false));        // attack
goalSelector.addGoal(3, new RandomStrollGoal(this, 1.0));              // wander
goalSelector.addGoal(4, new LookAtPlayerGoal(this, typeid(Player), 8));// look at player
goalSelector.addGoal(5, new RandomLookAroundGoal(this));               // idle look

targetSelector.addGoal(1, new EndermiteHurtByTargetGoal(this, true));  // retaliate
targetSelector.addGoal(2, new NearestAttackableTargetGoal(this, typeid(Player), 0, true));
```

To slot your circling goal in **between** attack and stroll, give it a priority
between 2 and 3 — but priorities are just sort keys, so renumber to make room:

```cpp
goalSelector.addGoal(1, new FloatGoal(this));
goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.0, false));
goalSelector.addGoal(3, new CirclePlayerGoal(this, 1.0));   // <- new
goalSelector.addGoal(4, new RandomStrollGoal(this, 1.0));
goalSelector.addGoal(5, new LookAtPlayerGoal(this, typeid(Player), 8));
goalSelector.addGoal(6, new RandomLookAroundGoal(this));
```

Because `MeleeAttackGoal` (prio 2) and `CirclePlayerGoal` (prio 3) both claim
`Move + Look`, they cannot run at the same time — the mob will melee **or**
circle, and melee wins whenever its `canUse()` is true. That is exactly the
behavior you want.

## How priorities and control flags resolve

The whole arbitration is in `GoalSelector::tick()` (`GoalSelector.cpp:60`) and
`canUseInSystem()` (`GoalSelector.cpp:127`). Read those two functions and the
model becomes clear:

1. **Not every tick.** New goals are only (re)evaluated every `newGoalRate`
   ticks — default `3` (`GoalSelector.cpp:16`). On the other ticks, currently
   running goals are just checked for `canContinueToUse()` and ticked. So a mob
   re-plans roughly 6-7 times a second, not every frame.
2. **A goal may start only if `canUseInSystem()` and `canUse()` are both true.**
3. **`canUseInSystem()` compares against every other goal** (`GoalSelector.cpp:130`):
   - Against a goal of **equal or lower importance** (higher-or-equal prio
     number) that is currently running: the new goal is blocked only if the two
     **cannot coexist**.
   - Against a **more important** running goal (lower prio number): the new goal
     is blocked unless that goal `canInterrupt()`.
4. **"Cannot coexist" = they share a control-flag bit** (`canCoExist`, `GoalSelector.cpp:148`):

   ```cpp
   return (goalA->getRequiredControlFlags() & goalB->getRequiredControlFlags()) == 0;
   ```

   Two goals coexist iff their control masks are disjoint. A `Look`-only goal
   (`LookAtPlayerGoal`) and a `Move`-only goal can run together; two `Move`
   goals cannot.

The upshot for modders:

- **Lower priority number wins** for the same control.
- **Declare your control flags honestly.** If your goal moves the mob but you
  forget `MoveControlFlag`, the selector thinks it's compatible with the stroll
  goal and both will fight over navigation.
- **A goal with no control flags coexists with everything** — useful for passive
  bookkeeping goals.
- **Override `canInterrupt()` to `false`** on a goal that must finish (an
  animation-locked attack, say) so higher-priority goals can't cut it off.

## The built-in goal catalogue (~49)

You rarely need a custom goal — most behaviors already exist. Reuse these as-is
or as base classes. All live in `Minecraft.World/*Goal.h`.

### `goalSelector` — movement & action

| Goal | Purpose |
|------|---------|
| `FloatGoal` | Swim up in water so the mob doesn't drown (prio 1 on almost every mob) |
| `RandomStrollGoal` | Wander to random nearby points |
| `PanicGoal` | Flee when hurt (animals) |
| `AvoidPlayerGoal` | Flee a given entity type within a radius (creeper flees ocelots) |
| `MeleeAttackGoal` | Path to and hit the target |
| `LeapAtTargetGoal` | Pounce (spider) |
| `RangedAttackGoal` / `ArrowAttackGoal` | Shoot from range (skeleton) |
| `MoveTowardsRestrictionGoal` / `MoveTowardsTargetGoal` | Head to a home point / a target |
| `MoveThroughVillageGoal` / `MoveIndoorsGoal` | Villager pathing |
| `FleeSunGoal` / `RestrictSunGoal` | Undead seek shade |
| `LookAtPlayerGoal` / `LookAtTradingPlayerGoal` | Aim head at a player |
| `RandomLookAroundGoal` | Idle head movement |
| `SwellGoal` | Creeper fuse/swell (see below) |
| `BreedGoal` / `MakeLoveGoal` / `FollowParentGoal` | Animal breeding |
| `TemptGoal` | Follow a held item |
| `SitGoal` / `FollowOwnerGoal` / `BegGoal` / `PlayGoal` | Tamable-pet behaviors |
| `OcelotSitOnTileGoal` / `OcelotAttackGoal` (`OzelotAttackGoal`) | Ocelot-specific |
| `EatTileGoal` | Sheep eat grass |
| `RunAroundLikeCrazyGoal` / `ControlledByPlayerGoal` | Horse taming / riding |
| `OfferFlowerGoal` / `TakeFlowerGoal` | Iron golem ↔ villager |
| `DoorInteractGoal` → `OpenDoorGoal` / `BreakDoorGoal` / `RestrictOpenDoorGoal` | Door handling |
| `InteractGoal` | Generic villager interaction |
| `TradeWithPlayerGoal` | Villager trading |

### `targetSelector` — target acquisition

| Goal | Purpose |
|------|---------|
| `TargetGoal` | Base class for all targeting goals |
| `HurtByTargetGoal` | Retaliate against whatever hit the mob (optionally alert same-type) |
| `NearestAttackableTargetGoal` | Acquire the nearest valid target of a type |
| `NonTameRandomTargetGoal` | Wolves target prey when not tamed |
| `OwnerHurtByTargetGoal` / `OwnerHurtTargetGoal` | Pets defend/avenge their owner |
| `DefendVillageTargetGoal` | Iron golems defend villagers |

Common constructor signatures, verified from source:

- `FloatGoal(Mob *mob)` (`FloatGoal.h:13`)
- `MeleeAttackGoal(PathfinderMob *mob, double speedModifier, bool trackTarget)`
  and an overload taking an `eINSTANCEOF attackType` first
  (`MeleeAttackGoal.h:24`)
- `HurtByTargetGoal(PathfinderMob *mob, bool alertSameType)` (`HurtByTargetGoal.h:12`)
- `NearestAttackableTargetGoal(PathfinderMob *mob, const type_info &targetType, int randomInterval, bool mustSee, bool mustReach = false, EntitySelector *sel = nullptr)`
  (`NearestAttackableTargetGoal.h:44`)

### Subclassing a target goal — the Endermite trick

Endermite doesn't want to retaliate against Endermen (they spawn it). Rather than
write a target goal from scratch, it **subclasses `HurtByTargetGoal` and overrides
`canAttack`** (`Endermite.cpp:18`):

```cpp
class EndermiteHurtByTargetGoal : public HurtByTargetGoal
{
public:
    EndermiteHurtByTargetGoal(Endermite* mob, bool callHelp) : HurtByTargetGoal(mob, callHelp) {}

protected:
    virtual bool canAttack(shared_ptr<LivingEntity> target, bool allowInvulnerable) override
    {
        if (target != nullptr && target->instanceof(eTYPE_ENDERMAN))
            return false;   // ignore the Enderman that hit us
        return HurtByTargetGoal::canAttack(target, allowInvulnerable);
    }
};
```

`canAttack` is a protected virtual on `TargetGoal` (`TargetGoal.h:46`). This is
the cleanest way to tweak targeting rules: inherit, override one hook, chain to
the base. Define the subclass at the top of your mob's `.cpp` and install it in
the constructor exactly like Endermite does (`Endermite.cpp:54`).

## Modifying interaction behavior — TU31 creeper ignition

A goal reacts to world state; **interaction behavior** reacts to the player right-
clicking a mob. neoLegacy's TU31 backport of **flint-and-steel creeper ignition**
is a clean example of both working together, spanning `Creeper.cpp`, `Creeper.h`,
and `SwellGoal.cpp`.

### 1. The interaction hook — `mobInteract`

When a player right-clicks a mob, the mob's `mobInteract(Player*)` runs. Creeper
overrides it to catch flint and steel (`Creeper.cpp:206`):

```cpp
bool Creeper::mobInteract(shared_ptr<Player> player)
{
    shared_ptr<ItemInstance> item = player->inventory->getSelected();

    if (item == nullptr || item->id != Item::flint_and_steel_Id)
        return Mob::mobInteract(player);   // not flint & steel: default behavior

    playSound(eSoundType_FIRE_NEWIGNITE, 1, random->nextFloat() * 0.4f + 0.8f);
    player->swing();

    if (!level->isClientSide)
    {
        if (!isIgnited())
        {
            Ignite();                      // start the fuse
            item->hurtAndBreak(1, player); // consume durability
            return true;
        }
        return Mob::mobInteract(player);
    }
    return true;
}
```

The pattern to copy for any custom interaction:

- **Guard on the held item first** and fall through to `Mob::mobInteract` for
  everything else, so you don't break vanilla right-click behavior.
- **Gate side effects on `!level->isClientSide`** — mutate state (start the fuse,
  damage the item) only on the server; the client half just plays the sound and
  swings the arm.
- **Return `true`** when you've handled the interaction so it isn't processed
  further.

### 2. The state it flips — `Ignite()`

`Ignite()` sets a flag and kicks the swell direction positive (`Creeper.cpp:195`):

```cpp
void Creeper::Ignite()
{
    setSwellDir(1);
    ignited = true;
}

bool Creeper::isIgnited() { return ignited; }
```

`ignited` is a plain member (`Creeper.h:24`); `setSwellDir` writes to synched
entity data (`Creeper.cpp:184`) so the client sees the fuse animation.

### 3. The goal that reads it — `SwellGoal`

The existing `SwellGoal` already checks `isIgnited()` at the top of its `tick()`
(`SwellGoal.cpp:35`) and forces the fuse to keep growing regardless of line-of-
sight or distance:

```cpp
void SwellGoal::tick()
{
    if (creeper->isIgnited())
    {
        creeper->setSwellDir(1);   // ignited: swell no matter what
        return;
    }
    // ...otherwise the normal target-based swell logic
}
```

And `Creeper::tick()` (`Creeper.cpp:105`) advances `swell` by `swellDir` each
tick and detonates when it reaches `maxSwell`, explosion radius doubling if the
creeper is charged (`Creeper.cpp:117`).

The lesson: **interaction and AI are decoupled through mob state.** `mobInteract`
flips a flag, a `Goal` reads the flag and changes movement, and `tick()` acts on
the result. To add your own "trigger" behavior, follow the same three-part split
rather than cramming logic into one method.

## What can go wrong

Goals have no registry and no validation pass, so a broken goal doesn't error —
it just does nothing, or fights another goal. The mechanics behind each symptom:

### `canUse()` never returns true → the goal silently does nothing

The selector only starts a goal when `canUseInSystem()` **and** `canUse()` are both
true (`GoalSelector.cpp:82`). A `canUse()` that always returns false (wrong
distance test, target-type mismatch, a null-check that always trips) means the
goal is installed but never runs — no log, no crash. Log or breakpoint `canUse()`
in the situation you expect it to fire; a goal that never returns true is the most
common "my AI does nothing" cause.

### Wrong / missing control flags → two goals fight over navigation

`canCoExist` is a pure bitmask test: two goals coexist iff their control masks are
disjoint (`(A->getRequiredControlFlags() & B->getRequiredControlFlags()) == 0`,
`GoalSelector.cpp:146-148`). If your goal moves the mob but you forgot
`setRequiredControlFlags(Control::MoveControlFlag)`, the selector believes it's
compatible with `RandomStrollGoal` — **both run and issue competing navigation
targets**, and the mob jitters or freezes. Conversely, over-declaring flags makes
your goal needlessly exclude compatible goals. Declare exactly the controls you
drive. A goal with no flags coexists with everything.

### Priority ties / bad numbers → the wrong goal wins the control

Priority is just a sort key, **lower = more important** (`addGoal(int prio, ...)`,
`GoalSelector.h:31`); the selector re-plans only every `newGoalRate` ticks
(default `3`, `GoalSelector.cpp:16` — roughly 6–7×/sec, not every frame). Two
goals that share a control resolve by priority number, so a circling goal numbered
*above* the melee goal will never preempt melee for the Move+Look controls. If a
goal must not be cut off mid-action, override `canInterrupt()` to `false` (it
defaults to `true`, `Goal.cpp:14-16`) — otherwise a higher-priority goal preempts
it the next planning tick.

### `stop()` doesn't clean up → the mob keeps moving

`stop()` defaults to a no-op (`Goal.cpp`). If your goal drove navigation and its
`stop()` doesn't call `mob->getNavigation()->stop()`, the mob keeps walking toward
the last target after the goal ends. The `GoalSelector` owns and deletes the goal
(`GoalSelector.cpp:23`), so there's no leak — but the movement state is yours to
reset.

### Interaction override that ignores the client/server split → desyncs

For `mobInteract`-style overrides (the creeper-ignition pattern), mutating state
without gating on `!level->isClientSide` runs the side effect twice (once per
side) and can desync the client's view of the mob. Follow the creeper split:
sound + arm-swing on both sides, state change and item damage server-only.

## Testing checklist

- [ ] The mob compiles and spawns with your goal installed (no missing include /
      unresolved `getNavigation`/`getLookControl`).
- [ ] The goal's `canUse()` actually returns true in the situation you expect —
      log or breakpoint it; a goal that never returns true silently does nothing.
- [ ] Control flags are declared: a moving goal has `MoveControlFlag`, an aiming
      goal has `LookControlFlag`. Two same-control goals correctly take turns
      rather than jittering.
- [ ] Priority ordering behaves: a higher-priority goal preempts a lower one when
      both want the same control (unless the lower one's `canInterrupt()` is false).
- [ ] `stop()` cleans up (e.g. `getNavigation()->stop()`), so the mob doesn't keep
      walking after the goal ends.
- [ ] For interaction overrides: server/client split is respected (state changes
      only when `!level->isClientSide`), the held item is consumed, and vanilla
      right-click still works for other items.
- [ ] Reload from a save — goals are rebuilt by the mob constructor, and
      `setLevel` re-wires any that need the level pointer
      (`GoalSelector::setLevel`, `GoalSelector.cpp:156`).

## Files involved

| File | Role |
|------|------|
| `Minecraft.World/Goal.h` / `Goal.cpp` | The base goal contract and defaults |
| `Minecraft.World/GoalSelector.h` / `.cpp` | Priority + control-flag arbitration |
| `Minecraft.World/Control.h` | The `Move`/`Look`/`Jump` control-flag constants |
| `Minecraft.World/*Goal.h` / `.cpp` | The ~49 built-in goals to reuse or subclass |
| `Minecraft.World/<YourMob>.cpp` | Where goals are installed in the constructor |
| `Minecraft.World/Creeper.cpp` / `.h`, `SwellGoal.cpp` | The TU31 ignition example |

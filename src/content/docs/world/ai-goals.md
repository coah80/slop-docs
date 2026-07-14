---
title: AI & Goals
description: neoLegacy's mob AI — the Goal base class, GoalSelector priority mechanics, the ~48 Goal classes, per-mob goal wiring, and TU31 behavior changes like creeper flint-and-steel ignition.
---

Mob behavior in neoLegacy is a direct port of Java LCE's goal system. Each mob
owns two `GoalSelector`s — one for **movement/action** goals and one for
**target selection** — and every discrete behavior (float in water, swell toward
the player, breed, flee the sun) is a small `Goal` subclass added to one of them
with a priority. There is no central goal registry: goals are `new`-ed straight
into a mob's constructor.

Files: `Goal.h`, `GoalSelector.h`/`GoalSelector.cpp`, `TargetGoal.h`,
`Control.h`, plus one `*Goal.{h,cpp}` pair per goal. Goals are wired in each
mob's `.cpp` (e.g. `Creeper.cpp`, `Zombie.cpp`, `Wolf.cpp`, `Villager.cpp`).

## The Goal base class

`class Goal` (`Goal.h:3`) is a tiny virtual interface — a lifecycle plus a set of
required control flags:

```cpp
class Goal {
    int _requiredControlFlags;
public:
    virtual bool canUse() = 0;          // may this goal start now?
    virtual bool canContinueToUse();    // should a running goal keep going? (default = canUse)
    virtual bool canInterrupt();        // may a higher-prio goal preempt this one?
    virtual void start();
    virtual void stop();
    virtual void tick();
    virtual void setRequiredControlFlags(int);
    virtual int  getRequiredControlFlags();
    virtual void setLevel(Level *level) {}; // 4J: re-wire AI after schematic load
};
```

`canUse()` is the only pure-virtual method — the one thing every goal must
implement. The simplest real goal, `FloatGoal` (`FloatGoal.cpp`), shows the whole
shape:

```cpp
FloatGoal::FloatGoal(Mob *mob) {
    this->mob = mob;
    setRequiredControlFlags(Control::JumpControlFlag);
    mob->getNavigation()->setCanFloat(true);
}
bool FloatGoal::canUse() { return (mob->isInWater() || mob->isInLava()); }
void FloatGoal::tick()   { if (mob->getRandom()->nextFloat() < 0.8f) mob->getJumpControl()->jump(); }
```

### Control flags

`Control` (`Control.h:3`) defines three mutually-exclusive-ish resources a goal
can claim. Two running goals may only coexist if their flag sets don't overlap:

| Flag | Value |
|------|-------|
| `Control::MoveControlFlag` | 1 |
| `Control::LookControlFlag` | 2 |
| `Control::JumpControlFlag` | 4 |

So a look-goal and a move-goal can run simultaneously, but two move-goals cannot.

### TargetGoal

Target-selection goals derive from `TargetGoal : public Goal` (`TargetGoal.h:7`)
instead of `Goal` directly. It adds line-of-sight and reachability caching
(`reachCache`, `unseenTicks`, `UnseenMemoryTicks = 60`) and a
`virtual bool canAttack(target, allowInvulnerable)` (`TargetGoal.h:46`) hook that
subclasses override to filter valid targets. `TargetGoal::TargetFlag = 1` marks
these so the selector can treat target goals distinctly.

## GoalSelector mechanics

`GoalSelector` (`GoalSelector.cpp`) holds all goals wrapped in an `InternalGoal`
record `{prio, goal, canDeletePointer}` and the subset currently running
(`usingGoals`). The 4J-added `canDeletePointer` flag lets a mob share one goal
instance between selectors without a double-free (used for the wolf's shared
`sitGoal`).

`addGoal()` (`GoalSelector.cpp:28`) — **lower prio number = higher priority**:

```cpp
void GoalSelector::addGoal(int prio, Goal *goal, bool canDeletePointer = true);
```

`tick()` (`GoalSelector.cpp:60`) is the scheduler and runs in two modes governed
by `newGoalRate` (default **3**, `GoalSelector.cpp:16`):

1. **Re-evaluation tick** (every `newGoalRate` ticks): walk all goals. Drop any
   running goal that can no longer run or is blocked by the priority system; for
   each stopped/idle goal, start it if `canUseInSystem()` **and** `canUse()` both
   pass.
2. **Cheap tick** (the other 2 of every 3): only ask each running goal
   `canContinueToUse()`, stopping the ones that answer no.

Then every still-running goal gets `tick()`ed.

`canUseInSystem()` (`GoalSelector.cpp:127`) is the priority arbiter:

```cpp
if (goal->prio >= ig->prio) {          // candidate is same-or-lower priority
    if (running && !canCoExist(goal, ig)) return false;   // blocked by control-flag clash
} else if (running && !ig->goal->canInterrupt()) return false; // higher-prio, but incumbent won't yield
```

`canCoExist()` (`GoalSelector.cpp:146`) is just the control-flag overlap test:

```cpp
return (goalA->goal->getRequiredControlFlags() & goalB->goal->getRequiredControlFlags()) == 0;
```

So a higher-priority goal (lower number) preempts a lower one **only if** the
incumbent's `canInterrupt()` allows it and they contend for the same control
flag; goals with disjoint control flags simply run in parallel regardless of
priority.

### Where the tick comes from

`GoalSelector::tick` is not called directly by the mob — it rides the AI pump.
Each server tick the world runs `Level::tickEntities` →
[`Mob::newServerAiStep`](/slop-docs/world/entities/#the-per-tick-entity-pipeline)
(`Mob.cpp:496`), which calls `targetSelector.tick()` (`Mob.cpp:508`) then
`goalSelector.tick()` (`:511`). So a mob resolves its target set *before* its
action set every tick, and both run through the identical `GoalSelector::tick`
machinery below.

## Worked trace: one `GoalSelector` tick

This walks a single `goalSelector.tick()` for the **creeper** (wiring from
[§per-mob wiring](#per-mob-goal-wiring)), showing exactly which goals start, run in
parallel, or get blocked. Recall the creeper's action goals and their control
flags (read from each goal's constructor):

| prio | Goal | Control flags |
|-----:|------|---------------|
| 1 | `FloatGoal` | `Jump` (4) — `FloatGoal.cpp:10` |
| 2 | `SwellGoal` | `Move` (1) — `SwellGoal.cpp:13` |
| 3 | `AvoidPlayerGoal` (←ocelot) | `Move` (1) — `AvoidPlayerGoal.cpp:31` |
| 4 | `MeleeAttackGoal` | `Move\|Look` (3) — `MeleeAttackGoal.cpp:18` |
| 5 | `RandomStrollGoal` | `Move\|Look` (3) — `RandomStrollGoal.cpp:14` |
| 6 | `LookAtPlayerGoal` | `Look` (2) — `LookAtPlayerGoal.cpp:13` |
| 6 | `RandomLookAroundGoal` | `Move\|Look` (3) — `RandomLookAroundGoal.cpp:12` |

**Scenario: a creeper on flat ground, one player 5 blocks away, no ocelot, not in
water.** Trace `GoalSelector::tick` (`GoalSelector.cpp:60`):

1. **Which tick am I?** `if (tickCount++ % newGoalRate == 0)` (`:64`, `newGoalRate = 3`).
   On a **re-evaluation tick** (1 of every 3) it walks all goals top to bottom
   (`:66`); on the other two it only asks each *running* goal `canContinueToUse()`
   (`:90-102`) — a cheap pass. Assume a re-evaluation tick.
2. **prio 1 `FloatGoal`.** Not running. `canUseInSystem` (`:127`) sees no
   higher-prio contender; `canUse()` (`FloatGoal.cpp` = "in water/lava?") returns
   **false** on dry land → skipped (`:82`).
3. **prio 2 `SwellGoal`.** `canUse()` returns false (target > 3 blocks) → skipped.
4. **prio 3 `AvoidPlayerGoal`.** No ocelot in range → `canUse()` false → skipped.
5. **prio 4 `MeleeAttackGoal`.** `canUse()` true (has a player target).
   `canUseInSystem` checks every other goal (`:130`): nothing higher-prio is
   running, so it passes. Started. Claims `Move|Look` (3). Added to `usingGoals`
   (`:84-85`).
6. **prio 5 `RandomStrollGoal`.** `canUse()` may be true, but `canUseInSystem`
   (`:136`) finds running `MeleeAttackGoal` at prio 4 (higher priority, lower
   number). Because stroll's prio (5) ≥ melee's prio (4), the branch at `:138`
   runs `canCoExist` — `(3 & 3) != 0` → **false** → **blocked**. The attacker owns
   Move+Look; the wanderer can't also steer.
7. **prio 6 `LookAtPlayerGoal`.** Control flag `Look` (2). vs running melee (3):
   `canCoExist` = `(2 & 3) = 2 != 0` → still **blocked** — melee already owns Look.
8. **prio 6 `RandomLookAroundGoal`.** `Move|Look` (3) vs melee (3) → blocked.

Result this tick: **only `MeleeAttackGoal` runs.** The two selector loops at the
bottom then fire `start()` on newly-started goals (`:106-109`) and `tick()` on all
running goals (`:111-114`).

**Now the player throws an ocelot's-eye-view — an ocelot walks up.** Next
re-evaluation tick: at step 4, `AvoidPlayerGoal::canUse()` is now true. It is
prio 3 (higher than melee's 4). At melee's turn, `canUseInSystem` hits the
`else` branch (`:140`): avoid is *higher* priority and running-or-startable, so
melee runs only if avoid `canInterrupt()`s — and avoid's flag is `Move` (1), which
collides with melee's `Move|Look` (3). The higher-priority flee **preempts** the
attack: the creeper stops swelling and runs from the cat, exactly the vanilla
behaviour, arbitrated purely by prio number + control-flag overlap with no
special-casing.

The one wrinkle: goals with **disjoint** flags never contend. `FloatGoal`
(`Jump`, 4) shares no bit with any other creeper goal, so the instant the creeper
touches water it floats *while* still attacking or fleeing — both run in the same
tick because `(4 & 3) == 0`.

## The goal classes

~48 `*Goal.h` headers exist. Grouped by role:

### Movement & positioning
| Goal | Notes |
|------|-------|
| `FloatGoal` | swim up in water/lava (jump control) |
| `RandomStrollGoal` | idle wander |
| `PanicGoal` | flee when hurt |
| `AvoidPlayerGoal` | keep distance from a target type (creeper←ocelot, villager←zombie) |
| `MoveTowardsRestrictionGoal` | return to a home/anchor point |
| `MoveTowardsTargetGoal` | approach current target |
| `MoveThroughVillageGoal` | pathfind through village |
| `MoveIndoorsGoal` | villagers seek shelter at night |
| `FleeSunGoal` / `RestrictSunGoal` | undead avoid daylight |
| `LeapAtTargetGoal` | pounce (wolf) |
| `RunAroundLikeCrazyGoal` | untamed horse bucking |
| `ControlledByPlayerGoal` | ridden-mob steering |

### Looking
`LookAtPlayerGoal`, `LookAtTradingPlayerGoal` (villager mid-trade),
`RandomLookAroundGoal`.

### Doors
`DoorInteractGoal` (base), `OpenDoorGoal`, `BreakDoorGoal` (zombie),
`RestrictOpenDoorGoal` (villager closes doors behind).

### Combat / actions
| Goal | Notes |
|------|-------|
| `MeleeAttackGoal` | approach + hit |
| `ArrowAttackGoal` / `RangedAttackGoal` | skeleton/etc. shooting |
| `SwellGoal` | creeper fuse (see below) |
| `OcelotAttackGoal` / `OzelotAttackGoal` | ocelot pounce on chickens (the dead `OzelotAttackGoal.*` pair is deleted in **v1.1.0b**; the active goal is `OcelotAttackGoal`) |
| `LeapAtTargetGoal` | |

### Target selection (derive from `TargetGoal`)
`NearestAttackableTargetGoal`, `HurtByTargetGoal`, `OwnerHurtByTargetGoal`,
`OwnerHurtTargetGoal`, `NonTameRandomTargetGoal` (untamed wolf hunts sheep),
`DefendVillageTargetGoal` (iron golem).

### Social / breeding / taming
`BreedGoal`, `MakeLoveGoal` (villager), `FollowParentGoal`, `FollowOwnerGoal`,
`TemptGoal`, `BegGoal` (wolf), `PlayGoal` (baby villager), `SitGoal`,
`OcelotSitOnTileGoal`, `EatTileGoal` (sheep grazing), `InteractGoal`.

### Villager economy
`TradeWithPlayerGoal`, `OfferFlowerGoal` / `TakeFlowerGoal` (iron golem ↔ baby
villager).

## Per-mob goal wiring

Each mob's constructor calls `goalSelector.addGoal(prio, new SomeGoal(...))` and
`targetSelector.addGoal(...)`. A few real wirings:

**Creeper** (`Creeper.cpp:42`) — note `SwellGoal` sits just below `FloatGoal`,
and it actively flees ocelots:

```cpp
goalSelector.addGoal(1, new FloatGoal(this));
goalSelector.addGoal(2, new SwellGoal(this));
goalSelector.addGoal(3, new AvoidPlayerGoal(this, typeid(Ocelot), 6, 1.0, 1.2));
goalSelector.addGoal(4, new MeleeAttackGoal(this, 1.0, false));
goalSelector.addGoal(5, new RandomStrollGoal(this, 0.8));
goalSelector.addGoal(6, new LookAtPlayerGoal(this, typeid(Player), 8));
goalSelector.addGoal(6, new RandomLookAroundGoal(this));
targetSelector.addGoal(1, new NearestAttackableTargetGoal(this, typeid(Player), 0, true));
targetSelector.addGoal(2, new HurtByTargetGoal(this, false));
```

**Zombie** (`Zombie.cpp:41`) — opens/breaks doors, targets villagers as well as
players; note two `MeleeAttackGoal`s discriminated by `eINSTANCEOF`
(`eTYPE_PLAYER` vs `eTYPE_VILLAGER`):

```cpp
getNavigation()->setCanOpenDoors(true);
goalSelector.addGoal(0, new FloatGoal(this));
goalSelector.addGoal(1, new BreakDoorGoal(this));
goalSelector.addGoal(2, new MeleeAttackGoal(this, eTYPE_PLAYER, 1.0, false));
goalSelector.addGoal(3, new MeleeAttackGoal(this, eTYPE_VILLAGER, 1.0, true));
…
targetSelector.addGoal(2, new NearestAttackableTargetGoal(this, typeid(Player), 0, true));
targetSelector.addGoal(2, new NearestAttackableTargetGoal(this, typeid(Villager), 0, false));
```

**Wolf** (`Wolf.cpp:41`) — the `sitGoal` is added with `canDeletePointer = false`
because the same instance is referenced elsewhere; untamed wolves hunt sheep:

```cpp
goalSelector.addGoal(2, sitGoal, false);   // shared instance, don't auto-delete
goalSelector.addGoal(3, new LeapAtTargetGoal(this, 0.4));
goalSelector.addGoal(5, new FollowOwnerGoal(this, 1.0, 10, 2));
goalSelector.addGoal(8, new BegGoal(this, 8));
targetSelector.addGoal(4, new NonTameRandomTargetGoal(this, typeid(Sheep), 200, false));
```

**Villager** (`Villager.cpp:52`) — the fullest goal stack: avoid zombies, trade,
seek shelter, manage doors, breed, play:

```cpp
goalSelector.addGoal(0, new FloatGoal(this));
goalSelector.addGoal(1, new AvoidPlayerGoal(this, typeid(Zombie), 8, 0.6, 0.6));
goalSelector.addGoal(1, new TradeWithPlayerGoal(this));
goalSelector.addGoal(1, new LookAtTradingPlayerGoal(this));
goalSelector.addGoal(2, new MoveIndoorsGoal(this));
goalSelector.addGoal(3, new RestrictOpenDoorGoal(this));
goalSelector.addGoal(4, new OpenDoorGoal(this, true));
goalSelector.addGoal(6, new MakeLoveGoal(this));
goalSelector.addGoal(7, new TakeFlowerGoal(this));
goalSelector.addGoal(8, new PlayGoal(this, 0.32));
```

Goals sharing a priority number (the three prio-1 villager goals, or the two
prio-6 creeper look goals) are all eligible in that tier and coexist or contend
purely on their control flags.

### Custom subclassed goals

A mob can subclass a goal inline when it needs a small tweak. The endermite does
this to avoid attacking its parent enderman (`Endermite.cpp:18`):

```cpp
class EndermiteHurtByTargetGoal : public HurtByTargetGoal {
    virtual bool canAttack(shared_ptr<LivingEntity> target, bool allowInvulnerable) override {
        if (target != nullptr && target->instanceof(eTYPE_ENDERMAN)) return false; // ignore Endermen
        return HurtByTargetGoal::canAttack(target, allowInvulnerable);
    }
};
```

## SwellGoal & TU31 creeper ignition

`SwellGoal` (`SwellGoal.cpp`) drives the creeper's fuse. `canUse()` triggers when
the creeper is within ~3 blocks of a target, and `tick()` sets the swell
direction based on line-of-sight and range. The neoLegacy/TU31 addition is the
first branch of `tick()` (`SwellGoal.cpp:35`):

```cpp
void SwellGoal::tick() {
    if (creeper->isIgnited()) { creeper->setSwellDir(1); return; }  // TU31: flint-and-steel
    …
    if (creeper->distanceToSqr(target.lock()) > 7 * 7)      { creeper->setSwellDir(-1); return; }
    if (!creeper->getSensing()->canSee(target.lock()))      { creeper->setSwellDir(-1); return; }
    creeper->setSwellDir(1);
}
```

Once ignited the fuse commits regardless of target distance or line of sight —
the creeper will explode even if the player runs away. Ignition itself is
`Creeper::mobInteract()` (`Creeper.cpp:206`): right-clicking with flint and steel
plays `eSoundType_FIRE_NEWIGNITE`, calls `Ignite()` (which sets `ignited = true`
and forces swell direction positive, `Creeper.cpp:195`), and damages the flint
and steel by one durability point:

```cpp
if (item->id != Item::flint_and_steel_Id) return Mob::mobInteract(player);
playSound(eSoundType_FIRE_NEWIGNITE, 1, random->nextFloat() * 0.4f + 0.8f);
player->swing();
if (!level->isClientSide && !isIgnited()) {
    Ignite();
    item->hurtAndBreak(1, player);
    return true;
}
```

The explosion radius (`explosionRadius`, default 3, `Creeper.cpp:28`) doubles
when the creeper is charged (`isPowered()`), and only destroys blocks when the
`mobGriefing` game rule is on (`Creeper.cpp:122`, see
[Game Rules](/slop-docs/world/gamerules/)).

## See also

- [Entities](/slop-docs/world/entities/) — the entity hierarchy, `eINSTANCEOF`, and EntityIO registry
- [Game Rules](/slop-docs/world/gamerules/) — `mobGriefing` gates creeper block damage
- [World Overview](/slop-docs/world/overview/) — bootstrap ordering and the wider module map

---
title: Adding Entities
description: A step-by-step worked example of adding a new mob to neoLegacy — the Entity/Mob subclass, the eINSTANCEOF flag entry in Class.h, EntityIO registration, spawn wiring, localization, and the client EntityRenderer + Model hookup.
---

This guide walks through adding a brand-new mob end-to-end, wiring up every
place the codebase actually touches when a mob is registered. The running
example is a hostile arthropod called **Termite** — deliberately modelled on
the real **Endermite** so you can diff your work against a live feature at every
step. Endermite was itself a neoLegacy backport (TU31-era), and it exercises the
same six subsystems any new mob does: the entity class, the `eINSTANCEOF` type,
the `EntityIO` registry, spawn rules, localization, and the client renderer.

Everything below is grounded in how neoLegacy registers mobs *today*. Endermite
is your template: `Minecraft.World/Endermite.h` / `Endermite.cpp` for the
server-side entity, `Class.h:175` for the type flag, `EntityIO.cpp:99` for the
registration line, and `Minecraft.Client/EndermiteRenderer.cpp` for the client
render hookup.

Related reading: [Entities](/slop-docs/world/entities/) (the hierarchy and ID
space), [Entity Renderers & Models](/slop-docs/client/entity-rendering/) (the
render dispatch), and [Custom AI Behaviors](/slop-docs/modding/custom-ai/) (the
goals your mob's constructor installs).

## Step 0 — Understand the registration idiom

Entities are **not** registered by a fluent builder the way tiles and items are.
There is no `EntityIO::setId(...)->setX()` chain. Instead each entity class:

1. Declares its own `eINSTANCEOF` type value in the shared enum (`Class.h`).
2. Exposes two things the factory system needs — a `GetType()` override and a
   `static Entity *create(Level*)` factory function.
3. Is registered once with a hard-coded numeric ID in
   `EntityIO::staticCtor()` (`EntityIO.cpp:45`).
4. Is given a renderer, keyed on that same `eINSTANCEOF`, in
   `EntityRenderDispatcher::staticCtor()` on the client
   (`EntityRenderDispatcher.cpp:98`).

Miss any one of these and you get a crash or a silently wrong mob — see
[What can go wrong](#what-can-go-wrong) for the exact per-step behaviour. The
short version: an unregistered renderer type dead-ends in
`EntityRenderDispatcher::getRenderer` (`EntityRenderDispatcher.cpp:197`) — it
`DEBUG_BREAK()`s on debug (`:205-207`) and then, with **no early return**,
dereferences the end iterator, so a release build hands the caller a garbage
pointer and crashes in `render()`. An unregistered `create` fn means the mob
never spawns or loads, and an unregistered save-ID string **loads back as a Pig**.

## Step 1 — Add the `eINSTANCEOF` type

Open `Minecraft.World/Class.h`. The `enum eINSTANCEOF` (`Class.h:106`) is a
**bit-flag inheritance tree**, not a flat list. A leaf type ORs together its
parent's bits plus a small discriminator so that the runtime `instanceof` check
(`eTYPE_DERIVED_FROM`, `Class.h:339`) is a pure bitmask test with no dynamic
casts.

The monster branch looks like this (`Class.h:156`+):

```cpp
eTYPE_MONSTER = eTYPE_ENEMY | eTYPE_PATHFINDER_MOB | BIT_MONSTER,

    eTYPE_SPIDER   = eTYPE_MONSTER | eTYPE_VALID_IN_SPAWNER_FLAG | BIT_SPIDER,
    ...
    eTYPE_ENDERMITE = eTYPE_MONSTER | eTYPE_VALID_IN_SPAWNER_FLAG | 0x10,
    eTYPE_ELDER_GUARDIAN = eTYPE_MONSTER | eTYPE_VALID_IN_SPAWNER_FLAG | 0x11,
```

Add your type right after Endermite's, picking the next unused low-nibble
discriminator so it does not collide with an existing monster:

```cpp
eTYPE_TERMITE = eTYPE_MONSTER | eTYPE_VALID_IN_SPAWNER_FLAG | 0x12,
```

### Derivation rules

- **Always inherit from the nearest matching parent.** A hostile ground mob
  derives from `eTYPE_MONSTER`; a passive breeding animal from `eTYPE_ANIMAL`;
  an ageable NPC from `eTYPE_AGABLE_MOB`. The parent constant already carries
  every ancestor bit (`ENTITY → LIVING_ENTITY → MOB → PATHFINDER_MOB → …`), so
  ORing it in gives you the full chain for free.
- **The low 6 bits (`& 0x3F`) are a discriminator, not flags.** `eTYPE_DERIVED_FROM`
  (`Class.h:341`) special-cases them: if the super-type has any of those low bits
  set it falls back to exact equality. That is why each leaf under `eTYPE_MONSTER`
  uses a distinct small number (`0x1`, `0x2`, … `0x12`). **Two monsters must never
  share the same discriminator.**
- **`eTYPE_VALID_IN_SPAWNER_FLAG`** (bit 28) marks a mob as placeable by a mob
  spawner. Include it for anything you want spawnable/spawner-eligible; every
  hostile mob in the enum sets it.
- **`eTYPE_ENEMY`** (bit 30) is already folded into `eTYPE_MONSTER`, so you don't
  re-add it for a monster. It's what makes light-level spawn checks and
  targeting treat the mob as hostile.

### Register the derivation checker entry (`_WINDOWS64` only)

`Class.h` carries a self-test, `checkDerivations()`, that verifies the bitmask
derivations match a hand-written parent table. It has two definitions guarded by
`#if !(defined _WINDOWS64)`: an empty stub on non-Windows64 builds (`Class.h:357`)
and the real checker on Windows64 (`Class.h:401`), which prints
`[Class.h] Error: '<x>' doesn't derive '<y>'.` and `DEBUG_BREAK()`s (`Class.h:611`,
`:616`) on a mismatch. If you add a type, add a matching line next to Endermite's
(`Class.h:497`):

```cpp
classes->push_back( SUBCLASS(eTYPE_TERMITE)->addParent(eTYPE_MONSTER)->addParent(eTYPE_VALID_IN_SPAWNER_FLAG) );
```

:::caution[The checker is not wired up at this snapshot]
`checkDerivations()` is **never called anywhere** in the tree today (grep the
whole source — there is no call site). So a bad discriminator will *not* trip a
startup `DEBUG_BREAK()`; the table is dead code you keep in sync only so it's
correct if a future build re-enables the call. The real consequence of a
duplicate or wrong low-nibble discriminator is a silently wrong runtime
`instanceof`: `eTYPE_DERIVED_FROM` (`Class.h:339`) short-circuits to exact
equality whenever the super-type has any low bit set (`(super & 0x3F) != 0`), so
two monsters sharing a discriminator make `instanceof` checks and targeting
misbehave with no crash and no log. Pick a genuinely unused low nibble.
:::

:::note[Changed in v1.1.0b]
`Class.h` gained a few lines on `origin/main` (v1.1.0b), so its citations shift by
~1: `eTYPE_ENDERMITE` is at `Class.h:176` and the `SUBCLASS(eTYPE_ENDERMITE)`
derivation entry at `:500`. The `EntityIO::setId` line for Endermite is still at
`EntityIO.cpp:99` upstream, and `0x12` (`eTYPE_TERMITE` in this example) remains a
free discriminator. Grep `git show origin/main:Minecraft.World/Class.h` for the
current highest low-nibble value before picking one.
:::

## Step 2 — Write the entity class

Create `Minecraft.World/Termite.h`. Mirror `Endermite.h` exactly — the two
mandatory members are `GetType()` and `create()`:

```cpp
#pragma once

#include "Monster.h"

class Termite : public Monster
{
public:
    eINSTANCEOF GetType() { return eTYPE_TERMITE; }
    static Entity *create(Level *level) { return new Termite(level); }

private:
    int lifetime;

public:
    Termite(Level *level);

protected:
    virtual void registerAttributes();
    virtual int getAmbientSound();
    virtual int getHurtSound();
    virtual int getDeathSound();

public:
    virtual void tick();
    virtual bool useNewAi() { return true; }

protected:
    virtual int getDeathLoot();

public:
    virtual bool canSpawn();
    virtual MobType getMobType();
};
```

Two details worth copying from Endermite:

- **`useNewAi()` returns `true`** (`Endermite.h:30`). This opts the mob into the
  goal-selector AI system rather than the legacy hard-coded movement. Every
  neoLegacy-era mob does this.
- **`GetType()` is your identity everywhere** — spawning, saving, targeting, and
  render dispatch all key off the value it returns.

Now `Minecraft.World/Termite.cpp`. The constructor is where you install AI goals
and set the hitbox; `registerAttributes()` sets health/speed/damage. This is the
Endermite constructor (`Endermite.cpp:38`) adapted:

```cpp
#include "stdafx.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.entity.ai.attributes.h"
#include "net.minecraft.world.entity.ai.goal.h"
#include "net.minecraft.world.entity.ai.goal.target.h"
#include "net.minecraft.world.entity.ai.navigation.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.entity.monster.h"
#include "Termite.h"
#include "SoundTypes.h"
#include "Random.h"

Termite::Termite(Level *level) : Monster(level), lifetime(0)
{
    this->defineSynchedData();
    registerAttributes();
    setHealth(getMaxHealth());

    setSize(0.4f, 0.3f);
    xp = 3;

    getNavigation()->setCanOpenDoors(false);
    goalSelector.addGoal(1, new FloatGoal(this));
    goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.0, false));
    goalSelector.addGoal(3, new RandomStrollGoal(this, 1.0));
    goalSelector.addGoal(4, new LookAtPlayerGoal(this, typeid(Player), 8));
    goalSelector.addGoal(5, new RandomLookAroundGoal(this));

    targetSelector.addGoal(1, new HurtByTargetGoal(this, true));
    targetSelector.addGoal(2, new NearestAttackableTargetGoal(this, typeid(Player), 0, true));
}

void Termite::registerAttributes()
{
    Monster::registerAttributes();

    getAttribute(SharedMonsterAttributes::FOLLOW_RANGE)->setBaseValue(8.0f);
    getAttribute(SharedMonsterAttributes::MAX_HEALTH)->setBaseValue(8.0f);
    getAttribute(SharedMonsterAttributes::MOVEMENT_SPEED)->setBaseValue(0.25f);
    getAttribute(SharedMonsterAttributes::ATTACK_DAMAGE)->setBaseValue(2.0f);
}
```

Notes on the moving parts, all copied from the real Endermite:

- **`this->defineSynchedData()` must be called from the constructor**, not left
  to the base `Entity` ctor. The comment in `Creeper.cpp:34` spells out why: it
  is moved into the derived ctor "to ensure that the derived version of the
  function is called." If your mob adds synched data fields, override
  `defineSynchedData()` and call the base first.
- **`setSize(width, height)`** sets the AABB (`Endermite.cpp:44`).
- **`xp`** is the XP dropped on death.
- **Goals go on two selectors.** `goalSelector` holds movement/action goals;
  `targetSelector` holds target-acquisition goals. Both take an integer priority
  (lower = more important). See [Custom AI Behaviors](/slop-docs/modding/custom-ai/)
  for the full goal catalogue and how priorities resolve.

Fill in the sound getters (reuse an existing sound bank if you don't have new
audio — Endermite borrows the silverfish sounds at `Endermite.cpp:90`), a
`getDeathLoot()`, a `canSpawn()` override, and a `tick()`. The Endermite `tick()`
(`Endermite.cpp:115`) is a good model: it calls `Monster::tick()`, spawns
particles on the client (`level->isClientSide`), and does a server-side lifetime
countdown. At minimum:

```cpp
void Termite::tick()
{
    yBodyRot = yRot;
    Monster::tick();
}

MobType Termite::getMobType() { return ARTHROPOD; }
```

`getMobType()` feeds combat modifiers (e.g. Bane of Arthropods). Return the enum
that fits — `ARTHROPOD`, `UNDEAD`, `UNDEFINED`, etc.

## Step 3 — Register in EntityIO

Open `Minecraft.World/EntityIO.cpp` and add one line inside
`EntityIO::staticCtor()` (`EntityIO.cpp:45`). Every mob is one `setId(...)` call.
There are two overloads (`EntityIO.cpp:28` / `:38`):

```cpp
// no spawn egg:
setId(createFn, eINSTANCEOF clas, wstring id, int idNum);

// with a coloured, named spawn egg in the Creative menu:
setId(createFn, eINSTANCEOF clas, wstring id, int idNum,
      eMinecraftColour color1, eMinecraftColour color2, int nameId);
```

Endermite uses the 7-arg overload (`EntityIO.cpp:99`):

```cpp
setId(Endermite::create, eTYPE_ENDERMITE, L"Endermite", 67,
      eMinecraftColour_Mob_Endermite_Colour1,
      eMinecraftColour_Mob_Endermite_Colour2, IDS_ENDERMITE);
```

Add yours right after it:

```cpp
setId(Termite::create, eTYPE_TERMITE, L"Termite", 69,
      eMinecraftColour_Mob_Endermite_Colour1,
      eMinecraftColour_Mob_Endermite_Colour2, IDS_ENDERMITE);
```

Rules for the arguments:

| Argument | What it is | Where it must be unique |
|----------|-----------|--------------------------|
| `Termite::create` | The static factory fn from your header | — |
| `eTYPE_TERMITE` | The type you added in Step 1 | Must not collide with another type |
| `L"Termite"` | The **save-ID string** written to NBT `id` | Must be unique — used by `loadStatic` |
| `69` | The **numeric network/save ID** | Must be unused (see the ID map below) |
| `Colour1/Colour2` | Spawn-egg gradient colours | For the Creative menu egg |
| `IDS_ENDERMITE` | The name string ID (`nameId`) | Your own once you add it (Step 5) |

The `setId` body populates six parallel maps at once — name→fn, num→fn,
class↔id, class↔num, name↔num (`EntityIO.cpp:30`) — plus, for the 7-arg form,
an `idsSpawnableInCreative` entry holding the egg colours and name
(`EntityIO.cpp:42`). That is the whole registration; there is no second phase.

### Picking a numeric ID

IDs are hard-coded and grouped by category — they are **not** auto-incremented.
Read them from `EntityIO::staticCtor()` directly:

| Range | Category | Examples |
|-------|----------|----------|
| 1–2 | Item / XP | Item 1, XPOrb 2 |
| 4, 8–22 | Projectiles / hangings | Arrow 10, Fireball 12, ItemFrame 18, FireworksRocket 22 |
| 41–47 | Boats / minecarts | Boat 41, MinecartHopper 46, MinecartSpawner 47 |
| 48–68 | Hostile mobs | Creeper 50, Zombie 54, Endermite 67, Guardian 68 |
| 90–102 | Passive mobs | Pig 90, Rabbit 101, ArmorStand 102 |
| 120 | Villager | Villager 120 |
| 200 | Ender crystal | EnderCrystal 200 |
| 1000 | Dragon fireball | DragonFireball 1000 |

For a hostile mob, take the next free number after Guardian's 68. Numbers 67 and
68 are taken (Endermite, Guardian); **69 is the first free hostile slot**, which
is why the example uses it.

> Horse and ocelot variants pack a subtype into the high bits
> (`100 | ((TYPE_DONKEY+1) << 12)`, `EntityIO.cpp:135`). You only need this if
> your mob has spawn-egg-selectable variants; a plain mob does not.

## Step 4 — Wire spawning

Two things control where a mob naturally spawns.

### 4a. Per-mob spawn gate — `canSpawn()`

Your `canSpawn()` override is the final say. `Monster::canSpawn()` already checks
light level and collision; layer extra rules on top. Endermite refuses to spawn
near a player (`Endermite.cpp:148`):

```cpp
bool Termite::canSpawn()
{
    if (Monster::canSpawn())
    {
        shared_ptr<Player> nearestPlayer = level->getNearestPlayer(shared_from_this(), 5.0);
        return nearestPlayer == nullptr;
    }
    return false;
}
```

### 4b. Biome spawn lists

For a mob to appear during natural world-gen it must be in a biome's spawn list.
Biomes hold typed `MobSpawnerData` vectors (`Biome.h:138`): `enemies`,
`friendlies`, `waterFriendlies`, `friendlies_chicken`, `ambientFriendlies`, etc.
The base biome fills them in the `Biome(int id)` constructor — hostile entries
look like (`Biome.cpp:193`):

```cpp
enemies.push_back(new MobSpawnerData(eTYPE_SPIDER,   10, 4, 4));
enemies.push_back(new MobSpawnerData(eTYPE_ZOMBIE,   10, 4, 4));
enemies.push_back(new MobSpawnerData(eTYPE_CREEPER,  10, 4, 4));
enemies.push_back(new MobSpawnerData(eTYPE_ENDERMAN,  1, 1, 4));
```

`MobSpawnerData(eINSTANCEOF mobClass, int probabilityWeight, int minCount, int maxCount)`
(`Biome.h:128`). To make Termites spawn everywhere, add to the same block:

```cpp
enemies.push_back(new MobSpawnerData(eTYPE_TERMITE, 8, 2, 4));
```

The weight is relative to the other entries in the same list (Enderman's `1`
makes it rare; the common mobs use `10`). Restrict the mob to specific biomes by
adding to those `*Biome` subclasses' lists instead of the base. The category
lookup that the spawner uses is `Biome::getMobs(MobCategory*)` (`Biome.cpp:289`)
— `MobCategory::monster` returns `enemies`, `MobCategory::creature` returns
`friendlies`, and so on, so **the vector you push into decides which spawn cap
and rules your mob obeys.**

## Step 5 — Localization and the spawn egg name

The `nameId` you passed to `setId` is an `IDS_*` string ID resolved from the
localization resources (`Minecraft.Client/Xbox/loc/*/Minecraft_all.resx`) via
`app.GetString(...)`. The console front-end maps a mob's `eINSTANCEOF` to its
`IDS_*` in `CMinecraftApp::getEntityName` (`Consoles_App.cpp`, the big switch
ending near `:9101`):

```cpp
case eTYPE_RABBIT:
    return app.GetString(IDS_RABBIT);
```

To give the Termite its own name:

1. Add an `IDS_TERMITE` entry to the `.resx` localization files (at minimum the
   English `Minecraft_all.resx`).
2. Pass `IDS_TERMITE` as the `nameId` in your `EntityIO::setId` line instead of
   reusing `IDS_ENDERMITE`.
3. Add a `case eTYPE_TERMITE: return app.GetString(IDS_TERMITE);` to
   `getEntityName` so death messages and the mob roster show the right name.

Reusing `IDS_ENDERMITE` (as the skeleton above does) is fine while prototyping —
your mob just shares Endermite's display name until you add the string.

## Step 6 — The client renderer and model

Nothing about the entity draws itself; the client picks a renderer by
`eINSTANCEOF`. This is the step people forget, and it crashes with
`Couldn't find renderer for entity of type N` + `DEBUG_BREAK()`
(`EntityRenderDispatcher.cpp:205`).

### 6a. Write the renderer

Endermite's renderer is tiny — it derives `MobRenderer`, hands it a model and a
shadow radius, and points `getTextureLocation` at a texture
(`EndermiteRenderer.cpp`). Create `Minecraft.Client/TermiteRenderer.h`:

```cpp
#pragma once
#include "MobRenderer.h"

class Termite;

class TermiteRenderer : public MobRenderer
{
private:
    static ResourceLocation TERMITE_LOCATION;

public:
    TermiteRenderer();

public:
    virtual ResourceLocation *getTextureLocation(shared_ptr<Entity> mob);
};
```

And `TermiteRenderer.cpp`, mirroring `EndermiteRenderer.cpp:6`:

```cpp
#include "stdafx.h"
#include "TermiteRenderer.h"
#include "EndermiteModel.h"   // reuse until you have your own model

ResourceLocation TermiteRenderer::TERMITE_LOCATION(TN_MOB_ENDERMITE);

TermiteRenderer::TermiteRenderer() : MobRenderer(new EndermiteModel(), 0.3f)
{
}

ResourceLocation *TermiteRenderer::getTextureLocation(shared_ptr<Entity> mob)
{
    return &TERMITE_LOCATION;
}
```

The `MobRenderer` base handles the actual draw; you only supply the model
instance, the shadow radius (`0.3f`), and the texture. For a humanoid mob you'd
extend `HumanoidMobRenderer` and hand it a `HumanoidModel` instead — see the
[armor-stand path](/slop-docs/client/entity-rendering/), whose
`ArmorStandRenderer` follows the same shape (registered at
`EntityRenderDispatcher.cpp:183`).

### 6b. Register the renderer

Add one line to `EntityRenderDispatcher::staticCtor()`'s constructor body, next
to Endermite's (`EntityRenderDispatcher.cpp:184`):

```cpp
renderers[eTYPE_ARMORSTAND] = new ArmorStandRenderer();
renderers[eTYPE_ENDERMITE]  = new EndermiteRenderer();
renderers[eTYPE_TERMITE]    = new TermiteRenderer();   // <- add this
```

Don't forget the `#include "TermiteRenderer.h"` at the top of
`EntityRenderDispatcher.cpp` (the includes block runs to `:90`). The dispatcher
calls `it.second->init(this)` on every registered renderer after the block
(`EntityRenderDispatcher.cpp:187`), so registration order does not matter — only
that the entry exists.

### 6c. Texture wiring

Textures are referenced through a `ResourceLocation` built from a `_TEXTURE_NAME`
enum value, **not** a raw path. To add a texture:

1. Add an enum entry to the `_TEXTURE_NAME` list in `Textures.h` — Endermite's is
   `TN_MOB_ENDERMITE` (`Textures.h:179`).
2. Add the matching relative path at the **same index** in the parallel path
   table in `Textures.cpp` — Endermite's is `L"mob/endermite"`
   (`Textures.cpp:193`). The two lists are positional, so add your `TN_MOB_TERMITE`
   and `L"mob/termite"` in the same relative position in both files.
3. Point your renderer's `ResourceLocation` at `TN_MOB_TERMITE`.

Until you have art, reusing `TN_MOB_ENDERMITE` (as the skeleton does) renders
your mob with the endermite texture — fine for a first spawn test.

## What can go wrong

A mob spans six subsystems and each omission fails differently — some crash, some
silently degrade. All grounded in the source at this snapshot:

### Forgot the renderer entry → crash on first draw

The step people actually forget. With no `renderers[eTYPE_TERMITE] = ...` line,
`EntityRenderDispatcher::getRenderer(eINSTANCEOF)` (`EntityRenderDispatcher.cpp:197`)
does `renderers.find(e)`, gets `end()`, prints
`Couldn't find renderer for entity of type <N>` and `DEBUG_BREAK()`s
(`:205-207`) — but there is **no early return**: control falls straight to
`return it->second;` on the end iterator. On a debug build you stop at the break;
on release (where `DEBUG_BREAK` compiles out) it returns a garbage `EntityRenderer*`,
and the caller `render()` only guards `if (renderer != nullptr)`
(`EntityRenderDispatcher.cpp:307`) — a garbage-non-null pointer passes that check
and `renderer->render(...)` dereferences it → crash the instant the mob enters
view. Reusing an existing renderer/model/texture (as the Termite skeleton reuses
Endermite's) is enough to avoid it while prototyping.

### Forgot the `EntityIO::setId` line → doesn't spawn, and loads back as a Pig

`setId` populates every name/num/class map the factory needs. Skip it and:

- `/summon Termite` and natural spawning find no `create` fn, so nothing spawns.
- More insidiously on **load**: `EntityIO::getId(const wstring&)` (`EntityIO.cpp:278`)
  maps an unknown save-ID string to `return 90;` — the comment literally says
  `// defaults to pig...` (`:283-284`). So a saved Termite whose registration you
  removed (or renamed) reloads as a **Pig**, silently, rather than erroring.

Keep the `L"Termite"` save-ID string stable once a world has saved it.

### Duplicate discriminator or numeric ID → silent misbehaviour

The low-nibble discriminator in `Class.h` and the numeric ID in `setId` are both
hand-picked with no collision guard. A duplicate discriminator makes
`eTYPE_DERIVED_FROM` (`Class.h:339`) resolve `instanceof` wrong (see the caution
in Step 1) — targeting, spawner eligibility, and Bane-of-Arthropods checks
misfire with no crash. A duplicate numeric ID collides in the num→class/num→fn
maps and one mob's network/save id shadows the other. Grep
`EntityIO::staticCtor` for the ID and `Class.h` for the highest low nibble first.

### Forgot the `Class.h` type entry, or the CMake source entry → won't build

`GetType()` returns `eTYPE_TERMITE`, so the enum value must exist in `Class.h` or
`Termite.cpp` won't compile. And the new `Termite.cpp`/`TermiteRenderer.cpp` must
be added to their `cmake/sources/Common.cmake` lists (the module doesn't glob) —
omit them and `EntityIO`/the dispatcher reference `Termite::create` /
`TermiteRenderer` with nothing to link against, an unresolved-external at link.

### Forgot the biome spawn list → exists but never spawns naturally

Registration makes the mob *summonable*, not *natural*. Without a
`MobSpawnerData` entry in a biome's `enemies`/`friendlies` vector (Step 4b), the
mob simply never appears in world-gen — `/summon` and spawn eggs still work, so
it's easy to mistake for a spawn-rule bug. Which vector you push into also decides
the spawn cap and rules via `Biome::getMobs` (`Biome.cpp:289`).

### Forgot the name string / `getEntityName` case → shares Endermite's name

Passing `IDS_ENDERMITE` (or any placeholder) as the `nameId`, and not adding a
`case eTYPE_TERMITE:` to `getEntityName`, means the spawn egg and death messages
show the *reused* name. No crash — the mob just isn't called "Termite" until you
add the `IDS_*` entry and the switch case (Step 5). A missing string key follows
the usual loc fallback (the wide-string lookup returns the literal `IDS_*` text).

## Testing checklist

- [ ] Debug build starts without a `[Class.h] Error: … doesn't derive …`
      message or `DEBUG_BREAK()` (Step 1's derivation table matches the bitmask).
- [ ] `/summon Termite` (or the save-ID string you registered) spawns the mob.
- [ ] Spawn egg appears in the Creative menu with the right colours and name.
- [ ] Mob renders with a model, texture, and shadow — no
      "Couldn't find renderer for entity of type N" in the log.
- [ ] Mob moves, looks at the player, and melee-attacks (goals from Step 2 fire).
- [ ] Mob spawns naturally in the biomes you added it to (Step 4b), at a
      frequency matching its weight relative to other mobs.
- [ ] `canSpawn()` gating works (e.g. Termite won't spawn on top of the player).
- [ ] Save the world, reload — the mob persists (its `L"Termite"` save-ID round-
      trips through `EntityIO::loadStatic`, `EntityIO.cpp:168`).
- [ ] Kill the mob — it drops the right loot/XP and the death message shows the
      correct name (Step 5's `getEntityName` case).

## Files you touched

| File | What you added |
|------|----------------|
| `Minecraft.World/Class.h` | `eTYPE_TERMITE` enum value + `checkDerivations` entry |
| `Minecraft.World/Termite.h` / `.cpp` | The entity class (new files) |
| `Minecraft.World/EntityIO.cpp` | The `setId(...)` registration line |
| `Minecraft.World/Biome.cpp` (or a `*Biome` subclass) | `MobSpawnerData` entry |
| `Minecraft.Client/Xbox/loc/*/Minecraft_all.resx` | `IDS_TERMITE` string |
| `Minecraft.Client/Common/Consoles_App.cpp` | `getEntityName` case |
| `Minecraft.Client/TermiteRenderer.h` / `.cpp` | The renderer (new files) |
| `Minecraft.Client/EntityRenderDispatcher.cpp` | `#include` + `renderers[...]` line |
| `Minecraft.Client/Textures.h` / `Textures.cpp` | `TN_MOB_TERMITE` + path |

That is every place a mob is registered in neoLegacy — the exact set Endermite
occupies today.

---
title: Entities
description: The Entity/Mob hierarchy, the eINSTANCEOF type enum, EntityIO registration and numeric IDs, spawning, NBT persistence, and neoLegacy's new entities (armor stand, guardians, endermite, witch-on-lightning villagers).
---

Everything in the world that isn't a block is an **entity**: mobs, items on the
ground, XP orbs, arrows, TNT, minecarts, paintings, lightning. neoLegacy is a
direct C++ port of the decompiled Java LCE code, so the class hierarchy still
mirrors `net.minecraft.world.entity.*` almost one-for-one. The two things that
differ sharply from vanilla Java — and matter for modding — are how a type is
identified (a hand-rolled bit-flag enum instead of `instanceof`) and how types
are registered (a flat factory-function table, not an annotation-driven
registry).

Files: `Entity.h`/`Entity.cpp` (base, both large), `LivingEntity.cpp`, `Mob.h`,
`EntityIO.h`/`EntityIO.cpp` (the registry), `Class.h` (the type enum). Each
concrete entity is one `*.h`/`*.cpp` pair in the module root.

## Class hierarchy

The living-entity spine, from `class X : public …`:

```
Entity
 └─ LivingEntity
     ├─ Mob
     │   ├─ PathfinderMob
     │   │   ├─ AgableMob ── Villager, Animal ──…
     │   │   ├─ Monster ──…
     │   │   ├─ WaterAnimal ── Squid, Guardian
     │   │   └─ Golem ── SnowMan, VillagerGolem
     │   ├─ AmbientCreature ── Bat
     │   ├─ FlyingMob ── Ghast
     │   ├─ Slime ── LavaSlime
     │   └─ EnderDragon (also BossMob + MultiEntityMob)
     ├─ Player (also CommandSender, ScoreHolder)
     └─ ArmorStand   ← neoLegacy: extends LivingEntity directly, not Mob
```

Non-living entities hang off `Entity` directly: `ItemEntity`, `ExperienceOrb`,
`Arrow`, `Throwable` (snowball/egg/ender-pearl/potion/xp-bottle), `Fireball`
(large/small/wither-skull/dragon), `FishingHook`, `PrimedTnt`, `FallingTile`,
`Boat`, `Minecart`, `HangingEntity` (painting/item-frame/leash-knot),
`EnderCrystal`, `EyeOfEnderSignal`, `FireworksRocketEntity`, `NetherSphere`, and
`GlobalEntity` (lightning bolt). The multi-part boss geometry is
`BossMobPart`/`MultiEntityMobPart`.

`Mob` (`Mob.h:24`) is the base for anything with AI. It owns two goal selectors
that drive all behavior — see [AI &
Goals](/slop-docs/world/ai-goals/):

```cpp
GoalSelector goalSelector;   // Mob.h:56
GoalSelector targetSelector; // Mob.h:57
```

## The eINSTANCEOF type enum

There is no RTTI-based `instanceof` on the hot path. Instead every entity
returns a 32-bit tag from `virtual eINSTANCEOF GetType()` (`Entity.h:45`, pure
virtual), and type checks are a bitmask test:

```cpp
// Entity.h:47
inline bool instanceof(eINSTANCEOF super) { return eTYPE_DERIVED_FROM(super, GetType()); }
```

The enum is defined at `Class.h:106`. The high nibble is a **class bitfield**
(one bit per level of the hierarchy) and the low bits are a **discriminator** so
siblings differ. A derived type is the parent value OR-ed with its own bit(s):

| Type | Definition (`Class.h`) |
|------|------------------------|
| `eTYPE_ENTITY` | `BIT_ENTITY` (bit 27) |
| `eTYPE_LIVINGENTITY` | `eTYPE_ENTITY \| BIT_LIVING_ENTITY` |
| `eTYPE_MOB` | `eTYPE_LIVINGENTITY \| BIT_MOB` |
| `eTYPE_PATHFINDER_MOB` | `eTYPE_MOB \| BIT_PATHFINDER_MOB` |
| `eTYPE_AGABLE_MOB` | `eTYPE_PATHFINDER_MOB \| BIT_AGABLE_MOB` |
| `eTYPE_ANIMAL` | `eTYPE_AGABLE_MOB \| BIT_ANIMAL` |
| `eTYPE_MONSTER` | `eTYPE_ENEMY \| eTYPE_PATHFINDER_MOB \| BIT_MONSTER` |
| `eTYPE_ZOMBIE` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| BIT_ZOMBIE` |
| `eTYPE_CREEPER` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x1` |

The test itself (`Class.h:339`):

```cpp
inline bool eTYPE_DERIVED_FROM(eINSTANCEOF super, eINSTANCEOF sub)
{
    if ( (super & 0x3F) != 0x00 )  return super == sub;      // leaf: exact match
    else                           return (super & sub) == super; // ancestor: subset test
}
```

So `entity->instanceof(eTYPE_MONSTER)` is a single AND-compare against the whole
subtree, no dynamic cast. The four top bits are **flags** rather than hierarchy
levels: `BIT_VALID_IN_SPAWNER` (28), `BIT_ANIMALS_SPAWN_LIMIT_CHECK` (29),
`BIT_ENEMY` (30), `BIT_PROJECTILE` (31). A `WIN64` debug build runs
`SubClass::checkDerivations()` (`Class.h:401`) which brute-forces every
type-pair against a hand-listed parent table and `DEBUG_BREAK()`s on any
false-positive/negative — this is how the bit layout is kept correct when types
are added.

### neoLegacy / newer-TU types in the enum

These leaf types are present that vanilla TU19 did not have (`Class.h:140`,
`:172`–`:176`, `:195`, `:214`, `:242`):

| Type | Value | Notes |
|------|-------|-------|
| `eTYPE_RABBIT` | `eTYPE_ANIMAL \| eTYPE_ANIMALS_SPAWN_LIMIT_CHECK \| 0x5` | |
| `eTYPE_GUARDIAN` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x9` | |
| `eTYPE_ELDER_GUARDIAN` | `eTYPE_MONSTER \| … \| 0x11` | |
| `eTYPE_ENDERMITE` | `eTYPE_MONSTER \| … \| 0x10` | |
| `eTYPE_ARMORSTAND` | `eTYPE_LIVINGENTITY \| 0x10` | note: **not** under `eTYPE_MOB` |
| `eTYPE_DRAGON_FIREBALL` | `eTYPE_FIREBALL \| 0x1` | |
| `eTYPE_FIREWORKS_ROCKET` | `(eTYPE_OTHER_ENTITIES + 4) \| eTYPE_PROJECTILE` | |

`eTYPE_ARMORSTAND` deriving from `eTYPE_LIVINGENTITY` (not `eTYPE_MOB`) matches
the class: `class ArmorStand : public LivingEntity` (`ArmorStand.h:8`). It is a
living entity with no AI and no goal selectors.

## EntityIO — the type registry

`EntityIO` (`EntityIO.h`) maps between three views of an entity type: the string
save-id (`L"Zombie"`), the numeric network/spawn id (`54`), and the
`eINSTANCEOF` tag. Registration is **not** an auto-incrementing loop — every id
is hard-coded. The registry is six parallel `unordered_map`s built at
`EntityIO.cpp:20`:

| Map | Key → Value |
|-----|-------------|
| `idCreateMap` | string id → create fn |
| `numCreateMap` | int id → create fn |
| `classIdMap` | eINSTANCEOF → string id |
| `numClassMap` | int id → eINSTANCEOF |
| `classNumMap` | eINSTANCEOF → int id |
| `idNumMap` | string id → int id |

Each entity supplies a static factory `static Entity *create(Level *)`
(`typedef` at `EntityIO.h:9`), e.g. `ArmorStand.h:12`:

```cpp
static Entity* create(Level* level) { return new ArmorStand(level); }
```

Registration happens in `EntityIO::staticCtor()` (`EntityIO.cpp:45`), called from
the master bootstrap `MinecraftWorld_RunStaticCtors()` at
`Minecraft.World.cpp:54`. The overload used for creative-menu mobs also records
the two spawn-egg colors and a localized name id:

```cpp
// EntityIO.cpp:28 / :38
static void setId(entityCreateFn createFn, eINSTANCEOF clas, const wstring &id, int idNum);
static void setId(entityCreateFn createFn, eINSTANCEOF clas, const wstring &id, int idNum,
                  eMinecraftColour color1, eMinecraftColour color2, int nameId);
```

### Numeric ID map

Read directly from `EntityIO::staticCtor()` (`EntityIO.cpp:47`–`130`). IDs are
grouped by category with gaps between them:

| ID | Save id | eINSTANCEOF | Class |
|----|---------|-------------|-------|
| 1 | `Item` | `eTYPE_ITEMENTITY` | `ItemEntity` |
| 2 | `XPOrb` | `eTYPE_EXPERIENCEORB` | `ExperienceOrb` |
| 4 | `ElderGuardian` | `eTYPE_ELDER_GUARDIAN` | `Guardian` *(neoLegacy)* |
| 8 | `LeashKnot` | `eTYPE_LEASHFENCEKNOT` | `LeashFenceKnotEntity` |
| 9 | `Painting` | `eTYPE_PAINTING` | `Painting` |
| 10 | `Arrow` | `eTYPE_ARROW` | `Arrow` |
| 11 | `Snowball` | `eTYPE_SNOWBALL` | `Snowball` |
| 12 | `Fireball` | `eTYPE_FIREBALL` | `LargeFireball` |
| 13 | `SmallFireball` | `eTYPE_SMALL_FIREBALL` | `SmallFireball` |
| 14 | `ThrownEnderpearl` | `eTYPE_THROWNENDERPEARL` | `ThrownEnderpearl` |
| 15 | `EyeOfEnderSignal` | `eTYPE_EYEOFENDERSIGNAL` | `EyeOfEnderSignal` |
| 16 | `ThrownPotion` | `eTYPE_THROWNPOTION` | `ThrownPotion` |
| 17 | `ThrownExpBottle` | `eTYPE_THROWNEXPBOTTLE` | `ThrownExpBottle` |
| 18 | `ItemFrame` | `eTYPE_ITEM_FRAME` | `ItemFrame` |
| 19 | `WitherSkull` | `eTYPE_WITHER_SKULL` | `WitherSkull` |
| 20 | `PrimedTnt` | `eTYPE_PRIMEDTNT` | `PrimedTnt` |
| 21 | `FallingSand` | `eTYPE_FALLINGTILE` | `FallingTile` |
| 22 | `FireworksRocketEntity` | `eTYPE_FIREWORKS_ROCKET` | `FireworksRocketEntity` *(neoLegacy)* |
| 41 | `Boat` | `eTYPE_BOAT` | `Boat` |
| 42–47 | `MinecartRideable`…`MinecartSpawner` | `eTYPE_MINECART_*` | minecart variants |
| 48 | `Mob` | `eTYPE_MOB` | `Mob` (abstract) |
| 49 | `Monster` | `eTYPE_MONSTER` | `Monster` (abstract) |
| 50 | `Creeper` | `eTYPE_CREEPER` | `Creeper` |
| 51 | `Skeleton` | `eTYPE_SKELETON` | `Skeleton` |
| 52 | `Spider` | `eTYPE_SPIDER` | `Spider` |
| 53 | `Giant` | `eTYPE_GIANT` | `Giant` |
| 54 | `Zombie` | `eTYPE_ZOMBIE` | `Zombie` |
| 55 | `Slime` | `eTYPE_SLIME` | `Slime` |
| 56 | `Ghast` | `eTYPE_GHAST` | `Ghast` |
| 57 | `PigZombie` | `eTYPE_PIGZOMBIE` | `PigZombie` |
| 58 | `Enderman` | `eTYPE_ENDERMAN` | `EnderMan` |
| 59 | `CaveSpider` | `eTYPE_CAVESPIDER` | `CaveSpider` |
| 60 | `Silverfish` | `eTYPE_SILVERFISH` | `Silverfish` |
| 61 | `Blaze` | `eTYPE_BLAZE` | `Blaze` |
| 62 | `LavaSlime` | `eTYPE_LAVASLIME` | `LavaSlime` (magma cube) |
| 63 | `EnderDragon` | `eTYPE_ENDERDRAGON` | `EnderDragon` |
| 64 | `WitherBoss` | `eTYPE_WITHERBOSS` | `WitherBoss` |
| 65 | `Bat` | `eTYPE_BAT` | `Bat` |
| 66 | `Witch` | `eTYPE_WITCH` | `Witch` |
| 67 | `Endermite` | `eTYPE_ENDERMITE` | `Endermite` *(neoLegacy)* |
| 68 | `Guardian` | `eTYPE_GUARDIAN` | `Guardian` *(neoLegacy)* |
| 90 | `Pig` | `eTYPE_PIG` | `Pig` |
| 91 | `Sheep` | `eTYPE_SHEEP` | `Sheep` |
| 92 | `Cow` | `eTYPE_COW` | `Cow` |
| 93 | `Chicken` | `eTYPE_CHICKEN` | `Chicken` |
| 94 | `Squid` | `eTYPE_SQUID` | `Squid` |
| 95 | `Wolf` | `eTYPE_WOLF` | `Wolf` |
| 96 | `MushroomCow` | `eTYPE_MUSHROOMCOW` | `MushroomCow` |
| 97 | `SnowMan` | `eTYPE_SNOWMAN` | `SnowMan` |
| 98 | `Ozelot` | `eTYPE_OCELOT` | `Ocelot` (save-id spelled `Ozelot`) |
| 99 | `VillagerGolem` | `eTYPE_VILLAGERGOLEM` | `VillagerGolem` (iron golem) |
| 100 | `EntityHorse` | `eTYPE_HORSE` | `EntityHorse` |
| 101 | `Rabbit` | `eTYPE_RABBIT` | `Rabbit` *(neoLegacy)* |
| 102 | `ArmorStand` | `eTYPE_ARMORSTAND` | `ArmorStand` *(neoLegacy)* |
| 120 | `Villager` | `eTYPE_VILLAGER` | `Villager` |
| 200 | `EnderCrystal` | `eTYPE_ENDER_CRYSTAL` | `EnderCrystal` |
| 1000 | `DragonFireball` | `eTYPE_DRAGON_FIREBALL` | `DragonFireball` *(4J-added)* |

### Subtype-packed IDs (spawn eggs)

Entities with a `variant` (horse, ocelot) reuse the base numeric id but pack the
subtype into the high bits so each variant gets a distinct, colored spawn egg
(`EntityIO.cpp:135`+):

```cpp
setId(EntityHorse::create, eTYPE_HORSE, L"EntityHorse",
      100 | ((EntityHorse::TYPE_DONKEY + 1) << 12), …, IDS_DONKEY);
```

So donkey/mule/skeleton-horse/zombie-horse and the three ocelot colors all share
save id `100`/`98` but differ in the packed creative-menu id. The
skeleton/undead-horse and ocelot-color eggs are `#ifndef _CONTENT_PACKAGE` only.

### Dispatch functions

| Function | `EntityIO.cpp` | Purpose |
|----------|----------------|---------|
| `newEntity(id, level)` | `:150` | create by string id |
| `loadStatic(tag, level)` | `:168` | create from an NBT tag, then `load()` it |
| `newById(int, level)` | `:216` | create by numeric id |
| `newByEnumType(eType, level)` | `:241` | create by `eINSTANCEOF` |
| `getId` / `getEncodeId` / `getClass` / `getType` | `:263`+ | id-space conversions |

`loadStatic()` (`EntityIO.cpp:168`) also handles a legacy save-format remap: an
old `L"Minecart"` tag with a `Type` int is rewritten to
`MinecartChest`/`MinecartFurnace`/`MinecartRideable` before lookup. `getId(const
wstring&)` for an unknown id defaults to pig (`90`) rather than failing
(`EntityIO.cpp:283`). Any entity that comes back as an `EnderDragon` has its
multi-part geometry finalized with `AddParts()` right after creation.

## Persistence (NBT)

Save/load is split between the base `Entity` and each subclass:

- `Entity::save(CompoundTag*)` (`Entity.h:300`) writes the common fields (pos,
  motion, rotation, id string) and calls the pure-virtual
  `addAdditonalSaveData(tag)` (`Entity.h:310`).
- `Entity::load(CompoundTag*)` (`Entity.h:302`) reads the common fields and calls
  `readAdditionalSaveData(tag)` (`Entity.h:309`).

Every concrete class overrides the two `*AdditionalSaveData` hooks. Example from
`Creeper.cpp:89`:

```cpp
void Creeper::addAdditonalSaveData(CompoundTag *entityTag)
{
    Monster::addAdditonalSaveData(entityTag);
    if (entityData->getByte(DATA_IS_POWERED) == 1) entityTag->putBoolean(L"powered", true);
    entityTag->putShort(L"Fuse", static_cast<short>(maxSwell));
    entityTag->putByte(L"ExplosionRadius", static_cast<byte>(explosionRadius));
}
```

A mob that should never despawn calls `setPersistenceRequired()` (`Mob.h:188`),
checked via `isPersistenceRequired()` (`Mob.h:198`); `removeWhenFarAway()`
(`Mob.h:129`) governs distance-based despawn in `checkDespawn()`. See the NBT tag
classes on [Block Entities](/slop-docs/world/tile-entities/) —
the same `CompoundTag`/`ListTag` system stores entity data.

## Spawning

- **Spawn categories** are `MobCategory` (`MobCategory.h`), registered at
  `Minecraft.World.cpp:55`. neoLegacy uses per-level hard caps rather than
  vanilla's per-chunk density (`MobCategory.h:10`): `CONSOLE_MONSTERS_HARD_LIMIT
  = 100`, `CONSOLE_ANIMALS_HARD_LIMIT = 100`, `CONSOLE_AMBIENT_HARD_LIMIT = 40`,
  `CONSOLE_SQUID_HARD_LIMIT = 5`, `MAX_CONSOLE_BOSS = 1`. 4J split wolves,
  chickens and mushroom-cows into their own categories
  (`creature_wolf`/`creature_chicken`/`creature_mushroomcow`, `MobCategory.h:62`)
  for finer caps.
- **Adding to the world** is `Level::addEntity()`. `Mob::canSpawn()`
  (`Mob.h:153`) gates natural spawns; `finalizeMobSpawn()` /
  `finalizeSpawnEggSpawn()` (`Mob.h:184`) apply per-mob spawn settings (baby
  chance, equipment, variant) — 4J added an `extraData` param so mobs configure
  themselves instead of `MobSpawner` special-casing each type.
- Whether mobs spawn at all is the `doMobSpawning` game rule (`RULE_DOMOBSPAWNING
  = 3`, see [Game Rules](/slop-docs/world/gamerules/)).

## The per-tick entity pipeline

Entities are pumped from the server main loop, **not** from `ServerLevel::tick`.
`MinecraftServer::tick` calls `level->tick()` (`MinecraftServer.cpp:2387`, the
world/tile pumps) and then, gated on the dimension having players or pending
removals, `level->tickEntities()` (`MinecraftServer.cpp:2409`) followed by
`level->getTracker()->tick()` (`:2416`). So one server tick is, in order:
**world sim → entity sim → client sync.**

`Level::tickEntities` (`Level.cpp:2239`) is one big pass that walks three lists
under critical sections:

1. **Global entities** (lightning) — ticked and erased-if-removed (`:2241-2255`).
2. **Regular entities** — after purging `entitiesToRemove`, it iterates
   `entities` and calls `tick(e)` on each live one (`Level.cpp:2329`), then erases
   any that became `removed` during their own tick (`:2333-2353`). The
   `#ifndef _FINAL_BUILD` guard at `:2326` is the debug "mobs don't tick" toggle.
3. **Tile entities** — the *same* method then ticks `tileEntityList` (`:2364-2377`),
   which is why block entities and mobs share one tick pass. See
   [Block Entities §ticking](/slop-docs/world/tile-entities/#worked-trace-create--tick--sync--saveload).

`Level::tick(e)` (`Level.cpp:2480`) is the per-entity wrapper: it bails if no
chunks are loaded near the entity (`:2489`), saves the old position/rotation for
interpolation (`:2495-2499`), calls `e->tick()` (or `rideTick()` if riding,
`:2509-2516`), runs a NaN-position sanity clamp (`:2520-2524`), and re-buckets the
entity into its new chunk if it crossed a boundary (`:2532-2543`).

For a mob, `e->tick()` resolves down the vtable to `Mob::tick` (`Mob.cpp:225`) →
`LivingEntity::tick` → (near its end) `aiStep()` (`LivingEntity.cpp:1768`) →
`LivingEntity::aiStep` (`:1844`), which — if `isEffectiveAi()` and `useNewAi()`
(`:1906-1910`) — calls **`newServerAiStep()`**. `Mob::newServerAiStep`
(`Mob.cpp:496`) is the real AI pump, in this fixed order (`:500-527`):

```
checkDespawn() → sensing->tick() → targetSelector.tick()
  → goalSelector.tick() → navigation->tick() → serverAiMobStep()
  → moveControl->tick() → lookControl->tick() → jumpControl->tick()
```

The two `GoalSelector::tick()` calls are where all behaviour is decided — traced
end-to-end in [AI & Goals](/slop-docs/world/ai-goals/#worked-trace-one-goalselector-tick).
`useNewAi()` returning `false` is exactly why `ArmorStand` (no goal selectors)
never enters this pump.

## Worked trace: a mob from spawn to despawn

Following one zombie through its whole server-side existence:

**1 — Natural spawn.** `ServerLevel::tick` calls `mobSpawner->tick(this, ...)`
(`ServerLevel.cpp:245`). `MobSpawner::tick` (`MobSpawner.cpp:42`) picks a category
and a mob type under the `MobCategory` hard caps, constructs the entity via
`EntityIO::newByEnumType(mobClass, level)` (`MobSpawner.cpp:303`) — the factory
lookup from the [numeric-ID table](#numeric-id-map) — checks `mob->canSpawn()`
(`:347`), and on success calls `level->addEntity(mob)` (`:357`) then
`mob->finalizeMobSpawn(groupData)` (`:358`) to roll baby-chance/equipment/variant.

**2 — Registration + first sync.** `Level::addEntity` (`Level.cpp:1704`) files the
entity into `entities` and its chunk, and fires `entityAdded`. On the server that
reaches `ServerLevelListener` → `level->getTracker()->addEntity(entity)`
(`ServerLevelListener.cpp:40`), registering it with the `EntityTracker` so nearby
players get an add-entity packet.

**3 — Living (tick + AI + sync).** Every tick the entity flows through the pipeline
above: `tickEntities` → `Level::tick(e)` → `Mob::tick` → `newServerAiStep` →
goal/target selectors decide movement and targeting. Separately, once per tick
`EntityTracker::tick` (`EntityTracker.cpp:129`) runs `TrackedEntity::tick`
(`TrackedEntity.cpp:57`) for each tracked entity: it diffs position/rotation and
emits a `MoveEntityPacket`/`MoveEntityPacketSmall` (`:186`), periodically forcing a
full teleport (`:152-158`), and pushes changed synched-data with
`SetEntityDataPacket` (`:101`). Equipment changes are broadcast inline from
`LivingEntity::tick` via `getTracker()->broadcast(..., SetEquippedItemPacket)`
(`LivingEntity.cpp:1760`).

**4 — Despawn (distance).** First thing each `newServerAiStep` does is
`checkDespawn()` (`Mob.cpp:502`). A mob with `removeWhenFarAway()` true (`Mob.h:129`)
and no `isPersistenceRequired()` (`Mob.h:198`) that is far from every player is
`remove()`d — the natural cleanup that keeps mob counts under the caps.

**5 — Death (damage → drops → removal).** If instead the mob is killed,
`LivingEntity::die(source)` (`LivingEntity.cpp:964`) awards the kill score (`:968`)
and calls `dropDeathLoot(wasKilledByPlayer, playerBonus)` (`:999`) for the item
drops. Death is *not* instant: `tickDeath()` (`LivingEntity.cpp:312`) increments
`deathTime` each tick, and at `deathTime == 20` (`:315`) — the death animation
length — drops XP (`popExperience`, gated on `doMobLoot`, `:318-320`) and removes
the entity. On the next `tickEntities` pass the `removed` flag causes the entity to
be erased from `entities` and its chunk (`Level.cpp:2333-2353`), and the tracker
sends a remove-entity packet. The `ItemEntity`/`ExperienceOrb` drops it left behind
are themselves entities, re-entering this pipeline at step 2.

## neoLegacy entity work

### Armor Stand

`class ArmorStand : public LivingEntity` (`ArmorStand.h:8`), id 102, save-id
`ArmorStand`. `useNewAi()` returns `false` (`ArmorStand.h:102`) — it has no goal
selectors. State is six `Rotations` poses (head/body/arms/legs) plus a client
flag byte carrying small/no-gravity/show-arms/no-baseplate/marker bits
(`ArmorStand.h:22`–`:34`). Equipment is a fixed five-slot array (weapon +
4 armor, `ArmorStand.h:37`). Poses save/load through `readPose()`/`writePose()`
(`ArmorStand.h:163`). The matching item is `ArmorStandItem`
(`ArmorStandItem.h`); see [Items](/slop-docs/world/items/).

### Guardian / Elder Guardian

One `Guardian` class (`Guardian.cpp`) covers both; the elder flag is stored in
synched data and read via `isElder()` (`Guardian.cpp:90`), persisted as the
`L"Elder"` boolean tag (`:85`). Elder vs normal changes size (1.9975 vs 0.85,
`Guardian.cpp:44`), health, extra attack damage (elder base 8.0 vs 6.0, `:105`),
and the mining-fatigue curse it applies (`digSlowdown`, `:281`, sound
`eSoundType_MOB_ELDER_GUARDIAN_CURSE` at `:616`).
It registers under `eTYPE_GUARDIAN` (id 68) and `eTYPE_ELDER_GUARDIAN` (id 4),
both pointing at `Guardian::create`. **Caveat:** the constructor
(`Guardian.cpp:37`) wires attributes and size but installs **no goals** — the
Guardian has no AI goal wiring in this build, so it does not swim or attack via
the goal system the way other mobs do.

### Endermite

`class Endermite : public Monster`, id 67. The constructor
(`Endermite.cpp:38`) wires the standard monster goal set plus a nested custom
target goal, `EndermiteHurtByTargetGoal` (`Endermite.cpp:18`), that overrides
`canAttack()` to **ignore Endermen** — so an endermite spawned from a teleporting
enderman won't retaliate against its parent:

```cpp
if (target != nullptr && target->instanceof(eTYPE_ENDERMAN))
    return false;
```

It also despawns on a timer: `lifetime` counts up in `tick()` and the mite is
removed at `>= 2400` ticks (2 minutes) unless `playerSpawned`
(`Endermite.cpp:134`).

### Witch-on-lightning villagers

`Villager::thunderHit()` (`Villager.cpp:780`) replaces a lightning-struck
villager with a `Witch`, carrying over the custom name and persistence flag:

```cpp
void Villager::thunderHit(const LightningBolt *lightningBolt)
{
    if (level->isClientSide) return;
    shared_ptr<Witch> witch = std::make_shared<Witch>(level);
    witch->moveTo(x, y, z, yRot, xRot);
    if (this->hasCustomName())         witch->setCustomName(this->getCustomName());
    if (this->isPersistenceRequired()) witch->setPersistenceRequired();
    level->addEntity(witch);
    remove();
}
```

The parallel `Creeper::thunderHit()` (`Creeper.cpp:189`) sets the powered/charged
flag `DATA_IS_POWERED` instead of replacing the entity.

### Other additions

Rabbit (`eTYPE_RABBIT`, id 101) as a full `Animal` with the spawn-limit flag;
the `FireworksRocketEntity` (id 22) and `DragonFireball` (id 1000) projectiles.
The rabbit/mutton/prismarine/beetroot **items** that pair with these mobs live on
[Items](/slop-docs/world/items/).

> **Changed in v1.1.0b** (`54528fac feat: loot tables (#43)`): mob drops are now
> driven by a data-driven **loot-table system** (`LootTableManager`, wired into
> `Mob.cpp` and the individual mob classes — Cow, Chicken, Sheep, Guardian, Blaze,
> Ghast, PigZombie, etc.), sourced from XML tables under
> `Common/Media/MediaWindows64/Structures/loot_tables/entities/`.
>
> The same commit **deletes the dead `Ozelot.cpp`/`.h` files**. Note that at the
> documented snapshot the *active* ocelot class is already `Ocelot`
> (`EntityIO.cpp:114` registers `Ocelot::create` with `eTYPE_OCELOT`); the leftover
> `Ozelot.*` files still sit on disk but are unreferenced. v1.1.0b simply removes
> that dead pair (along with `OzelotAttackGoal.*`). The numeric id **98** and the
> on-disk save-id string `Ozelot` in the table above are **unchanged**.
>
> A **new mob is also added**: `PolarBear` — numeric id **107**, save-id
> `L"PolarBear"`, type `eTYPE_POLARBEAR = eTYPE_ANIMAL |
> eTYPE_ANIMALS_SPAWN_LIMIT_CHECK | 0x6` (`Class.h`), registered right after
> `Rabbit` in `EntityIO::staticCtor()`. It is not present at the documented
> snapshot. See the
> [Changelog v1.1.0b section](/slop-docs/features/changelog/#v110b-current).

## See also

- [AI & Goals](/slop-docs/world/ai-goals/) — the goal selector and per-mob goal wiring
- [Block Entities](/slop-docs/world/tile-entities/) — the NBT tag system used for persistence
- [Game Rules](/slop-docs/world/gamerules/) — `doMobSpawning`, `mobGriefing`, `doMobLoot`
- [World Overview](/slop-docs/world/overview/) — the master `staticCtor` bootstrap order

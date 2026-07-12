---
title: "New Entities & Models"
description: "New entity types and their renderers in MinecraftConsoles."
---

MinecraftConsoles adds several entity types beyond the LCEMP base, along with their renderers and models on the client side. Each entity has a type enum (`eINSTANCEOF`), a static `create()` factory, and synched data fields.

## EntityHorse

**Files**: `Minecraft.World/EntityHorse.h`, `.cpp`; `Minecraft.Client/HorseRenderer.h`, `.cpp`; `Minecraft.Client/ModelHorse.cpp`

The horse is the most complex new entity. It extends `Animal` and implements `ContainerListener`. Entity type: `eTYPE_HORSE`.

### Horse types and variants

| Type constant | Value | Description |
|---------------|-------|-------------|
| `TYPE_HORSE` | 0 | Normal horse |
| `TYPE_DONKEY` | 1 | Donkey |
| `TYPE_MULE` | 2 | Mule |
| `TYPE_UNDEAD` | 3 | Zombie horse |
| `TYPE_SKELETON` | 4 | Skeleton horse |

7 color variants (white, creamy, chestnut, brown, black, gray, darkbrown) and 5 markings (none, white details, white fields, white dots, black dots).

### Armor system

4 armor tiers: none (0 protection), iron (5), gold (7), diamond (11). Armor textures and protection values are stored in static arrays. The inventory has designated slots for saddle (`INV_SLOT_SADDLE = 0`) and armor (`INV_SLOT_ARMOR = 1`), plus an optional 15-slot donkey chest.

### Key features

- **Synched data**: Flags for tame, saddle, chested, bred, eating, standing, open mouth (data ID 16). Type (19), variant (20), owner name (21), and armor type (22) are separate data IDs.
- **Temper system**: A `temper` integer that goes up through feeding. The horse gets tamed when temper exceeds `getMaxTemper()`.
- **Jump strength**: A custom `JUMP_STRENGTH` attribute (`RangedAttribute` with default 0.7, range 0.0 to 2.0, client-syncable).
- **Animations**: Eating, standing, and mouth animations with interpolated "O" (old) values for smooth rendering. Additional counters for tail, sprint, and gallop sound.
- **Breeding**: Uses `HorseGroupData` for spawn group data. Offspring inherit parent types. Mules are sterile. Undead horses can't breed.
- **Layered textures**: `HorseRenderer` caches layered texture combinations (variant + marking + armor) using `LAYERED_LOCATION_CACHE`.
- **Entity selector**: `HorseEntitySelector` implements `EntitySelector` for finding parent horses.

### Renderer

`HorseRenderer` extends `MobRenderer` with texture locations for each horse type (horse, mule, donkey, zombie, skeleton). Applies foal scaling and height adjustment.

For full details on horse inventory, equipment, and breeding, see the [Horses](/slop-docs/mc/horses/) page.

## Ocelot

MinecraftConsoles has two ocelot implementations:

### Ocelot (new AI system)

**Files**: `Minecraft.World/Ocelot.h`, `.cpp`; `Minecraft.Client/OcelotRenderer.h`, `.cpp`; `Minecraft.Client/OcelotModel.h`, `.cpp`

Extends `TamableAnimal`. Uses the new goal-based AI system (`useNewAi()` returns `true`). Entity type: `eTYPE_OCELOT`.

| Property | Value |
|----------|-------|
| Cat types | `TYPE_OCELOT` (0), `TYPE_BLACK` (1), `TYPE_RED` (2), `TYPE_SIAMESE` (3) |
| Speed modifiers | `SNEAK_SPEED_MOD`, `WALK_SPEED_MOD`, `FOLLOW_SPEED_MOD`, `SPRINT_SPEED_MOD` (all `double`) |
| Data type ID | `DATA_TYPE_ID` (static const int) |

Has dedicated AI goals:

- **`OcelotAttackGoal`** (`OcelotAttackGoal.h/cpp`): Pouncing attack behavior
- **`OcelotSitOnTileGoal`** (`OcelotSitOnTileGoal.h/cpp`): Classic behavior of sitting on chests/furnaces
- **`TemptGoal`**: Fish luring behavior (stored as `temptGoal` pointer)

Key methods:

- `getCatType()` / `setCatType()` for reading and setting the cat variant
- `mobInteract()` for player taming/interaction
- `canMate()` / `getBreedOffspring()` for breeding
- `isFood()` for checking food items (raw fish)
- `canSpawn()` for spawn validation
- `finalizeMobSpawn()` for group spawn data (4J added `extraData` param)
- `getAName()` returns the localized name
- `isSittingOnTile()` public method (4J-added for tooltip display)
- `setSittingOnTile()` private setter
- `doHurtTarget()` for attacking

No fall damage (`causeFallDamage()` does nothing).

### Ozelot (legacy AI system)

**Files**: `Minecraft.World/Ozelot.h`, `Ozelot.cpp`; `Minecraft.Client/OzelotRenderer.h`, `OzelotModel.h`

The older implementation using `eTYPE_OZELOT`. Key differences from the new version:

| Aspect | Ocelot (new) | Ozelot (legacy) |
|--------|-------------|-----------------|
| Type enum | `eTYPE_OCELOT` | `eTYPE_OZELOT` |
| Speed values | `double` modifiers | `float` constants |
| Cat types | Public enum | Private static `const int` |
| Damage | `float` | `int` |
| Rendering | Attribute-based | `getTexture()` returns `int` |
| Health | Via attributes | `getMaxHealth()` returns `int` |
| New AI | Yes | Yes (`useNewAi()` returns `true`) |
| Interaction | `mobInteract()` | `interact()` |

Both extend `TamableAnimal` and share the same basic behavior (taming, breeding, cat types) but use different API styles.

## Witch

**Files**: `Minecraft.World/Witch.h`, `.cpp`; `Minecraft.Client/WitchRenderer.h`, `.cpp`; `Minecraft.Client/WitchModel.h`, `.cpp`

Extends `Monster` and implements `RangedAttackMob`. Entity type: `eTYPE_WITCH`.

| Property | Value |
|----------|-------|
| AI system | New (`useNewAi()` returns `true`) |
| Ranged attack | `performRangedAttack()` throws potions |
| Speed modifier | `SPEED_MODIFIER_DRINKING` (static `AttributeModifier*`) applied while using items |
| Death loot count | `DEATH_LOOT_COUNT` = 8 |
| Death loot | Static `DEATH_LOOT[8]` array of item IDs |

The witch has a synched `DATA_USING_ITEM` flag (data ID 21) and a `usingTime` counter for potion-drinking animations.

Key methods:

- `setUsingItem(bool)` / `isUsingItem()` control the drinking state
- `aiStep()` handles the witch's AI tick (potion selection, drinking, etc.)
- `handleEntityEvent(byte)` handles network events
- `getDamageAfterMagicAbsorb()` reduces magic damage taken (protected)
- `dropDeathLoot()` drops from the `DEATH_LOOT` array (protected)
- `performRangedAttack()` throws harmful potions at the target

`WitchRenderer` includes special rendering for the held item and nose animation. `WitchModel` provides the custom model geometry with animated nose.

## WitherBoss

**Files**: `Minecraft.World/WitherBoss.h`, `.cpp`; `Minecraft.Client/WitherBossRenderer.h`, `.cpp`; `Minecraft.Client/WitherBossModel.h`, `.cpp`

Extends `Monster` and implements both `RangedAttackMob` and `BossMob`. Entity type: `eTYPE_WITHERBOSS`.

| Property | Value |
|----------|-------|
| AI system | New (`useNewAi()` returns `true`) |
| Heads | 3 (main + 2 side heads with independent targeting) |
| Block destruction | `destroyBlocksTick` timer for periodic block breaking |
| Idle head updates | `IDLE_HEAD_UPDATES_SIZE` = 2 |

### Synched data

| ID | Field | Purpose |
|----|-------|---------|
| 17 | `DATA_TARGET_A` | Main head target entity ID |
| 18 | `DATA_TARGET_B` | Left head target entity ID |
| 19 | `DATA_TARGET_C` | Right head target entity ID |
| 20 | `DATA_ID_INV` | Invulnerability counter |

### Multi-head system

Each side head tracks its own rotation with arrays:

- `xRotHeads[2]` / `yRotHeads[2]` for current rotation
- `xRotOHeads[2]` / `yRotOHeads[2]` for interpolated old values
- `nextHeadUpdate[2]` for targeting timers
- `idleHeadUpdates[2]` for idle animation

`performRangedAttack()` is overloaded:

- The `RangedAttackMob` interface version calls the head-specific version
- `performRangedAttack(int head, shared_ptr<LivingEntity> target)` fires at a living target
- `performRangedAttack(int head, double tx, double ty, double tz, bool dangerous)` fires at coordinates with an optional dangerous (blue skull) flag

Head position methods: `getHeadX()`, `getHeadY()`, `getHeadZ()` compute per-head positions. `getHeadYRot()` / `getHeadXRot()` return per-head rotation for rendering.

### Invulnerability

`makeInvulnerable()` sets the invulnerability timer. `getInvulnerableTicks()` / `setInvulnerableTicks()` manage the counter. `isPowered()` returns whether the Wither is in its powered (half-health) state.

### Target management

`getAlternativeTarget(int headIndex)` / `setAlternativeTarget(int headIndex, int entityId)` manage per-head targeting using entity IDs.

### Other features

- `makeStuckInWeb()` is overridden (the Wither ignores webs)
- `getArmorValue()` returns the natural armor points
- `getMobType()` returns the mob type category
- `addEffect()` is overridden (the Wither is immune to potion effects)
- `ride()` is overridden (the Wither can't be ridden)
- `hurt()` handles incoming damage with special invulnerability logic
- `getShadowHeightOffs()` returns the shadow offset
- `getLightColor()` returns custom brightness
- `isPickable()` returns whether the Wither can be hit
- `causeFallDamage()` is overridden (no fall damage)
- `dropDeathLoot()` drops the Nether Star
- `checkDespawn()` is overridden (the Wither never despawns)

### BossMob interface

The `BossMob` interface defines `getMaxHealth()`, `getHealth()`, and `getAName()`. The Wither delegates these to `Monster` base methods (noted by a 4J comment).

### Rendering

`WitherBossRenderer` uses three texture locations (normal, armor overlay, invulnerable) and has `prepareArmor()` and `prepareArmorOverlay()` for the shield effect.

### LivingEntitySelector

A utility `EntitySelector` subclass defined alongside `WitherBoss` that filters for living entities. The Wither's targeting logic uses a static `livingEntitySelector` pointer.

## WitherSkull

**Files**: `Minecraft.World/WitherSkull.h`, `.cpp`; `Minecraft.Client/WitherSkullRenderer.h`, `.cpp`

Extends `Fireball`. The projectile fired by the Wither. Entity type: `eTYPE_WITHER_SKULL`.

| Property | Value |
|----------|-------|
| Synched data | `DATA_DANGEROUS` (data ID 10) |
| Dangerous flag | Blue skull with enhanced effects |

Three constructors: default, entity-based (mob + direction), and coordinate-based (position + direction).

Key methods:

- `isDangerous()` / `setDangerous()` control the blue skull state
- `getInertia()` returns the projectile drag (protected)
- `isOnFire()` returns fire state
- `getTileExplosionResistance()` reduces resistance when dangerous
- `onHit()` handles collision behavior (protected)
- `isPickable()` / `hurt()` for interaction
- `shouldBurn()` 4J-added method for fire behavior (protected)

`WitherSkullRenderer` uses `SkeletonHeadModel` for geometry and has separate textures for normal and armored states.

## Bat

**Files**: `Minecraft.World/Bat.h`, `.cpp`; `Minecraft.Client/BatRenderer.h`, `BatModel.h`

Extends `AmbientCreature`. A passive ambient mob that hangs from ceilings. Entity type: `eTYPE_BAT`.

| Property | Value |
|----------|-------|
| AI system | New (`useNewAi()` returns `true`) |
| Synched data | `DATA_ID_FLAGS` (16) with `FLAG_RESTING` (bit 0) |
| Target position | `Pos *targetPosition` for flight navigation |

Key behaviors:

- `isResting()` / `setResting()` control the roosting state
- Roosts on ceilings when resting, navigates to random `targetPosition` when flying
- Not pushable (`isPushable()` returns `false`)
- No fall damage (`causeFallDamage()` does nothing, `checkFallDamage()` is overridden)
- Ignores tile triggers like pressure plates and tripwires (`isIgnoringTileTriggers()` returns `true`)
- `newServerAiStep()` handles the bat's AI (protected)
- `makeStepSound()` returns `false` (protected)
- `getSoundVolume()` returns a quiet volume (protected)
- Custom ambient, hurt, and death sounds
- `canSpawn()` validates spawn conditions

NBT save/load via `addAdditonalSaveData()` / `readAdditionalSaveData()`.

## LeashFenceKnotEntity

**Files**: `Minecraft.World/LeashFenceKnotEntity.h`, `.cpp`; `Minecraft.Client/LeashKnotRenderer.h`, `.cpp`; `Minecraft.Client/LeashKnotModel.h`, `.cpp`

Extends `HangingEntity`. The invisible-until-rendered knot entity placed on fence posts when mobs are leashed. Entity type: `eTYPE_LEASHFENCEKNOT`.

Two constructors: `LeashFenceKnotEntity(Level*)` for default creation and `LeashFenceKnotEntity(Level*, int x, int y, int z)` for positioned creation. Has a private `_init()` method.

Key static methods:

- `createAndAddKnot(Level*, int x, int y, int z)` creates a new knot entity at the given fence coordinates and adds it to the world
- `findKnotAt(Level*, int x, int y, int z)` searches for an existing knot at a position

Both return `shared_ptr<LeashFenceKnotEntity>`.

Instance methods:

- `setDir(int)` sets the facing direction
- `getWidth()` / `getHeight()` return the entity dimensions
- `shouldRenderAtSqrDistance(double)` controls render distance
- `dropItem(shared_ptr<Entity>)` drops the lead item when broken
- `interact(shared_ptr<Player>)` handles player right-click
- `survives()` checks if the fence post still exists
- Full save/load support including `save()`, `addAdditonalSaveData()`, `readAdditionalSaveData()`

`LeashKnotRenderer` uses `LeashKnotModel` for the small knot mesh and renders the leash rope to connected mobs.

## FireworksRocketEntity

**Files**: `Minecraft.World/FireworksRocketEntity.h`, `.cpp`

Extends `Entity` directly (not a `Mob` or `Projectile`). Entity type: `eTYPE_FIREWORKS_ROCKET`.

| Property | Value |
|----------|-------|
| Synched data | `DATA_ID_FIREWORKS_ITEM` (data ID 8) |
| Size | 0.25 x 0.25 blocks |
| Attackable | No |

Tracks `life` (current tick) and `lifetime` (detonation time). On the client side, `handleEntityEvent()` triggers the particle explosion. Has custom brightness (`getBrightness`, `getLightColor`) for the glow effect.

Client-side particle effects are handled separately in `Minecraft.Client/FireworksParticles.h/cpp`. See the [Fireworks](/slop-docs/mc/fireworks/) page for full details.

## Entity render registration

All entity renderers are registered in `Minecraft.Client/EntityRenderDispatcher.cpp`, which maps entity type enums to their renderer instances. This is the central dispatch point for rendering all entity types.

## Differences from LCEMP

LCEMP does not have any of these entity types. The `EntityHorse`, `Ocelot` (new AI version), `Witch`, `WitherBoss`, `WitherSkull`, `Bat`, `LeashFenceKnotEntity`, and `FireworksRocketEntity` classes are all exclusive to MinecraftConsoles. LCEMP does have the legacy `Ozelot` but not the newer `Ocelot` implementation.

The minecart variants (`MinecartChest`, `MinecartHopper`, `MinecartFurnace`, `MinecartTNT`, `MinecartSpawner`) are also MinecraftConsoles-only and are covered on the [Minecart Variants](/slop-docs/mc/minecarts/) page.

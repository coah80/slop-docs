---
title: "Behavior System"
description: "The behavior registry and dispenser behaviors in MinecraftConsoles."
---

MinecraftConsoles has a **behavior system** built around dispenser item behaviors. It's based on a class hierarchy rooted in `Behavior`, with a registry that maps `Item*` pointers to their matching `DispenseItemBehavior` implementations.

## Class hierarchy

```
Behavior
  +-- DispenseItemBehavior          (abstract: dispense())
        +-- NoOpDispenseItemBehavior (static NOOP singleton)
        +-- DefaultDispenseItemBehavior
              +-- AbstractProjectileDispenseBehavior
              |     +-- ArrowDispenseBehavior
              |     +-- EggDispenseBehavior
              |     +-- SnowballDispenseBehavior
              |     +-- ExpBottleDispenseBehavior
              |     +-- ThrownPotionDispenseBehavior
              +-- SpawnEggDispenseBehavior
              +-- FireworksDispenseBehavior
              +-- FireballDispenseBehavior
              +-- BoatDispenseBehavior
              +-- FilledBucketDispenseBehavior
              +-- EmptyBucketDispenseBehavior
              +-- FlintAndSteelDispenseBehavior
              +-- DyeDispenseBehavior
              +-- TntDispenseBehavior
              +-- PotionDispenseBehavior
```

**Key source files** (all under `Minecraft.World/`):

| File | Purpose |
|------|---------|
| `Behavior.h` | Empty base class |
| `DispenseItemBehavior.h/cpp` | Abstract interface with `dispense()` and a static `NOOP` instance |
| `DefaultDispenseItemBehavior.h/cpp` | Default: spawns item as a pickup entity on the ground |
| `AbstractProjectileDispenseBehavior.h/cpp` | Fires a projectile via the abstract `getProjectile()` method |
| `ItemDispenseBehaviors.h/cpp` | All concrete behavior subclasses |
| `BehaviorRegistry.h/cpp` | `unordered_map<Item*, DispenseItemBehavior*>` with a default fallback |

## Behavior (base class)

`Behavior` is an empty class with no methods or fields. It exists purely as the root of the hierarchy.

## DispenseItemBehavior

The abstract interface for all dispense behaviors. Defines a single pure virtual method:

```cpp
virtual shared_ptr<ItemInstance> dispense(BlockSource *source, shared_ptr<ItemInstance> item) = 0;
```

It also holds a static `NOOP` instance (`NoOpDispenseItemBehavior`) that does nothing and returns the item unchanged.

## BehaviorRegistry

`BehaviorRegistry` is a simple map from `Item*` to `DispenseItemBehavior*` with a configurable default.

```cpp
class BehaviorRegistry
{
    unordered_map<Item*, DispenseItemBehavior*> storage;
    DispenseItemBehavior *defaultBehavior;

public:
    BehaviorRegistry(DispenseItemBehavior *defaultValue);
    DispenseItemBehavior *get(Item *key);   // returns default if key not found
    void add(Item *key, DispenseItemBehavior *value);
};
```

The registry owns all registered behaviors and deletes them (along with the default) in its destructor. `DispenserTile` holds a static `REGISTRY` instance that the rest of the codebase queries.

When `get()` is called with an item that isn't registered, the default behavior is returned. This means any item not in the registry will just get dropped on the ground.

## Outcome system

`DefaultDispenseItemBehavior` defines a three-state outcome enum that drives sound and particle feedback:

| Outcome | Value | Meaning |
|---------|-------|---------|
| `ACTIVATED_ITEM` | 0 | Special behavior ran successfully |
| `DISPENCED_ITEM` | 1 | Item dropped onto the ground as a pickup |
| `LEFT_ITEM` | 2 | Execution failed; item unchanged |

The `dispense()` method calls `execute()`, then plays a sound and particle animation based on the outcome. Subclasses override `execute()` to do their specific thing and set the outcome accordingly.

When the outcome is `LEFT_ITEM`, a failure click sound (`SOUND_CLICK_FAIL`) plays instead of the normal click.

:::note
The enum name `DISPENCED_ITEM` (misspelled) matches the source code exactly.
:::

## DefaultDispenseItemBehavior

The default behavior drops the dispensed item as a pickup entity in the world. It:

1. Gets the dispense position from the `BlockSource`.
2. Gets the facing direction.
3. Creates an `ItemEntity` at the dispense position with a small velocity in the facing direction.
4. Decrements the source item stack.
5. Sets outcome to `DISPENCED_ITEM`.

## Projectile dispensing

`AbstractProjectileDispenseBehavior` extends `DefaultDispenseItemBehavior` to fire projectiles:

1. Checks `Level::MAX_DISPENSABLE_PROJECTILES`. If the limit is reached, falls back to `DefaultDispenseItemBehavior::execute()` (drops the item).
2. Gets the dispense position from `DispenserTile::getDispensePosition()`.
3. Calls the pure-virtual `getProjectile()` to create the specific projectile type.
4. Calls `projectile->shoot()` with the facing direction, adding a small Y offset (`+0.1`).
5. Adds the projectile to the world and decrements the dispensed stack.
6. Sets outcome to `ACTIVATED_ITEM`.

Default values:

- **Uncertainty**: `6.0f`
- **Power**: `1.1f`
- **Sound**: `SOUND_LAUNCH` (instead of the default click)

### Projectile subclasses

| Class | Projectile created | Notes |
|-------|-------------------|-------|
| `ArrowDispenseBehavior` | `Arrow` | Standard arrow entity |
| `EggDispenseBehavior` | `ThrownEgg` | Standard egg entity |
| `SnowballDispenseBehavior` | `Snowball` | Standard snowball entity |
| `ExpBottleDispenseBehavior` | `ThrownExpBottle` | Halved uncertainty (*0.5), increased power (*1.25) |
| `ThrownPotionDispenseBehavior` | `ThrownPotion` | Halved uncertainty (*0.5), increased power (*1.25) |

Each subclass overrides `getProjectile()` to return the right entity type.

## DispenserBootstrap

Registration happens in `DispenserBootstrap::bootStrap()` (in `Minecraft.Client/DispenserBootstrap.h`), called during server initialization from `MinecraftServer.cpp`. It registers all 15 behaviors:

| Item | Behavior class |
|------|---------------|
| `Item::arrow` | `ArrowDispenseBehavior` |
| `Item::egg` | `EggDispenseBehavior` |
| `Item::snowBall` | `SnowballDispenseBehavior` |
| `Item::expBottle` | `ExpBottleDispenseBehavior` |
| `Item::potion` | `PotionDispenseBehavior` |
| `Item::spawnEgg` | `SpawnEggDispenseBehavior` |
| `Item::fireworks` | `FireworksDispenseBehavior` |
| `Item::fireball` | `FireballDispenseBehavior` |
| `Item::boat` | `BoatDispenseBehavior` |
| `Item::bucket_lava` | `FilledBucketDispenseBehavior` |
| `Item::bucket_water` | `FilledBucketDispenseBehavior` |
| `Item::bucket_empty` | `EmptyBucketDispenseBehavior` |
| `Item::flintAndSteel` | `FlintAndSteelDispenseBehavior` |
| `Item::dye_powder` | `DyeDispenseBehavior` |
| `Item::items[Tile::tnt_Id]` | `TntDispenseBehavior` |

## Notable behavior details

### PotionDispenseBehavior

Hands off to `ThrownPotionDispenseBehavior` if `PotionItem::isThrowable()` returns true for the aux value. Otherwise falls back to `DefaultDispenseItemBehavior` (drops a non-splash potion on the ground).

### SpawnEggDispenseBehavior

Spawns the entity via `SpawnEggItem::spawnMobAt()`. If the spawn limit is reached (`entity == nullptr`), sets the outcome to `LEFT_ITEM`. Transfers the custom hover name to the mob if one is set on the dispensed stack.

### FireworksDispenseBehavior

Checks `Level::MAX_DISPENSABLE_PROJECTILES` before spawning a `FireworksRocketEntity`. If the limit is hit, sets `LEFT_ITEM`.

### FireballDispenseBehavior

Checks `Level::MAX_DISPENSABLE_FIREBALLS`. Creates a `SmallFireball` with a random Gaussian spread on the direction vector. Plays `SOUND_BLAZE_FIREBALL` on success.

### BoatDispenseBehavior

Checks `Level::MAX_XBOX_BOATS`. Spawns a `Boat` only if water is in front of the dispenser (or air with water below). If neither condition is met or the boat limit is reached, falls back to `defaultDispenseItemBehavior->dispense()` (drops the item).

### FlintAndSteelDispenseBehavior

Ignites air blocks in front of the dispenser or activates TNT blocks. Damages the flint-and-steel item on use. If the target block is neither air nor TNT, sets `LEFT_ITEM`.

### DyeDispenseBehavior

When the dye aux value is `DyePowderItem::WHITE` (bone meal), applies `growCrop()` to the block in front. Non-white dyes fall through to `DefaultDispenseItemBehavior`.

### TntDispenseBehavior

Checks `Level::newPrimedTntAllowed()` and the game host TNT option before spawning `PrimedTnt`. If either check fails, the TNT is not placed.

### FilledBucketDispenseBehavior

Places water or lava source blocks in front of the dispenser. The empty bucket replaces the filled one in the dispenser slot.

### EmptyBucketDispenseBehavior

Picks up water or lava source blocks in front of the dispenser. The filled bucket replaces the empty one in the dispenser slot.

## 4J-specific notes

Comments tagged `4J-JEV` throughout the code mark console-edition-specific changes:

- The `eOUTCOME` parameter was added to `execute()` to support failure sound effects when spawn limits are hit.
- Spawn limits (`MAX_DISPENSABLE_PROJECTILES`, `MAX_DISPENSABLE_FIREBALLS`, `MAX_XBOX_BOATS`) are console-specific caps that don't exist in Java Edition. These prevent performance issues on consoles.
- The `BlockSource` abstraction wraps the level and position data for the dispenser.

## Differences from LCEMP

LCEMP does not have the behavior registry, `DispenseItemBehavior`, `BehaviorRegistry`, `DispenserBootstrap`, or any of the concrete dispense behaviors. However, LCEMP does have `DispenserTile` and `DispenserTileEntity` with a simpler hardcoded dispense method. The registry-based behavior system is MC-only, but the basic dispenser tile exists in both codebases.

## Related pages

- [Hoppers and Droppers](/slop-docs/mc/hoppers-droppers/) for the dropper's use of `DefaultDispenseItemBehavior`
- [Fireworks](/slop-docs/mc/fireworks/) for the `FireworksDispenseBehavior` and rocket entity

---
title: Entity Type Registry
description: Complete table of all entity type IDs in LCE.
---

Entity types are registered in `EntityIO::staticCtor()` in
[`Minecraft.World/EntityIO.cpp`](/slop-docs/reference/file-index/). Each call to
`EntityIO::setId()` maps a factory function, an internal enum value (`eINSTANCEOF`),
a string identifier, and a numeric ID.

Entities that can be spawned in Creative mode through the Spawn Egg also
include egg colors and a name string ID.

## Entity ID Table (LCEMP)

| ID | String ID | Enum | Class | Category |
|----|----------|------|-------|----------|
| 1 | `Item` | `eTYPE_ITEMENTITY` | `ItemEntity` | Item |
| 2 | `XPOrb` | `eTYPE_EXPERIENCEORB` | `ExperienceOrb` | Item |
| 9 | `Painting` | `eTYPE_PAINTING` | `Painting` | Hanging |
| 10 | `Arrow` | `eTYPE_ARROW` | `Arrow` | Projectile |
| 11 | `Snowball` | `eTYPE_SNOWBALL` | `Snowball` | Projectile |
| 12 | `Fireball` | `eTYPE_FIREBALL` | `Fireball` | Projectile |
| 13 | `SmallFireball` | `eTYPE_SMALL_FIREBALL` | `SmallFireball` | Projectile |
| 14 | `ThrownEnderpearl` | `eTYPE_THROWNENDERPEARL` | `ThrownEnderpearl` | Projectile |
| 15 | `EyeOfEnderSignal` | `eTYPE_EYEOFENDERSIGNAL` | `EyeOfEnderSignal` | Projectile |
| 16 | `ThrownPotion` | `eTYPE_THROWNPOTION` | `ThrownPotion` | Projectile |
| 17 | `ThrownExpBottle` | `eTYPE_THROWNEXPBOTTLE` | `ThrownExpBottle` | Projectile |
| 18 | `ItemFrame` | `eTYPE_ITEM_FRAME` | `ItemFrame` | Hanging |
| 20 | `PrimedTnt` | `eTYPE_PRIMEDTNT` | `PrimedTnt` | Block |
| 21 | `FallingSand` | `eTYPE_FALLINGTILE` | `FallingTile` | Block |
| 40 | `Minecart` | `eTYPE_MINECART` | `Minecart` | Vehicle |
| 41 | `Boat` | `eTYPE_BOAT` | `Boat` | Vehicle |
| 48 | `Mob` | `eTYPE_MOB` | `Mob` | Mob (base) |
| 49 | `Monster` | `eTYPE_MONSTER` | `Monster` | Mob (base) |
| 50 | `Creeper` | `eTYPE_CREEPER` | `Creeper` | Hostile Mob |
| 51 | `Skeleton` | `eTYPE_SKELETON` | `Skeleton` | Hostile Mob |
| 52 | `Spider` | `eTYPE_SPIDER` | `Spider` | Hostile Mob |
| 53 | `Giant` | `eTYPE_GIANT` | `Giant` | Hostile Mob |
| 54 | `Zombie` | `eTYPE_ZOMBIE` | `Zombie` | Hostile Mob |
| 55 | `Slime` | `eTYPE_SLIME` | `Slime` | Hostile Mob |
| 56 | `Ghast` | `eTYPE_GHAST` | `Ghast` | Hostile Mob |
| 57 | `PigZombie` | `eTYPE_PIGZOMBIE` | `PigZombie` | Hostile Mob |
| 58 | `Enderman` | `eTYPE_ENDERMAN` | `EnderMan` | Hostile Mob |
| 59 | `CaveSpider` | `eTYPE_CAVESPIDER` | `CaveSpider` | Hostile Mob |
| 60 | `Silverfish` | `eTYPE_SILVERFISH` | `Silverfish` | Hostile Mob |
| 61 | `Blaze` | `eTYPE_BLAZE` | `Blaze` | Hostile Mob |
| 62 | `LavaSlime` | `eTYPE_LAVASLIME` | `LavaSlime` | Hostile Mob |
| 63 | `EnderDragon` | `eTYPE_ENDERDRAGON` | `EnderDragon` | Boss |
| 90 | `Pig` | `eTYPE_PIG` | `Pig` | Passive Mob |
| 91 | `Sheep` | `eTYPE_SHEEP` | `Sheep` | Passive Mob |
| 92 | `Cow` | `eTYPE_COW` | `Cow` | Passive Mob |
| 93 | `Chicken` | `eTYPE_CHICKEN` | `Chicken` | Passive Mob |
| 94 | `Squid` | `eTYPE_SQUID` | `Squid` | Passive Mob |
| 95 | `Wolf` | `eTYPE_WOLF` | `Wolf` | Passive Mob |
| 96 | `MushroomCow` | `eTYPE_MUSHROOMCOW` | `MushroomCow` | Passive Mob |
| 97 | `SnowMan` | `eTYPE_SNOWMAN` | `SnowMan` | Utility Mob |
| 98 | `Ozelot` | `eTYPE_OZELOT` | `Ozelot` | Passive Mob |
| 99 | `VillagerGolem` | `eTYPE_VILLAGERGOLEM` | `VillagerGolem` | Utility Mob |
| 120 | `Villager` | `eTYPE_VILLAGER` | `Villager` | Passive Mob |
| 200 | `EnderCrystal` | `eTYPE_ENDER_CRYSTAL` | `EnderCrystal` | Block |
| 1000 | `DragonFireball` | `eTYPE_DRAGON_FIREBALL` | `DragonFireball` | Projectile |

:::note
In the LCEMP source, IDs 3-8, 19, 22-39, 42-47, 64-89, 100-119, 121-199, 201-999 are unassigned.
The base types `Mob` (48) and `Monster` (49) are registered but act as generic
fallbacks; specific mob types override them.
:::

## Additional Entities (MinecraftConsoles)

The MinecraftConsoles repo adds these entities not present in the LCEMP source:

| ID | String ID | Enum | Class | Category |
|----|----------|------|-------|----------|
| 8 | `LeashKnot` | `eTYPE_LEASHFENCEKNOT` | `LeashFenceKnotEntity` | Misc |
| 12 | `Fireball` | `eTYPE_FIREBALL` | `LargeFireball` | Projectile |
| 19 | `WitherSkull` | `eTYPE_WITHER_SKULL` | `WitherSkull` | Projectile |
| 22 | `FireworksRocketEntity` | `eTYPE_FIREWORKS_ROCKET` | `FireworksRocketEntity` | Misc |
| 42 | `MinecartRideable` | `eTYPE_MINECART_RIDEABLE` | `MinecartRideable` | Vehicle |
| 43 | `MinecartChest` | `eTYPE_MINECART_CHEST` | `MinecartChest` | Vehicle |
| 44 | `MinecartFurnace` | `eTYPE_MINECART_FURNACE` | `MinecartFurnace` | Vehicle |
| 45 | `MinecartTNT` | `eTYPE_MINECART_TNT` | `MinecartTNT` | Vehicle |
| 46 | `MinecartHopper` | `eTYPE_MINECART_HOPPER` | `MinecartHopper` | Vehicle |
| 47 | `MinecartSpawner` | `eTYPE_MINECART_SPAWNER` | `MinecartSpawner` | Vehicle |
| 64 | `WitherBoss` | `eTYPE_WITHERBOSS` | `WitherBoss` | Boss |
| 65 | `Bat` | `eTYPE_BAT` | `Bat` | Passive Mob |
| 66 | `Witch` | `eTYPE_WITCH` | `Witch` | Hostile Mob |
| 100 | `EntityHorse` | `eTYPE_HORSE` | `EntityHorse` | Passive Mob |

:::note
In MinecraftConsoles, the single `Minecart` entity (LCEMP IDs 40-41) was split into
separate classes: `MinecartRideable` (42), `MinecartChest` (43), `MinecartFurnace` (44),
`MinecartTNT` (45), `MinecartHopper` (46), and `MinecartSpawner` (47). Boat moved from
ID 41 to stay at 41. The old Minecart ID 40 was removed.

The `Fireball` class was renamed to `LargeFireball` to differentiate from `SmallFireball`.
The `Ozelot` class was renamed to `Ocelot` but keeps the string ID `"Ozelot"`.

Horse variants (donkey, mule, skeleton horse, zombie horse) are registered as the same
`EntityHorse` class at ID 100 but with different sub-type bits shifted into the upper
12 bits of the ID. In non-content-package builds, extra ocelot cat types and a spider
jockey variant are also registered.
:::

## Spawnable Entities (Spawn Eggs)

These entities can be spawned with the Spawn Egg item (ID 383) using the
entity ID as the data value. They're the entities registered with the
`SpawnableMobInfo` overload of `setId()`:

### LCEMP Spawn Eggs

| Entity ID | Name |
|-----------|------|
| 50 | Creeper |
| 51 | Skeleton |
| 52 | Spider |
| 54 | Zombie |
| 55 | Slime |
| 56 | Ghast |
| 57 | PigZombie |
| 58 | Enderman |
| 59 | CaveSpider |
| 60 | Silverfish |
| 61 | Blaze |
| 62 | LavaSlime |
| 90 | Pig |
| 91 | Sheep |
| 92 | Cow |
| 93 | Chicken |
| 94 | Squid |
| 95 | Wolf |
| 96 | MushroomCow |
| 98 | Ozelot |
| 120 | Villager |

### MinecraftConsoles Additional Spawn Eggs

| Entity ID | Name |
|-----------|------|
| 63 | EnderDragon *(has egg colors in MinecraftConsoles but not LCEMP)* |
| 65 | Bat |
| 66 | Witch |
| 100 | EntityHorse (Horse) |
| 100 + sub | Donkey, Mule *(sub-type encoded in upper bits)* |

:::note
Giant (53), SnowMan (97), VillagerGolem (99), and WitherBoss (64) are registered
entities but do **not** have spawn eggs in either codebase.

In non-content-package builds, extra spawn eggs exist for skeleton horse, zombie horse,
individual ocelot cat types, and a spider jockey.
:::

## ID Ranges

The entity ID space follows Minecraft's standard conventions:

| Range | Category |
|-------|---------|
| 1-2 | Dropped items and XP orbs |
| 8 | Leash knot (MinecraftConsoles only) |
| 9-19 | Paintings, projectiles, item frames, wither skulls |
| 20-22 | Physics blocks (TNT, falling sand), fireworks rockets |
| 41-47 | Vehicles (boat, minecart variants) |
| 48-66 | Hostile mobs, bosses (and base mob types) |
| 90-100 | Passive and utility mobs, horses |
| 120 | Villager |
| 200 | Ender Crystal |
| 1000 | Dragon Fireball |

## Source Reference

- LCEMP entity registration in: `Minecraft.World/EntityIO.cpp`, `EntityIO::staticCtor()` (line 42)
- MinecraftConsoles entity registration in: `Minecraft.World/EntityIO.cpp`, `EntityIO::staticCtor()` (line 44)
- Entity enum declarations: `eINSTANCEOF` enum (referenced throughout entity headers)

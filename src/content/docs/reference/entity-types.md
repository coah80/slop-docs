---
title: Entity Type Registry
description: The eINSTANCEOF type bitmask enum plus the EntityIO numeric-ID and string-name maps for every entity in neoLegacy.
---

Complete registry of entity types in neoLegacy. There are two parallel systems:

1. **`enum eINSTANCEOF`** (`Class.h:106-337`) — a compile-time bitmask type used as
   a lightweight `instanceof` replacement. Every entity, tile entity, and particle
   has one.
2. **`EntityIO`** (`EntityIO.cpp:47-144`) — the runtime registry that maps a
   numeric save/network ID and a string save name to each spawnable entity class.

This page tabulates both, extracted verbatim from those line ranges.

## Derivation bitmask semantics

`eINSTANCEOF` is not a plain enum — each value packs a class-hierarchy path into a
32-bit field so that `instanceof` becomes a bitmask test rather than a dynamic cast
(comment at `Class.h:104`). The bit layout is documented at `Class.h:11-51`:

```
0b FFFF CCCC CCCC CCCC CCCC CCCC CCEE EEEE
   ^^^^ class-hierarchy bits ------  ^^^^^^ discriminator (low 6 bits)
   flags (bits 28-31)
```

- **Bits 26-27** — `BIT_ENTITY` / `BIT_LIVING_ENTITY` roots.
- **Bits 9-25** — one bit per class in the hierarchy (`BIT_MOB`, `BIT_PATHFINDER_MOB`,
  `BIT_MONSTER`, `BIT_ANIMAL`, `BIT_ZOMBIE`, `BIT_SLIME`, ...). Defined `Class.h:56-93`.
- **Bits 28-31** — flags: `BIT_VALID_IN_SPAWNER` (28), `BIT_ANIMALS_SPAWN_LIMIT_CHECK`
  (29), `BIT_ENEMY` (30), `BIT_PROJECTILE` (31). (`Class.h:85-88`)
- **Low 6 bits (0-5)** — a per-leaf discriminator so sibling leaf types under the
  same parent bit stay distinct (e.g. all monsters share `BIT_MONSTER`, then get
  `| 0x1`, `| 0x2`, ...). (`Class.h:341`)

A derived type ORs its parent's value with its own bit/discriminator, so
`eTYPE_ZOMBIE = eTYPE_MONSTER | eTYPE_VALID_IN_SPAWNER_FLAG | BIT_ZOMBIE`
(`Class.h:161`), and `eTYPE_MONSTER = eTYPE_ENEMY | eTYPE_PATHFINDER_MOB | BIT_MONSTER`
(`Class.h:156`).

The two runtime tests (`Class.h:339-348`):

```cpp
inline bool eTYPE_DERIVED_FROM(eINSTANCEOF super, eINSTANCEOF sub)
{
    if ( (super & 0x3F) != 0x00 )  return super == sub;        // leaf: exact match
    else                           return (super & sub) == super; // ancestor: bitmask
}

inline bool eTYPE_FLAGSET(eINSTANCEOF flag, eINSTANCEOF claz)
{
    return (flag & claz) == flag;
}
```

If `super` has any of the low 6 discriminator bits set it is a leaf and the test is
an exact equality; otherwise `super` is an ancestor and the test is "are all of
`super`'s bits present in `sub`". `eTYPE_FLAGSET` checks a single flag bit (spawner /
enemy / projectile / spawn-limit).

There is an optional debug `SubClass` registry (`Class.h:355-399`, `_WINDOWS64` only)
that records parent chains from the `SUBCLASS(x)` macro, but it is not used at runtime
for dispatch.

## eINSTANCEOF — living-entity hierarchy

Values as written in `Class.h:106-337`. Indentation reflects the derivation chain.
"Definition" is the exact right-hand side of each enum entry.

| Type | Definition | Line |
|------|------------|-----:|
| `eTYPE_NOTSET` | `0` | 108 |
| `eTYPE_VALID_IN_SPAWNER_FLAG` | `BIT_VALID_IN_SPAWNER` (flag) | 111 |
| `eTYPE_ANIMALS_SPAWN_LIMIT_CHECK` | `BIT_ANIMALS_SPAWN_LIMIT_CHECK` (flag) | 112 |
| `eTYPE_ENEMY` | `BIT_ENEMY` (flag) | 113 |
| `eTYPE_PROJECTILE` | `BIT_PROJECTILE` (flag) | 114 |
| `eTYPE_ENTITY` | `BIT_ENTITY` | 116 |
| `eTYPE_LIVINGENTITY` | `eTYPE_ENTITY \| BIT_LIVING_ENTITY` | 118 |
| `eTYPE_MOB` | `eTYPE_LIVINGENTITY \| BIT_MOB` | 120 |
| `eTYPE_PATHFINDER_MOB` | `eTYPE_MOB \| BIT_PATHFINDER_MOB` | 122 |
| `eTYPE_AGABLE_MOB` | `eTYPE_PATHFINDER_MOB \| BIT_AGABLE_MOB` | 124 |
| `eTYPE_VILLAGER` | `eTYPE_AGABLE_MOB \| 0x1` | 126 |
| `eTYPE_ANIMAL` | `eTYPE_AGABLE_MOB \| BIT_ANIMAL` | 129 |
| `eTYPE_TAMABLE_ANIMAL` | `eTYPE_ANIMAL \| BIT_TAMABLE` | 131 |
| `eTYPE_OCELOT` | `eTYPE_TAMABLE_ANIMAL \| eTYPE_ANIMALS_SPAWN_LIMIT_CHECK \| 0x1` | 133 |
| `eTYPE_WOLF` | `eTYPE_TAMABLE_ANIMAL \| 0x2` | 134 |
| `eTYPE_HORSE` | `eTYPE_ANIMAL \| eTYPE_ANIMALS_SPAWN_LIMIT_CHECK \| 0x1` | 136 |
| `eTYPE_SHEEP` | `eTYPE_ANIMAL \| eTYPE_ANIMALS_SPAWN_LIMIT_CHECK \| 0x2` | 137 |
| `eTYPE_PIG` | `eTYPE_ANIMAL \| eTYPE_ANIMALS_SPAWN_LIMIT_CHECK \| 0x3` | 138 |
| `eTYPE_CHICKEN` | `eTYPE_ANIMAL \| 0x4` | 139 |
| `eTYPE_RABBIT` | `eTYPE_ANIMAL \| eTYPE_ANIMALS_SPAWN_LIMIT_CHECK \| 0x5` | 140 |
| `eTYPE_COW` | `eTYPE_ANIMAL \| eTYPE_ANIMALS_SPAWN_LIMIT_CHECK \| BIT_COW` | 142 |
| `eTYPE_MUSHROOMCOW` | `eTYPE_COW \| 0x1` | 143 |
| `eTYPE_WATERANIMAL` | `eTYPE_PATHFINDER_MOB \| BIT_WATER_MOB` | 146 |
| `eTYPE_SQUID` | `eTYPE_WATERANIMAL \| 0x1` | 147 |
| `eTYPE_GOLEM` | `eTYPE_PATHFINDER_MOB \| BIT_GOLEM` | 149 |
| `eTYPE_SNOWMAN` | `eTYPE_GOLEM \| eTYPE_ANIMALS_SPAWN_LIMIT_CHECK \| 0x1` | 151 |
| `eTYPE_VILLAGERGOLEM` | `eTYPE_GOLEM \| 0x2` | 152 |
| `eTYPE_MONSTER` | `eTYPE_ENEMY \| eTYPE_PATHFINDER_MOB \| BIT_MONSTER` | 156 |
| `eTYPE_SPIDER` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| BIT_SPIDER` | 158 |
| `eTYPE_CAVESPIDER` | `eTYPE_SPIDER \| 0x1` | 159 |
| `eTYPE_ZOMBIE` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| BIT_ZOMBIE` | 161 |
| `eTYPE_PIGZOMBIE` | `eTYPE_ZOMBIE \| 0x1` | 162 |
| `eTYPE_CREEPER` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x1` | 164 |
| `eTYPE_GIANT` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x2` | 165 |
| `eTYPE_SKELETON` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x3` | 166 |
| `eTYPE_ENDERMAN` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x4` | 167 |
| `eTYPE_SILVERFISH` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x5` | 168 |
| `eTYPE_BLAZE` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x6` | 169 |
| `eTYPE_WITCH` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x7` | 170 |
| `eTYPE_WITHERBOSS` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x8` | 171 |
| `eTYPE_GUARDIAN` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x9` | 172 |
| `eTYPE_ENDERMITE` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x10` | 175 |
| `eTYPE_ELDER_GUARDIAN` | `eTYPE_MONSTER \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x11` | 176 |
| `eTYPE_AMBIENT` | `eTYPE_MOB \| BIT_AMBIENT_MOB` | 179 |
| `eTYPE_BAT` | `eTYPE_AMBIENT \| eTYPE_VALID_IN_SPAWNER_FLAG \| 0x1` | 180 |
| `eTYPE_FLYING_MOB` | `eTYPE_MOB \| BIT_FLYING_MOB` | 182 |
| `eTYPE_GHAST` | `eTYPE_FLYING_MOB \| eTYPE_VALID_IN_SPAWNER_FLAG \| eTYPE_ENEMY \| 0x1` | 183 |
| `eTYPE_SLIME` | `eTYPE_MOB \| eTYPE_VALID_IN_SPAWNER_FLAG \| eTYPE_ENEMY \| BIT_SLIME` | 185 |
| `eTYPE_LAVASLIME` | `eTYPE_SLIME \| 0x1` | 186 |
| `eTYPE_ENDERDRAGON` | `eTYPE_MOB \| 0x5` | 188 |
| `eTYPE_PLAYER` | `eTYPE_LIVINGENTITY \| BIT_PLAYER` | 190 |
| `eTYPE_SERVERPLAYER` | `eTYPE_PLAYER \| 0x1` | 191 |
| `eTYPE_REMOTEPLAYER` | `eTYPE_PLAYER \| 0x2` | 192 |
| `eTYPE_LOCALPLAYER` | `eTYPE_PLAYER \| 0x3` | 193 |
| `eTYPE_ARMORSTAND` | `eTYPE_LIVINGENTITY \| 0x10` | 195 |

## eINSTANCEOF — non-living / projectile / other entities

| Type | Definition | Line |
|------|------------|-----:|
| `eTYPE_GLOBAL_ENTITY` | `eTYPE_ENTITY \| BIT_GLOBAL_ENTITY` | 197 |
| `eTYPE_LIGHTNINGBOLT` | `eTYPE_GLOBAL_ENTITY \| 0x1` | 198 |
| `eTYPE_MINECART` | `eTYPE_ENTITY \| BIT_MINECART` | 200 |
| `eTYPE_MINECART_RIDEABLE` | `eTYPE_MINECART \| 0x1` | 202 |
| `eTYPE_MINECART_SPAWNER` | `eTYPE_MINECART \| 0x6` | 203 |
| `eTYPE_MINECART_FURNACE` | `eTYPE_MINECART \| 0x3` | 204 |
| `eTYPE_MINECART_TNT` | `eTYPE_MINECART \| 0x4` | 205 |
| `eTYPE_MINECART_CONTAINER` | `eTYPE_MINECART \| BIT_MINECART_CONTAINER` | 207 |
| `eTYPE_MINECART_CHEST` | `eTYPE_MINECART_CONTAINER \| 0x2` | 209 |
| `eTYPE_MINECART_HOPPER` | `eTYPE_MINECART_CONTAINER \| 0x5` | 210 |
| `eTYPE_FIREBALL` | `eTYPE_ENTITY \| eTYPE_PROJECTILE \| BIT_FIREBALL` | 212 |
| `eTYPE_DRAGON_FIREBALL` | `eTYPE_FIREBALL \| 0x1` | 214 |
| `eTYPE_WITHER_SKULL` | `eTYPE_FIREBALL \| 0x2` | 215 |
| `eTYPE_LARGE_FIREBALL` | `eTYPE_FIREBALL \| 0x3` | 216 |
| `eTYPE_SMALL_FIREBALL` | `eTYPE_FIREBALL \| 0x4` | 217 |
| `eTYPE_THROWABLE` | `eTYPE_ENTITY \| eTYPE_PROJECTILE \| BIT_THROWABLE` | 220 |
| `eTYPE_SNOWBALL` | `eTYPE_THROWABLE \| 0x1` | 222 |
| `eTYPE_THROWNEGG` | `eTYPE_THROWABLE \| 0x2` | 223 |
| `eTYPE_THROWNENDERPEARL` | `eTYPE_THROWABLE \| 0x3` | 224 |
| `eTYPE_THROWNPOTION` | `eTYPE_THROWABLE \| 0x4` | 225 |
| `eTYPE_THROWNEXPBOTTLE` | `eTYPE_THROWABLE \| 0x5` | 226 |
| `eTYPE_HANGING_ENTITY` | `eTYPE_ENTITY \| BIT_HANGING_ENTITY` | 229 |
| `eTYPE_PAINTING` | `eTYPE_HANGING_ENTITY \| 0x1` | 231 |
| `eTYPE_ITEM_FRAME` | `eTYPE_HANGING_ENTITY \| 0x2` | 232 |
| `eTYPE_LEASHFENCEKNOT` | `eTYPE_HANGING_ENTITY \| 0x3` | 233 |
| `eTYPE_OTHER_ENTITIES` | `eTYPE_ENTITY + 1` | 238 |
| `eTYPE_EXPERIENCEORB` | `eTYPE_OTHER_ENTITIES + 2` | 240 |
| `eTYPE_EYEOFENDERSIGNAL` | `(eTYPE_OTHER_ENTITIES + 3) \| eTYPE_PROJECTILE` | 241 |
| `eTYPE_FIREWORKS_ROCKET` | `(eTYPE_OTHER_ENTITIES + 4) \| eTYPE_PROJECTILE` | 242 |
| `eTYPE_FISHINGHOOK` | `(eTYPE_OTHER_ENTITIES + 5) \| eTYPE_PROJECTILE` | 243 |
| `eTYPE_DELAYEDRELEASE` | `eTYPE_OTHER_ENTITIES + 6` | 244 |
| `eTYPE_BOAT` | `eTYPE_OTHER_ENTITIES + 7` | 245 |
| `eTYPE_FALLINGTILE` | `eTYPE_OTHER_ENTITIES + 8` | 246 |
| `eTYPE_ITEMENTITY` | `eTYPE_OTHER_ENTITIES + 9` | 247 |
| `eTYPE_PRIMEDTNT` | `eTYPE_OTHER_ENTITIES + 10` | 248 |
| `eTYPE_ARROW` | `(eTYPE_OTHER_ENTITIES + 11) \| eTYPE_PROJECTILE` | 249 |
| `eTYPE_MULTIENTITY_MOB_PART` | `eTYPE_OTHER_ENTITIES + 12` | 250 |
| `eTYPE_NETHER_SPHERE` | `eTYPE_OTHER_ENTITIES + 13` | 251 |
| `eTYPE_ENDER_CRYSTAL` | `eTYPE_OTHER_ENTITIES + 14` | 252 |

The enum continues with ~30 particle types (`eType_BREAKINGITEMPARTICLE` ...
`eType_WAKEPARTICLE`, `Class.h:257-298`) and the tile-entity block
(`eTYPE_TILEENTITY` ..., `Class.h:302-323`) — the tile-entity subset is documented on
the [Tile Entities](/slop-docs/world/tile-entities/) page. A terminal
`eTYPE_OTHERS = BIT_OTHER_NOT_ENTITIES` group (`Class.h:329-336`) exists purely to
keep later enum values from accidentally matching an entity bitmask.

## EntityIO — numeric ID and save-name map

Registered in `EntityIO::staticCtor()` via
`setId(createFn, eINSTANCEOF, L"saveName", idNum[, eggColour1, eggColour2, nameId])`
(`EntityIO.cpp:28`/`:38`). The numeric ID is the save/network entity ID; the string
is the NBT save name (`"id"` tag). Extracted from `EntityIO.cpp:47-144`.

| Num ID | Save name | eINSTANCEOF | Create fn | Egg colours (creative) | Line |
|-------:|-----------|-------------|-----------|:---:|-----:|
| 1 | `Item` | `eTYPE_ITEMENTITY` | `ItemEntity::create` | — | 47 |
| 2 | `XPOrb` | `eTYPE_EXPERIENCEORB` | `ExperienceOrb::create` | — | 48 |
| 4 | `ElderGuardian` | `eTYPE_ELDER_GUARDIAN` | `Guardian::create` | ✔ (`IDS_ELDER_GUARDIAN`) | 49 |
| 8 | `LeashKnot` | `eTYPE_LEASHFENCEKNOT` | `LeashFenceKnotEntity::create` | — | 50 |
| 9 | `Painting` | `eTYPE_PAINTING` | `Painting::create` | — | 51 |
| 10 | `Arrow` | `eTYPE_ARROW` | `Arrow::create` | — | 52 |
| 11 | `Snowball` | `eTYPE_SNOWBALL` | `Snowball::create` | — | 53 |
| 12 | `Fireball` | `eTYPE_FIREBALL` | `LargeFireball::create` | — | 54 |
| 13 | `SmallFireball` | `eTYPE_SMALL_FIREBALL` | `SmallFireball::create` | — | 55 |
| 14 | `ThrownEnderpearl` | `eTYPE_THROWNENDERPEARL` | `ThrownEnderpearl::create` | — | 56 |
| 15 | `EyeOfEnderSignal` | `eTYPE_EYEOFENDERSIGNAL` | `EyeOfEnderSignal::create` | — | 57 |
| 16 | `ThrownPotion` | `eTYPE_THROWNPOTION` | `ThrownPotion::create` | — | 58 |
| 17 | `ThrownExpBottle` | `eTYPE_THROWNEXPBOTTLE` | `ThrownExpBottle::create` | — | 59 |
| 18 | `ItemFrame` | `eTYPE_ITEM_FRAME` | `ItemFrame::create` | — | 60 |
| 19 | `WitherSkull` | `eTYPE_WITHER_SKULL` | `WitherSkull::create` | — | 61 |
| 20 | `PrimedTnt` | `eTYPE_PRIMEDTNT` | `PrimedTnt::create` | — | 63 |
| 21 | `FallingSand` | `eTYPE_FALLINGTILE` | `FallingTile::create` | — | 64 |
| 22 | `FireworksRocketEntity` | `eTYPE_FIREWORKS_ROCKET` | `FireworksRocketEntity::create` | — | 66 |
| 41 | `Boat` | `eTYPE_BOAT` | `Boat::create` | — | 68 |
| 42 | `MinecartRideable` | `eTYPE_MINECART_RIDEABLE` | `MinecartRideable::create` | — | 69 |
| 43 | `MinecartChest` | `eTYPE_MINECART_CHEST` | `MinecartChest::create` | — | 70 |
| 44 | `MinecartFurnace` | `eTYPE_MINECART_FURNACE` | `MinecartFurnace::create` | — | 71 |
| 45 | `MinecartTNT` | `eTYPE_MINECART_TNT` | `MinecartTNT::create` | — | 72 |
| 46 | `MinecartHopper` | `eTYPE_MINECART_HOPPER` | `MinecartHopper::create` | — | 73 |
| 47 | `MinecartSpawner` | `eTYPE_MINECART_SPAWNER` | `MinecartSpawner::create` | — | 74 |
| 48 | `Mob` | `eTYPE_MOB` | `Mob::create` | — | 78 |
| 49 | `Monster` | `eTYPE_MONSTER` | `Monster::create` | — | 79 |
| 50 | `Creeper` | `eTYPE_CREEPER` | `Creeper::create` | ✔ (`IDS_CREEPER`) | 81 |
| 51 | `Skeleton` | `eTYPE_SKELETON` | `Skeleton::create` | ✔ (`IDS_SKELETON`) | 82 |
| 52 | `Spider` | `eTYPE_SPIDER` | `Spider::create` | ✔ (`IDS_SPIDER`) | 83 |
| 53 | `Giant` | `eTYPE_GIANT` | `Giant::create` | — | 84 |
| 54 | `Zombie` | `eTYPE_ZOMBIE` | `Zombie::create` | ✔ (`IDS_ZOMBIE`) | 85 |
| 55 | `Slime` | `eTYPE_SLIME` | `Slime::create` | ✔ (`IDS_SLIME`) | 86 |
| 56 | `Ghast` | `eTYPE_GHAST` | `Ghast::create` | ✔ (`IDS_GHAST`) | 87 |
| 57 | `PigZombie` | `eTYPE_PIGZOMBIE` | `PigZombie::create` | ✔ (`IDS_PIGZOMBIE`) | 88 |
| 58 | `Enderman` | `eTYPE_ENDERMAN` | `EnderMan::create` | ✔ (`IDS_ENDERMAN`) | 89 |
| 59 | `CaveSpider` | `eTYPE_CAVESPIDER` | `CaveSpider::create` | ✔ (`IDS_CAVE_SPIDER`) | 90 |
| 60 | `Silverfish` | `eTYPE_SILVERFISH` | `Silverfish::create` | ✔ (`IDS_SILVERFISH`) | 91 |
| 61 | `Blaze` | `eTYPE_BLAZE` | `Blaze::create` | ✔ (`IDS_BLAZE`) | 92 |
| 62 | `LavaSlime` | `eTYPE_LAVASLIME` | `LavaSlime::create` | ✔ (`IDS_LAVA_SLIME`) | 93 |
| 63 | `EnderDragon` | `eTYPE_ENDERDRAGON` | `EnderDragon::create` | ✔ (`IDS_ENDERDRAGON`) | 94 |
| 64 | `WitherBoss` | `eTYPE_WITHERBOSS` | `WitherBoss::create` | — | 95 |
| 65 | `Bat` | `eTYPE_BAT` | `Bat::create` | ✔ (`IDS_BAT`) | 96 |
| 66 | `Witch` | `eTYPE_WITCH` | `Witch::create` | ✔ (`IDS_WITCH`) | 97 |
| 67 | `Endermite` | `eTYPE_ENDERMITE` | `Endermite::create` | ✔ (`IDS_ENDERMITE`) | 99 |
| 68 | `Guardian` | `eTYPE_GUARDIAN` | `Guardian::create` | ✔ (`IDS_GUARDIAN`) | 103 |
| 90 | `Pig` | `eTYPE_PIG` | `Pig::create` | ✔ (`IDS_PIG`) | 106 |
| 91 | `Sheep` | `eTYPE_SHEEP` | `Sheep::create` | ✔ (`IDS_SHEEP`) | 107 |
| 92 | `Cow` | `eTYPE_COW` | `Cow::create` | ✔ (`IDS_COW`) | 108 |
| 93 | `Chicken` | `eTYPE_CHICKEN` | `Chicken::create` | ✔ (`IDS_CHICKEN`) | 109 |
| 94 | `Squid` | `eTYPE_SQUID` | `Squid::create` | ✔ (`IDS_SQUID`) | 110 |
| 95 | `Wolf` | `eTYPE_WOLF` | `Wolf::create` | ✔ (`IDS_WOLF`) | 111 |
| 96 | `MushroomCow` | `eTYPE_MUSHROOMCOW` | `MushroomCow::create` | ✔ (`IDS_MUSHROOM_COW`) | 112 |
| 97 | `SnowMan` | `eTYPE_SNOWMAN` | `SnowMan::create` | — | 113 |
| 98 | `Ozelot` | `eTYPE_OCELOT` | `Ocelot::create` | ✔ (`IDS_OZELOT`) | 114 |
| 99 | `VillagerGolem` | `eTYPE_VILLAGERGOLEM` | `VillagerGolem::create` | — | 115 |
| 100 | `EntityHorse` | `eTYPE_HORSE` | `EntityHorse::create` | ✔ (`IDS_HORSE`) | 116 |
| 101 | `Rabbit` | `eTYPE_RABBIT` | `Rabbit::create` | ✔ (`IDS_RABBIT`) | 117 |
| 102 | `ArmorStand` | `eTYPE_ARMORSTAND` | `ArmorStand::create` | — | 121 |
| 120 | `Villager` | `eTYPE_VILLAGER` | `Villager::create` | ✔ (`IDS_VILLAGER`) | 125 |
| 200 | `EnderCrystal` | `eTYPE_ENDER_CRYSTAL` | `EnderCrystal::create` | — | 127 |
| 1000 | `DragonFireball` | `eTYPE_DRAGON_FIREBALL` | `DragonFireball::create` | — | 130 |

Note the save name `Ozelot` for the Ocelot (`eTYPE_OCELOT`) — the NBT/network name
keeps the historical spelling, while the class is `Ocelot`.

### Sub-typed spawn-egg IDs (high-bit variant packing)

`EntityIO.cpp:135-144` registers additional entries that pack a **subtype into the
high bits** (`baseId | ((subtype + 1) << 12)`) so the creative-menu spawn eggs for
horse/ocelot/spider variants each get their own coloured egg and name. These share
the base class and `eINSTANCEOF` of their parent; they exist only for the creative
egg table.

| Numeric expression | Value | Save name | Variant | Line | Build |
|--------------------|------:|-----------|---------|-----:|-------|
| `100 \| ((TYPE_DONKEY + 1) << 12)` | 8292 | `EntityHorse` | Donkey (`IDS_DONKEY`) | 135 | all |
| `100 \| ((TYPE_MULE + 1) << 12)` | — | `EntityHorse` | Mule (`IDS_MULE`) | 136 | all |
| `100 \| ((TYPE_SKELETON + 1) << 12)` | — | `EntityHorse` | Skeleton horse (`IDS_SKELETON_HORSE`) | 139 | non-content |
| `100 \| ((TYPE_UNDEAD + 1) << 12)` | — | `EntityHorse` | Zombie horse (`IDS_ZOMBIE_HORSE`) | 140 | non-content |
| `98 \| ((TYPE_BLACK + 1) << 12)` | — | `Ozelot` | Black cat (`IDS_OZELOT`) | 141 | non-content |
| `98 \| ((TYPE_RED + 1) << 12)` | — | `Ozelot` | Red/tabby cat (`IDS_OZELOT`) | 142 | non-content |
| `98 \| ((TYPE_SIAMESE + 1) << 12)` | — | `Ozelot` | Siamese cat (`IDS_OZELOT`) | 143 | non-content |
| `52 \| (2 << 12)` | 8244 | `Spider` | Skeleton-spider variant (`IDS_SKELETON`) | 144 | non-content |

The horse variant enum constants live on `EntityHorse` (`TYPE_DONKEY`, `TYPE_MULE`,
`TYPE_SKELETON`, `TYPE_UNDEAD`); the ocelot constants on `Ocelot`. The exact numeric
values depend on those constants (`EntityHorse.h:65-68`: `TYPE_DONKEY = 1`,
`TYPE_MULE = 2`, `TYPE_UNDEAD = 3`, `TYPE_SKELETON = 4`). Only the donkey
(`100 | ((1 + 1) << 12) = 8292`) and spider (`52 | (2 << 12) = 8244`) are shown
resolved.

## Notes on gaps and special IDs

- IDs 3, 5-7, 23-40, 69-89, 118-119, and 121-199 are unused in the numeric map.
- The `id` NBT default fallback is **pig (90)** — `EntityIO::getId()` returns 90 for
  any unrecognised save name (`EntityIO.cpp:283-284`).
- `EntityIO::loadStatic()` remaps the legacy `Minecart` save name (with a `Type` tag)
  to `MinecartChest` / `MinecartFurnace` / `MinecartRideable` before dispatch
  (`EntityIO.cpp:172-190`).
- Ender dragon creation is finalised after `create()` via `AddParts()` in every
  spawn path (`EntityIO.cpp:159-162`, `:197-200`, `:225-228`, `:253-256`).

## Related pages

- [Entities & Mobs](/slop-docs/world/entities/) — the entity class hierarchy and behaviour.
- [Tile Entities](/slop-docs/world/tile-entities/) — the `eTYPE_TILEENTITY` subset of `eINSTANCEOF`.
- [AI Goals](/slop-docs/world/ai-goals/) — per-mob goal wiring.
- [Packet ID Registry](/slop-docs/reference/packet-ids/) — spawn packets referencing these IDs.

## Source

- `Minecraft.World/Class.h:106-337` — `enum eINSTANCEOF` (type bitmasks).
- `Minecraft.World/Class.h:11-51` — bit-layout diagram.
- `Minecraft.World/Class.h:56-93` — `BIT_*` class/flag constants.
- `Minecraft.World/Class.h:339-348` — `eTYPE_DERIVED_FROM` / `eTYPE_FLAGSET`.
- `Minecraft.World/EntityIO.cpp:47-144` — `EntityIO::staticCtor()` registrations.
- `Minecraft.World/EntityIO.cpp:28-43` — the two `setId()` overloads.
- Bootstrapped at `Minecraft.World.cpp:54`.

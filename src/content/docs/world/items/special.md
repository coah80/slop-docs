---
title: Special Items
description: Spawn eggs, enchanted books, skulls, flint and steel, saddles, and other items with unique mechanics.
---

These items have unique mechanics that don't really fit into the tool, armor, food, or combat categories.

## MonsterPlacerItem (Spawn Eggs)

**Files:** `Minecraft.World/MonsterPlacerItem.h`, `Minecraft.World/MonsterPlacerItem.cpp`

| Property | Value |
|----------|-------|
| ID | 383 |
| Stack Size | 16 |
| Stacked By Data | Yes |
| Sprite Layers | 2 (base + overlay) |

The `auxValue` determines what mob type gets spawned. The item name is built dynamically by looking up the entity name through `EntityIO::getNameId()` and plugging it into a `{*CREATURE*}` placeholder.

Egg colors come from `EntityIO::idsSpawnableInCreative`, where each spawnable mob entry has `eggColor1` (base) and `eggColor2` (overlay spot color).

Note: The stack size is 16 on LCE (vs. 64 on PC). The source says: *"brought forward. It is 64 on PC, but we'll never be able to place that many."*

### Spawn Limit System

Before spawning anything, the `canSpawn` method checks entity-type-specific population limits. This is an **LCE-specific** addition to keep entity counts from getting out of hand on console hardware.

| Result Code | Meaning |
|-------------|---------|
| `eSpawnResult_OK` | Spawn succeeded |
| `eSpawnResult_FailTooManyPigsCowsSheepCats` | Passive mob limit (pigs, cows, sheep, ocelots) |
| `eSpawnResult_FailTooManyChickens` | Chicken limit |
| `eSpawnResult_FailTooManySquid` | Squid limit |
| `eSpawnResult_FailTooManyWolves` | Wolf limit |
| `eSpawnResult_FailTooManyMooshrooms` | Mooshroom limit |
| `eSpawnResult_FailTooManyAnimals` | Global animal limit |
| `eSpawnResult_FailTooManyMonsters` | Monster limit |
| `eSpawnResult_FailTooManyVillagers` | Villager limit |
| `eSpawnResult_FailCantSpawnInPeaceful` | Hostile mob on Peaceful difficulty |

Each failure code shows a localized message to the player (like `IDS_MAX_CHICKENS_SPAWNED`).

The `canSpawn` method dispatches by entity type with a switch:
- `eTYPE_CHICKEN`, `eTYPE_WOLF`, `eTYPE_VILLAGER`, `eTYPE_MUSHROOMCOW`, `eTYPE_SQUID` each have their own checks
- Other animals matching `eTYPE_ANIMALS_SPAWN_LIMIT_CHECK` fall through to the generic passive mob limit
- Monsters matching `eTYPE_MONSTER` check difficulty first (Peaceful rejects hostile mobs) and then check the monster population limit

### Placement Behavior

When used on a block face:
1. Position is offset by the face direction using `Facing::STEP_X/Y/Z`
2. Special case: using on a fence or nether fence adds a 0.5 Y offset
3. `spawnMobAt` creates the entity, sets a random Y rotation, marks it as despawn-protected, and calls `finalizeMobSpawn`
4. In Creative mode, the item isn't consumed
5. In debug mode, using on a mob spawner tile sets the spawner's entity type

### Dispenser Support

The static `canSpawn` method (a 4J addition) lets dispensers use spawn eggs too, running the same population limit checks.

## EnchantedBookItem

**Files:** `Minecraft.World/EnchantedBookItem.h`, `Minecraft.World/EnchantedBookItem.cpp`

| Property | Value |
|----------|-------|
| ID | 403 |
| Stack Size | 1 |
| Foil Effect | Always (`isFoil` returns `true`) |
| Enchantable | No (`isEnchantable` returns `false`) |
| NBT Tag | `StoredEnchantments` |
| Rarity | `uncommon` (if has enchantments), `common` (if empty) |

Enchantments are stored in NBT under the `StoredEnchantments` tag (separate from the regular `ench` tag that tools and armor use). The `addEnchantment` method either upgrades an existing enchantment's level or adds a new one.

### Key Methods

| Method | Purpose |
|--------|---------|
| `getEnchantments(item)` | Reads the `StoredEnchantments` list tag from NBT |
| `addEnchantment(item, enchant)` | Adds or upgrades an enchantment in the stored list |
| `createForEnchantment(enchant)` | Creates a book with a specific enchantment |
| `createForEnchantment(enchant, items)` | Creates books for all levels of an enchantment |
| `createForRandomLoot(random)` | Picks a random valid enchantment at a random level for dungeon chests |
| `createForRandomTreasure(random)` | Creates a `WeighedTreasure` entry for weighted loot tables |
| `createForRandomTreasure(random, min, max, weight)` | Same but with custom count range and weight |

The tooltip shows all stored enchantments using `Enchantment::getFullname()`.

## FlintAndSteelItem

**Files:** `Minecraft.World/FlintAndSteelItem.h`, `Minecraft.World/FlintAndSteelItem.cpp`

| Property | Value |
|----------|-------|
| ID | 259 |
| Max Durability | 64 |
| Stack Size | 1 |
| Base Item Type | `eBaseItemType_devicetool` |
| Material | `eMaterial_flintandsteel` |

Places fire on the adjacent block face. If the target position is air and the block below is obsidian (`Tile::obsidian_Id`), it tries to create a Nether portal through `PortalTile::trySpawnPortal()`. A successful portal awards both `portalsCreated` and `InToTheNether` statistics. Uses 1 durability each time via `instance->hurt(1, player)`.

The `bTestUseOnOnly` path only returns true if the target block would be air (for tooltip display).

## SaddleItem

**Files:** `Minecraft.World/SaddleItem.h`, `Minecraft.World/SaddleItem.cpp`

| Property | Value |
|----------|-------|
| ID | 329 |
| Stack Size | 1 |

Goes on pigs through `interactEnemy`. Checks that the pig doesn't already have a saddle and isn't a baby (`!pig->hasSaddle() && !pig->isBaby()`). Calls `pig->setSaddle(true)` and decreases the item count. Once placed, you can't get it back.

The `hurtEnemy` method also delegates to `interactEnemy`, so attacking a pig with a saddle in hand will try to saddle it too.

## CarrotOnAStickItem

**Files:** `Minecraft.World/CarrotOnAStickItem.h`, `Minecraft.World/CarrotOnAStickItem.cpp`

| Property | Value |
|----------|-------|
| ID | 398 |
| Max Durability | 25 |
| Stack Size | 1 |
| Hand Equipped | Yes |
| Mirrored Art | Yes |
| Base Item Type | `eBaseItemType_rod` |
| Material | `eMaterial_carrot` |

Controls saddled pigs. When you use it while riding a pig, it checks `pig->getControlGoal()->canBoost()` and that the item has at least 7 durability remaining. If so, it calls `boost()` on the pig's control goal and hurts the item by 7 durability. If the item breaks (count reaches 0), it gets replaced with a `FishingRodItem` (the stick part).

## BottleItem (Glass Bottles)

**Files:** `Minecraft.World/BottleItem.h`, `Minecraft.World/BottleItem.cpp`

| Property | Value |
|----------|-------|
| ID | 374 |
| Stack Size | 64 |
| Base Item Type | `eBaseItemType_utensil` |
| Material | `eMaterial_glass` |

Right-click on a water source block to fill the bottle, turning it into a water bottle (base potion). The `use` method raycasts from the player's point of view with `getPlayerPOVHitResult(level, player, true)` (the `true` means it also picks liquid blocks). If the hit block is water material, the bottle is consumed and a new `PotionItem` instance is created. If you have multiple bottles, the water bottle gets added to your inventory (or dropped if full).

The `getIcon` method reuses the potion texture: `Item::potion->getIcon(0)`. The `registerIcons` method is empty because it shares the potion icon.

## Other Special Items

| Item | ID | Class | Notes |
|------|----|-------|-------|
| Compass | 345 | `CompassItem` | `eBaseItemType_pockettool`, `eMaterial_compass`; has per-player icons (`TEXTURE_PLAYER_ICON`) |
| Clock | 347 | `ClockItem` | `eBaseItemType_pockettool`, `eMaterial_clock` |
| Eye of Ender | 381 | `EnderEyeItem` | `eBaseItemType_pockettool`, `eMaterial_ender`; locates strongholds and fills portal frames |
| Boat | 333 | `BoatItem` | Places a boat entity on water via raycast |
| Minecart | 328 | `MinecartItem` | Type: `Minecart::RIDEABLE`; places minecart on rails |
| Chest Minecart | 342 | `MinecartItem` | Type: `Minecart::CHEST` |
| Furnace Minecart | 343 | `MinecartItem` | Type: `Minecart::FURNACE` |
| Milk Bucket | 335 | `MilkBucketItem` | Clears all mob effects; crafting remainder: empty bucket. See [Decorative](/slop-docs/world/items/decorative/) |
| Fishing Rod | 346 | `FishingRodItem` | `eBaseItemType_rod`, `eMaterial_wood`; casts and reels in fishing hook entity |

## MinecraftConsoles differences

MinecraftConsoles has some changes to the special items:

### Spawn eggs

`MonsterPlacerItem` is renamed to `SpawnEggItem` (`spawnEgg_Id = 383`). The spawn limit system is the same but adds `eSpawnResult_FailTooManyBats` for the new bat mob (inserted between `FailTooManySquid` and `FailTooManyWolves` in the enum). The `use()` method gains a water-placement path: right-clicking water spawns the mob at the water surface by raycasting with `getPlayerPOVHitResult(level, player, true)` and checking for water material. The class also adds a `DisplaySpawnError` helper method that consolidates the error message display logic.

### New minecart variants

Two new minecart item types are added:

| Item | ID | Minecart Type | Description |
|------|-----|---------------|-------------|
| `minecart_tnt` | 407 | `Minecart::TYPE_TNT` | TNT minecart that explodes when activated by a powered rail or damaged. Has a fuse timer and custom explosion logic with `primeFuse()` and `getFuse()`. |
| `minecart_hopper` | 408 | `Minecart::TYPE_HOPPER` | Hopper minecart that sucks in items while moving. Extends `MinecartContainer` and `Hopper`. Has an enabled/disabled state and a cooldown timer. |

`MinecartChest` and `MinecartFurnace` also get split into their own classes (they were handled generically in LCEMP's `Minecart`/`MinecartItem`).

Note: The spawner minecart (`MinecartSpawner`) exists as an entity class but doesn't have a corresponding item for placement.

### New entities

Several new entity types support the items above:

- **`EntityHorse`** is a big one. Supports 5 types (horse, donkey, mule, undead, skeleton), 7 color variants, horse armor (none/iron/gold/diamond), saddles, chest storage for donkeys/mules, breeding, and taming. Has its own inventory (`AnimalChest`) and data sync for flags like tame, saddled, chested, bred, eating, standing, and open-mouth.
- **`WitherBoss`** is the Wither boss mob, a `Monster` that also implements `RangedAttackMob` and `BossMob`. Has three target tracking data IDs, head rotation tracking, and a destroy-blocks-tick timer.
- **`Witch`** is a ranged-attack hostile mob that uses potions. Has a drinking speed modifier and death loot table.
- **`Bat`** is an ambient creature with resting/flying states and ceiling-hanging behavior.
- **`FireworksRocketEntity`** is the firework rocket projectile.
- **`WitherSkull`** is the Wither's projectile attack.
- **`LargeFireball`** is a separate class from the small fireball.
- **`LeashFenceKnotEntity`** is the leash attachment point on fences.

### Scoreboard system

MinecraftConsoles adds a full `Scoreboard` system with `Objective`, `ObjectiveCriteria`, `Score`, `PlayerTeam`, `ScoreHolder`, and `ScoreboardSaveData` classes. This supports the `/scoreboard` command and in-game score display in three slots (list, sidebar, below name).

### Other additions

- **`CarrotOnAStickItem`** works with the new horse entity in addition to pigs.
- **Saddle** now also works on horses through the horse inventory menu.
- **`SaddleItem::interactEnemy`** likely gains horse support (in addition to pig).
- **`EmptyMapItem`** (ID 395) is split out as its own class. See [Decorative](/slop-docs/world/items/decorative/) for details.

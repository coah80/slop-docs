---
title: Overview
description: Overview of the Minecraft.World module — the game logic layer.
---

`Minecraft.World` is the game logic layer of the LCE codebase. It holds all the gameplay systems: blocks, items, entities, world generation, networking, AI, crafting, enchantments, effects, containers, and storage. The module is a flat directory of **1,560 source files** (845 headers, 715 implementations) making up roughly **780 compilation units**, with no subdirectories besides `x64headers/`.

The code follows Mojang's original Java package structure pretty closely. Namespace aggregate headers (e.g. `net.minecraft.world.level.tile.h`) mirror those Java packages and act as handy include bundles.

## Module Entry Point

`Minecraft.World.h` / `Minecraft.World.cpp` exposes a single function:

```cpp
void MinecraftWorld_RunStaticCtors();
```

This kicks off all the static registries (tiles, items, biomes, enchantments, recipes, mob effects, and stats) before the game loop starts. The initialization order is strict and documented in the [Architecture](/slop-docs/overview/architecture/) page. Getting this wrong causes crashes because later systems depend on data from earlier ones (items depend on tiles, recipes depend on items, etc.).

## Subsystem Summary

| Subsystem | Files | Units | Key Base Class | Details |
|-----------|------:|------:|----------------|---------|
| [Blocks (Tiles)](/slop-docs/world/blocks/) | 210 | 105 | `Tile` | All block types, from `AirTile` to `WoolCarpetTile` |
| Tile Items | 30 | 15 | `TileItem` | Item representations of placeable blocks |
| [Tile Entities](/slop-docs/world/tile-entities/) | 22 | 11 | `TileEntity` | Blocks with persistent state (chests, furnaces, signs) |
| [Items](/slop-docs/world/items/) | 94 | 47 | `Item` | Tools, weapons, food, armor, and special items |
| [Entities](/slop-docs/world/entities/) -- Mobs | 36 | 18 | `Monster` | Hostile mobs: Zombie, Skeleton, Creeper, EnderDragon, etc. |
| [Entities](/slop-docs/world/entities/) -- Animals | 24 | 12 | `Animal` | Passive mobs: Pig, Cow, Sheep, Wolf, Ozelot, etc. |
| [Entities](/slop-docs/world/entities/) -- Projectiles | 24 | 12 | `Throwable` / `Fireball` | Arrow, Snowball, ThrownPotion, DragonFireball, etc. |
| [Entities](/slop-docs/world/entities/) -- Other | 24 | 12 | `Entity` | Boat, Minecart, FallingTile, PrimedTnt, ItemEntity |
| Entity Core | 37 | 19 | `Entity` | Base classes, spawner, entity data sync, IO |
| [AI Goals](/slop-docs/world/ai-goals/) | 88 | 44 | `Goal` | Behavior tree goals: attack, flee, breed, follow, etc. |
| AI Controls & Navigation | 23 | 12 | `PathNavigation` | Movement, look, and jump controls; A* pathfinding |
| [Networking](/slop-docs/world/networking/) | 167 | 86 | `Packet` | All game packets for client-server communication |
| [World Gen](/slop-docs/world/worldgen/) -- Features | 89 | 45 | `Feature` | Terrain decorations: ores, trees, lakes, dungeons |
| [Biomes](/slop-docs/world/biomes/) | 50 | 26 | `Biome` | Biome definitions and the `BiomeSource` / `BiomeDecorator` |
| [World Gen](/slop-docs/world/worldgen/) -- Layers | 40 | 20 | `Layer` | Biome map generation pipeline (zoom, smooth, river, etc.) |
| [Structures](/slop-docs/world/structures/) | 16 | 8 | `StructureFeature` | Villages, strongholds, mine shafts, nether bridges |
| [World Gen](/slop-docs/world/worldgen/) -- Noise | 12 | 6 | `PerlinNoise` | Perlin, simplex, and FastNoise generators |
| [World Gen](/slop-docs/world/worldgen/) -- Level Sources | 19 | 10 | `ChunkSource` | Chunk generators for overworld, nether, end, and flat |
| [Enchantments](/slop-docs/world/enchantments/) | 45 | 23 | `Enchantment` | All enchantment types plus `EnchantmentHelper` |
| [Effects](/slop-docs/world/effects/) | 10 | 5 | `MobEffect` | Status effects and potion brewing |
| [Crafting](/slop-docs/world/crafting/) | 33 | 17 | `Recipy` | Shaped, shapeless, and furnace recipes |
| [Containers](/slop-docs/world/containers/) | 51 | 26 | `AbstractContainerMenu` | Inventory screens: crafting table, furnace, anvil, etc. |
| [Storage](/slop-docs/world/storage/) | 67 | 36 | `LevelStorage` | World save/load, region files, NBT I/O, console save formats |
| NBT & Tags | 15 | 14 | `Tag` | Named Binary Tag types (CompoundTag, ListTag, etc.) |
| Commands | 23 | 13 | `Command` | Server commands: give, kill, time, gamemode, etc. |
| Stats & Achievements | 19 | 10 | `Stat` | Gameplay statistics and achievement tracking |
| [Game Rules](/slop-docs/world/gamerules/) | -- | -- | `LevelData` | Game rule flags stored in level data |
| Level Core | 49 | 28 | `Level` | The world itself: tick loop, lighting, chunks, dimensions |
| Materials | 9 | 7 | `Material` | Block material properties (solid, liquid, flammable) |
| Physics & Math | 31 | 16 | -- | AABB, Vec3, Pos, Random, Mth, Facing |
| Villages | 8 | 4 | `Village` | Village door tracking and siege events |
| Damage | 2 | 1 | `DamageSource` | Damage type registry (fire, fall, entity, etc.) |
| Trading | 3 | 2 | `Merchant` | Villager trade offer system |
| Utility & Platform | 132 | 81 | -- | IO streams, threading, compression, i18n, helpers |

**Total: ~1,560 files across ~780 compilation units.**

## Level Core -- The Central Hub

The `Level` class (`Level.h`, `Level.cpp`) is the heart of the module. Almost every other subsystem holds a pointer back to `Level`. It owns:

### Entity Management

- `entities` -- a `vector<shared_ptr<Entity>>` holding all entities in the level
- `players` -- a `vector<shared_ptr<Player>>` for fast player lookups
- `globalEntities` -- for lightning bolts and other global entities
- `tileEntityList` -- all tile entities (chests, furnaces, signs, etc.)
- `pendingTileEntities` and `tileEntitiesToUnload` for deferred addition/removal
- Critical sections (`m_entitiesCS`, `m_tileEntityListCS`) protect these lists for thread safety

### Chunk Management

- `chunkSource` -- a `ChunkSource*` that loads and generates chunks
- `chunkSourceCache` -- direct pointer to the underlying cache array for fast lookups
- Chunks are `LevelChunk` objects holding 16x16x256 columns of tile IDs and metadata

### Tick Loop

The `tick()` method drives everything each game tick (20 ticks per second):

1. **Weather** -- rain/thunder progression, lightning strikes
2. **Sky brightness** -- updates the global sky darken value
3. **Chunk polling** -- selects chunks around players for random ticks
4. **Random tile ticks** -- 80 random block positions per chunk section get ticked (crop growth, fire spread, ice melting)
5. **Pending tile ticks** -- scheduled tile updates (redstone, liquids)
6. **Entity ticks** -- calls `Entity::tick()` for every entity
7. **Tile entity updates** -- processes pending additions and removals
8. **Village tracking** -- updates village door lists and siege timer

### Lighting Engine

The lighting system is one of the most complex parts:

- Two light layers: `SKY` (sunlight) and `BLOCK` (torches, glowstone, etc.)
- Per-block brightness values from 0 to 15 (`MAX_BRIGHTNESS`)
- A TLS-based lighting cache (`tlsIdxLightCache`) for multi-threaded chunk rebuilds
- Cache entries store position, light value, emission, and blocking in a single `lightCache_t` value (either 32-bit or 64-bit depending on `_LARGE_WORLDS`)
- `checkLight()` propagates light changes to neighbors
- Critical section `m_checkLightCS` protects concurrent light updates

### Dimensions

- `dimension` pointer selects overworld (`NormalDimension`, ID 0), nether (`HellDimension`, ID -1), or end (`TheEndDimension`, ID 1)
- Each dimension has its own `ChunkSource` and biome configuration
- The nether uses a configurable scale factor (`HELL_LEVEL_LEGACY_SCALE`)

### World Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `minBuildHeight` | 0 | Lowest Y coordinate |
| `maxBuildHeight` | 256 | Highest Y coordinate |
| `MAX_LEVEL_SIZE` | 30,000,000 | Maximum X/Z coordinate |
| `seaLevel` | 63 (default) | Sea level Y |
| `TICKS_PER_DAY` | 24,000 | 20 minutes real time |
| `MAX_BRIGHTNESS` | 15 | Maximum light value |
| `CHUNK_TILE_TICK_COUNT` | 80 | Random ticks per chunk section per game tick |

### Console Entity Limits

4J added hard caps to keep console performance stable:

| Limit | Value |
|-------|-------|
| `MAX_XBOX_BOATS` | 40 |
| `MAX_CONSOLE_MINECARTS` | 40 |
| `MAX_DISPENSABLE_FIREBALLS` | 200 |
| `MAX_DISPENSABLE_PROJECTILES` | 300 |
| `MAX_GRASS_TICKS` | 100 per tick |
| `MAX_LAVA_TICKS` | 100 per tick |
| `MAX_TICK_TILES_PER_TICK` | 1,000 |

## Entity System

### Class Hierarchy

```
Entity (base: enable_shared_from_this<Entity>)
├── Mob (health, AI, pathfinding, effects)
│   ├── Monster (hostile, burns in sun)
│   │   ├── Zombie, Skeleton, Creeper, Spider, CaveSpider
│   │   ├── Enderman, Silverfish, Blaze, Ghast, Giant
│   │   ├── LavaSlime (magma cube), Slime, PigZombie
│   │   └── BossMob
│   │       └── EnderDragon (with BossMobPart sub-entities)
│   ├── Animal (passive, breedable)
│   │   ├── Pig, Cow, Sheep, Chicken
│   │   ├── Wolf, Ozelot (tamed via TamableAnimal)
│   │   ├── MushroomCow, Squid (WaterAnimal)
│   │   └── Golem
│   │       ├── VillagerGolem (iron golem)
│   │       └── SnowMan (snow golem)
│   ├── Villager (trading, profession system)
│   ├── Creature (pathfinding mob base)
│   └── FlyingMob (ghasts)
├── Player (inventory, abilities, experience)
├── Throwable (projectile base)
│   ├── Arrow, Snowball, ThrownEgg
│   ├── ThrownPotion, ThrownEnderpearl, ThrownExpBottle
│   └── FishingHook
├── Fireball (large fireball, small fireball, dragon fireball)
├── ItemEntity (dropped items)
├── ExperienceOrb (XP orbs)
├── Boat, Minecart (vehicles)
├── FallingTile (falling sand/gravel)
├── PrimedTnt (lit TNT)
├── Painting, ItemFrame (hanging entities)
├── HangingEntity (base for paintings/item frames)
├── LightningBolt (global entity)
├── EnderCrystal (end crystals)
├── EyeOfEnderSignal (thrown eye of ender)
└── NetherSphere (nether portal visual)
```

### eINSTANCEOF Type System

Every entity class overrides `GetType()` to return an `eINSTANCEOF` enum value. This replaces Java's `instanceof` operator and avoids the cost of `dynamic_cast`. The enum is defined in `Definitions.h` and includes types like `eTYPE_ZOMBIE`, `eTYPE_PIG`, `eTYPE_ARROW`, etc.

Usage: `entity->GetType() == eTYPE_ZOMBIE` instead of `dynamic_cast<Zombie*>(entity.get())`.

### SynchedEntityData

The `SynchedEntityData` class handles entity data that needs to be synced between server and client. It uses a flat array of typed values indexed by ID:
- ID 0: Shared flags byte (on fire, sneaking, riding, sprinting, using item, invisible, idle animation, weakened)
- ID 1: Air supply (short)
- Higher IDs are defined per entity type (e.g., ID 8 is the potion effect color for Mob)

### Entity Small ID System

4J added a "small ID" system for efficient entity tracking. Instead of using the full 32-bit `entityId`, entities get a compact ID from a bitfield array (`entityIdUsedFlags[2048/32]`). This allows fast lookups and compact network representation. There's also an "extra wandering" system that lets a limited number of entities (max 3, for 30 seconds each) wander even when far from players, to detect if they're inside a farm enclosure.

## AI System

### GoalSelector

Mobs use two `GoalSelector` instances:
- `goalSelector` -- for behavior goals (wander, eat, breed, follow owner)
- `targetSelector` -- for choosing targets (nearest player, hurt-by retaliation)

Each goal has a priority (lower number = higher priority) and control flags that determine which goals can run simultaneously. The selector runs the highest-priority usable goal each tick.

### Goal Interface

```cpp
class Goal {
    virtual bool canUse() = 0;         // Can this goal start?
    virtual bool canContinueToUse();   // Keep running?
    virtual void start();              // Called when goal begins
    virtual void stop();               // Called when goal ends
    virtual void tick();               // Called each tick while running
};
```

### Available Goals

| Category | Goals |
|----------|-------|
| **Movement** | `RandomStrollGoal`, `FloatGoal`, `FleeSunGoal`, `PanicGoal`, `MoveIndoorsGoal`, `MoveThroughVillageGoal`, `MoveTowardsRestrictionGoal`, `MoveTowardsTargetGoal` |
| **Combat** | `MeleeAttackGoal`, `ArrowAttackGoal`, `LeapAtTargetGoal`, `SwellGoal` (creeper), `OzelotAttackGoal` |
| **Targeting** | `NearestAttackableTargetGoal`, `HurtByTargetGoal`, `OwnerHurtByTargetGoal`, `OwnerHurtTargetGoal`, `DefendVillageTargetGoal`, `NonTameRandomTargetGoal` |
| **Social** | `BreedGoal`, `FollowParentGoal`, `FollowOwnerGoal`, `TemptGoal`, `BegGoal` (wolf), `PlayGoal` (villager children), `MakeLoveGoal` (villager breeding) |
| **Interaction** | `LookAtPlayerGoal`, `RandomLookAroundGoal`, `LookAtTradingPlayerGoal`, `TradeWithPlayerGoal`, `InteractGoal`, `AvoidPlayerGoal` |
| **Door** | `DoorInteractGoal`, `BreakDoorGoal`, `OpenDoorGoal`, `RestrictOpenDoorGoal` |
| **Villager Golem** | `OfferFlowerGoal`, `TakeFlowerGoal` |
| **Taming** | `SitGoal`, `ControlledByPlayerGoal` (pig with carrot on a stick) |
| **Eating** | `EatTileGoal` (sheep eating grass) |
| **Cat** | `OcelotSitOnTileGoal` |
| **Misc** | `RestrictSunGoal` |

### Navigation and Pathfinding

- `PathNavigation` handles mob movement through the world
- `PathFinder` implements A* search over a `Node` graph
- `BinaryHeap` provides the priority queue for A* open set
- `MoveControl`, `LookControl`, `JumpControl` manage the mob's actual movement, head rotation, and jumping
- `BodyControl` handles body rotation to match the head
- `Sensing` checks line-of-sight to targets

## Block (Tile) System

Tiles are stored in a flat array `Tile::tiles[4096]` indexed by tile ID. The `Tile` base class defines:

- **Physical properties**: destroy speed, explosion resistance, friction, sound type
- **Render properties**: render shape (36 shape types from `SHAPE_BLOCK` to `SHAPE_QUARTZ`), light emission, light blocking, solid/transparent flags
- **Behavior**: `tick()` for random ticks, `neighborChanged()` for redstone, `use()` for player interaction, `onPlace()`/`onRemove()` lifecycle, `stepOn()` for entity walking

### Thread-Local Shape Storage

Because chunks rebuild on multiple threads, tile shapes are stored in thread-local storage via `ThreadStorage` and `tlsIdxShape`. Each thread gets its own `xx0, yy0, zz0, xx1, yy1, zz1` values, so `setShape()` calls on one thread don't corrupt another thread's tile rendering.

### Sound Types

12 built-in sound types: `SOUND_NORMAL`, `SOUND_WOOD`, `SOUND_GRAVEL`, `SOUND_GRASS`, `SOUND_STONE`, `SOUND_METAL`, `SOUND_GLASS`, `SOUND_CLOTH`, `SOUND_SAND`, `SOUND_SNOW`, `SOUND_LADDER`, `SOUND_ANVIL`.

## Item System

Items are stored in `Item::items`, a flat array of 32,000 slots. The `Item` constructor adds 256 to the ID you pass in, so tile IDs (0-255) and item IDs (256+) don't overlap. The `Item` base class defines:

- **Stack properties**: max stack size (default 64), max damage, craftable remaining item
- **Tool tiers**: 5 tiers (Wood, Stone, Iron, Diamond, Gold) with different uses, speed, damage, and enchantability
- **Base item types**: 35 types for the crafting menu (sword, shovel, pickaxe, hatchet, hoe, door, helmet, etc.)
- **Material types**: 42 material categories for the crafting menu (wood, stone, iron, gold, diamond, cloth, etc.)

## Packet System

98 packet types are registered in `Packet::staticCtor()`. Each packet has:
- `getId()` returning its numeric ID
- `read(DataInputStream*)` for deserialization
- `write(DataOutputStream*)` for serialization
- `handle(PacketListener*)` for processing
- `getEstimatedSize()` for bandwidth estimation

Packets are mapped by ID in `Packet::idToCreateMap` with separate sets for client-received, server-received, and broadcast-to-all-clients packets.

Key packet categories:
- **Movement**: `MovePlayerPacket`, `MoveEntityPacket`, `TeleportEntityPacket`, `SetEntityMotionPacket`
- **World**: `TileUpdatePacket`, `ChunkTilesUpdatePacket`, `BlockRegionUpdatePacket`, `LevelEventPacket`
- **Entities**: `AddEntityPacket`, `AddMobPacket`, `AddPlayerPacket`, `RemoveEntitiesPacket`, `SetEntityDataPacket`
- **Containers**: `ContainerOpenPacket`, `ContainerClickPacket`, `ContainerSetSlotPacket`, `ContainerSetContentPacket`
- **Player**: `PlayerActionPacket`, `UseItemPacket`, `InteractPacket`, `PlayerAbilitiesPacket`
- **Chat**: `ChatPacket`
- **System**: `LoginPacket`, `PreLoginPacket`, `DisconnectPacket`, `KeepAlivePacket`, `KickPlayerPacket`
- **Custom**: `CustomPayloadPacket`, `TexturePacket`, `TextureChangePacket`, `TextureAndGeometryPacket`

## World Generation

### Layer Pipeline

Biome maps are generated through a pipeline of `Layer` objects, each transforming or refining the map:

`IslandLayer` -> `FuzzyZoomLayer` -> `AddIslandLayer` -> `ZoomLayer` -> `AddSnowLayer` -> `AddMushroomIslandLayer` -> `GrowMushroomIslandLayer` -> `DownfallLayer` -> `DownfallMixerLayer` -> `TemperatureLayer` -> `TemperatureMixerLayer` -> `RegionHillsLayer` -> `SwampRiversLayer` -> `BiomeInitLayer` -> `BiomeOverrideLayer` -> `SmoothLayer` -> `SmoothZoomLayer` -> `RiverInitLayer` -> `RiverLayer` -> `RiverMixerLayer` -> `ShoreLayer` -> `VoronoiZoom`

### Chunk Sources

| ChunkSource | Dimension | What it generates |
|-------------|-----------|-------------------|
| `RandomLevelSource` | Overworld | Standard terrain with caves, ores, structures |
| `HellRandomLevelSource` | Nether | Nether terrain with lava, soul sand, nether fortresses |
| `TheEndLevelRandomLevelSource` | The End | End stone islands with obsidian pillars |
| `FlatLevelSource` | Any | Flat world from `FlatLayer` definitions |
| `HellFlatLevelSource` | Nether | Flat nether world |
| `CustomLevelSource` | Any | Custom terrain with adjustable parameters |

### Noise Generators

| Class | Algorithm | Used for |
|-------|-----------|----------|
| `PerlinNoise` | Multi-octave Perlin | Primary terrain height, cave generation |
| `ImprovedNoise` | Improved Perlin | Individual octave evaluation |
| `PerlinSimplexNoise` | Multi-octave simplex | Nether terrain |
| `SimplexNoise` | Simplex | Individual simplex octave |
| `FastNoise` | Optimized noise | Performance-critical terrain generation |

### Structures

| Structure | Class | Generated in |
|-----------|-------|-------------|
| Villages | `VillageFeature`, `VillagePieces` | Plains, desert, savanna |
| Strongholds | `StrongholdFeature`, `StrongholdPieces` | Underground, 3 per world |
| Mine Shafts | `MineShaftFeature`, `MineShaftPieces` | Underground |
| Nether Bridges | `NetherBridgeFeature`, `NetherBridgePieces` | Nether |
| Desert Temples | `RandomScatteredLargeFeature`, `ScatteredFeaturePieces` | Desert |
| Jungle Temples | `RandomScatteredLargeFeature`, `ScatteredFeaturePieces` | Jungle |
| Desert Wells | `DesertWellFeature` | Desert |

### Features (Decorators)

Features decorate terrain after the base heightmap is generated:

| Category | Features |
|----------|----------|
| **Ores** | `OreFeature` (coal, iron, gold, diamond, lapis, redstone, emerald) |
| **Trees** | `TreeFeature`, `BasicTree`, `BirchFeature`, `PineFeature`, `SpruceFeature`, `SwampTreeFeature`, `MegaTreeFeature` |
| **Plants** | `FlowerFeature`, `TallGrassFeature`, `GroundBushFeature`, `DeadBushFeature`, `CactusFeature`, `ReedsFeature`, `PumpkinFeature`, `VinesFeature`, `WaterlilyFeature` |
| **Water/Lava** | `LakeFeature`, `SpringFeature`, `HellSpringFeature` |
| **Structures** | `DungeonFeature`, `MonsterRoomFeature`, `BonusChestFeature`, `HouseFeature`, `SpikeFeature` (end pillars), `EndPodiumFeature` |
| **Nether** | `HellFireFeature`, `LightGemFeature`, `HellPortalFeature` |
| **Mushrooms** | `HugeMushroomFeature` |
| **Caves** | `CaveFeature`, `LargeCaveFeature`, `LargeHellCaveFeature`, `CanyonFeature` |
| **Sand/Clay** | `SandFeature`, `ClayFeature` |

## Storage System

### Save Formats

| Class | Format | Used for |
|-------|--------|----------|
| `ConsoleSaveFileOriginal` | Original console save format | Legacy saves |
| `ConsoleSaveFileConverter` | Save converter | Upgrading between versions |
| `ConsoleSaveFileInputStream`/`OutputStream` | Console save I/O | Reading/writing console saves |
| `McRegionChunkStorage` | McRegion format | Region-based chunk storage |
| `McRegionLevelStorage` | McRegion format | Level-wide save management |
| `RegionFile`, `RegionFileCache` | Region files | Individual .mcr region files |
| `OldChunkStorage` | Old format | Pre-region chunk storage |
| `MockedLevelStorage` | Testing | Stub for tests |

### NBT Tags

All persistent data goes through the NBT tag hierarchy:

| Tag Type | Class | Stores |
|----------|-------|--------|
| Compound | `CompoundTag` | Key-value map of named tags |
| List | `ListTag<T>` | Ordered list of same-type tags |
| Byte/Short/Int/Long/Float/Double | Numeric tags | Single values |
| String | `StringTag` | Text |
| Byte Array | `ByteArrayTag` | Raw byte data |
| Int Array | `IntArrayTag` | Raw int data |

`NbtIo` handles reading/writing NBT to streams, including GZIP compression.

## Enchantment System

20 enchantments across 4 categories:

| Category | Enchantments |
|----------|-------------|
| **Armor** | Protection (all), Fire Protection, Feather Falling, Blast Protection, Projectile Protection, Respiration, Aqua Affinity, Thorns |
| **Weapon** | Sharpness, Smite, Bane of Arthropods, Knockback, Fire Aspect, Looting |
| **Tool** | Efficiency, Silk Touch, Unbreaking, Fortune |
| **Bow** | Power, Punch, Flame, Infinity |

`EnchantmentHelper` provides utility functions for applying enchantment effects during combat and tool use.

## Effects System

19 mob effects with the `MobEffect` base class:

Speed, Slowness, Haste, Mining Fatigue, Strength, Instant Health, Instant Damage, Jump Boost, Nausea, Regeneration, Resistance, Fire Resistance, Water Breathing, Invisibility, Blindness, Night Vision, Hunger, Weakness, Poison.

`InstantenousMobEffect` handles instant effects (healing/harming). `PotionBrewing::staticCtor()` defines the potion brewing chain, how ingredients transform one potion into another.

## Commands

10 server commands available through `CommandDispatcher`:

| Command | Class | What it does |
|---------|-------|-------------|
| `/give` | `GiveItemCommand` | Give items to players |
| `/kill` | `KillCommand` | Kill entities |
| `/time` | `TimeCommand` | Set/query time of day |
| `/gamemode` | `GameModeCommand` | Change game mode |
| `/defaultgamemode` | `DefaultGameModeCommand` | Set default game mode |
| `/toggledownfall` | `ToggleDownfallCommand` | Toggle rain/snow |
| `/tp` | `TeleportCommand` | Teleport players |
| `/xp` | `ExperienceCommand` | Give experience |
| `/enchant` | `EnchantItemCommand` | Enchant held item |
| Custom | `GameCommandPacket` | Server-sent game commands |

## How the Subsystems Connect

```
┌─────────────────────────────────────────────────────┐
│                      Level                          │
│  (tick loop, lighting, entity management, chunks)   │
└──────┬──────┬──────┬──────┬──────┬──────┬───────────┘
       │      │      │      │      │      │
       ▼      ▼      ▼      ▼      ▼      ▼
    Tiles  Entities Items  World  Packets Dimension
     │       │       │      Gen     │       │
     │       │       │      │       │       │
     ▼       ▼       ▼      ▼       ▼       ▼
  Tile    AI Goals  Enchant Biomes  Client  Storage
  Entity  Controls  Effects Layers  Server  NBT/IO
  Items   Pathfind  Recipes Struct  Sync    Region
          Damage    Craft   Noise           Save
```

### Key Relationships

- **Level <-> Tile**: `Level` stores tile IDs in chunks. `Tile::tick()` gets called by the level's random tick system. Tiles query their neighbors through `Level`.
- **Level <-> Entity**: `Level` owns entity lists and calls `Entity::tick()` each game tick. Entities read and modify tiles through their `level` pointer.
- **Entity -> AI Goals**: Mobs use a `GoalSelector` with prioritized `Goal` instances. Goals access the mob's `PathNavigation` and `LookControl` to move and pick targets.
- **Entity -> Pathfinding**: `PathNavigation` runs `PathFinder` (A* over a `Node` graph) with `BinaryHeap`. The pathfinder checks tile solidity from `Level`.
- **Item <-> Tile**: Items and tiles share an ID space. `TileItem` wraps a `Tile` as an `Item`. Items like `BucketItem` and `BedItem` place or interact with tiles.
- **Enchantment -> Item/Entity**: `EnchantmentHelper` queries item enchantments during combat (`DamageEnchantment`, `ProtectionEnchantment`) and tool use (`DiggingEnchantment`).
- **MobEffect -> Entity**: Status effects modify entity attributes each tick. `PotionBrewing` defines how ingredients combine in the brewing stand.
- **Recipes -> Item/Tile**: `ShapedRecipy` and `ShapelessRecipy` map `ItemInstance` grids to output items. `FurnaceRecipes` maps smelting inputs to outputs.
- **Container/Menu -> Item/Tile Entity**: Menus like `FurnaceMenu` bind UI slots to a `TileEntity`'s inventory. `ContainerMenu` handles click logic and slot transfer.
- **Packet <-> Level/Entity**: Packets serialize game state changes. `MoveEntityPacket`, `TileUpdatePacket`, `ContainerSetSlotPacket`, etc. keep client and server in sync.
- **World Gen -> Level**: `ChunkSource` implementations generate chunks. `BiomeSource` uses the `Layer` pipeline to produce biome maps. `Feature` and `StructureFeature` decorate the generated terrain.
- **Storage -> Level/NBT**: `LevelStorage` saves world data. Console editions use `ConsoleSaveFile` variants and `ZonedChunkStorage`. All serialization goes through the NBT `Tag` hierarchy.
- **DamageSource -> Entity**: `DamageSource` identifies damage types. `EntityDamageSource` and `IndirectEntityDamageSource` track the attacking entity for kill credit and enchantment application.

## Namespace Headers

The 54 `net.minecraft.*.h` files are aggregate include headers that mirror the original Java package structure. They don't contain any logic, they just bundle related headers together for convenience. For example:

| Header | Bundles |
|--------|---------|
| `net.minecraft.world.level.tile.h` | All `Tile` subclass headers |
| `net.minecraft.world.entity.monster.h` | All hostile mob headers |
| `net.minecraft.world.item.enchantment.h` | All enchantment headers |
| `net.minecraft.network.packet.h` | All packet headers |

## File Naming Conventions

- **Tiles** are named `*Tile.h/.cpp` (e.g. `FurnaceTile`, `CactusTile`).
- **Items** are named `*Item.h/.cpp` (e.g. `BowItem`, `ArmorItem`).
- **Tile entities** are named `*TileEntity.h/.cpp` (e.g. `ChestTileEntity`).
- **Tile items** are named `*TileItem.h/.cpp` (e.g. `LeafTileItem`).
- **Packets** are named `*Packet.h/.cpp` (e.g. `MovePlayerPacket`).
- **AI goals** are named `*Goal.h/.cpp` (e.g. `MeleeAttackGoal`).
- **Enchantments** are named `*Enchantment.h/.cpp` (e.g. `DamageEnchantment`).
- **Biomes** are named `*Biome.h/.cpp` (e.g. `DesertBiome`).
- **Features** are named `*Feature.h/.cpp` (e.g. `OreFeature`, `TreeFeature`).
- **Layers** are named `*Layer.h/.cpp` (e.g. `ZoomLayer`, `RiverLayer`).
- **Recipes** are named `*Recip*.h/.cpp` (note the inconsistent spelling: `Recipy`, `Recipies`, `Recipes`).

## MinecraftConsoles Differences

MinecraftConsoles (MC) is a later version of the same codebase. It has roughly **1,837 source files** compared to LCEMP's 1,560, so about 277 more files. The extra content comes from features added between the two versions. Here's a quick summary of what changed:

- **More blocks**: MC fills in the gaps in the tile ID table. It adds command blocks (137), beacons (138), comparators (149-150), daylight detectors (151), hoppers (154), activator rails (157), droppers (158), stained hardened clay (159), stained glass panes (160), hay blocks (170), hardened clay (172), and stained glass (replaces locked chest at 95). A new `ColoredTile` base class handles stained variants.
- **More entities**: MC adds Witch, Wither Boss, Bat, Horse (with donkey/mule/skeleton/zombie horse variants), leash fence knot entity, and fireworks rocket entity. Minecarts are split into subtypes: MinecartChest, MinecartFurnace, MinecartTNT, MinecartHopper, MinecartSpawner, MinecartRideable.
- **More tile entities**: MC goes from 13 to 18 registered tile entity types. New ones: Command Block Entity, Beacon, Daylight Detector, Hopper, and Comparator.
- **More effects**: MC adds Wither (20), Health Boost (21), Absorption (22), and Saturation (23) on top of LCEMP's 19 effects.
- **Attribute system**: MC adds a full entity attribute system (`Attribute`, `BaseAttribute`, `RangedAttribute`, `AttributeModifier`, `SharedMonsterAttributes`) that LCEMP doesn't have.
- **Scoreboard system**: MC adds a scoreboard with objectives, scores, player teams, criteria, and related packets.
- **Vanilla game rules**: MC adds a proper `GameRules` class with boolean/integer rules like `keepInventory`, `doMobSpawning`, and `doDaylightCycle`. This is separate from the console game rules system both versions share.
- **More packets**: MC registers 104 packets vs LCEMP's 98, adding leash, attribute, particle, command block, and scoreboard packets.
- **More recipes**: MC has about 114 crafting recipes vs LCEMP's 100, plus a smelting recipe for clay blocks to hardened clay.
- **More menus**: MC adds `BeaconMenu`, `HopperMenu`, `HorseInventoryMenu`, `FireworksMenu`, and `AnvilMenu`.
- **More AI goals**: MC adds `RunAroundLikeCrazyGoal` (horse taming) and `RangedAttackGoal` (used by witch and skeleton).
- **Structure persistence**: MC adds `StructureFeatureIO` and `StructureFeatureSavedData` for saving/loading structure data to NBT.

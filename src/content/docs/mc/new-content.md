---
title: "New Blocks & Items"
description: "Blocks and items in MinecraftConsoles, including some shared with LCEMP."
---

MinecraftConsoles adds several blocks and items beyond the LCEMP base. Some of these also exist in LCEMP and are marked accordingly. This page documents each one based on the actual source code.

## New blocks

### StainedGlassBlock

**File**: `Minecraft.World/StainedGlassBlock.h`, `.cpp`

Extends `HalfTransparentTile`. Provides 16 color variants using dye-based texture names.

| Property | Value |
|----------|-------|
| Base class | `HalfTransparentTile` |
| Material | Passed via constructor (glass) |
| Render layer | `1` (translucent) |
| Cube shaped | `false` |
| Silk touchable | `true` (via protected `isSilkTouchable()`) |
| Resource count | `0` (drops nothing without silk touch) |
| Icon variants | `ICONS_LENGTH` = 16 (one per dye color) |

Texture registration iterates all 16 variants and registers icons using `DyePowderItem::COLOR_TEXTURES` mapped through `getItemAuxValueForBlockData()`, which inverts the data bits (`~data & 0xf`). `getSpawnResourcesAuxValue()` maps the block data to the item aux value.

### StainedGlassPaneBlock

**File**: `Minecraft.World/StainedGlassPaneBlock.h`, `.cpp`

Extends `ThinFenceTile`. The pane variant of stained glass with both face icons and edge icons.

| Property | Value |
|----------|-------|
| Base class | `ThinFenceTile` |
| Render layer | `1` (translucent) |
| Icon arrays | `ICONS[16]` (face) and `EDGE_ICONS[16]` (edge/top) |
| Variants | `ICONS_COUNT` = 16 |

Registers both face textures (`glass_<color>`) and edge textures (`glass_pane_top_<color>`) for all 16 variants. Three texture methods handle different faces:

- `getIconTexture(int face, int data)` for the main pane face
- `getEdgeTexture(int data)` for the pane edges and top
- `getTexture(int face, int data)` general texture lookup

`getItemAuxValueForBlockData()` and `getSpawnResourcesAuxValue()` handle the data-to-aux mapping.

### HayBlockTile

**File**: `Minecraft.World/HayBlockTile.h`, `.cpp`

Extends `RotatedPillarTile`. A directional block with top and side textures, just like logs.

| Property | Value |
|----------|-------|
| Base class | `RotatedPillarTile` |
| Material | `grass` |
| Render shape | `SHAPE_TREE` (pillar rendering) via `getRenderShape()` |
| Textures | `hay_block_top`, `hay_block_side` |

The `getTypeTexture(int type)` method (protected) returns the texture for the pillar end or side. `registerIcons()` sets up the two textures.

### NoteBlockTile

**File**: `Minecraft.World/NoteBlockTile.h`, `.cpp`

Extends `BaseEntityTile`. A tile entity that plays musical notes and responds to redstone.

| Property | Value |
|----------|-------|
| Base class | `BaseEntityTile` |
| Material | `wood` |
| Tile entity | `MusicTileEntity` |

**Behavior**:

- **Redstone signal** (`neighborChanged`): When a neighbor signal changes, plays the note if the signal transitions to on.
- **Right-click** (`use`): Increments the note pitch via `mte->tune()` and plays the note. Has a `soundOnly` parameter (4J addition).
- **Left-click** (`attack`): Plays the current note without changing pitch.
- **Note rendering** (`triggerEvent`): Calculates pitch as `pow(2, (note - 12) / 12.0)` and picks an instrument sound based on the block below:
  - Stone: bass drum
  - Sand/gravel: snare
  - Glass: hat (click)
  - Wood: bass guitar
  - Everything else: harp/piano
- Spawns a `note` particle colored by pitch.

`TestUse()` returns whether the note block can be right-clicked (used for tooltip display). `newTileEntity()` creates the `MusicTileEntity`.

### JukeboxTile (also in LCEMP)

**File**: `Minecraft.World/JukeboxTile.h`, `.cpp`

Extends `BaseEntityTile`. Plays and ejects music discs. LCEMP also has `RecordPlayerTile.cpp/.h`.

| Property | Value |
|----------|-------|
| Base class | `BaseEntityTile` |
| Material | `wood` |
| Tile entity | `JukeboxTile::Entity` (nested class) |
| Analog output | Yes (comparator signal based on disc ID) |
| Textures | `jukebox_side`, `jukebox_top` |

**JukeboxTile::Entity** is a nested class extending `TileEntity` with type `eTYPE_RECORDPLAYERTILE`. It stores a `shared_ptr<ItemInstance> record` and handles save/load using both the `RecordItem` compound tag and the legacy `Record` integer tag. Has a static `create()` factory and 4J-added `clone()` method.

**Behavior**:

- **Right-click** (`use`): Ejects the current disc if one is present (data value `1` means occupied). `TestUse()` checks if ejection is possible.
- **Disc ejection** (`dropRecording`): Fires `SOUND_PLAY_RECORDING` level event, clears the record, and spawns the disc as an `ItemEntity`.
- **Disc insertion** (`setRecord`): Sets the record in the tile entity and updates the data value.
- **Block removal** (`onRemove`): Ejects the disc before the block is destroyed.
- **Resource spawning** (`spawnResources`): Handles dropping the jukebox and its disc.
- **Comparator output** (`getAnalogOutputSignal`): Returns `record->id + 1 - Item::record_01_Id` when a disc is present, `hasAnalogOutputSignal()` returns `true`.

### BeaconTile

**File**: `Minecraft.World/BeaconTile.h`, `.cpp`

Extends `BaseEntityTile`. The beacon block that provides status effects in a radius.

| Property | Value |
|----------|-------|
| Base class | `BaseEntityTile` |
| Tile entity | `BeaconTileEntity` |
| Solid render | `false` |
| Cube shaped | `false` |
| Blocks light | `false` |

`use()` opens the beacon menu for the player. `TestUse()` returns whether interaction is possible. `setPlacedBy()` handles custom naming from the item.

### BeaconTileEntity

**File**: `Minecraft.World/BeaconTileEntity.h`, `.cpp`

Extends both `TileEntity` and `Container`. Entity type: `eTYPE_BEACONTILEENTITY`.

| Property | Value |
|----------|-------|
| Scale timer | `TICKS_PER_SECOND * 2` (40 ticks) |
| Effect tiers | `BEACON_EFFECTS_TIERS` = 4 |
| Effects per tier | `BEACON_EFFECTS_EFFECTS` = 3 |

Key state:

- `isActive` tracks whether the beacon has a clear sky view
- `levels` stores the pyramid tier (0 to 4)
- `primaryPower` / `secondaryPower` store the selected effect IDs
- `paymentItem` stores the payment item (iron ingot, gold ingot, diamond, or emerald)
- `clientSideRenderTick` / `clientSideRenderScale` handle the beam animation

Effects are stored in a static `BEACON_EFFECTS[4][3]` array initialized via `staticCtor()`.

The beacon `tick()` method periodically:

1. Checks for a clear line of sight to the sky
2. Counts the pyramid layers below
3. Applies status effects to nearby players via `applyEffects()`

Container methods implement the payment slot (1 slot, accepts specific items via `canPlaceItem()`). Full NBT save/load for all beacon properties.

### AnvilTile (also in LCEMP)

**File**: `Minecraft.World/AnvilTile.h`, `.cpp`

Extends `HeavyTile`. A gravity-affected block for item repair and renaming. LCEMP also has `AnvilTile.cpp/.h` and `AnvilTileItem.cpp/.h`.

| Property | Value |
|----------|-------|
| Base class | `HeavyTile` |
| Part types | `PART_BASE` (0), `PART_JOINT` (1), `PART_COLUMN` (2), `PART_TOP` (3) |
| Damage levels | `ANVIL_NAMES_LENGTH` = 3 |
| Cube shaped | `false` |
| Solid render | `false` |

Has a `part` field and `ANVIL_NAMES[3]` for the three damage levels (intact, slightly damaged, very damaged). Static `TEXTURE_DAMAGE_NAMES[3]` for damage-level textures. `use()` opens the anvil menu. `falling()` handles the falling entity behavior. `onLand()` handles landing and potential damage level increase.

### AnvilMenu

**File**: `Minecraft.World/AnvilMenu.h`, `.cpp`

The anvil crafting menu with repair and rename logic.

| Slot | Constant | Purpose |
|------|----------|---------|
| 0 | `INPUT_SLOT` | Item to repair |
| 1 | `ADDITIONAL_SLOT` | Material or second item |
| 2 | `RESULT_SLOT` | Repair output |
| 3-29 | `INV_SLOT_START` to `INV_SLOT_END` | Player inventory |
| 30-38 | `USE_ROW_SLOT_START` to `USE_ROW_SLOT_END` | Player hotbar |

Key fields: `cost` (XP cost), `repairItemCountCost`, `itemName`. `createResult()` computes the repair output. `setItemName()` handles renaming.

### CommandBlock

**File**: `Minecraft.World/CommandBlock.h`, `.cpp`

Extends `BaseEntityTile`. Executes commands when powered by redstone.

| Property | Value |
|----------|-------|
| Base class | `BaseEntityTile` |
| Trigger bit | `TRIGGER_BIT` = 1 |
| Tile entity | `CommandBlockEntity` |
| Analog output | Yes |

`neighborChanged()` handles redstone activation. `tick()` handles delayed execution. `use()` opens the command block UI. `hasAnalogOutputSignal()` returns `true`, `getAnalogOutputSignal()` returns the success count.

### CommandBlockEntity

**File**: `Minecraft.World/CommandBlockEntity.h`, `.cpp`

Extends both `TileEntity` and `CommandSender`. Entity type: `eTYPE_COMMANDBLOCKTILEENTITY`.

Stores `command` (wstring), `name` (wstring), and `successCount` (int). `performCommand()` executes the stored command. Implements `CommandSender` for permission checking and message sending. Full NBT save/load. Has `getUpdatePacket()` for network sync and `getCommandSenderWorldPosition()` / `getCommandSenderWorld()` for context.

### FlowerPotTile (also in LCEMP)

**File**: `Minecraft.World/FlowerPotTile.h`, `.cpp`

Extends `Tile`. A decorative block that holds plants. LCEMP also has `FlowerPotTile.cpp/.h`.

| Type constant | Value | Contents |
|---|---|---|
| `TYPE_FLOWER_RED` | 1 | Red flower |
| `TYPE_FLOWER_YELLOW` | 2 | Yellow flower |
| `TYPE_SAPLING_DEFAULT` | 3 | Oak sapling |
| `TYPE_SAPLING_EVERGREEN` | 4 | Spruce sapling |
| `TYPE_SAPLING_BIRCH` | 5 | Birch sapling |
| `TYPE_SAPLING_JUNGLE` | 6 | Jungle sapling |
| `TYPE_MUSHROOM_RED` | 7 | Red mushroom |
| `TYPE_MUSHROOM_BROWN` | 8 | Brown mushroom |
| `TYPE_CACTUS` | 9 | Cactus |
| `TYPE_DEAD_BUSH` | 10 | Dead bush |
| `TYPE_FERN` | 11 | Fern |

`use()` handles placing plants. Static helpers `getItemFromType()` and `getTypeFromItem()` convert between block data and item stacks. `spawnResources()` drops both the pot and its contents.

### SkullTile (also in LCEMP)

**File**: `Minecraft.World/SkullTile.h`, `.cpp`

Extends `BaseEntityTile`. Player and mob heads. LCEMP also has `SkullTile.cpp/.h`, `SkullTileEntity.cpp/.h`, and `SkullItem.cpp/.h`.

| Property | Value |
|----------|-------|
| Max skulls | `MAX_SKULL_TILES` = 40 |
| Placement mask | `PLACEMENT_MASK` = 0x7 |
| No-drop bit | `NO_DROP_BIT` = 0x8 |

`checkMobSpawn()` checks if three wither skulls are placed in a T-shape to spawn the Wither boss. `playerWillDestroy()` handles creative-mode no-drop behavior.

### SkullTileEntity

**File**: `Minecraft.World/SkullTileEntity.h`, `.cpp`

Entity type: `eTYPE_SKULLTILEENTITY`. Stores skull type, rotation, and extra data.

| Skull type | Value |
|---|---|
| `TYPE_SKELETON` | 0 |
| `TYPE_WITHER` | 1 |
| `TYPE_ZOMBIE` | 2 |
| `TYPE_CHAR` | 3 |
| `TYPE_CREEPER` | 4 |

Methods: `setSkullType()`, `getSkullType()`, `getRotation()`, `setRotation()`, `getExtraType()`. Full NBT save/load and `getUpdatePacket()` for network sync.

### WeightedPressurePlateTile

**File**: `Minecraft.World/WeightedPressurePlateTile.h`, `.cpp`

Extends `BasePressurePlateTile`. Entity-counting pressure plates (light and heavy variants).

| Property | Value |
|----------|-------|
| Base class | `BasePressurePlateTile` |
| Max weight | Passed via constructor |

`getSignalStrength()` counts entities above the plate and maps to a signal strength. `getSignalForData()` / `getDataForSignal()` handle data conversion. `getTickDelay()` returns the update interval.

### Other new tiles

| Block | File | Base class | Notes |
|-------|------|------------|-------|
| `GlowstoneTile` | `GlowstoneTile.h/cpp` | `Tile` | Light-emitting block with fortune-based drops |
| `NetherrackTile` | `NetherrackTile.h` | `Tile` | Simple block, no special behavior |
| `SoulSandTile` | `SoulSandTile.h/cpp` | `Tile` | Slows entities via `entityInside()`, reduced AABB height |
| `NetherWartTile` | `NetherWartTile.h/cpp` | `Bush` | 4-stage crop (`MAX_AGE = 3`), only grows on soul sand |
| `WoodButtonTile` | `WoodButtonTile.h` | `ButtonTile` | Wood variant of button |
| `StoneButtonTile` | `StoneButtonTile.h` | `ButtonTile` | Stone variant of button |
| `PoweredMetalTile` | `PoweredMetalTile.h/cpp` | -- | Iron and gold pressure plate variants |
| `RotatedPillarTile` | `RotatedPillarTile.h/cpp` | -- | Pillar block base (used by hay, logs) |
| `BasePressurePlateTile` | `BasePressurePlateTile.h/cpp` | -- | Base for all pressure plates |
| `BaseRailTile` | `BaseRailTile.h/cpp` | `Tile` | Base for all rail types |
| `BaseEntityTile` | `BaseEntityTile.h/cpp` | `Tile` | Base for tiles with tile entities |
| `ColoredTile` | `ColoredTile.h/cpp` | -- | Base for color-variant tiles |

## New items

### LeashItem

**File**: `Minecraft.World/LeashItem.h`, `.cpp`

Lets players tie leashed mobs to fence posts.

| Property | Value |
|----------|-------|
| Base class | `Item` |
| Key method | `useOn()` binds leashed mobs to a fence |

When used on a fence tile, it searches a 7-block radius for mobs leashed to the player, creates or finds a `LeashFenceKnotEntity` at that position, and attaches them. Has two static methods:

- `bindPlayerMobs()` does the actual binding with side effects
- `bindPlayerMobsTest()` is for tooltip prediction without side effects

The `useOn()` method has a `bTestUseOnOnly` parameter for tooltip support.

### NameTagItem

**File**: `Minecraft.World/NameTagItem.h`, `.cpp`

Lets you name mobs.

| Property | Value |
|----------|-------|
| Base class | `Item` |
| Key method | `interactEnemy()` |

When the item has a custom hover name and is used on a `Mob`, it sets the mob's custom name and calls `setPersistenceRequired()` to prevent despawning. Decrements the stack.

### EmptyMapItem

**File**: `Minecraft.World/EmptyMapItem.h`, `.cpp`

Creates a new map when used.

| Property | Value |
|----------|-------|
| Base class | `ComplexItem` |
| Key method | `use()` |

Creates a new `ItemInstance` of `Item::map` with aux value `-1`, calls `Item::map->onCraftedBy()` to initialize it, then decrements the empty map stack. If the player's stack isn't empty afterward, the new map is added to inventory or dropped.

### SpawnEggItem

**File**: `Minecraft.World/SpawnEggItem.h`, `.cpp`

Spawns mobs when used on a block or dispensed.

| Property | Value |
|----------|-------|
| Base class | `Item` |
| Multi-sprite | Yes (base + overlay for two-tone coloring) |
| Spawn count | `SPAWN_COUNT` = 1 |
| Key methods | `useOn()`, `use()`, `spawnMobAt()` |

Has a detailed `_eSpawnResult` enum with console-specific failure reasons:

| Result | Meaning |
|--------|---------|
| `eSpawnResult_OK` | Spawn successful |
| `FailTooManyPigsCowsSheepCats` | Passive mob cap reached |
| `FailTooManyChickens` | Chicken cap reached |
| `FailTooManySquid` | Squid cap reached |
| `FailTooManyBats` | Bat cap reached |
| `FailTooManyWolves` | Wolf cap reached |
| `FailTooManyMooshrooms` | Mooshroom cap reached |
| `FailTooManyAnimals` | General animal cap reached |
| `FailTooManyMonsters` | Monster cap reached |
| `FailTooManyVillagers` | Villager cap reached |
| `FailCantSpawnInPeaceful` | Peaceful mode blocks hostile spawns |

`spawnMobAt()` includes a 4J-added `piResult` parameter for reporting spawn failures back to the dispenser system. `canSpawn()` is a static helper for dispenser use. `DisplaySpawnError()` shows the failure message to the player.

Multi-sprite methods: `hasMultipleSpriteLayers()` returns `true`, `getLayerIcon()` returns per-layer icons, `getColor()` returns per-layer tint colors. `getHoverName()` returns the localized mob name.

### SimpleFoiledItem

**File**: `Minecraft.World/SimpleFoiledItem.h`, `.cpp`

A simple item that always renders with the enchantment glint ("foil").

| Property | Value |
|----------|-------|
| Base class | `Item` |
| Behavior | `isFoil()` always returns `true` |

Used for items like the Nether Star that should always look enchanted.

### FireworksItem

**File**: `Minecraft.World/FireworksItem.h`, `.cpp`

The firework rocket item. See the [Fireworks](/slop-docs/mc/fireworks/) page for full details.

### FireworksChargeItem

**File**: `Minecraft.World/FireworksChargeItem.h`, `.cpp`

The firework star item. See the [Fireworks](/slop-docs/mc/fireworks/) page for full details.

### ArmorDyeRecipe (also in LCEMP)

**File**: `Minecraft.World/ArmorDyeRecipe.h`, `.cpp`

A special crafting recipe that lets you dye leather armor. Takes leather armor plus one or more dyes and produces a dyed copy. LCEMP also has `ArmorDyeRecipe.cpp/.h`.

## Other new recipes

### MapCloningRecipe / MapExtendingRecipe

**Files**: `Minecraft.World/MapCloningRecipe.h`, `MapExtendingRecipe.h`

Special recipes for duplicating and extending maps.

## Registration

These blocks and items are registered in the global `Tile` and `Item` static initialization (in `Tile.cpp` and `Item.cpp` respectively). The stained glass and hay block tiles follow the standard `Tile::tiles[]` array pattern, while items use `Item::items[]` with their numeric IDs.

For more details on fireworks, see the [Fireworks](/slop-docs/mc/fireworks/) page. For horse-related items (armor, saddles), see the [Horses](/slop-docs/mc/horses/) page. For dispenser item behaviors, see the [Behavior System](/slop-docs/mc/behaviors/) page.

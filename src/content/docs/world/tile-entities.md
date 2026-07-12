---
title: Block Entities (TileEntity)
description: The 17 TileEntity subclasses in neoLegacy — registration, NBT save/load, ticking, update packets, and the skull tile entity.
---

A **TileEntity** is the extra per-block state that a plain block ID + data byte
can't hold: the items in a chest, the burn timer of a furnace, the lines on a
sign, the mob-spawner potential, the skull rotation. neoLegacy is a direct C++
port of the decompiled Java LCE code, so the class is still named `TileEntity`
(the modern Java rename to `BlockEntity` never happened here).

Files: `TileEntity.h`, `TileEntity.cpp`, plus one `*TileEntity.{h,cpp}` per
subclass.

## Base class

`class TileEntity : public enable_shared_from_this<TileEntity>`
(`TileEntity.h:13`). Every tile entity is heap-allocated and passed around as a
`shared_ptr<TileEntity>`. The base holds the block coordinates and a back-pointer
to its `Level`:

| Member | Type | Notes |
|--------|------|-------|
| `level` | `Level *` | owning world (public) |
| `x, y, z` | `int` | block position |
| `data` | `int` | cached block data byte, `-1` = "not yet fetched" |
| `tile` | `Tile *` | cached owning `Tile`, lazily resolved |
| `remove` | `bool` | scheduled for removal |
| `renderRemoveStage` | `unsigned char` | 4J-added render-side removal state machine |

The `renderRemoveStage` field and its `RenderRemoveStage` enum
(`e_RenderRemoveStageKeep` / `FlaggedAtChunk` / `Remove`, `TileEntity.h:32`) are a
**4J addition** not present in vanilla Java — they let the renderer keep drawing a
tile entity for one extra frame while its chunk mesh is rebuilt.

### Type identity

There is no RTTI. Each subclass overrides `GetType()` to return an `eINSTANCEOF`
bit-flag value (`Class.h`):

```cpp
virtual eINSTANCEOF GetType() { return eTYPE_TILEENTITY; }
```

The tile-entity type constants are `eTYPE_TILEENTITY | 0xNN`
(`Class.h:302-323`), e.g. `eTYPE_CHESTTILEENTITY = eTYPE_TILEENTITY | 0x01`,
`eTYPE_SKULLTILEENTITY = eTYPE_TILEENTITY | 0x0B`. The dispenser/dropper pair uses
its own inheritance bit: `eTYPE_DROPPERTILEENTITY = eTYPE_DISPENSERTILEENTITY |
0x1` (`Class.h:323`), so a dropper `instanceof` dispenser is true.

### Key virtuals

| Method | Purpose |
|--------|---------|
| `load(CompoundTag*)` | read `x/y/z` (+ subclass fields) from NBT |
| `save(CompoundTag*)` | write `id` string + `x/y/z` (+ subclass fields) |
| `tick()` | per-tick update (base is a no-op) |
| `getUpdatePacket()` | build a network sync packet (base returns `nullptr`) |
| `setChanged()` | mark dirty; refresh `data`, notify level, poke comparators |
| `getTile()` | lazily resolve and cache the owning `Tile*` |
| `triggerEvent(b0,b1)` | handle a `TileEventPacket`-style event |
| `clone()` | **pure virtual, 4J-added** — deep-copy for the render/edit path |

`clone()` being pure virtual (`TileEntity.h:72`) is a neoLegacy/4J requirement:
every subclass must implement it, and each calls the protected
`TileEntity::clone(shared_ptr<TileEntity>)` helper (`TileEntity.cpp:209`) to copy
the base fields before copying its own.

## Registration

There is **no numeric ID registry** for tile entities — they are keyed by a
save-id **string**. Registration happens in `TileEntity::staticCtor()`
(`TileEntity.cpp:14`), called from the master bootstrap
`MinecraftWorld_RunStaticCtors()` at line 53 (ordering is load-bearing; see
[Bootstrap](/slop-docs/world/overview/)).

```cpp
void TileEntity::setId(tileEntityCreateFn createFn, eINSTANCEOF clas, wstring id)
```
(`TileEntity.cpp:37`) fills two maps: `idCreateMap` (save-id string → factory
function) and `classIdMap` (`eINSTANCEOF` → save-id string). The factory is a
plain function pointer `typedef TileEntity *(*tileEntityCreateFn)()`
(`TileEntity.h:11`); each subclass exposes a static `create()` returning `new
Subclass()`.

### The 17 registered tile entities

Read directly from `TileEntity.cpp:16-34`. Note the **legacy save-id strings** —
they preserve the original Notchian/LCE names and several are surprising:

| # | Class | `eINSTANCEOF` | Save id | Notes |
|---|-------|---------------|---------|-------|
| 1 | `FurnaceTileEntity` | `eTYPE_FURNACETILEENTITY` | `L"Furnace"` | smelting |
| 2 | `ChestTileEntity` | `eTYPE_CHESTTILEENTITY` | `L"Chest"` | 27 slots |
| 3 | `EnderChestTileEntity` | `eTYPE_ENDERCHESTTILEENTITY` | `L"EnderChest"` | per-player storage |
| 4 | `JukeboxTile::Entity` | `eTYPE_RECORDPLAYERTILE` | `L"RecordPlayer"` | jukebox; nested class |
| 5 | `DispenserTileEntity` | `eTYPE_DISPENSERTILEENTITY` | `L"Trap"` | **id string is "Trap"** |
| 6 | `DropperTileEntity` | `eTYPE_DROPPERTILEENTITY` | `L"Dropper"` | subclass of dispenser |
| 7 | `SignTileEntity` | `eTYPE_SIGNTILEENTITY` | `L"Sign"` | 4 text lines |
| 8 | `MobSpawnerTileEntity` | `eTYPE_MOBSPAWNERTILEENTITY` | `L"MobSpawner"` | wraps `BaseMobSpawner` |
| 9 | `MusicTileEntity` | `eTYPE_MUSICTILEENTITY` | `L"Music"` | note block |
| 10 | `PistonPieceEntity` | `eTYPE_PISTONPIECEENTITY` | `L"Piston"` | moving piston head |
| 11 | `BrewingStandTileEntity` | `eTYPE_BREWINGSTANDTILEENTITY` | `L"Cauldron"` | **id string is "Cauldron"** |
| 12 | `EnchantmentTableEntity` | `eTYPE_ENCHANTMENTTABLEENTITY` | `L"EnchantTable"` | book animation |
| 13 | `TheEndPortalTileEntity` | `eTYPE_THEENDPORTALTILEENTITY` | `L"Airportal"` | **id string is "Airportal"** |
| 14 | `CommandBlockEntity` | `eTYPE_COMMANDBLOCKTILEENTITY` | `L"Control"` | **id string is "Control"** |
| 15 | `BeaconTileEntity` | `eTYPE_BEACONTILEENTITY` | `L"Beacon"` | has its own `staticCtor` |
| 16 | `SkullTileEntity` | `eTYPE_SKULLTILEENTITY` | `L"Skull"` | see [Skulls](#skull-tile-entity) |
| 17 | `DaylightDetectorTileEntity` | `eTYPE_DAYLIGHTDETECTORTILEENTITY` | `L"DLDetector"` | redstone |
| — | `HopperTileEntity` | `eTYPE_HOPPERTILEENTITY` | `L"Hopper"` | item transport |
| — | `ComparatorTileEntity` | `eTYPE_COMPARATORTILEENTITY` | `L"Comparator"` | redstone |

That is 19 `setId` calls for 17 distinct game blocks (dispenser+dropper share a
base; the count of "17 subclasses" excludes the abstract dispenser base being
counted once). The `Cauldron`/`Airportal`/`Control`/`Trap` mismatches are
original LCE names kept for **save compatibility** — renaming them would silently
drop existing tile entities on load.

## NBT save / load

`TileEntity::save()` (`TileEntity.cpp:79`) writes the save-id string looked up
from `classIdMap`, then the coordinates:

```cpp
tag->putString(L"id", (*it).second);
tag->putInt(L"x", x);
tag->putInt(L"y", y);
tag->putInt(L"z", z);
```

If the class isn't in `classIdMap` the save is skipped (the Java
`IllegalArgumentException` is commented out — a recurring "TODO 4J Stu" pattern
throughout the port). `load()` (`TileEntity.cpp:72`) reads back `x/y/z`.

Deserialization goes through the static `loadStatic(CompoundTag*)`
(`TileEntity.cpp:98`): it reads the `id` string, looks up the factory in
`idCreateMap`, constructs the entity, and calls `load()`. An **unknown id is
silently skipped** (only logged under `_DEBUG`), so a save from a newer TU with
an unrecognized tile entity degrades gracefully rather than crashing.

Subclasses chain to the base and add their own tags — for example
`FurnaceTileEntity` overrides `save`/`load` to persist `litTime`, `litDuration`,
its `items` array, and a custom `name` (`FurnaceTileEntity.h:58`).

## Ticking

Not every tile entity ticks. The base `tick()` is empty (`TileEntity.cpp:94`);
subclasses opt in by overriding it and are ticked by the level's tile-entity list
(see [Level](/slop-docs/world/storage/)). Ticking subclasses include:

- **`FurnaceTileEntity`** — decrements `litTime`, advances `tickCount` toward
  `BURN_INTERVAL`, calls `burn()` when a smelt completes
  (`FurnaceTileEntity.h:36-70`). Tracks `m_charcoalUsed` for the 4J-added
  "Renewable Energy" achievement.
- **`HopperTileEntity`** — moves items on a cooldown. `MOVE_ITEM_SPEED = 8`
  ticks, `cooldownTime` counts down (`HopperTileEntity.h:15,20,43`).
- **`BeaconTileEntity`** — recomputes its pyramid and re-applies effects.
  `SCALE_TIME = SharedConstants::TICKS_PER_SECOND * 2`; scans
  `BEACON_EFFECTS[4][3]` (`BeaconTileEntity.h:14-19`).
- **`MobSpawnerTileEntity`** — delegates to an inner `TileEntityMobSpawner :
  BaseMobSpawner` (`MobSpawnerTileEntity.h:17`) that owns the spawn timer, mob
  potential, and render-mob rotation.
- **`ChestTileEntity`** — animates the lid via `openCount` / `tickInterval`
  (`ChestTileEntity.h:43-45`).

`BeaconTileEntity::staticCtor()` (`BeaconTileEntity.h:21`, bootstrap line 85)
fills the static `BEACON_EFFECTS` table — it is the only tile entity with its own
static constructor, run separately from `TileEntity::staticCtor`.

## Update packets

Tile entities that need per-block client sync override `getUpdatePacket()` and
return a `TileEntityDataPacket`. The packet carries a small **type discriminator**
(`TileEntityDataPacket.h`):

| Constant | Value | Used by |
|----------|-------|---------|
| `TYPE_MOB_SPAWNER` | 1 | `MobSpawnerTileEntity` |
| `TYPE_ADV_COMMAND` | 2 | `CommandBlockEntity` |
| `TYPE_BEACON` | 3 | `BeaconTileEntity` |
| `TYPE_SKULL` | 4 | `SkullTileEntity` |

`SignTileEntity` and `BeaconTileEntity` also override `getUpdatePacket()`. Blocks
without an override (chest, furnace, hopper) sync through their **container menu**
instead — see [Container Menus](/slop-docs/world/containers/).

## Skull tile entity

Files: `SkullTileEntity.h`, `SkullTileEntity.cpp`, `SkullTile.h`,
`SkullTile.cpp`, `SkullItem.{h,cpp}`.

`SkullTileEntity` stores the skull variant and its facing rotation. The five
variant constants are defined on the class (`SkullTileEntity.h:11-15`):

| Constant | Value |
|----------|-------|
| `TYPE_SKELETON` | 0 |
| `TYPE_WITHER` | 1 |
| `TYPE_ZOMBIE` | 2 |
| `TYPE_CHAR` | 3 (player / "Steve" head) |
| `TYPE_CREEPER` | 4 |

State: `skullType` (`int`), `rotation` (`int`), and `extraType` (`wstring`, used
for player-head owner data). NBT round-trips as byte tags plus a string
(`SkullTileEntity.cpp:13-27`):

```cpp
tag->putByte(L"SkullType", static_cast<BYTE>(skullType & 0xff));
tag->putByte(L"Rot",       static_cast<BYTE>(rotation & 0xff));
tag->putString(L"ExtraType", extraType);
```

`load()` only reads `ExtraType` if the tag `contains` it, so pre-player-head
saves load cleanly.

The update packet uses the skull discriminator (`SkullTileEntity.cpp:29`):

```cpp
return std::make_shared<TileEntityDataPacket>(x, y, z,
    TileEntityDataPacket::TYPE_SKULL, tag);
```

### The 3D skull rendering

neoLegacy renders skulls as **full 3D models** on the floor / wall (rotatable via
the `rotation` field), rather than the flatter early-LCE representation. The block
side supports this: `SkullTile : public BaseEntityTile` (`SkullTile.h:6`) uses a
non-cube render shape (`getRenderShape()`, `isCubeShaped()` return the
tile-entity render path) and a custom `getAABB()` so the model isn't a full block.
Placement packs the facing into the data byte via `PLACEMENT_MASK = 0x7`, with
`NO_DROP_BIT = 0x8` (`SkullTile.h:13-14`); `MAX_SKULL_TILES = 40` caps how many
skull tile entities render per chunk region (`SkullTile.h:11`). `setPlacedBy()`
seeds the `SkullTileEntity` rotation from the placing entity's yaw, and
`checkMobSpawn()` handles the wither-summon check when three wither skulls are
arranged with soul sand.

> The 3D skull model support is attributed to neoLegacy contributor work; the
> exact rotation-to-model mapping lives in the render module, not
> `Minecraft.World`, so it is out of scope here.

## Related

- [Container Menus](/slop-docs/world/containers/) — the GUI side of chests,
  furnaces, hoppers, beacons, brewing stands.
- [Tiles / Blocks](/slop-docs/world/blocks/) — `BaseEntityTile` and how a block
  spawns its tile entity via `newTileEntity()`.
- [Networking / Packets](/slop-docs/world/networking/) — `TileEntityDataPacket` and
  the container packet family.
- [Redstone](/slop-docs/world/redstone/) — comparator, daylight detector,
  hopper, and piston-piece entities.

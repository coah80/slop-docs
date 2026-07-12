---
title: Level Storage & IO
description: The Level/LevelChunk runtime, the NBT tag system, region-based chunk storage, and the LCE console save-file format in neoLegacy.
---

neoLegacy stores worlds the way the console edition always did: not as a directory
tree of `.mca` files, but as a **single flat console save container** with an
internal file table. On top of that container sits a McRegion-style chunk store, a
ported NBT (`Tag`) system, and the compressed per-chunk storage classes that let
the console keep a whole column resident in memory cheaply. Chunk *coordinates* and
NBT *key names* stay byte-compatible with Java LCE, but the outer file format is
entirely console-specific.

Files: `Level.h`/`Level.cpp`, `LevelChunk.h`/`LevelChunk.cpp`, `Tag.h`/`Tag.cpp`,
`McRegionChunkStorage.h`/`.cpp`, `OldChunkStorage.cpp`, `ConsoleSaveFile.h`,
`FileHeader.h`, `LevelData.h`.

## Level runtime

`class Level : public LevelSource` (`Level.h`) is the largest translation unit in
the module and holds the world's in-memory state — loaded chunks, entity lists,
tile-tick scheduling, weather, and time. The world dimensions are fixed by these
constants (`Level.h:71-100`):

| Constant | Value | Meaning |
|----------|-------|---------|
| `maxBuildHeight` | `256` | World height (brought forward from 1.2.3) |
| `minBuildHeight` | `0` | |
| `maxMovementHeight` | `512` | Movement clamp above build height |
| `MAX_LEVEL_SIZE` | `30000000` | World border (±30M blocks) |
| `CHUNK_TILE_COUNT` | `256 * 16 * 16` = 65536 | Tiles per chunk column |
| `HALF_CHUNK_TILE_COUNT` | `32768` | One half-column |
| `COMPRESSED_CHUNK_SECTION_HEIGHT` | `128` | Section height for compressed storage |
| `MAX_BRIGHTNESS` | `15` | |
| `TICKS_PER_DAY` | `20 * 60 * 20` = 24000 | |

Note the column is split at height 128 into a **lower** (0–127) and **upper**
(128–255) half throughout the storage code — this is the console optimization that
lets the engine keep the frequently-touched lower half hot and lazily manage the
upper half.

Key `Level` operations include `getTile(x,y,z)`, `getBiome`/`getBiomeSource`,
`addEntity`, tile-tick scheduling (`addToTickNextTick`, `forceAddTileTick`, capped
at `MAX_TICK_TILES_PER_TICK` = 1000, `Level.h:58`), and the per-tick pumps
`tick()` / `tickEntities()` / `tickWeather()` / `tickClientSideTiles()`. The
server variant is `ServerLevel` (registered via `ServerLevel::staticCtor` in the
bootstrap, `Minecraft.World.cpp`).

## LevelChunk

`class LevelChunk` (`LevelChunk.h:25`) is one 16×16×256 column. Unlike Java, the
raw block/data/light arrays are **private and wrapped in compressed storage
objects**, each split lower/upper (`LevelChunk.h:48-76`):

| Storage | Type | Range | Holds |
|---------|------|-------|-------|
| `lowerBlocks` / `upperBlocks` | `CompressedTileStorage *` | 0–127 / 128–255 | Block IDs |
| `lowerData` / `upperData` | `SparseDataStorage *` | 0–127 / 128–255 | 4-bit block metadata |
| `lowerSkyLight` / `upperSkyLight` | `SparseLightStorage *` | 0–127 / 128–255 | Sky light nibbles |
| `lowerBlockLight` / `upperBlockLight` | `SparseLightStorage *` | 0–127 / 128–255 | Block light nibbles |

Access goes through public methods that speak fixed-size byte arrays in **Java
ordering**, so the on-disk layout stays compatible: `setBlockData`/`getBlockData`
(32768-byte arrays), `setDataData`/`getDataData`, and the light getters/setters
which take 16384-byte arrays (`128 × 16 × 16 × 0.5`, `LevelChunk.h:78-81`). Each
storage also has `writeCompressed…`/`readCompressed…` methods
(`LevelChunk.h:87-95`) that stream the compressed form directly — this is what the
`SAVE_FILE_VERSION_COMPRESSED_CHUNK_STORAGE` save version (below) writes.

Other per-chunk state: `biomes` (public `byteArray`), `heightmap`, `rainHeights`,
`columnFlags` (lighting flags packed into nibbles), a `tileEntities` map keyed by
`TilePos`, and `entityBlocks` (per-16-block-slice entity vectors,
`ENTITY_BLOCKS_LENGTH = maxBuildHeight/16` = 16). Terrain-population progress is a
bitfield in `terrainPopulated` (`LevelChunk.h:107-120`), tracking which neighbours
have finished their decoration passes.

`CompressedTileStorage`, `SparseLightStorage`, and `SparseDataStorage` each have a
`::staticCtor()` run in the bootstrap block (`Minecraft.World.cpp`) — they set up
their shared compression tables once at startup.

## NBT tag system

The `Tag` hierarchy (`Tag.h`) is a faithful port of `com.mojang.nbt`. `class Tag`
is abstract with the standard type IDs (`Tag.h:10-21`):

| ID | Constant | Class |
|----|----------|-------|
| 0 | `TAG_End` | `EndTag` |
| 1 | `TAG_Byte` | `ByteTag` |
| 2 | `TAG_Short` | `ShortTag` |
| 3 | `TAG_Int` | `IntTag` |
| 4 | `TAG_Long` | `LongTag` |
| 5 | `TAG_Float` | `FloatTag` |
| 6 | `TAG_Double` | `DoubleTag` |
| 7 | `TAG_Byte_Array` | `ByteArrayTag` |
| 8 | `TAG_String` | `StringTag` |
| 9 | `TAG_List` | `ListTag<Tag>` |
| 10 | `TAG_Compound` | `CompoundTag` |
| 11 | `TAG_Int_Array` | `IntArrayTag` |

Every subclass implements `write(DataOutput*)`, `load(DataInput*, tagDepth)`,
`toString()`, `getId()`, and `copy()` (`Tag.h:30-45`). Named tags on the wire are
`[type byte][UTF name][payload]`, handled by `Tag::readNamedTag` /
`Tag::writeNamedTag` (`Tag.cpp:85`, `:140`), with `Tag::newTag(type, name)` as the
factory switch (`Tag.cpp:153`).

### neoLegacy hardening (vs vanilla TU19)

The Java code trusted its NBT input; the port adds hard limits to stop a malformed
or hostile save/stream from exhausting memory or recursing forever
(`Tag.cpp:87-122`):

```cpp
if (depth > 256) { depth--; return new EndTag(); }        // recursion cap
const int MAX_TOTAL_TAGS = 32768;
if (totalTagCount > MAX_TOTAL_TAGS) { ... return new EndTag(); }
```

`Tag::MAX_DEPTH` is declared as `512` (`Tag.h:22`), but the thread-local guard in
`readNamedTag` caps effective nesting at **256** and total tag count at **32768**,
returning an `EndTag` (a safe no-op) instead of throwing. A type byte of `255`
(a `-1` read from an exhausted stream) is also treated as end-of-data
(`Tag.cpp:118`). These caps are neoLegacy additions, not present in the original 4J
code.

## Chunk / region storage

`class McRegionChunkStorage : public ChunkStorage` (`McRegionChunkStorage.h:12`) is
the active chunk store. It writes chunk NBT into the console save container through
`RegionFileCache`, on up to **three background save threads**
(`s_saveThreads[3]`, `McRegionChunkStorage.h:23`) fed by a shared
`s_chunkDataQueue`. `WaitForAll()` / `WaitIfTooManyQueuedChunks()` throttle the
producer against those threads (`McRegionChunkStorage.h:36-37`).

A saved chunk is a single `CompoundTag` with one child compound named `"Level"`
(`McRegionChunkStorage.cpp:205-207`):

```cpp
CompoundTag *tag = new CompoundTag();
CompoundTag *levelData = new CompoundTag();
tag->put(L"Level", levelData);
OldChunkStorage::save(levelChunk, level, levelData);
NbtIo::write(tag, output);
```

The `"Level"` compound uses the classic McRegion key names (from
`OldChunkStorage.cpp`): `xPos` / `zPos`, `Blocks`, `Data`, `SkyLight`,
`BlockLight`, `HeightMap`, `Biomes`, `Entities`, `TileEntities`, `TileTicks`,
`TerrainPopulated`, `TerrainPopulatedFlags`, `LastUpdate`, and `InhabitedTime`.
`TerrainPopulatedFlags` (the full neighbour bitfield) and `InhabitedTime` are the
newer additions over the earliest LCE format — `InhabitedTime` corresponds to the
`SAVE_FILE_VERSION_CHUNK_INHABITED_TIME` (1.6.4) save version.

On load, `McRegionChunkStorage::load` reads the NBT (`NbtIo::read`), verifies the
chunk has a `"Level"` compound containing `"Blocks"` (`McRegionChunkStorage.cpp:122`,
`:130`), and delegates to `OldChunkStorage::load`. Entities are saved and loaded
separately (`saveEntities`/`loadEntities`), keyed by a packed
`(x << 32) | z` chunk index.

### The storage stack

Several decorator/alternative stores exist around the same `ChunkStorage` /
`LevelStorage` interfaces:

- `McRegionLevelStorage` / `McRegionLevelStorageSource` — level-metadata side of
  the region store.
- `DirectoryLevelStorage` / `DirectoryLevelStorageSource` — directory-backed
  variant.
- `ChunkStorageProfileDecorator`, `LevelStorageProfilerDecorator` — profiling
  wrappers.
- `MemoryLevelStorage`, `MockedLevelStorage` — in-memory / test stores.

`McRegionChunkStorage::staticCtor` is invoked in the bootstrap block
(`Minecraft.World.cpp`) alongside the compressed-storage static ctors.

## The console save-file format

Everything above ultimately lands in a **console save container**, abstracted by
`class ConsoleSaveFile` (`ConsoleSaveFile.h:6`). This is the LCE `.mcs`-style
single-file save, not a folder of region files. The interface is pure-virtual and
platform-backed; concrete/related classes are `ConsoleSaveFileOriginal` (legacy
reader), `ConsoleSaveFileIO`, `ConsoleSaveFileInputStream`/`OutputStream`,
`ConsoleSaveFileConverter`, and `ConsoleSavePath`.

Files inside the container are addressed by `ConsoleSavePath` and manipulated with
handle-style operations: `createFile`, `deleteFile`, `setFilePointer`, `readFile`,
`writeFile`, `zeroFile`, `closeHandle`, and `finalizeWrite`
(`ConsoleSaveFile.h:11-18`). Chunk data is fetched by prefix and dimension —
`getFilesWithPrefix(prefix)` and `getRegionFilesByDimension(dimensionIndex)`
(`ConsoleSaveFile.h:30-31`) are what `McRegionChunkStorage` uses to enumerate
region blobs.

### Header layout

The container header is a small fixed footer (`FileHeader.h:6-11`):

```
[4 bytes] offset of the header (the header is stored at the end of the file)
[4 bytes] size of the header
[2 bytes] version the save was first generated at
[2 bytes] version the save should now be at
```

`SAVE_FILE_HEADER_SIZE` is `12` (`FileHeader.h:11`). File entries are stored as
`FileEntrySaveDataV1` / `V2` structs whose field order and size are deliberately
frozen for forward compatibility (`FileHeader.h:77`+).

### Save versions

`enum ESaveVersions` (`FileHeader.h:13-46`) is the migration ladder. Older saves
are upgraded (or partially discarded) as the version rises:

| Value | Constant | Introduced |
|-------|----------|-----------|
| 1 | `SAVE_FILE_VERSION_PRE_LAUNCH` | Pre-release |
| 2 | `SAVE_FILE_VERSION_LAUNCH` | Xbox 360 launch |
| 3 | `SAVE_FILE_VERSION_POST_LAUNCH` | First save-breaking change |
| 4 | `SAVE_FILE_VERSION_NEW_END` | The End added; older saves lose End data |
| 5 | `SAVE_FILE_VERSION_MOVED_STRONGHOLD` | Stronghold gen changed |
| 6 | `SAVE_FILE_VERSION_CHANGE_MAP_DATA_MAPPING_SIZE` | PS3 playeruid format |
| 7 | `SAVE_FILE_VERSION_DURANGO_CHANGE_MAP_DATA_MAPPING_SIZE` | Xbox One playeruid format |
| 8 | `SAVE_FILE_VERSION_COMPRESSED_CHUNK_STORAGE` | Chunks store the compressed storage form directly |
| 9 | `SAVE_FILE_VERSION_CHUNK_INHABITED_TIME` | `InhabitedTime` added (1.6.4) |

`SAVE_FILE_VERSION_NUMBER` is `SAVE_FILE_VERSION_NEXT - 1` (`FileHeader.h:75`), so
the current write version tracks the last real entry automatically. The comment at
`FileHeader.h:43` warns that any new version also needs the standalone save
conversion tool updated.

### Platform tagging

Saves carry a platform FourCC so a world made on one console can be converted for
another (`FileHeader.h:51-74`):

| Constant | FourCC |
|----------|--------|
| `SAVE_FILE_PLATFORM_X360` | `'X360'` |
| `SAVE_FILE_PLATFORM_XBONE` | `'XB1_'` |
| `SAVE_FILE_PLATFORM_PS3` | `'PS3_'` |
| `SAVE_FILE_PLATFORM_PS4` | `'PS4_'` |
| `SAVE_FILE_PLATFORM_PSVITA` | `'PSV_'` |
| `SAVE_FILE_PLATFORM_WIN64` | `'WIN_'` |

`ConsoleSaveFile` exposes endianness handling (`getSaveEndian`, `getLocalEndian`,
`isSaveEndianDifferent`, `ConvertToLocalPlatform`, `ConvertRegionFile`) precisely
because the original consoles differed in byte order — a PS3 (big-endian) save read
on a little-endian target needs byte-swapping. `SAVE_FILE_PLATFORM_LOCAL` is
selected at compile time by the platform macros (`FileHeader.h:61-73`), so the
Windows/`WIN64` build treats `'WIN_'` as native.

`VER_PRODUCTBUILD` (the `BUILD_NUMBER 570` from
[Networking](/slop-docs/world/networking/)) is also stamped into save filenames
(`ConsoleSaveFileOriginal.cpp:1033`), tying the save tag to the network build.

> **Changed in v1.1.0b** (`48b80ba8 fix: world format discrepancies`, merged as
> `245cbb18 fix(?): world save region stuff yay (#45)`): the split-vs-legacy region
> layout is no longer decided by the save platform. `RegionFileCache::_getRegionFile`
> now keys entirely off the presence of a `region_format_16` marker file inside the
> container — the old `if (useSplitSaves(saveFile->getSavePlatform()))` gate around
> the split-vs-`.mcr` filename choice is gone, so DLC worlds (and any world) can load
> either format. The same simplification is applied in `_getChunkDataInputStream` /
> `_getChunkDataOutputStream`, where the guard dropped from
> `useSplitSaves(...) && isNew` to just `isNew`. And in `ConsoleSaveFileOriginal`'s
> constructor the `if (bLevelGenBaseSave) header.AddFile(L"region_format_16")` stamp
> (added when re-reading an existing base-gen header) was removed — a fresh save's
> `else` branch still stamps `region_format_16`. This is the "universal DLC-capable
> save format" line in `NOTES.md`. The header/`ESaveVersions`/platform-FourCC layout
> described above is unchanged.
>
> Note that `RegionFileCache::useSplitSaves` (which already lists `XBONE`/`PS4`/`WIN64`)
> and `MinecraftServer::loadLevel`'s `ConvertToLocalPlatform()` call are **already
> present at this snapshot** — the pre-squash `48b80ba8` introduced them relative to
> its own parent, but they predate `47e5cba3`, so they are not part of the
> snapshot→v1.1.0b delta.

## World metadata

`LevelData` / `DerivedLevelData` (`LevelData.h`) hold the per-world header:
seed, spawn point, time, weather state, game type, and on-disk size (updated by the
chunk store via `setSizeOnDisk`, `McRegionChunkStorage.cpp:235`). `DerivedLevelData`
is the client-side read-through view used when a world is loaded remotely.

## Related pages

- [Networking & Packets](/slop-docs/world/networking/) — chunk data is also streamed live via `ChunkTilesUpdatePacket` (52) and `BlockRegionUpdatePacket` (51).
- [Tile Entities](/slop-docs/world/tile-entities/) — the `TileEntities` NBT list and their save-id strings.
- [World Generation](/slop-docs/world/worldgen/) — what fills a chunk before it is first saved (`TerrainPopulated`).
- [Dimensions](/slop-docs/world/dimensions/) — region files are grouped by dimension index.

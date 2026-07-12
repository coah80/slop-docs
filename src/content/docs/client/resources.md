---
title: Texture Packs & Resources
description: The TexturePack hierarchy (Default/File/Folder/DLC), TexturePackRepository, the ArchiveFile zip reader, ResourceLocation, the biome ColourTable, and the (stubbed) HTTP skin-streaming path.
---

Everything the client draws — terrain, mobs, GUI, fonts, the biome grass/water
tints — is served through one abstraction: a **`TexturePack`**. The active pack
is owned by the repository at `Minecraft::skins` (a `TexturePackRepository*`,
declared at `Minecraft.h:169`). "Skins" is a misnomer inherited from the Java
port — the repository manages full texture packs, and the console skin-select
carousel is a separate system layered on top (see
[Skin Select](/slop-docs/client/settings/)).

Files: `TexturePack.h`, `AbstractTexturePack.h`/`.cpp`, `DefaultTexturePack.h`/`.cpp`,
`FileTexturePack.h`/`.cpp`, `FolderTexturePack.h`/`.cpp`, `DLCTexturePack.h`/`.cpp`,
`TexturePackRepository.h`/`.cpp`, `ArchiveFile.h`/`.cpp`, `ResourceLocation.h`,
`Common/Colours/ColourTable.h`/`.cpp`.

## The TexturePack hierarchy

`TexturePack` (`TexturePack.h`) is a pure-virtual interface. Every concrete pack
derives from **`AbstractTexturePack`**, which carries the shared state (id, name,
descriptions, icon/comparison image bytes, a `fallback` pack, and a
`ColourTable*`). The abstract base implements `getResource(name, allowFallback)`
by delegating to a per-subclass `getResourceImplementation(name)` and, on miss,
walking the `fallback` chain.

```
TexturePack                       (pure interface)
└─ AbstractTexturePack            (shared id/name/desc/icon/fallback/colourTable)
   ├─ DefaultTexturePack          (built-in — the shipped Common/res tree)
   ├─ FileTexturePack             (a single archive file)
   ├─ FolderTexturePack           (a loose folder on disk)
   └─ DLCTexturePack              (backed by a DLCPack; Mash-Up packs)
```

| Class | Backing store | `getResourceImplementation` reads from |
|-------|---------------|-----------------------------------------|
| `DefaultTexturePack` | shipped `Common/res` tree | `InputStream::getResourceAsStream(drive + name)`, drive `Common\res\TitleUpdate\res` (`DefaultTexturePack.cpp:100`) |
| `FileTexturePack` | one archive file | its `ArchiveFile` |
| `FolderTexturePack` | a folder | files under that folder (uses a folder-mode `ArchiveFile`) |
| `DLCTexturePack` | a `DLCPack` (info + data) | its `ArchiveFile` (`m_archiveFile`), plus a `StringTable` for localised names |

### AbstractTexturePack — the shared contract

Key virtuals every pack answers (`TexturePack.h`):

| Member | Purpose |
|--------|---------|
| `hasData()` / `isLoadingData()` / `loadData()` | async load state (DLC packs mount lazily) |
| `hasAudio()` / `setHasAudio()` | pack ships its own sound banks (Mash-Up packs) |
| `load(Textures*)` / `unload(Textures*)` | bind/release the pack's textures |
| `getResource(name, allowFallback)` | resolve an asset stream, optionally via `fallback` |
| `hasFile(name, allowFallback)` | existence check with fallback |
| `isTerrainUpdateCompatible()` | whether the pack's terrain matches the current TU atlas |
| `getColourTable()` | the pack's biome `ColourTable` |
| `getArchiveFile()` | the pack's `ArchiveFile` (nullptr for `DefaultTexturePack`) |
| `getImageResource(...)` | decode an asset into a `BufferedImage` |
| `loadUI()` / `unloadUI()` / `getXuiRootPath()` | swap the front-end skin |
| `getPackIcon()` / `getPackComparison()` | pack thumbnail + before/after image bytes |
| `getDLCPack()` / `getDLCParentPackId()` / `getDLCSubPackId()` | DLC lineage (nullptr/0 for non-DLC) |

`DefaultTexturePack` is constructed with id `0`, name `L"Minecraft"`, and a
`nullptr` fallback (`DefaultTexturePack.cpp:7`); it eagerly calls `loadIcon()`,
`loadName()`, `loadDescription()`, and `loadColourTable()` in its constructor
because "these calls need to be in the most derived version of the class."
`hasFile()` always returns `true` — the default pack is assumed to contain
everything.

### DLCTexturePack

The most complex pack. It holds **two** `DLCPack`s — `m_dlcInfoPack`
(description, icon) and `m_dlcDataPack` (the actual textures) — plus its own
`StringTable` for localised strings such as `IDS_DISPLAY_NAME`,
`IDS_TP_DESCRIPTION`, `IDS_WORLD_NAME` (`DLCTexturePack.h:30-32`). It exposes
`packMounted(...)` as the async mount callback and tracks `m_bLoadingData` /
`m_bHasLoadedData`. On Xbox it additionally owns a Miles `IXACT3WaveBank` /
`IXACT3SoundBank` so Mash-Up packs can ship their own music (`DLCTexturePack.h:35-37`).

## TexturePackRepository

`TexturePackRepository` (`TexturePackRepository.h`) enumerates available packs,
caches them by id, and tracks the selected pack. It is created with a working
directory and a `Minecraft*`.

Reserved ids:

| Constant | Value | Meaning |
|----------|-------|---------|
| `DEFAULT_TEXTURE_PACK_ID` | `0` | the built-in pack |
| `FOLDER_TEST_TEXTURE_PACK_ID` | `1` | debug loose-folder pack (`addDebugPacks()`) |
| `DLC_TEST_TEXTURE_PACK_ID` | `2` | debug DLC pack |
| `MAX_WEB_FILESIZE` | `10 * 1000 * 1000` | 10 MB cap on downloaded web skins |

Selection and enumeration API:

| Member | Purpose |
|--------|---------|
| `selectSkin(TexturePack*)` | switch the active pack |
| `selectTexturePackById(DWORD)` / `getTexturePackById(DWORD)` | select/look-up by id |
| `getSelected()` / `getDefault()` | current / built-in pack |
| `isUsingDefaultSkin()` | `selected == DEFAULT_TEXTURE_PACK` |
| `getAll()` / `getTexturePackCount()` / `getTexturePackByIndex()` | enumeration |
| `getTexturePackIdNames()` | `(id, name)` pairs for the UI list |
| `addTexturePackFromDLC(DLCPack*, DWORD)` | register a downloaded pack |
| `clearInvalidTexturePacks()` / `removeTexturePackById()` | prune |
| `updateList()` / `updateUI()` / `needsUIUpdate()` | rescan / refresh the front-end |
| `selectWebSkin(url)` / `isUsingWebSkin()` / `resetWebSkin()` | web-skin path (see below) |

`Minecraft::getCurrentTexturePackId()` (`Minecraft.h:347`) surfaces the selected
id to the rest of the engine. `isUsingDefaultSkin()` is consulted in surprising
places — the [sound engine](/slop-docs/client/audio/) uses it to decide whether a
Mash-Up pack may supply multiple music tracks per domain.

### The web-skin path

`selectWebSkin(url)` / `downloadWebSkin(url, file)` download a texture pack over
HTTP into the working directory, capped at `MAX_WEB_FILESIZE` (10 MB). The
`usingWeb` flag and `shouldPromptForWebSkin()` / `canUseWebSkin()` gate the flow.
This is distinct from the HTTP **player-skin** streaming below, which pulls a
single player's skin image rather than a whole pack.

## ArchiveFile — the pack archive reader

`ArchiveFile` (`ArchiveFile.h`) is neoLegacy's archive reader. It is **not a ZIP
reader** despite the map's shorthand — the format is a custom flat archive: a
`readInt()` file count, then per-entry `readUTF()` name + `readInt()` pointer +
`readInt()` size (`ArchiveFile.cpp:9-30`). Two details matter for modders:

- **Compressed entries are marked by a leading `*` on the filename.** The reader
  strips the asterisk and sets `isCompressed`; on read, the first 4 bytes are the
  decompressed size and the remainder is fed through `Compression::getCompression()->Decompress(...)` (`ArchiveFile.cpp:212-232`).
- **Folder mode.** Constructed with `allowFolder = true` on a directory, it
  wraps a `FolderFile` and serves loose files directly — this is how
  `FolderTexturePack` reuses the same API (`ArchiveFile.cpp:39-44`).

On 64-bit targets (`_XBOX_ONE`, `__ORBIS__`, `_WINDOWS64`) the whole archive is
slurped into `m_cachedData` and reads are `memcpy`s; on other platforms each
`getFile()` opens the source file with `CreateFile` + `SetFilePointer` and reads
the entry range on demand (`ArchiveFile.cpp:142-209`).

Public surface:

```cpp
ArchiveFile(File file, bool allowFolder = false);
vector<wstring> *getFileList();
bool     hasFile(const wstring &filename);
int      getFileSize(const wstring &filename);   // -1 if absent
byteArray getFile(const wstring &filename);       // decompresses if needed
```

A missing file is fatal, not soft: `getFile()` on an unknown name calls
`app.FatalLoadError()` (`ArchiveFile.cpp:129-137`).

## ResourceLocation

`ResourceLocation` (`ResourceLocation.h`) is the asset id used pervasively for
texture binding. Unlike Java's `namespace:path` string, neoLegacy's is a small
value type wrapping **either** a preloaded texture-name array **or** a path
string:

| Constructor | Stores | `isPreloaded()` |
|-------------|--------|-----------------|
| `ResourceLocation(_TEXTURE_NAME)` | one preloaded texture name | `true` |
| `ResourceLocation(intArray)` | many texture names | `true` |
| `ResourceLocation(wstring path)` | a path, resolved at bind time | `false` |
| `ResourceLocation()` | empty | `false` |

Accessors: `getTexture()` / `getTexture(idx)` / `getTextureCount()` for the
preloaded case, `getPath()` for the path case. The preloaded form maps directly
onto the engine's baked `_TEXTURE_NAME` enum, so most binds cost no string
lookup — a deliberate departure from the Java string-keyed registry.

## HTTP player-skin streaming

Custom **player** skins (as opposed to whole texture packs) arrive over the
network and are massaged by a small processor hierarchy:

```
HttpTextureProcessor          process(BufferedImage*) = 0
└─ MobSkinTextureProcessor    fixes up a 64×32 player skin

MemTextureProcessor           process(BufferedImage*) = 0
└─ MobSkinMemTextureProcessor same fix-up, memory-backed variant
```

`MobSkinTextureProcessor::process` (`MobSkinTextureProcessor.cpp:4`) normalises a
skin to **64×32** and fixes its alpha channel by region so the classic overlay
zones render correctly:

| Region (x0,y0 → x1,y1) | Operation |
|------------------------|-----------|
| `0,0 → 32,16` | `setNoAlpha` — force opaque (head/body base) |
| `32,0 → 64,32` | `setForceAlpha` — treat as transparent overlay if no alpha present |
| `0,16 → 64,32` | `setNoAlpha` — force opaque (legs/arms base) |

`setNoAlpha` ORs in `0xff000000`; `setForceAlpha` masks to `0x00ffffff` only when
the region has no existing alpha (`MobSkinTextureProcessor.cpp:42-60`). This is
the classic LCE player-skin alpha convention preserved verbatim.

> **Unverified / stub:** `HttpTexture` itself is **not implemented** in this
> tree. `HttpTexture.cpp:4-12` sets `count=1`, `id=-1`, `isLoaded=false` and
> carries the comment `// 4J - TODO - actually implement`. The processor
> classes work, but the fetch that would feed them is a stub here.

The pending-request bookkeeping lives on `Minecraft`:
`m_pendingTextureRequests` (`Minecraft.h:336`), `handleClientTextureReceived(name)`
(`Minecraft.h:341`, `Minecraft.cpp:5379`), and `clearPendingClientTextureRequests()`.

## Common/res layout

The shipped default pack lives under `Common/res/`. Subdirectories:

| Dir | Contents |
|-----|----------|
| `terrain` | block atlas source tiles (`terrain.png` sits at `res/` root) |
| `mob` | mob/entity skins |
| `armor` | armor overlays |
| `item` | item icons |
| `gui` | HUD, container, and widget graphics |
| `font` | bitmap + unicode font pages |
| `environment` | sky, clouds, rain, sun/moon |
| `achievement` | achievement icons |
| `title` | title-screen art |
| `art` | paintings atlas |
| `misc` | shadow, colour maps, particles |
| `audio` | bundled audio metadata |
| `TitleUpdate` | the TU-versioned resource root the default pack reads from |
| `1_2_2` | legacy pre-update resource variant |

`Common/DummyTexturePack/res` is a minimal placeholder pack used by the
repository's `m_dummyTexturePack` / `m_dummyDLCTexturePack` slots.

> Media directories (`.png` atlases, etc.) are binary and are not documented
> file-by-file here.

## ColourTable — biome grass/foliage/water tints

`ColourTable` (`Common/Colours/ColourTable.h`) is the per-pack biome-colour
lookup, reached via `Minecraft::getColourTable()`. It is a flat array of
`eMinecraftColour_COUNT` `unsigned int` ARGB values indexed by the
`eMinecraftColour` enum (`Common/App_enums.h:207`).

The enum is large — it covers far more than grass. Categories, in enum order:

| Category | Example members |
|----------|-----------------|
| `Foliage_*` | per-biome leaf tint (`Foliage_Jungle`, `Foliage_Swampland`, `Foliage_Mesa`, …) |
| `Grass_*` | per-biome grass tint (`Grass_Plains`, `Grass_Savanna`, …) |
| `Water_*` | per-biome water tint (`Water_Swampland`, `Water_Mesa`, …) |
| `Sky_*` | per-biome sky tint + `Sky_Dawn_Dark` / `Sky_Dawn_Bright` |
| `Tile_*` | `Tile_RedstoneDustLitMin`/`Max`, `Tile_StemMin`/`Max`, `Tile_WaterLily` |
| `Material_*` | map-colour per material (`Material_Grass`, `Material_Stone`, …) |
| `Particle_*` | particle tints (`Particle_NetherPortal`, `Particle_Ender`, `Particle_DragonBreathMin`/`Max`, `Particle_Note_00..24`, …) |
| `Effect_*` | potion-effect particle colours |
| `Mob_*_Colour1/2` | spawn-egg colours per mob |

Callers read it with `getColour(id)` / `getColor(id)` throughout the renderers —
e.g. `TileRenderer.cpp:2788` for lit redstone dust, `NoteParticle.cpp:13-14` for
note-block particles, `GameRenderer.cpp:2133` for the underwater clear colour.

### How a ColourTable is loaded

Each pack builds its table from a binary blob:

```cpp
ColourTable(PBYTE pbData, DWORD dwLength);                       // fresh
ColourTable(ColourTable *defaultColours, PBYTE pbData, DWORD);   // start from defaults, override
```

`loadColoursFromData` reads a version int, a count int, then `count` records of
`readUTF()` name + `readInt()` value, resolving each name through the static
`s_colourNamesMap` (name → enum) built in `staticCtor()` (`ColourTable.cpp:349-392`).
`ColourTable::staticCtor()` runs at boot from `Minecraft::main()`. Unknown names
are silently skipped; out-of-range ids return `0` (black).

> **neoLegacy delta:** the two-argument constructor lets a DLC/Mash-Up pack
> inherit the default colours (`XMemCpy` of the whole array) and override only
> the entries present in its blob — see `DLCTexturePack::loadColourTable`. Per
> the project notes, server-side `colours.xml` handling was fixed so custom
> biome colours propagate correctly rather than falling back to black.

> **Changed in v1.1.0b:** two entries were appended to the `Mob_*_Colour1/2`
> category — `Mob_PolarBear_Colour1` / `Mob_PolarBear_Colour2` (`ColourTable.cpp:347-348`,
> TU43 polar-bear support), so `eMinecraftColour_COUNT` grew by two. Separately,
> NOTES.md v1.1.0b lists a fix so "neoLegacy dedicated servers no longer crash due
> to missing color files" — the crash path is on the server bootstrap, not the
> `colours.xml` fallback in `AbstractTexturePack` (which is unchanged).

## Related pages

- [Rendering](/slop-docs/client/rendering/) — how bound textures reach the atlas
- [Entity Renderers & Models](/slop-docs/client/entity-rendering/) — `getTextureLocation` per entity
- [Audio](/slop-docs/client/audio/) — Mash-Up pack sound banks and `isUsingDefaultSkin()`
- [Settings & Skin Select](/slop-docs/client/settings/) — the console skin carousel

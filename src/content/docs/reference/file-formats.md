---
title: File Formats
description: Every container and data format the game touches — what it is, where neoLegacy reads and writes it, its status in this fork, and where to find the byte-level spec.
---

Legacy Console Edition is a game of many small binary containers: archives of
UI movies, colour tables, localization blobs, sound banks, world region files,
save wrappers, and thumbnails. This page is the orientation map for all of them.
For each format it answers four questions:

1. **What it is** — the shape of the data, in one or two sentences.
2. **Where neoLegacy handles it** — the real reader/writer code, cited by
   `file:line`.
3. **Status in this fork** — whether neoLegacy consumes it as-is, has replaced
   it, or only ships tooling for it.
4. **Byte-level spec** — a link to [Project Lodestone's
   documentation](https://team-lodestone.github.io/Documentation/), who maintain
   the authoritative wire-format specs. This page summarizes; it does not
   duplicate their byte tables.

Source paths link to Gitea (`git.neolegacy.dev/neoStudiosLCE/neoLegacy`). Version
references are against `origin/main` = **v1.1.0b**.

## Orientation table

| Format | Extension | What it holds | neoLegacy code | Status |
|---|---|---|---|---|
| Archive | `.arc` | Bundled UI/media assets (SWF, images) | `Minecraft.Client/ArchiveFile.cpp` | Consumed + tooled |
| Colour table | `.col` / `.xml` | Named RGBA colour constants | `Common/Colours/ColourTable.cpp` | `.col` primary, `.xml` fallback added |
| Localization | `.loc` / `strings*.xml` | Translated UI strings | `StringTable.cpp` + CMake codegen | Migrated to XML + generated header |
| Sound bank | `.msscmp` | Miles Sound System audio bank | `tools/msscmp_extract.py` | Extraction tooling only |
| NBT | (embedded) | Named Binary Tag world/entity data | `Minecraft.World/NbtIo.h` | Consumed |
| Options | (in save) | Persisted game/graphics settings | `Minecraft.Client/Options.cpp` | Consumed |
| Thumbnail | THUMB | 64×64 save preview image | `Windows64/Windows64_App.cpp` | Written |
| Game rules | GRF | Level generation rule blob | `Common/GameRules/GameRuleManager.cpp` | Consumed |
| Save container | (varies) | Console save wrapper + region files | `Minecraft.World/ConsoleSaveFileOriginal.cpp` | Consumed + converted |
| PCK | `.pck` | Packed resource/skin/texture container | `tools/pck_extract.py`, `tools/pck_pack.py` | Extraction/packing tooling |
| UI movie | `.swf` | Iggy/Scaleform Flash UI | (Iggy runtime, see UI system) | Consumed (bundled in `.arc`) |
| Wii U save | `.mcs` | Wii U save filename wrapper | `ConsoleSaveFileOriginal.cpp` (naming) | Naming only in this snapshot |

---

## `.arc` archives

**What it is.** A flat archive bundling many small files — chiefly the `.swf`
UI movies and their images — into one blob. The format is Java
`DataOutputStream` style: big-endian ints and modified-UTF-8 strings. The header
is a file count followed by one record per file (name, offset, size); the raw
data section follows. Names prefixed with `*` are zlib-compressed.

**Where neoLegacy handles it.** The runtime reader is
[`ArchiveFile::_readHeader`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/ArchiveFile.cpp#L9)
in `Minecraft.Client/ArchiveFile.cpp`. It reads `numberOfFiles = dis->readInt()`,
then for each entry reads `readUTF()` for the name and two `readInt()`s for the
data-section pointer and file size. The leading-`*` compression flag is stripped
into the `MetaData::isCompressed` field:

```cpp
meta->filename = dis->readUTF();
meta->ptr      = dis->readInt();
meta->filesize = dis->readInt();
if (meta->filename[0] == '*') {
    meta->filename = meta->filename.substr(1);
    meta->isCompressed = true;
}
```

Decompression happens lazily in
[`ArchiveFile::getFile`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/ArchiveFile.cpp#L120),
which reads a `decompressedSize` int and inflates the payload. On Windows64,
Xbox One, and Orbis the whole archive is slurped into `m_cachedData` up front.

**Status in this fork.** Consumed as-is at runtime and actively tooled. The
media set lives in `Minecraft.Client/Common/Media/MediaWindows64/` (as loose
files) and as `MediaWindows64.arc`. neoLegacy ships Java tools for it:
`ListArc.java` (dump the index), `ExtractFromArc.java` (pull one entry), and
`RebuildArc.java` (swap in updated SWFs and recompute offsets). See the
[repository tools page](/slop-docs/tools/repo-tools/) for how those work, and the
[textures & assets page](/slop-docs/modding/textures-assets/) for asset workflows.

**Byte-level spec.** [Project Lodestone — ARC](https://team-lodestone.github.io/Documentation/LCE/File%20Types/ARC).

---

## Colours (`.col` and `.xml`)

**What it is.** `colours.col` is the binary colour table: a count of entries
followed by named colour values, read big-endian. It maps engine colour names
(the `ColourTableElements` list) to RGBA integers used across text and UI.

**Where neoLegacy handles it.** The binary parser is
[`ColourTable::loadColoursFromData`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/Common/Colours/ColourTable.cpp#L373),
which reads `coloursCount = dis.readInt()` and then loops each named entry. The
resource is loaded in
[`AbstractTexturePack.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/AbstractTexturePack.cpp#L360):
the code looks for `res/colours.col` first, and if that file is absent falls
back to `res/colours.xml`:

```cpp
if(coloursFile.exists()) {
    // ... new ColourTable(data.data, dwLength);  (binary .col)
}
else if(coloursXmlFile.exists()) {
    app.DebugPrintf("Default colours table not found, loading colours.xml fallback\n");
    loadColourTableFromXmlFile(coloursXmlFile, m_colourTable);
}
```

The XML loader is `loadColourTableFromXmlFile`
([AbstractTexturePack.cpp:101](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/AbstractTexturePack.cpp#L101)).

**Status in this fork.** neoLegacy added a human-editable **`colours.xml`
fallback** so the colour table no longer requires the original binary `colours.col`
blob. The binary path is still the primary and is used when present; the XML path
is the fallback when the `.col` is missing. DLC colour tables (`DLCColourTableFile`)
still use the binary form. See the [client resources
page](/slop-docs/client/resources/) for how colour tables slot into resource
loading.

**Byte-level spec.** [Project Lodestone — COL](https://team-lodestone.github.io/Documentation/LCE/File%20Types/COL)
(the legacy binary format).

---

## Localization (`.loc` and `strings*.xml`)

**What it is.** The original LCE localization format is the binary `.loc`
string table — a numeric string-ID to translated-text map. neoLegacy replaced
that pipeline with XML source files plus a compile-time codegen step.

**Where neoLegacy handles it.** The runtime table is `StringTable`
([StringTable.cpp](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/StringTable.cpp#L307)),
whose `ProcessXmlStringTableData` walks an XML root directory of `strings*.xml`
files (e.g. `Windows64Media/loc/stringsGeneric.xml`,
`stringsLeaderboards.xml`, `stringsRichPresence.xml`). A source comment marks the
switch: `// Fireblade - switched from locs to xmls`
([StringTable.cpp:12](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/StringTable.cpp#L12)).

The numeric `IDS_*` constants are generated at build time. The CMake script
[`GenerateStringsHeaderFromXml.cmake`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/cmake/GenerateStringsHeaderFromXml.cmake)
scans the XML root and emits `strings.h`; `GenerateStringIdLookup.cmake` builds
the reverse lookup. The wiring lives in
[`Minecraft.Client/CMakeLists.txt`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/CMakeLists.txt#L27)
(`MINECRAFT_CLIENT_COMPILETIME_STRINGS_HEADER`, `GenerateStringIdLookup`
dependency).

**Status in this fork.** **Migrated.** Localization is authored as XML and the
`IDS_*` header is generated from it during the build — there is no binary `.loc`
in the neoLegacy source path. `StringTable` still has a `PBYTE`/`DWORD`
constructor for loading raw table data, but the shipped pipeline is XML-driven.

**Byte-level spec.** [Project Lodestone — LOC](https://team-lodestone.github.io/Documentation/LCE/File%20Types/LOC)
(the binary `.loc`).

---

## `.msscmp` sound banks

**What it is.** A Miles Sound System compiled sound bank identified by the
`BANK` magic. It contains a file table of audio entries, each resolving to a
folder, a relative filename, a sample rate, and a size; the audio payload is
Bink Audio (`.binka`).

**Where neoLegacy handles it.** Extraction only, via
[`tools/msscmp_extract.py`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/tools/msscmp_extract.py).
The parser checks `data[:4] != b'BANK'`, then reads big-endian offsets out of
the header — the file-table offset at `0x18` and the entry count at `0x34` — and
walks the entry records, resolving each sound's folder/name/sample-rate/size.
Each entry is dumped as raw `.binka`; if `ffmpeg` is on `PATH` it is transcoded
to `.flac`.

**Status in this fork.** **Tooling only.** neoLegacy does not load `.msscmp` at
runtime on the Windows64 target — this script is for extracting the original
console audio for reuse. See the [client audio page](/slop-docs/client/audio/)
for how sound is handled in-engine and the [repository tools
page](/slop-docs/tools/repo-tools/) for the extractor.

**Byte-level spec.** [Project Lodestone — MSSCMP](https://team-lodestone.github.io/Documentation/LCE/File%20Types/MSSCMP).

---

## NBT (Named Binary Tag)

**What it is.** Mojang's tag-based tree format for structured world, entity, and
tile-entity data. Each tag has a type byte, a name, and a payload; compound tags
nest. The type constants are declared in
[`Tag.h`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Tag.h#L10):
`TAG_End=0`, `TAG_Byte=1`, `TAG_Short=2`, `TAG_Int=3`, `TAG_Long=4`,
`TAG_Float=5`, `TAG_Double=6`, `TAG_Byte_Array=7`, `TAG_String=8`, and the
compound/list types.

**Where neoLegacy handles it.** The reader/writer front door is
[`NbtIo`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/NbtIo.h):

```cpp
static CompoundTag *readCompressed(InputStream *in);
static void         writeCompressed(CompoundTag *tag, OutputStream *out);
static CompoundTag *read(DataInput *dis);
static void         write(CompoundTag *tag, DataOutput *dos);
```

The tag classes (`CompoundTag`, `LongTag`, `FloatTag`, `StringTag`, `ByteTag`,
etc.) live alongside it in `Minecraft.World/`. Almost every persistent entity,
tile entity, and chunk serializes through these — see `PlayerIO.h`,
`MapItemSavedData.cpp`, and the tile-entity classes for callers.

**Status in this fork.** **Consumed** — this is the core world serialization
format and is used unchanged. See the [world storage
page](/slop-docs/world/storage/) for how NBT feeds chunk and level saving.

**Byte-level spec.** [Project Lodestone — NBT](https://team-lodestone.github.io/Documentation/LCE/File%20Types/NBT).

---

## Options / settings

**What it is.** The persisted game and graphics settings — sound/music toggles,
sensitivity, render distance, difficulty, FOV, gamma, GUI scale, and so on.

**Where neoLegacy handles it.** The option registry is
[`Options.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/Options.cpp),
which declares each `Options::Option` with a caption ID and progress/boolean
flags (`options.music`, `options.sensitivity`, `options.renderDistance`,
`options.difficulty`, `options.fov`, `options.gamma`, `options.guiScale`, …).
`Options.h` defines the storage and the option enum; `OptionsScreen.cpp` and
`Common/UI/UIScene_SettingsOptionsMenu.cpp` drive the UI. The persisted values
ride inside the console save container (below).

**Status in this fork.** **Consumed.** The option set is the LCE settings model;
see the [client settings page](/slop-docs/client/settings/) for the full
option list and behaviour.

**Byte-level spec.** [Project Lodestone — Options](https://team-lodestone.github.io/Documentation/LCE/File%20Types/Options).

---

## THUMB save thumbnails

**What it is.** A small preview image stored with a save so the load menu can
show what the world looks like. LCE thumbnails are 64×64.

**Where neoLegacy handles it.** The Windows64 capture path is
[`CConsoleMinecraftApp::CaptureSaveThumbnail`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/Windows64/Windows64_App.cpp#L43)
in `Windows64/Windows64_App.cpp`. It grabs the framebuffer and downsamples to
`THUMBNAIL_SIZE` (defined as `64` at
[Windows64_App.cpp:41](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/Windows64/Windows64_App.cpp#L41))
with a simple box filter into an RGBA buffer. It is invoked from the save flow at
[`Minecraft.cpp:2021`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/Minecraft.cpp#L2021).
The captured thumbnail data is threaded into the save container in
`ConsoleSaveFileOriginal` (`thumbData`/`thumbSize`, e.g. around
[Flush](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ConsoleSaveFileOriginal.cpp#L681)).

**Status in this fork.** **Written.** neoLegacy generates the thumbnail on the
Windows64 target and stores it in the save.

**Byte-level spec.** [Project Lodestone — THUMB](https://team-lodestone.github.io/Documentation/LCE/File%20Types/THUMB).

---

## GRF game-rule files

**What it is.** A compiled level-generation rule blob — the tutorial/minigame
"game rules" describing structures, feature placement, named areas, item rules,
and schematic references that a generated level uses.

**Where neoLegacy handles it.** The loader is
[`GameRuleManager`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/Common/GameRules/GameRuleManager.cpp).
[`loadGameRules(byte *dIn, UINT dSize)`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/Common/GameRules/GameRuleManager.cpp#L140)
parses a raw buffer into a `LevelGenerationOptions`, dispatching to the rule
definition classes in the same directory (`AddItemRuleDefinition`,
`ApplySchematicRuleDefinition`, `NamedAreaRuleDefinition`,
`CompoundGameRuleDefinition`, `StartFeature`, …). A companion serializer is the
"Reverse of loadGameRules" path noted at
[GameRuleManager.cpp:237](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/Common/GameRules/GameRuleManager.cpp#L237).
Schematics referenced by rules load through `ConsoleSchematicFile` /
`loadSchematicFile`.

**Status in this fork.** **Consumed.** The rule system drives generated levels;
see the [world game rules page](/slop-docs/world/gamerules/) and the
[custom game rules modding page](/slop-docs/modding/custom-gamerules/).

**Byte-level spec.** [Project Lodestone — GRF](https://team-lodestone.github.io/Documentation/LCE/File%20Types/GRF).

---

## Save containers and region files

**What it is.** A console save is a single container wrapping the world's files —
compressed, with an index header, a thumbnail, options, and the chunk data. The
chunk data itself is stored in **region files**: 4096-byte-sector files with an
offset table and a timestamp table at the front, followed by sectored,
compressed chunks.

**Where neoLegacy handles it.**

- **Container:**
  [`ConsoleSaveFileOriginal.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ConsoleSaveFileOriginal.cpp)
  reads and writes the wrapper — decompression (with cross-platform endian
  handling via `isLocalEndianDifferent`), the file header (`header.ReadHeader` /
  `header.WriteHeader`), per-file entries, and the thumbnail. Cross-platform
  conversion lives in `ConsoleSaveFileConverter.cpp`.
- **Region files:**
  [`RegionFile.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/RegionFile.cpp)
  defines `SECTOR_BYTES = 4096`, `SECTOR_INTS = SECTOR_BYTES / 4`, and the
  chunk-compression versions `VERSION_GZIP=1`, `VERSION_DEFLATE=2`,
  `VERSION_XBOX=3`
  ([RegionFile.h](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/RegionFile.h#L16)).
  It reads the offset and timestamp tables sector-by-sector, byte-swapping when
  `saveFile->isSaveEndianDifferent()`.
- **Split saves / `region_format_16`:**
  [`RegionFileCache.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/RegionFileCache.cpp)
  gates on `useSplitSaves(platform)` and probes for a marker file:
  ```cpp
  bool isNew = saveFile->doesFileExist(ConsoleSavePath(L"region_format_16"));
  ```
  On new-format split saves the world is spread across multiple region files
  rather than one blob. The container marks a save as this format by writing the
  `region_format_16` entry (`header.AddFile(L"region_format_16")` at
  [ConsoleSaveFileOriginal.cpp:227](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ConsoleSaveFileOriginal.cpp#L227)).

**Status in this fork.** **Consumed and converted**, and `region_format_16`
(the split-save layout) is live in **v1.1.0b**. See the [world storage
page](/slop-docs/world/storage/) for the chunk/region storage stack.

**Byte-level specs.** Project Lodestone —
[Save Format](https://team-lodestone.github.io/Documentation/LCE/Save%20Format),
[Split Saves](https://team-lodestone.github.io/Documentation/LCE/Split%20Saves),
and [RegionFile](https://team-lodestone.github.io/Documentation/LCE/RegionFile).

---

## `.pck` resource packs

**What it is.** A packed container used for LCE resource/skin/texture packs. It
begins with a version int (used to detect endianness), then UTF-16 strings and
32-bit sizes describing packed entries.

**Where neoLegacy handles it.** Tooling only:
[`tools/pck_extract.py`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/tools/pck_extract.py)
and [`tools/pck_pack.py`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/tools/pck_pack.py).
The extractor auto-detects endianness by checking whether the first int reads as
a small version number big- or little-endian (`0 < v < 100`), then reads `u32`
lengths and UTF-16 strings.

**Status in this fork.** **Tooling only** — for pulling assets out of, and
repacking into, `.pck` containers. See the [repository tools
page](/slop-docs/tools/repo-tools/).

**Byte-level spec.** Consult [Project Lodestone's file-type
index](https://team-lodestone.github.io/Documentation/) for the PCK layout.

---

## `.swf` UI movies

**What it is.** Flash movies driving the menu and HUD UI, played by the Iggy
(Scaleform-compatible) runtime. They are bundled inside the `.arc` archives, not
loaded as loose files at runtime.

**Where neoLegacy handles it.** The Iggy runtime integration lives under the
platform directories (e.g. `Orbis/Iggy/`, `Windows64/Iggy/`) and is driven from
`Gui.cpp`. neoLegacy also ships a family of Java SWF tools (`DumpSwf.java`,
`DecompileAS.java`, `PatchHudABC.java`, `ReplaceLogo.java`, …) for inspecting and
patching the ABC bytecode inside these movies.

**Status in this fork.** **Consumed** via Iggy and heavily tooled for UI
patching. The full UI story is on the [client UI system
page](/slop-docs/client/ui-system/); the SWF tools are covered on the
[repository tools page](/slop-docs/tools/repo-tools/).

**Byte-level spec.** SWF is Adobe's published Flash format; Lodestone's docs
cover how LCE uses it within the archive/UI pipeline.

---

## `.mcs` Wii U saves

**What it is.** The Wii U save filename form. LCE Wii U saves are written with a
versioned, timestamped `.mcs` name.

**Where neoLegacy handles it.** The `.mcs` naming is produced in
[`ConsoleSaveFileOriginal.cpp:1033`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ConsoleSaveFileOriginal.cpp#L1033):

```cpp
swprintf(fileName, XCONTENT_MAX_FILENAME_LENGTH+1,
    L"\\v%04d-%ls%02d.%02d.%02d.%02d.%02d.mcs",
    VER_PRODUCTBUILD, cutFileName.c_str(),
    t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond);
```

The payload inside is the same console save container documented above.

**Status in this fork.** At snapshot `47e5cba3` the `.mcs` handling is limited to
the save **naming** shown here. **Changed in v1.1.0b:** a standalone
[`tools/wiiU2Windows.py`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/tools/wiiU2Windows.py)
converter was added (`929b32ff`, fixed in `1c936577`, landed on main via `042ee0a2` #37) — it converts Wii U `.mcs`
saves to the Windows/Xbox-One layout (144-byte entry table, `region_format_16`,
`--dlc`/`--no-split` presets). See [Repo Tools](/slop-docs/tools/repo-tools/).

**Byte-level spec.** See Project Lodestone's
[Save Format](https://team-lodestone.github.io/Documentation/LCE/Save%20Format)
and platform-save pages.

---

## Acknowledgment: Project Lodestone

The byte-level specifications linked throughout this page are the work of
**[Project Lodestone](https://team-lodestone.github.io/Documentation/)**, a
community effort that documents the Legacy Console Edition file formats by hand.
neoLegacy's readers and writers implement those formats; Lodestone's docs explain
the bytes. Where this page summarizes a format, treat Lodestone's documentation as
the source of truth for the exact on-disk layout, and credit their work when you
build on it.

## Unverified / notes

- **`wiiU2Windows.py`** — absent at snapshot `47e5cba3`; **added in v1.1.0b**
  (`929b32ff`, fixed in `1c936577`, landed via `042ee0a2` #37), readable at `upstream/main:tools/wiiU2Windows.py`. The
  `.mcs` **naming** logic exists at both refs (`ConsoleSaveFileOriginal.cpp:1033`).
- **`AssetTitleUpdateColourOverride`** — this is a **CMake custom target**, not a
  C++ symbol: `CMakeLists.txt:164-174` deletes the stale
  `Common/res/TitleUpdate/res/colours.col` from the build output and copies
  `colours.xml` next to each executable, so shipped builds take the XML path. At
  runtime `AbstractTexturePack.cpp:364-368` still reads `.col` first with
  `res/colours.xml` as the fallback (`loadColourTableFromXmlFile`) — both
  mechanisms are real and complementary.
- **PCK / SWF byte specs** — Project Lodestone's documentation is organized under
  its file-type index; the exact PCK and SWF-within-LCE pages should be reached
  from [their index](https://team-lodestone.github.io/Documentation/) rather than a
  guessed deep link.
- **Version** — the working-tree `BUMP` at snapshot `47e5cba3` reads `1.0.9b`,
  while `origin/main`'s `BUMP` reads `1.1.0b`. This page follows the task's
  `origin/main` = v1.1.0b baseline for feature-status statements
  (`region_format_16`).

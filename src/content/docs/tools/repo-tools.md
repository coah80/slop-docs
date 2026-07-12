---
title: Repo Tools
description: The tools/ directory — JPEXS-based SWF/ABC patchers, the .arc archive tooling, audio/asset format scripts, and the Ghidra 4JLibs binary-diff harness.
---

Everything under `tools/` is developer tooling that operates on **game assets** and **built binaries**, not on the C++ source. None of it is part of the CMake build — these are standalone Java classes, Python scripts, and shell wrappers run by hand when regenerating assets or verifying submodule changes. This page documents every tool in the directory.

For live server instrumentation and the bot swarm see [Performance & Stress Testing](/slop-docs/tools/testing/); for the CI/release side see [CI & Release Pipeline](/slop-docs/tools/ci/).

## SWF / UI ActionScript patching (Java + JPEXS FFDec)

The game's UI is Autodesk Scaleform, which consumes Flash `.swf` assets containing AVM2 (ActionScript 3) bytecode. neoLegacy edits those assets programmatically using the [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) library (`com.jpexs.decompiler.flash.*`). Every tool here is compiled and run against `ffdec.jar` on the classpath, e.g.:

```
javac -cp ffdec.jar tools/DumpSwf.java
java  -cp ffdec.jar:tools DumpSwf skinHDHud.swf
```

The SWF assets themselves live packed inside `Common/Media/MediaWindows64.arc` — extract them with the [`.arc` tooling](#arc-archive-tooling) first, patch, then rebuild the archive.

### Hardcore hearts

Three tools cooperate to add hardcore-mode hearts, a neoLegacy feature absent from stock TU19 UI assets:

| Tool | Size | What it does |
|---|---|---|
| `PatchHudABC.java` | 24.9 KB | Raw ABC-bytecode patcher for the `Hud` class |
| `AddHardcoreHearts.java` | 17.8 KB | Adds hardcore heart **frames** to the health sprite |
| `AddHardcoreBitmaps.java` | 4.0 KB | Adds the hardcore heart **bitmap** assets |

`PatchHudABC.java` is the interesting one. Rather than editing the decompiled AVM2 instruction list (which, per its own header comment, "fails to adjust existing jump offsets when bytes are inserted"), it patches the raw bytecode by hand and fixes up every branch offset itself. It maintains an explicit set of the AVM2 jump opcodes whose first operand is an `s24` relative offset:

```java
// AVM2 opcodes that have s24 jump offset as first operand
static final Set<Integer> JUMP_OPCODES = Set.of(
    0x10, // jump
    0x11, // iftrue
    0x12, // iffalse
    0x13, // ifeq
    // ... 0x14–0x1A plus 0x0C–0x0F (ifnlt/ifnle/ifngt/ifnge)
);
```

It then walks `swf.getTags()`, finds every `DoABC2Tag`, locates the `Hud` class in `abc.instance_info`, and performs three edits:

1. Adds an `m_bHardcore:Boolean` instance variable.
2. Adds a `SetHardcore(Boolean)` method.
3. Modifies `SetHealth` to check `m_bHardcore` and offset the heart frames.

`Configuration.autoDeobfuscate` is disabled up front so JPEXS doesn't rewrite the bytecode out from under the patcher.

- Usage: `PatchHudABC <hud.swf> <output.swf>`
- `AddHardcoreHearts`: the `FJ_Health` sprite normally has 14 frames (normal/poison/wither); this adds frames 15–24 for the hardcore variants. Operates on `skinHDHud.swf`.
- `AddHardcoreBitmaps`: adds the bitmap assets that the new frames reference by class name from their `PlaceObject3` tags. Usage `AddHardcoreBitmaps <skinGraphicsHud.swf> <textures-dir> <output.swf>`.

Files: `tools/PatchHudABC.java`, `tools/AddHardcoreHearts.java`, `tools/AddHardcoreBitmaps.java`

### Options-menu checkbox injectors

Two injectors add new checkboxes to the graphics settings menu (`SettingsGraphicsMenu` SWFs). Each **clones an existing checkbox**, renames it, positions the clone directly below the original, and shifts the sliders down to make room:

| Tool | New checkbox | Cloned from |
|---|---|---|
| `AddVSyncCheckbox.java` | `VSync` | `CustomSkinAnim` |
| `AddExclusiveFullscreenCheckbox.java` | `ExclusiveFullscreen` | `VSync` |

Both are idempotent — they scan `swf.getTags()` for a `PlaceObject3Tag` already named `VSync`/`ExclusiveFullscreen` and skip if found. Run them in order (VSync first, then ExclusiveFullscreen, since the latter clones the former's checkbox). Both ship with a checked-in `.class` alongside the `.java`.

- Usage: `AddVSyncCheckbox <swf_file> [output_file]` (defaults to overwriting input).

Files: `tools/AddVSyncCheckbox.java` (+`.class`), `tools/AddExclusiveFullscreenCheckbox.java` (+`.class`)

### Decompilers & bytecode dumpers

Inspection tools used when reverse-engineering an unfamiliar SWF before patching it:

| Tool | Output |
|---|---|
| `DecompileAS.java` | Class/method **signatures** — walks `instance_info`, prints `extends`, method signatures with param/return types, and slot/const declarations |
| `DecompileASBody.java` | Exports **all AS3 source** from a SWF to a directory |
| `DumpSwf.java` | Top-level tag list, recurses into `DefineSpriteTag`, prints `PlaceObject` depth/charId/name/matrix |
| `DumpSwfDetail.java` | More verbose per-tag detail dump |
| `DumpSetHealthBC.java` | Dumps the raw AVM2 bytecode of the `SetHealth` method from a HUD SWF (companion to `PatchHudABC`) |
| `CheckSetImage.java` | Reflection helper — lists `DefineBitsLossless2Tag` methods matching `image`/`bitmap`/`set` (used to find the right JPEXS API for bitmap replacement) |

`DecompileAS` resolves multinames through the constant pool (`AVM2ConstantPool`), qualifying names with their namespace when present. Usage `DecompileAS <swf-file>`, `DumpSwf <swf-file>`, etc.

Files: `tools/DecompileAS.java`, `tools/DecompileASBody.java`, `tools/DumpSwf.java`, `tools/DumpSwfDetail.java`, `tools/DumpSetHealthBC.java`, `tools/CheckSetImage.java`

### Logo & menu-title tools

Locate, replace, and reposition the main-menu logo and title bitmaps:

| Tool | Purpose |
|---|---|
| `FindLogoBitmap.java` | Finds the `MenuTitle` symbol and its backing bitmap via `SymbolClassTag` |
| `FindMenuTitle.java` | Scans one SWF for the menu-title symbol |
| `FindMenuTitleAll.java` | Batch-scans a hardcoded list of skin SWFs (`skinHD.swf`, `skinHDGraphics.swf`, …) — the base path is hardcoded to a `C:/Users/revela/...` dev machine |
| `ReplaceLogo.java` | Replaces `MenuTitle` + `MenuTitleSmall` bitmaps with a custom PNG. Usage `ReplaceLogo <skin.swf> <logo.png> <output.swf> [scale]` |
| `ShiftLogo.java` | Shifts logo Y-translate in `ComponentLogo` SWFs (negative = up). Scaled proportionally for non-1080p variants |
| `ShiftMenuY.java` | Shifts any named `PlaceObject` element's Y position. Usage `ShiftMenuY <input.swf> <output.swf> <element_name> <y_offset_pixels>` — SWF uses **twips** (1 px = 20 twips) |

`FindMenuTitleAll.java` in particular is a personal helper: its `base` directory and file list are hardcoded, so treat it as a template to adapt rather than a portable tool.

Files: `tools/FindLogoBitmap.java`, `tools/FindMenuTitle.java`, `tools/FindMenuTitleAll.java`, `tools/ReplaceLogo.java`, `tools/ShiftLogo.java`, `tools/ShiftMenuY.java`

## `.arc` archive tooling

The client's SWF/UI assets are packed into `Common/Media/MediaWindows64.arc`. The `.arc` format is written by a Java `DataOutputStream`, so it is:

- **Big-endian** 32-bit ints.
- **Modified UTF-8** strings (JPEXS `writeUTF`: a 2-byte length prefix followed by the modified-UTF-8 bytes).
- A `*` prefix on a filename means that entry's data is **zlib-compressed**.

The on-disk layout, from the header comment in `RebuildArc.java`:

```
int: numberOfFiles
For each file:
  UTF: filename (prefixed with '*' if compressed)
  int: offset into data section   (absolute, from file start)
  int: filesize
Raw file data follows the header
```

Because offsets are absolute from the start of the file, rebuilding requires recomputing every offset once entry sizes change — which is exactly what `RebuildArc` does.

| Tool | Purpose |
|---|---|
| `ListArc.java` | Prints file count, then lists entries whose name contains `ogo`/`skin`/`Menu`/`platform` (a filter for the assets these tools care about) |
| `ExtractFromArc.java` | Extracts one entry by exact name. Usage `ExtractFromArc <arc_file> <filename> <output_path>` |
| `RebuildArc.java` (+`.class`) | Rebuilds the archive, swapping in updated SWFs from a directory |

`RebuildArc` reads the original index, then for each entry either keeps the original bytes (`System.arraycopy` out of the raw file at its stored offset) or substitutes a file of the same name from `media_dir`. Substituted SWFs are written **uncompressed** (`compressed.set(i, false)`), because the tool's replacement SWFs are uncompressed. It writes a zero-offset/size placeholder header first to measure the header length, then computes real offsets:

```java
int currentOffset = headerSize;
for (int i = 0; i < numberOfFiles; i++) {
    newOffsets.add(currentOffset);
    currentOffset += fileData.get(i).length;
}
```

The output **overwrites the input `.arc` in place** (`outputPath = arcPath`), and it exits non-zero if nothing was replaced.

- Usage: `RebuildArc <arc_file> <media_dir> [file1.swf file2.swf ...]` — with no explicit files, it replaces every `.swf` in `media_dir` that also exists in the archive.

Files: `tools/RebuildArc.java` (+`.class`), `tools/ListArc.java`, `tools/ExtractFromArc.java`

## Audio & asset format scripts (Python)

### `msscmp_extract.py` — Miles Sound System banks

Extracts audio from a `Minecraft.msscmp` Miles Sound System sound bank (`BANK` magic). The parser reads big-endian offsets out of the header (file-table offset at `0x18`, entry count at `0x34`), walks 8-byte entry records, and for each entry resolves a folder name, a relative filename, sample rate, and size. Each sound is dumped as a raw `.binka` and — if `ffmpeg` is on `PATH` — transcoded to `.flac`.

- Output dirs: `extracted_binka/` and `extracted_flac/`.
- Single-sound folders are flattened (the folder becomes the FLAC filename).
- Usage: `python3 msscmp_extract.py Minecraft.msscmp`
- The FLAC step shells out to `ffmpeg -c:a flac` and silently skips files that already exist.

Files: `tools/msscmp_extract.py`

### `pck_extract.py` / `pck_pack.py` — `.pck` archives

Unpack/repack the Legacy Console `.pck` container (used for resource/skin/texture packs). Both **autodetect endianness** so they work with both console (big-endian) and PC variants — `detect_endianness` reads the first `uint32` (a small version number, 3 or 4) and picks whichever byte order yields a value in `0 < n < 100`.

The format uses a parameter lookup table (`PATH`/`TYPE`/`XMLVERSION`) and UTF-16 strings framed as `uint32 length` + UTF-16 bytes + `uint32 padding`.

- `pck_extract.py` writes the assets into a **`.zip`** (not a raw folder). Usage: `python3 pck_extract.py input.pck -o out.zip` (output defaults to `<input>.zip`).
- `pck_pack.py` packs a folder back into a `.pck`. Paths are stored with **backslashes** (`\`). Defaults: PCK type `3`, XML version `4`, asset type `0`, big-endian. Usage: `python3 pck_pack.py <folder> -o out.pck [--little]`.

Files: `tools/pck_extract.py`, `tools/pck_pack.py`

### `wiiU2Windows.py` — Wii U → Windows save converter (v1.1.0b)

:::note[Added in v1.1.0b]
This tool did not exist at the `47e5cba3` snapshot; it was added on top of it in v1.1.0b
(`042ee0a2 feat: super mario world support (#37)` / `929b32ff feat: mario world`, later tidied by
`1c936577 fix: python toolset`). It is the save-side plumbing behind the Super Mario World DLC and
the "anyone can make a DLC world from their own saves" universal save format.
:::

Converts a Wii U `.mcs` save into a **Windows + Xbox One-compatible `.mcs`** — its own argparse
description reads *"Converts Wii U .mcs saves to Windows + Xbox One-compatible .mcs files."* It walks
the 144-byte `.mcs` file-entry table (`FILE_ENTRY_SIZE = 144`), rewrites the save header to the
Windows save version (`WINDOWS_SAVE_VERSION = 9`), and re-lays out the region files: it handles the
`region_format_16` marker and the 1024-entry / 4096-byte-sector `.mcr` region layout
(`REGION_TABLE_COUNT = 1024`, `REGION_SECTOR_BYTES = 4096`), zlib-recompressing chunk data as needed.

- Main flags: `--dlc` selects the Xbox One split-save preset (for the current DLC system);
  `--no-split` disables split-save logic when `--dlc` is set; without either it emits a regular,
  non-split Windows save. `--endianness-in` / `--endianness-out` override source/target byte order and
  `--save-version` overrides the header version.
- Usage: `python3 wiiU2Windows.py <input.mcs> [-o out.mcs] [--dlc [--no-split]]`.

Files: `tools/wiiU2Windows.py`

### `struct_parse.py` — NBT structure → XML (v1.1.0b)

:::note[Added in v1.1.0b]
Also new since the snapshot — added in `52138bfe feat: structure files, updated sounds, and village
improvements (#33)` alongside the fossil/igloo structure XML set.
:::

A minimal NBT reader (`argparse` description *"Convert NBT structure files to XML"*) that decodes the
standard tag types (`TAG_COMPOUND`, `TAG_LIST`, `TAG_INT_ARRAY`, …) and emits an XML tree — the
inverse of the checked-in `Structures/**/*.xml` assets the game generates fossils and igloos from.

- `-l`/`--little` assumes little-endian NBT; `-o`/`--output` sets the output XML file or directory.
- Usage: `python3 struct_parse.py <input.nbt ...> [-l] [-o out.xml]`.

Files: `tools/struct_parse.py`

## `tools/ghidra/` — 4JLibs binary diffing

The `4JLibs` platform libraries are a git submodule (see [Building neoLegacy](/slop-docs/overview/building/)) shipped as prebuilt COFF `.lib` files. When the submodule bumps, there is no source to diff — so neoLegacy diffs the **compiled symbols** using Ghidra headless analysis. This harness extracts the `.lib` files from two git refs, imports each into Ghidra, exports functions/symbols/externals to JSON, and diffs them.

| File | Size | Role |
|---|---|---|
| `compare-4jlibs.sh` | 11.8 KB | Orchestrator: extract libs from two refs → analyze → diff → report |
| `compare-4jlibs.py` | 21.8 KB | The diff engine (per-lib comparison, `summary.txt`) |
| `ExportLibInfo.java` | 5.4 KB | Ghidra headless post-script — exports one `.lib` to JSON |
| `extract_lib.py` | 3.3 KB | Helper for pulling `.lib` bytes out of git |
| `list-lib-symbols.sh` | 1.3 KB | One-off: dump a single `.lib` to JSON |

### Flow (`compare-4jlibs.sh`)

```
./tools/ghidra/compare-4jlibs.sh [OLD_REF] [NEW_REF] [LIB_FILTER]
```

- `OLD_REF` defaults to `HEAD`, `NEW_REF` to `upstream/main`, `LIB_FILTER` optional (e.g. `4J_Input`).
- **Step 1** — `git diff --name-only OLD NEW -- '<LIB_PATH>/*.lib'` finds changed libs (`LIB_PATH = Minecraft.Client/Windows64/4JLibs/libs`); falls back to listing all libs at `NEW_REF` if none changed. Each version is extracted with `git show <ref>:<path>` into `old/` and `new/`.
- **Step 2** — runs `$GHIDRA_HOME/support/analyzeHeadless` on every `.lib`, importing it and running `ExportLibInfo.java` as a post-script.
- **Steps 3–4** — `compare-4jlibs.py` produces per-library diffs plus a top-level `summary.txt`.
- Output lands under `tools/ghidra/output/report-<timestamp>/` (`old/`, `new/`, `analysis/`, `diff/`, `summary.txt`). The `output/` dir is gitkept but its contents are gitignored.

`GHIDRA_HOME` defaults to a hardcoded dev path (`C:/Users/revela/Documents/Minecraft/Libraries/ghidra_12.0.4_PUBLIC`) — override it via the environment to point at your own Ghidra install.

### `ExportLibInfo.java`

The headless script collects three things from each imported object file and writes them as JSON:

- **Functions** — name, entry point, prototype string, calling convention, size (address count), param count.
- **Symbols** — non-function, non-external symbols with type/address/source.
- **Externals** — imported symbols and their originating library name (via `ExternalManager`).

```java
functions.add(String.format(
    "    {\"name\": %s, \"entry\": %s, \"signature\": %s, "
    + "\"callingConvention\": %s, \"size\": %d, \"paramCount\": %d}",
    jsonStr(f.getName()), jsonStr(f.getEntryPoint().toString()),
    jsonStr(sig), jsonStr(callingConv), size, f.getParameterCount()));
```

It appends to the output file (`new FileWriter(outputFile, true)`), so a `.lib` containing several object files produces several concatenated JSON objects. `list-lib-symbols.sh` is the single-file convenience wrapper around the same `analyzeHeadless` + `ExportLibInfo.java` invocation.

Files: `tools/ghidra/compare-4jlibs.sh`, `tools/ghidra/compare-4jlibs.py`, `tools/ghidra/ExportLibInfo.java`, `tools/ghidra/extract_lib.py`, `tools/ghidra/list-lib-symbols.sh`

## Notes & gotchas

- These tools are **not wired into CMake** — compile/run them manually. The JPEXS tools need `ffdec.jar` on the classpath; the Ghidra tools need a Ghidra install and a Java runtime.
- Several tools carry hardcoded `C:/Users/revela/...` paths (`FindMenuTitleAll.java`, the default `GHIDRA_HOME`). Treat those as illustrative and override for your environment.
- `RebuildArc` overwrites the `.arc` **in place** — back up `MediaWindows64.arc` before running it.

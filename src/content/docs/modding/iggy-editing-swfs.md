---
title: Opening & Editing SWFs
description: Open, inspect, and edit LCE's Iggy/Flash UI movies with JPEXS FFDec — bitmap swaps, AS3/ABC bytecode patches, layout shifts, and the loose-tree/.arc roundtrip back into neoLegacy.
---

Every menu, HUD, and container screen in Minecraft LCE is a **Flash movie** running
inside **Iggy**, RAD Game Tools' Flash/AS3 UI middleware. The C++ side — how a
`UIScene` binds to that movie and drives it — is documented in
[Custom UI Scenes](/slop-docs/modding/custom-ui/). *This* page owns the other half:
the `.swf` files themselves, and how to open, inspect, and edit them.

The whole toolchain neoLegacy already uses for this is a set of scripted
[JPEXS FFDec](https://github.com/jindrapetrik/jpexs-decompiler) patchers in
`tools/*.java`. Those are the real, in-repo precedent for every edit below.

## Iggy in one paragraph

Iggy is closed-source commercial middleware (RAD Game Tools, Kirkland WA — acquired
by **Epic Games in January 2021**, now "Epic Games Tools"). It lets you author a UI
in any Flash tool and run the *exact same content* on console/PC/mobile
([radgametools.com/iggy.htm](https://www.radgametools.com/iggy.htm)). 4J Studios'
**Minecraft (PS3/PS4/Xbox One)** is listed on RAD's own customer page — the
primary-source proof LCE's UI is Iggy, not Scaleform GFx (the rival product,
Autodesk, `.gfx` container, discontinued July 2017)
([radgametools.com/iggygames.htm](https://www.radgametools.com/iggygames.htm),
[Scaleform GFx](https://en.wikipedia.org/wiki/Scaleform_GFx)). The recovered
runtime in neoLegacy is **Iggy 1.2.30** (DLL built 2014-06-20). Iggy targets
**ActionScript 3** and a **Flash-9-era feature subset** (Flash 10 file loading was
added to Iggy in 2013) ([radgametools.com/iggyinfo.htm](https://www.radgametools.com/iggyinfo.htm)).
That subset constraint is the single most important fact for editing safely — see
[Iggy-compat cautions](#iggy-compat-cautions).

> LCE ships **plain `.swf`** movies (the game calls `IggyPlayerCreateFromMemory` on
> the raw SWF bytes — `UIScene.cpp:386`). You do **not** need to deal with Iggy's
> binary `.iggy`/`.iggytex` container to mod neoLegacy: FFDec opens these SWFs
> directly. The Iggy runtime is what *consumes* them at load time.

## The tool: JPEXS FFDec

**JPEXS Free Flash Decompiler (FFDec)** is an open-source (**GPLv3**) SWF
decompiler + editor: it extracts resources, converts SWF↔FLA, edits ActionScript,
and replaces images/sounds/text/fonts. It runs on Windows/Linux/macOS and needs
**Java 8+** ([github.com/jindrapetrik/jpexs-decompiler](https://github.com/jindrapetrik/jpexs-decompiler),
[Features wiki](https://github.com/jindrapetrik/jpexs-decompiler/wiki/Features)).

- **Download:** GitHub releases —
  [github.com/jindrapetrik/jpexs-decompiler/releases](https://github.com/jindrapetrik/jpexs-decompiler/releases).
  Latest stable at time of research was **26.2.1 (2024-05-24)**; nightly builds
  carry newer format fixes.
- **Iggy note:** FFDec explicitly lists **"Iggy files support (64-bit only)"**, but
  treat it as *partial* — historically it started read-only (load Iggy, export
  fonts to TTF). For LCE you're editing the plain `.swf`, so this caveat mostly
  matters if you ever open a true `.iggy` container
  ([JPEXS Iggy thread #1305](https://www.free-decompiler.com/flash/issues/1305-iggy-file-format-fonts-etc)).

neoLegacy drives FFDec as a **library** (`import com.jpexs.decompiler.flash.SWF;`)
from small Java patchers rather than clicking through the GUI — that's what makes
edits reproducible and scriptable. Both workflows are covered below.

## Where the movies live

On the **Windows64** build the game does **not** read a packed archive. `loadMediaArchive`
(`Consoles_App.cpp:4776`) sets:

```cpp
mediapath = L"Common\\Media\\MediaWindows64";
...
m_mediaArchive = new FolderFile(mediapath);   // a loose folder, not an .arc
```

The `ArchiveFile` (packed `media.arc`) branch right below it is `#if 0`-disabled.
So on PC, a movie is just a file: `Common/Media/MediaWindows64/HUD1080.swf`. That is
why the classic-crafting commit could ship `ClassicCraftingMenu720.swf` as a **loose
file** — no repack step (see [Custom UI Scenes](/slop-docs/modding/custom-ui/)).
Console builds point `mediapath` at `MediaPS3` / `MediaOrbis` / `MediaDurango` /
`MediaPSVita` respectively, still as folder trees.

**Naming.** A scene's `getMoviePath()` returns a base stem (e.g. `L"HUD"`); the
loader appends a resolution/platform suffix (`UIScene.cpp:333-357`):

| Platform | Suffix appended | Example |
|---|---|---|
| Windows64, screen >720 | `1080.swf` | `HUD1080.swf` |
| Windows64, else / controlType 3 or 5 | `720.swf` | `HUD720.swf` |
| Split-screen | base already ends `…Split` | `HUDSplit1080.swf` |
| PS3 widescreen / SD | `720.swf` / `480.swf` | `HUD720.swf` |
| PS Vita | `Vita.swf` | `HUDVita.swf` |

If the preferred file is missing the loader falls back `720 → 1080 → FatalLoadError`
(`UIScene.cpp:358-382`). There are **391** `.swf` files across all platforms; the
Windows corpus in `MediaWindows64/` is ~117 `*1080.swf` + ~105 `*720.swf` + ~83
`*Split*.swf`.

## GUI workflow: open, navigate, inspect

1. **Open a movie.** `File → Open` a loose SWF from the extracted media tree, e.g.
   `Common/Media/MediaWindows64/HUD1080.swf`. FFDec parses the tag stream and shows
   a resource tree.
2. **Navigate the tags.** The tree groups the SWF by tag type. The ones a LCE modder
   touches:

   | Node / tag | Code | What it is |
   |---|---:|---|
   | **DefineSprite** | 39 | A named MovieClip (its own timeline). Menu panels, the health icon, buttons. |
   | **DefineBitsLossless2** | 36 | RGBA bitmap **with alpha** — the dominant texture format; what you swap. |
   | **DefineBitsJPEG2/3** | 21/35 | JPEG bitmaps (3 adds an alpha channel). |
   | **DefineShape 1–4** | 2/22/32/83 | Vector geometry (tessellated to triangles by Iggy). |
   | **PlaceObject 2/3** | 26/70 | Places/transforms a character on the display list — carries the **instance name** and matrix. |
   | **DoABC / DoABC2** | 72/82 | The **AS3 bytecode** (ABC block). All script logic lives here. |
   | **SymbolClass** | 76 | Maps character IDs → AS3 class names; **charId 0 = document class**. |

   (Tag codes per [open-flash.github.io/documentation/swf/tags](https://open-flash.github.io/documentation/swf/tags/).)
3. **Find the document class.** The `SymbolClass` entry for character ID 0 binds the
   movie's root AS3 class — for LCE that is `fourj.documents.<Scene>` (e.g.
   `fourj.documents.Hud` for `HUD1080.swf`). This is the class the game's
   `IggyPlayerRootPath` addresses; every scripted call from C++ resolves relative to
   it.
4. **View decompiled AS3.** Under the `scripts` tree FFDec shows the decompiled
   ActionScript for each class. LCE movies carry the **`fourj` framework**:
   `FJ_Document`, `FJ_Base`, `FJ_Button`, `FJ_Label`, `FJ_List`, `FJ_ProgressBar`.
   You can view AS3 two ways: high-level "direct ActionScript editing," or low-level
   **AS3 P-code (ABC bytecode)** via the ABCPanel
   ([Features](https://github.com/jindrapetrik/jpexs-decompiler/wiki/Features)).
5. **Read the instance names.** Select a `PlaceObject3` under a sprite to see its
   `name` — those strings are exactly what the C++ side passes to
   `UI_MAP_ELEMENT("Name")` (see [Custom UI Scenes](/slop-docs/modding/custom-ui/#the-element-map-macros-uisceneh17-45)).
   `"Button0"`, `"Title"`, `"CraftingList"` are display-list instance names.

## Edit workflow 1 — replace a bitmap

The simplest, most reliable edit: swap a `DefineBitsLossless2` texture. This is how
you re-skin a menu. neoLegacy's `tools/ReplaceLogo.java` is the reference — it swaps
the **MINECRAFT logo** in the shared skin SWFs.

![The MenuTitle bitmap (charId 235) from skinHDWin.swf — the MINECRAFT logo ReplaceLogo.java swaps. 857x207 DefineBitsLossless2, RGBA.](/slop-docs/ui-gallery/skinhd-235-MenuTitle.png)

The logo isn't in the menu movies — it lives in the shared skin SWFs
(`Windows64Media/Media/skinWin.swf`, `skinHDWin.swf`, and their `Common/Media/MediaWindows64/`
copies) as symbols `MenuTitle` / `MenuTitleSmall`, and menus pull it in via
`ImportAssets2`. `ReplaceLogo` finds the bitmaps **by symbol name** so it works on
both skins:

```java
// tools/ReplaceLogo.java — swap MenuTitle/MenuTitleSmall by symbol name
Set<String> targetNames = Set.of("MenuTitle", "MenuTitleSmall");
for (Tag tag : swf.getTags()) {
    if (tag instanceof DefineBitsLossless2Tag) {
        DefineBitsLossless2Tag bmp = (DefineBitsLossless2Tag) tag;
        // ... look up this charId's symbol name from SymbolClass ...
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(scaledLogo, "png", baos);
        bmp.setImage(baos.toByteArray());   // FFDec re-encodes into the tag
    }
}
try (FileOutputStream fos = new FileOutputStream(outputPath)) {
    swf.saveTo(fos);                        // write the modified SWF back out
}
```

`DefineBitsLossless2Tag.setImage(pngBytes)` is the whole trick — hand FFDec PNG
bytes and it re-encodes them into the lossless-with-alpha tag. **In the GUI** the
same thing is `right-click the bitmap → Replace` and pick a PNG.

FFDec can replace **all** bitmap tag types (DefineBits, JPEG2/3/4,
DefineBitsLossless1/2, DefineExternalImage, DefineSubImage)
([Features](https://github.com/jindrapetrik/jpexs-decompiler/wiki/Features)). Keep
the **same pixel dimensions** as the original when you can — the display-list
matrix that places the bitmap is sized for the original, so a differently-sized
image renders scaled. If you must change size, pass a scale (ReplaceLogo takes an
optional `scale` arg that shrinks the logo inside the original canvas with
transparent padding).

## Edit workflow 2 — edit AS3 / ABC bytecode

Changing script behaviour means editing the **DoABC2** block. neoLegacy has two
tiers of precedent.

### Tier 1 — the surgical bytecode patch (`PatchHudABC.java`)

`tools/PatchHudABC.java` is the deepest example in the repo: **raw AVM2 bytecode
patching** of the `Hud` class to add hardcore hearts, done without recompiling. From
its own docstring it makes three changes:

1. **Adds `m_bHardcore:Boolean`** as an instance variable (a new slot trait,
   reusing the private namespace of an existing `m_bWithered` field).
2. **Adds a `SetHardcore(Boolean):void` method** — a new `MethodInfo` +
   `MethodBody` with hand-assembled bytes (`getlocal0 / pushscope / getlocal0 /
   getlocal1 / setproperty / returnvoid`).
3. **Modifies `SetHealth`** to check `m_bHardcore` and offset the heart frame index,
   spliced in as raw bytes after the `setlocal 7` in the existing method body.

The hard part isn't the new bytes — it's that inserting bytes shifts every later
instruction, so **every jump that crosses the insertion point needs its `s24`
offset fixed**. PatchHudABC does exactly that (`fixJumpOffsets`), carries a full
AVM2 instruction-size table and `u30`/`s24` codecs, and knows which opcodes take a
jump offset:

```java
// tools/PatchHudABC.java — opcodes whose first operand is an s24 jump offset
static final Set<Integer> JUMP_OPCODES = Set.of(
    0x10, // jump
    0x11, // iftrue
    0x12, // iffalse
    0x13, // ifeq
    // ... ifne/iflt/ifle/ifgt/ifge/ifstricteq/ifstrictne/ifnlt ...
);
```

The C++ side that *calls* this new `SetHardcore` — the interned `IggyName`, the
`IggyPlayerCallMethodRS` dispatch — is the `UIScene_HUD::SetHealth` machinery
described in [Custom UI Scenes](/slop-docs/modding/custom-ui/). The point of raw
patching is that FFDec's high-level AS3 re-compile can drift outside Iggy's subset;
byte-splicing an existing method keeps every other byte identical.

### Tier 2 — feature patchers that clone existing widgets

`tools/AddVSyncCheckbox.java` and `AddExclusiveFullscreenCheckbox.java` are the
higher-level, safer pattern: instead of writing new AS3, they **clone an existing
control**. AddVSyncCheckbox opens a `SettingsGraphicsMenu` SWF, finds the
`CustomSkinAnim` checkbox `PlaceObject3`, clones it, renames the clone `"VSync"`,
positions it below the original, and shifts the sliders down:

```java
// tools/AddVSyncCheckbox.java — guard, then find the widget to clone
for (Tag tag : swf.getTags()) {
    if (tag instanceof PlaceObject3Tag) {
        PlaceObject3Tag po = (PlaceObject3Tag) tag;
        if ("VSync".equals(po.name)) return;          // idempotent: already added
        if ("CustomSkinAnim".equals(po.name)) customSkinAnimTag = po;
        // ... collect slider tags to push down ...
    }
}
```

Because the clone reuses the original checkbox's symbol and AS3 wiring, it inherits
Iggy's exact structure — you only renamed an instance and moved a matrix. That new
`"VSync"` instance name is then what a `UI_MAP_ELEMENT("VSync")` on the C++ scene
binds to. This clone-and-rename technique is the backbone of the
[custom-GUI page](/slop-docs/modding/iggy-custom-gui/).

## Edit workflow 3 — move / resize elements

Pure layout edits change a `PlaceObject` **matrix** (translate/scale, in *twips* —
20 twips per pixel). Two reference patchers:

- **`tools/ShiftMenuY.java`** — the generic one. Walks every `PlaceObjectTypeTag`,
  optionally filtered by instance name, and adds a pixel offset to `translateY`:

  ```java
  // tools/ShiftMenuY.java
  int offsetTwips = offsetPixels * 20;              // 20 twips = 1 px
  MATRIX matrix = po.getMatrix();
  matrix.translateY += offsetTwips;                 // +down, -up
  po.setModified(true);
  ```

- **`tools/ShiftLogo.java`** — the resolution-aware one. Shifts the logo in
  `ComponentLogo` SWFs, but **scales the shift by the SWF's frame height relative to
  1080** so the same call lands correctly on the 720 and Split variants:

  ```java
  // tools/ShiftLogo.java — scale a 1080-referenced shift to this SWF's height
  double frameHeightPx = (swf.displayRect.Ymax - swf.displayRect.Ymin) / 20.0;
  double ratio = frameHeightPx / 1080.0;
  int yShiftTwips = (int) Math.round(yShiftPx1080 * ratio * 20);
  ```

That per-resolution scaling is the crux of the whole SWF corpus: **every layout edit
must be applied to each resolution variant** (`720`, `1080`, `Split720`,
`Split1080`), and the shift is in that movie's own pixel space. See the
[resolution obligations](/slop-docs/modding/iggy-custom-gui/#resolution-variant-obligations)
on the custom-GUI page.

## CLI / batch mode

For automating an asset pipeline, FFDec has a headless CLI
([CLI replace examples](https://www.free-decompiler.com/flash/issues/1111-examples-of-cli-replace-command)):

```bash
# Export resources: <type> = image | script | shape | sprite | font | sound | all …
ffdec -export image ./out/HUD1080 HUD1080.swf
ffdec -export script ./out/HUD1080-as HUD1080.swf     # AS3 source

# Replace a resource by characterId or class name; trailing int = method-body index
ffdec -replace in.swf out.swf 235 newlogo.png          # swap bitmap charId 235
ffdec -replace as3.swf out.swf classes.Test new.pcode 2
```

neoLegacy's own extraction (`extract-ui-pngs.sh`) runs `ffdec -export image,shape,sprite`
across all 370 movies, producing **~50,077 PNGs** into `ui-png/<swf>/{images,shapes,sprites}/` —
that's the source of the gallery images on these pages.

## The roundtrip: back into the game

Every neoLegacy patcher ends the same way — `swf.saveTo(fos)` writes the modified
SWF. Getting it back into the game depends on how the target platform loads media.

### Windows64 / PC — drop the loose file (no repack)

Because `loadMediaArchive` uses `FolderFile` on Windows (above), you just **write
the patched `.swf` back into `Common/Media/MediaWindows64/`** (or overwrite in
place). The loader also checks the selected texture pack's archive *first*
(`Consoles_App.cpp:10130 hasArchiveFile`), so a pack can override a movie without
touching the base tree:

```cpp
if (tPack && tPack->getArchiveFile() && tPack->getArchiveFile()->hasFile(filename))
    return true;                       // texture pack wins
else return m_mediaArchive->hasFile(filename);
```

Movie bytes are then fetched by `ui.getMovieData()` → `app.getArchiveFile()` and
handed to `IggyPlayerCreateFromMemory` (`UIScene.cpp:386`). `getMovieData` caches
loaded movies for ~60 s (`UIController.cpp:976`), so a full app restart is the clean
way to see a swapped movie.

### Packed platforms / `.arc` — `RebuildArc.java`

For platforms that ship a packed `MediaWindows64.arc` (or `.pck`), neoLegacy's
`tools/RebuildArc.java` round-trips the archive. The `.arc` container is
**Java-`DataOutputStream` style, big-endian**:

```
int  numberOfFiles
per file:
    UTF  filename        (leading '*' = compressed)
    int  offset          (into the data section)
    int  filesize
raw file data follows the header
```

`RebuildArc <arc_file> <media_dir> [file1.swf …]` reads the original index, replaces
the named SWFs (or **all** SWFs found in `media_dir` if none are named), then
rewrites the index + data section. `ExtractFromArc.java` / `ListArc.java` do the
inverse (pull one file / list members). The community extraction chain is the same
idea: `.arc`/`.pck` → extract → edit `.swf` in FFDec → repack → replace.

### Testing in-game

1. Launch the build with your patched movie in the media tree (or repacked `.arc`).
2. Navigate to the scene that loads it. If the movie is missing/renamed wrong, the
   loader logs `WARNING: Could not find iggy movie …` and falls back
   (`720 → 1080`), or `FatalLoadError`s if nothing matches.
3. Watch the debug log for Iggy trace/warning output — `postInit` registers
   `IggySetWarningCallback` + `IggySetTraceCallbackUTF8`, so AS3 `trace()` and Iggy
   warnings surface there.

## Iggy-compat cautions

The subset is the thing that bites. Keep edits inside what Iggy 1.2.30 actually
runs.

- **Flash-9 subset only.** Iggy is AS3 + a Flash-9-era feature level (Flash-10 *file
  loading* added 2013, not full Flash-10 language)
  ([iggyinfo](https://www.radgametools.com/iggyinfo.htm)). Confirmed-supported:
  MovieClip/MouseEvent, tessellated vector shapes, bitmap fonts + wide lines,
  linear/circular gradients, GPU blur/filter effects, blend modes, and AS3
  weak-reference `Dictionary`. Do **not** rely on TLF text (FFDec doesn't support it
  either), modern language runtime features, or anything Flash-10+.
- **Minimal edits, never full recompiles.** FFDec warns that complex/obfuscated SWFs
  may not re-save perfectly. For Iggy content the safe rule is: **swap one bitmap,
  patch one method body, shift one matrix** — don't decompile-then-recompile a whole
  movie. That's exactly why PatchHudABC byte-splices instead of recompiling
  ([Features](https://github.com/jindrapetrik/jpexs-decompiler/wiki/Features),
  [Iggy thread](https://www.free-decompiler.com/flash/issues/1305-iggy-file-format-fonts-etc)).
- **Always keep the original.** Every patcher writes to an `output.swf` and leaves
  the source intact; do the same.
- **Fingerprint identity.** neoLegacy's de-SWF **shim** identifies each scene by
  hashing the movie's raw bytes (it CRC32s the first 4096 bytes, because the game
  passes a **null** config to `IggyPlayerCreateFromMemory` so there's no other
  handle to the scene). Any byte-level edit changes that fingerprint. That only
  matters for the shim path (`uiassets/scenes.tsv`), not the stock Iggy runtime —
  but it's why the shim's `gen-scenes-tsv.py` de-dupes movies by `(size, crc32)`.
- **Instance names are the contract.** The strings you rename in a movie must exactly
  match the `UI_MAP_ELEMENT("Name")` calls on the C++ scene, or the control binds to
  nothing and renders blank/unresponsive. That contract is the whole subject of the
  next page.

## Where to go next

- [Custom GUI: New SWFs & New Scenes](/slop-docs/modding/iggy-custom-gui/) — clone a
  movie, wire a new scene, and honour every resolution variant.
- [Custom UI Scenes](/slop-docs/modding/custom-ui/) — the C++ `UIScene` /
  `UI_MAP_ELEMENT` / `getMoviePath` details these movies plug into.
- [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/) — the `.arc`
  workflow and localization codegen alongside these SWF edits.

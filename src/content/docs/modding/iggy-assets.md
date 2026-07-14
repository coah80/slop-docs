---
title: UI Movies & Textures
description: The 391-SWF Iggy corpus — families, resolution naming, .arc packaging, what's inside a movie, the texture atlases, and how to extract everything yourself.
---

LCE's entire front-end is a library of Flash movies played by
[Iggy](/slop-docs/modding/iggy-overview/). This page inventories that
**391-SWF corpus**: how the files are named and packaged, what lives inside one,
where the textures come from, and how to pull it all apart with JPEXS FFDec. For
the runtime that plays them see [Iggy: the UI Runtime](/slop-docs/modding/iggy-overview/);
for the C++ scenes that bind to them see
[Custom UI Scenes](/slop-docs/modding/custom-ui/).

## The corpus at a glance

There are **391** `.swf` files across all platforms in the game tree
(`find -iname '*.swf'`). The Windows/PC corpus lives in
`Minecraft.Client/Common/Media/MediaWindows64/`, plus a handful of skin/control
SWFs in `Windows64Media/Media/`. Suffix census in `MediaWindows64/`:

| Suffix | count | Meaning |
|---|---:|---|
| `*1080.swf` | 117 | Full-screen, ≥1080p |
| `*720.swf` | 105 | Full-screen, 720p |
| `*Split1080.swf` | 44 | Split-screen, 1080p |
| `*Split720.swf` | 39 | Split-screen, 720p |
| `*480.swf` | 56 | Cross-platform 480p residue (PS3-era) |
| `*Vita.swf` | 55 | PS Vita variants |

After byte-identical de-duplication the corpus collapses to **366 canonical
scenes** (`docs/UI-DESWF-ROADMAP.md:58`); Cole's `extract-ui-as3.sh` reports 370
canonical SWFs + 3 same-name variants, of which **18 are art-only** with no
ActionScript (`WORKLOG.md:191-193`).

### Naming convention

Every movie name is `<SceneBase>[Split]<Res>.swf`. The C++ side supplies just the
`<SceneBase>` from `getMoviePath()`; `UIScene::loadMovie` appends `Split` (for 2+
local players) and the resolution suffix (see
[the movie lifecycle](/slop-docs/modding/iggy-overview/#the-movie-lifecycle--from-arc-load-to-on-screen)).
So `getMoviePath() → L"HUD"` becomes `HUD1080.swf`, `HUD720.swf`,
`HUDSplit1080.swf`, `HUDSplit720.swf` on Windows (plus `HUD480.swf`/`HUDVita.swf`
carried from other platforms).

### Families

The corpus groups into a few obvious families:

- **Menus**: `AchievementsMenu`, `AnvilMenu`, `CreateWorldMenu`, `DLCOffersMenu`,
  `SettingsOptionsMenu`, `SkinSelectMenu`, `SignEntryMenu`, …
- **HUD**: `HUD1080/720`, `HUDSplit1080/720`, `HUDVita`, `HUD480`.
- **Containers**: `ChestMenu`, `ChestLargeMenu`, `BrewingStandMenu`, `BeaconMenu`,
  `Crafting2x2Menu`, `Crafting3x3Menu`, `ClassicCraftingMenu`, `CreativeMenu`.
- **Intro / branding**: `Intro`, `ComponentLogo`.
- **Skins & controls** (the shared art SWFs): `skinWin`, `skinHDWin`,
  `platformskin`, `platformskinHD`, `Controls`, `ComponentLogo`. Menu movies
  **import** art from these rather than embedding it (see below).

### The `.arc` packaging

Movies ship packed into `.arc` archives. The container is a Java
`DataOutputStream`-style, **big-endian** format (documented in
`neoLegacy/tools/RebuildArc.java:14-20`):

```
int   numFiles
repeat numFiles times:
    UTF  name      // leading '*' marks a compressed entry
    int  offset
    int  size
... raw file data ...
```

`UIScene::loadMovie` gates on `app.hasArchiveFile(moviePath)` and pulls the bytes
with `ui.getMovieData(moviePath.c_str())` before handing them to
`IggyPlayerCreateFromMemory`. In neoLegacy many movies are also committed **loose**
under `Common/Media/MediaWindows64/` (e.g. the `ClassicCraftingMenu*.swf` added in
the classic-crafting commit). The repo's `.java` tools round-trip the archive:
`ListArc` lists members, `ExtractFromArc` pulls one out via
`RandomAccessFile.seek`, and `RebuildArc` repacks — see
[Textures & Asset Pipeline §the .arc workflow](/slop-docs/modding/textures-assets/#2-the-arc-archive--rebuildarc-workflow).

## What's inside a movie

A ffdec extraction of one SWF (`extract-ui-pngs.sh` runs
`ffdec -export image,shape,sprite` per file, `extract-ui-pngs.sh:22`) produces
three sub-trees under `ui-png/<swf-name>/`:

- **`images/`** — raster bitmaps as `<id>_<name>.png`.
- **`shapes/`** — vector shapes as `<id>.svg` (Iggy tessellates these to triangles
  at runtime).
- **`sprites/`** — one dir per `DefineSprite`, each holding per-frame `<n>.png`
  (frame numbers can be sparse). Names carry the sprite's export name, e.g.
  `DefineSprite_2_HUD1080_fla.Selected_Label_2`.

Across the full corpus this yielded **50,077 PNGs** across **370** SWF dirs.

### The layout manifest

`tools/DumpLayout.java` dumps each SWF's structure to a JSON manifest
(`neoLegacy-mac/ui-layout/<name>.json`): header (width/height/fps),
`exports`/`imports`, and every sprite's per-frame display list. Example
`HUD1080.json`:

```json
{ "file":"HUD1080.swf", "width":1920, "height":1080, "fps":30.0,
  "exports":{ "HUD1080_fla.Selected_Label_2":2, "fourj.documents.Hud":0 },
  "imports":[],
  "sprites":{ "2":{ "frames":39, "places":[
      { "frame":0, "depth":1, "charId":-1, "name":"Label",
        "matrix":{"tx":0.00,"ty":0.00,"sx":1.1711,"sy":1.0000,"rot":false} }, … ]}}}
```

Each SWF carries:

- A **document class** `fourj.documents.<Scene>` (here `fourj.documents.Hud`)
  exported at **charId 0** — the AS3 root that Iggy's `IggyPlayerRootPath`
  addresses. (In SWF terms, `SymbolClass` with character ID 0 binds the main
  timeline's class; see the [Flash refresher](#swf-tag-refresher).)
- **Sprites** (`DefineSprite`) with per-frame `places[]` of
  `{frame, depth, charId, name, matrix}` — matrices in twips (÷20 for pixels).
- **Bitmaps and shapes** (below).

### The `fourj` framework and `FJ_*` classes

The AS3 lives under `as3/<Scene>/scripts/fourj/…` and follows a consistent
class taxonomy — the `FJ_` prefix is 4J Studios' own. From `HUD1080`:

```
fourj/Base/FJ_Base.as         fourj/Base/FJ_Label.as
fourj/Base/FJ_ProgressBar.as  fourj/Base/FJ_DragonHealth.as
fourj/Base/FJ_Helpers.as      fourj/Base/FJ_LabelOutline.as
fourj/Labels/FJ_Label_HUD_White.as
fourj/ProgressBars/FJ_ExperienceBar.as
fourj/ProgressBars/FJ_HorseJumpBar.as
fourj/ProgressBars/FJ_DragonHealth_0{3,4,5}.as
fourj/documents/Hud.as        fourj/FJ_Hud.as
```

Base widget classes (`FJ_Button`, `FJ_Label`, `FJ_List`, `FJ_ProgressBar`) carry
an `m_iId` assigned by the game's `Init(label, id)` call and `m_objNav*`
navigation strings. The document class extends `MovieClip`; e.g.
`public class Hud extends MovieClip` (`Hud.as`), whose `SetHealth(int, Boolean×3)`
is the exact method the engine invokes via `m_funcSetHealth`
(see [method dispatch](/slop-docs/modding/iggy-overview/#method-dispatch--the-workhorse)).
Health rendering is frame-index driven — `HEALTH_STATES_NORMAL/POISON/WITHER` are
2×3 arrays mapping (blink, fill-level) → a heart-clip frame, and `SetHealth` calls
`m_HealthIcons[i].gotoAndStop(frame)`.

### Bitmap formats

The tools scan for these bitmap tag types (`tools/FindLogoBitmap.java:36-59`,
`DumpSwfDetail.java:33`):

| Tag | Role |
|---|---|
| **`DefineBitsLossless2`** | RGBA, zlib-compressed lossless **with alpha** — the dominant format |
| `DefineBitsLossless` | Lossless, no alpha |
| `DefineBitsJPEG2` / `JPEG3` | JPEG (JPEG3 adds a separate alpha channel) |
| `DefineBits` | Legacy JPEG |

Symbol→class association is via `SymbolClassTag` / `ExportAssetsTag`. Cross-SWF
art sharing is via **`ImportAssets2Tag`** (`DumpSwfDetail.java:22`) — menu SWFs
import their buttons and backgrounds from the shared `skin*` SWFs rather than
embedding copies. When you edit art, the menu-atlas edit usually belongs in a
`skin*` SWF, not the menu itself.

## Texture gallery

Textures come from two places: **shared atlas PNGs under `Common/res`** (the
classic-Java-style GUI sheets), and **bitmaps embedded inside individual SWFs**
(most menu art). The gallery below shows representative examples of each, captioned
with where each one lives.

### Classic `res` atlases (`Common/res`)

These are the flat PNG atlases used by the older GUI paths — not SWF-internal.

![The classic gui.png atlas — widget frames, slots, tabs (Common/res/gui.png)](/slop-docs/ui-gallery/res-gui.png)

*`gui.png` — the classic widget atlas (button frames, slot backgrounds, tab
strips). Lives loose under `Common/res/`, addressed by pixel rect, not by an Iggy
value path.*

![The classic icons.png atlas — hearts, hunger, armor icons (Common/res/icons.png)](/slop-docs/ui-gallery/res-icons.png)

*`icons.png` — hearts, hunger haunches, armor plates, and crosshair. The
classic-HUD atlas; the Iggy HUD renders the same concepts from SWF sprite frames
instead.*

### SWF-internal bitmaps

Everything below was extracted out of a SWF's `images/` tree with FFDec.

![Leaderboard mob icon — slime (skin.swf, DefineBitsLossless2 id 14)](/slop-docs/ui-gallery/skin-14-leaderboard-slime.png)
![Leaderboard mob icon — spider (skin.swf, id 12)](/slop-docs/ui-gallery/12-leaderboard-icon-spider.png)
![Leaderboard mob icon — skeleton, small (skin.swf, id 15)](/slop-docs/ui-gallery/15-leaderboard-icon-skeleton-small.png)

*Leaderboard "cause of death" icons from the shared **`skin.swf`**
(`ui-png/skin/images/*_LeaderBoard_Icon_*.png`) — `DefineBitsLossless2` RGBA
bitmaps, ~1–3 KB each. The full set (Zombie, Creeper, Ghast, Spider, Slime,
Portal, Walked, Swam, Climbed, Fallen, …) ships in both full and `_Small` sizes.*

![Menu title bitmap (skinWin.swf, images/*_MenuTitle.png)](/slop-docs/ui-gallery/skinwin-180-menutitle.png)

*A `MenuTitle` bitmap from **`skinWin.swf`** (`ui-png/skinWin/images/…_MenuTitle.png`).
Menu movies `ImportAssets2` this rather than embedding it, so one edit here
retitles every menu that imports it.*

![Minecraft icon bitmap (skinWin.swf, images/8_Minecraft_ICON_PS3_240.png)](/slop-docs/ui-gallery/skinwin-8-minecraft-icon.png)

*`Minecraft_ICON_PS3_240` from **`skinWin.swf`** — the branded pack/game icon, a
JPEG-derived bitmap. Same asset appears across `PS3`/`PS4`/`xbox360` skin SWFs
under different char-ids.*

![DLC background art (skinGraphics.swf, images/240_DLCBackground.png)](/slop-docs/ui-gallery/skingraphics-240-dlcbackground.png)

*`DLCBackground` from **`skinGraphics.swf`** — a full-panel background used behind
the DLC/store menus. This is the kind of large `DefineBitsLossless2` bitmap you'd
swap to reskin a menu.*

![Default pack comparison art (skinHDWin.swf, images/238_DefaultPack_Comparison.png)](/slop-docs/ui-gallery/skinhdwin-238-defaultpack-comparison.png)

*`DefaultPack_Comparison` from **`skinHDWin.swf`** (the HD skin atlas) — a
side-by-side texture-pack comparison graphic.*

![Skin-select preview tile (SkinSelectMenu1080.swf, images/3.png)](/slop-docs/ui-gallery/skinselectmenu-3.png)

*A preview tile embedded directly in **`SkinSelectMenu1080.swf`**
(`ui-png/SkinSelectMenu1080/images/3.png`) — an example of art embedded in the
menu SWF itself rather than imported from a skin atlas.*

![Credits scroll background (skinWin.swf, images/222_CreditBackground.png)](/slop-docs/ui-gallery/skinwin-222-creditbackground.png)

*`CreditBackground` from **`skinWin.swf`** — the largest single UI bitmap in the
Windows corpus (~600 KB), used behind the credits scroll.*

### Intro art

![Intro animation frame (Intro1080.swf, sprites/DefineSprite_*/13.png)](/slop-docs/ui-gallery/intro-13.png)
![Intro animation frame (Intro1080.swf, sprites/DefineSprite_*/16.png)](/slop-docs/ui-gallery/intro-16.png)

*Two frames from the **`Intro`** movie's animated sprite (1920×1080). The
`Intro1080` family also embeds a large title bitmap (`images/19.png`). The intro's
`handleAnimationEnd` callback fires at a fixed frame to hand control back to C++.*

### Controller glyphs

![Xbox One menu-title glyph (skinWin/xboxOne, id 107)](/slop-docs/ui-gallery/xb1-107_MenuTitle.png)
![Controller button glyph (Controls SWF, id 100)](/slop-docs/ui-gallery/xb1-100.png)
![Controller button glyph (Controls SWF, id 11)](/slop-docs/ui-gallery/xb1-11.png)

*Xbox-One button glyphs and title art from the **`Controls`** / platform skin
SWFs. Per-platform Controls variants (`Controls1080/720/Split1080/Vita`) carry the
matching button prompts for that platform. The controller-icon *set* is chosen at
runtime by the `eGameSetting_ControlType` slider (see
[Custom UI Scenes §settings slider](/slop-docs/modding/custom-ui/#settings-scene-slider-example-uiscene_settingsuimenu)).*

### The three new PackGraphics (upstream)

![PackGraphic 1036 (MediaWindows64/Graphics/PackGraphics/1036.png)](/slop-docs/ui-gallery/packgraphic-1036.png)
![PackGraphic 549 (MediaWindows64/Graphics/PackGraphics/549.png)](/slop-docs/ui-gallery/packgraphic-549.png)
![PackGraphic 556 (MediaWindows64/Graphics/PackGraphics/556.png)](/slop-docs/ui-gallery/packgraphic-556.png)

*Three DLC/texture-pack cover graphics added upstream in commit **`87dca773`**
("Adding 3 missing PackGraphics", #48) under
`Minecraft.Client/Common/Media/MediaWindows64/Graphics/PackGraphics/`. These are
loose PNGs (not SWF-internal) — 1036.png (85,718 B), 549.png (78,011 B), 556.png
(113,581 B).*

## Extracting everything yourself

### The batch script

`neoLegacy-mac/extract-ui-pngs.sh` is the reference. It finds every SWF under the
media dirs and runs FFDec's export in parallel:

```bash
# per SWF → ui-png/<name>/{images,shapes,sprites}/
java -jar "$FFDEC_JAR" -export image,shape,sprite "$dest" "$swf"
# driven across all SWFs:
find "$GAME_DIR/Common/Media" "$GAME_DIR/Windows64Media/Media" -name '*.swf' -print0 |
    xargs -0 -n1 -P "$JOBS" bash -c 'extract_one "$0"'
```

`extract-ui-as3.sh` does the same with `-export script` to pull the AS3 source.

### FFDec CLI one-liners

FFDec (JPEXS Free Flash Decompiler, GPLv3, Java 8+) has a headless batch mode.
Export types include `image`, `shape`, `sprite`, `script`, `font`, `sound`, `all`
([JPEXS CLI docs](https://www.free-decompiler.com/flash/issues/1111-examples-of-cli-replace-command)):

```bash
# every image from one movie
ffdec -export image  ./out/HUD1080  HUD1080.swf
# just the AS3 source
ffdec -export script ./out/HUD1080  HUD1080.swf
# shapes as SVG + sprites as per-frame PNG
ffdec -export shape,sprite ./out/HUD1080 HUD1080.swf
```

To put art *back*, FFDec's `-replace` swaps one asset by character id or class:

```bash
ffdec -replace in.swf out.swf <characterId> new_bitmap.png
```

> **Iggy caveat.** FFDec explicitly lists "Iggy files support (64 bit only)," but
> Iggy is a *non-standard* SWF-derived container, so full re-serialization is
> fragile — **font/text/AS3 edits are the reliable path; image/shape edits less
> so**, and complex re-saves can corrupt data
> ([JPEXS #1305](https://www.free-decompiler.com/flash/issues/1305-iggy-file-format-fonts-etc),
> [JPEXS Features](https://github.com/jindrapetrik/jpexs-decompiler/wiki/Features)).
> The neoLegacy movies in the tree are already plain SWF (extracted from Iggy), so
> they round-trip cleanly. **Make the minimal edit** (swap one `DefineBitsLossless2`
> bitmap, patch one method body) and always keep the original. The safe modding
> pattern is **clone-and-modify** an existing movie, not author a new one — a
> freshly compiled Royale/Haxe SWF is very unlikely to load in Iggy as-is
> ([iggyinfo](https://www.radgametools.com/iggyinfo.htm)). For programmatic AS3/ABC
> editing the repo ships JPEXS-based patchers — see
> [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/#jpexs-swf-patchers)
> and [Custom UI Scenes §the JPEXS patchers](/slop-docs/modding/custom-ui/#editing-the-movie-the-jpexs-patchers).

### The `ui-layout` JSON manifests (machine-readable layouts)

`tools/DumpLayout.java` emits one JSON per SWF (header + exports/imports + every
sprite's per-frame display list with twips→pixel matrices). These
`ui-layout/*.json` files are the **machine-readable index** of the whole UI: they
let a tool join a placement's `charId`/instance-name to a concrete extracted PNG,
follow `ImportAssets2` links into the skin SWFs, and resolve AS3
`public var Name:Class` bindings to skin symbols. Cole's `gen-scene-bundles.py`
does exactly that join to build per-scene "bundles" — flat lists of
`N depth zdepth frame name png|- frames tx ty sx sy` (`WORKLOG.md:186-188`) — which
is what let the [iggy-shim](/slop-docs/modding/iggy-overview/#appendix-how-the-api-behaves-in-practice-de-swf--iggy-shim)
render the UI from PNG + JSON with no SWF in the pipeline at all. If you're
building UI tooling, generate these manifests first; they are the map from movie
element → texture on disk.

## Where to go next

- [Iggy: the UI Runtime](/slop-docs/modding/iggy-overview/) — the C API and how
  the engine plays these movies.
- [Custom UI Scenes](/slop-docs/modding/custom-ui/) — adding a C++ scene bound to
  a movie, and the JPEXS patcher workflow.
- [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/) — the `.arc`
  archive tools, `RebuildArc` repack, and the localization codegen chain.

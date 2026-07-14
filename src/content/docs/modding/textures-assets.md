---
title: Textures & Asset Pipeline
description: How neoLegacy's block/item atlases, the .arc archive, and the localization → strings.h codegen chain actually work, and how to add to them.
---

This page covers the four asset systems a modder touches: the **pre-stitched
terrain/items atlases**, the **`.arc` archive** that holds the UI movies, the
**localization XML → `strings.h` codegen chain**, and the **`colours.xml`** biome
colour override. Everything here is read from the codebase as it exists today; see
[Adding Blocks](/slop-docs/modding/adding-blocks/) and
[Custom UI Scenes](/slop-docs/modding/custom-ui/) for the end-to-end feature
workflows that consume these assets.

## 1. The pre-stitched texture atlases

Unlike PC Minecraft, neoLegacy does **not** stitch the block/item atlas from
loose PNGs at runtime. 4J replaced that with a build-time, hardcoded UV map:
`PreStitchedTextureMap` (`Minecraft.Client/PreStitchedTextureMap.h`), described in
its own comment as *"4J Added this class to stop having to do texture stitching at
runtime"*.

Two instances are created in `Textures::Textures()` (`Textures.cpp:313`):

```cpp
terrain = new PreStitchedTextureMap(Icon::TYPE_TERRAIN, L"terrain", L"textures/blocks/", missingNo, true);
items   = new PreStitchedTextureMap(Icon::TYPE_ITEM,    L"items",   L"textures/items/",  missingNo, true);
```

| Field | Terrain map | Items map |
|-------|-------------|-----------|
| `iconType` | `Icon::TYPE_TERRAIN` = 0 (`Icon.h:8`) | `Icon::TYPE_ITEM` = 1 (`Icon.h:9`) |
| atlas name | `terrain` | `items` |
| source dir | `textures/blocks/` | `textures/items/` |
| mipMap arg | `true` | `true` |

`Icon::TYPE_TERRAIN` / `Icon::TYPE_ITEM` are the only two icon types
(`Minecraft.World/Icon.h:8-9`).

### Atlas grid — where the UVs come from

The whole UV table lives in one function, `PreStitchedTextureMap::loadUVs()`
(`PreStitchedTextureMap.cpp:322`). It early-returns if already populated
(`:324`), so the map is built exactly once. Cells are added with the `ADD_ICON`
macro (`PreStitchedTextureMap.cpp:318`):

```cpp
#define ADD_ICON(row, column, name) \
    (texturesByName[name] = new SimpleIcon(name, name, \
        horizRatio*column, vertRatio*row, \
        horizRatio*(column+1), vertRatio*(row+1)));
```

`loadUVs()` has **two branches** keyed on `iconType`, and the two branches use
**different grid ratios** — this is the single most important gotcha:

| Branch | Condition | `horizRatio` | `vertRatio` | Grid |
|--------|-----------|--------------|-------------|------|
| Items | `iconType != Icon::TYPE_TERRAIN` (`:338`) | `1/16` (`:340`) | `1/16` (`:341`) | 16×16 cells |
| Terrain | `else` (`:672`) | `1/16` (`:672`) | `1/32` (`:673`) | **16 wide × 32 tall** |

So the **items sheet is a 16×16 grid**, but the **terrain sheet is 16 columns by
32 rows**. A `(row, column)` in a block registration is relative to the terrain
grid; the same numbers on the items sheet mean a different pixel region. First
entries for reference:

- Items branch starts `ADD_ICON(0, 0, L"helmetCloth")` … (`:343`).
- Terrain branch starts `ADD_ICON(0, 0, L"grass_top")` (`:675`), then
  `stone` at `(0,1)`, `dirt` at `(0,2)`, `grass_side` at `(0,3)`, and so on.

There are two macro variants beside `ADD_ICON`:

- `ADD_ICON_WITH_NAME(row, column, name, filename)` (`:319`) — icon key differs
  from the source filename.
- `ADD_ICON_SIZE(row, column, name, height, width)` (`:320`) — multi-cell icons
  (spans `width` columns × `height` rows).

`ADD_ICON` expands to `texturesByName[name] = new SimpleIcon(...)`
(`PreStitchedTextureMap.cpp:318`), and `texturesByName` is a
`unordered_map<wstring, Icon *>` (`PreStitchedTextureMap.h:26-27`). That storage
shape decides what "collision" means, and it is **not** what you'd expect from a
2D grid:

- **Two icons in the same `(row, column)` cell** (different *names*) is not a
  collision at all — they are separate map keys whose UVs happen to point at the
  same pixels. Both `SimpleIcon`s are created; both draw the same texel region.
  Harmless (and occasionally intentional — several names alias one cell).
- **Two `ADD_ICON` with the same *name*** (any cells) *is* the real collision:
  the second `operator[]` assignment overwrites the entry, **leaks** the first
  `SimpleIcon *` (nothing frees it), and the name now resolves to the
  last-registered cell. No warning is printed. So it is the icon *name*, never the
  cell, that must be unique.

### Icon flags (grass tinting fast-path)

A few terrain icons get an extra `setFlags(...)` call so the tesselator can
special-case them without a name compare, e.g. (`:676`, `:679`):

```cpp
ADD_ICON(0, 0, L"grass_top")
texturesByName[L"grass_top"]->setFlags(Icon::IS_GRASS_TOP);
ADD_ICON(0, 3, L"grass_side")
texturesByName[L"grass_side"]->setFlags(Icon::IS_GRASS_SIDE);
```

If you add a texture that needs biome tinting, set the matching flag the same way.

### How a Tile/Item claims a cell

At `stitch()` time (`PreStitchedTextureMap.cpp:36`), after `loadUVs()`, the
terrain map walks every registered `Tile` and calls `tile->registerIcons(this)`
(`:53`), and every `Item` whose `getIconType()` matches calls
`item->registerIcons(this)` (`:67`). The default `registerIcons` looks the icon up
by the `setIconName(L"...")` string you gave the tile/item. **The icon name is the
only link between a `Tile`/`Item` and its pixels** — there is no runtime file
lookup per block.

So adding a block texture is exactly:

1. Pick a free `(row, column)` in the **terrain** grid (16 wide, 32 tall).
2. Add `ADD_ICON(row, column, L"yourname")` in the terrain branch of `loadUVs()`.
3. `setIconName(L"yourname")` on your tile in `Tile::staticCtor()`.
4. Draw the 16×16 tile into that cell of the terrain source image.

This is exactly what SlimeTile and BarrierTile do — slime is
`ADD_ICON(12, 12, L"slime")` and barrier is `ADD_ICON(23, 11, L"barrier")` in the
terrain branch. See [Adding Blocks — step 7](/slop-docs/modding/adding-blocks/)
for the full block workflow.

### Mipmap gotcha

The atlas texture is created with mipmaps enabled — the `true` mipMap arg on both
maps flows into `TextureManager::createTexture(..., m_mipMap)`
(`PreStitchedTextureMap.cpp:129`). Mipmapping samples a downscaled level at
distance, which for a *packed* atlas pulls in colour from neighbouring cells (there
is no per-cell border), so sharp cutout textures (plants, cross-shaped blocks, the
slime overlay) get coloured fringing and shimmer at range. The fix is per-tile:
`Tile::disableMipmap()` (`Tile.h:738`), whose whole body is
`mipmapEnable[id] = false;` (`Tile.cpp:858-862`) — the per-id flag lives in
`Tile::mipmapEnable[TILE_NUM_COUNT]` (`Tile.h:212`, defined `Tile.cpp:51`, defaulted
`true` in `Tile::_init` at `Tile.cpp:735`).

The mechanism is **not** a texture-creation flag — the atlas is one mipmapped
texture shared by every block. Instead the flag is read at tessellation time:
`TileRenderer` does `t->setMipmapEnable(Tile::mipmapEnable[tt->id])`
(`TileRenderer.cpp:291`, again `:8158`), and the `Tesselator::vertex` path then
*encodes the choice into the U texture coordinate* — `float uu = mipmapEnable ? u :
(u + 1.0f)` (`Tesselator.cpp:746`). Its own comment is explicit: *"Signal to pixel
shader whether to use mipmapping or not, by putting u into > 1 range if it is to be
disabled."* So a mipmap-disabled quad ships a U value pushed past 1.0, and the pixel
shader reads `u > 1` as "sample the base level, no mip." Nothing about the atlas
upload changes; it is purely a per-quad shader signal carried in the UVs. Almost
every plant/rail/cutout block chains `->disableMipmap()` in its registration:

```cpp
Tile::sapling = (new Sapling(6)) ... ->setIconName(L"sapling") ... ->disableMipmap();   // Tile.cpp:383
Tile::goldenRail = (new PoweredRailTile(27)) ... ->disableMipmap();                       // Tile.cpp:409
Tile::rose = (new Rose(38)) ... ->setIconName(L"flower_rose")->disableMipmap();           // Tile.cpp:421
```

**Rule of thumb:** if your texture has transparent cutouts or thin lines, call
`disableMipmap()` or you'll get coloured fringing and shimmer at range.

### Animated textures

`loadUVs()` can register animated cells; at stitch time
`makeTextureAnimated(...)` collects the per-frame textures
(`PreStitchedTextureMap.cpp:221`) into `animatedTextures`, and
`cycleAnimationFrames()` (`Textures.cpp:1414` calls it per-frame) advances them.
The clock and compass are the special dynamic textures (`ClockTexture.cpp`,
`CompassTexture.cpp`, wired into the items branch of `loadUVs`).

## 2. The `.arc` archive & RebuildArc workflow

The console UI movies (Scaleform/Iggy SWFs — the actual on-screen menus) ship
packed in `Common/Media/MediaWindows64.arc`. The format is a Java
`DataOutputStream` layout, documented in `tools/RebuildArc.java`:

```
int   numberOfFiles
repeat numberOfFiles times:
    UTF  filename       (prefixed with '*' if the entry is compressed)
    int  offset         (into the data section)
    int  filesize
<raw file data follows the header>
```

All integers are **big-endian**; names are **modified UTF-8** (`readUTF`); a
leading `*` on the name marks a compressed entry.

### The three archive tools (`tools/`)

| Tool | Usage | What it does |
|------|-------|--------------|
| `ListArc.java` | `ListArc <arc>` | Prints entry count and (filtered) names/offsets/sizes. |
| `ExtractFromArc.java` | `ExtractFromArc <arc> <filename> <output_path>` | Pulls one entry out to disk. |
| `RebuildArc.java` | `RebuildArc <arc_file> <media_dir> [file1.swf ...]` | Rebuilds the archive, swapping in updated SWFs from `media_dir`. With no file list, replaces **all** SWFs found in `media_dir`. |

Typical loop for editing a menu asset:

1. `ExtractFromArc MediaWindows64.arc SettingsUIMenu720.swf ./SettingsUIMenu720.swf`
   (or work from the loose SWFs already in `Common/Media/MediaWindows64/`).
2. Patch the SWF with a JPEXS tool (see below).
3. `RebuildArc MediaWindows64.arc ./patched-swfs/ SettingsUIMenu720.swf` to fold the
   updated movie back in.

:::note[The build does not repack the arc]
The `.arc` copy step in `cmake/ServerTarget.cmake:39` is **commented out** — the
build copies the loose `Common/Media` tree, not a freshly-rebuilt `.arc`. Rebuilding
the archive is a manual `RebuildArc` step; the newer classic-crafting feature simply
committed loose `*.swf` files under `Common/Media/MediaWindows64/` (see the
`ClassicCraftingMenu720.swf` in that commit). For most UI work you edit the loose
SWFs; `RebuildArc` is for producing a packed `.arc` for platforms that load it.
:::

### JPEXS SWF patchers

The ActionScript/bytecode inside each movie is edited with the JPEXS FFDec library
(`com.jpexs.decompiler.flash.*`). The `tools/` directory ships worked examples that
clone-and-shift existing widgets rather than authoring from scratch:

- `AddVSyncCheckbox.java` / `AddExclusiveFullscreenCheckbox.java` — clone an
  existing checkbox (`CustomSkinAnim`), rename it, reposition it, and shift the
  sliders below it down. This is the pattern to copy when injecting a new
  options-menu control.
- `PatchHudABC.java` — raw ABC-bytecode patcher (adds `m_bHardcore` + `SetHardcore()`
  to the Hud class with manual jump-offset fixups).
- `DecompileAS.java` / `DumpSwf.java` / `FindMenuTitle.java` / `ReplaceLogo.java` /
  `ShiftLogo.java` — inspect, locate, and reposition assets inside a movie.

See [Custom UI Scenes](/slop-docs/modding/custom-ui/) for how a patched SWF is
paired with its C++ `UIScene` at runtime.

## 3. Localization: XML → `strings.h` codegen chain

Display names, tooltips and every menu label are `IDS_*` integer IDs, never string
literals. Those IDs are **generated at build time** from the localization XML, so a
new string is added by editing XML, not by picking a number by hand. Three CMake
scripts drive the chain (all in `cmake/`):

### 3a. `GenerateStringsHeaderFromXml.cmake` → `strings.h`

Wired in `Minecraft.Client/CMakeLists.txt:33-47`. For a Windows64 build it scans
every `Minecraft.Client/Windows64Media/loc/*.xml` for `name="IDS_..."` attributes
and emits `#define IDS_NAME <n>` into `generated/Windows64Media/strings.h`:

```
XML_ROOT   = Minecraft.Client/Windows64Media/loc
OUTPUT     = <build>/generated/Windows64Media/strings.h
```

Mechanics (from the script): it optionally seeds from a `BASE_HEADER`, collects the
`IDS_*` names discovered in the XML, **sorts them**, then assigns each the next
integer continuing from the highest existing ID (`_next_id`). Output is written only
if changed. Because IDs are assigned by sorted discovery, **adding a new
`IDS_*` name renumbers later strings** — which is fine because everything refers to
the generated `IDS_*` macro, never the raw number.

### 3b. `GenerateStringIdLookup.cmake` → `StringIdLookup.generated.inc`

Wired in the root `CMakeLists.txt` (`GenerateStringIdLookup` target). It reads the
generated `strings.h` and emits a reverse lookup — a `switch` mapping each ID back
to its name, guarded by `#ifdef` so only defined IDs compile:

```cpp
#ifdef IDS_TILE_SLIME_BLOCK
case IDS_TILE_SLIME_BLOCK: return L"IDS_TILE_SLIME_BLOCK";
#endif
```

It is **fatal if zero `IDS_` defines are found** (`message(FATAL_ERROR ...)`), a
guard against a broken strings.h.

### 3c. `GenerateItemNameMap.cmake` → `ItemNameMap.h` (adjacent, not localization)

Wired in the root `CMakeLists.txt` (`GenerateItemNameMap`). It parses
`static const int X_Id = N;` declarations out of `Minecraft.World/Item.h` and
`Tile.h` and builds `g_ItemNameMap` + `GetItemIdByName()`:

```cpp
inline const std::unordered_map<std::string, int> g_ItemNameMap =
{
    { "stone", 1 },
    { "slime", 165 },
    // ...
};
inline int GetItemIdByName(const std::string& name) { ... }
```

Item.h takes priority over Tile.h (the wheat crop 'block' must not override the
wheat item — noted in the build map). This is what maps a `/give slime` name to a
numeric ID. Adding an `X_Id` constant to `Tile.h`/`Item.h` (which you do anyway
when registering a block/item) automatically extends this map.

### Adding a string in practice

1. Add `<data name="IDS_TILE_CUSHION"><value>Cushion</value></data>` to a file
   under `Minecraft.Client/Windows64Media/loc/` (e.g. `stringsGeneric.xml` — that's
   where slime's `IDS_TILE_SLIME_BLOCK` lives).
2. Reference `IDS_TILE_CUSHION` in C++ (`setDescriptionId(IDS_TILE_CUSHION)`).
3. Reconfigure/build — the `add_custom_command` regenerates `strings.h` because the
   `*.xml` glob is `CONFIGURE_DEPENDS`.

If a locale table is missing the entry, the UI falls back to the missing-string
placeholder, so add the string before testing.

## 4. `colours.xml` — biome colour override

Grass/foliage/water biome tints are data-driven from
`Minecraft.Client/Common/res/TitleUpdate/res/colours.xml`. Each entry is a named
hex colour:

```xml
<root>
  <colour name="Foliage_Default" value="48b518"/>
  <colour name="Foliage_Savanna" value="9eb34e"/>
  <colour name="Grass_Plains"    value="91bd59"/>
  <!-- ... -->
</root>
```

The names map to the `eMinecraftColour` enum via
`ColourTable::ColourTableElements[]` and `s_colourNamesMap`
(`Minecraft.Client/Common/Colours/ColourTable.cpp:7`, populated in
`ColourTable::staticCtor()` at `:349`). At runtime a `ColourTable` is built from the
file bytes (`ColourTable(PBYTE, DWORD)` → `loadColoursFromData`, `:361`).

### The `.col` → `.xml` migration gotcha

neoLegacy replaced the legacy binary `colours.col` with the human-editable
`colours.xml`. The build enforces this in the root `CMakeLists.txt`
(`AssetTitleUpdateColourOverride` target): it **removes the stale
`colours.col`** and copies the current `colours.xml` next to each executable
(client and both servers):

```cmake
COMMAND ${CMAKE_COMMAND} -E remove ".../TitleUpdate/res/colours.col"
COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_SOURCE_DIR}/.../res/colours.xml"
    "$<TARGET_FILE_DIR:Minecraft.Client>/.../res/colours.xml"
```

To retune a biome tint, edit the hex value in `colours.xml` and rebuild — no code
change and no `.col` regeneration is needed. See the
[Colour table & biome tints](/slop-docs/world/biomes/) reference for the full name
list.

## What can go wrong

Verified behaviours at this snapshot:

### Duplicate icon *name* → silent overwrite + leak

As above: `ADD_ICON` is `texturesByName[name] = new SimpleIcon(...)`
(`PreStitchedTextureMap.cpp:318`). Registering the same `name` twice overwrites the
map entry with no warning, leaks the first `SimpleIcon *`, and the tile/item that
`setIconName(L"...")`s that name draws the *last* cell registered. Two `ADD_ICON`s
pointing at the same **cell** under different names is fine; two under the same
**name** is the bug. Grep the terrain/items branches for your name before adding it.

### Icon name with no `ADD_ICON` (or a typo) → `missingno`, or a debugger break

The tile/item→pixels link is the icon name and nothing else. If
`registerIcon(name)` (`PreStitchedTextureMap.cpp:280`) finds no entry, on a
non-`_CONTENT_PACKAGE` build it prints `Could not find uv data for icon <name>`
(`:299`) and `DEBUG_BREAK()`s (`:300`); on a `_CONTENT_PACKAGE` (retail) build both
are compiled out and it silently returns `missingPosition` (`:302`) — the
`missingno` icon (`NAME_MISSING_TEXTURE = L"missingno"`, `PreStitchedTextureMap.cpp:22`)
at UV `(0,0,1,1)` (`:33`). An empty name string hits the same fallback one branch
earlier (`:283-291`). The block/item is fully functional; only its texture is wrong.

### `RebuildArc` with a grown SWF → offsets are recomputed, not corrupted

A common fear is that swapping in a larger `.swf` desyncs the archive's offset
table. It does not: `RebuildArc` reads the old index, then **recomputes every
offset from scratch** — it re-emits the header (which itself changes size, because
a replaced entry loses its `*` compression prefix), takes `headerSize` as the first
data offset, and walks `currentOffset += fileData[i].length` for the rest
(`tools/RebuildArc.java`, the "compute real offsets" loop). Replaced files also get
`sizes.set(i, newData.length)` and `compressed.set(i, false)`. So grown, shrunk, or
same-size replacements all produce a consistent archive. The one caveat is the tool
**overwrites the arc in place** (`outputPath = arcPath`) — back it up first.

### Missing `IDS_*` string → the label renders as the raw key (or blank)

Covered in §3: if the loc XML lacks your `IDS_*` name the codegen never emits it,
and the runtime lookup returns the key text itself (wide-string overload) or an
empty string (numeric overload) rather than crashing. Add the entry before testing.

## Testing checklist

- [ ] New block/item texture: the cell shows correctly (icon name matches
      `setIconName`, `(row,column)` is in the correct **terrain 16×32** or **items
      16×16** grid).
- [ ] Cutout/plant texture has `disableMipmap()` — no colour fringing at distance.
- [ ] New `IDS_*` string appears in-game (not the missing-string placeholder) —
      confirm the XML is under `Windows64Media/loc/` and the build regenerated
      `strings.h`.
- [ ] `/give <name>` resolves — the `X_Id` constant reached `ItemNameMap.h`.
- [ ] Edited UI movie: repacked with `RebuildArc` (or the loose SWF replaced) and
      the scene loads the new movie.
- [ ] Biome tint change in `colours.xml` shows in-world and the stale `colours.col`
      is gone from the output dir.

## Where to go next

- [Adding Blocks](/slop-docs/modding/adding-blocks/) — full block workflow that
  consumes the terrain atlas and strings chain.
- [Adding Items](/slop-docs/modding/adding-items/) — the items atlas side.
- [Custom UI Scenes](/slop-docs/modding/custom-ui/) — pairing a patched SWF with a
  C++ `UIScene`.
- [Building neoLegacy](/slop-docs/overview/building/) — how the codegen targets
  are wired into CMake.

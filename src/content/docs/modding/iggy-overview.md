---
title: "Iggy: the UI Runtime"
description: The RAD Game Tools Flash/AS3 middleware that renders every LCE menu and HUD — its C API, the engine integration, and how the runtime behaves in practice.
---

Every menu, HUD, and container screen in Legacy Console Edition is an **Iggy
movie** — a Flash SWF played by a proprietary C library from RAD Game Tools. The
C++ side of this stack (the `UIScene` classes that bind to movies) is covered in
[Custom UI Scenes](/slop-docs/modding/custom-ui/). **This page owns the runtime
itself**: what Iggy is, the exact version LCE ships, the C API the engine calls,
how the engine drives it every frame, and what the runtime's contract looks like
once you reverse it. For the SWF corpus and textures see
[UI Movies & Textures](/slop-docs/modding/iggy-assets/).

## What Iggy is

Iggy is game-UI middleware for authoring interfaces in Adobe Flash and running
the *exact same content* on consoles, PC, and mobile. RAD's own pitch: "a
powerful system for creating graphical user interfaces using content created in
Adobe Flash… you create graphics, scripting, animation, and interactivity in any
Flash authoring tool, then use Iggy to run the exact same content on any of [the]
supported platforms" ([radgametools.com/iggy.htm](https://www.radgametools.com/iggy.htm)).

It is a **RAD Game Tools** product (Kirkland, WA), a sibling of RAD's Bink
(video), Telemetry (profiling), and Oodle (compression). RAD Game Tools was
**acquired by Epic Games in January 2021**, so the current owner is "Epic Games
Tools" ([radgametools.com/iggyhist.htm](https://www.radgametools.com/iggyhist.htm),
[justsolve archive](http://justsolve.archiveteam.org/wiki/RAD_Game_Tools)).

The primary-source proof LCE uses Iggy (and not the rival Scaleform) is RAD's own
customer list: **4J Studios — Minecraft (PS3/PS4/Xbox One)** appears directly on
it ([radgametools.com/iggygames.htm](https://www.radgametools.com/iggygames.htm)),
alongside Dishonored 2, The Order: 1886, and Dragon Ball Xenoverse.

### Iggy vs Scaleform GFx (not the same thing)

Iggy's rival was **Scaleform GFx**, a vector Flash-UI engine made by Scaleform
Corp., **acquired by Autodesk (March 2011)** and **discontinued July 12, 2017**.
Scaleform supported both AS2 and AS3, had pre-built Unreal/Unity/CryEngine
integrations, and used a `.gfx` container
([Wikipedia: Scaleform GFx](https://en.wikipedia.org/wiki/Scaleform_GFx)). Iggy and
Scaleform solve the same problem with different formats — the community notes IGGY
"should be similar to GFX, just with different header, compression or set of tags"
([JPEXS #1305](https://www.free-decompiler.com/flash/issues/1305-iggy-file-format-fonts-etc)).

> **Naming caveat.** Some JPEXS/forum threads loosely call the IGGY format "a
> ScaleForm format." That is imprecise. IGGY is RAD's; GFX is Scaleform/Autodesk's.
> Both are SWF-derived binary containers, but LCE uses **Iggy (RAD)** — you will
> occasionally see "Scaleform" in older notes and even in one comment in
> neoLegacy's own source; read it as "the Flash-UI middleware," i.e. Iggy.

### The Flash / AS3 subset Iggy implements

Iggy targets **ActionScript 3** and, at launch, SWF up to **Flash 9** feature
level (Flash 10 file loading added in 2013). RAD had to reverse-engineer Flash
behavior because the published Flash specs "are mostly just file format
descriptions." Confirmed-supported features
([radgametools.com/iggyinfo.htm](https://www.radgametools.com/iggyinfo.htm),
[iggy.htm](https://www.radgametools.com/iggy.htm)):

- **MovieClip** and **MouseEvent** classes.
- **Vector shapes** tessellated to triangles; bitmap fonts; wide lines.
- Linear and circular **gradients**.
- GPU-accelerated **blur / filter effects** and **blend modes**.
- Audio as 8/16-bit mono/stereo with an **MP3 decoder** (from RAD's Miles Sound
  System) plus ADPCM.
- AS3 weak-reference `Dictionary`. `Vector<>` types and interface inheritance
  were added by v1.2.39 (Apr 2015).

The AS3 heap uses a **generational garbage collector** (copy collector for the
young generation, incremental for the old) and can defragment to fit a fixed
console memory budget. All rendering runs on the GPU through a portable 2D API
called **GDraw**, with a per-platform non-portable GDraw backend (LCE/Windows uses
a D3D11 backend). Iggy is **closed-source commercial middleware, licensed
per-title/per-platform**; there is no public SDK or format spec
([radgametools.com/iggyinfo.htm](https://www.radgametools.com/iggyinfo.htm)).

## The exact version LCE ships

The Iggy build in the LCE tree was recovered by Cole's de-SWF work
(`neoLegacy-mac/iggy-decompiled/`):

| Fact | Value | Source |
|---|---|---|
| Product version | **Iggy 1.2.30** | `iggy-decompiled/RECOVERY.md` |
| Windows DLL | `iggy_w64.dll`, 1,071,616 bytes, 203 exports | `RECOVERY.md` |
| Build timestamp (DLL) | **2014-06-20 20:50:46** | `RECOVERY.md` |
| Missing PDB path | `c:\projects\g\build\release\iggy_w64.pdb` | `RECOVERY.md` |
| PDB GUID | `47E82B02-9D63-4C37-A20A-A564C012F475`, age 1 | `RECOVERY.md` |

For context, RAD's public changelog runs from v0.9.6 (Dec 2010) through v1.2.56
(Aug 17, 2017); v1.0.0 shipped Feb 15, 2011, and PS4/Xbox One support landed in
2014 ([radgametools.com/iggyhist.htm](https://www.radgametools.com/iggyhist.htm)).
The June-2014 build date of the LCE DLL lines up with that PS4/Xbox-One-era
release window.

### What ships in the tree

The Windows headers and stubs live under `Minecraft.Client/Windows64/Iggy/`:

- **Headers** (`include/`): `iggy.h` (61 KB — the full C API), `gdraw.h` (32 KB —
  the render abstraction), `iggyexpruntime.h`, `iggyperfmon.h`, and `rrCore.h`
  (75 KB — RAD's `rr*` base types).
- **Import libs** (`lib/`): `iggy_w64.lib`, `iggy_w32.lib`, plus the `expruntime`
  and `perfmon` stubs. These are import stubs, not implementation.
- **Runtime DLL** (`lib/redist64/`): `iggy_w64.dll`.
- **CMake wiring**: `CMakeLists.txt:96` sets `IGGY_LIBS iggy_w64.lib`; the libs
  are linked in `cmake/ServerTarget.cmake:107` and the redist DLL is copied next
  to the exe via `cmake/Utils.cmake`.

Per-platform siblings exist too (`Orbis/Iggy`, `Durango/Iggy`, `PS3/Iggy`,
`PSVita/Iggy`) as static archives — `libiggy_orbis.a`, `iggy_durango.lib`,
`libiggy_ps3.a`, `libiggy_psp2.a`. The **Durango archive** (Xbox One, 80
unstripped COFF objects, built 31 s after the Windows DLL from the same source
tree) is what made the runtime recoverable.

## The C API the game actually calls

`iggy.h` declares everything as `RADEXPFUNC <ret> RADEXPLINK Iggy<Name>(...)`.
The game touches roughly 40 of the ~200 exports. Census across
`Minecraft.Client/Common` + `Windows64`, most-used first:

| Symbol | uses | Role |
|---|---:|---|
| `IggyDataValue` (struct) | 410 | tagged arg/return union (`iggy.h:131`) |
| `IggyPlayerCallMethodRS` | 231 | **the** dispatch primitive — call an AS3 method on a value path (`iggy.h:816`) |
| `IggyValuePath` (struct) | 219 | addresses an object in the display/prop tree (`iggy.h:127`) |
| `IggyResult` | 200 | result enum |
| `IggyName` | 133 | interned UTF-16 name (fast-name) |
| `IggyPlayerRootPath` | 117 | root of a player's tree (`iggy.h:903`) |
| `IggyValueSet*RS` / `IggyValueGet*RS` | ~50 | typed property poke/peek by path + sub-name (`iggy.h:917-936`) |
| `IggyValuePathMakeNameRef` | 17 | build a child path by name (`iggy.h:905`) |
| `IggyGDrawSendWarning` | 17 | log through Iggy |
| `IggyPlayerCreateFastName` | 15 | intern a UTF-16 method/prop name once (`iggy.h:813`) |
| `IggyPlayerSetDisplaySize` | 12 | set draw size before tick/draw (`iggy.h:656`) |
| `IggyFontSetIndirectUTF8` | 7 | alias one font name to another |
| `IggyPlayerDraw` / `DrawTile*` | ~17 | render (`iggy.h:659,664-666`) |
| `IggyPlayerDispatchEventRS` | 6 | inject mouse/key/focus events (`iggy.h:1145`) |
| `IggyPlayerCreateFromMemory` | 2 | load a SWF from bytes (`iggy.h:300`) |
| `IggyInit` / `IggySetGDraw` | 3 / 4 | one-time init + bind renderer |
| `IggyPlayerReadyToTick`/`TickRS`/`InitializeAndTickRS` | 2 ea | frame pacing (`iggy.h:353-355`) |
| `IggySetCustomDrawCallback` / `IggySetTextureSubstitutionCallbacks` / `IggySetAS3ExternalFunctionCallbackUTF16` | 1 ea | register the 3 game callbacks |

### `IggyDataValue` — the tagged union

Everything crossing the C boundary is an `IggyDataValue`: a `type` field (an
`IggyDatatype`) plus a union of the actual payload (`iggy.h:131`). The
**argument-legal** types are a small set — `boolean` (rrbool), `number` (F64),
`string_UTF8`/`string_UTF16`, `fastname`, `valuepath`, and `valueref`. The header
is explicit about which types "can be queried, but cannot appear as function
arguments" (`iggy.h:76-104`): `array`, `object`, `displayobj`, `xml`,
`namespace`, `qname`, `function`, and `class` come **back** from Iggy but you
cannot pass them **in**. `displayobj` in particular "only appears in callbacks."

```c
typedef UINTa IggyName;                 // interned UTF-16 name handle
typedef struct IggyValuePath IggyValuePath;
typedef void *IggyValueRef;

typedef struct IggyDataValue {
   S32 type;              // an IggyDatatype
   IggyTempRef temp_ref;  // opaque; written by Iggy on callbacks, never read
   union { /* string16, string8, number(F64), boolean, path, ref, ... */ };
} IggyDataValue;
```

### Value paths — how you address an object

An `IggyValuePath` is Iggy's address for a node in the AS3 display/property tree.
You never hold an AS3 object directly; you hold a **path** to it. Two calls build
paths:

```c
IggyValuePath *IggyPlayerRootPath(Iggy *f);   // root of this movie's tree (iggy.h:903)
rrbool IggyValuePathMakeNameRef(IggyValuePath *result,
                                IggyValuePath *parent, char const *text_utf8);
```

`IggyPlayerRootPath` returns the path to the document class instance;
`IggyValuePathMakeNameRef` extends a parent path by a named child (there is also a
`…Fast` variant taking an interned `IggyName`, `iggy.h:908`). This chaining is
exactly what the `UI_MAP_ELEMENT` macros build under the hood — see
[Custom UI Scenes §element-map macros](/slop-docs/modding/custom-ui/#the-element-map-macros-uisceneh17-45).

### Method dispatch — the workhorse

```c
IggyResult IggyPlayerCallMethodRS(Iggy *f, IggyDataValue *result,
                                  IggyValuePath *target, IggyName methodname,
                                  S32 numargs, IggyDataValue *args);   // iggy.h:816
```

This one call — used 231 times — is how C++ invokes an AS3 method. You resolve a
target path, name a method (interned once via `IggyPlayerCreateFastName`), pass an
array of `IggyDataValue` args, and get the return in `result`. The canonical
example is the HUD health bar (`Minecraft.Client/Common/UI/UIScene_HUD.cpp`):

```cpp
// UIScene_HUD::SetHealth (UIScene_HUD.cpp:406)
IggyDataValue value[4];                     // number maxHealth + 3 booleans
// ... fill value[0..3] ...
IggyResult out = IggyPlayerCallMethodRS(
    getMovie(), &result, IggyPlayerRootPath(getMovie()),
    m_funcSetHealth, 4, value);             // UIScene_HUD.cpp:426
```

Every HUD setter follows this shape — `SetFood`, `SetAir`, `SetArmour`,
`SetExpBarProgress`, `SetPlayerLevel`, `ShowHealth` — all in
`UIScene_HUD.cpp:357-692`. Root-level scene methods (`slideLeft`, `slideRight`,
`doHorizontalResizeCheck`) go through the same call at `UIScene.cpp:767-783`.

### Property poke/peek

For direct field access without an AS3 method, the game uses the typed
`IggyValueSet*RS` / `IggyValueGet*RS` family. Each takes a path, an optional
sub-name, and a value:

```cpp
// set a bool field on a label's path (UIScene_HUD.cpp:32)
IggyValueSetBooleanRS(labelPath, 0, "m_bUseHtmlText", true);
// read an F64 back (UIControl_Base.cpp:33)
IggyValueGetF64RS(getIggyValuePath(), m_funcGetH, nullptr, &t);
```

The `Get{F64,F32,S32,U32}RS` variants share a macro in the runtime; the "path +
optional sub-name" convention is the one addressing scheme behind every getter,
setter, and method call.

### Fonts and GDraw

Font handling is a small dedicated slice of the API:

- `IggyFontInstallTruetypeUTF8(bytes, ttcIndex, name, len, flags)` installs a TTF
  (`UITTFFont.cpp:46`).
- `IggyFontSetIndirectUTF8("Mojangles7", …, ttfName, …)` **aliases** a Flash font
  name to an installed font (`UIController.cpp:518-519`) — the movies reference
  `Mojangles7`/`Mojangles11`, and the game redirects them to the real TTF.
- `IggyFontSetFallbackFontUTF8("Mojangles_Unicode_Bitmap", …)` installs a Unicode
  bitmap fallback (`UIController.cpp:385`).
- `IggyFlushInstalledFonts()` clears stale glyph caches after init
  (`UIScene.cpp:439`).

Rendering goes through **GDraw** (`gdraw.h`): the Windows backend is created with
`gdraw_D3D11_CreateContext(dev, ctx, w, h)` (`Windows64_UIController.cpp:21`) and
bound with `IggySetGDraw(gdraw_funcs)` (`:56`). Audio is routed to DirectSound via
`IggyAudioUseDirectSound()` (`:64`).

## How the engine integrates Iggy

### One-time initialization

`ConsoleUIController::init` (`Windows64_UIController.cpp:12`) plus
`UIController.cpp` bring the runtime up:

1. **`preInit(w,h)`** → `IggyInit(&allocator)` when `ENABLE_IGGY_ALLOCATOR`, else
   `IggyInit(0)` (`UIController.cpp:356-364`); then `IggySetWarningCallback` +
   `IggySetTraceCallbackUTF8` (`:366-367`).
2. **GDraw** → `gdraw_D3D11_CreateContext(...)` (`Windows64_UIController.cpp:21`),
   resource caches sized via `gdraw_D3D11_SetResourceLimits` (`:51-53`: 5000
   VBs/16 MB, 5000 textures/128 MB, 10 RTs/64 MB), then `IggySetGDraw(...)` (`:56`).
3. **Audio** → `IggyAudioUseDirectSound()` (`:63`).
4. **`postInit()`** (`UIController.cpp:372`) registers the three game callbacks:
   `IggySetCustomDrawCallback` (`:375`),
   `IggySetAS3ExternalFunctionCallbackUTF16` (`:376`),
   `IggySetTextureSubstitutionCallbacks` (`:377`); installs the Unicode fallback
   font (`:385`); and loads skins (`:389`).

### Per-frame tick and render

Iggy runs on a **pacing gate**, not a raw tick-per-frame. `UIScene::tick`
(`UIScene.cpp:523-536`) drains it:

```cpp
while (IggyPlayerReadyToTick(swf)) {
    tickTimers();
    /* ...controls tick... */
    IggyPlayerTickRS(swf);
}
```

This while-loop **must** gate on `ReadyToTick` — a shim that always returns true
here spins forever (`neoLegacy-mac/WORKLOG.md:131`).

Rendering (`ConsoleUIController::render`, `Windows64_UIController.cpp:71-96`) runs
once per frame: `gdraw_D3D11_SetTileOrigin(rtv, dsv, nullptr, 0, 0)` →
`renderScenes()` → `gdraw_D3D11_NoMoreGDrawThisFrame()`. `renderScenes`
(`UIController.cpp:1863-1882`) walks the UI groups; each `UIScene::render`
(`UIScene.cpp:785-806`) calls `IggyPlayerSetDisplaySize(swf, fitW, fitH)` then
`IggyPlayerDraw(swf)`. Split-screen HUDs use the tiled path
`IggyPlayerDrawTilesStart/DrawTile/DrawTilesEnd` (`iggy.h:664-666`).

Inventory item slots and similar bespoke geometry go through
`IggyCustomDrawCallbackRegion` (70 uses) → `UIController::CustomDrawCallback`
(`UIController.cpp:2090`) → `gdraw_D3D11_BeginCustomDraw_4J` /
`CalculateCustomDraw_4J` / `EndCustomDraw` (`Windows64_UIController.cpp:105-143`).

### The movie lifecycle — from `.arc` load to on-screen

`UIScene::loadMovie` (`UIScene.cpp:305`) is the whole pipeline:

1. **Pick the movie name.** Each scene overrides `getMoviePath()` to return a base
   stem (e.g. `UIScene_HUD::getMoviePath` returns `L"HUD"` or `L"HUDSplit"`).
   `loadMovie` appends a resolution suffix — on Windows, `use1080 =
   (getScreenHeight() > 720) && (!force720ForControlType || isTutorialPopupMovie)`
   where `force720ForControlType` is controlType 3 or 5 (`UIScene.cpp:338-343`) —
   producing `HUD1080.swf` or `HUD720.swf`. If the archive lacks the preferred
   size it falls back (720 → 1080 → `FatalLoadError`, `:358-382`).
2. **Fetch bytes from the `.arc`.** `if(!app.hasArchiveFile(moviePath))` gates
   existence (`:358`); `byteArray baFile = ui.getMovieData(moviePath.c_str())`
   pulls the bytes (`:384`).
3. **Create the player.**
   `swf = IggyPlayerCreateFromMemory(baFile.data, baFile.length, nullptr)` (`:386`).
   The third argument (config) is **null** — Iggy identifies the movie entirely
   from its bytes.
4. **Read properties before ticking.**
   `IggyProperties *properties = IggyPlayerProperties(swf)` is read *before* any
   tick (`:400`) for `movie_width/height_in_pixels` (`:409-410`).
5. **Set display size, then init.** `IggyPlayerSetDisplaySize` is set **before**
   `IggyPlayerInitializeAndTickRS` so glyph caches rasterize at the final scale
   (`:414-429`; Windows uses `Fit16x9`, `:421-423`). After init,
   `IggyFlushInstalledFonts()` clears stale caches (`:439`), then
   `IggyPlayerSetUserdata(swf, this)` (`:444`) stores the C++ scene so callbacks
   can recover it.

The `.arc` container itself is a Java `DataOutputStream`-style, big-endian format:
`int numFiles`, then per file a `UTF` name (leading `*` = compressed) + `int
offset` + `int size`, with raw data after (documented in
`neoLegacy/tools/RebuildArc.java:14-20`). See
[UI Movies & Textures §the .arc packaging](/slop-docs/modding/iggy-assets/#the-arc-packaging).

### Binding C++ handles to named Flash elements

The macro system in `Common/UI/UIScene.h:17-44` turns Flash instance names into
value paths:

- `UI_BEGIN_MAP_ELEMENTS_AND_NAMES(parent)` opens `mapElementsAndNames()`, chains
  to the parent, and grabs `IggyValuePath *currentRoot = IggyPlayerRootPath(getMovie())`.
- `UI_MAP_ELEMENT(var, name)` → `var.setupControl(this, currentRoot, name)`, which
  builds that control's own path under `currentRoot` (`UIControl_Base.cpp:16`).
- `UI_BEGIN_MAP_CHILD_ELEMENTS(parent)` re-roots to `parent.getIggyValuePath()`
  for nested display objects.
- `UI_MAP_NAME(var, name)` → `registerFastName(name)`, interning a method name once.

So a C++ `UIControl_Label m_labelHealth` becomes bound to the Flash instance named
`"HealthLabel"` — the value path is the binding. The C++ half of this is detailed
in [Custom UI Scenes](/slop-docs/modding/custom-ui/#the-element-map-macros-uisceneh17-45).

### AS3 → C++: events back through the callback

`IggySetAS3ExternalFunctionCallbackUTF16` registers
`UIController::ExternalFunctionCallback` (`UIController.cpp:1850`), which recovers
the scene via `IggyPlayerGetUserdata(player)` (`:1852`) and forwards to
`scene->externalCallback(call)` (`:1856`). `UIScene::externalCallback`
(`UIScene.cpp:1256`) string-matches `call->function_name` and validates arg
count/types before dispatching to virtual handlers. This is Flash's
`ExternalInterface` pattern. The full set of AS3-emitted callbacks:

`handlePress(controlId, childId)`, `handleFocusChange`, `handleInitFocus`,
`handleCheckboxToggled`, `handleSliderMove`, `handleAnimationEnd`,
`handleSelectionChanged`, `handleRequestMoreData`, `handleTouchBoxRebuild`
(`UIScene.cpp:1258-1600`). For example `handlePress` decodes two
`IGGY_DATATYPE_number` args and calls
`handlePress(call->arguments[0].number, call->arguments[1].number)` (`:1276`);
`handleAnimationEnd` (0-arg) fires at e.g. intro frame 90.

## Appendix: how the API behaves in practice (de-SWF / iggy-shim)

Because Iggy is closed source, the sharpest description of its *contract* comes
from Cole's `neoLegacy-mac` work, where a drop-in **`iggy_shim_w64.lib`** was
built to replace RAD's DLL and drive the UI from PNG + JSON assets instead of
SWFs. A patch (`patches/0002-allow-IGGY_LIBS-override.patch`) makes `IGGY_LIBS`
overridable so the shim can be substituted. What the shim had to reimplement
reveals the runtime's real semantics.

### Runtime recovery

Iggy 1.2.30 was recovered from `iggy_durango.lib` (80 unstripped x64 COFF objects)
plus independent Orbis/PS3/Vita archives for cross-arch typing: **13,536 unique
functions / 784,158 lines, 0 failed** across the raw module decompiles
(`iggy-decompiled/RECOVERY.md`). Module areas confirm the internal architecture —
AVM2 VM (~900 fns: interpreter, verifier, gc, abc_decode, property, names,
convert), Flash/AS3 bindings (~984), renderer (~260), SWF runtime (~246), Iggy
runtime (~214), public API (~102). The Player object recovered as exactly `0x3750`
bytes (Durango) / `0x3610` (Orbis); the AS3 VM allocation is `0x6b28`.

### Scene identity by fingerprint

Because the game passes **`nullptr` config** to `IggyPlayerCreateFromMemory`, the
runtime must identify a movie purely from its bytes — and so must the shim.
`gen-scenes-tsv.py` writes `uiassets/scenes.tsv` with
`name, size, crc32(first 4096 bytes), width, height, fps, docClass` and de-dupes
by `(size, crc)` — collapsing the corpus to the **366 canonical scenes**. Crucially,
movie `width`/`height` must be answered from the fingerprint **before the first
tick**, matching the game's read of `IggyPlayerProperties` at `UIScene.cpp:400`.

### Value-path semantics

The shim's `iggy_object.hpp` models one `IggyObjectNode` as *both* a generic AS3
object and a display object: display props (`x`, `y`, `visible`, `alpha`,
`currentFrame`) are stored as ordinary props so value paths behave uniformly; a
`children` vector is z-order; `array` storage kicks in when the node is used as an
AS3 Array. `IggyName` is a pointer into an interned UTF-16 `NameTable` — matching
the game's fast-name usage. `IggyValuePath` is `{f, parent, name, ref, index,
type}`; resolution walks the chain (`resolveChain`/`resolveStep` in
`iggy_api_values.cpp`) with optional vivify, and `addrOf(var, sub_name, sub_utf8,
vivify)` implements the "path + optional sub-name" addressing every
`IggyValueGet/Set` and `CallMethod` uses.

### Method dispatch

`IggyPlayerCallMethodRS` in the shim resolves the target path, then dispatches the
named method against a `scene_registry` semantics table **rather than running
AVM2** — proof that the game's use of Iggy is method-name-driven and can be served
without a Flash VM at all, as long as the named methods (`SetHealth`, `Init`,
`slideLeft`, …) are honored.

### Init/tick contract and fonts

The observed contract (`WORKLOG.md:173-177`): `SetDisplaySize` **before**
`InitializeAndTickRS`; `SetUserdata` **after**; per frame drain
`while(ReadyToTick) TickRS` (never always-true); then the game sequences
`SetTileOrigin → IggyPlayerDraw per scene → NoMoreGDrawThisFrame`. Fonts: Iggy
caches glyph rasterizations at the **init-time** display scale, so a mismatch
between init and draw sizes yields mixed glyph sizes — which is exactly why the
game calls `IggyFlushInstalledFonts` after init (`UIScene.cpp:432-440`). The
shim's font-provider ranks `Mojangles_11 > Mojangles_7 > Unicode`.

### Draw conventions and gotchas

Reverse-engineered draw conventions (`WORKLOG.md:162-171`): vertex format
`v2tc2 {x,y,s,t}`; quads use `indices=nullptr` with `num_vertices % 4 == 0` and a
builtin quad index buffer; **premultiplied alpha**
(`GDRAW_BLEND_alpha = ONE/INV_SRC_ALPHA`); `use_world_space=1` means vertices are
in display pixels; textures upload via `MakeTextureBegin/More/End` with
`GDRAW_TEXTURE_FORMAT_rgba32` (font glyphs use the `_font` R8 format with
`tex0_mode = GDRAW_TEXTURE_alpha`). Two hard-won facts worth flagging for anyone
touching the render path: draw calls through the game's GDraw vtable *executed*
(non-zero batch stats) but produced **no visible pixels** — an unresolvable
render-state black box — so the shim harvests the `ID3D11Device` from a GDraw
texture handle and drives its own raw D3D11 pipeline instead
(`UI-DESWF-ROADMAP.md:26-34`). And `SetFocus(-1)` means "auto-focus the first
focusable," not "focus id −1" — a mismatch there originally blocked every dialog
(`WORKLOG.md:108-110`).

The end result: the shim drives the full flow — title → main menu → Play → EULA →
Load/Create/Join → Create New World → generate → in-game HUD — with `.swf`/`.arc`
no longer in the render path (`README.md:68-79`).

## Where to go next

- [UI Movies & Textures](/slop-docs/modding/iggy-assets/) — the 391-SWF corpus,
  what's inside a movie, the texture gallery, and how to extract it yourself.
- [Custom UI Scenes](/slop-docs/modding/custom-ui/) — the C++ `UIScene` side: how
  to add a scene and bind it to a movie.
- [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/) — the `.arc`
  archive and JPEXS patchers in `tools/`.

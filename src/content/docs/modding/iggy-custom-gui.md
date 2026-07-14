---
title: "Custom GUI: New SWFs & New Scenes"
description: Build a brand-new piece of LCE UI — clone a movie in FFDec, honour every resolution variant, and wire it to a new C++ UIScene end-to-end.
---

Editing an existing movie is one thing; adding a **new** piece of UI is a two-sided
job. You need a new **`.swf`** (the Flash movie Iggy renders) *and* a new C++
**`UIScene`** (the object that binds to it and drives it). This page walks the full
path. It assumes you can already open and edit a movie — see
[Opening & Editing SWFs](/slop-docs/modding/iggy-editing-swfs/) — and it links
heavily to [Custom UI Scenes](/slop-docs/modding/custom-ui/) for the deep C++
mechanics rather than repeating them.

The **real precedent** is neoLegacy's classic-crafting commit (`05d7ccb6`,
`feat(TU31): classic crafting`), which added new SWFs *and* a new scene in one go.
The custom-ui page walks its C++ diff step-by-step; this page is the SWF-authoring
companion.

## The two halves

```
┌─────────────────────────┐        ┌────────────────────────────┐
│  MyMenu720.swf           │  bind  │  UIScene_MyMenu (C++)      │
│  MyMenu1080.swf          │◄──────►│   getMoviePath() → "MyMenu"│
│  MyMenuSplit720.swf      │ names  │   UI_MAP_ELEMENT("Button0")│
│  MyMenuSplit1080.swf     │        │   handleInput / handlePress│
│  · instance "Button0"    │        │   eUIScene_MyMenu enum     │
│  · instance "Title"      │        │   UILayer factory case     │
│  · document class        │        └────────────────────────────┘
└─────────────────────────┘
```

The bridge is **instance names**. A `PlaceObject3` in the movie named `"Button0"`
binds to a C++ `UI_MAP_ELEMENT(m_button, "Button0")`. Get one string wrong and the
control is silently unbound. Everything below is in service of making both halves
agree.

## Part A — the pragmatic route: clone an existing movie

Iggy consumes a *specific* Flash-9-era subset in a proprietary runtime. A freshly
compiled SWF from a modern toolchain is unlikely to load as-is (wrong tag set, wrong
AS3 features, no Iggy conversion). **The reliable path is clone-and-modify**: start
from an existing LCE movie so you inherit Iggy's exact structure and stay inside its
supported subset ([why, from web research](https://www.free-decompiler.com/flash/issues/1305-iggy-file-format-fonts-etc)).
This is also literally what the classic-crafting commit did — its
`ClassicCraftingMenu*.swf` were cloned from the existing crafting movies.

### Pick a simple donor

Clone the *smallest* movie whose shape matches your target. **`MessageBox`** is
ideal for a dialog: it's a non-container `UIScene` with a handful of buttons and two
labels — nothing exotic. Its C++ side (`UIScene_MessageBox.h`) shows exactly which
instance names the movie must expose:

```cpp
// UIScene_MessageBox.h — the element map (the movie must contain these names)
UI_BEGIN_MAP_ELEMENTS_AND_NAMES(UIScene)
    UI_MAP_ELEMENT( m_buttonButtons[eControl_Button0], "Button0")
    UI_MAP_ELEMENT( m_buttonButtons[eControl_Button1], "Button1")
    UI_MAP_ELEMENT( m_buttonButtons[eControl_Button2], "Button2")
    UI_MAP_ELEMENT( m_buttonButtons[eControl_Button3], "Button3")
    UI_MAP_ELEMENT( m_labelTitle,   "Title")
    UI_MAP_ELEMENT( m_labelContent, "Content")
    UI_MAP_NAME( m_funcInit,       L"Init")        // an AS3 method the C++ calls
    UI_MAP_NAME( m_funcAutoResize, L"AutoResize")
UI_END_MAP_ELEMENTS_AND_NAMES()
```

So a `MessageBox`-derived movie must contain display-list instances named
`Button0..Button3`, `Title`, `Content`, and expose root AS3 methods `Init` and
`AutoResize`. `UI_MAP_ELEMENT` binds C++ controls to named clips; `UI_MAP_NAME`
interns a *method* name so the C++ can `IggyPlayerCallMethodRS` it (details:
[Custom UI Scenes](/slop-docs/modding/custom-ui/#the-element-map-macros-uisceneh17-45)).

### Reshape it in FFDec

1. **Copy** `MessageBox720.swf` → `MyMenu720.swf` (and the `1080`/`Split` variants).
2. **Rename the document class.** Under `SymbolClass`, the charId-0 binding is the
   document class (`fourj.documents.<Scene>`). If two live movies share a class name
   they can collide; give your clone a unique document class if you're changing its
   AS3.
3. **Reshape the layout.** Keep the instance names your `UI_MAP_ELEMENT` expects,
   but move/scale their `PlaceObject` matrices to your design (in twips — 20 per
   pixel). Reuse `tools/ShiftMenuY.java` for pure Y moves.
4. **Add or remove elements** the `UI_*_MAP` macros will bind. To add a widget,
   **clone an existing one** rather than authoring it — the `tools/AddVSyncCheckbox.java`
   pattern: find an existing checkbox `PlaceObject3`, clone it, rename the clone to
   the instance name your new `UI_MAP_ELEMENT` will reference, reposition. Because the
   clone reuses the original's symbol and AS3 wiring, it stays inside Iggy's subset.
5. **Swap art** (`DefineBitsLossless2` bitmaps) with the
   [bitmap-replace workflow](/slop-docs/modding/iggy-editing-swfs/#edit-workflow-1--replace-a-bitmap).
6. **Save** each variant (`swf.saveTo`) and drop them into
   `Common/Media/MediaWindows64/` (loose — no repack on PC).

> **Golden rule:** the set of instance names in the movie is the contract with the
> C++ scene. Author the movie's names *from* the scene's `UI_MAP_ELEMENT` list, or
> author the scene *from* the movie's names — but they must be identical strings.

### The document class & SymbolClass, concretely

Two SWF facts govern whether the game can even *find* your scene's root:

- **`SymbolClass` charId 0 = the document class.** In FFDec, the `SymbolClass` tag
  maps character IDs to AS3 class names; the entry for **character ID 0** binds the
  movie's main-timeline/root class — for LCE that's `fourj.documents.<Scene>` (e.g.
  `fourj.documents.Hud` in `HUD1080.swf`). That class is what
  `IggyPlayerRootPath(getMovie())` addresses on the C++ side, and its constructor
  runs first when the movie loads
  ([SymbolClass/root behaviour, SWF spec v9](https://www.mobilefish.com/download/flash/swf_file_format_spec_v9.pdf)).
  When you clone a donor, that charId-0 binding comes along for free — you inherit a
  working root class.
- **The AS3 methods you'll call must live on that root.** `UI_MAP_NAME(_, L"Init")`
  interns a name the C++ then calls via `IggyPlayerCallMethodRS` **rooted at the
  document class**. So `Init`/`AutoResize` must be public methods of the donor's
  document class. Reuse the donor's — don't hand-author new AS3 unless you're
  byte-patching à la [PatchHudABC](/slop-docs/modding/iggy-editing-swfs/#tier-1--the-surgical-bytecode-patch-patchhudabcjava).

### Note on the de-SWF shim's fingerprint

If your build runs neoLegacy's **de-SWF shim** (the reimplemented Iggy that renders
from `uiassets/` PNG+JSON instead of `.swf`), a *new* movie needs a row in
`uiassets/scenes.tsv` — the shim identifies scenes by **hashing the movie bytes**
(CRC32 of the first 4096 bytes), because the game passes a **null** config to
`IggyPlayerCreateFromMemory` and there's no other handle. `gen-scenes-tsv.py`
generates that table (`name, size, crc32, width, height, fps, docClass`) and
de-dupes by `(size, crc32)`. This only matters on the shim path — the stock Iggy
runtime loads your SWF directly and needs no registration.

## Part B — from-scratch OSS authoring (honest tradeoffs)

Sometimes you want a movie that has no good donor. Here's the real 2026 landscape
for making an AS3 SWF with open-source tools, and why it rarely beats cloning for
Iggy.

| Tool | Status | Output | Verdict for Iggy |
|---|---|---|---|
| **Apache Flex SDK** (`mxmlc`/`compc`) | Legacy but functional | Real **SWF/SWC** from AS3 | Most direct OSS route to a *real* AS3 SWF; language may still use features Iggy's Flash-9 subset doesn't implement. |
| **Apache Royale** | Actively maintained (Apache TLP) | Primarily **JavaScript** | Best-maintained AS3 toolchain, but oriented to JS output, **not SWF-for-Iggy**. |
| **Haxe + OpenFL** | Most *alive* stack; MIT | Can emit **AVM2→SWF** (also JS/C++) | Alive + SWF-capable, but it's **Haxe, not literal AS3** (API-compatible, different syntax); OpenFL's Flash-API reimplementation may diverge from Iggy's runtime. |
| **swftools `as3compile`** | Unmaintained (manual dated 2012) | SWF | Legacy relic; "mostly Flex-compatible" but effectively dead. |
| **swfmill** | Old, low-activity | XML↔SWF | Handy for assembling *trivial* SWFs from XML; not a real AS3 compiler. |
| **MTASC** | Dead; **AS2 only** | SWF | Never supported AS3. Don't. |

(Sources: [OpenFL](https://github.com/openfl),
[AS3 conversion guide](https://books.openfl.org/as3-conversion-guide/history.html),
[swftools](http://www.swftools.org/as3compile.html),
[MTASC](https://en.wikipedia.org/wiki/MTASC).)

**Why clone-and-modify usually wins.** Iggy needs a specific tag set and a
Flash-9-era feature subset, possibly with textures externalized to `.iggytex`, and
there is **no public Iggy conversion step** in the OSS world. A brand-new
Royale/Haxe SWF is very likely to fail loading in Iggy without that conversion. Only
attempt from-scratch authoring if you can reverse or reproduce the Iggy conversion —
otherwise **start from an existing movie in FFDec and reshape it**, which guarantees
a structural/subset match ([research synthesis](https://www.free-decompiler.com/flash/issues/1305-iggy-file-format-fonts-etc)).
The tradeoff you're accepting with cloning is FFDec's *partial* Iggy write support
and no full recompile — which is fine, because minimal edits are the safe path
anyway (see [Iggy-compat cautions](/slop-docs/modding/iggy-editing-swfs/#iggy-compat-cautions)).

## Part C — wire the C++ side (worked example)

Now the other half: a new `UIScene` subclass. The mechanics — the element-map
macros, the enum, the factory, the CMake/aggregator registration — are covered in
depth on [Custom UI Scenes](/slop-docs/modding/custom-ui/); this is the condensed
end-to-end for a **new dialog cloned from MessageBox**.

### 1 — the scene header (`UIScene_MyMenu.h`)

Derive from the right base (`UIScene` for a plain screen;
`UIScene_AbstractContainerMenu` for a slot container), declare your controls, and
wire them with the map macros — the names **must** match the movie:

```cpp
class UIScene_MyMenu : public UIScene
{
    enum EControls { eControl_Ok, eControl_Cancel, eControl_COUNT };

    UIControl_Button m_buttons[eControl_COUNT];
    UIControl_Label  m_labelTitle;
    IggyName         m_funcInit;

    UI_BEGIN_MAP_ELEMENTS_AND_NAMES(UIScene)
        UI_MAP_ELEMENT( m_buttons[eControl_Ok],     "Button0")   // must exist in movie
        UI_MAP_ELEMENT( m_buttons[eControl_Cancel], "Button1")
        UI_MAP_ELEMENT( m_labelTitle,               "Title")
        UI_MAP_NAME( m_funcInit, L"Init")
    UI_END_MAP_ELEMENTS_AND_NAMES()

public:
    UIScene_MyMenu(int iPad, void *initData, UILayer *parentLayer);
    virtual EUIScene getSceneType() { return eUIScene_MyMenu; }
protected:
    virtual wstring getMoviePath();
public:
    virtual void handleReload();
    virtual void handleInput(int iPad, int key, bool repeat, bool pressed,
                             bool released, bool &handled);
protected:
    void handlePress(F64 controlId, F64 childId);
};
```

### 2 — `getMoviePath()` (the movie base name)

Return your movie's base **stem** — the loader appends the resolution/platform
suffix (`720.swf` / `1080.swf` / `Split…`). Mirror the split-screen split
`MessageBox` uses:

```cpp
wstring UIScene_MyMenu::getMoviePath()
{
    if (app.GetLocalPlayerCount() > 1 && !m_parentLayer->IsFullscreenGroup())
        return L"MyMenuSplit";        // → MyMenuSplit720.swf / MyMenuSplit1080.swf
    else
        return L"MyMenu";             // → MyMenu720.swf     / MyMenu1080.swf
}
```

### 3 — push data into the movie (`handleReload`)

`handleReload` is where you call your movie's AS3 methods and set control state.
MessageBox's is the template — build an `IggyDataValue[]` and dispatch through the
interned name:

```cpp
void UIScene_MyMenu::handleReload()
{
    IggyDataValue result, value[1];
    value[0].type   = IGGY_DATATYPE_number;
    value[0].number = getControlFocus();
    IggyPlayerCallMethodRS( getMovie(), &result,
        IggyPlayerRootPath(getMovie()), m_funcInit, 1, value );
}
```

`IggyPlayerRootPath(getMovie())` is the movie's document-class root; `m_funcInit` is
the AS3 method name you interned with `UI_MAP_NAME`. (The full value-path/dispatch
model — how C++ addresses Flash objects and calls methods — is on
[Custom UI Scenes](/slop-docs/modding/custom-ui/).)

### 4 — handle input & presses

`handleInput` routes controller/keyboard actions; presses that originate *in the
movie* come back through `handlePress(controlId, childId)`:

```cpp
void UIScene_MyMenu::handleInput(int iPad, int key, bool repeat, bool pressed,
                                 bool released, bool &handled)
{
    ui.AnimateKeyPress(m_iPad, key, repeat, pressed, released);
    switch (key) {
    case ACTION_MENU_CANCEL:
        if (pressed) navigateBack();
        break;
    case ACTION_MENU_OK:
    case ACTION_MENU_UP:
    case ACTION_MENU_DOWN:
        sendInputToMovie(key, repeat, pressed, released);  // let the movie navigate
        break;
    }
    handled = true;
}
```

`sendInputToMovie` forwards the event into Iggy so the movie's own focus/navigation
runs; when a movie button fires, Iggy calls back into C++ via the external-function
callback, which the base `UIScene` decodes into your `handlePress`.

### 5 — register the scene (enum, factory, aggregator, CMake)

Four registration edits make the scene reachable (all detailed with the
classic-crafting diff on
[Custom UI Scenes](/slop-docs/modding/custom-ui/#worked-example-adding-the-classic-crafting-menu)):

1. **Enum** — add `eUIScene_MyMenu` to `EUIScene` in
   `Common/UI/UIEnums.h` (that's where `eUIScene_MessageBox` lives, `:128`).
2. **Factory** — add a `case` to `UILayer::NavigateToScene`
   (`UILayer.cpp:201`) that `new`s your scene — this is the line that actually makes
   it reachable:

   ```cpp
   case eUIScene_MyMenu:
       newScene = new UIScene_MyMenu(iPad, initData, this);
       break;
   ```

   (If you forget it, `NavigateToScene` logs
   `WARNING: Scene %d was not created. Add it to UILayer::NavigateToScene`.)
3. **Aggregator** — `#include "UIScene_MyMenu.h"` in `Common/UI/UI.h`.
4. **CMake** — add `UIScene_MyMenu.cpp/.h` to
   `Minecraft.Client/cmake/sources/Common.cmake` (and `Windows.cmake`); the client
   does **not** glob its UI sources.

Then navigate to it: `ui.NavigateToScene(iPad, eUIScene_MyMenu, initData)` from
wherever your feature opens (a menu action, a game setting — the classic-crafting
commit gated its scene behind a `GAMESETTING_*` bitmask flag).

> **Aside — the `IUIScene_CommandBlockMenu` orphan (an accidental template).** The
> tree already contains a half-wired scene that shows exactly which of these five
> steps are missing when a scene *isn't* reachable. `Common/UI/IUIScene_CommandBlockMenu.cpp`/`.h`
> exist and are even listed in `Common.cmake` (`:290-291`), so the file **compiles** —
> but `grep CommandBlock` returns **zero** hits in `UIEnums.h` and **zero** in
> `UILayer.cpp`. It has:
>
> - **no `eUIScene_*` enum entry** (step 5.1 missing),
> - **no `UILayer::NavigateToScene` factory case** (step 5.2 missing), and
> - it isn't even a `UIScene` subclass — `class IUIScene_CommandBlockMenu`
>   (`IUIScene_CommandBlockMenu.h:4`) is a bare `Initialise(CommandBlockEntity*)` /
>   `ConfirmButtonClicked()` / `GetCommand()`/`SetCommand()`/`GetPad()` skeleton with
>   no base class and no implementer.
>
> With no enum id and no factory case, nothing can ever `new` it — it is
> **VESTIGIAL-COMPILED**, an unshipped command-block editor left as dead code. It's
> useful two ways: as a curiosity (someone started TU-era command-block UI and
> stopped), and as a **negative template** — read it as the exact checklist above with
> steps 1, 2, and the base-class choice all left blank. The
> [UI Code Map](/slop-docs/client/ui-code-map/#scene-interfaces--iuiscene_-21-cpp--data-driven-live-except-as-noted)
> classifies it alongside the live `IUIScene_*` interfaces.

## Resolution-variant obligations

This is where new UI most often ships broken. The loader appends a suffix, so a
scene needs **every variant** its `getMoviePath()` stem can resolve to:

| `getMoviePath()` returns | Files you must ship in `MediaWindows64/` |
|---|---|
| `L"MyMenu"` | `MyMenu720.swf`, `MyMenu1080.swf` |
| `L"MyMenuSplit"` (split-screen) | `MyMenuSplit720.swf`, `MyMenuSplit1080.swf` |

- **720 is the floor.** The fallback chain is `preferred → 720 → 1080 → FatalLoadError`
  (`UIScene.cpp:358-382`), and `720` is tried first — so at minimum ship the `720`
  variant or the game can hard-fault. controlType 3 and 5 (`force720ForControlType`)
  force 720 even on a 1080 display.
- **Layout is per-movie-pixel-space.** A 1080 movie is authored at 1920×1080; the
  720 variant at 1280×720. When you shift/scale a shared element, **apply the edit to
  each variant in its own space** — `tools/ShiftLogo.java` demonstrates scaling a
  1080-referenced shift by `frameHeightPx / 1080.0` so the same intent lands on 720
  and Split. Don't copy a 1080 movie to a 720 filename and call it done.
- **Split is a separate stem, not a suffix.** `getMoviePath()` returns the `…Split`
  base *itself* for multi-player; the loader then still appends the resolution. So
  `MyMenuSplit` → `MyMenuSplit720.swf` / `MyMenuSplit1080.swf`.

## Testing checklist

- [ ] **All four movie variants** exist in `Common/Media/MediaWindows64/`:
      `MyMenu720/1080` and (if you split) `MyMenuSplit720/1080`.
- [ ] Every `UI_MAP_ELEMENT("Name")` matches an **instance name** in the movie's
      display list — a mismatch leaves the control unbound (blank/dead), no error.
- [ ] Every `UI_MAP_NAME(_, L"Method")` matches an AS3 method reachable from the
      document-class root, or the `IggyPlayerCallMethodRS` no-ops.
- [ ] The `eUIScene_MyMenu` enum value exists **and** the
      `UILayer::NavigateToScene` case `new`s the scene (watch for the
      "Scene N was not created" warning).
- [ ] `UI.h` includes the header and the `.cpp/.h` are in `Common.cmake` /
      `Windows.cmake` — the project configures & compiles them.
- [ ] `getMoviePath()` returns a stem whose SWFs actually exist (else the loader
      logs `WARNING: Could not find iggy movie …` and falls back / faults).
- [ ] **Split-screen:** open the scene with 2+ local players and confirm the `…Split`
      movie loads and lays out.
- [ ] **Both resolutions:** run at a >720 display (1080 movie) and force 720
      (controlType 3/5) and confirm both variants render correctly.
- [ ] Trigger navigation, press each button, back out — confirm `handlePress` /
      `handleInput` fire and the scene tears down cleanly.
- [ ] Any new `IDS_*` label is in the loc XML and regenerated into `strings.h`
      (see [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/)).

## Where to go next

- [Opening & Editing SWFs](/slop-docs/modding/iggy-editing-swfs/) — the FFDec
  workflows (bitmap swap, ABC patch, matrix shift) you use to reshape the cloned
  movie.
- [Custom UI Scenes](/slop-docs/modding/custom-ui/) — the full C++ `UIScene` stack,
  the classic-crafting commit walkthrough, and the settings-slider pattern.
- [Custom Container Menus](/slop-docs/modding/custom-containers/) — if your new scene
  is a slot container rather than a plain screen.
- [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/) — the `.arc`
  workflow and localization codegen behind a new scene.

---
title: Custom UI Scenes
description: How a console UIScene works and how to add one, walked end-to-end through neoLegacy's real classic-crafting menu and the SettingsUIMenu slider.
---

The live console front-end is **not** the classic Java-port `Screen` hierarchy —
those root-level `*Screen.cpp` classes are largely vestigial. The real menus are
**`UIScene`** objects, each backed by an Iggy (Scaleform/Flash) movie. This page
explains that stack and then walks the exact commit that added neoLegacy's
**classic crafting menu** (`UIScene_ClassicCraftingMenu`), which is the cleanest
recent example of a full scene addition. For container-specific slot wiring see
[Custom Container Menus](/slop-docs/modding/custom-containers/); for the SWF/asset
side see [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/).

## How a UIScene works

A `UIScene` (`Minecraft.Client/Common/UI/UIScene.h`) *"maps directly to an Iggy
movie (or more accurately a collection of different sized movies)."* The three
pieces that make a scene are:

1. **A movie** — one or more `.swf` files (per resolution/splitscreen), selected by
   `virtual wstring getMoviePath() = 0;` (`UIScene.h:129`).
2. **An element map** — a `mapElementsAndNames()` method that binds C++ `UIControl`
   fields to named symbols in the movie, built with macros from `UIScene.h`.
3. **A factory registration** — a `case` in `UILayer::NavigateToScene` that `new`s
   the scene for its `EUIScene` enum value.

### The element-map macros (`UIScene.h:17-45`)

```cpp
UI_BEGIN_MAP_ELEMENTS_AND_NAMES(ParentClass)   // opens mapElementsAndNames(), calls parent
    UI_BEGIN_MAP_CHILD_ELEMENTS(m_panel)       // descend into a movie panel/clip
        UI_MAP_ELEMENT(m_control, "MovieName")  // bind a UIControl to a named movie symbol
    UI_END_MAP_CHILD_ELEMENTS()
UI_END_MAP_ELEMENTS_AND_NAMES()
```

- `UI_MAP_ELEMENT(var, name)` calls `var.setupControl(this, currentRoot, name)` and
  pushes it onto `m_controls` — this is what connects a C++ `UIControl_SlotList` /
  `UIControl_Label` to the Flash clip called `"name"`.
- `UI_BEGIN/END_MAP_CHILD_ELEMENTS(parent)` re-roots the following `UI_MAP_ELEMENT`
  calls under a named parent panel (e.g. the main panel of the movie).
- `UI_MAP_NAME(var, name)` caches a fast Iggy name handle (`registerFastName`) for
  later scripted calls.

The scene manager is `UIController` (`UIController.cpp`) plus the per-player
`UILayer` (`UILayer.cpp`); `UILayer::NavigateToScene(iPad, EUIScene, initData)` is
the factory switch that instantiates scenes.

## Worked example: adding the classic crafting menu

The classic 2×2-style crafting scene was added in one commit
(`feat(TU31): classic crafting`, `05d7ccb6`). It is the canonical template for a
new scene — every step below cites that commit's diff. It touches **six** kinds of
file: the scene class, the enum, the factory, the include aggregator, a game
setting to toggle it, and the navigation site.

### Step 1 — the scene header (`UIScene_ClassicCraftingMenu.h`)

Because it's a container scene it derives from `UIScene_AbstractContainerMenu`
(and the `IUIScene_ClassicCraftingMenu` interface). The header declares the
`UIControl`s and wires them with the map macros:

```cpp
class UIScene_ClassicCraftingMenu : public UIScene_AbstractContainerMenu,
                                    public IUIScene_ClassicCraftingMenu
{
public:
    UIScene_ClassicCraftingMenu(int iPad, void* initData, UILayer* parentLayer);
    virtual EUIScene getSceneType() { return eUIScene_ClassicCraftingMenu; }

protected:
    UIControl_SlotList m_slotListCrafting, m_slotListResult;
    UIControl_Label    m_labelTitle, m_labelInventory;

    UI_BEGIN_MAP_ELEMENTS_AND_NAMES(UIScene_AbstractContainerMenu)
        UI_BEGIN_MAP_CHILD_ELEMENTS(m_controlMainPanel)
            UI_MAP_ELEMENT(m_slotListCrafting, "CraftingList")
            UI_MAP_ELEMENT(m_slotListResult,   "Result")
            UI_MAP_ELEMENT(m_labelTitle,       "TitleLabel")
        UI_END_MAP_CHILD_ELEMENTS()
    UI_END_MAP_ELEMENTS_AND_NAMES()

    virtual wstring getMoviePath();
    virtual void    handleReload();
    // ... section geometry overrides (rows/cols/positions) ...
};
```

The string literals `"CraftingList"`, `"Result"`, `"TitleLabel"` are **symbol
names inside the movie** — they must match the clips in `ClassicCraftingMenu.swf`.

### Step 2 — the scene implementation (`UIScene_ClassicCraftingMenu.cpp`)

`getMoviePath()` picks the movie by player count (splitscreen gets a separate
movie), exactly the pattern every scene uses (`UIScene_ClassicCraftingMenu.cpp:42`):

```cpp
wstring UIScene_ClassicCraftingMenu::getMoviePath()
{
    if (app.GetLocalPlayerCount() > 1)
        return L"ClassicCraftingMenuSplit";
    else
        return L"ClassicCraftingMenu";
}
```

The returned base name resolves to the resolution-suffixed SWFs shipped in the
commit: `ClassicCraftingMenu720.swf`, `ClassicCraftingMenuSplit720.swf`, etc. under
`Common/Media/MediaWindows64/`.

`handleReload()` binds the slot lists to the world-side menu's slot indices
(`:50`):

```cpp
void UIScene_ClassicCraftingMenu::handleReload()
{
    Initialize(m_iPad, m_menu, true, CraftingMenu::INV_SLOT_START,
               eSectionClassicCraftingHotbar, eSectionClassicCraftingMax);
    m_slotListResult.addSlots(CraftingMenu::RESULT_SLOT, 1);
    m_slotListCrafting.addSlots(CraftingMenu::CRAFT_SLOT_START, 9);
}
```

The `getSectionColumns/Rows`, `GetPositionOfSection`, `GetItemScreenData` overrides
describe the on-screen slot grid geometry; copy them from the nearest existing
container scene (the commit modeled these on the inventory/crafting scenes).

### Step 3 — register the scene enum (`UIEnums.h`)

Add the scene's `EUIScene` value. The commit inserted it in the container block:

```cpp
enum EUIScene
{
    // ...
    eUIScene_Crafting2x2Menu,
    eUIScene_Crafting3x3Menu,
    eUIScene_ClassicCraftingMenu,   // <- added
    eUIScene_FurnaceMenu,
    // ...
};
```

### Step 4 — register in the `UILayer` factory (`UILayer.cpp`)

Add a `case` to `UILayer::NavigateToScene` (`UILayer.cpp:246`) that `new`s your
scene. **This is the line that actually makes the scene reachable:**

```cpp
case eUIScene_Crafting3x3Menu:
    newScene = new UIScene_CraftingMenu(iPad, initData, this);
    break;
case eUIScene_ClassicCraftingMenu:                       // <- added
    newScene = new UIScene_ClassicCraftingMenu(iPad, initData, this);
    break;
```

### Step 5 — include it in the aggregator (`UI.h`)

`Common/UI/UI.h` pulls in every scene header. Add yours next to the sibling
crafting scene:

```cpp
#include "UIScene_CraftingMenu.h"
#include "UIScene_ClassicCraftingMenu.h"   // <- added
```

### Step 6 — register the source files with CMake

The client does not glob its UI sources. Add the four files (scene + `IUIScene_*`
pair) to the source lists the commit edited:
`Minecraft.Client/cmake/sources/Common.cmake` (and `Windows.cmake`), alongside the
existing `IUIScene_*` entries (e.g. `IUIScene_ClassicCraftingMenu.cpp/.h` sit next
to `IUIScene_FireworksMenu` in `Common.cmake`).

### Step 7 — a toggle game setting (optional, but this is how the feature ships)

Classic crafting is opt-in via a per-player game setting, which shows the general
pattern for a persistent UI option. The commit added:

- A bitmask flag in `App_Defines.h`:
  `#define GAMESETTING_CLASSICCRAFTING 0x04000000`.
- An enum value in `App_enums.h`: `eGameSetting_ClassicCrafting`.
- Default + get/set/action handling in `Consoles_App.cpp` — the setting defaults
  off (`SetGameSettings(iPad, eGameSetting_ClassicCrafting, 0)`), and `GetGameSettings`
  reads it back out of the bitmask
  (`return (uiBitmaskValues & GAMESETTING_CLASSICCRAFTING) >> 26;`).

### Step 8 — navigate to the scene

The setting decides which scene the "open crafting" action routes to
(`Consoles_App.cpp`, from the commit diff):

```cpp
if (app.GetGameSettings(iPad, eGameSetting_ClassicCrafting))
    success = ui.NavigateToScene(iPad, eUIScene_ClassicCraftingMenu, initData);
else
    success = ui.NavigateToScene(iPad, eUIScene_Crafting3x3Menu, initData);
```

`NavigateToScene` hits the factory case from step 4 and constructs your scene.

### Step 9 — strings & the SWF

- **Strings:** the commit added the checkbox label to
  `Windows64Media/loc/stringsGeneric.xml` as an `IDS_*` entry (surfaced as
  `IDS_CHECKBOX_CLASSICCRAFTING`). See
  [Textures & Asset Pipeline §3](/slop-docs/modding/textures-assets/#3-localization-xml--stringsh-codegen-chain)
  for how XML becomes `strings.h`.
- **SWF:** the movie files (`ClassicCraftingMenu*.swf`) are committed loose under
  `Common/Media/MediaWindows64/`. To author one, clone an existing crafting movie
  and rename/reposition clips to match your `UI_MAP_ELEMENT` names, using the JPEXS
  patchers in `tools/` (see below). The clip names in the SWF **must** match the
  strings you passed to `UI_MAP_ELEMENT`.

## Editing the movie: the JPEXS patchers

The neoLegacy way to modify a menu movie is to **clone-and-shift** an existing
widget rather than author AS3 from scratch. `tools/AddVSyncCheckbox.java` is the
reference: it opens a `SettingsGraphicsMenu` SWF with JPEXS FFDec
(`com.jpexs.decompiler.flash.SWF`), finds the existing `CustomSkinAnim` checkbox,
clones it, renames the clone `"VSync"`, positions it below the original, and shifts
the sliders down. `AddExclusiveFullscreenCheckbox.java` does the same for a
fullscreen toggle. To add a widget to your scene:

1. Extract or open the target SWF (`ExtractFromArc` / loose file — see
   [Asset Pipeline §2](/slop-docs/modding/textures-assets/#2-the-arc-archive--rebuildarc-workflow)).
2. Run a JPEXS patcher (adapt `AddVSyncCheckbox.java`) to clone a widget and give
   it the clip name your `UI_MAP_ELEMENT` expects.
3. Repack with `RebuildArc` or drop the loose SWF into `Common/Media/MediaWindows64/`.

## Settings-scene slider example (`UIScene_SettingsUIMenu`)

`UIScene_SettingsUIMenu` (`Common/UI/UIScene_SettingsUIMenu.cpp`) is the pattern for
a scrolling settings list with sliders and checkboxes. Rows are added to a
`UIControl_MultiList` (`m_multiList`) during populate:

```cpp
// checkbox row — the classic-crafting toggle
m_multiList.AddNewCheckbox(app.GetString(IDS_CHECKBOX_CLASSICCRAFTING),
    eControl_ShowClassicCrafting,
    (app.GetGameSettings(m_iPad, eGameSetting_ClassicCrafting) != 0));

// slider row — controller-icon set (0..5), only outside a world
int controlTypeVal = app.GetGameSettings(m_iPad, eGameSetting_ControlType);
swprintf(TempString, 256, L"%ls: %ls",
    app.GetString(IDS_SLIDER_CONTROLTYPE),
    app.GetString(m_iControlTypeSettingA[controlTypeVal]));
m_multiList.AddNewSlider(TempString, eControl_ControlType, 0, 5, 1, controlTypeVal);
```

`AddNewSlider(label, controlId, min, max, step, value)` and
`AddNewCheckbox(label, controlId, checked)` are the two calls you need. The
`eControl_*` id is your handle for the change callback. When the user moves a
slider, the scene's tick handles the deferred update — read the game setting,
write it back, and relabel:

```cpp
case eControl_ControlType:
    app.SetGameSettings(m_iPad, eGameSetting_ControlType, m_iPendingSliderValue);
    swprintf(TempString, 256, L"%ls: %ls", app.GetString(IDS_SLIDER_CONTROLTYPE),
        app.GetString(m_iControlTypeSettingA[m_iPendingSliderValue]));
    m_multiList.SetSliderLabel(eControl_ControlType, TempString);
    break;
```

`SetSliderValue` / `SetSliderLabel` update the widget; `app.SetGameSettings(...)`
persists the value per-pad. To add your own slider: declare an `eControl_*` id, call
`AddNewSlider` in the populate block, and add a matching `case` in the pending-slider
switch that stores the value via `app.SetGameSettings`.

Some settings also toggle scene components — e.g. `updateComponents()` shows/hides
the logo and panorama via `m_parentLayer->showComponent(m_iPad, eUIComponent_Logo, ...)`.

## Testing checklist

- [ ] All four scene files (`UIScene_*.cpp/.h`, `IUIScene_*.cpp/.h`) are in
      `cmake/sources/Common.cmake` (and `Windows.cmake`) — the project configures
      and compiles them.
- [ ] The `EUIScene` enum value exists and the `UILayer::NavigateToScene` case `new`s
      the scene — otherwise navigation silently does nothing.
- [ ] `UI.h` includes the scene header.
- [ ] `getMoviePath()` returns a base name whose SWFs exist under
      `Common/Media/MediaWindows64/` (both normal and `...Split` for splitscreen).
- [ ] Every `UI_MAP_ELEMENT("Name")` matches a clip name in the movie — a mismatch
      leaves that control unbound (blank/unresponsive).
- [ ] Any new `IDS_*` label is in the loc XML and regenerated into `strings.h`.
- [ ] Trigger the navigation path (the action / setting that calls
      `NavigateToScene`) and confirm the scene opens, renders, and takes input.
- [ ] Splitscreen: open the scene with 2+ local players and confirm the `...Split`
      movie loads.
- [ ] For a settings row: move the slider / toggle the checkbox, back out, re-enter,
      and confirm the value persisted (`GetGameSettings` reads it back).

## Where to go next

- [Custom Container Menus](/slop-docs/modding/custom-containers/) — the world-side
  `AbstractContainerMenu` and slot wiring behind a container scene.
- [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/) — `.arc`
  archive, SWF patchers, and the localization codegen chain.
- [Client UI system](/slop-docs/client/ui-system/) — the full XUI/UIScene stack
  and how `Consoles_App`/`UIController` drive it.
- [Client Core overview](/slop-docs/client/overview/) — where scenes sit in the
  client engine.

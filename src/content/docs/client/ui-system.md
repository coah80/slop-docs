---
title: UI System (UIScene & XUI)
description: The live console front-end — Iggy/Scaleform movie-backed UIScenes, the UIController scene manager, the UILayer scene factory, the widget inventory, and the neoLegacy scene work (skin select, controls, wider settings, controller-icon slider, world copy/save).
---

The console front-end you actually see and click through is **not** the classic
Java-port [`Screen` hierarchy](/slop-docs/client/overview/#read-this-first-two-gui-stacks)
— that stack is largely vestigial on console. The real UI is a stack of
**Iggy/Scaleform movie-backed scenes** living under `Common/UI/`. Each scene is a
`UIScene` subclass bound to a Flash/`.swf` movie; C++ maps named movie elements to
typed widget objects, ticks and renders them through the Iggy runtime, and receives
input back as ActionScript callbacks.

Every neoLegacy UI change — TU36 skin-select parity, the updated controls menu, the
widened settings menus, the controller-icon slider, and world copy/save on the
LoadCreateJoin menu — lives in this stack, **never** in the root `*Screen.cpp` classes.

Files: `Common/UI/UIScene.h`, `Common/UI/UIScene.cpp`, `Common/UI/UIController.h`/`.cpp`,
`Common/UI/UILayer.h`/`.cpp`, `Common/UI/UIEnums.h`, `Common/UI/UIControl_*`,
`Common/UI/UIComponent_*`, `Common/UI/UIScene_*`. Legacy sibling: `Common/XUI/XUI_*`.

## Two UI stacks — do not conflate

There are two implementations of the same scenes in the tree:

| Stack | Location | Status |
|-------|----------|--------|
| **UIScene** (Iggy) | `Common/UI/UIScene_*` | Canonical live front-end. All neoLegacy work is here. |
| **XUI** (Xbox-360 era) | `Common/XUI/XUI_*` | Legacy sibling. Older XUI reimplementation (`XUI_MainMenu`, `XUI_PauseMenu`, `XUI_SkinSelect`, `XUI_SettingsAll`, `XUI_HelpControls`, `XUI_Scene_Inventory`, …) plus `XUI_Ctrl_*` controls. |

The `IUIScene_*` files in `Common/UI/` are pure-virtual interfaces (container menus
mostly) that the concrete `UIScene_*` classes satisfy. Treat `Common/UI/` as
canonical and `Common/XUI/` as the historical implementation it superseded.

## Anatomy of a UIScene

`class UIScene` (`UIScene.h:46`) is the base every console screen derives from. The
header comment states the contract plainly:

```cpp
// A scene map directly to an Iggy movie (or more accurately a collection of
// different sized movies)
```

Each scene owns an `Iggy *swf` (the loaded movie), a `vector<UIControl *> m_controls`
(the C++-side widgets), an `m_iPad` (the owning pad index — the whole stack is
per-player), and an `m_parentLayer` back-pointer. Key virtuals a subclass overrides:

| Virtual | Purpose | Declared |
|---------|---------|----------|
| `getMoviePath()` = 0 | Returns the base movie name (resolution suffix appended at load). | `UIScene.h:129` |
| `getSceneType()` = 0 | Returns this scene's `EUIScene` id. | `UIScene.h:145` |
| `mapElementsAndNames()` | Binds named movie elements to C++ widgets (see macros below). | `UIScene.h:131` |
| `tick()` | Per-frame logic; base handles timers/opacity/direct-edit. | `UIScene.h:148` |
| `handleInput(iPad,key,repeat,pressed,released,handled)` | Raw pad input. | `UIScene.h:243` |
| `handlePress(controlId,childId)` | A movie button was pressed. | `UIScene.h:251` |
| `handleSliderMove(sliderId,currentValue)` | A slider moved. | `UIScene.h:255` |
| `handleCheckboxToggled(controlId,selected)` | A checkbox toggled. | `UIScene.h:254` |
| `handleFocusChange(controlId,childId)` | Focus moved between controls. | `UIScene.h:252` |
| `updateComponents()` | Show/hide shared components (panorama, logo). | `UIScene.h:178` |
| `updateTooltips()` | Set the on-screen button-hint strip. | `UIScene.h:177` |
| `render(width,height,viewport)` | Draw the scene. | `UIScene.h:211` |

### The element-mapping macros

A scene declares which movie objects it cares about with the
`UI_*_MAP_ELEMENTS_AND_NAMES` macros defined at the top of `UIScene.h`. They expand
into a `mapElementsAndNames()` override that walks the movie's value tree and wires
each named ActionScript symbol to a C++ widget field.

| Macro | Effect | `UIScene.h` |
|-------|--------|-------------|
| `UI_BEGIN_MAP_ELEMENTS_AND_NAMES(parentClass)` | Opens the override; grabs `IggyPlayerRootPath(getMovie())`. | `:17` |
| `UI_MAP_ELEMENT(var, name)` | `var.setupControl(this, currentRoot, name)` and pushes `&var` into `m_controls`. | `:28` |
| `UI_BEGIN_MAP_CHILD_ELEMENTS(parent)` / `UI_END_MAP_CHILD_ELEMENTS()` | Re-root mapping under a parent panel's `IggyValuePath` (nested movie clips). | `:31`/`:38` |
| `UI_MAP_NAME(var, name)` | `var = registerFastName(name)` — caches an `IggyName` for calling an AS3 function later. | `:43` |
| `UI_END_MAP_ELEMENTS_AND_NAMES()` | Closes the override. | `:24` |

`UIScene_SkinSelectMenu` is a good worked example (`UIScene_SkinSelectMenu.h:56`):
it maps the `"Blocked"`, `"Favourite"`, `"Locked"`, `"Selected"` markers, the
`"SkinTitle1/2"` and `"Pack_Name/Type"` labels, the `"SkinButtonList"` multilist,
then descends into the `"IggyCharacters"` clip with `UI_BEGIN_MAP_CHILD_ELEMENTS` to
map `iggy_Character0`, `iggy_Character1`, … onto its `m_characters[]` preview array,
and finally caches AS3 function names such as `L"SetPlayerCharacterSelected"` with
`UI_MAP_NAME`.

### Movie loading and resolution selection

`initialiseMovie()` → `loadMovie()` (`UIScene.cpp:305`) takes the base name from
`getMoviePath()`, appends a **resolution suffix**, and loads the bytes into Iggy via
`IggyPlayerCreateFromMemory(...)` (`UIScene.cpp:386`):

| Platform | Suffix | `m_loadedResolution` |
|----------|--------|----------------------|
| PS3 (widescreen / not) | `720.swf` / `480.swf` | `eSceneResolution_720` / `_480` |
| PS Vita | `Vita.swf` | `eSceneResolution_Vita` |
| Windows64 | `1080.swf` or `720.swf` | `eSceneResolution_1080` / `_720` |
| Other | `1080.swf` | `eSceneResolution_1080` |

If the chosen movie is missing, `loadMovie()` falls back to `720.swf` then `1080.swf`
before calling `app.FatalLoadError()` (`UIScene.cpp:358-381`).

> **neoLegacy delta.** The Windows64 resolution branch (`UIScene.cpp:333-352`) reads
> `eGameSetting_ControlType` for the primary pad and forces the 720 movie for control
> types `3` and `5` (PlayStation 3 / Wii U layouts) — except tutorial-popup and HUD
> movies, which are forced 1080 to avoid "inaccuracies + crashes" noted in the source.
> This ties the [controller-icon slider](#neolegacy-controller-icon-slider) directly to
> which movie assets are shown.

## UIController — the scene manager

`class UIController : public IUIController` (`UIController.h:17`) owns the whole UI. It
holds one `UIGroup` per player plus a shared fullscreen group
(`UIGroup *m_groups[eUIGroup_COUNT]`, `UIController.h:221`). The group/layer/scene
addressing space is defined in `UIEnums.h`:

- **`EUIGroup`** (`UIEnums.h:4`): `eUIGroup_Fullscreen`, `eUIGroup_Player1..4`. Lower
  numbers tick first, render last (i.e. on top).
- **`EUILayer`** (`UIEnums.h:20`): `eUILayer_Debug`, `_Tooltips`, `_Error`, `_Alert`,
  `_Fullscreen`, `_Popup`, `_Scene`, `_HUD` — the render stack inside one group.
- **`EUIScene`** (`UIEnums.h:39`): the ~74-entry scene/component id enum.

The controller's three hot methods:

| Method | `UIController.cpp` | Job |
|--------|--------------------|-----|
| `tick()` | `:559` | Per-frame update. Applies font changes (`SetupFont()`), processes deferred navigate-home / close-all requests (`m_bCloseAllScenes[]`), then ticks every group. |
| `tickInput()` | `:998` | Routes pad + (Windows64) mouse input to the focused scene, unless system/commerce UI is up (`m_bSystemUIShowing`). |
| `renderScenes()` | `:1863` | Renders each player group (only when `app.GetGameStarted()` and the fullscreen group isn't hiding lower scenes), then always renders the fullscreen group. |

Scene transitions are requested by id, not by pointer:
`ui.NavigateToScene(pad, eUIScene_MainMenu)` (e.g. `UIController.cpp:569`). The
comment block in `UIEnums.h:108-115` warns that adding a scene means also updating the
`NavigateToScene` switches, `UILayer::updateFocusState`, and
`CConsoleMinecraftApp::wchSceneA`.

## UILayer — the scene factory

`class UILayer` (`UILayer.h:8`) is one player's slice of a group and, critically, holds
the **scene factory**: a big `switch(EUIScene)` in `UILayer.cpp` that `new`s the
concrete `UIScene_*` for each id. Every scene is constructed
`new UIScene_X(iPad, initData, this)`. Representative cases:

| `EUIScene` | Class | `UILayer.cpp` |
|------------|-------|---------------|
| `eUIScene_MainMenu` | `UIScene_MainMenu` | `:378` |
| `eUIScene_LoadCreateJoinMenu` | `UIScene_LoadCreateJoinMenu` | `:384` |
| `eUIScene_SettingsMenu` | `UIScene_SettingsMenu` | `:283` |
| `eUIScene_SettingsUIMenu` | `UIScene_SettingsUIMenu` | `:295` |
| `eUIScene_SkinSelectMenu` | `UIScene_SkinSelectMenu` | `:298` |
| `eUIScene_ControlsMenu` | `UIScene_ControlsMenu` | `:310` |
| `eUIScene_InventoryMenu` | `UIScene_InventoryMenu` | `:224` |
| `eUIScene_HUD` | (`UIScene_HUD`) | — |

`UILayer` also dispatches input down its layer stack —
`UILayer::handleInput()` (`UILayer.cpp:809`) walks scenes and calls each
`scene->handleInput(...)`, stopping once a scene reports it `hidesLowerScenes()` or
`blocksInput()` — and exposes `showComponent(iPad, scene, show)` (`UILayer.h:62`),
which scenes use to raise the panorama/logo (see below).

## Input round-trip: AS3 → C++

Pad input flows **into** the movie; the movie's ActionScript then calls **back** into
C++. `UIScene::externalCallback(IggyExternalFunctionCallUTF16 *call)`
(`UIScene.cpp:1256`) is the bridge — it string-matches the AS3 function name and
forwards to the typed virtual:

| AS3 callback name | Dispatches to | `UIScene.cpp` |
|-------------------|---------------|---------------|
| `handlePress` | `handlePress(controlId, childId)` | `:1276` |
| `handleFocusChange` | `_handleFocusChange(...)` | `:1296` |
| `handleCheckboxToggled` | `handleCheckboxToggled(controlId, selected)` | `:1348` |
| `handleSliderMove` | `handleSliderMove(sliderId, currentValue)` | `:1350`+ |

Raw `handleInput()` (buttons that the scene handles directly, like Cancel/Back) is
delivered from `UILayer` before the movie sees them; conversely, navigation keys are
forwarded into the movie via `sendInputToMovie(...)` so ActionScript can move focus and
fire the callbacks above.

## The scene inventory (~74 scenes)

The `EUIScene` enum (`UIEnums.h:39`) enumerates every scene/component. Grouped by role:

**Front-end / menu flow.** `UIScene_Intro`, `UIScene_MainMenu`,
`UIScene_LoadCreateJoinMenu`, `UIScene_LoadOrJoinMenu`, `UIScene_LoadMenu`,
`UIScene_CreateWorldMenu`, `UIScene_JoinMenu`, `UIScene_LaunchMoreOptionsMenu`,
`UIScene_LanguageSelector`, `UIScene_EULA`, `UIScene_Credits`, `UIScene_ReinstallMenu`,
`UIScene_QuadrantSignin` (splitscreen sign-in), `UIScene_Keyboard` (on-screen
keyboard), `UIScene_MessageBox`, `UIScene_SaveMessage`, `UIScene_NewUpdateMessage`,
`UIScene_Timer`, `UIScene_FullscreenProgress`, `UIScene_ConnectingProgress`.

**Settings / options** (neoLegacy widened these — see below).
`UIScene_SettingsMenu` (root), `UIScene_SettingsOptionsMenu`,
`UIScene_SettingsGraphicsMenu`, `UIScene_SettingsAudioMenu`, `UIScene_SettingsUIMenu`,
`UIScene_ControlsMenu`, `UIScene_HelpAndOptionsMenu`, `UIScene_HowToPlay`,
`UIScene_HowToPlayMenu`.

**In-game menus.** `UIScene_HUD`, `UIScene_PauseMenu`, `UIScene_DeathMenu`,
`UIScene_InGameHostOptionsMenu`, `UIScene_InGamePlayerOptionsMenu`,
`UIScene_InGameInfoMenu`, `UIScene_InGameSaveManagementMenu`, `UIScene_TeleportMenu`,
`UIScene_SignEntryMenu`, `UIScene_EndPoem`.

**Container / inventory menus** (over `UIScene_AbstractContainerMenu`; the `IUIScene_*`
interfaces live alongside). `UIScene_InventoryMenu`, `UIScene_CreativeMenu`,
`UIScene_ContainerMenu`, `UIScene_CraftingMenu`, `UIScene_ClassicCraftingMenu`,
`UIScene_FurnaceMenu`, `UIScene_DispenserMenu`, `UIScene_HopperMenu`,
`UIScene_BrewingStandMenu`, `UIScene_AnvilMenu`, `UIScene_EnchantingMenu`,
`UIScene_BeaconMenu`, `UIScene_TradingMenu`, `UIScene_HorseInventoryMenu`,
`UIScene_FireworksMenu`, `UIScene_BookAndQuillMenu`.

**Skins / customization.** `UIScene_SkinSelectMenu`.

**Achievements / social / DLC.** `UIScene_AchievementsMenu`,
`UIScene_LeaderboardsMenu`, `UIScene_DLCMainMenu`, `UIScene_DLCOffersMenu`,
`UIScene_TrialExitUpsell`.

**Debug** (guarded by `_DEBUG_MENUS_ENABLED` / `_CONTENT_PACKAGE` in `UIEnums.h`).
`UIScene_DebugOverlay`, `UIScene_DebugOptionsMenu`, `UIScene_DebugSetCamera`,
`UIScene_DebugCreateSchematic`.

## Widget inventory (UIControl_* / UIComponent_*)

Widgets derive from `UIControl` → `UIControl_Base` (`UIControl_Base.h:7`, "maps to the
`FJ_Base` class in actionscript"). `UIControl_Base` carries the label state and the
cached AS3 function names (`m_initFunc`, `m_setLabelFunc`, `m_funcGetLabel`, …). The
full control set in `Common/UI/`:

| Control | Role |
|---------|------|
| `UIControl_Slider` | Numeric slider (see the [controller-icon slider](#neolegacy-controller-icon-slider)). |
| `UIControl_MultiList` | Vertical list of rows (checkboxes/sliders/buttons) — the settings-menu backbone. |
| `UIControl_Button` / `UIControl_ButtonList` | Buttons / button rows. |
| `UIControl_CheckBox` | Toggle. |
| `UIControl_Label` / `UIControl_DynamicLabel` / `UIControl_HTMLLabel` | Text. |
| `UIControl_TextInput` | Editable text (Windows64 direct-edit). |
| `UIControl_SaveList` | World-save list rows (LoadCreateJoin). |
| `UIControl_TexturePackList` / `UIControl_DLCList` | Pack lists. |
| `UIControl_AchievementsList` / `UIControl_LeaderboardList` / `UIControl_PlayerList` | Grids/rosters. |
| `UIControl_PlayerSkinPreview` / `UIControl_MinecraftPlayer` / `UIControl_MinecraftHorse` | 3D previews. |
| `UIControl_EnchantmentBook` / `UIControl_EnchantmentButton` / `UIControl_BeaconEffectButton` | Container-specific controls. |
| `UIControl_SlotList` | Inventory/container slot grid (add-slot + highlight/red-box). |
| `UIControl_Progress` / `UIControl_SpaceIndicatorBar` | Progress + disk-space bars. |
| `UIControl_Cursor` / `UIControl_BitmapIcon` / `UIControl_Book` / `UIControl_PageFlip` / `UIControl_Touch` | Cursor, icons, book pages, page-flip, touch input. |

Shared **components** (added to a layer independently of any one scene) live in
`UIComponent_*`: `UIComponent_Logo` (the modifiable in-game logo),
`UIComponent_Panorama` and `UIComponent_MenuBackground` (menu backdrops),
`UIComponent_Chat`, `UIComponent_Tooltips`, `UIComponent_TutorialPopup`,
`UIComponent_PressStartToPlay`, `UIComponent_DebugUIConsole`,
`UIComponent_DebugUIMarketingGuide`.

> **Changed past v1.1.0b (`3a860d44 feat: customizable panorama`, upstream tip `3833d0f3`):**
> `UIComponent_Panorama` gained an optional `panorama.xml` override file, parsed at texture-load time
> from the panorama texture root. It configures the menu-backdrop scroll speed, Gaussian blur sigma,
> and an optional **grid** mode (grid size X/Y + a nearest-neighbour scaling toggle) that restores the
> tiled classic-Minecraft panorama look. Defaults match the prior hard-coded values, so behaviour is
> unchanged when the file is absent; this is a pure client-presentation setting with **no new
> `eGameSetting`** (`App_enums` is untouched). See the
> [Past v1.1.0b changelog note](/slop-docs/features/changelog/#past-v110b).

Fonts: `UIBitmapFont`, `UIUnicodeBitmapFont`, `UITTFFont`, `UIFontData`, and
`UIString`.

---

## neoLegacy scene work

Everything below is a neoLegacy change verified against `NOTES.md` (v1.0.9b) and the
source. None of it touches the classic `*Screen.cpp` stack.

### Skin Select — TU36+ parity

`Common/UI/UIScene_SkinSelectMenu.cpp` / `.h`. `NOTES.md`: *"Skin Select menu has been
updated in order to achieve parity with TU36+"*.

The scene renders a **carousel** of skin previews — `sidePreviewControls = 2`
(`UIScene_SkinSelectMenu.h:14`, "How many to show on each side of the main control"),
backed by a `UIControl_PlayerSkinPreview m_characters[eCharacter_COUNT]` array where
`ECharacters` maps `Current / Next1 / Next2 / Previous1 / Previous2`
(`UIScene_SkinSelectMenu.h:36`). State it tracks:

| Member | Meaning |
|--------|---------|
| `DLCPack *m_currentPack` | Active skin pack. |
| `m_currentSkinPath / m_selectedSkinPath / m_selectedCapePath` | Current + committed skin/cape. |
| `DWORD m_packIndex, m_skinIndex`, `m_currentPackCount` | Carousel indices + pack size. |
| `ESkinSelectNavigation m_currentNavigation` | `eSkinNavigation_Pack` vs `eSkinNavigation_Skin` — whether L/R moves between packs or within a pack. |
| `vector<SKIN_BOX *> *m_vAdditionalSkinBoxes`, `vector<SKIN_OFFSET *> *m_vSkinOffsets` | Extra skin geometry (from `SkinBox.h` / `SkinOffset.h`). |

`getMoviePath()` returns `L"SkinSelectMenu"` (or `L"SkinSelectMenuSplit"` in
splitscreen, `UIScene_SkinSelectMenu.cpp:178`). The button list is built by
`SetSkinPackButtonList()` (`:152`), and the AS3 side is driven through the cached names
`SetPlayerCharacterSelected`, `SetCharacterLocked`, `SetCharacterFavourite`,
`SetCharacterBlocked`. Per-user skin adjustments are stored through
`CMinecraftApp::GetSkinAdjustments` / `SetSkinAdjustments` (see
[Settings & Options](/slop-docs/client/settings/)).

Related git history: *feat: new skinselectmenu*, *fix: skin select menu*, *fix: skin
packs not having the correct icons*.

### Controls menu

`Common/UI/UIScene_ControlsMenu.cpp` / `.h`. `NOTES.md`: *"Controls menu has been
updated."* The scene renders a controller diagram with per-button key lines. Two enums
drive it (`UIScene_ControlsMenu.h`):

- **`EControl`** (`:8`): `eControl_Button0..2` (the three layout buttons — "must be
  first three controls here"), then `eControl_InvertLook`, `eControl_Southpaw`,
  `eControl_SafeCam`, `eControl_ABSwap`.
- **`EPadButtons`** (`:20`): the diagram's mapping table —
  `e_PadBack, e_PadLT, e_PadLB, e_PadDPadLeft/Right/Up/Down, e_PadLS_1/2, e_PadStart,
  e_PadRT, e_PadRB, e_PadY, e_PadB, e_PadA, e_PadX, e_PadRS_1/2, e_PadTouch`
  (`e_PadCOUNT` = 19).

It maps three `UIControl_Button m_buttonLayouts[3]`, four checkboxes
(`m_checkboxInvert/Southpaw/SafeCam/Abswap`), and caches AS3 functions
`SetPlatform`, `SetControllerLayout`, `SetLineAndText`, `ClearAllKeyLines`,
`SetABSwapCheckBox`, `RemoveSafeSprint` (`:77-82`) to draw and re-label the diagram.

### Wider settings menus

`NOTES.md`: *"Settings menus are now wider to match the ones from TU31+"*. This applies
to all `UIScene_Settings*Menu` scenes. The extra width comes from the Iggy movie assets
selected by each scene's `getMoviePath()` — e.g. `UIScene_SettingsUIMenu::getMoviePath()`
returns `L"MultilistMenu"` (or `L"MultilistMenuSplit"` in splitscreen,
`UIScene_SettingsUIMenu.cpp:44`), and `loadMovie()` appends the resolution suffix. The
C++ scene logic is unchanged in shape; the wider look is baked into the swapped movie
assets (which live in the platform Media dirs, not read here).

### neoLegacy: controller-icon slider

`Common/UI/UIScene_SettingsUIMenu.cpp` / `.h`. `NOTES.md`: *"Controller icons and
in-game logos are now modifiable via a slider in 'User Interface' menu."*

The "User Interface" menu populates a `UIControl_MultiList m_multiList` in `tick()`
(`UIScene_SettingsUIMenu.cpp:56`), adding checkboxes and sliders keyed by the `EControls`
enum (`UIScene_SettingsUIMenu.h:11`). The controller-type slider is added — **only when
not in a game** — at `UIScene_SettingsUIMenu.cpp:110`:

```cpp
int controlTypeVal = app.GetGameSettings(m_iPad, eGameSetting_ControlType);
swprintf(TempString, 256, L"%ls: %ls", app.GetString(IDS_SLIDER_CONTROLTYPE),
         app.GetString(m_iControlTypeSettingA[controlTypeVal]));
m_multiList.AddNewSlider(TempString, eControl_ControlType, 0, 5, 1, controlTypeVal);
```

`eControl_ControlType = 13` (`UIScene_SettingsUIMenu.h:26`). The slider ranges **0–5**
(six icon sets), labelled from `static int m_iControlTypeSettingA[6]`
(`UIScene_SettingsUIMenu.cpp:6`):

| Value | Label id |
|-------|----------|
| 0 | `IDS_CONTROLTYPE_KBM` |
| 1 | `IDS_CONTROLTYPE_XBOXONE` |
| 2 | `IDS_CONTROLTYPE_XBOX360` |
| 3 | `IDS_CONTROLTYPE_PLAYSTATION3` |
| 4 | `IDS_CONTROLTYPE_PLAYSTATION4` |
| 5 | `IDS_CONTROLTYPE_WIIU` |

(The array source also carries commented-out `IDS_CONTROLTYPE_VITA` and
`IDS_CONTROLTYPE_SWITCH` entries.)

**Move handling is deferred by one tick.** `handleSliderMove(sliderId, currentValue)`
(`:229`) plays the scroll SFX and just latches the pending value:

```cpp
case eControl_ControlType:
    m_bPendingSliderUpdate = true;
    m_iPendingSliderId = sliderIdInt;
    m_iPendingSliderValue = value;
    break;
```

On the next `tick()` the latched value is committed (`:152`):

```cpp
case eControl_ControlType:
    app.SetGameSettings(m_iPad, eGameSetting_ControlType, m_iPendingSliderValue);
    m_bControlTypeChanged = true;
    swprintf(TempString, 256, L"%ls: %ls", app.GetString(IDS_SLIDER_CONTROLTYPE),
             app.GetString(m_iControlTypeSettingA[m_iPendingSliderValue]));
    m_multiList.SetSliderLabel(eControl_ControlType, TempString);
    break;
```

Because control type also selects the movie resolution
([see above](#movie-loading-and-resolution-selection)), changing it needs a skin
reload. On Cancel/Back, `handleInput()` (`:202`) commits settings and, if
`m_bControlTypeChanged`, calls `ui.ReloadSkin()`:

```cpp
const bool reloadControlTypeSkin = m_bControlTypeChanged;
setGameSettings();
navigateBack();
if(reloadControlTypeSkin)
    ui.ReloadSkin();
```

The **in-game logo** this menu governs is `eUIComponent_Logo`. `updateComponents()`
(`:170`) raises or hides it via the layer:

```cpp
m_parentLayer->showComponent(m_iPad, eUIComponent_Logo, true);   // :176 (out of game)
...
if(app.GetLocalPlayerCount() == 1)
    m_parentLayer->showComponent(m_iPad, eUIComponent_Logo, true); // :182
else
    m_parentLayer->showComponent(m_iPad, eUIComponent_Logo, false); // :183
```

The same scene owns the other UI sliders — `eControl_InterfaceOpacity` (0–100),
`eControl_SensitivityInMenu` (0–200), `eControl_UISize` (1–3) and
`eControl_UISizeSplitscreen` (1–3) — each following the same latch-then-commit pattern
(`:130-157`). The underlying widget is `UIControl_Slider` (`UIControl_Slider.h:5`,
`UIControl_Slider : public UIControl_Base`); git history notes *fix: sliders not
working*.

Slider values map through `eGameSetting_*` in `CMinecraftApp` — see
[Settings & Options](/slop-docs/client/settings/) for the per-pad store and the
`eGameSetting` enum.

### LoadCreateJoin — world copy/save, size display, spinner fix

`Common/UI/UIScene_LoadCreateJoinMenu.cpp` + `UIControl_SaveList.cpp`. `NOTES.md`:

- *"You can now copy and save various worlds on the LoadCreateJoin menu."*
- *"World size is now displayed correctly on the worlds-list menu."*
- *"The LoadCreateJoin menu no longer features an infinite spinner."*

The **copy-save** path is a threaded operation. Selecting *Copy* raises a confirm alert
with `IDS_COPYSAVE` / `IDS_TEXT_COPY_SAVE` (`UIScene_LoadCreateJoinMenu.cpp:5830`);
confirming runs `CopySaveDialogReturned` (`:8661`) which spins up
`CopySaveThreadProc` (`:8729`). That thread sets `m_bCopying = true` and calls
`StorageManager.CopySaveData(...)` with progress + completion callbacks
(`CopySaveDataProgress` `:8865`, `CopySaveDataReturned` `:8811`); the operation is
cancellable through `m_bCopyingCancelled` / `CancelCopySaveCallback` (`:8897`).

The save list itself is a `UIControl_SaveList m_buttonListSaves`, indexed by
`m_iSaveListIndex`; the disk-space bar is a `UIControl_SpaceIndicatorBar`
(`m_spaceIndicatorSaves.selectSave(m_iSaveListIndex)`, `:2114`). Rename uses
`InputManager.RequestKeyboard(...)` → `RenameSaveDataReturned` (`:3597`), and the code
explicitly checks for room to make a copy before a rename (`:1339`). Related git
history: *fix: multilist menu selection*.

## See also

- [Client overview](/slop-docs/client/overview/) — the two GUI stacks in context.
- [Settings & Options](/slop-docs/client/settings/) — the `eGameSetting` per-pad store
  the UI scenes read and write.
- [Input](/slop-docs/client/input/) — how pad/controller input reaches
  `UIController::tickInput()`.

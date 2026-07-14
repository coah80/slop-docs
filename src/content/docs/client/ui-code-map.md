---
title: UI Code Map
description: The complete UI call graph of neoLegacy — every entry point, layer, scene, control, and font traced caller-to-callee, with a Windows64 reachability verdict for every UI file.
---

This page is the **wall map**: starting from the per-platform pump sites and
`Gui.cpp`, it walks the entire UI call graph — what calls each file and what each
file calls — until every UI source file is accounted for. It is the connective
tissue between the three pages that describe the *pieces*:

- [UI System (UIScene & XUI)](/slop-docs/client/ui-system/) — the scene system, the
  widget inventory, and the neoLegacy scene work.
- [Classic Screens & HUD](/slop-docs/client/screens/) — the vestigial `Screen`
  stack, the live `Gui` HUD, and "who draws the HUD".
- [Iggy: the UI Runtime](/slop-docs/modding/iggy-overview/) — the C API at the
  bottom of the whole stack.

Every claim here is read from `Minecraft.Client/`. The reachability column answers
one question: **does this file's code run in the shipping Windows64 build?**

## Reachability verdicts

| Verdict | Meaning |
|---------|---------|
| **LIVE** | Compiled on Windows64 and reached every frame / on real user actions. |
| **DATA-DRIVEN-LIVE** | Compiled and reachable, but only instantiated through the `NavigateToScene` id switch or a factory — reached when its scene/movie is data-selected. |
| **VESTIGIAL-COMPILED** | Compiled into the Windows64 exe but never routed to at runtime (the classic `Screen` stack, dead interface headers). |
| **CONSOLE-ONLY** | Excluded from the Windows64 build entirely; only compiled on another platform. |

> **Correction to a common assumption.** All of `Common/XUI/*` is **CONSOLE-ONLY
> (Xbox 360)**. It is listed *exclusively* in `Minecraft.Client/cmake/sources/Xbox360.cmake`
> (234 XUI entries) and appears in **zero** of `Common.cmake` / `CommonSources.cmake`.
> The `#include "XUI/…"` lines and the `CXuiSceneBase` calls in `Consoles_App.cpp`
> are all inside `#ifdef _XBOX` (`Consoles_App.cpp:57-66`, `:3242-3245`); the Windows64
> `#else` branch pulls in `UI/UI.h` + `UI/UIScene_PauseMenu.h` instead. XUI does not
> compile or run on Windows64.

## 1. Entry points — where the UI is pumped

The global UI object is `ConsoleUIController ui`, a per-platform subclass of
`UIController` (`Windows64_UIController.h:5`, `class ConsoleUIController : public
UIController`). One instance is defined per platform
(`Windows64_UIController.cpp:10`) and declared `extern` where the game touches it
(`Minecraft.cpp:101`, `LocalPlayer.cpp:60`). The platform main loop drives it with
`ui.tick(); ui.render();`:

| Platform | Pump site | Notes |
|----------|-----------|-------|
| **Windows64** | `Windows64_Minecraft.cpp:1999-2000` | Main render path, after `RenderManager` frame. |
| Orbis (PS4) | `Orbis_Minecraft.cpp:1304-1305` | |
| Durango (Xbox One) | `Durango_Minecraft.cpp:834-835` | |
| PS3 | `PS3_Minecraft.cpp:1246-1247` | |
| PS Vita | `PSVita_Minecraft.cpp:906-907` | |
| **Blocking-op pumps** | `Common/Network/GameNetworkManager.cpp:2153-2154` | Keeps the UI ticking while a network op blocks (the "no infinite spinner" path). |
| Durango net | `Durango/Network/DQRNetworkManager.cpp:2840-2841`, `:2912-2913` | Same, Xbox-One-specific. |

`Windows64_Minecraft.cpp` is what runs; `Minecraft.cpp` never calls `ui.tick/render`
itself — it only calls higher-level hooks like `ui.HandleGameTick()`
(`Minecraft.cpp:1946`, feeds live player state into the HUD) and the classic
`gui->render(...)` (via `GameRenderer.cpp:1291`). The two HUD paths run side by side;
see [§3 worked traces](#3-worked-traces).

## 2. The layered graph

Each layer below is one section, with a caller→callee edge table. The overall flow:

```
platform main ──ui.tick()/ui.render()──▶ UIController
UIController ──per group──▶ UIGroup ──per layer──▶ UILayer
UILayer ──NavigateToScene switch (new UIScene_X)──▶ UIScene subclass
UIScene subclass ──IggyPlayerCallMethodRS──▶ iggy.h (RAD runtime)
game code (Consoles_App::SetAction) ──ui.NavigateToScene──▶ UILayer
```

### 2a. Controller layer — `UIController`

`UIController` (`UIController.h:17`, `: public IUIController`) owns one `UIGroup` per
player plus a shared fullscreen group. `ConsoleUIController` (Windows64) adds the
D3D11/GDraw glue on top.

| Caller (`file:line`) | Callee | What it does |
|----------------------|--------|--------------|
| `ui.tick()` @ platform main | `UIController::tick` (`UIController.cpp:559`) | Applies deferred font/navigate-home/close-all, then ticks every group. |
| `UIController::tick` | `UIGroup::tick` per group | Ticks each group's layer stack. |
| `ui.render()` @ platform main | `ConsoleUIController::render` (`Windows64_UIController.cpp:71`) | `gdraw_D3D11_SetTileOrigin` → `renderScenes()` → `NoMoreGDrawThisFrame`. |
| `ConsoleUIController::render` | `UIController::renderScenes` (`UIController.cpp:1863`) | Renders each player group (gated on `GetGameStarted`), then always the fullscreen group. |
| input dispatch | `UIController::tickInput` (`UIController.cpp:998`) → `handleInput` (`:1418`) | Routes pad+mouse to the focused group unless system/commerce UI is up. |
| `handleInput` | `UIGroup::handleInput` (`:1461`, `:1841-1845`) | Fans input to fullscreen + owning player group. |
| game code | `UIController::NavigateToScene` (`UIController.cpp:2210`) | Public scene-switch entry; forwards to the owning `UILayer`. |
| `Minecraft.cpp:1946` | `UIController::HandleGameTick` (`UIController.cpp:2949`) | Per-tick: `m_groups[i]->getHUD()->handleGameTick()` — the HUD state pump. |
| one-time init | `ConsoleUIController::init` (`Windows64_UIController.cpp:12`) → `UIController::preInit/postInit` (`UIController.cpp:356/372`) | Brings up Iggy + GDraw; registers the 3 Iggy callbacks. |

### 2b. Group / layer — `UIGroup`, `UILayer`

`UIGroup` (`UIGroup.h:11`) holds `UILayer *m_layers[eUILayer_COUNT]` and a cached
`UIScene_HUD *m_hud` (`getHUD()`, `UIGroup.h:43`). `UILayer` (`UILayer.h:8`) is one
player's slice and holds **the scene factory**.

| Caller (`file:line`) | Callee | What it does |
|----------------------|--------|--------------|
| `UIController::NavigateToScene` | `UILayer::NavigateToScene` (`UILayer.cpp:201`) | The `switch(EUIScene)` that `new`s the concrete scene. |
| `UILayer::NavigateToScene` | `new UIScene_X(iPad, initData, this)` (`UILayer.cpp:209-…`) | ~66 cases, one per scene id (e.g. `UIScene_InventoryMenu` `:224`, `UIScene_SettingsUIMenu` `:295`, `UIScene_SkinSelectMenu` `:298`, `UIScene_MainMenu` further down). |
| `UIGroup::handleInput` | `UILayer::handleInput` (`UILayer.cpp:809`) | Walks the scene stack top-down; stops once a scene `hidesLowerScenes()` (`:139`) or `blocksInput()` (`:828`). |
| scene | `UILayer::showComponent` (`UILayer.h:62`) | Raises/hides shared components (panorama, logo) independent of any scene. |

### 2c. Scene layer — `UIScene` and its ~66 subclasses

`UIScene` (`UIScene.h:46`) is the base every console screen derives from; it owns the
`Iggy *swf`, a `vector<UIControl*> m_controls`, and the movie lifecycle. The full
anatomy (movie loading, element-map macros, resolution suffix) is documented in
[UI System](/slop-docs/client/ui-system/#anatomy-of-a-uiscene) — not repeated here.

**Family pattern (verified across 10+ scenes; holds for all 66).** Every
`UIScene_*` has the same three edge classes:

- **Inbound (construction):** `UILayer::NavigateToScene`'s switch is the *only*
  constructor caller. A scene is never `new`'d directly by game code — game code
  asks by id.
- **Inbound (triggering):** `Consoles_App.cpp` (`CMinecraftApp::SetAction`,
  `Consoles_App.cpp:431`) calls `ui.NavigateToScene(iPad, eUIScene_X, …)` — e.g.
  `eUIScene_InventoryMenu` (`Consoles_App.cpp:510`), `eUIScene_CreativeMenu` (`:533`).
  Scenes also navigate to each other directly (`ui.NavigateToScene(...)` inside a
  `handlePress`, e.g. `UIScene_MainMenu.cpp:424`).
- **Outbound:** each scene calls (1) the app service layer `app.<Get/Set>…`
  (`Consoles_App`/`CMinecraftApp`) to read/write settings and game state, (2) the
  Iggy C API via `IggyPlayerCallMethodRS` to push data into its movie, and (3)
  `ui.NavigateToScene`/`navigateBack()` to move the stack.

Representative verified scenes:

| Scene (`UIScene_*`) | Inbound trigger | Key outbound edges |
|---------------------|-----------------|--------------------|
| `MainMenu` | `NavigateToScene` `eUIScene_MainMenu` | `handlePress` (`UIScene_MainMenu.cpp:328`) → `ui.NavigateToScene` (`:424`) / `app.SetGameSettings` (`:623`) / `app.StartInstallDLCProcess` (`:807`). |
| `HUD` | `getHUD()` cached in `UIGroup`; ticked via `HandleGameTick` | `SetHealth` → `IggyPlayerCallMethodRS(m_funcSetHealth)` (`UIScene_HUD.cpp:426`); `SetFood/Air/Armour/ExpBar` (`:445-475`). |
| `SettingsUIMenu` | `NavigateToScene` `eUIScene_SettingsUIMenu` (`UILayer.cpp:295`) | `m_multiList.AddNewSlider` (controller-icon slider); `app.SetGameSettings(eGameSetting_ControlType)`; `ui.ReloadSkin()`. |
| `SkinSelectMenu` | `NavigateToScene` `eUIScene_SkinSelectMenu` (`UILayer.cpp:298`) | `IggyPlayerCallMethodRS` for `SetPlayerCharacterSelected`, `SetCharacterLocked`; `app.GetSkinAdjustments`. |
| `LoadCreateJoinMenu` | `NavigateToScene` | `StorageManager.CopySaveData`; `InputManager.RequestKeyboard`; `UIControl_SaveList` / `UIControl_SpaceIndicatorBar`. |
| `InventoryMenu` (`: UIScene_AbstractContainerMenu`) | `Consoles_App.cpp:510` | `UIControl_SlotList`; container ops via `app`. |
| `PauseMenu` | `NavigateToScene` `eUIScene_PauseMenu` (`Consoles_App.cpp:3237`) | `ui.NavigateToScene` to settings/quit. |
| `Intro` | `NavigateToScene` `eUIScene_Intro` | `handleAnimationEnd` at intro frame 90 → advance to MainMenu. |
| `ControlsMenu` | `NavigateToScene` `eUIScene_ControlsMenu` (`UILayer.cpp:310`) | `IggyPlayerCallMethodRS` for `SetLineAndText`, `ClearAllKeyLines`. |
| `DeathMenu` | `NavigateToScene` | `ui.NavigateToScene`; respawn via `app`. |

**The `IUIScene_*` interface layer.** 21 `IUIScene_*.cpp` files sit alongside the
scenes. They fall into two shapes:

- **Container interfaces** (18): pure-virtual mixins the concrete container scenes
  multiply-inherit — `UIScene_AbstractContainerMenu : public UIScene, public virtual
  IUIScene_AbstractContainerMenu` (`UIScene_AbstractContainerMenu.h:10`). Some carry
  real implementation: `IUIScene_HUD.cpp` holds the game-facing state pump
  (`renderPlayerHealth` `:190` → `SetHealth(...)` `:219`), which the concrete
  `UIScene_HUD` satisfies via the Iggy setters.
- **Shared base class:** `IUIScene_StartGame` (`IUIScene_StartGame.h:6`, `: public
  UIScene`) is **not** an interface — it's an intermediate base shared by
  `UIScene_CreateWorldMenu` and `UIScene_LoadMenu` (`UIScene_LoadMenu.h:5`).
- **Dead header:** `IUIScene_CommandBlockMenu` (`IUIScene_CommandBlockMenu.h:4`) has
  **no implementer** and **no `EUIScene` enum entry** — vestigial.

### 2d. Controls & components — `UIControl_*`, `UIComponent_*`

Widgets derive `UIControl_Base : public UIControl` (`UIControl_Base.h:7`;
`UIControl.h:4`). A scene builds its controls in `mapElementsAndNames()` (the
`UI_MAP_ELEMENT` macro pushes each into `m_controls`), ticks them from
`UIScene::tick`, and the control talks to Iggy through cached fast-names.

| Caller | Callee | Edge |
|--------|--------|------|
| `UIScene::mapElementsAndNames` (macro) | `UIControl_*::setupControl` (`UIControl_Base.cpp:16`) | Binds a Flash instance name to a value path. |
| `UIScene::tick` | `UIControl_*::tick` | Per-frame control update. |
| `UIControl_*` | `IggyValueGet/Set*RS`, `IggyPlayerCallMethodRS` (`UIControl_Base.cpp:33`) | Poke/peek the movie element. |

The 30 `UIControl_*` are all **DATA-DRIVEN-LIVE** — reachable, instantiated only by
whichever scene maps them (e.g. `UIControl_SaveList` only by `LoadCreateJoinMenu`,
`UIControl_EnchantmentBook` only by `EnchantingMenu`). The 9 `UIComponent_*` are
shared overlays added to a layer via `UILayer::showComponent` independent of any one
scene (`UIComponent_Logo`, `UIComponent_Panorama`, `UIComponent_Chat`,
`UIComponent_Tooltips`, …).

### 2e. Fonts & text

| File | Role | Reached from |
|------|------|--------------|
| `UITTFFont.cpp` | Installs a TTF via `IggyFontInstallTruetypeUTF8` (`:46`) | `UIController` init. |
| `UIBitmapFont.cpp` / `UIUnicodeBitmapFont.cpp` | Bitmap + unicode-fallback glyphs | `UIController` postInit (`IggyFontSetFallbackFontUTF8`). |
| `UIFontData.cpp` | Font descriptor data | fonts above. |
| `UIString.cpp` | UI string wrapper (localised text into movies) | every scene/control that sets a label. |

Both the Iggy stack and the classic stack share the root `StringTable.cpp` /
`WstringLookup.cpp` for the actual localised strings.

### 2f. The Iggy boundary

The bottom of the whole graph is the RAD C API in
`Windows64/Iggy/include/iggy.h`. Every scene/control outbound edge terminates at
`IggyPlayerCallMethodRS` (dispatch), `IggyValueGet/Set*RS` (property poke/peek), or
`IggyPlayerDispatchEventRS` (inject input). Init/render use `IggyInit`,
`IggySetGDraw`, `IggyPlayerCreateFromMemory`, `IggyPlayerDraw`. This boundary is
documented end-to-end in [Iggy: the UI Runtime](/slop-docs/modding/iggy-overview/#the-c-api-the-game-actually-calls).

### 2g. The classic stack (parallel, mostly vestigial)

`Gui.cpp` is the one **LIVE** member of the classic `GuiComponent`-derived stack.

| Caller | Callee | Status |
|--------|--------|--------|
| `GameRenderer.cpp:1291` | `Gui::render` (`Gui.cpp:68`) | **LIVE** — immediate-mode world overlays every frame. |
| `Minecraft.cpp:2345` (tick) | `Gui::tick` | **LIVE**. |
| `Minecraft.cpp:745`, `:2088` | `AchievementPopup::render` (from `Minecraft.cpp:170` ctor) | **LIVE** — toast popups. |
| `Minecraft::setScreen` (`Minecraft.h:205`) | `Screen::init/render/tick` | **VESTIGIAL** — hooks exist (`Minecraft.cpp:583/2418`) but the console front-end routes through `ui`, not `screen`. Many re-inits are commented-out 4J TODOs. |

The ~28 root `*Screen.cpp` classes, `Button/SmallButton/SlideButton`, `EditBox`,
`ScrolledSelectionList`, and `GuiParticle(s)` compile (they're in `Common.cmake`) but
are not routed to on console. `Gui`, `Font`, and `Button` keep them referenced, which
is why they stay in the build. Full detail in
[Classic Screens & HUD](/slop-docs/client/screens/).

### 2h. The XUI remnant

`Common/XUI/*` (85 cpp / 91 h) is the Xbox-360-era reimplementation of the same
scenes and controls (`XUI_MainMenu`, `XUI_PauseMenu`, `XUI_SkinSelect`,
`XUI_Scene_Inventory`, `XUI_Ctrl_*`, `XUI_Scene_Base`/`CXuiSceneBase`, …). Per §0 it
is **CONSOLE-ONLY (Xbox 360)** — `Xbox360.cmake` only, gated by `#ifdef _XBOX` at
every use site. On Windows64 none of it compiles or runs. It is documented here for
completeness of the inventory, not because it participates in the Windows64 graph.

## 3. Worked traces

### How a click travels (menu button → app action)

1. Pad/mouse input arrives at `UIController::tickInput` (`UIController.cpp:998`) →
   `handleInput` (`:1418`).
2. `handleInput` fans to `UIGroup::handleInput` → `UILayer::handleInput`
   (`UILayer.cpp:809`), which walks the scene stack and calls
   `scene->handleInput(...)` (`:824`).
3. For navigation keys, the scene forwards them **into** the movie via
   `UIScene::sendInputToMovie` (`UIScene.cpp:1121`) →
   `IggyPlayerDispatchEventRS(swf, …)` (`:1156`). ActionScript moves focus and, on
   a press, calls **back** out.
4. The AS3 callback lands at `UIController::ExternalFunctionCallback`
   (registered via `IggySetAS3ExternalFunctionCallbackUTF16`), which recovers the
   scene (`IggyPlayerGetUserdata`) and calls `scene->externalCallback(call)`.
5. `UIScene::externalCallback` (`UIScene.cpp:1256`) string-matches
   `L"handlePress"` (`:1258`), validates arg count/types, and dispatches
   `handlePress(arg0, arg1)` (`:1276`).
6. The concrete override runs — e.g. `UIScene_MainMenu::handlePress`
   (`UIScene_MainMenu.cpp:328`) → either `ui.NavigateToScene(...)` (`:424`, back to
   step in §2b) or an app service call like `app.SetGameSettings(...)` (`:623`).

### How the HUD gets health (player damage → heart pixels)

1. Once per game tick, `Minecraft.cpp:1946` calls `ui.HandleGameTick()`.
2. `UIController::HandleGameTick` (`UIController.cpp:2949`) does
   `m_groups[i]->getHUD()->handleGameTick()` for each player group —
   `getHUD()` returns the cached `UIScene_HUD*` (`UIGroup.h:43`).
3. `UIScene_HUD::handleGameTick` (`UIScene_HUD.cpp:975`) → the shared
   `IUIScene_HUD::updateFrameTick` (`IUIScene_HUD.cpp:56`) reads live player state
   and calls `renderPlayerHealth()` (`:190`), which computes hearts/poison/wither and
   calls `SetHealth(currentHealth, oldHealth, blink, …)` (`IUIScene_HUD.cpp:219`).
4. `UIScene_HUD::SetHealth` (`UIScene_HUD.cpp:406`) packs an `IggyDataValue value[4]`
   and calls `IggyPlayerCallMethodRS(getMovie(), &result, IggyPlayerRootPath(getMovie()),
   m_funcSetHealth, 4, value)` (`UIScene_HUD.cpp:426`) — into the SWF.
5. **In parallel**, the classic `Gui::render` (`Gui.cpp:68`, from
   `GameRenderer.cpp:1291`) draws its own atlas-based heart row off `icons.png`,
   gated on `eGameSetting_DisplayHUD`. Both HUDs run at once — the division of labor
   is spelled out in
   [Classic Screens & HUD §Who draws the HUD](/slop-docs/client/screens/#who-draws-the-hud--gui-vs-the-iggy-uiscene_hud).

## 4. Coverage appendix — every UI file, classified

Every UI source file appears here exactly once with its verdict and key inbound
edge. Grouped by family. `Common/UI` = 136 cpp / 141 h; `Common/XUI` = 85 cpp / 91 h;
root classic = 28 `*Screen.cpp` + 15 primitives; 6 platform `*_UIController`.

### Core scene machinery (Common/UI) — LIVE

| File | Inbound edge |
|------|--------------|
| `UIController.cpp/.h` | `ui.tick/render` @ platform main. |
| `IUIController.h` | Base interface of `UIController`. |
| `UIGroup.cpp/.h` | Owned by `UIController` (one per player + fullscreen). |
| `UILayer.cpp/.h` | Owned by `UIGroup`; holds the scene factory. |
| `UIScene.cpp/.h` | Base of every scene; `new`'d by `UILayer::NavigateToScene`. |
| `UIControl.cpp/.h`, `UIControl_Base.cpp/.h` | Base of every widget; `setupControl` from scene maps. |
| `UIEnums.h` | `EUIGroup/EUILayer/EUIScene` id space (drives the factory switch). |
| `UI.h`, `UIStructs.h`, `UISplitScreenHelpers.h` | Aggregator + shared structs/viewport math, included by scenes. |
| `UIString.cpp/.h` | Text wrapper used by every label-setting scene/control. |

### Scenes — `UIScene_*` (66 cpp) — DATA-DRIVEN-LIVE

Inbound edge for all: a case in `UILayer::NavigateToScene` (`UILayer.cpp:201+`),
triggered by `Consoles_App::SetAction`/other scenes via `ui.NavigateToScene`.

<details>
<summary>All 66 UIScene_* files</summary>

`AbstractContainerMenu`, `AchievementsMenu`, `AnvilMenu`, `BeaconMenu`,
`BookAndQuillMenu`, `BrewingStandMenu`, `ClassicCraftingMenu`, `ConnectingProgress`,
`ContainerMenu`, `ControlsMenu`, `CraftingMenu`, `CreateWorldMenu`, `CreativeMenu`,
`Credits`, `DLCMainMenu`, `DLCOffersMenu`, `DeathMenu`, `DispenserMenu`, `EULA`,
`EnchantingMenu`, `EndPoem`, `FireworksMenu`, `FullscreenProgress`, `FurnaceMenu`,
`HUD`, `HelpAndOptionsMenu`, `HopperMenu`, `HorseInventoryMenu`, `HowToPlay`,
`HowToPlayMenu`, `InGameHostOptionsMenu`, `InGameInfoMenu`, `InGamePlayerOptionsMenu`,
`InGameSaveManagementMenu`, `Intro`, `InventoryMenu`, `JoinMenu`, `Keyboard`,
`LanguageSelector`, `LaunchMoreOptionsMenu`, `LeaderboardsMenu`, `LoadCreateJoinMenu`,
`LoadMenu`, `LoadOrJoinMenu`, `MainMenu`, `MessageBox`, `NewUpdateMessage`,
`PauseMenu`, `QuadrantSignin`, `ReinstallMenu`, `SaveMessage`, `SettingsAudioMenu`,
`SettingsGraphicsMenu`, `SettingsMenu`, `SettingsOptionsMenu`, `SettingsUIMenu`,
`SignEntryMenu`, `SkinSelectMenu`, `TeleportMenu`, `Timer`, `TradingMenu`,
`TrialExitUpsell`.

**Debug scenes** (`DebugCreateSchematic`, `DebugOptions` → class
`UIScene_DebugOptionsMenu`, `DebugOverlay`, `DebugSetCamera`) are compiled but their
`EUIScene` enum entries are gated by `_DEBUG_MENUS_ENABLED` / `_CONTENT_PACKAGE`
(`UIEnums.h:22,135-139`) — **VESTIGIAL-COMPILED** in a shipping content build.

</details>

### Scene interfaces — `IUIScene_*` (21 cpp) — DATA-DRIVEN-LIVE except as noted

<details>
<summary>All 21 IUIScene_* files</summary>

Container interface mixins (satisfied by the matching `UIScene_*ContainerMenu`):
`AbstractContainerMenu`, `AnvilMenu`, `BeaconMenu`, `BrewingMenu`,
`ClassicCraftingMenu`, `ContainerMenu`, `CraftingMenu`, `CreativeMenu`,
`DispenserMenu`, `EnchantingMenu`, `FireworksMenu`, `FurnaceMenu`, `HopperMenu`,
`HorseInventoryMenu`, `InventoryMenu`, `TradingMenu`, `PauseMenu`,
`WritingBookMenu` (→ implemented by `UIScene_BookAndQuillMenu`).

- `IUIScene_HUD` — **LIVE**: carries the HUD state pump (`updateFrameTick`,
  `renderPlayerHealth`), driven every tick via `HandleGameTick`.
- `IUIScene_StartGame` — **DATA-DRIVEN-LIVE**: intermediate *base class* (not an
  interface) for `UIScene_CreateWorldMenu` + `UIScene_LoadMenu`.
- `IUIScene_CommandBlockMenu` — **VESTIGIAL-COMPILED**: no implementer, no `EUIScene`
  entry.

</details>

### Widgets — `UIControl_*` (30 cpp) — DATA-DRIVEN-LIVE

Inbound: mapped by the owning scene's `mapElementsAndNames`; outbound: Iggy poke/peek.

<details>
<summary>All 30 UIControl_* files</summary>

`AchievementsList`, `BeaconEffectButton`, `BitmapIcon`, `Book`, `Button`,
`ButtonList`, `CheckBox`, `Cursor`, `DLCList`, `DynamicLabel`, `EnchantmentBook`,
`EnchantmentButton`, `HTMLLabel`, `Label`, `LeaderboardList`, `MinecraftHorse`,
`MinecraftPlayer`, `MultiList`, `PageFlip`, `PlayerList`, `PlayerSkinPreview`,
`Progress`, `SaveList`, `Slider`, `SlotList`, `SpaceIndicatorBar`, `TextInput`,
`TexturePackList`, `Touch`.

</details>

### Shared components — `UIComponent_*` (9 cpp) — LIVE

Added to a layer via `UILayer::showComponent`, independent of any one scene:
`Chat`, `DebugUIConsole`, `DebugUIMarketingGuide`, `Logo`, `MenuBackground`,
`Panorama`, `PressStartToPlay`, `Tooltips`, `TutorialPopup`. (The two `Debug*`
components are debug-gated.)

### Fonts / text (Common/UI) — LIVE

`UIBitmapFont`, `UIUnicodeBitmapFont`, `UITTFFont`, `UIFontData`, `UIString`
(the `.h` counterparts included with each).

### Platform UIControllers (6) — Windows64 LIVE, rest CONSOLE-ONLY

| File | Verdict |
|------|---------|
| `Windows64/Windows64_UIController.cpp/.h` | **LIVE** — defines `ConsoleUIController ui` for the PC build. |
| `Orbis/Orbis_UIController.*` | CONSOLE-ONLY (PS4). |
| `Durango/Durango_UIController.*` | CONSOLE-ONLY (Xbox One). |
| `PS3/PS3_UIController.*` | CONSOLE-ONLY (PS3). |
| `PSVita/PSVita_UIController.*` | CONSOLE-ONLY (Vita). |
| `Xbox/Xbox_UIController.*` | CONSOLE-ONLY (Xbox 360). |

### Classic root stack — LIVE / VESTIGIAL

| File(s) | Verdict / inbound |
|---------|-------------------|
| `Gui.cpp/.h` | **LIVE** — `GameRenderer.cpp:1291`. |
| `GuiComponent.cpp/.h` | **LIVE** — drawing base of `Gui` (and the vestigial `Screen`s). |
| `GuiMessage.cpp/.h` | **LIVE** — chat/message state held by `Gui`. |
| `AchievementPopup.cpp/.h` | **LIVE** — `Minecraft.cpp:170/745/2088`. |
| `Font.cpp/.h`, `StringTable.cpp/.h`, `WstringLookup.cpp/.h` | **LIVE** — shared text/localisation used by both stacks. |
| `ScreenSizeCalculator.cpp/.h` | **LIVE** — UI-size math. |
| `Screen.cpp/.h` | **VESTIGIAL** — `Minecraft::setScreen` path, not routed to on console. |
| `Button/SmallButton/SlideButton`, `EditBox`, `ScrolledSelectionList` | **VESTIGIAL** — classic widgets; live equivalents are `UIControl_*`. |
| `GuiParticle.cpp/.h`, `GuiParticles.cpp/.h` | **VESTIGIAL** — classic menu backdrop; `Screen::particles` inits to `nullptr`. Console uses `UIComponent_Panorama`. |

<details>
<summary>All 28 classic *Screen.cpp (VESTIGIAL-COMPILED)</summary>

`AbstractContainerScreen`, `AchievementScreen`, `ChatScreen`, `ConfirmScreen`,
`ConnectScreen`, `ContainerScreen`, `ControlsScreen`, `CraftingScreen`,
`CreateWorldScreen`, `DeathScreen`, `DisconnectedScreen`, `ErrorScreen`,
`FurnaceScreen`, `InBedChatScreen`, `InventoryScreen`, `JoinMultiplayerScreen`,
`NameEntryScreen`, `OptionsScreen`, `PauseScreen`, `ReceivingLevelScreen`,
`RenameWorldScreen`, `Screen`, `SelectWorldScreen`, `StatsScreen`, `TextEditScreen`,
`TitleScreen`, `TrapScreen`, `VideoSettingsScreen`.

Container screens chain under `AbstractContainerScreen : public Screen`. Live
equivalents are the `UIScene_*Menu` scenes.

</details>

### XUI remnant — `Common/XUI/*` (85 cpp / 91 h) — CONSOLE-ONLY (Xbox 360)

Never compiled on Windows64 (`Xbox360.cmake` only, `#ifdef _XBOX` at every use site).

<details>
<summary>All 85 XUI_* / control cpp files</summary>

**Scenes/menus:** `XUI_MainMenu`, `XUI_PauseMenu`, `XUI_Intro`, `XUI_Death`,
`XUI_HUD`, `XUI_Chat`, `XUI_SkinSelect`, `XUI_HelpAndOptions`, `XUI_HelpControls`,
`XUI_HelpCredits`, `XUI_HelpHowToPlay`, `XUI_HowToPlayMenu`, `XUI_Leaderboards`,
`XUI_DLCOffers`, `XUI_TrialExitUpsell`, `XUI_SocialPost`, `XUI_Reinstall`,
`XUI_Teleport`, `XUI_SignEntry`, `XUI_TextEntry`, `XUI_PartnernetPassword`,
`XUI_TransferToXboxOne`, `XUI_NewUpdateMessage`, `XUI_SaveMessage`,
`XUI_ConnectingProgress`, `XUI_FullscreenProgress`, `XUI_TutorialPopup`.

**Settings:** `XUI_SettingsAll`, `XUI_SettingsAudio`, `XUI_SettingsControl`,
`XUI_SettingsGraphics`, `XUI_SettingsOptions`, `XUI_SettingsUI`, `XUI_LoadSettings`.

**Multiplayer/create/join:** `XUI_MultiGameCreate`, `XUI_MultiGameInfo`,
`XUI_MultiGameJoinLoad`, `XUI_MultiGameLaunchMoreOptions`.

**In-game:** `XUI_InGameHostOptions`, `XUI_InGameInfo`, `XUI_InGamePlayerOptions`.

**Container scenes:** `XUI_Scene_Base` (`CXuiSceneBase`), `XUI_Scene_AbstractContainer`,
`XUI_Scene_Container`, `XUI_Scene_Inventory`, `XUI_Scene_Inventory_Creative`,
`XUI_Scene_CraftingPanel`, `XUI_Scene_Furnace`, `XUI_Scene_BrewingStand`,
`XUI_Scene_Enchant`, `XUI_Scene_Anvil`, `XUI_Scene_Trading`, `XUI_Scene_Trap`,
`XUI_Scene_Win`, `XUI_BasePlayer`.

**Controls:** `SlotProgressControl`, `XUI_Control_ComboBox`, `XUI_Ctrl_4JEdit`,
`XUI_Ctrl_4JIcon`, `XUI_Ctrl_4JList`, `XUI_Ctrl_BrewProgress`,
`XUI_Ctrl_BubblesProgress`, `XUI_Ctrl_BurnProgress`, `XUI_Ctrl_CraftIngredientSlot`,
`XUI_Ctrl_EnchantButton`, `XUI_Ctrl_EnchantmentBook`, `XUI_Ctrl_EnchantmentButtonText`,
`XUI_Ctrl_FireProgress`, `XUI_Ctrl_LoadingProgress`, `XUI_Ctrl_MinecraftPlayer`,
`XUI_Ctrl_MinecraftSkinPreview`, `XUI_Ctrl_MinecraftSlot`, `XUI_Ctrl_MobEffect`,
`XUI_Ctrl_PassThroughList`, `XUI_Ctrl_ProgressCtrlBase`, `XUI_Ctrl_SliderWrapper`,
`XUI_Ctrl_SlotItemCtrlBase`, `XUI_Ctrl_SlotList`, `XUI_Ctrl_SplashPulser`.

**Debug:** `XUI_debug`, `XUI_DebugItemEditor`, `XUI_DebugOverlay`,
`XUI_DebugSchematicCreator`, `XUI_DebugSetCamera`, `XUI_DebugTips`.

Header-only companions (`XUI_Controls.h`, `XUI_CustomMessages.h`, `XUI_Helper.h`,
`XUI_XZP_Icons.h`, `XUI_Ctrl_SlotItem*.h`, `XUI_Debug.h`) are CONSOLE-ONLY too.

</details>

## See also

- [UI System (UIScene & XUI)](/slop-docs/client/ui-system/) — scene anatomy, the
  element-map macros, and the widget inventory.
- [Classic Screens & HUD](/slop-docs/client/screens/) — the vestigial `Screen` stack
  and the live `Gui` HUD (including "who draws the HUD").
- [Iggy: the UI Runtime](/slop-docs/modding/iggy-overview/) — the C API every scene
  outbound edge terminates in.
- [Custom GUI: New SWFs & New Scenes](/slop-docs/modding/iggy-custom-gui/) — the five
  registration edits that make a scene reachable (the map's orphan
  `IUIScene_CommandBlockMenu` is the negative example).
- [Input](/slop-docs/client/input/) — how pad/mouse input reaches
  `UIController::tickInput`.
- [Settings & Options](/slop-docs/client/settings/) — the `eGameSetting` per-pad
  store the scenes read and write.

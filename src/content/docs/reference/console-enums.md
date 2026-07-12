---
title: Console Enums & Structs
description: The cross-cutting console-front-end enums and structs modders keep needing — game settings, UI scene/action ids, game commands, controls, and the profile storage layout.
---

The console layer (`Consoles_App`, `UIController`/`UILayer`, `UIScene_*`) is driven
by a handful of enums that show up everywhere: the per-pad game-setting id, the
scene id the `UILayer` factory switches on, the app-action id used to request state
transitions, the game-command id, and the per-scene control-index enums. Modders
touching the settings menus, skin select, controls, or any `UIScene_*` end up
needing these constantly.

This page tabulates the ones you actually reach for, each extracted verbatim from
its source enum. Values are the enum ordinals (0-based, sequential unless a value is
assigned inline). Entity-type ids live on their own page — see
[Entity Type Registry](/slop-docs/reference/entity-types/).

## `eGameSetting` — the per-pad settings id

The authoritative console settings store is a `GAME_SETTINGS` struct per player,
mutated through `Consoles_App::SetGameSettings(iPad, eGameSetting, ucVal)` /
`GetGameSettings(iPad, eGameSetting)`. Every settings slider, checkbox, and toggle
in the `UIScene_Settings*` scenes writes one of these. Defined in
`Common/App_enums.h:132-196`.

| Value | Constant | Notes |
|---:|---|---|
| 0 | `eGameSetting_MusicVolume` | |
| 1 | `eGameSetting_SoundFXVolume` | |
| 2 | `eGameSetting_RenderDistance` | |
| 3 | `eGameSetting_Gamma` | |
| 4 | `eGameSetting_FOV` | |
| 5 | `eGameSetting_Difficulty` | |
| 6 | `eGameSetting_Sensitivity_InGame` | |
| 7 | `eGameSetting_Sensitivity_InMenu` | |
| 8 | `eGameSetting_ViewBob` | |
| 9 | `eGameSetting_ControlScheme` | |
| 10 | `eGameSetting_ControlInvertLook` | |
| 11 | `eGameSetting_ControlSouthPaw` | |
| 12 | `eGameSetting_SplitScreenVertical` | keys splitscreen viewport layout (see `Minecraft::updatePlayerViewportAssignments`) |
| 13 | `eGameSetting_GamertagsVisible` | |
| 14 | `eGameSetting_Autosave` | interim TU1.6.6 |
| 15 | `eGameSetting_DisplaySplitscreenGamertags` | |
| 16 | `eGameSetting_Hints` | |
| 17 | `eGameSetting_InterfaceOpacity` | |
| 18 | `eGameSetting_Tooltips` | |
| 19 | `eGameSetting_Clouds` | TU5 |
| 20 | `eGameSetting_Online` | |
| 21 | `eGameSetting_InviteOnly` | |
| 22 | `eGameSetting_FriendsOfFriends` | |
| 23 | `eGameSetting_DisplayUpdateMessage` | |
| 24 | `eGameSetting_BedrockFog` | TU6 |
| 25 | `eGameSetting_DisplayHUD` | |
| 26 | `eGameSetting_DisplayHand` | |
| 27 | `eGameSetting_CustomSkinAnim` | TU7 |
| 28 | `eGameSetting_DeathMessages` | TU9 |
| 29 | `eGameSetting_UISize` | |
| 30 | `eGameSetting_UISizeSplitscreen` | |
| 31 | `eGameSetting_AnimatedCharacter` | |
| 32 | `eGameSetting_PS3_EULA_Read` | PS3-only |
| 33 | `eGameSetting_PSVita_NetworkModeAdhoc` | PSVita-only |
| 34 | `eGameSetting_VSync` | PC |
| 35 | `eGameSetting_ExclusiveFullscreen` | PC |
| 36 | `eGameSetting_ClassicCrafting` | TU25 |
| 37 | `eGameSetting_CaveSounds` | |
| 38 | `eGameSetting_MinecartSounds` | |
| 39 | `eGameSetting_ControlType` | 0–5, the controller-icon set (see below) |
| 40 | `eGameSetting_HideSaveSizeBar` | hides save-size bar in Load tab |
| 41 | `eGameSetting_SafeCam` | TU31 — "safe cam is safe sprint" |
| 42 | `eGameSetting_Swap` | |
| 43 | `eGameSetting_GameChat` | |

:::note
The ordinal is not saved directly — `eGameSetting` values map onto packed bitfields
inside `GAME_SETTINGS` (see the struct layout below). Adding a new setting means
finding storage room in that struct, not just appending to this enum.
:::

## `EUIScene` — the scene/component id

`UILayer::NavigateToScene(iPad, EUIScene scene, initData)` (`UILayer.cpp:201`)
switches on this enum to `new` the concrete `UIScene_*` for a pad. It is a mixed
enum: most values are scenes (`eUIScene_*`), a few are persistent components
(`eUIComponent_*`) that a scene can `showComponent()`. Defined in
`Common/UI/UIEnums.h:39-145`.

:::caution
The ordering here is load-bearing on Xbox 360 (comment at `UIEnums.h:118`:
"the ordering of scenes above is required for sentient reporting on xbox 360").
When adding a scene you must also update `NavigateToScene`, the `wchSceneA` name
table, and `UILayer::updateFocusState` (comments at `UIEnums.h:38`, `113-115`).
:::

| Value | Constant | Factory line (`UILayer.cpp`) |
|---:|---|---|
| 0 | `eUIScene_PartnernetPassword` | |
| 1 | `eUIScene_Intro` | |
| 2 | `eUIScene_SaveMessage` | |
| 3 | `eUIScene_MainMenu` | |
| 4 | `eUIScene_FullscreenProgress` | |
| 5 | `eUIScene_PauseMenu` | 321–322 |
| 6 | `eUIScene_Crafting2x2Menu` | 245–247 (→ `UIScene_CraftingMenu`) |
| 7 | `eUIScene_Crafting3x3Menu` | 245–247 (→ `UIScene_CraftingMenu`) |
| 8 | `eUIScene_ClassicCraftingMenu` | 249–250 |
| 9 | `eUIScene_FurnaceMenu` | 242–243 |
| 10 | `eUIScene_ContainerMenu` | 229–231 |
| 11 | `eUIScene_LargeContainerMenu` | 229–231 (splitscreen; → `UIScene_ContainerMenu`) |
| 12 | `eUIScene_InventoryMenu` | 223–224 |
| 13 | `eUIScene_DispenserMenu` | 236–237 |
| 14 | `eUIScene_DebugOptions` | 218–219 (→ `UIScene_DebugOptionsMenu`) |
| 15 | `eUIScene_DebugTips` | |
| 16 | `eUIScene_HelpAndOptionsMenu` | 272–273 |
| 17 | `eUIScene_HowToPlay` | 306–307 |
| 18 | `eUIScene_HowToPlayMenu` | 300–301 |
| 19 | `eUIScene_ControlsMenu` | 309–310 |
| 20 | `eUIScene_SettingsOptionsMenu` | 285–286 |
| 21 | `eUIScene_SettingsAudioMenu` | 288–289 |
| 22 | `eUIScene_SettingsGraphicsMenu` | 291–292 |
| 23 | `eUIScene_SettingsUIMenu` | 294–295 |
| 24 | `eUIScene_SettingsMenu` | 282–283 (root settings scene) |
| 25 | `eUIScene_LeaderboardsMenu` | |
| 26 | `eUIScene_Credits` | 315–316 |
| 27 | `eUIScene_DeathMenu` | 324–325 |
| 28 | `eUIComponent_TutorialPopup` | *(component)* |
| 29 | `eUIScene_CreateWorldMenu` | |
| 30 | `eUIScene_LoadOrJoinMenu` | |
| 31 | `eUIScene_JoinMenu` | |
| 32 | `eUIScene_SignEntryMenu` | 330–331 |
| 33 | `eUIScene_InGameInfoMenu` | 333–334 |
| 34 | `eUIScene_ConnectingProgress` | 327–328 |
| 35 | `eUIScene_DLCOffersMenu` | |
| 36 | `eUIScene_SocialPost` | |
| 37 | `eUIScene_TrialExitUpsell` | |
| 38 | `eUIScene_LoadMenu` | |
| 39 | `eUIComponent_Chat` | *(component)* |
| 40 | `eUIScene_ReinstallMenu` | 312–313 |
| 41 | `eUIScene_SkinSelectMenu` | 297–298 |
| 42 | `eUIScene_TextEntry` | |
| 43 | `eUIScene_InGameHostOptionsMenu` | |
| 44 | `eUIScene_InGamePlayerOptionsMenu` | |
| 45 | `eUIScene_CreativeMenu` | 226–227 |
| 46 | `eUIScene_LaunchMoreOptionsMenu` | |
| 47 | `eUIScene_LoadCreateJoinMenu` | |
| 48 | `eUIScene_DLCMainMenu` | |
| 49 | `eUIScene_NewUpdateMessage` | |
| 50 | `eUIScene_EnchantingMenu` | 239–240 |
| 51 | `eUIScene_BrewingStandMenu` | 233–234 |
| 52 | `eUIScene_EndPoem` | |
| 53 | `eUIScene_HUD` | |
| 54 | `eUIScene_TradingMenu` | 252–253 |
| 55 | `eUIScene_AnvilMenu` | 255–256 |
| 56 | `eUIScene_TeleportMenu` | |
| 57 | `eUIScene_HopperMenu` | 258–259 |
| 58 | `eUIScene_BeaconMenu` | 261–262 |
| 59 | `eUIScene_HorseMenu` | 264–265 (→ `UIScene_HorseInventoryMenu`) |
| 60 | `eUIScene_FireworksMenu` | 267–268 |
| 61 | `eUIScene_BookMenu` | 279–280 (→ `UIScene_BookAndQuillMenu`) |
| 62 | `eUIScene_AchievementsMenu` | 275–276 |

:::note
The ordinals above hold on non-Xbox builds. After entry 62, the enum splits on
`#ifdef`s: a `#ifndef _XBOX` block adds the components/scenes
`eUIComponent_Panorama`, `eUIComponent_Logo`, `eUIComponent_DebugUIConsole`,
`eUIComponent_DebugUIMarketingGuide`, `eUIComponent_Tooltips`,
`eUIComponent_PressStartToPlay`, `eUIComponent_MenuBackground`, then
`eUIScene_Keyboard`, `eUIScene_QuadrantSignin`, `eUIScene_MessageBox`,
`eUIScene_Timer`, `eUIScene_EULA`, `eUIScene_InGameSaveManagementMenu`,
`eUIScene_LanguageSelector` (`UIEnums.h:117-133`). Debug scenes
(`eUIScene_DebugOverlay`, `eUIScene_DebugItemEditor`, `eUIScene_DebugCreateSchematic`,
`eUIScene_DebugSetCamera`) follow behind more `#ifdef`s, and `eUIScene_COUNT`
terminates the list. `eUIComponent_Logo` is the one the UI-settings slider toggles
(see the walkthrough on [Custom UI](/slop-docs/modding/custom-ui/)).
:::

Two sibling layer/group enums live in the same file and matter when adding a scene:

**`EUIGroup`** (`UIEnums.h:4-17`) — per-viewport group. `eUIGroup_Fullscreen`,
`eUIGroup_Player1`, `eUIGroup_Player2`, `eUIGroup_Player3`, `eUIGroup_Player4`
(the player groups gated out on `__PSVITA__`), then `eUIGroup_COUNT` and a special
`eUIGroup_PAD` meaning "derive the group from the pad".

**`EUILayer`** (`UIEnums.h:20-35`) — z-order within a group; lower numbers tick
first and render last (on top). Order: `eUILayer_Debug` (gated on
`_CONTENT_PACKAGE`), `eUILayer_Tooltips`, `eUILayer_Error`, `eUILayer_Alert`,
`eUILayer_Fullscreen`, `eUILayer_Popup`, `eUILayer_Scene`, `eUILayer_HUD`,
`eUILayer_COUNT`.

## `eXuiAction` — the app-action id

`Consoles_App::SetAction(iPad, eXuiAction, param)` (`Consoles_App.h:175`) queues an
app-level state transition — save, exit world, respawn, sign-out handling, reload
texture pack, and so on. This is **not** scene navigation (that is `EUIScene` +
`NavigateToScene`); it is the coarse app state machine. It is carried as an
`XuiActionParam { int iPad; eXuiAction action; }` (`App_structs.h:139-144`).
Defined in `Common/App_enums.h:34-84`.

| Value | Constant |
|---:|---|
| 0 | `eAppAction_Idle` |
| 1 | `eAppAction_SaveGame` |
| 2 | `eAppAction_SaveGameCapturedThumbnail` |
| 3 | `eAppAction_ExitWorld` |
| 4 | `eAppAction_ExitWorldCapturedThumbnail` |
| 5 | `eAppAction_ExitWorldTrial` |
| 6 | `eAppAction_Respawn` |
| 7 | `eAppAction_WaitForRespawnComplete` |
| 8 | `eAppAction_PrimaryPlayerSignedOut` |
| 9 | `eAppAction_PrimaryPlayerSignedOutReturned` |
| 10 | `eAppAction_PrimaryPlayerSignedOutReturned_Menus` |
| 11 | `eAppAction_ExitPlayer` (secondary player) |
| 12 | `eAppAction_ExitPlayerPreLogin` |
| 13 | `eAppAction_TrialOver` |
| 14 | `eAppAction_ExitTrial` |
| 15 | `eAppAction_WaitForDimensionChangeComplete` |
| 16 | `eAppAction_SocialPost` |
| 17 | `eAppAction_SocialPostScreenshot` |
| 18 | `eAppAction_EthernetDisconnected` |
| 19 | `eAppAction_EthernetDisconnectedReturned` |
| 20 | `eAppAction_EthernetDisconnectedReturned_Menus` |
| 21 | `eAppAction_ExitAndJoinFromInvite` |
| 22 | `eAppAction_DashboardTrialJoinFromInvite` |
| 23 | `eAppAction_ExitAndJoinFromInviteConfirmed` |
| 24 | `eAppAction_JoinFromInvite` |
| 25 | `eAppAction_ChangeSessionType` |
| 26 | `eAppAction_SetDefaultOptions` |
| 27 | `eAppAction_LocalPlayerJoined` |
| 28 | `eAppAction_RemoteServerSave` |
| 29 | `eAppAction_WaitRemoteServerSaveComplete` |
| 30 | `eAppAction_FailedToJoinNoPrivileges` |
| 31 | `eAppAction_AutosaveSaveGame` |
| 32 | `eAppAction_AutosaveSaveGameCapturedThumbnail` |
| 33 | `eAppAction_ProfileReadError` |
| 34 | `eAppAction_DisplayLavaMessage` |
| 35 | `eAppAction_BanLevel` |
| 36 | `eAppAction_LevelInBanLevelList` |
| 37 | `eAppAction_ReloadTexturePack` |
| 38 | `eAppAction_ReloadFont` |
| 39 | `eAppAction_TexturePackRequired` |

:::note
`eAppAction_OptionsSaveNoSpace` is inserted here only under `#ifdef __ORBIS__`
(PS4), before `eAppAction_DebugText`. On non-Orbis builds the last two entries are
`eAppAction_TexturePackRequired` (39) and `eAppAction_DebugText` (40).
:::

A parallel server-side action enum, **`eXuiServerAction`** (`App_enums.h:115-130`),
runs on the server thread (mostly debug/host commands): `eXuiServerAction_Idle`,
`_DropItem`, `_SaveGame`, `_AutoSaveGame`, `_SpawnMob`, `_PauseServer`,
`_ToggleRain`, `_ToggleThunder`, `_ServerSettingChanged_Gamertags`,
`_ServerSettingChanged_Difficulty`, `_ExportSchematic`,
`_ServerSettingChanged_BedrockFog`, `_SetCameraLocation`.

## `EGameCommand` — the console command id

The console-command system (see [Commands](/slop-docs/world/commands/) and
[Adding Commands](/slop-docs/modding/adding-commands/)) tags each command with an
id from `EGameCommand`, defined in `Minecraft.World/CommandsEnum.h:3-15`.

| Value | Constant | Command |
|---:|---|---|
| 0 | `eGameCommand_DefaultGameMode` | `/defaultgamemode` |
| 1 | `eGameCommand_Effect` | `/effect` |
| 2 | `eGameCommand_EnchantItem` | `/enchant` |
| 3 | `eGameCommand_Experience` | `/xp` |
| 4 | `eGameCommand_GameMode` | `/gamemode` |
| 5 | `eGameCommand_Give` | `/give` |
| 6 | `eGameCommand_Kill` | `/kill` |
| 7 | `eGameCommand_Time` | `/time` |
| 8 | `eGameCommand_ToggleDownfall` | `/toggledownfall` |
| 9 | `eGameCommand_Teleport` | `/tp` |
| 10 | `eGameCommand_COUNT` | *(sentinel)* |

## `EControl` sets — per-scene control indices

Each settings/menu scene declares a private `enum EControl` (or `EControls`) that
indexes its rows/widgets. These are the ids you pass to
`UIControl_MultiList::AddNewSlider`, `SetSliderLabel`, and the `handleSliderMove` /
`handleCheckboxToggled` / `handlePress` callbacks. They are **scene-local** — the
same ordinal means different things in different scenes.

### `UIScene_ControlsMenu::EControl` (`UIScene_ControlsMenu.h:8-18`)

The controls scene (neoLegacy-updated with the SafeCam/AB-swap rows). "Buttons must
be first three controls here" (source comment).

| Value | Constant |
|---:|---|
| 0 | `eControl_Button0` |
| 1 | `eControl_Button1` |
| 2 | `eControl_Button2` |
| 3 | `eControl_InvertLook` |
| 4 | `eControl_Southpaw` |
| 5 | `eControl_SafeCam` |
| 6 | `eControl_ABSwap` |

The same scene also declares **`EPadButtons`** (`UIScene_ControlsMenu.h:20-43`) for
the controller-diagram overlay: `e_PadBack`=0, `e_PadLT`, `e_PadLB`,
`e_PadDPadLeft`, `e_PadDPadRight`, `e_PadDPadUp`, `e_PadDPadDown`, `e_PadLS_1`,
`e_PadLS_2`, `e_PadStart`, `e_PadRT`, `e_PadRB`, `e_PadY`, `e_PadB`, `e_PadA`,
`e_PadX`, `e_PadRS_1`, `e_PadRS_2`, `e_PadTouch`, `e_PadCOUNT`.

### `UIScene_SettingsUIMenu::EControls` (`UIScene_SettingsUIMenu.h:11-27`)

The UI-settings scene — the one neoLegacy widened with the controller-icon /
in-game-logo slider (`eControl_ControlType`). Values are assigned explicitly.

| Value | Constant |
|---:|---|
| 0 | `eControl_MultiList` |
| 1 | `eControl_DisplayHUD` |
| 2 | `eControl_DisplayHand` |
| 3 | `eControl_ShowTooltips` |
| 4 | `eControl_DisplayAnimatedCharacter` |
| 5 | `eControl_InGameGamertags` |
| 6 | `eControl_ShowSplitscreenGamertags` |
| 7 | `eControl_ShowClassicCrafting` |
| 8 | `eControl_HideSaveSizeBar` |
| 9 | `eControl_InterfaceOpacity` |
| 10 | `eControl_SensitivityInMenu` |
| 11 | `eControl_UISize` |
| 12 | `eControl_UISizeSplitscreen` |
| 13 | `eControl_ControlType` |

The `eControl_ControlType` slider is added at `UIScene_SettingsUIMenu.cpp:110`:

```cpp
m_multiList.AddNewSlider(TempString, eControl_ControlType, 0, 5, 1, controlTypeVal);
```

Its six positions index a static label table
(`UIScene_SettingsUIMenu.cpp:6-16`) — this is the controller-icon set the HUD
uses and, on a single player, whether `eUIComponent_Logo` shows:

| ControlType | Label id | Platform icon set |
|---:|---|---|
| 0 | `IDS_CONTROLTYPE_KBM` | Keyboard & mouse |
| 1 | `IDS_CONTROLTYPE_XBOXONE` | Xbox One |
| 2 | `IDS_CONTROLTYPE_XBOX360` | Xbox 360 |
| 3 | `IDS_CONTROLTYPE_PLAYSTATION3` | PlayStation 3 |
| 4 | `IDS_CONTROLTYPE_PLAYSTATION4` | PlayStation 4 |
| 5 | `IDS_CONTROLTYPE_WIIU` | Wii U |

On move it persists via
`app.SetGameSettings(m_iPad, eGameSetting_ControlType, value)`
(`UIScene_SettingsUIMenu.cpp:153`) and re-labels through `IDS_SLIDER_CONTROLTYPE`.
The full walkthrough is on [Custom UI](/slop-docs/modding/custom-ui/); the slider
widget itself is `Common/UI/UIControl_Slider.cpp`.

The other sliders in the same scene are `eControl_InterfaceOpacity` (0–100),
`eControl_SensitivityInMenu` (0–200), `eControl_UISize` (1–3), and
`eControl_UISizeSplitscreen` (1–3) at `UIScene_SettingsUIMenu.cpp:76/83/100/104`.

Every other `UIScene_*` follows the same pattern with its own `EControls`: e.g.
`UIScene_SettingsOptionsMenu.h:9`, `UIScene_SettingsAudioMenu.h:9`,
`UIScene_SettingsGraphicsMenu.h:9`, `UIScene_MainMenu.h:8`,
`UIScene_LoadCreateJoinMenu.h:20`. When editing a scene, read that scene's own
enum — do not assume indices carry across.

## `EControllerActions` — the input-manager action id

Not a menu enum but the low-level input action table
(`Common/App_enums.h:846-916`), split into menu actions (`ACTION_MENU_*`) and
in-game actions (`MINECRAFT_ACTION_*`). Menu actions terminate at
`ACTION_MAX_MENU = ACTION_MENU_CANCEL`; in-game actions run through
`MINECRAFT_ACTION_MAX`. The four values after `MINECRAFT_ACTION_MAX`
(`MINECRAFT_ACTION_SPAWN_CREEPER`, `_CHANGE_SKIN`, `_FLY_TOGGLE`, `_RENDER_DEBUG`,
`_SCREENSHOT`) are **not** mapped to the input manager directly — they are
synthesised from the D-pad in `Minecraft::run_middle` and read through
`LocalPlayer::ullButtonsPressed` (source comment at `App_enums.h:909-910`). See
[Input](/slop-docs/client/input/) for how these are consumed.

## Key shared structs

### `GAME_SETTINGS` — the per-player settings blob (`App_structs.h:29-119`)

The on-disk / in-memory settings record, one per pad
(`Consoles_App::GameSettingsA[XUSER_MAX_COUNT]`, `Consoles_App.h:485`). Most
`eGameSetting` values do **not** get their own field — they are packed into the
`usBitmaskValues` / `uiBitmaskValues` bitfields, whose bit assignments are
documented inline in the struct. The layout, in order:

| Field | Type | Meaning |
|---|---|---|
| `bSettingsChanged` | `bool` | dirty flag |
| `ucMusicVolume` | `unsigned char` | |
| `ucSoundFXVolume` | `unsigned char` | |
| `ucSensitivity` | `unsigned char` | |
| `ucGamma` | `unsigned char` | |
| `ucPad01` | `unsigned char` | 1 byte alignment padding |
| `usBitmaskValues` | `unsigned short` | difficulty (bits 0–1), view bob (2), map-visible (3), control scheme (4–5), invert look (6), southpaw (7), splitscreen vertical (8), splitscreen gamertags (9), hints (10), autosave freq (11–14), tooltips (15) |
| `uiDebugBitmask` | `unsigned int` | debug flags |

The remainder is a `union` of a named struct with a `unsigned char ucReservedSpace[192]`
overlay (so `sizeof(GAME_SETTINGS)` stays fixed). The named members:

| Field | Type | Meaning |
|---|---|---|
| `ucTutorialCompletion[TUTORIAL_PROFILE_STORAGE_BYTES]` | `unsigned char[]` | tutorial-task completion bits |
| `dwSelectedSkin` | `DWORD` | encodes the default skin |
| `ucMenuSensitivity` | `unsigned char` | in-menu sensitivity |
| `ucInterfaceOpacity` | `unsigned char` | |
| `ucPad02` | `unsigned char` | padding |
| `ucFov` | `unsigned char` | |
| `uiBitmaskValues` | `unsigned int` | clouds (0x1), online (0x2), invite (0x4), friends-of-friends (0x8), adhoc (0x10), update-message countdown (0x30), bedrock fog (0x40), display HUD (0x80), display hand (0x100), custom skin anim (0x200), death messages (0x400), control type (0x70000, i.e. 0–6) |
| `uiSpecialTutorialBitmask` | `unsigned int` | special tutorial-task completion |
| `dwSelectedCape` | `DWORD` | encodes the selected cape |
| `uiFavoriteSkinA[MAX_FAVORITE_SKINS]` | `unsigned int[]` | favourite-skin slots |
| `ucCurrentFavoriteSkinPos` | `unsigned char` | |
| `uiMashUpPackWorldsDisplay` | `unsigned int` | per-mash-up-world display bitmask (TU13) |
| `ucLanguage` | `unsigned char` | |
| `ucLocale` | `unsigned char` | |

:::caution
`Consoles_App::GAME_SETTINGS_PROFILE_DATA_BYTES = 204` (`Consoles_App.h:98`). The
struct **must not exceed 204 bytes** — the stats block sits directly after it in
the profile data, and a TU5-era size bump to 208 shifted every stat read by 4 bytes
(comment at `Consoles_App.h:92-98`). This is why new settings go into the spare
bits of the bitmasks rather than new fields.
:::

Access it through the accessors, never by touching the struct directly:

```cpp
// Consoles_App.h:250-252
void          SetGameSettings(int iPad, eGameSetting eVal, unsigned char ucVal);
unsigned char GetGameSettings(int iPad, eGameSetting eVal);
unsigned char GetGameSettings(eGameSetting eVal);              // primary pad
```

Related lifecycle calls: `InitGameSettings()` (`Consoles_App.h:226`),
`CheckGameSettingsChanged(bOverride5MinuteTimer, iPad)` (`:286`),
`ApplyGameSettingsChanged(iPad)` (`:287`).

### `_SkinAdjustments` — per-skin geometry adjustment (`Entity.h:35-38`)

The custom-model tweak block stored per skin. Deliberately opaque — a flat int
array — so it can be memcpy'd through the profile/DLC pipeline:

```cpp
// Minecraft.World/Entity.h:35
struct _SkinAdjustments
{
    int data[18];
};
```

`Entity` carries one (`m_skinAdjustments`, `Entity.h:82`) and exposes
`getSkinAdjustments(_SkinAdjustments*)` / `setSkinAdjustments(_SkinAdjustments*)`
(`Entity.h:517-518`). The console layer caches them per skin id in
`Consoles_App::m_SkinAdjustmentsMap` (`Consoles_App.h:71`,
`unordered_map<unsigned int, _SkinAdjustments>`) with:

```cpp
// Consoles_App.h:89-90
void GetSkinAdjustments(_SkinAdjustments* out, unsigned int skinId);
void SetSkinAdjustments(unsigned int skinId, const _SkinAdjustments& adj);
```

DLC skins carry their own copy: `DLCSkinFile::m_skinAdjustments` +
`DLCSkinFile::getSkinAdjustments(_SkinAdjustments*)`
(`Common/DLC/DLCSkinFile.h:17,22`). This is what the TU36-parity skin-select menu
(`UIScene_SkinSelectMenu`) reads/writes when you nudge a skin's proportions; see the
skin geometry helpers `SkinBox.h` / `SkinOffset.h` and `UIControl_PlayerSkinPreview`.

### `XuiActionParam` (`App_structs.h:139-144`)

The payload for a queued `eXuiAction`:

```cpp
typedef struct { int iPad; eXuiAction action; } XuiActionParam;
```

### `SceneStackPair` (`App_structs.h:232`)

The per-layer scene stack entry: `typedef pair<EUIScene, HXUIOBJ> SceneStackPair;`
— pairs a scene id with its live Iggy object handle.

## Where these are used

- **Settings pipeline** — `eGameSetting` + `GAME_SETTINGS` via
  `SetGameSettings`/`GetGameSettings`; the classic-port mirror is
  `Options`/`Settings`. See [Settings](/slop-docs/client/settings/).
- **Scene flow** — `EUIScene` through `UILayer::NavigateToScene`; app state through
  `eXuiAction` + `Consoles_App::SetAction`. See
  [UI System](/slop-docs/client/ui-system/) and
  [Custom UI](/slop-docs/modding/custom-ui/).
- **Commands** — `EGameCommand`. See [Commands](/slop-docs/world/commands/).
- **Entity types** — `eINSTANCEOF`, on its own page:
  [Entity Type Registry](/slop-docs/reference/entity-types/).

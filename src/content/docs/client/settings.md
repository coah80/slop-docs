---
title: Settings & Options
description: The two settings systems — the authoritative per-pad eGameSetting store in CMinecraftApp (Set/GetGameSettings + ActionGameSettings), and the classic-port Options/Settings classes it mirrors into.
---

Like the [UI](/slop-docs/client/overview/#read-this-first-two-gui-stacks), settings
exist in two layers. The **authoritative** store is a per-pad `GAME_SETTINGS`
array owned by `CMinecraftApp` (global `app`), addressed by the `eGameSetting`
enum through `Get/SetGameSettings`. The classic Java-port `Options` object
(`Minecraft::options`) is a **mirror** kept in sync from that store so the ported
engine code can read familiar fields like `options->fancyGraphics`. The
`UIScene_Settings*` menus read and write the `eGameSetting` store; nothing writes
`Options` directly on console.

Files: `Common/App_enums.h` (`eGameSetting`), `Common/App_structs.h`
(`GAME_SETTINGS`), `Common/Consoles_App.h`/`.cpp` (`CMinecraftApp`), `Options.h`/`.cpp`,
`Settings.h`/`.cpp`.

## The authoritative store: eGameSetting per pad

`CMinecraftApp` holds one settings struct per player
(`Consoles_App.h:485`):

```cpp
GAME_SETTINGS *GameSettingsA[XUSER_MAX_COUNT];
```

Everything is keyed by pad index (`iPad`), and the API takes `unsigned char`
values (`Consoles_App.h:250-252`):

```cpp
void          SetGameSettings(int iPad, eGameSetting eVal, unsigned char ucVal);
unsigned char GetGameSettings(int iPad, eGameSetting eVal);
unsigned char GetGameSettings(eGameSetting eVal);   // shorthand for the primary pad
```

`GAME_SETTINGS` (`App_structs.h`) is a bit-packed union — most flags live in
`uiBitmaskValues` / `usBitmaskValues`, while scalar values have dedicated bytes
(`ucMusicVolume`, `ucSoundFXVolume`, `ucGamma`, `ucFov`, `ucSensitivity`,
`ucMenuSensitivity`, `ucInterfaceOpacity`, …). `Set/GetGameSettings` are big
switch statements that pack/unpack the right field per `eGameSetting`. Two
examples from the source:

```cpp
// scalar byte — Consoles_App.cpp:2079 (Gamma)
GameSettingsA[iPad]->ucGamma = ucVal;

// bitfield slice — Consoles_App.cpp:2065 (RenderDistance, 8 bits at <<16)
unsigned int val = ucVal & 0xFF;
GameSettingsA[iPad]->uiBitmaskValues &= ~(0xFF << 16);
GameSettingsA[iPad]->uiBitmaskValues |= val << 16;
```

`GetGameSettings` returns `0` for an out-of-range pad or a null struct
(`Consoles_App.cpp:2656`), and a couple of getters clamp: render distance falls
back to `16` when unset (`Consoles_App.cpp:2672`).

### The eGameSetting enum

`enum eGameSetting` (`App_enums.h:132`) is grouped by the Title Update that
introduced each value — a useful map of how the settings surface grew over LCE's
lifetime, and neoLegacy carries the whole range through TU31:

| Setting | Notes |
|---------|-------|
| `eGameSetting_MusicVolume` (0), `_SoundFXVolume` | 0–100 |
| `_RenderDistance` | packed in `uiBitmaskValues >> 16` |
| `_Gamma`, `_FOV` | 0–100 scalars |
| `_Difficulty` | `usBitmaskValues & 0x0003` |
| `_Sensitivity_InGame`, `_Sensitivity_InMenu` | 0–100 |
| `_ViewBob`, `_ControlScheme`, `_ControlInvertLook`, `_ControlSouthPaw` | control flags |
| `_SplitScreenVertical`, `_GamertagsVisible` | splitscreen |
| `_Autosave`, `_DisplaySplitscreenGamertags`, `_Hints`, `_InterfaceOpacity`, `_Tooltips` | interim TU1.6.6 |
| `_Clouds`, `_Online`, `_InviteOnly`, `_FriendsOfFriends`, `_DisplayUpdateMessage` | TU5 |
| `_BedrockFog`, `_DisplayHUD`, `_DisplayHand` | TU6 |
| `_CustomSkinAnim` | TU7 |
| `_DeathMessages`, `_UISize`, `_UISizeSplitscreen`, `_AnimatedCharacter` | TU9 |
| `_PS3_EULA_Read` | PS3 |
| `_PSVita_NetworkModeAdhoc` | PSVita |
| `_VSync`, `_ExclusiveFullscreen` | PC |
| `_ClassicCrafting`, `_CaveSounds`, `_MinecartSounds`, `_ControlType`, `_HideSaveSizeBar` | TU25 |
| `_SafeCam`, `_Swap`, `_GameChat` | TU31 |

`eGameSetting_ControlType` is the neoLegacy controller-icon-set selector (0–5),
surfaced by the [UI settings slider](#the-controltype-slider-neolegacy).

## The write path: Set → Action → mirror → Apply

Writing a setting is more than a store. `SetGameSettings` (`Consoles_App.cpp:2037`)
does three things per case:

1. Writes the new value into `GameSettingsA[iPad]`.
2. If `iPad` is the primary pad, calls `ActionGameSettings(iPad, eVal)` to apply
   it live.
3. Sets `GameSettingsA[iPad]->bSettingsChanged = true` so the change can be
   persisted.

`ActionGameSettings(int iPad, eGameSetting eVal)` (`Consoles_App.cpp:1521`) is the
**bridge into the classic `Options` mirror** — for the primary pad it pushes the
value into `Minecraft::options`:

```cpp
// Consoles_App.cpp:1529 — MusicVolume
pMinecraft->options->set(Options::Option::MUSIC,
                         static_cast<float>(GameSettingsA[iPad]->ucMusicVolume)/100.0f);
// Consoles_App.cpp:1565 — FOV
pMinecraft->options->set(Options::Option::FOV, (float)GameSettingsA[iPad]->ucFov/100.0f);
// Consoles_App.cpp:1571 — Difficulty
pMinecraft->options->toggle(Options::Option::DIFFICULTY, GameSettingsA[iPad]->usBitmaskValues & 0x03);
```

So the flow for any menu change is:

> `UIScene_Settings*` → `app.SetGameSettings(iPad, eGameSetting_X, value)` →
> (primary pad) `ActionGameSettings` → `Minecraft::options->set(...)` /
> engine state.

Supporting calls (`Consoles_App.h:226-289`):

| Method | Role |
|--------|------|
| `InitGameSettings()` | allocate & default every pad's `GAME_SETTINGS` |
| `ActionGameSettings(iPad, eVal)` | apply one setting live (mirror into `options`) |
| `CheckGameSettingsChanged(...)` | detect the `bSettingsChanged` flag (rate-limited by a 5-minute timer) |
| `ApplyGameSettingsChanged(iPad)` | commit / persist changed settings |
| `ClearGameSettingsChangedFlag(iPad)` | reset the dirty flag |
| `GetGameSettingsDebugMask` / `SetGameSettingsDebugMask` | per-pad debug flags (`uiDebugBitmask`) |

### Defaults

`InitGameSettings()` seeds each pad with `SetGameSettings(iPad, ...)` calls
(`Consoles_App.cpp:976+`). A sample of the shipped defaults:

| Setting | Default |
|---------|---------|
| `MusicVolume` / `SoundFXVolume` | `DEFAULT_VOLUME_LEVEL` |
| `RenderDistance` | `16` |
| `Gamma` | `50` |
| `FOV` | `0` |
| `Difficulty` | `1` |
| `Sensitivity_InGame` / `Sensitivity_InMenu` | `100` |
| `ViewBob`, `Clouds`, `Online`, `GamertagsVisible`, `Hints`, `Tooltips` | `1` |
| `InterfaceOpacity` | `80` |
| `Autosave` | `2` |
| `SplitScreenVertical`, `InviteOnly` | `0` |

`ControlInvertLook` / `ControlSouthPaw` are seeded from the platform profile
(`pSettings->iYAxisInversion`, `pSettings->bSwapSticks`).

## Worked trace: one slider move, drag to disk

This follows a single music-volume slider drag from the on-screen control to the
sound engine and, eventually, to persisted profile bytes — citing every hop. The
key structural fact: a slider **move** is applied live but staged; the **write to
disk** is a separate, rate-limited step gated on a dirty flag.

**1 — Drag (scene → pending).** As the user drags the Music slider,
`UIScene_SettingsAudioMenu::handleSliderMove(sliderId, currentValue)`
(`UIScene_SettingsAudioMenu.cpp:155`) plays the scroll SFX and, for
`eControl_Music`/`eControl_Sound`, only **stages** the value — it does not write
the store yet (`:164-169`):

```cpp
case eControl_Music:
case eControl_Sound:
    m_bPendingSliderUpdate = true;
    m_iPendingSliderId     = sliderIdInt;
    m_iPendingSliderValue  = value;
    break;
```

**2 — Commit on tick (`SetGameSettings`).** The scene's next `tick()` drains the
pending value, updates the slider label, and writes the authoritative store
(`UIScene_SettingsAudioMenu.cpp:79-97`):

```cpp
case eControl_Music:
    app.SetGameSettings(m_iPad, eGameSetting_MusicVolume, m_iPendingSliderValue);   // :88
    swprintf(TempString, 256, L"%ls: %d%%", app.GetString(IDS_SLIDER_MUSIC), m_iPendingSliderValue);
    m_multiList.SetSliderLabel(eControl_Music, TempString);
```

**3 — Store + live-apply + dirty (`SetGameSettings` → `ActionGameSettings`).**
`SetGameSettings` (`Consoles_App.cpp:2037`) writes the byte into
`GameSettingsA[iPad]->ucMusicVolume`, calls `ActionGameSettings(iPad,
eGameSetting_MusicVolume)` for the primary pad, and sets
`bSettingsChanged = true`. `ActionGameSettings` (`:1521`) is the bridge into the
classic `Options` mirror (`:1526-1530`):

```cpp
case eGameSetting_MusicVolume:
    if(iPad == ProfileManager.GetPrimaryPad())
        pMinecraft->options->set(Options::Option::MUSIC,
            static_cast<float>(GameSettingsA[iPad]->ucMusicVolume)/100.0f);
```

**4 — Reach the sound engine (`Options::set`).** `Options::set` special-cases
`MUSIC` and pushes it straight into the engine (`Options.cpp:210-218`):

```cpp
if (item == Option::MUSIC) {
    music = fVal;
    …
    minecraft->soundEngine->updateMusicVolume(fVal);   // :218
}
```

`SoundEngine::updateMusicVolume` stores `m_MasterMusicVolume`, which the music tick
uses as its gain multiplier — so the drag is audible immediately, before anything
touches disk.

**5 — Persist (`CheckGameSettingsChanged` → profile).** Nothing wrote disk yet;
`bSettingsChanged` is still set. Two triggers flush it:

- **Per-frame, rate-limited.** The platform loop calls
  `app.CheckGameSettingsChanged()` every frame (`Windows64_Minecraft.cpp:2236`),
  which honours the 5-minute timer.
- **Forced on scene exit.** Leaving the settings menu forces an immediate flush —
  `app.CheckGameSettingsChanged(true, iPad)` with `bOverride5MinuteTimer = true`
  (`UIScene_SettingsMenu.cpp:99/162`).

`CheckGameSettingsChanged` (`Consoles_App.cpp:2814`) checks the flag per pad and,
if set, writes the profile and clears it (`:2822-2833`):

```cpp
if(GameSettingsA[i]->bSettingsChanged) {
    ProfileManager.WriteToProfile(i, true, bOverride5MinuteTimer);   // :2827
#ifdef _WINDOWS64
    Win64_SaveSettings(GameSettingsA[i]);                             // :2829
#endif
    GameSettingsA[i]->bSettingsChanged = false;                      // :2832
}
```

On console the write goes through `StorageManager.WriteToProfile` instead
(`:2825/2841`, PS3/Orbis/Durango/Vita). `ApplyGameSettingsChanged(iPad)`
(`:1475`) is the mirror-image of step 3 for **all** settings at once — it re-runs
`ActionGameSettings` for every `eGameSetting` (`:1477-1518`), used at boot and when
the `Options` mirror must be rebuilt from the store.

## The classic mirror: Options and Settings

`class Options` (`Options.h`, `Minecraft::options`) is the ported Java options
object. On console it is **downstream** of the `eGameSetting` store — it is
written by `ActionGameSettings`, not by the menus — but the ported engine reads
it directly, so it is genuinely live. Examples in the frame loop:

- `TileRenderer::fancy = options->fancyGraphics;` (`Minecraft.cpp:1974`)
- static queries `Minecraft::useFancyGraphics()`, `useAmbientOcclusion()`,
  `renderNames()`, `renderDebug()` (`Minecraft.h:297-300`) read `options`.

`Options` also carries the classic `float music/sound/sensitivity`, `int
viewDistance`, `bool bobView/fancyGraphics/ambientOcclusion`, `int guiScale/fov`,
and — for source parity only — the 14-entry `KeyMapping *keyMappings[]` table
(`Options.h:74-90`). Those key bindings are **not** the console input path; see
[Input](/slop-docs/client/input/#the-vestigial-classic-classes-input-and-keymapping).
`Options::Option` is a small descriptor class (`options[17]` static entries:
`MUSIC`, `SOUND`, `SENSITIVITY`, `FOV`, `GAMMA`, `DIFFICULTY`, `GRAPHICS`,
`AMBIENT_OCCLUSION`, `GUI_SCALE`, …) used by `set()`/`toggle()`.

`class Settings` (`Settings.h`) is the older Java `.properties`-file wrapper —
an `unordered_map<wstring,wstring>` with `getString/getInt/getBoolean` and
`saveProperties()`. It is the properties-file persistence sibling; on console the
authoritative persistence is the `GAME_SETTINGS` blob, not a properties file.

## The ControlType slider (neoLegacy)

The clearest example of the full pipeline is the neoLegacy controller-icon-set
slider in the UI settings menu (`Common/UI/UIScene_SettingsUIMenu.cpp`). Its
control ids are the scene-local `EControls` enum (`UIScene_SettingsUIMenu.h:11`),
where `eControl_ControlType = 13`. The slider is added only outside a game
(`bInGame == false`), spanning `0..5`:

```cpp
// UIScene_SettingsUIMenu.cpp:108
int controlTypeVal = app.GetGameSettings(m_iPad, eGameSetting_ControlType);
swprintf(TempString, 256, L"%ls: %ls",
         app.GetString(IDS_SLIDER_CONTROLTYPE),
         app.GetString(m_iControlTypeSettingA[controlTypeVal]));
m_multiList.AddNewSlider(TempString, eControl_ControlType, 0, 5, 1, controlTypeVal);
```

The 6 icon sets are string ids in `m_iControlTypeSettingA[6]`
(`UIScene_SettingsUIMenu.cpp:6`): **KBM, Xbox One, Xbox 360, PS3, PS4, Wii U**
(`IDS_CONTROLTYPE_KBM`, `_XBOXONE`, `_XBOX360`, `_PLAYSTATION3`, `_PLAYSTATION4`,
`_WIIU`). On move, the scene writes the store and re-labels the slider
(`UIScene_SettingsUIMenu.cpp:152`):

```cpp
case eControl_ControlType:
    app.SetGameSettings(m_iPad, eGameSetting_ControlType, m_iPendingSliderValue);
    m_bControlTypeChanged = true;
    swprintf(TempString, 256, L"%ls: %ls",
             app.GetString(IDS_SLIDER_CONTROLTYPE),
             app.GetString(m_iControlTypeSettingA[m_iPendingSliderValue]));
    m_multiList.SetSliderLabel(eControl_ControlType, TempString);
    break;
```

The same scene toggles the in-game logo (`eUIComponent_Logo`) via
`m_parentLayer->showComponent(m_iPad, eUIComponent_Logo, ...)`
(`UIScene_SettingsUIMenu.cpp:176/182`), and hosts sibling sliders
`eControl_InterfaceOpacity`, `eControl_SensitivityInMenu`, `eControl_UISize`
(1–3) and `eControl_UISizeSplitscreen` (1–3). Note the `UISize` sliders store
`value - 1`, so the display range 1–3 maps to a stored 0–2
(`UIScene_SettingsUIMenu.cpp:141`).

## See also

- [Overview](/slop-docs/client/overview/) — `CMinecraftApp`/`app` as the driver above `Minecraft`.
- [Input](/slop-docs/client/input/) — the look/menu paths that read `eGameSetting` values.

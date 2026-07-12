---
title: Xbox 360 & Xbox One
description: The Xbox/ (Xbox 360, XDK) and Durango/ (Xbox One) platform trees — what code exists, entry points, XUI heritage, and why neither currently builds.
---

neoLegacy carries the original 4J Studios Xbox source for both console generations under
`Minecraft.Client/Xbox/` (Xbox 360, XDK) and `Minecraft.Client/Durango/` (Xbox One, XDK-Durango).
Both trees are **catalogued but not buildable** in this repo: only the `Windows64` platform has a
working build path (see [Windows / PC](/slop-docs/platforms/windows64/) and
[Building neoLegacy](/slop-docs/overview/building/) if present). The Xbox code is best treated as
historical / reference source — it is where much of the shared client scaffolding originated.

## At a glance

| | Xbox 360 | Xbox One (Durango) |
|---|---|---|
| Source dir | `Minecraft.Client/Xbox/` | `Minecraft.Client/Durango/` |
| CMake preset | `xbox360` | `durango` |
| `PLATFORM_DEFINES` | `_XBOX` | `_DURANGO;_XBOX_ONE` |
| `PLATFORM_NAME` | `Xbox` | `Durango` |
| `IGGY_LIBS` | *(none set)* | `iggy_durango.lib;iggyperfmon_durango.lib` |
| Source manifest | `cmake/sources/Xbox360.cmake` (511 lines) | `cmake/sources/Durango.cmake` (503 lines) |
| Graphics API | Direct3D 9 (Xbox 360 D3D9) | Direct3D 11 (from a `CoreWindow`) |
| App model | classic XDK `int main()` | WinRT `IFrameworkView` |
| UI framework | XUI (`Common/XUI/`) | XUI (`Common/XUI/`) |
| Builds today? | **No** — empty toolchain, no platform-lib CMake | **No** — empty toolchain, no platform-lib CMake |

Files: `CMakePresets.json`, `Minecraft.Client/CMakeLists.txt:1-30`.

## Why neither builds

The presets exist and point at toolchain files, but every console toolchain is a **0-byte stub**:

```
$ ls -la cmake/toolchains/
-rw-r--r--  0  durango.cmake
-rw-r--r--  0  orbis.cmake
-rw-r--r--  0  ps3.cmake
-rw-r--r--  0  psvita.cmake
-rw-r--r--  0  xbox360.cmake
```

A CMake configure with `--preset durango` or `--preset xbox360` therefore cannot succeed. Even if a
toolchain were supplied, the top-level `CMakeLists.txt:146` does:

```cmake
add_subdirectory("Minecraft.Client/${PLATFORM_NAME}/4JLibs")
```

and **only `Windows64/4JLibs/CMakeLists.txt` exists** — `Xbox/4JLibs/` and `Durango/4JLibs/` ship
`Media/`, `inc/`, and `libs/` but **no `CMakeLists.txt`**, so the platform-library subtree fails to
configure. Server targets are additionally gated to Windows only (`CMakeLists.txt:160-163`,
`if(PLATFORM_NAME STREQUAL "Windows64")`). `COMPILE.md` documents only Windows x64 (MSVC / VS2022)
and a Linux→Windows clang-cl cross-compile; no Xbox build path is documented.

The C++ source is still *listed* for the build. `Minecraft.Client/CMakeLists.txt:14-23` selects the
per-platform file manifest with generator expressions:

```cmake
$<$<STREQUAL:${PLATFORM_NAME},Durango>:${MINECRAFT_CLIENT_DURANGO}>
...
$<$<STREQUAL:${PLATFORM_NAME},Xbox>:${MINECRAFT_CLIENT_XBOX360}>
```

So the Xbox trees are catalogued (fully enumerated in the `.cmake` manifests) but dark: no toolchain,
no `4JLibs` CMake, not covered by `COMPILE.md`.

## Xbox 360 — `Minecraft.Client/Xbox/`

Original 4J Studios 360 title code against the Xbox 360 XDK. It pulls XDM (`<xbdm.h>`), the Xbox LIVE
SPA (`GameConfig/Minecraft.spa.h`), Direct3D 9 (`IDirect3DDevice9`), and Kinect NUI (`<NuiApi.h>`).

### Entry point — `Xbox_Minecraft.cpp` (42 KB)

The application entry is a classic XDK `int __cdecl main()` at **line 311**:

```cpp
// Name: main()
// Desc: The application's entry point
int __cdecl main()
{
    IDirect3DDevice9 *pDevice;
    D3DPRESENT_PARAMETERS d3dpp;
    ...
    app.StoreLaunchData();
    // Declare an instance of the XUI framework.
```

It brings up a D3D9 device, initialises the XUI framework, then calls the shared
`Minecraft::main()` (line 522) to start the game engine. The header block wires in the shared client
and world code plus the XUI scene container (`../Common/XUI/XUI_Scene_Container.h`).

The title theme blob and TCR save-size limits are hardcoded near the top of the file:

```cpp
#define THEME_NAME      "584111F70AAAAAAA"
#define THEME_FILESIZE  2797568
#define FIFTY_ONE_MB    (1000000*51) // Maximum TCR space required for a save
```

### App subclass & UI

- `Xbox_App.{cpp,h}` (94 KB `.cpp`) — the 360 `CConsoleMinecraftApp` specialisation; global instance
  `app`. Includes the XUI scene headers directly (`XUI_Intro.h`, `XUI_MainMenu.h`,
  `XUI_HelpAndOptions.h`, `XUI_TextEntry.h`, …).
- `Xbox_UIController.{cpp,h}` — platform UI controller glue.
- `Xbox_BuildVer.h` — build-version header (`VER_PRODUCTBUILD 232`, `VER_FILEVERSION_STRING "1.2"`).
  The same `Xbox_BuildVer.h` filename is reused across the Sony ports as shared scaffolding.

Files: `Minecraft.Client/Xbox/Xbox_Minecraft.cpp`, `Xbox_App.cpp`, `Xbox_UIController.cpp`,
`Xbox_BuildVer.h`, `Resource.h`, `targetver.h`, `MinecraftWindows.rc`, `xex.xml`, `Minecraftxex.xml`.

### Online / services (real XBL code)

| Area | Files | Notes |
|---|---|---|
| Networking | `Network/PlatformNetworkManagerXbox.{cpp,h}`, `Network/NetworkPlayerXbox.{cpp,h}`, `Network/extra.h` | Xbox LIVE secure-device-association session play |
| Social | `Social/SocialManager.{cpp,h}` | Real `.cpp` here — XDK Facebook social-post (`xsocialpost.h`) |
| Leaderboards | `Leaderboards/XboxLeaderboardManager.{cpp,h}` | Real XBL leaderboards |
| Telemetry | `Sentient/` (`Include/`, `Libs/`) | 4J "Sentient" telemetry |
| Voice | `kinect/` (+ `kinect/speech/`) | Kinect voice / speech |

Achievements/stats are defined by the SPA + gameconfig rather than a dedicated manager
(`GameConfig/`). `Cheats/` holds title-manifest / anti-cheat blobs (`E0006C5B8D782D00/`, `TMS/`).

### Middleware & packaging subtrees

`4JLibs/` (with `Media/`, `inc/`, `libs/` — **no CMakeLists**), `Audio/`, `Font/`, `XML/`,
`loc/` (localization: `lcl/`, `blank_edbs/`), `GameConfig/` (+ `AvatarPackages/`),
`Title Update/` (`Minecraft_12.03.30.0062/`, `TitleUpdate/`), `TMSFiles/`, `ContentPackageBuild/`,
`ReleaseBuild/`, `SubmissionBuild/`, `Docs/`. These are the 360 content-package / submission build
scaffolding preserved from the original tree.

## Xbox One — `Minecraft.Client/Durango/`

XDK-Durango code. Unlike the 360, the Xbox One version is a **WinRT app** (D3D11 from a `CoreWindow`)
but still drives the same XUI menu framework.

### Entry point — `Durango_Minecraft.cpp` (46 KB) + `ApplicationView`

The WinRT app view lives in `ApplicationView.{cpp,h}`. `ApplicationView.h` declares an
`IFrameworkView` implementing the standard WinRT lifecycle:

```cpp
ref class ApplicationView sealed : public Windows::ApplicationModel::Core::IFrameworkView
{
public:
    virtual void Initialize(Windows::ApplicationModel::Core::CoreApplicationView^ applicationView);
    virtual void SetWindow(Windows::UI::Core::CoreWindow^ window);
    virtual void Load(Platform::String^ entryPoint);
    virtual void Run();
    virtual void Uninitialize();
    ...
```

Device bring-up in `Durango_Minecraft.cpp` uses `InitializeDurango(CoreWindow^)` (line 310) and
`CreateSwapChainForCoreWindow` (line 425). The main loop drives XUI directly
(`XuiTimersRun()` at lines 727 / 951, `XuiPNGTextureLoader` at line 512) and, like the 360, calls the
shared `Minecraft::main()` (line 631) after registering storage / profile / sign-in callbacks.

Files: `Durango_Minecraft.cpp`, `ApplicationView.cpp`, `Durango_App.{cpp,h}`,
`XboxGameMode.{cpp,h}`, `Xbox_Utils.cpp`, `Durango_UIController.{cpp,h}`, `PresenceIds.h`,
`Xbox_Awards_enum.h`, `Xbox_Debug_enum.h`, `Xbox_BuildVer.h`, `Minecraft_Macros.h`,
`Autogenerated.appxmanifest`, `manifest.xml`.

### Online / services — the richest console net stack

The Xbox One networking layer is the most fully fleshed-out of any console in the tree:

| Area | Files |
|---|---|
| Session / net manager | `Network/DQRNetworkManager.{cpp,h}` + partials `DQRNetworkManager_FriendSessions.cpp`, `_Log.cpp`, `_SendReceive.cpp`, `_XRNSEvent.cpp` |
| Players / platform mgr | `Network/DQRNetworkPlayer.{cpp,h}`, `NetworkPlayerDurango.{cpp,h}`, `PlatformNetworkManagerDurango.{cpp,h}` |
| Party / chat | `Network/PartyController.{cpp,h}`, `ChatIntegrationLayer.{cpp,h}` |
| Encoding | `Network/base64.{cpp,h}` |
| Realtime session (prebuilt) | `Network/Windows.Xbox.Networking.RealtimeSession.dll` (+ `.winmd`, `.pdb`) |
| Achievements | `Achievements/AchievementManager.{cpp,h}` (real XB1 achievements) |
| Leaderboards / stats | `Leaderboards/DurangoLeaderboardManager.{cpp,h}`, `DurangoStatsDebugger.{cpp,h}`, `GameProgress.{cpp,h}` |
| Social | `Social/SocialManager.h` (header only on Durango) |
| Telemetry | `Sentient/` |

Because the XBL realtime-session middleware ships only as a prebuilt `.dll`/`.winmd` (no source, no
CMake), this stack cannot be recompiled here even with a Durango toolchain.

### Middleware & packaging subtrees

`Iggy/` (`gdraw/`, `include/`, `lib/`) — Scaleform-Iggy Flash/`.gfx` UI middleware (`IGGY_LIBS` above),
`Miles/` (RAD Miles Sound System — `include/` + `lib/`), `Sound/`, `4JLibs/` (**no CMakeLists**),
`CU/` (content update), `DLCImages/`, `DurangoExtras/`, `Layout/` (+ `Layout/Image/`),
`ServiceConfig/` (+ `HelpDocument/`, `loc/`), `XML/`. Store art (`SplashScreen.png`, `WideLogo.png`,
`StoreLogo.png`, `SmallLogo.png`) and the `.appxmanifest` complete the UWP package layout.

## Shared XUI heritage

Both Xbox trees — and the Sony ports — render their menus through the same platform-agnostic XUI
framework under `Minecraft.Client/Common/XUI/` (100+ files). This is the 360-era Xbox UI (XUI)
scene/control system that 4J carried forward to every port: main menu, HUD, container scenes
(inventory, furnace, anvil, enchant, brewing), settings, leaderboards, and debug overlays. Examples:
`XUI_MainMenu.{cpp,h}`, `XUI_HUD.{cpp,h}`, `XUI_Scene_Container.{cpp,h}`, `XUI_Scene_Inventory.{cpp,h}`,
`XUI_Leaderboards.{cpp,h}`, `XUI_TransferToXboxOne.{cpp,h}`.

On the buildable Windows64 platform the equivalent role is filled by the open D3D11 renderer plus the
closed Iggy library; the XUI code remains shared scaffolding. See
[Windows / PC](/slop-docs/platforms/windows64/) for the live path.

## Cross-platform naming gotcha

The `Xbox_*` filename prefix is **not** Xbox-exclusive. `Xbox_BuildVer.h`, `Xbox_Minecraft.cpp`,
`Xbox_Utils.cpp`, `Xbox_Awards_enum.h`, and `Xbox_Debug_enum.h` also appear inside the PS3, Orbis, and
PSVita trees as legacy shared 360 scaffolding reused across ports — see
[PS3, PS4 & PS Vita](/slop-docs/platforms/playstation/). Don't assume an `Xbox_` prefix means the file
is Xbox-only.

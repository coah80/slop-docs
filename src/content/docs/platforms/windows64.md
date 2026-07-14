---
title: Windows 64
description: The only platform neoLegacy actually builds — its entry point, D3D11 renderer, input, storage, networking, and the stubs left behind from the console lineage.
---

`Minecraft.Client/Windows64/` is the **primary and only functional target**. It builds natively with
MSVC (Visual Studio 2022) or cross-compiles from Linux via clang-cl. The preset sets
`PLATFORM_DEFINES=_WINDOWS64` and
`IGGY_LIBS=iggy_w64.lib;iggyperfmon_w64.lib;iggyexpruntime_w64.lib`
(`CMakePresets.json:11-19`). See [Platform Overview](/slop-docs/platforms/overview/) for why the
console presets don't build.

Much of the PC-specific rewrite — the D3D11 renderer, profile, and storage libs — is authored by
**Patoke** and carries an MIT header (`Copyright (c) 2026 Patoke`). This is the neoLegacy
reimplementation of 4J Studios' closed middleware; the Iggy UI lib and one closed 4J `Renderer`
object remain binary dependencies.

## Entry point, window & device — `Windows64_Minecraft.cpp`

The platform entry file is 2479 lines. It owns the Win32 window, the D3D11 device/swap-chain
bring-up, and the message pump.

Files: `Minecraft.Client/Windows64/Windows64_Minecraft.cpp`.

| Function | Line | Role |
|---|---|---|
| `WndProc` | 612 | Win32 message handler; routes KBM into `g_KBMInput`, dispatches resize into `ResizeD3D`. |
| `MyRegisterClass` | 796 | Registers window class `"MinecraftClass"`. |
| `InitInstance` | 827 | `CreateWindowW(L"MinecraftClass", L"Minecraft: neoLegacy", WS_OVERLAPPEDWINDOW, …)` → global `g_hWnd`. |
| `InitDevice` | 907 | The D3D11 backend bring-up (see below). |
| `ResizeD3D` | 1047 | Tears down / recreates swap chain + RTV + depth on resize. |
| `_tWinMain` | 1542 | Process entry: CWD, DPI, resolution, launch options, XUID, then `MyRegisterClass`/`InitInstance`/`InitDevice`. |

### `_tWinMain` startup

`_tWinMain` (line 1542) sets the working directory to the exe folder so relative asset paths resolve,
declares DPI awareness, and reads the native monitor resolution:

```cpp
// 4J-Win64: set CWD to exe dir so asset paths resolve correctly
GetModuleFileNameA(nullptr, szExeDir, MAX_PATH);
char *pSlash = strrchr(szExeDir, '\\');
if (pSlash) { *(pSlash + 1) = '\0'; SetCurrentDirectoryA(szExeDir); }

SetProcessDPIAware();
g_rScreenWidth = GetSystemMetrics(SM_CXSCREEN);
g_rScreenHeight = GetSystemMetrics(SM_CYSCREEN);
```

Files: `Windows64_Minecraft.cpp:1550-1565`. It then loads `username.txt`, parses launch options
(`ParseLaunchOptions()` → `Win64LaunchOptions`), and applies the screen mode. The physical window is
sized to the monitor while `g_iScreenWidth/Height` stay at logical 1920×1080 for SWF selection and
ortho projection.

### `InitDevice` — the D3D11 bring-up

`InitDevice` (line 907) creates the device and swap chain, trying driver types
HARDWARE → WARP → REFERENCE and feature levels 11_0 / 10_1 / 10_0:

```cpp
D3D_DRIVER_TYPE driverTypes[] = {
    D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP, D3D_DRIVER_TYPE_REFERENCE,
};
D3D_FEATURE_LEVEL featureLevels[] = {
    D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_10_0,
};
```

Under `_DEBUG` it adds `D3D11_CREATE_DEVICE_DEBUG`. Files: `Windows64_Minecraft.cpp:920-973`.

The swap chain uses the **legacy bitblt DISCARD** model (BufferCount=1,
`DXGI_FORMAT_R8G8B8A8_UNORM`, RefreshRate 0/0, windowed) — chosen *deliberately* over the
lower-latency `FLIP_DISCARD`. The in-source comment explains why:

> DXGI_SWAP_EFFECT_FLIP_DISCARD gives lower latency and tearing support, but takes exclusive
> ownership of the HWND — which makes window resize via CreateSwapChain fail with E_ACCESSDENIED and
> ResizeBuffers fail with DXGI_ERROR_INVALID_CALL (the closed-source 4J Renderer holds hidden
> backbuffer refs we can't release). Bitblt DISCARD has no HWND lock, so the "destroy old, create
> new" resize path in ResizeD3D() works cleanly.

Files: `Windows64_Minecraft.cpp:941-964`. This is a notable reverse-engineering seam: the closed 4J
`Renderer` retains backbuffer references neoLegacy can't release, so the whole swap-model choice is
dictated by working around it.

After the device, `InitDevice` creates the depth-stencil (`DXGI_FORMAT_D24_UNORM_S8_UINT`), an RTV,
and a viewport. Global device objects are `g_pd3dDevice`, `g_pImmediateContext`, `g_pSwapChain`.

### Resize & HDR

`ResizeD3D` (line 1047) recreates the swap chain with the **same** config as `InitDevice` (legacy
bitblt, RefreshRate 0/0). There is an HDR/wide-gamut path through
`IDXGISwapChain3::SetColorSpace1(DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709)`
(`Windows64_Minecraft.cpp:1429`), which is why the file pulls in `<dxgi1_4.h>`
(`Windows64_Minecraft.cpp:6`).

## Worked trace: cold start, process entry to the first frame

This walks the PC boot from the process entry point through engine bring-up to the
top of the render loop, citing every hop. The single structural fact: the window is
**not shown** until the entire engine is initialised — `_tWinMain` does all device,
runtime, and game-system setup first, then reveals the window and enters the loop.

**1 — Process entry (`_tWinMain`).** `_tWinMain` (`Windows64_Minecraft.cpp:1542`)
chdir's to the exe dir (`GetModuleFileNameA` → `SetCurrentDirectoryA`, `:1550-1556`),
declares DPI awareness and reads the native resolution (`:1558-1564`), loads
`username.txt` (`:1567-1596`), parses launch options (`ParseLaunchOptions()` →
`ApplyScreenMode`, `:1600-1601`), reads `resolution.txt` (`:1604-1626`), ensures the
persistent XUID exists (`Win64Xuid::ResolvePersistentXuid()`, `:1629`), defaults the
username to `"Player"` (`:1632-1636`), and migrates any legacy `servers.txt` into the
binary `servers.db` (`MCSV` magic, `:1641-1707`).

**2 — Window class + window + device.** Still in `_tWinMain`: `MyRegisterClass(hInstance)`
(`:1710`, registers `"MinecraftClass"`), then `InitInstance(hInstance, nCmdShow)`
(`:1713`) which `CreateWindowW(L"MinecraftClass", L"Minecraft: neoLegacy", …)` into
`g_hWnd` (`InitInstance` @ `:827`), then `InitDevice()` (`:1719`) — the D3D11
device/swap-chain/depth/RTV bring-up ([above](#initdevice--the-d3d11-bring-up)). A
`FAILED(InitDevice())` calls `CleanupDevice()` and bails (`:1719-1722`). Note the
window is created but **not yet shown**.

**3 — Engine bring-up (`InitialiseMinecraftRuntime`).** `_tWinMain` calls
`InitialiseMinecraftRuntime()` (`:1786`, defined `:1479`), the one function that stands
up every game system, in order:

1. `app.loadMediaArchive()` + `app.loadStringTable()` (`:1481,1486`) — asset archive and
   localised strings.
2. `ui.init(g_pd3dDevice, g_pImmediateContext, g_pRenderTargetView, g_pDepthStencilView, …)`
   (`:1487`) — brings up Iggy + GDraw and registers the UI callbacks (the
   `ConsoleUIController` from the [UI code map](/slop-docs/client/ui-code-map/#2a-controller-layer--uicontroller)).
3. `InputManager.Initialise(...)`, `g_KBMInput.Init()`, `DefineActions()`
   (`:1489-1494`) — input maps.
4. `ProfileManager.Initialise(...)` (`:1495`) — the local fake profile / awards store.
5. `g_NetworkManager.Initialise()` (`:1505`), seed the `IQNet::m_player[0..MAX]` array
   (player 0 is the host, `:1507-1513`), `WinsockNetLayer::Initialize()` (`:1516`) — the
   [PC multiplayer stack](#networking--windows64networkwinsocknetlayercpph).
6. Per-subsystem thread-local storage: `Tesselator`, `AABB`, `Vec3`, `IntCache`,
   `Compression`, `OldChunkStorage`, `Tile::CreateNewThreadStorage()` and
   `Level::enableLightingCache()` (`:1520-1528`) — the same TLS the dedicated server
   sets up (see [Server Overview §4](/slop-docs/server/overview/#4-engine-init-reusing-the-clients-classes)).
7. `Minecraft::main()` then `Minecraft::GetInstance()` (`:1530-1533`) — constructs the
   `Minecraft` god-object singleton.
8. `app.InitGameSettings()`, `app.InitialiseTips()`, `ui.ReloadSkin()` (`:1535-1537`).

A null `Minecraft*` here also `CleanupDevice()`s and returns (`:1787-1791`).

**4 — Reveal the window, enter the loop.** Only now does `_tWinMain` restore the
fullscreen option (`:1726-1732`), then `ShowWindow(g_hWnd, SW_SHOWMAXIMIZED)` +
`UpdateWindow(g_hWnd)` (`:1830-1831`) — the in-source comment (`:1819-1829`, `@CDevJoud`)
explains the deferral: showing the window before init completes makes Windows paint a
"Not Responding" frame on low-end machines. The main loop opens at `:1832`:
`while(WM_QUIT != msg.message && !app.m_bShutdown)`.

**5 — Per-iteration head (input, messages, clear).** Each iteration: `g_KBMInput.Tick()`
(`:1834`), drain the Win32 message queue (`PeekMessage`/`TranslateMessage`/`DispatchMessage`,
`:1836-1843`; `WndProc` @ `:612` routes KBM into `g_KBMInput` and resize into `ResizeD3D`),
skip rendering entirely while minimised (`IsIconic(g_hWnd)` → `Sleep(100)`, `:1847-1851`),
then pick the clear colour by game state (`app.GetGameStarted() ? kClearColorBlack : kClearColorWhite`)
and `RenderManager.StartFrame()` (`:1853-1855`).

**6 — Into the frame trace.** From `StartFrame()` onward the body is exactly the
[rendering frame trace](/slop-docs/client/rendering/#worked-trace-one-frame-platform-loop-to-pixels):
`applyFrameMouseLook()` + `run_middle()` draw the world per pad, `ui.tick()`/`ui.render()`
composite the scenes, `ApplyGammaPostProcess()` runs, and the frame is presented via
`Present(0,0)` or `RenderManager.Present()`. That page picks the trace up at
`Windows64_Minecraft.cpp:1856`; this one hands off exactly one line earlier, at
`StartFrame()` (`:1855`). The two traces meet at the frame boundary and are not
duplicated here.

## App subclass — `Windows64_App.{cpp,h}`

`CConsoleMinecraftApp : CMinecraftApp` (`Windows64_App.h:4`), with global instance `app`. Header
declares the platform overrides — rich presence, save thumbnails, screenshots, TMS file handling,
and the dev harness `TemporaryCreateGameStart()`.

Files: `Minecraft.Client/Windows64/Windows64_App.{cpp,h}` (270 / 38 lines).

### Save thumbnails

`CaptureSaveThumbnail()` (line 43) reads the D3D11 backbuffer into a STAGING texture, downsamples to
64×64 (`THUMBNAIL_SIZE = 64`), swaps BGRA→RGBA, and PNG-encodes into `m_ThumbnailBuffer` using the
bundled `stb_image_write.h`:

```cpp
stbi_write_png_to_func([](void* ctx, void* data, int size) {
```

Files: `Windows64_App.cpp:12` (include), `:41` (size), `:43` (capture), `:133` (encode).
`GetSaveThumbnail` / `ReleaseSaveThumbnail` follow.

### Dev harness & stubs

`TemporaryCreateGameStart()` (line 184) spins a world directly, bypassing menus — it wires a
`NetworkGameInitData`, sets host options, and launches the game thread. Xbox-LIVE TMS / rich-presence
entry points are stubbed. `SetRichPresenceContext` forwards to
`ProfileManager.SetRichPresenceContextValue(...)` (`Windows64_App.cpp:25-27`); `GetStringTable()`
returns `nullptr` and `ReadBannedList` is an empty body (`Windows64_App.h:28-30`).

## Input — `KeyboardMouseInput.{cpp,h}`

The KBM state machine is `KeyboardMouseInput` (432 / 157 lines), with global `g_KBMInput`, guarded by
`#ifdef _WINDOWS64`. It handles key/mouse edge detection, raw mouse deltas for low-latency look,
mouse grab/cursor hide, a char buffer for text entry, and hardcoded PC keybinds (WASD, Space jump,
E inventory, F3 debug, F5 3rd person, F11 fullscreen, F2 screenshot, etc.).

Files: `Minecraft.Client/Windows64/KeyboardMouseInput.{cpp,h}`.

The gamepad/controller abstraction lives in the open 4J input lib. `4JLibs/impls/Windows_Libs/Input/`
reimplements it: `4J_Input.cpp`, `INP_Main.cpp`, `INP_Keyboard.cpp`, `INP_ForceFeedback.cpp`,
`INP_StringCheck.cpp`. `4JLibs/inc/4J_Input.h` defines the Xbox-360-style gamepad button bitmask
constants (`_360_JOY_BUTTON_A`…) and the on-screen-keyboard result enum. A prebuilt
`4JLibs/libs/4J_Input.lib` is also present.

## Graphics backend — the open D3D11 renderer

`4JLibs/impls/Windows_Libs/Render/` is the open, MIT/Patoke reimplementation of 4J's closed renderer.

Files: `Minecraft.Client/Windows64/4JLibs/impls/Windows_Libs/Render/`.

| File | Lines | Role |
|---|---|---|
| `inc/Renderer.h` | 494 | Declares the singleton `extern Renderer InternalRenderManager;`. |
| `src/RendererCore.cpp` | 1049 | Device init, present, screen/thumbnail grab. |
| `src/4J_Render.cpp` | 503 | The `C4JRender` facade over `Renderer`. |
| `src/RendererCBuff.cpp` | — | Command-buffer recording. |
| `src/RendererMatrix.cpp` | — | Fixed-function matrix stacks. |
| `src/RendererState.cpp` | — | Blend/depth/raster/sampler state caches. |
| `src/RendererTexture.cpp`, `RendererVertex.cpp` | — | Texture & vertex paths. |

`Renderer` is a **fixed-function-emulating D3D11 renderer**: matrix stacks (MODELVIEW / PROJECTION /
TEXTURE / CBUFF), a managed texture table, per-state D3D11 state-object caches, and a recorded command
buffer system up to `MAX_COMMAND_BUFFERS 16000` (`Renderer.h:50`). It uses `DirectX::XMMATRIX` and
does 2-light lighting, gamma, fog, and a 4-mip thumbnail downsample chain to 64×64. The public wrapper
is `class C4JRender` (`4JLibs/inc/4J_Render.h:54`). Runtime assets load from `%s/Windows64/GameHDD/`
(`RendererCore.cpp`).

Screen-space post FX run through `PostProcesser` (singleton `PostProcesser::GetInstance()`),
initialised in `InitDevice`. A prebuilt `4JLibs/libs/4J_Render_PC.lib` is present.

### Shaders / FXC

HLSL sources live in `4JLibs/impls/Windows_Libs/Render/shaders/`:
`main_VS.hlsl`, `main_PS.hlsl`, `screen_VS.hlsl`, `screen_PS.hlsl`. They're compiled by `fxc.exe`
(both `Render/shaders/fxc.exe` and a top-level `Windows64/Shaders/fxc.exe` are bundled) into bytecode.
On a Linux cross-compile, `CMakeLists.txt:103-141` finds `fxc.exe`, requires `wine`, and generates a
wrapper (`cmake/FxcWineWrapper.sh.in` → `${CMAKE_BINARY_DIR}/tools/fxc`) that runs FXC through Wine.

## Filesystem / storage — `4JLibs/impls/Windows_Libs/Storage/`

Files: `src/4J_Storage.cpp`, `src/STO_SaveGame.cpp`, `src/STO_Main.cpp`, `src/STO_DLC.cpp`
(interface `4JLibs/inc/4J_Storage.h`). Prebuilt `4JLibs/libs/4J_Storage.lib`.

Saves live under `<dir>/Windows64/GameHDD/<saveUniqueName>/`, with thumbnails at
`.../thumbnails/thumbData.png`:

```cpp
sprintf(curDir, "%s/Windows64/GameHDD/", dirName);
sprintf(thumbName, "%s\\Windows64\\GameHDD\\%s\\thumbnails\\thumbData.png", dirName, findFileData.cFileName);
```

Files: `STO_SaveGame.cpp:48`, `:182`, `:303`, `:542`. DLC is scanned from `Windows64Media/DLC/`
(`STO_DLC.cpp`).

## Profile / achievements / rich presence — `4JLibs/impls/Windows_Libs/Profile/`

Files: `src/4J_Profile.cpp`, `src/PRO_Main.cpp`, `src/PRO_AwardManager.cpp` (achievements/awards),
`src/PRO_Data.cpp`, `src/PRO_RichPresence.cpp`, `src/PRO_Sys.cpp` (interface `4JLibs/inc/4J_Profile.h`).
`Windows64_App.cpp` drives it via `ProfileManager.SetRichPresenceContextValue(...)`. Note the Profile
lib is built from source — unlike Input/Render/Storage, there is no prebuilt `4J_Profile.lib` in
`4JLibs/libs/`.

## Networking — `Windows64/Network/WinsockNetLayer.{cpp,h}`

This is neoLegacy's **real PC multiplayer stack** — a Winsock2 host/client layer credited to
**LCEMP**. Files: `Minecraft.Client/Windows64/Network/WinsockNetLayer.{cpp,h}` (2124 / 238 lines).

```cpp
// Code implemented by LCEMP, credit if used on other repos
// https://github.com/LCEMP/LCEMP
```

| Constant | Value | Meaning |
|---|---|---|
| `WIN64_NET_DEFAULT_PORT` | `25565` | Default game port. |
| `WIN64_LAN_DISCOVERY_PORT` | `25566` | UDP LAN discovery. |
| `WIN64_LAN_BROADCAST_MAGIC` | `0x4D434C4E` | LAN broadcast magic (`"MCLN"`). |
| `WIN64_NET_MAX_CLIENTS` | `255` | Max connected clients. |
| `WIN64_NET_MAX_PACKET_SIZE` | `4 * 1024 * 1024` | 4 MB packet cap. |

Files: `WinsockNetLayer.h:16-22`. LAN advertise/discovery uses the packed `Win64LANBroadcast` and
`Win64LANSession` structs (`WinsockNetLayer.h:27-55`). Traffic is encrypted with `StreamCipher` pulled
from the server tree (`Minecraft.Server/Security/StreamCipher.h`, `WinsockNetLayer.h:12`).

This is distinct from the console Sony/XR session managers — PC multiplayer is **peer-driven** (LAN +
direct connect), not service-driven. Note the Windows64 platform net *manager* is a no-op: the source
list uses `Common/Network/PlatformNetworkManagerStub.cpp` (`cmake/sources/Windows.cmake:16-17`), so
the online-service manager is stubbed while `WinsockNetLayer` carries the actual multiplayer.

## Stubs & inherited scaffolding

Windows64 keeps a lot of Xbox-lineage service code compiling as no-ops:

| Area | File | Status |
|---|---|---|
| Leaderboards | `Leaderboards/WindowsLeaderboardManager.{cpp,h}` | Virtuals are inline no-ops: `OpenSession() { return true; }`, `CloseSession() {}`, `isIdle() { return true; }` (`WindowsLeaderboardManager.h:8-37`). No real online leaderboard service. |
| Social | `Social/SocialManager.h` | Header only — the real `.cpp` exists on Xbox/PS. On PC it's a compile shim over the XDK social-post API. |
| Telemetry | `Sentient/` | Headers only (`SentientManager.h`, `MinecraftTelemetry.h`, `SentientStats.h`, `TelemetryEnum.h`). |
| SPA / gameconfig | `GameConfig/Minecraft.spa`, `Minecraft.spa.h` | Auto-generated Xbox LIVE SPA achievement/stat definitions, reused on PC. |

These are inherited-from-Xbox scaffolding kept compiling; the live services on PC are the ones above
(WinsockNetLayer multiplayer, local profile/awards, local storage).

## Iggy UI middleware & misc

`Iggy/` holds the Autodesk Scaleform/Iggy Flash UI libs (`iggy_w64.lib`, `iggyperfmon_w64.lib`,
`iggyexpruntime_w64.lib` + w32 variants + `redist64/`), headers, and `gdraw/` D3D9/10/11 + GL draw
backends. Iggy renders the `.gfx`/`.swf` menu UI. Other files: `Windows64_UIController.{cpp,h}`
(195 lines, UI controller glue), `Windows64_Xuid.h` (persistent 64-bit user id in `uid.dat`),
`Xbox_BuildVer.h` (kept the Xbox name), and the bundled `stb_image_write.h`.

## Cross-links

- [Platform Overview](/slop-docs/platforms/overview/) — the `PLATFORM_NAME` model and build reality.
- [Build System](/slop-docs/overview/building/) — presets, cross-compile, FXC-via-Wine, codegen.

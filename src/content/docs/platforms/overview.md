---
title: Overview
description: Platform abstraction layer in LCE.
---

The LCE codebase targets six platforms through a layered abstraction system developed by 4J Studios. Each platform directory under `Minecraft.Client/` has platform-specific implementations that plug into shared interfaces defined in `Minecraft.Client/Common/`.

## Supported Platforms

| Directory | Platform | Codename | Status |
|-----------|----------|----------|--------|
| `Xbox/` | Xbox 360 | | Original console port |
| `Durango/` | Xbox One | Durango | Next-gen Xbox |
| `PS3/` | PlayStation 3 | | Sony seventh-gen |
| `Orbis/` | PlayStation 4 | Orbis | Sony eighth-gen |
| `PSVita/` | PS Vita | | Sony handheld |
| `Windows64/` | Windows 64-bit | | PC port (LCE primary target) |

## Abstraction Pattern

Each platform implements the same set of core subsystems through a common class hierarchy.

### Application Layer (`CConsoleMinecraftApp`)

Every platform defines a `CConsoleMinecraftApp` class that inherits from `CMinecraftApp` (the shared base). This class is the main application object and owns:

- Rich presence management (`SetRichPresenceContext`)
- Screenshot and thumbnail capture (`CaptureSaveThumbnail`, `GetScreenshot`)
- TMS (Title Managed Storage) file loading (`LoadLocalTMSFile`, `FreeLocalTMSFiles`)
- DLC and commerce management (platform-specific storefronts)
- Application lifecycle (`StoreLaunchData`, `ExitGame`, `FatalLoadError`)

Each platform declares a global `app` instance:
```cpp
extern CConsoleMinecraftApp app;
```

### UI Controller (`ConsoleUIController`)

The UI system uses a two-tier abstraction:

- **`IUIController`** (`Common/UI/IUIController.h`) is the pure virtual interface defining all UI operations: scene navigation, tooltip management, HUD control, DLC handling, tutorial display, trial timer, and splitscreen support.
- **`UIController`** (`Common/UI/UIController.h`) is the base implementation used by most platforms. It uses the Iggy UI library (from RAD Game Tools) for Flash-based menus with custom draw callbacks.
- **`ConsoleUIController`** is the platform-specific subclass. Xbox 360 inherits directly from `IUIController` (using XUI), while all other platforms inherit from `UIController` (using Iggy).

Each platform declares a global `ui` instance:
```cpp
extern ConsoleUIController ui;
```

### Network Manager

Networking follows a three-layer architecture:

1. **`CPlatformNetworkManager`** (`Common/Network/PlatformNetworkManagerInterface.h`) is the abstract interface for session management, player tracking, host/join operations, and data transmission.
2. **Platform network managers** implement this interface using their native networking SDK:
   - Xbox 360: `CPlatformNetworkManagerXbox` using QNET (`IQNetCallbacks`)
   - Xbox One: `CPlatformNetworkManagerDurango` using `DQRNetworkManager` (Xbox Realtime Networking Sessions / XRNS)
   - PS3/PS4/Vita: `CPlatformNetworkManagerSony` using `SQRNetworkManager` variants (PSN Matching2 + RUDP)
   - Windows 64: `WinsockNetLayer` using raw Winsock2 TCP sockets with LAN discovery via UDP broadcast
3. **`CGameNetworkManager`** is the shared game-level manager that delegates to the platform layer.

### Rendering (`C4JRender`)

The 4J render abstraction (`RenderManager` singleton) wraps platform graphics APIs behind an OpenGL-style interface with:

- Matrix stack operations (modelview, projection, texture)
- Texture management (create, bind, data upload)
- State control (blend, depth, fog, lighting, culling)
- Command buffers for batched draw calls
- Viewport management for splitscreen

Xbox 360 uses Direct3D 9, Xbox One and Windows 64 use Direct3D 11. PS3 uses GCM. PS4 uses GNM. PS Vita uses GXM.

### Input (`C_4JInput`)

The `InputManager` singleton provides unified gamepad input across all platforms using a bitmask-based action mapping system. Actions are defined with `SetGameJoypadMaps()` and queried with `ButtonPressed()`, `ButtonDown()`, and analog stick accessors. Multiple control schemes (MAP_STYLE_0 through MAP_STYLE_2) allow remappable layouts.

### Storage (`C4JStorage`)

The `StorageManager` singleton handles save/load operations, DLC package mounting, and TMS file retrieval. Each platform provides native implementations for its storage model (Xbox content packages, PSN save data dialogs, filesystem on PC).

### Profiles and Achievements (`C4JProfile`)

The `ProfileManager` singleton manages player profiles, achievements/trophies, rich presence, and leaderboards. Platform-specific leaderboard managers (`XboxLeaderboardManager`, `DurangoLeaderboardManager`, `PS3LeaderboardManager`, `OrbisLeaderboardManager`, `PSVitaLeaderboardManager`, `WindowsLeaderboardManager`) inherit from a common `LeaderboardManager` base.

## Per-Platform Extras

Beyond the core abstractions, each platform has its own unique subsystems:

- **Xbox 360**: XUI scene graph for menus, social posting (`CSocialManager`), Kinect integration hooks, avatar awards
- **Xbox One**: Xbox Live Services (MXSS), party controller, chat integration layer, secure device associations
- **PS3**: Cell SPU job system (`C4JSpursJob`), Edge zlib compression, voice chat
- **PS4**: NP Toolkit integration, voice chat with party support, remote play, pronunciation XML
- **PS Vita**: Ad-hoc networking (`SQRNetworkManager_AdHoc_Vita`), custom memory allocators, `libdivide` optimizations
- **Windows 64**: Winsock LAN discovery, keyboard/mouse input, post-process gamma correction, Win32 windowed mode

## Sony Shared Network Layer (MinecraftConsoles)

In the MinecraftConsoles codebase, 4J refactored the Sony networking stack into a shared layer at `Common/Network/Sony/`. This directory contains the base classes that all three Sony platforms (PS3, PS4, Vita) extend:

| File | Purpose |
|------|---------|
| `SQRNetworkManager.h/.cpp` | Base NP Matching2 room manager with RUDP transport |
| `SQRNetworkPlayer.h/.cpp` | Base Sony network player with PlayerSyncData |
| `PlatformNetworkManagerSony.h/.cpp` | Shared `CPlatformNetworkManager` implementation |
| `NetworkPlayerSony.h/.cpp` | Shared network player wrapper |
| `SonyCommerce.h/.cpp` | PlayStation Store commerce (categories, products, checkout) |
| `SonyHttp.h/.cpp` | HTTP client for web requests |
| `SonyRemoteStorage.h/.cpp` | Cloud saves and remote storage |

The `SQRNetworkManager` base class defines the shared constants used by all Sony platforms:
- `MAX_LOCAL_PLAYER_COUNT` = `XUSER_MAX_COUNT` (4)
- `MAX_ONLINE_PLAYER_COUNT` = `MINECRAFT_NET_MAX_PLAYERS` (8)
- `NP_POOL_SIZE` = 128 KB
- `MAX_FRIENDS` = 100
- `MAX_SIMULTANEOUS_INVITES` = 10
- `RUDP_THREAD_STACK_SIZE` = 32,768 bytes (0x8000, 32 KB)

RUDP thread priority differs per platform: PS3 uses 999, PS4/Vita use 500.

The shared `RoomSyncData` struct synchronizes player state across machines using NP Matching2's internal room binary data. Each player slot has a UID, room member ID, small ID, and local controller index.

In LCEMP, each Sony platform had its own copy of this code. The refactoring into a shared directory happened between the two codebase snapshots.

## Third-Party Libraries

MinecraftConsoles bundles several third-party libraries per platform:

| Library | Directory | Purpose |
|---------|-----------|---------|
| Iggy (RAD Game Tools) | `{Platform}/Iggy/` | Flash-based UI rendering (gdraw + iggy includes) |
| Miles Sound System (RAD) | `{Platform}/Miles/` | Audio playback |
| Sentient | `{Platform}/Sentient/` | Telemetry and analytics |
| 4JLibs | `{Platform}/4JLibs/inc/` | 4J's render, input, profile, and storage abstractions |

Xbox 360 also bundles: full Sentient SDK headers (`Sentient/Include/`), XUI font system (`Font/`)

PS3 also bundles: Boost 1.53.0 subset (`PS3Extras/boost_1_53_0/`), DirectX math headers (`PS3Extras/DirectX/`), HeapInspector memory debugging tool (`PS3Extras/HeapInspector/`), full SPU task sources (`SPU_Tasks/`)

PS Vita also bundles: libdivide integer division optimization (`PSVitaExtras/libdivide.h`)

## Dedicated Server Module

In addition to the platform-specific client code, LCEMP includes a `Minecraft.Server/` module for running a standalone dedicated server. This module has its own text-based command system (27 commands), a `server.properties` configuration file, and a console input thread for accepting commands. It also has a `Linux/` subdirectory with a Linux entry point, suggesting cross-platform server support was planned.

See the [Dedicated Server](/slop-docs/platforms/dedicated-server/) page for full details.

## Shared Common/ Systems

The `Common/` directory inside `Minecraft.Client` holds cross-platform systems shared by all platforms. Several of these systems have their own documentation pages:

- [DLC Pipeline](/slop-docs/platforms/dlc-pipeline/) -- DLC pack management, file types, and content loading
- [Telemetry](/slop-docs/platforms/telemetry/) -- Gameplay event tracking via CTelemetryManager
- [Leaderboards](/slop-docs/platforms/leaderboards/) -- Platform-specific leaderboard integration
- [Tutorial System](/slop-docs/platforms/tutorial-system/) -- In-game tutorial with states, tasks, hints, and constraints

## File Naming Conventions

Platform files follow consistent naming patterns:

- `{Platform}_App.h/.cpp` for the application class
- `{Platform}_UIController.h/.cpp` for the UI controller
- `{Platform}_Minecraft.cpp` for the entry point and main loop
- `Network/` subdirectory for the platform networking implementation
- `Leaderboards/` subdirectory for the leaderboard manager
- `Social/` subdirectory for social features (where applicable)
- `XML/` subdirectory for the XML parser (ATG XML parser, shared across platforms)
- `{Platform}Extras/` for platform-specific utilities and type stubs

## LCEMP vs MinecraftConsoles Differences

The two codebases have the same overall platform architecture, but MinecraftConsoles has some notable changes:

- **Sony shared network layer** was refactored from per-platform copies into `Common/Network/Sony/`
- **Windows 64** gained `Windows64_Xuid.h` (persistent player UID with `uid.dat` file storage). Note: `KeyboardMouseInput` already existed in LCEMP (added by notpies), it is not a MinecraftConsoles addition.
- **All platforms** gained Iggy, Miles, Sentient, and 4JLibs include directories (these were likely external references in LCEMP)
- **PS3** gained full SPU task source code (the SPU jobs were likely pre-compiled in LCEMP)
- **Platform media directories** (`DurangoMedia/`, `OrbisMedia/`, `PS3Media/`, `PSVitaMedia/`, `Windows64Media/`) were added for DLC content, localization, and asset files

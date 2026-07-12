---
title: Dedicated Server Overview
description: neoLegacy's headless dedicated server — a capability Legacy Console Edition never had — walked through from ServerMain.cpp to the two build flavours.
---

Original Minecraft Legacy Console Edition (LCE) had **no dedicated server**. It was a split-screen console client that hosted peer-to-peer sessions from inside a running game. neoLegacy adds a headless dedicated-server entry point, `Minecraft.Server/Windows64/ServerMain.cpp`, that boots the *same* client engine in host-only mode with no local player, listens on TCP, and runs forever without a rendering window attached.

This is a **new capability**, not a port of anything in TU19. There is no vanilla-LCE analog to compare against for any of the classes on this page — they were written for neoLegacy.

There are two flavours, both producing a binary literally named `Minecraft.Server.exe`:

| Target | Plugins | .NET at runtime | Notes |
|---|---|---|---|
| `Minecraft.Server` | none | no | Vanilla. Smallest, shipped in Docker. |
| `Minecraft.Server.FourKit` | FourKit (C#/.NET 10 Bukkit-style API) | yes (self-contained, staged in `runtime/`) | Adds `-DMINECRAFT_SERVER_FOURKIT_BUILD`. |

FourKit is documented separately. This page covers the shared server lifecycle. See also [Server Configuration](/slop-docs/server/configuration/), [Server Console & CLI](/slop-docs/server/console/), and [Deployment](/slop-docs/server/deployment/).

## It compiles the full client

The most surprising architectural fact: **the dedicated server compiles the entire `Minecraft.Client/` renderer, UI, and entity renderers** — DirectX 11 and all. Host and world logic in this codebase are entangled with client code, so the server links the full render stack rather than trying to tease them apart.

`ServerTarget.cmake` links `d3d11`, `dxgi`, `d3dcompiler`, `XInput9_1_0`, `wsock32`, and all four 4JLibs (`Input`/`Profile`/`Storage`/`Render`) plus the Iggy UI libs. `ServerMain.cpp` even sets a screen size (`g_iScreenWidth = 1280; g_iScreenHeight = 720`) and calls `CleanupDevice()` on exit. The practical consequence: under Docker the server needs a virtual X display (Xvfb) "because the client-side logic is being called for compatibility" — see [Deployment](/slop-docs/server/deployment/).

Files: `Minecraft.Server/cmake/sources/Common.cmake`, `cmake/ServerTarget.cmake`

## The source list

`Minecraft.Server/cmake/sources/Common.cmake` resolves `_MS_SRC` (the `Minecraft.Server` dir) and defines grouped source variables:

| Variable | Contents |
|---|---|
| `_MINECRAFT_SERVER_COMMON_ROOT` | The entire `Minecraft.Client/` renderer/UI/zlib, plus 17 hook-bearing `Minecraft.World/` files. |
| `_MINECRAFT_SERVER_COMMON_SERVER` | `ServerLogManager`, `ServerLogger`, `ServerProperties`, `WorldManager`. |
| `_MINECRAFT_SERVER_COMMON_SERVER_FOURKIT` | The 7 FourKit native bridge files (FourKit build only). |
| `_MINECRAFT_SERVER_COMMON_SERVER_ACCESS` | `Access` / `BanManager` / `WhitelistManager` / `OpManager`. |
| `_MINECRAFT_SERVER_COMMON_SERVER_SECURITY` | `SecurityConfig`, `RateLimiter`, `StreamCipher`, `ConnectionCipher`, `CipherHandshakeEnforcer`, `IdentityTokenManager`. |
| `_MINECRAFT_SERVER_COMMON_SERVER_COMMON` | `AccessStorageUtils`, `FileUtils`, `NetworkUtils`, `StringUtils`. |
| `_MINECRAFT_SERVER_COMMON_SERVER_CONSOLE` (+ `_CONSOLE_COMMANDS`) | The CLI engine and all command dirs. |

`ServerMain.cpp` lives in the shared list. **The only compile difference between the two flavours is the 7 FourKit files plus the `MINECRAFT_SERVER_FOURKIT_BUILD` define.** The 7 FourKit sources (`Common.cmake` lines 593–600):

```
set(_MINECRAFT_SERVER_COMMON_SERVER_FOURKIT
  "${_MS_SRC}/FourKitBridge.cpp"
  "${_MS_SRC}/FourKitBridge.h"
  "${_MS_SRC}/FourKitMappers.cpp"
  "${_MS_SRC}/FourKitNatives.cpp"
  "${_MS_SRC}/FourKitNatives.h"
  "${_MS_SRC}/FourKitRuntime.cpp"
  "${_MS_SRC}/FourKitRuntime.h"
```

`FourKitBridge.h` is *always* compiled (even into the vanilla build), but without the define every entry point is an inline no-op stub. That is why gameplay code across `Minecraft.World`/`Minecraft.Client` can call `FourKitBridge::FireBlockPlace(...)` unconditionally with no per-call-site `#ifdef` — the vanilla build links empty stubs that default out-params to their inputs and return `false` (don't cancel). From `FourKitBridge.h`:

> In the standalone server build (no plugin support), the macro is undefined and every entry point becomes an inline no-op stub. This lets gameplay code in Minecraft.Server / Minecraft.Client / Minecraft.World call into the bridge unconditionally without per-call-site #ifdefs. Cancellable hooks return false (do not cancel) so vanilla behaviour is preserved.

## `ServerMain.cpp` — the lifecycle

`int main(int argc, char **argv)` in `Minecraft.Server/Windows64/ServerMain.cpp` (816 lines) is the whole dedicated-server lifecycle. The stages, in order:

### 1. Process hardening

- `SetConsoleCtrlHandler(ConsoleCtrlHandlerProc, TRUE)` — `CTRL_C_EVENT` / `CTRL_BREAK_EVENT` / `CTRL_CLOSE_EVENT` / `CTRL_SHUTDOWN_EVENT` all call `ServerRuntime::RequestDedicatedServerShutdown()`, which sets `std::atomic<bool> g_shutdownRequested` (lines 129–142, 84).
- **Disables console QuickEdit mode** by clearing `ENABLE_QUICK_EDIT_MODE` (lines 384–391). Without this, an accidental click in the console window pauses every stdout-writing thread until a key is pressed — freezing the whole server.
- `SetExeWorkingDirectory()` chdir's to the exe directory so relative asset paths resolve (lines 290–300).

### 2. Config resolution

`LoadServerPropertiesConfig()` reads `server.properties`, then `ApplyServerPropertiesToDedicatedConfig()` maps it into a local `struct DedicatedServerConfig` (`port`, `bindIP[256]`, `name[17]`, `maxPlayers`, `worldSize`, `worldSizeChunks`, `worldHellScale`, `seed`, `logLevel`, `hasSeed`, `showHelp`). Hardcore mode forces `difficulty = 3` (lines 400–404). Then `ParseCommandLine()` applies CLI flags, which **override `server.properties`** — see [Server Console & CLI](/slop-docs/server/console/#command-line-flags) for the flag table.

### 3. Subsystem init

- `SetServerLogLevel(...)` then `ServerLogManager::Initialize()`.
- `Access::Initialize(".", whiteListEnabled)`, guarded by an `AccessShutdownGuard` RAII object that calls `Access::Shutdown()` on scope exit (lines 105–128, 419, 438–443).
- Builds `Security::SecuritySettings` from properties and `Security::InitializeSettings(...)`; if `require-challenge-token`, inits `IdentityTokenManager("identity-tokens.json")`; logs a warning if `require-secure-client` is on but `enable-stream-cipher` is off (lines 445–477). See [Server Configuration](/slop-docs/server/configuration/#security-connection-hardening).
- Sets the host globals: `g_Win64MultiplayerHost = true`, `g_Win64MultiplayerJoin = false`, `g_Win64DedicatedServer = true`, the port/bind IP, `g_Win64DedicatedServerLanAdvertise`, and the host username = server name.

### 4. Engine init (reusing the client's classes)

- `app.loadMediaArchive()`, `app.loadStringTable()`, `InputManager.Initialise(...)`, `ProfileManager.Initialise(...)` (a fake profile), `g_NetworkManager.Initialise()`.
- Seeds `IQNet::m_player[0..MAX]` — player 0 is the fake host player, `m_isHostPlayer = (i == 0)` (lines 512–519).
- Thread-local storage for `Tesselator`, `AABB`, `Vec3`, `IntCache`, `Compression`, `OldChunkStorage`, `Tile`, and `Level::enableLightingCache()` (lines 522–529).
- `Minecraft::main()` / `Minecraft::GetInstance()` — the shared client `Minecraft` singleton (lines 531–540).

### 5. Applying properties to the world

Mob spawn caps (lines 542–548) push `server.properties` values onto `MobCategory`:

```
MobCategory::monster->setMaxInstancesPerLevel(serverProperties.maxMonsters);
MobCategory::creature->setMaxInstancesPerLevel(serverProperties.maxAnimals);
MobCategory::ambient->setMaxInstancesPerLevel(serverProperties.maxAmbient);
MobCategory::waterCreature->setMaxInstancesPerLevel(serverProperties.maxWaterAnimals);
MobCategory::creature_wolf->setMaxInstancesPerLevel(serverProperties.maxWolves);
MobCategory::creature_chicken->setMaxInstancesPerLevel(serverProperties.maxChickens);
MobCategory::creature_mushroomcow->setMaxInstancesPerLevel(serverProperties.maxMushroomCows);
```

Then ~30 `app.SetGameHostOption(eGameHostOption_*, ...)` calls (lines 555–588) push difficulty, game type, PvP, keep-inventory, mob-griefing, daylight cycle, hardcore, world-size, host cheats, and the rest. This is exactly the same host-option surface the split-screen client uses; the dedicated server just fills it from a file instead of a menu.

### 6. World load-vs-create

`StorageManager.SetSaveDisabled(disableSaving)`, then `BootstrapWorldForServer(serverProperties, kServerActionPad, &TickCoreSystems)` decides whether to load an existing save or create a new world. See [WorldManager](#worldmanager-load-vs-create) below. On a `Loaded` result the actually-loaded save-id is persisted back to `level-id`; on `Failed` the server tears down and returns exit code 4 (lines 604–628).

### 7. Hosting the game

Builds a `NetworkGameInitData` with seed logic (lines 630–655):

- CLI `-seed` wins if present.
- Otherwise, for a brand-new world only, `BiomeSource::findSeed(LevelType::lvl_normal)` picks a biome-diverse seed.
- Otherwise the seed comes from `level.dat`.
- `param->dedicatedNoLocalHostPlayer = true`.

Then `g_NetworkManager.HostGame(0, true, false, maxPlayers, 0)` + `FakeLocalPlayerJoined()`, and a `C4JThread(&CGameNetworkManager::RunNetworkGameThreadProc, param, "RunNetworkGame")` runs the game start. The main thread pumps `TickCoreSystems()` until the start thread finishes (lines 657–685).

### 8. Main loop

`FourKitBridge::Initialize()` (no-op in vanilla). If the world is brand-new, an initial autosave is forced via `eXuiServerAction_AutoSaveGame` (lines 687–704) — Windows64 normally suppresses `saveToDisc` right after world creation, so the dedicated server does it explicitly.

Then the CLI starts and the loop runs (lines 705–751):

```
ServerRuntime::ServerCli serverCli;
serverCli.Start();

while (!IsShutdownRequested() && !app.m_bShutdown)
{
    TickCoreSystems();
    HandleXuiActions();
    serverCli.Poll();
    ...
```

`TickCoreSystems()` (lines 336–342) is the heartbeat:

```
static void TickCoreSystems()
{
    g_NetworkManager.DoWork();
    ProfileManager.Tick();
    StorageManager.Tick();
    ConsoleSaveFileOriginal::flushPendingBackgroundSave();
}
```

Autosave fires every `autosave-interval` seconds (default 60; the code's fallback constant is `kDefaultAutosaveIntervalMs = 60 * 1000`). Each autosave sets `eXuiServerAction_AutoSaveGame` and calls `FourKitBridge::FireWorldSave()` (lines 737–748).

### 9. Shutdown

On loop exit (lines 752–814): `serverCli.Stop()`, `FourKitBridge::Shutdown()` (early, for plugin teardown), drain any pending background save, `server->setSaveOnExit(true)`, `MinecraftServer::HaltServer()`, wait for `ServerStopped`, final flush, `WinsockNetLayer::Shutdown()`, `g_NetworkManager.Terminate()`, `ServerLogManager::Shutdown()`, `CleanupDevice()`. The pending-save drain has an explicit 30s timeout and a comment noting it fixes silent data loss where a pending autosave could overwrite the exit save on restart.

Files: `Minecraft.Server/Windows64/ServerMain.cpp`

## `WorldManager` — load vs create

`ServerRuntime::BootstrapWorldForServer(config, actionPad, tickProc)` returns a `WorldBootstrapResult`:

```
struct WorldBootstrapResult
{
    EWorldBootstrapStatus status;  // Loaded / CreatedNew / Failed
    LoadSaveDataThreadParam *saveData;  // NULL when creating a new world
    std::string resolvedSaveId;
};
```

`EWorldBootstrapStatus` is `eWorldBootstrap_Loaded`, `eWorldBootstrap_CreatedNew`, or `eWorldBootstrap_Failed`. It applies `level-name` / `level-id` from `server.properties`, loads an existing save when one matches, and only prepares a new-world context when nothing matches.

`WaitForWorldActionIdle(actionPad, timeoutMs, tickProc, handleActionsProc)` polls the XUI server-action state to `Idle` while pumping ticks. This is the abstraction that lets the dedicated server reuse the *client's* save/load pipeline — `ConsoleSaveFileOriginal`, `StorageManager`, and the XUI server-action state machine — headlessly, without duplicating any of it.

Files: `Minecraft.Server/WorldManager.h`, `Minecraft.Server/WorldManager.cpp`

## Logging

`ServerRuntime` logging lives in `ServerLogger.h/.cpp` and `ServerLogManager.h/.cpp`.

`EServerLogLevel` (`ServerLogger.h`):

| Level | Value |
|---|---|
| `eServerLogLevel_Debug` | 0 |
| `eServerLogLevel_Info` | 1 (default) |
| `eServerLogLevel_Warn` | 2 |
| `eServerLogLevel_Error` | 3 |

Public API: `LogInfo/Warn/Error/Debug(category, message)` and their `...f(category, format, ...)` variants, plus the semantic helpers `LogStartupStep`, `LogWorldIO`, `LogWorldName`, and the level controls `SetServerLogLevel` / `GetServerLogLevel` / `TryParseServerLogLevel`. `extern bool g_serverPerfTrace` gates noisy `[perf]` sampling output and is toggled by the `-perftrace` CLI flag. `ServerLogManager::Initialize()` / `Shutdown()` bookend the process (`ServerMain.cpp` lines 436, 810).

Files: `Minecraft.Server/ServerLogger.h`, `Minecraft.Server/ServerLogManager.cpp`

## Two flavours, one source list

`Minecraft.Server/CMakeLists.txt` is a thin shim: include the cmake source files, `add_executable(Minecraft.Server ...)`, `configure_lce_server_target(Minecraft.Server)`. No FourKit define, so `FourKitBridge.h` compiles as inline no-ops.

`Minecraft.Server.FourKit/CMakeLists.txt` adds the 7 bridge files, `configure_lce_server_target(...)`, `target_compile_definitions(Minecraft.Server.FourKit PRIVATE MINECRAFT_SERVER_FOURKIT_BUILD)`, and depends on the managed C# target. Both call the same `configure_lce_server_target(target)` from `cmake/ServerTarget.cmake`, which forces `OUTPUT_NAME "Minecraft.Server"` and per-target output dirs — so the two exes have the same file name and differ only by build directory.

For the full build/deploy story see [Deployment](/slop-docs/server/deployment/).

Files: `Minecraft.Server/CMakeLists.txt`, `Minecraft.Server.FourKit/CMakeLists.txt`, `cmake/ServerTarget.cmake`

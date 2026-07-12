---
title: FourKit Plugin System
description: How neoLegacy's FourKit bridges a self-contained .NET 10 Bukkit-style plugin API into the native dedicated server via hostfxr — a capability Legacy Console Edition never had.
---

**FourKit is a Bukkit-style C# plugin API for the neoLegacy dedicated server.** Plugin authors write .NET 10 class libraries that drop into a `plugins/` folder; the native C++ server hosts a self-contained CLR through `hostfxr` and marshals gameplay events across the C++↔C# boundary. Neither a dedicated server nor a plugin API existed in Legacy Console Edition (LCE) — the original game was a split-screen console client that hosted peer-to-peer sessions, with no scripting surface at all. FourKit is entirely new to neoLegacy.

FourKit is a *donor port*: the managed side keeps the upstream assembly name and namespace `Minecraft.Server.FourKit` (140 `.cs` files). It is available **only** in the FourKit build flavour; the vanilla `Minecraft.Server` target has zero plugin support.

See also the [Dedicated Server Overview](/slop-docs/server/overview/) for the shared server lifecycle, [Writing FourKit Plugins](/slop-docs/server/fourkit-plugins/) for the practical guide, and the [FourKit Events reference](/slop-docs/reference/fourkit-events/) for the full event catalog.

## The build-flag switch: `MINECRAFT_SERVER_FOURKIT_BUILD`

The entire native surface hinges on one preprocessor define. `FourKitBridge.h` is a **dual-mode header**: gameplay code in `Minecraft.World`, `Minecraft.Client`, and `Minecraft.Server` calls `FourKitBridge::FireBlockPlace(...)`, `FourKitBridge::FirePlayerChat(...)`, etc. *unconditionally*, with no `#ifdef` at each call site. The header decides what those calls do:

- **With `MINECRAFT_SERVER_FOURKIT_BUILD`** — the header only *declares* the functions; the real implementations link in from `FourKitBridge.cpp` / `FourKitRuntime.cpp` / `FourKitNatives.cpp` / `FourKitMappers.cpp`.
- **Without the define** — every entry point is an **inline no-op stub**. Cancellable hooks return `false` (do not cancel) so vanilla behaviour is preserved, and *every out-parameter is defaulted to its corresponding input value* so callers never read uninitialized stack memory.

That out-param defaulting is deliberate — the header comment notes that reading uninitialized out-params "would pass garbage into anti-cheat / damage / inventory checks and break the vanilla server build." Examples of the no-op contract:

```cpp
inline bool FirePlayerMove(int, double, double, double, double toX, double toY, double toZ,
                           double *outToX, double *outToY, double *outToZ)
{
    if (outToX) *outToX = toX;
    if (outToY) *outToY = toY;
    if (outToZ) *outToZ = toZ;
    return false;
}
inline int FireBlockBreak(int, int, int, int, int, int, int, int exp) { return exp; }
inline bool FireCommandPreprocess(int, const std::wstring &commandLine, std::wstring &outCommand)
{ outCommand = commandLine; return false; }
```

Files: `Minecraft.Server/FourKitBridge.h`

`Minecraft.Server.FourKit/CMakeLists.txt` applies the define to the FourKit executable only:

```cmake
add_executable(Minecraft.Server.FourKit ${MINECRAFT_SERVER_FOURKIT_SOURCES})
configure_lce_server_target(Minecraft.Server.FourKit)
target_compile_definitions(Minecraft.Server.FourKit PRIVATE MINECRAFT_SERVER_FOURKIT_BUILD)
add_dependencies(Minecraft.Server.FourKit Minecraft.Server.FourKit.Managed)
```

The `Minecraft.Server.FourKit` executable is built from the same shared source list as the vanilla server, plus the **seven** FourKit native bridge files (grouped as `_MINECRAFT_SERVER_COMMON_SERVER_FOURKIT` in `Common.cmake`): `FourKitBridge.cpp/.h`, `FourKitNatives.cpp/.h`, `FourKitRuntime.cpp/.h`, `FourKitMappers.cpp`. Both flavours still produce a binary literally named `Minecraft.Server.exe` — the variant identity lives only in the build directory.

Files: `Minecraft.Server.FourKit/CMakeLists.txt`, `Minecraft.Server/cmake/sources/Common.cmake`

## Native side

The native side is four translation units under `Minecraft.Server/`, all compiled only into the FourKit exe.

| File | Role |
|---|---|
| `FourKitRuntime.cpp/.h` | Hosts the CLR via `hostfxr`; resolves managed entry-point delegates. |
| `FourKitBridge.cpp/.h` | The real bridge: `Initialize`/`Shutdown`, ~50 `Fire*`/`Handle*` marshaling functions. |
| `FourKitNatives.cpp/.h` | The C→C# callback surface — ~80 `Native*` functions (`__cdecl`) that C# calls back into. |
| `FourKitMappers.cpp` | Maps native enum ids (entity type, damage cause) to FourKit ids. |

### `FourKitRuntime` — hosting the CLR

`LoadManagedRuntime()` starts a self-contained .NET 10 runtime. `LoadHostfxr()` prefers `<exeDir>\runtime\hostfxr.dll` — the staged self-contained payload — and sets `s_dotnetRoot = <exeDir>\runtime`. It falls back to `<exeDir>\hostfxr.dll` plus system .NET 10 discovery (`FindNet10SystemRoot()` scans `%DOTNET_ROOT%` and `C:\Program Files\dotnet\host\fxr\10.*`).

The subtle part: it uses **`hostfxr_initialize_for_dotnet_command_line`**, *not* `hostfxr_initialize_for_runtime_config`. The runtime-config API returns `0x80008093` ("Initialization for self-contained components is not supported") for self-contained publishes. The code passes the FourKit assembly as `argv[0]` but **never calls `hostfxr_run_app`** — the assembly's `Main` is never invoked. It only fetches the `hdt_load_assembly_and_get_function_pointer` delegate:

```cpp
const wchar_t *argv[1] = { assemblyPath };
hostfxr_handle ctx = nullptr;
int rc = s_initCmdLineFn(1, argv, &initParams, &ctx);
// 0 == success, 1 == Success_HostAlreadyInitialized; both are OK.
...
rc = s_getDelegateFn(ctx, hdt_load_assembly_and_get_function_pointer, (void **)&loadAssembly);
```

`GetManagedEntryPoint()` then resolves individual `[UnmanagedCallersOnly]` methods using the `UNMANAGEDCALLERSONLY_METHOD` sentinel (so no explicit delegate type is passed).

Files: `Minecraft.Server/FourKitRuntime.cpp`

### `FourKitBridge::Initialize()` — wiring the two sides together

`Initialize()` computes `<exeDir>\runtime\Minecraft.Server.FourKit.dll`, calls `LoadManagedRuntime`, and targets the managed type `"Minecraft.Server.FourKit.FourKitHost, Minecraft.Server.FourKit"`. It then resolves a table of ~57 managed entry points into `s_managed*` function pointers, spanning:

- **Lifecycle:** `Initialize`, `Shutdown`, `FireWorldSave`.
- **Player lifecycle:** `FirePlayerPreLogin`/`Login`/`Join`/`Quit`/`Kick`/`Move`, `UpdatePlayerEntityId`.
- **Gameplay:** `FirePlayerChat`, `FireBlockPlace`/`Break`, `FireEntityDamage`/`Death`, `FirePlayerDeath`, `FireSignChange`, `FirePlayerDropItem`/`Interact`/`InteractEntity`/`PickupItem`, `FireInventoryOpen`/`Click`, `FireBedEnter`/`Leave`, block grow/form/burn/spread/from-to, piston extend/retract, chunk load/unload, structure grow, teleport/portal.
- **Commands:** `HandlePlayerCommand`, `HandleConsoleCommand`, `GetPluginCommandHelp`, `FireCommandPreprocess`.
- **Registration:** all the `Set*Callbacks` entry points.

After `s_managedInit()` runs, `Initialize()` **pushes C++ function pointers into the managed side** by calling each `Set*Callbacks` delegate with the addresses of the `Native*` functions declared in `FourKitNatives.h`:

```cpp
s_managedInit();
s_managedSetCallbacks(   (void*)&NativeDamagePlayer, (void*)&NativeSetPlayerHealth, ... );
s_managedSetWorldCallbacks(   (void*)&NativeGetTileId, (void*)&NativeSetTile, ... );
s_managedSetPlayerCallbacks(  (void*)&NativeKickPlayer, (void*)&NativeBanPlayer, ... );
s_managedSetInventoryCallbacks( ... );
s_managedSetEntityCallbacks( ... );
s_managedSetExperienceCallbacks( ... );
s_managedSetParticleCallbacks( ... );
s_managedSetVehicleCallbacks( ... );
s_managedSetChunkCallbacks( ... );
s_managedSetBlockInfoCallbacks( ... );
s_managedSetWorldEntityCallbacks( ... );
s_managedSetSubscriptionCallbacks( (void*)&NativeSetHandlerMask );
s_managedSetServerCallbacks(      (void*)&NativeGetServerTickCount );
```

So the data flow is bidirectional and symmetric: **C++ → C# is the `Fire*` path** (events), and **C# → C++ is the `Native*` path** (the plugin API operating on the world).

Files: `Minecraft.Server/FourKitBridge.cpp`

### Marshaling and out-params

The `Fire*` functions marshal wide strings → UTF-8, call the managed delegate, and read back cancellation (`cancelled != 0`) plus mutated out-params (chat text, kick/death messages, moved coordinates, item ids). Sign, chat, kick, and death messages use fixed 2048/512-byte out buffers. An `unordered_map<int, OpenContainerInfo> s_openContainerInfo` tracks open-container metadata (type/size/title) so inventory-click events can report which container was clicked.

### Subscription-mask optimization

High-frequency events — `FirePlayerMove`, `FireChunkLoad`, `FireChunkUnload` — early-out via `HasHandlers(kHandlerKind_*)`. They only marshal into C# if a plugin actually subscribed. The handler kinds are defined in `FourKitNatives.h` and **must match** `FourKit.cs`:

```cpp
enum HandlerKind : int {
    kHandlerKind_ChunkLoad   = 0,
    kHandlerKind_ChunkUnload = 1,
    kHandlerKind_PlayerMove  = 2,
};
```

The mask is pushed *from C#* via `NativeSetHandlerMask(uint32_t mask)`. On the managed side, `FourKit.OnEventSubscribed` sets the corresponding bit the first time a plugin registers a `ChunkLoadEvent`/`ChunkUnloadEvent`/`PlayerMoveEvent` handler. (This is why the sample `FourKitTestPlugin` only registers its chunk listener on demand via `/fktest hookchunks` — subscribing flips the mask bit and disables the no-listener fast path.)

Files: `Minecraft.Server/FourKitNatives.h`, `Minecraft.Server.FourKit/FourKit.cs`

## Managed side

The C# project (`Minecraft.Server.FourKit/`) targets `net10.0` and is published self-contained for `win-x64`.

```xml
<TargetFramework>net10.0</TargetFramework>
<RootNamespace>Minecraft.Server.FourKit</RootNamespace>
<AssemblyName>Minecraft.Server.FourKit</AssemblyName>
<EnableDynamicLoading>true</EnableDynamicLoading>
<ServerGarbageCollection>true</ServerGarbageCollection>
<ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
```

`EnableDynamicLoading` is what makes the assembly loadable as a component via `hostfxr`; `ServerGarbageCollection` suits a long-lived headless host.

Files: `Minecraft.Server.FourKit/Minecraft.Server.FourKit.csproj`

### `FourKitHost` — the C++-facing host

`FourKitHost` is a `static partial class` split across three files:

| File | Contents |
|---|---|
| `FourKitHost.cs` | `[UnmanagedCallersOnly] Initialize()`/`Shutdown()`, `SyncPlayerFromNative`, the Java-format emulator, and inventory/click-type mappers. |
| `FourKitHost.Callbacks.cs` | The `[UnmanagedCallersOnly] Set*Callbacks(IntPtr...)` methods the C++ `Initialize()` invokes; each forwards to `NativeBridge`. |
| `FourKitHost.Events.cs` | The `[UnmanagedCallersOnly] Fire*` implementations that build event objects and dispatch them. |

`Initialize()` resolves the `plugins/` directory relative to the **host exe** — `Environment.ProcessPath`'s directory — not the FourKit assembly. `AppContext.BaseDirectory` points at the `runtime/` subfolder where the self-contained payload lives, so using it directly would create `runtime/plugins/`. To fix this it also redirects `APP_CONTEXT_BASE_DIRECTORY` to the server root so plugins that read `AppContext.BaseDirectory` see the exe folder:

```csharp
string hostExePath = Environment.ProcessPath ?? AppContext.BaseDirectory;
string serverRoot = Path.GetDirectoryName(hostExePath) ?? AppContext.BaseDirectory;
AppContext.SetData("APP_CONTEXT_BASE_DIRECTORY", serverRoot + Path.DirectorySeparatorChar);
string pluginsDir = Path.Combine(serverRoot, "plugins");
s_loader = new PluginLoader();
s_loader.LoadPlugins(pluginsDir, serverRoot);
s_loader.EnableAll();
```

`SyncPlayerFromNative(Player)` reads a **`double[27]`** snapshot through a pinned `GCHandle` and unpacks it into the `Player` object. The layout is fixed and shared with `NativeGetPlayerSnapshot`:

```
{ x, y, z, health, maxHealth, fallDistance, gameMode, walkSpeed, yaw, pitch,
  dimension, isSleeping, sleepTimer, sneaking, sprinting, onGround,
  velocityX, velocityY, velocityZ, allowFlight, sleepingIgnored,
  experienceLevel, experienceProgress, totalExperience,
  foodLevel, saturation, exhaustion }
```

Files: `Minecraft.Server.FourKit/FourKitHost.cs`, `FourKitHost.Callbacks.cs`, `FourKitHost.Events.cs`

### `NativeBridge` — the C#→C++ call path

`NativeBridge.cs` declares all ~80 `[UnmanagedFunctionPointer(Cdecl)] Native*Delegate` types plus nullable `static` delegate fields, and the `Set*Callbacks(IntPtr...)` methods that `Marshal.GetDelegateForFunctionPointer` each incoming pointer. Every FourKit API that mutates the world (teleporting a player, setting a tile, opening a virtual container) ultimately invokes one of these delegates. The `Native*` surface is grouped in `FourKitNatives.h`:

| Group | Examples |
|---|---|
| Core player | `NativeDamagePlayer`, `NativeSetPlayerHealth`, `NativeTeleportPlayer`, `NativeSetPlayerGameMode`, `NativeGetPlayerSnapshot`, `NativeSetWalkSpeed` |
| World | `NativeGetTileId`/`SetTile`, `NativeBreakBlock`, `NativeGetHighestBlockY`, `NativeGetWorldInfo`, `NativeSetWorldTime`/`Weather`, `NativeCreateExplosion`, `NativeStrikeLightning`, `NativeSetSpawnLocation`, `NativeDropItem` |
| Player admin | `NativeKickPlayer`, `NativeBanPlayer`/`Ip`, `NativeGetPlayerAddress`/`Latency` |
| Raw send | `NativeSendRaw` |
| Inventory | player inventory, container contents, item meta, carried (cursor) item, ender chest |
| Entity | `NativeSetSneaking`/`Velocity`/`AllowFlight`, `NativePlaySound`, `NativeSetSleepingIgnored` |
| Experience / food | `NativeSetLevel`/`Exp`, `NativeGiveExp`/`Levels`, `NativeSetFoodLevel`/`Saturation`/`Exhaustion` |
| Particle | `NativeSpawnParticle` |
| Vehicle | `NativeSetPassenger`, `NativeLeaveVehicle`, `NativeEject`, `NativeGetVehicleId`/`PassengerId`/`EntityInfo` |
| Chunk | load/unload/regenerate/refresh/snapshot, loaded-chunks, in-use |
| World-entity | `NativeGetWorldEntities`, `NativeGetChunkEntities` |
| Block info | `NativeGetSkyLight`/`BlockLight`, `NativeGetBiomeId`/`SetBiomeId` |
| Meta | `NativeSetHandlerMask`, `NativeGetServerTickCount` |

Files: `Minecraft.Server.FourKit/NativeBridge.cs`, `Minecraft.Server/FourKitNatives.h`

### `FourKit` — the public plugin API

`public static class FourKit` is what plugin authors call. It holds registries of players (by name / entity id), worlds, and commands, and owns the `EventDispatcher` (`_dispatcher`). Key entry points:

| Member | Purpose |
|---|---|
| `getWorld(int dimId)` / `getWorld(string name)` | Resolve a world. Dim mapping: `0 → "world"`, `-1 → "world_nether"`, `1 → "world_the_end"`, otherwise `world_dim<N>`. |
| `getPlayer(string)` / `getOnlinePlayers()` | Player lookup. |
| `addListener(Listener)` | Register a Bukkit-style event listener. |
| `getCommand(string) -> PluginCommand` | Get (creating if absent) a plugin command to attach an executor to. |
| `broadcastMessage(string)` | Broadcast chat (truncated to `MAX_CHAT_LENGTH = 123`). |
| `createInventory(...)` | Build a virtual inventory. |
| `getPlugin(s)`, `enable/disablePlugin` | Plugin registry access. |
| `getServerTick()` | Current server tick via `NativeGetServerTickCount`. |

`OnEventSubscribed` maps `ChunkLoad`/`ChunkUnload`/`PlayerMove` event types to `HandlerKind` bits and pushes the accumulated `_handlerMask` to native via `NativeBridge.SetHandlerMask` — the C# half of the subscription optimization. `ResyncHandlerMask()` (called from `SetSubscriptionCallbacks` after `s_managedInit`) flushes any mask accumulated while plugins were enabling before the native callback was wired.

Files: `Minecraft.Server.FourKit/FourKit.cs`

### `EventDispatcher` — reflection-based, snapshot-on-write

`EventDispatcher` is Bukkit-style and reflection-driven. `Register(Listener)` scans public/non-public instance methods for `[EventHandler]`, requires exactly one parameter extending `Event`, and records `(EventPriority, IgnoreCancelled)`. Handlers are sorted by priority (stable `OrderBy`, Lowest→Monitor). It uses **snapshot-on-write**: writers swap a `volatile Dictionary<Type, RegisteredHandler[]>` under a lock, so `Fire()` reads it lock-free:

```csharp
private volatile Dictionary<Type, RegisteredHandler[]> _handlers = new();

public void Fire(Event.Event evt)
{
    var snapshot = _handlers;
    if (!snapshot.TryGetValue(evt.GetType(), out var handlers)) return;
    var cancellable = evt as Cancellable;
    for (int i = 0; i < handlers.Length; i++)
    {
        ref readonly var handler = ref handlers[i];
        if (handler.IgnoreCancelled && cancellable != null && cancellable.isCancelled()) continue;
        handler.Method.Invoke(handler.Instance, [evt]);   // via MethodInfo.Invoke
    }
}
```

Handlers are matched by *exact* runtime type (`evt.GetType()`), not by base class — an important detail for plugin authors. There is no unregister path; registration is one-way for the session.

Files: `Minecraft.Server.FourKit/EventDispatcher.cs`

### `PluginLoader` and `PluginLoadContext`

`PluginLoader.LoadPlugins(pluginsDir, serverRoot)` scans two layouts:

1. **`plugins/*.dll`** — loose DLLs in the root.
2. **`plugins/<Name>/<Name>.dll`** — a subfolder whose main DLL name matches the folder; other DLLs in that folder are treated as dependencies.

Each plugin assembly is loaded into its own `PluginLoadContext`. The loader instantiates every non-abstract `ServerPlugin` subtype (via `Activator.CreateInstance`), reads `name`/`version`/`author` (property or `get*` method, with warnings if not declared), and fires `PluginLoadFailedEvent` on failure and `PluginsLoadedEvent` when done. `EnableAll()` sets each plugin's `serverDirectory` (the server root) and `dataDirectory` (`plugins/<Name>/`, created if missing) *before* calling `onEnable`. `DisableAll()` calls `onDisable`. Each transition fires `PluginEnableEvent`/`PluginDisableEvent`.

`PluginLoadContext` extends `AssemblyLoadContext(isCollectible: false)` — **hot-reload is explicitly out of scope**. It shares the FourKit host assembly with the process (so `ServerPlugin`, events, etc. are the same types), and resolves plugin dependencies via `AssemblyDependencyResolver` plus a same-folder `<name>.dll` fallback and native-DLL resolution:

```csharp
protected override Assembly? Load(AssemblyName assemblyName)
{
    if (assemblyName.Name == typeof(ServerPlugin).Assembly.GetName().Name)
        return typeof(ServerPlugin).Assembly;      // share the host assembly
    string? path = _resolver.ResolveAssemblyToPath(assemblyName);
    if (path != null) return LoadFromAssemblyPath(path);
    ...
}
```

Files: `Minecraft.Server.FourKit/PluginLoader.cs`, `PluginLoadContext.cs`, `Plugin/ServerPlugin.cs`

## Publish and staging: `dotnet publish` → `runtime/` + `plugins/`

The managed side is published as a **self-contained** payload so end users need no pre-installed .NET. `Minecraft.Server.FourKit/CMakeLists.txt` first hard-checks for a .NET 10 SDK (`dotnet --list-sdks` must match `10.x.y`, `FATAL_ERROR` otherwise; `/global.json` pins the exact 10.x SDK), then defines a managed target:

```cmake
add_custom_target(Minecraft.Server.FourKit.Managed ALL
  COMMAND dotnet publish "${FOURKIT_CSPROJ}"
    --configuration "${DOTNET_CONFIG}"
    --runtime win-x64
    --self-contained true
    --output "${FOURKIT_OUTPUT_DIR}"
  COMMAND ${CMAKE_COMMAND} -E copy_directory "${FOURKIT_OUTPUT_DIR}"
    "$<TARGET_FILE_DIR:Minecraft.Server.FourKit>/runtime"
  COMMAND ${CMAKE_COMMAND} -E make_directory
    "$<TARGET_FILE_DIR:Minecraft.Server.FourKit>/plugins"
  ...)
```

So next to `Minecraft.Server.exe` the build stages:

```
Minecraft.Server.exe
runtime/                       <- self-contained .NET 10 payload
  Minecraft.Server.FourKit.dll
  hostfxr.dll
  coreclr.dll, System.*.dll, ...
plugins/                       <- empty; drop plugin DLLs here
```

`hostfxr.dll` inside `runtime/` is exactly what `FourKitRuntime::LoadHostfxr()` looks for first. Both the publish and the staging copy live on the `.Managed` target so they re-run together whenever any FourKit `.cs` file changes — even on incremental builds where the C++ exe doesn't re-link. The CMake target is named `Minecraft.Server.FourKit.Managed` to avoid colliding with the C++ executable target `Minecraft.Server.FourKit`; the csproj, assembly, and namespace all stay `Minecraft.Server.FourKit`.

Files: `Minecraft.Server.FourKit/CMakeLists.txt`, `/global.json`

## Lifecycle from `ServerMain.cpp`

Because the no-op stubs make the calls safe in the vanilla build, `ServerMain.cpp` calls the bridge unconditionally at three points:

| Point | Call | When it fires |
|---|---|---|
| Post-startup | `FourKitBridge::Initialize()` | After `HostGame` + fake host player, before the main loop. No-op in vanilla. |
| Autosave | `FourKitBridge::FireWorldSave()` | On each periodic autosave (`autosave-interval`, default 60 s). |
| Shutdown | `FourKitBridge::Shutdown()` | Early in the shutdown sequence, for plugin teardown. |

See the [Dedicated Server Overview](/slop-docs/server/overview/) for the full `ServerMain.cpp` lifecycle.

## neoLegacy vs vanilla LCE

| Aspect | LCE (TU19-era) | neoLegacy |
|---|---|---|
| Dedicated server | None (split-screen P2P client) | New `ServerMain.cpp` entry point |
| Plugin API | None | FourKit (Bukkit-style, C#/.NET 10) |
| CLR hosting | N/A | Self-contained runtime via `hostfxr` command-line init |
| Event surface | N/A | ~50 `Fire*`/`Handle*` hooks, ~80 `Native*` callbacks |
| Build variant | Single client | Two exes; `MINECRAFT_SERVER_FOURKIT_BUILD` gates the bridge |

Every hook in the [FourKit Events reference](/slop-docs/reference/fourkit-events/) is documented as **PORTED** with no known gaps at time of writing.

---
title: Writing FourKit Plugins
description: A practical guide to building neoLegacy FourKit plugins — csproj setup, the ServerPlugin lifecycle, event subscription, and deployment — walked through the three shipped sample plugins.
---

FourKit plugins are .NET 10 class libraries that extend `ServerPlugin`, subscribe to events with a Bukkit-style `[EventHandler]` pattern, and drop into the server's `plugins/` folder. This page is the practical guide, walked through the three sample plugins in `samples/`. For how the C++↔C# bridge actually works under the hood, see the [FourKit Plugin System](/slop-docs/server/fourkit/) architecture page; for the full event catalog, see the [FourKit Events reference](/slop-docs/reference/fourkit-events/).

FourKit is a neoLegacy addition — Legacy Console Edition had no dedicated server and no plugin API. Plugins run only under the `Minecraft.Server.FourKit` build flavour, never the vanilla `Minecraft.Server`.

## The three sample plugins

| Sample | Demonstrates |
|---|---|
| `HelloPlugin` | The minimal skeleton: `ServerPlugin` overrides, a `Listener` with one `[EventHandler]`. |
| `TpsPlugin` | Registering a command (`/tps`) with a `CommandExecutor`; polling `FourKit.getServerTick()`. |
| `FourKitTestPlugin` | Broad API smoke tests: worlds, chunks, snapshots, ender chest, `ItemStack`, `ChatColor`, on-demand event subscription. |

Files: `samples/HelloPlugin/`, `samples/TpsPlugin/`, `samples/FourKitTestPlugin/`

## csproj setup — the `Private=false` trick

Every plugin targets `net10.0` and references the FourKit host project **for the contract only**. The reference must *not* copy the host assembly into the plugin's output — the server already loads the host, and the `PluginLoadContext` shares that single host assembly with every plugin (`ServerPlugin`, events, etc. must be the same `Type` instances). Copying it would produce a duplicate assembly and type-identity mismatches. The samples do this with `<Private>false</Private>` and `<ExcludeAssets>runtime</ExcludeAssets>`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <RootNamespace>HelloPlugin</RootNamespace>
    <AssemblyName>HelloPlugin</AssemblyName>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>

  <ItemGroup>
    <!-- Compile against the FourKit API, but do NOT copy its assembly into
         the plugin output. The host loads it; the plugin only needs the contract. -->
    <ProjectReference Include="..\..\Minecraft.Server.FourKit\Minecraft.Server.FourKit.csproj">
      <Private>false</Private>
      <ExcludeAssets>runtime</ExcludeAssets>
    </ProjectReference>
  </ItemGroup>
</Project>
```

`EnableDynamicLoading=true` is required so the assembly loads cleanly as a component. All three samples use this exact `ItemGroup`.

Files: `samples/HelloPlugin/HelloPlugin.csproj`, `samples/TpsPlugin/TpsPlugin.csproj`, `samples/FourKitTestPlugin/FourKitTestPlugin.csproj`

## The `ServerPlugin` lifecycle

Every plugin extends `Minecraft.Server.FourKit.Plugin.ServerPlugin` and typically overrides five members:

| Member | Type | Purpose |
|---|---|---|
| `name` | `string` (property) | Plugin name. **Declare this** — the loader warns if missing. Also names the per-plugin data folder. |
| `version` | `string` | Version string (defaults to `"1.0.0"`). |
| `author` | `string` | Author (defaults to `"Unknown"`). |
| `onEnable()` | `void` | Startup logic. Called after `serverDirectory`/`dataDirectory` are set. |
| `onDisable()` | `void` | Shutdown logic. |

Two paths are handed to the plugin automatically *before* `onEnable`:

- `serverDirectory` — the server root (where `Minecraft.Server.exe` lives). Use this instead of `AppContext.BaseDirectory`, which points at the `runtime/` subfolder.
- `dataDirectory` — a per-plugin folder `plugins/<name>/`, created if missing. Use it for config, logs, and databases.

Files: `Minecraft.Server.FourKit/Plugin/ServerPlugin.cs`

## Worked trace: plugin load lifecycle, server start to live subscription

This walks a single plugin (`HelloPlugin`) from the server calling into the bridge
through assembly load and `onEnable` to a *live* event subscription, citing every hop.
The key ordering fact: assemblies are **loaded first for all plugins**, then
**enabled** in a second pass — so `onEnable` for one plugin can already see every other
loaded plugin's types.

**1 — Bridge init (C++ → managed).** `ServerMain.cpp` calls
`FourKitBridge::Initialize()` once, after `HostGame` and before the main loop (see
[architecture §lifecycle](/slop-docs/server/fourkit/#lifecycle-from-servermaincpp)).
That resolves the managed `FourKitHost` entry points and invokes `s_managedInit()` —
the `[UnmanagedCallersOnly] FourKitHost.Initialize()`.

**2 — Resolve `plugins/`, hand off to the loader.** `FourKitHost.Initialize`
(`FourKitHost.cs`) computes the server root from `Environment.ProcessPath` (not
`AppContext.BaseDirectory`, which points at `runtime/`), redirects
`APP_CONTEXT_BASE_DIRECTORY` to the server root, then:

```csharp
string pluginsDir = Path.Combine(serverRoot, "plugins");
s_loader = new PluginLoader();
s_loader.LoadPlugins(pluginsDir, serverRoot);   // pass 1: load
s_loader.EnableAll();                            // pass 2: enable
```

**3 — Scan + load (pass 1).** `PluginLoader.LoadPlugins`
(`PluginLoader.cs:18`) creates `plugins/` if absent (and returns early), then scans two
layouts: loose `plugins/*.dll` (`:30-39`) and each `plugins/<Name>/` subfolder whose
main DLL name matches the folder (`:41-79`). For `HelloPlugin.dll` it calls
`LoadPluginAssembly` (`:83`):

```csharp
var context = new PluginLoadContext(dllPath);                       // isolated ALC
var assembly = context.LoadFromAssemblyPath(Path.GetFullPath(dllPath));
```

Each plugin gets its **own** `PluginLoadContext` (`PluginLoadContext.cs`, a
non-collectible `AssemblyLoadContext`) that shares the host assembly so `ServerPlugin`
and the event types are the *same* `Type` instances
([architecture detail](/slop-docs/server/fourkit/#pluginloader-and-pluginloadcontext)).
`LoadPluginAssembly` then reflects over `assembly.GetTypes()`, and for every
non-abstract `ServerPlugin` subtype calls `Activator.CreateInstance(type)`
(`PluginLoader.cs:97`), reads `name`/`version`/`author` (warning if undeclared,
`:106-111`), adds it to `_plugins`, and logs `Loaded plugin: HelloPlugin v1.0.0 by …`.
When the scan finishes it fires `PluginsLoadedEvent` (`:80`).

**4 — Enable (pass 2).** `EnableAll` (`PluginLoader.cs:124`) walks `_plugins` and calls
`EnablePlugin` (`:140`), which — *before* `onEnable* — sets `plugin.serverDirectory =
serverRoot` and creates + assigns `plugin.dataDirectory = plugins/<name>/` (`:146-150`),
then `InvokePluginMethod(plugin, "onEnable", …)` (`:152`), logs `Enabled: HelloPlugin`,
and fires `PluginEnableEvent` (`:155`).

**5 — `onEnable` registers a listener (live subscription).** Inside
`HelloPlugin.onEnable` the plugin calls `FourKit.addListener(new HelloListener())`
(`samples/HelloPlugin/HelloPlugin.cs`). `FourKit.addListener` (`FourKit.cs:129`) forwards
to `_dispatcher.Register(listener)`, which reflects over the listener's `[EventHandler]`
methods, records `(EventPriority, IgnoreCancelled)`, and swaps them into the
snapshot-on-write handler table
([dispatcher internals](/slop-docs/server/fourkit/#eventdispatcher--reflection-based-snapshot-on-write)).
From this point `HelloListener.onPlayerJoin` is live: a real join fires
`FourKitHost.FirePlayerJoin` → dispatcher → the handler, exactly as the
[block-break trace](/slop-docs/server/fourkit/#worked-trace-one-cancellable-event-c-call-site-to-cancellation)
walks in the other direction.

> Subscribing to a **high-frequency** event (`ChunkLoad`/`ChunkUnload`/`PlayerMove`) at
> this step additionally flips a `HasHandlers` mask bit back to native via
> `NativeSetHandlerMask`, turning off the no-listener fast path — which is why
> `FourKitTestPlugin` defers its chunk listener to an explicit `/fktest hookchunks`
> rather than registering it in `onEnable` (see
> [the high-frequency-event gotcha](#the-high-frequency-event-gotcha)).

## HelloPlugin — the skeleton walkthrough

`HelloPlugin` is the canonical minimal plugin: it declares its metadata, registers one listener in `onEnable`, and greets each joining player.

```csharp
using Minecraft.Server.FourKit;
using Minecraft.Server.FourKit.Event;
using Minecraft.Server.FourKit.Event.Player;
using Minecraft.Server.FourKit.Plugin;

namespace HelloPlugin;

public class HelloPlugin : ServerPlugin
{
    public override string name    => "HelloPlugin";
    public override string version => "1.0.0";
    public override string author  => "LCE-Revelations";

    public override void onEnable()
    {
        Console.WriteLine($"[HelloPlugin] {name} v{version} enabled.");
        FourKit.addListener(new HelloListener());
    }

    public override void onDisable()
    {
        Console.WriteLine($"[HelloPlugin] {name} v{version} disabled.");
    }
}

internal sealed class HelloListener : Listener
{
    [EventHandler(Priority = EventPriority.Normal)]
    public void onPlayerJoin(PlayerJoinEvent e)
    {
        var playerName = e.getPlayer().getName();
        Console.WriteLine($"[HelloPlugin] {playerName} joined.");
        e.setJoinMessage($"Welcome, {playerName}!");
    }
}
```

Key patterns, all reusable:

- **Register listeners in `onEnable`** via `FourKit.addListener(new HelloListener())`. A `Listener` is any class extending `Minecraft.Server.FourKit.Event.Listener`.
- **An `[EventHandler]` method** takes exactly one argument that extends `Event`. `EventDispatcher` matches by the *exact* runtime type — so `onPlayerJoin(PlayerJoinEvent)` fires only for `PlayerJoinEvent`, not subclasses. A wrong parameter count or a non-`Event` parameter is skipped with a console warning.
- **`Priority`** orders handlers (`EventPriority.Lowest` → `Highest` → `Monitor`). `[EventHandler(IgnoreCancelled = true)]` skips a handler when the event is already cancelled.
- **Mutating the event** — `PlayerJoinEvent.setJoinMessage(...)` writes an out-param that the native side reads back.

`Console.WriteLine` output goes to the server console (and can be captured to `server.log`).

Files: `samples/HelloPlugin/HelloPlugin.cs`

## Event subscription patterns

The `[EventHandler]` attribute drives all subscription. From `HelloPlugin` and `FourKitTestPlugin`:

```csharp
// Prioritized, cancel-aware:
[EventHandler(Priority = EventPriority.Normal)]
public void onPlayerJoin(PlayerJoinEvent e) { ... }

// Monitor priority — observe only, run last, never mutate:
[EventHandler(Priority = EventPriority.Monitor)]
public void onChunkLoad(ChunkLoadEvent e)
{
    FourKitTestPlugin.IncChunkLoad();
    if (!FourKitTestPlugin.WatchChunks) return;
    var chunk = e.getChunk();
    // ...
}
```

### The high-frequency-event gotcha

`ChunkLoadEvent`, `ChunkUnloadEvent`, and `PlayerMoveEvent` are special: the native side skips marshaling them entirely unless a plugin has subscribed (the subscription-mask optimization — see the [architecture page](/slop-docs/server/fourkit/#subscription-mask-optimization)). Subscribing to one of these flips a `HasHandlers` bit and **turns off that fast path** for the whole server, which has a real cost under load. `FourKitTestPlugin` deliberately does *not* register its chunk listener in `onEnable`; it waits for an explicit `/fktest hookchunks`:

```csharp
case "hookchunks":
    if (FourKitTestPlugin.ChunkListenerHooked) { /* already on; one-way for the session */ }
    FourKit.addListener(new ChunkEventLogger());
    FourKitTestPlugin.ChunkListenerHooked = true;
    Reply(sender, "Chunk listener registered. HasHandlers fast-path now off; chunk events will dispatch.");
    return true;
```

Note the plugin's own comment that "EventDispatcher has no unregister, so this is one-way for the session" — there is no way to un-subscribe a listener once registered.

Files: `samples/FourKitTestPlugin/FourKitTestPlugin.cs`

## Registering commands — TpsPlugin

Commands are obtained from `FourKit.getCommand(name)` (created lazily) and given a `CommandExecutor`. `TpsPlugin` exposes `/tps`:

```csharp
public override void onEnable()
{
    TpsProbe.Start();

    var cmd = FourKit.getCommand("tps");
    cmd.setDescription("Show server TPS over 1s/5s/30s/60s windows.");
    cmd.setUsage("/tps");
    cmd.setExecutor(new TpsExecutor());
}
```

A `CommandExecutor` implements one method, returning `true` if the command was valid:

```csharp
public interface CommandExecutor
{
    bool onCommand(CommandSender sender, Command command, string label, string[] args);
}

internal sealed class TpsExecutor : CommandExecutor
{
    public bool onCommand(CommandSender sender, Command command, string label, string[] args)
    {
        var (samples, t1, t5, t30, t60) = TpsProbe.Read();
        if (samples < 2)
        {
            sender.sendMessage($"TPS probe warming up ({samples}/2 samples). Try again in a few seconds.");
            return true;
        }
        int tick = FourKit.getServerTick();
        sender.sendMessage($"TPS  1s={t1:F2}  5s={t5:F2}  30s={t30:F2}  60s={t60:F2}");
        return true;
    }
}
```

Two things to note:

- `CommandSender` covers both an in-game `Player` and the console. `TpsPlugin` reads `sender.sendMessage(...)`; `FourKitTestPlugin` narrows with `if (sender is Player p)` for subcommands that require a player.
- `FourKit.getServerTick()` (backed by `NativeGetServerTickCount`) is the canonical tick counter. `TpsProbe` samples it once per second on a `System.Threading.Timer` and derives tick-rate averages over sliding 1/5/30/60-second windows. Plugin timers run on their own threads — the probe wraps sampling in `try/catch` so "sampling errors never take down the host."

Console commands that match no built-in server command are routed to plugins via the native `HandleConsoleCommand` hook, so `/tps` works from the server console too. See [Server Console & CLI](/slop-docs/server/console/).

Files: `samples/TpsPlugin/TpsPlugin.cs`, `Minecraft.Server.FourKit/Command/CommandExecutor.cs`, `Minecraft.Server.FourKit/Command/PluginCommand.cs`

## FourKitTestPlugin — exercising the wider API

`FourKitTestPlugin` registers `/fktest <subcommand>` and drives most of the FourKit surface. It is the best reference for real API calls. Selected subcommands:

| `/fktest …` | Exercises |
|---|---|
| `world` | `player.getLocation()`, `world.getSpawnLocation()`, `getSeed()`, `getTime()`, `getPlayers()`. |
| `chunks` | `world.getLoadedChunks()`, `world.isChunkInUse(x,z)`, `chunk.isLoaded()`. |
| `snapshot [biome]` | `chunk.getChunkSnapshot(...)`, `snap.getBlockTypeId`, `getHighestBlockYAt`, biome temp/rain. |
| `entities` | `chunk.getEntities()`, `entity.getEntityId()`. |
| `loadchunk [dx dz]` | `world.loadChunk`, `unloadChunk`, `unloadChunkRequest(safe:true)`. |
| `enderchest` | `player.getEnderChest()`, `inv.getItem(i)`, `item.getAmount()`, `getDurability()`. |
| `disenchant` | `ItemStack` + `ItemMeta.addEnchant(...)`; verifies `setDurability` preserves enchants. |
| `setblock` | `world.getBlockAt(...)`, `block.setTypeIdAndData(35, 14, true)`, read-back, restore. |
| `chatcolor` | `ChatColor` parse/strip/translate (`COLOR_CHAR == §`, `translateAlternateColorCodes`, `stripColor`). |
| `scatter [N]` | `FourKit.getOnlinePlayers()`, `world.getHighestBlockYAt`, `player.teleport(new Location(...))`. |
| `tps` | Same TPS probe as `TpsPlugin`. |
| `hookchunks` / `watchchunks` | On-demand chunk-event subscription and verbose logging toggle. |

A representative call — placing and restoring a block via the world API:

```csharp
var block = world.getBlockAt(bx, by, bz);
int originalType = block.getTypeId();
byte originalData = block.getData();

const int WOOL_ID = 35;  const byte RED_WOOL_DATA = 14;
bool wrote = block.setTypeIdAndData(WOOL_ID, RED_WOOL_DATA, true);
// ... verify getTypeId()/getData() ...
block.setTypeId(originalType, false);   // restore
```

The plugin also shows a robust logging pattern: it writes to both the console and a log file, trying `server.log` in shared-write mode first and falling back to `plugins/<name>/fkplugin.log` (via `dataDirectory`) if the C++ host holds the main log exclusively.

Files: `samples/FourKitTestPlugin/FourKitTestPlugin.cs`

## Deploying to `plugins/`

Build the plugin, then place its DLL under the `plugins/` folder next to `Minecraft.Server.exe` (staged by the build; see the [architecture page](/slop-docs/server/fourkit/#publish-and-staging-dotnet-publish--runtime--plugins)). The loader supports two layouts:

| Layout | Rule |
|---|---|
| `plugins/MyPlugin.dll` | Loose DLL directly in the root. |
| `plugins/MyPlugin/MyPlugin.dll` | Subfolder whose **main DLL name must match the folder name**. Other DLLs in that folder are treated as dependencies. |

On startup the loader instantiates every non-abstract `ServerPlugin` in each DLL, enables them (setting `serverDirectory`/`dataDirectory`, then `onEnable`), and logs `Loaded plugin: <name> v<version> by <author>`. Failures fire a `PluginLoadFailedEvent` and log an error but don't stop the server.

**Dependencies:** because each plugin loads into its own `PluginLoadContext`, put any dependency DLLs alongside the plugin in `plugins/<Plugin>/` (resolved via `AssemblyDependencyResolver` and a same-folder fallback), or bundle them into a single DLL with a tool like Fody Costura.

**No hot-reload:** `PluginLoadContext` is created with `isCollectible: false` by design. Plugins are loaded once at startup and disabled at shutdown — there is no reload command. Restart the server to pick up a changed plugin DLL.

Files: `Minecraft.Server.FourKit/PluginLoader.cs`, `PluginLoadContext.cs`

## Parity status: everything is PORTED

`docs/FOURKIT_PARITY.md` is the canonical event-parity reference. Phase-1 reconnaissance found that every donor hook-bearing source file was byte-identical to vanilla in this repo, so the donor's full hook set was applied verbatim. **Status is PORTED for every event, with no known gaps at time of writing.**

Explicitly **out of scope** (per the locked plan), so don't expect these:

| Not available | Reason |
|---|---|
| Hot-reload | `PluginLoadContext` is non-collectible by design. |
| Permission system | Not ported. |
| Async / thread-safety hardening of the dispatcher | Dispatcher is snapshot-on-write but not designed for concurrent event firing. |
| Events beyond donor parity | Only the donor's hook set exists. |
| Managed unit tests | No test project for the API surface. |

The mapped hook sites — player lifecycle in `PendingConnection.cpp`/`PlayerConnection.cpp`, gameplay in the `handle*` methods, block/world hooks in the 17 bulk-copied `Minecraft.World/` files, and console commands in `ServerCliEngine.cpp` — are enumerated in the [FourKit Events reference](/slop-docs/reference/fourkit-events/).

Files: `docs/FOURKIT_PARITY.md`

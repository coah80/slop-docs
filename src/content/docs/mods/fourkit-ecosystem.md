---
title: FourKit Plugins
description: How to extend a neoLegacy dedicated server without forking the engine — the plugins/ install flow, what plugins can and cannot do, running a plugin server, the three sample plugins, and distributing your plugin as a .dll.
---

FourKit is the one place in neoLegacy where you can add server-side behavior **without forking and rebuilding the engine**. A client mod is a source patch (see [Mods & Distribution](/slop-docs/mods/overview/)); a FourKit plugin is a self-contained `.dll` you drop into a folder. The server hosts a bundled .NET 10 runtime, discovers your plugin at startup, and dispatches gameplay events to it Bukkit-style.

This page is the ecosystem/operator view: how plugins install, what they can and can't touch, how to run a plugin-capable server, and how to ship a plugin. For the C++↔C# bridge internals see the [FourKit Plugin System](/slop-docs/server/fourkit/) architecture page; for the practical csproj/lifecycle walkthrough see [Writing FourKit Plugins](/slop-docs/server/fourkit-plugins/).

FourKit is a neoLegacy addition with **no vanilla-LCE analog** — original Legacy Console Edition had neither a dedicated server nor any scripting surface.

## You need the FourKit server flavour

Plugins only run under the **`Minecraft.Server.FourKit`** build, never the vanilla `Minecraft.Server`. Both produce a binary literally named `Minecraft.Server.exe`; the difference is that the FourKit exe was compiled with `-DMINECRAFT_SERVER_FOURKIT_BUILD`, which flips `FourKitBridge.h` from inline no-op stubs into a real CLR host. The vanilla exe links empty stubs and has zero plugin support — dropping a DLL next to it does nothing.

| You have | Plugins? |
|---|---|
| `neoLegacyServerWindows64.zip` (vanilla) | No — no plugin host. |
| `neoLegacyServerWindows64-FourKit.zip` | Yes — ships the .NET 10 runtime and an empty `plugins/`. |

Grab the FourKit zip from the `Nightly-Server` release (or build the `Minecraft.Server.FourKit` target yourself). See [Deployment](/slop-docs/server/deployment/) for build/run and [Mods & Distribution](/slop-docs/mods/overview/#distribution-channels) for where the zips come from.

Files: `Minecraft.Server.FourKit/CMakeLists.txt`, `Minecraft.Server/FourKitBridge.h`

## Install flow: the `plugins/` directory

The FourKit build stages two folders next to the exe: `runtime/` (the self-contained .NET 10 payload — `Minecraft.Server.FourKit.dll`, `hostfxr.dll`, `coreclr.dll`, etc.) and an empty `plugins/`. Installing a plugin is copying a DLL into `plugins/` and restarting.

```
Minecraft.Server.exe
runtime/                          <- bundled .NET 10; do not touch
  Minecraft.Server.FourKit.dll
  hostfxr.dll ...
plugins/                          <- your plugins go here
  HelloPlugin.dll                 <- loose-DLL layout
  MyPlugin/                       <- subfolder layout
    MyPlugin.dll                  (main DLL name MUST match folder)
    SomeDependency.dll            (extra DLLs = dependencies)
```

`PluginLoader` scans two layouts (`Minecraft.Server.FourKit/PluginLoader.cs`):

| Layout | Rule |
|---|---|
| `plugins/MyPlugin.dll` | A loose DLL directly in `plugins/`. |
| `plugins/MyPlugin/MyPlugin.dll` | A subfolder whose **main DLL name matches the folder name**. Other DLLs in that folder are treated as dependencies. |

On startup the loader instantiates every non-abstract `ServerPlugin` subtype it finds, sets each plugin's `serverDirectory` (the server root) and `dataDirectory` (`plugins/<name>/`, created if missing), then calls `onEnable()` and logs `Loaded plugin: <name> v<version> by <author>`. A plugin that throws fires a `PluginLoadFailedEvent` and logs an error but **does not stop the server** — other plugins still load.

**No hot-reload.** Each plugin loads into its own `PluginLoadContext`, created `isCollectible: false` by design. There is no reload command — to update a plugin, replace the DLL and restart the server.

Files: `Minecraft.Server.FourKit/PluginLoader.cs`, `Minecraft.Server.FourKit/PluginLoadContext.cs`, `Minecraft.Server.FourKit/Plugin/ServerPlugin.cs`

## What plugins can and cannot do

FourKit's surface is exactly two directions of function pointers bridged across the C++/C# boundary. Understanding the split tells you the ceiling of what a plugin can do.

- **Events in (C++ → C#, the `Fire*` path):** the engine notifies plugins of things that happened, and cancellable events let a plugin veto or mutate them.
- **API out (C# → C++, the `Native*` path, exposed as `FourKit.*`):** plugins act on the world — teleport players, set tiles, open inventories, broadcast chat, strike lightning.

### The event surface (what you can react to)

Every event in `docs/FOURKIT_PARITY.md` is marked **PORTED** with no known gaps at time of writing (Phase-1 recon found the donor's hook-bearing files byte-identical to vanilla, so the full hook set was applied verbatim). The categories:

| Category | Examples of what fires |
|---|---|
| Server lifecycle | world save (autosave), plugin enable/disable, host startup/shutdown |
| Player lifecycle | pre-login, login, join, quit, kick, move, respawn (entity-id update) |
| Gameplay | chat, command, block place/break, entity/player damage & death, drop item, interact, pickup |
| Inventory | inventory open, inventory click, sign change |
| Block/world | block grow/form/burn/spread/from-to, piston extend/retract, chunk load/unload, structure grow |

You register a handler by extending `Listener` and annotating a method with `[EventHandler]`; `EventDispatcher` matches by the **exact runtime event type**, orders by `EventPriority` (`Lowest`→`Monitor`), and honors `IgnoreCancelled`. Cancellable events implement `Cancellable` — e.g. cancel a `BlockPlaceEvent` or rewrite a chat message. Full catalog: the [FourKit Events reference](/slop-docs/reference/fourkit-events/).

### The API surface (what you can do about it)

`public static class FourKit` is the entry point: `getWorld(name|dimId)`, `getPlayer`/`getOnlinePlayers`, `addListener`, `getCommand(name)` (register `/commands`), `broadcastMessage` (truncated to `MAX_CHAT_LENGTH = 123`), `createInventory`, `getServerTick`, plugin enable/disable. Underneath, ~80 `Native*` callbacks cover player admin (kick/ban/teleport/gamemode/health), world edits (get/set tile, explosion, lightning, weather, time, spawn), inventory/item-meta, entity state, experience/food, particles, vehicles, chunks, and block-light/biome queries.

### What plugins **cannot** do (out of scope, per the locked plan)

| Not available | Reason |
|---|---|
| Hot-reload | `PluginLoadContext` is non-collectible by design; restart to update. |
| Permission system | Not ported — no per-player permission nodes. |
| Async / thread-safe event firing | The dispatcher is snapshot-on-write for reads but is not designed for concurrent `Fire()` across threads. |
| Events beyond donor parity | Only the donor's hook set exists; you can't add new native hook sites from a plugin. |
| Client-side changes | FourKit is server-only. Anything that changes the client (new blocks, textures, UI) is a client fork, not a plugin. |

That last row is the ecosystem boundary: **a plugin cannot add a new block or texture** — that requires patching `Minecraft.World`/`Minecraft.Client` and rebuilding the client (see [Mods & Distribution](/slop-docs/mods/overview/)). A plugin operates on content that already exists.

Files: `docs/FOURKIT_PARITY.md`, `Minecraft.Server.FourKit/FourKit.cs`, `Minecraft.Server.FourKit/EventDispatcher.cs`

### The high-frequency-event cost

Three events — `PlayerMoveEvent`, `ChunkLoadEvent`, `ChunkUnloadEvent` — are gated by a subscription mask. The native side skips marshaling them entirely unless a plugin subscribes. **Subscribing to any of them turns off that fast path for the whole server** and has a real per-tick cost under load, and there is no unregister. Subscribe to move/chunk events only when you actually need them (the `FourKitTestPlugin` gates its chunk listener behind an explicit `/fktest hookchunks` for exactly this reason). Details on the [architecture page](/slop-docs/server/fourkit/#subscription-mask-optimization).

## Running a plugin server

The operational path, end to end:

1. **Get the FourKit runtime.** Extract `neoLegacyServerWindows64-FourKit.zip`, or build the `Minecraft.Server.FourKit` target. Confirm `runtime/` and `plugins/` exist next to `Minecraft.Server.exe`.
2. **Drop your plugin DLL** into `plugins/` (loose or in a matching subfolder).
3. **Configure** via `server.properties` (port, whitelist, security, mob caps, gamerules). See [Server Configuration](/slop-docs/server/configuration/).
4. **Run.** On Windows, run the exe. On Linux you run it under Wine with an Xvfb virtual display (the server links the full client render stack, so it needs a display even headless). The Wine launcher scripts from `build-linux.sh` (`minecraft-lce-fourkit`) handle this. **Note the Docker image is vanilla-only** — the FourKit image is intentionally not published because self-contained .NET 10 through Wine is unvalidated. See [Deployment](/slop-docs/server/deployment/).
5. **Verify** in the console log: each loaded plugin prints `Loaded plugin: <name> v<version> by <author>`, and your `onEnable` output appears.
6. **Manage from the console.** Console lines that match no built-in command are routed to plugins (via the native `HandleConsoleCommand` hook), so a plugin's `/command` works from the server CLI too. See [Server Console & CLI](/slop-docs/server/console/).

`FourKitBridge::Initialize()` runs after the game is hosted and before the main loop, `FireWorldSave()` on each autosave, and `Shutdown()` early in teardown — so plugins are enabled once the world is up and disabled cleanly on stop.

Files: `Minecraft.Server/Windows64/ServerMain.cpp`, `build-linux.sh`

## The three sample plugins (starting points)

`samples/` ships three plugins, each `ProjectReference`-ing the FourKit host `<Private>false</Private>` + `<ExcludeAssets>runtime</ExcludeAssets>` (compile against the API contract only; the host loads the real assembly). They are the canonical starting points — copy one and edit.

| Sample | Use it as a starting point for | Demonstrates |
|---|---|---|
| `HelloPlugin` | A minimal event listener | `ServerPlugin` overrides + one `[EventHandler]`; greets each joining player via `PlayerJoinEvent.setJoinMessage`. |
| `TpsPlugin` | A command that reports state | Registering `/tps` with a `CommandExecutor`; polling `FourKit.getServerTick()` on a background timer for 1s/5s/30s/60s TPS windows. |
| `FourKitTestPlugin` | Learning the wider API | Broad smoke tests: worlds, chunks, chunk snapshots, entities, ender chest, `ItemStack`/`ItemMeta`, `ChatColor`, `setblock`, `teleport`, on-demand chunk-event subscription. Best reference for real API calls. |

The `HelloPlugin` skeleton in full:

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

    public override void onDisable() { }
}

internal sealed class HelloListener : Listener
{
    [EventHandler(Priority = EventPriority.Normal)]
    public void onPlayerJoin(PlayerJoinEvent e)
    {
        var playerName = e.getPlayer().getName();
        e.setJoinMessage($"Welcome, {playerName}!");
    }
}
```

For the csproj setup, the `ServerPlugin` lifecycle members, command registration, and the full `FourKitTestPlugin` subcommand table, see [Writing FourKit Plugins](/slop-docs/server/fourkit-plugins/).

Files: `samples/HelloPlugin/`, `samples/TpsPlugin/`, `samples/FourKitTestPlugin/`

## Distributing your plugin as a `.dll`

A FourKit plugin distributes exactly like a Bukkit plugin: as a **single `.dll` an operator drops into `plugins/`**. No engine fork, no rebuild of the server, no full-game zip — this is the whole point of the plugin path.

Build tips that make a plugin distributable:

- **Keep the FourKit reference `Private=false` / `ExcludeAssets=runtime`.** The `PluginLoadContext` shares the *host's* single FourKit assembly with every plugin so `ServerPlugin`, event types, etc. are the same `Type` instances. Copying the host assembly into your output produces a duplicate assembly and type-identity mismatches. All three samples ship this exact `ItemGroup`.
- **Ship dependencies alongside the DLL.** Because each plugin gets its own load context, put dependency DLLs in `plugins/<Plugin>/` (resolved via `AssemblyDependencyResolver` + a same-folder fallback), or bundle everything into one DLL with a tool like Fody Costura so it stays a single-file drop.
- **Declare `name`** (the loader warns if it's missing) — it also names your `dataDirectory` (`plugins/<name>/`). `version` defaults to `"1.0.0"` and `author` to `"Unknown"` if you don't override them.
- **Target `net10.0` with `EnableDynamicLoading=true`** so the assembly loads cleanly as a component.

Because plugins are host-agnostic single files, distribution is trivial: attach the DLL to a release, post it in the community Discord, or ship a `plugins/` folder — any operator running a FourKit server of the same era can use it as-is. (There is no version handshake between plugin and host beyond the shared FourKit assembly; a plugin built against an incompatible API version will fail to load and log an error rather than crash the server.)

Files: `samples/HelloPlugin/HelloPlugin.csproj`, `Minecraft.Server.FourKit/PluginLoadContext.cs`

## neoLegacy vs vanilla LCE

| Aspect | Vanilla LCE (TU19-era) | neoLegacy FourKit |
|---|---|---|
| Server-side plugins | None | Drop-in `.dll` into `plugins/` |
| Runtime | N/A | Bundled self-contained .NET 10 (no install needed) |
| Event surface | N/A | Full donor hook set, all PORTED |
| Distribution | N/A | Single DLL, host-agnostic — like Bukkit |
| Reload | N/A | None (restart to update) |

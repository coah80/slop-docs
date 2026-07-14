---
title: FourKit Event Reference
description: Every FourKit event a plugin can subscribe to, with its C# type, native hook site, cancellability, and payload fields.
---

The lookup table for FourKit plugin authors: every event the dedicated server dispatches
into managed code, the exact native C++ hook site that fires it, whether you can cancel it,
and the payload fields each event exposes. For how to write and register a listener, see
[FourKit plugins](/slop-docs/server/fourkit-plugins/) and [FourKit overview](/slop-docs/server/fourkit/).

**Extraction sources:**

- Event classes — `Minecraft.Server.FourKit/Event/**/*.cs` (57 files).
- Managed `[UnmanagedCallersOnly] Fire*/Handle*` entry points — `Minecraft.Server.FourKit/FourKitHost.Events.cs:18-1284`.
- Dispatcher — `Minecraft.Server.FourKit/EventDispatcher.cs:5-110`.
- Native `FourKitBridge::Fire*/Handle*` call sites — grepped across `Minecraft.World/`, `Minecraft.Client/`, `Minecraft.Server/` (each cited inline).
- Parity mapping — `docs/FOURKIT_PARITY.md`.

Every event listed here has parity status **PORTED** in `docs/FOURKIT_PARITY.md` — there are no
known compiled-but-never-firing events at time of writing.

## How dispatch works

The native engine calls a `FourKitBridge::Fire*` C++ function at each hook site. That function
marshals arguments (wide→UTF-8, coords, ids) and calls the matching managed
`[UnmanagedCallersOnly]` entry point in `FourKitHost.Events.cs`, which builds the event object and
calls `FourKit.FireEvent(evt)`. `FourKit.FireEvent` forwards to `EventDispatcher.Fire`, which:

- reads a lock-free `volatile Dictionary<Type, RegisteredHandler[]>` snapshot (`EventDispatcher.cs:26,88-91`),
- runs handlers sorted by `EventPriority` (`Lowest=0 → Monitor=5`, `EventHandlerAttribute.cs:27-40`),
- skips a handler when the event is already cancelled and the handler **did** set `IgnoreCancelled = true` (`EventDispatcher.cs:99`).

For a **cancellable** event, after the managed handlers run, the `Fire*` C++ function reads back
`isCancelled()` (returned to native as `cancelled != 0`) plus any mutated out-params (chat text,
kick/death messages, moved coords, item ids…) and applies them. If your plugin never subscribes to
a given type, `EventDispatcher.Fire` early-outs and nothing is marshalled.

### Subscription-mask optimization

Three high-frequency events — `PlayerMoveEvent`, `ChunkLoadEvent`, `ChunkUnloadEvent` — are gated
on the native side: `FirePlayerMove`, `FireChunkLoad`, and `FireChunkUnload` only marshal into C# if
a plugin has actually subscribed. The C# side (`FourKit.OnEventSubscribed`) maps those event types to
`HandlerKind` bits (`ChunkLoad=0, ChunkUnload=1, PlayerMove=2`) and pushes the mask to native via
`NativeBridge.SetHandlerMask`. If no plugin listens for these, they cost nothing.

### Cancellable interface

An event is cancellable when it implements `Cancellable` (`Event/Cancellable.cs`), i.e. it exposes
`bool isCancelled()` / `void setCancelled(bool)`. The **Cancel?** column below is derived from that
interface. A handful of events are mutable-but-not-cancellable — you can rewrite their payload
(join/quit message, dropped exp, death message) but not stop the action; those are noted.

---

## Server lifecycle

Fired from the dedicated-server main loop, not from a player packet. `PluginEnable`/`PluginDisable`/
`PluginsLoaded`/`PluginLoadFailed` come from the managed `PluginLoader`, not from a native hook.

| Event | C# type | Native hook site (file:function) | Cancel? | Payload fields |
|---|---|---|---|---|
| World save | `Event.World.WorldSaveEvent` | `Minecraft.Server/Windows64/ServerMain.cpp` autosave → `FourKitBridge::FireWorldSave` (`ServerMain.cpp:744`) | No | *(none)* |
| Plugins loaded | `Event.Server.PluginsLoadedEvent` | Managed only — `PluginLoader.LoadAll` (`PluginLoader.cs:80`) | No | *(none)* |
| Plugin load failed | `Event.Server.PluginLoadFailedEvent` | Managed only — `PluginLoader.LoadAll` (`PluginLoader.cs:60,74`) | No | `getFileName()`, `getMessage()` |
| Plugin enable | `Event.Server.PluginEnableEvent` | Managed only — `PluginLoader.EnableAll` (`PluginLoader.cs:155`) | No | `getPlugin()` → `ServerPlugin` |
| Plugin disable | `Event.Server.PluginDisableEvent` | Managed only — `PluginLoader.DisableAll` (`PluginLoader.cs:172`) | No | `getPlugin()` → `ServerPlugin` |

`FourKitBridge::Initialize` / `FourKitBridge::Shutdown` (`ServerMain.cpp` post-startup / early-shutdown)
are bridge lifecycle calls, not dispatched events — they load/unload the CLR and enable/disable plugins.
They are listed in `docs/FOURKIT_PARITY.md` under Server lifecycle but a plugin subscribes to
`PluginEnableEvent`/`PluginDisableEvent`, not to them directly.

---

## Player lifecycle

| Event | C# type | Native hook site (file:function) | Cancel? | Payload fields |
|---|---|---|---|---|
| Pre-login | `Event.Player.PlayerPreLoginEvent` | `Minecraft.Client/PendingConnection.cpp::handlePreLogin` → `FirePlayerPreLogin` (`:155`) | **Yes** | `getName()`, `getAddress()` → `InetSocketAddress` |
| Login (offline) | `Event.Player.PlayerLoginEvent` | `PendingConnection.cpp::handleLogin` → `FirePlayerLogin` (`:303`) | **Yes** | `getName()`, `getAddress()`, `getLoginType()` (`INITIAL`), `getOnlineXuid()` / `getOfflineXuid()` (+ setters, experimental) |
| Login (online) | `Event.Player.PlayerLoginEvent` | `PendingConnection.cpp::handleAcceptedLogin` → `FirePlayerLogin` (`:553`) | **Yes** | as above; `getLoginType()` = `ACCEPTED` |
| Join | `Event.Player.PlayerJoinEvent` | `Minecraft.Client/PlayerConnection.cpp::tick` first-tick gate → `FirePlayerJoin` (`:148`) | No | `getPlayer()`, `getJoinMessage()` / `setJoinMessage()` |
| Quit | `Event.Player.PlayerQuitEvent` | `PlayerConnection.cpp::disconnect` (`:221`) and `PlayerConnection.cpp::onDisconnect` (`:888`) → `FirePlayerQuit` | No | `getPlayer()`, `getQuitMessage()` / `setQuitMessage()` |
| Kick | `Event.Player.PlayerKickEvent` | `PlayerConnection.cpp::disconnect` → `FirePlayerKick` (`:208`) | **Yes** | `getReason()` / `setReason()` (`DisconnectReason`), `getLeaveMessage()` / `setLeaveMessage()`, `getPlayer()` |
| Move | `Event.Player.PlayerMoveEvent` | `PlayerConnection.cpp::handleMovePlayer` → `FirePlayerMove` (`:386`) | **Yes** | `getFrom()` / `setFrom()`, `getTo()` / `setTo()` → `Location`. *Subscription-gated.* |

`UpdatePlayerEntityId` (`FourKitHost.Events.cs:228`) is not an event — it is a native→managed
notification called at the two `respawn(...)` sites in `PlayerConnection.cpp` to remap a player's
entity id in the registry after respawn.

### DisconnectReason values (`Entity/DisconnectReason.cs`)

`NONE=0`, `QUITTING=1`, `CLOSED=2`, `LOGIN_TOO_LONG=3`, `ILLEGAL_STANCE=4`, `ILLEGAL_POSITION=5`,
`MOVED_TOO_QUICKLY=6`, `NO_FLYING=7`, `KICKED=8`, `TIME_OUT=9`, `OVERFLOW=10`, `END_OF_STREAM=11`,
`SERVER_FULL=12`, `OUTDATED_SERVER=13`, `OUTDATED_CLIENT=14` (plus further donor entries `UNEXPECTED_PACKET=15`…`NAT_MISMATCH=27` in the enum; mirrors `DisconnectPacket::eDisconnectReason`).

### LoginType values (`Enums/LoginType.cs`)

`INITIAL=1` (offline / first login packet), `ACCEPTED=2` (online / accepted login).

---

## Player gameplay

| Event | C# type | Native hook site (file:function) | Cancel? | Payload fields |
|---|---|---|---|---|
| Chat | `Event.Player.PlayerChatEvent` | `PlayerConnection.cpp::handleChat` → `FirePlayerChat` (`:1017`) | **Yes** | `getMessage()` / `setMessage()`, `getFormat()` / `setFormat()` (Java `%1$s`/`%2$s`), `getPlayer()`. `MAX_CHAT_LENGTH=123` |
| Command preprocess | `Event.Player.PlayerCommandPreprocessEvent` | `PlayerConnection.cpp::handleCommand` → `FireCommandPreprocess` (`:1039`) | **Yes** | `getMessage()` / `setMessage()`, `getPlayer()` |
| Player command | *(dispatched via `PluginCommand`, no event object)* | `PlayerConnection.cpp::handleCommand` → `HandlePlayerCommand` (`:1041`) | n/a | routed to `FourKit.DispatchCommand(player, line)` |
| Interact (use item / air) | `Event.Player.PlayerInteractEvent` | `PlayerConnection.cpp::handleUseItem` (via `FireBlockPlace` path), `handlePlayerAction` → `FirePlayerInteract` (`:614`) | **Yes** | `getAction()`, `getItem()`, `getMaterial()`, `getClickedBlock()`, `getBlockFace()`, `useItemInHand()` / `setUseItemInHand()`, `getPlayer()` |
| Interact (left-click air) | `Event.Player.PlayerInteractEvent` | `PlayerConnection.cpp::handleAnimate` → `FirePlayerInteract` (`:1430`) | **Yes** | as above |
| Interact entity | `Event.Player.PlayerInteractEntityEvent` | `PlayerConnection.cpp::handleInteract` → `FirePlayerInteractEntity` (`:1558`) | **Yes** | `getRightClicked()` → `Entity`, `getPlayer()` |
| Block place | `Event.Block.BlockPlaceEvent` | `PlayerConnection.cpp::handleUseItem` post `useItemOn` → `FireBlockPlace` (`:750`) | **Yes** | `getBlockPlaced()`, `getBlockAgainst()`, `getItemInHand()`, `getPlayer()` |
| Block break | `Event.Block.BlockBreakEvent` | `Minecraft.Client/ServerPlayerGameMode.cpp::destroyBlock` → `FireBlockBreak` (`:287`) | **Yes** | `getBlock()`, `getPlayer()`, `getExpToDrop()` / `setExpToDrop()` (from `BlockExpEvent`) |
| Drop item | `Event.Player.PlayerDropItemEvent` | `PlayerConnection.cpp::handlePlayerAction` (`DROP_ITEM`/`DROP_ALL_ITEMS`) → `FirePlayerDropItem` (`:526`); also `Minecraft.World/AbstractContainerMenu.cpp::clicked` (`:262`) | **Yes** | `getItemDrop()` / `setItemDrop()` → `ItemStack`, `getPlayer()` |
| Pickup item | `Event.Player.PlayerPickupItemEvent` | `Minecraft.World/ItemEntity.cpp::playerTouch` → `FirePlayerPickupItem` (`:245`) | **Yes** | `getItem()` → `Item`, `getRemaining()`, `getPlayer()` |
| Bed enter | `Event.Player.PlayerBedEnterEvent` | `Minecraft.Client/ServerPlayer.cpp::startSleepInBed` → `FireBedEnter` (`:1142`) | **Yes** | `getBed()` → `Block`, `getPlayer()` |
| Bed leave | `Event.Player.PlayerBedLeaveEvent` | `ServerPlayer.cpp::stopSleepInBed` → `FireBedLeave` (`:1172`) | No | `getBed()` → `Block`, `getPlayer()` |
| Teleport | `Event.Player.PlayerTeleportEvent` | `Minecraft.World/ThrownEnderpearl.cpp::onHit` (`:101`); `Minecraft.Client/TeleportCommand.cpp::execute` (`:43`) → `FirePlayerTeleport` | **Yes** *(via `PlayerMoveEvent`)* | `getFrom()`, `getTo()`, `setFrom()`/`setTo()`, `getCause()` (`TeleportCause`) |
| Portal | `Event.Player.PlayerPortalEvent` | `Minecraft.Client/ServerPlayer.cpp::changeDimension` → `FirePlayerPortal` (`:1041`) | **Yes** | inherits `PlayerTeleportEvent`; `getCause()` |

**`PlayerInteractEvent.Action`** values are supplied natively: `USE_ITEM` (face 255), `RIGHT_CLICK_BLOCK`
(face ≠ 255), `LEFT_CLICK_BLOCK` (`handlePlayerAction::START_DESTROY_BLOCK`), `LEFT_CLICK_AIR`
(`handleAnimate::SWING`), per `docs/FOURKIT_PARITY.md`.

**`TeleportCause`** (`Player/PlayerTeleportEvent.cs`): `ENDER_PEARL`, `COMMAND`, `PLUGIN`,
`NETHER_PORTAL`, `END_PORTAL`, `UNKNOWN`.

---

## Entity

| Event | C# type | Native hook site (file:function) | Cancel? | Payload fields |
|---|---|---|---|---|
| Entity damage | `Event.Entity.EntityDamageEvent` | `Minecraft.World/LivingEntity.cpp::hurt` → `FireEntityDamage` (`:820`) | **Yes** | `getCause()` (`DamageCause`), `getDamage()` / `setDamage()`, `getFinalDamage()`, `getEntity()`, `getEntityType()` |
| Entity damage by entity | `Event.Entity.EntityDamageByEntityEvent` | `LivingEntity.cpp::hurt` → `FireEntityDamage` when a damager entity is present (`FourKitHost.Events.cs:412`) | **Yes** | inherits `EntityDamageEvent` + `getDamager()` |
| Entity death | `Event.Entity.EntityDeathEvent` | `Minecraft.World/LivingEntity.cpp::die` → `FireEntityDeath` (`:980`) | No | `getEntity()` → `LivingEntity`, `getDrops()` → `List<ItemStack>`, `getDroppedExp()` / `setDroppedExp()` |
| Player death | `Event.Entity.PlayerDeathEvent` | `Minecraft.Client/ServerPlayer.cpp::die` → `FirePlayerDeath` (`:783`) | No | inherits `EntityDeathEvent`; `getDeathMessage()` / `setDeathMessage()`, `getNewExp()` / `setNewExp()`, `getNewLevel()` / `setNewLevel()`, `getKeepLevel()` / `setKeepLevel()`, `getKeepInventory()` / `setKeepInventory()` |

`EntityDeathEvent` / `PlayerDeathEvent` are not cancellable — you can mutate drops, dropped exp,
respawn exp/level, keep-inventory/keep-level flags and (for players) the death message, but the death
itself proceeds.

### DamageCause values (`Entity/EntityDamageEvent.cs`)

`BLOCK_EXPLOSION`, `CONTACT`, `CUSTOM`, `DROWNING`, `ENTITY_ATTACK`, `ENTITY_EXPLOSION`, `FALL`,
`FALLING_BLOCK`, `FIRE`, `FIRE_TICK`, `LAVA`, `LIGHTNING`, `MAGIC`, `MELTING`, `POISON`, `PROJECTILE`,
`STARVATION`, `SUFFOCATION`, `SUICIDE`, `THORNS`, `VOID`, `WITHER`.

---

## Inventory

| Event | C# type | Native hook site (file:function) | Cancel? | Payload fields |
|---|---|---|---|---|
| Inventory open | `Event.Inventory.InventoryOpenEvent` | `Minecraft.Client/ServerPlayer.cpp::startCrafting` and the other `Fire*` container sites in `ServerPlayer.cpp` (`:1220`–`:1574`) → `FireInventoryOpen` | **Yes** | `getPlayer()` → `HumanEntity`, `getInventory()`, `getView()`, `getViewers()` |
| Inventory click | `Event.Inventory.InventoryClickEvent` | `PlayerConnection.cpp::handleContainerClick` → `FireInventoryClick` (`:2034`) | **Yes** *(via `InventoryInteractEvent`)* | `getSlot()`, `getRawSlot()`, `getSlotType()`, `getClick()` (`ClickType`), `getAction()` (`InventoryAction`), `getCurrentItem()` / `setCurrentItem()`, `getCursor()` / `setCursor()`, `getClickedInventory()`, `getHotbarButton()`, `getWhoClicked()`, `isLeftClick()` / `isRightClick()` / `isShiftClick()` |
| Sign change | `Event.Block.SignChangeEvent` | `PlayerConnection.cpp::handleSignUpdate` → `FireSignChange` (`:2230`) | **Yes** | `getLines()`, `getLine(i)` / `setLine(i, s)` (i∈0..3), `getPlayer()`, `getBlock()` |

`InventoryInteractEvent` is the abstract cancellable base of `InventoryClickEvent`; it is not emitted
directly (`Inventory/InventoryInteractEvent.cs`). `InventoryEvent` (its base) is non-cancellable.

### ClickType values (`Inventory/ClickType.cs`)

`LEFT`, `SHIFT_LEFT`, `RIGHT`, `SHIFT_RIGHT`, `WINDOW_BORDER_LEFT`, `WINDOW_BORDER_RIGHT`, `MIDDLE`,
`NUMBER_KEY`, `DOUBLE_CLICK`, `DROP`, `CONTROL_DROP`, `CREATIVE`, `UNKNOWN`.

### InventoryAction values (`Inventory/InventoryAction.cs`)

`NOTHING`, `PICKUP_ALL`, `PICKUP_SOME`, `PICKUP_HALF`, `PICKUP_ONE`, `PLACE_ALL`, `PLACE_SOME`,
`PLACE_ONE`, `SWAP_WITH_CURSOR`, `DROP_ALL_CURSOR`, `DROP_ONE_CURSOR`, `DROP_ALL_SLOT`, `DROP_ONE_SLOT`,
`MOVE_TO_OTHER_INVENTORY`, `HOTBAR_MOVE_AND_READD`, `HOTBAR_SWAP`, `CLONE_STACK`, `COLLECT_TO_CURSOR`,
`UNKNOWN`.

---

## Block / world

These fire from tile-tick and world logic in `Minecraft.World/` (17 hook-bearing files bulk-copied
from the donor) plus `ServerLevel`/`ServerChunkCache` in `Minecraft.Client/`.

| Event | C# type | Native hook site (file:function) | Cancel? | Payload fields |
|---|---|---|---|---|
| Block grow | `Event.Block.BlockGrowEvent` | `Minecraft.World/CactusTile.cpp::tick` (`:63`), plus `CocoaTile`/`CropTile`/`ReedTile`/`StemTile`/`NetherWartTile` `tick` → `FireBlockGrow` | **Yes** | `getBlock()`, `getNewState()` → `BlockState` |
| Block form | `Event.Block.BlockFormEvent` | `Minecraft.Client/ServerLevel.cpp::tickTiles` → `FireBlockForm` (`:586`, `:593`) | **Yes** | inherits `BlockGrowEvent`; `getBlock()`, `getNewState()` |
| Block spread | `Event.Block.BlockSpreadEvent` | `Minecraft.World/GrassTile.cpp::tick` (`:126`), `Mushroom.cpp` (`:57`), `FireTile.cpp` (`:243`) → `FireBlockSpread` | **Yes** | inherits `BlockFormEvent`; `getSource()`, `getBlock()`, `getNewState()` |
| Block burn | `Event.Block.BlockBurnEvent` | `Minecraft.World/FireTile.cpp::checkBurnOut` → `FireBlockBurn` (`:270`) | **Yes** | `getBlock()` |
| Block from-to | `Event.Block.BlockFromToEvent` | `Minecraft.World/LiquidTileDynamic.cpp::trySpreadTo` (`:196`); `EggTile.cpp` (`:82`) → `FireBlockFromTo` | **Yes** | `getBlock()`, `getToBlock()`, `getFace()` (`BlockFace`) |
| Piston extend | `Event.Block.BlockPistonExtendEvent` | `Minecraft.World/PistonBaseTile.cpp::triggerEvent` → `FirePistonExtend` (`:270`) | **Yes** | `getDirection()`, `isSticky()`, `getLength()`, `getBlocks()`, `getBlock()` |
| Piston retract | `Event.Block.BlockPistonRetractEvent` | `PistonBaseTile.cpp::triggerEvent` → `FirePistonRetract` (`:302`) | **Yes** | `getDirection()`, `isSticky()`, `getRetractLocation()`, `getBlock()` |
| Structure grow | `Event.World.StructureGrowEvent` | `Minecraft.World/Sapling.cpp::growTree` (`:213`); `Mushroom.cpp::growTree` (`:99`) → `FireStructureGrow` | **Yes** | `getSpecies()` (`TreeType`), `getLocation()`, `isFromBonemeal()`, `getPlayer()` (nullable) |
| Chunk load | `Event.World.ChunkLoadEvent` | `Minecraft.Client/ServerChunkCache.cpp::create` → `FireChunkLoad` (`:215`) | No | `getChunk()`, `isNewChunk()`. *Subscription-gated.* |
| Chunk unload | `Event.World.ChunkUnloadEvent` | `ServerChunkCache.cpp::tick` → `FireChunkUnload` (`:961`) | **Yes** | `getChunk()`. *Subscription-gated.* |

`BlockExpEvent` (`Event/Block/BlockExpEvent.cs`) is the non-cancellable base carrying
`getExpToDrop()` / `setExpToDrop()`; `BlockBreakEvent` extends it. `BlockEvent` (`Event/Block/BlockEvent.cs`)
is the abstract non-cancellable root of the block events.

### TreeType values (`Enums/TreeType.cs`)

`None=0`, `SPRUCE=1`, `BIRCH=2`, `JUNGLE=3`, `BIG_OAK=4` (plus further donor entries in the enum). Used
by `StructureGrowEvent.getSpecies()`.

---

## Console / commands

Console-line handling is not an `Event` object — unknown console lines are routed to plugin commands.

| Hook | Managed entry point | Native hook site (file:function) | Behavior |
|---|---|---|---|
| Console command | `HandleConsoleCommand` (`FourKitHost.Events.cs:920`) | `Minecraft.Server/Console/ServerCliEngine.cpp` unknown-command branch → `FourKitBridge::HandleConsoleCommand` (`:167`) | routes the line to `FourKit.DispatchCommand(consoleSender, line)`; returns handled/not-handled |
| Plugin command help | `GetPluginCommandHelp` (`FourKitHost.Events.cs:950`) | `ServerCliEngine.cpp` suggest-names branch → `FourKitBridge::GetPluginCommandHelp` | feeds plugin command help text into the built-in `help` command |

Player-issued commands go through `HandlePlayerCommand` (see Player gameplay above). All three funnel
into `FourKit.DispatchCommand` and the `PluginCommand` / `CommandExecutor` API rather than firing an
event listener.

---

## Event class hierarchy (for `@EventHandler` typing)

Subscribe to the most specific type you need; the dispatcher matches on the exact runtime type of the
fired object, so a handler for `EntityDamageEvent` will **not** receive `EntityDamageByEntityEvent`
(the fired type) unless you also register a handler for the subclass.

```
Event                                   (Event/Event.cs)
├─ BlockEvent                           (abstract)
│  ├─ BlockExpEvent → BlockBreakEvent
│  ├─ BlockBurnEvent
│  ├─ BlockFromToEvent
│  ├─ BlockGrowEvent → BlockFormEvent → BlockSpreadEvent
│  ├─ BlockPistonEvent (abstract) → BlockPistonExtendEvent / BlockPistonRetractEvent
│  ├─ BlockPlaceEvent
│  └─ SignChangeEvent
├─ EntityEvent (abstract)
│  ├─ EntityDamageEvent → EntityDamageByEntityEvent
│  └─ EntityDeathEvent → PlayerDeathEvent
├─ InventoryEvent
│  ├─ InventoryOpenEvent
│  └─ InventoryInteractEvent (abstract) → InventoryClickEvent
├─ PlayerEvent (abstract)
│  ├─ PlayerJoinEvent / PlayerQuitEvent / PlayerKickEvent
│  ├─ PlayerChatEvent / PlayerCommandPreprocessEvent
│  ├─ PlayerMoveEvent → PlayerTeleportEvent → PlayerPortalEvent
│  ├─ PlayerInteractEvent / PlayerInteractEntityEvent
│  ├─ PlayerDropItemEvent / PlayerPickupItemEvent
│  └─ PlayerBedEnterEvent / PlayerBedLeaveEvent
├─ PlayerPreLoginEvent / PlayerLoginEvent   (extend Event directly, not PlayerEvent)
├─ ServerEvent (abstract)
│  ├─ PluginLoadFailedEvent / PluginsLoadedEvent
│  └─ PluginEvent (abstract) → PluginEnableEvent / PluginDisableEvent
└─ WorldEvent
   ├─ WorldSaveEvent
   ├─ ChunkEvent (abstract) → ChunkLoadEvent / ChunkUnloadEvent
   └─ StructureGrowEvent
```

Note that `PlayerPreLoginEvent` and `PlayerLoginEvent` derive from `Event` directly (they carry an
`InetSocketAddress`, not a resolved `Player`), so they are **not** caught by a `PlayerEvent` handler.

## Related pages

- [FourKit plugins](/slop-docs/server/fourkit-plugins/) — writing and registering a listener.
- [FourKit overview](/slop-docs/server/fourkit/) — the C#↔C++ bridge and plugin loader.

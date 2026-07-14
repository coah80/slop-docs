---
title: Multiplayer & Client Networking
description: The ClientConnection packet handler, the MultiPlayerLevel/LocalPlayer/GameMode/ChunkCache client world, server-to-client EntityTracker sync, the CGameNetworkManager platform abstraction (and its Sony PSN and desktop-stub backends), and the embedded MinecraftServer the client hosts local games with.
---

The client is also a server. Every world — even a single-player one — runs an
embedded `MinecraftServer` that a `ClientConnection` talks to over the same
`Packet` protocol used for real multiplayer. This means the code splits into a
**client half** (`ClientConnection` → `MultiPlayerLevel`) and a **server half**
(`MinecraftServer` → `ServerLevel` → `PlayerList`), joined by a
platform-abstracted transport (`CGameNetworkManager`).

Files: `ClientConnection.h`/`.cpp`, `MultiPlayerLevel.*`,
`MultiPlayerLocalPlayer.*`, `MultiPlayerGameMode.*`, `MultiPlayerChunkCache.*`,
`RemotePlayer.*`, `EntityTracker.*`, `TrackedEntity.*`, `PlayerList.*`,
`PlayerInfo.h`, `MinecraftServer.*`, `ServerLevel.*`, `ServerChunkCache.*`,
`ServerPlayer.*`, `PendingConnection.*`, `ServerConnection.*`,
`PlayerConnection.*`, `Common/Network/`.

## The client half

### ClientConnection — the packet router

`ClientConnection : public PacketListener` (`ClientConnection.h:10`) is the
client's inbound-packet handler and the single biggest file in the client
(`ClientConnection.cpp`, ~4000 lines). It `friend`s `MultiPlayerLevel` and holds
the `Connection`, the `MultiPlayerLevel* level`, and a `SavedDataStorage*`. It
overrides one `handle*` method per packet type — over sixty of them. A
representative slice:

| Category | Handlers |
|----------|----------|
| Login / handshake | `handlePreLogin`, `handleLogin`, `handleDisconnect` |
| Entity spawn | `handleAddEntity`, `handleAddMob`, `handleAddPlayer`, `handleAddPainting`, `handleAddExperienceOrb`, `handleAddGlobalEntity` |
| Entity movement | `handleMoveEntity`, `handleMoveEntitySmall`, `handleTeleportEntity`, `handleRotateMob`, `handleSetEntityMotion`, `handleMovePlayer` |
| Entity state | `handleSetEntityData`, `handleEntityEvent`, `handleEntityLinkPacket`, `handleRemoveEntity`, `handleUpdateAttributes` |
| World / chunk | `handleChunkVisibility(Area)`, `handleChunkTilesUpdate`, `handleBlockRegionUpdate`, `handleTileUpdate`, `handleTileEvent`, `handleLevelEvent`, `handleSetTime` |
| Container / inventory | `handleContainerOpen/Close/Ack`, `handleContainerSetSlot/Content/Data`, `handleSetEquippedItem` |
| Player | `handleSetHealth`, `handleSetExperience`, `handleRespawn`, `handlePlayerAbilities`, `handleAwardStat` |
| Scoreboard | `handleAddObjective`, `handleSetScore`, `handleSetDisplayObjective`, `handleSetPlayerTeamPacket` |
| 4J/neoLegacy added | `handleServerSettingsChanged`, `handleTexture`, `handleTextureAndGeometry`, `handleTextureChange`, `handleUpdateProgress`, `handleUpdateGameRuleProgressPacket`, `handleXZ` |

`Minecraft` keeps one connection per pad in
`ClientConnection* m_pendingLocalConnections[XUSER_MAX_COUNT]`, retrieved with
`Minecraft::getConnection(int iPad)` (`Minecraft.h:113`, `295`). Because a
splitscreen session opens one connection **per local player**, `MultiPlayerLevel`
stores them as a `vector<ClientConnection*> connections`
(`MultiPlayerLevel.h:38`).

#### neoLegacy: primary-connection deduplication

With multiple local connections into the same world, shared entity/chunk state
would be applied several times. neoLegacy adds a **primary-connection** filter
(`ClientConnection.cpp:196-204`):

```cpp
bool ClientConnection::shouldProcessForEntity(int entityId) const
{
    if (g_NetworkManager.IsHost()) return true;
    if (m_userIndex == ProfileManager.GetPrimaryPad()) return true;
    ClientConnection* primary = findPrimaryConnection();
    if (primary == nullptr) return true;
    return !primary->isTrackingEntity(entityId);
}
```

Each connection tracks its own `m_trackedEntityIds` and `m_visibleChunks`
(`ClientConnection.h:49-50`). On a non-host client, a secondary pad only applies
an entity or block-region packet if the primary pad's connection is *not* already
tracking it — so world state is applied exactly once. `shouldProcessForPosition`
does the same for chunk coordinates via a packed `chunkKey(x, z)`
(`ClientConnection.h:55`).

#### neoLegacy: fork-server protocol & custom encryption

The custom-payload handler recognises three neoLegacy control channels
(`ClientConnection.cpp:3937-3966`):

- **`MC|ForkHello`** — sets `m_isForkServer = true`, enabling a
  "render-distance-independent player list" (a fork/dedicated server can report
  players the client hasn't loaded chunks for). Without it, the player list falls
  back to the old behaviour (`ClientConnection.cpp:1178-1180`).
- **`MC|ForkPLeave`** — cleans up an `IQNet` slot when a fork-server player
  leaves, so they disappear from the Tab list.
- **`MC|CKey`** — a client cipher-key ack (`SendAckAndActivateClientSendCipher`),
  part of a neoLegacy encrypted-channel handshake not present in vanilla TU19.

#### Deferred entity links

A ride/leash packet can arrive before the entity it references. `ClientConnection`
buffers these in an inner `DeferredEntityLinkPacket`
(`ClientConnection.h:172-181`); `checkDeferredEntityLinkPackets(newEntityId)` is
called as new entities spawn, and links older than
`MAX_ENTITY_LINK_DEFERRAL_INTERVAL = 1000` (ticks) are dropped.

### MultiPlayerLevel — the client world

`MultiPlayerLevel : public Level` (`MultiPlayerLevel.h:13`) is the client's copy of
the world. It does **not** generate terrain — its `ChunkSource` is empty and
chunks arrive as packets. Key members:

- `MultiPlayerChunkCache* chunkCache` — the client chunk store
  (`MultiPlayerChunkCache.h`).
- `unordered_map<int, shared_ptr<Entity>> entitiesById` — entity lookup for the
  `handle*` methods, plus `forced` / `reEntries` sets.
- `vector<ClientConnection*> connections` — the per-pad connections above.
- An inner `ResetInfo` + `updatesToReset` list: predicted block changes are rolled
  back if the server doesn't confirm within `TICKS_BEFORE_RESET = 20*4`
  (`MultiPlayerLevel.h:17`). `setTileAndData` records a reset entry;
  `clearResetRegion` / `enableResetChanges` gate it.

neoLegacy chunk-sharing helpers `shareChunkAt` / `unshareChunkAt` and
`chunksToAnimate` (`MultiPlayerLevel.h:29-87`) let two local connections share a
single chunk store rather than duplicating it.

### LocalPlayer, MultiPlayerLocalPlayer & RemotePlayer

- **`LocalPlayer`** (`LocalPlayer.h`) is the base client-controlled player: input
  intent, prediction, camera-owner.
- **`MultiplayerLocalPlayer`** is the driving local player in a networked/embedded
  game; created by `MultiPlayerGameMode::createPlayer` /
  `Minecraft::createExtraLocalPlayer` for splitscreen (`Minecraft.h:119`).
- **`RemotePlayer`** (`RemotePlayer.h`) represents *other* players — position
  interpolated from `MovePlayer`/`Teleport` packets, no local prediction.

### MultiPlayerGameMode — the client game mode

`MultiPlayerGameMode` (`MultiPlayerGameMode.h`) is the client-side mediator between
player intent and the server. It owns block-breaking progress state
(`destroyProgress`, `destroyTicks`, `isDestroying`) and turns local actions into
packets: `startDestroyBlock` / `continueDestroyBlock` / `destroyBlock`,
`useItemOn`, `useItem`, `attack`, `interact`, and
`handleInventoryMouseClick`/`handleInventoryButtonClick`. It also mirrors the
authoritative `GameType* localPlayerMode`. `Minecraft` keeps one per pad in
`localgameModes[]`.

## The server half (embedded)

Even a "single-player" world is a running server. `MinecraftServer`
(`MinecraftServer.h:71`, `: public ConsoleInputSource`) is the authoritative
simulation, reached through `MinecraftServer::getInstance()`.

### MinecraftServer

| Member | Role |
|--------|------|
| `ServerLevelArray levels` | per-dimension `ServerLevel`s |
| `PlayerList* players` (`getPlayerList()`) | connected-player roster |
| `ServerConnection* connection` | accept/listen socket |
| `CommandDispatcher* commandDispatcher` | chat-command execution |
| `vector<ConsoleInput*> consoleInput` | queued console commands (guarded by `m_consoleInputCS`) |

`run(seed, lpParameter)` boots the world from a `NetworkGameInitData`
(`MinecraftServer.h:39-66`) that carries the seed, save-data blob, `xzSize` (world
size, default `LEVEL_LEGACY_WIDTH`), `hellScale`, texture-pack id and
`savePlatform`. Ticking is fixed at `SharedConstants::TICKS_PER_SECOND` (20 Hz;
`MS_PER_TICK`).

#### neoLegacy: chunk-send throttling deltas

The server rate-limits chunk-data packets so a joining player doesn't stall the
tick. neoLegacy retunes this heavily (`MinecraftServer.h:21-28`, `252-266`):

- On `_WINDOWS64`, `MINECRAFT_SERVER_SLOW_QUEUE_DELAY = 0` — the comment notes the
  slow queue was *removed* because "at large player counts, chunks stopped
  appearing."
- Consoles use ACK-based throttling (`_ACK_CHUNK_SEND_THROTTLING`) with
  `MAX_TICK_TIME_FOR_PACKET_SENDS = 35` ms and a `s_sentTo` round-robin so every
  player gets a turn (`chunkPacketManagement_CanSendTo` / `DidSendTo`).
- A dedicated-server build (`MINECRAFT_SERVER_BUILD`) caps sends at
  `DEDICATED_MAX_CHUNK_SENDS_PER_TICK = 10`.

Post-processing new-world chunks runs on a separate thread
(`m_postUpdateThread`, `runPostUpdate`, `addPostProcessRequest`) so world creation
doesn't block the tick.

### ServerLevel, ServerPlayer, PlayerList

- **`ServerLevel`** (`ServerLevel.h`) is the authoritative world (real
  `ServerChunkCache`, generation, mob spawning); `DerivedServerLevel` shares
  storage for the Nether/End.
- **`ServerPlayer`** (`ServerPlayer.h`) is a connected player on the server;
  `ServerPlayerGameMode` runs their authoritative game mode.
- **`PlayerList`** (`PlayerList.h`) is the roster. neoLegacy hardened it for
  concurrency: `players` is guarded by `m_playersCS` with a
  `getPlayersSnapshot()` accessor, and disconnects are drained through a
  `m_pendingDisconnects` queue rather than mutating mid-iteration (comment:
  "deadlock fix", `PlayerList.h:35-46`). It also holds `m_bannedXuids`
  (guarded by `m_banCS`) and small-id kick/close queues. `PlayerInfo`
  (`PlayerInfo.h`) is a trivial name+latency record.

### Connection lifecycle

Three server-side listener classes handle the handshake:

- **`ServerConnection`** (`ServerConnection.h`) — accepts sockets. On Windows64
  the accept thread rejects new sockets past the player cap via
  `CPlatformNetworkManagerStub::CanAcceptMoreConnections()`
  (`PlatformNetworkManagerStub.h:173`).
- **`PendingConnection`** (`PendingConnection.h`, `: public PacketListener`) —
  pre-login handshake before a real player exists.
- **`PlayerConnection`** (`PlayerConnection.h`, `: PacketListener,
  ConsoleInputSource`) — the per-player server-side handler; it also feeds chat
  and commands into the command dispatcher (see [Input](/slop-docs/client/input/#server-side-command-input)).

### Worked trace: one connection, socket accept to level entry

This follows a single player joining from the raw socket to the level-entry packet
burst, citing every hop. The handshake lives in a **pending** object with no player
attached; only once login is accepted is a `ServerPlayer` created and the socket
handed to a per-player `PlayerConnection`.

**1 — Accept (`ServerConnection`).** A new socket arrives at
`ServerConnection::NewIncomingSocket(Socket*)` (`ServerConnection.cpp:37`), which
wraps it in a `PendingConnection` and calls `handleConnection` (`:40`).
`handleConnection` (`:50`) pushes it onto the `pending` vector under `pending_cs`
(`:64`); on a dedicated server build it first rejects over `maxPendingConnections`
(`:53-62`). `ServerConnection::tick()` then drives each pending object's `tick()`
(`:103-110`), snapshotting the vector first so a join can't invalidate the iterator
(comment "changed so … CS lock doesn't cover the tick", `:101`).

**2 — Pre-login.** `PendingConnection` (`: public PacketListener`) handles the
pre-login exchange: `handlePreLogin` (`PendingConnection.cpp:102`) checks version
compatibility and, on the WINDOWS64 dedicated build, resolves the peer IP and fires
the `FourKitBridge::FirePlayerPreLogin` mod hook (`:155`) before
`sendPreLoginResponse` (`:170`) replies with the current player list and the
world's `m_texturePackId` (`:229`).

**3 — Protocol gate (`handleLogin`).** The `LoginPacket` lands in
`handleLogin` (`PendingConnection.cpp:233`), which gates on the protocol version
first (`:237`):

```cpp
if (packet->clientVersion != SharedConstants::NETWORK_PROTOCOL_VERSION) {   // 79
    disconnect(packet->clientVersion > NETWORK_PROTOCOL_VERSION
        ? eDisconnect_OutdatedServer : eDisconnect_OutdatedClient);
    return;
}
```

`NETWORK_PROTOCOL_VERSION` is **79** (`Minecraft.World/SharedConstants.h:10`) — a
mismatch tells the client whether *it* or the *server* is stale. After the gate it
picks the login XUID (offline first, online fallback, `:312-313`) and rejects
duplicate-XUID joins (`:315-325`).

**4 — Player handoff (`handleAcceptedLogin`).** Once accepted,
`handleAcceptedLogin` (`PendingConnection.cpp:495`) re-checks the UGC player-list
version (`:497`), then asks the roster for a player object —
`server->getPlayers()->getPlayerForLogin(this, name, playerXuid, onlineXuid)`
(`:569`) — and hands the socket over (`:576-577`):

```cpp
server->getPlayers()->placeNewPlayer(connection, playerEntity, packet);
connection = nullptr;   // responsibility moved to the new PlayerConnection
```

Nulling `connection` is the ownership transfer: the pending object's destructor no
longer closes the socket because the `PlayerConnection` now owns it.

**5 — Construct PlayerConnection + level entry (`placeNewPlayer`).**
`PlayerList::placeNewPlayer` (`PlayerList.cpp:127`) binds the player to its
`ServerLevel` (`:133-134`), picks a free player index (`:177-200`, rejecting with
`eDisconnect_ServerFull` if none), constructs the per-player handler —
`make_shared<PlayerConnection>(server, connection, player)` (`:205`) — and then
sends the **level-entry burst** in order (`PlayerList.cpp:306-334`):

| # | Packet | Purpose |
|---|--------|---------|
| 1 | `Recipes::createUpdatePacket()` | recipe book |
| 2 | `IUIScene_CreativeMenu::createUpdatePacket()` | creative inventory |
| 3 | `LoginPacket` | entity id, generator, seed, game mode, dimension, build height, difficulty, world size, hell scale, hardcore |
| 4 | `SetSpawnPositionPacket` | spawn point |
| 5 | `PlayerAbilitiesPacket` | fly/build flags |
| 6 | `SetCarriedItemPacket` | selected hotbar slot |
| 7 | `CustomPayloadPacket(FORK_HELLO_CHANNEL)` | the `MC|ForkHello` handshake (see [fork-server protocol](#neolegacy-fork-server-protocol--custom-encryption)) |
| — | `updateEntireScoreboard(...)` | scoreboard |
| — | `sendLevelInfo(player, level)` | time, weather, world state |

These are exactly the packets the client's `ClientConnection` handlers
([above](#clientconnection--the-packet-router)) consume — the `LoginPacket` here is
answered by `handleLogin`, the abilities by `handlePlayerAbilities`, and so on.

**Embedded/loopback.** A single-player world runs this same handshake against the
*embedded* `MinecraftServer`: the desktop stub's `FakeLocalPlayerJoined()`
([above](#the-desktop-stub)) synthesises the local player joining their own hosted
game over the `IQNet` loopback, so even offline play flows accept → pending →
`placeNewPlayer` → `PlayerConnection` exactly as a remote join would.

## EntityTracker — server → client entity sync

`EntityTracker` (`EntityTracker.h`) lives on the **server** and decides which
entities each player needs updates for. It owns a set of `TrackedEntity`s
(`unordered_set<shared_ptr<TrackedEntity>>`) plus an `entityMap` by id.

- `addEntity(e, range, updateInterval, trackDeltas)` registers an entity with a
  broadcast radius and how often to resend its position.
- `broadcast(e, packet)` / `broadcastAndSend(...)` push a packet to every player in
  range of `e`.
- `playerLoadedChunk(player, chunk)` sends spawn packets for entities in a
  newly-loaded chunk; `clear(serverPlayer)` / `removePlayer` tear down on leave.
- `updateMaxRange()` (added "for Vita") recomputes the tracking distance from view
  distance.

`TrackedEntity` (`TrackedEntity.cpp`, ~700 lines) is the per-entity state that
diffs position/rotation each tick and emits the smallest packet that will do
(`MoveEntitySmall` vs `TeleportEntity`), matching the `handle*` methods on the
client's `ClientConnection`.

## The platform abstraction

Game code never touches sockets or platform SDKs directly. It talks to
`CGameNetworkManager` (`Common/Network/GameNetworkManager.h`, global
`g_NetworkManager`) and `INetworkPlayer` (`NetworkPlayerInterface.h`), which
delegate to a per-platform `CPlatformNetworkManager`
(`PlatformNetworkManagerInterface.h`). The header is explicit that this class
"shouldn't ever reference any platform specifics of the network implementation
(eg QNET)."

### CGameNetworkManager — the game-facing API

`CGameNetworkManager` (`GameNetworkManager.h:31`) exposes session flow without any
platform detail:

| Group | Methods |
|-------|---------|
| Lifecycle | `Initialise`, `Terminate`, `DoWork`, `StartNetworkGame` |
| Hosting | `HostGame(mask, online, private, publicSlots, privateSlots)`, `IsHost`, `SetLocalGame`, `IsLocalGame` |
| Joining | `JoinGame(searchResult, mask)` → `eJoinGameResult`, `JoinGameFromInviteInfo`, `LeaveGame(migrateHost)` |
| Discovery | `GetSessionList`, `GetGameSessionInfo`, `ForceFriendsSessionRefresh` |
| Players | `AddLocalPlayerByUserIndex`, `GetPlayerByXuid/BySmallId/ByIndex`, `GetHostPlayer` |
| State | `IsInSession`, `IsInGameplay`, `IsLeavingGame`, `IsInStatsEnabledSession` |

`eJoinGameResult` is `JOINGAME_SUCCESS / _FAIL_GENERAL / _FAIL_SERVER_FULL /
_PENDING`. The manager holds the single `s_pPlatformNetworkManager` and forwards
callbacks (`StateChange_AnyToHosting`, `PlayerJoining`, `HostChanged`, …) up from
it. `INetworkPlayer` abstracts one participant: `SendData(...)`, `GetSmallId`,
`GetCurrentRtt`, `IsHost/IsGuest/IsLocal`, `GetUID`, and voice/camera capability
queries.

### The desktop stub

On desktop (the `#else` branch of the platform `#ifdef` in
`GameNetworkManager.h:7-15`), the backend is **`CPlatformNetworkManagerStub`**
(`PlatformNetworkManagerStub.h`). It implements the full
`CPlatformNetworkManager` interface over a `IQNet` transport, runs a
`SearchForGamesThreadProc` for LAN/host discovery, and — because there is no real
matchmaking service — exposes `FakeLocalPlayerJoined()` to synthesise the local
player joining their own hosted game (`PlatformNetworkManagerStub.h:180`). The
Windows64 join path stores a pending host name in `m_joinHostName[32]`.

### The Sony (PSN) implementation

For PS3/PS4/Vita the backend is `CPlatformNetworkManagerSony`
(`Common/Network/Sony/PlatformNetworkManagerSony.*`), co-located here even though
it is platform-specific. The Sony subtree wires the manager to PSN services:

| File | Role |
|------|------|
| `PlatformNetworkManagerSony.*` | PSN session/matchmaking implementation |
| `SQRNetworkManager.*` / `SQRNetworkPlayer.*` | the SQR transport layer + per-player wrapper |
| `NetworkPlayerSony.*` | `INetworkPlayer` for a PSN participant |
| `SonyHttp.*` | HTTP client (skin download, marketplace) |
| `SonyCommerce.*` | PSN store / DLC purchase |
| `SonyRemoteStorage.*` | cloud saves (`sceRemoteStorage`) |

`SessionInfo.h` (`FriendSessionInfo`, `SessionID`) is the shared session-descriptor
struct returned by `GetSessionList` on every platform.

## Related pages

- [World Networking & Packets](/slop-docs/world/networking/) — the `Packet` types and `Connection` these handlers consume
- [World Storage](/slop-docs/world/storage/) — the save format `MinecraftServer` loads via `NetworkGameInitData`
- [Achievements & Stats](/slop-docs/client/achievements/) — `IsInStatsEnabledSession` and the telemetry driven from session/level events
- [Input](/slop-docs/client/input/) — `PlayerConnection` as a `ConsoleInputSource` for server commands
- [Client Overview](/slop-docs/client/overview/) — where `level`, `gameMode` and the connections sit in the `Minecraft` god-object

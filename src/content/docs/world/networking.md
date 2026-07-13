---
title: Networking & Packets
description: The Packet base class, the 97-entry packet ID registry, the PacketListener double-dispatch pattern, and Connection transport in neoLegacy.
---

neoLegacy's netcode is a direct C++ port of the Java LCE network layer. A single
abstract `Packet` base class owns a static ID→factory registry, every concrete
packet implements a `read`/`write`/`handle` triple, and a `Connection` runs the
socket on dedicated read/write threads. There is no protocol negotiation handshake
in the Java sense — the build number is baked in at compile time and two clients
can only interoperate if their `BUILD_NUMBER` matches.

Files: `Packet.h`, `Packet.cpp`, `PacketListener.h`, `PacketListener.cpp`,
`Connection.h`, `Connection.cpp`, `Socket.h`.

## The Packet base class

`class Packet` (`Packet.h:15`) is abstract. Every concrete packet must implement
five pure-virtual methods (`Packet.h:73`, `:94-97`):

| Method | Purpose |
|--------|---------|
| `virtual int getId() = 0` | Numeric wire ID (returned inline, e.g. `GameCommandPacket::getId()` returns `167`) |
| `virtual void read(DataInputStream *dis) = 0` | Deserialize the payload |
| `virtual void write(DataOutputStream *dos) = 0` | Serialize the payload |
| `virtual void handle(PacketListener *listener) = 0` | Dispatch to the correct `handleXxx` on the listener |
| `virtual int getEstimatedSize() = 0` | Byte-size hint used for buffer sizing / stats |

In vanilla Java LCE, `getId()` reads a per-instance `id` field. Here it is a pure
virtual method returning a constant — the comment at `Packet.cpp:19` notes "item
IDs are now defined in virtual method for each packet type". Each packet also
exposes a static `create()` factory returning a `shared_ptr<Packet>`; the registry
stores function pointers to these:

```cpp
typedef shared_ptr<Packet> (*packetCreateFn)();
```

Packets are reference-counted (`shared_ptr<Packet>`) throughout, and a packet that
dispatches to a listener passes `shared_from_this()` (e.g. `ChatPacket::handle`
calls `listener->handleChat(shared_from_this())`, `ChatPacket.cpp:88`).

### Optional virtuals

`Packet` also declares non-pure hooks with defaults (`Packet.h:98-100`):
`canBeInvalidated()`, `isInvalidatedBy(packet)` (used to drop superseded movement
packets from the send queue), and `isAync()`.

## The ID registry

All packet IDs are registered in **`Packet::staticCtor()`** (`Packet.cpp:15`),
called first in the world bootstrap (`Minecraft.World.cpp:31`, before any tile or
item registration). Each entry is one `map(...)` call:

```cpp
// Packet.h:58 / Packet.cpp:182
static void map(int id, bool receiveOnClient, bool receiveOnServer,
                bool sendToAnyClient, bool renderStats,
                const type_info& clazz, packetCreateFn createFn);
```

The five booleans/flags after the ID control routing:

| Param | Meaning |
|-------|---------|
| `receiveOnClient` | ID is accepted when read on a client (inserted into `clientReceivedPackets`) |
| `receiveOnServer` | ID is accepted when read on a server (inserted into `serverReceivedPackets`) |
| `sendToAnyClient` | `true` = broadcast to anyone; `false` = send to one player per dimension per machine (`Packet.cpp:181`) |
| `renderStats` | Debug-only; register this packet in the stat renderer |
| `clazz` / `createFn` | `typeid(Class)` and `Class::create` factory |

`map()` inserts the factory into `idToCreateMap` and, per flag, into the three
`unordered_set<int>` accept-lists (`Packet.cpp:203-214`). IDs are **hard-coded and
non-sequential** — there is no auto-increment. `staticCtor()` has **97 `map()`
calls**, but ID `103` is registered in both arms of an `#ifndef _CONTENT_PACKAGE`
conditional (`Packet.cpp:95-101`), so only **96 distinct IDs** are mapped in any
one build.

Note that in neoLegacy `map()` does **not** enforce uniqueness: the duplicate-ID /
duplicate-class checks are compiled out under `#if 0` (`Packet.cpp:184-187`), and
`PACKET_ENABLE_STAT_TRACKING` is `0` (`Packet.h:9`), so the statistics machinery is
dead code in normal builds.

### ID ranges (summary)

The full ID table lives in the reference section — see
[Packet IDs](/slop-docs/reference/packet-ids/). The IDs cluster into blocks
(`Packet.cpp:22-152`):

| Range | Purpose | Representative packets |
|-------|---------|------------------------|
| 0–16 | Core / player | `KeepAlivePacket` (0), `LoginPacket` (1), `PreLoginPacket` (2), `ChatPacket` (3), `SetTimePacket` (4), `RespawnPacket` (9), `MovePlayerPacket` (10) + `Pos`/`Rot`/`PosRot` (11–13) |
| 17–19 | Player actions | `EntityActionAtPositionPacket` (17), `AnimatePacket` (18), `PlayerCommandPacket` (19) |
| 20–27 | Entity spawn | `AddPlayerPacket` (20), `TakeItemEntityPacket` (22), `AddEntityPacket` (23), `AddMobPacket` (24), `AddPaintingPacket` (25), `AddExperienceOrbPacket` (26) |
| 28–44 | Entity sync / effects | `SetEntityMotionPacket` (28), `MoveEntityPacket` (30–33), `TeleportEntityPacket` (34), `SetEntityDataPacket` (40), `UpdateMobEffectPacket` (41), `UpdateAttributesPacket` (44) |
| 50–55 | Chunk / tile updates | `ChunkVisibilityPacket` (50), `BlockRegionUpdatePacket` (51), `ChunkTilesUpdatePacket` (52), `TileUpdatePacket` (53), `TileEventPacket` (54) |
| 60–71 | Level events | `ExplodePacket` (60), `LevelEventPacket` (61), `LevelSoundPacket` (62), `LevelParticlesPacket` (63), `GameEventPacket` (70), `AddGlobalEntityPacket` (71) |
| 100–108 | Containers | `ContainerOpenPacket` (100) … `ContainerButtonClickPacket` (108) |
| 130–133 | Signs / tile editor | `SignUpdatePacket` (130), `TileEntityDataPacket` (132), `TileEditorOpenPacket` (133) |
| 150–167 | 4J gameplay additions | `CraftItemPacket` (150), `TradeItemPacket` (151), `UpdateGameRuleProgressPacket` (158), `MoveEntityPacketSmall` (162–165), `XZPacket` (166), `GameCommandPacket` (167) |
| 200–209 | Stats / scoreboard | `AwardStatPacket` (200), `PlayerInfoPacket` (201), `PlayerAbilitiesPacket` (202), `ClientCommandPacket` (205), `SetObjectivePacket`/`SetScorePacket`/`SetDisplayObjectivePacket`/`SetPlayerTeamPacket` (206–209) |
| 250–255 | Transport control | `CustomPayloadPacket` (250), `GetInfoPacket` (254), `DisconnectPacket` (255) |

The `150–167` and `200`+ blocks are the console-specific additions (marked
`// 4J Added` at `Packet.cpp:113`). `PlayerInfoPacket` (201) carries a note that it
was **repurposed by 4J** away from its Java 1.8.2 meaning (`Packet.cpp:135`).

### Reserved / commented-out IDs

Several Java IDs are present as commented-out `map()` calls that 4J decided not to
port: `203` `ChatAutoCompletePacket`, `204` `ClientInformationPacket`
(`Packet.cpp:138-139`), `252` `SharedKeyPacket`, `253` `ServerAuthDataPacket`
(`Packet.cpp:149-150`). Their classes are still forward-declared in
`PacketListener.h`, but they are never mapped, so they can never be received.

## The listener double-dispatch pattern

`Packet` never contains handling logic. Instead, `handle()` calls a specific method
on a `PacketListener`:

```cpp
// ChatPacket.cpp:86
void ChatPacket::handle(PacketListener *listener)
{
    listener->handleChat(shared_from_this());
}
```

`class PacketListener` (`PacketListener.h:115`) declares one virtual `handleXxx`
per packet type — roughly 90 of them, e.g. `handleChat`, `handleLogin`,
`handleMovePlayer`, `handleGameCommand`. The base implementations in
`PacketListener.cpp` are stubs that forward to `onUnhandledPacket(...)`
(`PacketListener.cpp:9`, `:17-40`), so an unimplemented handler silently drops the
packet rather than crashing. The single pure-virtual is
`isServerPacketListener()` (`PacketListener.h:118`), which every concrete listener
must answer.

Concrete listeners (in `Minecraft.Client`) override only the handlers they care
about: `PlayerConnection` (server-side), `ClientConnection` (client-side). This is
the classic Java "packet visits the handler" arrangement, kept intact by the port.

## The Connection / transport layer

`class Connection` (`Connection.h:20`) owns one `Socket` and runs it on **two
dedicated threads**, a `readThread` and a `writeThread` (`Connection.h:66-67`),
each woken by an event object. Packets flow through lock-guarded queues:

| Queue | Direction | Notes |
|-------|-----------|-------|
| `incoming` | in | Guarded by `incoming_cs` critical section (`Connection.h:55-56`) |
| `outgoing` | out | Normal-priority send queue |
| `outgoing_slow` | out | Low-priority queue, drained with a `slowWriteDelay` throttle |
| `outgoingRaw` | out | Pre-serialized `(unsigned char*, int)` buffers for fast paths |

Key constants (`Connection.h`):

| Constant | Value | Meaning |
|----------|-------|---------|
| `SEND_BUFFER_SIZE` | `1024 * 5` | Send buffer size |
| `MAX_TICKS_WITHOUT_INPUT` | `20 * 60` | Timeout: 60s at 20 tps |
| `IPTOS_LOWCOST` / `IPTOS_RELIABILITY` / `IPTOS_THROUGHPUT` / `IPTOS_LOWDELAY` | `0x02` / `0x04` / `0x08` / `0x10` | IP type-of-service hints |

The main methods are `send(packet)` / `queueSend(packet)`, `flush()`, `tick()`
(pumps `incoming` into the listener), and `close(reason, ...)`
(`Connection.h:103-132`). Disconnect reasons are the `DisconnectPacket::eDisconnectReason`
enum.

### Wire format

`Packet::writePacket` writes a single byte ID then the payload
(`Packet.cpp:382-387`):

```cpp
void Packet::writePacket(shared_ptr<Packet> packet, DataOutputStream *dos)
{
    dos->write(packet->getId());
    packet->write(dos);
}
```

`readPacket(dis, isServer)` (`Packet.cpp:323`) reads the ID byte, rejects it if it
is not in the correct accept-list for the endpoint (`serverReceivedPackets` vs
`clientReceivedPackets`, `Packet.cpp:339`), looks up the factory via
`getPacket(id)`, then calls `packet->read(dis)`. A bad or unaccepted ID returns
`nullptr` rather than throwing — the Java `IOException` paths are commented out
(`Packet.cpp:345`).

Strings use a length-prefixed UTF form: `writeUtf` writes a `short` length then the
raw `wchar_t`s (`Packet.cpp:389`), and `readUtf` reads them back.

### neoLegacy hardening (vs vanilla TU19)

The port adds defensive input validation that the original 4J code did not have.
`readUtf` (`Packet.cpp:402`) enforces a global cap and rejects malformed lengths:

```cpp
static const int kMaxGlobalStringLength = 8192;
if (maxLength > kMaxGlobalStringLength) maxLength = kMaxGlobalStringLength;
short stringLength = dis->readShort();
if (stringLength <= 0) { /* negative length logged as SECURITY, return L"" */ }
if (stringLength > maxLength) { dis->skip(stringLength * 2); return L""; }
```

`readBytes` (`Packet.cpp:284`) similarly guards against a negative declared size
before allocating. `handleGameCommand` on the server side adds a live OP re-check
against `ops.json` and logs unauthorized attempts as `SECURITY:` — see
[Commands](/slop-docs/world/commands/). These are neoLegacy additions aimed at
hardening the console netcode against malformed or malicious peers.

## Protocol version — BUILD_NUMBER 570

:::note[Changed upstream (post-v1.1.0b)]
Upstream `neoStudiosLCE/neoLegacy` bumped `BUILD_NUMBER` **570 → 571** in `e8e2e44e` ("chore: bump server version"), so current upstream builds speak protocol **571**. Everything below describes the mechanism, which is unchanged; substitute 571 for the current value.
:::

There is no version-negotiation packet. Compatibility is gated entirely by a
compile-time build number, set in `cmake/GenerateBuildVer.cmake:10`:

```cmake
set(BUILD_NUMBER 570) # Note: Build/network has to stay static for now, as
                      # without it builds wont be able to play together.
```

The generated `BuildVer.h` exposes it as three macros
(`GenerateBuildVer.cmake:68-72`):

```c
#define VER_PRODUCTBUILD 570
#define VER_NETWORK VER_PRODUCTBUILD
```

`VER_NETWORK` is the value clients compare to decide whether they can play
together, so two neoLegacy builds interoperate only when both were built at
`BUILD_NUMBER 570`. The same number is stamped into save-file names
(`ConsoleSaveFileOriginal.cpp:1033`, via `VER_PRODUCTBUILD`), so it doubles as the
save-format tag. The comment in the cmake file is explicit that the number is
frozen deliberately until a proper versioning scheme exists.

## Related pages

- [Commands](/slop-docs/world/commands/) — how `GameCommandPacket` (167) drives the dispatcher.
- [Container Menus](/slop-docs/world/containers/) — the 100–108 container packet family.
- [Game Rules](/slop-docs/world/gamerules/) — `UpdateGameRuleProgressPacket` (158).
- [Packet IDs](/slop-docs/reference/packet-ids/) — the full packet ID table.

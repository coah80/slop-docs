---
title: Multiplayer & Packets
description: Add a network packet to neoLegacy — subclass Packet, register an id in Packet.cpp, add listener handlers on both sides, wire EntityTracker broadcast, and stay protocol-compatible.
---

This guide walks adding a new packet end-to-end, mirroring how the existing
`AnimatePacket` and `SetTimePacket` are built. It covers the `Packet` subclass,
id registration, the `PacketListener` handler methods on the client and server,
how server-side entity packets get broadcast through `EntityTracker`, and the
protocol-version rule that governs when you may add a packet at all.

Background: [World / Networking](/slop-docs/world/networking/),
[Client / Networking](/slop-docs/client/networking/), and the full
[Packet ID reference](/slop-docs/reference/packet-ids/).

## Read this first: the protocol version wall

neoLegacy connections are gated by a single protocol version constant
([`SharedConstants.h:10`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/SharedConstants.h#L10)):

```cpp
static const int NETWORK_PROTOCOL_VERSION = 79;
```

At login the server compares the client's reported version and hangs up on any
mismatch ([`PendingConnection.cpp:237`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/PendingConnection.cpp#L237)):

```cpp
if (packet->clientVersion != SharedConstants::NETWORK_PROTOCOL_VERSION)
{
    if (packet->clientVersion > SharedConstants::NETWORK_PROTOCOL_VERSION)
        disconnect(DisconnectPacket::eDisconnect_OutdatedServer);
    else
        disconnect(DisconnectPacket::eDisconnect_OutdatedClient);
    return;
}
```

**Cross-compatibility warning.** Any wire change — a new packet id, a changed
packet layout, a reordered enum that is serialized (`EGameCommand`,
`eGameHostOption`, `EGameRuleType`) — makes your build **incompatible with every
unmodified peer**. If your mod is meant to interoperate with stock neoLegacy
clients/servers (e.g. joining public 4Kit servers), it **must not** change the
protocol: no new packet ids, no altered `read`/`write`, no shifted enums.

If your mod is self-contained (both ends run your build), you are free to change
the protocol — but bump `NETWORK_PROTOCOL_VERSION` so mismatched peers get a
clean "outdated" disconnect instead of a desynced stream. The exact-match check
means even adding a packet at an unused id changes nothing on the wire *until you
send it*, but bumping the version is the honest signal.

> Note: the version constant in the source is `79`, not a "build number." There
> is no `BUILD_NUMBER` protocol constant in the codebase — `NETWORK_PROTOCOL_VERSION`
> in `SharedConstants.h` is the single source of truth for wire compatibility.

## The packet contract

Every packet subclasses `Packet` ([`Packet.h:15`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/Packet.h#L15)) and implements six virtuals.
`SetTimePacket` is the minimal complete example (`SetTimePacket.cpp`):

```cpp
virtual int getId() = 0;                        // wire id
virtual void read(DataInputStream *dis) = 0;    // deserialize
virtual void write(DataOutputStream *dos) = 0;  // serialize
virtual void handle(PacketListener *listener)=0;// dispatch to a handler
virtual int getEstimatedSize() = 0;             // byte-size hint
```

Plus a static factory `create()` used by the id registry. The read/write pair
must be exact mirrors, and `handle()` calls the one `PacketListener::handleXxx`
method for this packet.

## Worked example: `PlayerPingPacket`

We'll add a packet that carries a player entity id and a ping value, sent
server→client, following `AnimatePacket` (which also carries an entity id +
small action byte).

### Step 1 — write the header

Create `Minecraft.World/PlayerPingPacket.h`, modeled on
[`AnimatePacket.h`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/AnimatePacket.h):

```cpp
#pragma once
using namespace std;

#include "Packet.h"

class PlayerPingPacket : public Packet, public enable_shared_from_this<PlayerPingPacket>
{
public:
    int id;      // entity id
    int ping;    // milliseconds

    PlayerPingPacket();
    PlayerPingPacket(shared_ptr<Entity> e, int ping);

    virtual void read(DataInputStream *dis);
    virtual void write(DataOutputStream *dos);
    virtual void handle(PacketListener *listener);
    virtual int getEstimatedSize();

public:
    static shared_ptr<Packet> create() { return std::make_shared<PlayerPingPacket>(); }
    virtual int getId() { return 45; }   // <-- see Step 3 for id choice
};
```

Two things copied verbatim from `AnimatePacket.h`: the
`enable_shared_from_this<...>` base (needed so `handle()` can call
`shared_from_this()`), and the inline `create()` + `getId()`.

### Step 2 — write the implementation

Create `Minecraft.World/PlayerPingPacket.cpp`, mirroring
[`AnimatePacket.cpp`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/AnimatePacket.cpp):

```cpp
#include "stdafx.h"
#include <iostream>
#include "InputOutputStream.h"
#include "net.minecraft.world.entity.h"
#include "PacketListener.h"
#include "PlayerPingPacket.h"

PlayerPingPacket::PlayerPingPacket()
{
    id = -1;
    ping = 0;
}

PlayerPingPacket::PlayerPingPacket(shared_ptr<Entity> e, int ping)
{
    id = e->entityId;
    this->ping = ping;
}

void PlayerPingPacket::read(DataInputStream *dis)
{
    id   = dis->readInt();
    ping = dis->readInt();
}

void PlayerPingPacket::write(DataOutputStream *dos)
{
    dos->writeInt(id);
    dos->writeInt(ping);
}

void PlayerPingPacket::handle(PacketListener *listener)
{
    listener->handlePlayerPing(shared_from_this());
}

int PlayerPingPacket::getEstimatedSize()
{
    return 8;   // two ints
}
```

`read` and `write` must serialize the same fields in the same order — compare
`AnimatePacket::read`/`write` (int id, byte action). Use the `DataInputStream`/
`DataOutputStream` primitives (`readInt`/`writeInt`, `readLong`/`writeLong`,
`readByte`/`writeByte`). For strings use the static helpers
`Packet::writeUtf` / `Packet::readUtf` (`Packet.cpp:389`/`:402`) — `readUtf`
takes a max length and caps allocations for safety, so always pass a sane bound.

### Step 3 — register the id in `Packet::staticCtor`

Every id is registered by a `map(...)` call in `Packet::staticCtor`
([`Packet.cpp:15`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/Packet.cpp#L15)). The signature is (`Packet.cpp:182`):

```cpp
static void map(int id, bool receiveOnClient, bool receiveOnServer,
                bool sendToAnyClient, bool renderStats,
                const type_info& clazz, packetCreateFn createFn);
```

Add a line alongside the existing mappings. **Pick a free id** — the map is
hard-coded and sparse (gaps exist, e.g. 45–49 are unused after the
entity-sync block that ends at id 44, `Packet.cpp:72-74`). Do **not** reuse an
assigned id. For a server→client entity packet, register it like the other
entity-sync packets (client-received, not server-received):

```cpp
map(45, true, false, false, true, typeid(PlayerPingPacket), PlayerPingPacket::create);
```

The five booleans/flags:

| Param | Meaning | For our packet |
|-------|---------|----------------|
| `receiveOnClient` | client is allowed to *receive* this id | `true` |
| `receiveOnServer` | server is allowed to *receive* this id | `false` |
| `sendToAnyClient` | may go to any client, vs. one-per-machine-per-dimension | `false` |
| `renderStats` | include in the debug packet-stat overlay | `true` |
| `typeid(...)` / `create` | the class and its factory | — |

The receive flags are enforced at read time: `Packet::readPacket` rejects any id
that is not in the correct received-set for the side decoding it
(`Packet.cpp:339-342`), returning `nullptr` (a silent drop). So a packet mapped
`receiveOnClient=true, receiveOnServer=false` that is somehow sent to the server
will simply be ignored — set these to match the direction you actually use.

### Step 4 — declare the handler on `PacketListener`

`PacketListener` is the base interface every connection implements
([`PacketListener.h:115`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/PacketListener.h#L115)). Add a forward declaration and a virtual handler,
next to `handleAnimate` (`PacketListener.h:11` and `:139`):

```cpp
class PlayerPingPacket;   // with the other forward decls near the top
...
virtual void handlePlayerPing(shared_ptr<PlayerPingPacket> packet);
```

Provide a default no-op body in `PacketListener.cpp` (the base gives every
handler a default so a listener only overrides the ones it cares about — this is
why `handle()` can safely call `listener->handlePlayerPing(...)` regardless of
which connection type is on the other end).

### Step 5 — implement the handler on each side

Which side implements a real handler depends on direction. Both
`ClientConnection` and `PlayerConnection` are `PacketListener`s; they distinguish
themselves via `isServerPacketListener()` (`ClientConnection.h:139`,
`PlayerConnection.h:102`).

**Client side** — our packet is client-received, so override it in
`ClientConnection`. Model it on
`ClientConnection::handleAnimate` (`ClientConnection.cpp:2052`) and
`handleSetTime` (`ClientConnection.cpp:2646`):

```cpp
void ClientConnection::handlePlayerPing(shared_ptr<PlayerPingPacket> packet)
{
    shared_ptr<Entity> e = getEntity(packet->id);
    if (e == nullptr) return;                 // always null-check resolved entities
    // ... store/display packet->ping for that player ...
}
```

`getEntity(id)` is the standard way `ClientConnection` resolves an entity id from
the wire to a live `Entity` in the `MultiPlayerLevel`; `handleAnimate` uses the
same call and the same null-guard (`ClientConnection.cpp:2054-2055`).

**Server side** — a packet the *server* receives (i.e. `receiveOnServer=true`)
gets its handler in `PlayerConnection` instead. Our ping packet is
client-received only, so `PlayerConnection` keeps the default no-op. (For a
server-received packet, see `PlayerConnection::handleGameCommand`,
`PlayerConnection.cpp:1912`, as a template.)

### Step 6 — send it

**From the server to clients (our direction).** For a per-entity packet, the
idiomatic path is through the entity tracker rather than sending to one
connection manually — see the next section.

**From a connection directly.** Each connection exposes
`send(shared_ptr<Packet>)` (`ClientConnection.h:100`, `PlayerConnection.h:67`).
The server can push to one player's `PlayerConnection`:

```cpp
playerConnection->send(std::make_shared<PlayerPingPacket>(somePlayer, pingMs));
```

## EntityTracker interplay

For anything attached to an entity (motion, animation, custom per-entity state),
the server does not hand-send to each viewer. `EntityTracker`
([`EntityTracker.h:12`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/EntityTracker.h#L12)) owns a `TrackedEntity` per entity and fans packets out
to exactly the players who have that entity in view. Two methods matter
(`EntityTracker.h:28-29`):

```cpp
void broadcast(shared_ptr<Entity> e, shared_ptr<Packet> packet);        // to viewers only
void broadcastAndSend(shared_ptr<Entity> e, shared_ptr<Packet> packet); // viewers + the entity itself (if a player)
```

- **`broadcast`** sends to everyone tracking `e`, but **not** to `e` if `e` is a
  player — use it for things the subject already knows locally.
- **`broadcastAndSend`** additionally sends to the subject player — use it when
  the subject must also react.

Real usage: swing/eat/crit animations are pushed exactly this way. When a player
swings, the server calls (`ServerPlayer.cpp:1149`):

```cpp
getLevel()->getTracker()->broadcast(shared_from_this(), p);
```

and for the "wake up" / "eat" / crit animations it uses `broadcastAndSend`
(`ServerPlayer.cpp:1166`, `:1962`, `:2002`):

```cpp
getLevel()->getTracker()->broadcastAndSend(shared_from_this(),
    std::make_shared<AnimatePacket>(shared_from_this(), AnimatePacket::WAKE_UP));
```

So to broadcast our ping packet for a player, the server would do:

```cpp
getLevel()->getTracker()->broadcast(playerEntity,
    std::make_shared<PlayerPingPacket>(playerEntity, pingMs));
```

The tracker is reached via `ServerLevel::getTracker()`; `ServerLevel.cpp:1184`
shows the same pattern for global entities
(`getTracker()->broadcastAndSend(e, p)`). For sending to players by area rather
than by entity visibility, `PlayerList::broadcast(x, y, z, range, dimension,
packet)` exists (`ServerLevel.cpp:1175`, `:1272`) — that is the right call for
world-position events (explosions, tile events) that are not tied to a tracked
entity.

## Packet lifecycle summary

Putting it together, the round trip is:

1. Server constructs the packet and either `connection->send(p)` or
   `tracker->broadcast(entity, p)`.
2. `Packet::writePacket` writes the id byte then `packet->write(dos)`
   (`Packet.cpp:382`).
3. On the receiving side, `Packet::readPacket` reads the id, checks it against
   the side's received-set, constructs the packet via the registered `create()`,
   and calls `packet->read(dis)` (`Packet.cpp:323-380`).
4. The connection calls `packet->handle(this)`, which dispatches to the one
   `PacketListener::handleXxx` (`AnimatePacket.cpp:34` →
   `listener->handleAnimate(...)`).
5. The concrete `ClientConnection` / `PlayerConnection` override runs.

## Testing checklist

- [ ] `PlayerPingPacket.h` / `.cpp` created under `Minecraft.World/` and picked up
      by the build.
- [ ] `map(...)` line added in `Packet::staticCtor` at a **free** id, with
      receive flags matching the actual direction.
- [ ] `read` and `write` serialize identical fields in identical order; round-trip
      a packet through a `ByteArrayOutputStream` → `ByteArrayInputStream` in a unit
      test and assert equality.
- [ ] Forward declaration + `virtual void handlePlayerPing(...)` added to
      `PacketListener.h`, with a default no-op body in `PacketListener.cpp`.
- [ ] Real handler implemented on the correct side (`ClientConnection` for
      client-received, `PlayerConnection` for server-received); resolved entities
      null-checked.
- [ ] Sent via `EntityTracker::broadcast`/`broadcastAndSend` (entity packets) or
      `PlayerList::broadcast` (positional) or `connection->send` (targeted).
- [ ] Two modified builds interoperate; an **unmodified** peer either still
      connects (if you added no wire change it will send) or is cleanly rejected as
      "outdated" after you bump `NETWORK_PROTOCOL_VERSION`.
- [ ] Confirm no existing packet id, `EGameCommand`, `eGameHostOption`, or
      `EGameRuleType` value was reordered.

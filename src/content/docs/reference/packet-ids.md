---
title: Packet ID Registry
description: Every network packet ID mapped in neoLegacy, with class, direction, and purpose.
---

Complete registry of the network packet IDs registered by `Packet::staticCtor()`.
IDs are hard-coded (not sequential auto-increment), so there are gaps. This table
is extracted verbatim from **`Minecraft.World/Packet.cpp:22-152`** (the block of
`map(...)` calls inside `Packet::staticCtor()`).

## How registration works

Every packet is registered with a single call:

```cpp
void Packet::map(int id, bool receiveOnClient, bool receiveOnServer,
                 bool sendToAnyClient, bool renderStats,
                 const type_info& clazz, packetCreateFn createFn);
```

Declared at `Packet.h:58`, defined at `Packet.cpp:182`. Each packet class supplies
a static `create()` factory (`packetCreateFn`, `Packet.h:13`) that the registry
stores in `idToCreateMap` keyed by ID (`Packet.cpp:189`). Packet IDs come from the
virtual `getId()` (`Packet.h:73`), not from the map order.

The two boolean flags after the ID decide **direction**:

| `receiveOnClient` | `receiveOnServer` | Direction shown below |
|:---:|:---:|---|
| `true` | `false` | **Clientbound** (server → client) |
| `false` | `true` | **Serverbound** (client → server) |
| `true` | `true` | **Both** |

`sendToAnyClient` (`Packet.cpp:181` comment) controls fan-out: `true` = send to
anyone, `false` = send to one player per dimension per machine. `renderStats` is a
debug-only flag feeding `PacketStatistics` (gated behind `PACKET_ENABLE_STAT_TRACKING`,
`Packet.h:9`, which is `0` in this build). Neither affects direction.

A few `map()` calls are conditionally compiled: id 103 (`ContainerSetSlotPacket`)
registers as **Both** inside `#ifndef _CONTENT_PACKAGE` and as **Clientbound** in a
content build (`Packet.cpp:95-101`). The direction column reflects the non-content
(`#ifndef _CONTENT_PACKAGE`) build.

## Packet table

Direction and flags read directly from the `map()` arguments. "Purpose" is a
one-line summary of the packet's role.

| ID | Class | Direction | sendToAny | Purpose |
|---:|-------|-----------|:---------:|---------|
| 0 | `KeepAlivePacket` | Both | ✔ | Connection keep-alive ping |
| 1 | `LoginPacket` | Both | ✔ | Login handshake / player join |
| 2 | `PreLoginPacket` | Both | ✔ | Pre-login handshake |
| 3 | `ChatPacket` | Both | ✔ | Chat message |
| 4 | `SetTimePacket` | Clientbound | ✘ | World time-of-day update |
| 5 | `SetEquippedItemPacket` | Clientbound | ✘ | Entity held/equipped item |
| 6 | `SetSpawnPositionPacket` | Clientbound | ✔ | Compass / spawn position |
| 7 | `InteractPacket` | Serverbound | ✘ | Player interacts with entity |
| 8 | `SetHealthPacket` | Clientbound | ✔ | Player health / food / saturation |
| 9 | `RespawnPacket` | Both | ✔ | Dimension change / respawn |
| 10 | `MovePlayerPacket` | Both | ✔ | Player move (pos + rot) |
| 11 | `MovePlayerPacket::Pos` | Both | ✔ | Player move (position only) |
| 12 | `MovePlayerPacket::Rot` | Both | ✔ | Player move (rotation only) |
| 13 | `MovePlayerPacket::PosRot` | Both | ✔ | Player move (pos + rot, delta) |
| 14 | `PlayerActionPacket` | Serverbound | ✘ | Dig / block-action state |
| 15 | `UseItemPacket` | Serverbound | ✘ | Use / place held item |
| 16 | `SetCarriedItemPacket` | Both | ✔ | Selected hotbar slot |
| 17 | `EntityActionAtPositionPacket` | Clientbound | ✔ | Entity action at a position (sleep in bed) |
| 18 | `AnimatePacket` | Both | ✔ | Entity animation / wake from sleep |
| 19 | `PlayerCommandPacket` | Serverbound | ✘ | Player entity-action command |
| 20 | `AddPlayerPacket` | Clientbound | ✘ | Spawn a player entity |
| 22 | `TakeItemEntityPacket` | Clientbound | ✔ | Item pickup animation |
| 23 | `AddEntityPacket` | Clientbound | ✘ | Spawn a non-mob entity |
| 24 | `AddMobPacket` | Clientbound | ✘ | Spawn a mob |
| 25 | `AddPaintingPacket` | Clientbound | ✘ | Spawn a painting |
| 26 | `AddExperienceOrbPacket` | Clientbound | ✘ | Spawn an XP orb |
| 27 | `PlayerInputPacket` | Serverbound | ✘ | Vehicle steering / input |
| 28 | `SetEntityMotionPacket` | Clientbound | ✔ | Entity velocity (knockback) |
| 29 | `RemoveEntitiesPacket` | Clientbound | ✘ | Despawn entities |
| 30 | `MoveEntityPacket` | Clientbound | ✘ | Entity move (base) |
| 31 | `MoveEntityPacket::Pos` | Clientbound | ✘ | Entity move (position delta) |
| 32 | `MoveEntityPacket::Rot` | Clientbound | ✘ | Entity move (rotation) |
| 33 | `MoveEntityPacket::PosRot` | Clientbound | ✘ | Entity move (pos + rot) |
| 34 | `TeleportEntityPacket` | Clientbound | ✘ | Entity absolute teleport |
| 35 | `RotateHeadPacket` | Clientbound | ✘ | Entity head rotation |
| 38 | `EntityEventPacket` | Clientbound | ✔ | Entity status event (hurt sound, etc.) |
| 39 | `SetEntityLinkPacket` | Clientbound | ✔ | Leash / mount link |
| 40 | `SetEntityDataPacket` | Clientbound | ✔ | Entity metadata (data watcher) |
| 41 | `UpdateMobEffectPacket` | Clientbound | ✔ | Add / update potion effect |
| 42 | `RemoveMobEffectPacket` | Clientbound | ✔ | Remove potion effect |
| 43 | `SetExperiencePacket` | Clientbound | ✔ | XP bar / level |
| 44 | `UpdateAttributesPacket` | Clientbound | ✔ | Entity attribute values |
| 50 | `ChunkVisibilityPacket` | Clientbound | ✔ | Chunk load / unload visibility |
| 51 | `BlockRegionUpdatePacket` | Clientbound | ✔ | Multi-block region update |
| 52 | `ChunkTilesUpdatePacket` | Clientbound | ✔ | Chunk tile data update |
| 53 | `TileUpdatePacket` | Clientbound | ✔ | Single block/tile update |
| 54 | `TileEventPacket` | Clientbound | ✔ | Tile event (chest open, note block) |
| 55 | `TileDestructionPacket` | Clientbound | ✘ | Block-breaking progress |
| 60 | `ExplodePacket` | Clientbound | ✔ | Explosion effect |
| 61 | `LevelEventPacket` | Clientbound | ✔ | Level event (effects / sounds) |
| 62 | `LevelSoundPacket` | Clientbound | ✔ | Positional sound event |
| 63 | `LevelParticlesPacket` | Clientbound | ✔ | Particle spawn |
| 70 | `GameEventPacket` | Clientbound | ✘ | Game state / weather event |
| 71 | `AddGlobalEntityPacket` | Clientbound | ✘ | Spawn global entity (lightning) |
| 100 | `ContainerOpenPacket` | Clientbound | ✔ | Open a container GUI |
| 101 | `ContainerClosePacket` | Both | ✔ | Close a container GUI |
| 102 | `ContainerClickPacket` | Serverbound | ✘ | Container slot click |
| 103 | `ContainerSetSlotPacket` | Both* | ✔ | Set a single container slot |
| 104 | `ContainerSetContentPacket` | Clientbound | ✔ | Set full container contents |
| 105 | `ContainerSetDataPacket` | Clientbound | ✔ | Set container property (furnace progress) |
| 106 | `ContainerAckPacket` | Both | ✔ | Container transaction ack |
| 107 | `SetCreativeModeSlotPacket` | Both | ✔ | Creative-mode slot set |
| 108 | `ContainerButtonClickPacket` | Serverbound | ✘ | Container button (enchant / beacon) |
| 130 | `SignUpdatePacket` | Both | ✔ | Sign text update |
| 131 | `ComplexItemDataPacket` | Clientbound | ✔ | Complex item data (maps) |
| 132 | `TileEntityDataPacket` | Clientbound | ✘ | Tile-entity NBT update |
| 133 | `TileEditorOpenPacket` | Clientbound | ✔ | Open block editor (sign / command block) |
| 150 | `CraftItemPacket` | Serverbound | ✘ | Recipe-book craft request |
| 151 | `TradeItemPacket` | Serverbound | ✔ | Villager trade selection |
| 152 | `DebugOptionsPacket` | Serverbound | ✘ | Debug options |
| 153 | `ServerSettingsChangedPacket` | Both | ✘ | Server settings changed |
| 154 | `TexturePacket` | Both | ✔ | Texture pack data |
| 155 | `ChunkVisibilityAreaPacket` | Clientbound | ✔ | Chunk visibility area |
| 156 | `UpdateProgressPacket` | Clientbound | ✘ | Loading / progress bar |
| 157 | `TextureChangePacket` | Both | ✔ | Texture pack change |
| 158 | `UpdateGameRuleProgressPacket` | Clientbound | ✔ | Game-rule value sync |
| 159 | `KickPlayerPacket` | Serverbound | ✘ | Kick request |
| 160 | `TextureAndGeometryPacket` | Both | ✔ | Texture + geometry pack data |
| 161 | `TextureAndGeometryChangePacket` | Both | ✔ | Texture + geometry pack change |
| 162 | `MoveEntityPacketSmall` | Clientbound | ✘ | Compact entity move |
| 163 | `MoveEntityPacketSmall::Pos` | Clientbound | ✘ | Compact entity move (position) |
| 164 | `MoveEntityPacketSmall::Rot` | Clientbound | ✘ | Compact entity move (rotation) |
| 165 | `MoveEntityPacketSmall::PosRot` | Clientbound | ✘ | Compact entity move (pos + rot) |
| 166 | `XZPacket` | Both | ✘ | XZ coordinate sync |
| 167 | `GameCommandPacket` | Serverbound | ✘ | Game command |
| 200 | `AwardStatPacket` | Clientbound | ✔ | Award statistic / achievement |
| 201 | `PlayerInfoPacket` | Both | ✘ | Player list info (repurposed by 4J) |
| 202 | `PlayerAbilitiesPacket` | Both | ✔ | Fly / invuln ability flags |
| 205 | `ClientCommandPacket` | Serverbound | ✔ | Client command (respawn / stats request) |
| 206 | `SetObjectivePacket` | Clientbound | ✔ | Scoreboard objective |
| 207 | `SetScorePacket` | Clientbound | ✔ | Scoreboard score update |
| 208 | `SetDisplayObjectivePacket` | Clientbound | ✔ | Scoreboard display slot |
| 209 | `SetPlayerTeamPacket` | Clientbound | ✔ | Scoreboard team |
| 250 | `CustomPayloadPacket` | Both | ✔ | Custom plugin payload |
| 254 | `GetInfoPacket` | Serverbound | ✘ | Server status query |
| 255 | `DisconnectPacket` | Both | ✔ | Disconnect / kick with reason |

\* Id 103 is **Both** in a non-content build (`#ifndef _CONTENT_PACKAGE`) and
**Clientbound** in a content build (`Packet.cpp:95-101`).

### Count

97 `map()` calls are present in `Packet::staticCtor()` (`Packet.cpp:22-152`),
matching the 97 mapped IDs. IDs are non-contiguous — the largest gaps are 71→100,
133→150, 167→200, and 209→250. Several would-be IDs are commented out and never
registered: 17/18 have superseded comment variants, and 203 `ChatAutoCompletePacket`,
204 `ClientInformationPacket`, 252 `SharedKeyPacket`, 253 `ServerAuthDataPacket`
are all disabled (`Packet.cpp:42-45`, `:138-139`, `:148-150`).

## Related pages

- [Networking](/slop-docs/world/networking/) — packet architecture and transport.
- [Container Menus](/slop-docs/world/containers/) — the container packets (100-108).
- [Game Rules](/slop-docs/world/gamerules/) — synced via `UpdateGameRuleProgressPacket` (158).
- [Entity Type Registry](/slop-docs/reference/entity-types/) — entity IDs referenced by spawn packets.

## Source

- `Minecraft.World/Packet.cpp:22-152` — the full `map()` block (registry data).
- `Minecraft.World/Packet.cpp:182` — `Packet::map()` definition.
- `Minecraft.World/Packet.h:58` — `map()` declaration.
- `Minecraft.World/Packet.cpp:15` — `Packet::staticCtor()` entry point.
- Bootstrapped first in `Minecraft.World.cpp:31`.

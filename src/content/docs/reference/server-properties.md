---
title: server.properties Reference
description: Every server.properties key with type, default, range, and description, plus the Access and Security file formats.
---

Exhaustive reference for the neoLegacy dedicated server's `server.properties`,
extracted from source:

- **Schema:** `Minecraft.Server/ServerProperties.h:11-120`
  (`struct ServerRuntime::ServerPropertiesConfig`).
- **Defaults + parsing:** `Minecraft.Server/ServerProperties.cpp`
  — the `kServerPropertyDefaults[]` table at lines 39-94 and the
  `LoadServerPropertiesConfig()` reader at lines 753-924.

The dedicated server is a neoLegacy addition (the original LCE had no headless
server). For the runtime that consumes these values see
[Server Configuration](/slop-docs/server/configuration/),
[Server Overview](/slop-docs/server/overview/), and
[Deployment](/slop-docs/server/deployment/).

## How the file is loaded

`LoadServerPropertiesConfig()` (`ServerProperties.cpp:753`) does the following:

1. Seeds an in-memory map from `kServerPropertyDefaults[]`
   (`ServerProperties.cpp:39`).
2. Parses `server.properties` if present (`ReadServerPropertiesFile`,
   `ServerProperties.cpp:299`) — lines starting with `#` or `!` are comments;
   both `=` and `:` are accepted as separators; the first separator wins.
3. Merges loaded values over defaults (unknown keys are preserved).
4. Reads each known key through a normalizing helper that clamps/validates it
   and rewrites the file if any value had to be repaired
   (`shouldWrite`).

If the file is missing, has zero properties, or is missing any default key, it
is (re)written with defaults on load. On save (`WriteServerPropertiesFile`,
`ServerProperties.cpp:401`) keys are sorted alphabetically and prefixed with:

```
# Minecraft server properties
# Auto-generated and normalized when missing
```

**CLI flags override the file.** `ServerMain.cpp`'s `ParseCommandLine()` applies
`-port`, `-ip`/`-bind`, `-name`, `-maxplayers`, `-seed`, and `-loglevel` on top
of the loaded config. See [Server Console](/slop-docs/server/console/).

### Value parsing rules

| Type | Accepted true/valid forms | Notes |
|---|---|---|
| bool | `true`/`1`/`yes`/`on`, `false`/`0`/`no`/`off` (case-insensitive) | `TryParseBool`, `ServerProperties.cpp:128`. Invalid → default. |
| int | base-10 integer, then clamped | `TryParseInt` + `ClampInt`, `ServerProperties.cpp:149`/`115`. |
| int64 | base-10 64-bit (may be negative) | `TryParseInt64`, `ServerProperties.cpp:173`. |
| string | trimmed; empty → default; truncated to max length | `ReadNormalizedStringProperty`, `ServerProperties.cpp:479`. |

## Core / world identity

| Key | Type | Default | Range / clamp | Description |
|---|---|---|---|---|
| `level-name` | string | `world` | non-empty | World display name. Empty falls back to `world`. |
| `level-id` | string | `world` | `[a-z0-9_.-]`, ≤ 31 chars | Save-folder id. Normalized via `NormalizeSaveId` (`ServerProperties.cpp:225`): lowercased, invalid chars → `_`, prefixed `w_` if it doesn't start alphanumeric, truncated to 31. Re-persisted by `ServerMain` after load. |
| `level-seed` | int64 (optional) | *(empty)* | any int64 | World seed. Empty means "no explicit seed" (`hasSeed=false`). |
| `override-seed` | int64 (optional) | *(unset)* | any int64 | Replaces the seed used for biome generation on existing worlds. **Not** in the defaults table — read directly from the merged map (`ServerProperties.cpp:837`), so it is only honored if you add it manually. |
| `level-type` | string | `default` | `default`/`normal`/`0`, or `flat`/`superflat`/`1` | World generator. `flat`/`superflat`/`1` → superflat (`levelTypeFlat=true`); everything else normalizes to `default` (`ServerProperties.cpp:582`). |
| `world-size` | enum | `classic` | `classic`/`small`/`medium`/`large` (also accepts `54`/`64`/`192`/`320` or `1`/`2`/`3`/`4`) | LCE finite-world size preset. Drives Overworld chunk width and Nether scale (see table below). Parsed by `TryParseWorldSize` (`ServerProperties.cpp:669`). |
| `max-build-height` | int | `256` | 64–256 | Maximum build height. |
| `motd` | string | `A Minecraft Server` | ≤ 255 chars | Message of the day. |

### `world-size` derived values

`world-size` maps to a chunk width (`LEVEL_WIDTH_*`) and a Nether scale
(`HELL_LEVEL_SCALE_*`), both from `Minecraft.World/ChunkSource.h:12-33`:

| Preset | Overworld width (chunks) | Nether scale |
|---|---:|---:|
| `classic` | 54 | 3 |
| `small` | 64 | 3 |
| `medium` | 192 | 6 |
| `large` | 320 | 8 |

## Networking

| Key | Type | Default | Range / clamp | Description |
|---|---|---|---|---|
| `server-port` | int | `25565` | 1–65535 | TCP listen port. |
| `server-ip` | string | `0.0.0.0` | ≤ 255 chars | Bind address; `0.0.0.0` = all interfaces. |
| `server-name` | string | `DedicatedServer` | ≤ 16 chars | Host name; also used as the fake host player's username. |
| `max-players` | int | `16` | 1–256 | Player cap. Default `kDefaultMaxPlayers=16`; hard cap `kMaxDedicatedPlayers=256` (`ServerProperties.cpp:34-35`). |
| `lan-advertise` | bool | `false` | — | Broadcast the server on the LAN. |

## Runtime / persistence

| Key | Type | Default | Range / clamp | Description |
|---|---|---|---|---|
| `log-level` | enum | `info` | `debug`/`info`/`warn`/`error` | Console log verbosity (`EServerLogLevel`). Parsed by `TryParseServerLogLevel`. |
| `autosave-interval` | int (seconds) | `60` | 5–3600 | World autosave period. `kDefaultAutosaveIntervalSeconds=60` (`ServerProperties.cpp:36`). |
| `disable-saving` | bool | `false` | — | When true, the world is never written to disk. |

## Gameplay / difficulty

| Key | Type | Default | Range / clamp | Description |
|---|---|---|---|---|
| `difficulty` | int | `1` | 0–3 | 0 peaceful, 1 easy, 2 normal, 3 hard. Hardcore forces 3 (`ServerMain.cpp`). |
| `gamemode` | int | `0` | 0–1 | 0 survival, 1 creative. |
| `hardcore` | bool | `false` | — | Hardcore mode (permadeath). Forces difficulty 3. |
| `hardcore-ban-ip` | bool | `false` | — | Whether a hardcore death also IP-bans the player. |
| `pvp` | bool | `true` | — | Player-vs-player damage. |
| `spawn-protection` | int (blocks) | `0` | 0–256 | Spawn protection radius; 0 disables. |
| `generate-structures` | bool | `true` | — | Generate villages, mineshafts, etc. |
| `bonus-chest` | bool | `false` | — | Place a bonus chest at world spawn. |
| `allow-nether` | bool | `true` | — | Allow Nether portals / travel. |
| `allow-flight` | bool | `true` | — | Allow client-side flight (anti-cheat toggle). |
| `fire-spreads` | bool | `true` | — | Fire spreads to adjacent blocks. |
| `tnt` | bool | `true` | — | TNT is enabled / explodes. |

## Game rules

These mirror the [in-world game rules](/slop-docs/world/gamerules/) and are
pushed to the engine as game-host options at boot (`ServerMain.cpp`).

| Key | Type | Default | Description |
|---|---|---|---|
| `mob-griefing` | bool | `true` | Mobs can alter blocks (creepers, endermen, etc.). |
| `keep-inventory` | bool | `false` | Keep items on death. |
| `do-mob-spawning` | bool | `true` | Natural mob spawning. |
| `do-mob-loot` | bool | `true` | Mobs drop loot. |
| `do-tile-drops` | bool | `true` | Blocks drop items when broken. |
| `natural-regeneration` | bool | `true` | Health regenerates from a full hunger bar. |
| `do-daylight-cycle` | bool | `true` | Time-of-day advances. |

## Spawn / mob toggles & caps

| Key | Type | Default | Range / clamp | Description |
|---|---|---|---|---|
| `spawn-animals` | bool | `true` | — | Passive animals spawn. |
| `spawn-monsters` | bool | `true` | — | Hostile mobs spawn. |
| `spawn-npcs` | bool | `true` | — | Villagers spawn. |
| `max-monsters` | int | `50` | 0–1000 | Per-level cap for monsters (zombies, skeletons, creepers…). **Not** in the defaults table (read at `ServerProperties.cpp:891`). |
| `max-animals` | int | `50` | 0–1000 | Per-level cap for animals (cows, sheep, pigs). Not in defaults table. |
| `max-ambient` | int | `20` | 0–1000 | Per-level cap for ambient mobs (bats). Not in defaults table. |
| `max-water-animals` | int | `5` | 0–1000 | Per-level cap for water mobs (squid). Not in defaults table. |
| `max-wolves` | int | `8` | 0–1000 | Per-level cap for wolves. Not in defaults table. |
| `max-chickens` | int | `8` | 0–1000 | Per-level cap for chickens. Not in defaults table. |
| `max-mushroom-cows` | int | `2` | 0–1000 | Per-level cap for mooshrooms. Not in defaults table. |

The `max-*` caps are applied to `MobCategory::…->setMaxInstancesPerLevel(...)`
during startup (`ServerMain.cpp`). Because these seven keys are absent from
`kServerPropertyDefaults[]`, a freshly-generated `server.properties` will not
list them; the loader still reads them (defaulting when missing) but does not
back-fill them into the file.

## Host / session options

These map to the LCE "host options" (the split-screen host's toggles), retained
for the dedicated host player.

| Key | Type | Default | Description |
|---|---|---|---|
| `trust-players` | bool | `true` | Trust joining players (relaxes some restrictions). |
| `friends-of-friends` | bool | `false` | Allow friends-of-friends to join. |
| `gamertags` | bool | `true` | Show gamertags. |
| `bedrock-fog` | bool | `true` | Render bedrock-style fog. |
| `host-can-fly` | bool | `true` | Host player may fly. |
| `host-can-change-hunger` | bool | `true` | Host player may edit hunger. |
| `host-can-be-invisible` | bool | `true` | Host player may turn invisible. |

## Security block

New capability with no LCE analog (LCE was peer-to-peer). Defaults mirror
`Security::SecuritySettings` (`Minecraft.Server/Security/SecurityConfig.h:7-17`),
built from these keys in `ServerMain.cpp` and passed to
`Security::InitializeSettings(...)`. See
[Server Overview](/slop-docs/server/overview/) for the connection flow.

| Key | Type | Default | Range / clamp | Description |
|---|---|---|---|---|
| `hide-player-list-prelogin` | bool | `true` | — | Strip XUIDs from the `PreLoginPacket` response. |
| `rate-limit-connections-per-window` | int | `5` | 1–100 | Max TCP connections per IP per window. |
| `rate-limit-window-seconds` | int | `30` | 5–300 | Sliding-window duration for connection rate limiting. |
| `max-pending-connections` | int | `10` | 1–50 | Max simultaneous pre-login connections. |
| `require-challenge-token` | bool | `false` | — | Reserved for a future protocol extension (not yet enforced). When set, `ServerMain` inits `IdentityTokenManager("identity-tokens.json")`. |
| `enable-stream-cipher` | bool | `true` | — | XOR stream cipher for traffic obfuscation (`StreamCipher`/`ConnectionCipher`). |
| `require-secure-client` | bool | `true` | — | Kick clients that don't complete the cipher handshake (`CipherHandshakeEnforcer`). `ServerMain` logs a warning if this is set while `enable-stream-cipher` is off. |
| `proxy-protocol` | bool | `false` | — | Parse PROXY protocol v1 headers from a TCP tunnel (e.g. playit.gg). |

The security subsystem's other knobs (rate limiter, cipher, handshake enforcer,
identity-token manager) are wired from the values above; they have no separate
`server.properties` keys.

## Access-control files (`Access/`)

Access control is **not** part of `server.properties`. `Access::Initialize(".",
whiteListEnabled)` (called from `ServerMain.cpp`) manages four JSON files in the
server working directory via `nlohmann::json`. `white-list` in
`server.properties` only toggles whether the whitelist is *enforced*
(`whiteListEnabled`) — the entries themselves live in `whitelist.json`.

Each file is a **top-level JSON array of objects** (`root.is_array()` checks at,
e.g., `BanManager.cpp:171`). Entries are keyed by XUID (`PlayerUID`), normalized
via `AccessStorageUtils::NormalizeXuid`. All metadata fields are strings
(`BanMetadata`, `BanManager.h:14-19`).

| File | Manager | Source | Object fields |
|---|---|---|---|
| `whitelist.json` | `WhitelistManager` | `WhitelistManager.cpp:21`, `136-139` | `xuid`, `name`, `created`, `source` |
| `ops.json` | `OpManager` | `OpManager.cpp:21`, `135-138` | `xuid`, `name`, `created`, `source` |
| `banned-players.json` | `BanManager` | `BanManager.cpp:23`, `304-309` | `xuid`, `name`, `created`, `source`, `expires`, `reason` |
| `banned-ips.json` | `BanManager` | `BanManager.cpp:24`, `329-333` | `ip`, `created`, `source`, `expires`, `reason` |

Example `banned-players.json`:

```json
[
  {
    "xuid": "2535413478912345",
    "name": "Griefer",
    "created": "2026-07-12T00:00:00Z",
    "source": "console",
    "expires": "",
    "reason": "griefing spawn"
  }
]
```

Example `whitelist.json` / `ops.json` entry:

```json
[
  { "xuid": "2535413478912345", "name": "Steve", "created": "2026-07-12T00:00:00Z", "source": "console" }
]
```

These files are edited at runtime through the console commands
`ban`, `ban-ip`, `pardon`, `pardon-ip`, `ban-list`, and `whitelist`
(see [Server Console](/slop-docs/server/console/)); manual edits are picked up
on `Reload`. A fifth security file, `identity-tokens.json`, is managed by
`IdentityTokenManager` when `require-challenge-token` is set and revoked via the
`revoketoken` command.

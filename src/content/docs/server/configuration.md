---
title: Server Configuration
description: The full server.properties schema, Access JSON allow/ban lists, and Security connection-hardening keys for the neoLegacy dedicated server.
---

The dedicated server is configured by `server.properties` in the exe's working directory, plus a set of JSON files for access control (bans, whitelist, ops). None of this exists in vanilla LCE — the split-screen client had no server config at all — so every key here is neoLegacy-specific. For the loader/lifecycle, see [Dedicated Server Overview](/slop-docs/server/overview/).

## `server.properties`

On first run, if `server.properties` is missing or empty, the loader writes it with defaults. On every run it back-fills missing keys, normalizes and clamps values, and re-saves if anything changed. Comments start with `#` or `!`; both `=` and `:` separate key and value; keys are written back sorted.

Files: `Minecraft.Server/ServerProperties.h`, `Minecraft.Server/ServerProperties.cpp`

The struct is `ServerRuntime::ServerPropertiesConfig`. Defaults come from `kServerPropertyDefaults[]` (`ServerProperties.cpp` lines 39–94); clamps come from the `ReadNormalized*Property(...)` calls in `LoadServerPropertiesConfig()` (lines 827–909).

### World & identity

| Key | Type | Default | Range / notes |
|---|---|---|---|
| `level-name` | string | `world` | Human world name; empty falls back to `world`. |
| `level-id` | string | `world` | Save-folder id; normalized to `[a-z0-9_.-]`, max 31 chars. Re-persisted after load. |
| `level-seed` | int64 | *(empty)* | Optional. Empty = no explicit seed. |
| `override-seed` | int64 | *(unset)* | Replaces the seed for biome generation on **existing** worlds. |
| `level-type` | string | `default` | `default`/`normal`/`0`, or `flat`/`superflat`/`1`. |
| `world-size` | enum | `classic` | `classic` / `small` / `medium` / `large` (also numeric aliases). Derives overworld chunk width and nether scale. |
| `max-build-height` | int | `256` | Clamped 64–256. |
| `motd` | string | `A Minecraft Server` | Max 255 chars. |

### Networking & host

| Key | Type | Default | Range / notes |
|---|---|---|---|
| `server-port` | int | `25565` | Clamped 1–65535. |
| `server-ip` | string | `0.0.0.0` | Bind address, max 255 chars. |
| `server-name` | string | `DedicatedServer` | Host display name, **truncated to 16 chars**. |
| `max-players` | int | `16` | Clamped 1–256 (`kDefaultMaxPlayers = 16`, `kMaxDedicatedPlayers = 256`). |
| `lan-advertise` | bool | `false` | LAN broadcast of the session. |
| `white-list` | bool | `false` | Enables the whitelist gate (see [Access](#access-json-allowban-lists)). |
| `log-level` | enum | `info` | `debug`/`info`/`warn`/`error`. |
| `autosave-interval` | int (s) | `60` | Clamped 5–3600. |

> **Note:** `max-players` is clamped to 256 by the property loader, but the CLI `-maxplayers` flag and the actual hosted game are bounded by `MINECRAFT_NET_MAX_PLAYERS` (a smaller engine limit — the CLI usage text says `1-8`). The property clamp is the outer bound, not the effective slot count.

### Difficulty, game mode & world options

| Key | Type | Default | Range / notes |
|---|---|---|---|
| `difficulty` | int | `1` | 0–3. Forced to `3` when `hardcore=true`. |
| `gamemode` | int | `0` | 0–1 (survival/creative). |
| `spawn-protection` | int | `0` | Radius in blocks, 0–256; 0 disables. |
| `generate-structures` | bool | `true` | |
| `bonus-chest` | bool | `false` | |
| `pvp` | bool | `true` | |
| `trust-players` | bool | `true` | |
| `fire-spreads` | bool | `true` | |
| `tnt` | bool | `true` | |
| `spawn-animals` | bool | `true` | |
| `spawn-npcs` | bool | `true` | |
| `spawn-monsters` | bool | `true` | |
| `allow-flight` | bool | `true` | |
| `allow-nether` | bool | `true` | |
| `friends-of-friends` | bool | `false` | |
| `gamertags` | bool | `true` | |
| `bedrock-fog` | bool | `true` | |

### Game rules

| Key | Type | Default |
|---|---|---|
| `mob-griefing` | bool | `true` |
| `keep-inventory` | bool | `false` |
| `do-mob-spawning` | bool | `true` |
| `do-mob-loot` | bool | `true` |
| `do-tile-drops` | bool | `true` |
| `natural-regeneration` | bool | `true` |
| `do-daylight-cycle` | bool | `true` |
| `disable-saving` | bool | `false` |

### Hardcore

| Key | Type | Default | Notes |
|---|---|---|---|
| `hardcore` | bool | `false` | Forces `difficulty=3` at startup. |
| `hardcore-ban-ip` | bool | `false` | Whether hardcore-death bans also add an IP ban. |

### Host cheats

| Key | Type | Default |
|---|---|---|
| `host-can-fly` | bool | `true` |
| `host-can-change-hunger` | bool | `true` |
| `host-can-be-invisible` | bool | `true` |

If any of the three is true, `eGameHostOption_CheatsEnabled` is turned on (`ServerMain.cpp` lines 567–572).

### Per-mob spawn caps

Each is clamped 0–1000 and pushed onto the matching `MobCategory` at startup.

| Key | Type | Default | Category |
|---|---|---|---|
| `max-monsters` | int | `50` | `MobCategory::monster` (zombies, skeletons, creepers…) |
| `max-animals` | int | `50` | `MobCategory::creature` (cows, sheep, pigs) |
| `max-ambient` | int | `20` | `MobCategory::ambient` (bats) |
| `max-water-animals` | int | `5` | `MobCategory::waterCreature` (squid) |
| `max-wolves` | int | `8` | `MobCategory::creature_wolf` |
| `max-chickens` | int | `8` | `MobCategory::creature_chicken` |
| `max-mushroom-cows` | int | `2` | `MobCategory::creature_mushroomcow` |

### Security (connection hardening)

See [the Security section below](#security-connection-hardening) for what each does. Defaults and clamps:

| Key | Type | Default | Range |
|---|---|---|---|
| `hide-player-list-prelogin` | bool | `true` | |
| `rate-limit-connections-per-window` | int | `5` | 1–100 |
| `rate-limit-window-seconds` | int | `30` | 5–300 |
| `max-pending-connections` | int | `10` | 1–50 |
| `require-challenge-token` | bool | `false` | |
| `enable-stream-cipher` | bool | `true` | |
| `require-secure-client` | bool | `true` | |
| `proxy-protocol` | bool | `false` | |

### Save behaviour

`LoadServerPropertiesConfig()` and `SaveServerPropertiesConfig()` are the two entry points. Loading auto-repairs and re-saves the whole file (sorted). Saving persists only `level-name`, `level-id`, and `white-list`, merging over the existing file so untouched keys survive. `ServerMain` calls the saver once at startup to re-persist the resolved `level-id` after a load.

## Access: JSON allow/ban lists

Access control is a set of JSON files (via bundled `nlohmann::json`) managed by the `ServerRuntime::Access` namespace facade over three backends. `Access::Initialize(baseDir, whitelistEnabled)` loads them; a matching `Shutdown()` is guaranteed by an RAII guard in `main`.

Files: `Minecraft.Server/Access/Access.h`, `Minecraft.Server/Access/BanManager.cpp`, `Minecraft.Server/Access/WhitelistManager.cpp`, `Minecraft.Server/Access/OpManager.cpp`

| File | Backend | Contents |
|---|---|---|
| `banned-players.json` | `BanManager` | Player bans, keyed by `PlayerUID` (XUID). |
| `banned-ips.json` | `BanManager` | IP bans. |
| `whitelist.json` | `WhitelistManager` | Whitelisted players. |
| `ops.json` | `OpManager` | Server operators. |

Entries carry metadata: `BanMetadata` / `BannedPlayerEntry` / `BannedIpEntry`, `WhitelistMetadata` / `WhitelistedPlayerEntry`, `OpMetadata` / `OpPlayerEntry`.

Predicates and mutations (all in `Access.h`):

- Checks: `IsPlayerBanned`, `IsIpBanned`, `IsPlayerWhitelisted`, `IsPlayerOp`, `IsWhitelistEnabled`.
- Mutations: `AddPlayerBan`, `AddIpBan`, `RemovePlayerBan`, `RemoveIpBan`, `AddWhitelistedPlayer`, `RemoveWhitelistedPlayer`, `AddOp`, `RemoveOp`, `SetWhitelistEnabled`.
- Reload: `Reload`, `ReloadWhitelist`, `ReloadOps`.
- Copy-out for command output: `SnapshotBannedPlayers`, `SnapshotBannedIps`, `SnapshotWhitelistedPlayers`, `SnapshotOps`.
- XUID helpers: `FormatXuid`, `TryParseXuid`.

These are what the CLI ban/pardon/whitelist commands operate on — see [Server Console & CLI](/slop-docs/server/console/#the-commands). The gates are enforced at pre-login/login: whitelist, player ban, and IP ban are all checked as a remote player connects.

> **Note:** the `ops.json` / `OpManager` backend exists and is loaded, but the `Access.h` header comment describes the facade as "general-purpose, assuming the implementation of whitelists and ops in the future" — treat op enforcement depth as evolving.

## Security: connection hardening

`server.properties` security keys are read into `ServerRuntime::Security::SecuritySettings` and applied via `Security::InitializeSettings(...)` at startup. This is entirely new — vanilla LCE's P2P sessions had no server-side connection hardening.

Files: `Minecraft.Server/Security/SecurityConfig.h`, and the enforcement modules in `Minecraft.Server/Security/`

`SecuritySettings` defaults (`SecurityConfig.h`):

```
struct SecuritySettings
{
    bool hidePlayerListPreLogin = true;
    int  rateLimitConnectionsPerWindow = 5;
    int  rateLimitWindowSeconds = 30;
    int  maxPendingConnections = 10;
    bool requireChallengeToken = false;
    bool enableStreamCipher = true;
    bool requireSecureClient = true;
    bool proxyProtocol = false;
};
```

| Setting | Module | What it does |
|---|---|---|
| `hide-player-list-prelogin` | (pre-login response) | Strips XUIDs from the pre-login packet so scanners can't enumerate players before login. |
| `rate-limit-connections-per-window` / `rate-limit-window-seconds` | `RateLimiter` | Per-IP sliding-window connection rate limit. |
| `max-pending-connections` | `RateLimiter` | Cap on simultaneous pre-login connections. |
| `enable-stream-cipher` | `StreamCipher` / `ConnectionCipher` | XOR stream cipher for traffic obfuscation. |
| `require-secure-client` | `CipherHandshakeEnforcer` | Kicks clients that don't complete the cipher handshake. |
| `require-challenge-token` | `IdentityTokenManager` | Challenge-token identity, persisted to `identity-tokens.json`. The `revoketoken` CLI command revokes a token. The `ServerProperties.h` comment marks this as "reserved for future protocol extension (not yet enforced)". |
| `proxy-protocol` | (connection parse) | Parses PROXY protocol v1 headers from a TCP tunnel (e.g. playit.gg). |

At startup `ServerMain` logs the effective security posture and emits a warning when `require-secure-client` is enabled but `enable-stream-cipher` is disabled (in which case secure-client enforcement has no effect), because the enforcer relies on the cipher handshake.

For the runtime flow these settings gate, see [Dedicated Server Overview](/slop-docs/server/overview/#3-subsystem-init).

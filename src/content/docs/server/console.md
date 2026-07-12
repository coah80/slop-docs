---
title: Server Console & CLI
description: The linenoise-backed dedicated-server console — input threads, command dispatch, and the built-in command set.
---

The dedicated server runs an interactive console: a `server> ` prompt with line editing, history, and tab completion, backed by the bundled `linenoise` library. Input is read on a background thread and dispatched on the main loop. None of this existed in LCE — it's part of neoLegacy's dedicated-server capability. For the surrounding lifecycle see [Dedicated Server Overview](/slop-docs/server/overview/).

Files: `Minecraft.Server/Console/`, `Minecraft.Server/vendor/linenoise/`

## Command-line flags

Before the console ever starts, `ServerMain.cpp`'s `ParseCommandLine()` (lines 221–288) reads the exe's flags. **CLI flags override `server.properties`.** The VS debugger and the Docker entrypoint both launch with `-port 25565 -bind 0.0.0.0`.

| Flag | Argument | Effect |
|---|---|---|
| `-port` | `1-65535` | Listen TCP port. |
| `-ip` / `-bind` | address | Bind address (aliases). |
| `-name` | string ≤16 | Host display name. |
| `-maxplayers` | `1..MINECRAFT_NET_MAX_PLAYERS` | Public slots (usage text says `1-8`). |
| `-seed` | int64 | World seed (overrides `level-seed`). |
| `-loglevel` | `debug`\|`info`\|`warn`\|`error` | Log verbosity. |
| `-perftrace` | *(none)* | Enables noisy `[perf]` sampling output (`ServerRuntime::g_serverPerfTrace`). |
| `-help` / `--help` / `-h` | *(none)* | Print usage and exit. |

Flag parsing is case-insensitive (`_stricmp`). An unknown or incomplete argument prints usage and returns exit code 1. `PrintUsage()` (lines 159–171) documents each flag.

## Architecture

Three cooperating classes in `Minecraft.Server/Console/`:

| Class | Role | File |
|---|---|---|
| `ServerCli` | Facade; owns the engine + input, exposes `Start()` / `Stop()` / `Poll()`. | `ServerCli.h` |
| `ServerCliInput` | Owns the input `std::thread`; reads lines and enqueues them. | `ServerCliInput.h` |
| `ServerCliEngine` | Parses, dispatches, completes, and holds server-side helpers. | `ServerCliEngine.h` |

Plus `ServerCliParser` (tokenizer) and `ServerCliRegistry` (command table).

`ServerMain`'s main loop constructs one `ServerCli`, calls `Start()`, then calls `Poll()` once per tick (`ServerMain.cpp` lines 712–719), and `Stop()` at shutdown.

## Input flow

`ServerCliInput::Start()` spins up the input thread. `RunInputLoop()` picks one of two modes based on `UseStreamInputMode()`, which checks the `SERVER_CLI_INPUT_MODE` environment variable:

```
const char *mode = getenv("SERVER_CLI_INPUT_MODE");
```

### Interactive mode (`RunLinenoiseLoop`)

The default. Sets up linenoise history (`linenoiseHistorySetMaxLen(128)`) and registers a completion callback, then loops on `linenoise("server> ")`. A `NULL` return means a stop request or Ctrl+C inside linenoise. Each non-empty line is added to history and enqueued.

### Stream mode (`RunStreamInputLoop`)

Selected when `SERVER_CLI_INPUT_MODE=stream`, which is **required on Linux/Docker** where stdin is piped and not a console/pty. It reads stdin byte-by-byte via `ReadFile` on the `STD_INPUT_HANDLE`, handles CR/LF (with `skipNextLf`), backspace (`8` / `127`), and Ctrl+C (`3`), printing `server> ` after each line. If the stdin handle is unavailable it falls back to the linenoise loop with a warning.

Both modes call `EnqueueLine()`, which adds to linenoise history and calls `m_engine->EnqueueCommandLine(line)`.

### Tab completion

In interactive mode, linenoise calls `CompletionThunk` → `ServerCliInput::BuildCompletions` → the engine's `BuildCompletions`, which produces command-name and argument suggestions (players, gamemodes) and — in the FourKit build — plugin command names.

## Dispatch

`EnqueueCommandLine()` pushes the raw line onto a mutex-guarded `std::queue`. Execution is deferred: `ServerCliEngine::Poll()` (called from the main thread) drains the queue and runs `ExecuteCommandLine()` on each line, keeping the lock scope to the dequeue only.

`ExecuteCommandLine()` (lines 143–176):

1. Trim; strip an optional leading `/`.
2. `ServerCliParser::Parse(...)` tokenizes the line.
3. `m_registry->FindMutable(tokens[0])` looks up the command.
4. On a hit, `command->Execute(parsed, this)`.
5. On a miss, route to `FourKitBridge::HandleConsoleCommand(normalizedLine)` (a no-op returning `false` in the vanilla build); if that also returns `false`, log `Unknown command: <name>`.

```
IServerCliCommand *command = m_registry->FindMutable(parsed.tokens[0]);
if (command == NULL)
{
    if (FourKitBridge::HandleConsoleCommand(normalizedLine))
    {
        return true;
    }
    LogWarn("Unknown command: " + parsed.tokens[0]);
    return false;
}
```

This deferred, main-thread-only execution is deliberate: commands touch world/network state, so they never run on the input thread.

## World commands

For gameplay commands, `ServerCliEngine::DispatchWorldCommand(EGameCommand command, byteArray commandData, sender)` wraps `Minecraft.World`'s `CommandDispatcher`. When `sender` is null it substitutes an internal console command sender (`m_consoleSender`). This is how the console reuses the same command machinery the in-game client uses, rather than reimplementing `/give`, `/tp`, etc.

Helpers on the engine: `GetOnlinePlayerNamesUtf8`, `FindPlayerByNameUtf8`, `SuggestPlayers`, `SuggestGamemodes`, `ParseGamemode`.

## The commands

`RegisterDefaultCommands()` (`ServerCliEngine.cpp` lines 94–115) registers 19 commands via `ServerCliRegistry`. Each lives in its own directory under `Console/commands/<name>/` (implementing the `IServerCliCommand` interface, with shared `CommandParsing.h` helpers).

| Command | Class | Purpose |
|---|---|---|
| `help` | `CliCommandHelp` | List commands (includes plugin command help in FourKit builds). |
| `stop` | `CliCommandStop` | Request graceful shutdown. |
| `list` | `CliCommandList` | List online players. |
| `ban` | `CliCommandBan` | Ban a player (writes `banned-players.json`). |
| `ban-ip` | `CliCommandBanIp` | Ban an IP (writes `banned-ips.json`). |
| `pardon` | `CliCommandPardon` | Remove a player ban. |
| `pardon-ip` | `CliCommandPardonIp` | Remove an IP ban. |
| `ban-list` | `CliCommandBanList` | Show current bans. |
| `whitelist` | `CliCommandWhitelist` | Manage the whitelist. |
| `revoketoken` | `CliCommandRevokeToken` | Revoke an identity/challenge token. |
| `tp` | `CliCommandTp` | Teleport. |
| `time` | `CliCommandTime` | Set/query world time. |
| `weather` | `CliCommandWeather` | Set weather. |
| `give` | `CliCommandGive` | Give items. |
| `enchant` | `CliCommandEnchant` | Enchant held item. |
| `kill` | `CliCommandKill` | Kill an entity/player. |
| `gamemode` | `CliCommandGamemode` | Set a player's game mode. |
| `defaultgamemode` | `CliCommandDefaultGamemode` | Set the default game mode. |
| `experience` | `CliCommandExperience` | Grant/query XP. |

The `ban`/`pardon`/`whitelist`/`revoketoken` commands operate on the [Access and Security state](/slop-docs/server/configuration/#access-json-allowban-lists); the gameplay commands (`tp`, `give`, `time`, etc.) go through `DispatchWorldCommand` into `Minecraft.World`.

## FourKit plugin commands

In the FourKit build, when a console line matches no built-in command it is routed to `FourKitBridge::HandleConsoleCommand(...)`, letting plugins register their own console commands. `FourKitBridge::GetPluginCommandHelp(...)` feeds plugin command usage/description into both `help` output and tab completion (`ServerCliEngine.cpp` lines 218–235). In the vanilla build both are inline no-ops, so plugin commands simply don't exist there.

---
title: Performance & Stress Testing
description: The performance-monitor GUI + injected perf-monitor.dll and the stress-test bot swarm — tick-phase instrumentation and thread-safety load testing for the dedicated server.
---

Two tools under `tools/` exist to profile and load-test the **dedicated server**: a live instrumentation GUI backed by an injected C++ DLL, and a Python bot swarm that hammers the connection/player-list code paths. Both target `Minecraft.Server.exe` — see [Deployment](/slop-docs/server/deployment/) for building it.

## `tools/performance-monitor/` — live server instrumentation

A PySide6 desktop GUI that connects to a small C++ DLL injected into the running `Minecraft.Server.exe`. The DLL hooks the server tick, times each phase, reads entity/chunk/memory counts, and streams the data out over TCP as length-prefixed JSON. The GUI renders tick-phase breakdowns, entity/chunk panels, a memory bar, and lag-spike root-cause classification.

```
Minecraft.Server.exe
   └── perf-monitor.dll (injected)      ── TCP :19800 ──▶  main.py (PySide6 GUI)
        hooks MinecraftServer::tick()                       tick / autosave frames
```

### The injected DLL (`dll/`)

Built separately from the game, as a standalone Visual Studio CMake project:

```
dll/build-dll.bat   →  cmake .. -G "Visual Studio 17 2022" -A x64
                       cmake --build . --config Release
                       → dll/build/Release/perf-monitor.dll
```

The DLL links `dbghelp` (PDB symbol resolution), `ws2_32` (the TCP server), and `psapi` (`GetProcessMemoryInfo`). Critically, it is compiled with the **static CRT** to match the server:

```cmake
# Use /MT to match the server's static CRT (MultiThreaded / MultiThreadedDebug)
set_property(TARGET perf-monitor PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
```

At runtime it uses DbgHelp to resolve the private symbol `MinecraftServer::tick()` from the server's PDB, installs a trampoline on it, and collects per-phase timing from inside the game thread. Source lives in `dll/src/`: `dllmain.cpp`, `hooks.cpp`, `symbols.cpp`, `metrics.cpp`, `tcp_server.cpp`, `json_writer.cpp`, `perf_monitor.h`.

Files: `tools/performance-monitor/dll/CMakeLists.txt`, `tools/performance-monitor/dll/src/*`, `tools/performance-monitor/build-dll.bat`

### Injection (`inject.py`)

`inject.py` finds the running `Minecraft.Server.exe`, then injects the DLL with the classic `VirtualAllocEx` + `WriteProcessMemory` + `CreateRemoteThread(LoadLibraryA)` technique (pure `ctypes`, no third-party deps):

```
python inject.py                    # auto-find server process
python inject.py --pid 12345        # specific PID
python inject.py --dll path/to.dll  # custom DLL path
python inject.py --eject            # unload the DLL from the server
```

`inject.bat` is a one-line wrapper (`python inject.py %*`).

Files: `tools/performance-monitor/inject.py`, `tools/performance-monitor/inject.bat`

### The GUI (`main.py`)

```
pip install -r requirements.txt      # PySide6>=6.6
python main.py                       # defaults
python main.py --host 127.0.0.1 --port 19800
```

`start.bat` wraps `python main.py %*`. `main.py` sets up a file logger (`perfmon.log`), builds a `PerfMonitorWindow`, and pre-fills the host/port fields from `--host`/`--port` if given. The DLL **listens on port 19800 by default** — `connection.py` even calls this out in its error message when a frame decodes with an implausible length ("wrong port? DLL listens on 19800 by default").

The window title is `LCE Server Performance Monitor`. Supporting modules: `gui.py` (window + panels), `widgets.py` (`EntityChunkPanel`, `MemoryBar`, `LagSpikePanel`, …), `models.py` (`TickSnapshot`/`AutosaveSnapshot`/`LevelSnapshot` dataclasses + parsers), `connection.py` (the TCP client), `bots.py` (a `BotManager` that can spawn test bots from inside the GUI).

Files: `tools/performance-monitor/main.py`, `tools/performance-monitor/gui.py`, `tools/performance-monitor/widgets.py`, `tools/performance-monitor/models.py`, `tools/performance-monitor/connection.py`, `tools/performance-monitor/bots.py`, `tools/performance-monitor/requirements.txt`

### The wire protocol

The DLL serializes each tick as a **big-endian `uint32` length prefix** followed by a JSON payload (`connection.py` reads `struct.unpack(">I", ...)` frames, rejecting anything over 1 MB). Message types are dispatched on a `type` field:

| Message | Meaning |
|---|---|
| `hello_ack` | Handshake — reports `level_count` and `server_tps_target` (default 20) |
| `tick` | One tick's per-phase timing + counts → `TickSnapshot` |
| `autosave` | An autosave event's phase timing → `AutosaveSnapshot` |

### Tick-phase breakdown

The `TickSnapshot` struct (`perf_monitor.h`) is what the GUI visualizes. Top-level per-tick fields, all timed inside the hooked `MinecraftServer::tick()`:

| Field | Phase timed |
|---|---|
| `totalUs` | Whole tick |
| `poolResetUs` | Frame/pool reset at tick start |
| `playersTickUs` | Player tick |
| `connectionTickUs` | Network/connection tick |
| `consoleTickUs` | Server console/CLI tick |
| `totalPlayers` | Player count |
| `memoryUsedMb` / `memoryTotalMb` | Process memory (via `psapi`) |
| `isAutosaving` / `isPaused` | Flags |

Each loaded dimension contributes a `LevelMetrics` entry (`levels[]`):

| Field | Meaning |
|---|---|
| `dimension` | `0` Overworld, `-1` Nether, `1` End |
| `levelTickUs` | `Level::tick()` (weather) |
| `entityTickUs` | `Level::tickEntities()` |
| `entityTickSkipped` | Whether entity tick was skipped this tick |
| `trackerTickUs` | `EntityTracker::tick()` |
| `entityCount` / `globalEntityCount` | Entity counts |
| `playerCount`, `loadedChunks`, `entitiesToRemove`, `tileEntityCount` | Per-level counts |

Autosave events carry their own phase split (`AutosaveSnapshot`): `playersUs`, `levelsUs`, `rulesUs`, `flushUs`. The synchronous `Flush()` (compress + write the save file) is a known lag-spike source, and the GUI's `classify_spike()` in `gui.py` uses these deltas to attribute a spike to autosave, a player join/leave, or an entity-removal burst.

## `tools/stress-test/` — the bot swarm

A Python bot swarm (`stress_test.py`, 27 KB) that rapidly connects and disconnects real protocol clients to stress the server's thread safety. It targets four race-prone paths:

- **Player-list thread safety** — rapid add/remove on the players vector.
- **Socket-write races** — disconnecting mid-write.
- **Movement validation** — `--move` sends position packets that trigger the "moved wrongly" check.
- **Concurrent join/leave** — `--burst` joins several bots at once.

### Requirements & usage

- Python **3.10+**; `pycryptodome` only if the server has its cipher enabled.
- Positional args are `host port`, then flags.

```
python stress_test.py 127.0.0.1 19132              # 50 cycles, 8 bots, 2–10s holds
python stress_test.py 127.0.0.1 19132 --bots 12 --hold 0.5 2 --ramp 0.2
python stress_test.py 127.0.0.1 19132 --move --hold 5 15
python stress_test.py 127.0.0.1 19132 --burst 4 --hold 1 3
python stress_test.py 127.0.0.1 19132 --cycles 0 --duration 300
```

| Option | Default | Description |
|---|---|---|
| `--bots N` | 8 | Max concurrent bot connections |
| `--cycles N` | 50 | Total connect/disconnect cycles (`0` = infinite). Global spawn counter, **not** a per-bot reconnect cap |
| `--hold MIN MAX` | 2 10 | Random hold time before disconnect (seconds) |
| `--ramp SECS` | 0.5 | Delay between spawning bots |
| `--move` | off | Send movement packets while connected |
| `--burst N` | 1 | Bots spawned simultaneously per cycle |
| `--duration SECS` | 0 | Time limit (`0` = run until cycles complete) |
| `--quiet` | off | Only periodic stats, no per-bot logs |

Files: `tools/stress-test/stress_test.py`, `tools/stress-test/README.md`

### `.bat` presets

Each preset prompts for host/port then invokes `stress_test.py` with a fixed argument set:

| Preset | Invocation (after host/port prompt) | Purpose |
|---|---|---|
| `test_basic.bat` | *(defaults)* | Basic connect/disconnect churn |
| `test_aggressive.bat` | `--bots 12 --hold 0.5 2 --ramp 0.2` | Hammers the `players.erase()` path |
| `test_burst.bat` | `--burst 4 --hold 1 3` | Simultaneous burst joins |
| `test_movement.bat` | `--move --hold 5 15` | Triggers the "moved wrongly" path |
| `test_endurance.bat` | `--cycles 0 --duration 300 --bots 512 --burst 32 --move --hold 10 30 --ramp 0.1 --quiet` | 5-minute all-patterns soak |
| `test_fourkit_chunk.bat` | `--bots 50 --burst 10 --move --hold 60 120 --ramp 0.5 --duration 600 --cycles 0 --quiet` | FourKit `FireChunkLoad`/`FireChunkUnload`/`FirePlayerMove` under rotation |
| `test_fourkit_steady.bat` | `--bots 50 --burst 10 --move --hold 99999 99999 --ramp 0.5 --duration 600 --cycles 0 --quiet` | Steady-state 20-TPS validation, no reconnect rotation |

The two FourKit presets are meant to validate the plugin host's `HasHandlers` fast-path and Server GC at the 50-player target (see [FourKit Plugins](/slop-docs/server/fourkit-plugins/)). Both warn: set `require-secure-client=false` in `server.properties` first, because the 100-tick cipher-handshake grace cannot absorb 50 simultaneous bot joins. `test_fourkit_steady.bat` also documents an in-game routine (`/fktest scatter`, wait for the chunk-load wave to drain, `/fktest tps`).

### Gotchas

- Default ports differ between presets: the plain load presets prompt for **19132**, while the endurance and FourKit presets prompt for **25565** (the server's default). Confirm your server's actual port.
- `test_endurance.bat` has an inconsistency: its prompt shows a `25565` default but the empty-input fallback sets `PORT=19132`. Type the port explicitly to be safe.
- `--cycles` is a **global spawn counter**, not a per-bot reconnect cap — `--cycles 1` caps total spawns at one bot.

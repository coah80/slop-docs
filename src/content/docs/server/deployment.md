---
title: Deployment
description: Building and running the neoLegacy dedicated server — CMake targets, Docker under Wine + Xvfb, compose files, and the Linux launcher scripts.
---

The dedicated server is a **Windows x64 exe**. On Linux it is run under Wine, inside a virtual X display (Xvfb) because the server links the full client render stack (see [Dedicated Server Overview](/slop-docs/server/overview/#it-compiles-the-full-client)). This page covers building both flavours, the Docker path, the compose files, and the Linux launcher scripts.

For per-target build details see also [Platforms](/slop-docs/platforms/overview/); for configuration see [Server Configuration](/slop-docs/server/configuration/).

## CMake targets

Two executable targets, both named `Minecraft.Server.exe` on disk, distinguished only by build directory:

| Target | Flavour | Extra |
|---|---|---|
| `Minecraft.Server` | vanilla | none |
| `Minecraft.Server.FourKit` | FourKit | `-DMINECRAFT_SERVER_FOURKIT_BUILD`; depends on managed target `Minecraft.Server.FourKit.Managed` |

Both call `configure_lce_server_target(target)` from `cmake/ServerTarget.cmake`. Server targets are **Windows64-only** — the root `CMakeLists.txt` only adds the server subdirectories when `PLATFORM_NAME` is `Windows64`.

Files: `cmake/ServerTarget.cmake`, `Minecraft.Server/CMakeLists.txt`, `Minecraft.Server.FourKit/CMakeLists.txt`

### `ServerTarget.cmake`

`configure_lce_server_target(target)` is the shared recipe:

- Defines `MINECRAFT_SERVER_BUILD` plus the shared defines; PCH is `stdafx.h`.
- Include dirs: the generated dir (`BuildVer.h`), `Minecraft.Client/`, the Iggy include dir, `Minecraft.Server`, and `include/`.
- Links `Minecraft.World`, `d3d11`, `dxgi`, `d3dcompiler`, `XInput9_1_0`, `wsock32`, `legacy_stdio_definitions`, the four 4JLibs (`Input`/`Profile`/`Storage`/`Render`), and each Iggy lib. Native builds link the 4JLibs debug targets; cross-clang builds link the prebuilt `4J_*.lib` files.

> **Changed in v1.1.0b:** build fix #44 also links `dbghelp` (both the debug-4JLibs and prebuilt-`.lib` link paths) — part of the crash-symbol tooling added alongside the client's Release `/Zi /DEBUG` flags. At snapshot `47e5cba3` the list above is complete; v1.1.0b inserts `dbghelp` after `wsock32`.
- Forces `OUTPUT_NAME "Minecraft.Server"` and per-target `RUNTIME_OUTPUT_DIRECTORY` (`build/<target>/<config>`) so ninja doesn't emit duplicate outputs for the two flavours.
- Sets the VS debugger args:

```
VS_DEBUGGER_COMMAND_ARGUMENTS "-port 25565 -bind 0.0.0.0 -name DedicatedServer"
```

- Wires asset-copy sub-targets (`Common/res`, `Common/Media/MediaWindows64`), localization copy (`Windows64Media/loc`), redist copy, and the `GameHDD` dir.

> **Changed past v1.1.0b:** the TU43 bug-fix commit `680f539f` (upstream tip `3833d0f3`; formerly `f61aa677` under `237dc7d3` before upstream force-pushed the range) adds a `+13`-line `AssetLootTablesCopy_${target}` custom target to `ServerTarget.cmake`. The shared asset copy excludes `*.xml` (which is every loot table), so this step copies `Structures/loot_tables/` in explicitly, mirroring the client's `AssetLootTablesCopy`. Without it the dedicated server ships no loot tables on disk and mobs/chests/fishing drop nothing. At snapshot `47e5cba3` this target does not exist.

### FourKit managed build

`Minecraft.Server.FourKit/CMakeLists.txt`:

- **Hard-fails configure** if `dotnet` isn't on PATH, and again if `dotnet --list-sdks` shows no `10.x.y` SDK (`FATAL_ERROR` with an install link). The exact SDK is pinned by `/global.json`.
- `add_custom_target(Minecraft.Server.FourKit.Managed ALL ...)` runs:

```
dotnet publish "${FOURKIT_CSPROJ}"
  --configuration <cfg>
  --runtime win-x64
  --self-contained true
  --output <bin>/$<CONFIG>
```

  then `copy_directory` into `<exe dir>/runtime/` and `make_directory <exe dir>/plugins`. The self-contained payload means end users need no .NET install.
- `add_executable(Minecraft.Server.FourKit ...)` = shared sources + the 7 bridge files; `configure_lce_server_target(...)`; `target_compile_definitions(... PRIVATE MINECRAFT_SERVER_FOURKIT_BUILD)`; `add_dependencies(Minecraft.Server.FourKit Minecraft.Server.FourKit.Managed)`.

The CMake target is named `.Managed` to avoid colliding with the C++ exe target; the `.csproj`, assembly, and namespace all stay `Minecraft.Server.FourKit`.

### Building

From a Developer PowerShell (native Windows):

```
cmake --preset windows64
cmake --build --preset windows64-release --target Minecraft.Server
cmake --build --preset windows64-release --target Minecraft.Server.FourKit
```

On Linux, `build-linux.sh` cross-compiles Windows x64 with clang-cl (see [Linux launchers](#linux-launcher-scripts)).

## Docker (vanilla only)

The FourKit image is **intentionally not built** — the Dockerfile, both compose files, and `FOURKIT_PARITY.md` all note that hosting the .NET 10 self-contained runtime through Wine hasn't been smoke-tested. Docker ships the vanilla server; run FourKit natively on Windows.

Files: `docker/dedicated-server/Dockerfile`, `docker/dedicated-server/entrypoint.sh`

### Dockerfile

Base `debian:bookworm-slim`, installs `wine` / `wine64` / `wine32:i386` / `xvfb` / `tini`. Build arg:

```
ARG MC_RUNTIME_DIR=build/windows64/Minecraft.Server/Release
```

**You must build the server with CMake first** — the Dockerfile only *copies* the runtime, it doesn't build it. It COPYs `Minecraft.Server.exe`, `iggy_w64.dll`, `Common/`, `Windows64/`, and the entrypoint. `WINEARCH=win64`, `WINEPREFIX=/var/opt/wineprefix64`, workdir `/srv/mc`, entrypoint via `tini`.

### entrypoint.sh

1. Creates `/srv/persist` and `/srv/persist/GameHDD`.
2. `ensure_persist_file` symlinks persisted `server.properties`, `banned-players.json`, `banned-ips.json`, and `GameHDD` out of the image into the runtime dir, so restarts and image rebuilds keep your data.
3. Robustly starts Xvfb on `$XVFB_DISPLAY` — `wait_for_xvfb_ready` polls the `/tmp/.X11-unix/X<n>` socket and checks the Xvfb PID is still alive, with a configurable `XVFB_WAIT_SECONDS` (default 10).
4. Picks a Wine binary (`wine64` → `/usr/lib/wine/wine64` → `wine`).
5. Launches:

```
exec "${WINE_CMD}" "${SERVER_EXE}" -port "${SERVER_PORT}" -bind "${SERVER_BIND_IP}"
```

The entrypoint's own default screen if unset is `64x64x16`; the compose files raise it to `720x1280x16` (see below). The comment in the script is explicit about why the virtual display is needed at all: "a virtual screen is required because the client-side logic is being called for compatibility."

### Worked trace: `compose up` to the first log lines

This walks a Docker cold start from `docker compose up` to the first lines a user should
expect on stdout, citing each step. It is the concrete version of the entrypoint steps
above.

**1 — Compose starts the container.** `docker compose -f docker-compose.dedicated-server.yml up`
builds/pulls the image, mounts `./server-data:/srv/persist`, sets `SERVER_CLI_INPUT_MODE=stream`,
`XVFB_DISPLAY=:99`, `XVFB_SCREEN=720x1280x16`, `WINEDEBUG=-all`, and runs the container
under `tini` with `tty`+`stdin_open`. `tini` execs `entrypoint.sh`.

**2 — Working dir + exe guard.** `entrypoint.sh` (`set -euo pipefail`) validates
`/srv/mc` exists and `cd`s into it (`entrypoint.sh:92-97`), then hard-fails with a
`[hint]` if `Minecraft.Server.exe` is absent (`:100-104`) — the image only *copies* the
runtime, so a missing exe means you never ran the CMake build.

**3 — Persist symlinks.** `mkdir -p /srv/persist` and `/srv/persist/GameHDD` (`:106-109`),
then `ensure_persist_file` (`:12-30`) seeds and symlinks `server.properties`,
`banned-players.json` (default `[]`), and `banned-ips.json` out of the image into
`/srv/persist` so restarts keep them (`:111-113`), and `GameHDD` is symlinked from the
persist mount into `Windows64/GameHDD` (`:116-119`). This is why your world and config
survive `docker compose down`/rebuild.

**4 — Pick Wine, ensure prefix.** The script prefers `wine64` → `/usr/lib/wine/wine64`
→ `wine` (`:122-131`) and creates `$WINEPREFIX` if empty (`:133-135`).

**5 — Start Xvfb, poll for readiness.** With `$DISPLAY` unset it exports
`DISPLAY=:99`, clears any stale `X99` socket/lock (`:147-151`), launches
`Xvfb :99 -nolisten tcp -screen 0 720x1280x16` into `/tmp/xvfb.log` (`:152`), and calls
`wait_for_xvfb_ready` (`:32-90`). That polls the `/tmp/.X11-unix/X99` socket up to
`XVFB_WAIT_SECONDS`×10 ticks (default 10 s), re-checking the Xvfb PID is still alive at
each step and dumping the tail of `xvfb.log` on failure. On success it prints the
**first expected line**:

```
[info] Xvfb ready on :99 (pid=<n>, screen=720x1280x16)
```

**6 — Exec the server.** The script builds `-port $SERVER_PORT -bind $SERVER_BIND_IP`
(`:160-163`), prints `[info] Starting Minecraft.Server.exe on 0.0.0.0:25565`
(`:165`), and `exec wine Minecraft.Server.exe -port 25565 -bind 0.0.0.0` (`:166`) —
replacing the shell so `tini` reaps the server directly.

**7 — The server's own first lines.** Now `ServerMain.cpp`'s `main()` runs the
[lifecycle](/slop-docs/server/overview/#servermaincpp--the-lifecycle) and emits
`ServerLogger` lines in the format `[<timestamp>][<LEVEL>][<category>] <message>`
(`ServerLogger.cpp:151-156`). The first startup steps, in order (`ServerMain.cpp`):

```
[…][INFO][startup] initializing process state          (LogStartupStep, ServerMain.cpp:418)
[…][INFO][startup] initializing server log manager      (:435)
[…][INFO][startup] initializing dedicated access control (:437)
[…][INFO][startup] Security: hide-player-list=…, rate-limit=5/30s, …  (:456)
[…][INFO][startup] LAN advertise: …                     (:479)
[…][INFO][startup] Whitelist: …                         (:480)
[…][INFO][startup] loading media/string tables          (:491)
[…][INFO][startup] initializing network manager         (:509)
[…][INFO][startup] creating Minecraft singleton         (:531)
[…][INFO][startup] starting hosted network game thread  (:657)
[…][INFO][startup] server startup complete              (:684)
[…][INFO][startup] Dedicated server listening on 0.0.0.0:25565 (:685)
```

After the last line the `server> ` prompt appears (stream mode) and
[`TickCoreSystems`](/slop-docs/server/overview/#8-main-loop) begins. If you instead see
`[error] Timed out waiting for Xvfb display :99` (step 5) the server never launches —
that is the entrypoint failing before `exec`, not the game crashing.

### Environment variables

| Var | Default (entrypoint) | Purpose |
|---|---|---|
| `SERVER_PORT` | `25565` | Listen port. |
| `SERVER_BIND_IP` | `0.0.0.0` | Bind address. |
| `XVFB_DISPLAY` | `:99` | Virtual display. |
| `XVFB_SCREEN` | `64x64x16` | Xvfb screen geometry. |
| `XVFB_WAIT_SECONDS` | `10` | Readiness timeout. |
| `WINEARCH` / `WINEPREFIX` | `win64` / `/var/opt/wineprefix64` | Wine setup. |
| `SERVER_CLI_INPUT_MODE` | *(from compose:* `stream`*)* | Must be `stream` on Linux — see [Console](/slop-docs/server/console/#input-flow). |

## Compose files

Two compose files at the repo root, both defining the service `lce-revelations-dedicated-server`, mounting `./server-data:/srv/persist`, with `restart: unless-stopped`, `stop_grace_period: 30s`, and `tty` + `stdin_open` (needed for stream-mode console input).

Files: `docker-compose.dedicated-server.yml`, `docker-compose.dedicated-server.ghcr.yml`

| | `docker-compose.dedicated-server.yml` | `docker-compose.dedicated-server.ghcr.yml` |
|---|---|---|
| Source | **builds** from `docker/dedicated-server/Dockerfile` | **pulls** prebuilt image |
| Image | (local build) | `ghcr.io/itsrevela/lce-revelations-dedicated-server:nightly` |
| `MC_RUNTIME_DIR` | `build/windows64/Minecraft.Server/Release` (default) | n/a |
| Port | `$SERVER_PORT` (tcp+udp), default 25565 | fixed `25565` (tcp+udp) |
| Default `TZ` | `Etc/UTC` | `Asia/Tokyo` |

Both set `WINEDEBUG=-all`, `SERVER_CLI_INPUT_MODE=stream`, `XVFB_DISPLAY=:99`, and `XVFB_SCREEN=720x1280x16`.

## Root helper scripts

Thin wrappers around the compose files.

| Script | Action |
|---|---|
| `docker-build-dedicated-server.sh` | One line: `docker compose -f docker-compose.dedicated-server.yml build`. |
| `build-start-dedicated-server.sh` | Resolves a runtime dir (`release`/`debug`/explicit path, validated to be inside the repo), checks `Minecraft.Server.exe` exists, then `docker compose -f docker-compose.dedicated-server.yml up -d --build`. |
| `start-dedicated-server.sh` | GHCR path: `docker compose -f ...ghcr.yml pull` (unless `--no-pull`), then `up -d`. |

> **Gotcha:** `build-start-dedicated-server.sh`'s `release`/`debug` shortcuts resolve to `x64/Minecraft.Server/{Release,Debug}` — a different (legacy) path than the compose default `build/windows64/Minecraft.Server/Release`. Pass an explicit runtime dir if your build output is elsewhere.

## Linux launcher scripts

`build-linux.sh`'s `do_install` step writes three Wine launcher scripts into `$INSTALL_PREFIX` (default `~/.local/share/neoLegacy`): `minecraft-lce-client`, `minecraft-lce-server`, `minecraft-lce-fourkit`.

Files: `build-linux.sh`

The two server launchers (`minecraft-lce-server`, `minecraft-lce-fourkit`) each:

- Read env knobs `MC_PORT` (default 25565), `MC_BIND` (default `0.0.0.0`), `MC_DATA_DIR` (default `~/.local/share/neoLegacy/server` or `.../fourkit`), and `WINEPREFIX`.
- Set `WINEARCH=win64`, `WINEDEBUG=-all`, and enable esync/fsync (`WINEESYNC=1`, `WINEFSYNC=1`).
- `cp -rs` the game into a temp `WORK_DIR` (symlink farm), then symlink persistent `GameHDD` and `server.properties` / `banned-players.json` / `banned-ips.json` from `MC_DATA_DIR` into it, so data survives across runs.
- Start `Xvfb :99 -screen 0 64x64x16` when `$DISPLAY` is unset.
- `exec wine "$WORK_DIR/Minecraft.Server.exe" -port "$SERVER_PORT" -bind "$SERVER_BIND_IP" "$@"`, filtering Wine noise out of stderr via `grep`.

Example:

```
MC_PORT=25566 MC_DATA_DIR=/srv/mydata ~/.local/share/neoLegacy/minecraft-lce-server
```

`build-linux.sh` guards `main` behind `[[ "${BASH_SOURCE[0]}" == "${0}" ]]` so `flake.nix` can source it for these functions (see the Nix packaging path).

## Ports

The default port is **25565** everywhere (the CMake debugger args, the entrypoint, both compose files, and the launcher scripts). Compose publishes both TCP and UDP. For exposing a home server without a public IP, the `proxy-protocol` server property parses PROXY v1 headers from tunnels like playit.gg — see [Server Configuration](/slop-docs/server/configuration/#security-connection-hardening).

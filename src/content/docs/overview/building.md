---
title: Building & Compiling
description: Building neoLegacy on Windows (VS2022), cross-compiling on Linux, the Nix flake, and common pitfalls.
---

neoLegacy builds only for **Windows x64** today. There are three supported ways to produce that binary: native on Windows with Visual Studio 2022, a Linux **cross-compile** with clang-cl, or the Nix flake (which wraps the Linux path). Everything routes through one CMake build (`project(LCE-Revelations ...)`, C++17). For what the four targets *are*, see [Architecture](/slop-docs/overview/architecture/).

:::note[Windows-only guard]
Root `CMakeLists.txt:9-11` hard-fails unless `WIN32` or `CMAKE_CROSSCOMPILING` is set:

```cmake
if(NOT WIN32 AND NOT CMAKE_CROSSCOMPILING)
  message(FATAL_ERROR "This CMake build currently supports Windows only. For cross-compilation from Linux, use the clang-cl toolchain.")
endif()
```

A 64-bit toolchain is also required (`CMAKE_SIZEOF_VOID_P == 8`). Only `Debug` and `Release` config types exist.
:::

## Prerequisites (all paths)

| Requirement | Why | Notes |
|---|---|---|
| **Visual Studio 2022** (Desktop dev with C++) | Native build: bundles CMake, MSVC, Win10 SDK | Or newer |
| **.NET 10 SDK (x64)** | Required to build the FourKit server's managed host | Pinned by `global.json` → `10.0.100`, `rollForward: latestFeature`, `allowPrerelease: false` |
| clang-cl / lld-link / llvm-* + xwin + Wine | Linux cross-compile only | See below |

The FourKit CMake configure fails **early and clearly** if .NET 10 is missing (`Minecraft.Server.FourKit/CMakeLists.txt`): it runs `dotnet --list-sdks` and errors with `FATAL_ERROR "FourKit requires a .NET 10 SDK but none was detected."` — this is deliberate, because the real failure otherwise happens deep inside `dotnet publish` with a much worse message.

## Windows (native, recommended)

From `README.md` and `COMPILE.md`.

### Visual Studio quick start
1. Install [Visual Studio 2022](https://aka.ms/vs/17/release/vs_community.exe) with the "Desktop development with C++" workload.
2. Clone the repo.
3. In VS: **File > Open > Folder** on the repo root. VS reads `CMakePresets.json` automatically.
4. Pick a configuration from the dropdown — e.g. **Windows64 - Debug** (Release also works but omits some debug features).
5. Build All (F7). The VS startup project is `Minecraft.Client` (`CMakeLists.txt:314`); launch with F5.

Available build targets: `Minecraft.Client`, `Minecraft.Server` (vanilla), `Minecraft.Server.FourKit` (which also builds `Minecraft.Server.FourKit.Managed`).

### CMake CLI (Developer PowerShell)

```powershell
cmake --preset windows64
cmake --build --preset windows64-release --target Minecraft.Client
cmake --build --preset windows64-release --target Minecraft.Server
cmake --build --preset windows64-release --target Minecraft.Server.FourKit
cmake --build --preset windows64-release              # build everything
```

Run from the output directory so relative asset paths resolve:

```
build/windows64/Minecraft.Client/Debug/Minecraft.Client.exe
```

:::caution[configure_cmake.bat is not portable]
The `configure_cmake.bat` helper in the repo root is a personal script: it sources `VsDevCmd.bat`/`vcvars64.bat` from a specific Community VS 2022 install and `cd`s to a hardcoded `C:\Users\logat\...\LegacyEvolved` path. It is illustrative only — don't rely on it.
:::

## CMake presets

`CMakePresets.json` (version 5) defines a hidden `base` preset (generator **Ninja Multi-Config**, `binaryDir = ${sourceDir}/build/${presetName}`) and six platform configure presets. Each sets `PLATFORM_NAME`, `PLATFORM_DEFINES`, and `IGGY_LIBS`.

| Configure preset | `PLATFORM_NAME` | Toolchain file | Buildable? |
|---|---|---|---|
| `windows64` | `Windows64` | none (native MSVC / clang-cl) | **Yes** |
| `durango` | `Durango` | `cmake/toolchains/durango.cmake` | No — 0-byte stub |
| `orbis` | `Orbis` | `cmake/toolchains/orbis.cmake` | No — 0-byte stub |
| `ps3` | `PS3` | `cmake/toolchains/ps3.cmake` | No — 0-byte stub |
| `psvita` | `PSVita` | `cmake/toolchains/psvita.cmake` | No — 0-byte stub |
| `xbox360` | `Xbox` | `cmake/toolchains/xbox360.cmake` | No — 0-byte stub |

Each platform has `<platform>-debug` and `<platform>-release` build presets. The console presets exist for structure only — their toolchain files are empty stubs, so console builds are **aspirational, not functional**. Only `windows64` builds. See [Platform Code](/slop-docs/platforms/overview/).

## Linux cross-compile — `build-linux.sh`

This is the canonical Linux path and what CI uses. It cross-compiles **Windows x64** binaries on Linux with LLVM/clang-cl plus a Windows SDK fetched by `xwin`.

### Dependencies
`check_deps()` requires all of these on PATH:

```
clang-cl  lld-link  llvm-rc  llvm-ml  llvm-lib  llvm-mt  cmake  ninja  xwin  rsync  wine
```

Install `xwin` with `cargo install xwin`. Wine is needed to run the DirectX `fxc.exe` shader compiler under emulation.

### Flow

`main()` runs: `check_deps` → `fetch_winsdk` → `patch_winsdk_symlinks` → `do_cmake_configure` → `do_build` → `do_install`.

- **`fetch_winsdk`** — `xwin splat` into `$XWIN_CACHE/splat` (default `$PWD/.xwin`).
- **`patch_winsdk_symlinks`** — case-insensitivity fixups for `SDKDDKVer.h`, `XInput9_1_0.lib`, `Ws2_32.lib` (Windows is case-insensitive, Linux is not).
- **`write_toolchain`** — emits `clang-cl-toolchain.cmake` (`clang-cl`/`lld-link`/`llvm-rc`/`llvm-ml`, `CMAKE_CROSSCOMPILING TRUE`, ms-compat flags).
- **`do_cmake_configure`** — `-G Ninja`, `MultiThreaded` runtime, `-imsvc`/`-libpath:` include & lib paths from the splat, `PLATFORM_NAME=Windows64`.
- **`do_build`** — build dir is `<src>/build/windows64-clang`. `BUILD_CI=1` caps to 3 cores.
- **`do_install`** — installs into `$INSTALL_PREFIX` (default `~/.local/share/neoLegacy`) as `client/`, `server/`, `fourkit/`, copies assets, and writes three Wine launcher scripts: `minecraft-lce-client`, `minecraft-lce-server`, `minecraft-lce-fourkit`.

### Usage

```bash
./build-linux.sh [source_dir=.] [Release|Debug]   # default Release
```

The launchers set `WINEARCH=win64`, enable esync/fsync, copy the game into a temp prefix, symlink a persistent `GameHDD` + `server.properties`/`banned-*.json`, start `Xvfb :99` for headless servers, and `exec wine …`. Env knobs: `MC_PORT`, `MC_BIND`, `MC_DATA_DIR`, `WINEPREFIX`.

:::note[FXC shaders through Wine]
On a UNIX cross build for Windows64, `CMakeLists.txt:103-141` locates `fxc.exe` (under `Minecraft.Client/Windows64/Shaders/` or the 4JLibs Render shaders dir), requires `wine`, and configures a wrapper (`cmake/FxcWineWrapper.sh.in`) at `${CMAKE_BINARY_DIR}/tools/fxc` that runs FXC through Wine and post-processes the generated shader headers (CRLF normalize, `#endif` fixups). If it finds `fxc.exe` but not `wine`, configure fails with a clear message.
:::

## Nix / NixOS — `flake.nix`

The flake wraps the Linux path for reproducibility. README calls it "not recommended" for casual Linux use — prefer `build-linux.sh`.

Inputs: `nixpkgs` (unstable), `flake-utils`, and `fourjlibs = github:Patoke/4JLibs` (patched in via `postUnpack`, because flakes don't fetch git submodules). `allowUnfree` is required (Iggy libs + Windows SDK). The version is derived as `0.<BUILD_NUMBER>.0` by regex-reading `BUILD_NUMBER` out of `GenerateBuildVer.cmake`.

Fixed-output (network-fetching, hash-pinned) derivations: `windows-sdk-xwin` (the `xwin splat`), `fourkitNugetDeps` (offline NuGet restore of the FourKit csproj), and `sdkWithSymlinks`. The real build, `minecraft-lce-unwrapped`, sources `build-linux.sh` and runs its `do_*` functions with `INSTALL_PREFIX=$out`.

```bash
nix build .#client     # build the client
nix build .#server     # build the dedicated server
nix develop            # dev shell (winetricks, xvfb-run, etc.)
nix run .#client       # build + launch via a Wine wrapper
```

Outputs: `packages.{client,server,unwrapped,fourkit-nuget-deps,windows-sdk,default=client}`, `apps.{client,server,build,default}`, `devShells.default`.

## Versioning during a build

`cmake/GenerateBuildVer.cmake` produces `generated/Common/BuildVer.h` at build time. Key fact — the network/protocol build number is **static**:

```cmake
set(BUILD_NUMBER 570) # Note: Build/network has to stay static for now, as without it builds wont be able to play together.
```

It also embeds `git rev-parse --short HEAD`, the branch, the `owner/repo/branch` ref, and appends `-dev` if `git status --porcelain` is dirty. A committed fallback `include/Common/BuildVer.h` lets the tree compile before codegen runs. The human-facing release string lives in `BUMP` (currently `1.0.9b`) — changing it triggers a stable release (see [Contributing & Releases](/slop-docs/overview/contributing/)).

:::caution[Do not change BUILD_NUMBER]
570 is the cross-play compatibility gate (`VER_NETWORK = VER_PRODUCTBUILD`). Changing it breaks multiplayer with every existing build. Leave it static.
:::

## Common pitfalls

| Symptom | Cause / fix |
|---|---|
| CMake fails with "supports Windows only" | You're on Linux without `CMAKE_CROSSCOMPILING`. Use `build-linux.sh` (which sets up the clang-cl toolchain), not a bare `cmake` invocation. |
| FourKit configure fails: "requires a .NET 10 SDK" | Install the .NET 10 x64 SDK. `global.json` pins `10.0.100`. Build the vanilla `Minecraft.Server` target instead if you don't need plugins. |
| Cross build fails linking CRT / debug iterators | `LCE_XWIN_CROSS_DEBUG_COMPAT` (auto-ON for clang cross builds) swaps `_DEBUG` for `_ITERATOR_DEBUG_LEVEL=0` / `_HAS_ITERATOR_DEBUGGING=0` and forces the release CRT so cross Debug builds link. Don't override `CMAKE_MSVC_RUNTIME_LIBRARY` manually. |
| Shader step fails on Linux ("could not find wine") | FXC runs through Wine on cross builds. Install `wine`. |
| Console preset configures but nothing builds | The console toolchain files are 0-byte stubs. Only `windows64` is real. |
| `configure_cmake.bat` doesn't work | It's a personal helper with hardcoded paths — use the CMake CLI steps above instead. |
| Missing 4JLibs on Nix | Flakes don't fetch submodules; the flake patches `github:Patoke/4JLibs` in. For a plain clone use `git clone --recurse-submodules` or `git submodule update --init --recursive`. |
| Game can't find assets at runtime | Run the exe **from its output directory** — asset paths are relative to the exe. |

---
title: Platform Code Overview
description: The per-platform monolith model, the six CMake presets, and the honest build reality — only Windows64 actually compiles.
---

neoLegacy's client is a **single per-platform monolithic executable**. There is no cross-platform
abstraction layer you flip at runtime; instead CMake picks one platform's source list at configure
time via the cache variable `PLATFORM_NAME`, compiles it against that platform's middleware, and
produces one exe (`Minecraft.Client.exe`). Everything else about the platform — window/device glue,
input, networking, storage, achievements — is selected by that same variable.

This page covers the model, the six presets, and — bluntly — which of them actually build today.
For the deep dive on the one that does, see [Windows 64](/slop-docs/platforms/windows64/).

## The `PLATFORM_NAME` model

The top-level `CMakeLists.txt` is **Windows-only** by hard guard, and only relents for cross-compilation:

```cmake
if(NOT WIN32 AND NOT CMAKE_CROSSCOMPILING)
  message(FATAL_ERROR "This CMake build currently supports Windows only. For cross-compilation from Linux, use the clang-cl toolchain.")
endif()
```

Files: `CMakeLists.txt:9-11` (guard), `CMakeLists.txt:13-15` (64-bit-only guard).

Three things key off `PLATFORM_NAME`:

1. **The platform-lib subtree.** `CMakeLists.txt:146` does
   `add_subdirectory("Minecraft.Client/${PLATFORM_NAME}/4JLibs")` — it descends into that
   platform's `4JLibs/` folder expecting a `CMakeLists.txt` there.
2. **The compiled source list.** `Minecraft.Client/CMakeLists.txt` includes every platform's
   source manifest (`cmake/sources/{Common,Durango,ORBIS,PS3,PSVita,Windows,Xbox360}.cmake`) but
   gates which one is actually compiled with generator expressions keyed on `PLATFORM_NAME`.
3. **The server targets.** `CMakeLists.txt:160-163` wires `Minecraft.Server.FourKit` and
   `Minecraft.Server` **only** when `PLATFORM_NAME STREQUAL "Windows64"`.

```cmake
add_subdirectory(Minecraft.World)
add_subdirectory(Minecraft.Client)
if(PLATFORM_NAME STREQUAL "Windows64") # Server is only supported on Windows for now
  add_subdirectory(Minecraft.Server.FourKit)
  add_subdirectory(Minecraft.Server)
endif()
```

Files: `CMakeLists.txt:158-163`.

## The six presets

`CMakePresets.json` (schema v5) defines one configure preset per platform, each setting
`PLATFORM_DEFINES`, `PLATFORM_NAME`, `IGGY_LIBS`, and — for every console — a `toolchainFile` under
`cmake/toolchains/`. Build presets `<platform>-debug` / `<platform>-release` exist for all six.

| Preset | `PLATFORM_NAME` | `PLATFORM_DEFINES` | `IGGY_LIBS` | Toolchain file | Builds? |
|---|---|---|---|---|---|
| `windows64` | `Windows64` | `_WINDOWS64` | `iggy_w64.lib;iggyperfmon_w64.lib;iggyexpruntime_w64.lib` | none (native MSVC) | **Yes** |
| `durango` | `Durango` | `_DURANGO;_XBOX_ONE` | `iggy_durango.lib;iggyperfmon_durango.lib` | `cmake/toolchains/durango.cmake` | No |
| `orbis` | `Orbis` | `__ORBIS__` | `libiggy_orbis.a;libiggyperfmon_orbis.a` | `cmake/toolchains/orbis.cmake` | No |
| `ps3` | `PS3` | `__PS3__` | `libiggy_ps3.a;libiggyperfmon_ps3.a;libiggyexpruntime_ps3.a` | `cmake/toolchains/ps3.cmake` | No |
| `psvita` | `PSVita` | `__PSVITA__` | `libiggy_psp2.a;libiggyperfmon_psp2.a` | `cmake/toolchains/psvita.cmake` | No |
| `xbox360` | `Xbox` | `_XBOX` | (default) | `cmake/toolchains/xbox360.cmake` | No |

Files: `CMakePresets.json:10-73`.

Note the `xbox360` preset's `PLATFORM_NAME` is `Xbox` (not `Xbox360`) — that matches the directory
`Minecraft.Client/Xbox/`. Only `windows64` omits a `toolchainFile` entirely; it builds natively with
MSVC, or cross-compiles from Linux via clang-cl (see [Build System](/slop-docs/overview/building/)).

## The build reality: only Windows64 works

The console presets are **scaffolded, not functional**. Two independent, verifiable facts prove no
console preset can even configure, let alone build:

**1. All five console toolchain files are 0-byte stubs.**

```
$ ls -la cmake/toolchains/
-rw-r--r--  0  durango.cmake
-rw-r--r--  0  orbis.cmake
-rw-r--r--  0  ps3.cmake
-rw-r--r--  0  psvita.cmake
-rw-r--r--  0  xbox360.cmake
```

Every console preset points `toolchainFile` at one of these empty files. CMake would load an empty
toolchain, find no cross-compiler, and fail. Files: `cmake/toolchains/*.cmake` (all empty).

**2. Only `Windows64/4JLibs/CMakeLists.txt` exists.**

`CMakeLists.txt:146` unconditionally does `add_subdirectory("Minecraft.Client/${PLATFORM_NAME}/4JLibs")`.
That folder's `CMakeLists.txt` is present **only** for Windows64:

| Path | Present? |
|---|---|
| `Minecraft.Client/Windows64/4JLibs/CMakeLists.txt` | Yes |
| `Minecraft.Client/Xbox/4JLibs/CMakeLists.txt` | Missing |
| `Minecraft.Client/Durango/4JLibs/CMakeLists.txt` | Missing |
| `Minecraft.Client/PS3/4JLibs/CMakeLists.txt` | Missing |
| `Minecraft.Client/Orbis/4JLibs/CMakeLists.txt` | Missing |
| `Minecraft.Client/PSVita/4JLibs/CMakeLists.txt` | Missing |

So even if a console toolchain existed, the `add_subdirectory` on line 146 would fail — the platform
library subtree has no build script. And the server targets are gated behind
`PLATFORM_NAME STREQUAL "Windows64"` anyway (`CMakeLists.txt:160`).

**Aspirational vs functional.** The console C++ is real and complete — the per-platform source
*manifests* under `Minecraft.Client/cmake/sources/` are full file lists (503-663 lines each), and the
console directories contain genuine Sony NP / Xbox LIVE / XDK stacks. But they are **catalogued, not
buildable**: no toolchain, no platform-lib CMake, and `COMPILE.md` documents only the Windows x64
path. Treat the console trees as historical/reference source, not as shippable targets.

## The 4JLibs submodule

`4JLibs` is the one git submodule in the project. It provides the open reimplementation of 4J
Studios' closed middleware — the `4JLibs.Windows64.{Input,Profile,Storage,Render}` static-lib targets:

```
[submodule "Minecraft.Client/Windows64/4JLibs"]
	path = Minecraft.Client/Windows64/4JLibs
	url = https://git.neolegacy.dev/neoStudiosLCE/4JLibs.git
```

Files: `.gitmodules`. The PC render/profile/storage/input libs carry an MIT header
(`Copyright (c) 2026 Patoke`, e.g. `Windows64/4JLibs/impls/Windows_Libs/Render/src/RendererCore.cpp:1-4`).
CI checks out with `submodules: recursive`; the Nix flake patches the submodule in from
`github:Patoke/4JLibs` (Nix flakes don't fetch submodules). The console platforms each have their own
`4JLibs/` directory with prebuilt libs and headers — but, as above, **no `CMakeLists.txt`**.

## `*Media` dirs per platform

Each platform has a sibling `*Media/` directory holding its packaged assets (SWF UI, sounds, DLC,
localization XML). These are binary/asset trees, not code:

| Dir | Notes |
|---|---|
| `Windows64Media/` | The **live PC asset set** — `DLC/`, `Media/`, `Sound/`, `Tutorial/`, `loc/`. The `loc/*.xml` feed the compile-time `strings.h` generator. |
| `DurangoMedia/` | `DLC/`, `Media/`, `Sound/`, `loc/`, `strings.h`. |
| `OrbisMedia/` | `DLC/`, `Media/`, `loc/`, `strings.h`, `4J_strings.h`. |
| `PS3Media/` | `DLC/`, `Media/`, `loc/`, `strings.h`, `4J_strings.h`. |
| `PSVitaMedia/` | `DLC/`, `Media/`, `Tutorial/`, `loc/`, `strings.h`, prebuilt `Minecraft.Client.self`. |

The shared `Minecraft.Client/Common/` directory is **not** purely media — it holds the
platform-agnostic client C++ (`Consoles_App.{cpp,h}` with base class `CMinecraftApp`,
`ConsoleGameMode`, `Audio/`, `Network/`, `UI/`, `Leaderboards/`, etc.) plus shared assets
(`Media/`, `res/`, `zlib/`). `loadMediaArchive()` in `Common/Consoles_App.cpp:4776` selects the asset
root by platform define: `_WINDOWS64` → `Common\Media\MediaWindows64`, `__PS3__` → `MediaPS3`,
`__ORBIS__` → `MediaOrbis`, `_DURANGO` → `MediaDurango`, `__PSVITA__` → `MediaPSVita`.

Console packaging trees (`PS3_GAME/`, `PS4_GAME/`, `TROPDIR/`, `sce_sys/`) hold Sony disc/PKG
layout data (`PARAM.SFO`, `eboot.bin`, trophy packs) — data, not code, and dark for the same reasons.

## Platform code shape

Every platform directory follows a consistent layout, so once you know one you can navigate the rest:

| File pattern | Role |
|---|---|
| `<Plat>_Minecraft.cpp` | Platform entry point / OS glue (window, device, message pump). |
| `<Plat>_App.{cpp,h}` | App subclass of `CMinecraftApp`. |
| `<Plat>_UIController.{cpp,h}` | Platform UI controller glue. |
| `Network/` | Platform net stack (Winsock on PC; Sony NP / Xbox LIVE on consoles). |
| `Leaderboards/`, `Social/`, `Sentient/` | Online services + telemetry (mostly stubs on PC). |
| `Iggy/` | Autodesk Scaleform/Iggy Flash/SWF UI middleware libs. |
| `GameConfig/` | Xbox LIVE SPA achievement/stat definitions (`Minecraft.spa`). |

One gotcha: the `Xbox_*` filename prefix appears **inside** the PS3, Orbis, and Durango directories
too (`Xbox_Minecraft.cpp`, `Xbox_BuildVer.h`, `XboxGameMode.{cpp,h}`). It's legacy shared 360
scaffolding reused across ports — `Xbox_` does not mean Xbox-only.

## Cross-links

- [Windows 64](/slop-docs/platforms/windows64/) — the one platform that builds, in depth.
- [Build System](/slop-docs/overview/building/) — presets, cross-compile, codegen.

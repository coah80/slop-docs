---
title: PS3, PS4 & PS Vita
description: The Sony platform trees — PS3/, Orbis/ (PS4), PSVita/, the shared Common/Network/Sony stack, and the PS3_GAME/PS4_GAME/TROPDIR/sce_sys packaging layouts.
---

neoLegacy carries the original 4J Studios Sony source for all three PlayStation targets:
`Minecraft.Client/PS3/`, `Minecraft.Client/Orbis/` (PS4), and `Minecraft.Client/PSVita/`. A large
part of the online stack (sessions, commerce, cloud saves, leaderboards) is **shared** across the
three under `Minecraft.Client/Common/Network/Sony/` and `Common/Leaderboards/`, guarded by
`__PS3__` / `__ORBIS__` / `__PSVITA__` defines.

Like the [Xbox trees](/slop-docs/platforms/xbox/), all three Sony platforms are **catalogued but not
buildable** in this repo — only `Windows64` builds (see [Windows / PC](/slop-docs/platforms/windows/)).
Treat the Sony code as historical / reference source.

## At a glance

| | PS3 | PS4 (Orbis) | PS Vita |
|---|---|---|---|
| Source dir | `Minecraft.Client/PS3/` | `Minecraft.Client/Orbis/` | `Minecraft.Client/PSVita/` |
| CMake preset | `ps3` | `orbis` | `psvita` |
| `PLATFORM_DEFINES` | `__PS3__` | `__ORBIS__` | `__PSVITA__` |
| `PLATFORM_NAME` | `PS3` | `Orbis` | `PSVita` |
| `IGGY_LIBS` | `libiggy_ps3.a;libiggyperfmon_ps3.a;libiggyexpruntime_ps3.a` | `libiggy_orbis.a;libiggyperfmon_orbis.a` | `libiggy_psp2.a;libiggyperfmon_psp2.a` |
| Source manifest | `cmake/sources/PS3.cmake` (663 lines) | `cmake/sources/ORBIS.cmake` (570 lines) | `cmake/sources/PSVita.cmake` (489 lines) |
| Trophy comm ID | `NPWR05636_00` | *(PS4 `sce_sys/trophy`)* | `NPWR06859_00` |
| Builds today? | **No** | **No** | **No** |

Files: `CMakePresets.json`, `Minecraft.Client/CMakeLists.txt:1-30`.

## Why none build

Every Sony preset points at a toolchain file, but all of them are **0-byte stubs**
(`cmake/toolchains/ps3.cmake`, `orbis.cmake`, `psvita.cmake`). A CMake configure with
`--preset ps3` / `--preset orbis` / `--preset psvita` cannot succeed. And the top-level
`CMakeLists.txt:146` does `add_subdirectory("Minecraft.Client/${PLATFORM_NAME}/4JLibs")`, but only
`Windows64/4JLibs/CMakeLists.txt` exists — `PS3/4JLibs/`, `Orbis/4JLibs/`, and `PSVita/4JLibs/` ship
`libs`/`inc` but **no `CMakeLists.txt`**. `COMPILE.md` documents only the Windows path. So the Sony
C++ is enumerated in the manifests and gated in (`Minecraft.Client/CMakeLists.txt:14-23`) but never
actually compiled.

## Shared Sony stack — `Common/Network/Sony/`

This is the platform-agnostic Sony NP (PlayStation Network) layer shared by all three ports. It sits
under `PlatformNetworkManagerSony` and is not used directly by the game; per-platform managers wrap it.

| File | Role |
|---|---|
| `SQRNetworkManager.{cpp,h}` | Lowest-level Sony session/player manager (NP) |
| `SQRNetworkPlayer.{cpp,h}` | Per-player session state |
| `PlatformNetworkManagerSony.{cpp,h}` | Bridges the game's platform-net interface to `SQRNetworkManager` |
| `NetworkPlayerSony.{cpp,h}` | Sony network-player |
| `SonyCommerce.{cpp,h}` | PSN store / commerce (`np/commerce2`, NP Toolkit commerce) |
| `SonyHttp.{cpp,h}` | HTTP helper |
| `SonyRemoteStorage.{cpp,h}` (+ `sceRemoteStorage/{ps3,ps4,psvita,header}`) | Cloud saves |

The headers demonstrate the shared, define-gated design. `SQRNetworkManager.h` includes different NP
SDK headers per platform:

```cpp
#include <np.h>
#ifdef __PS3__
#include <netex\libnetctl.h>
#include <netex\net.h>
#else
#include <libnetctl.h>
#include <net.h>
#include <np_toolkit.h>
#endif
```

`SonyCommerce.h` splits `__PS3__` (`np/commerce2.h`, `np/drm.h`), `__PSVITA__` (`np_toolkit.h`), and
`__ORBIS__` (NP Toolkit commerce constant remaps). Session sizing constants:

```cpp
static const int MAX_LOCAL_PLAYER_COUNT = XUSER_MAX_COUNT;
static const int MAX_ONLINE_PLAYER_COUNT = MINECRAFT_NET_MAX_PLAYERS;
static const int NP_POOL_SIZE = 128 * 1024;
```

Files: `Minecraft.Client/Common/Network/Sony/`.

### Shared leaderboards — `Common/Leaderboards/`

`SonyLeaderboardManager.{cpp,h}` derives from the base `LeaderboardManager` and is shared by all Sony
ports; each platform subclasses it (`PS3LeaderboardManager`, `OrbisLeaderboardManager`,
`PSVitaLeaderboardManager`). It typedefs the RTC tick per platform:

```cpp
#include "Common/Leaderboards/LeaderboardManager.h"
#ifdef __PS3__
typedef CellRtcTick SonyRtcTick;
#else
typedef SceRtcTick SonyRtcTick;
#endif
```

Files: `Common/Leaderboards/LeaderboardManager.{cpp,h}` (base), `SonyLeaderboardManager.{cpp,h}`,
`LeaderboardInterface.{cpp,h}`, `base64.{cpp,h}`.

## PS3 — `Minecraft.Client/PS3/`

Sony PS3 SDK / Cell SPU code.

- **Entry / app:** `PS3_Minecraft.cpp`, `PS3_App.{cpp,h}`, `PS3_UIController.{cpp,h}`,
  `PS3_PlayerUID.{cpp,h}`. Plus shared 360 scaffolding kept by filename: `XboxGameMode.{cpp,h}`,
  `Xbox_Minecraft.cpp`, `Xbox_Utils.cpp`, `Xbox_Awards_enum.h`, `Xbox_Debug_enum.h`,
  `Xbox_BuildVer.h`, `Minecraft_Macros.h`.
- **Network (PS3-specific wrappers):** `Network/SQRNetworkManager_PS3.{cpp,h}`,
  `SonyCommerce_PS3.{cpp,h}`, `SonyHttp_PS3.{cpp,h}`, `SonyRemoteStorage_PS3.{cpp,h}`,
  `SonyVoiceChat.{cpp,h}`.
- **Leaderboards / trophies:** `Leaderboards/PS3LeaderboardManager.{cpp,h}` + `base64.{cpp,h}`;
  NP trophy config in `Passphrase/ps3__np_conf.h`. Trophy pack deployed via `PS3_GAME/TROPDIR`.
- **SPU offload (unique to PS3):** `SPU_Tasks/` holds Cell SPU jobs compiled to `.ppu.o` — the PS3's
  answer to the D3D11 command buffers used on PC. Jobs include `ChunkUpdate`, `CompressedTile`
  (+ `CompressedTileStorage_compress`, `_getData`), `GameRenderer_updateLightTexture`,
  `LevelRenderChunks`, `LevelRenderer_{FindNearestChunk,cull,zSort}`, `PerlinNoise`, `RLECompress`,
  `RecalcHeightmapOnly`, `Renderer_TextureUpdate`, `Texture_blit`. Also `mssspurs.elf`, `Common/`,
  `ObjFiles/`.
- **Graphics / misc:** `Edge/Lib/` (Sony Edge geometry/animation libs), `Iggy/`, `Miles/` audio,
  `Audio/`, `Sound/`, `Assert/`, `DATA/` (+ `DATA/MISC/`), `GameConfig/`, `Media/`,
  `PS3Extras/` (`DirectX/`, `HeapInspector/`, `boost_1_53_0/`), `Social/SocialManager.h`,
  `Sentient/`, `XML/`, `4JLibs/` (**no CMakeLists**), `PS3ProductCodes.bin`.

## PS4 — `Minecraft.Client/Orbis/`

Sony PS4 (Orbis) SDK code using the NP Toolkit.

- **Entry / app:** `Orbis_Minecraft.cpp`, `Orbis_App.{cpp,h}`, `Orbis_UIController.{cpp,h}`,
  `Orbis_PlayerUID.{cpp,h}`, `ps4__np_conf.h` (NP config), `Xbox_BuildVer.h`, `Minecraft_Macros.h`.
  Custom allocators: `user_malloc.cpp`, `user_malloc_for_tls.cpp`, `user_new.cpp`.
- **Network (NP Toolkit, richest Sony net stack):** `Network/Orbis_NPToolkit.{cpp,h}`,
  `SQRNetworkManager_Orbis.{cpp,h}`, `SonyCommerce_Orbis.{cpp,h}`, `SonyHttp_Orbis.{cpp,h}`,
  `SonyRemoteStorage_Orbis.{cpp,h}`, `SonyVoiceChat_Orbis.{cpp,h}`,
  `SonyVoiceChatParty_Orbis.{cpp,h}`, `PsPlusUpsellWrapper_Orbis.{cpp,h}` (PS Plus upsell).
- **Leaderboards / trophies:** `Leaderboards/OrbisLeaderboardManager.{cpp,h}` + `base64.{cpp,h}`.
  Trophies deployed via `PS4_GAME/sce_sys/trophy`.
- **Accessibility:** `MinecraftPronunciation/` (TTS pronunciation).
- **Misc:** `Iggy/`, `Miles/` audio, `Assert/`, `DLCImages/`, `GameConfig/`, `OrbisExtras/`, `min/`,
  `Social/SocialManager.h`, `Sentient/`, `XML/`, `4JLibs/` (`Libs/`, `inc/`, **no CMakeLists**),
  `PS4ProductCodes.bin`, `session_image.{jpg,png}`.

## PS Vita — `Minecraft.Client/PSVita/`

Sony PS Vita (psp2) SDK code. Adds ad-hoc / local-wireless multiplayer not present on the home
consoles.

- **Entry / app:** `PSVita_Minecraft.cpp`, `PSVita_App.{cpp,h}`, `PSVita_UIController.{cpp,h}`,
  `PSVita_PlayerUID.{cpp,h}`.
- **Network:** `Network/PSVita_NPToolkit.{cpp,h}`, `SQRNetworkManager_Vita.{cpp,h}`,
  `SQRNetworkManager_AdHoc_Vita.{cpp,h}` (**ad-hoc P2P** — Vita-only),
  `SonyCommerce_Vita.{cpp,h}`, `SonyHttp_Vita.{cpp,h}`, `SonyRemoteStorage_Vita.{cpp,h}`,
  `SonyVoiceChat_Vita.{cpp,h}`.
- **Leaderboards:** `Leaderboards/PSVitaLeaderboardManager.{cpp,h}` + `base64.{cpp,h}`.
- **Misc:** `Iggy/`, `Miles/` audio, `Sound/`, `Assert/`, `Builds/`, `GameConfig/`, `PSVitaExtras/`,
  `Tutorial/`, `Social/SocialManager.h`, `Sentient/`, `XML/`, `4JLibs/` (**no CMakeLists**),
  `PSVitaProductCodes.bin`, `configuration.psp2path`, `session_image.png`, and the packaging tree
  `app/` (`Japanese/`, `Region/{SCEA,SCEE,SCEJ}/`, `sce_sys/`).

## Console packaging / deployment (data, not code)

These trees live under `Minecraft.Client/` and hold the disc/PKG layouts. They are binary/media and
are listed, not read.

### `PS3_GAME/`

PS3 disc/PKG layout:

```
PS3_GAME/
  ICON0.PNG
  PARAM.SFO
  USRDIR/DLC/Festive Skin Pack
  TROPDIR/NPWR05636_00/TROPHY.TRP
```

`NPWR05636_00` is the PS3 PSN trophy communication ID.

### `PS4_GAME/`

PS4 PKG layout:

```
PS4_GAME/
  eboot.bin
  sce_module/         libSceFios2.prx, libc.prx
  sce_sys/            param.sfo, icon0.png, pic0.png, pic1.png,
                      nptitle.dat, snd0.at9, pronunciation.xml(.sig),
                      keymap_rp/ (00–20 remap-prompt PNGs), trophy/
  sce_gls/standby_screen/
  Sound/Minecraft.msscmp   (Miles sound bank)
  Orbis/              PS4ProductCodes.bin, session_image.jpg
  Common/Media, Common/res, music/    (staged assets)
```

The PS4 title ID recorded in `param.sfo` is `CUSA00283`. The `sce_sys/trophy/` set holds
`trophy00.trp` plus the group/bronze/silver/gold trophy art PNGs.

### `TROPDIR/` and `sce_sys/` (Vita)

- `Minecraft.Client/TROPDIR/NPWR05636_00/TROPHY.TRP` — standalone PS trophy pack (PS3 comm ID).
- `Minecraft.Client/sce_sys/` — the **PS Vita** system-data set: `icon0.png`, `param.sfo`,
  `param_vita.sfo`, `pic0.png`, `pic1.png`, `snd0.at9`, `nptitle.dat`, `pronunciation.xml(.sig)`,
  `keystone_vita/`, `keymap_rp/` (00–20 remap-prompt PNGs), `livearea/contents/`, `manual/` (PNG
  pages), and `trophy/NPWR06859_00/Trophy00.trp`. Note the Vita trophy comm ID `NPWR06859_00` differs
  from the PS3 `NPWR05636_00`.

## `*Media` asset dirs (listing-level only)

- **`PS3Media/`** — `DLC/`, `Media/`, `loc/`, `strings.h`, `4J_strings.h`.
- **`OrbisMedia/`** — `DLC/`, `Media/`, `loc/`, `strings.h`, `4J_strings.h`.
- **`PSVitaMedia/`** — `DLC/`, `Media/`, `Tutorial/`, `loc/`, `strings.h`, and a prebuilt
  `Minecraft.Client.self` (Vita signed exe).
- **`music/`** — shared soundtrack (`cds/`, `music/`); also staged into `PS4_GAME/music/`.

## Cross-platform naming gotcha

The `Xbox_*` filename prefix appears throughout the PS3, Orbis, and PSVita trees
(`Xbox_BuildVer.h`, `Xbox_Minecraft.cpp`, `Xbox_Utils.cpp`, `Xbox_Awards_enum.h`,
`Xbox_Debug_enum.h`). This is legacy shared 360 scaffolding reused across ports — see
[Xbox 360 & Xbox One](/slop-docs/platforms/xbox/). It does **not** mean the file is Xbox-specific.
Menus on every Sony port likewise render through the shared XUI framework in `Common/XUI/`.

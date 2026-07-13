---
title: File & Directory Index
description: Orientation map of the whole neoLegacy repo — every top-level directory, every significant subdirectory, and a class-family breakdown of the two flat module roots.
---

The neoLegacy tree is ~13,000 files. This page is the map: every top-level
directory and every subdirectory that matters, with a one-line purpose, a real
file count, and links to the doc page that covers it in depth. It is not a
listing of all 13k files — it lists every **directory** and, for the two flat
module roots (`Minecraft.World`, `Minecraft.Client`), every **class family**
(filename pattern → what it is → count → doc page).

Counts are `find`/`ls` results against the repo at the time of writing; they will
drift as the tree changes. All source paths link to Gitea
(`git.neolegacy.dev/neoStudiosLCE/neoLegacy`).

Repo internals: the CMake project is still named `LCE-Revelations` (upstream
lineage); some scripts say `LegacyEvolved`; the user-facing name is **neoLegacy**.
Version per [`BUMP`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/BUMP)
is **1.1.0b**. See [Architecture](/slop-docs/overview/architecture/) for the
30,000-foot view.

:::note[Changed in v1.1.0b]
v1.1.0b (`BUMP` 1.0.9b → 1.1.0b) grows the tree in three places worth calling out:

- **A new `Structures/` asset tree** under
  `Minecraft.Client/Common/Media/MediaWindows64/Structures/` — piece XML for
  `fossils/`, `igloo/`, and a full **`loot_tables/`** set (`chests/` for
  mineshaft, desert pyramid, end city, igloo, jungle temple, nether bridge,
  dungeon, stronghold, village blacksmith, bonus chest, plus per-mob
  `entities/`). These are read by the new `LootTableManager`,
  `FossilFeature`/`IglooFeature` in `Minecraft.World/`.
- **New `tools/` scripts** — `wiiU2Windows.py` (Wii U → Windows64 asset
  converter) and `struct_parse.py` (Structures XML parser), on top of the
  existing SWF/`.arc`/audio tooling.
- **New `Minecraft.World/` class-family members** feeding the tallies above:
  `LootTableManager`, `FossilFeature`, `IglooFeature`, `PolarBear` (+ client
  `PolarBearModel`/`PolarBearRenderer`), the banner stack
  (`BannerTile`/`BannerItem`/`BannerTileEntity` + client
  `BannerModel`/`BannerRenderer`), `BoneBlockTile`, `MagmaTile`, and
  `FlowerPotTileEntity`. The `~Count` columns below predate these and drift
  accordingly.
:::

## Repository root

Four source trees feed one CMake build. Everything else is build glue,
distribution, or tooling.

| Path | Files | What it is | Docs |
|---|---:|---|---|
| `Minecraft.World/` | 1,965 | Shared world/gameplay static lib (`Minecraft.World`). The game-logic core — a C++ port of decompiled Java LCE. Flat module root. | [World overview](/slop-docs/world/overview/) |
| `Minecraft.Client/` | 18,067 | The game client exe (`Minecraft.Client`) + every platform subtree + all media. Flat module root at its top level. | [Client overview](/slop-docs/client/overview/) |
| `Minecraft.Server/` | 102 | **Vanilla** dedicated-server C++ target (no plugin host). | [Server overview](/slop-docs/server/overview/) |
| `Minecraft.Server.FourKit/` | 149 | **FourKit** dedicated server: C# (.NET 10) plugin host + C++ exe target. | [FourKit](/slop-docs/server/fourkit/) |
| `cmake/` | 16 | Shared CMake modules (server recipe, asset-copy, codegen, toolchains). | [Building](/slop-docs/overview/building/) |
| `include/` | 5 | Cross-platform FS shim + committed `BuildVer.h` fallback, compiled into every target. | [Building](/slop-docs/overview/building/) |
| `samples/` | 6 | Three example FourKit C# plugins (Hello, Tps, FourKitTest). | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `tools/` | 61 | SWF/UI patchers, `.arc`/audio format tools, Ghidra 4JLibs diffing, perf monitor, stress test. | [Repo tools](/slop-docs/tools/repo-tools/) |
| `docker/` | 2 | Vanilla dedicated-server Dockerfile + entrypoint (Wine + Xvfb). | [Deployment](/slop-docs/server/deployment/) |
| `docs/` | 1 | `FOURKIT_PARITY.md` — canonical FourKit event-parity reference. | [FourKit events](/slop-docs/reference/fourkit-events/) |
| `build/` | — | Generated output (Ninja Multi-Config). Ignore. | — |
| `.github/` | — | Gitea/GitHub Actions workflows + issue templates. | [CI](/slop-docs/tools/ci/) |

### Root files worth knowing

| File | Purpose |
|---|---|
| [`CMakeLists.txt`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/CMakeLists.txt) | Root build. `project(LCE-Revelations)`, C++17, Windows-only guard, subdir order, all codegen wiring. |
| [`CMakePresets.json`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/CMakePresets.json) | `windows64` (builds) + five console presets (`durango`/`orbis`/`ps3`/`psvita`/`xbox360`, 0-byte toolchain stubs — do not build). |
| [`BUMP`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/BUMP) | Release version string (`1.1.0b`). Pushing a change triggers the stable-release workflow. |
| [`NOTES.md`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/NOTES.md) | Current-version changelog; consumed verbatim as the stable-release body. |
| [`COMPILE.md`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/COMPILE.md) / [`README.md`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/README.md) / [`CONTRIBUTING.md`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/CONTRIBUTING.md) | Build/setup/contribution docs. |
| [`build-linux.sh`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/build-linux.sh) | Canonical Linux→Windows cross-compile (clang-cl + xwin + Wine). What CI uses. |
| [`flake.nix`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/flake.nix) / `flake.lock` / `global.json` | Nix build; `.NET 10.0.100` SDK pin for FourKit. |
| `docker-compose.dedicated-server*.yml`, `*-dedicated-server.sh` | Local-build vs GHCR-pull server compose + helper scripts. |
| `.clang-format` / `.clang-tidy` | Code style. `.gitmodules` — one submodule (`Windows64/4JLibs`). |

---

## `Minecraft.World/` — the gameplay core

- **892 `.cpp` + 1,060 `.h`, all flat in the module root** — no domain
  subfolders. You navigate by filename pattern, which is why the class-family
  table below is the real index.
- Two subdirs only:

| Subdir | Files | What it is |
|---|---:|---|
| `cmake/sources/` | 2 | `Common.cmake` + `Durango.cmake` — the module's source list. |
| `x64headers/` | 7 | Xbox/console platform shims: `xmcore.h`, `qnet.h`, `xsocialpost.h`, `xuiapp.h`, `extraX64.h`, `xrnm.h`, `xuiresource.h`. |

Everything is bootstrapped from one function,
[`MinecraftWorld_RunStaticCtors()`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Minecraft.World.cpp#L26)
(`Minecraft.World.cpp:26`) — the ordering there is load-bearing. The recurring
registration idiom is a `static Base *field;` per instance plus a
`static Base **array` indexed by ID, all assigned inside a `staticCtor()` with
hard-coded integer IDs. See [World overview](/slop-docs/world/overview/).

### Class-family breakdown

Counts are `ls <pattern>` in the module root (filename suffix). Where a family's
subclass/registered count differs from its file count (e.g. some tiles share a
header), the doc page gives the authoritative registered count.

| Filename pattern | What it is | ~Count | Doc page |
|---|---|---:|---|
| `*Tile.h` | Blocks/tiles (subclasses of `Tile`). Registry `Tile.h`, registered in `Tile::staticCtor` (`Tile.cpp:359`). | 135 | [Blocks](/slop-docs/world/blocks/) · [Add blocks](/slop-docs/modding/adding-blocks/) |
| `*Item.h` | Items (subclasses of `Item`). Two-phase `Item::staticCtor`/`staticInit` (`Item.cpp:282`/`558`). | 76 | [Items](/slop-docs/world/items/) · [Add items](/slop-docs/modding/adding-items/) |
| `*Packet*.h` | Network packets. 97 IDs mapped in `Packet::staticCtor` (`Packet.cpp:15`). | 95 | [Networking](/slop-docs/world/networking/) · [Packet IDs](/slop-docs/reference/packet-ids/) |
| `*Entity.h` | Entity/mob classes (`Entity`→`LivingEntity`→`Mob`→…). Factory registry `EntityIO.cpp:45`. | 27 | [Entities](/slop-docs/world/entities/) · [Add entities](/slop-docs/modding/adding-entities/) |
| `*Feature.h` | Worldgen features (trees, ores, lakes, structures pieces). Base `Feature.h`. | 54 | [Worldgen](/slop-docs/world/worldgen/) · [Custom worldgen](/slop-docs/modding/custom-worldgen/) |
| `*Goal.h` | Mob AI goals (`Goal`/`TargetGoal`, selected by `GoalSelector`). Instantiated per-mob, no central registry. | 48 | [AI goals](/slop-docs/world/ai-goals/) · [Custom AI](/slop-docs/modding/custom-ai/) |
| `*Layer.h` | Biome-gen `GenLayer` pipeline (island/zoom/river/biome-edge/…). | 32 | [Worldgen](/slop-docs/world/worldgen/) |
| `*Enchant*.h` | Enchantments (`Enchantment` + subclasses). Registered in `Enchantment::staticCtor` (`Enchantment.cpp:54`). | 31 | [Enchantments](/slop-docs/world/enchantments/) · [Custom enchantments](/slop-docs/modding/custom-enchantments/) |
| `*Biome.h` | Biomes (`Biome` + subclasses). Registered in `Biome::staticCtor` (`Biome.cpp:80`). | 20 | [Biomes](/slop-docs/world/biomes/) · [Add biomes](/slop-docs/modding/adding-biomes/) |
| `*Command.h` | Chat/console commands (`Command`, `CommandDispatcher`, `EntitySelector`). | 18 | [Commands](/slop-docs/world/commands/) · [Add commands](/slop-docs/modding/adding-commands/) |
| `*TileEntity.h` | Block entities. Registered by save-id in `TileEntity::staticCtor` (`TileEntity.cpp:14`). | 16 | [Tile entities](/slop-docs/world/tile-entities/) |
| `*Menu.h` | Container menus (`AbstractContainerMenu` subclasses: chest/furnace/anvil/beacon/…). | 15 | [Containers](/slop-docs/world/containers/) · [Custom containers](/slop-docs/modding/custom-containers/) |
| `*Tag.h` | NBT tag types (`CompoundTag`, `ListTag`, `IntTag`, …). | 13 | [Storage](/slop-docs/world/storage/) |
| `*Recipe*.h` | Crafting/smelting recipe handlers (`Recipes`, `FurnaceRecipes`, `ArmorDyeRecipe`, …). | 10 | [Crafting](/slop-docs/world/crafting/) · [Add recipes](/slop-docs/modding/adding-recipes/) |
| `*Effect*.h` | Mob effects / potions (`MobEffect` + subclasses; 23 registered). | 9 | [Effects](/slop-docs/world/effects/) · [Custom potions](/slop-docs/modding/custom-potions/) |
| `*Material.h` | Block materials (`Material` + `MaterialColor`; ~40 static instances). | 7 | [Materials](/slop-docs/world/materials/) |
| `*Pieces.h` | Structure piece sets (village/stronghold/mineshaft/nether-bridge/monument). | 6 | [Structures](/slop-docs/world/structures/) · [Custom structures](/slop-docs/modding/custom-structures/) |
| `*Dimension.h` | Dimensions (`Dimension`→`NormalDimension`/`HellDimension`/`TheEndDimension`) + `LevelType`. | 4 | [Dimensions](/slop-docs/world/dimensions/) · [Custom dimensions](/slop-docs/modding/custom-dimensions/) |

Not a filename family but core singletons: `GameRules.h`/`.cpp` (8 fixed rules,
[Game rules](/slop-docs/world/gamerules/) · [Custom gamerules](/slop-docs/modding/custom-gamerules/)),
`Redstone.h`/`.cpp` + ~30 redstone tiles ([Redstone](/slop-docs/world/redstone/)),
`Level.cpp`/`LevelChunk.cpp` + the chunk/region/console-save storage stack
([Storage](/slop-docs/world/storage/)).

For hard ID tables, see [Block IDs](/slop-docs/reference/block-ids/),
[Item IDs](/slop-docs/reference/item-ids/),
[Entity types](/slop-docs/reference/entity-types/), and
[Enchantment/effect IDs](/slop-docs/reference/enchantment-effect-ids/).

---

## `Minecraft.Client/` — the game client

At its top level the client is another flat module root — **299 `.cpp` + 307
`.h`** of platform-independent game code sit directly in `Minecraft.Client/`
alongside a set of per-platform and media subdirectories. Two GUI stacks coexist:
the vestigial classic Java-port `Screen` hierarchy (root `*Screen.cpp`) and the
live console **UIScene / XUI** stack under `Common/UI` and `Common/XUI`. See
[Client overview](/slop-docs/client/overview/) and
[UI system](/slop-docs/client/ui-system/).

### Top-level subdirectories

| Subdir | Files | What it is | Docs |
|---|---:|---|---|
| `Common/` | — | **Platform-agnostic client code + shared assets** (not just media). See its own table below. | [Client overview](/slop-docs/client/overview/) |
| `Windows64/` | — | **The one platform that builds.** D3D11 entry point, open 4JLibs reimpl, Winsock net layer. See below. | [Windows64](/slop-docs/platforms/windows64/) |
| `Windows64Media/` | — | Live PC asset set: `Media/`, `Sound/`, `DLC/`, `Tutorial/`, `loc/` (localization XML feeds the `strings.h` generator). | [Resources](/slop-docs/client/resources/) |
| `Xbox/` | — | Original 4J Studios Xbox 360 XDK code. Preset `xbox360`, no toolchain — does not build. | [Xbox](/slop-docs/platforms/xbox/) |
| `Durango/` + `DurangoMedia/` | — | Xbox One XDK code + media. Does not build. | [Xbox](/slop-docs/platforms/xbox/) |
| `PS3/` + `PS3Media/` + `PS3_GAME/` | — | PS3 SDK/SPU code, media, disc/PKG layout. Does not build. | [PlayStation](/slop-docs/platforms/playstation/) |
| `Orbis/` + `OrbisMedia/` + `PS4_GAME/` | — | PS4 (Orbis) SDK code, media, PKG layout. Does not build. | [PlayStation](/slop-docs/platforms/playstation/) |
| `PSVita/` + `PSVitaMedia/` | — | PS Vita (psp2) SDK code + media. Does not build. | [PlayStation](/slop-docs/platforms/playstation/) |
| `TROPDIR/` + `sce_sys/` | — | PS trophy pack + Vita/PS system-data (icons, keymaps, live-area). Media only. | [PlayStation](/slop-docs/platforms/playstation/) |
| `music/` | — | Soundtrack (`cds/`, `music/`), shared across platforms. | [Audio](/slop-docs/client/audio/) |
| `cmake/sources/` | 7 | Per-platform source manifests (`Common`, `Windows`, `Xbox360`, `Durango`, `ORBIS`, `PS3`, `PSVita`). | [Platforms overview](/slop-docs/platforms/overview/) |

Only `Windows64` builds — every console preset points at an empty toolchain stub
and only `Windows64/4JLibs/CMakeLists.txt` exists. The console C++ is *catalogued*
in the source manifests but not *buildable*. See [Platforms overview](/slop-docs/platforms/overview/).

### Client root class families

Platform-independent gameplay/render code, all flat in `Minecraft.Client/`.
Counts are `ls <pattern>` in that directory.

| Filename pattern | What it is | ~Count | Doc page |
|---|---|---:|---|
| `*Renderer.cpp` | Entity/tile-entity/item renderers (`EntityRenderer` + concrete mob/object renderers) + top-level `GameRenderer`/`LevelRenderer`. | 73 | [Rendering](/slop-docs/client/rendering/) · [Entity rendering](/slop-docs/client/entity-rendering/) |
| `*Model.cpp` | Entity/armor models (`Model`→`HumanoidModel`/`QuadrupedModel`→concrete). | 45 | [Entity rendering](/slop-docs/client/entity-rendering/) |
| `*Particle.cpp` | Particle types (`Particle : Entity` + ~31 subclasses) + `ParticleEngine`. | 37 | [Particles](/slop-docs/client/particles/) · [Custom particles](/slop-docs/modding/custom-particles/) |
| `*Screen.cpp` | Classic Java-port screens (`Screen : GuiComponent`). Mostly vestigial on console. | 28 | [Screens](/slop-docs/client/screens/) |
| `*Texture*.cpp` | Texture atlas/stitcher/manager + dynamic textures (`Textures`, `Stitcher`, `ClockTexture`, …). | 21 | [Resources](/slop-docs/client/resources/) · [Textures & assets](/slop-docs/modding/textures-assets/) |
| `*Layer.cpp` | Render layers on `LivingEntityRenderer` (armor, held item, custom head). | 4 | [Entity rendering](/slop-docs/client/entity-rendering/) |
| `*Culler.cpp` | Frustum/viewport/passthrough cullers (`Culler` interface). | 3 | [Rendering](/slop-docs/client/rendering/) |
| `*Button.cpp` | Classic GUI button widgets (`Button`, `SmallButton`, `SlideButton`). | 3 | [Screens](/slop-docs/client/screens/) |

Singletons that don't form a family: `Minecraft.cpp` (the god-object client
engine, entry `Minecraft::main()` at `Minecraft.cpp:4921`), `Gui.cpp` (live HUD),
`Tesselator.cpp`/`TileRenderer.cpp` (geometry batching + terrain render),
`ClientConnection.cpp`/`MultiPlayerLevel.cpp` (the heavy bridge to
`Minecraft.World` — see [Networking](/slop-docs/client/networking/)),
`Input.cpp`/`KeyMapping.cpp` ([Input](/slop-docs/client/input/)),
`Options.cpp`/`Settings.cpp` ([Settings](/slop-docs/client/settings/)),
`Achievement*`/`Stats*` ([Achievements](/slop-docs/client/achievements/)).

### `Common/` — shared client code + assets

| Subdir | Files | What it is | Docs |
|---|---:|---|---|
| `UI/` | 277 | **The live console front-end.** UIScene stack (Iggy-movie-backed scenes) + controls + components. Family table below. | [UI system](/slop-docs/client/ui-system/) · [Custom UI](/slop-docs/modding/custom-ui/) |
| `XUI/` | 176 | Legacy Xbox-360-era XUI implementation of the same scenes. Treat as the sibling of `UI/`. | [UI system](/slop-docs/client/ui-system/) |
| `Audio/` | — | `Consoles_SoundEngine` (abstract) + `SoundEngine` (miniaudio/stb_vorbis). Music-fade-on-transition lives here. | [Audio](/slop-docs/client/audio/) · [Custom sounds](/slop-docs/modding/custom-sounds/) |
| `Network/` | — | Platform-agnostic net abstraction (`GameNetworkManager`, interfaces, `PlatformNetworkManagerStub`, `Sony/`). | [Networking](/slop-docs/client/networking/) |
| `Tutorial/` | — | Tutorial-world task/hint state machine (`Tutorial`, `FullTutorial*`, many `*Task`/`*Hint`). Updated to TU31. | [Consoles systems](/slop-docs/client/consoles-systems/) |
| `GameRules/` | — | Console mini-game/map rule system (`GameRuleManager`, `LevelRuleset`, structure actions). | [Consoles systems](/slop-docs/client/consoles-systems/) |
| `DLC/` | — | Downloadable-content packs (`DLCManager`, `DLCPack`, feeds `DLCTexturePack`/skins/capes). | [Resources](/slop-docs/client/resources/) |
| `Colours/` | — | `ColourTable` — grass/foliage/water biome colour lookup. | [Rendering](/slop-docs/client/rendering/) |
| `Leaderboards/` | — | `LeaderboardManager` base + interfaces (real impls are per-platform). | [Consoles systems](/slop-docs/client/consoles-systems/) |
| `Telemetry/` | — | `TelemetryManager` events. | [Consoles systems](/slop-docs/client/consoles-systems/) |
| `Trial/` | — | `TrialMode` — demo/trial gating. | [Consoles systems](/slop-docs/client/consoles-systems/) |
| `res/`, `Media/`, `DummyTexturePack/`, `zlib/` | — | Bundled resources (fonts/gui/terrain/mob/…), platform media, fallback pack, zlib. | [Resources](/slop-docs/client/resources/) |

Also at `Common/` root: `Consoles_App.cpp`/`.h` (base app class, global `app`),
`ConsoleGameMode.cpp`, `App_*.h` — the console driver that sits above `Minecraft`.
See [Consoles systems](/slop-docs/client/consoles-systems/).

#### `Common/UI/` class families

| Filename pattern | What it is | ~Count | Doc page |
|---|---|---:|---|
| `UIScene_*.cpp` | Concrete console scenes (main menu, settings, container menus, HUD, skin select, …). | 66 | [UI system](/slop-docs/client/ui-system/) |
| `UIControl_*.cpp` | Reusable UI controls (`UIControl_Slider`, `UIControl_MultiList`, lists, buttons, checkboxes). | 30 | [UI system](/slop-docs/client/ui-system/) · [Custom UI](/slop-docs/modding/custom-ui/) |
| `IUIScene_*.h` | Pure-virtual scene interfaces both `UI/` and `XUI/` satisfy. | 21 | [UI system](/slop-docs/client/ui-system/) |
| `UIComponent_*.cpp` | Composable UI components (`UIComponent_Logo`, `UIComponent_Panorama`, chat, tooltips). | 9 | [UI system](/slop-docs/client/ui-system/) |

`Common/XUI/` mirrors these with 84 `XUI_*.cpp` scene/control files (the legacy
implementation). neoLegacy UI changes (skin select, controls, wider settings,
controller-icon slider) all live in `Common/UI/`, not the root `*Screen` classes
or `Common/XUI/`.

### `Windows64/` — the buildable platform

| Subdir / file | What it is | Docs |
|---|---|---|
| `Windows64_Minecraft.cpp` | `_tWinMain` entry, window creation, **D3D11 device/swap-chain bring-up** (`InitDevice`), main loop. | [Windows64](/slop-docs/platforms/windows64/) |
| `Windows64_App.cpp`/`.h` | `CConsoleMinecraftApp` (global `app`); save-thumbnail capture, dev game-start harness. | [Windows64](/slop-docs/platforms/windows64/) |
| `KeyboardMouseInput.cpp`/`.h` | Full KBM state machine + hardcoded PC keybinds (global `g_KBMInput`). | [Input](/slop-docs/client/input/) |
| `4JLibs/` | Git submodule + `impls/Windows_Libs/{Input,Profile,Storage,Render}` — the open MIT reimplementation of 4J's closed middleware (D3D11 renderer, storage, achievements). | [Windows64](/slop-docs/platforms/windows64/) |
| `Network/` | `WinsockNetLayer` — real PC LAN/direct multiplayer (port 25565, LAN discovery 25566). | [Networking](/slop-docs/client/networking/) |
| `Iggy/` | Scaleform/Iggy Flash-UI middleware libs (`iggy_w64.lib` + variants, `gdraw/` backends). | [UI system](/slop-docs/client/ui-system/) |
| `Shaders/` | HLSL shaders + `fxc.exe` (Wine-wrapped on Linux cross-compile). | [Windows64](/slop-docs/platforms/windows64/) |
| `GameConfig/` | Xbox LIVE SPA achievement/stat definitions (`Minecraft.spa`), reused on PC. | [Windows64](/slop-docs/platforms/windows64/) |
| `Leaderboards/`, `Social/`, `Sentient/`, `XML/` | Mostly stubs/headers on PC — inherited Xbox scaffolding kept compiling. | [Windows64](/slop-docs/platforms/windows64/) |

---

## `Minecraft.Server/` — vanilla dedicated server

45 `.cpp` total (8 directly in the module root plus subdir files). This is the
vanilla C++ dedicated server — no plugin host, no .NET at runtime. It compiles
the *full client* because host/world logic is entangled with client render code
(the Docker image even needs Xvfb). See [Server overview](/slop-docs/server/overview/).

| Subdir | What it is | Docs |
|---|---|---|
| `Windows64/` | `ServerMain.cpp` (816 lines) — the entire dedicated-server lifecycle: config, access/security init, world bootstrap, network host, tick loop, shutdown. | [Server overview](/slop-docs/server/overview/) |
| `Access/` | Access control (`BanManager`, `WhitelistManager`, `OpManager`) persisted as JSON, keyed by XUID. | [Configuration](/slop-docs/server/configuration/) |
| `Security/` | Connection hardening: `RateLimiter`, `StreamCipher`/`ConnectionCipher`, `CipherHandshakeEnforcer`, `IdentityTokenManager`. No analog in LCE P2P. | [Configuration](/slop-docs/server/configuration/) |
| `Console/` | The server CLI (linenoise-backed): `ServerCli`/`ServerCliEngine`/`ServerCliParser`/`ServerCliRegistry` + `commands/<name>/`. | [Console](/slop-docs/server/console/) |
| `Console/commands/` | One dir per built-in command: help, stop, list, ban, ban-ip, pardon, pardon-ip, ban-list, whitelist, revoketoken, tp, time, weather, give, enchant, kill, gamemode, defaultgamemode, experience (19). | [Console](/slop-docs/server/console/) |
| `Common/` | Server utilities (`FileUtils`, `StringUtils`, `NetworkUtils`, `AccessStorageUtils`). | [Server overview](/slop-docs/server/overview/) |
| `cmake/sources/` | `Common.cmake` (714 lines) — the shared server source list + grouped variables. | [Building](/slop-docs/overview/building/) |
| `vendor/` | Bundled `linenoise` (line editing) + `nlohmann/json.hpp`. | [Server overview](/slop-docs/server/overview/) |
| `docs/` | `DEVELOPMENT.en.md` / `DEVELOPMENT.ja.md` (bilingual dev notes). | — |

Root files: `ServerProperties.cpp`/`.h` (config schema + loader — see
[Server config](/slop-docs/server/configuration/) and the
[server.properties reference](/slop-docs/reference/server-properties/)),
`WorldManager.cpp` (load-vs-create), `ServerLogger`/`ServerLogManager`,
`ServerShutdown.h`. The 7 FourKit native-bridge files
(`FourKitBridge`/`FourKitRuntime`/`FourKitNatives`/`FourKitMappers`) live here too
but compile only into the FourKit exe (they are inline no-op stubs in the vanilla
build).

---

## `Minecraft.Server.FourKit/` — FourKit plugin host

149 files, **140 of them `.cs`** — a C# (.NET 10) Bukkit-style plugin API bridged
into the native engine via hostfxr. Only the FourKit exe has plugin support. This
directory is the managed host + the public plugin API model. See
[FourKit](/slop-docs/server/fourkit/) and
[FourKit plugins](/slop-docs/server/fourkit-plugins/).

| Subdir | What it is | Docs |
|---|---|---|
| `Event/` | ~60 event classes in `Block/`, `Entity/`, `Inventory/`, `Player/`, `Server/`, `World/` subfolders + `Cancellable`/`Event`/`Listener`/`EventHandlerAttribute`. | [FourKit events](/slop-docs/reference/fourkit-events/) |
| `Entity/` | `Entity`, `LivingEntity`, `HumanEntity`, `Player`, `OfflinePlayer`, `Item`, `EntityType`, `DisconnectReason`. | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `Inventory/` | Typed inventories (Beacon/DoubleChest/Enchanting/EnderChest/Furnace/Horse/Player) + `ItemStack`/`ItemMeta`/`InventoryView`/`InventoryType`. | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `Command/` | `Command`, `CommandExecutor`, `CommandSender`, `ConsoleCommandSender`, `PluginCommand`. | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `Enchantments/` | 26 enchantment classes + base. | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `Block/`, `Chunk/` | Block/chunk API model types. | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `Net/`, `Util/`, `Enums/` | `InetAddress`/`InetSocketAddress`, `Vector`, shared enums. | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `Plugin/` | `ServerPlugin.cs` — the base class plugin authors extend. | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `Experimental/` | `PlayerConnection.cs` (packet-level access, experimental). | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `docs/` | `main.md`, `install.md`, `setup.md`, `plugin-creation.md`, `usage-of-all-events.md`, `sending-packets.md`. | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |

Host machinery at the module root: `FourKitHost.cs` (+ `.Events.cs`,
`.Callbacks.cs`) — the C++-facing host; `NativeBridge.cs` — the ~80 `Native*`
C#→C++ delegates; `FourKit.cs` — the public static API (players/worlds/commands
registry); `EventDispatcher.cs` — reflection-based Bukkit-style dispatch;
`PluginLoader.cs`/`PluginLoadContext.cs` — plugin discovery + isolation. Top-level
API types: `World.cs`, `Location.cs`, `Material.cs`, `GameMode.cs`, `ChatColor.cs`,
`Sound.cs`, `Particle.cs`, `ServerLog.cs`. See the
[FourKit ecosystem](/slop-docs/mods/fourkit-ecosystem/) and
[event reference](/slop-docs/reference/fourkit-events/).

---

## `tools/` — everything

| Subdir / file group | What it is | Docs |
|---|---|---|
| SWF/UI patchers (root `*.java`) | JPEXS FFDec ABC-bytecode patchers for Scaleform UI: hardcore hearts (`PatchHudABC`, `AddHardcoreHearts`), options checkboxes, logo/menu-title tools, AS3 dump helpers. | [Repo tools](/slop-docs/tools/repo-tools/) |
| `.arc` tooling (`RebuildArc`, `ListArc`, `ExtractFromArc`) | Rebuild/list/extract the game's `MediaWindows64.arc` (Java `DataOutputStream` format). | [Repo tools](/slop-docs/tools/repo-tools/) |
| Audio/asset scripts (`msscmp_extract.py`, `pck_extract.py`/`pck_pack.py`) | Extract Miles `.msscmp` banks; unpack/repack `.pck` archives. | [Repo tools](/slop-docs/tools/repo-tools/) |
| `ghidra/` | 4JLibs binary diffing across git refs via Ghidra headless (`compare-4jlibs.sh`/`.py`, `ExportLibInfo.java`). | [Repo tools](/slop-docs/tools/repo-tools/) |
| `performance-monitor/` | Server live instrumentation — PySide6 GUI + injected `perf-monitor.dll` (tick-phase/entity/chunk/memory). | [Testing](/slop-docs/tools/testing/) |
| `stress-test/` | Python bot swarm for server thread-safety stress (connect/disconnect/movement/burst). | [Testing](/slop-docs/tools/testing/) |

---

## `cmake/`, `include/`, `samples/`, `docker/`, `docs/`

| Path | What it is | Docs |
|---|---|---|
| `cmake/ServerTarget.cmake` | The shared server build recipe (`configure_lce_server_target`). | [Building](/slop-docs/overview/building/) |
| `cmake/CommonSources.cmake` | `SOURCES_COMMON` — the `include/` FS shim + committed `BuildVer.h`. | [Building](/slop-docs/overview/building/) |
| `cmake/Copy*.cmake`, `Utils.cmake` | Asset-copy helpers (robocopy/rsync), GameHDD + redist targets. | [Building](/slop-docs/overview/building/) |
| `cmake/Generate*.cmake` | Codegen: `BuildVer.h`, `ItemNameMap.h`, `strings.h`, `StringIdLookup.generated.inc`. | [Building](/slop-docs/overview/building/) |
| `cmake/FxcWineWrapper.sh.in` | Wraps `fxc.exe` through Wine for the Linux cross-build. | [Building](/slop-docs/overview/building/) |
| `cmake/toolchains/` | Five 0-byte console toolchain stubs (durango/orbis/ps3/psvita/xbox360). | [Platforms overview](/slop-docs/platforms/overview/) |
| `include/lce_filesystem/` | Cross-platform FS shim (`lce_filesystem.cpp/.h`, `FolderFile.cpp/.h`) compiled into every target. | [Building](/slop-docs/overview/building/) |
| `include/Common/BuildVer.h` | Committed fallback build header so the tree compiles before codegen runs. | [CI](/slop-docs/tools/ci/) |
| `samples/HelloPlugin/`, `TpsPlugin/`, `FourKitTestPlugin/` | Three example FourKit C# plugins (compile against the API contract, `.csproj` per plugin). | [FourKit plugins](/slop-docs/server/fourkit-plugins/) |
| `docker/dedicated-server/` | Vanilla server Dockerfile + `entrypoint.sh` (Wine + Xvfb, tini). | [Deployment](/slop-docs/server/deployment/) |
| `docs/FOURKIT_PARITY.md` | Canonical plugin-author event-parity reference (everything PORTED). | [FourKit events](/slop-docs/reference/fourkit-events/) |
| `.github/workflows/` | `nightly.yml`, `stable.yml`, `pull-request.yml`, `sync.yml`. | [CI](/slop-docs/tools/ci/) |

---

## Where to go next

- **Just orienting?** Start at [Architecture](/slop-docs/overview/architecture/)
  and [Introduction](/slop-docs/overview/introduction/).
- **Want to build?** [Building](/slop-docs/overview/building/).
- **Writing a mod?** [Getting started](/slop-docs/modding/getting-started/), then
  a [template](/slop-docs/templates/ruby-tools/) for a full worked recipe.
- **Writing a FourKit plugin?** [FourKit plugins](/slop-docs/server/fourkit-plugins/).
- **Need an ID?** The [reference](/slop-docs/reference/block-ids/) section has the
  block/item/entity/packet/enchantment tables.

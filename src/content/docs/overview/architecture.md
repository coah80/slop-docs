---
title: Architecture
description: The four CMake targets, module dependency graph, bootstrap chain, GUI stacks, and where each kind of code lives.
---

neoLegacy compiles from **four source trees** into one CMake build. This page maps those targets, the order they build in, how the client boots, the three UI stacks you'll run into, and — most usefully — a "want to change X, look in Y" table.

## The four targets

Root `CMakeLists.txt` declares `project(LCE-Revelations LANGUAGES C CXX RC ASM_MASM)` (the internal name is still LCE-Revelations) with C++17, no extensions.

| Target | Kind | Directory | Notes |
|---|---|---|---|
| `Minecraft.World` | STATIC lib | `Minecraft.World/` | Shared world/gameplay logic: tiles, items, entities, worldgen, block entities, level storage. Linked into the client and both servers. `add_library(Minecraft.World STATIC ...)` (`Minecraft.World/CMakeLists.txt:19`). |
| `Minecraft.Client` | EXE | `Minecraft.Client/` | The game client. Rendering, UI, input, audio, screens, per-platform `main`. `add_executable(Minecraft.Client ...)` (`Minecraft.Client/CMakeLists.txt:26`). |
| `Minecraft.Server` | EXE | `Minecraft.Server/` | **Vanilla** dedicated server — no plugin host, no .NET at runtime. `add_executable(Minecraft.Server ...)` (`Minecraft.Server/CMakeLists.txt:16`). |
| `Minecraft.Server.FourKit` | EXE | `Minecraft.Server.FourKit/` | **FourKit** dedicated server — same C++ base plus a C# (.NET 10) managed plugin host. `add_executable(Minecraft.Server.FourKit ...)` (`Minecraft.Server.FourKit/CMakeLists.txt:114`). |

Both server exes are literally named `Minecraft.Server.exe`; the variant identity lives in the build directory, enforced by `OUTPUT_NAME "Minecraft.Server"` + explicit output-dir overrides in `cmake/ServerTarget.cmake`.

The servers are added **only on Windows64** (`CMakeLists.txt:160-163`):

```cmake
add_subdirectory(Minecraft.World)
add_subdirectory(Minecraft.Client)
if(PLATFORM_NAME STREQUAL "Windows64") # Server is only supported on Windows for now
  add_subdirectory(Minecraft.Server.FourKit)
  add_subdirectory(Minecraft.Server)
endif()
```

## Module dependency graph

```
                4JLibs.<Platform>.{Input,Profile,Storage,Render}   (git submodule)
                          │
Iggy (Scaleform)          │
   │                      ▼
   │              ┌──────────────────┐
   └─────────────▶│  Minecraft.World │  (STATIC — gameplay)
                  └──────────────────┘
                          ▲   ▲   ▲
             ┌────────────┘   │   └────────────┐
   ┌───────────────────┐  ┌─────────────┐  ┌──────────────────────────┐
   │  Minecraft.Client │  │Minecraft.   │  │ Minecraft.Server.FourKit │
   │      (EXE)        │  │Server (EXE) │  │          (EXE)           │
   └───────────────────┘  └─────────────┘  └──────────────────────────┘
                                                        │  links
                                                        ▼
                                        Minecraft.Server.FourKit.Managed  (C# net10.0)
```

- **`4JLibs`** is a git submodule (`Minecraft.Client/Windows64/4JLibs`, from `git.neolegacy.dev/neoStudiosLCE/4JLibs.git`) providing four static libs: `Input`, `Profile`, `Storage`, `Render`. It builds first (`add_subdirectory("Minecraft.Client/${PLATFORM_NAME}/4JLibs")` at `CMakeLists.txt:146`). Both the client and the servers link all four.
- **Iggy** is the Autodesk Scaleform/Iggy Flash UI runtime (prebuilt libs under `Minecraft.Client/<Platform>/Iggy/`), linked into the client and the servers via the `IGGY_LIBS` list.
- **`Minecraft.World`** links only 4JLibs; it has no dependency on the client or the servers.
- **`Minecraft.Server.FourKit`** additionally depends on `Minecraft.Server.FourKit.Managed`, which runs `dotnet publish --runtime win-x64 --self-contained true` and stages the output into `runtime/` next to the exe.

**Subdirectory / build order** (`CMakeLists.txt:146-163`): `4JLibs` → `Minecraft.World` → `Minecraft.Client` → (Windows64 only) `Minecraft.Server.FourKit` → `Minecraft.Server`.

### Generated headers wired into the graph

Several headers are code-generated at build time (see [Building & Compiling](/slop-docs/overview/building/)) and made prerequisites of `Minecraft.World` / `Minecraft.Client` / `Minecraft.Server` via `add_dependencies`:

| Target | Output | Feeds |
|---|---|---|
| `GenerateBuildVer` | `generated/Common/BuildVer.h` | version/protocol constants (`VER_NETWORK = VER_PRODUCTBUILD = 570`) |
| `GenerateStringsHeader_Minecraft.Client` | `generated/Windows64Media/strings.h` | `IDS_*` localization IDs |
| `GenerateStringIdLookup` | `generated/StringIdLookup.generated.inc` | `IDS_*` → name reverse lookup |
| `GenerateItemNameMap` | `generated/ItemNameMap.h` | `g_ItemNameMap` + `GetItemIdByName()` from `Item.h`/`Tile.h` |

## Bootstrap chain (client)

The client entry point is per-platform. On Windows64 it lives in `Minecraft.Client/Windows64/Windows64_Minecraft.cpp`. The chain:

1. **`_tWinMain`** (`Windows64_Minecraft.cpp:1542`) — the Win32 entry point; sets up the window, D3D11 device, and Iggy.
2. **Thread-local static storage init** — before the game object exists, per-thread arena storage is created for the hot-path classes (`Windows64_Minecraft.cpp:1521-1528`):
   ```cpp
   Tesselator::CreateNewThreadStorage(1024 * 1024);
   AABB::CreateNewThreadStorage();
   Vec3::CreateNewThreadStorage();
   IntCache::CreateNewThreadStorage();
   Compression::CreateNewThreadStorage();
   OldChunkStorage::CreateNewThreadStorage();
   Level::enableLightingCache();
   Tile::CreateNewThreadStorage();
   ```
3. **`Minecraft::main()`** (`Windows64_Minecraft.cpp:1530`, defined at `Minecraft.cpp:4921`) — constructs the singleton game object.
4. **`Minecraft::GetInstance()`** — retrieved right after; `InitGameSettings()`, `InitialiseTips()`, and `ui.ReloadSkin()` run, then the render/update loop (`Minecraft::run()`, `Minecraft.cpp:650`/`805`) drives the game.

The per-tick loop interleaves game logic with **XUI tick/render** and **Iggy Flash render** (see the XUI/Iggy render blocks around `Windows64_Minecraft.cpp:1800-2250`).

> The other platform `main` files (`Xbox_Minecraft.cpp`, `Orbis_Minecraft.cpp`, `PS3_Minecraft.cpp`, `PSVita_Minecraft.cpp`, `Durango_Minecraft.cpp`) exist but their toolchains are unbuildable stubs — see [Platform Code](/slop-docs/platforms/overview/).

## The three GUI stacks

LCE's UI is not one system. When you change a menu you need to know which stack it lives in.

| Stack | Where | What it is | Example files |
|---|---|---|---|
| **Legacy `Screen` classes** | `Minecraft.Client/*Screen.cpp` (~28 files) | The oldest, Java-descended immediate-mode screen hierarchy rooted at `Screen.cpp`. Still used for a handful of screens. | `TitleScreen.cpp`, `CreateWorldScreen.cpp`, `RenameWorldScreen.cpp`, `ChatScreen.cpp` |
| **XUI** | `Minecraft.Client/Common/XUI/*` (~85 files) | 4J's own retained-mode control library — `XUI_Ctrl_*` widgets, `XUI_Scene_*` scenes, progress bars, skin previews. Ticked and rendered from the main loop. | `XUI_Chat.cpp`, `XUI_Ctrl_MinecraftSlot.cpp`, `XUI_Ctrl_EnchantmentBook.cpp` |
| **Iggy / Scaleform + `IUIScene_*`** | `Minecraft.Client/Common/UI/IUIScene_*.cpp` (~21 files) + `.swf` assets | Flash-driven UI: an `IUIScene_*` C++ controller binds gameplay data to a Scaleform/Iggy `.swf`. All the modern container menus live here. | `IUIScene_InventoryMenu.cpp`, `IUIScene_ClassicCraftingMenu.cpp`, `IUIScene_HUD.cpp` |

The `.swf` assets these Iggy scenes drive are edited with the Java SWF tools under `tools/` (JPEXS FFDec–based) — see the modding docs. neoLegacy's Classic Crafting menu (`IUIScene_ClassicCraftingMenu.cpp/.h` + `ClassicCraftingMenu720.swf`) is a new Iggy scene added by the Project-Zenith donation.

## eINSTANCEOF — the RTTI-lite type system

`Minecraft.World` avoids C++ `dynamic_cast` in favor of an enum-based type discriminator, `eINSTANCEOF` (`Minecraft.World/Class.h:106`). Every entity overrides `GetType()`:

```cpp
// Minecraft.World/Entity.h
virtual eINSTANCEOF GetType() = 0;
inline bool instanceof(eINSTANCEOF super) { return eTYPE_DERIVED_FROM(super, GetType()); }
```

```cpp
// Minecraft.World/ArmorStand.h
eINSTANCEOF GetType() override { return eTYPE_ARMORSTAND; }
```

`eTYPE_DERIVED_FROM` encodes the class hierarchy so `instanceof()` works without real RTTI. Entities are instantiated by enum through `EntityIO::newByEnumType(eINSTANCEOF, Level*)`. When you add an entity you register a new `eTYPE_*` value — see [Entities](/slop-docs/world/entities/).

## Where each kind of code lives — decision table

| Want to change… | Look in… |
|---|---|
| A block / tile (behavior, drops, model, state) | `Minecraft.World/*Tile.cpp/.h` — e.g. `SlimeTile.cpp`, `BarrierTile.cpp`. See [Blocks (Tiles)](/slop-docs/world/blocks/). |
| An item (recipe target, tooltip, use) | `Minecraft.World/*Item.cpp/.h` — e.g. `DoorItem.cpp`, `SkullItem.cpp`. See [Items](/slop-docs/world/items/). |
| An entity / mob (data, AI, drops) | `Minecraft.World/` entity + `*Goal`/AI files; register an `eTYPE_*`. See [Entities](/slop-docs/world/entities/) and [AI & Goals](/slop-docs/world/ai-goals/). |
| A block entity (chest, skull, furnace state) | `Minecraft.World/*TileEntity.cpp/.h` — e.g. `SkullTileEntity.cpp`. See [Block Entities](/slop-docs/world/tile-entities/). |
| World generation / biomes / structures | `Minecraft.World/Biome*.cpp`, `*Layer.cpp` (the GenLayer family), `*Feature.cpp` — e.g. `MesaBiome.cpp`, `OceanMonumentFeature.cpp`. See [World Generation](/slop-docs/world/worldgen/). |
| Enchantments / potions / recipes | `Minecraft.World/` enchant/effect/recipe files. See [Enchantments](/slop-docs/world/enchantments/), [Effects & Potions](/slop-docs/world/effects/), [Crafting & Recipes](/slop-docs/world/crafting/). |
| Rendering / models for an entity or block | `Minecraft.Client/*Renderer.cpp`, `*Model.cpp` — e.g. `ItemFrameRenderer.cpp`, `ArmorStandModel`. See [Entity Renderers & Models](/slop-docs/client/entity-rendering/). |
| A Flash-driven menu (inventory, crafting, HUD) | `Minecraft.Client/Common/UI/IUIScene_*.cpp` + its `.swf`. See [UI System (UIScene & XUI)](/slop-docs/client/ui-system/). |
| An XUI control / progress bar / skin preview | `Minecraft.Client/Common/XUI/XUI_*.cpp`. |
| A legacy screen (title, world create/rename) | `Minecraft.Client/*Screen.cpp`. See [Classic Screens & HUD](/slop-docs/client/screens/). |
| Particles | `Minecraft.Client/*Particle.cpp/.h` — e.g. `BarrierParticle.cpp`. See [Particles](/slop-docs/client/particles/). |
| Localization strings | `Minecraft.Client/Windows64Media/loc/*.xml` (`IDS_*`); regenerated into `strings.h`. |
| The dedicated server itself | `Minecraft.Server/` (vanilla), `Minecraft.Server.FourKit/` (plugins). See [Dedicated Server Overview](/slop-docs/server/overview/). |
| A FourKit plugin event / native bridge | `Minecraft.Server/FourKitBridge.cpp/.h`, `FourKitNatives.cpp`; managed side in `Minecraft.Server.FourKit/`. See [FourKit Plugin System](/slop-docs/server/fourkit/). |
| Build config / compiler flags / codegen | root `CMakeLists.txt` and `cmake/*.cmake`. See [Building & Compiling](/slop-docs/overview/building/). |

## Server-side conditional compilation

The FourKit and vanilla servers share almost all C++. The difference is one define. `Minecraft.Server.FourKit` gets `-DMINECRAFT_SERVER_FOURKIT_BUILD` (`Minecraft.Server.FourKit/CMakeLists.txt:116`), which flips `FourKitBridge.h` from **inline no-op stubs** to **real plugin entry points**:

```cpp
// Minecraft.Server/FourKitBridge.h
// In the FourKit-enabled server build, MINECRAFT_SERVER_FOURKIT_BUILD is
// defined ... otherwise every entry point becomes an inline no-op stub. This
// lets gameplay code call FourKitBridge::Fire* unconditionally.
#ifdef MINECRAFT_SERVER_FOURKIT_BUILD
    void FireWorldSave();
    bool FirePlayerPreLogin(const std::wstring& name, const std::string& ip, int port);
    // ...
```

Gameplay code calls `FourKitBridge::Fire*(...)` at every hook site with no per-callsite `#ifdef`; in the vanilla server those calls compile away to nothing. See [FourKit Plugin System](/slop-docs/server/fourkit/) for the full event catalog.

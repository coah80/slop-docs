---
title: Glossary
description: LCE and neoLegacy terminology — Tile, TU, XUI, Iggy, 4JLibs, FourKit, .arc, GenLayer, eINSTANCEOF, and more.
---

Terms you'll hit reading the neoLegacy source. Where a term maps to concrete code, the file is cited so you can jump straight in.

## Project & lineage

**LCE** — Minecraft: Legacy Console Edition. The Xbox 360 / Xbox One / PS3 / PS4 / PS Vita / Wii U family of console Minecraft ports, developed by **4J Studios**. neoLegacy is a continuation of the LCE source.

**neoLegacy** — this project: a community continuation of LCE, based on TU19, backporting later Title Updates. Lowercase *n*, capital *L*. See [Introduction](/slop-docs/overview/introduction/).

**LCE-Revelations** — the upstream base (by `itsRevela`) that neoLegacy continues from. Still the internal CMake project name (`project(LCE-Revelations ...)`). You'll see `itsRevela`/`Revela`/`itsrevela` strings across the tree.

**LCERenewed** — Patoke's LCE project; source of patches that required deep decompilation.

**Project-Zenith** — GabsPuNs' LCE project; donated the Classic Crafting implementation.

**4J Studios / "4J"** — the original LCE developers. Their name survives in `4JLibs`, `4J_*` string files (`Minecraft.Client/Windows64Media/loc/4J_stringsGeneric.xml`), and the **FourKit** plugin API name (a play on "4J").

## Versioning

**TU / Title Update** — a numbered LCE content update (e.g. TU19, TU25, TU31). neoLegacy's base is **TU19** and it backports content in TU release order. See [TU25](/slop-docs/features/tu25/) and [TU31](/slop-docs/features/tu31/).

**BUMP** — the repo-root file holding the human-facing release version string (currently `1.0.9b`). Pushing a change to it triggers the stable-release CI. See [Contributing & Releases](/slop-docs/overview/contributing/).

**BUILD_NUMBER / network version** — `570`, hardcoded in `cmake/GenerateBuildVer.cmake:10`. The protocol-compatibility gate (`VER_NETWORK = VER_PRODUCTBUILD`); deliberately **static** so all builds can play together. Changing it breaks cross-play.

**Nightly** — the auto-built `.zip` release published on every push to `main`; the primary end-user download.

## Engine / gameplay code (`Minecraft.World`)

**Tile** — LCE's word for a **block**. Block classes are `*Tile.cpp/.h` (e.g. `SlimeTile.cpp`, `BarrierTile.cpp`). The "Blocks" docs are titled "Blocks (Tiles)" for this reason. See [Blocks (Tiles)](/slop-docs/world/blocks/).

**TileEntity** — a **block entity** (chest, furnace, skull) — extra per-block state and behavior. Files: `*TileEntity.cpp/.h` (e.g. `SkullTileEntity.cpp`). See [Block Entities](/slop-docs/world/tile-entities/).

**eINSTANCEOF** — the enum-based type discriminator that replaces C++ RTTI. Defined in `Minecraft.World/Class.h:106`. Every entity overrides `virtual eINSTANCEOF GetType()` returning an `eTYPE_*` value; `instanceof()` uses `eTYPE_DERIVED_FROM` to test the hierarchy (`Minecraft.World/Entity.h:45-48`). Entities are created by enum via `EntityIO::newByEnumType()`.

**eTYPE_\*** — the individual entity/type enum values used by `eINSTANCEOF` (e.g. `eTYPE_ARMORSTAND`, `eTYPE_ARROW`, `eTYPE_BAT`). Adding an entity means adding one.

**GenLayer / `*Layer`** — the biome-generation layer classes that build the biome map by stacking transforms (island, edge, snow, mushroom-island, deep-ocean, etc.). Files: `*Layer.cpp/.h` in `Minecraft.World/` (e.g. `AddIslandLayer.cpp`, `DeepOceanLayer.cpp`). Java-descended worldgen. See [World Generation](/slop-docs/world/worldgen/).

**Feature** — a worldgen decoration/structure placer (`*Feature.cpp/.h`), e.g. `OceanMonumentFeature.cpp`, `DoublePlantFeature.cpp`, `MelonFeature`. See [Structures & Features](/slop-docs/world/structures/).

**ItemNameMap** — a generated header (`generated/ItemNameMap.h`) mapping item names → IDs, produced from `Item.h`/`Tile.h` by `cmake/GenerateItemNameMap.cmake`. `Item.h` takes priority over `Tile.h` so, for example, the wheat *crop* tile doesn't shadow the wheat *item*.

## Client / UI (`Minecraft.Client`)

**XUI** — 4J's own retained-mode UI control library, under `Minecraft.Client/Common/XUI/` (~85 files). Widgets are `XUI_Ctrl_*` (slots, progress bars, skin previews); scenes are `XUI_Scene_*`. Ticked and rendered from the main loop. Distinct from the Flash UI below. See [UI System (UIScene & XUI)](/slop-docs/client/ui-system/).

**Iggy / Scaleform** — the Autodesk **Scaleform** Flash runtime (product name **Iggy**) that renders the game's `.swf` UI. Prebuilt libs live under `Minecraft.Client/<Platform>/Iggy/`, linked via the `IGGY_LIBS` list (`iggy_w64.lib;iggyperfmon_w64.lib;iggyexpruntime_w64.lib` on Windows64).

**UIScene / `IUIScene_*`** — the C++ controllers that bind gameplay data to Iggy/Scaleform Flash menus. Files: `Minecraft.Client/Common/UI/IUIScene_*.cpp` (~21), e.g. `IUIScene_InventoryMenu.cpp`, `IUIScene_HUD.cpp`, `IUIScene_ClassicCraftingMenu.cpp`.

**Screen** — the oldest, Java-descended immediate-mode UI hierarchy rooted at `Minecraft.Client/Screen.cpp`. Individual screens are `*Screen.cpp` (~28), e.g. `TitleScreen.cpp`, `CreateWorldScreen.cpp`. See [Classic Screens & HUD](/slop-docs/client/screens/) and the three-GUI-stacks section of [Architecture](/slop-docs/overview/architecture/).

**.swf** — a Flash (Scaleform) UI asset driven by an `IUIScene_*` controller. Edited with the JPEXS-FFDec–based Java tools in `tools/` (not by hand). neoLegacy ships new SWFs like `ClassicCraftingMenu720.swf` and `skinHDWin.swf`.

**splitscreen pads / iPad** — local splitscreen is tracked per controller. In `Minecraft.cpp` the controller/pad index is passed around as `iPad` (e.g. `Minecraft::createExtraLocalPlayer(..., int iPad, ...)`, `Minecraft.cpp:1012`; `SetXboxPad(iPad)`). Each local player is bound to a pad index. (Not an Apple device — "pad" = gamepad.)

**IDS_\* / strings** — localization string IDs. Source XML lives in `Minecraft.Client/Windows64Media/loc/*.xml` (`name="IDS_..."`). CMake generates `strings.h` (`#define IDS_* N`) and a reverse-lookup `.inc` from them at build time.

## Platform & tooling

**4JLibs** — 4J Studios' low-level platform library, a **git submodule** at `Minecraft.Client/Windows64/4JLibs` (from `git.neolegacy.dev/neoStudiosLCE/4JLibs.git`). Provides four static-lib targets: `4JLibs.<Platform>.{Input, Profile, Storage, Render}`, linked into the client and both servers.

**FourKit** — neoLegacy's **C# (.NET 10) server-side plugin API**, absent from vanilla LCE. Managed host + native bridge (`Minecraft.Server/FourKitBridge.cpp/.h`, `FourKitNatives.cpp`, `FourKitRuntime.cpp`, `FourKitMappers.cpp`). The name riffs on "4J". Its event catalog is `docs/FOURKIT_PARITY.md`. See [FourKit Plugin System](/slop-docs/server/fourkit/).

**GameHDD** — the persistent save/data directory the game expects next to the exe (`Windows64/GameHDD`). CMake's `add_gamehdd_target` (`cmake/Utils.cmake`) ensures it exists at build time; the Linux/Docker launchers symlink a persistent one in.

**.arc** — the game's media archive format (e.g. `MediaWindows64.arc`), a Java `DataOutputStream` layout: big-endian ints, modified-UTF-8 names, a `*` name-prefix marking compressed entries. Tooled with `tools/RebuildArc.java`, `ListArc.java`, `ExtractFromArc.java`.

**.msscmp** — a **Miles Sound System** compressed sound bank. Extracted with `tools/msscmp_extract.py`. See [Audio](/slop-docs/client/audio/).

**.pck** — a packed asset archive (console + PC variants, big/little-endian autodetected). Tooled with `tools/pck_extract.py` / `pck_pack.py`.

**FXC** — Microsoft's DirectX HLSL shader compiler (`fxc.exe`). On Linux cross builds it's run through **Wine** via a generated wrapper (`cmake/FxcWineWrapper.sh.in`).

**xwin** — the tool that fetches and "splats" a Windows SDK + CRT on Linux so clang-cl can cross-compile. Installed with `cargo install xwin`. See [Building & Compiling](/slop-docs/overview/building/).

**Emerald Launcher** — the **LCE Emerald Launcher** (`github.com/LCE-Hub/LCE-Emerald-Launcher`), the recommended way for end users to download and manage neoLegacy builds.

## Servers

**Vanilla server** — `Minecraft.Server`, the plain dedicated server: standalone C++, no plugin host, no .NET at runtime.

**FourKit server** — `Minecraft.Server.FourKit`, the same server compiled with `-DMINECRAFT_SERVER_FOURKIT_BUILD` plus the managed C# plugin host. See [Dedicated Server Overview](/slop-docs/server/overview/).

**MINECRAFT_SERVER_FOURKIT_BUILD** — the compile define that flips `FourKitBridge.h` from inline no-op stubs to real plugin entry points. Lets gameplay code call `FourKitBridge::Fire*` unconditionally; in the vanilla server those calls compile away.

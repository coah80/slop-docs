---
title: Minecraft.World Overview
description: The game-logic core of neoLegacy — module layout, the staticCtor registration idiom, and the load-bearing MinecraftWorld_RunStaticCtors() bootstrap.
---

`Minecraft.World` is the game-logic core of neoLegacy — tiles, items, entities,
biomes, worldgen, recipes, enchantments, NBT, packets, and world storage. It is a
**direct C++ port of the decompiled Java LCE codebase** (TU19 base, with TU25 and
TU31 backports). Nearly every class mirrors a `net.minecraft.*` Java class, and
registration is done the classic Java-LCE way: static pointer fields on a base
class, assigned inside a `staticCtor()` method, with integer IDs hard-coded
inline.

Files: everything under `Minecraft.World/` — **892 `.cpp` files and 1060 `.h`
files**, all flat in the module root. There is no package hierarchy on disk; the
Java package structure survives only as empty namespace-stub headers
(`net.minecraft.world.level.tile.h`, `net.minecraft.network.h`, etc.) that the
`.cpp` files include for grouping.

## Module layout

The module root is flat. The only subdirectories are:

| Path | Contents |
|------|----------|
| `cmake/sources/` | Build glue — `Common.cmake`, `Durango.cmake` source lists |
| `x64headers/` | Xbox/console platform shims: `xmcore.h`, `qnet.h`, `xsocialpost.h`, `xuiapp.h`, `extraX64.h` |
| `build/` | Generated — ignore |

`Minecraft.World` builds as a **static library**
(`add_library(Minecraft.World STATIC ...)`, `CMakeLists.txt:19`). The
`x64headers/` directory is exported as a `PUBLIC` include directory, so consumers
of the library see the platform shims.

### The namespace-stub idiom

Because the code is a port of Java, files are grouped by the Java package they
came from. Each package becomes a header named after its dotted path — e.g.
`net.minecraft.world.level.tile.h` — that simply `#include`s every tile header.
`Minecraft.World.cpp` pulls in a dozen of these at the top:

```cpp
#include "net.minecraft.world.item.h"
#include "net.minecraft.world.level.chunk.h"
#include "net.minecraft.world.level.tile.h"
#include "net.minecraft.world.entity.h"
#include "net.minecraft.world.effect.h"
```

These are convenience aggregators, not C++ `namespace` blocks — the classes
inside are in the global namespace.

## The staticCtor registration idiom

neoLegacy has no reflection, no annotation scanning, no service loaders. Every
registry is populated imperatively by a `static void staticCtor()` method on the
relevant base class. The recurring pattern is:

1. A base class holds `static Base *fieldName;` members (one per registered
   thing) plus a `static Base **array` indexed by integer ID.
2. `Base::staticCtor()` assigns each field via
   `new Subclass(id)->setX()->setY()...` — a **fluent builder** where every setter
   returns `this`, so a whole object is configured in one chained expression.
3. The constructor writes `this` into the ID-indexed array (`array[id] = this`),
   so ID → object lookup is a plain array index at runtime.

`Material::staticCtor()` is a compact example of the whole idea
(`Material.cpp:44`):

```cpp
Material::stone  = (new Material(MaterialColor::stone))->notAlwaysDestroyable();
Material::wood   = (new Material(MaterialColor::wood))->flammable();
Material::water  = (new LiquidMaterial(MaterialColor::water))->destroyOnPush();
Material::piston = (new Material(MaterialColor::stone))->notPushable();
```

`Tile::staticCtor()` (`Tile.cpp:359`) uses exactly the same idiom at much larger
scale, with IDs that are the numeric block IDs:

```cpp
Tile::stone = (new StoneTile(1))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_structblock, Item::eMaterial_stone)
    ->setDestroyTime(1.5f)->setExplodeable(10)
    ->setSoundType(Tile::SOUND_STONE)
    ->setIconName(L"stone")->setDescriptionId(IDS_TILE_STONE)
    ->setUseDescriptionId(IDS_DESC_STONE);
```

The same shape recurs across the module: `Item::staticCtor()` (`Item.cpp:282`),
`MobEffect::staticCtor()` (`MobEffect.cpp:47`), `Enchantment::staticCtor()`
(`Enchantment.cpp:54`), `Biome::staticCtor()` (`Biome.cpp:80`),
`Packet::staticCtor()` (`Packet.cpp:15`), and more. See the subsystem pages for
each registry's contents.

## The bootstrap: `MinecraftWorld_RunStaticCtors()`

Every registry in the module is wired up by a single free function,
**`MinecraftWorld_RunStaticCtors()`** (`Minecraft.World.cpp:26`; declared in the
one-line `Minecraft.World.h`). It calls each subsystem's `staticCtor()` in a
fixed sequence.

**The ordering is load-bearing.** The function opens with a comment preserved from
the original 4J code (`Minecraft.World.cpp:28`):

```cpp
// The ordering of these static ctors can be important. If they are within statement blocks then
// DO NOT CHANGE the ordering - 4J Stu
```

The dependencies are real: `Material::staticCtor()` must run **after**
`MaterialColor::staticCtor()` (materials reference `MaterialColor::stone` etc.);
`Tile::staticCtor()` must run **after** `Material::staticCtor()` (tiles reference
`Material::stone` etc.); `Item::staticCtor()` runs after `Tile::staticCtor()`
because block-item shadows depend on the tile registry; the digger tool ctors
(`HatchetItem`/`PickaxeItem`/`ShovelItem`) run after tiles because they build
their "which blocks can I mine" tables from the finished tile list.

### Call sequence

| Line | Call | Bootstraps |
|------|------|-----------|
| 31 | `Packet::staticCtor()` | networking packet ID registry |
| 34 | `MaterialColor::staticCtor()` | 14 map/material colors |
| 35 | `Material::staticCtor()` | block materials |
| 36 | `Tile::staticCtor()` | all blocks/tiles |
| 37 | `HatchetItem::staticCtor()` | axe digger-block table |
| 38 | `PickaxeItem::staticCtor()` | pickaxe digger-block table |
| 39 | `ShovelItem::staticCtor()` | shovel digger-block table |
| 40 | `BlockReplacements::staticCtor()` | legacy block-ID remap |
| 41 | `Biome::staticCtor()` | biomes |
| 42 | `MobEffect::staticCtor()` | potion/status effects |
| 43 | `Item::staticCtor()` | all items |
| 44 | `FurnaceRecipes::staticCtor()` | smelting recipes |
| 45 | `Recipes::staticCtor()` | crafting recipes |
| 50 | `Stats::staticCtor()` | statistics (also calls Achievements) |
| 53 | `TileEntity::staticCtor()` | block-entity type registry |
| 54 | `EntityIO::staticCtor()` | entity type registry |
| 55 | `MobCategory::staticCtor()` | spawn categories |
| 57 | `Item::staticInit()` | second item pass (see below) |
| 58 | `LevelChunk::staticCtor()` | chunk statics |
| 60 | `LevelType::staticCtor()` | world types |
| 63 | `StructureFeatureIO::staticCtor()` | structure piece registry |
| 65–69 | `MineShaftPieces`, `StrongholdFeature`, `VillagePieces::Smithy`, `VillageFeature`, `RandomScatteredLargeFeature` `::staticCtor()` | structure piece sets |
| 72 | `EnderMan::staticCtor()` | enderman carriable-block table |
| 73 | `PotionBrewing::staticCtor()` | brewing recipe graph |
| 74 | `Enchantment::staticCtor()` | enchantments |
| 76 | `SharedConstants::staticCtor()` | shared constants |
| 78 | `ServerLevel::staticCtor()` | server-level statics |
| 79–81 | `SparseLightStorage`, `CompressedTileStorage`, `SparseDataStorage` `::staticCtor()` | chunk storage |
| 82 | `McRegionChunkStorage::staticCtor()` | region-file storage |
| 83 | `Villager::staticCtor()` | villager trade tables |
| 84 | `GameType::staticCtor()` | game-mode registry |
| 85 | `BeaconTileEntity::staticCtor()` | beacon power-pyramid table |

Note the **two-phase item bootstrap**: `Item::staticCtor()` runs at line 43, but
`Item::staticInit()` (`Item.cpp:558`) runs later at line 57 — after
`TileEntity`/`EntityIO` — because some items (spawn eggs, records) reference
entity and tile-entity registrations that must already exist. See
[Items](/slop-docs/world/items/).

The `Stats`/`Achievements` line is `#ifdef`-guarded on `_DURANGO` (Xbox One): the
Durango build swaps in `DurangoStats` and skips `Stats::staticCtor()`; every other
platform runs `Stats::staticCtor()` at line 50, which in turn calls
`Achievements::staticCtor()` internally (a 4J change noted at
`Minecraft.World.cpp:52`).

> **Changed in v1.1.0b** (`54528fac feat: loot tables (#43)`): the bootstrap now
> opens with a **loot-table preload** — `LootTableManager::Get().LoadFromDisk("")`
> is called at the very top of `MinecraftWorld_RunStaticCtors()`, *before*
> `Packet::staticCtor()`, so bonus chests are populated before world generation
> (`app.DebugPrintf("FATAL: ...")` on failure). This inserts ~8 lines ahead of the
> registry calls, so in v1.1.0b every line number in the call-sequence table above
> shifts up by 8 (`Packet::staticCtor()` moves from line 31 to 39, and so on). The
> `#include "LootTableManager.h"` is added at line 20. See the
> [loot-table system](/slop-docs/world/entities/#see-also) wired into the mob classes.

## How the client and server link this

`Minecraft.World` builds as a static library, but the client and the server
consume it two different ways:

- **`Minecraft.Client`** links the `Minecraft.World` static library directly
  (`Minecraft.Client/CMakeLists.txt:85`).
- **`Minecraft.Server`** does **not** link the library. Instead it compiles the
  needed `Minecraft.World/*.cpp` files straight into the server executable, listed
  by relative path (`../Minecraft.World/Tile.cpp`,
  `../Minecraft.World/Player.cpp`, …) in the server's own source list
  (`Minecraft.Server/cmake/sources/Common.cmake:530`+). The executable itself is
  `add_executable(Minecraft.Server ...)` (`Minecraft.Server/CMakeLists.txt:16`).

Either way the same world-logic translation units end up in both binaries.

Both call the bootstrap from the same entry point. `Minecraft::main()`
(`Minecraft.Client/Minecraft.cpp:4930`) calls
`MinecraftWorld_RunStaticCtors()` before anything else, then runs the
client-only render registries behind a guard:

```cpp
MinecraftWorld_RunStaticCtors();
#ifndef MINECRAFT_SERVER_BUILD
    EntityRenderDispatcher::staticCtor();
    TileEntityRenderDispatcher::staticCtor();
#endif
```

So the world registries are identical on client and server; only the render-side
dispatchers are client-exclusive. This is why a block or item added to
`Tile::staticCtor()` / `Item::staticCtor()` is automatically known to the
dedicated server with no extra registration step.

## Adding to a registry (modding note)

To add a block, item, effect, enchantment, etc., you edit the relevant
`staticCtor()` and follow the existing fluent-builder pattern. Two rules that fall
out of the bootstrap design:

- **Respect the ordering.** If your new thing references another registry
  (e.g. an item that shadows a tile), make sure that registry's `staticCtor()`
  runs earlier in `MinecraftWorld_RunStaticCtors()`. Do not reorder the existing
  calls.
- **IDs are hard-coded, not auto-incremented.** Pick a free integer ID and pass
  it to the constructor; the ctor writes the object into the ID-indexed array. A
  collision silently overwrites the earlier registration (the Java bounds-check
  is commented out — see `Tile.cpp:720`).

## Related pages

- [Materials](/slop-docs/world/materials/) — the `Material` system tiles reference
- [Game Rules](/slop-docs/world/gamerules/) — now a passthrough to host options
- [Block Entities (TileEntity)](/slop-docs/world/tile-entities/)
- [Container Menus](/slop-docs/world/containers/)

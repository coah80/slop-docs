---
title: Getting Started
description: How modding neoLegacy actually works — the source-editing workflow, the staticCtor registration idiom every guide relies on, code style, and a change-X-edit-Y map.
---

neoLegacy has no plugin API, no scripting layer, and no runtime mod loader. It is
a **direct C++ port of the decompiled Java LCE codebase**, and you extend it the
same way 4J did: by editing the source and recompiling. Every class mirrors a
`net.minecraft.*` Java class, and every block, item, entity, packet, enchantment
and effect is wired up by hand in a `staticCtor()` method with hard-coded integer
IDs. "Modding" here means **forking the source and adding a subclass + a
registration line**, then building the `.exe`.

If you were expecting a Forge-style mod jar, read [Mods & the 4J
Ecosystem](/slop-docs/mods/overview/) first for what "a mod" means in the LCE
world. This section is about changing the game itself.

## Prerequisites

Before you can test a single change you need a working build. That is covered in
full on [Building & Compiling](/slop-docs/overview/building/) — you need the
Windows x64 toolchain (native VS2022, the Linux clang-cl cross-compile, or the
Nix flake), because neoLegacy only produces a Windows binary today. Come back
here once `LCE-Revelations` compiles and runs for you.

You should also skim:

- [Architecture](/slop-docs/overview/architecture/) — what the four build targets
  (`Minecraft.World`, `Minecraft.Client`, and friends) are and how they relate.
- [Blocks (Tiles)](/slop-docs/world/blocks/) and [Items](/slop-docs/world/items/) —
  the two registries you will touch most.

## Repo tour for modders

Almost all game logic lives in one module, **`Minecraft.World`** — 892 `.cpp` +
1060 `.h` files, all flat in the module root, one file (or a small grouped
header) per class. Rendering, textures, and UI live in **`Minecraft.Client`**.
There are no per-feature folders: `SlimeTile.cpp` sits right next to `Tile.cpp`.

The bootstrap that wires everything together is
`Minecraft.World/Minecraft.World.cpp`. Its `MinecraftWorld_RunStaticCtors()`
(`Minecraft.World.cpp:26`) calls each subsystem's `staticCtor()` in a
**load-bearing order** (the source literally says "DO NOT CHANGE the ordering - 4J
Stu"). Materials before tiles, tiles before items, items before recipes:

```
Material::staticCtor();     // line 35 - block materials
Tile::staticCtor();         // line 36 - ALL blocks
Item::staticCtor();         // line 43 - ALL items
FurnaceRecipes::staticCtor();
Recipes::staticCtor();
```

If you add a new subsystem registry, this is where you'd hook its `staticCtor()`
— but for a block or item you never touch this file; you edit the existing
`Tile::staticCtor()` / `Item::staticCtor()` bodies.

:::note[Changed in v1.1.0b]
The line numbers above are for the snapshot this page was written against. On
`origin/main` (v1.1.0b) a `LootTableManager` include + a `LoadFromDisk` preload
were added just above the `staticCtor` chain, shifting the whole block **down by
~8 lines**: `MinecraftWorld_RunStaticCtors()` is now `Minecraft.World.cpp:28`,
`Material::staticCtor()` line 43, `Tile::staticCtor()` line 44, `Item::staticCtor()`
line 51, `FurnaceRecipes` 52, `Recipes` 53. `git show origin/main:Minecraft.World/Minecraft.World.cpp`
for the current bootstrap. The *ordering* is unchanged.
:::

### Change X → edit Y

| You want to change… | Edit | Registered in |
|---------------------|------|---------------|
| A new block | new `*Tile.{h,cpp}` + `Tile.cpp` | `Tile::staticCtor()` (`Tile.cpp:359`) — see [Adding Blocks](/slop-docs/modding/adding-blocks/) |
| A new item | new `*Item.{h,cpp}` + `Item.cpp` | `Item::staticCtor()` (`Item.cpp:282`) |
| A new mob / entity | new entity class + `EntityIO.cpp` | `EntityIO::staticCtor()` (`EntityIO.cpp:45`), via `setId(...)` |
| A block entity | new `*TileEntity.{h,cpp}` + `TileEntity.cpp` | `TileEntity::staticCtor()` (`TileEntity.cpp:14`), via `setId(...)` |
| A crafting recipe | `Recipes.cpp` | `Recipes::_compileRecipes()` (`Recipes.cpp:49`) |
| A smelting recipe | `FurnaceRecipes.cpp` | `FurnaceRecipes::staticCtor()` |
| An enchantment | new `*Enchantment.{h,cpp}` + `Enchantment.cpp` | `Enchantment::staticCtor()` (`Enchantment.cpp:54`) |
| A status effect / potion | `MobEffect.cpp` / `PotionBrewing.cpp` | `MobEffect::staticCtor()` (`MobEffect.cpp:47`) |
| A biome | new `*Biome.{h,cpp}` + `Biome.cpp` | `Biome::staticCtor()` (`Biome.cpp:80`) |
| A world feature (tree/ore/etc.) | new `*Feature.{h,cpp}` | placed by a `BiomeDecorator` |
| A network packet | new `*Packet.{h,cpp}` + `Packet.cpp` | `Packet::staticCtor()` (`Packet.cpp:15`), via `map(...)` |
| A game rule | `GameRules.cpp` | fixed enum in `GameRules.cpp:7` |
| A command | new `*Command.{h,cpp}` + dispatcher | `CommandDispatcher` |
| Block/item textures | `Minecraft.Client/PreStitchedTextureMap.cpp` | `ADD_ICON(row, col, name)` |
| Custom block rendering | `Minecraft.Client/TileRenderer.cpp` | render-shape switch on `getRenderShape()` |
| Creative-menu contents | `Minecraft.Client/Common/UI/IUIScene_CreativeMenu.cpp` | `ITEM(id)` / `ITEM_AUX(id, aux)` |
| Display names / tooltips | `Minecraft.Client/.../loc/stringsGeneric.xml` + a `IDS_*` id | referenced from the registration line |

Each subsystem also has a reference page under [`/slop-docs/world/`](/slop-docs/world/overview/)
documenting its full registry.

## The registration idiom (`staticCtor`)

Every registry in the codebase follows the same shape, and every modding guide
here relies on it. A base class holds:

1. `static Base **array;` — an id-indexed table (`Tile::tiles`, `Item::items`, …).
2. Many `static Base *namedField;` members — convenient named handles
   (`Tile::stone`, `Tile::slimeBlock`, …).
3. A `static void staticCtor()` — the one function that fills both.

Inside `staticCtor()` each entry is created with a **fluent builder**: the
constructor takes the numeric ID, and every `setX()` returns `this` so the calls
chain. `Tile::stone` is the canonical example (`Tile.cpp:378`):

```cpp
Tile::stone = (new StoneTile(1))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_structblock, Item::eMaterial_stone)
    ->setDestroyTime(1.5f)
    ->setExplodeable(10)
    ->setSoundType(Tile::SOUND_STONE)
    ->setIconName(L"stone")
    ->setDescriptionId(IDS_TILE_STONE)
    ->setUseDescriptionId(IDS_DESC_STONE);
```

`new StoneTile(1)` also has the side effect of registering itself into
`Tile::tiles[1]` from inside the `Tile` constructor — assigning to
`Tile::stone` just keeps a named pointer. When a builder method (like
`setSoundType`) is declared on the base and you need the subclass pointer back,
the code wraps the whole chain in a `static_cast<>` — you'll see that pattern
constantly, e.g. `Tile::grass = static_cast<GrassTile *>((new GrassTile(2))->...)`.

The **integer ID is chosen by hand and never auto-assigned**. IDs are a scarce,
globally-shared namespace (blocks 0–`TILE_NUM_COUNT`, i.e. 0–4096, with items
shadowing blocks below 256 — see [Adding Blocks](/slop-docs/modding/adding-blocks/)
for the +256 rule). Pick an unused one; the neoLegacy additions cluster at
152–197 for blocks (as of this snapshot; on `origin/main`/v1.1.0b the block
cluster extends further — see [Adding Blocks → pick an ID](/slop-docs/modding/adding-blocks/#step-0--pick-an-id)
and always grep the current `origin/main` before choosing).

The same idiom, with a different call, appears in the factory-style registries:

```cpp
// entities  — EntityIO.cpp:45
EntityIO::setId(Zombie::create, eTYPE_ZOMBIE, L"Zombie", 54, ...);
// block entities — TileEntity.cpp
TileEntity::setId(FurnaceTileEntity::create, eTYPE_FURNACETILEENTITY, L"Furnace");
// packets — Packet.cpp
Packet::map(3, /*client*/true, /*server*/true, ..., typeid(ChatPacket), ChatPacket::create);
```

Learn this one pattern and every "add a thing" guide is the same three steps:
**write a subclass, pick an ID, add one line to the relevant `staticCtor()`.**

## Code style

The repo ships a `.clang-format` (Microsoft base). The load-bearing settings:

| Setting | Value | Effect |
|---------|-------|--------|
| `BasedOnStyle` | `Microsoft` | Allman braces (opening brace on its own line) |
| `IndentWidth` / `TabWidth` | `4` | four-space indent width |
| `UseTab` | `Never` | (spaces — but note much existing source is tab-indented; match the file you're editing) |
| `ColumnLimit` | `0` | no line wrapping — the long fluent chains stay on one line |
| `PointerAlignment` | `Right` | `Tile *stone`, not `Tile* stone` |
| `BraceWrapping.AfterFunction` | `true` | function `{` on its own line |
| `AfterControlStatement` | `Always` | `if`/`for` braces on their own line |
| `InsertBraces` | `true` | single-statement `if` bodies get braces |
| `InsertNewlineAtEOF` | `true` | files end with a newline |

`ColumnLimit: 0` is why the registration lines in `Tile.cpp`/`Item.cpp` are
hundreds of characters wide and often aligned with tabs — that is intentional and
`clang-format` will not break them. When you add a line, keep it on one line and
match the surrounding alignment.

A few conventions clang-format won't enforce but the codebase follows:

- Wide-string literals everywhere user-facing or save-facing: `L"slime"`,
  `L"Furnace"`.
- Display text is never a string literal in logic — it's an `IDS_*` id resolved
  through the localization tables.
- The `4J`/`4J Stu`/`AP` comments mark original-author notes and porting
  decisions. Leave them; add your own with your handle if you're mirroring the
  style.

Run `clang-format` on files you create; don't reformat files you only touched a
line in (it will churn the whole file against the tab-vs-space mismatch).

## Fork vs. upstream

There are two different reasons to change this code, and they pull in opposite
directions:

- **Backporting** — bringing a real later-TU feature (a TU25/TU31 block, mob, or
  mechanic) into the TU19 base, faithfully. This is the project's core mission and
  has its own process: see [Backporting Overview](/slop-docs/backporting/overview/).
  Backports are expected to land upstream, so they mirror how 4J did it and reuse
  existing IDs where the real feature used them.
- **Personal forks** — inventing something that never existed in LCE. Totally
  fine, but it's *yours*: pick IDs that won't collide with in-progress backports,
  and don't expect it upstream.

The how-to guides in this section (starting with [Adding
Blocks](/slop-docs/modding/adding-blocks/)) use **real neoLegacy backports as the
worked example** — SlimeTile, BarrierTile — because copying exactly what a merged
feature did is the safest template whether you're backporting or forking.

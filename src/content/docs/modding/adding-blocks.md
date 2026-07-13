---
title: Adding Blocks
description: A full worked example — add a new Tile to neoLegacy end to end, modeled on how SlimeTile and BarrierTile are actually registered today.
---

This walks the complete process of adding a block, using the two real neoLegacy
backports as the template: **`SlimeTile`** (id 165 — a custom-shape,
custom-behavior block) and **`BarrierTile`** (id 166 — a minimal
indestructible block). Every step cites what those files actually do so you can
copy the pattern exactly. Read [Getting Started](/slop-docs/modding/getting-started/)
first for the `staticCtor` idiom and the build setup, and keep the
[Blocks reference](/slop-docs/world/blocks/) open for the full list of `Tile`
virtuals.

For the worked example we'll add a **Cushion** block: a soft block that, like
slime, cancels fall damage and bounces entities. It's deliberately close to
`SlimeTile` so you can diff against a merged feature.

## Step 0 — pick an ID

Block IDs live in one shared 0–`TILE_NUM_COUNT` namespace (`TILE_NUM_COUNT = 4096`,
`Tile.h:101`), but the region below 256 is special: **IDs 0–255 have an
auto-generated item form** (the "+256 rule", explained in
[step 5](#step-5--the-item-form-256-rule)). The vanilla and backported blocks are
packed contiguously; the neoLegacy additions run 152–197. Barrier took 166,
slime took 165. Pick the next free slot — check `Tile.h` for the highest
`*_Id` constant and `Tile.cpp`'s `staticCtor` for the highest `new XxxTile(n)`.
For this example assume **198** is free.

:::note[Changed in v1.1.0b — check the current free range]
This snapshot's block IDs top out at 197 (the wooden doors), so 198 is the next
free slot. On `origin/main` (v1.1.0b) the range has grown past 197: it added the
banner tiles at **176/177** (previously gaps) and a batch of higher `*_Id`
constants — `end_bricks_Id = 206`, `magma_Id = 213`, `nether_wart_block_Id = 214`,
`red_nether_brick_Id = 215`, `bone_block_Id = 216`. **198 is still free on
`origin/main`**, but the neighbouring slots are filling, so before you commit an
ID grep the *current* upstream, not just this page:
`git show origin/main:Minecraft.World/Tile.h | grep _Id` and
`git show origin/main:Minecraft.World/Tile.cpp | grep 'new .*Tile('`.
:::

:::note[IDs are permanent]
Once a world is saved, block IDs are baked into the save. Don't reuse or
renumber an ID that has shipped. If you're backporting a real TU25/TU31 block,
use the ID the real feature used.
:::

## Step 1 — the Tile subclass header

Create `Minecraft.World/CushionTile.h`. `SlimeTile.h` is the template — it
subclasses `HalfTransparentTile` (the base for glass/ice/slime — blocks whose
faces need special culling) and overrides the render + behavior hooks:

```cpp
// SlimeTile.h — the template
class SlimeTile : public HalfTransparentTile
{
public:
    SlimeTile(int id);
    virtual int getRenderLayer();
    virtual bool shouldRenderFace(LevelSource *level, int x, int y, int z, int face);
    virtual int getRenderShape();
    virtual bool isSolidRender();
    virtual int getPistonPushReaction();

    virtual void fallOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity, float fallDistance);
    virtual void updateEntityAfterFallOn(Level *level, shared_ptr<Entity> entity);
    virtual void stepOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity);
};
```

Our `CushionTile.h` mirrors it. If your block is a plain opaque cube with no
custom behavior, you don't even need a subclass — you can register a bare
`new Tile(id, Material::x)` (that's what `Tile::cobblestone` at id 4 does). We
want bounce behavior, so we subclass:

```cpp
// Minecraft.World/CushionTile.h
#pragma once
#include "HalfTransparentTile.h"

class Random;

class CushionTile : public HalfTransparentTile
{
public:
    CushionTile(int id);
    virtual int getRenderShape();
    virtual bool isSolidRender();
    virtual int getPistonPushReaction();

    virtual void fallOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity, float fallDistance);
    virtual void stepOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity);
};
```

## Step 2 — the Tile subclass implementation

Create `Minecraft.World/CushionTile.cpp`. The constructor calls the
`HalfTransparentTile` base ctor `(int id, const wstring &tex, Material *material,
bool allowSame)` (`HalfTransparentTile.h:13`) — exactly what `SlimeTile` does:

```cpp
// SlimeTile.cpp — the template ctor
SlimeTile::SlimeTile(int id) : HalfTransparentTile(id, L"slime", Material::clay, false)
{
    friction = 0.8f;
}
```

The second argument (`L"slime"`) is the **texture name**, which must match an icon
registered in step 6. `Material::clay` gives it clay's physical properties;
`false` for `allowSame` controls face-culling against identical neighbors. Our
implementation, copying slime's bounce logic:

```cpp
// Minecraft.World/CushionTile.cpp
#include "stdafx.h"
#include "CushionTile.h"
#include "Entity.h"

CushionTile::CushionTile(int id) : HalfTransparentTile(id, L"cushion", Material::cloth, false)
{
    friction = 0.8f;
}

int CushionTile::getRenderShape()
{
    return Tile::SHAPE_SLIME;   // reuse slime's translucent-cube renderer (see step 7)
}

bool CushionTile::isSolidRender()
{
    return false;
}

int CushionTile::getPistonPushReaction()
{
    return Material::PUSH_NORMAL;    // pushable; slime uses Material::PUSH_SLIME
}

void CushionTile::fallOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity, float distance)
{
    // no fall damage
    HalfTransparentTile::fallOn(level, x, y, z, entity, distance);
    if (entity == nullptr)
        return;

    entity->clearFallDamageQueue();
    entity->fallDistance = 0.0f;

    if (entity->isSneaking() || std::abs(entity->yd) < 0.1f)
    {
        entity->yd = 0.0f;
        return;
    }

    if (entity->yd < 0.0f)
    {
        entity->yd = -entity->yd;   // bounce
        if (!(entity->instanceof(eTYPE_LIVINGENTITY)))
        {
            entity->yd *= 0.8f;
        }
    }
}

void CushionTile::stepOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity)
{
    if (entity != nullptr)
    {
        entity->clearFallDamageQueue();
    }
    HalfTransparentTile::stepOn(level, x, y, z, entity);
}
```

The relevant constants come straight from the base classes:

| Constant | Value | File |
|----------|-------|------|
| `Tile::SHAPE_SLIME` | 41 | `Tile.h:206` |
| `Material::PUSH_NORMAL` | 0 | `Material.h:45` |
| `Material::PUSH_SLIME` | 3 | `Material.h:48` |
| `Material::cloth` / `clay` / `stone` | static instances | `Material.h`, built in `Material::staticCtor()` |

## Step 3 — register the source files with CMake

**This step is easy to forget and the build won't see your class without it.**
`Minecraft.World` does *not* glob its sources — every `.cpp`/`.h` is listed
explicitly in `Minecraft.World/cmake/sources/Common.cmake`. `BarrierTile` is in
there at `Common.cmake:1788`:

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/BarrierTile.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/BarrierTile.h"
```

and `SlimeTile` at `Common.cmake:1966`. Add your two files in the same
alphabetical block:

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/CushionTile.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/CushionTile.h"
```

## Step 4 — declare and register the block

Two edits in the `Tile` class itself.

**4a. Declare the static handle and the ID constant in `Tile.h`.** Slime and
barrier sit together (`Tile.h:405–406` for the IDs, `:530` / `:640` for the
handles):

```cpp
// Tile.h — id constants (near line 405)
static const int slime_Id   = 165;
static const int barrier_Id = 166;
// add:
static const int cushion_Id = 198;

// Tile.h — named handles
static Tile *slimeBlock;   // :530
static Tile *barrier;      // :640
// add:
static Tile *cushion;
```

The `_Id` constant also needs its out-of-line definition in `Tile.cpp` (there's a
block of them near the bottom, e.g. `const int Tile::slime_Id;` at `Tile.cpp:1914`)
and the pointer needs a `nullptr` initializer at the top of `Tile.cpp` (e.g.
`Tile *Tile::slimeBlock = nullptr;` at `Tile.cpp:72`). Add matching
`const int Tile::cushion_Id;` and `Tile *Tile::cushion = nullptr;`.

**4b. Add the registration line to `Tile::staticCtor()`** (`Tile.cpp:359`).
Slime and barrier are registered back to back at `Tile.cpp:572–573`:

:::note[Changed in v1.1.0b]
These line numbers are for the snapshot. On `origin/main` (v1.1.0b) the extra
tiles added above them push everything down: `Tile::staticCtor()` is `Tile.cpp:366`
and the slime/barrier pair is at `Tile.cpp:579–580` (slime's line also picked
up a `setBaseItemTypeAndMaterial(...)` call upstream). The registration *pattern*
is identical — just diff `git show origin/main:Minecraft.World/Tile.cpp` if you're
matching upstream line-for-line.
:::

```cpp
Tile::slimeBlock = (new SlimeTile(165))
    ->setSoundType(SOUND_SLIME)
    ->setIconName(L"slime")
    ->setDescriptionId(IDS_TILE_SLIME_BLOCK)
    ->setUseDescriptionId(IDS_DESC_SLIME_BLOCK)
    ->disableMipmap();

Tile::barrier = (new BarrierTile(166, Material::stone, false))
    ->setIndestructible()
    ->setExplodeable(6000000)
    ->setSoundType(Tile::SOUND_STONE)
    ->setIconName(L"barrier")
    ->setDescriptionId(IDS_TILE_BARRIER)
    ->setNotCollectStatistics()
    ->setUseDescriptionId(IDS_DESC_BARRIER);
```

Add yours nearby (don't disturb the ordering of existing lines — just append your
own):

```cpp
Tile::cushion = (new CushionTile(198))
    ->setDestroyTime(0.8f)
    ->setSoundType(SOUND_CLOTH)
    ->setIconName(L"cushion")
    ->setDescriptionId(IDS_TILE_CUSHION)
    ->setUseDescriptionId(IDS_DESC_CUSHION)
    ->disableMipmap();
```

Note `#include "CushionTile.h"` at the top of `Tile.cpp` alongside the other tile
includes. The builder methods used above (all return `Tile *` so they chain):

| Method | File | Purpose |
|--------|------|---------|
| `setDestroyTime(float)` | `Tile.h:732` | mining hardness |
| `setExplodeable(float)` | `Tile.h:721` | blast resistance |
| `setSoundType(SoundType*)` | `Tile.h:718` | step/dig/place sounds |
| `setIconName(wstring)` | `Tile.h:854` | base texture name |
| `setDescriptionId(uint)` | `Tile.h:821` | display-name string id |
| `setUseDescriptionId(uint)` | `Tile.h:824` | tooltip/description string id |
| `setLightBlock(int)` | `Tile.h:719` | opacity 0–255 |
| `setLightEmission(float)` | `Tile.h:720` | light level (fraction of 15/16) |
| `setIndestructible()` | `Tile.h:733` | unbreakable (bedrock/barrier) |
| `setNotCollectStatistics()` | `Tile.h:833` | exclude from mine/craft stats |
| `disableMipmap()` | `Tile.h:738` | sharp texture (cross/plants/slime) |

The sound handles (`SOUND_CLOTH`, `SOUND_SLIME`, `SOUND_STONE`, …) are `Tile`
statics created at the very top of `staticCtor()` (`Tile.cpp:361+`).

## Step 5 — the item form (+256 rule)

A block you can hold in your hand needs an **item** whose ID is the block ID
**plus 256**. This is why the item registry reserves 0–255 for block-shadow items:
`Item::Item(int id)` stores `id = 256 + id` (`Item.cpp:624`) and writes itself to
`items[256 + id]`.

You almost never create this by hand. At the **end of `Tile::staticCtor()`**
there's a loop (`Tile.cpp:663`) that auto-creates a default `TileItem` for every
registered block that doesn't already have one:

```cpp
for (int i = 0; i < 256; i++)
{
    if (Tile::tiles[i] != nullptr)
    {
        if (Item::items[i] == nullptr)
        {
            Item::items[i] = new TileItem(i - 256);
            Tile::tiles[i]->init();
        }
        // ... light/propagation flags
    }
}
```

Since our cushion is id 198 (< 256), this loop gives it a `TileItem` for free —
same as slime and barrier get theirs. **You only add an explicit item line** if
your block needs a special item class (multi-variant textures, colored variants,
slabs, etc.). Those are all in the same region of `Tile.cpp` above the loop, e.g.
wool uses a `WoolTileItem` (`Tile.cpp:612`), logs use a `MultiTextureTileItem`
(`Tile.cpp:617`). For a plain block, do nothing here.

## Step 6 — strings & localization

Display names and tooltips are `IDS_*` ids resolved from the localization tables,
never string literals. Slime's entries live in
`Minecraft.Client/.../loc/stringsGeneric.xml`:

```xml
<data name="IDS_TILE_SLIME_BLOCK">
    <value>Slime Block</value>
</data>
<data name="IDS_DESC_SLIME_BLOCK">
    <value>Causes players and mobs to bounce when they jump on it.</value>
</data>
```

Add your two entries (the `name` becomes the `IDS_*` identifier you referenced in
step 4b):

```xml
<data name="IDS_TILE_CUSHION">
    <value>Cushion</value>
</data>
<data name="IDS_DESC_CUSHION">
    <value>A soft block. Bounces entities and prevents fall damage.</value>
</data>
```

`IDS_TILE_*` is the item/block name; `IDS_DESC_*` is the description shown on the
inspect/tooltip screen. The XML is per-platform under each `*Media/loc/`
directory and is compiled into a numeric-id `strings.h`; add the string to the
Windows64 table you're building against. If a locale table is missing the entry
the UI falls back to the missing-string placeholder, so add it before testing.

## Step 7 — texture / icon wiring

Block textures are pre-stitched at build time, not loaded dynamically. The atlas
is defined in `Minecraft.Client/PreStitchedTextureMap.cpp` via the `ADD_ICON`
macro (`PreStitchedTextureMap.cpp:318`):

```cpp
#define ADD_ICON(row, column, name) \
    (texturesByName[name] = new SimpleIcon(name, name, horizRatio*column, vertRatio*row, ...));
```

`loadUVs()` (`PreStitchedTextureMap.cpp:322`) has **two branches**: one for the
items sheet (`iconType != Icon::TYPE_TERRAIN`) and one for the **terrain/block
sheet** (`iconType == Icon::TYPE_TERRAIN`). Blocks go in the terrain branch. Slime
is registered there at `PreStitchedTextureMap.cpp:893`:

```cpp
ADD_ICON(12, 12, L"slime");
```

and barrier at `:1063` (`ADD_ICON(23, 11, L"barrier");`). The `name` string must
match the `setIconName(L"...")` from step 4b. Pick a free `(row, column)` cell in
the terrain grid and add:

```cpp
ADD_ICON(row, col, L"cushion");
```

Then draw your 16×16 (or animated) texture into that cell of the terrain atlas
image. The row/column are the atlas coordinates; the ratios scale them to UV
space. Because the map is hardcoded and stitched once (`loadUVs` early-returns if
already populated), there is no runtime texture loading to wire up — the icon
name is the only link between your `Tile` and its pixels.

## Step 8 — client render hookup (custom shapes only)

If `getRenderShape()` returns `Tile::SHAPE_BLOCK` (0, the default plain cube),
**you can skip this step** — the block renders as a normal opaque/translucent cube
automatically. Barrier does exactly that (it's invisible in play but renders as a
plain shape).

We returned `Tile::SHAPE_SLIME` (41), which routes through slime's dedicated
tessellator. The dispatch is a switch on `getRenderShape()` in
`Minecraft.Client/TileRenderer.cpp` (`:294`):

```cpp
switch (shape)
{
case Tile::SHAPE_BLOCK:  /* ... plain cube ... */         break;
case Tile::SHAPE_SLIME:
    retVal = tesselateSlimeBlockInWorld(tt, x, y, z);      break;  // :352
// ...
}
```

By reusing `SHAPE_SLIME` our cushion gets slime's inner/outer translucent-cube
rendering for free. **If you invent a new shape**, you would:

1. Add a `SHAPE_*` constant in `Tile.h` (they're sequential, `SHAPE_COUNT = 42`
   at `Tile.h:208` — a new one is 42, and bump `SHAPE_COUNT`).
2. Return it from your `getRenderShape()`.
3. Add a `case` to the switch in `TileRenderer.cpp` calling a new
   `tesselateXxxInWorld(...)` you write, following `tesselateSlimeBlockInWorld`
   (`TileRenderer.cpp:6438`) as the model — it calls
   `setFixedTexture(getTexture(Tile::yourBlock))` and emits geometry.

For most blocks, reusing an existing shape (`SHAPE_BLOCK`, `SHAPE_CROSS_TEXTURE`
for plants, `SHAPE_STAIRS`, `SHAPE_SLIME`, etc.) is all you need.

## Step 9 — creative-menu placement

Blocks do **not** appear in the creative inventory automatically. The tabs are
filled by explicit `ITEM(id)` / `ITEM_AUX(id, aux)` macro lists in
`Minecraft.Client/Common/UI/IUIScene_CreativeMenu.cpp`. Slime is in the Building
Blocks group at `IUIScene_CreativeMenu.cpp:144`:

```cpp
DEF(eCreativeInventory_BuildingBlocks)
    ITEM(Tile::stone_Id)
    // ...
    ITEM(Tile::prismarine_Id, ...)
    ITEM(Tile::slime_Id)      // <- slime, line 144
    ITEM(Tile::fence_Id)
    // ...
```

The macros (`:22`) are just:

```cpp
#define ITEM(id)          list->push_back(shared_ptr<ItemInstance>(new ItemInstance(id, 1, 0)));
#define ITEM_AUX(id, aux) list->push_back(shared_ptr<ItemInstance>(new ItemInstance(id, 1, aux)));
```

Add your block to whichever group fits — Building Blocks, Decorations,
`RedstoneAndTransport`, Materials, etc. (the groups are enumerated where `TabSpec`s
are built, `IUIScene_CreativeMenu.cpp:864+`). For the cushion:

```cpp
    ITEM(Tile::cushion_Id)
```

Use `ITEM_AUX` if your block has data-value variants (like `stone` with its
granite/diorite/andesite aux values). A block you don't add here is still
obtainable via `/give` by its item id, but won't show in creative.

## Testing checklist

- [ ] `CushionTile.cpp` and `CushionTile.h` are listed in `cmake/sources/Common.cmake` — the project configures and compiles them.
- [ ] The build links (the `Tile *Tile::cushion = nullptr;` initializer and `const int Tile::cushion_Id;` definition exist, or you'll get an undefined-symbol error).
- [ ] The block places and breaks in-world; mining it drops the correct item.
- [ ] The held/inventory item shows the right name (`IDS_TILE_CUSHION`) — no missing-string placeholder.
- [ ] The inspect/tooltip shows the description (`IDS_DESC_CUSHION`).
- [ ] The texture is correct on all faces (icon name matches; atlas cell drawn).
- [ ] Custom behavior works — jump on it and confirm the bounce + no fall damage.
- [ ] The block appears in the intended creative tab (step 9).
- [ ] `/give @p <id>` works for the item form (block id + 256).
- [ ] Place, save, quit, reload — the block persists (ID is stable in the save).
- [ ] If you gave it a custom render shape, it renders correctly next to air, glass, and identical neighbors (face-culling).

## Where to go next

- [Blocks (Tiles) reference](/slop-docs/world/blocks/) — every `Tile` virtual and the full block registry.
- [Items reference](/slop-docs/world/items/) — the item side of the +256 rule and the special `TileItem` subclasses.
- [Redstone](/slop-docs/world/redstone/) — if your block needs power behavior (slime blocks participate in piston push-chains).
- [Backporting Overview](/slop-docs/backporting/overview/) — if this block is a real later-TU feature you're bringing to TU19.

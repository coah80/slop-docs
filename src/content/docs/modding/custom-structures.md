---
title: Custom Structures
description: A full worked example — add a StructureFeature with pieces to neoLegacy end to end, using OceanMonument (the big one) and the swamp hut (the small one) as real templates.
---

Structures are multi-block builds placed at seed-deterministic grid positions:
villages, strongholds, temples, and — added for neoLegacy in commit
[`720e1a77`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/commit/720e1a77) — the
**ocean monument**. A structure is three cooperating classes plus one registry:

- a **`StructureFeature`** — decides *where* structures go and creates their starts
  (`OceanMonumentFeature.h`/`.cpp`);
- a **`StructureStart`** — a placed instance; owns a list of pieces
  (`OceanMonumentFeature::MonumentStart`);
- one or more **`StructurePiece`** — the actual block-laying rooms/parts
  (`OceanMonumentPieces.*`, or the single `SwamplandHut`);
- **`StructureFeatureIO`** — the string-id registry used for saving/loading
  (`StructureFeatureIO.h`/`.cpp`).

Read [Getting Started](/slop-docs/modding/getting-started/) first, and keep the
[Structures reference](/slop-docs/world/structures/) open. This page uses the
**ocean monument** as the full big-structure template and the **swamp hut**
(`ScatteredFeaturePieces::SwamplandHut`) as the minimal single-piece template.

For the worked example we'll add a small **Shrine**: a single 5×4×5 stone-brick
room, modeled directly on the swamp hut so the moving parts stay visible.

:::note[Changed in v1.1.0b — a second, lighter structure path exists]
This page documents the full `StructureFeature` + `StructureStart` +
`StructurePiece` + `StructureFeatureIO` machinery (as ocean monument uses it),
and that path is unchanged. But v1.1.0b (`origin/main`) added **two new
structures — igloos and fossils — that deliberately *skip* it.**
`IglooFeature` and `FossilFeature` (`IglooFeature.h`/`FossilFeature.h`) derive
from plain **`Feature`** (the worldgen-decoration base from
[Custom World Generation](/slop-docs/modding/custom-worldgen/)), not
`StructureFeature`: they add **no** `EStructureStart`/`EStructurePiece` enum
entries and register **nothing** with `StructureFeatureIO`. They are placed by a
direct `.place(...)` call in `RandomLevelSource::postProcess`
(fossil at `RandomLevelSource.cpp:790`; igloo at `:799` on `origin/main`) and lay
blocks from **hardcoded C++** — `FossilFeature` from static `spineStructures`/
`skullStructures` struct arrays, `IglooFeature` from inline `setTileAndData` calls
— *not* from template XML. (XML files do sit under
`Minecraft.Client/Common/Media/.../Structures/igloo/` and `.../fossils/`, but no
code path reads them.) The TU43 bug-fix commit `680f539f` (formerly `f61aa677`
before upstream force-pushed; upstream tip `3833d0f3`) reworked their placement:
igloos now follow vanilla `MapGenScatteredFeature` spacing (one scattered feature
per 32×32-chunk region, deterministically seeded) instead of the flat `1/48`
per-chunk roll, and `FossilFeature::place` now buries the fossil 15–24 blocks below
the lowest surface over its footprint (floored at y=10) and skips liquids. So for
a **fixed, hardcoded** structure the `Feature` route is now the simpler
precedent; reach for the full `StructureFeature` framework (this page) when you
need seed-deterministic grid placement, multi-piece starts, or save/load of piece
state.
:::

## The two enums you must extend

Structure ids are enums, not strings, in the fast path. Both live in
`StructureFeatureIO.h`:

```cpp
// StructureFeatureIO.h:9
enum EStructureStart {
    eStructureStart_MineShaftStart,
    eStructureStart_VillageStart,
    eStructureStart_NetherBridgeStart,
    eStructureStart_StrongholdStart,
    eStructureStart_ScatteredFeatureStart,
    eStructureStart_Monument,          // <- ocean monument added this
};

// StructureFeatureIO.h:19
enum EStructurePiece {
    ... eStructurePiece_SwamplandHut, ...
    eStructurePiece_OceanMonumentBuilding,   // <- monument piece types
    eStructurePiece_OceanMonumentCore,
    // ... 10 more monument piece kinds ...
    eStructurePiece_OceanMonumentWing,
};
```

**Step 1:** add your start and piece enum entries here. For the Shrine:

```cpp
// in EStructureStart
eStructureStart_ShrineStart,
// in EStructurePiece
eStructurePiece_ShrineRoom,
```

`GetType()` on each class returns one of these enum values — that's how the IO
registry maps an instance to its save-id (`StructureFeatureIO.cpp:42`, `:55`).

## Step 2 — the piece: laying blocks

The piece is where blocks actually get placed, in `postProcess`. The **swamp
hut** (`ScatteredFeaturePieces::SwamplandHut`) is the tightest example — one room,
no children. Its header (`ScatteredFeaturePieces.h:93-112`):

```cpp
class SwamplandHut : public ScatteredFeaturePiece
{
public:
    static StructurePiece *Create() { return new SwamplandHut(); }   // reflection factory
    virtual EStructurePiece GetType() { return eStructurePiece_SwamplandHut; }
private:
    bool spawnedWitch;
public:
    SwamplandHut();                              // no-arg ctor: for load()
    SwamplandHut(Random *random, int west, int north);
protected:
    virtual void addAdditonalSaveData(CompoundTag *tag);   // save extra state
    virtual void readAdditonalSaveData(CompoundTag *tag);  // load extra state
public:
    bool postProcess(Level *level, Random *random, BoundingBox *chunkBB);   // build!
};
```

Every piece derives (directly or indirectly) from `StructurePiece`
(`StructurePiece.h:41`) and must implement the pure virtuals `GetType`
(`:44`), `addAdditonalSaveData` (`:79`), `readAdditonalSaveData` (`:85`), and
`postProcess` (`:89`). The two-constructor pattern is mandatory: the **no-arg
ctor** exists so the reflection factory `Create()` can build a blank instance for
`load()`; the **real ctor** takes placement params. Swamp hut shows both
(`ScatteredFeaturePieces.cpp:645-654`):

```cpp
SwamplandHut::SwamplandHut() { spawnedWitch = false; /* for reflection */ }
SwamplandHut::SwamplandHut(Random *random, int west, int north)
    : ScatteredFeaturePiece(random, west, 64, north, 7, 5, 9)   // x,y,z + 7x5x9 box
{ spawnedWitch = false; }
```

### The block-laying API

Inside `postProcess`, the `StructurePiece` base gives you (from
`StructurePiece.h:107-132`):

| Method | What it does |
|--------|-------------|
| `placeBlock(level, block, data, x, y, z, chunkBB)` | one block at piece-local `(x,y,z)` |
| `generateBox(level, chunkBB, x0,y0,z0, x1,y1,z1, edgeTile,edgeData, fillTile,fillData, skipAir)` | fill a cuboid (edge vs interior) |
| `generateAirBox(...)` | hollow out a cuboid |
| `fillColumnDown(level, tile, data, x, startY, z, chunkBB)` | extend a pillar down to solid ground |
| `getOrientationData(tile, data)` | rotate stair/directional data by piece orientation |
| `getBlock(level, x, y, z, chunkBB)` | safe read (returns 0 out of chunk) |

The ground-anchoring helper `updateAverageGroundHeight(level, chunkBB, offset)` is
**not** on the `StructurePiece` base — it lives on `ScatteredFeaturePiece`
(`ScatteredFeaturePieces.h:25`), which is why the swamp hut (and any piece that
wants it) derives from that subclass rather than `StructurePiece` directly.

Coordinates are **piece-local**; the base translates them to world space via the
piece's `boundingBox` + `orientation`. The swamp hut's `postProcess`
(`ScatteredFeaturePieces.cpp:668-729`) is a clean reference — floor/ceiling walls
via `generateBox`, windows/decorations via `placeBlock`, corner pillars via
`fillColumnDown`:

```cpp
// ScatteredFeaturePieces.cpp:670 — anchor to ground, bail if not ready
if (!updateAverageGroundHeight(level, chunkBB, 0)) return false;

// floor (spruce planks)
generateBox(level, chunkBB, 1,1,1, 5,1,7,
            Tile::planks_Id, TreeTile::SPRUCE_TRUNK,
            Tile::planks_Id, TreeTile::SPRUCE_TRUNK, false);
// ... walls, pillars (Tile::log_Id) ...
placeBlock(level, Tile::crafting_table_Id, 0, 3, 2, 6, chunkBB);
placeBlock(level, Tile::cauldron_Id,        0, 4, 2, 6, chunkBB);
// corner pillars down to ground
for (int z = 2; z <= 7; z += 5)
  for (int x = 1; x <= 5; x += 4)
    fillColumnDown(level, Tile::log_Id, 0, x, -1, z, chunkBB);
```

:::note[Swamp hut is spruce now]
Commit `720e1a77` changed the swamp hut from oak to **spruce** — hence
`TreeTile::SPRUCE_TRUNK` and `Tile::spruce_stairs_Id` throughout
`ScatteredFeaturePieces.cpp:676-719`. Ceiling stairs get rotated with
`getOrientationData(Tile::oak_stairs_Id, StairTile::DIR_NORTH)` etc. before use.
:::

### Our Shrine piece

`Minecraft.World/ShrinePiece.h` — mirror the swamp hut but derive from the base
`StructurePiece` (the Shrine has no scatter-feature framing needs; if you want
the ground-anchoring convenience, derive from `ScatteredFeaturePiece` like the
hut does):

```cpp
// ShrinePiece.h
class ShrinePiece : public StructurePiece
{
public:
    static StructurePiece *Create() { return new ShrinePiece(); }
    virtual EStructurePiece GetType() { return eStructurePiece_ShrineRoom; }
    ShrinePiece();                          // reflection
    ShrinePiece(Random *random, int x, int z);
protected:
    virtual void addAdditonalSaveData(CompoundTag *tag) {}
    virtual void readAdditonalSaveData(CompoundTag *tag) {}
public:
    virtual bool postProcess(Level *level, Random *random, BoundingBox *chunkBB);
};
```

`ShrinePiece.cpp` `postProcess`, following the hut:

```cpp
bool ShrinePiece::postProcess(Level *level, Random *random, BoundingBox *chunkBB)
{
    // walls: 5x4x5 stone-brick shell
    generateBox(level, chunkBB, 0,0,0, 4,3,4,
                Tile::stonebrick_Id, 0, Tile::stonebrick_Id, 0, false);
    // hollow interior
    generateAirBox(level, chunkBB, 1,1,1, 3,3,3);
    // doorway
    placeBlock(level, 0, 0, 2, 1, 0, chunkBB);
    placeBlock(level, 0, 0, 2, 2, 0, chunkBB);
    // anchor corners to ground
    for (int z = 0; z <= 4; z += 4)
      for (int x = 0; x <= 4; x += 4)
        fillColumnDown(level, Tile::stonebrick_Id, 0, x, -1, z, chunkBB);
    return true;
}
```

## Step 3 — the StructureStart: assembling pieces

The `StructureStart` seeds a local RNG and pushes pieces into its `pieces` list,
then computes the overall bounding box. The **monument** shows the pattern
(`OceanMonumentFeature.cpp:128-148`):

```cpp
MonumentStart::MonumentStart(Level* level, Random* random, int chunkX, int chunkZ)
    : StructureStart(chunkX, chunkZ)
{
    // deterministic per-position seed
    random->setSeed(level->getSeed());
    int64_t i = random->nextLong();
    int64_t j = random->nextLong();
    random->setSeed((int64_t)chunkX * i ^ (int64_t)chunkZ * j ^ level->getSeed());

    int startX = chunkX * 16 + 8 - 29;
    int startZ = chunkZ * 16 + 8 - 29;
    int facing = random->nextInt(4) + 2;

    auto *building = new OceanMonumentPieces::MonumentBuilding(random, startX, startZ, facing);
    pieces.push_back(building);        // MonumentBuilding recursively adds its rooms

    calculateBoundingBox();            // union of all piece boxes
}
```

`StructureStart` (`StructureStart.h:7`) owns `list<StructurePiece*> pieces`
(`:10`), the `boundingBox` (`:13`), `calculateBoundingBox()` (`:26`), and
`GetType()` (`:42`). The big monument recursively grows its room graph inside
`MonumentBuilding` (via each piece's `addChildren`, `StructurePiece.h:88`); a
small structure just pushes its one piece. For the Shrine, one piece:

```cpp
ShrineStart::ShrineStart(Level* level, Random* random, int chunkX, int chunkZ)
    : StructureStart(chunkX, chunkZ)
{
    random->setSeed((int64_t)chunkX * 341873128712LL
                  ^ (int64_t)chunkZ * 132897987541LL ^ level->getSeed());
    int sx = chunkX * 16 + 2;
    int sz = chunkZ * 16 + 2;
    pieces.push_back(new ShrinePiece(random, sx, sz));
    calculateBoundingBox();
}
```

Declare `ShrineStart` as a nested class of your feature (as
`OceanMonumentFeature::MonumentStart` is, `OceanMonumentFeature.h:41-52`), with
the `Create()` factory and `GetType()`:

```cpp
class ShrineStart : public StructureStart {
public:
    ShrineStart() {}
    ShrineStart(Level* level, Random* random, int chunkX, int chunkZ);
    static StructureStart* Create() { return new ShrineStart(); }
    virtual EStructureStart GetType() override { return eStructureStart_ShrineStart; }
};
```

## Step 4 — the StructureFeature: placement rules

The feature decides which chunks host a structure and creates the start. It
implements two pure virtuals from `StructureFeature` (`StructureFeature.h:69`,
`:81`): `isFeatureChunk` and `createStructureStart`. Monument
(`OceanMonumentFeature.cpp:71-124`):

```cpp
bool OceanMonumentFeature::isFeatureChunk(int x, int z, bool bIsSuperflat)
{
    // grid: spacing=32, separation=5  (set in _init, :12-13)
    int k = ...; int l = ...;                 // snap to grid cell
    int64_t seed = (int64_t)k * 341873128712LL + (int64_t)l * 132897987541LL
                 + level->getSeed() + 10387313LL;
    Random random(seed);
    k += (random.nextInt(spacing - separation) + random.nextInt(spacing - separation)) / 2;
    l += ...;
    if (i == k && j == l) {                   // this chunk is the chosen one
        Biome* center = level->getBiomeSource()->getBiome(i*16+8, j*16+8);
        if (center == Biome::deepOcean &&
            level->getBiomeSource()->containsOnly(i*16+8, j*16+8, 29, surrounding))
            return true;                      // + biome validation
    }
    return false;
}

StructureStart* OceanMonumentFeature::createStructureStart(int x, int z)
{
    return new MonumentStart(level, random, x, z);
}
```

`spacing`/`separation` (`OceanMonumentFeature.cpp:12-13`) define the grid — copy
the seed formula exactly (`* 341873128712LL`, `* 132897987541LL`, `+ seed`) so
placement is reproducible. `getFeatureName()` returns the save-id string
(`:25`, `L"Monument"`). Add the biome check that suits your structure.

`Minecraft.World/ShrineFeature.h`:

```cpp
class ShrineFeature : public StructureFeature
{
    int spacing = 24, separation = 8;
public:
    ShrineFeature() {}
    virtual std::wstring getFeatureName() override { return L"Shrine"; }
    void setLevel(Level* lvl) { this->level = lvl; }
    class ShrineStart : public StructureStart { /* as Step 3 */ };
protected:
    virtual bool isFeatureChunk(int x, int z, bool bIsSuperflat=false) override;
    virtual StructureStart* createStructureStart(int x, int z) override;
};
```

## Step 5 — register with `StructureFeatureIO`

Saving/loading maps enum → save-id string. Registration happens in
`StructureFeatureIO::staticCtor` (`StructureFeatureIO.cpp:23-38`):

```cpp
// StructureFeatureIO.cpp:25 — start ids
setStartId(eStructureStart_MineShaftStart, MineShaftStart::Create, L"Mineshaft");
setStartId(eStructureStart_ScatteredFeatureStart, RandomScatteredLargeFeature::ScatteredFeatureStart::Create, L"Temple");
setStartId(eStructureStart_Monument, OceanMonumentFeature::MonumentStart::Create, L"Monument");

OceanMonumentPieces::loadStatic();   // registers all the monument piece ids
```

Piece ids are registered inside each piece module's `loadStatic()`. The swamp
hut (`ScatteredFeaturePieces.cpp:14-16`):

```cpp
StructureFeatureIO::setPieceId(eStructurePiece_SwamplandHut, SwamplandHut::Create, L"TeSH");
```

Monument pieces (`OceanMonumentPieces.cpp:36-47`) — twelve entries like
`setPieceId(eStructurePiece_OceanMonumentBuilding, MonumentBuilding::Create, L"OMB")`.

**Add for the Shrine**, in `StructureFeatureIO::staticCtor`:

```cpp
setStartId(eStructureStart_ShrineStart, ShrineFeature::ShrineStart::Create, L"Shrine");
setPieceId(eStructurePiece_ShrineRoom, ShrinePiece::Create, L"ShR");
```

The short strings (`L"OMB"`, `L"TeSH"`, `L"ShR"`) are the NBT `id` written per
piece; `loadStaticStart`/`loadStaticPiece` (`StructureFeatureIO.cpp:66-106`)
look them up on load. **Pick a unique string** — a collision silently overwrites
an existing structure's loader.

## Step 6 — hook the feature into the level source

`StructureFeatureIO` only handles save/load. To actually *generate*, the feature
must be constructed, applied, and post-processed by `RandomLevelSource`. Monument
is wired at four points:

```cpp
// RandomLevelSource.cpp:43  — construct in the ctor
oceanMonument = new OceanMonumentFeature();
oceanMonument->setLevel(level);
oceanMonument->prescanNearby(24);          // :48 (monument-specific pre-scan)

// RandomLevelSource.cpp:438 — carve/emit during chunk build
oceanMonument->apply(this, level, xOffs, zOffs, blocks);

// RandomLevelSource.cpp:741 — run piece postProcess after neighbours exist
oceanMonument->postProcess(level, pprandom, xt, zt);

// destructor :82 — delete oceanMonument;
```

Both `apply` and `postProcess` are guarded by `if (generateStructures)`
(`:432`, `:735`) so the "generate structures" world option disables them. Add a
member `ShrineFeature *shrine;` to `RandomLevelSource.h` (mirroring
`OceanMonumentFeature *oceanMonument;`, `:72`), construct it in the ctor with
`setLevel(level)`, add it to the `apply` and `postProcess` blocks, and delete it
in the destructor. The `prescanNearby` call is monument-specific — skip it.

## Loot chests (changed in v1.1.0b)

The Shrine and swamp-hut examples above place no chest, so they need no loot
wiring. If your structure *does* drop a populated chest, note that **v1.1.0b
replaced the old hardcoded loot path**. At the audited snapshot, scattered
features filled chests from static `WeighedTreasure` arrays
(`ScatteredFeaturePieces.cpp` `DesertPyramidPiece::treasureItems` /
`JunglePyramidPiece::treasureItems`). On `origin/main` those arrays are gone and
chests are filled through the new **`LootTableManager`**
(`LootTableManager.h`/`.cpp`, added whole in v1.1.0b): e.g. the desert pyramid now
calls `LootTableManager::Get().ResolveDrops("chests/desert_pyramid", …)` and the
igloo `ResolveDrops("chests/igloo_chest", …)` (`IglooFeature.cpp:148`), feeding
the result to `WeighedTreasure::addChestItems`. Loot table ids are XML files under
`.../Structures/loot_tables/chests/`. For a new chest-bearing structure on v1.1.0b,
add a loot-table XML and resolve it that way rather than hand-rolling a
`WeighedTreasure` array.

## Localization and textures

Structures place only *existing* blocks, so there is normally no new texture
work. If your structure needs a new block (a custom altar, say), add that block
first via [Adding Blocks](/slop-docs/modding/adding-blocks/). Structure names
that surface in UI (e.g. a locator/map) come from the client string tables, same
as biome names — see [Adding Biomes → Localization](/slop-docs/modding/adding-biomes/#localization).

## Testing checklist

- [ ] Both enums (`EStructureStart`, `EStructurePiece`) got new entries; `GetType()` returns them.
- [ ] Every piece has a **no-arg ctor** (for `Create()`) and a **placement ctor**.
- [ ] `setStartId` + `setPieceId` registered in `StructureFeatureIO::staticCtor` with **unique** save-id strings.
- [ ] The feature is constructed, `apply`ed, and `postProcess`ed in `RandomLevelSource`, all under `if (generateStructures)`.
- [ ] `isFeatureChunk` uses the seed-deterministic grid formula (`*341873128712LL`, `*132897987541LL`, `+ seed`) — placement is reproducible from the seed.
- [ ] Generate a fresh world with "generate structures" on; find the structure (debug locator or fly the grid).
- [ ] Regenerate the same seed — the structure appears in the same place.
- [ ] Save and reload with the structure loaded and unloaded — pieces round-trip (correct save-id strings; `postProcess` doesn't double-place).
- [ ] Biome/placement validation actually restricts placement (Shrine only where you allow it).
- [ ] New `.cpp` files (`ShrineFeature.cpp`, `ShrinePiece.cpp`) added to `Minecraft.World/cmake/sources/Common.cmake` (the source list where `FossilFeature.cpp`/`OceanMonumentFeature.cpp` are registered).

## Could not verify

- `OceanMonumentPieces.cpp` is 1660 lines; this page cites its `loadStatic`
  registration block (`:34-47`) and the monument-start flow, not every room's
  `postProcess`. The swamp hut is quoted in full as the small template.
- `RandomLevelSource::apply`/`postProcess` internals beyond the monument call
  sites (`:438`, `:741`) were not exhaustively read; the four wiring points are
  confirmed.

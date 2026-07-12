---
title: Structures & Features
description: The Feature and StructureFeature systems — ~40 vegetation/terrain features, the six registered structure sets, and the new Ocean Monument (1657-line OceanMonumentPieces) plus the spruce swamp hut and melon/double-plant features.
---

neoLegacy splits world decoration into two layers:

- **`Feature`** — a small placer that stamps blocks at a position: a tree, a
  flower patch, an ore vein, a lake, a dungeon. Biomes' decorators run dozens of
  these per chunk.
- **`StructureFeature`** — a large, grid-scheduled, multi-piece structure with its
  own bounding boxes and save id: village, stronghold, mineshaft, Nether fortress,
  temple/witch-hut, and the new Ocean Monument.

Both mirror the decompiled Java LCE classes. This page covers the two hierarchies,
the structure registry, and the neoLegacy additions.

Files: `Feature.h`, `StructureFeature.h`, `StructurePiece.h`, `StructureStart.h`,
`StructureFeatureIO.h/.cpp`, `LargeFeature.h`, plus ~54 `*Feature.h` headers and
the piece files (`VillagePieces`, `StrongholdPieces`, `MineShaftPieces`,
`NetherBridgePieces`, `ScatteredFeaturePieces`, `OceanMonumentPieces`).

## Feature — the base placer

`class Feature` (`Feature.h:5`). The whole contract is small:

| Method | Purpose |
|--------|---------|
| `place(level, random, x, y, z)` | pure-virtual — stamp the feature; return success |
| `placeWithIndex(...)` | optional indexed variant (default `false`) |
| `applyFeature(level, random, xChunk, zChunk)` | driver called during decoration |
| `placeBlock(level, x, y, z, tile[, data])` | protected helper (optionally schedules a tile update) |

There are **40 direct `: public Feature` subclasses** (54 `*Feature.h` headers in
total, once base/large/structure headers are counted). They group as:

### Trees

| Feature | Produces |
|---------|----------|
| `AbstractTreeFeature` | base for all trees |
| `TreeFeature` / `BasicTree` | oak (the default when a biome has no special tree) |
| `BirchFeature` | birch |
| `PineFeature` / `SpruceFeature` | conifers |
| `SwampTreeFeature` | swamp oak with vines |
| `RoofTreeFeature` | dark-oak "roof" tree (2×2) |
| `SavannaTreeFeature` | acacia (extends `AbstractTreeFeature`) |
| `MegaTreeFeature` / `MegaPineTreeFeature` | 2×2 jungle / mega-spruce |
| `GroundBushFeature` | jungle shrub |
| `HugeMushroomFeature` | giant red/brown mushroom |

### Vegetation

| Feature | Produces |
|---------|----------|
| `FlowerFeature` | single flowers |
| `DoublePlantFeature` | **sunflowers / tall flowers / large ferns** (neoLegacy) |
| `TallGrassFeature` | grass / fern |
| `DeadBushFeature` | dead bushes |
| `ReedsFeature` | sugar cane |
| `PumpkinFeature` | pumpkin patches |
| `MelonFeature` | **melons** (neoLegacy) |
| `CactusFeature` | cacti |
| `WaterlilyFeature` | lily pads |
| `VinesFeature` | vines |

### Terrain & cave

| Feature | Produces |
|---------|----------|
| `OreFeature` | ore veins (incl. granite/diorite/andesite variants) |
| `LakeFeature` | water/lava pockets |
| `SpringFeature` | flowing-liquid springs |
| `SandFeature` / `ClayFeature` | disks in water |
| `BlockBlobFeature` | mossy / mesa boulders |
| `CaveFeature` / `LargeCaveFeature` | carving passes |
| `CanyonFeature` | ravines |
| `MonsterRoomFeature` / `DungeonFeature` | dungeon rooms with spawners |
| `IceSpikeFeature` / `SpikeFeature` | ice spikes / end spike |
| `DesertWellFeature` | desert wells |
| `LightGemFeature` | Nether glowstone clusters |
| `BonusChestFeature` | spawn bonus chest |

### Nether / End

`HellFireFeature`, `HellSpringFeature`, `HellPortalFeature` (Nether decoration and
portal generation), `EndPodiumFeature` (the exit portal + dragon egg podium),
`SpikeFeature` (End obsidian spikes).

### DoublePlantFeature — sunflowers

`class DoublePlantFeature : public Feature` (`DoublePlantFeature.h:7`) places the
two-tall plants introduced with the mutated biomes. `setPlantType(int)` chooses the
variant; the sunflower type is `TallGrass2::SUNFLOWER = 0` (`TallGrass2.h:8`), and
placement validates against `Tile::double_plant_Id`
(`DoublePlantFeature.cpp:33`). Every `Biome` owns a shared `DOUBLE_PLANT_GENERATOR`
instance (`Biome.h:117`), and the decorator has a `doublePlantCount`.

### MelonFeature

`class MelonFeature : public Feature` (`MelonFeature.h:5`) was added in commit
`aaae8b01`. It makes 64 attempts to place a melon block on grass in the jungle /
savanna decorators:

```cpp
if (level->isEmptyTile(x2, y2, z2) && level->getTile(x2, y2 - 1, z2) == Tile::grass_Id)
    if (Tile::melon->mayPlace(level, x2, y2, z2))
        level->setTileAndData(x2, y2, z2, Tile::melon_block_Id, 0, Tile::UPDATE_CLIENTS);
// MelonFeature.cpp:14
```

## StructureFeature — large structures

`class StructureFeature : public LargeFeature` (`StructureFeature.h:9`). A structure
feature is scheduled on a grid: `isFeatureChunk` decides which chunks seed a
structure, `createStructureStart` builds a `StructureStart` (a list of
`StructurePiece`s with bounding boxes), and `postProcess` carves the pieces that
intersect the chunk being generated. Structures cache their starts in
`cachedStructures` (`unordered_map<int64_t, StructureStart*>`). The 4J
`EFeatureTypes` enum (`StructureFeature.h:14`) maps to the world-gen game-rule XML:
`eFeature_Mineshaft`, `eFeature_NetherBridge`, `eFeature_Temples`,
`eFeature_Stronghold`, `eFeature_Village`.

Structure generators are owned by `RandomLevelSource` as members
(`RandomLevelSource.cpp:37-43`): `strongholdFeature`, `villageFeature`,
`mineShaftFeature`, `scatteredFeature`, `canyonFeature`, `caveFeature`, and the new
`oceanMonument`. Each runs during `postProcess` for the chunk.

### The structure registry — StructureFeatureIO

`StructureFeatureIO::staticCtor()` (`StructureFeatureIO.cpp:23`) maps every
structure start and piece type to a save-id string and a factory function, so
structures survive save/load. The **six registered starts**:

| `EStructureStart` | Save id | Feature |
|-------------------|---------|---------|
| `eStructureStart_MineShaftStart` | `L"Mineshaft"` | `MineShaftFeature` |
| `eStructureStart_VillageStart` | `L"Village"` | `VillageFeature` |
| `eStructureStart_NetherBridgeStart` | `L"Fortress"` | `NetherBridgeFeature` |
| `eStructureStart_StrongholdStart` | `L"Stronghold"` | `StrongholdFeature` |
| `eStructureStart_ScatteredFeatureStart` | `L"Temple"` | `RandomScatteredLargeFeature` (desert/jungle temple + witch hut) |
| `eStructureStart_Monument` | `L"Monument"` | **`OceanMonumentFeature`** (neoLegacy) |

After the start table, each piece set loads its pieces:
`OceanMonumentPieces::loadStatic()`, `MineShaftPieces::loadStatic()`,
`VillagePieces::loadStatic()`, `NetherBridgePieces::loadStatic()`,
`StrongholdPieces::loadStatic()`, `ScatteredFeaturePieces::loadStatic()`. Villages
also run a nested `Smithy::staticCtor()`. The `Monument` entry (both the start and
the `OceanMonumentPieces::loadStatic()` call) is new in commit `720e1a77`.

> **Changed in v1.1.0b:** two commits move past the `47e5cba3` snapshot documented
> here. (1) `54528fac feat: loot tables (#43)` reworks **chest population** for the
> structure pieces above — `MineShaftPieces`, `NetherBridgePieces`, `StrongholdPieces`,
> `ScatteredFeaturePieces` (temples), `MonsterRoomFeature` (dungeons), and
> `BonusChestFeature` now fill their chests from the data-driven `LootTableManager`
> (XML tables under `Common/Media/MediaWindows64/Structures/loot_tables/chests/`)
> rather than the hard-coded `WeighedTreasure` lists, so the piece geometry described
> here is unchanged but what lands in the chests is now table-driven. (2)
> `a4c746be TU43 Structures, bug fixes & minor changes` adds **Igloo and Fossil**
> generation. See the [Changelog v1.1.0b section](/slop-docs/features/changelog/#v110b-current).

## Ocean Monument (new)

The Ocean Monument is the flagship neoLegacy structure addition
(`OceanMonumentFeature.*`, `OceanMonumentPieces.*`; the piece file is **1657
lines**). It is a direct port of Java's `StructureOceanMonument`.

### Placement

`OceanMonumentFeature::_init()` (`OceanMonumentFeature.cpp:10`):

```cpp
spacing   = 32;
separation = 5;
monumentEnemies.push_back(new Biome::MobSpawnerData(eTYPE_GUARDIAN, 1, 2, 4));
```

Monuments sit on a 32-chunk grid with 5-chunk separation. `isFeatureChunk`
(`OceanMonumentFeature.cpp:71`) requires the center chunk to be **`Biome::deepOcean`**
(id 24) and the surrounding cells to be ocean/deep-ocean/river biomes — so
monuments only generate in large ocean basins. The feature carries its own spawn
list (`getMonumentEnemies()` → **Guardians**, `eTYPE_GUARDIAN`); the chunk source
returns it for spawning when a position is inside the monument
(`RandomLevelSource.cpp:855`).

### Pieces

`OceanMonumentPieces` (`OceanMonumentPieces.h:6`) builds the monument from a graph
of room definitions. The `RoomDefinition` struct (`OceanMonumentPieces.h:19`)
models each cell's six neighbours, openings, and reachability — the same
`func_175957_a`-style connectivity solve as Java (the original obfuscated field
names are preserved in comments). The piece classes, all `: public Piece`:

| Piece class | `EStructurePiece` |
|-------------|-------------------|
| `MonumentBuilding` | `eStructurePiece_OceanMonumentBuilding` |
| `CoreRoom` | `eStructurePiece_OceanMonumentCore` |
| `SimpleRoom` / `SimpleTopRoom` | `eStructurePiece_OceanMonumentSimple` / `SimpleTop` |
| `DoubleXRoom` / `DoubleXYRoom` | `eStructurePiece_OceanMonumentDoubleX` / `DoubleXY` |
| `DoubleYRoom` / `DoubleYZRoom` | `eStructurePiece_OceanMonumentDoubleY` / `DoubleYZ` |
| `DoubleZRoom` | `eStructurePiece_OceanMonumentDoubleZ` |
| `EntryRoom` | `eStructurePiece_OceanMonumentEntry` |
| `Penthouse` | `eStructurePiece_OceanMonumentPenthouse` |
| `WingRoom` | `eStructurePiece_OceanMonumentWing` |

The monument builds from prismarine / prismarine bricks / dark prismarine and sea
lanterns — see [Blocks / Tiles](/slop-docs/world/blocks/) for those tiles.

## Swamp hut → spruce (720e1a77)

The witch hut (`ScatteredFeaturePieces::SwamplandHut`) was corrected to use spruce
in commit `720e1a77`. The floor, ceiling, walls and pillars switched from
`TreeTile::DARK_TRUNK` to `TreeTile::SPRUCE_TRUNK`, and the current tree uses
spruce stairs for the roof overhang:

```cpp
generateBox(level, chunkBB, 1, 1, 1, 5, 1, 7,
    Tile::planks_Id, TreeTile::SPRUCE_TRUNK, ...);   // ScatteredFeaturePieces.cpp:676
...
generateBox(level, chunkBB, 0, 4, 1, 6, 4, 1,
    Tile::spruce_stairs_Id, south, ...);             // ScatteredFeaturePieces.cpp:716
```

This matches Java LCE's spruce-plank witch hut (the pre-fix code stamped dark-oak).

## neoLegacy delta vs vanilla TU19

- **Ocean Monument** — entire `OceanMonumentFeature` + `OceanMonumentPieces`
  structure, its `Monument` save id, and Guardian spawns.
- **`MelonFeature`** — melon generation in jungle/savanna.
- **`DoublePlantFeature`** — sunflowers, lilac/rose bush/peony, large ferns for the
  mutated biomes.
- **Spruce witch hut** — corrected wood type.
- Ore decorators gained **granite/diorite/andesite** variant features.

## Related pages

- [World Generation](/slop-docs/world/worldgen/) — where features and structures run in the pipeline
- [Biomes](/slop-docs/world/biomes/) — the decorators that place features
- [Blocks / Tiles](/slop-docs/world/blocks/) — prismarine, sea lantern, melon, double-plant tiles

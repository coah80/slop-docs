---
title: Tile Class Index
description: Every Tile subclass in Minecraft.World — its header, the block IDs it is constructed with, and a one-line purpose, grouped by family.
---

The block system in neoLegacy is a direct C++ port of the decompiled Java LCE
`net.minecraft.world.level.block` package. Every block is a **`Tile`** (the rename to
`Block` never happened here). There is one flyweight `Tile` instance per block ID, held
in `Tile::tiles` and constructed inside `Tile::staticCtor()`
(**`Minecraft.World/Tile.cpp:359`**).

This page indexes the **classes** — every `Tile` subclass, its header, the numeric block
IDs it is instantiated with in `staticCtor`, and what it is for. It is the class-oriented
companion to the ID-ordered [Block (Tile) ID Registry](/slop-docs/reference/block-ids/)
and the prose [Blocks &amp; Tiles](/slop-docs/world/blocks/) page. For the redstone tiles
see [Redstone](/slop-docs/world/redstone/); for block-entity-backed tiles see
[Block Entities](/slop-docs/world/tile-entities/); for containers see
[Containers](/slop-docs/world/containers/).

There are **~184 tile headers and ~181 `Tile` subclasses**. Every ID below is read from
the `new XTile(id)` calls in `Tile::staticCtor` (`Tile.cpp:378-609`); IDs supplied through
named `_Id` constants (slabs, beetroot, frosted ice, red sandstone, grass path,
double-plant) are resolved from `Tile.h`. A **`—`** in the IDs column marks an abstract
base or interface that is never instantiated directly, or a class registered elsewhere.

:::note[Changed in v1.1.0b]
v1.1.0b adds seven registrations and three new subclasses. New IDs (from `Tile.h`):
`end_bricks` (206), `standing_banner` (176) / `wall_banner` (177), `magma` (213),
`nether_wart_block` (214), `red_nether_brick` (215), `bone_block` (216). `end_bricks`,
`nether_wart_block` and `red_nether_brick` reuse the generic `Tile` parent (no new class),
while `MagmaTile`, `BoneBlockTile` and `BannerTile` are new subclasses (`BannerTile` is
registered twice, standing + wall, and is backed by a `BannerTileEntity`). This lifts the
tallies to roughly **~187 headers / ~184 subclasses**. See the family tables below for the
individual entries.
:::

## How a Tile is registered

`Tile::staticCtor` sets the shared sound types first (`SOUND_STONE`, `SOUND_WOOD`,
`SOUND_SLIME`, … `Tile.cpp:366`+) then builds each block with a fluent builder whose
integer argument **is** the block ID:

```cpp
Tile::stone = (new StoneTile(1))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_structblock, Item::eMaterial_stone)
    ->setDestroyTime(1.5f)->setExplodeable(10)
    ->setSoundType(Tile::SOUND_STONE)->setIconName(L"stone")
    ->setDescriptionId(IDS_TILE_STONE)->setUseDescriptionId(IDS_DESC_STONE);
```
(`Tile.cpp:378`)

The constructor stores the ID into `Tile::tiles[id]`. Many blocks reuse a generic parent
directly — e.g. cobblestone is `new Tile(4, Material::stone)` and gold ore, iron ore,
coal ore, lapis ore, diamond ore, emerald ore, nether-quartz ore all share
`OreTile`. That is why the count of *classes* (181) is far below the count of *IDs*.

To add a block of your own, subclass the closest family below, add a `Tile::yourField`
static, and register it in `staticCtor` — full walkthrough in
[Blocks &amp; Tiles → Adding a block](/slop-docs/world/blocks/).

---

## Base &amp; abstract classes

These are the roots of the hierarchy. Most are never placed in the world themselves; they
factor out shared behaviour (shape, render class, redstone, entity backing).

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `Tile` | `Tile.h` | 4, 7, 22, 45, 48, 112, 121, 172, 173 | Base block. Also used directly for cobblestone (4), bedrock/`unbreakable` (7), lapis/red-brick/moss-cobble/nether-brick/end-stone blocks, hardened clay (172), coal block (173). |
| `TransparentTile` | `TransparentTile.h` | — | Base for non-solid render tiles; parent of `LeafTile`. |
| `HalfTransparentTile` | `HalfTransparentTile.h` | — | Glass/ice/coral style: renders faces against non-same neighbours. |
| `HeavyTile` | `HeavyTile.h` | — | Gravity-affected base (gravel, anvil). |
| `DirectionalTile` | `DirectionalTile.h` | — | Base for tiles with a facing (bed, diode, cocoa, pumpkin, fence gate). |
| `BaseEntityTile` | `BaseEntityTile.h` | — | Base for every tile backed by a [TileEntity](/slop-docs/world/tile-entities/). Multiply inherits `Tile` + `EntityTile`. |
| `EntityTile` | `EntityTile.h` | — | Pure interface: "this tile owns a TileEntity". Not a `Tile`. |
| `RotatedPillarTile` | `RotatedPillarTile.h` | — | Axis-oriented pillar base (logs, hay). |
| `MetalTile` | `MetalTile.h` | 41, 42, 57, 133 | Solid metal/mineral blocks: gold, iron, diamond, emerald. |
| `LiquidTile` | `LiquidTile.h` | — | Fluid base; split into dynamic/static below. |

---

## Terrain &amp; natural

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `StoneTile` | `StoneTile.h` | 1 | Stone; drops cobblestone unless silk-touched. |
| `GrassTile` | `GrassTile.h` | 2 | Grass block; spreads to dirt, snow overlay. |
| `DirtTile` | `DirtTile.h` | 3 | Dirt (incl. coarse/podzol variants by data). |
| `GrassPathTile` | `GrassPathTile.h` | 208 (`grass_path_Id`) | Grass path (TU31). |
| `MycelTile` | `MycelTile.h` | 110 | Mycelium; spreads on mushroom islands. |
| `SandTile` | `SandTile.h` | 12 | Sand (falls); red-sand by data. Extends `HeavyTile`. |
| `GravelTile` | `GravelTile.h` | 13 | Gravel; falls, drops flint. Extends `HeavyTile`. |
| `ClayTile` | `ClayTile.h` | 82 | Clay block; drops clay balls. |
| `SandStoneTile` | `SandStoneTile.h` | 24 | Sandstone (plain/chiselled/smooth by data). |
| `RedSandStoneTile` | `RedSandStoneTile.h` | 179 (`red_sandstone_Id`) | Red sandstone (TU31). |
| `SmoothStoneBrickTile` | `SmoothStoneBrickTile.h` | 98 | Stone bricks (normal/mossy/cracked/chiselled). |
| `StoneMonsterTile` | `StoneMonsterTile.h` | 97 | Monster egg / infested stone (silverfish). |
| `OreTile` | `OreTile.h` | 14, 15, 16, 21, 56, 129, 153 | Ore blocks: gold, iron, coal, lapis, diamond, emerald, nether-quartz. |
| `RedStoneOreTile` | `RedStoneOreTile.h` | 73, 74 | Redstone ore (dark 73 / glowing-lit 74). |
| `ObsidianTile` | `ObsidianTile.h` | 49 | Obsidian; high destroy time, blast-resistant. |
| `SnowTile` | `SnowTile.h` | 80 | Snow block. |
| `TopSnowTile` | `TopSnowTile.h` | 78 | Snow layer (thin top-snow). |
| `IceTile` | `IceTile.h` | 79 | Ice; melts to water. Extends `HalfTransparentTile`. |
| `PackedIceTile` | `PackedIceTile.h` | 174 | Packed ice (does not melt). |
| `FrostedIceTile` | `FrostedIceTile.h` | 212 (`frosted_ice_Id`) | Frosted ice — forms under the Frost Walker [enchantment](/slop-docs/world/enchantments/); ticks back to water. Extends `IceTile`. |
| `Sponge` | `Sponge.h` | 19 | Sponge (wet/dry by data). |

## Nether &amp; End

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `NetherrackTile` | `NetherrackTile.h` | 87 | Netherrack; burns indefinitely. |
| `HellSandTile` | `HellSandTile.h` | — | Soul-sand style slow-block base (see `SoulSandTile`). |
| `SoulSandTile` | `SoulSandTile.h` | 88 | Soul sand; slows entities, grows nether wart. |
| `HellStoneTile` | `HellStoneTile.h` | — | Glowstone/netherrack luminous base. |
| `Glowstonetile` | `GlowstoneTile.h` | 89 | Glowstone (note the lowercase `t` in the class name). |
| `LightGemTile` | `LightGemTile.h` | — | Glow/light-gem tile variant. |
| `PortalTile` | `PortalTile.h` | 90 | Nether portal block. Extends `HalfTransparentTile`. |
| `TheEndPortal` | `TheEndPortal.h` | 119 | End portal block (`BaseEntityTile`). |
| `TheEndPortalFrameTile` | `TheEndPortalFrameTile.h` | 120 | End portal frame; accepts eyes of ender. |
| `EggTile` | `EggTile.h` | 122 | Dragon egg. |
| `Tile` (end bricks) | `Tile.h` | 206 (`end_bricks_Id`) | End stone bricks — generic `Tile`, `Material::stone` (v1.1.0b). |
| `MagmaTile` | `MagmaTile.h` | 213 (`magma_Id`) | Magma block; damages entities standing on it (v1.1.0b). |
| `Tile` (nether wart block) | `Tile.h` | 214 (`nether_wart_block_Id`) | Nether wart block — generic `Tile`, `Material::grass` (v1.1.0b). |
| `Tile` (red nether brick) | `Tile.h` | 215 (`red_nether_brick_Id`) | Red nether brick — generic `Tile`, `Material::stone` (v1.1.0b). |
| `BoneBlockTile` | `BoneBlockTile.h` | 216 (`bone_block_Id`) | Bone block; axis-oriented pillar. Extends `HayBlockTile` (v1.1.0b). |

## Liquids

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `LiquidTileDynamic` | `LiquidTileDynamic.h` | 8 (water), 10 (lava) | Flowing liquid source/spread. |
| `LiquidTileStatic` | `LiquidTileStatic.h` | 9 (calm water), 11 (calm lava) | Settled liquid (no re-flow). |

---

## Plants, crops &amp; foliage

The small-plant family descends from `Bush` (a `Tile`). Crops descend from `CropTile`
(a `Bush`).

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `Bush` | `Bush.h` | 37 | Bush base; used directly for the yellow `flower` (dandelion). |
| `Rose` | `Rose.h` | 38 | Rose / poppy and the other small flowers by data. |
| `Sapling` | `Sapling.h` | 6 | Tree sapling (all wood types by data); grows a tree feature. |
| `Sapling2` | `Sapling.h` (commented) | — | Second sapling set (`new Sapling2(199)` is commented out at `Tile.cpp:384`). |
| `TallGrass` | `TallGrass.h` | 31 | Tall grass / fern (single-height). |
| `TallGrass2` | `TallGrass2.h` | 175 (`double_plant_Id`) | Double plants (sunflower, tall grass, large fern, double flowers) — neoLegacy/TU31. |
| `DeadBushTile` | `DeadBushTile.h` | 32 | Dead bush. |
| `Mushroom` | `Mushroom.h` | 39, 40 | Small mushrooms: brown (39), red (40). |
| `HugeMushroomTile` | `HugeMushroomTile.h` | 99, 100 | Huge mushroom blocks: brown (99), red (100). |
| `CactusTile` | `CactusTile.h` | 81 | Cactus; damages, grows upward. |
| `ReedTile` | `ReedTile.h` | 83 | Sugar cane. |
| `VineTile` | `VineTile.h` | 106 | Vines; climbable, spreads. |
| `WaterlilyTile` | `WaterLilyTile.h` | 111 | Lily pad. |
| `FlowerPotTile` | `FlowerPotTile.h` | 140 | Flower pot; holds a plant by data. |
| `CropTile` | `CropTile.h` | 59 | Crop base; used directly for `wheat`. Extends `Bush`. |
| `CarrotTile` | `CarrotTile.h` | 141 | Carrots. Extends `CropTile`. |
| `PotatoTile` | `PotatoTile.h` | 142 | Potatoes. Extends `CropTile`. |
| `BeetrootTile` | `BeetrootTile.h` | 207 (`beetroots_Id`) | Beetroots (neoLegacy/TU31). Extends `CropTile`. |
| `StemTile` | `StemTile.h` | 104, 105 | Pumpkin stem (104), melon stem (105). Extends `Bush`. |
| `NetherWartTile` | `NetherWartTile.h` | 115 | Nether wart (`Tile::netherStalk`). Extends `Bush`. |
| `NetherStalkTile` | `NetherStalkTile.h` | — | Alternate nether-wart class (present; id 115 uses `NetherWartTile`). |
| `FarmTile` | `FarmTile.h` | 60 | Farmland; hydrates, tramples. |
| `MelonTile` | `MelonTile.h` | 103 | Melon block. |
| `PumpkinTile` | `PumpkinTile.h` | 86, 91 | Pumpkin (86), jack-o-lantern / lit pumpkin (91). Extends `DirectionalTile`. |
| `CocoaTile` | `CocoaTile.h` | 127 | Cocoa pods. Extends `DirectionalTile`. |

## Trees &amp; wood

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `WoodTile` | `WoodTile.h` | 5 | Wooden planks (oak/spruce/birch/jungle by data). |
| `TreeTile` | `TreeTile.h` | 17 | Log set 1 (oak/spruce/birch/jungle). Extends `RotatedPillarTile`. |
| `TreeTile2` | `TreeTile2.h` | 162 | Log set 2 (acacia/dark-oak) — `log2`, TU25. |
| `LeafTile` | `LeafTile.h` | 18 | Leaves set 1; decays. Extends `TransparentTile`. |
| `LeafTile2` | `LeafTile2.h` | 161 | Leaves set 2 (acacia/dark-oak) — `leaves2`, TU25. Extends `LeafTile`. |
| `HayBlockTile` | `HayBlockTile.h` | 170 | Hay bale (TU25). Extends `RotatedPillarTile`. |
| `BookshelfTile` | `BookshelfTile.h` | 47 | Bookshelf; boosts enchanting. |
| `LadderTile` | `LadderTile.h` | 65 | Ladder; climbable. |

---

## Slabs &amp; stairs

Slabs come in paired half/full classes; the "double" (full) block ID and the "half" block
ID are separate constants in `Tile.h`.

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `HalfSlabTile` | `HalfSlabTile.h` | — | Slab base (half + double render logic). |
| `StoneSlabTile` | `StoneSlabTile.h` | — | Stone-slab family base. Extends `HalfSlabTile`. |
| `HalfStoneSlabTile` | `StoneSlabTile.h` | 44 (`stone_slab_Id`) | Single stone slab (stone/sandstone/brick/quartz by data). |
| `FullStoneSlabTile` | `StoneSlabTile.h` | 43 (`double_stone_slab_Id`) | Double stone slab. |
| `StoneSlabTile2` | `StoneSlabTile2.h` | — | Stone-slab-2 family base (red sandstone). Extends `HalfSlabTile`. |
| `HalfStoneSlabTile2` | `StoneSlabTile2.h` | 182 (`stone_slab2_Id`) | Single red-sandstone slab (TU31). |
| `FullStoneSlabTile2` | `StoneSlabTile2.h` | 181 (`double_stone_slab2_Id`) | Double red-sandstone slab (TU31). |
| `WoodSlabTile` | `WoodSlabTile.h` | — | Wood-slab family base. Extends `HalfSlabTile`. |
| `HalfWoodSlabTile` | `WoodSlabTile.h` | 126 (`wooden_slab_Id`) | Single wood slab (per-wood by data). |
| `FullWoodSlabTile` | `WoodSlabTile.h` | 125 (`double_wooden_slab_Id`) | Double wood slab. |
| `StairTile` | `StairTile.h` | 53, 67, 108, 109, 114, 128, 134, 135, 136, 156, 163, 164 | All stairs: wood, stone, brick, stone-brick, nether-brick, sandstone, spruce/birch/jungle, quartz, acacia, dark-oak. |

## Walls, fences &amp; panes

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `WallTile` | `WallTile.h` | 139 | Cobblestone/mossy wall. |
| `FenceTile` | `FenceTile.h` | 85, 113, 188, and spruce/birch/jungle/acacia/dark-oak by ID | Fences: oak (85), nether-brick (113), spruce (188) and the other wood fences (TU25). |
| `FenceGateTile` | `FenceGateTile.h` | 107, 183, 184, 185, 186, 187 | Fence gates: oak (107), spruce/birch/jungle/dark/acacia (183-187). Extends `DirectionalTile`. |
| `ThinFenceTile` | `ThinFenceTile.h` | 101, 102 | Iron bars (101), glass pane (102). |
| `StainedGlassPaneBlock` | `StainedGlassPaneBlock.h` | 160 | Stained glass pane. Extends `ThinFenceTile`. |

## Glass, coral &amp; barrier

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `GlassTile` | `GlassTile.h` | 20 | Glass; drops nothing without silk touch. Extends `HalfTransparentTile`. |
| `StainedGlassBlock` | `StainedGlassBlock.h` | 95 | Stained glass (16 colours by data). Extends `HalfTransparentTile`. |
| `CoralTile` | `CoralTile.h` | — | Coral / decorative transparent block. Extends `HalfTransparentTile`. |
| `BarrierTile` | `BarrierTile.h` | 166 | Barrier — invisible, indestructible in survival (TU31). Extends `HalfTransparentTile`. |
| `PrismarineTile` | `PrismarineTile.h` | 168 | Prismarine (rough/brick/dark by data) — TU31. |
| `SeaLanternTile` | `SeaLanternTile.h` | 169 | Sea lantern; full-bright light source — TU31. |

## Coloured, cloth &amp; carpet

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `ColoredTile` | `ColoredTile.h` | 35 (wool), 159 (stained clay) | 16-colour block base: wool and stained hardened clay. |
| `ClothTile` | `ClothTile.h` | — | Cloth/wool render base variant. |
| `WoolCarpetTile` | `WoolCarpetTile.h` | 171 | Carpet (16 colours) — TU25. |

---

## Redstone

See [Redstone](/slop-docs/world/redstone/) for wiring and power-propagation detail.

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `RedStoneDustTile` | `RedStoneDustTile.h` | 55 | Redstone wire; carries and propagates power. |
| `RedlightTile` | `RedlightTile.h` | 123, 124 | Redstone lamp: off (123), lit (124). |
| `PoweredMetalTile` | `PoweredMetalTile.h` | 152 | Redstone block (constant power source). Extends `MetalTile`. |
| `TorchTile` | `TorchTile.h` | 50 | Torch (light); base for redstone torch. |
| `NotGateTile` | `NotGateTile.h` | 75, 76 | Redstone torch: off (75), on (76). Extends `TorchTile`. |
| `LeverTile` | `LeverTile.h` | 69 | Lever; toggleable power source. |
| `ButtonTile` | `ButtonTile.h` | — | Button base (momentary power). |
| `StoneButtonTile` | `StoneButtonTile.h` | 77 | Stone button. Extends `ButtonTile`. |
| `WoodButtonTile` | `WoodButtonTile.h` | 143 | Wooden button (also triggered by arrows). Extends `ButtonTile`. |
| `BasePressurePlateTile` | `BasePressurePlateTile.h` | — | Pressure-plate base. |
| `PressurePlateTile` | `PressurePlateTile.h` | 70, 72 | Pressure plate: stone (70), wood (72). Extends `BasePressurePlateTile`. |
| `WeightedPressurePlateTile` | `WeightedPressurePlateTile.h` | 147, 148 | Weighted plate: light/gold (147), heavy/iron (148). Analog output. |
| `DiodeTile` | `DiodeTile.h` | — | Repeater/comparator base. Extends `DirectionalTile`. |
| `RepeaterTile` | `RepeaterTile.h` | 93, 94 | Repeater: unpowered (93), powered (94). Extends `DiodeTile`. |
| `ComparatorTile` | `ComparatorTile.h` | 149, 150 | Comparator: off (149), on (150). `DiodeTile` + `EntityTile` (has a `ComparatorTileEntity`). |
| `DaylightDetectorTile` | `DaylightDetectorTile.h` | 151, 178 | Daylight sensor: normal (151), inverted (178). Backed by a TileEntity. |
| `TripWireSourceTile` | `TripWireSourceTile.h` | 131 | Tripwire hook. |
| `TripWireTile` | `TripWireTile.h` | 132 | Tripwire string. |
| `NoteBlockTile` | `NoteBlockTile.h` | 25 | Note block; plays a pitch on signal. `BaseEntityTile`. |

### Rails

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `BaseRailTile` | `BaseRailTile.h` | — | Rail base (shape/turn logic). |
| `RailTile` | `RailTile.h` | 66 | Plain rail. Extends `BaseRailTile`. |
| `DetectorRailTile` | `DetectorRailTile.h` | 28 | Detector rail; emits power under a cart. Extends `BaseRailTile`. |
| `PoweredRailTile` | `PoweredRailTile.h` | 27 (golden), 157 (activator) | Powered rail (27) and activator rail (157, TU25). Extends `BaseRailTile`. |

### Pistons

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `PistonBaseTile` | `PistonBaseTile.h` | 29 (sticky), 33 (normal) | Piston body; pushes blocks on power. |
| `PistonExtensionTile` | `PistonExtensionTile.h` | 34 | Piston head/arm placeholder. |
| `PistonMovingPiece` | `PistonMovingPiece.h` | 36 | Moving-block placeholder; owns a `PistonPieceEntity`. `BaseEntityTile`. |
| `SlimeTile` | `SlimeTile.h` | 165 | Slime block — sticks to piston push-chains (neoLegacy addition); uses `SOUND_SLIME` (`Tile.cpp:366`,`572`). Extends `HalfTransparentTile`. |

---

## Containers &amp; block entities

Every tile here extends `BaseEntityTile` and owns a
[TileEntity](/slop-docs/world/tile-entities/); most open a
[container menu](/slop-docs/world/containers/).

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `ChestTile` | `ChestTile.h` | 54 (chest), 146 (trapped) | Chest and trapped chest. |
| `EnderChestTile` | `EnderChestTile.h` | 130 | Ender chest (per-player shared storage). |
| `LockedChestTile` | `LockedChestTile.h` | — | Legacy April-Fools locked chest (present, not registered in `staticCtor`). |
| `FurnaceTile` | `FurnaceTile.h` | 61 (idle), 62 (lit) | Furnace; smelts via `FurnaceRecipes`. |
| `DispenserTile` | `DispenserTile.h` | 23 | Dispenser; fires items via dispense behaviours. |
| `DropperTile` | `DropperTile.h` | 158 | Dropper (TU25); pushes items without projectile behaviour. Extends `DispenserTile`. |
| `HopperTile` | `HopperTile.h` | 154 | Hopper (TU25); transfers items between containers. |
| `WorkbenchTile` | `WorkbenchTile.h` | 58 | Crafting table (3×3 [crafting menu](/slop-docs/world/crafting/)). |
| `EnchantmentTableTile` | `EnchantmentTableTile.h` | 116 | Enchanting table (`EnchantmentTableEntity`). See [Enchantments](/slop-docs/world/enchantments/). |
| `BrewingStandTile` | `BrewingStandTile.h` | 117 | Brewing stand (save-id `Cauldron`). See [Effects](/slop-docs/world/effects/). |
| `CauldronTile` | `CauldronTile.h` | 118 | Cauldron (water storage / dye / potion interactions). |
| `BeaconTile` | `BeaconTile.h` | 138 | Beacon; projects a beam and area effects (`BeaconTileEntity`). |
| `SignTile` | `SignTile.h` | 63 (standing), 68 (wall) | Sign; stores text lines in a TileEntity. |
| `BannerTile` | `BannerTile.h` | 176 (standing), 177 (wall) | Banner; stores pattern layers in a `BannerTileEntity` (v1.1.0b). `BaseEntityTile`; the `bool onGround` ctor arg selects standing vs wall. |
| `SkullTile` | `SkullTile.h` | 144 | Mob/player head. |
| `MobSpawnerTile` | `MobSpawnerTile.h` | 52 | Monster spawner; holds a spawn definition. |
| `CommandBlock` | `CommandBlock.h` | 137 | Command block (save-id `Control`). See [Commands](/slop-docs/world/commands/). |
| `MusicTile` | `MusicTile.h` | — | Jukebox render/entity variant (`EntityTile`). |
| `JukeboxTile` | `JukeboxTile.h` | 84 | Jukebox; plays a `RecordingItem` disc. `BaseEntityTile`. |
| `RecordPlayerTile` | `RecordPlayerTile.h` | — | Record-player tile variant (`EntityTile`). |

---

## Doors, gates &amp; trapdoors

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `DoorTile` | `DoorTile.h` | 64, 71, 193, 194, 195, 196, 197 | Doors: oak (64), iron (71), spruce (193), birch (194), jungle (195), acacia (196), dark-oak (197). Wood doors TU25. |
| `TrapDoorTile` | `TrapDoorTile.h` | 96 (wood), 167 (iron) | Trapdoor; iron trapdoor (167) is TU25. |
| `BedTile` | `BedTile.h` | 26 | Bed; sets spawn, skips night. Extends `DirectionalTile`. |

---

## Utility, decoration &amp; misc

| Class | Header | IDs | Purpose |
|-------|--------|-----|---------|
| `AirTile` | `AirTile.h` | 0 (implicit) | Air; `tiles[0]` is treated as empty and not `new`'d in `staticCtor`. |
| `FireTile` | `FireTile.h` | 51 | Fire; spreads, burns entities. |
| `TntTile` | `TntTile.h` | 46 | TNT; primes into a `PrimedTnt` entity. |
| `CakeTile` | `CakeTile.h` | 92 | Cake; eaten in bites (data = slices left). |
| `WebTile` | `WebTile.h` | 30 | Cobweb; slows and traps entities. |
| `QuartzBlockTile` | `QuartzBlockTile.h` | 155 | Quartz block (plain/chiselled/pillar by data) — TU25. |

## Approximate family counts

| Family | Classes (approx.) |
|--------|-------------------|
| Base / abstract | ~12 |
| Terrain &amp; natural | ~20 |
| Nether &amp; End | ~10 |
| Plants, crops &amp; foliage | ~24 |
| Trees &amp; wood | ~8 |
| Slabs &amp; stairs | ~11 |
| Walls, fences &amp; panes | ~5 |
| Glass, coral &amp; barrier | ~6 |
| Coloured / cloth | ~3 |
| Redstone (incl. rails, pistons) | ~24 |
| Containers / block entities | ~20 |
| Doors &amp; gates | ~3 |
| Utility / misc | ~6 |

Totals to **~181 `Tile` subclasses across ~184 headers** — the headers exceed the classes
because a few files declare paired classes (`StoneSlabTile.h`, `WoodSlabTile.h`,
`StoneSlabTile2.h`) and a few classes (`Sapling2`, `NetherStalkTile`, `LockedChestTile`,
`stoneBrick`) are present but not wired into `staticCtor`.

## See also

- [Block (Tile) ID Registry](/slop-docs/reference/block-ids/) — the same blocks ordered by numeric ID, with icon names and TU flags.
- [Blocks &amp; Tiles](/slop-docs/world/blocks/) — the `Tile` base class, members, virtuals, and how to add your own block.
- [Redstone](/slop-docs/world/redstone/) · [Block Entities](/slop-docs/world/tile-entities/) · [Containers](/slop-docs/world/containers/) · [Materials](/slop-docs/world/materials/).

---
title: Block ID Registry
description: Complete table of all block (tile) IDs in LCE.
---

Every block (called a "Tile" internally) is registered in `Tile::staticCtor()` in
[`Minecraft.World/Tile.cpp`](/slop-docs/reference/file-index/). The ID passed to each
tile constructor is the numeric block ID used on the wire and in save data.

The LCEMP repo covers blocks up to ID 171 (TU12-era). The MinecraftConsoles repo goes
further, adding blocks up through ID 173 (TU19-era content like stained clay, hoppers,
and hay blocks).

## Block ID Table (LCEMP)

These are the blocks present in the LCEMP source (the earlier codebase, roughly TU12).

| ID | Field Name | Class | Texture Name |
|----|-----------|-------|-------------|
| 1 | `rock` | `StoneTile` | stone |
| 2 | `grass` | `GrassTile` | grass |
| 3 | `dirt` | `DirtTile` | dirt |
| 4 | `stoneBrick` | `Tile` | stonebrick |
| 5 | `wood` | `WoodTile` | wood |
| 6 | `sapling` | `Sapling` | sapling |
| 7 | `unbreakable` | `Tile` | bedrock |
| 8 | `water` | `LiquidTileDynamic` | water |
| 9 | `calmWater` | `LiquidTileStatic` | water |
| 10 | `lava` | `LiquidTileDynamic` | lava |
| 11 | `calmLava` | `LiquidTileStatic` | lava |
| 12 | `sand` | `HeavyTile` | sand |
| 13 | `gravel` | `GravelTile` | gravel |
| 14 | `goldOre` | `OreTile` | oreGold |
| 15 | `ironOre` | `OreTile` | oreIron |
| 16 | `coalOre` | `OreTile` | oreCoal |
| 17 | `treeTrunk` | `TreeTile` | log |
| 18 | `leaves` | `LeafTile` | leaves |
| 19 | `sponge` | `Sponge` | sponge |
| 20 | `glass` | `GlassTile` | glass |
| 21 | `lapisOre` | `OreTile` | oreLapis |
| 22 | `lapisBlock` | `Tile` | blockLapis |
| 23 | `dispenser` | `DispenserTile` | dispenser |
| 24 | `sandStone` | `SandStoneTile` | sandStone |
| 25 | `musicBlock` | `MusicTile` | musicBlock |
| 26 | `bed` | `BedTile` | bed |
| 27 | `goldenRail` | `RailTile` | goldenRail |
| 28 | `detectorRail` | `DetectorRailTile` | detectorRail |
| 29 | `pistonStickyBase` | `PistonBaseTile` | pistonStickyBase |
| 30 | `web` | `WebTile` | web |
| 31 | `tallgrass` | `TallGrass` | tallgrass |
| 32 | `deadBush` | `DeadBushTile` | deadbush |
| 33 | `pistonBase` | `PistonBaseTile` | pistonBase |
| 34 | `pistonExtension` | `PistonExtensionTile` | *(none)* |
| 35 | `cloth` | `ClothTile` | cloth |
| 36 | `pistonMovingPiece` | `PistonMovingPiece` | *(none)* |
| 37 | `flower` | `Bush` | flower |
| 38 | `rose` | `Bush` | rose |
| 39 | `mushroom1` | `Mushroom` | mushroom |
| 40 | `mushroom2` | `Mushroom` | mushroom |
| 41 | `goldBlock` | `MetalTile` | blockGold |
| 42 | `ironBlock` | `MetalTile` | blockIron |
| 43 | `stoneSlab` | `StoneSlabTile` | stoneSlab |
| 44 | `stoneSlabHalf` | `StoneSlabTile` | stoneSlab |
| 45 | `redBrick` | `Tile` | brick |
| 46 | `tnt` | `TntTile` | tnt |
| 47 | `bookshelf` | `BookshelfTile` | bookshelf |
| 48 | `mossStone` | `Tile` | stoneMoss |
| 49 | `obsidian` | `ObsidianTile` | obsidian |
| 50 | `torch` | `TorchTile` | torch |
| 51 | `fire` | `FireTile` | fire |
| 52 | `mobSpawner` | `MobSpawnerTile` | mobSpawner |
| 53 | `stairs_wood` | `StairTile` | stairsWood |
| 54 | `chest` | `ChestTile` | chest |
| 55 | `redStoneDust` | `RedStoneDustTile` | redstoneDust |
| 56 | `diamondOre` | `OreTile` | oreDiamond |
| 57 | `diamondBlock` | `MetalTile` | blockDiamond |
| 58 | `workBench` | `WorkbenchTile` | workbench |
| 59 | `crops` | `CropTile` | crops |
| 60 | `farmland` | `FarmTile` | farmland |
| 61 | `furnace` | `FurnaceTile` | furnace |
| 62 | `furnace_lit` | `FurnaceTile` | furnace |
| 63 | `sign` | `SignTile` | sign |
| 64 | `door_wood` | `DoorTile` | doorWood |
| 65 | `ladder` | `LadderTile` | ladder |
| 66 | `rail` | `RailTile` | rail |
| 67 | `stairs_stone` | `StairTile` | stairsStone |
| 68 | `wallSign` | `SignTile` | sign |
| 69 | `lever` | `LeverTile` | lever |
| 70 | `pressurePlate_stone` | `PressurePlateTile` | pressurePlate |
| 71 | `door_iron` | `DoorTile` | doorIron |
| 72 | `pressurePlate_wood` | `PressurePlateTile` | pressurePlate |
| 73 | `redStoneOre` | `RedStoneOreTile` | oreRedstone |
| 74 | `redStoneOre_lit` | `RedStoneOreTile` | oreRedstone |
| 75 | `notGate_off` | `NotGateTile` | notGate |
| 76 | `notGate_on` | `NotGateTile` | notGate |
| 77 | `button` | `ButtonTile` | button |
| 78 | `topSnow` | `TopSnowTile` | snow |
| 79 | `ice` | `IceTile` | ice |
| 80 | `snow` | `SnowTile` | snow |
| 81 | `cactus` | `CactusTile` | cactus |
| 82 | `clay` | `ClayTile` | clay |
| 83 | `reeds` | `ReedTile` | reeds |
| 84 | `recordPlayer` | `RecordPlayerTile` | jukebox |
| 85 | `fence` | `FenceTile` | fence |
| 86 | `pumpkin` | `PumpkinTile` | pumpkin |
| 87 | `hellRock` | `HellStoneTile` | hellrock |
| 88 | `hellSand` | `HellSandTile` | hellsand |
| 89 | `lightGem` | `LightGemTile` | lightgem |
| 90 | `portalTile` | `PortalTile` | portal |
| 91 | `litPumpkin` | `PumpkinTile` | litpumpkin |
| 92 | `cake` | `CakeTile` | cake |
| 93 | `diode_off` | `DiodeTile` | diode |
| 94 | `diode_on` | `DiodeTile` | diode |
| 95 | `aprilFoolsJoke` | `LockedChestTile` | lockedchest |
| 96 | `trapdoor` | `TrapDoorTile` | trapdoor |
| 97 | `monsterStoneEgg` | `StoneMonsterTile` | monsterStoneEgg |
| 98 | `stoneBrickSmooth` | `SmoothStoneBrickTile` | stonebricksmooth |
| 99 | `hugeMushroom1` | `HugeMushroomTile` | mushroom |
| 100 | `hugeMushroom2` | `HugeMushroomTile` | mushroom |
| 101 | `ironFence` | `ThinFenceTile` | fenceIron |
| 102 | `thinGlass` | `ThinFenceTile` | thinGlass |
| 103 | `melon` | `MelonTile` | melon |
| 104 | `pumpkinStem` | `StemTile` | pumpkinStem |
| 105 | `melonStem` | `StemTile` | pumpkinStem |
| 106 | `vine` | `VineTile` | vine |
| 107 | `fenceGate` | `FenceGateTile` | fenceGate |
| 108 | `stairs_bricks` | `StairTile` | stairsBrick |
| 109 | `stairs_stoneBrickSmooth` | `StairTile` | stairsStoneBrickSmooth |
| 110 | `mycel` | `MycelTile` | mycel |
| 111 | `waterLily` | `WaterlilyTile` | waterlily |
| 112 | `netherBrick` | `Tile` | netherBrick |
| 113 | `netherFence` | `FenceTile` | netherFence |
| 114 | `stairs_netherBricks` | `StairTile` | stairsNetherBrick |
| 115 | `netherStalk` | `NetherStalkTile` | netherStalk |
| 116 | `enchantTable` | `EnchantmentTableTile` | enchantmentTable |
| 117 | `brewingStand` | `BrewingStandTile` | brewingStand |
| 118 | `cauldron` | `CauldronTile` | cauldron |
| 119 | `endPortalTile` | `TheEndPortal` | *(none)* |
| 120 | `endPortalFrameTile` | `TheEndPortalFrameTile` | endPortalFrame |
| 121 | `whiteStone` | `Tile` | whiteStone |
| 122 | `dragonEgg` | `EggTile` | dragonEgg |
| 123 | `redstoneLight` | `RedlightTile` | redstoneLight |
| 124 | `redstoneLight_lit` | `RedlightTile` | redstoneLight |
| 125 | `woodSlab` | `WoodSlabTile` | woodSlab |
| 126 | `woodSlabHalf` | `WoodSlabTile` | woodSlab |
| 127 | `cocoa` | `CocoaTile` | cocoa |
| 128 | `stairs_sandstone` | `StairTile` | stairsSandstone |
| 129 | `emeraldOre` | `OreTile` | oreEmerald |
| 130 | `enderChest` | `EnderChestTile` | enderChest |
| 131 | `tripWireSource` | `TripWireSourceTile` | tripWireSource |
| 132 | `tripWire` | `TripWireTile` | tripWire |
| 133 | `emeraldBlock` | `MetalTile` | blockEmerald |
| 134 | `woodStairsDark` | `StairTile` | stairsWoodSpruce |
| 135 | `woodStairsBirch` | `StairTile` | stairsWoodBirch |
| 136 | `woodStairsJungle` | `StairTile` | stairsWoodJungle |
| 139 | `cobbleWall` | `WallTile` | cobbleWall |
| 140 | `flowerPot` | `FlowerPotTile` | flowerPot |
| 141 | `carrots` | `CarrotTile` | carrots |
| 142 | `potatoes` | `PotatoTile` | potatoes |
| 143 | `button_wood` | `ButtonTile` | button |
| 144 | `skull` | `SkullTile` | skull |
| 145 | `anvil` | `AnvilTile` | anvil |
| 153 | `netherQuartz` | `OreTile` | netherquartz |
| 155 | `quartzBlock` | `QuartzBlockTile` | quartzBlock |
| 156 | `stairs_quartz` | `StairTile` | stairsQuartz |
| 171 | `woolCarpet` | `WoolCarpetTile` | woolCarpet |

:::note
In the LCEMP source, IDs 137-138, 146-152, 154, 157-170 are unassigned.
IDs 34 and 36 (`pistonExtension`, `pistonMovingPiece`) are technical blocks
with no collectible item form.
:::

## Additional Blocks (MinecraftConsoles)

The MinecraftConsoles repo has a newer codebase (roughly TU19). It renames some fields
and adds a bunch of new blocks. Here is every block that was added or changed compared
to the LCEMP source.

### Renamed Fields

Several fields got renamed between the two repos:

| ID | LCEMP Field | MinecraftConsoles Field | Notes |
|----|------------|------------------------|-------|
| 1 | `rock` | `stone` | Same `StoneTile` class |
| 4 | `stoneBrick` | `cobblestone` | Texture changed to `cobblestone` |
| 25 | `musicBlock` | `noteblock` | Class changed to `NoteBlockTile` (was `MusicTile`) |
| 35 | `cloth` | `wool` | Class changed to `ColoredTile` (was `ClothTile`) |
| 48 | `mossStone` | `mossyCobblestone` | Texture changed to `cobblestone_mossy` |
| 59 | `crops` | `wheat` | Same `CropTile` class |
| 75 | `notGate_off` | `redstoneTorch_off` | Same `NotGateTile` class |
| 76 | `notGate_on` | `redstoneTorch_on` | Same `NotGateTile` class |
| 77 | `button` | `button` | Class changed to `StoneButtonTile` |
| 84 | `recordPlayer` | `jukebox` | Class changed to `JukeboxTile` |
| 87 | `hellRock` | `netherRack` | Class changed to `NetherrackTile` |
| 88 | `hellSand` | `soulsand` | Class changed to `SoulSandTile` |
| 89 | `lightGem` | `glowstone` | Field renamed only |
| 93 | `diode_off` | `diode_off` | Class changed to `RepeaterTile` (was `DiodeTile`) |
| 98 | `stoneBrickSmooth` | `stoneBrick` | Same `SmoothStoneBrickTile` class |
| 99 | `hugeMushroom1` | `hugeMushroom_brown` | Same `HugeMushroomTile` class |
| 100 | `hugeMushroom2` | `hugeMushroom_red` | Same `HugeMushroomTile` class |
| 115 | `netherStalk` | `netherStalk` | Class changed to `NetherWartTile` |
| 121 | `whiteStone` | `endStone` | Field renamed only |
| 143 | `button_wood` | `button_wood` | Class changed to `WoodButtonTile` |

### New Blocks

| ID | Field Name | Class | Texture Name |
|----|-----------|-------|-------------|
| 137 | `commandBlock` | *(not registered in staticCtor)* | *(unknown)* |
| 138 | `beacon` | `BeaconTile` | beacon |
| 146 | `chest_trap` | `ChestTile` (TYPE_TRAP) | *(inherits chest)* |
| 147 | `weightedPlate_light` | `WeightedPressurePlateTile` | gold_block |
| 148 | `weightedPlate_heavy` | `WeightedPressurePlateTile` | iron_block |
| 149 | `comparator_off` | `ComparatorTile` | comparator_off |
| 150 | `comparator_on` | `ComparatorTile` | comparator_on |
| 151 | `daylightDetector` | `DaylightDetectorTile` | daylight_detector |
| 152 | `redstoneBlock` | `PoweredMetalTile` | redstone_block |
| 154 | `hopper` | `HopperTile` | hopper |
| 157 | `activatorRail` | `PoweredRailTile` | rail_activator |
| 158 | `dropper` | `DropperTile` | dropper |
| 159 | `clayHardened_colored` | `ColoredTile` | hardened_clay_stained |
| 160 | `stained_glass_pane` | *(declared in Tile.h)* | *(unknown)* |
| 170 | `hayBlock` | `HayBlockTile` | hay_block |
| 172 | `clayHardened` | `Tile` | hardened_clay |
| 173 | `coalBlock` | `Tile` | coal_block |

:::note
The `RailTile` class was refactored into `BaseRailTile` in MinecraftConsoles.
`RailTile` (ID 66) still exists but now extends `BaseRailTile`, and `PoweredRailTile`
replaces the old `RailTile(id, true)` pattern for powered/activator rails.
`DetectorRailTile` also extends `BaseRailTile` instead of `RailTile`.

The `EntityTile` base class was supplemented with `BaseEntityTile`. New tile entity
blocks like `BeaconTile`, `HopperTile`, `DaylightDetectorTile`, `NoteBlockTile`, and
`EnchantmentTableTile` extend `BaseEntityTile` instead of the older `EntityTile`.
:::

## Data Values

Several blocks use auxiliary data bits to store sub-types:

| Block | Data Meaning |
|-------|-------------|
| `sapling` (6) | 0 = Oak, 1 = Spruce, 2 = Birch, 3 = Jungle |
| `treeTrunk` (17) | 0 = Oak, 1 = Spruce, 2 = Birch, 3 = Jungle |
| `leaves` (18) | Low 2 bits: 0 = Oak, 1 = Spruce, 2 = Birch, 3 = Jungle |
| `sandStone` (24) | 0 = Normal, 1 = Chiseled, 2 = Smooth |
| `cloth`/`wool` (35) | 0 = White ... 15 = Black (standard wool colors) |
| `stoneSlab` / `stoneSlabHalf` (43/44) | 0 = Stone, 1 = Sandstone, 2 = Wooden, 3 = Cobblestone, 4 = Brick, 5 = Stone Brick |
| `woodSlab` / `woodSlabHalf` (125/126) | 0 = Oak, 1 = Spruce, 2 = Birch, 3 = Jungle |
| `wood` (5) | 0 = Oak, 1 = Spruce, 2 = Birch, 3 = Jungle |
| `stoneBrickSmooth`/`stoneBrick` (98) | 0 = Normal, 1 = Mossy, 2 = Cracked, 3 = Chiseled |
| `monsterStoneEgg` (97) | 0 = Stone, 1 = Cobblestone, 2 = Stone Brick |
| `cobbleWall` (139) | 0 = Cobblestone, 1 = Mossy Cobblestone |
| `quartzBlock` (155) | 0 = Default, 1 = Chiseled, 2 = Pillar |
| `woolCarpet` (171) | Same color values as wool |
| `anvil` (145) | 0 = Anvil, 1 = Slightly Damaged, 2 = Very Damaged |
| `clayHardened_colored` (159) | 0 = White ... 15 = Black (same as wool) |

## Source Reference

- LCEMP tile IDs declared in: `Minecraft.World/Tile.h` (lines 163-315)
- LCEMP tile registration in: `Minecraft.World/Tile.cpp`, `Tile::staticCtor()` (line 224)
- MinecraftConsoles tile IDs declared in: `Minecraft.World/Tile.h` (lines 369-542)
- MinecraftConsoles tile registration in: `Minecraft.World/Tile.cpp`, `Tile::staticCtor()` (line 243)

---
title: Block (Tile) ID Registry
description: Every registered tile (block) ID in neoLegacy, with its constant, class, icon, and TU flag.
---

Complete registry of the block (tile) IDs registered by `Tile::staticCtor()`. Every
entry below is extracted from **`Minecraft.World/Tile.cpp:359-609`** (the body of
`Tile::staticCtor`) cross-referenced with the `_Id` constants in
**`Minecraft.World/Tile.h:221-450`**. IDs are hard-coded inline in each `new` call, so
the numbering has gaps.

For prose on the block system see [Blocks &amp; Tiles](/slop-docs/world/blocks/); for
the newer-TU additions flagged in the last column see [TU25](/slop-docs/features/tu25/),
[TU31](/slop-docs/features/tu31/), and [neoLegacy Additions](/slop-docs/features/neolegacy-additions/).

## How registration works

`Tile::staticCtor` first `new`s the `Tile::tiles` array of size `TILE_NUM_COUNT`
(`= 4096`, `Tile.h:101`) and zeroes it (`Tile.cpp:375-376`), then assigns each block
with a fluent builder:

```cpp
Tile::stone = (new StoneTile(1))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_structblock, Item::eMaterial_stone)
    ->setDestroyTime(1.5f)->setExplodeable(10)
    ->setSoundType(Tile::SOUND_STONE)->setIconName(L"stone")
    ->setDescriptionId(IDS_TILE_STONE)->setUseDescriptionId(IDS_DESC_STONE);
```
(`Tile.cpp:378`)

The integer passed to each tile constructor **is** the block ID; the constructor stores
it into `Tile::tiles[id]`. Some IDs are supplied through named `_Id` constants
(e.g. `Tile::double_stone_slab_Id` = 43) instead of a literal — those are noted in the
table. Block **item** counterparts (the `TileItem` shown in the inventory) are the same
numeric ID; a handful are overridden with custom item classes at `Tile.cpp:611-646`
(see [Item ID Registry](/slop-docs/reference/item-ids/)).

The **Flag** column marks blocks added on top of neoLegacy's TU19 base:

- **TU25** — acacia/dark-oak wood family, per-wood fences/gates/doors, iron trapdoor,
  inverted daylight sensor.
- **TU31** — barrier, prismarine, sea lantern, packed ice, red sandstone + red-sandstone
  slab/stairs, double plant.
- **neoLegacy** — content beyond TU parity (slime block, frosted ice).
- blank — present in the TU19 base.

`air` (id 0) has no `Tile` object; slot 0 in `Tile::tiles` stays null.

## Block table

| ID | Constant (`Tile.h`) | Class | Icon | Flag | Source |
|---:|---|---|---|:---:|---|
| 0 | `air_Id` | *(no Tile — null slot)* | — | | `Tile.h:221` |
| 1 | `stone_Id` | `StoneTile` | `stone` | | `Tile.cpp:378` |
| 2 | `grass_Id` | `GrassTile` | `grass` | | `Tile.cpp:379` |
| 3 | `dirt_Id` | `DirtTile` | `dirt` | | `Tile.cpp:380` |
| 4 | `cobblestone_Id` | `Tile` (Material::stone) | `cobblestone` | | `Tile.cpp:381` |
| 5 | `planks_Id` | `WoodTile` | `planks` | | `Tile.cpp:382` |
| 6 | `sapling_Id` | `Sapling` | `sapling` | | `Tile.cpp:383` |
| 7 | `bedrock_Id` | `Tile` (indestructible) | `bedrock` | | `Tile.cpp:385` |
| 8 | `flowing_water_Id` | `LiquidTileDynamic` | `water_flow` | | `Tile.cpp:386` |
| 9 | `water_Id` | `LiquidTileStatic` | `water_still` | | `Tile.cpp:387` |
| 10 | `flowing_lava_Id` | `LiquidTileDynamic` | `lava_flow` | | `Tile.cpp:388` |
| 11 | `lava_Id` | `LiquidTileStatic` | `lava_still` | | `Tile.cpp:390` |
| 12 | `sand_Id` | `SandTile` | `sand` | | `Tile.cpp:391` |
| 13 | `gravel_Id` | `GravelTile` | `gravel` | | `Tile.cpp:392` |
| 14 | `gold_ore_Id` | `OreTile` | `gold_ore` | | `Tile.cpp:393` |
| 15 | `iron_ore_Id` | `OreTile` | `iron_ore` | | `Tile.cpp:394` |
| 16 | `coal_ore_Id` | `OreTile` | `coal_ore` | | `Tile.cpp:395` |
| 17 | `log_Id` | `TreeTile` | `log` | | `Tile.cpp:396` |
| 18 | `leaves_Id` | `LeafTile` | `leaves` | | `Tile.cpp:398` |
| 19 | `sponge_Id` | `Sponge` | `sponge` | | `Tile.cpp:400` |
| 20 | `glass_Id` | `GlassTile` | `glass` | | `Tile.cpp:401` |
| 21 | `lapis_ore_Id` | `OreTile` | `lapis_ore` | | `Tile.cpp:403` |
| 22 | `lapis_block_Id` | `Tile` (Material::stone) | `lapis_block` | | `Tile.cpp:404` |
| 23 | `dispenser_Id` | `DispenserTile` | `dispenser` | | `Tile.cpp:405` |
| 24 | `sandstone_Id` | `SandStoneTile` | `sandstone` | | `Tile.cpp:406` |
| 25 | `noteblock_Id` | `NoteBlockTile` | `noteblock` | | `Tile.cpp:407` |
| 26 | `bed_Id` | `BedTile` | `bed` | | `Tile.cpp:408` |
| 27 | `golden_rail_Id` | `PoweredRailTile` | `rail_golden` | | `Tile.cpp:409` |
| 28 | `detector_rail_Id` | `DetectorRailTile` | `rail_detector` | | `Tile.cpp:410` |
| 29 | `sticky_piston_Id` | `PistonBaseTile` (sticky) | `sticky_piston` | | `Tile.cpp:411` |
| 30 | `web_Id` | `WebTile` | `web` | | `Tile.cpp:412` |
| 31 | `tallgrass_Id` | `TallGrass` | `tallgrass` | | `Tile.cpp:414` |
| 32 | `deadbush_Id` | `DeadBushTile` | `deadbush` | | `Tile.cpp:415` |
| 33 | `piston_Id` | `PistonBaseTile` | `pistonBase` | | `Tile.cpp:416` |
| 34 | `piston_head_Id` | `PistonExtensionTile` | — | | `Tile.cpp:417` |
| 35 | `wool_Id` | `ColoredTile` | `wool_colored` | | `Tile.cpp:418` |
| 36 | `piston_extension_Id` | `PistonMovingPiece` | — | | `Tile.cpp:419` |
| 37 | `yellow_flower_Id` | `Bush` | `flower_dandelion` | | `Tile.cpp:420` |
| 38 | `red_flower_Id` | `Rose` | `flower_rose` | | `Tile.cpp:421` |
| 39 | `mushroom_brown_Id` | `Mushroom` | `mushroom_brown` | | `Tile.cpp:422` |
| 40 | `mushroom_red_Id` | `Mushroom` | `mushroom_red` | | `Tile.cpp:423` |
| 41 | `gold_block_Id` | `MetalTile` | `gold_block` | | `Tile.cpp:425` |
| 42 | `iron_block_Id` | `MetalTile` | `iron_block` | | `Tile.cpp:426` |
| 43 | `double_stone_slab_Id` | `FullStoneSlabTile` | `stoneSlab` | | `Tile.cpp:427` |
| 44 | `stone_slab_Id` | `HalfStoneSlabTile` | `stoneSlab` | | `Tile.cpp:428` |
| 45 | `brick_block_Id` | `Tile` (Material::stone) | `brick` | | `Tile.cpp:429` |
| 46 | `tnt_Id` | `TntTile` | `tnt` | | `Tile.cpp:430` |
| 47 | `bookshelf_Id` | `BookshelfTile` | `bookshelf` | | `Tile.cpp:431` |
| 48 | `mossy_cobblestone_Id` | `Tile` (Material::stone) | `cobblestone_mossy` | | `Tile.cpp:432` |
| 49 | `obsidian_Id` | `ObsidianTile` | `obsidian` | | `Tile.cpp:433` |
| 50 | `torch_Id` | `TorchTile` | `torch_on` | | `Tile.cpp:434` |
| 51 | `fire_Id` | `FireTile` | `fire` | | `Tile.cpp:436` |
| 52 | `mob_spawner_Id` | `MobSpawnerTile` | `mob_spawner` | | `Tile.cpp:437` |
| 53 | `oak_stairs_Id` | `StairTile` (oak) | `stairsWood` | | `Tile.cpp:438` |
| 54 | `chest_Id` | `ChestTile` (TYPE_BASIC) | `chest` | | `Tile.cpp:439` |
| 55 | `redstone_wire_Id` | `RedStoneDustTile` | `redstone_dust` | | `Tile.cpp:440` |
| 56 | `diamond_ore_Id` | `OreTile` | `diamond_ore` | | `Tile.cpp:441` |
| 57 | `diamond_block_Id` | `MetalTile` | `diamond_block` | | `Tile.cpp:442` |
| 58 | `crafting_table_Id` | `WorkbenchTile` | `crafting_table` | | `Tile.cpp:443` |
| 59 | `wheat_Id` | `CropTile` | `wheat` | | `Tile.cpp:444` |
| 60 | `farmland_Id` | `FarmTile` | `farmland` | | `Tile.cpp:445` |
| 61 | `furnace_Id` | `FurnaceTile` (unlit) | `furnace` | | `Tile.cpp:447` |
| 62 | `lit_furnace_Id` | `FurnaceTile` (lit) | `furnace` | | `Tile.cpp:448` |
| 63 | `standing_sign_Id` | `SignTile` (standing) | `sign` | | `Tile.cpp:449` |
| 64 | `wooden_door_Id` | `DoorTile` (`doorWood`) | `wooden_door` | | `Tile.cpp:450` |
| 65 | `ladder_Id` | `LadderTile` | `ladder` | | `Tile.cpp:451` |
| 66 | `rail_Id` | `RailTile` | `rail_normal` | | `Tile.cpp:452` |
| 67 | `stone_stairs_Id` | `StairTile` (cobble) | `stairsStone` | | `Tile.cpp:453` |
| 68 | `wall_standing_sign_Id` | `SignTile` (wall) | `sign` | | `Tile.cpp:454` |
| 69 | `lever_Id` | `LeverTile` | `lever` | | `Tile.cpp:455` |
| 70 | `stone_pressure_plate_Id` | `PressurePlateTile` | *(uses stone)* | | `Tile.cpp:456` |
| 71 | `iron_door_Id` | `DoorTile` (`doorIron`) | `iron_door` | | `Tile.cpp:462` |
| 72 | `wooden_pressure_plate_Id` | `PressurePlateTile` | *(planks_oak)* | | `Tile.cpp:463` |
| 73 | `redstone_ore_Id` | `RedStoneOreTile` (unlit) | `redstone_ore` | | `Tile.cpp:464` |
| 74 | `lit_redstone_ore_Id` | `RedStoneOreTile` (lit) | `redstone_ore` | | `Tile.cpp:465` |
| 75 | `unlit_redstone_torch_Id` | `NotGateTile` (off) | `redstone_torch_off` | | `Tile.cpp:466` |
| 76 | `redstone_torch_Id` | `NotGateTile` (on) | `redstone_torch_on` | | `Tile.cpp:467` |
| 77 | `stone_button_Id` | `StoneButtonTile` | `button` | | `Tile.cpp:468` |
| 78 | `snow_layer_Id` | `TopSnowTile` | `snow` | | `Tile.cpp:469` |
| 79 | `ice_Id` | `IceTile` | `ice` | | `Tile.cpp:470` |
| 80 | `snow_Id` | `SnowTile` | `snow` | | `Tile.cpp:471` |
| 81 | `cactus_Id` | `CactusTile` | `cactus` | | `Tile.cpp:473` |
| 82 | `clay_Id` | `ClayTile` | `clay` | | `Tile.cpp:474` |
| 83 | `reeds_Id` | `ReedTile` | `reeds` | | `Tile.cpp:475` |
| 84 | `jukebox_Id` | `JukeboxTile` | `jukebox` | | `Tile.cpp:476` |
| 85 | `fence_Id` | `FenceTile` (oak) | *(planks_oak)* | | `Tile.cpp:477` |
| 86 | `pumpkin_Id` | `PumpkinTile` (unlit) | `pumpkin` | | `Tile.cpp:478` |
| 87 | `netherrack_Id` | `NetherrackTile` | `netherrack` | | `Tile.cpp:479` |
| 88 | `soul_sand_Id` | `SoulSandTile` | `soul_sand` | | `Tile.cpp:480` |
| 89 | `glowstone_Id` | `Glowstonetile` | `glowstone` | | `Tile.cpp:481` |
| 90 | `portal_Id` | `PortalTile` | `portal` | | `Tile.cpp:482` |
| 91 | `lit_pumpkin_Id` | `PumpkinTile` (lit) | `pumpkin` | | `Tile.cpp:484` |
| 92 | `cake_Id` | `CakeTile` | `cake` | | `Tile.cpp:485` |
| 93 | `unpowered_repeater_Id` | `RepeaterTile` (off) | `repeater_off` | | `Tile.cpp:486` |
| 94 | `powered_repeater_Id` | `RepeaterTile` (on) | `repeater_on` | | `Tile.cpp:487` |
| 95 | `stained_glass_Id` | `StainedGlassBlock` | `glass` | | `Tile.cpp:488` |
| 96 | `trapdoor_Id` | `TrapDoorTile` (wood) | `trapdoor` | | `Tile.cpp:489` |
| 97 | `monster_egg_Id` | `StoneMonsterTile` | `monster_egg` | | `Tile.cpp:490` |
| 98 | `stonebrick_Id` | `SmoothStoneBrickTile` | `stonebrick` | | `Tile.cpp:491` |
| 99 | `brown_mushroom_block_Id` | `HugeMushroomTile` (brown) | `mushroom_block` | | `Tile.cpp:492` |
| 100 | `red_mushroom_block_Id` | `HugeMushroomTile` (red) | `mushroom_block` | | `Tile.cpp:493` |
| 101 | `iron_bars_Id` | `ThinFenceTile` | `iron_bars` | | `Tile.cpp:496` |
| 102 | `glass_pane_Id` | `ThinFenceTile` | `glass` | | `Tile.cpp:497` |
| 103 | `melon_block_Id` | `MelonTile` | `melon` | | `Tile.cpp:503` |
| 104 | `pumpkin_stem_Id` | `StemTile` (pumpkin) | `pumpkin_stem` | | `Tile.cpp:504` |
| 105 | `melon_stem_Id` | `StemTile` (melon) | `melon_stem` | | `Tile.cpp:505` |
| 106 | `vine_Id` | `VineTile` | `vine` | | `Tile.cpp:506` |
| 107 | `fence_gate_Id` | `FenceGateTile` (oak) | `planks_oak` | | `Tile.cpp:507` |
| 108 | `brick_stairs_Id` | `StairTile` (brick) | `stairsBrick` | | `Tile.cpp:508` |
| 109 | `stone_brick_stairs_Id` | `StairTile` (stonebrick) | `stairsStoneBrickSmooth` | | `Tile.cpp:509` |
| 110 | `mycelium_Id` | `MycelTile` | `mycelium` | | `Tile.cpp:510` |
| 111 | `waterlily_Id` | `WaterlilyTile` | `waterlily` | | `Tile.cpp:512` |
| 112 | `nether_brick_Id` | `Tile` (Material::stone) | `nether_brick` | | `Tile.cpp:513` |
| 113 | `nether_brick_fence_Id` | `FenceTile` (nether) | *(nether_brick)* | | `Tile.cpp:514` |
| 114 | `nether_brick_stairs_Id` | `StairTile` (nether) | `stairsNetherBrick` | | `Tile.cpp:515` |
| 115 | `nether_wart_Id` | `NetherWartTile` | `nether_wart` | | `Tile.cpp:516` |
| 116 | `enchanting_table_Id` | `EnchantmentTableTile` | `enchanting_table` | | `Tile.cpp:517` |
| 117 | `brewing_stand_Id` | `BrewingStandTile` | `brewing_stand` | | `Tile.cpp:518` |
| 118 | `cauldron_Id` | `CauldronTile` | `cauldron` | | `Tile.cpp:519` |
| 119 | `end_portal_Id` | `TheEndPortal` | — | | `Tile.cpp:520` |
| 120 | `end_portal_frame_Id` | `TheEndPortalFrameTile` | `endframe` | | `Tile.cpp:521` |
| 121 | `end_stone_Id` | `Tile` (Material::stone) | `end_stone` | | `Tile.cpp:523` |
| 122 | `dragon_egg_Id` | `EggTile` | `dragon_egg` | | `Tile.cpp:524` |
| 123 | `redstone_lamp_Id` | `RedlightTile` (off) | `redstone_lamp_off` | | `Tile.cpp:525` |
| 124 | `lit_redstone_lamp_Id` | `RedlightTile` (on) | `redstone_lamp_on` | | `Tile.cpp:526` |
| 125 | `double_wooden_slab_Id` | `FullWoodSlabTile` | `woodSlab` | | `Tile.cpp:527` |
| 126 | `wooden_slab_Id` | `HalfWoodSlabTile` | `woodSlab` | | `Tile.cpp:528` |
| 127 | `cocoa_Id` | `CocoaTile` | `cocoa` | | `Tile.cpp:530` |
| 128 | `sandstone_stairs_Id` | `StairTile` (sandstone) | `stairsSandstone` | | `Tile.cpp:531` |
| 129 | `emerald_ore_Id` | `OreTile` | `emerald_ore` | | `Tile.cpp:532` |
| 130 | `ender_chest_Id` | `EnderChestTile` | `enderChest` | | `Tile.cpp:533` |
| 131 | `tripwire_hook_Id` | `TripWireSourceTile` | `trip_wire_source` | | `Tile.cpp:536` |
| 132 | `tripwire_Id` | `TripWireTile` | `trip_wire` | | `Tile.cpp:537` |
| 133 | `emerald_block_Id` | `MetalTile` | `emerald_block` | | `Tile.cpp:538` |
| 134 | `spruce_stairs_Id` | `StairTile` (SPRUCE_TRUNK) | `stairsWoodSpruce` | | `Tile.cpp:539` |
| 135 | `birch_stairs_Id` | `StairTile` (BIRCH_TRUNK) | `stairsWoodBirch` | | `Tile.cpp:540` |
| 136 | `jungle_stairs_Id` | `StairTile` (JUNGLE_TRUNK) | `stairsWoodJungle` | | `Tile.cpp:541` |
| 137 | `command_block_Id` | `CommandBlock` | `command_block` | | `Tile.cpp:542` |
| 138 | `beacon_Id` | `BeaconTile` | `beacon` | | `Tile.cpp:543` |
| 139 | `cobblestone_wall_Id` | `WallTile` | `cobbleWall` | | `Tile.cpp:544` |
| 140 | `flower_pot_Id` | `FlowerPotTile` | `flower_pot` | | `Tile.cpp:545` |
| 141 | `carrots_Id` | `CarrotTile` | `carrots` | | `Tile.cpp:547` |
| 142 | `potatoes_Id` | `PotatoTile` | `potatoes` | | `Tile.cpp:548` |
| 143 | `wooden_button_Id` | `WoodButtonTile` | `button` | | `Tile.cpp:549` |
| 144 | `skull_Id` | `SkullTile` | `skull` | | `Tile.cpp:550` |
| 145 | `anvil_Id` | `AnvilTile` | `anvil` | | `Tile.cpp:551` |
| 146 | `chest_trap_Id` | `ChestTile` (TYPE_TRAP) | *(chest)* | | `Tile.cpp:552` |
| 147 | `light_weighted_pressure_plate_Id` | `WeightedPressurePlateTile` | *(gold_block)* | | `Tile.cpp:553` |
| 148 | `heavy_weighted_pressure_plate_Id` | `WeightedPressurePlateTile` | *(iron_block)* | | `Tile.cpp:554` |
| 149 | `unpowered_comparator_Id` | `ComparatorTile` (off) | `comparator_off` | | `Tile.cpp:555` |
| 150 | `powered_comparator_Id` | `ComparatorTile` (on) | `comparator_on` | | `Tile.cpp:556` |
| 151 | `daylight_detector_Id` | `DaylightDetectorTile` | `daylight_detector` | | `Tile.cpp:558` |
| 152 | `redstone_block_Id` | `PoweredMetalTile` | `redstone_block` | | `Tile.cpp:559` |
| 153 | `quartz_ore_Id` | `OreTile` | `quartz_ore` | | `Tile.cpp:560` |
| 154 | `hopper_Id` | `HopperTile` | `hopper` | | `Tile.cpp:561` |
| 155 | `quartz_block_Id` | `QuartzBlockTile` | `quartz_block` | | `Tile.cpp:562` |
| 156 | `quartz_stairs_Id` | `StairTile` (quartz) | `stairsQuartz` | | `Tile.cpp:563` |
| 157 | `activator_rail_Id` | `PoweredRailTile` | `rail_activator` | | `Tile.cpp:564` |
| 158 | `dropper_Id` | `DropperTile` | `dropper` | | `Tile.cpp:565` |
| 159 | `stained_hardened_clay_Id` | `ColoredTile` (Material::stone) | `hardened_clay_stained` | | `Tile.cpp:566` |
| 160 | `stained_glass_pane_Id` | `StainedGlassPaneBlock` | `glass` | | `Tile.cpp:567` |
| 161 | `leaves2_Id` | `LeafTile2` | `leaves_acacia` | TU25 | `Tile.cpp:399` |
| 162 | `log2_Id` | `TreeTile2` | `log` | TU25 | `Tile.cpp:569` |
| 163 | `acacia_stairs_Id` | `StairTile` (ACACIA_TRUNK) | `stairsWoodAcacia` | TU25 | `Tile.cpp:570` |
| 164 | `dark_oak_stairs_Id` | `StairTile` (DARK_TRUNK) | `stairsWoodDark` | TU25 | `Tile.cpp:571` |
| 165 | `slime_Id` | `SlimeTile` | `slime` | neoLegacy | `Tile.cpp:572` |
| 166 | `barrier_Id` | `BarrierTile` | `barrier` | TU31 | `Tile.cpp:573` |
| 167 | `iron_trapdoor_Id` | `TrapDoorTile` (Material::metal) | `iron_trapdoor` | TU25 | `Tile.cpp:574` |
| 168 | `prismarine_Id` | `PrismarineTile` | `prismarine` | TU31 | `Tile.cpp:607` |
| 169 | `sea_lantern_Id` | `SeaLanternTile` | `glowstone` | TU31 | `Tile.cpp:606` |
| 170 | `hay_block_Id` | `HayBlockTile` | `hay_block` | | `Tile.cpp:576` |
| 171 | `carpet_Id` | `WoolCarpetTile` | `woolCarpet` | | `Tile.cpp:577` |
| 172 | `hardened_clay_Id` | `Tile` (Material::stone) | `hardened_clay` | | `Tile.cpp:578` |
| 173 | `coal_block_Id` | `Tile` (Material::stone) | `coal_block` | | `Tile.cpp:579` |
| 174 | `packed_ice_Id` | `PackedIceTile` | `packed_ice` | TU31 | `Tile.cpp:582` |
| 175 | `double_plant_Id` | `TallGrass2` | `tallgrass2_tall_grass_upper` | TU31 | `Tile.cpp:609` |
| 178 | `daylight_detector_inverted_Id` | `DaylightDetectorTile` (inverted) | `daylight_detector` | TU25 | `Tile.cpp:587` |
| 179 | `red_sandstone_Id` | `RedSandStoneTile` | `red_sandstone` | TU31 | `Tile.cpp:588` |
| 180 | `red_sandstone_stairs_Id` | `StairTile` (red sandstone) | `stairsRedSandstone` | TU31 | `Tile.cpp:589` |
| 181 | `double_stone_slab2_Id` | `FullStoneSlabTile2` | `red_sandstone` | TU31 | `Tile.cpp:590` |
| 182 | `stone_slab2_Id` | `HalfStoneSlabTile2` | `red_sandstone` | TU31 | `Tile.cpp:592` |
| 183 | `spruce_fence_gate_Id` | `FenceGateTile` | `planks_spruce` | TU25 | `Tile.cpp:594` |
| 184 | `birch_fence_gate_Id` | `FenceGateTile` | `planks_birch` | TU25 | `Tile.cpp:595` |
| 185 | `jungle_fence_gate_Id` | `FenceGateTile` | `planks_jungle` | TU25 | `Tile.cpp:596` |
| 186 | `dark_oak_fence_gate_Id` | `FenceGateTile` | `planks_dark` | TU25 | `Tile.cpp:597` |
| 187 | `acacia_fence_gate_Id` | `FenceGateTile` | `planks_acacia` | TU25 | `Tile.cpp:598` |
| 188 | `spruce_fence_Id` | `FenceTile` | *(planks_spruce)* | TU25 | `Tile.cpp:600` |
| 189 | `birch_fence_Id` | `FenceTile` | *(planks_birch)* | TU25 | `Tile.cpp:601` |
| 190 | `jungle_fence_Id` | `FenceTile` | *(planks_jungle)* | TU25 | `Tile.cpp:602` |
| 191 | `dark_oak_fence_Id` | `FenceTile` | *(planks_dark)* | TU25 | `Tile.cpp:603` |
| 192 | `acacia_fence_Id` | `FenceTile` | *(planks_acacia)* | TU25 | `Tile.cpp:604` |
| 193 | `spruce_door_Id` | `DoorTile` (`doorSpruce`) | `spruce_door` | TU25 | `Tile.cpp:457` |
| 194 | `birch_door_Id` | `DoorTile` (`doorBirch`) | `birch_door` | TU25 | `Tile.cpp:458` |
| 195 | `jungle_door_Id` | `DoorTile` (`doorJungle`) | `jungle_door` | TU25 | `Tile.cpp:459` |
| 196 | `acacia_door_Id` | `DoorTile` (`doorAcacia`) | `acacia_door` | TU25 | `Tile.cpp:460` |
| 197 | `dark_oak_door_Id` | `DoorTile` (`doorDark`) | `dark_oak_door` | TU25 | `Tile.cpp:461` |
| 207 | `beetroots_Id` | `BeetrootTile` | `beetroots` | TU31 | `Tile.cpp:583` |
| 208 | `grass_path_Id` | `GrassPathTile` | `grass_path_top` | TU31 | `Tile.cpp:584` |
| 212 | `frosted_ice_Id` | `FrostedIceTile` | `ice` | neoLegacy | `Tile.cpp:585` |

## Notes on gaps and ordering

- **Registration order &ne; ID order.** Blocks 161-197 are assigned across two
  non-contiguous stretches of `staticCtor` (161 at `:399`, 162-175 at `:569-609`,
  193-197 at `:457-461`), so the table above is sorted by ID, not by source line.
- **Unregistered IDs in range.** 176 and 177 are skipped between `double_plant` (175)
  and `daylight_detector_inverted` (178). IDs 198-206 and 209-211 are unused; the next
  live IDs are `beetroots_Id` = 207, `grass_path_Id` = 208, and `frosted_ice_Id` = 212.
- **`sapling2` (id 199) is commented out** in both `Tile.h:228` and `Tile.cpp:384`, so no
  block occupies id 199.
- **Sea lantern (169) and prismarine (168)** are registered *after* the acacia/fence
  block near the end of `staticCtor` (`Tile.cpp:606-607`), out of numeric order.
- **`_sendTileData` / `TILE_NUM_COUNT`.** The `Tile::tiles` array and the per-tile
  net-sync bitfield are sized `TILE_NUM_COUNT = 4096` (`Tile.h:101`), far larger than the
  ~150 live IDs, leaving room for future blocks.
- **Custom block items.** Blocks whose inventory item needs a special class (wool, logs,
  planks, slabs, saplings, leaves, dirt, sand, red sandstone, quartz, etc.) get their
  `Item::items[...]` slot overridden at `Tile.cpp:611-646`. The block ID is unchanged; see
  [Item ID Registry](/slop-docs/reference/item-ids/).

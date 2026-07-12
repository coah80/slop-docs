---
title: Creative Mode Tabs
description: How creative inventory tabs work in LCE and how to modify them.
---

The creative inventory in LCE is split into 8 tabs across the top of the screen. Each tab shows a grid of items that players can pick from. Unlike Java Edition where items register themselves into categories, LCE takes a different approach: every single item in every tab is listed by hand in one big function.

This guide covers everything about how the tab system works, what lives in each tab down to the exact item, and how to change things around.

## The Creative Inventory UI End to End

When a player opens the creative inventory, here is what happens under the hood:

1. The game creates a `UIScene_CreativeMenu` (on PS3/PS Vita) or `CXuiSceneInventoryCreative` (on Xbox 360). Both inherit from `IUIScene_CreativeMenu`, which holds all the shared logic.

2. The constructor calls `initialiseMovie()`, which loads the SWF movie file for the creative menu. The movie name comes from `getMoviePath()`:

```cpp
wstring UIScene_CreativeMenu::getMoviePath()
{
    if(app.GetLocalPlayerCount() > 1)
        return L"CreativeMenuSplit";
    else
        return L"CreativeMenu";
}
```

In splitscreen, it loads a smaller layout (`CreativeMenuSplit`). In single player, it loads the full-size `CreativeMenu`.

3. The SWF file gets loaded at a resolution that matches the output: `CreativeMenu1080.swf`, `CreativeMenu720.swf`, or `CreativeMenu480.swf`. On PS Vita it loads `CreativeMenuVita.swf`. These are compiled Flash (SWF) movies rendered through RAD Game Tools' Iggy library, which acts as a Flash player inside the game.

4. After the movie loads, `mapElementsAndNames()` runs. This wires up the C++ code to named elements inside the SWF. It maps 8 touch panels (`TouchPanel_0` through `TouchPanel_7`) for the tab buttons, a `TouchPanel_Slider` for the scroll bar, a `containerList` for the 50-slot item grid, and two callable functions: `SetActiveTab` and `SetScrollBar`.

5. An `ItemPickerMenu` gets created. This is a special `AbstractContainerMenu` with 50 slots for the item grid plus 9 slots for the hotbar at the bottom.

6. The constructor sets `m_curTab` to `eCreativeInventoryTab_COUNT` (an invalid value) then calls `switchTab(eCreativeInventoryTab_BuildingBlocks)`. Since the current tab differs from the target, `updateTabHighlightAndText()` fires. On Iggy platforms, this calls into the SWF movie using `IggyPlayerCallMethodRS` to run the `SetActiveTab` ActionScript function with the tab index as an argument. The SWF handles highlighting the right tab icon and dimming the rest.

7. The inventory title label gets set to the localized tab name (like "Building Blocks") using `app.GetString(specs[tab]->m_descriptionId)`.

8. `populateMenu()` fills the 50 container slots with the right items for the current page. The Iggy movie's custom draw callback then renders each item's icon into the grid cells.

That is the full pipeline: SWF movie provides the visual layout and tab highlighting, C++ code manages the data and input, and the Iggy library bridges the two.

### The SWF/Iggy Movie System

Every UI screen in LCE on PS3, PS Vita, and PS4 is a compiled Flash movie (`.swf` file). These are not played as video. They are interactive vector-based layouts with named elements that the C++ code can talk to.

The game uses **RAD Game Tools' Iggy** library as the Flash runtime. Iggy loads the SWF, renders it with the game's GPU, and exposes an API for calling ActionScript functions and reading element positions.

Key Iggy API calls used in the creative menu:

| Function | What It Does |
|----------|-------------|
| `IggyPlayerCallMethodRS()` | Calls an ActionScript function in the SWF by name |
| `IggyPlayerRootPath()` | Gets the root path of the movie for element lookup |
| `IggyExternalFunctionCallUTF16` | Handles callbacks from the SWF back to C++ |

The Xbox 360 version uses Microsoft's **XUI** framework instead of Iggy/SWF. XUI scenes are authored in Microsoft's UI tool and use `.xur` binary files. The `CXuiSceneInventoryCreative` class maps tab icons and controls through XUI's `MAP_CONTROL` macros:

```cpp
MAP_CONTROL(IDC_Icon_1, m_hGroupIconA[0])
MAP_CONTROL(IDC_Icon_2, m_hGroupIconA[1])
// ... through ...
MAP_CONTROL(IDC_Icon_8, m_hGroupIconA[7])

MAP_CONTROL(IDC_TabImage1, m_hTabGroupA[0])
MAP_CONTROL(IDC_TabImage2, m_hTabGroupA[1])
// ... through ...
MAP_CONTROL(IDC_TabImage8, m_hTabGroupA[7])
```

Both systems end up doing the same thing: 8 tab buttons, an item grid, a scroll bar, and a hotbar. The shared logic in `IUIScene_CreativeMenu` does not care which UI backend is in use.

## How It All Works

The creative menu lives in `IUIScene_CreativeMenu`, defined in `Minecraft.Client/Common/UI/IUIScene_CreativeMenu.h` and `.cpp`. There are two important layers to understand:

1. **Inventory Groups** are logical buckets of items (like "Building Blocks" or "Redstone" or "Transport")
2. **Tabs** are what the player actually sees on screen. A tab can pull from one or more groups.

For example, the "Redstone & Transport" tab combines the Redstone group and the Transport group into a single tab. The Brewing tab combines the brewing ingredients group with four different potion tier groups.

Everything gets set up in `IUIScene_CreativeMenu::staticCtor()`, which runs once at startup.

## The Two Enums

### Tabs (What the Player Sees)

```cpp
enum ECreativeInventoryTabs
{
    eCreativeInventoryTab_BuildingBlocks = 0,
    eCreativeInventoryTab_Decorations,
    eCreativeInventoryTab_RedstoneAndTransport,
    eCreativeInventoryTab_Materials,
    eCreativeInventoryTab_Food,
    eCreativeInventoryTab_ToolsWeaponsArmor,
    eCreativeInventoryTab_Brewing,
    eCreativeInventoryTab_Misc,
    eCreativeInventoryTab_COUNT,
};
```

There are exactly 8 tabs. The UI has 8 touch panels hardcoded (`TouchPanel_0` through `TouchPanel_7`), so adding a 9th tab means UI work too.

### Groups (Logical Item Buckets)

```cpp
enum ECreative_Inventory_Groups
{
    eCreativeInventory_BuildingBlocks,
    eCreativeInventory_Decoration,
    eCreativeInventory_Redstone,
    eCreativeInventory_Transport,
    eCreativeInventory_Materials,
    eCreativeInventory_Food,
    eCreativeInventory_ToolsArmourWeapons,
    eCreativeInventory_Brewing,
    eCreativeInventory_Potions_Basic,
    eCreativeInventory_Potions_Level2,
    eCreativeInventory_Potions_Extended,
    eCreativeInventory_Potions_Level2_Extended,
    eCreativeInventory_Misc,
    eCreativeInventoryGroupsCount
};
```

There are 13 groups total. Groups are just arrays of `ItemInstance` pointers. A tab references one or more groups and the `TabSpec` system handles stitching them together for display.

## The Grid Layout

Each tab shows a 10-column by 5-row grid, so 50 item slots per page:

```cpp
struct TabSpec
{
    static const int rows = 5;
    static const int columns = 10;
    static const int MAX_SIZE = rows * columns;  // 50
    // ...
};
```

If a tab has more than 50 items, it gets multiple pages. Players scroll between pages with the right stick or the scroll bar on the side.

## The ITEM/ITEM_AUX/DEF Macro System

All item lists in `staticCtor()` are built using three macros defined at the top of the file:

```cpp
#define ITEM(id) list->push_back( \
    shared_ptr<ItemInstance>(new ItemInstance(id, 1, 0)) );
#define ITEM_AUX(id, aux) list->push_back( \
    shared_ptr<ItemInstance>(new ItemInstance(id, 1, aux)) );
#define DEF(index) list = &categoryGroups[index];
```

### DEF(index)

Switches which group you are currently adding items to. The `list` pointer gets reassigned to point at a different vector in the `categoryGroups` array.

```cpp
// From this point on, all ITEM() calls go into the Building Blocks group
DEF(eCreativeInventory_BuildingBlocks)
```

You can call `DEF` as many times as you want. Each call just redirects where `ITEM()` puts things. The groups in the source code are not separated into different functions. They are all in one big block inside `staticCtor()`, with `DEF` calls acting as section dividers.

### ITEM(id)

Creates an `ItemInstance` with the given item/block ID, a stack count of 1, and an aux (damage/data) value of 0. This is what you use for items that only have one variant.

```cpp
ITEM(Tile::stone_Id)      // Stone block, aux 0
ITEM(Item::diamond_Id)    // Diamond item, aux 0
```

### ITEM_AUX(id, aux)

Same as `ITEM()` but lets you set the aux value. The aux value picks which variant of an item/block you want. This is how you get different wood types, dye colors, wool colors, potion types, and mob spawn eggs.

```cpp
ITEM_AUX(Tile::wood_Id, 0)                    // Oak planks
ITEM_AUX(Tile::wood_Id, TreeTile::DARK_TRUNK)  // Spruce planks
ITEM_AUX(Tile::wood_Id, TreeTile::BIRCH_TRUNK) // Birch planks
ITEM_AUX(Item::dye_powder_Id, 4)               // Lapis (blue dye)
ITEM_AUX(Item::spawnEgg_Id, 50)                // Creeper spawn egg
```

### The ItemInstance Constructor

Under the hood, both macros call `new ItemInstance(id, count, aux)`:

- **id**: The numeric item or block ID
- **count**: Always 1 in creative tabs (how many in the stack)
- **aux**: The damage/data value (0 for default variant)

### How the categoryGroups Array Works

The destination for all these items is a static array of vectors:

```cpp
static vector< shared_ptr<ItemInstance> > categoryGroups[eCreativeInventoryGroupsCount];
```

There is one vector per group enum value. When `staticCtor()` runs, each `DEF` call switches the `list` pointer to a different vector, and each `ITEM`/`ITEM_AUX` call appends to that vector. After `staticCtor()` finishes, every group's vector is fully populated and never changes again.

## What's in Each Tab (Complete Item Lists)

Here is every item in every group, in the exact order they appear in the source code. This is the order they show up in the creative grid.

### Building Blocks

| # | Item | Code |
|---|------|------|
| 1 | Stone | `Tile::stone_Id` |
| 2 | Grass Block | `Tile::grass_Id` |
| 3 | Dirt | `Tile::dirt_Id` |
| 4 | Cobblestone | `Tile::cobblestone_Id` |
| 5 | Sand | `Tile::sand_Id` |
| 6 | Sandstone | `Tile::sandStone_Id` |
| 7 | Smooth Sandstone | `Tile::sandStone_Id` aux `TYPE_SMOOTHSIDE` |
| 8 | Chiseled Sandstone | `Tile::sandStone_Id` aux `TYPE_HEIROGLYPHS` |
| 9 | Block of Coal | `Tile::coalBlock_Id` |
| 10 | Block of Gold | `Tile::goldBlock_Id` |
| 11 | Block of Iron | `Tile::ironBlock_Id` |
| 12 | Lapis Lazuli Block | `Tile::lapisBlock_Id` |
| 13 | Diamond Block | `Tile::diamondBlock_Id` |
| 14 | Emerald Block | `Tile::emeraldBlock_Id` |
| 15 | Block of Quartz | `Tile::quartzBlock_Id` aux `TYPE_DEFAULT` |
| 16 | Coal Ore | `Tile::coalOre_Id` |
| 17 | Lapis Lazuli Ore | `Tile::lapisOre_Id` |
| 18 | Diamond Ore | `Tile::diamondOre_Id` |
| 19 | Redstone Ore | `Tile::redStoneOre_Id` |
| 20 | Iron Ore | `Tile::ironOre_Id` |
| 21 | Gold Ore | `Tile::goldOre_Id` |
| 22 | Emerald Ore | `Tile::emeraldOre_Id` |
| 23 | Nether Quartz Ore | `Tile::netherQuartz_Id` |
| 24 | Bedrock | `Tile::unbreakable_Id` |
| 25 | Oak Planks | `Tile::wood_Id` aux 0 |
| 26 | Spruce Planks | `Tile::wood_Id` aux `DARK_TRUNK` |
| 27 | Birch Planks | `Tile::wood_Id` aux `BIRCH_TRUNK` |
| 28 | Jungle Planks | `Tile::wood_Id` aux `JUNGLE_TRUNK` |
| 29 | Oak Log | `Tile::treeTrunk_Id` aux 0 |
| 30 | Spruce Log | `Tile::treeTrunk_Id` aux `DARK_TRUNK` |
| 31 | Birch Log | `Tile::treeTrunk_Id` aux `BIRCH_TRUNK` |
| 32 | Jungle Log | `Tile::treeTrunk_Id` aux `JUNGLE_TRUNK` |
| 33 | Gravel | `Tile::gravel_Id` |
| 34 | Bricks | `Tile::redBrick_Id` |
| 35 | Mossy Cobblestone | `Tile::mossyCobblestone_Id` |
| 36 | Obsidian | `Tile::obsidian_Id` |
| 37 | Clay Block | `Tile::clay` |
| 38 | Ice | `Tile::ice_Id` |
| 39 | Snow Block | `Tile::snow_Id` |
| 40 | Netherrack | `Tile::netherRack_Id` |
| 41 | Soul Sand | `Tile::soulsand_Id` |
| 42 | Glowstone | `Tile::glowstone_Id` |
| 43 | Oak Fence | `Tile::fence_Id` |
| 44 | Nether Brick Fence | `Tile::netherFence_Id` |
| 45 | Iron Bars | `Tile::ironFence_Id` |
| 46 | Cobblestone Wall | `Tile::cobbleWall_Id` aux `TYPE_NORMAL` |
| 47 | Mossy Cobblestone Wall | `Tile::cobbleWall_Id` aux `TYPE_MOSSY` |
| 48 | Stone Bricks | `Tile::stoneBrick_Id` aux `TYPE_DEFAULT` |
| 49 | Mossy Stone Bricks | `Tile::stoneBrick_Id` aux `TYPE_MOSSY` |
| 50 | Cracked Stone Bricks | `Tile::stoneBrick_Id` aux `TYPE_CRACKED` |
| 51 | Chiseled Stone Bricks | `Tile::stoneBrick_Id` aux `TYPE_DETAIL` |
| 52 | Infested Stone | `Tile::monsterStoneEgg_Id` aux `HOST_ROCK` |
| 53 | Infested Cobblestone | `Tile::monsterStoneEgg_Id` aux `HOST_COBBLE` |
| 54 | Infested Stone Bricks | `Tile::monsterStoneEgg_Id` aux `HOST_STONEBRICK` |
| 55 | Mycelium | `Tile::mycel_Id` |
| 56 | Nether Bricks | `Tile::netherBrick_Id` |
| 57 | End Stone | `Tile::endStone_Id` |
| 58 | Chiseled Quartz | `Tile::quartzBlock_Id` aux `TYPE_CHISELED` |
| 59 | Pillar Quartz | `Tile::quartzBlock_Id` aux `TYPE_LINES_Y` |
| 60 | Trapdoor | `Tile::trapdoor_Id` |
| 61 | Fence Gate | `Tile::fenceGate_Id` |
| 62 | Wooden Door | `Item::door_wood_Id` |
| 63 | Iron Door | `Item::door_iron_Id` |
| 64 | Stone Slab | `Tile::stoneSlabHalf_Id` aux `STONE_SLAB` |
| 65 | Sandstone Slab | `Tile::stoneSlabHalf_Id` aux `SAND_SLAB` |
| 66 | Oak Wood Slab | `Tile::woodSlabHalf_Id` aux 0 |
| 67 | Spruce Wood Slab | `Tile::woodSlabHalf_Id` aux `DARK_TRUNK` |
| 68 | Birch Wood Slab | `Tile::woodSlabHalf_Id` aux `BIRCH_TRUNK` |
| 69 | Jungle Wood Slab | `Tile::woodSlabHalf_Id` aux `JUNGLE_TRUNK` |
| 70 | Cobblestone Slab | `Tile::stoneSlabHalf_Id` aux `COBBLESTONE_SLAB` |
| 71 | Brick Slab | `Tile::stoneSlabHalf_Id` aux `BRICK_SLAB` |
| 72 | Stone Brick Slab | `Tile::stoneSlabHalf_Id` aux `SMOOTHBRICK_SLAB` |
| 73 | Nether Brick Slab | `Tile::stoneSlabHalf_Id` aux `NETHERBRICK_SLAB` |
| 74 | Quartz Slab | `Tile::stoneSlabHalf_Id` aux `QUARTZ_SLAB` |
| 75 | Oak Stairs | `Tile::stairs_wood_Id` |
| 76 | Birch Stairs | `Tile::stairs_birchwood_Id` |
| 77 | Spruce Stairs | `Tile::stairs_sprucewood_Id` |
| 78 | Jungle Stairs | `Tile::stairs_junglewood_Id` |
| 79 | Cobblestone Stairs | `Tile::stairs_stone_Id` |
| 80 | Brick Stairs | `Tile::stairs_bricks_Id` |
| 81 | Stone Brick Stairs | `Tile::stairs_stoneBrick_Id` |
| 82 | Nether Brick Stairs | `Tile::stairs_netherBricks_Id` |
| 83 | Sandstone Stairs | `Tile::stairs_sandstone_Id` |
| 84 | Quartz Stairs | `Tile::stairs_quartz_Id` |
| 85 | Hardened Clay | `Tile::clayHardened_Id` |
| 86-101 | Stained Clay (16 colors) | `Tile::clayHardened_colored_Id` aux 0-15 |

The 16 stained clay colors appear in this order: Red (14), Orange (1), Yellow (4), Lime (5), Light Blue (3), Cyan (9), Blue (11), Purple (10), Magenta (2), Pink (6), White (0), Light Gray (8), Gray (7), Black (15), Green (13), Brown (12).

### Decorations

| # | Item | Code |
|---|------|------|
| 1 | Skeleton Skull | `Item::skull_Id` aux `TYPE_SKELETON` |
| 2 | Wither Skeleton Skull | `Item::skull_Id` aux `TYPE_WITHER` |
| 3 | Zombie Head | `Item::skull_Id` aux `TYPE_ZOMBIE` |
| 4 | Steve Head | `Item::skull_Id` aux `TYPE_CHAR` |
| 5 | Creeper Head | `Item::skull_Id` aux `TYPE_CREEPER` |
| 6 | Sponge | `Tile::sponge_Id` |
| 7 | Melon Block | `Tile::melon_Id` |
| 8 | Pumpkin | `Tile::pumpkin_Id` |
| 9 | Jack o'Lantern | `Tile::litPumpkin_Id` |
| 10 | Oak Sapling | `Tile::sapling_Id` aux `TYPE_DEFAULT` |
| 11 | Spruce Sapling | `Tile::sapling_Id` aux `TYPE_EVERGREEN` |
| 12 | Birch Sapling | `Tile::sapling_Id` aux `TYPE_BIRCH` |
| 13 | Jungle Sapling | `Tile::sapling_Id` aux `TYPE_JUNGLE` |
| 14 | Oak Leaves | `Tile::leaves_Id` aux `NORMAL_LEAF` |
| 15 | Spruce Leaves | `Tile::leaves_Id` aux `EVERGREEN_LEAF` |
| 16 | Birch Leaves | `Tile::leaves_Id` aux `BIRCH_LEAF` |
| 17 | Jungle Leaves | `Tile::leaves_Id` aux `JUNGLE_LEAF` |
| 18 | Vines | `Tile::vine` |
| 19 | Lily Pad | `Tile::waterLily_Id` |
| 20 | Torch | `Tile::torch_Id` |
| 21 | Dead Shrub (tall grass) | `Tile::tallgrass_Id` aux `DEAD_SHRUB` |
| 22 | Tall Grass | `Tile::tallgrass_Id` aux `TALL_GRASS` |
| 23 | Fern | `Tile::tallgrass_Id` aux `FERN` |
| 24 | Dead Bush | `Tile::deadBush_Id` |
| 25 | Dandelion | `Tile::flower_Id` |
| 26 | Rose | `Tile::rose_Id` |
| 27 | Brown Mushroom | `Tile::mushroom_brown_Id` |
| 28 | Red Mushroom | `Tile::mushroom_red_Id` |
| 29 | Cactus | `Tile::cactus_Id` |
| 30 | Snow Layer | `Tile::topSnow_Id` |
| 31 | Cobweb | `Tile::web_Id` |
| 32 | Glass Pane | `Tile::thinGlass_Id` |
| 33 | Glass | `Tile::glass_Id` |
| 34 | Painting | `Item::painting_Id` |
| 35 | Item Frame | `Item::itemFrame_Id` |
| 36 | Sign | `Item::sign_Id` |
| 37 | Bookshelf | `Tile::bookshelf_Id` |
| 38 | Flower Pot | `Item::flowerPot_Id` |
| 39 | Hay Bale | `Tile::hayBlock_Id` |
| 40-55 | Wool (16 colors) | `Tile::wool_Id` aux 0-15 |
| 56-71 | Carpet (16 colors) | `Tile::woolCarpet_Id` aux 0-15 |
| 72-87 | Stained Glass (16 colors) | `Tile::stained_glass_Id` aux 0-15 |
| 88-103 | Stained Glass Pane (16 colors) | `Tile::stained_glass_pane_Id` aux 0-15 |

All 16-color sets follow the same color order: Red (14), Orange (1), Yellow (4), Lime (5), Light Blue (3), Cyan (9), Blue (11), Purple (10), Magenta (2), Pink (6), White (0), Light Gray (8), Gray (7), Black (15), Green (13), Brown (12).

**Debug only (ArtToolsDecorations):** When debug art tools are on, this group adds all painting variants as individual items (each with a unique aux value from 1 through `Painting::LAST_VALUE`) plus 8 pre-built firework rockets in various shapes and colors.

### Redstone

| # | Item | Code |
|---|------|------|
| 1 | Dispenser | `Tile::dispenser_Id` |
| 2 | Note Block | `Tile::noteblock_Id` |
| 3 | Piston | `Tile::pistonBase_Id` |
| 4 | Sticky Piston | `Tile::pistonStickyBase_Id` |
| 5 | TNT | `Tile::tnt_Id` |
| 6 | Lever | `Tile::lever_Id` |
| 7 | Stone Button | `Tile::button_stone_Id` |
| 8 | Wooden Button | `Tile::button_wood_Id` |
| 9 | Stone Pressure Plate | `Tile::pressurePlate_stone_Id` |
| 10 | Wooden Pressure Plate | `Tile::pressurePlate_wood_Id` |
| 11 | Redstone Dust | `Item::redStone_Id` |
| 12 | Block of Redstone | `Tile::redstoneBlock_Id` |
| 13 | Redstone Torch | `Tile::redstoneTorch_on_Id` |
| 14 | Redstone Repeater | `Item::repeater_Id` |
| 15 | Redstone Lamp | `Tile::redstoneLight_Id` |
| 16 | Tripwire Hook | `Tile::tripWireSource_Id` |
| 17 | Daylight Sensor | `Tile::daylightDetector_Id` |
| 18 | Dropper | `Tile::dropper_Id` |
| 19 | Hopper | `Tile::hopper_Id` |
| 20 | Redstone Comparator | `Item::comparator_Id` |
| 21 | Trapped Chest | `Tile::chest_trap_Id` |
| 22 | Heavy Weighted Pressure Plate | `Tile::weightedPlate_heavy_Id` |
| 23 | Light Weighted Pressure Plate | `Tile::weightedPlate_light_Id` |

### Transport

| # | Item | Code |
|---|------|------|
| 1 | Rail | `Tile::rail_Id` |
| 2 | Powered Rail | `Tile::goldenRail_Id` |
| 3 | Detector Rail | `Tile::detectorRail_Id` |
| 4 | Activator Rail | `Tile::activatorRail_Id` |
| 5 | Ladder | `Tile::ladder_Id` |
| 6 | Minecart | `Item::minecart_Id` |
| 7 | Minecart with Chest | `Item::minecart_chest_Id` |
| 8 | Minecart with Furnace | `Item::minecart_furnace_Id` |
| 9 | Minecart with Hopper | `Item::minecart_hopper_Id` |
| 10 | Minecart with TNT | `Item::minecart_tnt_Id` |
| 11 | Saddle | `Item::saddle_Id` |
| 12 | Boat | `Item::boat_Id` |

The **Redstone & Transport** tab shows Transport group items first, then Redstone group items. This is because the `TabSpec` is created with `{eCreativeInventory_Transport, eCreativeInventory_Redstone}` in that order.

### Materials

| # | Item | Code |
|---|------|------|
| 1 | Coal | `Item::coal_Id` |
| 2 | Charcoal | `Item::coal_Id` aux 1 |
| 3 | Diamond | `Item::diamond_Id` |
| 4 | Emerald | `Item::emerald_Id` |
| 5 | Iron Ingot | `Item::ironIngot_Id` |
| 6 | Gold Ingot | `Item::goldIngot_Id` |
| 7 | Nether Quartz | `Item::netherQuartz_Id` |
| 8 | Brick | `Item::brick_Id` |
| 9 | Nether Brick | `Item::netherbrick_Id` |
| 10 | Stick | `Item::stick_Id` |
| 11 | Bowl | `Item::bowl_Id` |
| 12 | Bone | `Item::bone_Id` |
| 13 | String | `Item::string_Id` |
| 14 | Feather | `Item::feather_Id` |
| 15 | Flint | `Item::flint_Id` |
| 16 | Leather | `Item::leather_Id` |
| 17 | Gunpowder | `Item::gunpowder_Id` |
| 18 | Clay Ball | `Item::clay_Id` |
| 19 | Glowstone Dust | `Item::yellowDust_Id` |
| 20 | Wheat Seeds | `Item::seeds_wheat_Id` |
| 21 | Melon Seeds | `Item::seeds_melon_Id` |
| 22 | Pumpkin Seeds | `Item::seeds_pumpkin_Id` |
| 23 | Wheat | `Item::wheat_Id` |
| 24 | Sugar Cane | `Item::reeds_Id` |
| 25 | Egg | `Item::egg_Id` |
| 26 | Sugar | `Item::sugar_Id` |
| 27 | Slime Ball | `Item::slimeBall_Id` |
| 28 | Blaze Rod | `Item::blazeRod_Id` |
| 29 | Gold Nugget | `Item::goldNugget_Id` |
| 30 | Nether Wart | `Item::netherwart_seeds_Id` |
| 31-46 | Dye (16 colors) | `Item::dye_powder_Id` aux values |

The 16 dye colors appear in this order: Red (1), Orange (14), Yellow (11), Lime (10), Light Blue (12), Cyan (6), Blue/Lapis (4), Purple (5), Magenta (13), Pink (9), Bone Meal (15), Light Gray (7), Gray (8), Ink Sac/Black (0), Green (2), Cocoa/Brown (3).

Note: Dye aux values are inverted compared to wool/carpet. Wool Red is aux 14, but Dye Red is aux 1. This is just how Minecraft handles dye colors internally.

### Food

| # | Item | Code |
|---|------|------|
| 1 | Apple | `Item::apple_Id` |
| 2 | Golden Apple | `Item::apple_gold_Id` |
| 3 | Enchanted Golden Apple | `Item::apple_gold_Id` aux 1 |
| 4 | Melon Slice | `Item::melon_Id` |
| 5 | Mushroom Stew | `Item::mushroomStew_Id` |
| 6 | Bread | `Item::bread_Id` |
| 7 | Cake | `Item::cake_Id` |
| 8 | Cookie | `Item::cookie_Id` |
| 9 | Cooked Fish | `Item::fish_cooked_Id` |
| 10 | Raw Fish | `Item::fish_raw_Id` |
| 11 | Cooked Porkchop | `Item::porkChop_cooked_Id` |
| 12 | Raw Porkchop | `Item::porkChop_raw_Id` |
| 13 | Steak | `Item::beef_cooked_Id` |
| 14 | Raw Beef | `Item::beef_raw_Id` |
| 15 | Raw Chicken | `Item::chicken_raw_Id` |
| 16 | Cooked Chicken | `Item::chicken_cooked_Id` |
| 17 | Rotten Flesh | `Item::rotten_flesh_Id` |
| 18 | Spider Eye | `Item::spiderEye_Id` |
| 19 | Potato | `Item::potato_Id` |
| 20 | Baked Potato | `Item::potatoBaked_Id` |
| 21 | Poisonous Potato | `Item::potatoPoisonous_Id` |
| 22 | Carrot | `Item::carrots_Id` |
| 23 | Golden Carrot | `Item::carrotGolden_Id` |
| 24 | Pumpkin Pie | `Item::pumpkinPie_Id` |

### Tools, Weapons & Armor

This group is organized in tiers. Each tier gets a full armor set, then a full tool/weapon set laid out together. There are also "spacer" items (compass, empty map, bow, arrow, flint and steel) that visually separate each tier on the 10-column grid.

| # | Item | Code |
|---|------|------|
| 1 | Compass | `Item::compass_Id` |
| 2 | Leather Helmet | `Item::helmet_leather_Id` |
| 3 | Leather Chestplate | `Item::chestplate_leather_Id` |
| 4 | Leather Leggings | `Item::leggings_leather_Id` |
| 5 | Leather Boots | `Item::boots_leather_Id` |
| 6 | Wooden Sword | `Item::sword_wood_Id` |
| 7 | Wooden Shovel | `Item::shovel_wood_Id` |
| 8 | Wooden Pickaxe | `Item::pickAxe_wood_Id` |
| 9 | Wooden Axe | `Item::hatchet_wood_Id` |
| 10 | Wooden Hoe | `Item::hoe_wood_Id` |
| 11 | Empty Map | `Item::emptyMap_Id` |
| 12 | Chain Helmet | `Item::helmet_chain_Id` |
| 13 | Chain Chestplate | `Item::chestplate_chain_Id` |
| 14 | Chain Leggings | `Item::leggings_chain_Id` |
| 15 | Chain Boots | `Item::boots_chain_Id` |
| 16 | Stone Sword | `Item::sword_stone_Id` |
| 17 | Stone Shovel | `Item::shovel_stone_Id` |
| 18 | Stone Pickaxe | `Item::pickAxe_stone_Id` |
| 19 | Stone Axe | `Item::hatchet_stone_Id` |
| 20 | Stone Hoe | `Item::hoe_stone_Id` |
| 21 | Bow | `Item::bow_Id` |
| 22 | Iron Helmet | `Item::helmet_iron_Id` |
| 23 | Iron Chestplate | `Item::chestplate_iron_Id` |
| 24 | Iron Leggings | `Item::leggings_iron_Id` |
| 25 | Iron Boots | `Item::boots_iron_Id` |
| 26 | Iron Sword | `Item::sword_iron_Id` |
| 27 | Iron Shovel | `Item::shovel_iron_Id` |
| 28 | Iron Pickaxe | `Item::pickAxe_iron_Id` |
| 29 | Iron Axe | `Item::hatchet_iron_Id` |
| 30 | Iron Hoe | `Item::hoe_iron_Id` |
| 31 | Arrow | `Item::arrow_Id` |
| 32 | Gold Helmet | `Item::helmet_gold_Id` |
| 33 | Gold Chestplate | `Item::chestplate_gold_Id` |
| 34 | Gold Leggings | `Item::leggings_gold_Id` |
| 35 | Gold Boots | `Item::boots_gold_Id` |
| 36 | Gold Sword | `Item::sword_gold_Id` |
| 37 | Gold Shovel | `Item::shovel_gold_Id` |
| 38 | Gold Pickaxe | `Item::pickAxe_gold_Id` |
| 39 | Gold Axe | `Item::hatchet_gold_Id` |
| 40 | Gold Hoe | `Item::hoe_gold_Id` |
| 41 | Flint and Steel | `Item::flintAndSteel_Id` |
| 42 | Diamond Helmet | `Item::helmet_diamond_Id` |
| 43 | Diamond Chestplate | `Item::chestplate_diamond_Id` |
| 44 | Diamond Leggings | `Item::leggings_diamond_Id` |
| 45 | Diamond Boots | `Item::boots_diamond_Id` |
| 46 | Diamond Sword | `Item::sword_diamond_Id` |
| 47 | Diamond Shovel | `Item::shovel_diamond_Id` |
| 48 | Diamond Pickaxe | `Item::pickAxe_diamond_Id` |
| 49 | Diamond Axe | `Item::hatchet_diamond_Id` |
| 50 | Diamond Hoe | `Item::hoe_diamond_Id` |
| 51 | Fire Charge | `Item::fireball_Id` |
| 52 | Clock | `Item::clock_Id` |
| 53 | Shears | `Item::shears_Id` |
| 54 | Fishing Rod | `Item::fishingRod_Id` |
| 55 | Carrot on a Stick | `Item::carrotOnAStick_Id` |
| 56 | Lead | `Item::lead_Id` |
| 57 | Diamond Horse Armor | `Item::horseArmorDiamond_Id` |
| 58 | Gold Horse Armor | `Item::horseArmorGold_Id` |
| 59 | Iron Horse Armor | `Item::horseArmorMetal_Id` |
| 60+ | Enchanted Books (dynamic) | One per enchantment at max level |

The enchanted books are generated in a loop at the end. It goes through every enchantment in `Enchantment::enchantments`, skips null entries and ones without a category, then creates an enchanted book at that enchantment's max level. The exact number depends on how many enchantments are registered.

```cpp
for(unsigned int i = 0; i < Enchantment::enchantments.length; ++i)
{
    Enchantment *enchantment = Enchantment::enchantments[i];
    if (enchantment == nullptr || enchantment->category == nullptr) continue;
    list->push_back(
        Item::enchantedBook->createForEnchantment(
            new EnchantmentInstance(enchantment, enchantment->getMaxLevel())
        )
    );
}
```

**Debug only:** When debug settings are on, a special "Sword of Debug" gets added. It is a diamond sword with Sharpness 50 and a custom hover name.

### Brewing

This tab pulls from 5 groups total: the main Brewing group plus 4 potion tier groups.

**Brewing Ingredients (eCreativeInventory_Brewing):**

| # | Item | Code |
|---|------|------|
| 1 | Bottle o' Enchanting | `Item::expBottle_Id` |
| 2 | Ghast Tear | `Item::ghastTear_Id` |
| 3 | Fermented Spider Eye | `Item::fermentedSpiderEye_Id` |
| 4 | Blaze Powder | `Item::blazePowder_Id` |
| 5 | Magma Cream | `Item::magmaCream_Id` |
| 6 | Glistering Melon | `Item::speckledMelon_Id` |
| 7 | Glass Bottle | `Item::glassBottle_Id` |
| 8 | Water Bottle | `Item::potion_Id` aux 0 |

**Potions Basic (eCreativeInventory_Potions_Basic):**

Drinkable potions first, then their splash variants:

| Potion | Drinkable | Splash |
|--------|-----------|--------|
| Regeneration | Yes | Yes |
| Speed | Yes | Yes |
| Poison | Yes | Yes |
| Instant Health | Yes | Yes |
| Strength | Yes | Yes |
| Instant Damage | Yes | Yes |

Fire Resistance, Weakness, and Slowness are not in this tier. They show up in Level 2 instead.

**Potions Level 2 (eCreativeInventory_Potions_Level2):**

| Potion | Drinkable | Splash |
|--------|-----------|--------|
| Regeneration II | Yes | Yes |
| Speed II | Yes | Yes |
| Fire Resistance (base) | Yes | Yes |
| Poison II | Yes | Yes |
| Weakness (base) | Yes | Yes |
| Strength II | Yes | Yes |
| Slowness (base) | Yes | Yes |

Fire Resistance, Weakness, and Slowness appear here at base level because they cannot be upgraded to Level 2, but 4J grouped them with the Level 2 potions.

**Potions Extended (eCreativeInventory_Potions_Extended):**

| Potion | Drinkable | Splash |
|--------|-----------|--------|
| Regeneration (extended) | Yes | Yes |
| Speed (extended) | Yes | Yes |
| Poison (extended) | Yes | Yes |
| Night Vision (base) | Yes | Yes |
| Invisibility (base) | Yes | Yes |
| Strength (extended) | Yes | Yes |

Night Vision and Invisibility appear here (not in Basic) because they do not have a "weak" base variant. The 4J devs moved them here with a comment: `// 4J- Moved here as there isn't a weak variant of this potion.`

**Potions Level 2 Extended (eCreativeInventory_Potions_Level2_Extended):**

| Potion | Drinkable | Splash |
|--------|-----------|--------|
| Regeneration II Extended | Yes | Yes |
| Speed II Extended | Yes | Yes |
| Fire Resistance (extended) | Yes | Yes |
| Poison II Extended | Yes | Yes |
| Instant Health II | Yes | Yes |
| Night Vision (extended) | Yes | Yes |
| Invisibility (extended) | Yes | Yes |
| Weakness (extended) | Yes | Yes |
| Strength II Extended | Yes | Yes |
| Slowness (extended) | Yes | Yes |
| Instant Damage II | Yes | Yes |

This is the "everything" tier. It has the strongest and longest-lasting versions of all potions.

#### How Potion Aux Values Work

Potions use a macro to build their aux value from three parts:

```cpp
#define MACRO_MAKEPOTION_AUXVAL(potion_type, potion_strength, potion_effect) \
    (potion_type | potion_strength | potion_effect)
```

The three parts are OR'd together as bit flags:

| Part | Values | Hex |
|------|--------|-----|
| **Type** | Normal = 0, Splash = `MASK_SPLASH` | `0x0000` or `0x4000` |
| **Strength** | Regular = 0, Level 2 = `MASK_LEVEL2`, Extended = `MASK_EXTENDED`, Both = `MASK_LEVEL2EXTENDED` | `0x0000`, `0x0020`, `0x0040`, `0x0060` |
| **Effect** | Regeneration = `0x2001`, Speed = `0x2002`, Fire Resistance = `0x2003`, etc. | `0x2001`-`0x200E` |

All functional potions have bit 13 (`0x2000`) set. This stops nether wart from "resetting" them during brewing. The effect ID occupies the lower bits.

So a Splash Potion of Speed II would be: `0x4000 | 0x0020 | 0x2002` = `0x6022`.

### Miscellaneous

| # | Item | Code |
|---|------|------|
| 1 | Chest | `Tile::chest_Id` |
| 2 | Ender Chest | `Tile::enderChest_Id` |
| 3 | Crafting Table | `Tile::workBench_Id` |
| 4 | Furnace | `Tile::furnace_Id` |
| 5 | Brewing Stand | `Item::brewingStand_Id` |
| 6 | Enchanting Table | `Tile::enchantTable_Id` |
| 7 | Beacon | `Tile::beacon_Id` |
| 8 | End Portal Frame | `Tile::endPortalFrameTile_Id` |
| 9 | Jukebox | `Tile::jukebox_Id` |
| 10 | Anvil | `Tile::anvil_Id` |
| 11 | Bed | `Item::bed_Id` |
| 12 | Empty Bucket | `Item::bucket_empty_Id` |
| 13 | Lava Bucket | `Item::bucket_lava_Id` |
| 14 | Water Bucket | `Item::bucket_water_Id` |
| 15 | Milk Bucket | `Item::bucket_milk_Id` |
| 16 | Cauldron | `Item::cauldron_Id` |
| 17 | Snowball | `Item::snowBall_Id` |
| 18 | Paper | `Item::paper_Id` |
| 19 | Book | `Item::book_Id` |
| 20 | Ender Pearl | `Item::enderPearl_Id` |
| 21 | Eye of Ender | `Item::eyeOfEnder_Id` |
| 22 | Name Tag | `Item::nameTag_Id` |
| 23 | Nether Star | `Item::netherStar_Id` |
| 24 | Creeper Spawn Egg | `Item::spawnEgg_Id` aux 50 |
| 25 | Skeleton Spawn Egg | `Item::spawnEgg_Id` aux 51 |
| 26 | Spider Spawn Egg | `Item::spawnEgg_Id` aux 52 |
| 27 | Zombie Spawn Egg | `Item::spawnEgg_Id` aux 54 |
| 28 | Slime Spawn Egg | `Item::spawnEgg_Id` aux 55 |
| 29 | Ghast Spawn Egg | `Item::spawnEgg_Id` aux 56 |
| 30 | Zombie Pigman Spawn Egg | `Item::spawnEgg_Id` aux 57 |
| 31 | Enderman Spawn Egg | `Item::spawnEgg_Id` aux 58 |
| 32 | Cave Spider Spawn Egg | `Item::spawnEgg_Id` aux 59 |
| 33 | Silverfish Spawn Egg | `Item::spawnEgg_Id` aux 60 |
| 34 | Blaze Spawn Egg | `Item::spawnEgg_Id` aux 61 |
| 35 | Magma Cube Spawn Egg | `Item::spawnEgg_Id` aux 62 |
| 36 | Bat Spawn Egg | `Item::spawnEgg_Id` aux 65 |
| 37 | Witch Spawn Egg | `Item::spawnEgg_Id` aux 66 |
| 38 | Pig Spawn Egg | `Item::spawnEgg_Id` aux 90 |
| 39 | Sheep Spawn Egg | `Item::spawnEgg_Id` aux 91 |
| 40 | Cow Spawn Egg | `Item::spawnEgg_Id` aux 92 |
| 41 | Chicken Spawn Egg | `Item::spawnEgg_Id` aux 93 |
| 42 | Squid Spawn Egg | `Item::spawnEgg_Id` aux 94 |
| 43 | Wolf Spawn Egg | `Item::spawnEgg_Id` aux 95 |
| 44 | Mooshroom Spawn Egg | `Item::spawnEgg_Id` aux 96 |
| 45 | Ocelot Spawn Egg | `Item::spawnEgg_Id` aux 98 |
| 46 | Horse Spawn Egg | `Item::spawnEgg_Id` aux 100 |
| 47 | Donkey Spawn Egg | `Item::spawnEgg_Id` aux `100 \| ((TYPE_DONKEY+1) << 12)` |
| 48 | Mule Spawn Egg | `Item::spawnEgg_Id` aux `100 \| ((TYPE_MULE+1) << 12)` |
| 49 | Villager Spawn Egg | `Item::spawnEgg_Id` aux 120 |
| 50 | Music Disc (13) | `Item::record_01_Id` |
| 51 | Music Disc (cat) | `Item::record_02_Id` |
| 52 | Music Disc (blocks) | `Item::record_03_Id` |
| 53 | Music Disc (chirp) | `Item::record_04_Id` |
| 54 | Music Disc (far) | `Item::record_05_Id` |
| 55 | Music Disc (mall) | `Item::record_06_Id` |
| 56 | Music Disc (mellohi) | `Item::record_07_Id` |
| 57 | Music Disc (stal) | `Item::record_08_Id` |
| 58 | Music Disc (strad) | `Item::record_09_Id` |
| 59 | Music Disc (ward) | `Item::record_10_Id` |
| 60 | Music Disc (11) | `Item::record_11_Id` |
| 61 | Music Disc (wait) | `Item::record_12_Id` |
| 62-66 | Firework Rockets (5 variants) | Pre-built with `BuildFirework()` |

The 5 firework rockets at the end are built programmatically using the `BuildFirework()` helper. Each one has different shapes, colors, flight durations, and effects:

1. Small burst, light blue, flight 1, flicker
2. Creeper shape, green, flight 2
3. Max size (no shape), red, flight 2, orange fade
4. Burst, magenta, flight 3, flicker, blue fade
5. Star shape, yellow, flight 2, trail, orange fade

**Debug only (ArtToolsMisc):** When debug art tools are on, this group adds skeleton horse, zombie horse, 3 cat variants (black, red, siamese), a spider jockey, and an ender dragon spawn egg.

#### How Spawn Egg Aux Values Work

Regular mob spawn eggs just use the entity type ID as the aux value (like 50 for Creeper, 90 for Pig).

Horse variants use a special encoding. The base horse type ID is 100, and the variant is packed into the upper bits:

```cpp
// Donkey: base ID 100, variant TYPE_DONKEY (1), shifted left 12 bits
ITEM_AUX(Item::spawnEgg_Id, 100 | ((EntityHorse::TYPE_DONKEY + 1) << 12))
// Result: 100 | (2 << 12) = 100 | 8192 = 8292
```

The `+1` offset means 0 in the upper bits means "no variant specified" (regular horse). The debug spawn eggs for skeleton and zombie horses follow the same pattern.

## How Tabs Reference Groups

After all the groups are populated, `staticCtor()` creates `TabSpec` objects that wire groups to tabs:

```cpp
specs = new TabSpec*[eCreativeInventoryTab_COUNT];

// Simple: one group, one tab
ECreative_Inventory_Groups blocksGroup[] = {eCreativeInventory_BuildingBlocks};
specs[eCreativeInventoryTab_BuildingBlocks] =
    new TabSpec(L"Structures", IDS_GROUPNAME_BUILDING_BLOCKS,
                1, blocksGroup);

// Combined: two groups merged into one tab
ECreative_Inventory_Groups redAndTranGroup[] = {
    eCreativeInventory_Transport,
    eCreativeInventory_Redstone
};
specs[eCreativeInventoryTab_RedstoneAndTransport] =
    new TabSpec(L"RedstoneAndTransport", IDS_GROUPNAME_REDSTONE_AND_TRANSPORT,
                2, redAndTranGroup);
```

The `TabSpec` constructor takes:

| Parameter | What it does |
|-----------|-------------|
| `icon` | Wide string name used for the tab icon lookup |
| `descriptionId` | String ID for the tab label text |
| `staticGroupsCount` | How many groups this tab pulls from |
| `staticGroups` | Array of group enum values |
| `dynamicGroupsCount` | Groups that cycle with LT (unused in current builds, defaults to 0) |
| `dynamicGroups` | Array of dynamic group enum values (defaults to nullptr) |
| `debugGroupsCount` | Number of debug-only groups (defaults to 0) |
| `debugGroups` | Array of debug group enum values (defaults to nullptr) |

Here is the full tab-to-group mapping as it appears in the source:

| Tab | Groups | Notes |
|-----|--------|-------|
| Building Blocks | `BuildingBlocks` | 1 group |
| Decorations | `Decoration` + debug: `ArtToolsDecorations` | Debug group only shows in dev builds |
| Redstone & Transport | `Transport`, `Redstone` | Transport items appear first |
| Materials | `Materials` | 1 group |
| Food | `Food` | 1 group |
| Tools | `ToolsArmourWeapons` | 1 group |
| Brewing | `Brewing`, `Potions_Level2_Extended`, `Potions_Extended`, `Potions_Level2`, `Potions_Basic` | 5 groups, strongest potions first |
| Misc | `Misc` + debug: `ArtToolsMisc` | Debug group only shows in dev builds |

Notice the Brewing tab lists the potion groups in reverse order: Level 2 Extended first, then Extended, then Level 2, then Basic. This means when you scroll through the Brewing tab, you see ingredients first, then the strongest potions, working down to the basic ones.

When a tab is selected, `TabSpec::populateMenu()` fills the 50-slot grid from its assigned groups, handling pagination automatically.

## Tab Icons and Display

Each tab has an icon name (the first parameter of `TabSpec`) and a localized description string. The icon names map to UI assets:

| Tab | Icon Name | Description String ID |
|-----|-----------|----------------------|
| Building Blocks | `L"Structures"` | `IDS_GROUPNAME_BUILDING_BLOCKS` |
| Decorations | `L"Decoration"` | `IDS_GROUPNAME_DECORATIONS` |
| Redstone & Transport | `L"RedstoneAndTransport"` | `IDS_GROUPNAME_REDSTONE_AND_TRANSPORT` |
| Materials | `L"Materials"` | `IDS_GROUPNAME_MATERIALS` |
| Food | `L"Food"` | `IDS_GROUPNAME_FOOD` |
| Tools | `L"Tools"` | `IDS_GROUPNAME_TOOLS_WEAPONS_ARMOR` |
| Brewing | `L"Brewing"` | `IDS_GROUPNAME_POTIONS_480` |
| Misc | `L"Misc"` | `IDS_GROUPNAME_MISCELLANEOUS` |

The active tab gets highlighted through the `SetActiveTab` function call to the Iggy/XUI movie. On Iggy platforms, this works like:

```cpp
void UIScene_CreativeMenu::updateTabHighlightAndText(ECreativeInventoryTabs tab)
{
    IggyDataValue value[1];
    value[0].type = IGGY_DATATYPE_number;
    value[0].number = static_cast<F64>(tab);
    IggyPlayerCallMethodRS(getMovie(), &result,
        IggyPlayerRootPath(getMovie()), m_funcSetActiveTab, 1, value);

    m_labelInventory.setLabel(app.GetString(specs[tab]->m_descriptionId));
}
```

The SWF receives the tab index (0 through 7) and handles the visual highlight. The tab label text appears as the inventory title (where it would normally say "Inventory" in the survival menu).

On Xbox 360/XUI, tab highlighting works through the `CXuiControl` tab image arrays instead. Each tab icon and tab image control gets toggled based on the active tab index.

## The Pagination System

When a tab has more items than fit in the 5x10 grid, pagination kicks in. But it does not work in full "pages" of 50 like you might expect. Instead, it scrolls by one row at a time.

### How Page Count Is Calculated

```cpp
m_staticPerPage = columns; // 10 (one row of scrolling)
const int totalRows = (m_staticItems + columns - 1) / columns;
m_pages = std::max<int>(1, totalRows - 5 + 1);
```

The page count equals the total number of rows minus 4 (since 5 rows are visible). So if a tab has 103 items, that is `ceil(103 / 10) = 11` rows, giving `11 - 5 + 1 = 7` pages. Each "page" scrolls the view down by exactly one row (10 items).

This means:
- Page 0 shows rows 1-5 (items 1-50)
- Page 1 shows rows 2-6 (items 11-60)
- Page 2 shows rows 3-7 (items 21-70)
- And so on...

### How populateMenu() Fills Slots

The `populateMenu()` method is the workhorse. Here is how it works step by step:

1. If the tab has dynamic groups (unused in current builds), those items fill from the beginning of the grid.

2. For static groups, it calculates the start index: `page * m_staticPerPage` (page number times 10). So page 0 starts at item 0, page 1 at item 10, page 2 at item 20.

3. It walks through the group arrays to find which group and which item within that group corresponds to the start index. For tabs with multiple groups, the items flow from one group into the next.

4. It fills slots sequentially until it hits 50 or runs out of items.

5. Any leftover slots get cleared (set to null) so you do not see stale items.

6. In debug builds, if debug art tools are on, debug group items fill any remaining empty slots after the static items.

### Navigation Controls

Players can scroll pages in three ways:

| Input | Action |
|-------|--------|
| Right stick up/down | Scroll one row up or down |
| Scroll bar drag | Jump to any page based on vertical position |
| LT button | Cycle dynamic groups (unused in current builds, was originally for potion tier cycling) |

The scroll bar position is sent to the SWF movie via the `SetScrollBar` function:

```cpp
void UIScene_CreativeMenu::updateScrollCurrentPage(int currentPage, int pageCount)
{
    IggyDataValue value[2];
    value[0].type = IGGY_DATATYPE_number;
    value[0].number = static_cast<F64>(pageCount);
    value[1].type = IGGY_DATATYPE_number;
    value[1].number = static_cast<F64>(currentPage) - 1;
    IggyPlayerCallMethodRS(getMovie(), &result,
        IggyPlayerRootPath(getMovie()), m_funcSetScrollBar, 2, value);
}
```

On PS Vita, the scroll bar also supports touch input. Dragging your finger on the `TouchPanel_Slider` area calculates the relative position and jumps to the matching page.

## How Search Works in Creative Mode

LCE's creative mode **does not have a search tab**. Unlike Java Edition (which has a search bar in the creative inventory starting from 1.3), LCE never added search. If you want to find a specific item, you have to know which tab it is in and scroll to it.

This is one of the bigger differences from Java Edition's creative inventory. Java has a dedicated search tab where you can type to filter all items. LCE keeps things simpler with just the 8 fixed tabs and manual browsing.

## How the Survival Inventory Tab Differs

In Java Edition, the creative inventory has a "Survival Inventory" tab that shows your regular 2x2 crafting grid and armor slots. LCE does not do this.

In LCE, the creative inventory screen (`UIScene_CreativeMenu` / `CXuiSceneInventoryCreative`) and the survival inventory screen (`UIScene_InventoryMenu`) are completely separate UI scenes with different SWF movies and different C++ classes. They do not share tabs or a tab bar.

The creative menu shows:
- 8 category tabs across the top
- A 10x5 item selection grid
- A 9-slot hotbar at the bottom

The survival inventory shows:
- A 2x2 crafting grid
- Armor slots
- The full 4x9 player inventory
- No creative tabs at all

When a player in creative mode opens their inventory, the game checks the game mode and opens the creative scene. When a player in survival mode opens their inventory, it opens the survival scene. There is no way to switch between them from inside the UI.

The creative menu also has a special behavior with the X button: pressing it clears the entire hotbar. This is handled in `handleValidKeyPress()`:

```cpp
if(buttonNum == 1) // X button
{
    for(unsigned int i = TabSpec::MAX_SIZE; i < TabSpec::MAX_SIZE + 9; ++i)
    {
        shared_ptr<ItemInstance> newItem = m_menu->getSlot(i)->getItem();
        if(newItem != nullptr)
        {
            m_menu->getSlot(i)->set(nullptr);
            pMinecraft->localgameModes[iPad]->handleCreativeModeItemAdd(
                nullptr, i - (int)m_menu->slots.size() + 9 + InventoryMenu::USE_ROW_SLOT_START);
        }
    }
}
```

## How to Reorder Items Within a Tab

Items show up in the grid in the exact order you list them in `staticCtor()`. To reorder items, just move the `ITEM()` or `ITEM_AUX()` lines around.

For example, to put Diamond Ore before Coal Ore in Building Blocks:

```cpp
DEF(eCreativeInventory_BuildingBlocks)
    ITEM(Tile::stone_Id)
    // ... other items ...
    ITEM(Tile::diamondOre_Id)    // moved up
    ITEM(Tile::coalOre_Id)       // moved down
    ITEM(Tile::lapisOre_Id)
```

Keep in mind that the 10-column grid means position matters visually. Items at positions 1-10 fill the first row, 11-20 fill the second row, and so on. If you want to line up related items in columns, you might need to add or remove items before them to shift things around.

The Tools tab uses this trick nicely. Each armor/tool tier takes exactly 10 items (1 spacer + 4 armor + 5 tools), so each tier fills exactly one row on the grid. The spacer items (compass, empty map, bow, arrow, flint and steel) are not random. They are placed at the start of each row so the tiers line up perfectly.

## Moving Items Between Tabs

Just cut the `ITEM()` line from one group's section and paste it into another. There is no registration system to update. The item only exists in whatever group you put it in.

Want sponge in Building Blocks instead of Decorations? Remove it from the Decoration `DEF` block and add it to the Building Blocks `DEF` block. Done.

An item can exist in more than one tab too. Just add the same `ITEM()` call in multiple groups. The creative inventory creates new `ItemInstance` objects per group, so there is no conflict.

## Adding Your Custom Item to an Existing Tab

The simplest mod: just add your item to a group. Open `IUIScene_CreativeMenu.cpp`, find the group you want, and add a line.

Say you made a Ruby item (ID 407) and want it in the Materials tab:

```cpp
// Inside staticCtor(), in the Materials group section:
DEF(eCreativeInventory_Materials)
    ITEM(Item::coal_Id)
    ITEM_AUX(Item::coal_Id, 1)
    ITEM(Item::diamond_Id)
    ITEM(Item::emerald_Id)
    ITEM(Item::ruby_Id)           // <-- your new item
    ITEM(Item::ironIngot_Id)
    // ...
```

Order matters. Items show up in the grid in the exact order you list them.

For a new block, same deal. Say you added a Ruby Ore tile:

```cpp
DEF(eCreativeInventory_BuildingBlocks)
    // ... existing ores ...
    ITEM(Tile::emeraldOre_Id)
    ITEM(Tile::rubyOre_Id)        // <-- your new block
    ITEM(Tile::netherQuartz_Id)
```

For items with variants, use `ITEM_AUX()`:

```cpp
// A Ruby Pickaxe with a variant for enchanted (aux 1) and normal (aux 0)
DEF(eCreativeInventory_ToolsArmourWeapons)
    // ... after diamond tools ...
    ITEM(Item::pickAxe_ruby_Id)          // normal
    ITEM_AUX(Item::pickAxe_ruby_Id, 1)   // enchanted variant
```

## Adding a New Creative Group

If you want a new logical grouping (without adding a new tab), add an entry to the `ECreative_Inventory_Groups` enum:

```cpp
enum ECreative_Inventory_Groups
{
    // ... existing groups ...
    eCreativeInventory_Misc,
    eCreativeInventory_MyNewGroup,    // <-- add before the count
    eCreativeInventoryGroupsCount
};
```

Then populate it in `staticCtor()`:

```cpp
DEF(eCreativeInventory_MyNewGroup)
    ITEM(Item::ruby_Id)
    ITEM(Tile::rubyOre_Id)
    ITEM(Tile::rubyBlock_Id)
```

And wire it into a tab. You can either add it to an existing tab (the group's items appear after the other groups on that tab) or create a new tab for it.

To add it to the Misc tab:

```cpp
ECreative_Inventory_Groups miscGroup[] = {
    eCreativeInventory_Misc,
    eCreativeInventory_MyNewGroup   // items appear after Misc items
};
specs[eCreativeInventoryTab_Misc] =
    new TabSpec(L"Misc", IDS_GROUPNAME_MISCELLANEOUS,
                2, miscGroup, 0, nullptr);
```

## Adding a New Tab

This is the big one. The UI only supports 8 tabs out of the box, so you either need to replace an existing tab or do UI work to add a 9th.

### Replacing an Existing Tab

The easier path. Say you want to split "Redstone & Transport" into two separate tabs, and you are willing to fold Transport items into Misc:

1. Rename the tab enum value:

```cpp
enum ECreativeInventoryTabs
{
    eCreativeInventoryTab_BuildingBlocks = 0,
    eCreativeInventoryTab_Decorations,
    eCreativeInventoryTab_Redstone,        // was RedstoneAndTransport
    eCreativeInventoryTab_Materials,
    eCreativeInventoryTab_Food,
    eCreativeInventoryTab_ToolsWeaponsArmor,
    eCreativeInventoryTab_Brewing,
    eCreativeInventoryTab_Misc,
    eCreativeInventoryTab_COUNT,
};
```

2. Update the `TabSpec` creation to only reference the Redstone group:

```cpp
ECreative_Inventory_Groups redstoneGroup[] = {eCreativeInventory_Redstone};
specs[eCreativeInventoryTab_Redstone] =
    new TabSpec(L"Redstone", IDS_GROUPNAME_REDSTONE,
                1, redstoneGroup, 0, NULL);
```

3. Add Transport to the Misc tab's group array:

```cpp
ECreative_Inventory_Groups miscGroup[] = {
    eCreativeInventory_Misc,
    eCreativeInventory_Transport
};
specs[eCreativeInventoryTab_Misc] =
    new TabSpec(L"Misc", IDS_GROUPNAME_MISCELLANEOUS,
                2, miscGroup, 0, NULL);
```

4. Update the SWF movie to change the tab icon from the redstone+transport icon to just a redstone icon (or create a new localization string for the tab name).

### Adding a 9th Tab (Full Walkthrough)

If you really want more than 8 tabs, you need changes in three layers: the C++ enums, the C++ UI scene, and the SWF/XUI movie files.

#### Step 1: C++ Enum Changes

Add your new tab to the enum and bump the count:

```cpp
enum ECreativeInventoryTabs
{
    eCreativeInventoryTab_BuildingBlocks = 0,
    eCreativeInventoryTab_Decorations,
    eCreativeInventoryTab_RedstoneAndTransport,
    eCreativeInventoryTab_Materials,
    eCreativeInventoryTab_Food,
    eCreativeInventoryTab_ToolsWeaponsArmor,
    eCreativeInventoryTab_Brewing,
    eCreativeInventoryTab_Misc,
    eCreativeInventoryTab_Custom,         // <-- new
    eCreativeInventoryTab_COUNT,          // now 9
};
```

#### Step 2: Touch Panel / Input Changes

In `UIScene_CreativeMenu.h`, add a 9th touch panel:

```cpp
enum ETouchInput
{
    ETouchInput_TouchPanel_0,
    ETouchInput_TouchPanel_1,
    ETouchInput_TouchPanel_2,
    ETouchInput_TouchPanel_3,
    ETouchInput_TouchPanel_4,
    ETouchInput_TouchPanel_5,
    ETouchInput_TouchPanel_6,
    ETouchInput_TouchPanel_7,
    ETouchInput_TouchPanel_8,     // <-- new
    ETouchInput_TouchSlider,
    ETouchInput_Count,
};
```

Add the new element mapping:

```cpp
UI_MAP_ELEMENT( m_TouchInput[ETouchInput_TouchPanel_8], "TouchPanel_8" )
```

#### Step 3: Section Enum Changes

In `UIEnums.h`, add the new section for the 9th tab:

```cpp
eSectionInventoryCreativeTab_8,  // <-- new, before eSectionInventoryCreativeSlider
```

Then add case handlers for `eSectionInventoryCreativeTab_8` everywhere the other tab sections are handled: `handleOtherClicked()`, `GetPositionOfSection()`, `GetItemScreenData()`, and `getSection()`.

#### Step 4: XUI Changes (Xbox 360)

In `XUI_Scene_Inventory_Creative.h`, expand the icon and tab image arrays from 8 to 9, and add the new control mappings:

```cpp
CXuiControl m_hTabGroupA[eCreativeInventoryTab_COUNT]; // now size 9
CXuiControl m_hGroupIconA[eCreativeInventoryTab_COUNT]; // now size 9

// In the control map:
MAP_CONTROL(IDC_Icon_9, m_hGroupIconA[8])
MAP_CONTROL(IDC_TabImage9, m_hTabGroupA[8])
```

You also need to add `IDC_Icon_9` and `IDC_TabImage9` as control IDs in the XUI scene file, and add the matching visual elements in the XUI authoring tool.

#### Step 5: SWF Movie Changes (Iggy Platforms)

This is the biggest piece. You need to edit the Flash source files for the creative menu at each resolution:

- `CreativeMenu1080.swf`
- `CreativeMenu720.swf`
- `CreativeMenu480.swf`
- `CreativeMenuVita.swf`
- Plus the splitscreen variants (`CreativeMenuSplit*.swf`)

In each SWF, you need to:

1. Add a new `TouchPanel_8` element positioned next to the existing 8 tab buttons. The tabs are probably laid out horizontally, so you need to make room by either shrinking the existing tabs or extending the tab bar.

2. Add a tab icon for the 9th tab. The icon gets loaded through the substitution texture system using the icon name from the `TabSpec`.

3. Update the `SetActiveTab` ActionScript function to handle index 8. Currently it probably only handles 0 through 7.

4. Make sure the tab highlight animation works for the new tab.

If you do not have access to the original Flash `.fla` source files, you can try using SWF decompilers (like JPEXS Free Flash Decompiler) to edit the compiled SWF directly. This is harder but doable for simple layout changes.

#### Step 6: Create the TabSpec

Finally, wire up the new tab in `staticCtor()`:

```cpp
// Create and populate your new group
DEF(eCreativeInventory_MyNewGroup)
    ITEM(Item::ruby_Id)
    ITEM(Tile::rubyOre_Id)
    ITEM(Tile::rubyBlock_Id)

// Wire it to the new tab
ECreative_Inventory_Groups customGroup[] = {eCreativeInventory_MyNewGroup};
specs[eCreativeInventoryTab_Custom] =
    new TabSpec(L"Custom", IDS_GROUPNAME_CUSTOM,
                1, customGroup, 0, nullptr);
```

You will also need to add `IDS_GROUPNAME_CUSTOM` to the string table so the tab has a localized name.

## Tab Navigation (Input Handling)

Players switch between tabs using LB and RB (or L1/R1 on PlayStation). The input handling wraps around: pressing RB on the last tab goes back to the first tab, and pressing LB on the first tab goes to the last tab.

```cpp
case VK_PAD_RSHOULDER:
    ECreativeInventoryTabs tab = static_cast<ECreativeInventoryTabs>(m_curTab + dir);
    if (tab < 0) tab = static_cast<ECreativeInventoryTabs>(eCreativeInventoryTab_COUNT - 1);
    if (tab >= eCreativeInventoryTab_COUNT) tab = eCreativeInventoryTab_BuildingBlocks;
    switchTab(tab);
    ui.PlayUISFX(eSFX_Focus);
```

This code works with any number of tabs automatically, since it uses `eCreativeInventoryTab_COUNT` for the wrap-around. So if you add a 9th tab, the bumper navigation will include it without any extra changes.

The LT button was originally used to cycle through "dynamic groups" (potion tiers). In earlier builds, the Brewing tab had potion groups as dynamic groups that you could cycle through with LT. In the current codebase, all potion groups are static, so LT does nothing visible. But the code still exists:

```cpp
case VK_PAD_LTRIGGER:
    ++m_tabDynamicPos[m_curTab];
    if(m_tabDynamicPos[m_curTab] >= specs[m_curTab]->m_dynamicGroupsCount)
        m_tabDynamicPos[m_curTab] = 0;
    switchTab(m_curTab);
```

## Picking Up Items

When a player clicks an item in the creative grid (A button), a copy of that item gets placed on the cursor. The game then automatically finds the best hotbar slot: either a slot that already has a matching stackable item, or the first empty slot.

If the player holds the quickkey (Y button), they get a full stack instead of 1.

Clicking a hotbar slot while carrying an item places it. The game syncs the change to multiplayer through `handleCreativeModeItemAdd()`.

Players can also drop items by clicking outside the inventory area. Left-click drops the whole carried stack, right-click drops one at a time.

## Working Examples

### Example 1: Add All Hardened Clay Colors to Building Blocks

The stained clay is already in Building Blocks, but say you also wanted regular hardened clay variants in a different order. You could add a section like this:

```cpp
DEF(eCreativeInventory_BuildingBlocks)
    // ... after existing stairs ...
    ITEM(Tile::clayHardened_Id)                    // Plain hardened clay
    ITEM_AUX(Tile::clayHardened_colored_Id, 0)     // White
    ITEM_AUX(Tile::clayHardened_colored_Id, 8)     // Light gray
    ITEM_AUX(Tile::clayHardened_colored_Id, 7)     // Gray
    ITEM_AUX(Tile::clayHardened_colored_Id, 15)    // Black
```

### Example 2: Create a "Nature" Tab by Replacing Food

If you wanted a Nature tab that combines plants from Decorations with food items:

```cpp
// 1. Add a new group for nature items
enum ECreative_Inventory_Groups
{
    // ... existing ...
    eCreativeInventory_Nature,    // new
    eCreativeInventoryGroupsCount
};

// 2. In staticCtor(), populate it
DEF(eCreativeInventory_Nature)
    ITEM_AUX(Tile::sapling_Id, Sapling::TYPE_DEFAULT)
    ITEM_AUX(Tile::sapling_Id, Sapling::TYPE_EVERGREEN)
    ITEM_AUX(Tile::sapling_Id, Sapling::TYPE_BIRCH)
    ITEM_AUX(Tile::sapling_Id, Sapling::TYPE_JUNGLE)
    ITEM(Tile::vine)
    ITEM(Tile::waterLily_Id)
    ITEM(Tile::cactus_Id)
    ITEM(Tile::flower_Id)
    ITEM(Tile::rose_Id)

// 3. Replace the Food tab
ECreative_Inventory_Groups natureGroup[] = {
    eCreativeInventory_Nature,
    eCreativeInventory_Food
};
specs[eCreativeInventoryTab_Food] =
    new TabSpec(L"Food", IDS_GROUPNAME_FOOD, 2, natureGroup);
```

The tab still uses the Food icon and name but now shows nature items first, then food items. You would want to update the icon name and string ID to match.

### Example 3: Add Custom Firework Rockets

The `BuildFirework()` helper lets you create pre-made firework rockets. Here is how to add one to the Misc tab:

```cpp
DEF(eCreativeInventory_Misc)
    // ... existing items ...

    // A big gold firework with flicker and trail, flight duration 3, blue fade
    BuildFirework(list, FireworksItem::TYPE_BIG,
        DyePowderItem::YELLOW, 3, true, true, DyePowderItem::BLUE);
```

The parameters for `BuildFirework()` are:

| Parameter | What It Does |
|-----------|-------------|
| `list` | The vector to add the firework to (always `list` inside `staticCtor`) |
| `type` | Shape: `TYPE_SMALL`, `TYPE_BIG`, `TYPE_STAR`, `TYPE_CREEPER`, `TYPE_BURST` |
| `color` | Dye color index for the explosion color |
| `sulphur` | Flight duration (1-3, higher = longer fuse) |
| `flicker` | Whether the explosion twinkles (from glowstone dust) |
| `trail` | Whether particles leave trails (from diamond) |
| `fadeColor` | Optional: dye color index for the fade-out color (-1 for no fade) |

### Example 4: Add a Spawn Egg for a Custom Mob

If you added a new mob with entity type ID 130:

```cpp
DEF(eCreativeInventory_Misc)
    // ... after existing spawn eggs ...
    ITEM_AUX(Item::spawnEgg_Id, 130)  // Custom Mob spawn egg
```

If your mob has variants (like horses do), pack the variant into the upper bits:

```cpp
// Custom mob ID 130, variant 2
ITEM_AUX(Item::spawnEgg_Id, 130 | ((2 + 1) << 12))
```

## Key Files

| File | What's in it |
|------|-------------|
| `Minecraft.Client/Common/UI/IUIScene_CreativeMenu.h` | Tab and group enums, `TabSpec` struct, `ItemPickerMenu` class |
| `Minecraft.Client/Common/UI/IUIScene_CreativeMenu.cpp` | `staticCtor()` with all item lists, tab wiring, pagination logic, input handling |
| `Minecraft.Client/Common/UI/UIScene_CreativeMenu.h` | Iggy-based UI scene (PS3, PS Vita, PS4) with touch panel mappings |
| `Minecraft.Client/Common/UI/UIScene_CreativeMenu.cpp` | Iggy UI input handling, movie loading, and rendering |
| `Minecraft.Client/Common/XUI/XUI_Scene_Inventory_Creative.h` | XUI-based UI scene (Xbox 360) with tab icon control mappings |
| `Minecraft.Client/Common/UI/UIScene.h` | Base class for all Iggy movie scenes |
| `Minecraft.Client/Common/Potion_Macros.h` | Potion aux value macros and bit masks |
| `Minecraft.Client/Common/Media/movies1080.txt` | List of all SWF movies loaded at 1080p (includes `CreativeMenu1080.swf`) |

## Related Guides

- [Adding Items](/slop-docs/modding/adding-items/) for creating items to put in creative tabs
- [Adding Blocks](/slop-docs/modding/adding-blocks/) for creating blocks to put in creative tabs
- [Custom Potions](/slop-docs/modding/custom-potions/) for adding potions to the Brewing tab

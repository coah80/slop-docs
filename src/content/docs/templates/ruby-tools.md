---
title: "Template: Ruby Ore & Tools"
description: A complete, top-to-bottom recipe for adding a ruby ore block, its worldgen vein, the ruby item, a full tool set, recipes, creative-menu entries, strings, and textures to neoLegacy.
---

This is a full ore-to-tools chain. You will add a **ruby ore** block that generates in
stone, drops a **ruby** item (with XP and Fortune support), a **ruby block** for storage,
and a five-piece **tool set** (sword, pickaxe, shovel, axe, hoe) at a tier between iron and
diamond. Everything is wired exactly the way emerald and diamond are wired in the real
codebase — this page mirrors those registration sites line-for-line.

Read the background pages first if you are new to these systems:

- [Tiles & Blocks](/slop-docs/world/blocks/) — the `Tile` registry and `staticCtor` idiom.
- [Items](/slop-docs/world/items/) — the `Item` registry, `Item::Tier`, and block-item auto-creation.
- [World Generation](/slop-docs/world/worldgen/) — `OreFeature` and the biome decorator.
- [Recipes](/slop-docs/world/crafting/) — the recipe handler classes.
- [Client Resources](/slop-docs/client/resources/) — the texture atlas and localization systems.

Everything registers in `Minecraft.World`, which is a direct C++ port of the decompiled Java
LCE code. IDs are hard-coded, registration happens in `staticCtor()` methods, and the bootstrap
order in `Minecraft.World.cpp:26` (`MinecraftWorld_RunStaticCtors`) is load-bearing — `Tile`
before `Item` before `Recipes`. You do not touch the bootstrap; you insert into the existing
`staticCtor` bodies.

## What you are building

| Thing | Type | Numeric id | Registered in |
|-------|------|-----------|---------------|
| Ruby ore | `OreTile` | tile `198` | `Tile::staticCtor` |
| Ruby block | `MetalTile` | tile `199` | `Tile::staticCtor` |
| Ruby (gem) | `Item` | item `444` | `Item::staticCtor` |
| Ruby sword | `WeaponItem` | item `445` | `Item::staticCtor` |
| Ruby shovel | `ShovelItem` | item `446` | `Item::staticCtor` |
| Ruby pickaxe | `PickaxeItem` | item `447` | `Item::staticCtor` |
| Ruby axe | `HatchetItem` | item `448` | `Item::staticCtor` |
| Ruby hoe | `HoeItem` | item `449` | `Item::staticCtor` |
| Ruby vein | `OreFeature` | — | `BiomeDecorator` |

:::note[Choosing free ids]
`198` is the first unregistered block id: the named block ids run up through
`dark_oak_door_Id = 197`, and `199` is only a **commented-out** `sapling2_Id` placeholder
(the `new Sapling2(199)` line is disabled in `staticCtor`), so both `198` and `199` are
free to claim (both under `TILE_NUM_COUNT = 4096`, `Tile.h:101`). The highest item id is
`elytra_Id = 443` (`Item.h:677`), so `444`–`449` are free (under `ITEM_NUM_COUNT = 32000`,
`Item.h:34`). Verify these are still free in your checkout before you start — grep for `= 198`,
`= 444`, etc. in `Tile.h` / `Item.h`.

**Changed in v1.1.0b:** `197` is no longer the highest *registered* tile id — v1.1.0b added
`end_bricks` (206), `magma` (213), `nether_wart_block` (214), `red_nether_brick` (215),
`bone_block` (216), and the two banner ids (176/177). None of these touch `198`/`199`, so this
recipe's ids are still safe, but do not assume 197 is the ceiling: skip past the v1.1.0b block
when hunting for further free ids.
:::

## How the codebase does ores (the reference)

There is nothing bespoke about ruby — it follows the exact pattern of emerald, which is itself
the diamond pattern. The reusable `OreTile` class already handles drop/XP/Fortune logic for any
ore that adds itself to its switch statements. `OreTile::getResource` (`OreTile.cpp:10`) maps
each ore's tile id to the item it drops:

```cpp
int OreTile::getResource(int data, Random *random, int playerBonusLevel)
{
    if (id == Tile::coal_ore_Id) return Item::coal_Id;
    if (id == Tile::diamond_ore_Id) return Item::diamond_Id;
    if (id == Tile::lapis_ore_Id) return Item::dye_Id;
    if (id == Tile::emerald_ore_Id) return Item::emerald_Id;
    if (id == Tile::quartz_ore_Id) return Item::quartz_Id;
    return id;
}
```

`OreTile::spawnResources` (`OreTile.cpp:40`) pops experience when the ore is broken with a tool
that collects the resource, using a per-ore magic-count range. You will add ruby to both of
these switch statements plus `getResourceCount`.

## Step 1 — declare the tile ids and statics

Edit `Minecraft.World/Tile.h`.

**1a. Add the id constants.** The block-id block ends at `dark_oak_door_Id = 197` (`Tile.h:437`).
Add directly under it:

```cpp
	static const int ruby_ore_Id   = 198;
	static const int ruby_block_Id = 199;
```

**1b. Add the static `Tile *` members.** The named ore statics live near `Tile.h:474`+
(`goldOre`, `ironOre`, `coalOre`, … `emeraldOre` at `:603`, `emeraldBlock` at `:607`). Add
alongside them:

```cpp
	static Tile *rubyOre;
	static Tile *rubyBlock;
```

## Step 2 — define the tile statics and register them

Edit `Minecraft.World/Tile.cpp`.

**2a. Define the static pointers** next to the emerald definitions (`emeraldOre` at
`Tile.cpp:197`, `emeraldBlock` at `:201`):

```cpp
Tile *Tile::rubyOre = nullptr;
Tile *Tile::rubyBlock = nullptr;
```

**2b. Register inside `Tile::staticCtor()`** (`Tile.cpp:359`). Copy the emerald ore and emerald
block lines (`Tile.cpp:532` and `:538`) and adapt them. Add these near the end of the function,
after the emerald registrations:

```cpp
	Tile::rubyOre = (new OreTile(198))
		->setDestroyTime(3.0f)->setExplodeable(5)
		->setSoundType(SOUND_STONE)
		->setIconName(L"ruby_ore")
		->setDescriptionId(IDS_TILE_RUBYORE)
		->setUseDescriptionId(IDS_DESC_RUBYORE);

	Tile::rubyBlock = (new MetalTile(199))
		->setBaseItemTypeAndMaterial(Item::eBaseItemType_block, Item::eMaterial_ruby)
		->setDestroyTime(5.0f)->setExplodeable(10)
		->setSoundType(SOUND_METAL)
		->setIconName(L"ruby_block")
		->setDescriptionId(IDS_TILE_RUBYBLOCK)
		->setUseDescriptionId(IDS_DESC_RUBYBLOCK);
```

The fluent setters each `return this`, so the whole chain builds one tile. `OreTile`'s
constructor already assigns `Material::stone` (`OreTile.cpp:6`); `MetalTile` gives the ruby block
metal behaviour like the emerald/diamond blocks. `MetalTile.h` is already in the module — no new
include needed in `Tile.cpp` (it is pulled in via the tile headers).

:::note[The block-item is created for you]
At the tail of `Tile::staticCtor` there is a loop (`Tile.cpp:663`) that walks ids `0`–`255` and
does `Item::items[i] = new TileItem(i - 256)` for any tile that does not already have an item.
Because ruby ore (`198`) and ruby block (`199`) are under `256`, both automatically get a
placeable block-item — you do **not** register a `TileItem` yourself.
:::

## Step 3 — teach `OreTile` about ruby drops

Edit `Minecraft.World/OreTile.cpp`. Ruby ore should drop one ruby gem and pop XP like emerald.

**3a. `getResource`** (`OreTile.cpp:10`) — add before the `return id;`:

```cpp
	if (id == Tile::ruby_ore_Id) return Item::ruby_Id;
```

**3b. `getResourceCount`** (`OreTile.cpp:20`) already returns `1` by default, so a single ruby
drops — no change needed unless you want a range.

**3c. `spawnResources`** (`OreTile.cpp:40`) — add a magic-count branch inside the `if/else if`
chain so breaking ruby ore pops experience like diamond/emerald:

```cpp
		else if (id == Tile::ruby_ore_Id)
		{
			magicCount = Mth::nextInt(level->random, 3, 7);
		}
```

Fortune now works automatically: `getResourceCountForLootBonus` (`OreTile.cpp:26`) multiplies the
drop count for any ore whose `getResource` differs from its own id — which ruby's does.

## Step 4 — declare the ruby item and tool ids

Edit `Minecraft.World/Item.h`.

**4a. Add the id constants** near the other item ids (the highest is `elytra_Id = 443` at
`Item.h:677`):

```cpp
	static const int ruby_Id         = 444;
	static const int ruby_sword_Id   = 445;
	static const int ruby_shovel_Id  = 446;
	static const int ruby_pickaxe_Id = 447;
	static const int ruby_axe_Id     = 448;
	static const int ruby_hoe_Id     = 449;
```

**4b. Add the static `Item *` members** next to the diamond tool set (`Item.h:222`–`225` for the
diamond sword/shovel/pickaxe/axe, `:244` for `diamond_hoe`) and the `emerald` treasure static:

```cpp
	static Item *ruby;
	static Item *ruby_sword;
	static Item *ruby_shovel;
	static Item *ruby_pickaxe;
	static Item *ruby_axe;
	static Item *ruby_hoe;
```

**4c. Add a material enum value.** The `eMaterial` enum ends around `Item.h:83`+
(`eMaterial_emerald`, `eMaterial_quartz`, … `eMaterial_darkwood`). Add `eMaterial_ruby` to the
enum so the item and block can carry it:

```cpp
		eMaterial_ruby,
```

Append it at the end of the enum list — do not renumber the existing values, they are used in
saves and packets.

## Step 5 — define and register the item + tools

Edit `Minecraft.World/Item.cpp`.

**5a. Define the static pointers** near the diamond tool definitions (`Item.cpp:61`–`64`,
`:82`) and the emerald definition (`Item.cpp:224`):

```cpp
Item *Item::ruby = nullptr;
Item *Item::ruby_sword = nullptr;
Item *Item::ruby_shovel = nullptr;
Item *Item::ruby_pickaxe = nullptr;
Item *Item::ruby_axe = nullptr;
Item *Item::ruby_hoe = nullptr;
```

**5b. Add a ruby tier.** The vanilla tiers are defined at the top of `Item.cpp` (`_Tier` is
`typedef Item::Tier _Tier;` at `Item.cpp:22`). The existing tiers (`Item.cpp:28`–`32`) are
`Tier(level, uses, speed, damage, enchantmentValue)`:

```cpp
const _Tier *_Tier::WOOD    = new _Tier(0, 59,   2,  0, 15);
const _Tier *_Tier::STONE   = new _Tier(1, 131,  4,  1, 5);
const _Tier *_Tier::IRON    = new _Tier(2, 250,  6,  2, 14);
const _Tier *_Tier::DIAMOND = new _Tier(3, 1561, 8,  3, 10);
const _Tier *_Tier::GOLD    = new _Tier(0, 32,   12, 0, 22);
```

Ruby sits between iron and diamond. Declare a `RUBY` tier static in the `Item::Tier` class body
(next to `DIAMOND` at `Item.h:166`):

```cpp
		static const Tier *RUBY;
```

and define it in `Item.cpp` next to the others:

```cpp
const _Tier *_Tier::RUBY = new _Tier(2, 800, 7, 2.5f, 12);
```

`level = 2` means ruby tools mine the same block tiers as iron (so ruby pickaxes can mine
diamond/emerald/gold ore); `800` durability, a mining speed between iron and diamond, `+2.5`
attack-damage bonus, `12` enchantability.

**5c. Register the ruby gem** inside `Item::staticCtor()` (`Item.cpp:282`). Mirror the emerald
registration (`Item.cpp:499`). Item ids are stored as `256 + ctorId`, so the constructor arg for
item id `444` is `444 - 256 = 188`:

```cpp
	Item::ruby = (new Item(188))
		->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_ruby)
		->setIconName(L"ruby")
		->setDescriptionId(IDS_ITEM_RUBY)
		->setUseDescriptionId(IDS_DESC_RUBY);
```

**5d. Register the five tools**, mirroring the diamond tool block (`Item.cpp:287`, `:293`, `:299`,
`:305`, `:311`). Constructor ids are `realId - 256`: sword `445-256=189`, shovel `446-256=190`,
pickaxe `447-256=191`, axe `448-256=192`, hoe `449-256=193`:

```cpp
	Item::ruby_sword   = ( new WeaponItem(189, _Tier::RUBY) )
		->setBaseItemTypeAndMaterial(eBaseItemType_sword,   eMaterial_ruby)
		->setIconName(L"swordRuby")->setDescriptionId(IDS_ITEM_SWORD_RUBY)->setUseDescriptionId(IDS_DESC_SWORD);

	Item::ruby_shovel  = ( new ShovelItem(190, _Tier::RUBY) )
		->setBaseItemTypeAndMaterial(eBaseItemType_shovel,  eMaterial_ruby)
		->setIconName(L"shovelRuby")->setDescriptionId(IDS_ITEM_SHOVEL_RUBY)->setUseDescriptionId(IDS_DESC_SHOVEL);

	Item::ruby_pickaxe = ( new PickaxeItem(191, _Tier::RUBY) )
		->setBaseItemTypeAndMaterial(eBaseItemType_pickaxe, eMaterial_ruby)
		->setIconName(L"pickaxeRuby")->setDescriptionId(IDS_ITEM_PICKAXE_RUBY)->setUseDescriptionId(IDS_DESC_PICKAXE);

	Item::ruby_axe     = ( new HatchetItem(192, _Tier::RUBY) )
		->setBaseItemTypeAndMaterial(eBaseItemType_hatchet, eMaterial_ruby)
		->setIconName(L"hatchetRuby")->setDescriptionId(IDS_ITEM_HATCHET_RUBY)->setUseDescriptionId(IDS_DESC_HATCHET);

	Item::ruby_hoe     = ( new HoeItem(193, _Tier::RUBY) )
		->setBaseItemTypeAndMaterial(eBaseItemType_hoe,     eMaterial_ruby)
		->setIconName(L"hoeRuby")->setDescriptionId(IDS_ITEM_HOE_RUBY)->setUseDescriptionId(IDS_DESC_HOE);
```

`PickaxeItem`, `ShovelItem`, and `HatchetItem` all derive from `DiggerItem` and take
`(id, const Tier*)`; `WeaponItem` and `HoeItem` take `(id, const Tier*)` directly. The tier's
`level` (2) drives which blocks the pickaxe can harvest. You can reuse the shared
`IDS_DESC_SWORD` / `IDS_DESC_PICKAXE` / etc. description ids since they are generic ("A weapon for
killing…"), exactly as the diamond tools do — only the per-item name id (`IDS_ITEM_SWORD_RUBY`)
needs to be new.

## Step 6 — generate ruby veins in the world

Edit `Minecraft.World/BiomeDecorator.h` and `.cpp`. Ore veins are `OreFeature` instances built in
`BiomeDecorator::_init` and placed in `decorateOres`.

**6a. Declare the feature field** next to the other ore features (`BiomeDecorator.h:36`–`43`,
where `diamondOreFeature` lives at `:42`):

```cpp
	Feature *rubyOreFeature;
```

**6b. Construct it** in `BiomeDecorator::_init` next to `diamondOreFeature` (`BiomeDecorator.cpp:56`).
`OreFeature(tile, count)` uses the two-arg constructor that defaults to data `0` and target
`Tile::stone_Id` (`OreFeature.cpp:17`):

```cpp
    rubyOreFeature = new OreFeature(Tile::ruby_ore_Id, 7);
```

**6c. Place it** in `BiomeDecorator::decorateOres` (`BiomeDecorator.cpp:388`). Ruby is diamond-rare,
so put it deep. Add it inside the `setInstaTick(true)` … `setInstaTick(false)` block, next to the
diamond span:

```cpp
    decorateDepthSpan(1, rubyOreFeature, 0, Level::genDepth / 8);
```

`decorateDepthSpan(count, feature, y0, y1)` (`BiomeDecorator.cpp` — the helper that loops `count`
times and calls `feature->place` at a random y in `[y0, y1)`) generates one vein per chunk-column
below `genDepth/8`, matching diamond's frequency band. Every biome shares this decorator (built in
`Biome::createDecorator`, `Biome.cpp:212`), so ruby generates everywhere the overworld does.

## Step 7 — recipes (block ↔ gem, and tools)

### 7a. Ruby block ↔ 9 rubies

Edit `Minecraft.World/OreRecipies.cpp`. This handler builds the 9-gem storage-block recipes and
their reverse. Bump `MAX_ORE_RECIPES` in `OreRecipies.h` from `9` to `10`:

```cpp
#define MAX_ORE_RECIPES 10
```

Then add a map entry in `OreRecipies::_init` (`OreRecipies.cpp:9`), following the emerald entry
(`OreRecipies.cpp:20`):

```cpp
	ADD_OBJECT(map[9], Tile::rubyBlock);
	ADD_OBJECT(map[9], new ItemInstance(Item::ruby, 9));
```

`OreRecipies::addRecipes` (`OreRecipies.cpp:38`) loops over all `MAX_ORE_RECIPES` entries and
auto-registers both the 3×3 (9 gems → block) and the reverse (block → 9 gems) recipes — you get
both directions for free.

### 7b. Ruby tools

Edit `Minecraft.World/ToolRecipies.cpp`. The tool handler is table-driven: `map[0]` holds the
crafting materials, `map[1]`–`map[4]` hold the pickaxe/shovel/axe/hoe variants per material, and
`addRecipes` walks them with a shared shape table (`ToolRecipies.cpp:9`). To add ruby, append the
gem to `map[0]` and each ruby tool to its column, matching the diamond rows:

```cpp
	ADD_OBJECT(map[0], Item::ruby);       // after diamond (ToolRecipies.cpp:35)

	ADD_OBJECT(map[1], Item::ruby_pickaxe);
	ADD_OBJECT(map[2], Item::ruby_shovel);
	ADD_OBJECT(map[3], Item::ruby_axe);
	ADD_OBJECT(map[4], Item::ruby_hoe);
```

Order matters: the loop pairs `map[0].at(m)` with `map[t+1].at(m)`, so ruby must occupy the same
index in every column. The shared shapes give you the vanilla tool patterns (gem in the head
positions, stick down the handle).

The **sword** is registered by the weapon handler, not `ToolRecipies`. `WeaponRecipies.cpp` is
table-driven the same way: `map[0]` is the material list, `map[1]` is the per-material sword, and
`addRecipes` (`WeaponRecipies.cpp:34`) walks them with the shared vertical 2-material-over-stick
shape (`WeaponRecipies.cpp:10`). Add ruby to both columns in `WeaponRecipies::_init`, after the
diamond rows (`:24` and `:30`):

```cpp
	ADD_OBJECT(map[0], Item::ruby);         // material column
	ADD_OBJECT(map[1], Item::ruby_sword);   // sword column
```

As with the tools, ruby must occupy the same index in `map[0]` and `map[1]` — the loop pairs
`map[0].at(m)` with `map[t+1].at(m)`. This gives the vanilla sword shape (two rubies stacked over a
stick) automatically.

### 7c. (Optional) smelting

If you want ruby ore to smelt into a gem (like iron/gold ore), add a `FurnaceRecipes` entry.
Smelting is registered separately (bootstrap line 44, `FurnaceRecipes::staticCtor`). Most gem ores
in LCE drop the gem directly and are not smeltable, so this is optional — skip it to match
emerald/diamond behaviour.

## Step 8 — creative menu

Edit `Minecraft.Client/Common/UI/IUIScene_CreativeMenu.cpp`. This is the client-side tab
population. Items are added with the `ITEM(id)` / `ITEM_AUX(id, aux)` macros (`:22`–`23`) into
`categoryGroups[...]` via the `DEF(index)` macro.

**8a. Blocks tab** — add the ruby ore and block near the emerald entries (`:105`–`114`):

```cpp
		ITEM(Tile::ruby_block_Id)
		ITEM(Tile::ruby_ore_Id)
```

**8b. Tools tab** (`eCreativeInventory_Tools`) — add the ruby tools after the diamond tools
(`:625`–`629`):

```cpp
		ITEM(Item::ruby_sword_Id)
		ITEM(Item::ruby_shovel_Id)
		ITEM(Item::ruby_pickaxe_Id)
		ITEM(Item::ruby_axe_Id)
		ITEM(Item::ruby_hoe_Id)
```

**8c. Materials tab** (`eCreativeInventory_Materials`, `:663`) — add the gem after emerald
(`:667`):

```cpp
		ITEM(Item::ruby_Id)
```

## Step 9 — strings

Strings are keyed by `IDS_*` constants and defined as `<data name="…">` nodes in the loc XML.
The build generates `Minecraft.Client/Windows64Media/strings.h` from
`Minecraft.Client/Windows64Media/loc/stringsGeneric.xml` (the reference dump
`old_strings.h` shows the format but is not the compiled header). Add each new key to
`stringsGeneric.xml` — copy the emerald nodes (`IDS_TILE_EMERALDORE` at line ~8287,
`IDS_ITEM_EMERALD` at ~8243, `IDS_DESC_EMERALDORE` at ~8159) as templates:

```xml
	<data name="IDS_TILE_RUBYORE">
		<value>Ruby Ore</value>
	</data>
	<data name="IDS_TILE_RUBYBLOCK">
		<value>Block of Ruby</value>
	</data>
	<data name="IDS_ITEM_RUBY">
		<value>Ruby</value>
	</data>
	<data name="IDS_ITEM_SWORD_RUBY">
		<value>Ruby Sword</value>
	</data>
	<data name="IDS_ITEM_SHOVEL_RUBY">
		<value>Ruby Shovel</value>
	</data>
	<data name="IDS_ITEM_PICKAXE_RUBY">
		<value>Ruby Pickaxe</value>
	</data>
	<data name="IDS_ITEM_HATCHET_RUBY">
		<value>Ruby Axe</value>
	</data>
	<data name="IDS_ITEM_HOE_RUBY">
		<value>Ruby Hoe</value>
	</data>
	<data name="IDS_DESC_RUBYORE">
		<value>Can be mined with an Iron pickaxe or better to collect Rubies.</value>
	</data>
	<data name="IDS_DESC_RUBYBLOCK">
		<value>A compact way of storing Rubies.</value>
	</data>
	<data name="IDS_DESC_RUBY">
		<value>A precious red gem.</value>
	</data>
```

The tools reuse the shared `IDS_DESC_SWORD`, `IDS_DESC_SHOVEL`, `IDS_DESC_PICKAXE`,
`IDS_DESC_HATCHET`, and `IDS_DESC_HOE` description keys (already present — the diamond tools use
the same ones), so no new `IDS_DESC_*_RUBY` tool keys are required.

:::caution[Manual string ids]
If your checkout does **not** regenerate `strings.h` at build (some setups ship a checked-in
header), you must also add matching `#define IDS_RUBY… <number>` lines to
`Windows64Media/old_strings.h` (or the platform `strings.h`) using the next free numeric ids after
the current maximum. Confirm which path your build uses before compiling — a missing `IDS_*`
macro is a compile error in `Tile.cpp` / `Item.cpp`.
:::

## Step 10 — textures

neoLegacy stitches block and item icons from the pre-stitched atlases `terrain.png` (blocks) and
`items.png` (items). The name-to-cell mapping lives in
`Minecraft.Client/PreStitchedTextureMap.cpp` via the `ADD_ICON(row, column, name)` macro
(`:318`), where each cell is `1/16` of the atlas width. `setIconName(L"ruby_ore")` on the tile
resolves through `Tile::registerIcons` → `IconRegister::registerIcon(name)` (`Tile.cpp:1618`),
and the item does the same via `Item::registerIcons` (`Item.cpp:1033`).

You need to:

1. **Paint the sprites into the atlases.** Draw a 16×16 ruby-ore block face and a 16×16 ruby-block
   face into free cells of `Minecraft.Client/Common/res/terrain.png`, and a 16×16 ruby gem plus
   five 16×16 tool sprites into free cells of `Minecraft.Client/Common/res/items.png`. (Do not
   read/edit the PNGs through docs tooling — do this in an image editor.)

2. **Register the atlas cells** in `PreStitchedTextureMap::loadUVs` (`:322`). The terrain block
   starts at `:672`, the item block at `:340`. Pick free cells and add, mirroring the emerald
   entries (`emerald_ore` at `:858`, `emerald_block` at `:703`, `emerald` at `:538`,
   `swordDiamond` at `:414`, `pickaxeDiamond` at `:448`):

   ```cpp
   // in the terrain (block) section, ~:672+
   ADD_ICON(10, 12, L"ruby_ore");    // pick a genuinely empty cell
   ADD_ICON(1,  10, L"ruby_block");

   // in the items section, ~:340+
   ADD_ICON(11, 11, L"ruby");
   ADD_ICON(4,  4,  L"swordRuby");
   ADD_ICON(5,  4,  L"shovelRuby");
   ADD_ICON(6,  4,  L"pickaxeRuby");
   ADD_ICON(7,  4,  L"hatchetRuby");
   ADD_ICON(8,  4,  L"hoeRuby");
   ```

   The `(row, column)` you pass **must** point at the cell where you actually painted the sprite —
   the atlas is a fixed grid, not auto-packed. Choose empty cells; the atlas extends well past 16
   rows (the sunflower entries reach row 21, `:‑` in `loadUVs`).

Icon names are case-sensitive and must match the `setIconName(L"…")` strings from steps 2 and 5
exactly (`swordRuby`, not `sword_ruby`, to match the `swordDiamond` convention).

## Step 11 — register the new source files in CMake

`Minecraft.World` and `Minecraft.Client` use **explicit** source lists — there is no glob. You did
not add new `.cpp` files in this template (everything went into existing files), so **no CMake
changes are needed** for ruby.

For reference, if you had split ruby into its own `RubyTile.cpp` you would add it to
`Minecraft.World/cmake/sources/Common.cmake` alongside the ore entries (`OreTile.cpp` at
`:1928`, `OreFeature.cpp` at `:1527`) as:

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/RubyTile.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/RubyTile.h"
```

## Build & test checklist

1. **Build.** Configure and build `Minecraft.World` + `Minecraft.Client`. A missing `IDS_*` macro
   or an icon name typo surfaces here.
2. **Ore drops.** In a creative world, place ruby ore, break it with an iron+ pickaxe → confirm a
   ruby gem drops and XP orbs pop. Break with bare hand → confirm no drop (matches `OreTile`
   default).
3. **Fortune.** Enchant a ruby/diamond pickaxe with Fortune, mine ruby ore → confirm multiplied
   drops (via `getResourceCountForLootBonus`).
4. **Worldgen.** Generate a fresh world, dig below `genDepth/8` (deep underground) → confirm ruby
   veins appear in stone at roughly diamond frequency. If none appear, re-check
   `decorateOres` and the `Tile::ruby_ore_Id` argument to `OreFeature`.
5. **Tools.** Craft each ruby tool; confirm durability (~800), mining speed between iron and
   diamond, and that the ruby pickaxe harvests diamond/emerald/gold ore (tier level 2).
6. **Recipes.** Confirm 9 rubies ↔ ruby block both directions, and every tool crafts with the
   expected shape.
7. **Creative menu.** Open creative → Blocks tab shows ruby ore + block, Tools tab shows the five
   ruby tools, Materials tab shows the ruby gem, all with correct icons and hover names.
8. **Textures.** Verify no `MISSING_ICON_TILE_…` placeholder appears on any ruby block/item — that
   string is what `getIconName` returns when the icon name is empty (`Tile.cpp:1615`), and a
   magenta/black missing-texture means the `ADD_ICON` cell is wrong.

## Related pages

- [Template: Custom Mob](/slop-docs/templates/custom-mob/) — the same registration idioms for
  entities.
- [Tiles & Blocks](/slop-docs/world/blocks/) · [Items](/slop-docs/world/items/) ·
  [World Generation](/slop-docs/world/worldgen/) · [Recipes](/slop-docs/world/crafting/)
- Source: [`OreTile.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/OreTile.cpp),
  [`OreFeature.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/OreFeature.cpp),
  [`Tile.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Tile.cpp),
  [`Item.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp).

---
title: Blocks (Tiles)
description: The Tile base class in neoLegacy — constants, members, virtuals, the id-indexed registry, the staticCtor registration flow, the Tile hierarchy, and every neoLegacy block added on top of vanilla TU19.
---

Every block in the world is a **`Tile`**. neoLegacy is a direct C++ port of the
decompiled Java LCE code, and the Java class is `net.minecraft.world.level.block.Tile`
(the modern rename to `Block` never happened here), so the class you edit to add
a block is still `Tile`. There is exactly one `Tile` instance per block ID — it
is a flyweight; the per-placement state lives in the world as a `(tileId, data)`
pair, and anything larger lives in a
[TileEntity](/slop-docs/world/tile-entities/).

Files: `Tile.h`, `Tile.cpp`, plus one `*Tile.{h,cpp}` (or a few grouped headers)
per subclass — ~184 tile headers, ~181 `Tile` subclasses.

## The registry

`Tile` owns the whole block table as static members. Blocks are looked up by
integer ID through a raw array:

| Member | Declaration | Notes |
|--------|-------------|-------|
| `tiles` | `static Tile **tiles;` (`Tile.h:210`) | id → `Tile*`, sized `TILE_NUM_COUNT`. `nullptr` for unused slots. |
| `solid[]` | `static bool solid[TILE_NUM_COUNT];` (`:213`) | per-id solid-render flag |
| `lightBlock[]` | `static int lightBlock[TILE_NUM_COUNT];` (`:214`) | opacity (0–255) |
| `transculent[]` | `static bool transculent[TILE_NUM_COUNT];` (`:215`) | [sic] translucency, `!material->blocksLight()` |
| `lightEmission[]` | `static int lightEmission[TILE_NUM_COUNT];` (`:216`) | emitted light 0–`MAX_BRIGHTNESS` |
| `_sendTileData[]` | `static unsigned char _sendTileData[TILE_NUM_COUNT];` (`:217`) | per-tile net-sync bitfield (see [`sendTileData`](#net-sync--sendtiledata)) |
| `propagate[]` | `static bool propagate[TILE_NUM_COUNT];` (`:218`) | light propagation |
| `mipmapEnable[]` | `static bool mipmapEnable[TILE_NUM_COUNT];` (`:212`) | 4J-added texture-mipmap flag |

Alongside the array there are ~230 named `static Tile *` pointers
(`Tile.h:460`+) so game code can write `Tile::stone` instead of
`Tile::tiles[1]`. Some are typed to a subclass so callers get the derived API
directly:

```cpp
static Tile *stone;
static GrassTile *grass;
static LiquidTile *water;
static LiquidTile *lava;
static LeafTile *leaves;
static PistonBaseTile *pistonBase;
static ChestTile *chest;
static RedStoneDustTile *redStoneDust;
static ComparatorTile *comparator_off;   // neoLegacy / TU31
static Tile *slimeBlock;                  // neoLegacy
```

### Compile-time ID constants

Because `Tile::stone->id` forced a pointer load, 4J added a parallel set of
`static const int <name>_Id` constants (`Tile.h:221`+) so the compiler can fold
block-ID references into immediates. This is the canonical ID list. A block
occupies **one** ID; its data byte (0–15) selects variants.

| ID | Constant | Block |
|----|----------|-------|
| 0 | `air_Id` | air |
| 1 | `stone_Id` | stone (data selects granite/diorite/andesite — see below) |
| 2 | `grass_Id` | grass |
| 3 | `dirt_Id` | dirt |
| 8 / 9 | `flowing_water_Id` / `water_Id` | dynamic / static water |
| 10 / 11 | `flowing_lava_Id` / `lava_Id` | dynamic / static lava |
| 17 | `log_Id` | oak/spruce/birch/jungle log |
| 18 | `leaves_Id` | oak/spruce/birch/jungle leaves |
| 35 | `wool_Id` | wool (16 colors in data) |
| 44 / 43 | `stone_slab_Id` / `double_stone_slab_Id` | stone slab / double slab |
| 95 | `stained_glass_Id` | stained glass **(neoLegacy)** |
| 149 / 150 | `unpowered_comparator_Id` / `powered_comparator_Id` | comparator **(TU31)** |
| 151 | `daylight_detector_Id` | daylight sensor |
| 152 | `redstone_block_Id` | block of redstone **(neoLegacy)** |
| 153 | `quartz_ore_Id` | nether quartz ore **(neoLegacy)** |
| 154 | `hopper_Id` | hopper **(neoLegacy)** |
| 155 / 156 | `quartz_block_Id` / `quartz_stairs_Id` | quartz block / stairs **(neoLegacy)** |
| 157 | `activator_rail_Id` | activator rail **(neoLegacy)** |
| 158 | `dropper_Id` | dropper **(neoLegacy)** |
| 159 | `stained_hardened_clay_Id` | stained terracotta **(neoLegacy)** |
| 160 | `stained_glass_pane_Id` | stained glass pane **(neoLegacy)** |
| 161 / 162 | `leaves2_Id` / `log2_Id` | acacia/dark-oak leaves / log **(neoLegacy)** |
| 163 / 164 | `acacia_stairs_Id` / `dark_oak_stairs_Id` | acacia / dark-oak stairs **(neoLegacy)** |
| 165 | `slime_Id` | slime block **(neoLegacy)** |
| 166 | `barrier_Id` | barrier **(neoLegacy)** |
| 167 | `iron_trapdoor_Id` | iron trapdoor **(neoLegacy)** |
| 168 | `prismarine_Id` | prismarine **(neoLegacy)** |
| 169 | `sea_lantern_Id` | sea lantern **(neoLegacy)** |
| 170 | `hay_block_Id` | hay bale **(neoLegacy)** |
| 171 | `carpet_Id` | wool carpet **(neoLegacy)** |
| 172 | `hardened_clay_Id` | terracotta **(neoLegacy)** |
| 173 | `coal_block_Id` | block of coal **(neoLegacy)** |
| 174 | `packed_ice_Id` | packed ice **(neoLegacy)** |
| 175 | `double_plant_Id` | large flowers / sunflower **(neoLegacy)** |
| 178 | `daylight_detector_inverted_Id` | inverted daylight sensor **(neoLegacy)** |
| 179 / 180 | `red_sandstone_Id` / `red_sandstone_stairs_Id` | red sandstone / stairs **(neoLegacy)** |
| 181 / 182 | `double_stone_slab2_Id` / `stone_slab2_Id` | red-sandstone slab set **(neoLegacy)** |
| 183–187 | `spruce_fence_gate_Id` … `acacia_fence_gate_Id` | wood fence gates **(neoLegacy)** |
| 188–192 | `spruce_fence_Id` … `acacia_fence_Id` | wood fences **(neoLegacy)** |
| 193–197 | `spruce_door_Id` … `dark_oak_door_Id` | wood doors **(neoLegacy)** |
| 207 | `beetroots_Id` | beetroot crop **(neoLegacy)** |
| 208 | `grass_path_Id` | grass path **(neoLegacy)** |
| 212 | `frosted_ice_Id` | frosted ice (Frost Walker) **(neoLegacy)** |

IDs 176/177 (banners) and 198–206, 209 (End-update blocks: end rod, chorus,
purpur, end bricks) are reserved as comments in `Tile.h` but **not registered**
in this build.

> **Changed in v1.1.0b**: several of these reserved slots are now registered. The
> banners **176** (`standing_banner_Id`) / **177** (`wall_banner_Id`) become live
> `BannerTile`s (with a `BannerItem` and a `BannerTileEntity` — see
> [Block Entities](/slop-docs/world/tile-entities/)), and the following blocks are
> added: **206** `end_bricks_Id` (`Tile`, stone), **213** `magma_Id` (`MagmaTile`),
> **214** `nether_wart_block_Id` (`Tile`, grass material), **215**
> `red_nether_brick_Id` (`Tile`, stone), **216** `bone_block_Id` (`BoneBlockTile`).
> Their `*_Id` constants change from comments to real `static const int` members in
> `Tile.h`, and each gets a registration line in `Tile::staticCtor()`. The
> remaining End-update slots (198–205, 209, 217) stay commented out.

### Sizing constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `TILE_NUM_COUNT` | `4096` | size of `tiles[]` and every per-id array (`Tile.h:101`) |
| `TILE_NUM_MASK` | `0xfff` | low 12 bits = tile ID in a packed word (`:102`) |
| `TILE_NUM_SHIFT` | `12` | high bits hold data (`:103`) |

A packed block word is `(data << 12) | tileId`, so a single ID cannot exceed
4095.

## The Tile base class

### Update flags

`neighborChanged` / `setData` take a flag mask (`Tile.h:107`):

| Flag | Value | Effect |
|------|-------|--------|
| `UPDATE_NEIGHBORS` | `1 << 0` | notify the 6 neighbors that this block changed |
| `UPDATE_CLIENTS` | `1 << 1` | send the change over the network |
| `UPDATE_INVISIBLE` | `1 << 2` | do not rebuild the chunk mesh |
| `UPDATE_INVISIBLE_NO_LIGHT` | `(1 << 3) \| UPDATE_INVISIBLE` | also skip relight |
| `UPDATE_NONE` | `= UPDATE_INVISIBLE` | |
| `UPDATE_ALL` | `UPDATE_NEIGHBORS \| UPDATE_CLIENTS` | the common case |

### Render shapes

`getRenderShape()` returns one of the `SHAPE_*` constants (`Tile.h:164`+,
`SHAPE_COUNT = 42`). The base returns `SHAPE_BLOCK`. A selection:

| Shape | Value | Used by |
|-------|-------|---------|
| `SHAPE_INVISIBLE` | -1 | air, moving-piston piece |
| `SHAPE_BLOCK` | 0 | full cube (default) |
| `SHAPE_CROSS_TEXTURE` | 1 | flowers, saplings |
| `SHAPE_TORCH` | 2 | torches, redstone torch |
| `SHAPE_RED_DUST` | 5 | redstone wire |
| `SHAPE_STAIRS` | 10 | stairs |
| `SHAPE_PISTON_BASE` / `SHAPE_PISTON_EXTENSION` | 16 / 17 | pistons |
| `SHAPE_REPEATER` | 15 | repeater |
| `SHAPE_DIODE` | 36 | comparator base **(neoLegacy)** |
| `SHAPE_COMPARATOR` | 37 | comparator **(neoLegacy)** |
| `SHAPE_HOPPER` | 38 | hopper **(neoLegacy)** |
| `SHAPE_QUARTZ` | 39 | quartz variants **(neoLegacy)** |
| `SHAPE_THIN_PANE` | 40 | glass/iron panes |
| `SHAPE_SLIME` | 41 | slime block **(neoLegacy)** |

### Sound types

Set with `setSoundType()`. The `SoundType` objects are created first in
`staticCtor` (`Tile.cpp:361`+):

| SoundType | Notes |
|-----------|-------|
| `SOUND_NORMAL` | default (stone-ish) |
| `SOUND_WOOD`, `SOUND_GRAVEL`, `SOUND_GRASS`, `SOUND_STONE` | |
| `SOUND_METAL` | pitch 1.5 |
| `SOUND_GLASS`, `SOUND_CLOTH`, `SOUND_SAND`, `SOUND_SNOW`, `SOUND_LADDER`, `SOUND_ANVIL` | |
| `SOUND_SLIME` | **neoLegacy** — stone material with the big-slime mob sound wired into break/place (`Tile.cpp:366`) |

### Instance members

| Member | Type | Notes |
|--------|------|-------|
| `id` | `int` | this tile's block ID |
| `material` | `Material *` | see [Materials](/slop-docs/world/materials/) |
| `soundType` | `const SoundType *` | |
| `destroySpeed` | `float` | mining hardness |
| `explosionResistance` | `float` | blast resistance (×3 internally, see below) |
| `friction` | `float` | default `0.6` |
| `gravity` | `float` | default `1.0` |
| `descriptionId` / `useDescriptionId` | `unsigned int` | localized name string IDs (`useDescriptionId` is a 4J addition) |
| `icon` | `Icon *` | |
| `m_iBaseItemType` / `m_iMaterial` | `int` | 4J crafting-menu classification tags |

### Key virtuals

`Tile` declares ~120 virtuals (`Tile.h:715`–`860`+). The ones you override most:

| Virtual | Purpose |
|---------|---------|
| `init()` | one-time per-tile init hook (base is empty) |
| `isCubeShaped()` / `isSolidRender(bool)` | full-cube / opaque-render queries |
| `getRenderShape()` | render model selector |
| `tick(level,x,y,z,random)` | scheduled random/redstone tick |
| `animateTick(...)` | client-side particle tick |
| `neighborChanged(level,x,y,z,type)` | react to an adjacent block change |
| `onPlace` / `onRemove` / `destroy` | placement lifecycle |
| `getResource` / `getResourceCount` / `spawnResources` | drops |
| `use(...)` | right-click interaction (4J added a `soundOnly` param) |
| `mayPlace(...)` / `canSurvive(...)` | placement validity |
| `getSignal` / `getDirectSignal` / `isSignalSource` | [redstone](/slop-docs/world/redstone/) power output |
| `getPistonPushReaction()` | piston behavior — returns `material->getPushReaction()` (`Tile.cpp:1523`) |
| `updateShape(...)` | recompute collision AABB (4J added `forceData`/`forceEntity` params) |

The fluent setters all return `Tile*` so registration reads as a builder chain:
`setSoundType`, `setLightBlock`, `setLightEmission`, `setExplodeable`,
`setDestroyTime`, `setIndestructible`, `setTicking`, `disableMipmap`,
`setBaseItemTypeAndMaterial`, `sendTileData`, and (defined on the ID-string
side) `setIconName`, `setDescriptionId`, `setUseDescriptionId`.

### Construction and `_init`

`Tile(int id, Material*, bool isSolidRender=true)` calls `_init`
(`Tile.cpp:701`), which is where a tile installs itself in the registry:

```cpp
this->material = material;
Tile::tiles[id] = this;           // self-register
this->id = id;
updateDefaultShape();
solid[id] = isSolidRender;
lightBlock[id] = isSolidRender ? 255 : 0;
transculent[id] = !material->blocksLight();
```

Defaults set here: `destroySpeed = 0`, `explosionResistance = 0`,
`friction = 0.6`, `gravity = 1.0`, `soundType = SOUND_NORMAL`,
`isInventoryItem = true`, `collectStatistics = true`.

Two setters have quirks worth knowing when reading values back:

- **`setExplodeable(r)`** stores `explosionResistance = r * 3` (`Tile.cpp:796`),
  so the constant you pass is *not* the raw field value.
- **`setDestroyTime(t)`** bumps `explosionResistance` up to `t * 5` if it was
  lower (`Tile.cpp:824`) — hardness implies a minimum resistance.

### Net sync — `sendTileData`

`sendTileData(unsigned char importantMask = 15)` writes the mask into
`_sendTileData[id]` (`Tile.cpp:747`). LCE only syncs the data byte for tiles
that opt in; the mask names which of the 4 low data bits matter, so e.g. leaves
sync only their type bits: `->sendTileData(LeafTile::LEAF_TYPE_MASK)`
(`Tile.cpp:398`).

## Registration flow — `Tile::staticCtor`

All blocks are built in one function, `Tile::staticCtor()` (`Tile.cpp:359`),
invoked from the master bootstrap `MinecraftWorld_RunStaticCtors()` at
`Minecraft.World.cpp:36`. The comment there warns **"DO NOT CHANGE the
ordering"** — `Material::staticCtor` (line 35) must run first because tiles
reference `Material::stone` etc.

The function allocates the table, then assigns each block via a `new` + builder
chain. The very first entry (`Tile.cpp:378`):

```cpp
Tile::stone = (new StoneTile(1))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_structblock, Item::eMaterial_stone)
    ->setDestroyTime(1.5f)->setExplodeable(10)
    ->setSoundType(Tile::SOUND_STONE)->setIconName(L"stone")
    ->setDescriptionId(IDS_TILE_STONE)->setUseDescriptionId(IDS_DESC_STONE);
```

The `new StoneTile(1)` self-registers into `tiles[1]` inside `_init` before the
first setter runs. IDs are hard-coded inline — there is no auto-increment.

### To add a block

1. Write `class MyTile : public Tile` (or a nearer base) with its overrides.
2. Add a `static Tile *myTile;` pointer and a `static const int my_tile_Id = N;`
   to `Tile.h` (pick a free ID < 4096; slots 176/177/198–206/209 are the
   documented free gaps below 256).
3. Add one line to `Tile::staticCtor` assigning `Tile::myTile = (new MyTile(N))->...`.
4. If the block needs a data byte synced to clients, chain `->sendTileData()`.
5. A `TileItem` is auto-created for IDs < 256; override it in
   [Items](/slop-docs/world/items/) only if you need a custom icon (as wool/log
   do at `Tile.cpp:612`+).

## The Tile hierarchy

`Tile` is a wide, shallow tree. Major bases:

- **`HalfTransparentTile`** — glass, ice, coral, and the neoLegacy `SlimeTile`.
- **`HeavyTile`** — gravel, anvil (falling / heavy blocks).
- **`DirectionalTile`** — anything with a facing: beds, cocoa, and the
  [redstone](/slop-docs/world/redstone/) `DiodeTile` family.
- **`BaseEntityTile` / `EntityTile`** — tiles backed by a
  [TileEntity](/slop-docs/world/tile-entities/): chest, furnace, dispenser,
  beacon, brewing stand, hopper, comparator.
- **Slabs / stairs** — `HalfSlabTile`, `FullStoneSlabTile`(+`2`),
  `HalfStoneSlabTile`(+`2`), `StairTile`.
- **Plants / crops** — `Bush`, `CropTile` → `CarrotTile` / `BeetrootTile`,
  `FarmTile`, `TallGrass`, `TallGrass2` (large flowers / sunflower),
  `CactusTile`, `Sapling`, `GrassPathTile`.
- **Liquids** — `LiquidTile` → `LiquidTileDynamic` / `LiquidTileStatic`.
- **Colored** — `ColoredTile` (wool, stained clay), `WoolCarpetTile`.
- **Ore / metal** — `OreTile`, `MetalTile`, `RedStoneOreTile`,
  `PoweredMetalTile` (block of redstone).

## The `stone` block: granite / diorite / andesite

In vanilla TU19 block ID 1 is plain stone. neoLegacy carries the 1.7 stone
variants in the **data byte** rather than as separate blocks. `StoneTile`
defines them (`StoneTile.h:10`):

| Data | Constant | Variant |
|------|----------|---------|
| 0 | (default) | stone |
| 1 | `GRANITE` | granite |
| 2 | `POLISHED_GRANITE` | polished granite |
| 3 | `DIORITE` | diorite |
| 4 | `POLISHED_DIORITE` | polished diorite |
| 5 | `ANDESITE` | andesite |
| 6 | `POLISHED_ANDESITE` | polished andesite |

`STONE_NAMES_LENGTH = 7`. The stone item is registered as a
`MultiTextureTileItem` over `StoneTile::STONE_NAMES` so each data value stacks as
its own item (`Tile.cpp:620`).

## neoLegacy block additions vs vanilla TU19

Every entry below is registered in `Tile::staticCtor` (line numbers in
`Tile.cpp`) and absent from the TU19 base.

| Block | ID | Class | staticCtor | Notes |
|-------|----|-------|-----------|-------|
| Slime block | 165 | `SlimeTile` | `:572` | `SOUND_SLIME`, `getPistonPushReaction()` → `PUSH_SLIME` |
| Barrier | 166 | `BarrierTile(…, false)` | `:573` | indestructible, invisible, no stats |
| Iron trapdoor | 167 | `TrapDoorTile(…, Material::metal)` | `:574` | metal sound |
| Prismarine | 168 | `PrismarineTile` | `:607` | data → rough/brick/dark |
| Sea lantern | 169 | `SeaLanternTile(…, Material::glass)` | `:606` | full light emission |
| Hay block | 170 | `HayBlockTile` | `:576` | |
| Wool carpet | 171 | `WoolCarpetTile` | `:577` | `lightBlock 0` |
| Hardened clay (terracotta) | 172 | `Tile(…, Material::stone)` | `:578` | |
| Coal block | 173 | `Tile(…, Material::stone)` | `:579` | |
| Packed ice | 174 | `PackedIceTile` | `:582` | |
| Large flowers / sunflower | 175 | `TallGrass2` | `:609` | `sendTileData(0xFF)` |
| Redstone block | 152 | `PoweredMetalTile` | `:559` | always-on power source |
| Nether quartz ore | 153 | `OreTile` | `:560` | |
| Hopper | 154 | `HopperTile` | `:561` | see [Redstone](/slop-docs/world/redstone/) |
| Quartz block / stairs | 155 / 156 | `QuartzBlockTile` / `StairTile` | `:562` | |
| Activator rail | 157 | `PoweredRailTile` | `:564` | |
| Dropper | 158 | `DropperTile` | `:565` | |
| Stained terracotta | 159 | `ColoredTile` | `:566` | 16 colors |
| Stained glass / pane | 95 / 160 | `StainedGlassBlock` / `StainedGlassPaneBlock` | `:488` / `:567` | |
| Acacia/dark-oak logs & leaves | 161 / 162 | `LeafTile2` / `TreeTile2` | `:399` / `:569` | |
| Acacia / dark-oak stairs | 163 / 164 | `StairTile` | `:570` / `:571` | trunk type in data |
| Frosted ice | 212 | `FrostedIceTile` | `:585` | pairs with the Frost Walker [enchantment](/slop-docs/world/enchantments/) |
| Inverted daylight sensor | 178 | `DaylightDetectorTile(…, true)` | `:587` | |
| Red sandstone / stairs / slabs | 179–182 | `RedSandStoneTile` / `StairTile` / `FullStoneSlabTile2` | `:588`–`:592` | |
| Wood fence gates | 183–187 | `FenceGateTile` | `:594`–`:598` | spruce/birch/jungle/dark/acacia |
| Wood fences | 188–192 | `FenceTile` | `:600`–`:604` | |
| Wood doors | 193–197 | `DoorTile` | `:457`–`:461` | spruce/birch/jungle/acacia/dark |
| Beetroot crop | 207 | `BeetrootTile` | `:583` | |
| Grass path | 208 | `GrassPathTile` | `:584` | |

## Related

- [Redstone](/slop-docs/world/redstone/) — the ~30 signal/mechanism tiles.
- [Block Entities (TileEntity)](/slop-docs/world/tile-entities/) — extra per-block state.
- [Materials](/slop-docs/world/materials/) — the `Material` a tile carries.
- [Items](/slop-docs/world/items/) — the auto-created `TileItem` for each block.

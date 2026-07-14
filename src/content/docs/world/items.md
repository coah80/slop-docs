---
title: Items
description: The Item base class, its ID space, the two-phase registration, and every item family in neoLegacy — tools, weapons, armor, food, block items, and special items including the TU25/TU31 additions.
---

An **Item** is anything that lives in an inventory slot: tools, weapons, armor,
food, buckets, doors, spawn eggs, records, and the block-in-hand form of every
placeable `Tile`. neoLegacy is a direct C++ port of the decompiled Java LCE code,
so the class is still named `Item` and registration is done the classic Java-LCE
way — static pointer fields on the base class, assigned inside a `staticCtor()`
from a fluent builder chain.

Files: `Item.h`, `Item.cpp`, plus one `*Item.{h,cpp}` per subclass. The registry
is bootstrapped from `Item::staticCtor()`
([`Item.cpp:282`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L282)),
called at line 43 of `MinecraftWorld_RunStaticCtors()` — **after** `Tile::staticCtor()`,
because item registration depends on blocks already existing (see
[the master bootstrap](/slop-docs/world/overview/)).

## The ID space: items vs tiles

This is the single most important thing to understand about items in LCE, and it
trips up every modder. **Item IDs and Tile IDs share one number line.** IDs
0–255 belong to blocks; IDs 256+ belong to pure items. The `Item::items` array is
sized `ITEM_NUM_COUNT = 32000`
([`Item.h:34`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.h#L34)),
and it holds *both* — every `Tile` gets a shadow `Item` entry in the low 256
slots so you can hold it and place it.

The `Item` constructor bakes the 256 offset in:

```cpp
Item::Item(int id) : id( 256 + id )
{
    ...
    if (items[256 + id] != nullptr)
        app.DebugPrintf("CONFLICT @ %d" , id);
    items[256 + id] = this;
}
```

([`Item.cpp:624`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L624))

So the number you pass to a constructor is the item's index **within the item
range**, not its final ID. `new WeaponItem(12, ...)` produces the wooden sword,
whose real ID is `256 + 12 = 268` — matching `wooden_sword_Id = 268`
([`Item.h:459`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.h#L459)).
The `*_Id` constants in `Item.h` are the **final, network- and save-visible**
IDs; the constructor arguments are those minus 256.

| Concept | Value | Source |
|---------|-------|--------|
| Block ID range | 0–255 | shadowed by auto-created `TileItem`s |
| First pure-item ID | 256 (`iron_shovel_Id`) | `Item.h:447` |
| Constructor offset | `+256` | `Item.cpp:624` |
| Registry size | `ITEM_NUM_COUNT = 32000` | `Item.h:34` |
| Records (special high IDs) | 2256–2267 | `Item.h:595`+ |
| Max stack | `LARGE_MAX_STACK_SIZE` (64) | `Item.h:194` |

Note a wrinkle: the `*_Id` header constants and the numbers actually passed to
constructors do **not** always agree in the newer TU25/TU31 block. For example
`prismarine_shard_Id = 409` (`Item.h:656`) but the object is built with
`new Item(153)` → ID `409`... which does match. But `rabbit_hide` is declared
`rabbit_hide_Id = 415` yet built as `new Item(159)` → ID `415` — also consistent.
Always compute `256 + ctorArg` when reading the registration lines; that is the
authoritative ID.

### Block items are created elsewhere

Pure items register themselves in `Item::staticCtor()`. Block (tile) items do
**not** — they are created during `Tile::staticCtor()` / the block-item pass in
`Tile.cpp`. Most blocks get a generic `TileItem` from a fill loop:

```cpp
for (int i = 0; i < 256; i++)
    if (Tile::tiles[i] != nullptr && Item::items[i] == nullptr)
    {
        Item::items[i] = new TileItem(i - 256);
        Tile::tiles[i]->init();
    }
```

([`Tile.cpp:663`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Tile.cpp#L663))

Blocks that need multiple sub-textures or aux-data variants are assigned a typed
`TileItem` subclass *before* this loop runs, so the loop skips them (`Item::items[i] == nullptr`
guard). `TileItem::tileId = id + 256` maps the item back to its block
([`TileItem.cpp:20`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/TileItem.cpp#L20)).
See the [Blocks page](/slop-docs/world/blocks/) for the block side.

## The base class

`class Item : public enable_shared_from_this<Item>`
([`Item.h:28`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.h#L28)).
Items are singletons (one instance per ID, stored in `Item::items`); the *stacks*
players carry are `ItemInstance` objects that reference an `Item` by ID plus a
count and aux/data value.

### Key members

| Member | Type | Notes |
|--------|------|-------|
| `id` | `const int` | final ID (already offset by 256) |
| `maxStackSize` | `int` | default 64 |
| `maxDamage` | `int` | 0 = not damageable |
| `icon` | `Icon *` | resolved from `m_textureName` |
| `m_iBaseItemType` | `int` | crafting-menu category, `eBaseItemType_*` |
| `m_iMaterial` | `int` | crafting-menu material, `eMaterial_*` |
| `m_handEquipped` | `bool` | held out from the body (tools/sticks) |
| `m_isStackedByData` | `bool` | aux value distinguishes sub-items (dye, fish) |
| `craftingRemainingItem` | `Item *` | e.g. bucket left after milk/water |
| `potionBrewingFormula` | `wstring` | brewing-graph ingredient key |
| `descriptionId` | `unsigned int` | `strings.h` name ID |
| `useDescriptionId` | `unsigned int` | `strings.h` tooltip ID |
| `m_textureName` | `wstring` | per-item texture (4J switched from atlas coords) |

The constant `ICON_DESCRIPTION_PREFIX = L"item."`
([`Item.cpp:26`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L26))
prefixes localization keys.

### The two crafting-menu enums (4J additions)

The `eMaterial` and `eBaseItemType` enums (`Item.h:40` / `Item.h:100`) are
**4J-Playbox additions** — comments in the source label them "added for new
crafting menu". Vanilla PC Minecraft has no such tagging; the console crafting
menu groups items by (material × base type). Selected values:

| `eBaseItemType_*` | Meaning |
|-------------------|---------|
| `sword`, `shovel`, `pickaxe`, `hatchet`, `hoe` | tool classes |
| `helmet`, `chestplate`, `leggings`, `boots` | armor slots |
| `door`, `fence`, `fenceGate`, `stairs`, `slab`, `halfslab` | structural |
| `bow`, `rod`, `fireworks`, `redstoneContainer` | misc devices |
| `giltFruit`, `seed`, `bowl`, `treasure` | food/misc |

`setBaseItemTypeAndMaterial(iType, iMaterial)`
([`Item.cpp:653`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L653))
sets both in one call; it appears in almost every registration line.

### Virtual behaviour hooks

| Virtual | Purpose |
|---------|---------|
| `useOn(...)` | right-click on a block (place, till, dye) |
| `use(instance, level, player)` | right-click in air (bows, food, potions) |
| `useTimeDepleted(...)` | fired when a held-use action completes (eating) |
| `getUseDuration` / `getUseAnimation` | held-use timing and animation |
| `releaseUsing(...)` | held-use released early (bow) |
| `getDestroySpeed(instance, tile)` | mining speed against a block |
| `hurtEnemy(...)` / `getAttackDamage(entity)` | combat |
| `mineBlock(...)` | called after a block is broken (durability) |
| `inventoryTick(...)` | per-tick while in inventory (compass/clock) |
| `onCraftedBy(...)` | post-craft callback |
| `appendHoverText(...)` | tooltip lines (`vector<HtmlString>`) |
| `isFoil` / `getRarity` / `isEnchantable` | enchant glint, name color, table eligibility |
| `registerIcons(IconRegister *)` | texture registration |
| `getDefaultAttributeModifiers()` | attribute map (attack damage etc.) |

The fluent setters (`setIconName`, `setMaxStackSize`, `setDescriptionId`,
`setUseDescriptionId`, `setCraftingRemainingItem`, `setStackedByData`,
`setMaxDamage`, `handEquipped`, `setPotionBrewingFormula`) all return `this`,
enabling the one-line builder chains used throughout `staticCtor()`.

## `Item` vs `ItemInstance` — who mutates what

The single most important runtime distinction: an **`Item` is a shared flyweight**
(one per ID, in `Item::items`), and an **`ItemInstance` is the mutable stack** the
player actually holds (`id` + `count` + aux/damage value, one heap object per
slot). Every behaviour virtual on `Item` takes the `ItemInstance` as an argument
and mutates *that*, never the flyweight. The two mutation primitives on
`ItemInstance` are:

- **`count`** — the stack size. Consuming an item decrements it directly
  (`instance->count--`); a stack that hits `count == 0` is nulled out of the
  inventory slot by the caller.
- **`hurtAndBreak(dmg, owner)`** (`ItemInstance.cpp:438`) — durability. It early-outs
  in creative (`abilities.instabuild`, `:441`) and for non-damageable items, then
  `hurt(dmg, random)` (`:409`) which raises the damage aux value; when it crosses
  `maxDamage` the tool breaks (`breakItem`, `count--`, `:445-448`).

## Worked trace: right-click a block (`useOn`)

The place/use-on path, from input to `setTileAndData`, for a **block item**:

1. **Input.** The client interaction driver `SurvivalMode::useItemOn`
   (`SurvivalMode.cpp:192`) fires on a right-click against a block face. It first
   offers the *targeted block* the click (`Tile::use`, `:197` — this is how a
   crafting table or chest opens instead of placing). If the block doesn't consume
   it, it forwards to `item->useOn(player, level, x, y, z, face)` (`:200`).
2. **Dispatch.** `Item::useOn` is the virtual; for anything placeable it is
   `TileItem::useOn` (`TileItem.cpp:49`), which offsets by `face`, validates
   (`mayUseItemAt`, `mayPlace`), and commits with
   `level->setTileAndData(x, y, z, tileId, dataValue, UPDATE_ALL)`
   (`TileItem.cpp:86`) — handing off to the
   [block placement pipeline](/slop-docs/world/blocks/#worked-trace-the-full-life-of-a-placed-block).
3. **Consume.** On success `TileItem::useOn` decrements the stack
   (`instance->count--`, `TileItem.cpp:155`) — the only mutation to the held
   `ItemInstance`. A tool's `useOn` instead calls `hurtAndBreak` (e.g. the shovel's
   grass-path conversion, `ShovelItem.cpp:30`).

## Worked trace: eating (held-use → `useTimeDepleted`)

`use()` (right-click in air) starts a **held-use** that runs over multiple ticks
before the effect lands — this is the mechanism behind eating, drawing a bow, and
drinking a potion. Following an apple:

1. **Right-click in air.** `MultiPlayerGameMode::useItem` (`MultiPlayerGameMode.cpp:387`)
   snapshots the count and calls `item->use(level, player)` (`:410`). For food that
   is `FoodItem::use` (`FoodItem.cpp:67`): if `player->canEat(canAlwaysEat)` it calls
   `player->startUsingItem(instance, getUseDuration(instance))` (`:71`) with
   `EAT_DURATION = 32` ticks — it does **not** consume the food yet, just arms the
   timer.
2. **Countdown.** Every tick, `Player::tick` (`:320`) → `Player::updateFrameTick`
   (`Player.cpp:251`) runs `--useItemDuration` (`:269`), spawns eat particles as it
   nears zero (`:265-267`), and when it reaches 0 on the server calls
   `completeUsingItem()` (`:273`).
3. **Effect + consume.** `Player::completeUsingItem` (`Player.cpp:587`) calls
   `useItem->useTimeDepleted(level, player)` (`:594`). For food that is
   `FoodItem::useTimeDepleted` (`FoodItem.cpp:36`): it decrements the stack
   (`instance->count--`, `:38`), feeds the player (`getFoodData()->eat(this)`, `:39`),
   plays the burp (`:41`), and applies any status effect via `addEatEffect` (`:43`,
   e.g. raw chicken's 30 % hunger). The returned instance (possibly `count == 0`, or
   a different item like the bowl a stew leaves behind) replaces the inventory slot.

Releasing early (`Player::releaseUsingItem`, `:220`) instead calls
`useItem->releaseUsing(...)` (`:224`) with the remaining duration — this is how a
bow reads its draw time to compute arrow velocity. `getUseAnimation`
(`FoodItem.cpp:62` → `UseAnim_eat`) picks the first-person animation the client
plays during the countdown.

## Tool tiers

Tool durability, speed, and damage come from a shared `Item::Tier` table
([`Item.h:160`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.h#L160)),
five static instances defined at the top of `Item.cpp`:

```cpp
const _Tier *_Tier::WOOD    = new _Tier(0,   59, 2,  0, 15);
const _Tier *_Tier::STONE   = new _Tier(1,  131, 4,  1,  5);
const _Tier *_Tier::IRON    = new _Tier(2,  250, 6,  2, 14);
const _Tier *_Tier::DIAMOND = new _Tier(3, 1561, 8,  3, 10);
const _Tier *_Tier::GOLD    = new _Tier(0,   32, 12, 0, 22);
```

([`Item.cpp:28`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L28))

| Tier | level | uses | speed | dmg bonus | ench value |
|------|-------|------|-------|-----------|-----------|
| WOOD | 0 | 59 | 2.0 | 0 | 15 |
| STONE | 1 | 131 | 4.0 | 1 | 5 |
| IRON | 2 | 250 | 6.0 | 2 | 14 |
| DIAMOND | 3 | 1561 | 8.0 | 3 | 10 |
| GOLD | 0 | 32 | 12.0 | 0 | 22 |

`level` gates which ores a pickaxe can harvest (`canDestroySpecial`); `speed` is
the base mining multiplier against a tool's diggable set; the `dmg bonus` feeds
into weapon damage.

## Tools and weapons

`DiggerItem`
([`DiggerItem.h`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/DiggerItem.h))
is the base for the three mining tools. It stores a `TileArray *tiles` (the set
of blocks it mines fast), a `speed`, an `attackDamage`, and its `Tier`.

- **`PickaxeItem`**, **`ShovelItem`**, **`HatchetItem`** (axe), **`HoeItem`**.
- **`WeaponItem`** (sword) — not a `DiggerItem`. Its damage is
  `4 + tier->getAttackDamageBonus()`
  ([`WeaponItem.cpp:15`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/WeaponItem.cpp#L15)),
  so wood/gold swords deal 4, stone 5, iron 6, diamond 7.

Each digger family owns a **static diggable-block table** filled by its own
`staticCtor()`, called from the bootstrap at lines 37–39 (see
[master bootstrap](/slop-docs/world/overview/)):

| Tool | Table constant | Entries | Filled in |
|------|---------------|---------|-----------|
| Pickaxe | `PICKAXE_DIGGABLES = 23` | stone, ores, rails, ice, netherrack, lapis… | `PickaxeItem.cpp:7` |
| Shovel | `SHOVEL_DIGGABLES = 10` | grass, dirt, sand, gravel, snow, clay, farmland, soul sand, mycelium | `ShovelItem.cpp:11` |
| Hatchet | `HATCHET_DIGGABLES = 8` | wood, bookshelf, log, chest, wood slabs, pumpkin, lit pumpkin | `HatchetItem.cpp:7` |

`PickaxeItem::canDestroySpecial(tile)` layers the harvest-level gate on top:
obsidian needs level 3 (diamond); diamond/emerald/gold ore and lit redstone ore
need level ≥ 2; iron/lapis ore need level ≥ 1
([`PickaxeItem.cpp:39`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/PickaxeItem.cpp#L39)).

The `ShovelItem` also carries the **grass-path** interaction (TU31): right-clicking
grass or dirt with a shovel converts it to `Tile::grass_path`
([`ShovelItem.cpp:30`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ShovelItem.cpp#L30)).

Other tool-like items: **`BowItem`**, **`FishingRodItem`**, **`ShearsItem`**,
**`FlintAndSteelItem`**, **`CarrotOnAStickItem`**, **`LeashItem`** (lead),
**`SaddleItem`**.

Tool registration IDs (final, from `Item.h`): iron shovel 256, iron pickaxe 257,
iron axe 258, flint & steel 259, bow 261, wooden sword 268 … golden hoe 294. Note
the tools are **not** contiguous by material — the iron tools take the lowest IDs
(256–258) for historical reasons, and the constructor arguments (`ShovelItem(0,…)`
for iron) reflect that.

## Armor

`ArmorItem`
([`ArmorItem.h`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ArmorItem.h))
holds a `slot`, a `defense`, a `modelIndex`, and an `ArmorMaterial *`. Slots:

| Constant | Value |
|----------|-------|
| `SLOT_HEAD` | 0 |
| `SLOT_TORSO` | 1 |
| `SLOT_LEGS` | 2 |
| `SLOT_FEET` | 3 |

`ArmorItem::ArmorMaterial` is a nested class with five static instances. Each
carries a `durabilityMultiplier`, a four-entry `slotProtections[]` array (defense
per slot, in half-shields), and an `enchantmentValue`
([`ArmorItem.cpp:64`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ArmorItem.cpp#L64)):

| Material | durability × | protection {head, torso, legs, feet} | ench value |
|----------|-------------|--------------------------------------|-----------|
| CLOTH (leather) | 5 | {1, 3, 2, 1} | 15 |
| CHAIN | 15 | {2, 5, 4, 1} | 12 |
| IRON | 15 | {2, 6, 5, 2} | 9 |
| GOLD | 7 | {2, 5, 3, 1} | 25 |
| DIAMOND | 33 | {3, 8, 6, 3} | 10 |

Actual durability = `healthPerSlot[slot] * durabilityMultiplier`, where
`healthPerSlot[] = {11, 16, 15, 13}`
([`ArmorItem.cpp:15`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ArmorItem.cpp#L15)).
So a diamond chestplate has `16 * 33 = 528` uses.

Leather armor supports dyeing: `ArmorItem` overrides `hasCustomColor` /
`getColor` / `setColor` / `clearColor` and has `hasMultipleSpriteLayers()` for the
tint-overlay layer. `DEFAULT_LEATHER_COLOR = eMinecraftColour_Armour_Default_Leather_Colour`.

The full 20-piece armor set (4 materials × 4 slots + 4 chain) registers at
`Item.cpp:317`–`340` with IDs 298–317 (leather/iron/diamond/gold) and 302–305
(chain). **Elytra** is registered as an `ArmorItem`-adjacent chestplate — see
[Special items](#special-items).

## Food

`FoodItem`
([`FoodItem.h`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/FoodItem.h))
carries `nutrition`, `saturationModifier`, an `m_isMeat` flag, `canAlwaysEat`, and
an optional applied effect (`effectId`, `effectDurationSeconds`, `effectAmplifier`,
`effectProbability`). Eating takes `EAT_DURATION = 32` ticks (`20 * 1.6`).
Saturation values come from `FoodConstants` (e.g. `FOOD_SATURATION_LOW`,
`FOOD_SATURATION_NORMAL`, `FOOD_SATURATION_GOOD`, `FOOD_SATURATION_SUPERNATURAL`).

Food subclasses:

- **`FoodItem`** — plain food (apple, bread, cooked meats, potatoes).
- **`GoldenAppleItem`** — golden apple; sets an eat-effect (regeneration) and
  `setCanAlwaysEat`.
- **`FishFoodItem`** — raw/cooked fish, `setStackedByData(true)` for the fish
  variants; raw fish carries the pufferfish brewing formula.
- **`SeedFoodItem`** — carrot/potato: edible *and* plantable (holds a crop tile ID).
- **`BowlFoodItem`** — mushroom stew, rabbit stew, beetroot soup; returns a bowl.
- **`MilkBucketItem`** — clears all effects, returns a bucket.

Representative registrations:

```cpp
Item::apple      = (new FoodItem(4, 4, FOOD_SATURATION_LOW, false))->setIconName(L"apple")...
Item::cooked_beef= (new FoodItem(108, 8, FOOD_SATURATION_GOOD, true))->setIconName(L"beefCooked")...
Item::raw_chicken= (new FoodItem(109, 2, FOOD_SATURATION_LOW, true))
                     ->setEatEffect(MobEffect::hunger->id, 30, 0, .3f)->setIconName(L"chickenRaw")...
```

([`Item.cpp:362`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L362))

Raw chicken (30 % hunger), rotten flesh (80 % hunger), spider eye (poison), and
poisonous potato (60 % poison) all use `setEatEffect(id, seconds, amplifier, probability)`.

## Block items (TileItem family)

`TileItem`
([`TileItem.h`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/TileItem.h))
is the in-hand form of a block. It maps ID→tile (`tileId = id + 256`), overrides
`useOn` to place the block, and forwards its description ID to the owning `Tile`.
Its subclasses exist to handle blocks whose item form needs extra behaviour or
sub-variant textures:

| Subclass | Handles |
|----------|---------|
| `AuxDataTileItem` | item keeps the block's data byte (colored/oriented) |
| `ColoredTileItem` | 16-color wool / stained clay |
| `ClothTileItem` | wool |
| `WoolTileItem` / `WoolCarpetTileItem` | wool and carpet variants |
| `LeafTileItem` | leaves (don't decay when placed) |
| `MultiTextureTileItem` | multi-variant blocks (log, planks, stone, sapling…) |
| `TreeTileItem` | wood-type-aware placement |
| `SaplingTileItem` | saplings (6 types) |
| `PistonTileItem` | piston base/sticky |
| `StoneSlabTileItem` | stone slab variants |
| `SmoothStoneBrickTileItem` | stone brick variants |
| `StoneMonsterTileItem` | monster egg (silverfish) blocks |
| `TilePlanterItem` | items that place a *different* tile than their ID (see below) |

`MultiTextureTileItem` is the workhorse for aux-data blocks. It is constructed
with the block, the variant name array, and the count, e.g.:

```cpp
Item::items[log_Id] = (new MultiTextureTileItem(Tile::log_Id - 256, treeTrunk,
    (int*)TreeTile::TREE_NAMES, 6))->setIconName(L"log")->setDescriptionId(IDS_TILE_LOG)...
```

([`Tile.cpp:617`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Tile.cpp#L617))

**`TilePlanterItem`** is a special case worth calling out: it's an item that,
when used, places a tile whose ID differs from the item's own. This is how items
above 256 place blocks below 256 — string places tripwire, reeds place sugar cane,
cake/repeater/comparator/brewing-stand/cauldron/flower-pot all place their block:

```cpp
Item::reeds    = (new TilePlanterItem(82, Tile::reeds))->setIconName(L"reeds")...
Item::repeater = (new TilePlanterItem(100, Tile::unpowered_repeater))->setIconName(L"diode")...
```

([`Item.cpp:401`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L401))

## Special items

A grab-bag of items with bespoke `use`/`useOn` behaviour:

| Class | Item(s) |
|-------|---------|
| `PotionItem` | potion (aux value selects the brew) |
| `BottleItem` | glass bottle |
| `SpawnEggItem` (+ `MonsterPlacerItem`) | mob spawn egg |
| `BucketItem` | empty/water/lava bucket (holds the fluid tile ID) |
| `DoorItem` | placeable doors (see below) |
| `BedItem` | bed (stack size 1) |
| `SignItem` | sign |
| `MinecartItem` | minecart + chest/furnace/TNT/hopper variants |
| `BoatItem` | boat |
| `SkullItem` | mob/player heads |
| `RecordingItem` | 12 music discs (IDs 2000–2011) |
| `WritingBookItem` / `WrittenBookItem` / `EnchantedBookItem` | books |
| `EnderEyeItem` / `EnderpearlItem` | ender eye / pearl |
| `SnowballItem` / `EggItem` / `FireChargeItem` | throwables |
| `NameTagItem` / `LeashItem` / `SaddleItem` | mob utility |
| `ExperienceItem` | bottle o' enchanting |
| `SimpleFoiledItem` | nether star (always glints) |
| `HangingEntityItem` | painting, item frame |
| `CompassItem` / `ClockItem` / `MapItem` / `EmptyMapItem` | pocket tools |
| `DyePowderItem` | dye (16 aux-value colors — see below) |

Minecarts share one class with a type argument:
`new MinecartItem(72, Minecart::TYPE_RIDEABLE)`, `TYPE_CHEST`, `TYPE_FURNACE`,
`TYPE_TNT`, `TYPE_HOPPER` (`Item.cpp:391`+).

Music discs jump to a separate high ID band (2000-series constructor arg →
2256-series final ID). Note the ordering quirk: `record_08` is assigned last
(`new RecordingItem(2011, L"where are we now")`, the "Cat"/TU-era bonus disc),
so the pointer indices don't match the play order
([`Item.cpp:467`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L467)).

### Dye

`DyePowderItem`
([`DyePowderItem.h`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/DyePowderItem.h))
is a single item (ID `256 + 95 = 351`) with 16 color variants selected by aux
value — it calls `setStackedByData(true)` so each color stacks separately. The
color indices are:

| Idx | Name | RGB | Idx | Name | RGB |
|-----|------|-----|-----|------|-----|
| 0 | BLACK | `0x1e1b1b` | 8 | GRAY | `0x434343` |
| 1 | RED | `0xb3312c` | 9 | PINK | `0xd88198` |
| 2 | GREEN | `0x3b511a` | 10 | LIME | `0x41cd34` |
| 3 | BROWN | `0x51301a` | 11 | YELLOW | `0xdecf2a` |
| 4 | BLUE | `0x253192` | 12 | LIGHT_BLUE | `0x6689d3` |
| 5 | PURPLE | `0x7b2fbe` | 13 | MAGENTA | `0xc354cd` |
| 6 | CYAN | `0x287697` | 14 | ORANGE | `0xeb8844` |
| 7 | SILVER | `0xababab` | 15 | WHITE | `0xf0f0f0` |

([`DyePowderItem.cpp:68`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/DyePowderItem.cpp#L68))

`DyePowderItem::useOn` doubles as bone-meal (`growCrop`) and sheep-coloring
(`interactEnemy`). The **TU31 delta** here is that `useOn` now also fertilizes the
**beetroot** crop (`Tile::beetroots_Id`) in addition to wheat/carrots/potatoes
([`DyePowderItem.cpp:250`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/DyePowderItem.cpp#L250)) —
the beetroot block is itself a TU31 backport (see below). Beetroot also yields
red dye when crafted, but that is handled in the recipe tables, not in
`DyePowderItem` itself.

## neoLegacy / newer-TU item additions

These items do **not** exist in vanilla LCE TU19; they are TU25/TU31 backports.
All are registered at the tail of `Item::staticCtor()`
([`Item.cpp:530`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L530)+).

| Item | Class | Ctor arg | Final ID | Notes |
|------|-------|----------|----------|-------|
| Spruce door | `DoorItem` | 171 | 427 | wood material, `doorSpruce` |
| Birch door | `DoorItem` | 172 | 428 | `doorBirch` |
| Jungle door | `DoorItem` | 173 | 429 | `doorJungle` |
| Acacia door | `DoorItem` | 174 | 430 | `doorAcacia` |
| Dark oak door | `DoorItem` | 175 | 431 | `doorDark` |
| Raw mutton | `FoodItem` | 167 | 423 | nutrition 2 |
| Cooked mutton | `FoodItem` | 168 | 424 | nutrition 6 |
| Raw rabbit | `FoodItem` | 155 | 411 | meat |
| Cooked rabbit | `FoodItem` | 156 | 412 | meat |
| Rabbit stew | `BowlFoodItem` | 157 | 413 | nutrition 10 |
| Rabbit foot | `Item` | 158 | 414 | leaping brewing formula |
| Rabbit hide | `Item` | 159 | 415 | crafting material |
| Armor stand | `ArmorStandItem` | 160 | 416 | stack size 16 |
| Prismarine crystal | `Item` | 154 | 410 | sea lantern / guardian drop |
| Prismarine shard | `Item` | 153 | 409 | prismarine / guardian drop |
| Elytra | `ElytraItem` | 187 | 443 | chestplate slot, `L"elytra"` |
| Beetroot | `FoodItem` | 178 | 434 | nutrition 1, sat 0.6 |
| Beetroot seeds | `SeedItem` | 179 | 435 | plants `Tile::beetroots` |
| Beetroot soup | `BowlFoodItem` | 180 | 436 | nutrition 6 |
| Fireworks | `FireworksItem` | 145 | 401 | with `FireworksMenu` |
| Firework charge | `FireworksChargeItem` | 146 | 402 | — |

### Door items (new woods)

`DoorItem`
([`DoorItem.h`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/DoorItem.h))
takes `(id, Material *, doorType)`. TU19 shipped only `wooden_door` (ID 324) and
`iron_door` (ID 330). TU25 adds the five wood variants above — all built with
`Material::wood` and a distinct `doorType` string that keys the placed block and
texture:

```cpp
Item::spruce_door = (new DoorItem(171, Material::wood, L"doorSpruce"))
    ->setBaseItemTypeAndMaterial(eBaseItemType_door, eMaterial_wood)
    ->setIconName(L"doorSpruce")->setDescriptionId(IDS_ITEM_DOOR_SPRUCE)...
```

([`Item.cpp:535`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Item.cpp#L535))

`DoorItem::place(level, x, y, z, dir, tile)` (static) writes the two-tall door
block pair. The acacia and dark-oak doors pair with the acacia/dark-oak tile set
described on the [Blocks page](/slop-docs/world/blocks/).

### Armor stand item

`ArmorStandItem`
([`ArmorStandItem.h`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ArmorStandItem.h))
is ID `256 + 160 = 416` with `maxStackSize = 16`
([`ArmorStandItem.cpp:12`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/ArmorStandItem.cpp#L12)).
Its `useOn` spawns an `ArmorStand` entity at the clicked position; the static
`randomizePose(stand, rng)` helper jitters the head/body pose. This is a paired
item+entity backport — the entity side (`eTYPE_ARMORSTAND`) lives in the
[entity registry](/slop-docs/world/entities/).

## staticInit vs staticCtor

Item registration is genuinely two-phase:

- **`Item::staticCtor()`** (`Item.cpp:282`) builds every item object.
- **`Item::staticInit()`** (`Item.cpp:558`) runs *after* other subsystems (recipes,
  stats) and calls `Stats::buildItemStats()` to wire per-item statistics.

The comment at `Item.cpp:556` spells out the ordering requirement: item stats
need recipes to exist first, so the stat build is deferred out of the constructor.
There is also a `Stats::buildItemStats()` call at the end of the block-item pass
in `Tile.cpp:695`, covering the block items.

## Modding: adding a new item

To register a new pure item:

1. Add a `static Item *my_item;` field to `Item.h` and a matching
   `static const int my_item_Id = <256+N>;` constant. Pick an unused slot above
   256 (or above 443, the current elytra high-water mark).
2. Add `Item *Item::my_item = nullptr;` to the static-init block in `Item.cpp`.
3. Register it inside `Item::staticCtor()`:
   ```cpp
   Item::my_item = (new Item(N))
       ->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_undefined)
       ->setIconName(L"my_item")
       ->setDescriptionId(IDS_ITEM_MY_ITEM)
       ->setUseDescriptionId(IDS_DESC_MY_ITEM);
   ```
   remembering the ctor argument `N` becomes ID `256 + N`.
4. Add the `IDS_ITEM_MY_ITEM` / `IDS_DESC_MY_ITEM` strings and the texture.
5. If the item places a block, subclass `TileItem` / use `TilePlanterItem`
   instead; if it's a tool/food/armor, subclass the appropriate family so tier
   and behaviour come for free.

Watch the `CONFLICT @ %d` debug print (`Item.cpp:645`) — it fires if two items
claim the same slot, the fastest way to catch an ID collision.

## Related pages

- [Blocks (Tiles)](/slop-docs/world/blocks/) — the block registry and the shared ID space.
- [Materials](/slop-docs/world/materials/) — the `Material` instances tiles and doors reference.
- [Block Entities (TileEntity)](/slop-docs/world/tile-entities/) — per-block state.
- [Entities](/slop-docs/world/entities/) — the armor stand and spawn-egg entity side.
- [Container Menus](/slop-docs/world/containers/) — the fireworks/brewing/anvil UIs.

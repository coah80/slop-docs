---
title: Crafting & Recipes
description: The Recipes registry in neoLegacy — shaped, shapeless and smelting recipes, the va_list-based registration idiom, and the TU31 stone-variant and dye recipe additions.
---

Crafting in neoLegacy is a compiled, imperative recipe list — not a data pack.
The `Recipes` singleton builds every crafting recipe once at boot by calling
`addShapedRecipy` / `addShapelessRecipy` in `_compileRecipes()`, and
`FurnaceRecipes` builds the smelting table the same way. Recipes can be
re-compiled from local data or replaced wholesale from a network packet.

Files: `Recipes.h`, `Recipes.cpp` (large), `Recipy.h`, `FurnaceRecipes.h`/`.cpp`,
plus sub-recipe helpers (`ArmorRecipes`, `ClothDyeRecipes`, `FoodRecipies`,
`OreRecipies`, `StructureRecipies`, `ToolRecipies`, `WeaponRecipies`,
`FireworksRecipe`) and the UI (`CraftingMenu`, `InventoryMenu`, `FurnaceMenu`).

## The Recipes singleton

`class Recipes` (`Recipes.h:67`) holds a `vector<Recipy *> *recipies` and a
static `instance`. `Recipes::staticCtor()` (`Recipes.cpp:22`) just constructs it;
the constructor runs `_init()` then `_compileRecipes()`
(`Recipes.cpp:1268-1272`).

```cpp
void Recipes::staticCtor()
{
    Recipes::instance = new Recipes();
}
```

`_init()` (`Recipes.cpp:28`) allocates the recipe list and news up the seven
sub-recipe helper objects plus the fireworks recipe. Several special recipe
classes are **commented out** because they don't work with the console crafting
menu (`Recipes.cpp:41-46`):

```cpp
// 4J Stu - These just don't work with our crafting menu
//recipies->push_back(new ArmorDyeRecipe());
//recipies->add(new MapCloningRecipe());
//recipies->add(new MapExtendingRecipe());
//recipies->add(new FireworksRecipe());
pFireworksRecipes = new FireworksRecipe();
```

So `ArmorDyeRecipe`, `MapCloningRecipe`, `MapExtendingRecipe` exist in the tree
but are not registered on this platform.

## Registration idiom (the va_list builder)

`addShapedRecipy(ItemInstance *result, ...)` (`Recipes.cpp:1275`) is a
variadic function driven by a **type-tag string** as its first vararg. This is a
4J rewrite of the Java `Object...` recipe signature, which C++ can't express the
same way (`Recipes.cpp:1274` note). The tag characters
(`Recipes.cpp:1300-1306`):

| Tag | Following vararg | Meaning |
|-----|------------------|---------|
| `s` | `wchar_t *` | a pattern row (string) |
| `w` | `wstring *` | a null-terminated array of rows |
| `a` | `wchar_t *` | a pattern row (char*) |
| `c` | `wchar_t` | the key char for the next mapping |
| `z` | `ItemInstance *` | map current key → this exact instance |
| `i` | `Item *` | map current key → item, any aux value |
| `t` | `Tile *` | map current key → tile, any aux value |
| `g` | `wchar_t` | crafting-menu group for the result |

The group char (`g`) sorts the recipe into a crafting-menu tab
(`Recipes.cpp:1365-1395`): `T` Tool, `A` Armour, `S` Structure, `V` Transport,
`M` Mechanism, `F` Food, `D`/default Decoration. A typical call:

```cpp
addShapedRecipy(new ItemInstance(Tile::hopper),
    L"ssscictg",           // 3 rows (s s s), a char (c), an item (i),
    L"I I",                //   a tile (t), a group (g)
    L"ICI",
    L" I ",
    L'I', Item::iron_ingot, L'C', Tile::chest,
    L'M');                 // Mechanism group
```

Shapeless recipes use `addShapelessRecipy` (`Recipes.cpp:1425`), whose tag string
only understands `z`/`i`/`t`/`g`. Some shaped recipes chain a fluent modifier —
`carrot_on_a_stick` ends with `->keepTag()` (`Recipes.cpp:778`).

## Sub-recipe helpers

`_compileRecipes()` (`Recipes.cpp:49`) mixes inline `addShapedRecipy` calls with
`pXxxRecipies->addRecipes(this)` calls that delegate to a helper. Order matters —
it is deliberately arranged for the console crafting-menu layout
(comments like `// 4J-PB - changing the order to the way we want`). The helpers:

| Helper | Adds |
|--------|------|
| `ToolRecipies` | pickaxes, axes, shovels, hoes, shears, etc. |
| `WeaponRecipies` | swords (bow/arrow moved inline to avoid group stacking) |
| `ArmorRecipes` | armor sets |
| `FoodRecipies` | cooked/prepared food recipes |
| `OreRecipies` | ingot ↔ block compression |
| `StructureRecipies` | building blocks |
| `ClothDyeRecipes` | wool/carpet/clay dyeing + dye mixing |
| `FireworksRecipe` | fireworks (dummy recipes to reach the fireworks scene) |

## The ingredient-requirements array

After compiling, `buildRecipeIngredientsArray()` (`Recipes.cpp:1551`) walks the
list and fills `m_pRecipeIngredientsRequired[]` — one
`Recipy::INGREDIENTS_REQUIRED` per recipe, holding parallel arrays of ingredient
IDs, values, aux values and grid positions. This is the flattened form the Xbox
"crafting" UI iterates (a 4J addition, `Recipes.cpp:1550`). `_wipeRecipes()`
(`Recipes.cpp:1245`) frees both this array and the recipe list.

## Matching and crafting

`getItemFor(craftSlots, level, recipesClass)` (`Recipes.cpp:1498`) resolves a
crafting grid to a result. Two special-cases precede the recipe scan:

- **Tool repair by combining** — two identical damageable tools, count 1 each,
  merge into one with combined durability plus a 5% bonus
  (`Recipes.cpp:1514-1523`). This is hard-coded, not a recipe.
- Then it scans `recipies` (or a single passed `recipesClass`) calling
  `r->matches(...)` / `r->assemble(...)`.

`Recipy` subclasses are `ShapedRecipy` and `ShapelessRecipy` (plus the disabled
special recipes). `ANY_AUX_VALUE = -1` (`Recipes.h:70`) is the wildcard used when
a mapping is made via an `Item *`/`Tile *` tag rather than an explicit instance.

### How `ShapedRecipy::matches` scans the grid

`ShapedRecipy::matches` (`ShapedRecipy.cpp:54`) slides the recipe's `width×height`
pattern over the 3×3 grid at every offset (`:56-58`) and tries it both un-flipped and
mirrored (`matches(..., true)` / `matches(..., false)`, `:60-61`) — so a recipe
matches regardless of where in the grid it's laid and in either handedness. The inner
overload (`:67`) compares all 9 cells: an empty cell must line up with an empty
pattern slot (`:80`), ids must match (`:88`), and aux values must match **unless** the
pattern slot is `ANY_AUX_VALUE` (`:92`) — the wildcard from an `i`/`t`-tagged
ingredient. `ShapelessRecipy::matches` (`ShapelessRecipy.cpp:45`) instead just checks
the multiset of ingredients ignoring position.

## Worked trace: filling the grid → result appears → taking it

**1 — Grid changes.** Every time a crafting slot changes, the menu recomputes the
result: `CraftingMenu::slotsChanged` (`CraftingMenu.cpp:46`) calls
`resultSlots->setItem(0, Recipes::getInstance()->getItemFor(craftSlots, level))`
(`:48`). (The player-inventory 2×2 grid does the same from `InventoryMenu.cpp:70`.)

**2 — Resolve (`getItemFor`).** `Recipes::getItemFor` (`Recipes.cpp:1498`) first
scans the grid, counting non-null items (`:1503-1512`). Two fast paths precede the
recipe scan:
- **Tool repair** — exactly two identical damageable tools, count 1 each: merge into
  one with combined remaining durability plus a `maxDamage*5/100` bonus (`:1514-1523`).
  This is hard-coded, not a `Recipy`.
- Otherwise it iterates `recipies` and returns the first `r->matches(craftSlots, level)`
  → `r->assemble(craftSlots)` (`:1531-1534`).

**3 — Assemble.** `ShapedRecipy::assemble` (`ShapedRecipy.cpp:101`) returns a copy of
the result item (`:103`), optionally copying NBT when `_keepTag` is set (the
`->keepTag()` recipes like carrot-on-a-stick). The result lands in the display slot;
it is not yet consumed.

**4 — Take (`onTake`).** Pulling the result out fires `ResultSlot::onTake`
(`ResultSlot.cpp:57`), which first calls `checkTakeAchievements(carried)` (`:59`).
That does the craft callback: `carried->onCraftedBy(player->level, player, removeCount)`
(`ResultSlot.cpp:38`) → `ItemInstance::onCraftedBy` (`ItemInstance.cpp:627`) →
`player->onCrafted(...)`, `awardStat(itemsCrafted(id), …)`, and the item's own
`Item::items[id]->onCraftedBy(...)` hook (`:637`). The remaining lines award the
specific build achievements (workbench, pickaxe, sword by base-item-type, …,
`ResultSlot.cpp:41-54`).

**5 — Consume the grid.** Back in `onTake` (`:61-90`), each ingredient is decremented
by 1 (`craftSlots->removeItem(i, 1)`, `:66`); if the item has a crafting-remaining
item (bucket → empty bucket, bottle) it is returned to the inventory, put back in the
now-empty slot, or dropped (`:68-89`).

## Network sync

Recipes are not fixed to the client — the whole list can be shipped over the
wire. `loadFromLocal()` (`Recipes.cpp:1573`) wipes and recompiles from built-in
data; `loadFromPacket(byteArray)` (`Recipes.cpp:1579`) wipes and reads a stream
of type-tagged recipes (`1` = shapeless, `2` = shaped);
`createUpdatePacket()` (`Recipes.cpp:1600`) serializes the list into a
`CustomPayloadPacket` (`CustomPayloadPacket::UPDATE_RECIPE_REGISTRY`). Console
recipe-book crafting itself is driven by `CraftItemPacket` (packet id 150).

## Smelting — FurnaceRecipes

`FurnaceRecipes` (`FurnaceRecipes.cpp`) is a separate singleton, built in
`FurnaceRecipes::staticCtor()` (bootstrap line before `Recipes`). It is a flat
`unordered_map<int, ItemInstance *>` keyed by input ID, with a parallel
`recipeValue` map of XP yields. Inputs with an aux value pack it into the key:
`key = input->id | (input->getAuxValue() << 12)` (`FurnaceRecipes.cpp:62`).

Recipes from source (`FurnaceRecipes.cpp:21-50`):

| Input | Output | XP |
|-------|--------|----|
| iron ore | iron ingot | 0.7 |
| gold ore | gold ingot | 1.0 |
| diamond ore | diamond | 1.0 |
| emerald ore | emerald | 1.0 |
| sand | glass | 0.1 |
| cobblestone | stone | 0.1 |
| stone bricks | cracked stone bricks | 0.1 |
| clay ball | brick | 0.3 |
| clay (block) | hardened clay | 0.35 |
| cactus | green dye | 0.2 |
| log / log2 | charcoal | 0.15 |
| netherrack | nether brick (item) | 0.1 |
| wet sponge (aux 1) | dry sponge (aux 0) | 0.15 |
| raw porkchop/beef/rabbit/mutton/chicken/fish | cooked variant | 0.35 |
| raw fish aux 1 (salmon) | cooked salmon | 0.35 |
| potato | baked potato | 0.35 |
| coal ore | coal | 0.1 |
| redstone ore | redstone | 0.7 |
| lapis ore | blue dye | 0.2 |
| quartz ore | nether quartz | 0.2 |

Coal/redstone/lapis/quartz ore smelting exists to support Silk-Touch-mined ore
blocks (comment `// special silk touch related recipes:`,
`FurnaceRecipes.cpp:44`).

## TU31 recipe additions

The compiled list already includes the post-TU19 blocks and items. Verified in
`Recipes.cpp`:

### Stone / mineral variants

- **Quartz** — quartz block from 4× nether quartz (`Recipes.cpp:871`), quartz
  stairs from quartz block (`:464`), quartz slab (`stoneSlabHalf` `QUARTZ_SLAB`,
  `:601`).
- **Prismarine** — prismarine (2×2 shard, `:486`), prismarine bricks
  (`TYPE_BRICKS`, 9 shards, `:494`), dark prismarine
  (`TYPE_DARK`, shards + black dye, `:504`).
- **Red sandstone** — red-sandstone stairs (`:410`) and red-sandstone slab
  (`stoneSlab2Half` `RED_SANDSTONE_SLAB`, `:560`).
- **Hardened clay** — dyed via the stained-hardened-clay dye recipe below;
  smelted from clay in the furnace (`clayHardened`).

### Wood set (acacia / dark oak)

Acacia and dark-oak get the full plank/slab/stair/fence/gate/door set alongside
oak/birch/spruce/jungle. Planks come from `Tile::log2`
(`TreeTile2::ACACIA_TRUNK` / `DARK_TRUNK`, `Recipes.cpp:80-92`); doors are
`Item::acacia_door` / `Item::dark_oak_door` (`:314-330`).

### Redstone / transport

- **Activator rail** (`Tile::activatorRail`, iron + redstone-torch + sticks,
  `:693`), **dropper** (`Tile::dropper`, `:1038`), **hopper** (`:930`),
  **hopper minecart** (`:747`).
- **Daylight detector** (glass + nether quartz + wood slab, `:921`),
  **comparator** (redstone torch + nether quartz + stone, `:912`),
  **iron trapdoor** (`:349`), **heavy/light weighted pressure plates**
  (`:1016`/`:1023`).

### Dye recipes (ClothDyeRecipes)

`ClothDyeRecipes::addRecipes` (`ClothDyeRecipes.cpp:10`) generates, in a 16-color
loop: wool dyeing (shapeless dye + white wool), stained hardened clay (8× clay
around a dye, `:18`), and wool carpet (2 wool → 3 carpet, `:124`). It then adds
the dye-mixing chain — the primary sources plus every combined color:

| Result | Ingredients |
|--------|-------------|
| yellow dye | flower (dandelion) |
| red dye ×2 | rose |
| white dye ×3 | bone |
| pink ×2 | red + white |
| orange ×2 | red + yellow |
| lime ×2 | green + white |
| gray ×2 | black + white |
| silver ×2 | gray + white |
| silver ×3 | black + white + white |
| light blue ×2 | blue + white |
| cyan ×2 | blue + green |
| purple ×2 | blue + red |
| magenta ×2 | purple + pink |
| magenta ×3 | blue + red + pink |
| magenta ×4 | blue + red + red + white |

Stained-glass dyeing is present but **commented out**
(`ClothDyeRecipes.cpp:26-39`).

### Misc TU31 items

`armor_stand` (sticks + stone slab, `Recipes.cpp:1098`), `leather` from
`rabbit_hide` (`:1090`), fireworks / firework charge (dummy recipes to reach the
fireworks menu, `:1218-1240`), and the sticky piston from slime ball + piston
(`:1208`).

> **Changed in v1.1.0b:** commit `a4c746be TU43 Structures, bug fixes & minor
> changes` inserts six more shaped recipes into `_compileRecipes()` (around
> `Recipes.cpp:517` in the snapshot, which shifts the later line numbers on this
> page down by ~52 in the v1.1.0b tree): **red nether brick** (nether-wart seeds +
> nether brick), **end bricks** (4× from end stone), **nether wart block** (9×
> nether-wart seeds), **magma block** (4× magma cream), **slime block** (9× slime
> ball), and the reverse **slime ball ×9** (from a slime block). No recipe was
> removed and the va_list idiom is unchanged. See the
> [Changelog v1.1.0b section](/slop-docs/features/changelog/#v110b-current).

## neoLegacy / 4J delta vs vanilla TU19

- **Recipes are a compiled `vector`, rebuildable at runtime** — `loadFromLocal`,
  `loadFromPacket`, and `createUpdatePacket` let the recipe list be replaced or
  synced, unlike a fixed TU19 table.
- **`ArmorDyeRecipe`, `MapCloningRecipe`, `MapExtendingRecipe`** are compiled but
  not registered ("don't work with our crafting menu").
- Recipes carry a **crafting-menu group tag** (`T/A/S/V/M/F/D`) used to place
  them in the console UI tabs — not a vanilla concept.
- Full **acacia/dark-oak** wood set, **quartz**, **prismarine**, **red
  sandstone**, **activator rail**, **dropper/hopper**, **iron trapdoor**,
  **wool carpet**, **stained hardened clay**, **armor stand**, **fireworks**
  recipes are all registered here (post-TU19).
- Furnace table adds **rabbit/mutton** cooking, **salmon** (raw fish aux 1),
  **quartz ore**, **log2** (acacia/dark-oak) charcoal, and the Silk-Touch ore
  smelts.

## Related pages

- [Blocks](/slop-docs/world/blocks/) — stone/quartz/prismarine variants
- [Items](/slop-docs/world/items/) — dyes, doors, rabbit hide, fireworks
- [Container Menus](/slop-docs/world/containers/) — `CraftingMenu`, `FurnaceMenu`
- [Minecraft.World Overview](/slop-docs/world/overview/)

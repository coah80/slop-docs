---
title: Adding Recipes
description: Worked examples of adding shaped, shapeless, and smelting recipes to neoLegacy — the varargs recipe DSL, where each recipe category registers, the crafting-menu group tabs, and how the two real TU31 recipe commits (stone variants and flower dyes) did it.
---

This guide adds recipes to neoLegacy: **shaped** crafting, **shapeless**
crafting, and **furnace smelting**. It is grounded in two real merged TU31
commits you can diff against:

- **Stone variants** (`dc5ad7aa`, "added craft recipes for andesite, diorite and
  granite (and polished) blocks") — six shaped recipes added to
  `Minecraft.World/StructureRecipies.cpp`.
- **Dye mixing** in `Minecraft.World/ClothDyeRecipes.cpp` — the shapeless
  colour-combination recipes (the flower-dye PR `b7393ab1` touched this file, but
  its per-flower-variant lines were dropped in the TU43 merge `253460c5`; the
  examples below are what is in `main` **today**).

Related reading: [Crafting](/slop-docs/world/crafting/) (the recipe system
overview), [Adding Items](/slop-docs/modding/adding-items/) and
[Adding Blocks](/slop-docs/modding/adding-blocks/) (creating the result you want
to craft), and [Containers](/slop-docs/world/containers/) (the crafting menu).

## Step 0 — Where recipes live

Crafting recipes are held in the singleton `Recipes::instance`, created by
`Recipes::staticCtor()` (`Recipes.cpp:22`) during the master bootstrap
(`Minecraft.World.cpp:45`). Recipes are not all listed in one place; they are
split across **category handler classes**, each with an `addRecipes(Recipes*)`
method. `Recipes::_init()` (`Recipes.cpp:28`) news up the handlers:

```cpp
pArmorRecipes    = new ArmorRecipes;
pClothDyeRecipes = new ClothDyeRecipes;
pFoodRecipies    = new FoodRecipies;
pOreRecipies     = new OreRecipies;
pStructureRecipies = new StructureRecipies;
pToolRecipies    = new ToolRecipies;
pWeaponRecipies  = new WeaponRecipies;
```

and `Recipes::_compileRecipes()` (`Recipes.cpp:49`) calls each handler's
`addRecipes(this)` in a deliberate order (the order controls how recipes appear
in the crafting menu):

| Handler | Called at | Add your recipe here if it makes… |
|---------|-----------|-----------------------------------|
| `ToolRecipies` | `Recipes.cpp:102` | tools |
| `FoodRecipies` | `Recipes.cpp:103` | food |
| `StructureRecipies` | `Recipes.cpp:104` | blocks / building materials |
| `ArmorRecipes` | `Recipes.cpp:473` | armor |
| `ClothDyeRecipes` | `Recipes.cpp:476` | wool / dye / carpet |
| `WeaponRecipies` | `Recipes.cpp:817` | weapons |
| `OreRecipies` | `Recipes.cpp:1171` | ingot/block compaction |

A handful of recipes are also added inline in `_compileRecipes` itself (planks,
sticks, bed, enchanting table — `Recipes.cpp:49`+). Smelting is separate: it
lives in `FurnaceRecipes` (`Minecraft.World.cpp:44`), covered in Step 4.

:::note[Changed in v1.1.0b]
Bootstrap line numbers on this page are for the snapshot. On `origin/main`
(v1.1.0b) a `LootTableManager` preload shifted the `staticCtor` chain down ~8
lines, so `Recipes::staticCtor()` is called at `Minecraft.World.cpp:53` and
`FurnaceRecipes::staticCtor()` at `:52`. Within `Recipes.cpp` the handler
call-order table is stable except `OreRecipies::addRecipes` which moves from
`Recipes.cpp:1171` to `:1223` upstream. The handler *ordering* and every recipe
idiom below are unchanged.
:::

## Step 1 — The recipe DSL (read this first)

Both `addShapedRecipy` and `addShapelessRecipy` are **varargs** functions
(`Recipes.h:93-94`). The first argument after the result is a **type-code
string** whose characters tell the parser how to read every following argument.
The codes (documented in-source at `Recipes.cpp:1298-1305`):

| Code | Next vararg is | Meaning |
|------|----------------|---------|
| `s` | `wchar_t*` | a pattern **row** (shaped only) |
| `c` | `wchar_t` | a **key char** that the next `z`/`i`/`t` binds to |
| `z` | `ItemInstance*` | bind an item **instance** (lets you set count + aux/data) |
| `i` | `Item*` | bind an **item** (count 1, any aux) |
| `t` | `Tile*` | bind a **tile** (count 1, any aux) |
| `g` | `wchar_t` | the crafting-menu **group** tab (see Step 5) |

So the type string is a compact schema. For example `L"sczg"` means: one pattern
row (`s`), one key char (`c`), one item instance bound to it (`z`), and a group
(`g`). The plank recipe at `Recipes.cpp:51` reads:

```cpp
addShapedRecipy(new ItemInstance(Tile::wood, 4, 0), // result: 4 planks
    L"sczg",
    L"#",                                    // s: the 1x1 pattern
    L'#', new ItemInstance(Tile::treeTrunk, 1, 0), // c + z: '#' = one log
    L'S');                                   // g: 'S' = Structure tab
```

The parser (`Recipes.cpp:1275`) walks the type string; each `s` adds a row to
the pattern and sets width/height, each `c` records the current key char, and the
following `z`/`i`/`t` maps that char to an ingredient. Blanks/spaces in a row are
empty slots.

## Step 2 — A shaped recipe (template: stone variants, `dc5ad7aa`)

The stone-variants commit added its recipes to
`StructureRecipies::addRecipes` (`StructureRecipies.cpp:78`+). Diorite is the
cleanest example — a 2×2 checkerboard of cobblestone and nether quartz yielding
2 diorite:

```cpp
r->addShapedRecipy(new ItemInstance(Tile::stone_Id, 2, StoneTile::DIORITE), //
    L"ssctcig",
    L"#Q", //
    L"Q#", //
    L'#', Tile::cobblestone, L'Q', Item::nether_quartz,
    L'S');
```

Decode the type string `L"ssctcig"`:

- `s`, `s` — two pattern rows: `"#Q"` and `"Q#"` (a 2×2 grid).
- `c`, `t` — key `'#'` bound to a **tile**, `Tile::cobblestone`.
- `c`, `i` — key `'Q'` bound to an **item**, `Item::nether_quartz`.
- `g` — group `'S'` (Structure).

The **result** uses the `_Id` + data form of `ItemInstance` —
`new ItemInstance(Tile::stone_Id, 2, StoneTile::DIORITE)` — because diorite is a
data-variant (aux value) of the `stone` block, not its own block ID. The `2` is
the output count. Note `Tile::stone_Id` (the numeric ID) is used here rather than
the `Tile::stone` pointer, which is the idiom when you need to attach a specific
aux/data value.

To add your own shaped block recipe, drop a call like this into the appropriate
handler (`StructureRecipies.cpp` for building blocks). A worked example — a
"chiseled chestnut plank" made from 2 planks stacked:

```cpp
r->addShapedRecipy(new ItemInstance(Tile::yourBlock, 1, 0), //
    L"ssctg",
    L"#", //
    L"#", //
    L'#', Tile::wood,
    L'S');
```

Ingredients bound with `t`/`i` accept **any** aux value; bind with `z` and an
explicit `ItemInstance` when the input must be a specific variant (as the diorite
recipe does for its polished forms, e.g.
`new ItemInstance(Tile::stone_Id, 1, StoneTile::DIORITE)` at
`StructureRecipies.cpp`).

## Step 3 — A shapeless recipe (template: dye mixing)

`addShapelessRecipy` (`Recipes.cpp:1425`) has no pattern rows — order does not
matter. Its type codes are the ingredient-binding subset (`z`, `i`, `t`) plus
`g`. The dye recipes in `ClothDyeRecipes::addRecipes` are the clearest live
examples. The simplest — a rose (`Tile::rose`) into red dye
(`ClothDyeRecipes.cpp:47`):

```cpp
r->addShapelessRecipy(new ItemInstance(Item::dye, 2, DyePowderItem::RED),
    L"tg",
    Tile::rose, L'D');
```

`L"tg"` = one **tile** ingredient + a group `'D'` (Decoration). The result,
`new ItemInstance(Item::dye, 2, DyePowderItem::RED)`, is two red dye — a colour is
a *data-variant* of the single `Item::dye`, selected by the
`DyePowderItem::*` aux value, not a separate item.

A two-input example — mixing red and white dye into pink
(`ClothDyeRecipes.cpp:55`):

```cpp
r->addShapelessRecipy(new ItemInstance(Item::dye, 2, DyePowderItem::PINK), //
    L"zzg",
    new ItemInstance(Item::dye, 1, DyePowderItem::RED),
    new ItemInstance(Item::dye, 1, DyePowderItem::WHITE), L'D');
```

Decode `L"zzg"`: two **item-instance** ingredients (each a specific dye colour,
bound with `z` because the exact aux value matters) plus the group. Because it is
shapeless, the red and white can go in any two crafting slots.

:::note
The current `main` uses `Item::dye` for every dye recipe. An earlier PR
(`b7393ab1`, "dye recipes using flowers") referenced a `dye_powder` field name
and added per-flower-variant recipes (e.g. blue orchid → light-blue dye via
`Item::items[Tile::rose_Id]` + `Rose::BLUE_ORCHID`), but the TU43 merge
(`253460c5`) resolved to the `Item::dye` naming and dropped those variant lines.
Write against `Item::dye` as the code stands today.
:::

To add your own shapeless recipe, pick the smallest set of type codes that
describes your inputs — `t`/`i` for whole tiles/items (any data), `z` for a
specific instance:

```cpp
// two loose whole-item ingredients, no shape:
r->addShapelessRecipy(new ItemInstance(Item::your_result, 1),
    L"iig",
    Item::ingredient_one, Item::ingredient_two, L'D');
```

## Step 4 — A smelting recipe (FurnaceRecipes)

Smelting is not part of the crafting DSL. It lives in `FurnaceRecipes`, whose
recipes are all registered in the constructor `FurnaceRecipes::FurnaceRecipes()`
(`FurnaceRecipes.cpp:19`), run from `FurnaceRecipes::staticCtor()`
(`FurnaceRecipes.cpp:9`, bootstrap `Minecraft.World.cpp:44`). The API is
`addFurnaceRecipy` with two overloads (`FurnaceRecipes.cpp:53` / `:60`):

```cpp
// by plain input ID (any data):
addFurnaceRecipy(int inputId, ItemInstance *result, float xpValue);
// by specific input instance (input's aux/data matters):
addFurnaceRecipy(ItemInstance *input, ItemInstance *result, float xpValue);
```

Real examples from the constructor:

```cpp
addFurnaceRecipy(Tile::iron_ore_Id, new ItemInstance(Item::iron_ingot), .7f);   // FurnaceRecipes.cpp:21
addFurnaceRecipy(Item::rabbit_Id,   new ItemInstance(Item::cooked_rabbit), .35f);// :27
addFurnaceRecipy(Tile::sand_Id,     new ItemInstance(Tile::glass), .1f);         // :24
addFurnaceRecipy(new ItemInstance(Item::raw_fish, 1, 1),                         // :31 (salmon variant)
                 new ItemInstance(Item::cooked_fish, 1, 1), .35f);
```

The third argument is the **XP value** granted per smelt. The single-ID overload
keys on the raw input ID (`recipies[itemId] = result`, `FurnaceRecipes.cpp:56`);
the instance overload packs the aux value into the key
(`itemId | (data << 12)`, `FurnaceRecipes.cpp:62`) so a specific data-variant can
smelt differently from its siblings — that is how raw salmon (fish data `1`)
gets its own cooked-salmon output.

To add a smelt for your item, add one line in the `FurnaceRecipes` constructor
next to the others — using the input's `_Id` and the same `.35f` XP value the
other cooked foods use:

```cpp
addFurnaceRecipy(Item::raw_chestnut_Id, new ItemInstance(Item::roasted_chestnut), .35f);
```

(assuming you added both a `raw_chestnut` and a `roasted_chestnut` item per
[Adding Items](/slop-docs/modding/adding-items/)). Because the key is the input's
`_Id`, this is another reason to keep item/tile `_Id` constants correct (see
Adding Items, Step 2).

## Step 5 — Crafting-menu group tabs

The trailing `g` code + a char decides which tab of neoLegacy's classic crafting
menu the recipe appears under. The chars map to `Recipy::_eGroupType`
(`Recipy.h:16`), decoded in both parsers (`Recipes.cpp:1372` shaped,
`:1468` shapeless):

| Char | Group | Enum |
|------|-------|------|
| `'S'` | Structure / building blocks | `eGroupType_Structure` (0) |
| `'T'` | Tools | `eGroupType_Tool` |
| `'F'` | Food | `eGroupType_Food` |
| `'A'` | Armour | `eGroupType_Armour` |
| `'M'` | Mechanism (redstone) | `eGroupType_Mechanism` |
| `'V'` | Transport | `eGroupType_Transport` |
| `'D'` | Decoration (default) | `eGroupType_Decoration` |

Anything unrecognized falls through to Decoration (`Recipes.cpp:1390`). Match the
group to the handler you put the recipe in — the stone variants use `'S'`
(Structure), the flower dyes use `'D'` (Decoration). This is a classic-crafting
concern specific to LCE's grid-of-recipes menu; there is no data-driven recipe
book here (`CraftItemPacket`, packet id 150, carries the console recipe-book
selection over the wire — see [Networking](/slop-docs/world/networking/)).

:::caution
Ordering within a handler is preserved into the menu. `dc5ad7aa`'s author left a
4J comment nearby about recipe order causing a "3-icon scroll" that overlaps the
menu title in 720p — if you insert into the middle of a handler, you can shift
the visual layout of an existing tab. Append rather than insert unless you have a
reason.
:::

## Step 6 — Result `ItemInstance` forms

Every recipe's first argument is the output `ItemInstance`. Pick the constructor
(`ItemInstance.h:56-65`) that matches what you are outputting:

| You want… | Use |
|-----------|-----|
| N of a plain item | `new ItemInstance(Item::x, N)` |
| N of a plain block | `new ItemInstance(Tile::x, N)` |
| N of a **data-variant** block | `new ItemInstance(Tile::x_Id, N, dataValue)` |
| N of a **data-variant** item (dye colour, etc.) | `new ItemInstance(Item::x, N, auxValue)` |

The stone variants use the `_Id`+data form (diorite is stone data
`StoneTile::DIORITE`); the dyes use the item+aux form (`DyePowderItem::RED`).

## What can go wrong

Recipes are the one subsystem with almost no static safety net — both DSL entry
points are true C `varargs` (`va_list`/`va_arg`), so the compiler cannot check
your call. The failure modes:

### Type string doesn't match the arguments → reads stack garbage at runtime

`addShapedRecipy(ItemInstance*, ...)` (`Recipes.cpp:1276`) walks the type-code
string and pulls one `va_arg` per code (`va_start` at `Recipes.cpp:1295`). The
type string is the **only** thing telling the parser how many arguments follow and
what each is. If it has one too many codes, or a `t` where you passed an `Item*`,
the parser reads **whatever happens to be next on the stack** as a `Tile*` /
`Item*` / `wchar_t*` — the build is clean, but at registration time you get a
garbage ingredient, a wrong pattern, or a crash dereferencing a junk pointer.
There is no error message. Count your codes against your arguments one-for-one:
`L"sczg"` = exactly one row string, one key char, one `ItemInstance*`, one group
char, in that order.

### Row lengths / `s`-count wrong → misshaped or truncated recipe

For shaped recipes the width is taken from the **last** row parsed
(`Recipes.cpp:1329`) and the height from the number of `s` codes. Rows of unequal
length, or an `s` count that doesn't match the row strings you passed, produce a
grid the game will never match against — the recipe silently never crafts. Keep
every row string the same length and one `s` per row.

### Unrecognised group char → dumped into Decoration

The trailing `g` char is decoded by a switch that ends in `default:
eGroupType_Decoration` (`Recipes.cpp:1391-1392`, shaped; the shapeless parser
mirrors it at `:1487-1488`). Any char that isn't `S/T/F/A/M/V/D` silently lands the recipe in
the Decoration tab instead of erroring — so a typo'd group means "my recipe isn't
where I put it," not a build failure.

### Inserting mid-handler → shifts an existing tab's layout

Handler order is preserved into the menu grid (Step 5's caution). Inserting into
the middle of a handler renumbers everything after it visually; append instead
unless you specifically need the position.

### Smelting: plain-ID vs instance overload → data-variants collide

`addFurnaceRecipy(int inputId, ...)` keys on the raw id (`recipies[itemId]`,
`FurnaceRecipes.cpp:56`); the instance overload packs the aux value in
(`itemId | (data << 12)`, `:62`). Use the **plain-ID** overload for a
data-specific input (e.g. raw salmon) and it keys on the base id, colliding with
the sibling variant's recipe — one of them wins. Use the instance overload when
the input's data matters.

### Referencing an item by a stale `_Id` → wrong or missing input

Smelting inputs and many ingredients reference items by `_Id`
(`FurnaceRecipes.cpp:27` uses `Item::rabbit_Id`). If the `_Id` constant is wrong
or renamed (see [Adding Items → Step 2](/slop-docs/modding/adding-items/)), the
recipe compiles but keys on the wrong item and never triggers for the input you
intended.

## Testing checklist

- [ ] **Build is clean** — the varargs are unchecked at compile time, so a
  mismatched type string (e.g. `L"sczg"` with the wrong number of following
  args) compiles but reads garbage at runtime. Double-check the code string
  matches the argument list one-for-one.
- [ ] **Recipe appears in the right tab** — the `g` char matches your intended
  group (Step 5).
- [ ] **Shaped: pattern is correct** — the number of `s` rows equals your row
  strings, and each row's length is the intended width (width is taken from the
  last row, `Recipes.cpp:1329`, so keep rows equal length).
- [ ] **Ingredients match** — `t`/`i` accept any data; if your input must be a
  specific variant, you used `z` + an explicit `ItemInstance` (like the flower
  dyes).
- [ ] **Output count and variant** are right — the count and aux/data in the
  result `ItemInstance`.
- [ ] **Smelting: correct XP and output** — for a data-specific input you used
  the instance overload so it does not collide with the plain-ID key.
- [ ] **In-game craft/smelt actually yields the result** in a survival world,
  and consumes the correct inputs.

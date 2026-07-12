---
title: Adding Recipes
description: Step-by-step guide to adding crafting and smelting recipes to LCE.
---

LCE has three recipe types: **shaped** (grid pattern matters), **shapeless** (any arrangement), and **furnace** (smelting). All crafting recipes go through the `Recipes` singleton, while smelting recipes use `FurnaceRecipes`.

## Architecture overview

| Class | File | Role |
|---|---|---|
| `Recipy` | `Minecraft.World/Recipy.h` | Abstract base for all crafting recipes |
| `ShapedRecipy` | `Minecraft.World/ShapedRecipy.h` | Grid-pattern recipes (e.g. pickaxe) |
| `ShapelessRecipy` | `Minecraft.World/ShapelessRecipy.h` | Order-independent recipes (e.g. eye of ender) |
| `Recipes` | `Minecraft.World/Recipes.h` | Singleton manager, owns the recipe list |
| `FurnaceRecipes` | `Minecraft.World/FurnaceRecipes.h` | Singleton manager for smelting recipes |

### Recipe groups

Every recipe belongs to a group that controls where it shows up in the console crafting UI:

| Code | Group | Constant |
|---|---|---|
| `'S'` | Structure | `eGroupType_Structure` |
| `'T'` | Tool | `eGroupType_Tool` |
| `'F'` | Food | `eGroupType_Food` |
| `'A'` | Armour | `eGroupType_Armour` |
| `'M'` | Mechanism | `eGroupType_Mechanism` |
| `'V'` | Transport | `eGroupType_Transport` |
| `'D'` | Decoration | `eGroupType_Decoration` (default) |

If you use an unrecognized character or forget the group entirely, it defaults to Decoration.

## Shaped recipes

Shaped recipes use `Recipes::addShapedRecipy()`, which is a C variadic function. The arguments follow a specific encoding because C++ variadics cannot carry type information the way Java reflection can. A **type string** is passed as the second variadic argument to describe what comes next.

### The type string encoding

The type string is a wide-character string where each character tells the parser what the next variadic argument is:

| Char | Meaning | Variadic type |
|---|---|---|
| `s` | A row of the crafting grid | `wchar_t *` (wide string literal) |
| `w` | A string array (reads until empty string) | `wstring *` |
| `a` | A row (alternate, same as `s`) | `wchar_t *` |
| `c` | A mapping character (key) | `wchar_t` |
| `z` | Mapped to an `ItemInstance *` | `ItemInstance *` |
| `i` | Mapped to an `Item *` | `Item *` |
| `t` | Mapped to a `Tile *` | `Tile *` |
| `g` | The recipe group | `wchar_t` (one of `S`, `T`, `F`, `A`, `M`, `V`, `D`) |

The type string **must** end with `g` followed by the group character. The parser reads types left-to-right and grabs variadic args accordingly.

### Important: `t` vs `z` for tile ingredients

When you use `t` (Tile), the parser creates `new ItemInstance(tile, 1, ANY_AUX_VALUE)`. This means any aux/data value will match. When you use `z` (ItemInstance), you provide the instance yourself and can specify an exact aux value. Use `z` when you need a specific variant (like birch planks vs oak planks).

### How shaped recipes work

1. Row strings (`s` entries) define the crafting grid. Each character in a row maps to an ingredient. Spaces mean empty slots.
2. After all rows, `c`+`i`/`t`/`z` pairs define the character-to-ingredient mappings.
3. `g` + group char finishes the recipe.
4. The parser figures out `width` and `height` from the row strings, builds an `ItemInstance**` array, and creates a `ShapedRecipy(width, height, ids, result, group)`.

### Example: 3x3 shaped recipe (enchanting table)

From `Recipes.cpp`:

```cpp
addShapedRecipy(new ItemInstance(Tile::enchantTable, 1),
    L"sssctcicig",   // type string: 3 rows, then char+tile, char+item, char+item, group
    L" B ",          // row 0
    L"D#D",          // row 1
    L"###",          // row 2
    L'#', Tile::obsidian,    // '#' -> obsidian (Tile*)
    L'B', Item::book,        // 'B' -> book (Item*)
    L'D', Item::diamond,     // 'D' -> diamond (Item*)
    L'S');                   // group: Structure
```

Reading the type string `sssctcicig`:
- `s` `s` `s` = three grid rows
- `c` `t` = char `#` maps to a Tile
- `c` `i` = char `B` maps to an Item
- `c` `i` = char `D` maps to an Item
- `g` = group follows

### Example: 2x2 shaped recipe (snow block)

```cpp
addShapedRecipy(new ItemInstance(Tile::snow, 1),
    L"sscig",        // 2 rows, char+item, group
    L"##",           // row 0
    L"##",           // row 1
    L'#', Item::snowBall,
    L'S');
```

### Example: 1x1 shaped recipe (planks from log)

```cpp
addShapedRecipy(new ItemInstance(Tile::wood, 4, 0),
    L"sczg",         // 1 row, char+ItemInstance(z), group
    L"#",            // single slot
    L'#', new ItemInstance(Tile::treeTrunk, 1, 0),  // specific aux value
    L'S');
```

Using `z` (ItemInstance) instead of `t` (Tile) lets you specify an **aux data value** for the ingredient. With `t`, the mapping automatically uses `ANY_AUX_VALUE` (-1), so any wood type would match.

### The `w` type for sub-manager shapes

The recipe sub-managers (ToolRecipies, WeaponRecipies, ArmorRecipes) use `w` instead of `s`. The `w` type reads a `wstring *` array and keeps reading entries until it finds an empty string. This is how those classes pass their pre-built shape arrays:

```cpp
// Inside ToolRecipies::addRecipes()
wchTypes[0]=L'w';    // shape array
wchTypes[1]=L'c';    // char key
wchTypes[2]=L'i';    // stick (Item)
wchTypes[3]=L'c';    // char key
wchTypes[4]=L'i';    // material (Item)
wchTypes[5]=L'g';    // group
r->addShapedRecipy(new ItemInstance(target),
    wchTypes, shapes[t],
    L'#', Item::stick,
    L'X', pObjMaterial->item,
    L'T');
```

The shapes array has an empty string `L""` as a terminator after the last row.

### Keeping NBT tags

Some recipes need to keep the NBT tag from an ingredient (e.g. carrot on a stick inherits the fishing rod's damage). Chain `->keepTag()` on the return value:

```cpp
addShapedRecipy(new ItemInstance(Item::carrotOnAStick, 1),
    L"sscicig",
    L"# ",
    L" X",
    L'#', Item::fishingRod,
    L'X', Item::carrots,
    L'T')->keepTag();
```

The `addShapedRecipy()` function returns a `ShapedRecipy *` pointer, so you can chain `keepTag()` on it. This sets the `_keepTag` flag, and when the recipe is assembled, the NBT tag from the first non-null ingredient is copied to the result.

## Shapeless recipes

Shapeless recipes use `Recipes::addShapelessRecipy()`. The type string is simpler since there is no grid, just a list of ingredients:

| Char | Meaning |
|---|---|
| `i` | Next arg is `Item *` |
| `t` | Next arg is `Tile *` |
| `z` | Next arg is `ItemInstance *` |
| `g` | Group char follows (must be last) |

Note: for shapeless recipes, `t` (Tile) does **not** add `ANY_AUX_VALUE`. It creates a plain `new ItemInstance(tile)`. This is different from shaped recipes where `t` always adds `ANY_AUX_VALUE`.

### Example: eye of ender

```cpp
addShapelessRecipy(new ItemInstance(Item::eyeOfEnder, 1),
    L"iig",                      // two Items, then group
    Item::enderPearl,            // ingredient 1
    Item::blazePowder,           // ingredient 2
    L'T');                       // group: Tool
```

### Example: fire charge (with aux data)

```cpp
addShapelessRecipy(new ItemInstance(Item::fireball, 3),
    L"iizg",                     // two Items + one ItemInstance, group
    Item::sulphur,
    Item::blazePowder,
    new ItemInstance(Item::coal, 1, CoalItem::CHAR_COAL),  // charcoal specifically
    L'T');
```

### Example: book

```cpp
addShapelessRecipy(new ItemInstance(Item::book, 1),
    L"iiiig",           // four Items, group
    Item::paper,
    Item::paper,
    Item::paper,
    Item::leather,
    L'D');              // group: Decoration
```

### Example: mushroom stew (mix of types)

```cpp
addShapelessRecipy(new ItemInstance(Item::mushroomStew),
    L"ttig",           // two Tiles + one Item, group
    Tile::mushroom1, Tile::mushroom2, Item::bowl,
    L'F');
```

## Furnace (smelting) recipes

Furnace recipes are registered through `FurnaceRecipes`, a separate singleton. The API is simple:

```cpp
void addFurnaceRecipy(int itemId, ItemInstance *result, float xpValue);
```

| Parameter | Description |
|---|---|
| `itemId` | The tile/item ID of the input (use `Tile::xxx_Id` or `Item::xxx_Id`) |
| `result` | The output `ItemInstance` |
| `xpValue` | XP awarded per smelt (0.1 for basic, 0.35 for food, 0.7 for iron, 1.0 for gold/diamond) |

### Existing furnace recipes

From `FurnaceRecipes.cpp`:

```cpp
addFurnaceRecipy(Tile::ironOre_Id,    new ItemInstance(Item::ironIngot),  0.7f);
addFurnaceRecipy(Tile::goldOre_Id,    new ItemInstance(Item::goldIngot),  1.0f);
addFurnaceRecipy(Tile::diamondOre_Id, new ItemInstance(Item::diamond),    1.0f);
addFurnaceRecipy(Tile::sand_Id,       new ItemInstance(Tile::glass),      0.1f);
addFurnaceRecipy(Item::porkChop_raw_Id, new ItemInstance(Item::porkChop_cooked), 0.35f);
addFurnaceRecipy(Tile::treeTrunk_Id,  new ItemInstance(Item::coal, 1, CoalItem::CHAR_COAL), 0.15f);
```

### Adding a custom furnace recipe

To smelt a custom ore into a custom ingot, add a line inside the `FurnaceRecipes` constructor in `FurnaceRecipes.cpp`:

```cpp
// Inside the FurnaceRecipes::FurnaceRecipes() constructor, with the other recipes:
addFurnaceRecipy(myCustomOre_Id, new ItemInstance(Item::myCustomIngot), 0.8f);
```

This is the same pattern as the existing recipes. You do not need to use `FurnaceRecipes::getInstance()` since you are already inside the constructor.

## Recipe category modules

LCE organizes recipes into dedicated classes that each register their own set. The `Recipes` constructor calls them in a specific order to control crafting menu layout:

```cpp
pToolRecipies->addRecipes(this);       // Pickaxes, shovels, axes, hoes, shears
pFoodRecipies->addRecipes(this);       // Food crafting recipes
pStructureRecipies->addRecipes(this);  // Sandstone, workbench, furnace, chest, etc.
// ... inline recipes (bed, enchanting table, stairs, etc.) ...
pArmorRecipes->addRecipes(this);       // Armor pieces (chain commented out)
pClothDyeRecipes->addRecipes(this);    // Wool dyeing, dye mixing, carpets
// ... more inline recipes (TNT, slabs, rails, etc.) ...
pWeaponRecipies->addRecipes(this);     // Swords
// ... more inline recipes (bow, arrow, bucket, torch, etc.) ...
pOreRecipies->addRecipes(this);        // Storage block conversions
```

### How sub-managers work internally

All sub-managers (except `FoodRecipies` and `ClothDyeRecipes`) use the same pattern:

1. A `map` array of `vector<Object *>` where row 0 holds materials and subsequent rows hold result items.
2. An `_init()` method fills the map with `ADD_OBJECT(map[row], value)` calls.
3. An `addRecipes()` loop iterates over each material column and builds recipes dynamically.

The `Object` class (defined in `Recipes.h`) is a union that can hold `Tile *`, `Item *`, or `ItemInstance *`. The `GetType()` method tells the loop whether to use `t` or `i` in the type string.

| Class | File | Category | Map Rows |
|---|---|---|---|
| `ToolRecipies` | `ToolRecipies.cpp` | Pickaxes, shovels, axes, hoes | 5 (material + 4 tool types) |
| `WeaponRecipies` | `WeaponRecipies.cpp` | Swords | 2 (material + sword) |
| `ArmorRecipes` | `ArmorRecipes.cpp` | All armor pieces | 5 (material + 4 slots) |
| `OreRecipies` | `OreRecipies.cpp` | Storage block conversions | 2 per entry (block + items) |
| `FoodRecipies` | `FoodRecipies.cpp` | Food items, golden items | Direct registration |
| `ClothDyeRecipes` | `ClothDyeRecipes.cpp` | Wool dyeing, dye mixing | Loop + direct |
| `StructureRecipies` | `StructureRecipies.cpp` | Building blocks | Direct registration |

### ToolRecipies internals

`MAX_TOOL_RECIPES = 5`. Four shape patterns stored in a static `wstring` array:

```
Pickaxe:  XXX    Shovel:  X     Axe:  XX     Hoe:  XX
           #              #           X#            #
           #              #            #            #
```

Five material columns: Planks (Tile), Cobblestone (Tile), Iron Ingot (Item), Diamond (Item), Gold Ingot (Item).

The loop also registers shears at the end as a 2x2 shaped recipe.

### WeaponRecipies internals

`MAX_WEAPON_RECIPES = 2`. One shape pattern: `X / X / #`.

Same five material columns as tools. Bow and arrow recipes are commented out here and registered inline in `Recipes.cpp` instead, to avoid display issues in the crafting menu.

### ArmorRecipes internals

`MAX_ARMOUR_RECIPES = 5`. Four shape patterns:

```
Helmet:     XXX     Chestplate:  X X     Leggings:  XXX     Boots:  X X
            X X                  XXX                 X X             X X
                                 XXX                 X X
```

**Chain armor is commented out.** The 4J comment says: "removing the chain armour, since we show all possible recipes in the xbox game, and it's not one you can make." So only 4 materials are active: leather, iron, diamond, gold.

Also provides `GetArmorType(int itemId)` for 4J's quick equip feature. This maps any armor piece ID to its slot type (helmet, chestplate, leggings, boots).

### OreRecipies internals

`MAX_ORE_RECIPES = 5`. Each entry is a block/item pair. The loop creates both directions:

- 9 items in a 3x3 grid makes 1 block (group `'D'`)
- 1 block in a 1x1 grid makes 9 items (group `'D'`)

Current entries: Gold, Iron, Diamond, Emerald, Lapis.

## Adding a new recipe: step by step

1. **Decide the recipe type**: shaped (pattern matters), shapeless (any order), or furnace (smelting).

2. **Choose where to register it**: either inline in `Recipes::Recipes()` in `Recipes.cpp`, or in one of the category classes. If it fits an existing category (tools, armor, ores), add to that sub-manager. Otherwise, add inline.

3. **Build the type string**: for shaped recipes, count your rows (`s` each), then each character-ingredient pair (`c` + `i`/`t`/`z`), and end with `g`.

4. **Call the registration function**:
   ```cpp
   // Shaped: diamond block
   addShapedRecipy(new ItemInstance(Tile::diamondBlock, 1),
       L"ssscig",
       L"###",
       L"###",
       L"###",
       L'#', Item::diamond,
       L'D');

   // Shapeless: mushroom stew
   addShapelessRecipy(new ItemInstance(Item::mushroomStew, 1),
       L"ttig",
       Tile::mushroom1, Tile::mushroom2, Item::bowl,
       L'F');
   ```

5. **Rebuild**. Recipes are registered during `Recipes::staticCtor()` at startup. After the constructor runs, `buildRecipeIngredientsArray()` gets called automatically to index all recipes for the console crafting UI.

## Plugging into sub-managers

If you are adding a new material tier (like ruby), you can plug directly into the existing sub-managers instead of writing recipes by hand.

### Adding to ToolRecipies

In `ToolRecipies::_init()`, add entries to each row:

```cpp
ADD_OBJECT(map[0], Item::ruby);           // material
ADD_OBJECT(map[1], Item::pickAxe_ruby);   // pickaxe
ADD_OBJECT(map[2], Item::shovel_ruby);    // shovel
ADD_OBJECT(map[3], Item::hatchet_ruby);   // axe
ADD_OBJECT(map[4], Item::hoe_ruby);       // hoe
```

### Adding to WeaponRecipies

```cpp
ADD_OBJECT(map[0], Item::ruby);           // material
ADD_OBJECT(map[1], Item::sword_ruby);     // sword
```

### Adding to ArmorRecipes

```cpp
ADD_OBJECT(map[0], Item::ruby);            // material
ADD_OBJECT(map[1], Item::helmet_ruby);     // helmet
ADD_OBJECT(map[2], Item::chestplate_ruby); // chestplate
ADD_OBJECT(map[3], Item::leggings_ruby);   // leggings
ADD_OBJECT(map[4], Item::boots_ruby);      // boots
```

Also update `GetArmorType()` with the new armor IDs so quick equip works.

### Adding to OreRecipies

Bump `MAX_ORE_RECIPES` in the header, then add:

```cpp
ADD_OBJECT(map[5], Tile::rubyBlock);
ADD_OBJECT(map[5], new ItemInstance(Item::ruby, 9));
```

This creates both the 9-to-block and block-to-9 recipes automatically.

## Key source files

- `Minecraft.World/Recipy.h` for the abstract recipe base class
- `Minecraft.World/ShapedRecipy.h` for the shaped recipe class
- `Minecraft.World/ShapelessRecipy.h` for the shapeless recipe class
- `Minecraft.World/Recipes.h` / `Recipes.cpp` for the recipe manager and all built-in recipes
- `Minecraft.World/FurnaceRecipes.h` / `FurnaceRecipes.cpp` for the furnace recipe manager

## Related guides

- [Crafting & Recipes](/slop-docs/world/crafting/) for the full internals of the recipe system
- [Adding Items](/slop-docs/modding/adding-items/) to create items for your recipes
- [Making a Full Ore](/slop-docs/modding/full-ore/) for an end-to-end example using all recipe types

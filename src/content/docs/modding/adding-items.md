---
title: Adding Items
description: A step-by-step worked example of adding a new Item to neoLegacy — the ID space vs tiles, the staticCtor registration line, tool tiers and durability, localization, the items.png icon, and the ItemNameMap codegen that gives every item /give support for free.
---

This guide walks a brand-new item end-to-end, touching every place the codebase
actually edits when an item is added. The running example is a simple food item,
**Roasted Chestnut**, deliberately modelled on the real **Beetroot** so you can
diff your work against a live feature at each step. Beetroot was itself a
neoLegacy addition (TU31-era), and it exercises the same pieces any pure item
does: the `static Item *` field, the `_Id` constant, the `staticCtor` builder
line, localization, and the icon name.

Everything below is grounded in how neoLegacy registers items *today*. Beetroot
is your template: `Minecraft.World/Item.h` for the field + ID constant,
`Minecraft.World/Item.cpp:549` for the registration line, and
`Minecraft.Client/Windows64Media/loc/stringsGeneric.xml` for the strings.

Related reading: [Items](/slop-docs/world/items/) (the full hierarchy and ID
space), [Adding Blocks](/slop-docs/modding/adding-blocks/) (the tile side —
`SlimeTile` is the block-registration template), [Adding Recipes](/slop-docs/modding/adding-recipes/)
(so your item can be crafted), and [Crafting](/slop-docs/world/crafting/).

## Step 0 — The item ID space (and why it is off by 256)

Items live in one flat registry, `Item::items` (an `ItemArray` of size
`ITEM_NUM_COUNT`), built in `Item::staticCtor()` (`Item.cpp:282`). The registry
idiom is the classic Java-LCE fluent builder — the same one tiles use:

```cpp
Item::field = ( new SomeItemSubclass(index, ...) )
                  ->setIconName(L"...")
                  ->setDescriptionId(IDS_...)
                  ->setUseDescriptionId(IDS_DESC_...);
```

There is one gotcha unique to items. **Item IDs below 256 shadow blocks.** Tiles
occupy IDs `0..255`; the engine auto-creates a `TileItem` for every block in
that range so blocks can sit in inventories. Because of that, a *pure* item's
numeric slot and its *global* item ID differ by 256:

- The number you pass to the **constructor** is the raw item index (e.g.
  Beetroot is `new FoodItem(178, ...)` at `Item.cpp:549`).
- The `_Id` **constant** in `Item.h` is that index **+ 256**
  (`beetroot_Id = 434`, i.e. `178 + 256`, at `Item.h:679`).

You will see this everywhere: Elytra is `new ElytraItem()` which calls
`Item(187)` (`ElytraItem.cpp:10`) and its constant is `elytra_Id = 443`
(`Item.h:677`) — `187 + 256`. Pick the next free raw index above the highest
existing one (Beetroot Soup at `180` is near the top of the vanilla-style block
of indices; the neoLegacy backports scatter into the 150s–180s), and give your
`_Id` constant that index + 256, taking the next free value in the constant
block.

:::caution
Do not reuse an existing index or `_Id` — save games serialize items by numeric
ID, so a collision silently swaps items in every existing world. Grep both
`Item.cpp` (constructor numbers) and `Item.h` (the `_Id` block) before choosing.
:::

## Step 1 — Declare the static field

Open `Minecraft.World/Item.h`. Items expose a `static Item *` pointer per item.
The neoLegacy backports are grouped near the bottom of the static block; Beetroot
sits at `Item.h:442`:

```cpp
static Item* prismarine_crystal;
static Item* prismarine_shard;
static Item* elytra;

static Item* beetroot;
static Item* beetroot_seeds;
static Item* beetroot_soup;
```

Add your field alongside them:

```cpp
static Item* roasted_chestnut;
```

If your item is a specific subclass whose subtype-only methods you need to reach
statically (as `BowItem *Item::bow` does at `Item.cpp:43`), declare it as that
type instead of the base `Item *`. For a plain food item, `Item *` is correct.

Then, in `Item.cpp` near the other backport definitions (`Item.cpp:277`+), add
the out-of-line definition that initializes it to null:

```cpp
Item* Item::roasted_chestnut = nullptr;
```

Beetroot does exactly this at `Item.cpp:277`.

## Step 2 — Add the `_Id` constant

Still in `Item.h`, add your global ID constant to the `_Id` block. Beetroot's
neighbours are at `Item.h:679`:

```cpp
static const int beetroot_Id = 434;
static const int beetroot_seeds_Id = 435;
static const int beetroot_soup_Id = 436;
```

Pick the next free value and match the "index + 256" rule from Step 0. If your
constructor index is, say, `181`:

```cpp
static const int roasted_chestnut_Id = 437;   // 181 + 256
```

This constant is load-bearing for **two** reasons beyond readability:

1. Other subsystems reference items by `_Id` — smelting inputs
   (`FurnaceRecipes.cpp:27` uses `Item::rabbit_Id`), recipe ingredients, etc.
2. It is scraped by the **ItemNameMap codegen** — see Step 6, which is what gives
   your item working `/give` support with zero extra code.

## Step 3 — Register in `staticCtor`

Add the builder line inside `Item::staticCtor()`. The exact subclass you `new`
determines behaviour. For a food item, `FoodItem` is the base; its constructor is
`FoodItem(index, nutrition, saturationModifier, isMeat)`. Beetroot at
`Item.cpp:549`:

```cpp
Item::beetroot = (new FoodItem(178, 1, 0.6f, false))
    ->setIconName(L"beetroot")
    ->setDescriptionId(IDS_BEETROOT)
    ->setUseDescriptionId(IDS_DESC_BEETROOT);
```

Your line, placed next to the other backports at the end of `staticCtor`
(`Item.cpp:549`+, before the closing brace at `:552`):

```cpp
Item::roasted_chestnut = (new FoodItem(181, 4, FoodConstants::FOOD_SATURATION_NORMAL, false))
    ->setIconName(L"roasted_chestnut")
    ->setDescriptionId(IDS_ROASTED_CHESTNUT)
    ->setUseDescriptionId(IDS_DESC_ROASTED_CHESTNUT);
```

The `FoodConstants::FOOD_SATURATION_*` names are the same ones the surrounding
food items use (`Item.cpp:376`, `:435`, etc.) — prefer them over raw floats to
match the codebase.

Common builder methods you can chain (all return `this`, all in `Item.h`):

| Method | Purpose | Example use |
|--------|---------|-------------|
| `setIconName(const wstring&)` | Sets the sprite name in `items.png` (`Item.cpp:670`) | every item |
| `setDescriptionId(int)` | The display-name string ID | every item |
| `setUseDescriptionId(int)` | The tooltip/"use" line string ID | most items |
| `setMaxStackSize(int)` | Stack cap (`Item.cpp:682`) | `bucket` → 16 (`Item.cpp:347`) |
| `setBaseItemTypeAndMaterial(type, material)` | Creative sort category + material | tools, blocks |
| `setEatEffect(effectId, dur, amp, prob)` | Attach a `MobEffect` on eat | `spider_eye` (`Item.cpp:451`) |
| `setPotionBrewingFormula(mod)` | Make it a brewing ingredient | `gunpowder` (`Item.cpp:371`) |
| `handEquipped()` | Render held like a tool | `stick` (`Item.cpp:365`) |
| `setCraftingRemainingItem(Item*)` | Leftover after crafting (bucket) | `water_bucket` (`Item.cpp:350`) |

## Step 4 (tools only) — Tiers and durability

If you are adding a **tool or weapon** rather than a food/material, durability
and mining speed come from a `Tier`, not from setter calls. The five tiers are
defined at the top of `Item.cpp:28`:

```cpp
const _Tier *_Tier::WOOD   = new _Tier(0,   59, 2, 0, 15);
const _Tier *_Tier::STONE  = new _Tier(1,  131, 4, 1,  5);
const _Tier *_Tier::IRON   = new _Tier(2,  250, 6, 2, 14);
const _Tier *_Tier::DIAMOND= new _Tier(3, 1561, 8, 3, 10);
const _Tier *_Tier::GOLD   = new _Tier(0,   32,12, 0, 22);
```

The `Tier(level, uses, speed, damage, enchantmentValue)` fields
(`Item.cpp:564`): `level` is the mining tier, `uses` is durability (the `250`
for an iron tool), `speed` is dig speed, `damage` is bonus attack damage, and
`enchantmentValue` is the enchantability.

Digger tools take the tier in their constructor. A pickaxe is
`PickaxeItem(id, tier)` (`PickaxeItem.h:15`), which forwards to
`DiggerItem(id, 2, tier, &diggables)` (`PickaxeItem.cpp:35`). The iron pickaxe
line at `Item.cpp:298`:

```cpp
Item::iron_pickaxe = ( new PickaxeItem(1, _Tier::IRON) )
    ->setBaseItemTypeAndMaterial(eBaseItemType_pickaxe, eMaterial_iron)
    ->setIconName(L"pickaxeIron")
    ->setDescriptionId(IDS_ITEM_PICKAXE_IRON)
    ->setUseDescriptionId(IDS_DESC_PICKAXE);
```

The set of blocks a pickaxe mines fast lives in `PickaxeItem::diggables`, built
in `PickaxeItem::staticCtor()` (`PickaxeItem.cpp:7`) — this is why the tool
`staticCtor`s (`HatchetItem/PickaxeItem/ShovelItem::staticCtor`) run early in
the master bootstrap (`Minecraft.World.cpp:37-39`), *before* `Item::staticCtor`.
If you add a new digger tool type, you populate its own diggables table the same
way; for a new tier of an existing tool, just reuse the tier constants above.

:::note[Changed in v1.1.0b]
The `Item.cpp` / `Item.h` citations on this page (Beetroot at `Item.cpp:549`, the
`_Id` block at `Item.h:679`, the tiers at `Item.cpp:28`, etc.) are stable on
`origin/main` — those files did not drift. The **one** exception is the bootstrap
reference just above: the tool `staticCtor`s run at `Minecraft.World.cpp:45–47` on
`origin/main` (v1.1.0b), not `:37–39`, because a `LootTableManager` preload pushed
the whole chain down ~8 lines (`Item::staticCtor` there is line 51).
:::

See [Items](/slop-docs/world/items/) for the full tool/weapon hierarchy.

## Step 5 — Creative menu placement

The creative inventory is a **hand-written list**, not registry-driven. The tabs
are filled by explicit `ITEM(id)` / `ITEM_AUX(id, aux)` macro lines in
`Minecraft.Client/Common/UI/IUIScene_CreativeMenu.cpp` — the same file blocks use.
Beetroot is in there by hand at `IUIScene_CreativeMenu.cpp:571`
(`ITEM(Item::beetroot_Id)`), beetroot soup at `:572`, elytra at `:439`. There is
**no** loop over `Item::items` anywhere that builds the creative contents;
`Minecraft.Client/CreativeMode.cpp` only fills the survival-swap hotbar
(`CreativeMode.cpp:42`), it does not enumerate the registry.

The consequence: **a correctly registered item does *not* appear in creative on
its own.** Add a line for yours to the group that fits (the macros are defined at
`IUIScene_CreativeMenu.cpp:22`; groups are opened with `DEF(...)` at `:24`):

```cpp
    ITEM(Item::roasted_chestnut_Id)
```

Use `ITEM_AUX(id, aux)` for a data-variant (as the enchanted golden apple does at
`IUIScene_CreativeMenu.cpp:538`). Sorting *within* a tab still comes from the
`setBaseItemTypeAndMaterial(baseType, material)` call (the `eBaseItemType_*` /
`eMaterial_*` enums in `Item.h`), so set that on tools/blocks; a plain food item
can skip it. But the item only shows up at all because of the explicit `ITEM(...)`
line. An item you don't add here is still obtainable via `/give` (Step 6) — it is
just invisible in creative.

## Step 6 — `/give` support is automatic (ItemNameMap codegen)

This is the neoLegacy-specific payoff of the `_Id` constant. A CMake step,
`GenerateItemNameMap.cmake`, scans `Item.h` and `Tile.h` at build time and emits
`generated/ItemNameMap.h` — a `std::unordered_map<std::string,int>` plus
`GetItemIdByName(name)` used by commands like `/give`.

The generator (`cmake/GenerateItemNameMap.cmake:22`) matches every line of the
form:

```cpp
static const int NAME_Id = NUMBER;
```

strips the `_Id` suffix, and maps `"NAME" -> NUMBER`
(`GenerateItemNameMap.cmake:25-30`). It is wired up in the top-level
`CMakeLists.txt:287`, depends on `Tile.h` and `Item.h` (`CMakeLists.txt:292-293`),
and is a hard build dependency of `Minecraft.World`, `Minecraft.Client`, and
`Minecraft.Server` (`CMakeLists.txt:301-305`).

**The consequence:** the moment you add `roasted_chestnut_Id = 437` in Step 2,
the next build regenerates the map and `/give <player> roasted_chestnut` works.
You do not touch any command code. The generator only rewrites the output when it
changes (`GenerateItemNameMap.cmake:58-72`), so incremental builds are cheap.

:::note
The name in `/give` is exactly the field name minus `_Id`, so choose a clean,
lowercase, underscore-separated constant name (`roasted_chestnut_Id`, not
`roastedChestnut_Id`) if you want the command name to read well.
:::

## Step 7 — Localization strings

Item display names and tooltips are string-table IDs (`IDS_*`), resolved through
the loc system. The source of truth for the desktop build is
`Minecraft.Client/Windows64Media/loc/stringsGeneric.xml`, a `.resx`-style XML
file. Beetroot's entries live at `stringsGeneric.xml:9488`:

```xml
<data name="IDS_BEETROOT"><value>Beetroot</value></data>
<data name="IDS_BEETROOT_SEEDS"><value>Beetroot Seeds</value></data>
<data name="IDS_ITEM_BEETROOT_SOUP"><value>Beetroot Stew</value></data>
<data name="IDS_DESC_BEETROOT"><value>Restores {*ICON_SHANK_HALF_01*}.</value></data>
<data name="IDS_DESC_BEETROOT_SEEDS"><value>Plant on Farmland.</value></data>
<data name="IDS_DESC_BEETROOT_SOUP"><value>Restores 3{*ICON_SHANK_01*}.</value></data>
```

Add matching entries for your item — one for the name (`IDS_ROASTED_CHESTNUT`)
and one for the tooltip (`IDS_DESC_ROASTED_CHESTNUT`), using the same
`{*ICON_SHANK_*}` hunger-icon tokens the other foods use:

```xml
<data name="IDS_ROASTED_CHESTNUT"><value>Roasted Chestnut</value></data>
<data name="IDS_DESC_ROASTED_CHESTNUT"><value>Restores 2{*ICON_SHANK_01*}.</value></data>
```

The build turns this XML into a generated `strings.h` (into
`generated/Windows64Media/strings.h`) that `#define`s each `IDS_*` name to its
numeric slot — that is where the `IDS_ROASTED_CHESTNUT` symbol you referenced in
`Item.cpp` Step 3 comes from. The generation is a build dependency of
`Minecraft.World` (`CMakeLists.txt:198-200`), so adding the XML entry and
rebuilding is all that is required; you never hand-edit `strings.h`. Elytra
(`IDS_ITEM_ELYTRA` at `stringsGeneric.xml:9482`) is another one-line example.

Translations go in the per-locale files beside it (`loc/de-DE/`, `loc/fr-FR/`,
…); the English `stringsGeneric.xml` is the only one required to build and run.

## Step 8 — Icon in items.png

`setIconName(L"roasted_chestnut")` stores the sprite name (`Item.cpp:670` sets
`m_textureName`). At texture-load time `Item::registerIcons` resolves it against
the item atlas (`Item.cpp:1033`):

```cpp
void Item::registerIcons(IconRegister *iconRegister)
{
    icon = iconRegister->registerIcon(m_textureName);
}
```

The item atlas is `items.png` — bound on the client as
`TextureAtlas::LOCATION_ITEMS` (`Minecraft.Client/ItemRenderer.cpp:59`), stitched
from `textures/items/` by the pre-stitched map created in
`Minecraft.Client/Textures.cpp:314`. In practice that means you drop a
`roasted_chestnut.png` (16×16) into the `textures/items/` folder of the texture
pack so the stitcher picks it up under the name you passed to `setIconName`. Use
Beetroot's `beetroot` sprite as your naming/size reference.

If your item needs per-damage or layered icons (like Elytra's broken variant),
override `registerIcons` and `getIcon(int auxValue)` on your subclass —
`ElytraItem` does exactly this (`ElytraItem.h`, `registerIcons` /
`getLayerIcon` / `getIcon` overrides). A plain food item needs none of that.

If the sprite name doesn't resolve (typo in `setIconName`, or the PNG isn't in
`textures/items/`), the atlas is the `items` `PreStitchedTextureMap` built with a
`missingNo` fallback (`Textures.cpp:314`). What you actually see depends on the
build: `PreStitchedTextureMap::registerIcon` (`PreStitchedTextureMap.cpp:279`)
prints `Could not find uv data for icon <name>` and hits `DEBUG_BREAK()` on a
debug build (`:299-301`), and on a release build falls through to
`missingPosition` — the `missingno` icon (`NAME_MISSING_TEXTURE = L"missingno"`,
`PreStitchedTextureMap.cpp:22`) mapped to UV `(0,0,1,1)`. So a misnamed icon
**breaks into the debugger** in debug and renders the missingno placeholder in
release, rather than crashing outright.

## What can go wrong

Item registration has almost no runtime guards, so most mistakes fail either at
link time or *silently* — the item exists but is wrong. The verified behaviours:

### Duplicate item index → CONFLICT logged, then overwritten

`Item::Item(int id)` (`Item.cpp:624`) does **not** reject a taken slot. It checks
`if (items[256 + id] != nullptr)` and, if so, prints `CONFLICT @ <id>` via
`app.DebugPrintf` (`Item.cpp:645`) — then unconditionally writes
`items[256 + id] = this;` on the next line, **overwriting** the earlier item.
So a collision does not crash; whichever `staticCtor` line runs last wins, and
every existing save that stored the old item silently reads the new one. The only
warning is that one `CONFLICT @ N` line in the debug log — grep both `Item.cpp`
(ctor numbers) and `Item.h` (the `_Id` block) *before* choosing rather than
relying on it.

### Forgot the `_Id` constant → no `/give`, and no build error

`GenerateItemNameMap.cmake` scrapes `static const int NAME_Id = NUMBER;` lines to
build the name→id map (Step 6). If you skip the `_Id` constant, the field still
registers and works in-world, but the name map never learns it, so
`/give <you> roasted_chestnut` fails with an unknown-item error while the build
stays green. The build log tell is the map showing "up-to-date" instead of
re-emitting — your `_Id` line never landed in `Item.h`.

### Forgot the CMake source entry → unresolved external at link

If your item is its own subclass (a new `FoodItem` derivative, a tool, etc.) and
you don't add its `.cpp`/`.h` to `Minecraft.World/cmake/sources/Common.cmake`,
the file is never compiled, but `Item::staticCtor` still `new`s the class — the
linker fails with an unresolved external for its ctor and vtable, e.g.
`unresolved external symbol "public: __cdecl RoastedChestnutItem::...(int)"`.
(A plain `new FoodItem(181, ...)` with no new class avoids this entirely — you're
only touching existing translation units.)

### Forgot the string entry → renders the literal `IDS_` key

`setDescriptionId(IDS_ROASTED_CHESTNUT)` is just a table key. A missing
`stringsGeneric.xml` entry follows the loc fallback:
`StringTable::getString(const wstring&)` (`StringTable.cpp:463`) returns **the
literal key string** when it isn't found, so the inventory shows the raw text
`IDS_ROASTED_CHESTNUT` where the name should be. (The numeric-id overload,
`getString(int)` at `:478`, instead returns an empty string for an out-of-range
id — a *blank* name — so the two failure shapes differ by which lookup path the
UI took.) Add the XML entry before testing.

### Forgot the creative line → item is `/give`-only

Per Step 5, an item not added to `IUIScene_CreativeMenu.cpp` never appears in the
creative inventory — but `/give` still works, so it's easy to think the item is
"broken" when it's merely absent from a hand-written list.

### Forgot the icon → missingno (release) or debugger break (debug)

See Step 8: a bad `setIconName` or missing `textures/items/*.png` breaks into the
debugger on a debug build (`PreStitchedTextureMap.cpp:299-301`) and renders the
`missingno` placeholder in release — it does not crash the game.

## Testing checklist

- [ ] **Build is clean** — no duplicate `_Id` or constructor-index collisions
  (grep both `Item.cpp` and `Item.h`); a collision only logs `CONFLICT @ N`
  (`Item.cpp:645`) and overwrites, it does not fail the build.
- [ ] **`ItemNameMap.h` regenerated** — build log shows
  `GenerateItemNameMap: wrote .../ItemNameMap.h`; if it says "up-to-date" your
  `_Id` line did not land in `Item.h`.
- [ ] **`/give <you> roasted_chestnut` succeeds** and yields the item (proves the
  registry slot + name map).
- [ ] **Correct display name and tooltip** in-inventory (proves the
  `stringsGeneric.xml` entries and the generated `strings.h`).
- [ ] **Icon renders** (not the `missingno` placeholder;
  `PreStitchedTextureMap.cpp:22`) — confirms the `textures/items/` sprite matches
  `setIconName`. On a debug build a bad name breaks into the debugger instead.
- [ ] **Behaviour works** — for the chestnut, eating restores the nutrition you
  passed to `FoodItem`; for a tool, mining speed/durability match the `Tier`.
- [ ] **Save/reload round-trip** — place the item in a chest, exit, reload; it is
  still there (proves the numeric ID is stable and unshared).

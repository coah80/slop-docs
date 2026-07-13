---
title: Backporting Workflow
description: A practical, step-by-step process for backporting a new Title Update feature to neoLegacy, grounded in observed practice from the commit history.
---

This page is the how-to. It turns the recurring shape from the
[Case Studies](/slop-docs/backporting/case-studies/) into a sequence you can
follow to bring a new Title Update feature into neoLegacy. Every step is grounded
in what the history actually does — the policy behind it lives in
[How neoLegacy Backports](/slop-docs/backporting/overview/).

> **Human-only.** `CONTRIBUTING.md:46-47` rejects code written "largely,
> entirely, or even noticeably by an LLM." This workflow describes work *you* do
> with understanding of the codebase, not code you generate.

## Step 0 — Pick a feature from the current milestone

The scope rule is absolute: only content from the **current target Title Update**
(`CONTRIBUTING.md:6`). While TU31 is the milestone you may implement TU31
content; you may not jump to TU32+. Pre-TU25 content is considered already
present and is only touched to fix bugs (`CONTRIBUTING.md:4`).

- Check the roadmap (`README.md:11-12`) for the live milestone and completion %.
- Confirm the feature existed in **LCE** at that milestone — not just in Java or
  Bedrock (`CONTRIBUTING.md:9`). If it has "no existing point of reference in any
  official LCE Title Update," it is out of scope.

Decide the feature's *category* up front, because it determines the file surface:
block, item, enchantment, mob, worldgen, or UI. The case studies give a template
for each.

## Step 1 — Locate the donor implementation

You rarely start from a blank file. Find the reference implementation among the
[donor sources](/slop-docs/backporting/overview/#donor-sources):

| If the feature is… | Look at |
|--------------------|---------|
| A general LCE feature | **LCE-Revelations** (the base) — the class may already be partially present. |
| A low-level / deeply-decompiled patch | **LCERenewed** (Patoke). |
| Classic crafting / a Project-Zenith donation | **Project-Zenith** files (dropped in largely as-is, then wired up). |
| A worldgen behaviour to match | **Java Edition** as a *parity reference only* — see the `720e1a77` worldgen case study. |
| Otherwise | Decompile it ("from decomp", as in `383302eb feat: armorstand from decomp`). |

Read the donor to understand the mechanic *before* writing anything. The Depth
Strider case study shows why: the enchantment class is trivial; the real
implementation is a specific edit to `LivingEntity::travel()`. You cannot wire
that correctly without knowing where the physics lives.

**As of v1.1.0b — structures have a template-XML donor path.** For a *structure*
feature, the donor is often a Java `.nbt` structure file. Run
`tools/struct_parse.py` on it to get a readable XML dump (`<Palette>`,
`<Blocks>`, `<Entities>`) of the shape — but note this XML is an **authoring
aid, not a runtime template**. You still transcribe the geometry into a C++
`Feature::place()` (hardcoded `setTileAndData` calls or a static block array),
exactly as `FossilFeature`/`IglooFeature` do. See
[Case Study 6](/slop-docs/backporting/case-studies/#6-tu43-structures--the-template-xml-era).

## Step 2 — Map the concept onto this codebase's idioms

neoLegacy is a direct C++ port of decompiled Java LCE. Two idioms matter:

1. **Legacy class names.** LCE names win over modern names. Depth Strider is
   `WaterWalkerEnchantment`, not `DepthStriderEnchantment`. A block is a `Tile`,
   not a `Block`. Check the existing hierarchy (see
   [Blocks](/slop-docs/world/blocks/), [Items](/slop-docs/world/items/),
   [Enchantments](/slop-docs/world/enchantments/)) for the right base class and
   name before creating a file.
2. **`staticCtor()` + fluent-builder registration.** Registration is a static
   pointer field plus a hard-coded integer ID, assigned in the subsystem's
   `staticCtor()` via chained setters returning `this`.

Create your class pair `Foo.{cpp,h}` subclassing the closest existing base:

- Block → subclass `Tile` or a specialization (`HalfTransparentTile`,
  `DirectionalTile`, `BaseEntityTile`, …). Slime and Barrier both chose
  `HalfTransparentTile`.
- Item → subclass `Item` / `FoodItem` / `TileItem` / etc.
- Enchantment → subclass `Enchantment` with a category and cost curve.

Override **only** the hooks whose behaviour differs from the base. `BarrierTile`
overrides six one-line methods; `SlimeTile` overrides the physics hooks
(`getPistonPushReaction`, `fallOn`, `stepOn`).

## Step 3 — Register it

Add the static pointer, the `_Id` constant (for blocks), and the `staticCtor`
line. For a block, the registration goes in `Tile::staticCtor()` (`Tile.cpp:359`)
at the next free ID:

```cpp
// Minecraft.World/Tile.cpp  (inside Tile::staticCtor)
Tile::slimeBlock = (new SlimeTile(165))
    ->setSoundType(SOUND_SLIME)
    ->setIconName(L"slime")
    ->setDescriptionId(IDS_TILE_SLIME_BLOCK)
    ->setUseDescriptionId(IDS_DESC_SLIME_BLOCK)
    ->disableMipmap();
```

Also declare the members in `Tile.h`:

```cpp
static Tile *slimeBlock;                 // named pointer
// ... and the compile-time id constant:
static const int slime_Id;
```

The equivalent sites for other subsystems (all reachable from the master
bootstrap `MinecraftWorld_RunStaticCtors()` in `Minecraft.World.cpp:26`):

| Subsystem | Register in |
|-----------|-------------|
| Blocks | `Tile::staticCtor()` — `Tile.cpp:359` |
| Items | `Item::staticCtor()` / `staticInit()` — `Item.cpp:282` / `:558` |
| Enchantments | `Enchantment::staticCtor()` — `Enchantment.cpp:54` |
| Mob effects | `MobEffect::staticCtor()` — `MobEffect.cpp:47` |
| Entities | `EntityIO::staticCtor()` — `EntityIO.cpp:45` |
| Tile entities | `TileEntity::staticCtor()` — `TileEntity.cpp:14` |
| Biomes | `Biome::staticCtor()` — `Biome.cpp:80` |
| Structures | the bootstrap block — `Minecraft.World.cpp:63-69` |

For an enchantment, mirror the addition onto the **FourKit C# API** if plugins
should see it (the Depth Strider commit added
`Minecraft.Server.FourKit/Enchantments/DepthStriderEnchantment.cs` and registered
it in the managed `Enchantment.cs` enum).

## Step 4 — Wire the supporting files

The [completeness bar](/slop-docs/backporting/overview/#the-complete-content-bar)
requires more than a registered class. Walk this checklist — it is exactly the
fan-out the case-study commits show:

### Strings (name + tooltip)

Add both the display name and the tooltip to
`Minecraft.Client/Windows64Media/loc/stringsGeneric.xml`, using the
`IDS_TILE_*` / `IDS_DESC_*` ids you referenced in registration:

```xml
<data name="IDS_TILE_SLIME_BLOCK"><value>Slime Block</value></data>
<data name="IDS_DESC_SLIME_BLOCK">
    <value>Causes players and mobs to bounce when they jump on it.</value>
</data>
```

### Texture

Register the icon name (`setIconName(L"slime")`) and add the texture to the
stitched map — barrier touched `PreStitchedTextureMap.cpp`. Do **not** commit
binary media you shouldn't; follow the existing texture-atlas pattern.

### Creative menu

Add the item to the creative inventory in
`Minecraft.Client/Common/UI/IUIScene_CreativeMenu.cpp` (`staticCtor`), using the
`ITEM(...)` / `ITEM_AUX(...)` macros beside related blocks:

```cpp
ITEM(Tile::slime_Id)
```

### Recipe / acquisition

Add the crafting or smelting recipe so the feature is *obtainable* — a
completeness-bar requirement. Simple ore-block-style recipes go in
`OreRecipies.cpp`; structured/shaped recipes go through `Recipes` /
`StructureRecipies`. The slime recipe is one `ADD_OBJECT` pair:

```cpp
// OreRecipies::_init()
ADD_OBJECT(map[8], Tile::slimeBlock);
ADD_OBJECT(map[8], new ItemInstance(Item::slime_ball, 9));
```

The andesite/diorite/granite backport (`dc5ad7aa`) added its recipes in
`StructureRecipies.cpp`. (Admin blocks like the barrier deliberately have **no**
recipe — acquisition is creative-only.)

### Drops

Confirm `getResourceCount()` / drop behaviour matches the original — barrier
returns 0 (no drops, not silk-touchable); a normal block drops itself.

**As of v1.1.0b — mob, chest, and fishing drops are data-driven XML.** Block
drops are still C++ (`getResourceCount()`), but *mob* death loot, *structure
chest* contents, and *fishing* catches now come from loot-table XML loaded at
runtime by `LootTableManager`. Add or edit the matching file under
`Common/Media/MediaWindows64/Structures/loot_tables/`:
`entities/<mobname>.xml` for a mob (the name is derived as
`"entities/" + lowercased mob name`), `chests/<name>.xml` for a structure chest
(resolved with `LootTableManager::Get().ResolveDrops("chests/<name>", …)`), or
`gameplay/fishing/*` for fishing. Do **not** re-add a hardcoded C++
`dropDeathLoot` override for a mob — that path was removed in favour of the XML.
See [Case Study 6](/slop-docs/backporting/case-studies/#6-tu43-structures--the-template-xml-era).

### Client render / interactions

Anything visual or physical: render shape in `TileRenderer.cpp`, a new particle +
`LevelRenderer` hook (barrier), piston push-chain logic (slime), a new UI scene
(classic crafting). Register any new render/particle/UI **type** where its
registry lives (`ParticleTypes.h`, `Class.h`, `UIEnums.h`).

### Build glue

Add every new `.cpp` to the module's `cmake/sources/*.cmake`. All five case
studies touched a `Common.cmake` when they added files — miss this and your new
class won't compile in.

## Step 5 — Test against the completeness definition

Before you consider the feature done, verify each clause of
`CONTRIBUTING.md:28-37` in-game:

- [ ] **Worldgen/spawn** present where applicable.
- [ ] **Recipe/acquisition** works; the item is reachable.
- [ ] **Inventory + tooltip** render correctly (creative menu, hover text).
- [ ] **Drops** on destruction/death are correct.
- [ ] **Interactions** with same-milestone content behave (pistons for slime,
      water for depth strider, etc.).
- [ ] **No crashes / soft-locks.** The worldgen work carried explicit
      null-crash guards for exactly this reason.

You can drive the client to check these; see
[Building & running](/slop-docs/overview/building/).

## Step 6 — Commit and open the PR

Follow the [commit conventions](/slop-docs/backporting/overview/#commit-conventions):

- Tag the milestone: `feat(TU31): <feature>`. Use plain `feat:` only when the
  milestone is obvious.
- **One topic per PR** (`CONTRIBUTING.md:41`). A block *with* its recipe,
  rendering, and icon is one topic; a block *plus* unrelated AI fixes is not.
- **Document every file change** in the PR — undocumented changes get the PR
  closed (`CONTRIBUTING.md:44`).
- **Fill out the PR template** fully (`CONTRIBUTING.md:50-51`).
- If you integrated a donation, **add the attribution** (classic crafting added a
  line to `README.md`'s acknowledgments and `credits:` in the commit body).

Branch naming matters: a branch under `exp/*`, `feat/*`, or named `experimental`
is automatically kept in sync with `main` by
[`sync.yml`](/slop-docs/backporting/overview/#syncyml-auto-merge-of-main-into-feature-branches).
Name a long-running feature branch accordingly.

## Step 7 — Iterate the fix chain to completeness

Expect the first `feat` commit **not** to clear the whole bar. The slime block
took five follow-up `fix:` commits (recipe, piston reactions, render priority,
damage properties) before it was complete. This is normal and preferred over
cramming everything into one unreviewable PR: land the feature, then close the
remaining completeness gaps as scoped `fix:` commits (e.g.
`fix(TU31): <feature> <specific gap>`).

Once the feature clears the bar, it rides the **nightly build** and is folded
into the next `chore: release vX.Y.Zb` stable tag.

## The whole loop, condensed

1. **Pick** a current-milestone LCE feature (`CONTRIBUTING.md`).
2. **Find** the donor implementation (Revelations / LCERenewed / Zenith / Java
   parity / decomp).
3. **Map** it onto legacy class names + `staticCtor` idioms; create `Foo.{cpp,h}`.
4. **Register** it at a new ID; mirror to FourKit if relevant.
5. **Wire** strings, texture, creative menu, recipe, drops, render, and
   `cmake/sources`.
6. **Test** against every completeness clause in-game.
7. **PR** single-topic, milestone-tagged, fully documented, attributed.
8. **Iterate** the `fix:` chain until the bar is met; ship via nightly → stable.

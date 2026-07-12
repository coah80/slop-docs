---
title: neoLegacy Additions
description: The beyond-TU-parity work in neoLegacy — slime blocks, sunflowers, 3D skulls, a TU36+ skin-select menu, widened settings, the modifiable-logo slider, world copy/save, consistent GUI colors, and rendering/QoL polish — with commits and files.
---

Most of neoLegacy's content is milestone-ordered LCE parity (see
[TU25 Backport](/slop-docs/features/tu25/) and [TU31 Backport](/slop-docs/features/tu31/)).
This page collects the work that is **neoLegacy's own** — features and polish that ship in the
1.0.x line but that are either not present in vanilla LCE TU19 or are reworked past the TU the
milestone officially targets. Everything below is cited to a commit hash and/or the concrete
source file it lives in.

Contribution policy (`CONTRIBUTING.md`) forbids content from Title Updates beyond the current
milestone, Java/Bedrock features that were never in LCE, and stub content. The additions here are
therefore either (a) TU25/TU31-era content brought forward, or (b) UI/QoL that matches a **later**
TU's presentation (the skin-select and settings menus explicitly target TU36+/TU31+ look), or
(c) engine/rendering polish with no direct vanilla equivalent.

## Slime blocks

The slime block is a full translucent, bouncy, sticky-piston-aware block — Fireblade's
(`Firebladedoge229`) single-commit implementation `05c14bc0 feat: slime block`, plus a run of
follow-up fixes.

`SlimeTile` extends `HalfTransparentTile` and overrides render, physics, and piston behaviour:

```cpp
// Minecraft.World/SlimeTile.h
class SlimeTile : public HalfTransparentTile
{
public:
    SlimeTile(int id);
    virtual int getRenderLayer();
    virtual bool shouldRenderFace(LevelSource *level, int x, int y, int z, int face);
    virtual int getRenderShape();
    virtual bool isSolidRender();
    virtual int getPistonPushReaction();

    // slime block logic
    virtual void fallOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity, float fallDistance);
    virtual void updateEntityAfterFallOn(Level *level, shared_ptr<Entity> entity);
    virtual void stepOn(Level *level, int x, int y, int z, shared_ptr<Entity> entity);
};
```

`05c14bc0` is broad — it touches ~30 files. Highlights:

| Area | File | What changed |
|---|---|---|
| Translucent render | `Minecraft.Client/TileRenderer.cpp` (+150) | render path for the slime block face/layer |
| Render flags | `Minecraft.Client/TileRenderer.h` | new render helper |
| Sticky-piston drag | `Minecraft.Client/PistonPieceRenderer.cpp` | pieces move attached slime blocks |
| Piston physics | `Minecraft.World/PistonBaseTile.cpp` (+109) | push/pull chains through slime |
| | `Minecraft.World/PistonPieceEntity.cpp` | moving-block entity carries neighbours |
| Chunk render | `Minecraft.Client/Chunk.cpp` | translucent pass |
| Material | `Minecraft.World/Material.h` | slime material entry |
| Creative menu | `Minecraft.Client/Common/UI/IUIScene_CreativeMenu.cpp` | inventory slot |
| Strings | `.../Windows64Media/loc/stringsGeneric.xml` | block name |

Files: `Minecraft.World/SlimeTile.cpp`, `Minecraft.World/SlimeTile.h`.

Follow-up fixes: `85112485 fix: slime block`, `e2b81cae` (damage properties + UI),
`e8b66c62 fix: slime block render priority`, `ab6e232d fix: slime block piston reaction(s)`,
`1f2e82c0 fix: sunflower + slime block`.

> Do not confuse `SlimeTile` (the block) with `Slime.cpp`/`LavaSlime.cpp` (the mob entities),
> which are separate files in `Minecraft.World/`.

## Sunflowers

Sunflowers are a two-tall plant driven by the double-plant feature. Worldgen lives in
`Minecraft.World/DoublePlantFeature.cpp/.h`; the dye recipe and creative-menu entry arrived in
`d9a2776e feat: sunflower w/ dye recipies`.

| Commit | Purpose |
|---|---|
| `553adb92 fix? sunflower spawning` | initial worldgen placement |
| `2673323d fix: sunflower randomly spawning` | placement distribution |
| `d9a2776e feat: sunflower w/ dye recipies` | dye recipe + creative slot |
| `893f3a9f`, `31d5c12f`, `6b56ae6a fix: sunflower placement` | placement corrections |

`d9a2776e` touches `Minecraft.World/ClothDyeRecipes.cpp` (yellow dye from sunflower),
`Minecraft.Client/PreStitchedTextureMap.cpp`, `TileRenderer.cpp` (+124), and
`IUIScene_CreativeMenu.cpp`. See also [Blocks](/slop-docs/world/blocks/) and
[Crafting](/slop-docs/world/crafting/).

## 3D in-game skulls

Vanilla LCE renders a worn/placed skull as a flat 2D item icon. neoLegacy gives the skull item a
3D model in the hand and inventory via `322d4268 feat: 3d skull` (Fireblade). This commit is
**purely a renderer change** — it touches only two files:

| File | Change |
|---|---|
| `Minecraft.Client/ItemInHandRenderer.cpp` | +37/−16 — render the skull as a block model in first person |
| `Minecraft.Client/ItemRenderer.cpp` | +33 — 3D icon in inventory/HUD |

The underlying `SkullTile`, `SkullTileEntity`, and `SkullItem` files already exist in the base
tree (they trace back to the `Initial commit` history root, not to a neoLegacy addition), so the
"3D skull" delta is specifically the rendering, not new block logic. Follow-ups:
`251c00ec fix: skulls`, `3bc8504e fix: player head renderer`, and
`27d0a8ff` which makes skulls worn by mobs/players display on the armor layer
(`CustomHeadLayer`).

Files (rendering): `Minecraft.Client/ItemInHandRenderer.cpp`, `ItemRenderer.cpp`,
`SkullTileRenderer.cpp/.h`. See [Entity Rendering](/slop-docs/client/entity-rendering/).

## Skin Select menu — TU36+ parity

The skin-select screen was rebuilt to match the TU36+ presentation. The landmark commit is
`0f5ef3b6 feat: new skinselectmenu`, which rewrites the scene logic and swaps in new Flash menus:

```
Minecraft.Client/Common/UI/UIScene_SkinSelectMenu.cpp   | 753 +++++++++++-------
Minecraft.Client/Common/UI/UIControl_MultiList.cpp      |  12 +
Minecraft.Client/Common/UI/UIControl_PlayerSkinPreview.cpp
.../Media/MediaWindows64/SkinSelectMenu{480,720,1080}.swf         (rewritten)
.../Media/MediaWindows64/SkinSelectMenuSplit{720,1080}.swf        (rewritten)
```

Follow-up fixes: `9af7a153`, `3e24e713`, `894dbcbd fix: skin select menu`,
`d811d19a fix: skin packs not having the correct icons`,
`670ff50c` (control-type setting inherits from `skinHDWin`/`skinWin`), and
`7850eff0 chore(TU31): Update skinHDWin.swf to be more accurate`.

> This is a **presentation** delta only — it does not add skins from a later TU, it reworks the
> selection UI to look like TU36+.

## Controls menu & widened settings (TU31+)

The settings menus were widened to match the TU31+ layout, and the controls menu updated. Relevant
commits:

| Commit | Purpose |
|---|---|
| `34884f00 feat: TU34 settings menu` | wider TU34-style settings layout |
| `3214e819 feat: modernized splitscreen settings menus` | split-screen settings width |
| `abb9c0ba chore: delete legacy settings menus` | removes the narrow legacy SWFs |
| `07fafd43 fix: sliders not working` | slider input on the new menus |
| `a58b14a2`, `0606ce71`, `6d98c4eb`, `00399fc2` | game-mode slider (hardcore lockout) |

The scene code lives in `Minecraft.Client/Common/UI/UIScene_SettingsUIMenu.cpp` (and sibling
`UIScene_Settings*Menu.cpp` files), with the wider `SettingsUIMenu*.swf` assets bundled alongside.
See [Settings](/slop-docs/client/settings/).

## Modifiable controller icons / in-game logo slider

A slider in the **User Interface** settings menu lets the player switch controller-icon sets and
the in-game logo. Shipped via `f3d4e20b chore: update logo ingame (#141)`; the banner logo update
is `c0196abe chore: update logo in banner (#140)`.

`f3d4e20b` swaps the `skinHDWin.swf` and `skinWin.swf` Flash assets (the logo/icon art lives in
the skin SWFs). The redesigned logo itself was donated by `rdust_dusted` (see `README.md`
Acknowledgments and `c268ef1c add new acknowledgement for new logo (#142)`).

## Copy / save worlds on the LoadCreateJoin menu

The Load/Create/Join menu gained world copy/save (and per-world rename/detail) support in
`7fb07ec8 feat(TU31): LoadCreateJoin improvements (#65)`. It adds new mode icons and Flash menus:

```
Minecraft.Client/Common/App_enums.h                     (new menu enums)
Minecraft.Client/Common/Consoles_App.cpp                | 22 +
.../MediaWindows64/Graphics/{Adventure,Creative,Survival}Icon.png
.../Media/MediaWindows64/LoadCreateJoinMenu{480,720}.swf
```

Follow-ups: `9112b9c4 fix: bugs with loadcreatejoin`, `4b8ce04e feat: LoadCreateJoinMenu1080`.
Related screens: `SelectWorldScreen`, `RenameWorldScreen`, `CreateWorldScreen`. See
[Screens](/slop-docs/client/screens/) and [Storage](/slop-docs/world/storage/).

## Consistent GUI colors

DrPerkyLegit's `Feat/consistent-gui-colors` PR (`#23`, merged `05f1af31`) unifies colour handling
across the UI — server-list entries, boss names, chest-container titles, and inventory/HUD item
names all honour colour codes through a shared format path.

| Commit | Change |
|---|---|
| `78ce2279 new color format logic` | central colour-code parser |
| `bf9a4163` | colour for items in inventory and on HUD |
| `157b703c chest containers can be colored` | colored container titles |
| `606d09a4 colored boss name` | colored boss-bar names |
| `2eb55af8` | server-list colors + a unicode parse bug fix |
| `eb5aa9fa` | chat colour codes rendering in singleplayer |
| `35500de3 fix: mesa colors and plateau` | biome-colour fix in the same area |

The colour enum is exposed to plugins too: `ChatColor.cs` in the FourKit API and
`b4419987 new funcs in Block, chatcolor enum`. See
[FourKit](/slop-docs/server/fourkit/) and [UI System](/slop-docs/client/ui-system/).

## Rendering & QoL polish

Smaller neoLegacy-specific fixes, several called out directly in `NOTES.md` for 1.0.9b:

| Item | Source |
|---|---|
| Music fades when leaving/joining a world | `NOTES.md` (1.0.9b) |
| World size shown correctly on the worlds list | `NOTES.md` (1.0.9b) |
| Removed the infinite spinner on LoadCreateJoin | `NOTES.md` (1.0.9b) |
| Panorama fix | `e92a063e fix: panorama` |
| Windows HD / SWF usage fix | `b5707e88 fix: windowsHD / windows swf usage` |
| Particle crash fixes | `b21faebb fix: particles`, `d2365c8d fix: particle crash AGAIN` |
| Persisting portal linkages | `b47c16b6 fix: persisting portal linkages` |
| Nether quartz spawning | `1bacd9d7 fix: quartz not spawning in the nether` |
| Ocelot taming | `edee8886 (#130)`, `128651de (#132)` |
| Skulls display on the armor layer | `27d0a8ff` |

> The music-fade, world-size, and spinner fixes are named in `NOTES.md` but are not isolated to a
> single tidily-named commit — they land inside the broader 1.0.9b UI work (e.g.
> `312826de feat: functional ui`, `f6fcf839 fix: multilist menu selection`). Treat `NOTES.md` as
> the authoritative statement that they shipped in 1.0.9b.

For the full per-release picture and how these additions map to version tags, see
[Version History](/slop-docs/features/changelog/).

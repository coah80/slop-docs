---
title: Entity Renderers & Models
description: How neoLegacy draws entities and block-entities — the two render dispatchers keyed on eINSTANCEOF, the EntityRenderer hierarchy, the ~50 mob models, the armor/held-item/custom-head layers, and the item-rendering trio.
---

Everything that isn't terrain is drawn by one of two dispatchers. Both are
keyed on the world's `eINSTANCEOF` entity-type enum rather than Java's runtime
`Class`, which is the single biggest structural change from Java LCE: the
original used `Map<Class<? extends Entity>, EntityRenderer>`, neoLegacy uses a
plain `unordered_map<eINSTANCEOF, EntityRenderer*>`.

Files: `EntityRenderDispatcher.h`/`.cpp`, `TileEntityRenderDispatcher.h`/`.cpp`,
`EntityRenderer.h`/`.cpp`, `LivingEntityRenderer.h`/`.cpp`, `MobRenderer.h`,
`HumanoidMobRenderer.h`/`.cpp`, `Model.h`, `ModelPart.cpp`, `HumanoidModel.cpp`,
`QuadrupedModel.cpp`, plus one `*Renderer` and `*Model` pair per entity, and the
layer files `AbstractArmorLayer.h`, `HumanoidArmorLayer.h`, `ItemInHandLayer.h`,
`CustomHeadLayer.h`/`.cpp`, `SkullTileRenderer.cpp`, `SkeletonHeadModel.h`.

## The two dispatchers

### EntityRenderDispatcher

`EntityRenderDispatcher` (`EntityRenderDispatcher.h:8`) is a singleton
(`EntityRenderDispatcher::instance`, `EntityRenderDispatcher.h:19`) built by
`staticCtor()` at boot (`Minecraft::main()`). Its map:

```cpp
typedef unordered_map<eINSTANCEOF, EntityRenderer *,
                      eINSTANCEOFKeyHash, eINSTANCEOFKeyEq> classToRendererMap;
```

The constructor registers every renderer against its `eTYPE_*` key
(`EntityRenderDispatcher.cpp:103-184`). A representative slice:

```cpp
renderers[eTYPE_PIG]     = new PigRenderer(new PigModel(), new PigModel(0.5f), 0.7f);
renderers[eTYPE_SHEEP]   = new SheepRenderer(new SheepModel(), new SheepFurModel(), 0.7f);
renderers[eTYPE_CREEPER] = new CreeperRenderer();
renderers[eTYPE_PLAYER]  = new PlayerRenderer();
renderers[eTYPE_ZOMBIE]  = new ZombieRenderer();
renderers[eTYPE_PIGZOMBIE]= new ZombieRenderer();   // shares ZombieRenderer
renderers[eTYPE_GIANT]   = new GiantMobRenderer(new ZombieModel(), 0.5f, 6);
renderers[eTYPE_ENTITY]  = new DefaultRenderer();   // fallback
```

Some keys deliberately reuse the same renderer *class* — `eTYPE_PIGZOMBIE`
gets its own `ZombieRenderer`, `eTYPE_ELDER_GUARDIAN` its own `GuardianRenderer`,
and every minecart variant (`eTYPE_MINECART_RIDEABLE`/`_FURNACE`/`_CHEST`/`_HOPPER`) maps
to one `MinecartRenderer`. Thrown items are all `ItemSpriteRenderer` bound to a
source `Item` (snowball, ender pearl, egg, potion, firework…),
`EntityRenderDispatcher.cpp:152-158`.

Lookup is `getRenderer(eINSTANCEOF)` or `getRenderer(shared_ptr<Entity>)`
(`EntityRenderDispatcher.h:44-45`). Per-frame, `prepare(...)` caches the camera
entity, textures, font and options, then `render(entity, x, y, z, rot, a)` draws.
The dispatcher also owns the `ItemInHandRenderer` and can
`registerTerrainTextures(IconRegister*)`.

> **Changed in v1.1.0b.** A **polar bear** renderer/model pair was added to the
> dispatcher: `renderers[eTYPE_POLARBEAR] = new PolarBearRenderer(new PolarBearModel(), 0.7f);`
> (right after the `eTYPE_RABBIT` registration), backed by new `PolarBearRenderer.*`
> and `PolarBearModel.*` files. This bumps the concrete mob-renderer/model counts by one.

### TileEntityRenderDispatcher

`TileEntityRenderDispatcher` (`TileEntityRenderDispatcher.h`) is the parallel
dispatcher for block-entities, with its own singleton and `staticCtor()`. Its
registrations (`TileEntityRenderDispatcher.cpp:40-49`):

| eINSTANCEOF key | Renderer |
|-----------------|----------|
| `eTYPE_SIGNTILEENTITY` | `SignRenderer` |
| `eTYPE_MOBSPAWNERTILEENTITY` | `MobSpawnerRenderer` |
| `eTYPE_PISTONPIECEENTITY` | `PistonPieceRenderer` |
| `eTYPE_CHESTTILEENTITY` | `ChestRenderer` |
| `eTYPE_ENDERCHESTTILEENTITY` | `EnderChestRenderer` |
| `eTYPE_ENCHANTMENTTABLEENTITY` | `EnchantTableRenderer` |
| `eTYPE_THEENDPORTALTILEENTITY` | `TheEndPortalRenderer` |
| `eTYPE_SKULLTILEENTITY` | `SkullTileRenderer` |
| `eTYPE_FURNACETILEENTITY` | `nullptr` (no custom render) |
| `eTYPE_BEACONTILEENTITY` | `BeaconRenderer` |

`TileEntityRenderer` (`TileEntityRenderer.h:10`) is the abstract base; its
`render(...)` gained 4J's `setColor`, `alpha` and `useCompiled` parameters.

## The EntityRenderer hierarchy

`EntityRenderer` (`EntityRenderer.h:22`) is the abstract root. It holds up to
three model slots (`model`, `modelWide`, `modelSlim`, `EntityRenderer.h:33-35`)
and a `TileRenderer* tileRenderer`, and declares the shadow/flame/texture
plumbing shared by every renderer:

```cpp
virtual void render(shared_ptr<Entity> entity,
                    double x, double y, double z, float rot, float a) = 0;
virtual ResourceLocation *getTextureLocation(shared_ptr<Entity> mob);
virtual void renderShadow(shared_ptr<Entity> e, double x, double y, double z,
                          float pow, float a);
virtual void renderFlame(shared_ptr<Entity> e, double x, double y, double z, float a);
```

It declares `friend class CustomHeadLayer` and `friend class PlayerRenderer`
(`EntityRenderer.h:24-25`) so those can reach the protected shadow/model state.

The chain for living things:

```
EntityRenderer
 └─ LivingEntityRenderer          // shadow, name tags, armor/arrow prep
     ├─ MobRenderer               // leash, "should show name"
     │   └─ HumanoidMobRenderer   // biped armor + carried item
     │       └─ ZombieRenderer, SkeletonRenderer, VillagerRenderer, …
     ├─ PlayerRenderer            // (directly on LivingEntityRenderer)
     └─ ArmorStandRenderer        // (directly on LivingEntityRenderer)
```

`LivingEntityRenderer` (`LivingEntityRenderer.h:8`) is where the per-mob draw
happens: `renderModel(...)`, `setupRotations(...)`, name-tag rendering
(`renderName` / `renderNameTag`), and the armor/arrow overlay passes
(`prepareArmor`, `prepareArmorOverlay`, `renderArrows`,
`LivingEntityRenderer.h:38-40`). Readable-name distances are constants:
`PLAYER_NAME_READABLE_FULLSCREEN = 16`, split-screen/SD `= 8`
(`LivingEntityRenderer.h:10-12`).

`HumanoidMobRenderer` (`HumanoidMobRenderer.h:9`) adds the biped armor pipeline:
`createArmorParts()`, `prepareArmor(mob, layer, a)`, `prepareSecondPassArmor(...)`
and `prepareCarriedItem(mob, item)`. Armor textures are resolved through
`getArmorLocation(ArmorItem*, layer[, overlay])` and cached in a static
`ARMOR_LOCATION_CACHE` map (`HumanoidMobRenderer.h:12-24`).

### PlayerRenderer and the wide/slim split

`PlayerRenderer : public LivingEntityRenderer` (`PlayerRenderer.h:9`) carries
**three** humanoid models — `humanoidModel`, `humanoidModelWide`,
`humanoidModelSlim` (`PlayerRenderer.h:16-18`) — the classic (Steve) plus the
wide/slim (Alex-arm) variants. Its `DEFAULT_LOCATION` was "made public for use in
skull renderer" (`PlayerRenderer.h:11-13`), which is how the char/player skull
type reuses the player texture. It carries four armor-part models
(`armorParts1..4`) for the two-layer armor render.

## Models

`Model` (`Model.h:11`) is the base: a `vector<ModelPart*> cubes`, texture
dimensions, and virtual `render(...)` / `setupAnim(...)` / `prepareMobModel(...)`.
`ModelPart` (`ModelPart.cpp`) is a bone/box group built from `Cube` primitives
with rotation and offset and child parts. Two bases cover almost everything:

- `HumanoidModel` (`HumanoidModel.cpp`) — the biped; nearly every mob and player
  model derives from it. It exposes an animation-override bitmask
  (`eAnim_ArmsDown`, `eAnim_ArmsOutFront`, `eAnim_SmallModel`, …,
  `HumanoidModel.h:26+`) used to pose sitting/riding/statue mobs.
- `QuadrupedModel` (`QuadrupedModel.cpp`) — the four-legged base for cow, pig,
  sheep, wolf, etc.

There are ~45 `*Model` source files — a model per mob (`ZombieModel`,
`CreeperModel`, `SpiderModel`, `EndermanModel`, `GhastModel`, `DragonModel`,
`WitherBossModel`, `CowModel`, `SheepModel` + `SheepFurModel`, `ModelHorse`,
`SquidModel`, `SnowManModel`, `VillagerModel`, `ArmorStandModel`, `BoatModel`,
`MinecartModel`, `ChestModel` + `LargeChestModel`, `SignModel`, `BookModel`,
`SkeletonHeadModel`, …). Model geometry helpers `SkinBox.h` / `SkinOffset.h`
define per-part UV boxes.

## Render layers (armor, held item, custom head)

`RenderLayer` (`RenderLayer.h:6`) is a small overlay interface:

```cpp
class RenderLayer {
public:
    virtual int  colorsOnDamage() = 0;
    virtual void render(shared_ptr<LivingEntity> mob,
                        float wp, float ws, float bob,
                        float headRot, float headRotX,
                        float scale, bool useCompiled) = 0;
};
```

In neoLegacy these composable layers are **wired specifically for
`ArmorStandRenderer`**, not attached as a generic per-mob layer list — ordinary
mob armor and held items go through `HumanoidMobRenderer::prepareArmor` /
`prepareCarriedItem` instead. `ArmorStandRenderer` owns an `armorLayer`
(`ArmorStandArmorLayer`) and a `headLayer` (`CustomHeadLayer`), constructed in
its ctor (`ArmorStandRenderer.cpp:42-51`).

| Layer | File | Base | Purpose |
|-------|------|------|---------|
| `AbstractArmorLayer` | `AbstractArmorLayer.h` | — | holds two `HumanoidModel*` armor models + tint colour; `getArmorModel(slot)`, `createArmorModels()` |
| `HumanoidArmorLayer` | `HumanoidArmorLayer.h` | `AbstractArmorLayer` | `createArmorModels()`, `setPartVisibility(HumanoidModel*, slot)` |
| `ArmorStandArmorModel` | `ArmorStandArmorModel.cpp` | — | armor geometry sized for a stand |
| `ItemInHandLayer` | `ItemInHandLayer.cpp` | `RenderLayer` | held item on a mob (third-person) |
| `CustomHeadLayer` | `CustomHeadLayer.cpp` | `RenderLayer` | head-slot overlay: skulls, blocks and items worn as a hat |

Note that `AbstractArmorLayer` does **not** inherit `RenderLayer` in this tree —
it is a standalone helper. Only `CustomHeadLayer` and `ItemInHandLayer` implement
the `RenderLayer` interface directly.

### neoLegacy: the 3D skull / head layer

NOTES.md (v1.0.9b, line 9) records: *"In-game skulls have now been given a 3d
effect."* The relevant commits are `feat: 3d skull`, `items render correctly on
the head`, and `fix: player head renderer`.

`CustomHeadLayer::render` (`CustomHeadLayer.cpp:36`) inspects the head slot
(`mob->getArmor(3)`) and branches three ways:

1. **A skull item** (`dynamic_cast<SkullItem*>` succeeds) — scales to
   `1.1875` and hands off to `SkullTileRenderer::instance->renderSkull(...)`
   with the skull type and any `SkullOwner` tag (`CustomHeadLayer.cpp:66-89`).
   This is what gives a worn skull real 3D geometry instead of a flat cube face.
2. **A block** (`item->id < 256`, terrain-shaped) — rendered as a proper tile via
   `tileRenderer->renderTile(...)` (`CustomHeadLayer.cpp:117-127`).
3. **Any other item** — rendered as a 3D extruded sprite via
   `ItemInHandRenderer::renderItem3D(...)`, including the enchant-glint pass for
   foil items (`CustomHeadLayer.cpp:139-224`).

`SkullTileRenderer` (`SkullTileRenderer.h`) is both a tile-entity renderer
(registered as `eTYPE_SKULLTILEENTITY`) and the shared skull-drawing service.
`renderSkull(x, y, z, face, rot, type, extra)` (`SkullTileRenderer.cpp:40`)
selects the texture by skull type:

| `SkullTileEntity` type | Texture bound |
|------------------------|---------------|
| `TYPE_WITHER` | `WITHER_SKELETON_LOCATION` |
| `TYPE_ZOMBIE` | `ZOMBIE_LOCATION` |
| `TYPE_CHAR` | `PlayerRenderer::DEFAULT_LOCATION` |
| `TYPE_CREEPER` | `CREEPER_LOCATION` |
| `TYPE_SKELETON` (default) | `SKELETON_LOCATION` |

It uses a `SkeletonHeadModel(0, 0, 64, 32)` (`SkullTileRenderer.cpp:18-19`) — a
`Model` subclass whose single `head` `ModelPart` is a 3D box
(`SkeletonHeadModel.h:5-8`). Wall-mounted skulls translate per `Facing`
(`SkullTileRenderer.cpp:72-97`); a floor skull just centres on the block.

## Item rendering trio

Three renderers cover items in their different contexts:

| Renderer | File | Context |
|----------|------|---------|
| `ItemRenderer` | `ItemRenderer.cpp` | dropped `ItemEntity` in the world + all GUI/inventory item drawing (`renderGuiItem`, `renderAndDecorateItem`, `renderGuiItemDecorations`) |
| `ItemSpriteRenderer` | `ItemSpriteRenderer.cpp` | thrown projectiles drawn as a flat billboard of an `Item`'s icon |
| `ItemInHandRenderer` | `ItemInHandRenderer.cpp` | first-person held item, plus `renderScreenEffect` (fire/water overlay) and the static `renderItem3D` used by the head layer above |

`ItemRenderer : public EntityRenderer` (`ItemRenderer.h:11`) does double duty as
the entity renderer for `eTYPE_ITEMENTITY` and the GUI item painter used by the
HUD/inventory — neoLegacy added float-scaled `renderGuiItem` /
`renderAndDecorateItem` overloads (`ItemRenderer.h`, all marked "4J - new
interfaces added"). `ItemInHandRenderer` also owns the `Minimap`
(`ItemInHandRenderer.h:34`), because the in-hand map item and the minimap share a
render surface.

## Worked trace: one zombie drawn

This follows a single zombie from the entity-render pass through cull, dispatch, and
the living-entity draw sequence, citing every hop. It is the concrete version of the
[`LivingEntityRenderer` hierarchy](#the-entityrenderer-hierarchy) above, and it is
the pass invoked as step 4 of the [frame trace](/slop-docs/client/rendering/#worked-trace-one-frame-platform-loop-to-pixels).

**1 — The pass (`renderEntities`).** `renderLevel` calls
`LevelRenderer::renderEntities(cam, culler, a)` (`LevelRenderer.cpp:546`). It first
`prepare()`s both dispatchers with the level, textures, font and camera entity
(`EntityRenderDispatcher::instance->prepare(...)`, `:558`), sets the interpolated
camera offsets `EntityRenderDispatcher::xOff/yOff/zOff` (`:576-578`), turns on the
entity light layer (`:583`), and pulls every entity in the player's level
(`getAllEntities()`, `:585`).

**2 — Cull.** For each entity it computes
`shouldRender = entity->shouldRender(cam) && (entity->noCulling || isPlayerVehicle ||
culler->isVisible(entity->bb))` (`LevelRenderer.cpp:597`). The `culler` is one of the
three [cullers](/slop-docs/client/rendering/#cullers) — a `ViewportCuller` in
split-screen, a `FrustumCuller` fullscreen — so a zombie behind the camera or outside
the frustum is dropped here. A leashed mob whose *leash holder* is visible is kept
even when the mob itself is culled (`:600-608`). Surviving that, and not being the
first-person camera target (`:616`) or in an unloaded chunk (`:618`), it calls
`EntityRenderDispatcher::instance->render(entity, a)` (`LevelRenderer.cpp:623`).

**3 — Interpolate + set light (`dispatcher::render`).** The one-arg
`EntityRenderDispatcher::render(entity, a)` (`EntityRenderDispatcher.cpp:263`)
interpolates the zombie's position with the partial-tick `a` (`:270-272`), unwraps
its body rotation across the 0/360 seam (`:276-288`), packs its light color into
`GL_TEXTURE1` (`:290-297`), and forwards to the positional overload
`render(entity, x-xOff, y-yOff, z-zOff, r, a)` (`:300`).

**4 — Dispatch by `eINSTANCEOF` (`getRenderer`).** The positional
`render(...)` (`EntityRenderDispatcher.cpp:303`) resolves the renderer:
`EntityRenderer *renderer = getRenderer(entity)` (`:305`), which is
`getRenderer(entity->GetType())` (`:220-222`) — an `unordered_map<eINSTANCEOF,
EntityRenderer*>` lookup. For a zombie `eTYPE_ZOMBIE` → the `ZombieRenderer` registered
at boot (`EntityRenderDispatcher.cpp:103-184`; `eTYPE_PIGZOMBIE` maps to a *separate*
`ZombieRenderer`). It then calls `renderer->render(entity, x, y, z, rot, a)` (`:310`)
and `renderer->postRender(...)` for the shadow (`:311`).

**5 — The living-entity draw (`LivingEntityRenderer::render`).**
`ZombieRenderer::render` (`ZombieRenderer.h:34`) does its own prep —
`swapArmor(mob)` — then chains up: `HumanoidMobRenderer::render(...)` →
`MobRenderer` → `LivingEntityRenderer::render` (`LivingEntityRenderer.h:8`,
`LivingEntityRenderer.cpp:50`), the shared draw body. In order: `setupRotations(mob, bob, bodyRot, a)`
(`:99`, applies body/head yaw and death-tilt), `renderModel(mob, wp, ws, bob,
headRot-bodyRot, headRotx, fScale)` (`:119`) — which **binds the texture**
(`bindTexture(mob)` → `getTextureLocation(...)`, `:259`) and renders the humanoid
`Model`'s bones (`resModel->render(...)`, `:262`) — and then the **armor / held-item
layers**: the `HumanoidMobRenderer` armor passes (`armor->render(...)`, `:127`,
`:162`), with a foil `ENCHANT_GLINT_LOCATION` bind for enchanted armor (`:141`).

**6 — Back to the batch.** Each `Model`/`ModelPart::render` emits its cube quads into
the shared `Tesselator` and flushes them, so the zombie's pixels land in the same
frame's terrain-adjacent draw. Name tags (`renderName`, `:404`) and arrows sticking
in the mob (`renderArrows`, `:328`, which recurses back through the dispatcher for
each arrow, `:369`) are drawn as trailing overlays. Control returns to
`renderEntities`, which advances to the next surviving entity.

## Deltas from vanilla LCE TU19

- **`eINSTANCEOF`-keyed dispatch** replaces Java's `Class`-keyed
  `HashMap` — renderers are looked up by an integer entity-type enum
  (`EntityRenderDispatcher.h:13`).
- **3D worn skulls / head items** (`feat: 3d skull`, NOTES.md:9) — the head slot
  now renders skulls, blocks and items as real geometry via `CustomHeadLayer` +
  `SkullTileRenderer::renderSkull`, rather than a flat face.
- **Wide/slim player models** — `PlayerRenderer` carries
  `humanoidModelWide` / `humanoidModelSlim` for Alex-style arms alongside the
  classic model (`PlayerRenderer.h:16-18`), backing the expanded skin selection
  (see [Live Console UI](/slop-docs/client/ui-system/)).
- **4J render-parameter additions** thread `setColor`, `alpha` and `useCompiled`
  through `TileEntityRenderer::render` and the item-render overloads for the
  console's compiled-geometry and tinting needs.

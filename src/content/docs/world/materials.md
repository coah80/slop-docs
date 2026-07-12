---
title: Materials
description: The Material system in neoLegacy — the 33 material instances, their physical properties, the fluent builder, and how tiles reference a Material.
---

A **Material** describes the *physical substance* of a block: is it solid, does it
block light, does it block motion, is it liquid, flammable, replaceable, and how it
reacts to being pushed by a piston. It is the coarse behavioural bucket a tile
falls into — separate from the block's ID, its hardness, or its texture. neoLegacy
is a direct C++ port of the decompiled Java LCE code, so the class is still named
`Material` (matching the pre-flattening Java `net.minecraft.world.level.material`).

Files: `Material.h`, `Material.cpp`, `MaterialColor.h`, `MaterialColor.cpp`, plus
five subclass headers: `GasMaterial.h`, `LiquidMaterial.h`,
`DecorationMaterial.h`, `PortalMaterial.h`, `WebMaterial.h`.

## Base class

`class Material` (`Material.h:6`). The registry is a set of ~33 static pointer
fields — there is **no ID array** for materials (unlike tiles/items); each material
is reached by name (`Material::stone`, `Material::water`, …). The instance state
is small:

| Field | Type | Meaning |
|-------|------|---------|
| `color` | `MaterialColor *` | map color bucket (public) |
| `_flammable` | `bool` | catches fire / spreads fire |
| `_replaceable` | `bool` | can be overwritten by block placement (grass, water, snow layer) |
| `_neverBuildable` | `bool` | cannot be built on top of / is not solid-blocking |
| `_isAlwaysDestroyable` | `bool` | always drops resources regardless of tool (default `true`) |
| `pushReaction` | `int` | piston reaction — one of the `PUSH_*` constants |
| `destroyedByHand` | `bool` | breakable by hand with full drop |

The constructor (`Material.cpp:83`) sets sane defaults: not flammable, not
replaceable, buildable, always destroyable, `pushReaction = 0` (`PUSH_NORMAL`),
not destroyed-by-hand.

### Piston push-reaction constants

`Material.h:45-48`:

| Constant | Value | Meaning |
|----------|-------|---------|
| `PUSH_NORMAL` | 0 | pushed normally |
| `PUSH_DESTROY` | 1 | destroyed (dropped) when pushed |
| `PUSH_BLOCK` | 2 | not pushable — stops the piston |
| `PUSH_SLIME` | 3 | slime block (sticky-drag chains) |

`PUSH_SLIME` is a **neoLegacy / newer-TU addition** tied to the slime block
(`SlimeTile`, id 165). It has its own constant so the redstone piston code can
recognise a slime block and drag adjacent blocks with it. See
[Minecraft.World Overview](/slop-docs/world/overview/) for the bootstrap order that
makes this available.

### Virtual property methods

The physics queries are `virtual` so subclasses override them:

| Method | Base returns | Overridden by |
|--------|-------------|---------------|
| `isLiquid()` | `false` | `LiquidMaterial` → `true` |
| `isSolid()` | `true` | `GasMaterial`/`LiquidMaterial`/`DecorationMaterial`/`PortalMaterial` → `false` |
| `blocksLight()` | `true` | `GasMaterial`/`DecorationMaterial`/`PortalMaterial` → `false` |
| `blocksMotion()` | `true` | `GasMaterial`/`LiquidMaterial`/`DecorationMaterial`/`PortalMaterial`/`WebMaterial` → `false` |
| `letsWaterThrough()` | `!isLiquid() && !isSolid()` | — (derived from the above) |
| `isSolidBlocking()` | `false` if `_neverBuildable`, else `blocksMotion()` | — |

`isSolidBlocking()` is what worldgen / mob-spawn / block-placement code calls to
ask "can something stand or be built on this?"; it folds `_neverBuildable`
together with `blocksMotion()`.

## The fluent builder

Materials are configured with chained mutators that each return `this`
(`Material.cpp:121-192`), the same idiom used across the module:

| Method | Effect |
|--------|--------|
| `flammable()` | set `_flammable = true` |
| `replaceable()` | set `_replaceable = true` |
| `neverBuildable()` | set `_neverBuildable = true` |
| `notAlwaysDestroyable()` | set `_isAlwaysDestroyable = false` |
| `makeDestroyedByHand()` | set `destroyedByHand = true` |
| `destroyOnPush()` | `pushReaction = PUSH_DESTROY` |
| `notPushable()` | `pushReaction = PUSH_BLOCK` |

## The material list

Registered in `Material::staticCtor()` (`Material.cpp:44`), 33 instances. The
default (no chained mutators) is a solid, opaque, motion-blocking, always-
destroyable, normally-pushable material.

| `Material::` | Class | Color | Modifiers |
|--------------|-------|-------|-----------|
| `air` | `GasMaterial` | none | (gas: not solid, no light/motion, replaceable) |
| `grass` | `Material` | grass | — |
| `dirt` | `Material` | dirt | — |
| `wood` | `Material` | wood | `flammable` |
| `stone` | `Material` | stone | `notAlwaysDestroyable` |
| `metal` | `Material` | metal | `notAlwaysDestroyable` |
| `heavyMetal` | `Material` | metal | `notAlwaysDestroyable`, `notPushable` |
| `water` | `LiquidMaterial` | water | `destroyOnPush` |
| `lava` | `LiquidMaterial` | fire | `destroyOnPush` |
| `leaves` | `Material` | plant | `flammable`, `neverBuildable`, `destroyOnPush` |
| `plant` | `DecorationMaterial` | plant | `destroyOnPush` |
| `replaceable_plant` | `DecorationMaterial` | plant | `flammable`, `destroyOnPush`, `replaceable` |
| `sponge` | `Material` | cloth | — |
| `cloth` | `Material` | cloth | `flammable` |
| `fire` | `GasMaterial` | none | `destroyOnPush` |
| `sand` | `Material` | sand | — |
| `decoration` | `DecorationMaterial` | none | `destroyOnPush` |
| `clothDecoration` | `DecorationMaterial` | cloth | `flammable` |
| `glass` | `Material` | none | `neverBuildable`, `makeDestroyedByHand` |
| `buildable_glass` | `Material` | none | `makeDestroyedByHand` |
| `explosive` | `Material` | fire | `flammable`, `neverBuildable` |
| `coral` | `Material` | plant | `destroyOnPush` |
| `ice` | `Material` | ice | `neverBuildable`, `makeDestroyedByHand` |
| `topSnow` | `DecorationMaterial` | snow | `replaceable`, `neverBuildable`, `notAlwaysDestroyable`, `destroyOnPush` |
| `snow` | `Material` | snow | `notAlwaysDestroyable` |
| `cactus` | `Material` | plant | `neverBuildable`, `destroyOnPush` |
| `clay` | `Material` | clay | — |
| `vegetable` | `Material` | plant | `destroyOnPush` |
| `egg` | `Material` | plant | `destroyOnPush` |
| `portal` | `PortalMaterial` | none | `notPushable` |
| `cake` | `Material` | none | `destroyOnPush` |
| `web` | `WebMaterial` | cloth | `notAlwaysDestroyable`, `destroyOnPush` |
| `piston` | `Material` | stone | `notPushable` |
| `packedIce` | `Material` | ice | `neverBuildable` |

### Subclasses

Five subclasses override the physics virtuals in-header:

- **`GasMaterial`** (`GasMaterial.h`) — air and fire. Constructor calls
  `replaceable()`; overrides `isSolid`/`blocksLight`/`blocksMotion` all to
  `false`.
- **`LiquidMaterial`** (`LiquidMaterial.h`) — water and lava. Constructor calls
  `replaceable()` + `destroyOnPush()`; `isLiquid()` → `true`, `isSolid()` /
  `blocksMotion()` → `false`.
- **`DecorationMaterial`** (`DecorationMaterial.h`) — plants, decorations, snow
  layer. Constructor calls `makeDestroyedByHand()`; `isSolid` / `blocksLight` /
  `blocksMotion` → `false`.
- **`PortalMaterial`** (`PortalMaterial.h`) — nether portal. `isSolid` /
  `blocksLight` / `blocksMotion` → `false`.
- **`WebMaterial`** (`WebMaterial.h`) — cobweb only. Overrides `blocksMotion()` →
  `false` while keeping the solid/light behaviour of the base. This is an explicit
  **4J addition**: the header comment notes the Java version "just does a local
  alteration when instantiating the Material for webs to get the same thing" —
  neoLegacy pulled that into a real subclass.

### neoLegacy delta vs vanilla TU19

- **`packedIce`** (`Material.cpp:80`) — `new Material(MaterialColor::ice)` with
  `neverBuildable()`. Backported alongside the packed-ice block. Note it does
  **not** get `makeDestroyedByHand()`, unlike regular `ice`, so packed ice needs a
  tool.
- **`PUSH_SLIME`** constant — added for slime-block piston chains (see above).

## MaterialColor

Every `Material` carries a `MaterialColor *color`, which is the coarse color
bucket used for the in-game map item and (historically) map rendering.
`MaterialColor` is a tiny registry of 14 instances (`MaterialColor.cpp:21`),
indexed 0–13 into `MaterialColor::colors[16]`:

| `MaterialColor::` | id | Engine color enum |
|-------------------|----|-------------------|
| `none` | 0 | `eMinecraftColour_Material_None` |
| `grass` | 1 | `eMinecraftColour_Material_Grass` |
| `sand` | 2 | `eMinecraftColour_Material_Sand` |
| `cloth` | 3 | `eMinecraftColour_Material_Cloth` |
| `fire` | 4 | `eMinecraftColour_Material_Fire` |
| `ice` | 5 | `eMinecraftColour_Material_Ice` |
| `metal` | 6 | `eMinecraftColour_Material_Metal` |
| `plant` | 7 | `eMinecraftColour_Material_Plant` |
| `snow` | 8 | `eMinecraftColour_Material_Snow` |
| `clay` | 9 | `eMinecraftColour_Material_Clay` |
| `dirt` | 10 | `eMinecraftColour_Material_Dirt` |
| `stone` | 11 | `eMinecraftColour_Material_Stone` |
| `water` | 12 | `eMinecraftColour_Material_Water` |
| `wood` | 13 | `eMinecraftColour_Material_Wood` |

`MaterialColor::staticCtor()` runs **before** `Material::staticCtor()` in the
bootstrap (`Minecraft.World.cpp:34-35`) precisely because every material
constructor takes a `MaterialColor*`. The array is allocated at size 16 but only
0–13 are filled.

## How tiles reference materials

A `Tile` stores a `Material *material` field (`Tile.h:700`). It is set at
construction: the `Tile` constructor takes `Tile(int id, Material *material, ...)`
(`Tile.h:712`), and `_init()` (`Tile.cpp:701`) writes both the material pointer
and — importantly — derives a render property from it:

```cpp
this->material = material;
Tile::tiles[id] = this;
...
transculent[id] = !material->blocksLight();   // Tile.cpp:734
```

So a tile's light-transmission (`transculent[]`) is decided entirely by its
material's `blocksLight()`. Most tile subclasses hard-code their material in the
constructor initializer list — e.g. `StoneTile::StoneTile(int id) : Tile(id,
Material::stone)` (`StoneTile.cpp:23`) — while generic tiles pass it explicitly at
the registration site: `new Tile(4, Material::stone)`, `new Tile(45,
Material::stone)`, `new ColoredTile(35, Material::cloth)`, and so on in
`Tile::staticCtor()` (`Tile.cpp:381`+).

### `material` vs `getMaterial()` — do not confuse them

This is a genuine trap. There are **two unrelated "material" concepts** on `Tile`:

- **`Tile::material`** (`Material *`) — the physical Material described on this
  page. Query it directly (`tile->material->isSolid()`).
- **`Tile::getMaterial()`** (`Tile.cpp:772`) returns `m_iMaterial`, an
  `Item::eMaterial_*` **integer tag** used by the 4J console crafting menu to
  group items (e.g. `eMaterial_stone`, `eMaterial_wood`, `eMaterial_iron`). It is
  set by `setBaseItemTypeAndMaterial(int iType, int iMaterial)`
  (`Tile.cpp:760`) during registration and has **nothing to do** with the
  `Material` class. Despite the name, `getMaterial()` does *not* return the
  `Material*`.

## Related pages

- [Minecraft.World Overview](/slop-docs/world/overview/) — the staticCtor bootstrap and ordering
- [Game Rules](/slop-docs/world/gamerules/)
- [Block Entities (TileEntity)](/slop-docs/world/tile-entities/)

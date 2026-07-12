---
title: Rendering Pipeline
description: How neoLegacy draws a frame — GameRenderer's camera, LevelRenderer as the LevelListener bridge to the world, per-player compiled Chunk geometry, the three cullers, the Tesselator, TileRenderer, and the texture/atlas stack.
---

neoLegacy's world renderer is a C++ port of Mojang's fixed-function OpenGL
pipeline, but the terrain path has been heavily rewritten by 4J to support
**split-screen** (up to four simultaneous viewports) and **multi-threaded chunk
rebuilds**. Almost every renderer that used to be a singleton is now a
per-player array indexed `[0..3]`, and terrain geometry is cached as
display-list-style compiled `Chunk`s in a global chunk grid rather than
Java LCE's per-`LevelRenderer` chunk vector.

Files: `GameRenderer.h`/`.cpp`, `LevelRenderer.h`/`.cpp`, `Chunk.h`/`.cpp`,
`Culler.h`, `FrustumCuller.cpp`, `ViewportCuller.cpp`, `AllowAllCuller.cpp`,
`Frustum.h`/`FrustumData.cpp`, `Tesselator.h`/`.cpp`, `TileRenderer.cpp`,
`Lighting.cpp`, `Camera.cpp`, `Minimap.cpp`, `Textures.h`/`.cpp`, `Stitcher.h`.

## The two renderers: GameRenderer and LevelRenderer

`Minecraft` owns exactly one of each (`Minecraft::gameRenderer`,
`Minecraft::levelRenderer`). They split responsibility cleanly:

| Renderer | Owns | Responsibility |
|----------|------|----------------|
| `GameRenderer` | camera, FOV, light textures, `ItemInHandRenderer` | per-frame setup: camera placement, fog, gamma, then drives `LevelRenderer` and the first-person hand |
| `LevelRenderer` | `Chunk` grid, per-player `TileRenderer[4]`, cloud/sky/star display lists | terrain geometry, entity/particle dispatch, sky/clouds, and the `LevelListener` bridge to the world |

### GameRenderer — camera and frame orchestration

`GameRenderer(Minecraft *mc)` (`GameRenderer.h:101`). Its public per-frame entry
is `render(float a, bool bFirst)` (`GameRenderer.cpp:1220`) — the `a` is the
partial-tick interpolation factor, `bFirst` marks the first viewport of the
frame. `render()` calls `renderLevel(a, until)`, which is the master world-draw
sequence (`GameRenderer.cpp:1468`). Its ordering, verbatim from the source:

1. `levelRenderer->renderSky(a)` — and, only when the selected texture pack id
   is `1026`, `levelRenderer->renderHaloRing(a)` (`GameRenderer.cpp:1514-1515`).
2. `levelRenderer->cull(frustum, a)` — build the visible-chunk lists.
3. `levelRenderer->render(cameraEntity, 0, a, updateChunks)` — **layer 0** (opaque solid terrain).
4. `levelRenderer->renderEntities(cameraPos, frustum, a)`.
5. `levelRenderer->renderHit(...)` — block break/selection overlay.
6. `render(cameraEntity, 1..3, a, updateChunks)` — the three transparent/blended layers.
7. first-person `renderItemInHand(a, eye)` → `itemInHandRenderer->render(a)`.

Split-screen and stereo are handled by the `eye` parameter on `setupCamera(float a, int eye)` and the `anaglyph3d`/`anaglyphPass` statics
(`GameRenderer.h:28-29`). GameRenderer also owns **one light texture per player**
— `NUM_LIGHT_TEXTURES = 4` (`GameRenderer.h:75`), with the comment "changed so
that we have one lightTexture per level, to support split screen." Gamma is a
neoLegacy addition: `ComputeGammaFromSlider(float slider0to100)` and
`ApplyGammaPostProcess()` (`GameRenderer.h:89-92`) back the brightness slider.

Camera smoothing uses `SmoothFloat` (from `Minecraft.World/SmoothFloat.h`) for
turn, third-person distance, rotation, tilt and roll (`GameRenderer.h:41-52`) —
this is what produces the eased third-person orbit.

### LevelRenderer — the LevelListener bridge

`class LevelRenderer : public LevelListener` (`LevelRenderer.h:37`). This is the
**primary bridge between the client and `Minecraft.World`.** By implementing
`LevelListener` (`Minecraft.World/LevelListener.h`) it receives every world
mutation callback and turns it into a chunk-rebuild request:

| LevelListener callback | Effect |
|------------------------|--------|
| `tileChanged(x,y,z)` | marks the containing chunk(s) dirty |
| `tileLightChanged(x,y,z)` | marks dirty (lighting-only) |
| `setTilesDirty(x0..z1, level)` | dirties a box of chunks (4J added the `level` param) |
| `entityAdded` / `entityRemoved` | tracks renderable entities |
| `globalLevelEvent` / `levelEvent` | spawns particles/sounds for world events |
| `skyColorChanged` | flags sky recolour |
| `allChanged()` | full rebuild of every chunk |

`setLevel(int playerIndex, MultiPlayerLevel *level)` (`LevelRenderer.h:83`) binds
one world per split-screen player. Note the per-player storage: `level[4]`,
`chunks[4]`, `tileRenderer[4]`, `xOld[4]`/`yOld[4]`/`zOld[4]`
(`LevelRenderer.h:155-180`) — all marked "4J - now one per player." This is the
single largest structural delta from Java LCE, which had a single `Level*` and a
single chunk list.

## Chunk geometry and the global chunk grid

A client `Chunk` (`Chunk.h:22`) is a 16×16×16 block of **compiled** render
geometry — not the world's data chunk. `Chunk::rebuild()` walks its tiles,
feeds every visible face into the `Tesselator` via `TileRenderer`, and stores
the result as a display list per render layer. Constants come from the renderer:

| Constant | Value | Source |
|----------|-------|--------|
| `LevelRenderer::CHUNK_XZSIZE` | 16 | `LevelRenderer.h:51` |
| `LevelRenderer::CHUNK_SIZE` | 16 | `LevelRenderer.h:54/56` |
| `LevelRenderer::CHUNK_RENDER_LAYERS` | 4 | `LevelRenderer.h:52` |
| `LevelRenderer::CHUNK_Y_COUNT` | `Level::maxBuildHeight / 16` | `LevelRenderer.h:58` |
| `LevelRenderer::PLAYER_RENDER_AREA` | 400 (`18*18*4 = 1296` on `_LARGE_WORLDS`) | `LevelRenderer.h:236-239` |

### Global chunk flags (4J)

Rather than storing state on each `Chunk` object, neoLegacy keeps a single flat
`unsigned char *globalChunkFlags` array indexed by a global chunk id
(`LevelRenderer.h:264`). The flag bits:

| Flag | Value | Meaning |
|------|-------|---------|
| `CHUNK_FLAG_COMPILED` | `0x01` | geometry has been built |
| `CHUNK_FLAG_DIRTY` | `0x02` | needs rebuild |
| `CHUNK_FLAG_EMPTY0` | `0x04` | layer-0 (solid) is empty |
| `CHUNK_FLAG_EMPTY1` | `0x08` | layer-1 is empty |
| `CHUNK_FLAG_NOTSKYLIT` | `0x10` | not sky-lit |

The upper bits are a **reference count** so a chunk shared between two
split-screen viewports is only freed once — `CHUNK_FLAG_REF_MASK = 0x07`,
`CHUNK_FLAG_REF_SHIFT = 5` (`LevelRenderer.h:279-280`). On Vita, a
`_CRITICAL_CHUNKS` build steals a ref-count bit for `CHUNK_FLAG_CRITICAL` /
`CHUNK_FLAG_CUT_OUT` (`LevelRenderer.h:273-277`).

### Multi-threaded rebuilds

Dirty chunks are pushed onto a lock-free stack (`dirtyChunksLockFreeStack`,
`LevelRenderer.h:283`) and drained by `updateDirtyChunks()`
(`LevelRenderer.h:110`). On `_LARGE_WORLDS`, up to `MAX_CONCURRENT_CHUNK_REBUILDS = 8` chunks rebuild in parallel across `MAX_CHUNK_REBUILD_THREADS = 7`
worker threads (`LevelRenderer.h:300-301`; comment "increased from 4 to 8 -
updated by detectiveren"). The dirty-scan interval is
`FORCE_DIRTY_CHUNK_CHECK_PERIOD_MS = 125` — "decreased from 250 to 125 - updated
by detectiveren" (`LevelRenderer.h:297`).

`cull()` fills four visible-chunk lists (`visibleLists_layer0..3`,
`LevelRenderer.h:286-289`), one per render layer, which `renderChunks(from, to,
layer, alpha)` then draws in order. Chunk draw order is sorted by
`DirtyChunkSorter` / `DistanceChunkSorter` into `OffsettedRenderList`
(`OffsettedRenderList.cpp`).

### DestroyedTileManager (4J)

Because a chunk rebuild is deferred and may lag a few frames behind a block
break, `LevelRenderer` embeds a `DestroyedTileManager`
(`LevelRenderer.h:198-224`) that keeps temporary collision AABBs for
recently-destroyed tiles until their chunk geometry catches up — otherwise a
player could fall through a block they just mined before the rebuild lands.

## Cullers

Visibility is abstracted behind `Culler` (`Culler.h`), a four-method pure
virtual interface:

```cpp
class Culler {
public:
    virtual bool isVisible(AABB *bb) = 0;
    virtual bool cubeInFrustum(double x0, double y0, double z0,
                               double x1, double y1, double z1) = 0;
    virtual bool cubeFullyInFrustum(double x0, double y0, double z0,
                                    double x1, double y1, double z1) = 0;
    virtual void prepare(double xOff, double yOff, double zOff) = 0;
};
```

`prepare(xOff, yOff, zOff)` sets the camera-relative offset so all tests can be
done in world space. Three implementations:

| Culler | File | Behaviour |
|--------|------|-----------|
| `FrustumCuller` | `FrustumCuller.cpp` | standard GL projection-matrix frustum; delegates to `Frustum::getFrustum()` |
| `ViewportCuller` | `ViewportCuller.cpp` | six hand-built `Face` planes for a **narrow split-screen viewport** |
| `AllowAllCuller` | `AllowAllCuller.cpp` | passthrough — every method returns `true` |

`FrustumCuller` (`FrustumCuller.cpp:4`) grabs the current GL frustum in its
constructor via `Frustum::getFrustum()` and subtracts the prepared offset before
each test. `Frustum : public FrustumData` (`Frustum.h:4`) extracts the six
clip planes from the product of the projection and modelview matrices
(`calculateFrustum()`, `normalizePlane()`).

`ViewportCuller` (`ViewportCuller.cpp:52`) is the split-screen culler. It builds
six `Face` planes from the mob's interpolated position and look direction with a
fixed `xFov = 30`, `yFov = 45` cone plus a far plane at `fogDistance`
(`ViewportCuller.cpp:65-72`). Each `Face` stores a plane normal `(xd, yd, zd)`
and offset `cullOffs`; `inFront(...)` and `fullyInFront(...)` test the eight
corners of an AABB against it.

`AllowAllCuller` (`AllowAllCuller.cpp`) exists as a debug/fallback that disables
culling entirely — useful when diagnosing chunks that vanish at viewport edges.

## The Tesselator

`Tesselator` (`Tesselator.h:5`) is the immediate-mode vertex batcher every
renderer funnels through — the direct port of Mojang's `Tesselator`. You
`begin()`, emit `vertex`/`vertexUV`/`color`/`tex`/`normal` calls, and `end()`
flushes the batch. It is thread-local (`CreateNewThreadStorage(int bytes)`,
`getInstance()`, `Tesselator.h:39-43`) so each chunk-rebuild worker owns its own
buffer.

| Constant | Value | Source |
|----------|-------|--------|
| `Tesselator::MAX_MEMORY_USE` | `16 * 1024 * 1024` (16 MB) | `Tesselator.h:12` |
| `Tesselator::MAX_FLOATS` | `MAX_MEMORY_USE / 4 / 2` | `Tesselator.h:13` |

neoLegacy / 4J additions on top of the classic API:

- **`useCompactVertices(bool)`** (`Tesselator.h:132`) — packs quads into a
  compact 360-era vertex format; `packCompactQuad()` assembles four vertices into
  one packed quad (`Tesselator.h:63-67`).
- **`tex2(int)`** — a second texture coordinate, "change brought forward from
  1.8.2" (`Tesselator.h:136`).
- **`setMipmapEnable(bool)`** and **`useProjectedTexture(bool)`**.
- **`Bounds`** — an inner class that accumulates a tight bounding box over every
  emitted vertex (`Tesselator.h:82-128`), used so a compiled chunk knows its real
  extent for culling.
- On Vita, deferred alpha-cutout batching plus fast-path `tileQuad` /
  `tileRainQuad` / `tileParticleQuad` helpers (`Tesselator.h:69-176`).

The larger 16 MB budget (`MAX_MEMORY_USE`) and `MAX_COMMANDBUFFER_ALLOCATIONS`
(2047 MB on Windows64, down to 55 MB on generic — `LevelRenderer.h:59-69`) are
the platform-scaled headroom for a frame's geometry.

## TileRenderer

`TileRenderer` (`TileRenderer.cpp`, ~8,860 lines — the largest single file in
the render path) turns one block into tesselator geometry. `Chunk::rebuild()`
calls it per tile; `EntityRenderer` and `ItemInHandRenderer` also use it to draw
block-shaped items in the hand or on a head. It reads the tile's render shape
(`getRenderShape()`) and emits the appropriate face set — the terrain workhorse.
`TileRenderer::canRender(shape)` gates whether a block can be drawn as 3D
geometry vs. a flat sprite (used e.g. by `CustomHeadLayer`, see
[Entity Renderers & Models](/slop-docs/client/entity-rendering/)).

## Lighting and camera

`Lighting` (`Lighting.cpp`) is the classic two-directional-light GL setup.
`turnOn()` enables `GL_LIGHT0`/`GL_LIGHT1` with diffuse `0.6`, ambient `0.4`,
zero specular, and `glShadeModel(GL_FLAT)` (`Lighting.cpp:17-42`) — the source
of Minecraft's flat, per-face shading. The two lights point at
`(0.2, 1.0, -0.7)` and `(-0.2, 1.0, 0.7)` normalized. `turnOnGui()` rotates the
light rig `-30°`/`165°` so inventory items catch a consistent highlight.

`Camera` (`Camera.cpp`) holds the view math; `GameRenderer::setupCamera` and
`moveCameraToPlayer` drive it each frame.

## Minimap

`Minimap` (`Minimap.cpp`) renders the console minimap. It is owned by
`ItemInHandRenderer` (`ItemInHandRenderer.h:34`, "made public so we can use it
from ItemFrameRenderer") — the minimap texture doubles as the in-hand map item
surface. The `ItemInHandRenderer(Minecraft *mc, bool optimisedMinimap = true)`
constructor toggles the optimised minimap path (`ItemInHandRenderer.h`, "4J Added
optimisedMinimap param").

## Textures and the atlas stack

`Textures` (`Textures.h:270`, `Minecraft::textures`) is the central texture
manager. Every fixed texture is registered by a `TEXTURE_NAME` enum entry
(`Textures.h:18-268`, running from `TN__BLUR__MISC_PUMPKINBLUR` to `TN_COUNT`),
and bound by `ResourceLocation` (`Textures.h:311-313`). The two runtime atlases
are `PreStitchedTextureMap *terrain` and `*items` (`Textures.h:293-294`).

The atlas is packed at load time by `Stitcher` (`Stitcher.h:8`), which bin-packs
every `TextureHolder` into one `StitchedTexture`:

| Stitcher constant | Value | Source |
|-------------------|-------|--------|
| `STITCH_SUCCESS` / `STITCH_RETRY` / `STITCH_ABORT` | 0 / 1 / 2 | `Stitcher.h:11-13` |
| `MAX_MIPLEVEL` | 0 | `Stitcher.h:15` (comment: "should be 4 again later when we *ACTUALLY* mipmap") |
| `MIN_TEXEL` | `1 << MAX_MIPLEVEL` | `Stitcher.h:16` |

Supporting classes: `TextureManager`, `TextureAtlas`, `TextureMap`,
`PreStitchedTextureMap`, `StitchSlot`, `StitchedTexture`, `Texture`,
`TextureHolder`, `MemTexture`, `BufferedImage`. Animated textures
(`ClockTexture.cpp`, `CompassTexture.cpp`) are ticked each frame by
`Textures::tick(bool updateTextures, bool tickDynamics)` (`Textures.h:353`).
Custom player skins arrive over the network as `HttpTexture` / `MemTexture`
entries (`httpTextures`, `memTextures` maps, `Textures.h:285-287`) — see
[Texture Packs & Resources](/slop-docs/client/resources/).

## Deltas from vanilla LCE TU19

- **Per-player everything.** `level[4]`, `chunks[4]`, `tileRenderer[4]`,
  `lightTexture[4]` — the whole terrain path is fanned out for up to four
  split-screen viewports. Vanilla LCE had single instances.
- **Global chunk grid with ref-counted flags** (`globalChunkFlags`,
  `LevelRenderer.h:264-280`) replaces per-`LevelRenderer` chunk vectors, so
  chunks visible to two viewports are compiled once and freed once.
- **Multi-threaded rebuilds** raised to 8 concurrent / 7 threads on large worlds,
  with the dirty-check period halved to 125 ms ("updated by detectiveren").
- **`DestroyedTileManager`** provides temporary collision for freshly-mined
  blocks while their geometry rebuilds.
- **Gamma post-process** (`ComputeGammaFromSlider` / `ApplyGammaPostProcess`)
  drives the brightness slider added to the settings UI.
- **`renderHaloRing`** is gated on texture-pack id `1026`
  (`GameRenderer.cpp:1515`).

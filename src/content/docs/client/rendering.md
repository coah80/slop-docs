---
title: "Rendering Pipeline"
description: "How LCE renders the game world."
---

The LCE rendering pipeline turns the game world into pixels through several systems working together. `GameRenderer` runs each frame, `LevelRenderer` manages chunk geometry, `EntityRenderDispatcher` routes entity drawing, `TileRenderer` builds block face geometry, and `Tesselator` is the low-level vertex buffer that everything feeds into.

## Frame rendering flow

`GameRenderer::render(float a, bool bFirst)` is the per-frame entry point, called once per split-screen viewport. The `a` parameter is the interpolation alpha between ticks, and `bFirst` is true for the first viewport rendered that frame.

Within a single frame, the pipeline roughly goes through these steps:

1. **Camera setup** with `setupCamera()`, which configures the projection matrix, applies FOV, and positions the camera via `moveCameraToPlayer()`
2. **World rendering** with `renderLevel()`, which draws the world in multiple passes (including frustum culling)
3. **GUI rendering** with `setupGuiScreen()`, which switches to orthographic projection for HUD and menu overlays

### Detailed frame breakdown

Inside `renderLevel()`, the world gets drawn in this order:

1. **Sky** (only if `viewDistance < 2`). `LevelRenderer::renderSky()` draws the sky dome, sun, moon, and stars using pre-built display lists (`skyList`, `starList`, `darkList`). Moon phases come from `TN_TERRAIN_MOON_PHASES`.
2. **Halo ring** (only if `viewDistance < 2` AND texture pack ID 1026). `LevelRenderer::renderHaloRing()` draws the horizon halo effect using `haloRingList`.
3. **Frustum culling.** `Frustum::getFrustum()` pulls clip planes from the current model-view-projection matrices to determine chunk visibility.
4. **Opaque pass (layer 0).** `LevelRenderer::render()` with `layer=0` renders all opaque block geometry. This is the big one with most of the vertex data.
5. **Entities.** `LevelRenderer::renderEntities()` iterates every visible entity and dispatches to the right `EntityRenderer`.
6. **Lit particles.** `ParticleEngine::renderLit()` draws lit particles using the `ENTITY_PARTICLE_TEXTURE` layer.
7. **Standard particles.** `ParticleEngine::render()` draws standard particles using the `MISC`, `TERRAIN`, and `ITEM` layers.
8. **Block selection** (if underwater). `LevelRenderer::renderHitOutline()` draws the wireframe around the targeted block, and `renderHit()` draws the crack overlay. This happens here when the camera is underwater.
9. **Translucent pass (layer 1).** `LevelRenderer::render()` with `layer=1` renders translucent geometry (water, glass, ice). With fancy graphics enabled, this is a two-pass draw: first a z-write-only pass, then the actual render pass.
10. **Block selection** (if not underwater). Same outline and crack overlay as step 8, but rendered here when the camera is above water.
11. **Destroy animation.** `LevelRenderer::renderDestroyAnimation()` draws the block-breaking progress overlay.
12. **Clouds.** `LevelRenderer::renderClouds()` or `renderAdvancedClouds()` draws the cloud layer.
13. **Weather.** `GameRenderer::renderSnowAndRain()` draws rain and snow particle sheets. 4J moved this after clouds so the weather blends properly against the cloud layer.
14. **Held item.** `GameRenderer::renderItemInHand()` draws the first-person hand and item.
15. **Screen effects.** `ItemInHandRenderer::renderScreenEffect()` draws overlays like the pumpkin blur, underwater tint, and fire overlay when the camera is inside those blocks.

After all that, `setupGuiScreen()` switches to orthographic projection and `Gui::render()` draws the HUD: hotbar, health, chat, vignette, and any overlay messages.

## GameRenderer

`GameRenderer` manages per-frame state and effects:

| Member | Purpose |
|---|---|
| `smoothTurnX` / `smoothTurnY` | Smooth camera movement (via `SmoothFloat`) |
| `smoothDistance` / `smoothRotation` / `smoothTilt` / `smoothRoll` | Third-person camera smoothing |
| `fovOffset` / `fovOffsetO` | FOV modification (sprint, bow draw) |
| `cameraRoll` / `cameraRollO` | Camera roll effect (damage) |
| `lightTexture[4]` | One light texture per level for split-screen |
| `fov[4]` / `oFov[4]` / `tFov[4]` | Per-player FOV tracking |
| `blr` / `blg` (and `blrt` / `blgt`) | Fog colour blending |
| `renderDistance` | Current render distance |
| `zoom` / `zoom_x` / `zoom_y` | Zoom state for map rendering |
| `fr` / `fg` / `fb` | Fog color components |
| `isInClouds` | Whether the camera is inside the cloud layer |
| `cameraPos` | 4J-added camera position vector |
| `rainSoundTime` | Ticks until next rain sound |

Key methods:

- **`tick(bool bFirst)`** updates FOV, rain sounds, light textures each game tick
- **`pick(float a)`** does raycasting to figure out what the player is looking at
- **`bobHurt(float a)`** applies screen shake when damaged
- **`bobView(float a)`** applies view bobbing while walking
- **`renderItemInHand(float a, int eye)`** draws the held item
- **`renderSnowAndRain(float a)`** renders weather particle sheets
- **`tickLightTexture()` / `updateLightTexture(float a)`** updates the light-map texture based on time of day and dimension
- **`setupFog(int i, float alpha)`** configures distance fog per render pass
- **`setupClearColor(float a)`** sets the background clear color based on the current fog color
- **`getFov(float a, bool applyEffects)`** calculates the current FOV including sprint and potion effects
- **`getFovAndAspect(float& fov, float& aspect, float a, bool applyEffects)`** 4J-added helper that gets both FOV and aspect ratio at once
- **`getNightVisionScale(shared_ptr<Player>, float a)`** returns the brightness boost from the night vision potion
- **`zoomRegion(double zoom, double xa, double ya)`** / **`unZoomRegion()`** zoom in for map rendering
- **`updateAllChunks()`** forces all dirty chunks to rebuild immediately (used during loading)

### Light texture

The light texture is a 2D lookup that maps block light and sky light to a final brightness. It is a small texture (16x16 pixels) indexed by `(blockLight, skyLight)`. `tickLightTexture()` is called once per game tick, and `updateLightTexture()` rebuilds the texture based on time of day, dimension, and night vision. The `lightPixels` array stores the CPU-side data, one per local player.

4J keeps one light texture per level to support split-screen players in different dimensions:

```cpp
static const int NUM_LIGHT_TEXTURES = 4;
int lightTexture[NUM_LIGHT_TEXTURES];
intArray lightPixels[NUM_LIGHT_TEXTURES];
int getLightTexture(int iPad, Level *level);
```

The `turnOnLightLayer(double alpha)` and `turnOffLightLayer(double alpha)` methods bind and unbind the light texture for the current viewport.

### Anaglyph 3D

`GameRenderer` supports stereoscopic 3D rendering through the static fields `anaglyph3d` and `anaglyphPass`. When enabled, the scene gets rendered twice with color channel separation.

### Multithreaded chunk updates

On platforms with `MULTITHREAD_ENABLE`, `GameRenderer` runs chunk updates on a background thread:

```cpp
static C4JThread* m_updateThread;
static C4JThread::EventArray* m_updateEvents;
```

The `EnableUpdateThread()` and `DisableUpdateThread()` methods control this thread. Deferred memory cleanup is handled through lock-free delete stacks for `SparseLightStorage`, `CompressedTileStorage`, and `SparseDataStorage`. The event system uses two events: `eUpdateCanRun` signals the thread to start work, and `eUpdateEventIsFinished` signals that the thread has completed.

```cpp
static vector<byte *> m_deleteStackByte;
static vector<SparseLightStorage *> m_deleteStackSparseLightStorage;
static vector<CompressedTileStorage *> m_deleteStackCompressedTileStorage;
static vector<SparseDataStorage *> m_deleteStackSparseDataStorage;
static CRITICAL_SECTION m_csDeleteStack;
```

These delete stacks are protected by a critical section and flushed when `FinishedReassigning()` is called after a chunk reassignment pass.

## LevelRenderer

`LevelRenderer` implements `LevelListener` and takes care of managing the render chunk grid and drawing the world. It keeps one set of chunks per split-screen player.

### Chunk grid

```cpp
static const int CHUNK_XZSIZE = 16;
static const int CHUNK_SIZE = 16;
static const int CHUNK_Y_COUNT = Level::maxBuildHeight / CHUNK_SIZE;
```

Chunks are 16x16x16 blocks. The render grid is allocated based on `PLAYER_RENDER_AREA` (400 chunks for standard worlds, or calculated from `PLAYER_VIEW_DISTANCE = 18` for large worlds).

Each player gets their own chunk array (`ClipChunkArray chunks[4]`), their own level pointer (`MultiPlayerLevel *level[4]`), their own `TileRenderer` (`tileRenderer[4]`), and their own last camera position (`xOld[4]`, `yOld[4]`, `zOld[4]`).

### MAX_LEVEL_RENDER_SIZE

`MAX_LEVEL_RENDER_SIZE` is a 3-element array that defines the maximum renderable level size per dimension (index 0 = Overworld, 1 = Nether, 2 = The End). The value at each index is the width/depth of the renderable region in chunks for that dimension. It differs between standard and large worlds:

- **Non-large-worlds:** `{80, 44, 44}`. The overworld uses 54+13+13, while the nether and end use 18+13+13.
- **Large worlds:** computed from platform defines. The overworld is `LEVEL_MAX_WIDTH + 18*2`, the nether is `HELL_LEVEL_MAX_WIDTH + 2`, and the end is `END_LEVEL_MAX_WIDTH`.

### DIMENSION_OFFSETS

`DIMENSION_OFFSETS` is a companion array to `MAX_LEVEL_RENDER_SIZE`. It stores the starting index into the global chunk flag array for each dimension. Each dimension's chunks occupy a contiguous block of indices:

```cpp
// Non-large-worlds:
const int LevelRenderer::DIMENSION_OFFSETS[3] = {
    0,
    (80 * 80 * CHUNK_Y_COUNT),
    (80 * 80 * CHUNK_Y_COUNT) + (44 * 44 * CHUNK_Y_COUNT)
};
```

The offset for dimension `i` equals the sum of `MAX_LEVEL_RENDER_SIZE[j]^2 * CHUNK_Y_COUNT` for all dimensions `j < i`. The `getGlobalIndexForChunk()` method uses these offsets to map a world-space chunk position to an index in the flat `globalChunkFlags` array.

### getDimensionIndexFromId

`getDimensionIndexFromId(int id)` converts a dimension ID to an array index:

```cpp
int LevelRenderer::getDimensionIndexFromId(int id)
{
    return (3 - id) % 3;
}
```

This maps: Overworld (id=0) to index 0, Nether (id=-1) to index 1, The End (id=1) to index 2. The formula only works for IDs -1, 0, and 1. Custom dimensions need this function updated (see [Custom Dimensions](/slop-docs/modding/custom-dimensions/)).

### Memory budgets (per platform)

| Platform | `MAX_COMMANDBUFFER_ALLOCATIONS` |
|---|---|
| Xbox One | 512 MB |
| PS4 (Orbis) | 448 MB |
| PS3 | 110 MB |
| Windows 64 | 2047 MB |
| Other (Xbox 360, Vita) | 55 MB |

### Chunk flags

Each chunk in the global grid has a flag byte with these bits:

| Flag | Value | Meaning |
|---|---|---|
| `CHUNK_FLAG_COMPILED` | `0x01` | Geometry has been built |
| `CHUNK_FLAG_DIRTY` | `0x02` | Needs rebuild |
| `CHUNK_FLAG_EMPTY0` | `0x04` | Layer 0 is empty |
| `CHUNK_FLAG_EMPTY1` | `0x08` | Layer 1 is empty |
| `CHUNK_FLAG_EMPTYBOTH` | `0x0c` | Both layers empty (convenience combo) |
| `CHUNK_FLAG_NOTSKYLIT` | `0x10` | Not lit by sky |
| `CHUNK_FLAG_CRITICAL` | `0x20` | Critical chunk (Vita only) |
| `CHUNK_FLAG_CUT_OUT` | `0x40` | Has cut-out textures (Vita only) |

Reference counting uses the upper bits (3-bit or 2-bit depending on platform) to track how many split-screen viewports reference a chunk. On Vita with `_CRITICAL_CHUNKS`, the ref count is only 1 bit (`CHUNK_FLAG_REF_MASK = 0x01`, `CHUNK_FLAG_REF_SHIFT = 7`) because the critical and cut-out flags steal the extra bits. On other platforms it's 3 bits (`CHUNK_FLAG_REF_MASK = 0x07`, `CHUNK_FLAG_REF_SHIFT = 5`).

The global chunk flag storage is a flat `unsigned char` array (`globalChunkFlags`). Methods like `getGlobalChunkFlag()`, `setGlobalChunkFlag()`, `clearGlobalChunkFlag()`, `incGlobalChunkRefCount()`, and `decGlobalChunkRefCount()` provide typed access.

### Dirty chunk tracking

Dirty chunks are tracked using a lock-free stack (`XLockFreeStack<int> dirtyChunksLockFreeStack`), protected by a critical section (`m_csDirtyChunks`). When a block changes, `setDirty()` or `tileChanged()` flags the affected chunks and pushes their indices onto the stack.

The `dirtyChunkPresent` flag is a quick check. If no dirty chunk has been found in the last `FORCE_DIRTY_CHUNK_CHECK_PERIOD_MS` (250ms), the system forces a scan. The `lastDirtyChunkFound` timestamp tracks when the last dirty chunk was processed.

### Render passes

`LevelRenderer::render()` takes a layer parameter. Layer 0 renders opaque geometry, layer 1 renders translucent geometry (water, glass, ice). The `renderChunks()` method goes through the visible chunk list and dispatches their display lists.

### Display lists

The level renderer maintains several pre-built display lists:

| Field | Content |
|---|---|
| `starList` | Star geometry for the night sky |
| `skyList` | Sky dome hemisphere |
| `darkList` | Dark hemisphere for the bottom of the sky |
| `haloRingList` | Horizon halo ring effect |
| `cloudList` | Cloud mesh (4J added, built by `createCloudMesh()`) |

These are built once during construction and reused every frame.

### Render lists (OffsettedRenderList)

`OffsettedRenderList` is a utility class that manages collections of OpenGL display lists offset to a specific world position. The level renderer keeps an array of these:

```cpp
static const int RENDERLISTS_LENGTH = 4;
OffsettedRenderList renderLists[RENDERLISTS_LENGTH];
```

Each `OffsettedRenderList` stores an offset position (`xOff`, `yOff`, `zOff`), a list of display list IDs, and whether it has been rendered. The `init()` method sets the position, `add()` appends a display list, and `render()` applies the offset translation and calls all the lists.

### Key rendering methods

| Method | Purpose |
|---|---|
| `render()` | Main world render for a given layer |
| `renderEntities()` | Draw all visible entities |
| `renderSky()` | Render sky dome, sun, moon, stars |
| `renderHaloRing()` | Render the halo ring effect |
| `renderClouds()` / `renderAdvancedClouds()` | Cloud rendering (simple and fancy) |
| `renderHit()` / `renderHitOutline()` | Block selection outline and crack overlay |
| `renderDestroyAnimation()` | Block-breaking progress animation |
| `cull()` | Mark chunks visible/hidden via frustum culling |
| `updateDirtyChunks()` | Rebuild chunks that have been modified |
| `renderSameAsLast()` | Re-render the same chunk set as the previous frame (optimization) |
| `resortChunks()` | Re-sort the chunk array when the camera moves to a new chunk |
| `allChanged()` | Mark all chunks dirty (used on world load or texture pack change) |
| `setLevel()` | Bind a level to a specific player index |
| `clear()` | Remove all chunks and tile entities |
| `levelEvent()` | Handle level events (sounds, particles from block interactions) |
| `destroyTileProgress()` | Update block-breaking progress for the crack overlay |
| `registerTextures()` | Register block-breaking textures with the icon system |
| `playSound()` | Bridge game sound events to the audio system |
| `playStreamingMusic()` | Bridge music events to the audio system |
| `addParticle()` / `addParticleInternal()` | Spawn particles from game logic |
| `getDimensionIndexFromId()` | Convert dimension ID to array index |
| `getGlobalIndexForChunk()` | Map a world chunk position to a global flag array index |
| `getGlobalChunkCount()` | Total chunk count across all dimensions |
| `getGlobalChunkCountForOverworld()` | Chunk count for the overworld only |
| `isGlobalIndexInSameDimension()` | Check if a global index belongs to a given dimension |

### Block destruction overlay

The `destroyingBlocks` hash map stores `BlockDestructionProgress` objects keyed by destruction ID. Each entry tracks the block position and the current crack stage (0-9). The `breakingTextures` array holds the 10 crack overlay icons used by `renderDestroyAnimation()`.

### Statistics

`gatherStats1()` and `gatherStats2()` return debug strings with rendering statistics:
- Total chunks, offscreen chunks, occluded chunks, rendered chunks, empty chunks
- Total entities, rendered entities, culled entities

### DestroyedTileManager

An inner class that provides temporary collision for recently destroyed blocks while their render chunks are being rebuilt:

```cpp
class DestroyedTileManager {
    void destroyingTileAt(Level*, int x, int y, int z);
    void updatedChunkAt(Level*, int x, int y, int z, int veryNearCount);
    void addAABBs(Level*, AABB*, AABBList*);
    void tick();
};
```

Each `RecentTile` entry stores the block position, the level, a list of collision boxes, a timeout counter, and a rebuilt flag. The critical section `m_csDestroyedTiles` protects the list since game logic and chunk rebuilding happen on different threads.

### Large worlds

When `_LARGE_WORLDS` is defined, `LevelRenderer` uses multi-threaded chunk rebuilding:

```cpp
static const int MAX_CONCURRENT_CHUNK_REBUILDS = 4;
static const int MAX_CHUNK_REBUILD_THREADS = 3;
static Chunk permaChunk[MAX_CONCURRENT_CHUNK_REBUILDS];
static C4JThread *rebuildThreads[MAX_CHUNK_REBUILD_THREADS];
```

There are 4 concurrent rebuild slots but only 3 worker threads. The 4th slot is used by the main thread. So the total concurrent rebuilds is 3 worker threads + 1 main thread = 4.

The `PLAYER_VIEW_DISTANCE` is 18 chunks, giving a render area of `18 * 18 * 4 = 1296` chunks. Chunk flags get a critical section (`m_csChunkFlags`) for thread safety. The `rebuildChunkThreadProc()` static method runs on worker threads and calls `Chunk::rebuild()` on the thread's `permaChunk` instance.

### PS3 SPU culling

On PS3, the culling work gets offloaded to SPU cores:

```cpp
void cull_SPU(int playerIndex, Culler *culler, float a);
void waitForCull_SPU();
C4JSpursJobQueue::Port* m_jobPort_CullSPU;
C4JSpursJobQueue::Port* m_jobPort_FindNearestChunk;
bool m_bSPUCullStarted[4];
```

This lets the PS3 run visibility tests in parallel across its Cell processor's SPU units while the PPU handles other work.

## Chunk (render chunk)

The `Chunk` class (not to be confused with `LevelChunk` in `Minecraft.World`) represents a 16x16x16 renderable section of the world.

### Key fields

| Field | Purpose |
|---|---|
| `x`, `y`, `z` | World position of this chunk |
| `xRender`, `yRender`, `zRender` | Render position |
| `xRenderOffs`, `yRenderOffs`, `zRenderOffs` | Offset for rendering |
| `xm`, `ym`, `zm` | Center position |
| `bb` | Bounding box for culling |
| `clipChunk` | Pointer to the `ClipChunk` visibility data |
| `id` | Display list ID |
| `level` | Back-pointer to the level |
| `assigned` | Whether this chunk is currently assigned to a level |

The `ClipChunk` companion struct stores:
- `chunk` pointer
- `globalIdx` for flag lookups
- `visible` flag set during culling
- `aabb[6]` float array for the bounding box
- `xm`, `ym`, `zm` center position

### Key operations

- **`rebuild()`** builds all tiles in the chunk into display lists using `TileRenderer`. On large worlds, each rebuild thread has its own `Tesselator` instance via thread-local storage (`tlsIdx`).
- **`makeCopyForRebuild(Chunk *source)`** copies position and assignment data so a `permaChunk` can stand in for the real chunk during multi-threaded rebuild
- **`cull(Culler*)`** tests visibility against the current frustum
- **`distanceToSqr(Entity)`** / **`squishedDistanceToSqr(Entity)`** used for sorting and prioritizing which chunks to rebuild first
- **`setDirty()`** / **`clearDirty()`** flag a chunk for rebuild
- **`setPos()`** repositions the chunk in the world
- **`getList(int layer)`** returns the display list ID for a given render layer
- **`emptyFlagSet(int layer)`** checks if a layer has been flagged empty
- **`reset()`** / **`_delete()`** cleans up display lists

On PS3, `rebuild_SPU()` offloads chunk building to SPU cores.

The static `updates` counter tracks the total number of chunk rebuilds.

### Tile visibility optimization

During `Chunk::rebuild()`, there is a major optimization that skips blocks that would never be visible anyway. Before tesselation starts, the renderer makes a local copy of the chunk's tile IDs and checks each interior block to see if it is completely surrounded on all 6 sides by rock, dirt, unbreakable (bedrock), or blocks already marked invisible. If all 6 neighbors meet that check, the block's tile ID gets set to `0xFF` in the local copy, which means "invisible" and gets skipped during tesselation.

This handles over 60% of tiles that would otherwise need processing. It also cascades: once a block is marked `0xFF`, it counts as solid for its neighbors' checks, so big solid regions get hollowed out quickly.

Only interior blocks are checked this way since edge blocks would need neighbor data from adjacent chunks. At `y=0`, the below-neighbor check is skipped since there's nothing below.

## Tesselator

`Tesselator` is the core vertex submission system. It collects vertices into an integer array and flushes them as OpenGL-style draw calls.

### Configuration

```cpp
static const int MAX_MEMORY_USE = 16 * 1024 * 1024;  // 16 MB
static const int MAX_FLOATS = MAX_MEMORY_USE / 4 / 2;
```

### State tracking

The `Tesselator` tracks what vertex attributes are active:

| Field | Purpose |
|---|---|
| `hasColor` | Whether vertex colors are being submitted |
| `hasTexture` | Whether primary UVs are active |
| `hasTexture2` | Whether secondary (lightmap) UVs are active |
| `hasNormal` | Whether normals are being submitted |
| `_noColor` | Disable color output |
| `mode` | Primitive mode (GL_QUADS, GL_TRIANGLES, etc.) |
| `tesselating` | Guard against nested begin/end |
| `mipmapEnable` | Whether mipmapping is active for this batch |
| `count` | Number of draw calls flushed |

### Vertex submission API

| Method | Purpose |
|---|---|
| `begin()` / `begin(int mode)` | Start a new primitive batch |
| `end()` | Flush the batch to the GPU |
| `vertex(float x, float y, float z)` | Submit a vertex position |
| `vertexUV(float x, float y, float z, float u, float v)` | Submit position + texture coords |
| `tex(float u, float v)` | Set current texture coordinates |
| `tex2(int tex2)` | Set secondary texture coordinates (lightmap) |
| `color(...)` | Set vertex color (multiple overloads: float/int/byte, with or without alpha) |
| `normal(float x, float y, float z)` | Set vertex normal |
| `offset(float xo, float yo, float zo)` | Set position offset applied to all vertices |
| `addOffset(float x, float y, float z)` | Add to existing offset |
| `noColor()` | Disable color output |
| `useCompactVertices(bool)` | Enable compact vertex format (Xbox 360 optimization) |
| `useProjectedTexture(bool)` | Enable projected texture pixel shader |
| `setMipmapEnable(bool)` | Toggle mipmapping for the current batch |
| `hasMaxVertices()` | Check if the buffer is full |

### Thread-local storage

`Tesselator` uses thread-local storage so each thread can have its own instance:

```cpp
static void CreateNewThreadStorage(int bytes);
static Tesselator *getInstance();
static DWORD tlsIdx;
```

This is needed for multi-threaded chunk building where each thread submits vertices independently.

### Compact vertex format (Xbox 360)

The `useCompactFormat360` flag enables a special compressed vertex format for Xbox 360. When active, the `packCompactQuad()` method packs four vertices worth of position, color, UV, and lightmap data into a tighter format:

```cpp
unsigned int m_ix[4],m_iy[4],m_iz[4];
unsigned int m_clr[4];
unsigned int m_u[4], m_v[4];
unsigned int m_t2[4];
```

### Bounds tracking

An inner `Bounds` class automatically tracks the axis-aligned bounding box of submitted vertices:

```cpp
class Bounds {
    float boundingBox[6]; // min xyz, max xyz
    void reset();
    void addVert(float x, float y, float z);
    void addBounds(Bounds& ob);
};
```

The bounds are used during chunk rebuilding to compute tight AABBs for culling.

### PS Vita optimizations

On Vita, `Tesselator` includes:
- `setAlphaCutOut(bool)` defers alpha-tested primitives to a second array (`_array2`, `vertices2`, `p2`)
- `getCutOutFound()` checks if any cut-out primitives were deferred
- `tileQuad(...)` is a fast path for compressed tile quads with per-vertex color and lightmap
- `tileRainQuad(...)` is a fast path for rain particle quads
- `tileParticleQuad(...)` is a fast path for particle quads

These fast paths skip the per-vertex state tracking and write directly into the vertex buffer, which is a big win on the Vita's limited CPU.

## TileRenderer

`TileRenderer` handles converting block state to geometry. It has specialized methods for every block shape.

### Construction

`TileRenderer` has three constructors:

```cpp
TileRenderer(LevelSource* level, int xMin, int yMin, int zMin, unsigned char *tileIds);
TileRenderer(LevelSource* level);
TileRenderer();
```

The first form is used during chunk rebuilding and takes the chunk's position and a tile ID cache for fast lookups. Each split-screen player gets their own `TileRenderer` instance.

### Shape control

The tile shape (bounding box within a block) is controlled by:

| Method | Purpose |
|---|---|
| `setShape(float x0, y0, z0, x1, y1, z1)` | Set the render bounds |
| `setShape(Tile *tt)` | Copy bounds from a tile's bounding box |
| `setFixedShape(...)` | Set bounds that won't change |
| `clearFixedShape()` | Clear fixed bounds |
| `setFixedTexture(Icon*)` | Override texture for all faces |
| `clearFixedTexture()` | Clear texture override |
| `setColor` | Whether to apply biome coloring |

The `tileShapeX0`/`X1`/`Y0`/`Y1`/`Z0`/`Z1` fields define the render bounds in 0-1 space within the block.

### Block tesselation methods

| Method | Block type |
|---|---|
| `tesselateBlockInWorld()` | Standard cubes |
| `tesselateWaterInWorld()` | Water (with height calculation) |
| `tesselateTorchInWorld()` | Torches |
| `tesselateCrossInWorld()` | Flowers, tall grass |
| `tesselateRailInWorld()` | Rails |
| `tesselateStairsInWorld()` | Stairs |
| `tesselateDoorInWorld()` | Doors |
| `tesselateFenceInWorld()` | Fences |
| `tesselateThinFenceInWorld()` | Glass panes, iron bars |
| `tesselatePistonBaseInWorld()` | Piston bases |
| `tesselatePistonExtensionInWorld()` | Piston extensions |
| `tesselateBedInWorld()` | Beds |
| `tesselateFireInWorld()` | Fire |
| `tesselateDustInWorld()` | Redstone dust |
| `tesselateLadderInWorld()` | Ladders |
| `tesselateVineInWorld()` | Vines |
| `tesselateCactusInWorld()` | Cactus |
| `tesselateLeverInWorld()` | Levers |
| `tesselateDiodeInWorld()` | Repeaters/comparators |
| `tesselateBrewingStandInWorld()` | Brewing stands |
| `tesselateCauldronInWorld()` | Cauldrons |
| `tesselateAnvilInWorld()` | Anvils |
| `tesselateLilypadInWorld()` | Lily pads |
| `tesselateCocoaInWorld()` | Cocoa pods |
| `tesselateStemInWorld()` | Melon/pumpkin stems |
| `tesselateTreeInWorld()` | Logs |
| `tesselateQuartzInWorld()` | Quartz pillars |
| `tesselateTripwireSourceInWorld()` | Tripwire hooks |
| `tesselateTripwireInWorld()` | Tripwire |
| `tesselateWallInWorld()` | Cobblestone walls |
| `tesselateEggInWorld()` | Dragon egg |
| `tesselateFenceGateInWorld()` | Fence gates |
| `tesselateAirPortalFrameInWorld()` | End portal frames |
| `tesselateFlowerPotInWorld()` | Flower pots |
| `tesselateRowInWorld()` | Crop rows |

### Main entry point

`tesselateInWorld()` is the main entry point that dispatches to the right specialized method based on the tile's render shape. It has `forceData` and `forceEntity` parameters that 4J added so tile entity renderers (like pistons) can override the block data.

`tesselateInWorldNoCulling()` skips face culling. This is used for blocks that need all faces drawn regardless of neighboring blocks (like pistons in motion).

`tesselateInWorldFixedTexture()` uses a fixed texture override for all faces. This is used for the block-breaking crack overlay.

### Ambient occlusion

`tesselateBlockInWorldWithAmbienceOcclusionTexLighting()` handles smooth lighting by sampling light values from neighboring blocks and blending them across faces. It takes base color floats for biome tinting.

The ambient occlusion system caches a huge number of intermediate values:
- `ll` prefixed fields: light levels at 27 sample positions around the block (corners, edges, faces)
- `cc` prefixed fields: combined color values at those same positions
- `llTrans` prefixed fields: translucency flags at those positions
- `tc1`-`tc4` and `c1r/g/b` through `c4r/g/b`: per-corner blended colors

The `blend()` helper method combines light values with weighted averaging.

### Face rendering

Individual face methods handle oriented quads:
- `renderFaceUp()`, `renderFaceDown()`, `renderNorth()`, `renderSouth()`, `renderWest()`, `renderEast()`

Each one takes a tile, position, and texture `Icon*`, and writes four vertices to the `Tesselator`.

### Texture flipping

The `northFlip`, `southFlip`, `eastFlip`, `westFlip`, `upFlip`, `downFlip` fields control UV rotation per face, using the constants `FLIP_NONE`, `FLIP_CW`, `FLIP_CCW`, `FLIP_180`.

### Data caching

`TileRenderer` keeps a per-chunk cache for `getLightColor()`, `getShadeBrightness()`, and `isTranslucentAt()` results. The cache is a flat array indexed by block position relative to the chunk, with bit-packed validity flags:

```cpp
static const unsigned int cache_getLightColor_valid       = 0x80000000;
static const unsigned int cache_isTranslucentAt_valid     = 0x40000000;
static const unsigned int cache_isSolidBlockingTile_valid = 0x20000000;
static const unsigned int cache_getLightColor_mask        = 0x00f000f0;
static const unsigned int cache_isTranslucentAt_flag      = 0x00000001;
static const unsigned int cache_isSolidBlockingTile_flag  = 0x00000002;
```

The `tileIds` array provides fast tile ID lookup within the chunk without going through the `LevelSource` interface.

### Helper methods

| Method | Purpose |
|---|---|
| `renderBlock()` | Render a single block into an item display (inventory/hand) |
| `renderCube()` | Render a tile as a simple cube with alpha |
| `renderTile()` | Render a tile with data and brightness |
| `canRender(int renderShape)` | Check if a render shape is supported |
| `getTexture()` | Get the texture Icon for a tile face (several overloads) |
| `getTextureOrMissing()` | Get a texture or the missing texture fallback |
| `getWaterHeight()` | Calculate the visual water level at a position |

### Piston rendering

Pistons have three dedicated methods:
- `tesselatePistonBaseForceExtended()` renders the piston base as if extended
- `tesselatePistonBaseInWorld()` renders the base based on its actual state
- `tesselatePistonExtensionInWorld()` renders the extending arm

The arm rendering has three directional helpers: `renderPistonArmUpDown()`, `renderPistonArmNorthSouth()`, `renderPistonArmEastWest()`.

### Anvil rendering

Anvils use a multi-piece system. `tesselateAnvilPiece()` renders one piece of the anvil geometry and returns a height offset. The `render` parameter controls whether to actually draw or just calculate bounds.

## EntityRenderDispatcher

This singleton routes entity rendering to the right `EntityRenderer` subclass based on entity type (`eINSTANCEOF`). It keeps a map from entity type to renderer:

```cpp
typedef unordered_map<eINSTANCEOF, EntityRenderer*, ...> classToRendererMap;
```

The `render()` method calculates the entity's interpolated position and hands off to the right renderer. `prepare()` needs to be called each frame to set up the camera, textures, font, and options context.

Key state:

| Field | Purpose |
|---|---|
| `xOff`, `yOff`, `zOff` | Camera-relative offset (static) |
| `xPlayer`, `yPlayer`, `zPlayer` | Camera world position |
| `playerRotY`, `playerRotX` | Camera rotation |
| `cameraEntity` | The entity acting as the camera |
| `isGuiRender` | Whether we're rendering for a GUI (inventory preview) |
| `textures` | Texture manager |
| `itemInHandRenderer` | For rendering held items |
| `level` | Current level |
| `options` | Game options |

The `staticCtor()` method builds the renderer map, creating an instance of each `EntityRenderer` subclass and mapping it to the right `eINSTANCEOF` type.

## EntityRenderer hierarchy

`EntityRenderer` is the base class for all entity renderers. It provides:

| Method | Purpose |
|---|---|
| `render()` | Pure virtual: draw the entity |
| `postRender()` | Draw shadows, fire overlay after the entity |
| `bindTexture()` | Bind a texture by name or ID, with optional HTTP fallback |
| `renderFlame()` | Draw fire overlay on burning entities |
| `renderShadow()` | Draw ground shadow beneath entity |
| `renderTileShadow()` | Helper for shadow projection onto a block face |
| `renderFlat()` | Static helper for flat quad rendering |
| `getModel()` | Return the model (virtual, overridden by subclasses) |
| `init()` | Store the dispatcher reference |
| `getFont()` | Get the font for name tag rendering |
| `registerTerrainTextures()` | Register block textures for falling blocks etc. |

`MobRenderer` extends it with mob-specific logic: body rotation interpolation, armor overlay rendering, name tag rendering, death animation (flip degrees), overlay colors (damage flash, suffocation), and baby scaling.

### MobRenderer rendering pipeline

The `MobRenderer::render()` method follows this sequence:

1. Calculate interpolated body rotation via `rotlerp()`
2. Calculate walk position (`wp`) and walk speed (`ws`)
3. Calculate the bob timer
4. Calculate head rotation relative to body
5. Call `setupPosition()` to translate to the entity's position
6. Call `setupRotations()` to apply body rotation and death animation
7. Call `scale()` for baby mob scaling
8. Call `model->prepareMobModel()` to set entity-specific state
9. Call `renderModel()` which calls `model->render()`
10. Loop through armor layers, calling `prepareArmor()` and `prepareArmorOverlay()` for each
11. Call `additionalRendering()` for class-specific extras
12. Call `renderName()` for name tags

### All entity renderers

| Class | Entity |
|---|---|
| `PlayerRenderer` | Players (local and remote) |
| `ChickenRenderer` | Chickens |
| `CowRenderer` | Cows |
| `CreeperRenderer` | Creepers |
| `PigRenderer` | Pigs |
| `SheepRenderer` | Sheep |
| `WolfRenderer` | Wolves |
| `SquidRenderer` | Squids |
| `SpiderRenderer` | Spiders and cave spiders |
| `GhastRenderer` | Ghasts |
| `SlimeRenderer` | Slimes |
| `LavaSlimeRenderer` | Magma cubes |
| `EndermanRenderer` | Endermen |
| `SilverfishRenderer` | Silverfish |
| `BlazeRenderer` | Blazes |
| `EnderDragonRenderer` | Ender Dragon |
| `SnowManRenderer` | Snow golems |
| `VillagerRenderer` | Villagers |
| `VillagerGolemRenderer` | Iron golems |
| `OzelotRenderer` | Ocelots/cats |
| `MushroomCowRenderer` | Mooshrooms |
| `ZombieRenderer` | Zombies |
| `HumanoidMobRenderer` | Skeletons (with `SkeletonModel`), pig zombies (with `ZombieModel`) |
| `GiantMobRenderer` | Giants |
| `ArrowRenderer` | Arrows |
| `BoatRenderer` | Boats |
| `MinecartRenderer` | Minecarts |
| `TntRenderer` | Primed TNT |
| `FallingTileRenderer` | Falling blocks |
| `ItemRenderer` | Dropped items |
| `ItemSpriteRenderer` | Thrown projectiles (snowballs, ender pearls, eyes of ender, eggs, potions, exp bottles) |
| `ExperienceOrbRenderer` | XP orbs |
| `PaintingRenderer` | Paintings |
| `FishingHookRenderer` | Fishing bobbers |
| `FireballRenderer` | Fireballs, small fireballs, dragon fireballs |
| `EnderCrystalRenderer` | Ender crystals |
| `LightningBoltRenderer` | Lightning |
| `ItemFrameRenderer` | Item frames |
| `DefaultRenderer` | Fallback renderer |

## Tile entity renderers

`TileEntityRenderDispatcher` routes tile entity rendering in a similar way to `EntityRenderDispatcher`. Specialized renderers:

| Class | Tile entity |
|---|---|
| `ChestRenderer` | Chests |
| `EnderChestRenderer` | Ender chests |
| `EnchantTableRenderer` | Enchanting tables (with book model) |
| `SignRenderer` | Signs |
| `MobSpawnerRenderer` | Mob spawners |
| `PistonPieceRenderer` | Piston extensions |
| `SkullTileRenderer` | Mob heads |
| `TheEndPortalRenderer` | End portals |

## Camera

The `Camera` class provides static helpers for camera positioning:

| Method | Purpose |
|---|---|
| `Camera::prepare()` | Sets up camera orientation matrices. Takes a player and a mirror flag for anaglyph rendering. |
| `Camera::getCameraPos()` | Returns the interpolated camera world position as a `Vec3*` |
| `Camera::getCameraTilePos()` | Returns the block position of the camera as a `TilePos*` |
| `Camera::getBlockAt()` | Checks what block type the camera is inside (for underwater/lava/fire effects) |

Camera offset fields for particle and entity rendering:

| Field | Purpose |
|---|---|
| `xa` | Camera right axis X |
| `ya` | Camera up axis Y |
| `za` | Camera forward axis Z |
| `xa2` | Camera right axis (second component) |
| `za2` | Camera forward axis (second component) |
| `xPlayerOffs`, `yPlayerOffs`, `zPlayerOffs` | Player position offset |

The `modelview` and `projection` static `FloatBuffer` pointers store the current GL matrices for frustum extraction.

## Culling

Three `Culler` implementations control visibility:

### Culler (base interface)

```cpp
class Culler {
    virtual bool isVisible(AABB *bb) = 0;
    virtual bool cubeInFrustum(double x0, y0, z0, x1, y1, z1) = 0;
    virtual bool cubeFullyInFrustum(double x0, y0, z0, x1, y1, z1) = 0;
    virtual void prepare(double xOff, yOff, zOff) = 0;
};
```

### FrustumCuller

Standard frustum culling against view planes. Stores a `FrustumData*` and camera offsets (`xOff`, `yOff`, `zOff`). The `prepare()` method calls `Frustum::getFrustum()` to extract the six frustum planes from the current GL matrices.

### FrustumData

Stores the six frustum planes (RIGHT, LEFT, BOTTOM, TOP, BACK, FRONT), each with four components (A, B, C, D representing the plane equation). Methods:

| Method | Purpose |
|---|---|
| `pointInFrustum()` | Test a single point |
| `sphereInFrustum()` | Test a bounding sphere |
| `cubeInFrustum()` | Test if a box partially overlaps the frustum |
| `cubeFullyInFrustum()` | Test if a box is entirely inside the frustum |
| `isVisible(AABB*)` | Test an AABB for visibility |

The `Frustum` subclass adds `calculateFrustum()` which reads the GL projection and modelview matrices, computes the combined clip matrix, and extracts the six planes. `normalizePlane()` normalizes each plane after extraction.

### ViewportCuller

Viewport-based culling that builds six frustum-like faces from the player's position and rotation. Each face is represented by a `Face` inner class with center, direction, and cull offset. The `inFront()` method tests whether a point or box is on the visible side of a face. Note that `ViewportCuller::isVisible` takes an `AABB` by value (not by pointer like the `Culler` base), which is a slight interface mismatch in the source.

### AllowAllCuller

No culling (renders everything). All visibility tests return true. Used during loading or when culling is disabled. Note that `AllowAllCuller` does not explicitly inherit from `Culler` in the source, but it declares the same virtual interface (`isVisible`, `cubeInFrustum`, `cubeFullyInFrustum`, `prepare`).

## Lighting

The `Lighting` class provides static methods for fixed-function lighting:

| Method | Purpose |
|---|---|
| `Lighting::turnOn()` | Enables standard 3D lighting with two directional lights |
| `Lighting::turnOff()` | Disables lighting |
| `Lighting::turnOnGui()` | Enables lighting tuned for GUI model rendering (flatter, more even) |

The `getBuffer()` helpers pack light parameters into `FloatBuffer` objects for GL calls.

## Other rendering components

| Class | Purpose |
|---|---|
| `ItemInHandRenderer` | First-person held item with bobbing, swing animation, and screen effects (pumpkin overlay, underwater, fire). Has a `Minimap` for in-hand map rendering. |
| `ProgressRenderer` | Loading screen progress bars with title, status, and percentage. Uses a critical section for thread safety. |
| `Gui` | HUD rendering: hotbar, health, chat messages, vignette, pumpkin blur. Keeps per-player chat message lists. |
| `ScreenSizeCalculator` | Computes safe-zone-adjusted screen dimensions from raw resolution and options |
| `Minimap` | In-game map rendering using `MapItemSavedData`. Uses a color lookup table (`LUT`) and supports optimized rendering. |
| `OffsettedRenderList` | Manages display list collections offset to a world position |
| `DirtyChunkSorter` / `DistanceChunkSorter` | Sort chunks by rebuild priority or distance |

### ItemInHandRenderer details

| Method | Purpose |
|---|---|
| `render(float a)` | Draw the first-person hand and held item |
| `renderItem()` | Draw an item held by a mob (used for both first and third person) |
| `renderItem3D()` | Static method that renders a flat item as a 3D extruded shape |
| `renderScreenEffect()` | Draw screen overlays (pumpkin, water, fire) |
| `renderTex()` | Render a full-screen texture overlay |
| `renderWater()` | Underwater overlay |
| `renderFire()` | Fire overlay when camera is in fire |
| `tick()` | Update the hand animation state |
| `itemPlaced()` / `itemUsed()` | Trigger the hand swing animation |

The `height` / `oHeight` fields control the hand position animation. The static `list` and `listGlint` fields store display lists for the item and its enchantment glint.

## MinecraftConsoles differences

MinecraftConsoles has a bunch of additions to the rendering pipeline compared to LCEMP:

### New entity renderers

| Class | Entity | Notes |
|---|---|---|
| `BatRenderer` | Bats | New mob added in 1.4 |
| `CaveSpiderRenderer` | Cave spiders | Gets its own renderer (extends `SpiderRenderer`) with a separate texture and a smaller scale. In LCEMP, `SpiderRenderer` handles both. |
| `HorseRenderer` | Horses | Full horse renderer with layered texture caching for markings, armor overlays, and variant types (horse, donkey, mule, zombie, skeleton) |
| `OcelotRenderer` | Ocelots/cats | Gets a dedicated renderer class. In LCEMP this was handled by the generic `OzelotRenderer` (note the spelling change too, `Ozelot` to `Ocelot`). |
| `SkeletonRenderer` | Skeletons | Separated into its own class (extends `HumanoidMobRenderer`) with texture switching between normal and wither skeleton. In LCEMP, `HumanoidMobRenderer` handles both directly. |
| `WitchRenderer` / `WitchModel` | Witches | Completely new mob. |
| `WitherBossRenderer` | Wither boss | New boss mob with invulnerability texture, armor overlay, and scaling. |
| `WitherSkullRenderer` | Wither skulls | Projectile renderer for wither skull attacks. |
| `LeashKnotRenderer` / `LeashKnotModel` | Leash knots | Renders the leash fence knot entity. |
| `TntMinecartRenderer` | TNT minecarts | Custom renderer that shows the TNT priming animation inside the minecart. |
| `MinecartSpawnerRenderer` | Spawner minecarts | Renders the spinning mob inside the spawner minecart. |
| `BeaconRenderer` | Beacon beam | Tile entity renderer for the beacon's light beam effect. |

### New tile renderer methods

`TileRenderer` gains several new `tesselate` methods:

- `tesselateBeaconInWorld()` for beacon blocks
- `tesselateComparatorInWorld()` for redstone comparators
- `tesselateHopperInWorld()` for hoppers (two overloads)
- `tesselateRepeaterInWorld()` for repeaters (separate from the diode method)
- `tesselateThinPaneInWorld()` for stained glass panes

A bunch of `_SPU` tile files are also added for PS3 SPU offloading of tile geometry building (e.g., `CactusTile_SPU.h`, `DoorTile_SPU.h`, `FenceTile_SPU.h`, etc.).

### LevelRenderer changes

`LevelRenderer` gets several helper files broken out:

- `LevelRenderChunks.h` for chunk management
- `LevelRenderer_cull.h` for culling logic
- `LevelRenderer_FindNearestChunk.h` for nearest chunk search
- `LevelRenderer_zSort.h` for z-sorting

### Renderer base class

`LivingEntityRenderer` is inserted as a new base class between `EntityRenderer` and `MobRenderer`. It handles the common mob rendering pipeline: model rendering, positioning, rotations, attack animations, armor layers, name tags, and arrow-stuck-in-entity rendering. This is stuff that was previously jammed directly into `MobRenderer` in LCEMP.

It adds a `ResourceLocation` for the enchantment glint texture (`ENCHANT_GLINT_LOCATION`) and uses `shared_ptr<LivingEntity>` consistently instead of raw `Entity` references.

New protected virtual methods on `LivingEntityRenderer`:

| Method | Purpose |
|---|---|
| `renderArrows()` | Render arrows stuck in the entity |
| `shouldShowName()` | Whether to display the name tag |
| `renderNameTags()` | Render name tags with scaling and distance check |
| `renderNameTag()` | Render a single name tag string |

The name tag rendering has distance constants for readability: 16 blocks in fullscreen, 8 blocks in splitscreen or SD.

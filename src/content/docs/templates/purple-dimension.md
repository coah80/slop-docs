---
title: "Template: Purple Dimension"
description: A complete recipe for a new dimension end to end — Dimension subclass, chunk source, an entry portal tile, and sky/fog color hooks, modeled on the real Nether and End files.
---

This is a **complete dimension recipe**. Follow it top to bottom and you get a new
world reachable through a portal: the **Purple Dimension** — a flat, dim, purple-fogged
place modeled directly on the two real custom dimensions neoLegacy ships,
**`HellDimension`** (the fullest override example) and **`TheEndDimension`** (the
cleanest chunk-source + entry-portal example).

Be honest with yourself before starting: **dimensions are hardcoded by integer id
in several places**, and one of them (`MinecraftServer::getLevel`) lives *outside*
`Minecraft.World` and is backed by a **fixed three-slot array**. Adding a genuinely
new id is invasive. This page shows both the clean, copy-a-pattern parts and the
"you must edit a hardcoded switch / grow a fixed array" parts, and it gives you a
zero-server-surgery fallback (reskin an existing id) so you can see something
working today.

Concept pages to keep open: [Custom Dimensions](/slop-docs/modding/custom-dimensions/),
[Dimensions reference](/slop-docs/world/dimensions/), and
[Getting Started](/slop-docs/modding/getting-started/). Everything below is in
`Minecraft.World/` unless the path says `Minecraft.Client/`.

## How dimensions actually work here

A dimension is a plain `Dimension` subclass (`Dimension.h:12`) — **not registered
by a `staticCtor`**. They are constructed on demand by a hardcoded factory:

```cpp
// Dimension.cpp:194 — the ONLY place dimension objects are minted
Dimension *Dimension::getNew(int id)
{
    if (id == -1) return new HellDimension();
    if (id ==  0) return new NormalDimension();
    if (id ==  1) return new TheEndDimension();
    return nullptr;
}
```

Each dimension object provides:

- a **biome source** (`init()` sets `biomeSource`),
- a **chunk source factory** (`createRandomLevelSource()`),
- **sky/fog/light** hooks (`getFogColor`, `getSunriseColor`, `getTimeOfDay`,
  `updateLightRamp`),
- world rules (`hasCeiling`, `ultraWarm`, `mayRespawn`, `isNaturalDimension`,
  `getSpawnPos`, …).

Travel between them runs through `Entity::changeDimension(int id)`
(`Entity.cpp:2065`), which asks the server for the destination level:

```cpp
// Entity.cpp:2071-2072
ServerLevel *oldLevel = server->getLevel(lastDimension);
ServerLevel *newLevel = server->getLevel(i);
```

And `getLevel` maps ids to a fixed three-slot table:

```cpp
// Minecraft.Client/MinecraftServer.cpp:2559
ServerLevel *MinecraftServer::getLevel(int dimension)
{
    if (dimension == -1) return levels[1];   // Nether
    else if (dimension == 1) return levels[2]; // End
    else return levels[0];                    // Overworld
}
```

`levels` is a `ServerLevelArray` (`MinecraftServer.h:90`), and the per-dimension
statics inside `ServerLevel` are sized `[3]` (`ServerLevel.h:180-186`). **That `[3]`
is the real ceiling.** A brand-new fourth slot means growing those arrays and the
`getLevel`/`setLevel`/`loadLevel` mappings.

### Two ways to ship this

| Approach | Server surgery | Result |
|----------|----------------|--------|
| **A. Reskin the End (id 1)** | none | swap `TheEndDimension` for `PurpleDimension` in `getNew`; your world *is* "the End" slot but looks/behaves purple. Fastest to see working. |
| **B. True new id (2)** | yes — grow the `[3]` arrays and every id switch | a genuinely separate 4th dimension. |

This recipe writes the dimension so it works for **both**. Approach A needs only
Steps 1–5. Approach B adds Step 6.

## Files you will create

| File | Purpose |
|------|---------|
| `PurpleDimension.h` / `PurpleDimension.cpp` | the `Dimension` subclass |
| `PurpleLevelSource.h` / `PurpleLevelSource.cpp` | the `ChunkSource` (or reuse an existing one) |

## Files you will edit

| File | Change | Anchor |
|------|--------|--------|
| `Dimension.cpp` | add a case to `getNew` | `Dimension.cpp:194` |
| `Tile.cpp` / `Tile.h` | register the entry portal tile | `Tile.cpp:520`, `Tile.h:583` |
| `cmake/sources/Common.cmake` | add new files to the build | feature/dimension blocks |
| *(Approach B only)* `Minecraft.Client/MinecraftServer.cpp`, `ServerLevel.h` | grow the `[3]` arrays and id switches | `MinecraftServer.cpp:2559`, `:981`, `ServerLevel.h:180` |

---

## Step 1 — the `Dimension` subclass

`NormalDimension` is the trivial case — it overrides nothing (`NormalDimension.h`):

```cpp
// NormalDimension.h (real source — the whole file)
#pragma once
#include "Dimension.h"
class NormalDimension : public Dimension {};
```

`HellDimension` and `TheEndDimension` are the interesting templates. We model
`PurpleDimension` on both: `init()` and `getFogColor()` come from `HellDimension`,
`getTimeOfDay()`/`getSunriseColor()`/`getSpawnPos()` come from `TheEndDimension`.

### `PurpleDimension.h`

```cpp
// PurpleDimension.h
#pragma once
#include "Dimension.h"

class PurpleDimension : public Dimension
{
public:
    virtual void init();
    virtual ChunkSource *createRandomLevelSource() const;

    // Sky / fog / light
    virtual Vec3 *getFogColor(float td, float a) const;
    virtual float *getSunriseColor(float td, float a);
    virtual float getTimeOfDay(int64_t time, float a) const;
protected:
    virtual void updateLightRamp();

    // World rules
public:
    virtual bool isNaturalDimension();
    virtual bool mayRespawn() const;
    virtual bool isFoggyAt(int x, int z);
    virtual Pos *getSpawnPos();
    virtual int getSpawnYPosition();
};
```

### `PurpleDimension.cpp`

The includes match `HellDimension.cpp`/`TheEndDimension.cpp` exactly — note the
color table lives in `Minecraft.Client`:

```cpp
// PurpleDimension.cpp
#include "stdafx.h"
#include "PurpleDimension.h"
#include "FixedBiomeSource.h"
#include "PurpleLevelSource.h"
#include "net.minecraft.world.level.levelgen.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.level.tile.h"
#include "../Minecraft.Client/Minecraft.h"
#include "../Minecraft.Client/Common/Colours/ColourTable.h"

void PurpleDimension::init()
{
    // One fixed biome for the whole dimension, like the Nether/End do.
    // Biome::sky (the End biome) is a safe, flat choice; swap for any Biome*.
    biomeSource = new FixedBiomeSource(Biome::sky, 0.5f, 0);
    hasCeiling  = false;   // no bedrock roof
    ultraWarm   = false;   // water does NOT evaporate
    id          = 1;       // Approach A: reuse the End slot. Approach B: set to 2.
}

ChunkSource *PurpleDimension::createRandomLevelSource() const
{
    return new PurpleLevelSource(level, level->getSeed());
}

// --- Sky / fog / light ------------------------------------------------------

// A constant purple, dimmed like TheEndDimension::getFogColor does.
Vec3 *PurpleDimension::getFogColor(float td, float a) const
{
    // 0x6A0DAD is a deep purple. Substitute a ColourTable entry if you prefer
    // driving it from the palette like Hell/End do.
    unsigned int fog = 0x6A0DAD;
    float r = ((fog >> 16) & 0xff) / 255.0f;
    float g = ((fog >>  8) & 0xff) / 255.0f;
    float b = ((fog      ) & 0xff) / 255.0f;
    // Dim it so it reads as an eerie underlit haze (End does *0.15f).
    r *= 0.20f; g *= 0.10f; b *= 0.25f;
    return Vec3::newTemp(r, g, b);
}

// No sunrise band — like the End.
float *PurpleDimension::getSunriseColor(float td, float a)
{
    return nullptr;
}

// Freeze the sun at a fixed low angle — TheEndDimension returns 0.0f.
float PurpleDimension::getTimeOfDay(int64_t time, float a) const
{
    return 0.5f;   // perpetual dusk-ish; 0.0f = the End's flat lighting
}

// A dim ambient floor so caves aren't pitch black — Hell uses 0.10f.
void PurpleDimension::updateLightRamp()
{
    float ambientLight = 0.15f;
    for (int i = 0; i <= Level::MAX_BRIGHTNESS; i++)
    {
        float v = (1 - i / static_cast<float>(Level::MAX_BRIGHTNESS));
        brightnessRamp[i] = ((1 - v) / (v * 3 + 1)) * (1 - ambientLight) + ambientLight;
    }
}

// --- World rules ------------------------------------------------------------

bool PurpleDimension::isNaturalDimension() { return false; } // no natural compass/clock behaviour
bool PurpleDimension::mayRespawn() const   { return false; } // like the End — die here, go home
bool PurpleDimension::isFoggyAt(int x, int z) { return true; } // thick fog everywhere

Pos *PurpleDimension::getSpawnPos()      { return new Pos(0, 60, 0); }
int  PurpleDimension::getSpawnYPosition(){ return 60; }
```

### What each hook does (verified against the base + Nether/End)

| Hook | Effect | Modeled on |
|------|--------|-----------|
| `init()` | sets `biomeSource`, `hasCeiling`, `ultraWarm`, `id` | `HellDimension.cpp:11`, `TheEndDimension.cpp:10` |
| `getFogColor` | the horizon/underwater-less haze color | `TheEndDimension.cpp:32`, `HellDimension.cpp:19` |
| `getSunriseColor` | dawn/dusk band; `nullptr` = none | `TheEndDimension.cpp:27` |
| `getTimeOfDay` | sun angle; constant = frozen sky | `TheEndDimension.cpp:22` |
| `updateLightRamp` | per-light-level brightness curve (ambient floor) | `HellDimension.cpp:32` |
| `mayRespawn` | can you set spawn / respawn here | `TheEndDimension.cpp:54` |
| `isFoggyAt` | dense fog rendering | `TheEndDimension.cpp:83` |
| `getSpawnPos` / `getSpawnYPosition` | arrival point | `TheEndDimension.cpp:78`, `:88` |

> **Sky color note.** The overworld's *sky* tint comes from the **biome**
> (`Biome::getSkyColor` / `m_skyColor`, `Biome.h:181`/`:217`), not the dimension —
> that's why `init()` pins a single biome. To change the sky blue-ness, set that
> biome's sky color, or point `biomeSource` at a biome whose `m_skyColor` you like.
> The dimension owns **fog**; the biome owns **sky**.

## Step 2 — the chunk source

Every `Dimension` returns a `ChunkSource` from `createRandomLevelSource()`. The
`ChunkSource` interface is large (`ChunkSource.h:51`) — a real terrain generator
(`RandomLevelSource`, `TheEndLevelRandomLevelSource`) is hundreds of lines. You
have three options:

**Option 1 — reuse an existing generator (recommended to start).** Return a
`FlatLevelSource` for a clean flat world you can actually stand on:

```cpp
ChunkSource *PurpleDimension::createRandomLevelSource() const
{
    return new FlatLevelSource(level, level->getSeed(),
                               level->getLevelData()->isGenerateMapFeatures());
}
```

That is exactly the shape `Dimension::createFlatLevelSource()` uses
(`Dimension.cpp:97`). Include `net.minecraft.world.level.levelgen.flat.h`.

**Option 2 — subclass an existing generator** and override only the surface pass.
`TheEndLevelRandomLevelSource.h` is the smallest full generator to copy; you
mainly change `buildSurfaces()`/`prepareHeights()` to place your blocks.

**Option 3 — write `PurpleLevelSource` from scratch** implementing all of
`ChunkSource`'s pure virtuals (`hasChunk`, `getChunk`, `create`, `postProcess`,
`save`, `tick`, `shouldSave`, `gatherStats`, `getMobsAt`, `findNearestMapFeature`,
`recreateLogicStructuresForChunk`). Only do this once Option 1 works — copy
`TheEndLevelRandomLevelSource.cpp` as your skeleton.

For the rest of this recipe we assume **Option 1** (flat) so you can get in-world
fast; if you skip `PurpleLevelSource.*`, drop it from the file lists.

## Step 3 — register in `Dimension::getNew`

**Approach A (reskin the End):** replace the End case.

```cpp
// Dimension.cpp:194
Dimension *Dimension::getNew(int id)
{
    if (id == -1) return new HellDimension();
    if (id ==  0) return new NormalDimension();
    if (id ==  1) return new PurpleDimension();   // was: new TheEndDimension();
    return nullptr;
}
```

**Approach B (new id 2):** add a case (and keep the End):

```cpp
    if (id ==  1) return new TheEndDimension();
    if (id ==  2) return new PurpleDimension();   // <-- new id
```

## Step 4 — the entry portal tile

The cleanest portal to copy is the **End portal** (`TheEndPortal.cpp`), because it
triggers travel immediately from `entityInside` — no multi-tick frame search:

```cpp
// TheEndPortal.cpp:65 — the entry trigger
void TheEndPortal::entityInside(Level *level, int x, int y, int z, shared_ptr<Entity> entity)
{
    if (entity->GetType() == eTYPE_EXPERIENCEORB) return;
    if (entity->riding == nullptr && entity->rider.lock() == nullptr)
    {
        if (!level->isClientSide)
        {
            ...
            entity->changeDimension(1);   // <-- go to dimension 1
        }
    }
}
```

(The Nether portal, `PortalTile.cpp:228`, instead calls `handleInsidePortal()` and
lets `PortalForcer` build a matching frame after a delay — more faithful, more
code. Start with the End style.)

### `PurplePortalTile.h`

Model it on `TheEndPortal` (a `BaseEntityTile`) but trim the tile-entity bits if
you don't need portal particles from a `TileEntity`. Minimal version derived from
`HalfTransparentTile` (like the Nether `PortalTile`):

```cpp
// PurplePortalTile.h
#pragma once
#include "HalfTransparentTile.h"

class Random;

class PurplePortalTile : public HalfTransparentTile
{
public:
    PurplePortalTile(int id);
    virtual void entityInside(Level *level, int x, int y, int z, shared_ptr<Entity> entity);
    virtual bool isSolidRender(bool isServerLevel = false);
    virtual bool isCubeShaped();
    virtual int  getResourceCount(Random *random);   // drops nothing
    virtual void animateTick(Level *level, int xt, int yt, int zt, Random *random);
};
```

### `PurplePortalTile.cpp`

```cpp
// PurplePortalTile.cpp
#include "stdafx.h"
#include "PurplePortalTile.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.level.tile.h"
#include "net.minecraft.world.entity.h"

PurplePortalTile::PurplePortalTile(int id) : HalfTransparentTile(id, Material::portal, true)
{
    setLightEmission(0.75f);   // glows a little, like the Nether portal
}

bool PurplePortalTile::isSolidRender(bool isServerLevel) { return false; }
bool PurplePortalTile::isCubeShaped()                    { return false; }
int  PurplePortalTile::getResourceCount(Random *random)  { return 0; }

void PurplePortalTile::entityInside(Level *level, int x, int y, int z, shared_ptr<Entity> entity)
{
    if (entity->GetType() == eTYPE_EXPERIENCEORB) return;
    if (entity->riding == nullptr && entity->rider.lock() == nullptr)
    {
        if (!level->isClientSide)
        {
            // Approach A: destination id 1 (the reused End slot).
            // Approach B: destination id 2 (your new slot).
            entity->changeDimension(1);
        }
    }
}

void PurplePortalTile::animateTick(Level *level, int xt, int yt, int zt, Random *random)
{
    // Purple sparkle. eParticleType_netherportal is the closest existing type.
    for (int i = 0; i < 4; i++)
    {
        double px = xt + random->nextFloat();
        double py = yt + random->nextFloat();
        double pz = zt + random->nextFloat();
        level->addParticle(eParticleType_netherportal, px, py, pz, 0, 0, 0);
    }
}
```

`Material::portal` is the portal material used by both real portals
(`Tile.cpp:520` builds the End portal with `Material::portal`).

### Register the tile in `Tile::staticCtor`

Add a `Tile* purplePortal;` static and register it next to the other portals.
Pick a **free tile id** — check the [Block IDs reference](/slop-docs/reference/block-ids/)
for an unused slot (ids near the end portals 119/120 are taken; use a confirmed
gap). Registration mirrors `Tile.cpp:520`:

```cpp
// Tile.h — with the other portal statics (near Tile.h:583)
static Tile *purplePortal;

// Tile.cpp — in staticCtor(), near the end_portal line (Tile.cpp:520)
Tile::purplePortal = (new PurplePortalTile(/*FREE_ID*/))
    ->setDestroyTime(-1)                 // indestructible, like portal frames
    ->setSoundType(Tile::SOUND_GLASS)
    ->setLightEmission(0.75f)
    ->setIconName(L"portal")             // reuse an existing icon to start
    ->setDescriptionId(/*IDS_TILE_...*/);
```

Give it a description-id string (see [Textures & Assets](/slop-docs/modding/textures-assets/)
for adding a new `IDS_TILE_*` entry, or reuse an existing portal string to compile
first). Because ids are hardcoded, also add the matching `static const int
purplePortal_Id = FREE_ID;` line alongside the others in `Tile.h` if you want to
reference it by id elsewhere.

### Lighting the portal (how a player enters)

Give the player a way to *make* the portal. Two simple options:

1. **Craft-and-place block** that, on placement, fills a frame with `purplePortal`
   tiles — model the fill on `PortalTile::trySpawnPortal` (`PortalTile.cpp:104`).
2. **`/setblock`-style command / creative placement** of the portal tile directly
   while you iterate (fastest for testing). Any `purplePortal` tile a player walks
   into fires `changeDimension`.

For a first pass, place the portal tile directly and confirm travel works before
building a frame-lighting ritual.

## Step 5 — register files in the build

Add the new files to `cmake/sources/Common.cmake` next to their siblings — the
dimension near `HellDimension`/`TheEndDimension`, the level source near
`FlatLevelSource`, the tile in the tile block:

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/PurpleDimension.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/PurpleDimension.h"
  "${CMAKE_CURRENT_SOURCE_DIR}/PurpleLevelSource.cpp"   # omit if reusing FlatLevelSource
  "${CMAKE_CURRENT_SOURCE_DIR}/PurpleLevelSource.h"     # omit if reusing FlatLevelSource
  "${CMAKE_CURRENT_SOURCE_DIR}/PurplePortalTile.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/PurplePortalTile.h"
```

(`Dimension.cpp`, `Tile.cpp`, and `FlatLevelSource.cpp` are already listed.)

**Approach A stops here** — build and test.

## Step 6 — (Approach B only) grow the server's dimension table

A true new id needs the server to allocate a level for it. This crosses into
`Minecraft.Client`.

1. **`ServerLevel.h:180-186`** — the per-dimension statics are sized `[3]`. Bump
   every one to `[4]`:

   ```cpp
   static Level *m_level[4];             // was [3]
   static int   m_updateChunkX[4][LEVEL_CHUNKS_TO_UPDATE_MAX];
   // ...and each other [3] on those lines
   ```

2. **`MinecraftServer::getLevel` / `setLevel`** (`MinecraftServer.cpp:2559`/`:2567`) —
   add the id-2 → `levels[3]` mapping:

   ```cpp
   ServerLevel *MinecraftServer::getLevel(int dimension)
   {
       if (dimension == -1) return levels[1];
       else if (dimension == 1) return levels[2];
       else if (dimension == 2) return levels[3];   // <-- new
       else return levels[0];
   }
   ```

   (mirror the same case in `setLevel`).

3. **`MinecraftServer::loadLevel` loop** (`MinecraftServer.cpp:981`) — the loop over
   `levels.length` maps slot → dimension id (`i==1 -> -1`, `i==2 -> 1`). Add
   `if (i == 3) dimension = 2;` and make sure the `ServerLevelArray levels`
   (`MinecraftServer.h:90`) has room for the 4th slot.

4. **`Entity::changeDimension`** (`Entity.cpp:2074`) — the special-case
   `lastDimension == 1 && i == 1` block is End-specific; your id-2 travel needs no
   equivalent unless you want a fixed arrival tweak-spot. The generic path already
   repositions across dimensions (`Entity.cpp:2101`).

This is the invasive part. If any array or switch is missed, `getLevel(2)` returns
`levels[0]` (the overworld) and you'll silently travel to the wrong place — check
every `[3]`/id switch listed above.

## Step 7 — strings, textures, loc

- **Portal tile description** — add an `IDS_TILE_*` (and optional `IDS_DESC_*`)
  string for the portal, or reuse an existing portal string to compile first. See
  [Textures & Assets](/slop-docs/modding/textures-assets/).
- **Portal icon** — the sample reuses `L"portal"` (the Nether portal icon). Add a
  new icon only when you want a distinct look.
- **Fog/sky palette (optional)** — to drive fog from the palette like Hell/End do,
  add a `ColourTable` entry and read it in `getFogColor` via
  `Minecraft::GetInstance()->getColourTable()->getColor(...)` (see
  `HellDimension.cpp:20`). The inline hex `0x6A0DAD` above needs no new asset.

## Build + test checklist

1. **Compiles + links** — build `Minecraft.World` (and `Minecraft.Client` for
   Approach B). A missing file in `Common.cmake` shows as an unresolved symbol for
   `PurpleDimension::*` or `PurplePortalTile::*`.
2. **Dimension object mints** — put a breakpoint/log in `PurpleDimension::init()`.
   For Approach A it fires whenever the End loads; for Approach B when a level with
   id 2 is created.
3. **Enter the portal** — walk a player into a placed `purplePortal` tile.
   `entityInside` → `changeDimension` should fire server-side (it early-returns on
   `isClientSide`).
4. **Arrival** — you should land at `getSpawnPos()` (0, 60, 0) on flat terrain (if
   you used `FlatLevelSource`). Falling into the void means the chunk source didn't
   generate ground — recheck Step 2.
5. **Fog + light** — the sky/horizon should read purple and dim. If it looks like
   the overworld, your `getFogColor`/`updateLightRamp` overrides aren't being hit —
   confirm `getNew` returns `PurpleDimension` for the id you travelled to.
6. **Sky tint** — remember sky color is the **biome's** (`Biome::getSkyColor`); if
   the *sky* (not fog) is wrong, adjust the biome pinned in `init()`.
7. **Respawn** — with `mayRespawn() == false`, dying here should return the player
   to the overworld spawn, like the End.
8. **Approach B only** — verify `getLevel(2)` returns a *distinct* level, not the
   overworld. Travel there, place a block, go home, come back: the block persists
   and the overworld is unchanged.
9. **Multiplayer** — dimension logic runs server-side; travel and worldgen sync to
   clients through the normal chunk/entity packets. See
   [Multiplayer Packets](/slop-docs/modding/multiplayer-packets/) if you add a
   custom portal tile entity.

## Where to go deeper

- Concept walkthrough and the full override table:
  [Custom Dimensions](/slop-docs/modding/custom-dimensions/).
- What each dimension does today, side by side:
  [Dimensions reference](/slop-docs/world/dimensions/).
- Terrain generation internals for a real `PurpleLevelSource`:
  [World Generation reference](/slop-docs/world/worldgen/) and
  [Custom World Generation](/slop-docs/modding/custom-worldgen/).
- Portal rendering / particles: [Particles](/slop-docs/client/particles/).

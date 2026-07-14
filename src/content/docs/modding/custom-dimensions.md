---
title: Custom Dimensions
description: How dimensions, their ChunkSources, and portal linkage actually work in neoLegacy — a worked example of adding a Dimension subclass, modeled on HellDimension.
---

A dimension in neoLegacy is a `Dimension` subclass (`Dimension.h`) that owns a
`BiomeSource`, a `ChunkSource` factory, and the fog/light/portal behavior for one
world. There are exactly three today — overworld (`NormalDimension`, id 0),
Nether (`HellDimension`, id −1), End (`TheEndDimension`, id 1) — all created by
`Dimension::getNew(int id)` (`Dimension.cpp:194`).

This is the most invasive of the modding topics: dimensions are hardcoded by id
in several places, and cross-dimension travel runs through `Entity::changeDimension`
and `PortalForcer`. Read [Getting Started](/slop-docs/modding/getting-started/)
first and keep the [Dimensions reference](/slop-docs/world/dimensions/) open.

For the worked example we'll sketch a **Void dimension** (id 2): a flat,
low-light dimension modeled on `HellDimension` (the fullest override example),
reachable through a portal. We'll be explicit about which parts are copy-a-pattern
and which parts are "you must edit the hardcoded switch."

## The `Dimension` base

`Dimension` (`Dimension.h:12`) is a plain class (not registered by a
`staticCtor` — dimensions are constructed on demand). The members that matter:

| Member | Meaning | Source |
|--------|---------|--------|
| `id` | dimension id (0 / −1 / 1) | `Dimension.h:24` |
| `biomeSource` | biome provider, set in `init()` | `Dimension.h:20` |
| `ultraWarm` | water evaporates, Nether-style | `Dimension.h:21` |
| `hasCeiling` | bedrock roof | `Dimension.h:22` |
| `brightnessRamp` | per-light-level brightness curve | `Dimension.h:23` |
| `levelType` | world type (default/flat/…) | `Dimension.h:18` |

The overridable behavior (all `virtual`, `Dimension.h:26-64`):

| Virtual | Default | Nether override |
|---------|---------|-----------------|
| `init()` | picks `BiomeSource`/`FixedBiomeSource` by level type | `FixedBiomeSource(Biome::hell,…)`, `ultraWarm=true`, `hasCeiling=true`, `id=-1` |
| `createRandomLevelSource()` | `RandomLevelSource` (or flat) | `HellRandomLevelSource` |
| `updateLightRamp()` | ambient 0.0 | ambient 0.10 |
| `getFogColor()` | grey ramp | Nether fog colour |
| `isNaturalDimension()` | `true` | `false` |
| `isValidSpawn()` | must be grass | always `false` |
| `getTimeOfDay()` | day/night cycle | constant `0.5f` (no cycle) |
| `mayRespawn()` | `true` | `false` |
| `getXZSize()` | world size | world size ÷ hell scale |

`NormalDimension` (`NormalDimension.h`) is empty — it inherits every default. So
the amount you override is exactly the amount your dimension differs from the
overworld.

## Step 1 — the Dimension subclass

`HellDimension` (`HellDimension.h`/`.cpp`) is the template. Its `init()`
(`HellDimension.cpp:11-17`) is the canonical setup:

```cpp
// HellDimension.cpp:11
void HellDimension::init()
{
    biomeSource = new FixedBiomeSource(Biome::hell, 1, 0);   // single biome, no variety
    ultraWarm  = true;
    hasCeiling = true;
    id         = -1;
}
```

`FixedBiomeSource(biome, temp, downfall)` forces the whole dimension to one biome
— reuse it for any single-biome dimension. (The overworld uses the full
`BiomeSource(level)` instead, `Dimension.cpp:56`.)

Our Void dimension header, `Minecraft.World/VoidDimension.h`:

```cpp
// VoidDimension.h
#pragma once
#include "Dimension.h"

class VoidDimension : public Dimension
{
public:
    virtual void init();
    virtual ChunkSource *createRandomLevelSource() const;
    virtual Vec3 *getFogColor(float td, float a) const;
    virtual bool isNaturalDimension();
    virtual bool isValidSpawn(int x, int z) const;
    virtual bool mayRespawn() const;
protected:
    virtual void updateLightRamp();
};
```

`VoidDimension.cpp` init, following Hell:

```cpp
void VoidDimension::init()
{
    biomeSource = new FixedBiomeSource(Biome::theVoid, 0.5f, 0.5f);  // theVoid exists: Biome.h:72
    ultraWarm  = false;
    hasCeiling = false;
    id         = 2;
}

bool VoidDimension::isNaturalDimension() { return false; }
bool VoidDimension::mayRespawn()         { return false; }
bool VoidDimension::isValidSpawn(int x, int z) const { return true; }

void VoidDimension::updateLightRamp()   // dim ambient like Nether
{
    float ambientLight = 0.05f;
    for (int i = 0; i <= Level::MAX_BRIGHTNESS; i++)
    {
        float v = (1 - i / static_cast<float>(Level::MAX_BRIGHTNESS));
        brightnessRamp[i] = ((1 - v) / (v * 3 + 1)) * (1 - ambientLight) + ambientLight;
    }
}
```

`Biome::theVoid` is already declared (`Biome.h:72`); if your dimension needs a new
biome, add it first per [Adding Biomes](/slop-docs/modding/adding-biomes/).

## Step 2 — the ChunkSource for the dimension

`createRandomLevelSource()` is what actually generates terrain. Each dimension
returns its own `ChunkSource` subclass. Overworld returns `RandomLevelSource`
(`Dimension.cpp:93`); Hell returns `HellRandomLevelSource`
(`HellDimension.cpp:42-59`):

```cpp
// HellDimension.cpp:42
ChunkSource *HellDimension::createRandomLevelSource() const
{
    if (levelType == LevelType::lvl_flat)
        return new HellFlatLevelSource(level, level->getSeed());
    else
        return new HellRandomLevelSource(level, level->getSeed());
}
```

Your options, from most to least work:

1. **Reuse an existing source.** For a void/flat world, return
   `FlatLevelSource` (`Dimension::createFlatLevelSource`, `Dimension.cpp:97-100`):
   ```cpp
   ChunkSource *VoidDimension::createRandomLevelSource() const
   {
       return new FlatLevelSource(level, level->getSeed(),
                                  level->getLevelData()->isGenerateMapFeatures());
   }
   ```
2. **Write a new `ChunkSource`.** If your dimension needs bespoke terrain, add a
   subclass of `ChunkSource` (`ChunkSource.h`) — the existing ones
   (`RandomLevelSource`, `HellRandomLevelSource`, `TheEndLevelRandomLevelSource`,
   `FlatLevelSource`) are the templates. This is the same class family the
   [World Generation reference](/slop-docs/world/worldgen/) documents; a full new
   terrain generator is out of scope for this how-to.

The Void example uses option 1.

## Step 3 — register in `Dimension::getNew` (the hardcoded switch)

Dimensions are not a registry — they're a hardcoded `if`-ladder
(`Dimension.cpp:194-201`):

```cpp
Dimension *Dimension::getNew(int id)
{
    if (id == -1) return new HellDimension();
    if (id ==  0) return new NormalDimension();
    if (id ==  1) return new TheEndDimension();
    return nullptr;
}
```

**Add your dimension here:**

```cpp
    if (id ==  2) return new VoidDimension();
```

This is the single required registration point — but note **id is load-bearing
elsewhere too** (see Step 5). A `Level` gets its dimension via `getNew` during
setup; the fallback path constructs `Dimension::getNew(0)` (`Level.cpp:695`) when
no fixed dimension is set.

## Step 4 — how dimension switching actually works

Travel between dimensions is `Entity::changeDimension(int i)`
(`Entity.cpp:2065-2119`). The flow:

1. Portal contact triggers `handleInsidePortal` (`PortalTile.cpp:232`); after a
   wait, the entity computes a **target dimension** and calls `changeDimension`
   (`Entity.cpp:562-575`). Today that logic is a binary toggle
   (`Entity.cpp:566`):
   ```cpp
   if (level->dimension->id == -1) targetDimension = 0;   // Nether -> Overworld
   else                            targetDimension = -1;  // Overworld -> Nether
   ```
   A third destination means editing this branch to choose your id.
2. `changeDimension` grabs the source and destination `ServerLevel`s
   (`Entity.cpp:2071-2072`), enforces travel restrictions (falling blocks
   destroyed, entity limits, `canCreateMore`, `:2082-2092`), sets
   `dimension = newLevel->dimension->id` (`:2096`), removes the entity from the
   old level, then **repositions across the dimension boundary**
   (`server->getPlayers()->repositionAcrossDimension(...)`, `:2101`) and rebuilds
   the entity in the new level (`:2102-2116`).
3. `repositionAcrossDimension` (server-players layer) is where `PortalForcer`
   gets invoked to place/find the destination portal.

:::caution[The portal toggle is binary today]
`Entity.cpp:566` only distinguishes "in Nether" vs "not". To route a portal to
id 2 you must extend that branch (e.g. key off the portal *block* type or the
frame material) and make sure `server->getLevel(2)` returns a live `ServerLevel`
for the new dimension. This is the hardest part of a custom dimension.
:::

## Step 5 — portal wiring and linkage persistence

`PortalForcer` (`PortalForcer.h`/`.cpp`, one per `ServerLevel`) owns portal
placement, search, and the cached linkage between paired portals. Its public API
(`PortalForcer.h:22-29`):

```cpp
void force(shared_ptr<Entity> e, double x, double y, double z, float yRot);   // land the entity at/near a portal, building one if needed
bool findPortal(shared_ptr<Entity> e, ...);                                   // locate an existing portal
bool createPortal(shared_ptr<Entity> e);                                      // carve a new portal frame
void tick(int64_t time);                                                      // expire stale cache entries
```

`force` (`PortalForcer.cpp:28`+) carves an obsidian frame when
`level->dimension->id == 1` special-cases the End, otherwise searches for an
existing portal via `findPortal` and only builds one if none is found. The cache
is `unordered_map<int64_t, PortalPosition*> cachedPortals` keyed by chunk
(`PortalForcer.h:19`).

**The linkage-persistence fix** (commit
[`b47c16b6`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/commit/b47c16b6),
"fix: persisting portal linkages") is essential context for anyone touching this.
Before it, `findPortal` trusted a cached `PortalPosition` blindly. The fix
(`PortalForcer.cpp` `findPortal`) **validates the cache against the world** —
if the cached coordinate no longer holds a portal block, it's evicted and a fresh
local search runs:

```cpp
// b47c16b6 — validate cache before trusting it
if (level->getTile(pos->x, pos->y, pos->z) == Tile::portal_Id) {
    xTarget = pos->x; yTarget = pos->y; zTarget = pos->z;
    updateCache = false;                       // cache is still valid
} else {
    delete pos;                                // stale — evict from map + key list
    cachedPortals.erase(it);
    /* remove hash from cachedPortalKeys */
}

if (updateCache) {
    // 16-block local re-scan for the nearest Tile::portal_Id, walking down to the base
    ...
}
```

The takeaway for a custom dimension: **your portal blocks must be
`Tile::portal_Id` (or you must generalize this check)**, and any portal you place
must be discoverable by `findPortal`'s scan, or entities will keep building fresh
portals every trip. Reusing the existing Nether-portal block for your dimension
is the low-friction path; a distinct portal block means teaching `PortalForcer`
and the `Entity.cpp:566` toggle about it.

## Step 6 — add the source file to the build

Add `VoidDimension.cpp` (and any new `ChunkSource`/`Biome` `.cpp`) to
`Minecraft.World/cmake/sources/Common.cmake`. Headers aren't listed; `.cpp`s are.

## What this does not cover (client side)

Fog/sky/cloud rendering pulls colours from the client `ColourTable`
(`Dimension::getFogColor` reads `eMinecraftColour_Default_Fog_Colour`,
`Dimension.cpp:177`; Hell reads `eMinecraftColour_Nether_Fog_Colour`,
`HellDimension.cpp:21`). A visually distinct dimension needs matching client
colour-table entries — the same client-side work biomes need
([Adding Biomes → Localization](/slop-docs/modding/adding-biomes/#localization)).
The world-logic side is what's documented here.

## Testing checklist

- [ ] `VoidDimension.cpp` is in `Minecraft.World/cmake/sources/Common.cmake`; builds clean.
- [ ] `Dimension::getNew(2)` returns a `VoidDimension` (breakpoint or unit-poke).
- [ ] `init()` sets a non-null `biomeSource`, the correct `id`, and `ultraWarm`/`hasCeiling`.
- [ ] `createRandomLevelSource()` returns a working source (flat world generates without crash).
- [ ] `server->getLevel(2)` yields a live `ServerLevel` for the dimension (else `changeDimension` no-ops).
- [ ] Portal blocks are `Tile::portal_Id` (or `PortalForcer` was generalized) so `findPortal` can locate them.
- [ ] `Entity.cpp:566` routes the portal to id 2 for the intended trigger (else it stays a Nether toggle).
- [ ] Travel in and out: entity arrives in the dimension, and a **return trip lands at the same portal** (validates the `b47c16b6` linkage path).
- [ ] Force a stale link (break the destination portal, travel again) — a new portal is built rather than the game teleporting into a hole.
- [ ] Save and reload while an entity is in the dimension — `Dimension` field on the entity (`Dimension` tag, `Entity.cpp:1444`/`:1496`) round-trips.
- [ ] Light level looks right (`updateLightRamp` ambient); `isValidSpawn`/`mayRespawn` behave.

## Could not verify

- `repositionAcrossDimension` and `server->getLevel(id)` live in the
  `Minecraft.Client`/server-players layer, not `Minecraft.World`; this page cites
  their call sites in `Entity::changeDimension` but not their bodies (out of the
  assigned module).
- The portal-block/frame-material discrimination needed to route a *third*
  destination is described as required work; neoLegacy today only ships the
  binary Nether/Overworld toggle (`Entity.cpp:566`) plus End-specific handling,
  so there is no existing multi-target example to copy verbatim.

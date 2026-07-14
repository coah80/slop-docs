---
title: Dimensions
description: The Dimension base class and its three worlds (Overworld, Nether, End), how a dimension picks its ChunkSource and biome source, LevelType world types, and the portal-linkage persistence fix.
---

A **Dimension** is a world's environment layer: it chooses the `ChunkSource` used
to generate terrain, the `BiomeSource`, and all the atmospheric behaviour — fog
color, light ramp, cloud height, sky/sun rendering, respawn rules, and whether
portals work. neoLegacy ports the Java LCE `Dimension` (formerly
`WorldProvider`), so the class name and the three built-in dimensions match.

Files: `Dimension.h`, `Dimension.cpp`, `NormalDimension.h`, `HellDimension.h/.cpp`,
`TheEndDimension.h/.cpp`, plus `LevelType.h/.cpp`, `PortalForcer.h/.cpp`,
`PortalTile.*`, `HellPortalFeature.*`, `TheEndPortal.*`.

## Base class

`class Dimension` (`Dimension.h:12`) holds the shared world state and the virtuals
each dimension overrides:

| Field | Meaning |
|-------|---------|
| `id` | dimension id: `-1` Nether, `0` Overworld, `1` End |
| `level` | the owning `Level` |
| `levelType` | the `LevelType` (default / flat / largeBiomes / customized) |
| `biomeSource` | how biomes are looked up |
| `ultraWarm` | water evaporates, ice never forms (Nether) |
| `hasCeiling` | solid bedrock roof (Nether/End) |
| `brightnessRamp` | per-light-level brightness curve |

Key virtuals (all overridable, `Dimension.h:26`+):

| Virtual | Base behaviour |
|---------|----------------|
| `createRandomLevelSource()` | pick the terrain `ChunkSource` |
| `createFlatLevelSource()` | superflat source |
| `createStorage(dir)` | chunk-storage backend (`OldChunkStorage`) |
| `init(level)` / `init()` | build the biome source |
| `updateLightRamp()` | fill `brightnessRamp` |
| `getFogColor` / `getSunriseColor` / `getTimeOfDay` | sky rendering |
| `isValidSpawn(x, z)` | can the player spawn here |
| `mayRespawn()` | does a bed / normal respawn work |
| `isNaturalDimension()` | affects beds, compasses, etc. |
| `getSpawnPos()` / `getSpawnYPosition()` | fixed spawn (used by the End) |
| `getXZSize()` | 4J: the finite world extent |

`Dimension::getNew(int id)` (`Dimension.cpp:194`) is the factory:

```cpp
Dimension *Dimension::getNew(int id)
{
    if (id == -1) return new HellDimension();
    if (id ==  0) return new NormalDimension();
    if (id ==  1) return new TheEndDimension();
    return nullptr;
}
```

## The three dimensions

### NormalDimension (Overworld, id 0)

`class NormalDimension : public Dimension` (`NormalDimension.h:4`) is an **empty
subclass** — it inherits every default from `Dimension`. That means:

- `createRandomLevelSource()` (base, `Dimension.cpp:77`) returns a
  `FlatLevelSource` for `LevelType::lvl_flat`, otherwise a `RandomLevelSource`.
- `Dimension::init()` (`Dimension.cpp:38`) builds a full **`BiomeSource`** (the
  GenLayer chain) — unless the world is flat, in which case it uses a
  `FixedBiomeSource` seeded from the flat generator's biome.
- `isValidSpawn` requires the top block to be grass (`Dimension.cpp:107`).

See [World Generation](/slop-docs/world/worldgen/) for what `RandomLevelSource` and
`BiomeSource` do.

### HellDimension (Nether, id -1)

`HellDimension::init()` (`HellDimension.cpp:11`):

```cpp
biomeSource = new FixedBiomeSource(Biome::hell, 1, 0);
ultraWarm = true;
hasCeiling = true;
id = -1;
```

- **Biome:** a single `FixedBiomeSource(Biome::hell)` — no GenLayer chain.
- **Terrain:** `createRandomLevelSource()` (`HellDimension.cpp:42`) returns a
  `HellRandomLevelSource` (or `HellFlatLevelSource` for flat / the debug
  superflat-Nether toggle).
- **Light ramp** (`HellDimension.cpp:33`) uses an ambient floor of `0.10` so the
  Nether never goes fully dark.
- `isNaturalDimension()` → `false`; `isValidSpawn` → `false` (you can't set world
  spawn in the Nether).
- Fog color is pulled from the engine color table
  (`eMinecraftColour_Nether_Fog_Colour`).

The Nether is spatially **compressed** relative to the Overworld — the scale
constants live in `ChunkSource.h` (`HELL_LEVEL_SCALE_*`, 3–8 depending on world
size; the comment notes Java's scale of 8 "would make our nether tiny").

### TheEndDimension (End, id 1)

`TheEndDimension::init()` (`TheEndDimension.cpp:10`):

```cpp
biomeSource = new FixedBiomeSource(Biome::sky, 0.5f, 0);
id = 1;
hasCeiling = true;
```

- **Biome:** `FixedBiomeSource(Biome::sky)`.
- **Terrain:** `createRandomLevelSource()` returns a
  `TheEndLevelRandomLevelSource` (`TheEndDimension.cpp:17`).
- **No day/night:** `getTimeOfDay()` is fixed at `0.0`, `getSunriseColor()` returns
  `nullptr`, fog is the dim End purple (`eMinecraftColour_End_Fog_Colour`).
- `hasGround()` → `false`, `mayRespawn()` → `false`, `isNaturalDimension()` →
  `false`, `isFoggyAt()` → `true` everywhere.
- **Fixed spawn:** `getSpawnPos()` → `(100, 50, 0)`, `getSpawnYPosition()` → `50`
  (the obsidian platform you arrive on).

> Note: an orphan `SkyIslandDimension.cpp` exists in the module (with its own
> `SkyIslandRandomLevelSource`) but has no header in the tree and is **not** wired
> into `Dimension::getNew`, so it is unreachable in the current build.

## LevelType — world types

`class LevelType` (`LevelType.h`) is the world-generation *type* selected at world
creation, orthogonal to the dimension. `LevelType::staticCtor()`
(`LevelType.cpp`) registers them into `levelTypes[16]`:

| `LevelType::` | id | Name string | Notes |
|---------------|----|-------------|-------|
| `lvl_normal` | 0 | `default` | standard terrain; `setHasReplacement()` |
| `lvl_flat` | 1 | `flat` | superflat |
| `lvl_largeBiomes` | 2 | `largeBiomes` | wider biomes (zoom level 6) |
| `lvl_customized` | 4 | `customized` | reads a `CustomizableSourceSettings` string |
| `lvl_normal_1_1` | 8 | `default_1_1` | legacy generator; `setSelectableByUser(false)` |

A dimension reads its `LevelType` from the level data in `Dimension::init(level)`
(`Dimension.cpp:19`) and branches on it in `createRandomLevelSource()` and when
building the biome source. `lvl_largeBiomes` and `lvl_customized` change the
`zoomLevel` inside the GenLayer stack (see
[World Generation](/slop-docs/world/worldgen/)).

## Portals

### PortalForcer — teleport + linkage

`class PortalForcer` (`PortalForcer.h:5`) handles moving an entity between
dimensions and finding/creating the destination portal. It caches recently-used
portals in `cachedPortals` (an `unordered_map<int64_t, PortalPosition*>`) keyed by
**chunk coordinates** — `ChunkPos::hashCode(xc >> 4, zc >> 4)`
(`PortalForcer.cpp:96`). Cached entries expire after 30 seconds of disuse, swept
every 5 seconds in `tick()` (`PortalForcer.cpp`, using
`SharedConstants::TICKS_PER_SECOND`).

`force()` (`PortalForcer.cpp`) is the entry point:

- **Entering the End** (`dimension->id == 1`): it *builds* the obsidian arrival
  platform under the entity and drops them on it (no portal search).
- **Otherwise:** `findPortal()` → if none, `createPortal()` then `findPortal()`
  again. In the Nether the search radius is tripled to compensate for the
  compressed world (`PortalForcer.cpp`, comment "Decrease the range … given our
  smaller nether").

### The portal-linkage persistence fix (b47c16b6)

Commit **`b47c16b6`** ("fix: persisting portal linkages") fixed a bug where a
cached portal linkage could point at a portal that no longer exists — for example
after the destination portal was mined or the frame changed — leaving the player
teleporting into empty air or to a stale location.

Before the fix, `findPortal` trusted any cached `PortalPosition` blindly. After,
it **validates the cache against live blocks** (`PortalForcer.cpp:101`+):

```cpp
if (level->getTile(pos->x, pos->y, pos->z) == Tile::portal_Id)
{
    // cache still valid — use it
    ...
}
else
{
    // stale: delete the entry and its key, then re-search
    delete pos;
    cachedPortals.erase(it);
    ...
}
```

If the cache is stale (or missing), it runs a **local 16-block-radius rescan**
around the entity for a real portal block before falling back to the full-radius
search. It also walks down to the *bottom* portal block of a column so the linkage
anchors consistently. The net effect: portal links survive save/load and terrain
edits, and a broken/moved destination portal is re-resolved instead of silently
mis-linking. This builds on the earlier `0631aefe` fix ("Fix portal cache key to
use chunk coordinates"), which corrected the cache key so lookups actually hit.

### Worked trace: standing in a Nether portal → arriving in the Nether

This follows one player from stepping into the purple portal blocks to landing in
the Nether, with the coordinate mapping made explicit.

**1 — Contact (`handleInsidePortal`).** While the player's AABB overlaps a portal
block, `PortalTile` runs `entity->handleInsidePortal()` (`PortalTile.cpp:232`, guarded
so passengers/riders don't trigger). `Entity::handleInsidePortal` (`Entity.cpp:1761`)
records the entry direction and sets `isInsidePortal = true` (`:1776`).

**2 — Dwell counter (`Entity::tick`).** Each server tick, the portal block in
`Entity::tick` (`Entity.cpp:553`) checks `isInsidePortal`. If the Nether is enabled
and the entity isn't riding, `portalTime++` counts up; once it reaches
`getPortalWaitTime()` (`:559`) it clamps, sets `changingDimensionDelay`, computes the
target (`level->dimension->id == -1 ? 0 : -1`, `:566-573`), and calls
`changeDimension(targetDimension)` (`:575`). If the entity steps out first,
`portalTime` bleeds off at `-4/tick` (`:583`).

**3 — Switch levels (`changeDimension`).** `Entity::changeDimension(i)`
(`Entity.cpp:2065`) is server-only (`:2067`). It resolves `oldLevel`/`newLevel` from
`MinecraftServer::getLevel` (`:2071-2072`), applies the 4J transit filters (falling
tiles are destroyed `:2082`, entity/creature caps are checked `:2089-2092`), sets
`dimension = newLevel->dimension->id` (`:2096`), removes the entity from the old level
(`:2098`), then hands off to
`server->getPlayers()->repositionAcrossDimension(entity, lastDimension, oldLevel, newLevel)`
(`:2101`). A fresh entity copy is built via `EntityIO::newEntity` + `restoreFrom`
(`:2102-2106`) and added to the new level (`:2116`).

**4 — Coordinate mapping (`repositionAcrossDimension`).** `PlayerList::repositionAcrossDimension`
(`PlayerList.cpp:1081`) does the Overworld↔Nether scale. Reading `hellScale` from the
level data (`:1089`), going **Overworld→Nether** (`dimension == 0`) it multiplies
`xt *= scale; zt *= scale` (`:1102-1103`); the reverse divides (`:1092-1093`). This is
the LCE compression — the same `HELL_LEVEL_SCALE_*` constants from `ChunkSource.h`.
Coordinates are clamped to the finite world (`:1143-1144`).

**5 — Find/create the destination portal.** For non-End exits it flips
`newLevel->cache->autoCreate = true` and calls
`newLevel->getPortalForcer()->force(entity, xOriginal, yOriginal, zOriginal, yRotOriginal)`
(`PlayerList.cpp:1154`). `PortalForcer::force` (`PortalForcer.cpp:28`) tries
`findPortal(...)` (validating the cache against live `Tile::portal_Id`, the `b47c16b6`
fix); on miss it `createPortal(...)` then `findPortal` again (`:63-68`), dropping the
player in front of the frame. **Entering the End** short-circuits this — `force`
*builds* an obsidian arrival platform under the entity and returns (`:30-59`), which
is why step 5 is gated on `lastDimension != 1` (`PlayerList.cpp:1151`).

The whole flow is server-authoritative; the client's `LocalPlayer::changeDimension`
(`LocalPlayer.cpp:577`) only handles the local view swap.

## neoLegacy delta vs vanilla TU19

- **Portal linkage now persists** and self-heals against stale/moved portals
  (`b47c16b6`), on top of the corrected chunk-coordinate cache key (`0631aefe`).
- The Overworld biome source is the rebuilt **Java-parity GenLayer chain** (see
  [World Generation](/slop-docs/world/worldgen/)); Nether/End remain single
  `FixedBiomeSource`.
- `lvl_customized` world type reads a settings string that tunes biome/river size
  in the layer stack.

## Related pages

- [World Generation](/slop-docs/world/worldgen/) — ChunkSources and the GenLayer stack each dimension selects
- [Biomes](/slop-docs/world/biomes/) — `Biome::hell` and `Biome::sky` used by the fixed sources
- [Blocks / Tiles](/slop-docs/world/blocks/) — the portal, obsidian and end-portal-frame tiles

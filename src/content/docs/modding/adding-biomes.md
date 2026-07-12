---
title: Adding Biomes
description: A full worked example — add a new Biome subclass to neoLegacy end to end, modeled on how MesaBiome (commit 720e1a77) is actually registered today.
---

This walks the complete process of adding a biome, using the real neoLegacy
mesa backport as the template. **`MesaBiome`** (`MesaBiome.h`/`MesaBiome.cpp`,
added in commit
[`720e1a77`](https://git.neolegacy.dev/coah80/neoLegacy/commit/720e1a77)) is the
richest concrete example in the tree: it subclasses `Biome`, overrides the
surface builder and decorator, registers six ids in `Biome::staticCtor`, and gets
wired into the biome-selection `GenLayer` pipeline. Every step below cites what
mesa actually does so you can copy the pattern.

Read [Getting Started](/slop-docs/modding/getting-started/) first for the
`staticCtor` idiom, and keep the [Biomes reference](/slop-docs/world/biomes/) and
[World Generation reference](/slop-docs/world/worldgen/) open — this page is the
how-to companion to both.

For the worked example we'll add an **Ashland** biome: a hot, treeless basalt
flat, deliberately simple so the mechanics show through without the 300-line
banded surface builder mesa needs.

## Overview — what a biome touches

A biome in neoLegacy is not a single file. Adding one means editing, in order:

| # | File | What you add |
|---|------|--------------|
| 1 | `AshlandBiome.h` / `.cpp` | the `Biome` subclass |
| 2 | `Biome.h` | a `static Biome *ashland;` pointer |
| 3 | `Biome.cpp` | the `new AshlandBiome(...)` registration in `staticCtor` |
| 4 | `BiomeInitLayer.cpp` | slot it into the biome-selection layer |
| 5 | colour table (client) | grass / foliage / water / sky colours |
| 6 | `cmake/sources/Common.cmake` | add the new `.cpp` to the build |

Mesa touched every one of these in `720e1a77`; the commit is the reference diff.

## Step 0 — pick a biome id

Biome ids live in one array, `Biome *biomes[257]` (`Biome.h:30`), indexed 0–256.
The vanilla LCE ids are contiguous; mesa took **37/38/39** for the base variants
and **165/166/167** for the mutated ("Bryce"/M) variants (`Biome.cpp:129-131`,
`:152-154`). Pick a free slot — grep `Biome.cpp` for the highest `new XxxBiome(n)`.
For this example assume **44** is free.

:::note[Ids are permanent]
A saved chunk stores the biome id per column. Once a world ships, do not renumber
a biome id — old saves will read the wrong biome. If you're backporting a real
TU biome, use the id it used upstream.
:::

## Step 1 — the Biome subclass header

Create `Minecraft.World/AshlandBiome.h`. `MesaBiome.h` is the template — note
which virtuals it overrides (`MesaBiome.h:39-45`):

```cpp
// MesaBiome.h — the template
class MesaBiome : public Biome
{
public:
    MesaBiome(int id, bool isMesaPlateau, bool hasTrees);
    virtual void      decorate(Level* level, Random* random, int xo, int zo) override;
    virtual Feature*  getTreeFeature(Random* random) override;
    virtual void      buildSurfaceAtDefault(Level* level, Random* random,
                                            byte* chunkBlocks, byte* chunkData,
                                            int x, int z, double noiseVal) override;
    virtual int       getFolageColor() const override;   // [sic] spelling in source
    virtual int       getGrassColor()  const override;
};
```

The base `Biome` (`Biome.h:24`) declares every virtual you might override —
`decorate` (`:199`), the three `buildSurfaceAtDefault` overloads (`:201-206`),
`getTreeFeature`/`getGrassFeature`/`getFlowerFeature` (`:166-167`, `:228`),
`getGrassColor`/`getFolageColor` (`:227`/`:220`), and the fluent setters
`setColor` (`:175`), `setName` (`:171`), `setTemperatureAndDownfall` (`:152`),
`setDepthAndScale` (`:153`), `setLeafFoliageWaterSkyColor` (`:177`), `setNoRain`
(`:163`).

Ashland only needs a constructor and a couple of colour overrides:

```cpp
// AshlandBiome.h
#pragma once
#include "Biome.h"

class Level;
class Random;

class AshlandBiome : public Biome
{
public:
    AshlandBiome(int id);
    virtual int getFolageColor() const override;
    virtual int getGrassColor()  const override;
};
```

## Step 2 — the constructor: materials, climate, spawn lists, decorator

The constructor is where a biome configures itself. `MesaBiome::MesaBiome`
(`MesaBiome.cpp:21-48`) shows the shape:

```cpp
// MesaBiome.cpp:21
MesaBiome::MesaBiome(int id, bool mesaPlateau, bool hasTrees) : Biome(id)
{
    this->setNoRain();
    this->setTemperatureAndDownfall(2.0f, 0.0f);

    this->topMaterial     = static_cast<byte>(Tile::sand_Id);
    this->topMaterialData = static_cast<byte>(SandTile::RED_SAND);
    this->material        = static_cast<byte>(Tile::stained_hardened_clay_Id);
    this->materialData    = static_cast<byte>(orangeColoredClayState);

    if (decorator)
    {
        decorator->treeCount     = hasTrees ? 5 : -999;
        decorator->deadBushCount = 20;
        decorator->reedsCount    = 3;
        decorator->cactusCount   = 5;
        decorator->flowerCount   = 0;
    }
}
```

Key fields (all declared on the base, `Biome.h:101-159`):

| Field | Meaning | Mesa value |
|-------|---------|-----------|
| `topMaterial` / `topMaterialData` | the surface block laid over the biome | red sand |
| `material` / `materialData` | the "filler" block below the surface | orange stained clay |
| `temperature` / `downfall` | set via `setTemperatureAndDownfall` | `2.0f, 0.0f` (hot, dry) |
| `_hasRain` | cleared by `setNoRain()` | false |
| `decorator` | the `BiomeDecorator` created by the base ctor | tuned counts |

The base `Biome(int id)` constructor calls `createDecorator()` (`Biome.h:149`),
so `decorator` is non-null by the time your subclass body runs — that's why mesa
guards with `if (decorator)`. See [Step 3](#step-3--wire-up-the-decorator) for
the decorator's feature counts.

Spawn lists are the `vector<MobSpawnerData*>` members `enemies`, `friendlies`,
`waterFriendlies`, etc. (`Biome.h:138-144`). To add a mob, push a
`Biome::MobSpawnerData(mobClass, weight, minCount, maxCount)` (`Biome.h:121-135`).
The ocean monument does exactly this for guardians
(`OceanMonumentFeature.cpp:14`):

```cpp
monumentEnemies.push_back(new Biome::MobSpawnerData(eTYPE_GUARDIAN, 1, 2, 4));
```

Our Ashland constructor:

```cpp
// AshlandBiome.cpp
#include "stdafx.h"
#include "AshlandBiome.h"
#include "BiomeDecorator.h"
#include "net.minecraft.world.level.tile.h"

AshlandBiome::AshlandBiome(int id) : Biome(id)
{
    setNoRain();
    setTemperatureAndDownfall(2.0f, 0.0f);

    topMaterial     = static_cast<byte>(Tile::stone_Id);     // basalt stand-in
    topMaterialData = 0;
    material        = static_cast<byte>(Tile::stone_Id);
    materialData    = 0;

    if (decorator)
    {
        decorator->treeCount   = -999;   // no trees
        decorator->flowerCount = 0;
        decorator->grassCount  = 0;
    }
}

int AshlandBiome::getFolageColor() const { return 0x6A6A5A; }
int AshlandBiome::getGrassColor()  const { return 0x6A6A5A; }
```

`treeCount = -999` is the same "hard off" sentinel mesa uses when `hasTrees` is
false (`MesaBiome.cpp:42`).

## Step 3 — wire up the decorator

Feature placement is not done by the biome directly — it's driven by counts on
the shared `BiomeDecorator` (`BiomeDecorator.h`). The base
`BiomeDecorator::_init()` (`BiomeDecorator.cpp:45-101`) constructs every feature
object once (`ClayFeature`, `SandFeature`, all the `OreFeature`s,
`FlowerFeature`s, `ReedsFeature`, `CactusFeature`, `WaterlilyFeature`,
`DoublePlantFeature`, …) and sets default counts. `BiomeDecorator::decorate()`
(`:103-359`) then runs each feature `count` times per chunk.

So to change what generates in your biome you just set the counts in your
constructor (Step 2). The count fields (`BiomeDecorator.h:65-82`):

| Field | Controls |
|-------|----------|
| `treeCount` | trees per chunk (`-999` disables) |
| `flowerCount` | `getFlowerFeature` placements |
| `grassCount` | `getGrassFeature` placements |
| `deadBushCount`, `reedsCount`, `cactusCount` | dead bush / sugar cane / cactus |
| `sandCount`, `clayCount`, `gravelCount` | disk features |
| `waterlilyCount`, `mushroomCount`, `hugeMushrooms` | misc |
| `liquids` | water/lava springs (50 water + 20 lava passes) |

If you need bespoke placement that the shared decorator can't express, override
`Biome::decorate` and call the base first, then add your own passes — exactly how
`JungleBiome::decorate` (`JungleBiome.cpp:58-86`) adds vines and melons after
`Biome::decorate(level, random, xo, zo)`, and how `MesaBiome::decorate`
(`MesaBiome.cpp:182-185`) simply forwards to the base. See
[Custom World Generation](/slop-docs/modding/custom-worldgen/) for writing a
`Feature` subclass to add there.

## Step 4 — the surface builder (optional, advanced)

Most biomes inherit the base terrain columns unchanged. Mesa is the exception: it
overrides `buildSurfaceAtDefault(..., byte* chunkBlocks, byte* chunkData, int x,
int z, double noiseVal)` (`MesaBiome.cpp:202-381`) to paint the banded clay
layers. The signature to override is the four-arg-plus-data overload declared at
`Biome.h:206`. Inside, it walks the column top-down (`for (int y = 0x7F; y >= 0;
--y)`), consults `getBand(x, y, z)` (`MesaBiome.cpp:164-180`) for the clay colour
at each height, and writes into `chunkBlocks[idx]` / `chunkData[idx]` where
`idx = (localZ*16 + localX)*128 + y`.

Ashland doesn't need this — its `topMaterial`/`material` (stone) are applied by
the base builder. **Skip this step unless your biome needs custom strata.** If
you do override it, mesa is the only full worked example in the tree; the band
generation (`generateBands`, `:63-161`) and `PerlinSimplexNoise`-driven offset
(`getBand`, `:170`) are worth studying.

## Step 5 — register the biome in `Biome::staticCtor`

Add a static pointer to `Biome.h` next to the mesa ones (`Biome.h:69-71`):

```cpp
static Biome *ashland;
```

Define it near the other definitions in `Biome.cpp` (mesa is defined at
`Biome.cpp:54-56`):

```cpp
Biome *Biome::ashland = nullptr;//44
```

Then register it inside `Biome::staticCtor()` (`Biome.cpp:80`+), mirroring the
mesa lines (`Biome.cpp:129`):

```cpp
// Biome.cpp:129 — the template
Biome::mesa = (new MesaBiome(37, false, false))
    ->setColor(0xd94515)
    ->setName(L"Mesa")
    ->setLeafFoliageWaterSkyColor(eMinecraftColour_Grass_Mesa,
                                  eMinecraftColour_Foliage_Mesa,
                                  eMinecraftColour_Water_Mesa,
                                  eMinecraftColour_Sky_Desert);
```

Our line:

```cpp
Biome::ashland = (new AshlandBiome(44))
    ->setColor(0x4A4A44)
    ->setName(L"Ashland")
    ->setLeafFoliageWaterSkyColor(eMinecraftColour_Grass_Mesa,
                                  eMinecraftColour_Foliage_Mesa,
                                  eMinecraftColour_Water_Mesa,
                                  eMinecraftColour_Sky_Desert);
```

`setColor(int)` (`Biome.h:175`) is the map/minimap colour. `setName` sets the
debug name. `setLeafFoliageWaterSkyColor` takes four `eMinecraftColour` enum
values (`Biome.h:158-161`, `:177`) — the client resolves these against the colour
table. Mesa added three new enum entries (`Grass_Mesa`, `Foliage_Mesa`,
`Water_Mesa`) in the client's `ColourTable.cpp` in the same commit; for a stopgap
you can reuse existing enum values (as Ashland does above with the mesa ones).

## Step 6 — slot it into the biome-selection layer

Registering the biome makes it *exist*; it won't *generate* until the
biome-selection `GenLayer` can output its id. `BiomeInitLayer`
(`BiomeInitLayer.cpp`) is where climate categories become concrete biomes. Its
constructor fills four arrays keyed by climate (`BiomeInitLayer.cpp:17-60`):

```cpp
// BiomeInitLayer.cpp:35 — the "hot/dry" pool
desertBiomes[0] = Biome::desert;
desertBiomes[1] = Biome::desert;
desertBiomes[2] = Biome::desert;
desertBiomes[3] = Biome::savanna;
desertBiomes[4] = Biome::savanna;
desertBiomes[5] = Biome::plains;
```

`getArea` (`:78-174`) then reads the climate id and picks from the matching pool.
Mesa is special-cased: when the climate value is `1` (hot) with the high nibble
set, it forces `mesaPlateauF`/`mesaPlateau` directly (`:114-128`) rather than
going through a pool. For a normal biome, the simplest wiring is to add your
biome into the appropriate pool array. To make Ashland occasionally replace
desert, resize `desertBiomes` (currently `BiomeArray(6)`, `:17`) to 7 and add:

```cpp
desertBiomes[6] = Biome::ashland;   // remember to bump BiomeArray(7)
```

:::caution[Layer changes affect every world]
`BiomeInitLayer` runs for all non-superflat worlds. Changing the pools changes
generation for existing seeds. Test on throwaway worlds. See
[World Generation](/slop-docs/world/worldgen/) for the full layer pipeline
(`IslandLayer` → … → `BiomeInitLayer` → `RegionHillsLayer` → …).
:::

Mesa's "hills"/mutation handling additionally lives in `RegionHillsLayer` and
`RareBiomeLayer` (both edited in `720e1a77`) — needed only if your biome has a
plateau/hills variant. A single flat biome does not need those.

## Step 7 — add the source file to the build

neoLegacy is CMake-driven. Add `AshlandBiome.cpp` (and any new feature `.cpp`) to
`Minecraft.World/cmake/sources/Common.cmake` — mesa added `MesaBiome.cpp`,
`OceanMonumentFeature.cpp`, `OceanMonumentPieces.cpp`, and the new layer files
there in the same commit. Headers don't need listing; `.cpp` files do.

## Localization

The biome's user-facing name is data-side, not in `Biome.cpp`. `setName(L"...")`
sets a debug/internal name only. Player-visible biome names come from the client
string tables. Add your `Ashland` string alongside the existing biome names in
the client localization files (the mesa strings live there). This is the same
`IDS_*` / string-table pattern used for blocks and items — see
[Adding Blocks → Localization](/slop-docs/modding/adding-blocks/).

## Testing checklist

- [ ] `AshlandBiome.cpp` is listed in `cmake/sources/Common.cmake`; project builds clean.
- [ ] `Biome::ashland` is non-null after `staticCtor` (breakpoint in `Biome::staticCtor`, or check `Biome::biomes[44]`).
- [ ] The id you chose (44) was actually free — no other `new XxxBiome(44)`.
- [ ] Create a fresh world; use a biome-locator / debug overlay or fly around to confirm Ashland generates where `BiomeInitLayer` places it.
- [ ] Surface material is correct (stone for Ashland; if you overrode `buildSurfaceAtDefault`, check the strata top-down).
- [ ] Decorator counts behave: no trees (`treeCount = -999`), no flowers/grass.
- [ ] Grass/foliage tint renders (your `getGrassColor`/`getFolageColor` return values).
- [ ] Map/minimap shows the `setColor` colour.
- [ ] Save and reload the world — the biome id round-trips (chunk stores id 44, reloads as Ashland).
- [ ] Mob spawns match your `enemies`/`friendlies` lists.

## Could not verify

- The exact client-side string-table file and colour-table enum registration for
  new biomes live in `Minecraft.Client` (colour work in `ColourTable.cpp` /
  `colours.xml` per `720e1a77`); this page treats them as "reuse the mesa
  entries" rather than citing exact line numbers, since the assignment scope is
  `Minecraft.World`.

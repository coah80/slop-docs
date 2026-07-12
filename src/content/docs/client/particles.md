---
title: Particles
description: "The ParticleEngine, the Particle : Entity base, the world-side ParticleTypes enum, the LevelRenderer particle factory, all ~32 particle subclasses, the menu-background GuiParticles, and the neoLegacy BarrierParticle."
---

Particles are `Entity` subclasses that live in a dimension-partitioned pool
owned by `ParticleEngine` (`Minecraft::particleEngine`). Unlike terrain and
mobs, they are **spawned by string- or enum-keyed calls into
`LevelRenderer::addParticle`** — the actual factory `switch` lives in the level
renderer, not in the engine. The engine only pools, ticks, and batches them
into the tesselator.

Files: `ParticleEngine.h`/`.cpp`, `Particle.h`/`.cpp`, `ParticleType.h`/`.cpp`,
`ParticleUtils.h`, the world-side enum `Minecraft.World/ParticleTypes.h`, the
factory in `LevelRenderer.cpp` (`addParticle*`, lines 2819–3189), plus one
`*Particle.cpp`/`.h` pair per subclass and the menu system `GuiParticle.cpp`,
`GuiParticles.cpp`.

## ParticleEngine

`ParticleEngine` (`ParticleEngine.h:11`) is constructed with a `Level*` and the
shared `Textures*`. Its central store is a three-dimensional array of deques,
one bucket per **(dimension, texture-atlas, blend-list)**:

```cpp
deque<shared_ptr<Particle>> particles[3][TEXTURE_COUNT][LIST_COUNT];
```

The three dimension slots are chosen from `Level::dimension->id` — `0`
(overworld), `-1` (nether → slot 1), anything else (the End → slot 2)
(`ParticleEngine.cpp:41`). This is a neoLegacy/4J change: the engine keeps a
**separate live particle set per dimension** and only clears them all when the
level pointer is set to `nullptr` at game-over (`setLevel`,
`ParticleEngine.cpp:207`), so particles are not lost when you step through a
portal.

### Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `MAX_PARTICLES_PER_LAYER` | `200` | Per-bucket cap. **4J reduced from Java's 4000** (`ParticleEngine.h:15`) |
| `MAX_DRAGON_BREATH_PARTICLES` | `1000` | Higher cap for dragon-breath |
| `MAX_FIREWORK_SPARK_PARTICLES` | `2000` | Higher cap for firework sparks |
| `MISC_TEXTURE` | `0` | `particles.png` atlas |
| `TERRAIN_TEXTURE` | `1` | `TextureAtlas::LOCATION_BLOCKS` |
| `ITEM_TEXTURE` | `2` | `TextureAtlas::LOCATION_ITEMS` |
| `ENTITY_PARTICLE_TEXTURE` | `3` | Lit, per-entity (rendered by `renderLit`) |
| `DRAGON_BREATH_TEXTURE` | `4` | **4J added** — dragon-breath sheet |
| `TEXTURE_COUNT` | `5` | Number of texture slots |
| `TRANSLUCENT_LIST` / `OPAQUE_LIST` | `0` / `1` | Blend split, **brought forward from Java 1.8** |
| `LIST_COUNT` | `2` | Number of blend lists |

### Methods

| Method | Purpose |
|--------|---------|
| `add(shared_ptr<Particle>)` | Insert into the correct `[dim][tex][list]` bucket; pops the oldest when the per-type cap is hit (`ParticleEngine.cpp:35`) |
| `tick()` | Ticks every particle in every bucket; swap-removes dead ones (`removed`) or ones whose level went stale (`ParticleEngine.cpp:63`) |
| `render(player, a, list)` | Batches all non-entity textures for one blend list into `Tesselator`; sets `Particle::xOff/yOff/zOff` to the interpolated player position (`ParticleEngine.cpp:94`) |
| `renderLit(player, a, list)` | Renders only the `ENTITY_PARTICLE_TEXTURE` slot with per-particle lighting; recomputes camera billboarding from `player->yRot/xRot` (`ParticleEngine.cpp:171`) |
| `setLevel(Level*)` | Rebinds; clears all buckets only when passed `nullptr` |
| `destroy(x, y, z, tid, data)` | Block-break burst: spawns 4×4×4 `TerrainParticle`s for the broken tile (`ParticleEngine.cpp:226`) |
| `crack(x, y, z, face)` | Single face-hit crack particle (mining feedback) (`ParticleEngine.cpp:244`) |
| `markTranslucent` / `markOpaque` / `moveParticleInList` | Move a particle between the two blend lists at runtime (Java-1.8 feature) |
| `countParticles()` | Live count for the current dimension, as a `wstring` (debug overlay) |

The `add` cap is keyed off `Particle::GetType()`:

```cpp
switch(p->GetType())
{
    case eTYPE_DRAGONBREATHPARTICLE:  maxParticles = MAX_DRAGON_BREATH_PARTICLES; break;
    case eType_FIREWORKSSPARKPARTICLE: maxParticles = MAX_FIREWORK_SPARK_PARTICLES; break;
    default:                          maxParticles = MAX_PARTICLES_PER_LAYER; break;
}
```

The blend list is chosen per-particle by alpha:
`p->getAlpha() != 1.0f ? TRANSLUCENT_LIST : OPAQUE_LIST` (`ParticleEngine.cpp:55`).

## Particle : Entity

`Particle` (`Particle.h:11`) derives from the world-side `Entity`, so every
particle carries full entity position/velocity state (`x/y/z`, `xd/yd/zd`,
`xo/yo/zo`). Particle-specific fields:

| Field | Meaning |
|-------|---------|
| `texX, texY` | Cell in the misc particle sheet |
| `uo, vo` | UV offset within a cell (for animated frames) |
| `age`, `lifetime` | Tick counter and death age |
| `size` | Half-extent of the billboard quad |
| `gravity` | Downward acceleration applied per tick |
| `rCol, gCol, bCol`, `alpha` | Tint + opacity |
| `tex` (`Icon*`) | Bound atlas icon |
| `static double xOff, yOff, zOff` | Camera-relative render offset, set once per frame by the engine |

Key virtuals every subclass may override: `tick()`, `render(Tesselator*, a, xa,
ya, za, xa2, za2)` (billboard emission), `getParticleTexture()` (which of the 5
texture slots), `getLightColor(a)`, `getBrightness(a)`, and the save hooks
`addAdditonalSaveData` / `readAdditionalSaveData` (note the upstream typo
"Additonal" is preserved). `setColor`, `setAlpha`, `scale`, `setPower` are the
common builder-style mutators.

## ParticleType — the stub registry

`ParticleType` (`ParticleType.h`) mirrors Java's `ParticleType` object (name,
id, `overrideLimiter`, `paramCount`), but on neoLegacy it is **effectively
inert**: both static lookups return `nullptr`.

```cpp
const ParticleType* ParticleType::getDefault()          { return nullptr; }
const ParticleType* ParticleType::byId(int searchId)    { return nullptr; }
```

Real particle dispatch does **not** go through this class. It goes through the
integer `ePARTICLE_TYPE` enum below. `ParticleType` is a vestigial port kept for
API shape only — do not rely on `byId`.

## ePARTICLE_TYPE — the real registry

The authoritative particle registry is the enum `ePARTICLE_TYPE` in
`Minecraft.World/ParticleTypes.h`, added by 4J "to avoid string compares on
adding particles". This is what `LevelRenderer::addParticle` switches on.

| Enum | Notes |
|------|-------|
| `eParticleType_bubble` | Water bubbles |
| `eParticleType_smoke` / `eParticleType_largesmoke` | Smoke |
| `eParticleType_note` | Note-block note |
| `eParticleType_netherportal` | **Nether portal only** — everything else uses `_ender` |
| `eParticleType_endportal` | **4J split from torch/fire** |
| `eParticleType_explode` / `eParticleType_largeexplode` / `eParticleType_hugeexplosion` | Explosions |
| `eParticleType_flame`, `eParticleType_lava` | Fire / lava |
| `eParticleType_footstep` | Footstep smudge |
| `eParticleType_splash`, `eParticleType_wake` | Water splash / boat wake |
| `eParticleType_reddust` | Redstone dust |
| `eParticleType_snowballpoof`, `eParticleType_snowshovel` | Snow |
| `eParticleType_slime`, `eParticleType_heart` | Slime / breeding hearts |
| `eParticleType_suspended`, `eParticleType_depthsuspend`, `eParticleType_townaura` | Ambient motes |
| `eParticleType_crit`, `eParticleType_magicCrit` | Crit stars |
| `eParticleType_spell`, `eParticleType_witchMagic`, `eParticleType_mobSpell`, `eParticleType_mobSpellAmbient`, `eParticleType_instantSpell` | Potion/spell swirls |
| `eParticleType_dripWater`, `eParticleType_dripLava` | Drips |
| `eParticleType_enchantmenttable` | Enchant glyphs |
| `eParticleType_dragonbreath` | **TU9** dragon breath |
| `eParticleType_ender` | **4J** — end-related things that used to reuse the portal particle |
| `eParticleType_barrier` | **neoLegacy** barrier marker (see below) |
| `eParticleType_angryVillager`, `eParticleType_happyVillager` | Villager mood |
| `eParticleType_fireworksspark` | Firework sparks |
| `eParticleType_mobAppearance` | Elder-guardian jump-scare |

Two ranges pack parameters into the id:

```cpp
#define PARTICLE_TILECRACK(id,data) ( (ePARTICLE_TYPE)(0x200000 | ((0x0FFF & id) << 8) | (0x0FF & data)) )
#define PARTICLE_ICONCRACK(id,data) ( (ePARTICLE_TYPE)(0x100000 | ((0x0FFF & id) << 8) | (0x0FF & data)) )
```

`eParticleType_iconcrack_base = 0x100000` and `eParticleType_tilecrack_base =
0x200000` (`ParticleTypes.h:48`). Bits `0x0000FF` carry the data value, bits
`0x0FFF00` carry the tile/item id, bits `0x300000` flag icon-vs-tile. This is
the 4J-JEV replacement for Java's trick of "sneaking parameters into the
particle name string".

## The particle factory (LevelRenderer)

`LevelRenderer` (see [Rendering](/slop-docs/client/rendering/)) owns particle
creation, not `ParticleEngine`:

- `addParticle(const wstring& name, ...)` (`LevelRenderer.cpp:2819`) — legacy
  string entry, maps a name to an enum then delegates.
- `addParticle(ePARTICLE_TYPE, ...)` (`LevelRenderer.cpp:2850`) — enum entry.
- `addParticleInternal(...)` (`LevelRenderer.cpp:2855`) — the real work: distance
  culling, per-player range checks, then a big `switch` (`LevelRenderer.cpp:2998`)
  that `make_shared`s the right subclass and calls
  `mc->particleEngine->add(particle)`.

Distance culling is skipped for `eParticleType_hugeexplosion`,
`_largeexplode`, `_dragonbreath`, `_wake`, and `_mobAppearance`
(`LevelRenderer.cpp:2915`). The default branch of the switch decodes the
icon-crack / tile-crack ranges into `BreakingItemParticle` and `TerrainParticle`
respectively.

## Particle subclasses

There are **32** concrete `*Particle` classes at the client root. `TerrainParticle`
is the base workhorse (block-break, mining, tile-crack). Each declares its
`eINSTANCEOF` via `GetType()`.

| Class | `GetType()` | Role |
|-------|-------------|------|
| `TerrainParticle` | `eType_TERRAINPARTICLE` | Block-break / tile-crack; spawned in bulk by `ParticleEngine::destroy`/`crack` |
| `BreakingItemParticle` | `eType_BREAKINGITEMPARTICLE` | Item-icon crack (eating, tools) |
| `SmokeParticle` | `eType_SMOKEPARTICLE` | Smoke / largesmoke |
| `FlameParticle` | `eType_FLAMEPARTICLE` | Torch / fire flame |
| `LavaParticle` | `eType_LAVAPARTICLE` | Lava pop |
| `SplashParticle` | `eType_SPLASHPARTICLE` | Water splash |
| `BubbleParticle` | `eType_BUBBLEPARTICLE` | Underwater bubbles |
| `DripParticle` | `eTYPE_DRIPPARTICLE` | Water/lava drip from ceilings |
| `WaterDropParticle` | `eType_WATERDROPPARTICLE` | Rain/fishing drops |
| `WaterWakeParticle` | `eType_WAKEPARTICLE` | Boat/fishing wake |
| `CritParticle` | `eType_CRITPARTICLE` | Attack crit star |
| `CritParticle2` | `eType_CRITPARTICLE2` | Magic-crit variant |
| `ExplodeParticle` | `eType_EXPLODEPARTICLE` | Small explosion puff |
| `HugeExplosionParticle` | `eType_HUGEEXPLOSIONPARTICLE` | TNT fireball |
| `HugeExplosionSeedParticle` | `eType_HUGEEXPLOSIONSEEDPARTICLE` | Explosion seed that spawns the huge one |
| `HeartParticle` | `eType_HEARTPARTICLE` | Breeding / tame hearts |
| `NoteParticle` | `eType_NOTEPARTICLE` | Note-block note |
| `RedDustParticle` | `eType_REDDUSTPARTICLE` | Redstone dust |
| `SpellParticle` | `eTYPE_SPELLPARTICLE` | All potion/witch/mob-spell swirls |
| `EchantmentTableParticle` | `eTYPE_ENCHANTMENTTABLEPARTICLE` | Enchant-table glyphs — **note the misspelled filename** `EchantmentTableParticle.cpp` (missing the first "n"); the class name is `EchantmentTableParticle` too |
| `EnderParticle` | `eType_ENDERPARTICLE` | Enderman / end-related |
| `NetherPortalParticle` | `eType_NETHERPORTALPARTICLE` | Nether portal swirl |
| `SnowShovelParticle` | `eType_SNOWSHOVELPARTICLE` | Snow-layer break |
| `SuspendedParticle` | `eType_SUSPENDEDPARTICLE` | Underwater suspended motes |
| `SuspendedTownParticle` | `eType_SUSPENDEDTOWNPARTICLE` | Village ambient aura |
| `MobAppearanceParticle` | *(inherits `Particle::GetType`)* | Elder-guardian face flash |
| `FootstepParticle` | *(see file)* | Footstep smudge |
| `TakeAnimationParticle` | `eType_TAKEANIMATIONPARTICLE` | Item pickup fly-to-player |
| `BarrierParticle` | `eType_BARRIERPARTICLE` | **neoLegacy** barrier-block marker |
| `DragonBreathParticle` | `eTYPE_DRAGONBREATHPARTICLE` | TU9 dragon breath cloud |
| `PlayerCloudParticle` | `eType_PLAYERCLOUDPARTICLEPARTICLE` | Sprint/potion cloud (note the doubled `PARTICLEPARTICLE` in the enum name) |
| `FireworksParticles` | `eType_FIREWORKSSTARTERPARTICLE` (+ spark/overlay types) | Firework spark/overlay set |

## neoLegacy: BarrierParticle

The barrier block's creative-mode marker is a neoLegacy addition.
`BarrierParticle` (`BarrierParticle.h`/`.cpp`) is a fixed-size, non-gravity
billboard that renders the barrier texture:

```cpp
size = 0.5f * scale;        // fixed half-size
lifetime = 80;              // 4 seconds
gravity = 0.0f;
this->setTex(Minecraft::GetInstance()->textures, Tile::barrier->getTexture(Facing::UP));
```

It uses `ParticleEngine::TERRAIN_TEXTURE` (`BarrierParticle.cpp:39`), holds
still (`tick()` zeroes `xd/yd/zd` and removes at `age >= lifetime`), and is
always drawn at full white with `alpha = 1.0`.

Spawning is driven from `LevelRenderer::doBarrierParticles`
(`LevelRenderer.cpp:3192`) and its helper `spawnBarrierParticles`
(`LevelRenderer.cpp:3224`). The marker only appears when the local player is in
**creative mode holding a barrier block**:

```cpp
bool holdingBarrier = isCreative && held != nullptr && held->id == Tile::barrier_Id;
```

When active, it scatters up to `667 × 2` sample points across a 16- and
32-block radius each tick, deduplicates positions with an
`unordered_set<int>` keyed by `BlockPos::hashCode()`, and places a
`BarrierParticle` at the centre of every barrier block found. This mirrors the
vanilla Java barrier-particle behaviour that never shipped in stock LCE TU19.

## GUI particles (menu background)

Separate from the world particle engine, the classic menu screens have their own
2D particle system for the title/pause backdrops.

- `GuiParticle` (`GuiParticle.h`) — a single 2D mote: `x/y`, `xo/yo`, `xa/ya`,
  `friction`, `life/lifeTime`, and current/previous RGBA (`r/g/b/a`,
  `oR/oG/oB/oA` — renamed from `or` because the PS3 toolchain rejected `or` as a
  reserved word).
- `GuiParticles` (`GuiParticles.h`) — the manager, a `GuiComponent` holding a
  `vector<GuiParticle*>` with `tick()`, `add()`, and `render(float a)`.

The classic `Screen` base owns one via `Screen::particles`
(`Screen.h:22`); on console these are part of the vestigial classic-UI stack
(see [Classic Screens & HUD](/slop-docs/client/screens/)) — the live
console menus render their panorama background through the XUI/`UIComponent_Panorama`
path instead.

## Related

- [Rendering](/slop-docs/client/rendering/) — the `LevelRenderer` factory and tesselator.
- [Entity Renderers & Models](/slop-docs/client/entity-rendering/) — `Particle` shares the `Entity` base and the `eINSTANCEOF` dispatch scheme.
- [Classic Screens & HUD](/slop-docs/client/screens/) — where `GuiParticles` and the classic UI live.

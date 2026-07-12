---
title: Custom Particles
description: How the particle system works in LCE and how to create your own particle types.
---

Particles in LCE are those little visual effects you see everywhere: smoke puffs from torches, block break chunks, lava sparks, portal swirls. They're all subclasses of the `Particle` base class, managed by the `ParticleEngine`, and rendered as camera-facing quads (billboards) using the `Tesselator`.

This guide covers the full particle pipeline so you can make your own.

## How ParticleEngine Works

The `ParticleEngine` class (in `Minecraft.Client/ParticleEngine.h`) owns all active particles and handles their lifecycle. Here's the gist:

- Particles are stored in a 2D array of deques: `particles[3][TEXTURE_COUNT]`. The first index is the **dimension** (0 = Overworld, 1 = Nether, 2 = End). The second is the **texture layer**.
- Each tick, the engine loops through every particle, calls `tick()`, and removes any particle that has been flagged with `remove()`.
- During rendering, the engine binds the right texture atlas for each layer, then calls `render()` on every particle in that layer.

There are five texture layers:

| Constant | Value | Used For |
|----------|-------|----------|
| `MISC_TEXTURE` | 0 | Most particles (smoke, flame, hearts, notes, etc.) |
| `TERRAIN_TEXTURE` | 1 | Block break particles |
| `ITEM_TEXTURE` | 2 | Item break particles (snowballs, slime, eggs) |
| `ENTITY_PARTICLE_TEXTURE` | 3 | Particles that render themselves (footsteps, explosions) |
| `DRAGON_BREATH_TEXTURE` | 4 | Dragon breath (4J added, separate texture sheet) |

The engine has a hard cap on particles per layer: **200 per layer** (except dragon breath which gets 1000). When the cap is hit, the oldest particle gets removed to make room. This is way lower than Java edition's 4000 limit because consoles had less headroom.

```cpp
static const int MAX_PARTICLES_PER_LAYER = 200;   // 4J reduced from 4000
static const int MAX_DRAGON_BREATH_PARTICLES = 1000;
```

### Adding a Particle

The engine has one method for adding particles:

```cpp
void ParticleEngine::add(shared_ptr<Particle> p);
```

It figures out which dimension and texture layer the particle belongs to, enforces the cap, and pushes it into the right deque.

## The Particle Base Class

Every particle extends `Particle`, which itself extends `Entity`. That means particles have a position (`x`, `y`, `z`), velocity (`xd`, `yd`, `zd`), and collision logic from the entity system.

Here are the key fields defined in `Particle.h`:

```cpp
class Particle : public Entity
{
protected:
    int texX, texY;      // Position on the particle sprite sheet (in 16x16 grid)
    float uo, vo;        // Random UV offset (for variety in terrain/item particles)
    int age;             // Current age in ticks
    int lifetime;        // Max age before removal
    float size;          // Visual scale multiplier
    float gravity;       // How much gravity pulls the particle down each tick
    float rCol, gCol, bCol;  // RGB color tint (0.0 to 1.0)
    float alpha;         // Transparency (1.0 = fully opaque)
    Icon *tex;           // Texture icon (used for terrain/item particles)
public:
    static double xOff, yOff, zOff;  // Camera offset for rendering
};
```

### Constructor

The base constructor sets up sensible defaults:

```cpp
Particle::Particle(Level *level, double x, double y, double z,
                   double xa, double ya, double za)
```

What it does:
- Sets the entity size to `0.2 x 0.2`
- Positions the particle at `(x, y, z)`
- Sets color to white (`rCol = gCol = bCol = 1.0`)
- Picks random UV offsets (`uo`, `vo`) for texture variety
- Randomizes the `size` between 0.5 and 1.5 (then multiplied by 2)
- Sets `lifetime` to roughly 4 ticks (randomized)
- Applies the initial velocity `(xa, ya, za)` with some random spread, normalized and scaled down

The velocity normalization is worth noting. The constructor doesn't just use your velocity directly. It adds random noise, normalizes the result, and scales it by `0.4`:

```cpp
xd = xa + (float)(Math::random() * 2 - 1) * 0.4f;
yd = ya + (float)(Math::random() * 2 - 1) * 0.4f;
zd = za + (float)(Math::random() * 2 - 1) * 0.4f;
float dd = Mth::sqrt(xd * xd + yd * yd + zd * zd);
xd = xd / dd * speed * 0.4f;
yd = yd / dd * speed * 0.4f + 0.1f;
zd = zd / dd * speed * 0.4f;
```

If you want exact control over velocity, override it in your subclass constructor after calling the base constructor (like `FlameParticle` does).

### Default tick()

The base `tick()` handles the standard particle physics loop:

```cpp
void Particle::tick()
{
    xo = x; yo = y; zo = z;          // Store previous position for interpolation

    if (age++ >= lifetime) remove();  // Die when too old

    yd -= 0.04 * gravity;            // Apply gravity
    move(xd, yd, zd);                // Move with collision detection
    xd *= 0.98f;                     // Air friction
    yd *= 0.98f;
    zd *= 0.98f;

    if (onGround)                    // Ground friction
    {
        xd *= 0.7f;
        zd *= 0.7f;
    }
}
```

Key things:
- **Gravity** is `0.04 * gravity`. The `gravity` field defaults to `0.0`, so particles float unless you set it.
- **Air friction** is `0.98` per tick on all axes. Particles slow down naturally.
- **Ground friction** kicks in when `onGround` is true, applying an extra `0.7` multiplier to horizontal velocity.

### Default render()

The base `render()` draws a camera-facing quad (billboard) using the `Tesselator`:

```cpp
void Particle::render(Tesselator *t, float a, float xa, float ya,
                      float za, float xa2, float za2)
```

The `a` parameter is the partial tick for interpolation. The `xa/ya/za/xa2/za2` parameters are camera-relative axes that make the quad face the player.

The renderer:
1. Calculates UV coordinates from `texX` and `texY` (or from `tex` icon if set)
2. Interpolates position between `xo/yo/zo` and `x/y/z` using `a`
3. Calculates brightness from the world lighting
4. Draws four vertices as a textured quad, colored with `rCol * brightness, gCol * brightness, bCol * brightness, alpha`

## All Existing Particle Types

Here's every particle type in LCE with its enum value, implementing class, and a quick description:

| Enum | Class | Description |
|------|-------|-------------|
| `eParticleType_bubble` | `BubbleParticle` | Underwater bubbles, float upward, removed outside water |
| `eParticleType_smoke` | `SmokeParticle` | Torch/fire smoke, drifts upward, animates through 8 frames |
| `eParticleType_note` | `NoteParticle` | Note block notes, colored by pitch (24 colors from colour table) |
| `eParticleType_netherportal` | `NetherPortalParticle` | Purple swirls around nether portals, path-based movement |
| `eParticleType_endportal` | `SmokeParticle` (recolored) | End portal particles, uses smoke with ender portal color |
| `eParticleType_ender` | `EnderParticle` | Enderman/eye of ender trails, path-based like portal |
| `eParticleType_explode` | `ExplodeParticle` | Small explosion puffs, animates through 8 frames |
| `eParticleType_flame` | `FlameParticle` | Torch/fire flames, self-lit, shrinks over time |
| `eParticleType_lava` | `LavaParticle` | Lava sparks, spawns smoke as it flies, full brightness |
| `eParticleType_footstep` | `FootstepParticle` | Flat footprints on the ground, fades out over 200 ticks |
| `eParticleType_splash` | `SplashParticle` | Water splashes |
| `eParticleType_largesmoke` | `SmokeParticle` (2.5x scale) | Larger smoke, same class with bigger scale |
| `eParticleType_reddust` | `RedDustParticle` | Redstone dust particles, color passed via velocity args |
| `eParticleType_snowballpoof` | `BreakingItemParticle` | Snowball break effect, uses snowball item texture |
| `eParticleType_snowshovel` | `SnowShovelParticle` | Snow shovel particles |
| `eParticleType_slime` | `BreakingItemParticle` | Slime break effect, uses slime ball item texture |
| `eParticleType_heart` | `HeartParticle` | Breeding/taming hearts, floats upward |
| `eParticleType_suspended` | `SuspendedParticle` | Underwater suspended particles |
| `eParticleType_depthsuspend` | `SuspendedTownParticle` | Void/depth particles |
| `eParticleType_townaura` | `SuspendedTownParticle` | Mycelium/village particles |
| `eParticleType_crit` | `CritParticle2` | Critical hit sparks, color from colour table |
| `eParticleType_magicCrit` | `CritParticle2` (recolored) | Sharpness/magic crit, tinted blue-green |
| `eParticleType_hugeexplosion` | `HugeExplosionSeedParticle` | Seeds 6 large explosion particles per tick for 8 ticks |
| `eParticleType_largeexplode` | `HugeExplosionParticle` | Animated explosion sprite sheet (4x4 grid), self-rendered |
| `eParticleType_spell` | `SpellParticle` | Potion/splash spell effects, animates 8 frames |
| `eParticleType_mobSpell` | `SpellParticle` | Mob spell effects, color passed via velocity args |
| `eParticleType_instantSpell` | `SpellParticle` | Instant health/damage effect, uses alternate sprite row |
| `eParticleType_dripWater` | `DripParticle` | Water dripping from blocks, sticks then falls |
| `eParticleType_dripLava` | `DripParticle` | Lava dripping, color transitions over time, full brightness |
| `eParticleType_enchantmenttable` | `EchantmentTableParticle` | Glyphs floating toward enchanting table |
| `eParticleType_dragonbreath` | `DragonBreathParticle` | Dragon breath cloud, settles on ground then rises |
| `eParticleType_angryVillager` | `HeartParticle` (recolored) | Angry villager particle (uses different sprite slot) |
| `eParticleType_happyVillager` | `SuspendedTownParticle` (recolored) | Happy villager green sparkle |
| `eParticleType_iconcrack_*` | `BreakingItemParticle` | Item break particles, ID encoded in the enum |
| `eParticleType_tilecrack_*` | `TerrainParticle` | Block break particles, ID encoded in the enum |

The `iconcrack` and `tilecrack` types use bit packing to encode the item/tile ID and data value into the enum. Macros handle this:

```cpp
#define PARTICLE_TILECRACK(id, data) \
    ((ePARTICLE_TYPE)(eParticleType_tilecrack_base | ((0x0FFF & id) << 8) | (0x0FF & data)))

#define PARTICLE_ICONCRACK(id, data) \
    ((ePARTICLE_TYPE)(eParticleType_iconcrack_base | ((0x0FFF & id) << 8) | (0x0FF & data)))
```

## Creating a New Particle Subclass

Let's walk through making a custom particle from scratch. We'll create a spark particle that shoots upward, glows, and fades out.

### Step 1: Header File

Create `Minecraft.Client/SparkParticle.h`:

```cpp
#pragma once
#include "Particle.h"

class SparkParticle : public Particle
{
public:
    virtual eINSTANCEOF GetType() { return eType_SPARKPARTICLE; }
private:
    float oSize;

public:
    SparkParticle(Level *level, double x, double y, double z,
                  double xd, double yd, double zd);
    virtual void tick();
    virtual void render(Tesselator *t, float a, float xa, float ya,
                        float za, float xa2, float za2);
    virtual float getBrightness(float a);
    virtual int getLightColor(float a);
};
```

You'll need to add `eType_SPARKPARTICLE` to the `eINSTANCEOF` enum (in `stubs.h` or wherever your project defines it). This is used for type checking.

### Step 2: Implementation

Create `Minecraft.Client/SparkParticle.cpp`:

```cpp
#include "stdafx.h"
#include "SparkParticle.h"
#include "..\Minecraft.World\JavaMath.h"
#include "..\Minecraft.World\Random.h"

SparkParticle::SparkParticle(Level *level, double x, double y, double z,
                             double xd, double yd, double zd)
    : Particle(level, x, y, z, xd, yd, zd)
{
    // Override the base constructor's velocity normalization
    this->xd = this->xd * 0.01f + xd;
    this->yd = this->yd * 0.01f + yd;
    this->zd = this->zd * 0.01f + zd;

    // Add some random spread to the position
    x += (random->nextFloat() - random->nextFloat()) * 0.05f;
    y += (random->nextFloat() - random->nextFloat()) * 0.05f;
    z += (random->nextFloat() - random->nextFloat()) * 0.05f;

    oSize = size;

    // Orange-yellow color
    rCol = 1.0f;
    gCol = 0.6f + random->nextFloat() * 0.3f;
    bCol = 0.1f;

    lifetime = (int)(6 / (Math::random() * 0.8 + 0.2)) + 2;
    noPhysics = true;  // Ignore block collisions
    gravity = 0.0f;    // No gravity, we'll handle movement manually

    // Use flame sprite (slot 48 on the particles.png sheet)
    setMiscTex(48);
}

void SparkParticle::tick()
{
    xo = x;
    yo = y;
    zo = z;

    if (age++ >= lifetime) remove();

    // Sparks drift upward and slow down
    yd += 0.002;
    move(xd, yd, zd);
    xd *= 0.92f;
    yd *= 0.92f;
    zd *= 0.92f;
}

void SparkParticle::render(Tesselator *t, float a, float xa, float ya,
                           float za, float xa2, float za2)
{
    // Shrink as the particle ages
    float progress = (age + a) / (float)lifetime;
    size = oSize * (1.0f - progress * progress);

    // Fade alpha near end of life
    alpha = 1.0f - progress;

    Particle::render(t, a, xa, ya, za, xa2, za2);
}

float SparkParticle::getBrightness(float a)
{
    // Self-illuminated: lerp from full brightness to world brightness
    float progress = (age + a) / lifetime;
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;
    float worldBr = Particle::getBrightness(a);
    return worldBr * progress + (1.0f - progress);
}

int SparkParticle::getLightColor(float a)
{
    // Emit light so it glows in the dark (same approach as FlameParticle)
    float progress = (age + a) / lifetime;
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;
    int br = Particle::getLightColor(a);
    int br1 = (br) & 0xff;
    br1 += (int)(progress * 15 * 16);
    if (br1 > 15 * 16) br1 = 15 * 16;
    int br2 = (br >> 16) & 0xff;
    return br1 | br2 << 16;
}
```

### Step 3: Register the Particle Type

Add a new entry to the `ePARTICLE_TYPE` enum in `Minecraft.World/ParticleTypes.h`:

```cpp
eParticleType_happyVillager,
eParticleType_spark,  // Your new type
```

### Step 4: Wire It Up in LevelRenderer

Open `Minecraft.Client/LevelRenderer.cpp` and add your case to the big `switch` statement inside `addParticleInternal()`:

```cpp
case eParticleType_spark:
    particle = shared_ptr<Particle>(
        new SparkParticle(lev, x, y, z, xa, ya, za));
    break;
```

Don't forget to `#include "SparkParticle.h"` at the top of `LevelRenderer.cpp`.

### Step 5: Add to Build

Add both files to `cmake/Sources.cmake` in the client sources section, then rebuild.

## Spawning Particles from Code

Particles are spawned through `Level::addParticle()`. This gets picked up by the `LevelRenderer` (which is a `LevelListener`) and routed to the big switch statement we just saw.

### From a Tile (Block)

Blocks often spawn particles in their `animateTick()` or `tick()` methods:

```cpp
void MyCustomTile::animateTick(Level *level, int x, int y, int z, Random *random)
{
    // Spawn sparks above the block
    double px = x + random->nextFloat();
    double py = y + 1.0;
    double pz = z + random->nextFloat();
    level->addParticle(eParticleType_spark, px, py, pz, 0.0, 0.1, 0.0);
}
```

`animateTick` is called every frame for blocks near the player, so it's the right place for ambient visual effects. Don't use `tick()` for particles unless you really need server-side timing.

### From an Entity

Entities can spawn particles the same way through their level pointer:

```cpp
void MyEntity::tick()
{
    Entity::tick();

    // Trail of sparks behind the entity
    level->addParticle(eParticleType_spark, x, y + 0.5, z,
                       -xd * 0.5, 0.1, -zd * 0.5);
}
```

### From an Explosion

The `Explosion` class in `Minecraft.World` spawns `eParticleType_hugeexplosion` and `eParticleType_largeexplode` automatically. You don't need to do anything special for explosion particles unless you want to replace them.

### Using the Tile/Item Crack Macros

To spawn block break particles for a specific tile:

```cpp
level->addParticle(PARTICLE_TILECRACK(Tile::stone_Id, 0),
                   x, y, z, 0.0, 0.0, 0.0);
```

For item break particles:

```cpp
level->addParticle(PARTICLE_ICONCRACK(Item::diamond_Id, 0),
                   x, y, z, 0.0, 0.1, 0.0);
```

### Block Destroy Particles

The `ParticleEngine` has a dedicated method for spawning a full block-destruction burst:

```cpp
void ParticleEngine::destroy(int x, int y, int z, int tid, int data);
```

This creates a 4x4x4 grid of `TerrainParticle` instances that fan out from the block center. It's called automatically when a block is broken, but you can call it directly too:

```cpp
mc->particleEngine->destroy(x, y, z, Tile::glass_Id, 0);
```

## Particle Physics

### Gravity

The `gravity` field controls downward acceleration. In the base `tick()`, gravity is applied as:

```cpp
yd -= 0.04 * gravity;
```

So a gravity of `1.0` means `0.04` blocks/tick downward acceleration. Some examples:
- `0.0` (default): floats in place, only initial velocity matters
- `0.06`: gentle fall (used by `DripParticle`)
- `1.0`: standard gravity (used by `TerrainParticle` via `tile->gravity`)

### Friction

Air friction is applied each tick by multiplying velocity. Different particles use different values:

| Particle | X/Z Friction | Y Friction | Feel |
|----------|-------------|------------|------|
| Base `Particle` | 0.98 | 0.98 | Standard |
| `FlameParticle` | 0.96 | 0.96 | Slightly heavier drag |
| `SmokeParticle` | 0.96 | 0.96 | Same as flame |
| `BubbleParticle` | 0.85 | 0.85 | Heavy drag (underwater) |
| `HeartParticle` | 0.86 | 0.86 | Floaty |
| `NoteParticle` | 0.66 | 0.66 | Very heavy, stops fast |
| `ExplodeParticle` | 0.90 | 0.90 | Quick slowdown |
| `LavaParticle` | 0.999 | 0.999 | Almost no drag |

### Ground Friction

When `onGround` is true, horizontal velocity gets an extra `0.7` multiplier. This is consistent across almost all particle types.

### No-Physics Mode

Setting `noPhysics = true` in your constructor makes the particle skip collision detection entirely. It will pass through blocks. `FlameParticle`, `NetherPortalParticle`, and `EnderParticle` all use this.

### Upward Drift

Some particles add a small upward force each tick instead of (or in addition to) gravity:

```cpp
// SmokeParticle: drifts upward
yd += 0.004;

// SpellParticle: also drifts up
yd += 0.004;

// BubbleParticle: floats up faster
yd += 0.002;
```

### Path-Based Movement

`NetherPortalParticle` and `EnderParticle` don't use physics at all. They store a start position and interpolate along a curve:

```cpp
void NetherPortalParticle::tick()
{
    float pos = age / (float)lifetime;
    float a = pos;
    pos = -pos + pos * pos * 2;
    pos = 1 - pos;

    x = xStart + xd * pos;
    y = yStart + yd * pos + (1 - a);  // Rises over time
    z = zStart + zd * pos;

    if (age++ >= lifetime) remove();
}
```

This creates a smooth arc from the spawn point. The velocity values (`xd`, `yd`, `zd`) act as target offsets rather than per-tick speeds.

## Particle Rendering

### Texture Slots

Most particles use the `particles.png` sprite sheet, which is a 16x16 grid. You pick your slot with `setMiscTex()`:

```cpp
setMiscTex(48);  // Flame sprite (row 3, column 0)
```

The slot index maps to a grid position: `texX = slot % 16`, `texY = slot / 16`. Some common slots:
- 0-7: Generic particle animation frames (used by smoke, explode, redstone)
- 32: Bubble
- 48: Flame
- 49: Lava
- 64 (16 * 4): Note
- 80 (16 * 5): Heart
- 81 (16 * 5 + 1): Angry villager
- 82 (16 * 5 + 2): Happy villager
- 113 (16 * 7 + 1): Drip

### Animated Sprites

Several particles animate through frames by calling `setMiscTex()` each tick:

```cpp
// SmokeParticle: plays 8 frames backwards over its lifetime
setMiscTex(7 - age * 8 / lifetime);

// DragonBreathParticle: 3 frames over its lifetime
setMiscTex((3 * age / lifetime) + 5);

// SpellParticle: 8 frames backwards from a configurable base
setMiscTex(baseTex + (7 - age * 8 / lifetime));
```

### Size Over Lifetime

Most particles change size as they age. Common patterns:

```cpp
// FlameParticle: shrink with quadratic falloff
float s = (age + a) / (float)lifetime;
size = oSize * (1 - s * s * 0.5f);

// LavaParticle: shrink with linear-ish falloff
float s = (age + a) / (float)lifetime;
size = oSize * (1 - s * s);

// SmokeParticle: grow from 0 to full size
float l = ((age + a) / lifetime) * 32;
if (l > 1) l = 1;
size = oSize * l;

// NetherPortalParticle: ease-in grow
float s = (age + a) / (float)lifetime;
s = 1 - s; s = s * s; s = 1 - s;
size = oSize * s;
```

Store the original size in a field (usually `oSize`) so you have something to scale from.

### Color

Set the color in your constructor using `rCol`, `gCol`, `bCol` (0.0 to 1.0). Many particles pull their color from the colour table for mashup/texture pack support:

```cpp
unsigned int colour = Minecraft::GetInstance()->getColourTable()
    ->getColor(eMinecraftColour_Particle_NetherPortal);
int r = (colour >> 16) & 0xFF;
int g = (colour >> 8) & 0xFF;
int b = colour & 0xFF;
rCol = (r / 255.0f) * br;
gCol = (g / 255.0f) * br;
bCol = (b / 255.0f) * br;
```

If you want your particle to be recolorable by texture packs, add a new entry to the colour table. Otherwise, just set the values directly.

### Alpha Fade

The `alpha` field controls transparency. Set it in your `render()` method to fade the particle out:

```cpp
void MyParticle::render(Tesselator *t, float a, float xa, float ya,
                        float za, float xa2, float za2)
{
    float progress = (age + a) / (float)lifetime;
    alpha = 1.0f - progress;  // Fade from opaque to transparent
    Particle::render(t, a, xa, ya, za, xa2, za2);
}
```

Note that the default rendering path doesn't enable GL blending, so alpha fade only works fully when the particle is rendered with blending enabled. `FootstepParticle` handles this by setting up its own GL state in `render()`.

### Self-Illumination

Particles like `FlameParticle` and `LavaParticle` override `getBrightness()` and `getLightColor()` to glow in the dark:

```cpp
float FlameParticle::getBrightness(float a)
{
    float l = (age + a) / lifetime;
    if (l < 0) l = 0;
    if (l > 1) l = 1;
    float br = Particle::getBrightness(a);
    return br * l + (1 - l);  // Starts full bright, fades to world brightness
}
```

`getBrightness()` is used when `TEXTURE_LIGHTING` is off. `getLightColor()` is used when it's on. Override both if you want consistent glow across rendering modes.

### Custom Rendering

If the base `render()` doesn't cut it, you can draw whatever you want. `FootstepParticle` renders a flat quad on the ground. `HugeExplosionParticle` uses its own animated sprite sheet. Just bind your texture, set up GL state, and draw with the `Tesselator`:

```cpp
void MyParticle::render(Tesselator *t, float a, float xa, float ya,
                        float za, float xa2, float za2)
{
    // Return ENTITY_PARTICLE_TEXTURE from getParticleTexture()
    // so the engine doesn't try to batch this with other particles

    textures->bindTexture(TN_MY_CUSTOM_TEXTURE);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    t->begin();
    // ... draw your custom geometry ...
    t->end();

    glDisable(GL_BLEND);
}
```

If you go this route, return `ParticleEngine::ENTITY_PARTICLE_TEXTURE` from `getParticleTexture()`. Particles in the entity texture layer are rendered individually (not batched), so your custom GL state changes won't interfere with other particles.

## Real Examples from the Codebase

### Lava Spawns Smoke

`LavaParticle` spawns secondary smoke particles as it flies. The odds of spawning decrease as the particle ages:

```cpp
void LavaParticle::tick()
{
    // ... movement code ...

    float odds = age / (float)lifetime;
    if (random->nextFloat() > odds)
        level->addParticle(eParticleType_smoke, x, y, z, xd, yd, zd);
}
```

### Drip Particles Splash on Landing

`DripParticle` starts stuck under a block, then falls. Water drips spawn a splash on impact:

```cpp
if (onGround)
{
    if (material == Material::water)
    {
        remove();
        level->addParticle(eParticleType_splash, x, y, z, 0, 0, 0);
    }
}
```

### Dragon Breath Settles and Rises

`DragonBreathParticle` has two phases: it falls toward the ground, then rises as a lingering cloud:

```cpp
if (onGround)
{
    yd = 0;
    m_bHasHitGround = true;
}
if (m_bHasHitGround) yd += 0.002;  // Slowly rise after landing
```

### Explosion Seed Spawns Child Particles

`HugeExplosionSeedParticle` is invisible. It just spawns 6 visible explosion particles per tick across 8 ticks:

```cpp
void HugeExplosionSeedParticle::tick()
{
    for (int i = 0; i < 6; i++) {
        double xx = x + (random->nextDouble() - random->nextDouble()) * 4;
        double yy = y + (random->nextDouble() - random->nextDouble()) * 4;
        double zz = z + (random->nextDouble() - random->nextDouble()) * 4;
        level->addParticle(eParticleType_largeexplode, xx, yy, zz,
                           life / (float)lifeTime, 0, 0);
    }
    life++;
    if (life == lifeTime) remove();
}
```

This "seed" pattern is useful whenever you want a burst of particles spread over multiple ticks rather than all at once.

## Performance Considerations

The 200-per-layer cap is very low. On Java Edition you get 4000. This means you need to be careful about how many particles you spawn.

**Batch spawning.** If you spawn a burst of 50 particles at once, that's 25% of the layer's budget gone instantly. Consider spreading the spawn across multiple ticks using a seed particle (like `HugeExplosionSeedParticle` does).

**Short lifetimes.** Keep lifetimes short so particles cycle out quickly. The default 4-tick lifetime is fine for transient effects. Longer effects (like dragon breath at 200+ ticks) eat into the budget for a long time.

**Use the right layer.** Don't put everything on `MISC_TEXTURE`. If your particle uses an item or block texture, use `ITEM_TEXTURE` or `TERRAIN_TEXTURE` so it doesn't compete with smoke, flame, and spell particles for the same 200-slot cap.

**The dragon breath layer.** 4J added `DRAGON_BREATH_TEXTURE` with a 1000-particle cap specifically because dragon breath needed more particles than the other layers could spare. If you have a similarly intensive effect, consider adding your own layer with a custom cap. You'll need to update `TEXTURE_COUNT` and expand the `particles` array.

## Debugging Particles

If your particle doesn't show up, check these things in order:

1. **Is the enum registered?** Make sure your `ePARTICLE_TYPE` entry exists in `ParticleTypes.h`.
2. **Is the switch case wired?** Look at `LevelRenderer::addParticleInternal()` and confirm there's a `case` for your type.
3. **Is `getParticleTexture()` returning the right layer?** If it returns the wrong layer constant, the engine might not bind the right atlas before rendering.
4. **Is the lifetime > 0?** If `lifetime` is 0, the particle dies on the first tick before it gets rendered.
5. **Is the size > 0?** A size of 0 makes the quad infinitely small.
6. **Is the alpha > 0?** Check that you're not accidentally setting alpha to 0 in the constructor.
7. **Is the particle being spawned at the right position?** Add a `SmokeParticle` at the same coordinates to verify the spawn point is visible.

Use `ParticleEngine::countParticles()` (shown in the debug screen with F3) to see how many particles are active per layer. If your layer is at 200, new particles are being evicted immediately.

## Related Guides

- [Adding Blocks](/slop-docs/modding/adding-blocks/) to learn about `animateTick()` for ambient block particles
- [Adding Entities](/slop-docs/modding/adding-entities/) for spawning particles from entity logic
- [Texture Packs](/slop-docs/modding/texture-packs/) for customizing the `particles.png` sprite sheet

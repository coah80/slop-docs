---
title: Custom Particles
description: A full worked example — add a Particle subclass to neoLegacy end to end, modeled on how BarrierParticle is registered and spawned today.
---

Particles in neoLegacy are a **client-only** system with a small server-side
handshake. The pieces:

1. A **`Particle` subclass** in `Minecraft.Client/` — the visual (texture,
   lifetime, motion, render). `Particle : public Entity`
   (`Particle.h:11`, uses `Entity` from Minecraft.World).
2. A **particle-type enum value** (`ePARTICLE_TYPE` in
   `Minecraft.World/ParticleTypes.h`) — the shared id that world code uses to
   ask for the particle.
3. A **dispatch case** in `LevelRenderer::addParticleInternal`
   (`LevelRenderer.cpp:2855`) — the big `switch` that maps an enum value to
   `new YourParticle(...)`.
4. **Spawn triggers** — world code calls `Level::addParticle(eParticleType_…, …)`
   (`Level.cpp:1690`), which fans out to the `LevelRenderer` via the
   `LevelListener` interface.

The real template is **`BarrierParticle`** (the barrier-block outline particle,
enum `eParticleType_barrier`). Keep the [rendering docs](/slop-docs/client/rendering/)
and [particle reference](/slop-docs/client/particles/) open.

For the worked example we'll add a **SparkParticle** — a short-lived glowing
speck. It's close to `BarrierParticle` so you can diff against a real one.

## Step 0 — how a particle reaches the screen

Two enum systems are involved, don't conflate them:

- `ePARTICLE_TYPE` (`ParticleTypes.h:3`) — the **shared** id world code uses.
  `eParticleType_bubble`, `eParticleType_smoke`, … `eParticleType_barrier`,
  `eParticleType_dragonbreath`, etc. This lives in Minecraft.World so tiles and
  entities can reference it.
- `eINSTANCEOF` particle discriminators (`Class.h:260`+) —
  `eType_BARRIERPARTICLE`, `eType_SMOKEPARTICLE`, … used for runtime type
  checks on the `Particle` object itself.

`ParticleType.cpp` (the class with `byId`) is a **stub** in this codebase — it
returns `nullptr`. Do **not** try to register through it; the live path is the
`switch` in `LevelRenderer`.

## Step 1 — add the shared enum value

In `Minecraft.World/ParticleTypes.h`, add your type to the `ePARTICLE_TYPE`
enum, next to the other 4J-added ones (barrier is at `ParticleTypes.h:40`):

```cpp
enum ePARTICLE_TYPE
{
	...
	eParticleType_barrier,
	eParticleType_angryVillager,
	...
	eParticleType_spark,   // <-- add yours (before the iconcrack_base range)
	...
};
```

:::caution[Keep it before the crack ranges]
Everything below `eParticleType_iconcrack_base = 0x100000` is reserved for the
tile/item-break particles (they pack a tile/item id into the high bits — see the
`PARTICLE_TILECRACK`/`PARTICLE_ICONCRACK` macros at `ParticleTypes.h:57`). Add
your value to the plain sequential list above `eParticleType_mobAppearance`, not
into the numeric ranges.
:::

## Step 2 — add the `eINSTANCEOF` discriminator (if you need type checks)

In `Minecraft.World/Class.h`, add a discriminator next to `eType_BARRIERPARTICLE`
(`Class.h:268`) if your particle needs to be identified at runtime:

```cpp
eType_SPARKPARTICLE,
```

`BarrierParticle` uses this in its `GetType()` override (`BarrierParticle.h:8`):

```cpp
virtual eINSTANCEOF GetType() { return eType_BARRIERPARTICLE; }
```

## Step 3 — the Particle subclass header

Create `Minecraft.Client/SparkParticle.h`. `BarrierParticle.h` is the template:

```cpp
// BarrierParticle.h — the template
#pragma once
#include "Particle.h"

class BarrierParticle : public Particle
{
public:
	virtual eINSTANCEOF GetType() { return eType_BARRIERPARTICLE; }

private:
	void init(Level* level, double x, double y, double z, float scale);

public:
	float oSize;

	BarrierParticle(Level* level, double x, double y, double z,
	                double xa, double ya, double za);

	virtual int getParticleTexture();
	virtual void render(Tesselator* t, float a, float xa, float ya, float za, float xa2, float za2);
	virtual void tick();
};
```

Ours mirrors it:

```cpp
// SparkParticle.h
#pragma once
#include "Particle.h"

class SparkParticle : public Particle
{
public:
	virtual eINSTANCEOF GetType() { return eType_SPARKPARTICLE; }

	SparkParticle(Level* level, double x, double y, double z,
	              double xa, double ya, double za);

	virtual int getParticleTexture();
	virtual void tick();
	// inherit the default billboard render, or override render() like BarrierParticle
};
```

## Step 4 — the Particle source

`BarrierParticle.cpp` shows the whole contract. The ctor sets motion via the
base `Particle` ctor, then `init()` sets size/lifetime, then it binds a texture:

```cpp
// BarrierParticle.cpp — key parts
BarrierParticle::BarrierParticle(Level* level, double x, double y, double z,
                                 double xa, double ya, double za)
	: Particle(level, x, y, z, xa, ya, za)
{
	init(level, x, y, z, 1.0f);
	// bind the barrier block's UP-face texture:
	this->setTex(Minecraft::GetInstance()->textures, Tile::barrier->getTexture(Facing::UP));
}

void BarrierParticle::init(Level* level, double x, double y, double z, float scale)
{
	xd = yd = zd = 0;
	rCol = gCol = bCol = 1.0f;
	alpha = 1.0f;
	size = 0.5f * scale;  oSize = size;
	lifetime = 80;
	gravity = 0.0f;
}

int BarrierParticle::getParticleTexture()
{
	return ParticleEngine::TERRAIN_TEXTURE;   // draws from the terrain atlas
}

void BarrierParticle::tick()
{
	xo = x; yo = y; zo = z;
	if (++age >= lifetime) remove();
	xd = yd = zd = 0;
}
```

### Choosing a texture source

`getParticleTexture()` picks which atlas the particle draws from
(`ParticleEngine.h:19`):

| Return value | Atlas | How to set the sprite |
|---|---|---|
| `MISC_TEXTURE` (0) | `particles.png` | `setMiscTex(slotIndex)` (16×16 grid, `Particle.cpp:288`) |
| `TERRAIN_TEXTURE` (1) | block terrain atlas | `setTex(textures, Tile::x->getTexture(face))` |
| `ITEM_TEXTURE` (2) | item atlas | `setTex(textures, item->getIcon(...))` |
| `DRAGON_BREATH_TEXTURE` (4) | dragon-breath sheet | 4J-added, used by `DragonBreathParticle` |

Most vanilla particles use `MISC_TEXTURE` + `setMiscTex(...)` — that's how
`SmokeParticle`/`FlameParticle` pick a cell from `particles.png`. `BarrierParticle`
is the atypical one that reuses a block texture. For Spark, `MISC_TEXTURE` with a
chosen slot index is the simplest:

```cpp
// SparkParticle.cpp
SparkParticle::SparkParticle(Level* level, double x, double y, double z,
                             double xa, double ya, double za)
	: Particle(level, x, y, z, xa, ya, za)
{
	rCol = gCol = 1.0f; bCol = 0.6f;     // yellow-ish
	alpha = 1.0f;
	size = 0.1f;
	gravity = 0.06f;
	lifetime = 12 + (int)(Math::random() * 8);
	setMiscTex(65);                       // a cell in particles.png (16*4 + 1)
}

int SparkParticle::getParticleTexture() { return ParticleEngine::MISC_TEXTURE; }

void SparkParticle::tick()
{
	xo = x; yo = y; zo = z;
	if (++age >= lifetime) { remove(); return; }
	yd -= 0.04 * gravity;
	move(xd, yd, zd);
	xd *= 0.98; yd *= 0.98; zd *= 0.98;
}
```

You can rely on the base `Particle::render` billboard, or override `render()`
like `BarrierParticle` does (`BarrierParticle.cpp:44`) if you need a fixed-size
quad or custom UVs.

## Step 5 — the dispatch case

Add your type to the `switch` in `LevelRenderer::addParticleInternal`
(`LevelRenderer.cpp:2997`+). The barrier case is the template
(`LevelRenderer.cpp:3164`):

```cpp
case eParticleType_barrier:
	particle = std::make_shared<BarrierParticle>(lev, x, y, z, xa, ya, za);
	break;
```

Add yours next to it:

```cpp
case eParticleType_spark:
	particle = std::make_shared<SparkParticle>(lev, x, y, z, xa, ya, za);
	break;
```

Include your header at the top of `LevelRenderer.cpp` (the barrier include is at
`LevelRenderer.cpp:14`). Anything the `switch` builds is handed to
`mc->particleEngine->add(particle)` automatically at the bottom of the function
(`LevelRenderer.cpp:3184`). The engine also rejects particles when the
`particleLevel` option is set to "minimal" (`LevelRenderer.cpp:2988`) and does
NaN-guarding on the coordinates (`:2864`) — you get that for free.

## Step 6 — spawn triggers from world code

World code never touches `LevelRenderer` directly — it calls
`Level::addParticle(ePARTICLE_TYPE, x, y, z, xd, yd, zd)` (`Level.cpp:1690`),
which loops the level's `LevelListener`s (the `LevelRenderer` is one) and
forwards the call. The canonical example is a block's `animateTick` — `TorchTile`
spawns smoke + flame each render tick (`TorchTile.cpp:224`):

```cpp
void TorchTile::animateTick(Level *level, int xt, int yt, int zt, Random *random)
{
	double x = xt + 0.5f, y = yt + 0.7f, z = zt + 0.5f;
	...
	level->addParticle(eParticleType_smoke, x, y, z, 0, 0, 0);
	level->addParticle(eParticleType_flame, x, y, z, 0, 0, 0);
}
```

So to emit Spark particles from a [block](/slop-docs/modding/adding-blocks/),
override `animateTick` on your `Tile` and call:

```cpp
void SparkEmitterTile::animateTick(Level *level, int x, int y, int z, Random *random)
{
	if (random->nextInt(4) != 0) return;   // throttle
	double px = x + 0.5, py = y + 1.0, pz = z + 0.5;
	level->addParticle(eParticleType_spark, px, py, pz,
	                   (random->nextDouble() - 0.5) * 0.1,
	                   random->nextDouble() * 0.1,
	                   (random->nextDouble() - 0.5) * 0.1);
}
```

`animateTick` runs on the client for visible blocks, so this needs no server
round-trip. If you want particles as a **result of a server event** (a mob dying,
a potion breaking), the server sends an event packet and the client's
`ClientConnection`/`LevelRenderer` calls `addParticle` on receipt — the barrier
particles are actually driven this way from `LevelRenderer::doBarrierParticles`
(`LevelRenderer.cpp:3192`), which only spawns them when the local player is
holding a barrier in creative.

## Step 7 — register the source files in CMake

Add the header + source to `Minecraft.Client/cmake/sources/Common.cmake`, in the
`_MINECRAFT_CLIENT_COMMON_NET_MINECRAFT_CLIENT_PARTICLE` group — where
`BarrierParticle.cpp`/`.h` are listed (`Common.cmake:683`):

```cmake
"${CMAKE_CURRENT_SOURCE_DIR}/SparkParticle.cpp"
"${CMAKE_CURRENT_SOURCE_DIR}/SparkParticle.h"
```

(Note: `BarrierParticle` is *also* referenced from
`Minecraft.World/cmake/sources/Common.cmake:1786` because it's shared — but new
client-only particles normally only need the client list.)

## Step 8 — texture / atlas wiring

If you used `MISC_TEXTURE`, your sprite must be a cell in `particles.png` (the
particle atlas under `Common/res/`), and `setMiscTex(slotIndex)` picks it by a
16-wide grid index (`slotIndex % 16`, `slotIndex / 16`). Add or reuse a cell and
pass its index. If you used `TERRAIN_TEXTURE`/`ITEM_TEXTURE`, the texture comes
from an existing block/item `Icon` (no new atlas art needed) — that's why
`BarrierParticle` can just reuse `Tile::barrier->getTexture(Facing::UP)`.

## Testing checklist

- [ ] `SparkParticle.cpp`/`.h` are in `Minecraft.Client/cmake/sources/Common.cmake`; the project configures and compiles.
- [ ] The build links — the dispatch `case` is present and the header included in `LevelRenderer.cpp`.
- [ ] Trigger a spawn (via your block's `animateTick` or a debug `Level::addParticle` call) and confirm the particle appears at the right position.
- [ ] The particle uses the right texture — correct cell of `particles.png` (MISC) or the right block/item icon (TERRAIN/ITEM); no white/untextured quad.
- [ ] Lifetime + motion look right — it fades/dies after `lifetime` ticks and doesn't linger forever.
- [ ] With the "minimal particles" video option set, decorative particles are correctly suppressed (the engine skips them when `particleLevel > 1`).
- [ ] No crash when spawned far from the player or at map edges (NaN guard handles bad coords, but verify).
- [ ] If server-driven, the particle appears on all clients that receive the event, not just the host.

## Where to go next

- [Particles reference](/slop-docs/client/particles/) — every `Particle` subclass and its `ePARTICLE_TYPE`.
- [Rendering pipeline](/slop-docs/client/rendering/) — where `ParticleEngine` sits in the frame.
- [Adding Blocks](/slop-docs/modding/adding-blocks/) — to emit particles from a custom block's `animateTick`.
- [Custom Sounds & Music](/slop-docs/modding/custom-sounds/) — pair a sound with your particle effect.

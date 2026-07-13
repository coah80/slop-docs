---
title: "Template: Custom Mob"
description: A complete recipe for adding a new hostile mob to neoLegacy — Monster subclass with AI goals, eINSTANCEOF type, EntityIO registration, spawn rules, and the client model, renderer, and dispatcher wiring.
---

This template walks you through adding a brand-new hostile mob — a **Frostmite**, a small
ice-dwelling arthropod — end to end. It is modeled directly on the real **Endermite**
(`Minecraft.World/Endermite.cpp`), which is one of the newest and simplest hostile mobs in the
codebase and the cleanest reference for "small hostile mob with basic AI." Where the Endermite
uses ender particles and silverfish sounds, the Frostmite is functionally identical scaffolding
you can reskin.

Read these first if you are new to the entity systems:

- [Entities & Mobs](/slop-docs/world/entities/) — the `Entity → LivingEntity → Mob → Monster`
  hierarchy and `EntityIO`.
- [AI Goals](/slop-docs/world/ai-goals/) — `Goal` / `GoalSelector` and the per-mob goal wiring.
- [Client Rendering](/slop-docs/client/rendering/) — `Model`, `MobRenderer`, and
  `EntityRenderDispatcher`.

The entity system in neoLegacy is a direct C++ port of the decompiled Java LCE code. A mob is:

1. a **server/logic class** in `Minecraft.World` (subclass of `Monster`),
2. a **type flag** in the `eINSTANCEOF` enum (`Class.h`),
3. a **registration** in `EntityIO::staticCtor` (id, name, spawn-egg colours),
4. **spawn-list entries** in the biomes it appears in (`Biome.cpp`),
5. a **client model + renderer** in `Minecraft.Client`, mapped by type in
   `EntityRenderDispatcher`.

## What you are building

| Piece | File | Kind |
|-------|------|------|
| `Frostmite` | `Minecraft.World/Frostmite.{h,cpp}` | new `Monster` subclass |
| `eTYPE_FROSTMITE` | `Minecraft.World/Class.h` | new type flag + `SubClass` entry |
| EntityIO registration | `Minecraft.World/EntityIO.cpp` | numeric id `69`, name `"Frostmite"` |
| Spawn rule | `Minecraft.World/Biome.cpp` | `MobSpawnerData` in cold biomes |
| `FrostmiteModel` | `Minecraft.Client/FrostmiteModel.{h,cpp}` | new `Model` |
| `FrostmiteRenderer` | `Minecraft.Client/FrostmiteRenderer.{h,cpp}` | new `MobRenderer` |
| Renderer mapping | `Minecraft.Client/EntityRenderDispatcher.cpp` | `renderers[eTYPE_FROSTMITE]` |
| Texture path | `Minecraft.Client/Textures.{h,cpp}` | `TN_MOB_FROSTMITE` → `mob/frostmite` |
| Egg colours | `Minecraft.Client/Common/App_enums.h` | two `eMinecraftColour_*` entries |
| String | `stringsGeneric.xml` | `IDS_FROSTMITE` |

:::note[Choosing a free entity id]
The last hostile numeric id today is Guardian `68` (`EntityIO.cpp:103`); passive mobs start at
`90`. So `69` is the next free hostile id. Confirm it is unused in your checkout before starting
(grep `EntityIO.cpp` for `, 69)`).

**Changed in v1.1.0b:** v1.1.0b added the **PolarBear** as a passive animal at numeric id `107`
(`eTYPE_POLARBEAR = eTYPE_ANIMAL | eTYPE_ANIMALS_SPAWN_LIMIT_CHECK | 0x6`), so `68` is still the
last *hostile* id and `69` is still free. Note also that the discriminator `0x12` now appears in
`Class.h` for the new `eTYPE_BANNERTILEENTITY` (`eTYPE_TILEENTITY | 0x12`) — that is a **tile
entity**, a different base flag from `eTYPE_MONSTER`, so it does **not** collide with this
template's `eTYPE_FROSTMITE = eTYPE_MONSTER | … | 0x12`. `0x12` is still the next free discriminator
in the `eTYPE_MONSTER` run.
:::

## Step 1 — the mob logic class

Create `Minecraft.World/Frostmite.h`. This mirrors `Endermite.h` exactly — a minimal `Monster`
subclass with the standard virtual overrides:

```cpp
#pragma once

#include "Monster.h"

class Frostmite : public Monster
{
public:
	eINSTANCEOF GetType() { return eTYPE_FROSTMITE; }
	static Entity *create(Level *level) { return new Frostmite(level); }

private:
	int lifetime;
	bool playerSpawned = false;

public:
	Frostmite(Level *level);

protected:
	virtual void registerAttributes();
	virtual bool makeStepSound();

	virtual int getAmbientSound();
	virtual int getHurtSound();
	virtual int getDeathSound();

public:
	virtual void tick();
	virtual bool useNewAi() { return true; }

protected:
	virtual void playStepSound(int xt, int yt, int zt, int t);
	virtual int getDeathLoot();

public:
	virtual bool canSpawn();
	virtual MobType getMobType();
	bool isSpawnedByPlayer() { return playerSpawned; }
	void setSpawnedByPlayer(bool spawned) { playerSpawned = spawned; }
};
```

Two members are non-negotiable for `EntityIO` to work:

- `static Entity *create(Level *level)` — the factory function `EntityIO` stores and calls.
- `eINSTANCEOF GetType()` — returns the type flag used for `instanceof` tests and renderer
  dispatch.

Now create `Minecraft.World/Frostmite.cpp`. This is the Endermite body adapted; the AI goal set,
attributes, and lifetime logic are unchanged (they are the standard small-hostile pattern):

```cpp
#include "stdafx.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.phys.h"
#include "net.minecraft.world.damagesource.h"
#include "net.minecraft.world.entity.ai.attributes.h"
#include "net.minecraft.world.entity.monster.h"
#include "net.minecraft.h"
#include "Frostmite.h"
#include "SoundTypes.h"
#include "Random.h"
#include "net.minecraft.world.entity.ai.goal.h"
#include "net.minecraft.world.entity.ai.goal.target.h"
#include "net.minecraft.world.entity.ai.navigation.h"
#include "net.minecraft.world.entity.player.h"

Frostmite::Frostmite(Level *level) : Monster(level), lifetime(0), playerSpawned(false)
{
	this->defineSynchedData();
	registerAttributes();
	setHealth(getMaxHealth());

	setSize(0.4f, 0.3f);
	xp = 3;

	getNavigation()->setCanOpenDoors(false);
	goalSelector.addGoal(1, new FloatGoal(this));
	goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.0, false));
	goalSelector.addGoal(3, new RandomStrollGoal(this, 1.0));
	goalSelector.addGoal(4, new LookAtPlayerGoal(this, typeid(Player), 8));
	goalSelector.addGoal(5, new RandomLookAroundGoal(this));

	targetSelector.addGoal(1, new HurtByTargetGoal(this, true));
	targetSelector.addGoal(2, new NearestAttackableTargetGoal(this, typeid(Player), 0, true));
}

void Frostmite::registerAttributes()
{
	Monster::registerAttributes();

	getAttribute(SharedMonsterAttributes::FOLLOW_RANGE)->setBaseValue(8.0f);
	getAttribute(SharedMonsterAttributes::MAX_HEALTH)->setBaseValue(8.0f);
	getAttribute(SharedMonsterAttributes::MOVEMENT_SPEED)->setBaseValue(0.25f);
	getAttribute(SharedMonsterAttributes::ATTACK_DAMAGE)->setBaseValue(2.0f);
}

bool Frostmite::makeStepSound()
{
	return false;
}

int Frostmite::getAmbientSound() { return eSoundType_MOB_SILVERFISH_AMBIENT; }
int Frostmite::getHurtSound()    { return eSoundType_MOB_SILVERFISH_HURT; }
int Frostmite::getDeathSound()   { return eSoundType_MOB_SILVERFISH_DEATH; }

void Frostmite::playStepSound(int xt, int yt, int zt, int t)
{
	playSound(eSoundType_MOB_SILVERFISH_STEP, 0.15f, 1);
}

int Frostmite::getDeathLoot()
{
	return 0;   // drops nothing; set to an Item id to drop loot
}

void Frostmite::tick()
{
	yBodyRot = yRot;
	Monster::tick();

	if (level->isClientSide)
	{
		for (int i = 0; i < 2; i++)
		{
			level->addParticle(eParticleType_snowballpoof,
				x + (random->nextDouble() - 0.5) * bbWidth,
				y + random->nextDouble() * bbHeight - 0.25f,
				z + (random->nextDouble() - 0.5) * bbWidth,
				(random->nextDouble() - 0.5) * 2, -random->nextDouble(),
				(random->nextDouble() - 0.5) * 2);
		}
	}
	else
	{
		if (!this->isPersistenceRequired())
			++lifetime;

		if (lifetime >= 2400)
			remove();   // despawns after ~2 minutes like the endermite
	}
}

bool Frostmite::canSpawn()
{
	if (Monster::canSpawn())
	{
		shared_ptr<Player> nearestPlayer = level->getNearestPlayer(shared_from_this(), 5.0);
		return nearestPlayer == nullptr;
	}
	return false;
}

MobType Frostmite::getMobType()
{
	return ARTHROPOD;   // arthropods take extra Bane-of-Arthropods damage; MobType.h:8
}
```

Notes:

- **`defineSynchedData()` + `registerAttributes()` + `setHealth(getMaxHealth())`** in the
  constructor is the required init trio for every `Mob`. Skipping `defineSynchedData` leaves the
  entity's synched fields uninitialized and it will assert on spawn.
- **Goals** are added directly in the constructor (there is no central goal registry — see the
  Endermite, Zombie, and Wolf constructors for the same pattern). `goalSelector` drives behaviour;
  `targetSelector` drives who to attack. The numbers are priorities (lower runs first).
- **`useNewAi()` returning `true`** opts this mob into the goal-based AI path rather than the
  legacy hard-coded `updateAi`.
- **Particle type**: `eParticleType_snowballpoof` gives a frosty puff; the Endermite uses
  `eParticleType_ender`. Any `eParticleType_*` from the particle enum works — pick one that exists
  in your checkout.
- **`getMobType()` returning `ARTHROPOD`** (`MobType.h`) makes Bane of Arthropods apply, matching
  the Endermite/Silverfish/Spider family.

## Step 2 — register the type flag

Edit `Minecraft.World/Class.h`. The hostile-mob type flags are a run of
`eTYPE_MONSTER | eTYPE_VALID_IN_SPAWNER_FLAG | <discriminator>` entries. The last two are
`eTYPE_ENDERMITE = … | 0x10` (`Class.h:175`) and `eTYPE_ELDER_GUARDIAN = … | 0x11` (`:176`). Add
the next free discriminator (`0x12`) directly after:

```cpp
						eTYPE_FROSTMITE = eTYPE_MONSTER | eTYPE_VALID_IN_SPAWNER_FLAG | 0x12,
```

Then register it in the `SubClass` table so `instanceof` walks the parent chain correctly. The
Endermite entry is at `Class.h:497`; add alongside it:

```cpp
		classes->push_back( SUBCLASS(eTYPE_FROSTMITE)->addParent(eTYPE_MONSTER)->addParent(eTYPE_VALID_IN_SPAWNER_FLAG) );
```

`eTYPE_VALID_IN_SPAWNER_FLAG` is what lets the mob be placed in a mob spawner / spawn egg. Omit it
only for mobs that should never appear in a spawner.

## Step 3 — register in EntityIO

Edit `Minecraft.World/EntityIO.cpp`. Registration happens in `EntityIO::staticCtor` (`:45`) via
`setId`. The 7-argument overload (`EntityIO.cpp:38`) also registers the mob as spawn-egg-able in
creative by inserting into `idsSpawnableInCreative`:

```cpp
void EntityIO::setId(entityCreateFn createFn, eINSTANCEOF clas, const wstring &id, int idNum,
                     eMinecraftColour color1, eMinecraftColour color2, int nameId);
```

Add the Frostmite next to the Guardian (`EntityIO.cpp:103`), using free numeric id `69`:

```cpp
	setId(Frostmite::create, eTYPE_FROSTMITE, L"Frostmite", 69,
	      eMinecraftColour_Mob_Frostmite_Colour1,
	      eMinecraftColour_Mob_Frostmite_Colour2, IDS_FROSTMITE);
```

You also need `Frostmite.h` visible in this translation unit. `EntityIO.cpp` includes the monster
umbrella header `net.minecraft.world.entity.monster.h` (`:9`) — add your class there, or add a
direct `#include "Frostmite.h"` at the top of `EntityIO.cpp` next to the other entity includes.

- **`L"Frostmite"`** is the NBT save id — it is what gets written into the world save, so never
  rename it once shipped.
- **`69`** is the numeric network/save id.
- The **two colours** are the spawn-egg base/spots colours (step 6). The single `spawn_egg` item
  (`spawn_egg_Id = 383`, constructed as `new SpawnEggItem(127)` at `Item.cpp:462`) reads these
  per-mob, so you do **not** register a per-mob egg item.
- **`IDS_FROSTMITE`** is the display-name string (step 7).

## Step 4 — spawn rules

Edit `Minecraft.World/Biome.cpp`. Natural spawning is driven by per-biome `MobSpawnerData` lists.
The base biome constructor pushes the overworld hostiles into `enemies` (`Biome.cpp:193`–`199`):

```cpp
    enemies.push_back(new MobSpawnerData(eTYPE_SPIDER,    10, 4, 4));
    enemies.push_back(new MobSpawnerData(eTYPE_ZOMBIE,    10, 4, 4));
    enemies.push_back(new MobSpawnerData(eTYPE_SKELETON,  10, 4, 4));
    enemies.push_back(new MobSpawnerData(eTYPE_CREEPER,   10, 4, 4));
    enemies.push_back(new MobSpawnerData(eTYPE_SLIME,     10, 4, 4));
    enemies.push_back(new MobSpawnerData(eTYPE_ENDERMAN,  1,  1, 4));
    enemies.push_back(new MobSpawnerData(eTYPE_WITCH,     1,  1, 1));
```

`MobSpawnerData(type, weight, minGroup, maxGroup)` — higher weight = more common. To make the
Frostmite a rare everywhere-spawn, add it to this base list:

```cpp
    enemies.push_back(new MobSpawnerData(eTYPE_FROSTMITE, 2, 1, 2));
```

**To restrict it to cold biomes instead**, do not add it to the base list. Instead push it only
inside the constructors of the snowy biomes (`IceBiome`, `TaigaBiome`) — each biome subclass calls
the base and may append its own `enemies`/`friendlies` entries. Adding it there gives you a
biome-specific spawn without touching every other biome. See
[Biomes](/slop-docs/world/biomes/) for which subclass owns which biome id.

`canSpawn()` in step 1 still gates the actual placement (dark enough, no player within 5 blocks),
so a spawn-list entry alone will not flood the world.

## Step 5 — the client model

Create `Minecraft.Client/FrostmiteModel.h` and `.cpp`. This mirrors `EndermiteModel` — a
segmented body built from `ModelPart`s. `Model`, `ModelPart`, and `Cube` are existing client
headers.

`FrostmiteModel.h`:

```cpp
#pragma once

#include "Model.h"

class FrostmiteModel : public Model
{
private:
	static const int BODY_COUNT = 4;

private:
	ModelPartArray bodyParts;
	float zPlacement[BODY_COUNT];

	static const int BODY_SIZES[BODY_COUNT][3];
	static const int BODY_TEXS[BODY_COUNT][2];

public:
	FrostmiteModel();

	int modelVersion();
	void render(shared_ptr<Entity> entity, float time, float r, float bob, float yRot, float xRot, float scale, bool usecompiled);
	virtual void setupAnim(float time, float r, float bob, float yRot, float xRot, float scale, shared_ptr<Entity> entity, unsigned int uiBitmaskOverrideAnim=0);
};
```

`FrostmiteModel.cpp`:

```cpp
#include "stdafx.h"
#include "FrostmiteModel.h"
#include "Cube.h"
#include "../Minecraft.World/Mth.h"
#include "ModelPart.h"

const int FrostmiteModel::BODY_SIZES[BODY_COUNT][3] = {
	{ 4, 3, 2 },
	{ 6, 4, 5 },
	{ 3, 3, 1 },
	{ 1, 2, 1 }
};

const int FrostmiteModel::BODY_TEXS[BODY_COUNT][2] = {
	{ 0, 0 },
	{ 0, 5 },
	{ 0, 14 },
	{ 0, 18 }
};

FrostmiteModel::FrostmiteModel()
{
	bodyParts = ModelPartArray(BODY_COUNT);
	float placement = -3.5f;

	for (unsigned int i = 0; i < bodyParts.length; i++)
	{
		bodyParts[i] = new ModelPart(this, BODY_TEXS[i][0], BODY_TEXS[i][1]);
		bodyParts[i]->addBox(BODY_SIZES[i][0] * -0.5f, 0, BODY_SIZES[i][2] * -0.5f,
			BODY_SIZES[i][0], BODY_SIZES[i][1], BODY_SIZES[i][2]);
		bodyParts[i]->setPos(0.0f, 24.0f - static_cast<float>(BODY_SIZES[i][1]), placement);
		zPlacement[i] = placement;

		if (i < bodyParts.length - 1)
			placement += (BODY_SIZES[i][2] + BODY_SIZES[i + 1][2]) * .5f;
	}

	for (unsigned int i = 0; i < bodyParts.length; i++)
		bodyParts[i]->compile(1.0f / 16.0f);
}

int FrostmiteModel::modelVersion()
{
	return 38;
}

void FrostmiteModel::render(shared_ptr<Entity> entity, float time, float r, float bob, float yRot, float xRot, float scale, bool usecompiled)
{
	setupAnim(time, r, bob, yRot, xRot, scale, entity);

	for (unsigned int i = 0; i < bodyParts.length; i++)
		bodyParts[i]->render(scale, usecompiled);
}

void FrostmiteModel::setupAnim(float time, float r, float bob, float yRot, float xRot, float scale, shared_ptr<Entity> entity, unsigned int uiBitmaskOverrideAnim)
{
	for (unsigned int i = 0; i < bodyParts.length; i++)
	{
		bodyParts[i]->yRot = Mth::cos(bob * .9f + i * .15f * PI) * PI * .01f * (1 + abs(static_cast<int>(i) - 2));
		bodyParts[i]->x    = Mth::sin(bob * .9f + i * .15f * PI) * PI * .1f  * abs(static_cast<int>(i) - 2);
	}
}
```

Key points from the real Endermite model:

- **`BODY_TEXS[i] = {u, v}`** are the top-left UV offsets into the mob texture for each part's
  box. Your `mob/frostmite.png` must have box faces laid out so those offsets land on the right
  pixels. Copying the Endermite's UV layout means you can copy its texture layout too.
- **`addBox(x, y, z, w, h, d)`** builds the cube; **`setPos`** positions it; **`compile(1/16)`**
  bakes it at the standard 1-unit-per-16-pixels model scale.
- **`setupAnim`** is a simple sinusoidal wiggle down the segments — reuse or replace freely.

## Step 6 — the client renderer

Create `Minecraft.Client/FrostmiteRenderer.h` and `.cpp`, mirroring `EndermiteRenderer`. A
`MobRenderer` takes a model and a shadow radius and returns the mob's texture.

`FrostmiteRenderer.h`:

```cpp
#pragma once
#include "MobRenderer.h"

class Frostmite;

class FrostmiteRenderer : public MobRenderer
{
private:
	static ResourceLocation FROSTMITE_LOCATION;

public:
	FrostmiteRenderer();

protected:
	float getFlipDegrees(shared_ptr<LivingEntity> mob);

public:
	virtual void render(shared_ptr<Entity> _mob, double x, double y, double z, float rot, float a);
	virtual ResourceLocation *getTextureLocation(shared_ptr<Entity> mob);

protected:
	virtual int prepareArmor(shared_ptr<LivingEntity> mob, int layer, float a);
};
```

`FrostmiteRenderer.cpp`:

```cpp
#include "stdafx.h"
#include "FrostmiteRenderer.h"
#include "../Minecraft.World/net.minecraft.world.entity.monster.h"
#include "FrostmiteModel.h"

ResourceLocation FrostmiteRenderer::FROSTMITE_LOCATION(TN_MOB_FROSTMITE);

FrostmiteRenderer::FrostmiteRenderer() : MobRenderer(new FrostmiteModel(), 0.3f)
{
}

float FrostmiteRenderer::getFlipDegrees(shared_ptr<LivingEntity> mob)
{
	return 180;
}

void FrostmiteRenderer::render(shared_ptr<Entity> _mob, double x, double y, double z, float rot, float a)
{
	MobRenderer::render(_mob, x, y, z, rot, a);
}

ResourceLocation *FrostmiteRenderer::getTextureLocation(shared_ptr<Entity> mob)
{
	return &FROSTMITE_LOCATION;
}

int FrostmiteRenderer::prepareArmor(shared_ptr<LivingEntity> mob, int layer, float a)
{
	return -1;   // no armor layer
}
```

`MobRenderer(new FrostmiteModel(), 0.3f)` — the `0.3f` is the shadow radius (Endermite uses the
same). `getTextureLocation` returns the `ResourceLocation` built from the texture-name enum
`TN_MOB_FROSTMITE` (step 8).

## Step 7 — map the renderer by type

Edit `Minecraft.Client/EntityRenderDispatcher.cpp`. The dispatcher's init builds a
`renderers[eINSTANCEOF] = new …Renderer()` map (`:106`+). Add the include next to the Endermite one
(`:87`):

```cpp
#include "FrostmiteRenderer.h"
```

and the mapping next to the Endermite mapping (`:184`):

```cpp
	renderers[eTYPE_FROSTMITE] = new FrostmiteRenderer();
```

After the map is filled, the dispatcher runs `it.second->init(this)` over every renderer
(`EntityRenderDispatcher.cpp:187`), so no extra init call is needed. Dispatch uses the entity's
`GetType()` (step 1) to find the renderer, falling back up the parent chain to
`renderers[eTYPE_MOB]` if a leaf type is unmapped — which is exactly why you must add this line, or
the Frostmite renders as a generic humanoid.

## Step 8 — texture path

Edit `Minecraft.Client/Textures.h` and `Textures.cpp`. Texture names are a `TN_*` enum indexing a
parallel path array `Textures::preLoaded[TN_COUNT]` (`Textures.cpp:27`); at load,
`loadTexture(i, preLoaded[i] + L".png")` (`Textures.cpp:325`) turns `mob/frostmite` into
`res/mob/frostmite.png`.

**8a.** Add the enum constant in `Textures.h` next to `TN_MOB_ENDERMITE` (`:179`):

```cpp
		TN_MOB_FROSTMITE,
```

**8b.** Add the matching path string in `Textures.cpp` **at the same ordinal position** in the
`preLoaded[]` array, next to `L"mob/endermite"` (`Textures.cpp:193`):

```cpp
	L"mob/frostmite",
```

:::caution[Keep enum and array in lockstep]
`preLoaded[]` is indexed by the `TN_*` enum value, so the string's position in the array **must**
match the enum constant's position. Insert both in the same relative spot (right after the
Endermite entry in each file). A mismatch silently loads the wrong texture for several mobs.
:::

**8c.** Paint a `frostmite.png` mob texture and drop it in the mob texture directory —
`Minecraft.Client/Common/res/mob/frostmite.png` (this is where `endermite.png`, `silverfish.png`,
`guardian.png` live). Lay out the box faces to match the model's `BODY_TEXS` UV offsets from step 5.
(Create the PNG in an image editor; do not edit it through docs tooling.)

## Step 9 — spawn-egg colours

Edit `Minecraft.Client/Common/App_enums.h`. The per-mob egg colours are a run of
`eMinecraftColour_Mob_<Name>_Colour1/2` enum values (`:466`+ for Endermite, followed by Guardian
and Elder Guardian). Add two entries for the Frostmite alongside them:

```cpp
	eMinecraftColour_Mob_Frostmite_Colour1,
	eMinecraftColour_Mob_Frostmite_Colour2,
```

These are the two colours passed to `setId` in step 3. They drive the spawn egg's base and spot
tint in the creative menu. Append them near the other mob colours.

The actual RGB values are resolved at runtime through
`getColourTable()->getColor(eMinecraftColour_Mob_Frostmite_Colour1)`, which looks the enum up in
`colours.xml` by name (the lookup strips the `eMinecraftColour_` prefix, so
`eMinecraftColour_Mob_Frostmite_Colour1` → `<colour name="Mob_Frostmite_Colour1">`). Add two
entries to `Minecraft.Client/Common/res/TitleUpdate/res/colours.xml`, next to the existing mob
colours (e.g. `Mob_Zombie_Colour1` / `Mob_Creeper_Colour1`):

```xml
  <colour name="Mob_Frostmite_Colour1" value="a8d0e6"/>
  <colour name="Mob_Frostmite_Colour2" value="4a708a"/>
```

`value` is a hex RGB. Without these entries the egg falls back to a default/black tint.

## Step 10 — the display-name string

Add `IDS_FROSTMITE` to `Minecraft.Client/Windows64Media/loc/stringsGeneric.xml`, copying the
Endermite/Guardian nodes as a template:

```xml
	<data name="IDS_FROSTMITE">
		<value>Frostmite</value>
	</data>
```

The build regenerates `Windows64Media/strings.h` from the XML (the checked-in `old_strings.h` is a
reference dump, not the compiled header — note it lists `IDS_SILVERFISH = 493` but not
`IDS_ENDERMITE`, which the XML supplies at build time). If your build ships a static `strings.h`
instead of regenerating it, also add a `#define IDS_FROSTMITE <next-free-number>` there — a missing
`IDS_FROSTMITE` macro is a compile error in `EntityIO.cpp`.

## Step 11 — register the new source files in CMake

`Minecraft.World` and `Minecraft.Client` use **explicit** source lists (no glob), so every new
`.cpp`/`.h` must be added.

**World** — edit `Minecraft.World/cmake/sources/Common.cmake`, next to the Endermite entries
(`:904`–`905`):

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/Frostmite.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/Frostmite.h"
```

**Client** — edit `Minecraft.Client/cmake/sources/Common.cmake`, next to the Endermite renderer /
model entries (`EndermiteModel` at `:629`–`630`, `EndermiteRenderer` at `:928`–`929`):

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/FrostmiteModel.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/FrostmiteModel.h"
  "${CMAKE_CURRENT_SOURCE_DIR}/FrostmiteRenderer.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/FrostmiteRenderer.h"
```

## Build & test checklist

1. **Build** `Minecraft.World` + `Minecraft.Client`. Missing CMake entries → unresolved-symbol
   link errors for `Frostmite::create`. Missing `IDS_FROSTMITE` → compile error in `EntityIO.cpp`.
2. **Spawn egg.** Open creative → the spawn-egg section should show a Frostmite egg tinted with
   your two colours and named "Frostmite". Spawn one.
3. **Rendering.** Confirm it renders with the frost model + texture, **not** as a generic
   humanoid. A humanoid means `renderers[eTYPE_FROSTMITE]` (step 7) is missing or the type flag
   is wrong. A magenta/black missing texture means `TN_MOB_FROSTMITE` / `preLoaded[]` are out of
   sync (step 8).
4. **AI.** Confirm it floats in water (`FloatGoal`), wanders (`RandomStrollGoal`), looks at you
   (`LookAtPlayerGoal`), and melee-attacks when you get close (`MeleeAttackGoal` +
   `NearestAttackableTargetGoal`). Hit it → it retaliates (`HurtByTargetGoal`).
5. **Attributes.** 8 HP (4 hearts), 2 attack damage, drops 3 XP on death, drops no items.
6. **Despawn.** Leave a naturally-spawned one alone ~2 minutes → it should despawn (`lifetime >=
   2400`). A name-tagged / persistence-required one should not.
7. **Natural spawning.** With the spawn rule from step 4, roam the target biomes at night /
   underground and confirm Frostmites spawn at roughly the weight you set. If none appear, verify
   the `MobSpawnerData` entry and that `canSpawn()` conditions (darkness, no nearby player) can be
   met.
8. **Save/load.** Spawn one, save and reload the world → it should reload as a Frostmite (proves
   the `L"Frostmite"` save id and numeric id `69` round-trip through `EntityIO::loadStatic`).

## Related pages

- [Template: Ruby Ore & Tools](/slop-docs/templates/ruby-tools/) — the same registration idioms
  for blocks and items.
- [Entities & Mobs](/slop-docs/world/entities/) · [AI Goals](/slop-docs/world/ai-goals/) ·
  [Client Rendering](/slop-docs/client/rendering/) · [Biomes](/slop-docs/world/biomes/)
- Source: [`Endermite.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/Endermite.cpp),
  [`EntityIO.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.World/EntityIO.cpp),
  [`EndermiteModel.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/EndermiteModel.cpp),
  [`EntityRenderDispatcher.cpp`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/src/branch/main/Minecraft.Client/EntityRenderDispatcher.cpp).

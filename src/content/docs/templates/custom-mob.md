---
title: "Template: Custom Mob"
description: A complete starter mod that adds a new hostile mob with AI, model, renderer, sounds, and drops.
---

This template walks you through adding a completely new hostile mob to LCE from scratch. We are building a **Shadow Walker**, a tall dark creature that spawns in caves, hunts players, and drops a custom item when killed. By the end you will have:

- A **ShadowWalker** entity class extending `Monster` with custom health and damage
- A **Goal-based AI** that targets players, attacks in melee, and wanders around
- A **custom model** built from `ModelPart` cubes (tall humanoid with long arms)
- A **custom renderer** that draws the model with your texture
- **Entity registration** so the game knows it exists (save/load, spawn eggs, networking)
- **Natural spawning** in dark areas and specific biomes
- **Custom loot drops** on death
- **Custom sounds** for ambient, hurt, and death

That is a lot of systems, but each piece is small. Let's go.

## Systems you will learn

| System | What It Does | Reference |
|--------|-------------|-----------|
| Entity hierarchy | How `Entity -> Mob -> PathfinderMob -> Monster` works | [Adding Entities](/slop-docs/modding/adding-entities/) |
| GoalSelector AI | Priority-based behavior goals | [Custom AI](/slop-docs/modding/custom-ai/) |
| ModelPart models | Box-based 3D models with animation | [Entity Models](/slop-docs/modding/entity-models/) |
| EntityRenderer | Drawing entities in the world | [Adding Entities](/slop-docs/modding/adding-entities/) |
| EntityIO | Registration, save/load, spawn eggs | [Adding Entities](/slop-docs/modding/adding-entities/) |
| Biome spawning | Natural mob spawning rules | [Adding Entities](/slop-docs/modding/adding-entities/) |
| Mob drops | Death loot system | [Custom Loot](/slop-docs/modding/custom-loot/) |
| Sound events | Ambient, hurt, death sounds | [Custom Sounds](/slop-docs/modding/custom-sounds/) |

## Before you start

Make sure you can build the project. See [Getting Started](/slop-docs/modding/getting-started/) if you have not done that yet. You should also read [Adding Entities](/slop-docs/modding/adding-entities/) first, since this guide builds on that foundation.

## Files you will create

| File | Purpose |
|------|---------|
| `Minecraft.World/ShadowWalker.h` | Entity class header |
| `Minecraft.World/ShadowWalker.cpp` | Entity class with AI, sounds, drops |
| `Minecraft.Client/ShadowWalkerModel.h` | Model class header |
| `Minecraft.Client/ShadowWalkerModel.cpp` | Model geometry and animation |
| `Minecraft.Client/ShadowWalkerRenderer.h` | Renderer class header |
| `Minecraft.Client/ShadowWalkerRenderer.cpp` | Renderer that draws the model |

## Files you will modify

| File | What you change |
|------|----------------|
| `Minecraft.World/Definitions.h` | Add `eTYPE_SHADOW_WALKER` to the `eINSTANCEOF` enum |
| `Minecraft.World/SoundTypes.h` | Add three sound enum entries |
| `Minecraft.World/EntityIO.cpp` | Register the mob with `setId()` |
| `Minecraft.World/net.minecraft.world.entity.monster.h` | Add `#include "ShadowWalker.h"` so EntityIO can see the class |
| `Minecraft.Client/EntityRenderDispatcher.cpp` | Register the renderer in the `renderers` map |
| `Minecraft.Client/Textures.h` | Add `TN_MOB_SHADOW_WALKER` texture enum entry |
| `Minecraft.Client/Textures.cpp` | Map the enum to a file path in `preLoaded[]` |
| `Minecraft.Client/Common/Audio/SoundNames.cpp` | Add three sound name strings |
| `Minecraft.World/PlainsBiome.cpp` | Add to the `enemies` spawn list (optional) |
| `Minecraft.World/ForestBiome.cpp` | Add to the `enemies` spawn list (optional) |
| `Minecraft.World/Biome.cpp` | Add to the default spawn list (optional) |
| `Minecraft.World/App_enums.h` | Add two `eMinecraftColour` entries for the spawn egg |
| `cmake/Sources.cmake` | Add new source files to the build |

## Includes you will add

**In `Minecraft.World/net.minecraft.world.entity.monster.h`**, add at the bottom:

```cpp
#include "ShadowWalker.h"
```

This is the umbrella header that EntityIO.cpp uses to pull in all monster classes. Without this, EntityIO will not find your class. The existing file looks like this:

```cpp
#include "Enemy.h"
#include "Monster.h"
#include "Creeper.h"
// ... other monsters ...
#include "Blaze.h"
#include "LavaSlime.h"
```

**In `Minecraft.Client/EntityRenderDispatcher.cpp`**, add with the other renderer includes (around line 16-50):

```cpp
#include "ShadowWalkerRenderer.h"
#include "ShadowWalkerModel.h"
```

EntityRenderDispatcher already includes the monster umbrella header `net.minecraft.world.entity.monster.h`, so it can see `eTYPE_SHADOW_WALKER` without any extra includes.

**In `Minecraft.World/EntityIO.cpp`**, no extra includes needed. It already includes `net.minecraft.world.entity.monster.h`, which will pull in your `ShadowWalker.h` once you add it there.

## Sources.cmake entries

Add your new files to `cmake/Sources.cmake`. The entity class goes under `MINECRAFT_WORLD_SOURCES`, the model and renderer go under `MINECRAFT_CLIENT_SOURCES`:

```cmake
# In MINECRAFT_WORLD_SOURCES:
"ShadowWalker.cpp"

# In MINECRAFT_CLIENT_SOURCES:
"ShadowWalkerModel.cpp"
"ShadowWalkerRenderer.cpp"
```

Header files are not listed in Sources.cmake for this project. Only `.cpp` files.

## Step 1: Pick your IDs

Every entity needs a few unique identifiers. Check your codebase to make sure these are not already taken.

| Thing | Type | Value |
|-------|------|-------|
| Entity type enum | `eINSTANCEOF` | `eTYPE_SHADOW_WALKER` |
| Entity numeric ID | EntityIO | `64` (next open hostile slot after EnderDragon at 63) |
| Texture constant | Textures.h | `TN_MOB_SHADOW_WALKER` |
| Sound enum entries | SoundTypes.h | `eSoundType_MOB_SHADOWWALKER_AMBIENT`, `_HURT`, `_DEATH` |

## Step 2: Add the eINSTANCEOF type

Open `Minecraft.World/Definitions.h` and add a new entry to the `eINSTANCEOF` enum:

```cpp
// In the eINSTANCEOF enum, after eTYPE_ENDERDRAGON
eTYPE_SHADOW_WALKER,
```

This is how the engine identifies entity types at runtime without using `dynamic_cast`.

## Step 3: Create the entity class

This is the core of your mob. The Shadow Walker extends `Monster`, which gives us hostile mob behavior, dark-spawn checks, and burning in daylight for free.

### ShadowWalker.h

Create `Minecraft.World/ShadowWalker.h`:

```cpp
#pragma once
#include "Monster.h"

class ShadowWalker : public Monster
{
public:
    eINSTANCEOF GetType() { return eTYPE_SHADOW_WALKER; }
    static Entity *create(Level *level) { return new ShadowWalker(level); }

    ShadowWalker(Level *level);

    virtual int getMaxHealth();

protected:
    virtual bool useNewAi();
    virtual void defineSynchedData();
    virtual int getAmbientSound();
    virtual int getHurtSound();
    virtual int getDeathSound();
    virtual int getDeathLoot();
    virtual void dropDeathLoot(bool wasKilledByPlayer, int playerBonusLevel);
    virtual MobType getMobType();

public:
    virtual void addAdditonalSaveData(CompoundTag *tag);
    virtual void readAdditionalSaveData(CompoundTag *tag);
};
```

Two important things here:

- The static `create` function is the **factory** that `EntityIO` calls when loading from saves or creating from spawn eggs.
- `useNewAi()` must return `true` to enable the `GoalSelector` AI system.

### ShadowWalker.cpp

Create `Minecraft.World/ShadowWalker.cpp`:

```cpp
#include "stdafx.h"
#include "ShadowWalker.h"
#include "net.minecraft.world.entity.ai.goal.h"
#include "net.minecraft.world.entity.ai.goal.target.h"
#include "net.minecraft.world.entity.ai.navigation.h"
#include "Player.h"
#include "Item.h"
#include "ItemInstance.h"

ShadowWalker::ShadowWalker(Level *level) : Monster(level)
{
    // IMPORTANT: Call defineSynchedData() here because virtual
    // dispatch is not available in the Entity base constructor.
    this->defineSynchedData();

    // Set health after synched data is ready
    health = getMaxHealth();

    // Texture (we will register this constant in Step 8)
    this->textureIdx = TN_MOB_SHADOW_WALKER;

    // Movement and combat stats
    runSpeed = 0.3f;       // Slightly faster than a zombie (0.23)
    attackDamage = 6;      // 3 hearts of damage per hit

    // Bounding box: tall and narrow
    setSize(0.6f, 2.4f);

    // Navigation
    getNavigation()->setCanOpenDoors(false);
    getNavigation()->setAvoidWater(true);

    // --- Behavior Goals (lower number = higher priority) ---
    goalSelector.addGoal(0, new FloatGoal(this));
    goalSelector.addGoal(1, new MeleeAttackGoal(this, eTYPE_PLAYER, runSpeed, false));
    goalSelector.addGoal(2, new MoveTowardsRestrictionGoal(this, runSpeed));
    goalSelector.addGoal(3, new RandomStrollGoal(this, 0.8f));
    goalSelector.addGoal(4, new LookAtPlayerGoal(this, typeid(Player), 12.0f));
    goalSelector.addGoal(5, new RandomLookAroundGoal(this));

    // --- Targeting Goals ---
    targetSelector.addGoal(1, new HurtByTargetGoal(this, false));
    targetSelector.addGoal(2, new NearestAttackableTargetGoal(
        this, typeid(Player), 16, 0, true));
}
```

Let's break down the AI setup:

| Priority | Goal | What It Does |
|----------|------|-------------|
| 0 | `FloatGoal` | Swim when in water so it does not drown |
| 1 | `MeleeAttackGoal` | Walk to target and hit them. The `false` means it does not need line of sight to start. |
| 2 | `MoveTowardsRestrictionGoal` | Stay near its spawn area |
| 3 | `RandomStrollGoal` | Wander around at 0.8x speed when idle |
| 4 | `LookAtPlayerGoal` | Turn to face any player within 12 blocks |
| 5 | `RandomLookAroundGoal` | Look in random directions when nothing else is happening |

And the targeting goals:

| Priority | Goal | What It Does |
|----------|------|-------------|
| 1 | `HurtByTargetGoal` | Target whatever just hit us. The `false` means allies do not join in. |
| 2 | `NearestAttackableTargetGoal` | Actively hunt the nearest player within 16 blocks |

The targeting goals control **who** to attack. The behavior goals control **how** to attack and what to do otherwise. See [Custom AI](/slop-docs/modding/custom-ai/) for the full breakdown of how priorities and control flags work.

### Implement the overrides

Still in `ShadowWalker.cpp`, add the remaining methods:

```cpp
bool ShadowWalker::useNewAi()
{
    return true;
}

int ShadowWalker::getMaxHealth()
{
    return 30;  // 15 hearts
}

MobType ShadowWalker::getMobType()
{
    // UNDEAD makes it vulnerable to Smite enchantment.
    // Use UNDEFINED if you don't want any enchantment bonus.
    return MobType::UNDEAD;
}

void ShadowWalker::defineSynchedData()
{
    Monster::defineSynchedData();
    // Add custom synched data here if needed.
    // For a basic mob, the parent's data is enough.
}

void ShadowWalker::addAdditonalSaveData(CompoundTag *tag)
{
    Monster::addAdditonalSaveData(tag);
    // Save custom fields here if you add any later
}

void ShadowWalker::readAdditionalSaveData(CompoundTag *tag)
{
    Monster::readAdditionalSaveData(tag);
    // Load custom fields here if you add any later
}
```

The save/load methods do not have any custom data right now, but always call the parent class. You will need these hooks later if you add custom state like a powered mode or rage timer.

## Step 4: Add custom sounds

We need three sounds: ambient (idle groaning), hurt, and death. This involves two files.

### SoundTypes.h

Add three entries to the `eSOUND_TYPE` enum in `Minecraft.World/SoundTypes.h`:

```cpp
// After the last mob sound entry
eSoundType_MOB_SHADOWWALKER_AMBIENT,
eSoundType_MOB_SHADOWWALKER_HURT,
eSoundType_MOB_SHADOWWALKER_DEATH,
```

### SoundNames.cpp

Add the matching string names in `Minecraft.Client/Common/Audio/SoundNames.cpp`. These must be in the exact same order as the enum entries:

```cpp
// In the wchSoundNames[] array, at the same indices:
L"mob.shadowwalker",          // eSoundType_MOB_SHADOWWALKER_AMBIENT
L"mob.shadowwalkerhurt",      // eSoundType_MOB_SHADOWWALKER_HURT
L"mob.shadowwalkerdeath",     // eSoundType_MOB_SHADOWWALKER_DEATH
```

These string names map to events in the Miles soundbank. You will need to add actual audio files to the soundbank as well. See [Custom Sounds](/slop-docs/modding/custom-sounds/) for the full soundbank pipeline.

### Wire up the sound methods

Back in `ShadowWalker.cpp`, add the sound overrides:

```cpp
int ShadowWalker::getAmbientSound()
{
    return eSoundType_MOB_SHADOWWALKER_AMBIENT;
}

int ShadowWalker::getHurtSound()
{
    return eSoundType_MOB_SHADOWWALKER_HURT;
}

int ShadowWalker::getDeathSound()
{
    return eSoundType_MOB_SHADOWWALKER_DEATH;
}
```

The engine calls `getAmbientSound()` on a random timer. `getHurtSound()` fires whenever the mob takes damage, and `getDeathSound()` fires once on death. Simple as that.

## Step 5: Add custom loot drops

The Shadow Walker drops 1 to 3 Ender Pearls, plus a bonus from the Looting enchantment. If you wanted it to drop a custom item, you would create that item first (see [Adding Items](/slop-docs/modding/adding-items/)).

Add these to `ShadowWalker.cpp`:

```cpp
int ShadowWalker::getDeathLoot()
{
    // Fallback drop item ID. Used by the base class if you
    // don't override dropDeathLoot.
    return Item::enderPearl_Id;
}

void ShadowWalker::dropDeathLoot(bool wasKilledByPlayer, int playerBonusLevel)
{
    // Drop 1-3 ender pearls, plus up to 1 extra per Looting level
    int count = 1 + random->nextInt(3) + random->nextInt(1 + playerBonusLevel);

    for (int i = 0; i < count; i++)
    {
        spawnAtLocation(Item::enderPearl_Id, 1);
    }

    // 50% chance to drop a bone (flavor drop)
    if (random->nextInt(2) == 0)
    {
        spawnAtLocation(Item::bone_Id, 1);
    }
}
```

The `dropDeathLoot` method is called by `Mob::die()` on the server side only. The `wasKilledByPlayer` flag tells you whether loot should be player-quality, and `playerBonusLevel` is the Looting enchantment level from the killing weapon. See [Custom Loot](/slop-docs/modding/custom-loot/) for the full drop pipeline.

## Step 6: Create the model

The Shadow Walker model is a tall humanoid with long arms and a narrow body. We build it from `ModelPart` cubes just like every other mob in the game.

### ShadowWalkerModel.h

Create `Minecraft.Client/ShadowWalkerModel.h`:

```cpp
#pragma once
#include "Model.h"

class ModelPart;

class ShadowWalkerModel : public Model
{
public:
    ModelPart *head;
    ModelPart *body;
    ModelPart *rightArm;
    ModelPart *leftArm;
    ModelPart *rightLeg;
    ModelPart *leftLeg;

    ShadowWalkerModel();

    virtual void render(shared_ptr<Entity> entity, float time, float r,
                        float bob, float yRot, float xRot,
                        float scale, bool usecompiled);
    virtual void setupAnim(float limbSwing, float limbSwingAmount,
                           float ageInTicks, float headYaw,
                           float headPitch, float scale,
                           unsigned int uiBitmaskOverrideAnim = 0);
};
```

### ShadowWalkerModel.cpp

Create `Minecraft.Client/ShadowWalkerModel.cpp`:

```cpp
#include "stdafx.h"
#include "ShadowWalkerModel.h"
#include "ModelPart.h"
#include "Mth.h"

ShadowWalkerModel::ShadowWalkerModel() : Model()
{
    // Use a 64x64 texture sheet
    texWidth = 64;
    texHeight = 64;

    // Head: 8x8x8 cube, positioned at the top
    head = new ModelPart(this, 0, 0);
    head->addBox(-4.0f, -8.0f, -4.0f, 8, 8, 8, 0.0f);
    head->setPos(0.0f, -4.0f, 0.0f);

    // Body: 8x16x4, narrow and tall
    body = new ModelPart(this, 0, 16);
    body->addBox(-4.0f, -2.0f, -2.0f, 8, 16, 4, 0.0f);
    body->setPos(0.0f, -2.0f, 0.0f);

    // Right arm: 4x16x4, long and thin
    rightArm = new ModelPart(this, 32, 0);
    rightArm->addBox(-3.0f, -2.0f, -2.0f, 4, 16, 4, 0.0f);
    rightArm->setPos(-5.0f, -2.0f, 0.0f);

    // Left arm: mirrored
    leftArm = new ModelPart(this, 32, 0);
    leftArm->bMirror = true;
    leftArm->addBox(-1.0f, -2.0f, -2.0f, 4, 16, 4, 0.0f);
    leftArm->setPos(5.0f, -2.0f, 0.0f);

    // Right leg: 4x14x4
    rightLeg = new ModelPart(this, 0, 36);
    rightLeg->addBox(-2.0f, 0.0f, -2.0f, 4, 14, 4, 0.0f);
    rightLeg->setPos(-2.0f, 14.0f, 0.0f);

    // Left leg: mirrored
    leftLeg = new ModelPart(this, 0, 36);
    leftLeg->bMirror = true;
    leftLeg->addBox(-2.0f, 0.0f, -2.0f, 4, 14, 4, 0.0f);
    leftLeg->setPos(2.0f, 14.0f, 0.0f);

    // Compile all parts into GPU display lists
    float s = 1.0f / 16.0f;
    head->compile(s);
    body->compile(s);
    rightArm->compile(s);
    leftArm->compile(s);
    rightLeg->compile(s);
    leftLeg->compile(s);
}
```

Each `ModelPart` gets a texture offset (the first two arguments to the constructor), then one or more cubes via `addBox`. The `setPos` call places the part's pivot point in model space. Parts are compiled once at construction time into GPU display lists.

The `addBox` parameters are: x offset, y offset, z offset, width, height, depth, grow. The grow value of `0.0f` means no inflation. Armor layers use grow values like `0.5f` to sit on top of the body without clipping.

See [Entity Models](/slop-docs/modding/entity-models/) for the full details on UV mapping, cube geometry, and the `faceMask` system.

### Animation

Add the animation and render methods:

```cpp
void ShadowWalkerModel::setupAnim(float limbSwing, float limbSwingAmount,
                                   float ageInTicks, float headYaw,
                                   float headPitch, float scale,
                                   unsigned int uiBitmaskOverrideAnim)
{
    // Head follows where the mob is looking
    head->yRot = headYaw / (180.0f / Mth::PI);
    head->xRot = headPitch / (180.0f / Mth::PI);

    // Arms swing opposite to legs
    rightArm->xRot = Mth::cos(limbSwing * 0.6662f + Mth::PI) * 2.0f * limbSwingAmount * 0.5f;
    leftArm->xRot = Mth::cos(limbSwing * 0.6662f) * 2.0f * limbSwingAmount * 0.5f;
    rightArm->zRot = 0.0f;
    leftArm->zRot = 0.0f;

    // Legs walk
    rightLeg->xRot = Mth::cos(limbSwing * 0.6662f) * 1.4f * limbSwingAmount;
    leftLeg->xRot = Mth::cos(limbSwing * 0.6662f + Mth::PI) * 1.4f * limbSwingAmount;

    // Subtle idle arm sway when standing still
    rightArm->zRot += Mth::cos(ageInTicks * 0.09f) * 0.05f + 0.05f;
    leftArm->zRot -= Mth::cos(ageInTicks * 0.09f) * 0.05f + 0.05f;
    rightArm->xRot += Mth::sin(ageInTicks * 0.067f) * 0.05f;
    leftArm->xRot -= Mth::sin(ageInTicks * 0.067f) * 0.05f;

    // Attack animation
    if (attackTime > 0.0f)
    {
        rightArm->xRot = rightArm->xRot * (1.0f - attackTime) +
                          (-Mth::PI / 2.0f) * attackTime;
    }
}

void ShadowWalkerModel::render(shared_ptr<Entity> entity, float time, float r,
                                float bob, float yRot, float xRot,
                                float scale, bool usecompiled)
{
    setupAnim(time, r, bob, yRot, xRot, scale);

    head->render(scale, usecompiled);
    body->render(scale, usecompiled);
    rightArm->render(scale, usecompiled);
    leftArm->render(scale, usecompiled);
    rightLeg->render(scale, usecompiled);
    leftLeg->render(scale, usecompiled);
}
```

The animation system passes in `limbSwing` (distance walked) and `limbSwingAmount` (how fast). We use sine and cosine waves to swing the arms and legs back and forth. The `ageInTicks` value increases every tick, so we use it for subtle idle movements. The `attackTime` field goes from 0 to 1 during an attack swing.

## Step 7: Create the renderer

The renderer connects your model to the rendering pipeline. It tells the engine what texture to use and how to draw the entity.

### ShadowWalkerRenderer.h

Create `Minecraft.Client/ShadowWalkerRenderer.h`:

```cpp
#pragma once
#include "MobRenderer.h"

class ShadowWalkerModel;

class ShadowWalkerRenderer : public MobRenderer
{
public:
    ShadowWalkerRenderer(ShadowWalkerModel *model, float shadowSize);

    virtual float getScale(shared_ptr<Mob> mob, float partialTick);
};
```

### ShadowWalkerRenderer.cpp

Create `Minecraft.Client/ShadowWalkerRenderer.cpp`:

```cpp
#include "stdafx.h"
#include "ShadowWalkerRenderer.h"
#include "ShadowWalkerModel.h"

ShadowWalkerRenderer::ShadowWalkerRenderer(ShadowWalkerModel *model,
                                             float shadowSize)
    : MobRenderer(model, shadowSize)
{
}

float ShadowWalkerRenderer::getScale(shared_ptr<Mob> mob, float partialTick)
{
    // The Shadow Walker is 1.2x normal scale (makes it look taller)
    return 1.2f;
}
```

`MobRenderer` handles all the heavy lifting: model transformation, texture binding, hurt flash, death animation, name tags, and shadow rendering. All we need to provide is the model and optionally a scale override. The `shadowSize` parameter controls how big the shadow circle is on the ground (0.5 to 0.7 is typical).

### Register the renderer

Open `Minecraft.Client/EntityRenderDispatcher.cpp` and add the renderer to the map:

```cpp
#include "ShadowWalkerRenderer.h"
#include "ShadowWalkerModel.h"

// In EntityRenderDispatcher::EntityRenderDispatcher(), after existing renderers:
renderers[eTYPE_SHADOW_WALKER] = new ShadowWalkerRenderer(
    new ShadowWalkerModel(), 0.6f);
```

The `renderers` map uses `eINSTANCEOF` as the key. Every entity type that can appear in the world needs an entry here. There is no fallback renderer, so forgetting this will crash the game when the mob tries to render.

## Step 8: Add the texture

Register a texture constant in `Minecraft.Client/Textures.h`:

```cpp
// After the last TN_MOB entry
#define TN_MOB_SHADOW_WALKER  /* next available texture index */
```

Then load the actual texture file in the client's texture loading system. Your texture should be a 64x64 PNG (matching the `texWidth`/`texHeight` in the model). See [Block Textures](/slop-docs/modding/block-textures/) for the general texture pipeline. Entity textures work similarly, they just go through a different loading path.

For the UV layout, refer to [Entity Models](/slop-docs/modding/entity-models/). Each `ModelPart` cube maps its six faces onto the texture sheet based on the texture offset you set in the constructor. The head at offset `(0, 0)` uses the top-left area, the body at `(0, 16)` uses the area below that, and so on.

## Step 9: Register with EntityIO

This is what makes the game actually know your mob exists. Open `Minecraft.World/EntityIO.cpp` and add the registration inside `EntityIO::staticCtor()`:

```cpp
#include "ShadowWalker.h"

// In EntityIO::staticCtor(), after existing registrations:
setId(ShadowWalker::create, eTYPE_SHADOW_WALKER, L"ShadowWalker", 64,
      eMinecraftColour_Mob_ShadowWalker_Colour1,   // Spawn egg primary color
      eMinecraftColour_Mob_ShadowWalker_Colour2,   // Spawn egg secondary color
      IDS_SHADOW_WALKER);
```

> **Important:** The color arguments to `setId` must be `eMinecraftColour` enum values, not raw hex integers. The engine uses these enums internally for spawn egg rendering. You can find the full list of existing values in `App_enums.h` under the `eMinecraftColour` section. To add your own, define two new entries (e.g. `eMinecraftColour_Mob_ShadowWalker_Colour1` and `_Colour2`) in that enum before using them here. Look at existing mob color pairs like `eMinecraftColour_Mob_Creeper_Colour1` / `_Colour2` for reference.

The seven-argument `setId` call registers the mob in all five internal maps (string ID, numeric ID, factory function, type enum) and adds it to the spawn egg list for creative mode. If you do not want a spawn egg, use the four-argument version instead.

The numeric ID `64` is the next open slot after `EnderDragon` at 63. `IDS_SHADOW_WALKER` is a string table entry for the localized mob name.

You also need to add the `IDS_SHADOW_WALKER` string to the localization table. The exact location depends on your platform, but it is usually in a string resource file or a language `.lang` file.

## Step 10: Add spawn rules

We want the Shadow Walker to spawn naturally in dark areas, just like zombies and skeletons. The spawning system is biome-based.

### Add to specific biomes

Open the biome files where you want the Shadow Walker to appear. For example, to add it to plains and forest biomes:

```cpp
// In PlainsBiome constructor (Minecraft.World/PlainsBiome.cpp)
enemies.push_back(new MobSpawnerData(eTYPE_SHADOW_WALKER, 6, 1, 2));

// In ForestBiome constructor (Minecraft.World/ForestBiome.cpp)
enemies.push_back(new MobSpawnerData(eTYPE_SHADOW_WALKER, 8, 1, 3));
```

The `MobSpawnerData` parameters:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `mobClass` | `eTYPE_SHADOW_WALKER` | Which mob to spawn |
| `probabilityWeight` | 6 or 8 | Relative spawn chance (zombies use 10) |
| `minCount` | 1 | Minimum group size |
| `maxCount` | 2 or 3 | Maximum group size |

A weight of 6 to 8 makes the Shadow Walker less common than zombies (weight 10) but still a regular encounter. Tweak these numbers to taste.

### Add to all biomes (optional)

If you want the Shadow Walker everywhere, add it to the default enemy list in the base `Biome` constructor in `Minecraft.World/Biome.cpp`:

```cpp
// In Biome::Biome(), alongside zombie and skeleton entries:
enemies.push_back(new MobSpawnerData(eTYPE_SHADOW_WALKER, 5, 1, 2));
```

### Custom spawn conditions (optional)

Since `ShadowWalker` extends `Monster`, it already gets the standard hostile mob spawn checks: light level must be dark enough (`isDarkEnoughToSpawn()`), and the spawn position must have a solid block below it. If you want stricter rules, override `canSpawn()`:

```cpp
// In ShadowWalker.h, add to the public section:
virtual bool canSpawn();

// In ShadowWalker.cpp:
bool ShadowWalker::canSpawn()
{
    // Only spawn below Y=50 (caves only)
    if (y > 50) return false;

    // Use the standard Monster spawn checks for everything else
    return Monster::canSpawn();
}
```

This restricts the Shadow Walker to underground areas. Remove the Y check if you want it to spawn on the surface at night too.

## Step 11: Build and test

Run your CMake build. If you are using Visual Studio, just hit Build Solution. If you are using the command line:

```bash
cmake --build build --config Release
```

At this point you have touched these files:

| File | What You Changed |
|------|-----------------|
| `Minecraft.World/Definitions.h` | Added `eTYPE_SHADOW_WALKER` to the enum |
| `Minecraft.World/ShadowWalker.h` | New file, entity class header |
| `Minecraft.World/ShadowWalker.cpp` | New file, entity class implementation |
| `Minecraft.World/SoundTypes.h` | Added three sound enum entries |
| `Minecraft.Client/Common/Audio/SoundNames.cpp` | Added three sound name strings |
| `Minecraft.Client/ShadowWalkerModel.h` | New file, model header |
| `Minecraft.Client/ShadowWalkerModel.cpp` | New file, model with animation |
| `Minecraft.Client/ShadowWalkerRenderer.h` | New file, renderer header |
| `Minecraft.Client/ShadowWalkerRenderer.cpp` | New file, renderer implementation |
| `Minecraft.Client/EntityRenderDispatcher.cpp` | Registered the renderer |
| `Minecraft.Client/Textures.h` | Added texture constant |
| `Minecraft.World/EntityIO.cpp` | Registered with setId and spawn egg |
| `Minecraft.World/PlainsBiome.cpp` | Added to spawn list (optional) |
| `Minecraft.World/ForestBiome.cpp` | Added to spawn list (optional) |
| `Minecraft.World/Biome.cpp` | Added to default spawn list (optional) |

Build the project. If it compiles, load a creative world and use the spawn egg to test. Check that:

1. The mob spawns from the egg and renders correctly
2. It walks around, looks at you, and attacks
3. It makes sounds (ambient, hurt, death)
4. It drops ender pearls and bones when killed
5. It saves and loads when you quit and reload the world
6. It spawns naturally in caves (switch to survival and explore)

If something goes wrong, check the most common issues:

- **Crash on spawn**: Make sure the renderer is registered in `EntityRenderDispatcher`. There is no fallback.
- **Invisible mob**: Check that `textureIdx` matches your texture constant and the texture is loaded.
- **No AI**: Make sure `useNewAi()` returns `true`.
- **No spawning**: Check that the biome spawn list has your mob and the weight is high enough to notice.
- **No sound**: Make sure the `wchSoundNames` array is in sync with the `eSOUND_TYPE` enum. One missing entry will shift everything.

## What to try next

Once you have the basic Shadow Walker working, here are some ideas to build on it:

- **Add a powered variant** using synched data. Use `defineSynchedData()` to add a boolean flag, then change the texture or scale in the renderer based on that flag. See [Adding Entities](/slop-docs/modding/adding-entities/) for the synched data system.
- **Write a custom AI goal** that makes it teleport short distances, like the Enderman. See [Custom AI](/slop-docs/modding/custom-ai/) for how to write your own `Goal` subclass.
- **Add child parts to the model** for horns or a tail. `ModelPart::addChild()` makes child parts move and rotate relative to their parent. See [Entity Models](/slop-docs/modding/entity-models/).
- **Add rare drops** by overriding `dropRareDeathLoot()`. The base class gives it a 2.5% chance to fire, increased by Looting. See [Custom Loot](/slop-docs/modding/custom-loot/).
- **Make it burn in sunlight** (it already does if `Monster` handles that). Or override `aiStep()` to add custom tick behavior like healing in darkness.
- **Add a custom death animation** by overriding render behavior in your renderer. You could make it dissolve into particles.
- **Create a custom dimension** full of Shadow Walkers. See [Custom Dimensions](/slop-docs/modding/custom-dimensions/).

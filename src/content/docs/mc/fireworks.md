---
title: "Fireworks"
description: "Firework items, rockets, and recipes."
---

This page covers the firework system in MinecraftConsoles: the firework rocket item, firework charge (star) item, the rocket entity, the crafting recipe, the crafting menu, and the particle system.

## NBT tag structure

**Source file:** `FireworksItem.h`

The `FireworksItem` class defines the NBT tag names used throughout the firework system:

| Constant | Tag string | Purpose |
|----------|-----------|---------|
| `TAG_FIREWORKS` | `"Fireworks"` | Root compound for rocket data |
| `TAG_EXPLOSION` | `"Explosion"` | Single explosion compound (on charges) |
| `TAG_EXPLOSIONS` | `"Explosions"` | List of explosions (on rockets) |
| `TAG_FLIGHT` | `"Flight"` | Flight duration (byte, 1 to 3) |
| `TAG_E_TYPE` | `"Type"` | Explosion shape type |
| `TAG_E_TRAIL` | `"Trail"` | Trail effect (boolean) |
| `TAG_E_FLICKER` | `"Flicker"` | Twinkle/flicker effect (boolean) |
| `TAG_E_COLORS` | `"Colors"` | Primary colors (int array, RGB) |
| `TAG_E_FADECOLORS` | `"FadeColors"` | Fade-to colors (int array, RGB) |

### Explosion shape types

| Constant | Value | Shape |
|----------|-------|-------|
| `TYPE_SMALL` | 0 | Small ball |
| `TYPE_BIG` | 1 | Large ball |
| `TYPE_STAR` | 2 | Star shape |
| `TYPE_CREEPER` | 3 | Creeper face |
| `TYPE_BURST` | 4 | Burst |

## FireworksItem (rocket item)

**Source files:** `FireworksItem.h/cpp`

The firework rocket item handles placement and tooltip display. Extends `Item`.

### Placement

`useOn()` spawns a `FireworksRocketEntity` at the clicked position (offset by `clickX/Y/Z` within the block face). The source item instance is passed to the entity for NBT reading. In survival mode, the item count is decremented. Has a `bTestUseOnOnly` parameter for tooltip prediction without side effects.

### Tooltip

`appendHoverText()` reads the `"Fireworks"` compound from the item's tag:

1. Displays the flight duration if present.
2. Goes through the `"Explosions"` list and hands off each explosion's tooltip to `FireworksChargeItem::appendHoverText()`, with lines after the first being indented.

## FireworksChargeItem (star item)

**Source files:** `FireworksChargeItem.h/cpp`

The firework charge (star) item represents a single explosion configuration. Extends `Item`.

### Sprite rendering

The charge item uses two sprite layers (`hasMultipleSpriteLayers()` returns `true`):

- **Layer 0**: Base item icon.
- **Layer 1**: Overlay icon (registered as `_overlay`), tinted to the charge's color.

`getColor()` computes the overlay tint for layer 1:

- If a single color exists, it's used directly.
- If multiple colors exist, all RGB channels are averaged.
- If no colors are set, defaults to `0x8A8A8A` (gray).

### Tooltip rendering

The static `appendHoverText(CompoundTag*, ...)` method builds the tooltip for an explosion compound:

1. **Shape**: Looks up the type byte against localized shape names (indices 0 to 4). Falls back to a generic label for unknown types.
2. **Colors**: Goes through the `"Colors"` int array. Each color is matched against the 16 dye RGB values (`DyePowderItem::COLOR_RGB`). Known colors show their localized name; unknown colors show "Custom".
3. **Fade colors**: Same matching logic as primary colors, prefixed with "Fade to".
4. **Trail**: Displays if the `"Trail"` boolean is set.
5. **Flicker**: Displays if the `"Flicker"` boolean is set.

### Tag access

`getExplosionTagField()` is a utility that digs into the item's tag to grab a specific field from the `"Explosion"` compound.

## FireworksRocketEntity

**Source files:** `FireworksRocketEntity.h/cpp`

The rocket entity handles the flight, explosion trigger, and save/load of firework rockets. Extends `Entity` directly (not a `Mob` or `Projectile`). Entity type: `eTYPE_FIREWORKS_ROCKET`.

### Properties

| Field | Purpose |
|-------|---------|
| `life` | Current age in ticks |
| `lifetime` | Maximum age before explosion |
| `DATA_ID_FIREWORKS_ITEM` (8) | Synched data slot holding the source item |

Entity size: 0.25 x 0.25 blocks. Not attackable. Casts no shadow.

### Initialization

When created with a source item:

1. The item is stored in synched data (slot 8) for client access.
2. The `"Flight"` byte is read from the `"Fireworks"` compound.
3. Lifetime is calculated as:

```
lifetime = (TICKS_PER_SECOND / 2) * flightCount + random(6) + random(7)
```

With default `flightCount = 1` (no gunpowder bonus), this gives roughly 10 to 23 ticks. Each additional gunpowder adds half a second (10 ticks).

4. Initial velocity: tiny random X/Z drift (`nextGaussian * 0.001`) and upward Y velocity of `0.05`.

### Flight physics

Each `tick()`:

- Horizontal velocity scales by 1.15x (accelerating drift).
- Vertical velocity increases by 0.04 per tick (upward acceleration).
- Position updates via `move()`.
- Rotation is derived from velocity direction.

### Launch sound

On the first tick (`life == 0`), the server plays `FIREWORKS_LAUNCH` at volume 3.

### Spark trail

On the client, every other tick, a `fireworksspark` particle spawns below the rocket with slight random drift.

### Explosion

When `life > lifetime` on the server:

1. Broadcasts `EntityEvent::FIREWORKS_EXPLODE` to clients.
2. The entity is removed.

`handleEntityEvent()` on the client reads the source item's `"Fireworks"` compound and calls `level->createFireworks()` to spawn the particle effects.

### Brightness

Custom `getBrightness()` and `getLightColor()` methods provide a glow effect on the rocket.

### NBT serialization

| Tag | Type | Purpose |
|-----|------|---------|
| `"Life"` | Int | Current age |
| `"LifeTime"` | Int | Maximum age |
| `"FireworksItem"` | Compound | Full item data including fireworks tags |

## FireworksRecipe

**Source files:** `FireworksRecipe.h/cpp`

The firework recipe is a special shapeless recipe that handles three different crafting operations in a single class.

### Thread safety

The recipe uses thread-local storage (`TlsAlloc`/`TlsSetValue`) to store the result item. Each thread that uses the recipe system needs to call `CreateNewThreadStorage()` or `UseDefaultThreadStorage()`. This is a 4J addition to support multi-threaded recipe checking on consoles.

### Recipe 1: Firework rocket

**Requirements:** 1 paper + 1 to 3 gunpowder + 0 or more firework charges. No dye, diamond, glowstone, or shape items.

**Result:** A firework rocket item with:

- `"Flight"` byte set to the gunpowder count (1 to 3).
- `"Explosions"` list populated from each charge's `"Explosion"` compound.

### Recipe 2: Firework charge (star)

**Requirements:** Exactly 1 gunpowder + 1 or more dyes + at most 1 shape item. No paper, no existing charges.

**Shape items and their effects:**

| Item | Effect |
|------|--------|
| Fire charge | `TYPE_BIG` (large ball) |
| Feather | `TYPE_BURST` |
| Gold nugget | `TYPE_STAR` |
| Skull | `TYPE_CREEPER` |
| *(none)* | `TYPE_SMALL` (default) |

**Modifier items:**

| Item | Effect |
|------|--------|
| Glowstone dust | `"Flicker"` = true |
| Diamond | `"Trail"` = true |

**Result:** A firework charge item with an `"Explosion"` compound containing the type, colors (from dye RGB values), and any modifiers.

### Recipe 3: Fade colors

**Requirements:** Exactly 1 existing firework charge + 1 or more dyes. No gunpowder, no paper.

**Result:** A copy of the charge with `"FadeColors"` int array added to its `"Explosion"` compound, populated from the dye colors.

### Ingredient validation

`updatePossibleRecipes()` looks at the current crafting grid to figure out which of the three recipes are still possible, setting boolean flags for firework, charge, and fade.

`isValidIngredient()` checks whether a given item can be used in any of the currently-possible recipes:

| Item | Valid for |
|------|-----------|
| Gunpowder | Rocket, Charge |
| Firework charge | Rocket, Fade |
| Dye | Charge, Fade |
| Paper | Rocket only |
| Glowstone, Diamond, Fire charge, Feather, Gold nugget, Skull | Charge only |

## FireworksMenu

**Source files:** `FireworksMenu.h/cpp`

The firework crafting menu gives you a 3x3 crafting grid with a result slot, laid out the same as a standard crafting table.

### Slot layout

| Range | Constant | Purpose |
|-------|----------|---------|
| 0 | `RESULT_SLOT` | Crafting output |
| 1 to 9 | `CRAFT_SLOT_START` | 3x3 crafting grid |
| 10 to 36 | `INV_SLOT_START` | Player inventory |
| 37 to 45 | `USE_ROW_SLOT_START` | Player hotbar |

### Recipe matching

`slotsChanged()` fires whenever the crafting grid changes. It:

1. Calls `FireworksRecipe::updatePossibleRecipes()` to figure out which recipe types are viable.
2. Uses the global `Recipes::getInstance()` with the fireworks-specific recipe list to compute the result item.

### Ingredient filtering

`isValidIngredient()` delegates to `FireworksRecipe::isValidIngredient()`, using the current `m_canMakeFireworks`, `m_canMakeCharge`, and `m_canMakeFade` flags. This prevents you from placing items that can't be used in any viable recipe.

### Menu removal

When the menu is closed, all items still in the 3x3 crafting grid are dropped back to the player via `player->drop()`.

## Particle system

**Source files:** `FireworksParticles.h/cpp`

The client-side particle system has three particle classes nested within `FireworksParticles`.

### FireworksStarter

The starter particle is an invisible controller that runs the explosion sequence.

**Initialization:**

- Reads the `"Explosions"` list from the fireworks compound tag.
- Lifetime: `explosions.size() * 2 - 1` ticks, plus 15 extra ticks if any explosion has flicker enabled (for the twinkle delay).

**Sound effects:**

On the first tick, a sound is picked based on explosion size and camera distance:

| Condition | Sound |
|-----------|-------|
| Large + far | `FIREWORKS_LARGE_BLAST_FAR` |
| Large + near | `FIREWORKS_LARGE_BLAST` |
| Small + far | `FIREWORKS_BLAST_FAR` |
| Small + near | `FIREWORKS_BLAST` |

An explosion counts as "large" if there are 3+ explosions or any explosion has `TYPE_BIG`. "Far" means the camera is more than 16 blocks away.

**Explosion dispatch (every 2 ticks):**

Each explosion is processed based on its type:

| Type | Method | Parameters |
|------|--------|------------|
| `TYPE_SMALL` | `createParticleBall()` | speed=0.25, steps=2 |
| `TYPE_BIG` | `createParticleBall()` | speed=0.5, steps=4 |
| `TYPE_STAR` | `createParticleShape()` | 5-point star coordinates, not flat |
| `TYPE_CREEPER` | `createParticleShape()` | Creeper face outline, flat |
| `TYPE_BURST` | `createParticleBurst()` | 70 random particles |

After each explosion, a `FireworksOverlayParticle` is added, tinted to the first color.

**Twinkle sound:** After all explosions finish, if any had flicker, a twinkle sound plays (far or near variant based on distance).

### Particle generation methods

**`createParticleBall(baseSpeed, steps, ...)`** generates particles in a hollow cube pattern by iterating X/Y/Z from `-steps` to `+steps`, skipping interior points. Each particle gets a randomized velocity normalized by `baseSpeed`.

**`createParticleShape(baseSpeed, coords, ..., flat)`** traces a 2D shape defined by coordinate pairs. The shape is rotated around 3 random angles. For flat shapes (creeper face), the angle modulator is `0.034`; for 3D shapes (star), it's `0.34`. Each line segment is subdivided into 4 sub-steps, and particles are mirrored across the Y axis.

**`createParticleBurst(...)`** spawns 70 particles with gaussian-distributed velocities, creating an asymmetric burst effect.

### FireworksSparkParticle

The individual spark particles that make up the visible explosion.

| Property | Value |
|----------|-------|
| Base lifetime | 48 + random(12) ticks |
| Physics | Enabled (disabled on PS Vita for performance) |
| Gravity | -0.004 per tick |
| Air friction | 0.91x per tick |
| Ground friction | 0.7x on X/Z |

**Visual effects:**

- **Fade**: After half lifetime, alpha fades linearly to 0. If fade colors are set, the particle color moves toward them at 20% per tick.
- **Flicker**: In the last third of lifetime, the particle blinks on/off every few ticks.
- **Trail**: During the first half of lifetime, every other tick spawns a new stationary spark at the current position with half its lifetime already elapsed, creating a fading trail.
- **Texture**: Animates through 8 texture frames based on age.
- **Brightness**: Always renders at full brightness (`FULLBRIGHT_LIGHTVALUE`).

### FireworksOverlayParticle

A large, colored overlay that creates the "flash" effect of an explosion.

| Property | Value |
|----------|-------|
| Lifetime | 4 ticks |
| Size | 7.1x scale, oscillating with sin wave |
| Alpha | Fades from 0.6 to 0 over lifetime |

The overlay renders as a single quad using a fixed texture region (32x32 pixels from the misc texture sheet).

## Related pages

- [Redstone Mechanics](/slop-docs/mc/redstone/) for redstone activation of dispensers for firework launching
- [Behavior System](/slop-docs/mc/behaviors/) for `FireworksDispenseBehavior` details

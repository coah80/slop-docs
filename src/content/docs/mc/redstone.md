---
title: "Redstone Mechanics"
description: "Comparators, repeaters, and daylight detectors in MinecraftConsoles."
---

This page covers the redstone signal system, comparator logic, repeater delays, daylight detection, and powered rails as they're implemented in the MinecraftConsoles codebase.

## Signal constants

The `Redstone` class (`Redstone.h`) defines the basic signal range used throughout the redstone system:

| Constant | Value | Purpose |
|----------|-------|---------|
| `SIGNAL_NONE` | `0` | No signal / off |
| `SIGNAL_MIN` | `0` | Minimum signal strength |
| `SIGNAL_MAX` | `15` | Maximum signal strength |

All redstone components clamp their output to this 0 to 15 range.

## DiodeTile base class

**Source files:** `DiodeTile.h/cpp`, `DirectionalTile.h/cpp`

Both the comparator and repeater inherit from `DiodeTile`, which itself extends `DirectionalTile`. `DiodeTile` provides the shared logic for directional redstone components:

- **Directionality** uses a 2-bit `DIRECTION_MASK` in the tile data to encode which way the component faces. The `DIRECTION_INV_MASK` is the bitwise inverse, used by subclasses to extract non-direction bits.
- **On/off state** is kept in a boolean `on` field (protected). Two tile IDs exist per component (one for powered, one for unpowered), returned by the pure-virtual `getOnTile()` and `getOffTile()` methods.
- **Input signal** is read by `getInputSignal()`, which grabs the redstone signal arriving from behind the component.
- **Alternate (side) signal** is read by `getAlternateSignal()` and `getAlternateSignalAt()`, which check the signals from both sides. This is used for repeater locking and comparator subtract mode.
- **Output signal** is provided by `getOutputSignal()`, which reads the signal strength at the front.
- **Tick scheduling** via `checkTickOnNeighbor()` schedules a game tick when a neighbor changes, with optional priority support (`shouldPrioritize()`).
- **Locking** via `isLocked()` returns whether a side signal locks the component (base implementation always returns `false`; the repeater overrides it).

### Common methods

| Method | Purpose |
|--------|---------|
| `isDiode(int id)` | Static helper that checks if a tile ID is any diode-type |
| `isSameDiode(int id)` | Checks if a tile ID matches this specific diode type |
| `isMatching(int id)` | Checks if a tile matches |
| `isOn(int data)` | Checks if the component is powered from the tile data |
| `isSignalSource()` | Returns `true` (all diodes produce redstone signal) |
| `isCubeShaped()` | Returns `false` (diodes are flat) |
| `isSolidRender()` | Returns `false` |
| `isAlternateInput(int tile)` | Checks if a neighboring tile can provide side input |
| `updateNeighborsInFront()` | Notifies blocks in front when the output changes |
| `mayPlace()` | Checks if the component can be placed at a position |
| `canSurvive()` | Checks if the component has support below |
| `updateDefaultShape()` | 4J added this override for shape initialization |
| `shouldRenderFace()` | Controls face rendering |
| `getRenderShape()` | Returns the render shape ID |
| `getTexture(int face, int data)` | Returns the texture icon for a given face |

### Turn-off and turn-on delays

`getTurnOffDelay(int data)` returns the turn-off delay (base implementation uses turn-on delay).
`getTurnOnDelay(int data)` is pure virtual, implemented by each subclass.

### Tick behavior

The base `tick()` method:

1. Checks if the component needs to change state.
2. If currently on but should be off, swaps to the off tile.
3. If currently off but should be on, swaps to the on tile.
4. Both transitions schedule a follow-up neighbor check.

### Placement

`setPlacedBy()` records the facing direction based on the placer's rotation. `onPlace()` initializes the state and notifies neighbors. `destroy()` cleans up.

## Comparator

**Source files:** `ComparatorTile.h/cpp`, `ComparatorTileEntity.h/cpp`

The comparator extends both `DiodeTile` and `EntityTile`, so it needs a tile entity to persist its output signal.

### Data bits

| Bit | Mask | Purpose |
|-----|------|---------|
| Bits 0-1 | `DIRECTION_MASK` | Facing direction (inherited) |
| Bit 2 | `0x4` (`BIT_OUTPUT_SUBTRACT`) | Subtract mode enabled |
| Bit 3 | `0x8` (`BIT_IS_LIT`) | Comparator is visually lit |

### Modes

The comparator has two modes, toggled by right-clicking (`use()`):

- **Compare mode** (default): Output equals the input signal, but only when the input is greater than or equal to the side (alternate) signal.
- **Subtract mode** (`BIT_OUTPUT_SUBTRACT` set): Output equals `max(input - alternate, 0)`.

The mode check is done by `isReversedOutputSignal()`, which tests `(data & BIT_OUTPUT_SUBTRACT) == BIT_OUTPUT_SUBTRACT`. Despite the name, "reversed" means subtract mode is active.

The `use()` method has a `soundOnly` parameter (4J addition) for tooltip prediction without side effects. `TestUse()` returns whether the comparator can be interacted with.

### Signal calculation

`calculateOutputSignal()` has the core logic:

```
if not subtract mode:
    return input signal
else:
    return max(input - alternate, SIGNAL_NONE)
```

`shouldTurnOn()` figures out whether the comparator should be lit:

1. If the input signal is at maximum (15), always on.
2. If the input signal is zero, always off.
3. Otherwise, on when the input is greater than or equal to the alternate (side) signal.

### Analog input detection

`getInputSignal()` goes beyond basic redstone signal reading. After getting the standard diode input, it checks whether the tile behind the comparator `hasAnalogOutputSignal()`. If so, it reads the analog output (used for containers like chests and hoppers). If the immediate tile is a solid block, it checks one tile further for an analog source. This lets you read through blocks.

Blocks that support analog output in MinecraftConsoles include:

- Hoppers (`HopperTile`)
- Dispensers (`DispenserTile`)
- Jukeboxes (`JukeboxTile`)
- Command blocks (`CommandBlock`)

### Turn-on delay

The comparator has a fixed turn-on delay of **2 redstone ticks** (returned by `getTurnOnDelay()`).

### Tile entity

`ComparatorTileEntity` stores a single `int output` field, saved in NBT as `"OutputSignal"`. The tile entity is used by `getOutputSignal()` and `setOutputSignal()` to cache the comparator's last computed output, so neighbors can read the signal without triggering a recalculation.

The entity type enum is `eTYPE_COMPARATORTILEENTITY`, and it has a static `create()` factory and a 4J-added `clone()` method.

### Tick behavior

When `tick()` fires, the comparator cleans up legacy "on" tile IDs by converting them to the off tile with `BIT_IS_LIT` set, then calls `refreshOutputState()`. This method:

1. Recalculates the output signal via `calculateOutputSignal()`.
2. Updates the tile entity's stored output via `setOutputSignal()`.
3. Flips `BIT_IS_LIT` on or off as needed.
4. Notifies neighbors in front of the comparator via `updateNeighborsInFront()`.

### Placement and removal

`onPlace()` calls the parent `DiodeTile::onPlace()` and creates a new `ComparatorTileEntity`. `onRemove()` removes the tile entity and updates front neighbors. `triggerEvent()` handles block events for state synchronization.

### Other methods

- `getResource()` returns the item drop ID
- `cloneTileId()` returns the tile ID for clone operations
- `getRenderShape()` returns the render shape
- `getTexture()` returns the icon for a given face and data
- `newTileEntity()` creates the `ComparatorTileEntity`

## Repeater

**Source files:** `RepeaterTile.h/cpp`

:::note[Shared with LCEMP]
LCEMP already has the repeater via `DiodeTile.h/cpp` with the same `DELAY_MASK`, `DELAYS[4]` array, and repeater behavior. The repeater is shared content, not MC-exclusive. Only the `ComparatorTile`, `DaylightDetectorTile`, and the `PoweredRailTile` refactor are MC-only additions on this page.
:::

The repeater extends `DiodeTile` without needing a tile entity.

### Delay system

The repeater supports four delay settings, stored in the upper bits of the tile data:

| Data bits | Mask | Purpose |
|-----------|------|---------|
| Bits 0 to 1 | `DIRECTION_MASK` | Facing direction |
| Bits 2 to 3 | `DELAY_MASK` (same as `DIRECTION_INV_MASK`) | Delay index (0 to 3) |

The `DELAY_SHIFT` is `2`, so the delay index is pulled out as `(data & DELAY_MASK) >> 2`.

The four delay values are stored in a static `DELAYS[4]` array:

| Index | Base delay | Actual delay (`base * 2`) | In seconds |
|-------|-----------|---------------------------|------------|
| 0 | 1 | 2 game ticks | 0.1s |
| 1 | 2 | 4 game ticks | 0.2s |
| 2 | 3 | 6 game ticks | 0.3s |
| 3 | 4 | 8 game ticks | 0.4s |

`getTurnOnDelay()` returns `DELAYS[index] * 2`.

### Cycling delay

Right-clicking (`use()`) bumps the delay index by 1, wrapping around from index 3 back to 0. The operation preserves the direction bits and sets `UPDATE_ALL` for both client and server updates. Like the comparator, `use()` has a `soundOnly` parameter and `TestUse()` for tooltip support.

### Locking

The repeater overrides `isLocked()` to return `true` when `getAlternateSignal() > SIGNAL_NONE`, meaning a side signal from another diode locks the repeater's current output state.

`isAlternateInput()` restricts side inputs to other diode tiles only (via `isDiode()`), so only repeaters and comparators can lock a repeater. Regular redstone dust or other signal sources can't lock it.

### Render offsets

The four delay render offsets (`DELAY_RENDER_OFFSETS[4]`) position the movable torch visually:

```
{-1/16, 1/16, 3/16, 5/16}
```

These are `double` values stored in a static array.

### Particle effects

When powered (`on == true`), `animateTick()` spawns `reddust` particles on either the receiver or transmitter end of the repeater, with the position offset based on the current delay setting and facing direction.

### Removal

`onRemove()` updates neighbors when the repeater is broken.

### Other methods

- `getResource()` returns the item drop ID
- `cloneTileId()` returns the tile ID for clone operations
- `getRenderShape()` returns the render shape

## Daylight detector

**Source files:** `DaylightDetectorTile.h/cpp`, `DaylightDetectorTileEntity.h/cpp`

The daylight detector is a `BaseEntityTile` that outputs a redstone signal based on the sky light level.

### Shape

The detector is a flat slab, 6/16 of a block tall. It's not a full cube (`isCubeShaped()` returns `false`) and it's not solid (`isSolidRender()` returns `false`). 4J added an `updateDefaultShape()` override and the standard `updateShape()` method.

### Signal strength calculation

`updateSignalStrength()` computes the output signal:

1. Skips entirely if the dimension has a ceiling (`dimension->hasCeiling`).
2. Reads the sky brightness at the block's position, minus the current sky darkening.
3. Factors in the sun's angle using `cos(sunAngle)`, with the angle tilted 20% toward zenith for a smoother day/night transition.
4. Clamps the result to `[0, SIGNAL_MAX]`.
5. Updates the tile data only if the value changed, with `UPDATE_ALL` propagation.

`getSignal()` just reads and returns the stored tile data, so the data byte itself holds the signal strength (0 to 15). `isSignalSource()` returns `true`.

### Tile entity tick

`DaylightDetectorTileEntity::tick()` runs every second (`getGameTime() % TICKS_PER_SECOND == 0`) on the server side, calling `updateSignalStrength()` on its parent tile. So the signal updates once per second, not every game tick.

The entity type is `eTYPE_DAYLIGHTDETECTORTILEENTITY` with a static `create()` factory and 4J-added `clone()`.

### Event handling

`neighborChanged()` and `onPlace()` are overridden for initial setup and neighbor-based updates.

### Textures

Two textures are registered via `registerIcons()`: `_top` for the upper face and `_side` for all other faces, stored in an `icons[2]` array.

## Powered rails

**Source files:** `PoweredRailTile.h/cpp`, `BaseRailTile.h/cpp`

### BaseRailTile foundation

All rail types inherit from `BaseRailTile`, which provides:

- **Direction constants**: `DIR_FLAT_Z` (0), `DIR_FLAT_X` (1), plus slopes (2 to 5) and curves (6 to 9).
- **Data bit**: `RAIL_DATA_BIT` (0x8) is used by powered and detector rails to store their active state. Regular rails use the full data range for direction.
- **Direction mask**: `RAIL_DIRECTION_MASK` (0x7) pulls direction from tiles that use the data bit.
- **Rail detection**: `isRail()` checks if a tile ID is any rail type (normal rail, golden/powered rail, detector rail, or activator rail). Both static overloads are provided (by Level+position, and by raw ID).
- **Data bit flag**: `usesDataBit` (protected bool) marks whether this rail type uses bit 3.
- **Turn icon**: `iconTurn` stores the curved rail texture (only used by non-data-bit rails).

The inner `Rail` class handles connection logic:

- Each rail can connect to up to **2** neighboring rails.
- Rails auto-connect to neighbors during placement via `place()`.
- Slope detection checks one block above for rails in the X and Z directions.
- Curved directions (6 to 9) are only available to rails that don't use the data bit (basically just normal rails).
- Piston push reaction is overridden to `PUSH_NORMAL` instead of the decoration material default (via `getPistonPushReaction()`).
- 4J added a `m_bValidRail` flag for additional validation.

Connection methods (all on the inner `Rail` class):

- `updateConnections()` figures out connections based on direction
- `removeSoftConnections()` cleans up invalid connections
- `hasRail()` / `hasNeighborRail()` check for rails at positions
- `getRail()` gets a `Rail` at a `TilePos`
- `connectsTo()` / `hasConnection()` / `canConnectTo()` / `connectTo()` manage connections
- `countPotentialConnections()` counts possible neighbors

The `neighborChanged()` method checks structural validity: the rail pops off if the block below isn't solid, or if a sloped rail loses its supporting block at the upper end.

Other `BaseRailTile` methods:

- `isUsesDataBit()` public accessor
- `getAABB()` returns the collision box (rails have no collision)
- `blocksLight()` returns `false`
- `isSolidRender()` returns `false`
- `isCubeShaped()` returns `false`
- `clip()` handles ray tracing
- `updateShape()` adjusts the bounding box shape
- `getRenderShape()` returns the rail render shape
- `getResourceCount()` returns 1
- `mayPlace()` checks placement validity
- `onPlace()` / `onRemove()` handle creation and cleanup
- `updateState()` / `updateDir()` handle rail direction updates

### PoweredRailTile

The powered rail extends `BaseRailTile` with `usesDataBit = true`. It uses bit 3 (`RAIL_DATA_BIT`) to store the powered/unpowered state.

**Power propagation:**

`updateState()` determines the powered state from three sources:

1. Direct redstone neighbor signal (`hasNeighborSignal()`).
2. Forward chain search (`findPoweredRailSignal(level, ..., true, 0)`).
3. Backward chain search (`findPoweredRailSignal(level, ..., false, 0)`).

The chain search (`findPoweredRailSignal()`) recursively follows connected powered rails up to a depth of **8 rails**. At each step:

- It moves forward or backward along the rail's axis, handling slopes by adjusting the Y coordinate.
- `isSameRailWithPower()` verifies the neighbor is the same rail type, checks directional compatibility, and either confirms a direct redstone signal or recurses deeper.

When the powered state changes, the rail updates its data and notifies neighbors. For sloped rails (directions 2 to 5), it also updates neighbors at `y + 1`.

**Textures:**

Two textures are used: the default `icon` for unpowered and `iconPowered` (registered as `_powered` suffix) for the active state. Both are stored as `Icon*` pointers.

## Related pages

- [Hoppers and Droppers](/slop-docs/mc/hoppers-droppers/) for hopper mechanics including analog output for comparators
- [Minecart Variants](/slop-docs/mc/minecarts/) for powered rail interaction with minecarts

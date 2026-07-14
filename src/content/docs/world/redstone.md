---
title: Redstone
description: Power propagation in neoLegacy — the Redstone signal constants, the ~30 redstone tiles, redstone-dust strength spreading, the TU31 comparator, and pistons including the slime-block push-chain and the TU31 update fixes.
---

Redstone in neoLegacy is the same integer-strength wire simulation as vanilla
LCE: signals are `0`–`15`, evaluated lazily on demand. There is no global
"redstone graph" — each [tile](/slop-docs/world/blocks/) answers power queries
about itself, and [`Level`](/slop-docs/world/blocks/) fans those queries out over
the six neighbors. This page covers the shared power API, the tile roster, the
TU31 comparator, and the piston rewrite (including the slime-block push chain).

Files: `Redstone.h`, `Redstone.cpp`, `Level.cpp` (the `getSignal` family), plus
one `*Tile.{h,cpp}` per component. Namespace stubs
`net.minecraft.world.level.redstone.h` and
`net.minecraft.world.level.tile.piston.h`.

## Signal constants

The entire `Redstone` class is three constants (`Redstone.h`):

```cpp
class Redstone {
public:
    static const int SIGNAL_NONE = 0;
    static const int SIGNAL_MIN  = 0;
    static const int SIGNAL_MAX  = 15;
};
```

`SIGNAL_MAX = 15` is the hard cap; wire loses one strength per block. `.cpp` is
only the out-of-line definitions (a "whiny PS4 compiler" workaround per the 4J
comment).

## Power propagation — the `Level` signal API

Every power query bottoms out in one of six `Level` methods (`Level.h:454`,
implemented `Level.cpp:3998`+). Direction indices are the standard 0–5 face
order (down, up, north, south, west, east).

| Method | Returns | Meaning |
|--------|---------|---------|
| `getSignal(x,y,z,dir)` | 0–15 | weak power the block at `(x,y,z)` emits toward `dir`. If the block is solid-blocking, returns `getDirectSignalTo` instead (a powered solid re-emits). |
| `getDirectSignal(x,y,z,dir)` | 0–15 | strong ("direct") power — only true sources emit this |
| `getDirectSignalTo(x,y,z)` | 0–15 | max direct signal into a block from all 6 sides; short-circuits at `SIGNAL_MAX` |
| `hasSignal(x,y,z,dir)` | bool | `getSignal(...) > 0` |
| `hasNeighborSignal(x,y,z)` | bool | any of the 6 neighbors weakly powers this block |
| `getBestNeighborSignal(x,y,z)` | 0–15 | strongest of the 6 neighbor signals (uses `Facing::STEP_*`) |

Each `Level` method dispatches to the tile's own virtual of the same name:

```cpp
// Level.cpp:3998
int Level::getDirectSignal(int x, int y, int z, int dir) {
    int t = getTile(x, y, z);
    if (t == 0) return Redstone::SIGNAL_NONE;
    Tile *tile = Tile::tiles[t];
    if (tile == nullptr) return Redstone::SIGNAL_NONE; // tu31 tutorial world fix
    return tile->getDirectSignal(this, x, y, z, dir);
}
```

The `nullptr` guard there is a **TU31 fix** — an unregistered tile ID in an old
tutorial-world save used to crash the signal walk.

### The tile-side contract

On [`Tile`](/slop-docs/world/blocks/) the three virtuals default to "no power":

| Virtual | Base default | Overridden by |
|---------|--------------|---------------|
| `isSignalSource()` | `false` | wire, torch, lever, button, plates, diodes, redstone block, detector rail |
| `getSignal(level,x,y,z,dir)` | `0` | every source (weak power) |
| `getDirectSignal(level,x,y,z,dir)` | `0` | sources that also strong-power (torch up, repeater/comparator front, lever/button on their mount) |

A block is "solid-blocking" (can be powered *through*) when
`material->isSolidBlocking() && isCubeShaped() && !isSignalSource()`
(`Tile.cpp:802`).

## The redstone tile roster

The ~30 redstone-related [tiles](/slop-docs/world/blocks/), grouped by role.
IDs are the block IDs from `Tile.h`; see [Blocks](/slop-docs/world/blocks/) for
the full ID table.

### Sources and wire

| Tile | ID(s) | Class | Notes |
|------|-------|-------|-------|
| Redstone wire | 55 | `RedStoneDustTile` | analog wire; strength in data byte |
| Redstone ore | 73 / 74 | `RedStoneOreTile` | glows when stepped on |
| Redstone torch | 75 / 76 | `NotGateTile` | inverter; off/on IDs |
| Lever | 69 | `LeverTile` | toggle |
| Stone / wood button | 77 / 143 | `StoneButtonTile` / `WoodButtonTile` : `ButtonTile` | momentary |
| Pressure plate (stone/wood) | 70 / 72 | `PressurePlateTile` : `BasePressurePlateTile` | `mobs` vs `everything` trigger set |
| Weighted pressure plate | 147 / 148 | `WeightedPressurePlateTile` | analog by entity count |
| Daylight sensor (+inverted) | 151 / 178 | `DaylightDetectorTile` (+`Entity`) | inverted variant is **neoLegacy** |
| Detector rail | 28 | `DetectorRailTile` : `BaseRailTile` | emits while a cart sits on it |
| Block of redstone | 152 | `PoweredMetalTile` | always-on source **(neoLegacy)** |

### Logic (diodes)

| Tile | ID(s) | Class | Notes |
|------|-------|-------|-------|
| Repeater | 93 / 94 | `RepeaterTile` : `DiodeTile` | delay + lock |
| Comparator | 149 / 150 | `ComparatorTile` : `DiodeTile`, `EntityTile` | **TU31** — see below |

### Mechanisms

| Tile | ID(s) | Class | Notes |
|------|-------|-------|-------|
| Piston / sticky piston | 33 / 29 | `PistonBaseTile` | `false` / `true` sticky flag |
| Piston head | 34 | `PistonExtensionTile` | the extended arm |
| Piston moving piece | 36 | `PistonMovingPiece` | animated in-motion block |
| Dispenser | 23 | `DispenserTile` (+`Entity`) | |
| Dropper | 158 | `DropperTile` : `DispenserTile` | **neoLegacy** |
| Hopper | 154 | `HopperTile` (+`HopperTileEntity` impl `Hopper`) | **neoLegacy** |
| Powered rail | 27 | `PoweredRailTile` | golden rail |
| Activator rail | 157 | `PoweredRailTile` | **neoLegacy** |
| Note block | 25 | `NoteBlockTile` | redstone-triggered |
| Slime block | 165 | `SlimeTile` | piston push medium **(neoLegacy)** |

Most of these carry a [TileEntity](/slop-docs/world/tile-entities/) for their
inventory or extra state (dispenser, dropper, hopper, comparator, daylight
sensor).

## Redstone dust — strength spreading

`RedStoneDustTile` (`RedStoneDustTile.cpp`) stores its current strength in the
block data byte and recomputes it whenever a neighbor changes, via the private
`updatePowerStrength(level, x, y, z, xFrom, yFrom, zFrom)` (`:120`). The core
step:

```cpp
int neighborSignal = level->getBestNeighborSignal(x, y, z);
...
if (newTarget > target) target = newTarget - 1;   // wire loses 1 per step
else if (target > 0)     target--;
else                     target = 0;
if (neighborSignal > target - 1) target = neighborSignal;
```

It scans the four horizontal neighbors, following wire up onto a solid block or
down off a non-solid one (the diagonal step-up / step-down rules), then decays by
one. On any change it writes the new data with `UPDATE_CLIENTS` and enqueues the
7 self-and-neighbor positions in `toUpdate` for a follow-up neighbor notify
(`:169`+).

Output shape is direction-sensitive (`getSignal`, `:290`): wire emits its full
strength **up** and into whichever horizontal directions it visually connects to;
a straight/cross piece with no connections powers all four sides. `getDirectSignal`
only returns non-zero while `shouldSignal` is set (`:284`), which the tile toggles
off around its own `getBestNeighborSignal` call to avoid counting itself.

`isSignalSource()` returns `shouldSignal` (`:330`).

## Worked trace: a lever flip, end to end

This follows one lever toggle from the right-click to a door swinging open, citing
every hop. It is the concrete version of the "each tile answers power queries"
model — there is no graph, just a fan-out of `neighborChanged` calls and lazy
`getSignal` reads.

**1 — Use (`LeverTile::use`).** Right-clicking the lever reaches
`LeverTile::use` (`LeverTile.cpp:241`). The client and server run different arms:
the **client** side only plays the click sound and returns (`:252-261`) — it does
**not** change state, because power is server-authoritative. On the **server** it
flips the "open" bit in the data byte and commits with the neighbor+client flags
(`LeverTile.cpp:262-266`):

```cpp
int data = level->getData(x, y, z);
int dir  = data & 7;
int open = 8 - (data & 8);                 // toggle bit 3
level->setData(x, y, z, dir + open, Tile::UPDATE_ALL);
```

`UPDATE_ALL` (`UPDATE_NEIGHBORS | UPDATE_CLIENTS`, see [Blocks](/slop-docs/world/blocks/#update-flags))
means the data change both syncs to clients and triggers a neighbor fan-out.

**2 — Fan-out (`updateNeighborsAt`).** `use` then explicitly notifies its own six
neighbors *and* the block it is mounted on (`LeverTile.cpp:271-295`) — the mount
call is direction-dependent so a wall lever also re-powers the block behind it:

```cpp
level->updateNeighborsAt(x, y, z, id);       // the lever's own 6 neighbors
if (dir == 1)      level->updateNeighborsAt(x - 1, y, z, id);   // + the mount face
else if (dir == 2) level->updateNeighborsAt(x + 1, y, z, id);
// ... one branch per mount direction ...
```

`Level::updateNeighborsAt` (`Level.cpp:1125`) is just six `neighborChanged` calls,
one per face:

```cpp
neighborChanged(x - 1, y, z, tile);  neighborChanged(x + 1, y, z, tile);
neighborChanged(x, y - 1, z, tile);  neighborChanged(x, y + 1, z, tile);
neighborChanged(x, y, z - 1, tile);  neighborChanged(x, y, z + 1, tile);
```

**3 — The client-side guard.** `Level::neighborChanged` (`Level.cpp:1145`)
short-circuits on the client:

```cpp
void Level::neighborChanged(int x, int y, int z, int type) {
    if (isClientSide) return;                 // clients never run redstone logic
    int id = getTile(x, y, z);
    Tile *tile = Tile::tiles[id];
    if (tile != nullptr) tile->neighborChanged(this, x, y, z, type);
}
```

This is the reason the whole redstone simulation only runs host-side; clients see
the *result* via the `UPDATE_CLIENTS` block-change packet, not by re-simulating.

**4 — A reacting tile (`DoorTile::neighborChanged`).** Say a wooden door is
adjacent. Its `DoorTile::neighborChanged` (`DoorTile.cpp:241`) reads whether it is
powered by *either* of its two halves and opens accordingly (`:270-274`):

```cpp
bool signal = level->hasNeighborSignal(x, y, z) || level->hasNeighborSignal(x, y + 1, z);
if ((signal || (type > 0 && Tile::tiles[type]->isSignalSource())) && type != id)
    setOpen(level, x, y, z, signal);
```

`hasNeighborSignal` bottoms out in the six `getSignal` queries from the
[power API](#power-propagation--the-level-signal-api) above; the lever answers
`SIGNAL_MAX` on `getSignal` while its data bit 3 is set (`LeverTile.cpp:334-336`).
The lower half of the door forwards notifications to the upper half and back
(`DoorTile.cpp:279-286`) so the two-block door acts as one.

### Update-order caveats

Two subtleties fall out of this fan-out model, both visible in the trace:

- **`type != id` self-exclusion.** The door checks `type != id` (`DoorTile.cpp:271`)
  so a door updating its *own* neighbor half doesn't re-trigger itself into an
  infinite loop. Tiles that power themselves (redstone dust) instead toggle a
  `shouldSignal` flag around their own `getBestNeighborSignal` call
  (`RedStoneDustTile.cpp:127-129`) to avoid counting their own output.
- **Depth-first, immediate recursion.** `neighborChanged` runs the reacting tile's
  logic *synchronously* inside the originating `setData`. A wire that repowers on
  the lever flip calls `updatePowerStrength` (`RedStoneDustTile.cpp:107`), which
  itself defers its follow-up neighbor notifies into a `toUpdate` set and drains
  them *after* the strength walk (`:111-117`) rather than recursing mid-walk — the
  neoLegacy way of keeping the wire spread from exploding into deep recursion.

## Comparator (TU31)

The comparator is a **TU31 backport** — not present in the TU19 base.
`ComparatorTile` (`ComparatorTile.h`) multiply-inherits `DiodeTile` **and**
`EntityTile`, because it needs a [TileEntity](/slop-docs/world/tile-entities/)
(`ComparatorTileEntity`) to latch its output between ticks. Its constructor sets
`_isEntityTile = true` (`ComparatorTile.cpp:12`).

### Data layout

The data byte packs three things (`ComparatorTile.h:12`):

| Bits | Constant | Meaning |
|------|----------|---------|
| 0–1 | (`DIRECTION_MASK`) | facing |
| bit 2 (`0x4`) | `BIT_OUTPUT_SUBTRACT` | mode: compare (0) vs subtract (1) |
| bit 3 (`0x8`) | `BIT_IS_LIT` | front torch lit |

Right-clicking toggles `BIT_OUTPUT_SUBTRACT`; `isReversedOutputSignal(data)`
reads it (`:118`).

### Two modes

`calculateOutputSignal` (`:106`) picks the mode:

```cpp
if (!isReversedOutputSignal(data))
    return getInputSignal(level, x, y, z, data);                 // compare mode
else
    return max(getInputSignal(...) - getAlternateSignal(...), Redstone::SIGNAL_NONE); // subtract mode
```

- **Compare mode** — output = rear input, but only if no stronger side input;
  `shouldTurnOn` returns `input >= alt` (`:123`).
- **Subtract mode** — output = `max(rear − side, 0)`.

`getInputSignal` (`:135`) is where the comparator reads **container fullness**:
the block behind it (one or two blocks, looking through a solid) is queried for
`hasAnalogOutputSignal()` / `getAnalogOutputSignal(...)`, and if there's an
[item frame](/slop-docs/world/tile-entities/) it reads `frame->getAnalogOutput()`.
That is how a comparator measures a chest, furnace, hopper, cake, cauldron, etc.

`getTurnOnDelay` is a flat `2` game ticks (`:52`).

## Pistons

`PistonBaseTile` (`PistonBaseTile.cpp`, ~800 lines) drives both the normal and
sticky piston (the `sticky` flag is set at construction, `Tile.cpp:411`/`:416`).

### Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `MAX_PUSH_DEPTH` | `12` | max blocks a piston can move (`PistonBaseTile.h:18`) |
| `PLATFORM_THICKNESS` | `4.0f` | head-plate thickness in 1/16 units (`PistonBaseTile.cpp:26`) |

### Extend / contract logic

`checkIfExtend` (`:175`) is called from `onPlace`/`neighborChanged` and decides
whether to fire an extend or contract tile-event:

```cpp
bool extend = getNeighborSignal(level, x, y, z, facing);
if (extend && !isExtended(data))      // -> TRIGGER_EXTEND
else if (!extend && isExtended(data)) // -> TRIGGER_CONTRACT
```

`getNeighborSignal` (`:211`) is the piston-specific power check: it tests all six
neighbors **except the push direction**, plus the "quasi-connectivity" positions
one block up — matching LCE's BUD-able piston behavior.

### The push structure — slime-block chains (neoLegacy)

The heart of the neoLegacy piston work is `collectStructure` (`:585`), a
breadth-first search that gathers the set of blocks a piston moves. Vanilla TU19
pistons pushed only a straight column; neoLegacy models the modern slime-block
push graph.

Each block's `getPistonPushReaction()` (from its [Material](/slop-docs/world/materials/),
`Tile.cpp:1523`) selects behavior:

| Reaction | Value | Effect in `collectStructure` |
|----------|-------|------------------------------|
| `PUSH_NORMAL` | 0 | added to `toMove`, continues in push direction |
| `PUSH_DESTROY` | 1 | added to `toDestroy` (breaks) |
| `PUSH_BLOCK` | 2 | not pushable — aborts the whole move |
| `PUSH_SLIME` | 3 | added to `toMove` **and** enqueues all 6 adjacent pushable neighbors |

The BFS aborts and moves nothing if the set would exceed `MAX_PUSH_DEPTH`, hit
bedrock/build-height, or hit a `PUSH_BLOCK` block:

```cpp
// PistonBaseTile.cpp:635
if ((int)toMove.size() >= MAX_PUSH_DEPTH) return false;
toMove.push_back(pos);
queue.push_back({ pos.x + Facing::STEP_X[moveDir], ... });   // push direction
if (reaction == Material::PUSH_SLIME) {
    for (int d = 0; d < 6; d++) {                            // slime drags neighbors
        if (d == moveDir) continue;
        ...
        queue.push_back({nx, ny, nz});
    }
}
```

`SlimeTile::getPistonPushReaction()` returns `Material::PUSH_SLIME`
(`SlimeTile.cpp:35`) — that single override is what makes a slime block drag its
neighbors along. Sticky-piston retraction (`:363`+) uses the same `PUSH_SLIME`
branch: if the direct pull fails it retries `collectStructure` with the
adjacency fallback so a sticky piston can pull a slime cluster.

### TU31 fixes

Two robustness guards in the piston path are labelled TU31 fixes:

- `isPushable` returns `false` on a `nullptr` tile (`:527`, "tu31 tutorial world
  fix") — the same unregistered-ID guard as the signal walk, so a corrupt tile ID
  no longer crashes a piston.
- The extend-length pre-check that walks up to `MAX_PUSH_DEPTH + 1` blocks
  (`:258`) is compiled only in the server build, keeping the push-length
  validation authoritative on the host.

## Related

- [Blocks (Tiles)](/slop-docs/world/blocks/) — the `Tile` base and full ID table.
- [Block Entities (TileEntity)](/slop-docs/world/tile-entities/) — comparator, dispenser, dropper, hopper, daylight-sensor entities.
- [Materials](/slop-docs/world/materials/) — where `getPistonPushReaction` comes from.
- [Containers](/slop-docs/world/containers/) — the inventories a comparator measures.

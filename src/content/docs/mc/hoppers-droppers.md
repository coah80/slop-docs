---
title: "Hoppers & Droppers"
description: "Hopper and dropper tile entities and menus."
---

This page covers the hopper and dropper systems in MinecraftConsoles, including item transfer mechanics, cooldown timers, container interaction, redstone control, and the hopper menu UI.

## Hopper interface

**Source file:** `Hopper.h`

The `Hopper` abstract class extends `Container` (using virtual inheritance) and defines the interface for anything that acts as a hopper (both the tile entity and the minecart hopper):

- `getLevel()` returns the `Level*` world reference.
- `getLevelX()`, `getLevelY()`, `getLevelZ()` are `double` position accessors for item pickup range calculations.

This is a minimal interface. The heavy lifting is in `HopperTileEntity`.

## HopperTile

**Source files:** `HopperTile.h/cpp`

`HopperTile` extends `BaseEntityTile` and manages the block-level behavior of hoppers.

### Data bits

| Mask | Constant | Purpose |
|------|----------|---------|
| `0x7` | `MASK_ATTACHED` | Attached face direction (which way the hopper outputs) |
| `0x8` | `MASK_TOGGLE` | Disabled by redstone when set |

### Placement direction

`getPlacedOnFaceDataValue()` sets the hopper's output direction to the opposite of the face it was placed against. If the result would be `UP`, it gets forced to `DOWN` since hoppers never output upward.

### Redstone control

`checkPoweredState()` is a private method that runs on placement and whenever a neighbor changes. It checks `hasNeighborSignal()`:

- **No redstone signal**: Hopper is enabled (toggle bit clear).
- **Redstone signal present**: Hopper is disabled (toggle bit set).

The static helper `isTurnedOn(int data)` checks `(data & MASK_TOGGLE) != MASK_TOGGLE`, so the hopper is active when the toggle bit is **not** set.

### Collision shape

The hopper has a complex collision model built from five AABBs in `addAABBs()`:

1. A top basin (full width, 10/16 tall).
2. Four thin walls (2/16 thick) on each side, extending to full height.

### Custom naming

If the item used to place the hopper has a custom hover name, it gets passed to the tile entity via `setCustomName()` in the `setPlacedBy()` method.

### Analog output

`hasAnalogOutputSignal()` returns `true`, and `getAnalogOutputSignal()` delegates to `AbstractContainerMenu::getRedstoneSignalFromContainer()`. This is what lets comparators read the hopper's fullness level.

### Block removal

When the hopper block is broken, `onRemove()` goes through all container slots and spawns each item stack as `ItemEntity` instances in the world with randomized positions and velocities, then calls `updateNeighbourForOutputSignal()` to let comparators know.

### Render properties

- `getRenderShape()` returns a custom render shape
- `isCubeShaped()` returns `false`
- `isSolidRender()` returns `false`
- `shouldRenderFace()` controls transparent face rendering

### Static helpers

- `getAttachedFace(int data)` extracts the output face direction from the data
- `getHopper(LevelSource*, int x, int y, int z)` gets the `HopperTileEntity` at a position as a shared pointer
- `getTexture(wstring name)` static texture lookup by name

### Textures

Three textures are registered in `registerIcons()`: `hopper_outside`, `hopper_top`, and `hopper_inside` (used by the renderer for the inner funnel). These have static name constants `TEXTURE_OUTSIDE` and `TEXTURE_INSIDE`.

`getTileItemIconName()` returns the icon name for the item form.

## HopperTileEntity

**Source files:** `HopperTileEntity.h/cpp`

The tile entity handles item storage, transfer logic, and cooldown management. It extends both `TileEntity` and `Hopper`. The entity type is `eTYPE_HOPPERTILEENTITY`, with a static `create()` factory and a 4J-added `clone()` method.

### Container

- **5 slots** initialized as `ItemInstanceArray(5)`.
- Max stack size: `LARGE_MAX_STACK_SIZE` (64) via `getMaxStackSize()`.
- Validation distance: player must be within 8 blocks (`distanceToSqr <= 64`) via `stillValid()`.
- `canPlaceItem()` returns `true` for all items (no filtering).
- Custom name support via `getName()`, `getCustomName()`, `hasCustomName()`, `setCustomName()`.
- `getItem()`, `setItem()`, `removeItem()`, `removeItemNoUpdate()` for slot access.
- `getContainerSize()` returns 5.
- `startOpen()`, `stopOpen()` for container open/close events.

### Cooldown system

| Constant | Value | Purpose |
|----------|-------|---------|
| `MOVE_ITEM_SPEED` | `8` | Ticks between item transfers |

The `cooldownTime` field starts at `-1`. The `tick()` method decrements it each tick. When cooldown hits zero or below, `tryMoveItems()` is called. A successful transfer resets the cooldown to `MOVE_ITEM_SPEED` (8 ticks).

Additional cooldown methods:

- `setCooldown(int time)` sets the cooldown directly
- `isOnCooldown()` checks if the hopper is still waiting

### Item transfer flow

`tryMoveItems()` runs only when the hopper is enabled (`isTurnedOn()`) and not on cooldown:

1. **Eject**: `ejectItems()` tries to push one item from any hopper slot into the attached container.
2. **Suck**: `suckInItems()` tries to pull one item from the container above.

If either operation succeeds, the cooldown resets to 8 ticks.

### Ejecting items

`ejectItems()` (private) gets the container at the attached face position via `getAttachedContainer()`. For each non-empty slot, it:

1. Copies the original item (for rollback).
2. Removes 1 item from the slot.
3. Calls `addItem()` on the destination container with the opposite facing.
4. If the destination rejects the item, restores the original.

### Sucking items

`suckInItems()` (public static, takes a `Hopper*`) works in two modes:

1. **Container above**: If `getSourceContainer()` finds a container one block above, it goes through the source's slots (respecting `WorldlyContainer` face restrictions with `getSlotsForFace(DOWN)`). For each item, `tryTakeInItemFromSlot()` (private static) pulls one item.
2. **Loose items**: If there's no container above, `getItemAt()` searches for `ItemEntity` instances in the block above and absorbs them.

### Adding items to containers

Two static `addItem()` overloads:

- `addItem(Container*, shared_ptr<ItemEntity>)` absorbs an item entity
- `addItem(Container*, shared_ptr<ItemInstance>, int face)` adds an item stack respecting face restrictions

### WorldlyContainer support

The hopper respects `WorldlyContainer` interfaces for both input and output. Private static helpers:

- `canPlaceItemInContainer()` checks `canPlaceItemThroughFace()` for the destination
- `canTakeItemFromContainer()` checks `canTakeItemThroughFace()` for the source

This allows sided inventory restrictions (like furnaces, which only accept fuel from the side and output from the bottom).

### Item merging

`tryMoveInItem()` (private static) handles placing items into a destination slot:

- If the slot is empty, the item goes in directly.
- If the slot has a matching item (same ID, aux value, and tags), items get merged up to the max stack size.
- When an item is added to another hopper, that hopper's cooldown also gets set to `MOVE_ITEM_SPEED`.

`canMergeItems()` (private static) validates merge compatibility: matching item ID, matching aux value, count within stack limit, and matching NBT tags.

### Container discovery

`getContainerAt()` (public static) searches for a container at a given position:

1. First checks for a tile entity implementing `Container`.
2. Special-cases `ChestTileEntity` to get the merged double-chest container via `ChestTile::getContainer()`.
3. If no tile entity container is found, it searches for entity-based containers (e.g., minecart chests) in the block's AABB, picking one at random if multiple exist.

`getSourceContainer()` (public static) gets the container above the hopper.
`getAttachedContainer()` (private) gets the container at the output face.

### Position accessors

Implementing the `Hopper` interface:

- `getLevel()` returns the tile entity's level
- `getLevelX()` / `getLevelY()` / `getLevelZ()` return the tile entity's world position as doubles

### NBT serialization

| Tag | Type | Purpose |
|-----|------|---------|
| `"Items"` | List of CompoundTags | Inventory contents (each with `"Slot"` byte) |
| `"TransferCooldown"` | Int | Current cooldown value |
| `"CustomName"` | String | Optional custom name |

## HopperMenu

**Source files:** `HopperMenu.h/cpp`

The hopper menu provides a 5-slot container interface.

### Slot layout

| Range | Constant | Purpose |
|-------|----------|---------|
| 0 to 4 | `CONTENTS_SLOT_START` | Hopper inventory (5 slots) |
| 5 to 31 | `INV_SLOT_START` | Player inventory (27 slots) |
| 32 to 40 | `USE_ROW_SLOT_START` | Player hotbar (9 slots) |

The hopper slots are laid out horizontally at pixel position `(44 + slot * 18, 20)` with the player inventory starting 51 pixels below.

### Quick-move (shift-click)

`quickMoveStack()` moves items between the hopper and player inventory:

- From hopper slots: moves to player inventory (preferring the far end first).
- From player inventory: moves into hopper slots.

## DispenserTile

**Source files:** `DispenserTile.h/cpp`

The dispenser is the parent class for the dropper. It extends `BaseEntityTile`.

### Data bits

| Mask | Constant | Purpose |
|------|----------|---------|
| `0x7` | `FACING_MASK` | Output face direction |
| `8` | `TRIGGER_BIT` | Redstone activation state |

### Registry

A static `BehaviorRegistry REGISTRY` stores all item-to-behavior mappings. This is the central lookup table for dispenser item behaviors.

### Key methods

- `dispenseFrom()` handles the core dispense logic (protected virtual, overridden by dropper)
- `getDispenseMethod()` looks up the behavior for an item (protected virtual, overridden by dropper)
- `neighborChanged()` handles redstone signal changes
- `tick()` handles delayed activation
- `getTickDelay()` returns the activation delay
- `getDispensePosition()` static helper that calculates the dispense position from a block source
- `getFacing()` static helper that extracts the facing direction from data
- `hasAnalogOutputSignal()` returns `true`
- `getAnalogOutputSignal()` returns a signal based on container fullness
- `recalcLockDir()` recalculates the facing direction (private)

### Textures

Three icons: `iconTop`, `iconFront`, `iconFrontVertical`. The 4J `soundOnly` parameter is added to `use()` and `TestUse()` is provided for tooltip support.

## DropperTile

**Source files:** `DropperTile.h/cpp`

The dropper extends `DispenserTile`, inheriting the dispenser's facing system and redstone activation logic.

### Key differences from dispenser

The dropper overrides `getDispenseMethod()` to always return `DefaultDispenseItemBehavior`, regardless of the item type. The dispenser uses item-specific behaviors (like shooting arrows or placing boats), but the dropper uses the same generic drop behavior for everything. This is stored as a private `DISPENSE_BEHAVIOUR` pointer.

### Dropper-to-container transfer

`dispenseFrom()` contains the dropper's unique logic:

1. Gets a random occupied slot from the `DispenserTileEntity`.
2. Checks for a container at the position the dropper faces.
3. **Container found**: Uses `HopperTileEntity::addItem()` to transfer one item into the adjacent container, respecting facing. If the transfer fails, the original item is preserved.
4. **No container**: Falls back to `DefaultDispenseItemBehavior::dispense()`, which drops the item into the world.

### Tile entity

`DropperTileEntity` extends `DispenserTileEntity` and only overrides `getName()` to return the dropper-specific localization string (`IDS_CONTAINER_DROPPER`). Created via `newTileEntity()`.

### Textures

The dropper registers its own front textures (`_front_horizontal` and `_front_vertical`) via `registerIcons()` but shares the furnace side and top textures with the dispenser.

## Related pages

- [Redstone Mechanics](/slop-docs/mc/redstone/) for comparator analog signal reading from hoppers
- [Minecart Variants](/slop-docs/mc/minecarts/) for the minecart hopper and minecart chest
- [Behavior System](/slop-docs/mc/behaviors/) for the dispenser behavior registry details

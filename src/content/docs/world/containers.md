---
title: Container Menus
description: AbstractContainerMenu and the 14 menu classes in neoLegacy — slots, click handling, client/server sync, and the crafting-table menu.
---

A **container menu** is the server-authoritative model behind every inventory GUI:
chest, furnace, anvil, beacon, brewing stand, hopper, dispenser, villager trade,
horse inventory, enchantment table, fireworks table, crafting table, and the
player inventory itself. It owns the list of `Slot`s, validates clicks, and keeps
client and server in sync. neoLegacy keeps the decompiled Java name
`AbstractContainerMenu` (the old LCE `Container` name is used for the *storage*
interface instead).

Files: `AbstractContainerMenu.h`, `AbstractContainerMenu.cpp` (~23 KB), plus one
`*Menu.{h,cpp}` per menu. Storage-side interfaces: `Container.h`,
`WorldlyContainer.h`, `Hopper.h`, `CompoundContainer.h`.

## Base class — AbstractContainerMenu

`class AbstractContainerMenu` (`AbstractContainerMenu.h:14`). It is abstract:
`virtual bool stillValid(shared_ptr<Player>) = 0` (`:95`) forces every subclass to
say when the menu should auto-close (player walked away, block broken).

### Core state

| Member | Type | Notes |
|--------|------|-------|
| `slots` | `vector<Slot *>` | the menu's slots, in order; owned/deleted by the menu |
| `lastSlots` | `vector<shared_ptr<ItemInstance>>` | last-broadcast snapshot per slot |
| `containerId` | `int` | window id for the network protocol |
| `containerListeners` | `vector<ContainerListener*>` | who to notify on change |
| `changeUid` | `short` | rolling transaction id for click acks |
| `quickcraftSlots` | `unordered_set<Slot*>` | slots painted during a drag |

### Click constants

Click behaviour is driven by a `clickType` enum baked into the base
(`AbstractContainerMenu.h:19-25`):

| Constant | Value | Meaning |
|----------|-------|---------|
| `CLICK_PICKUP` | 0 | normal pick-up / place |
| `CLICK_QUICK_MOVE` | 1 | shift-click transfer |
| `CLICK_SWAP` | 2 | hotbar swap |
| `CLICK_CLONE` | 3 | middle-click clone (creative) |
| `CLICK_THROW` | 4 | drop |
| `CLICK_QUICK_CRAFT` | 5 | drag-distribute |
| `CLICK_PICKUP_ALL` | 6 | double-click gather |

Drag ("quick craft") state uses `QUICKCRAFT_TYPE_CHARITABLE`/`_GREEDY` and the
`QUICKCRAFT_HEADER_START`/`_CONTINUE`/`_END` phase constants (`:27-31`). Clicking
empty space uses the sentinel `SLOT_CLICKED_OUTSIDE = -999` (`:17`).

The three `CONTAINER_ID_*` constants are a **4J addition** (`:34-36`):
`CONTAINER_ID_CARRIED = -1`, `CONTAINER_ID_INVENTORY = 0`, `CONTAINER_ID_CREATIVE
= -2` — added by "4J Stu" to fix a bug where items picked up while the creative
menu was open would overwrite creative-menu slots.

### Key methods

| Method | Purpose |
|--------|---------|
| `addSlot(Slot*)` | append a slot, assign its `index`, grow `lastSlots` |
| `clicked(slot,button,clickType,player,looped)` | the master click dispatcher (4J added the `looped` param) |
| `quickMoveStack(player,slot)` | shift-click transfer logic (per-menu override) |
| `broadcastChanges()` | diff slots vs `lastSlots`, notify listeners |
| `sendData(id,value)` | push a scalar (e.g. furnace burn time) to listeners |
| `moveItemStackTo(stack,start,end,backwards)` | helper for quick-move |
| `stillValid(player)` | **pure virtual** — close condition |
| `isValidIngredient(item,slotId)` | 4J-added crafting-input predicate |

`clicked()` gained a `looped` parameter in neoLegacy (`:73`) and a protected
`loopClick()` helper (`:78`) to support holding a button to repeat a click — a
console-controller affordance absent from the PC Java original.

## Client / server sync

Menus are server-authoritative. A `ContainerListener` (the connected player's
server handler) is registered via `addSlotListener()`, which immediately pushes
the full contents and then calls `broadcastChanges()`
(`AbstractContainerMenu.cpp:43-51`).

`broadcastChanges()` (`AbstractContainerMenu.cpp:77`) diffs every slot against its
`lastSlots` snapshot and only emits changed slots:

```cpp
if (!ItemInstance::matches(expected, current))
{
    expected = (current == nullptr || current->count == 0) ? nullptr : current->copy();
    lastSlots[i] = expected;
    m_bNeedsRendered = true;
    for (auto& it : containerListeners)
        it->slotChanged(this, i, expected);
}
```

The `count == 0` guard is a **4J fix** (comment at `:85`) for an anvil bug where a
broadcast fires mid-quick-move before a slot is nulled. `sendData()` broadcasts
scalar fields (`:69`) — furnace lit time, anvil cost, beacon levels — separately
from item contents. `needsRendered()` (`:99`) is a 4J-added client-side dirty-flag
poll used by the XUI renderer.

### Worked trace: one click's full round-trip

This follows a single left-click on a chest slot from the on-screen cursor to the
refreshed scene, citing every hop. The client is **optimistic**: it applies the
click locally *first*, sends the packet, and the server either confirms (silence)
or corrects.

**1 — Input (scene → gameMode).** `AbstractContainerScreen::mouseClicked`
(`AbstractContainerScreen.cpp:168`) is reached when the cursor/controller commits a
click over the container GUI. It resolves the hovered `Slot` with `findSlot(x,y)`
(`:173`), maps it to a `slotId` (or the clicked-outside sentinel if the click
landed off the panel, `:182-185`), reads shift for a quick-move, and calls
`minecraft->gameMode->handleInventoryMouseClick(menu->containerId, slotId, buttonNum, quickKey, player)`
(`:190`).

**2 — Optimistic apply + send (client).**
`MultiPlayerGameMode::handleInventoryMouseClick` (`MultiPlayerGameMode.cpp:448`)
snapshots the inventory for rollback with `backup(...)` (which returns the rolling
`changeUid`, `:450`), runs the **same** `clicked()` the server will run so the GUI
updates instantly (`:452`), then wires the result and uid into a
`ContainerClickPacket` and enqueues it (`:453`):

```cpp
short changeUid = player->containerMenu->backup(player->inventory);
shared_ptr<ItemInstance> clicked = player->containerMenu->clicked(
    slotNum, buttonNum, quickKeyHeld ? AbstractContainerMenu::CLICK_QUICK_MOVE
                                     : AbstractContainerMenu::CLICK_PICKUP, player);
connection->send(std::make_shared<ContainerClickPacket>(
    containerId, slotNum, buttonNum, quickKeyHeld, clicked, changeUid));
```

The packet copies the carried item so it owns its own data
(`ContainerClickPacket.cpp:32`) and serializes as
`byte containerId, short slotNum, byte buttonNum, short uid, byte clickType, item`
(`:51`).

**3 — Server authority (`handleContainerClick`).** The server's
`PlayerConnection::handleContainerClick` (`PlayerConnection.cpp:2028`) first gates
on the window matching and being synched (`:2031`), re-runs the authoritative
`clicked()` (`:2047`), and **diffs the result against the client's claim**:

```cpp
shared_ptr<ItemInstance> clicked =
    player->containerMenu->clicked(packet->slotNum, packet->buttonNum, packet->clickType, player);
if (ItemInstance::matches(packet->item, clicked)) {          // client guessed right
    player->connection->send(std::make_shared<ContainerAckPacket>(packet->containerId, packet->uid, true));
    player->ignoreSlotUpdateHack = true;
    player->containerMenu->broadcastChanges();               // -> §4
    player->broadcastCarriedItem();
    player->ignoreSlotUpdateHack = false;
} else {                                                     // desync -> full refresh
    expectedAcks[player->containerMenu->containerId] = packet->uid;
    player->connection->send(std::make_shared<ContainerAckPacket>(packet->containerId, packet->uid, false));
    player->containerMenu->setSynched(player, false);
    player->refreshContainer(player->containerMenu, &items); // whole window resent
}
```

The `ignoreSlotUpdateHack` flag is the key to the optimistic model: when the client
predicted correctly, the server broadcasts changes but **suppresses** the per-slot
packets for that click (see §5) — the client already applied them, so re-sending
would double-apply. On a WINDOWS64 server build a `FourKitBridge::FireInventoryClick`
mod hook can also veto or force-refresh the click before `clicked()` runs
(`:2033-2046`), a neoLegacy addition.

**4 — Broadcast diff (`broadcastChanges` → listener).**
`AbstractContainerMenu::broadcastChanges` (`AbstractContainerMenu.cpp:77`) diffs
each slot against `lastSlots` and, for every changed slot, notifies its listeners —
the connected player is a `ContainerListener` (`:93`):

```cpp
for (auto& it : containerListeners)
    it->slotChanged(this, i, expected);
```

**5 — Slot packet (server → client).** The player's listener is `ServerPlayer`, so
`slotChanged` lands in `ServerPlayer::slotChanged` (`ServerPlayer.cpp:1586`). It
drops result-slot updates (a `ResultSlot` recomputes client-side, `:1588`), honors
`ignoreSlotUpdateHack` by returning early for a correctly-predicted click
(`:1593-1601`), and otherwise sends the one changed slot
(`ServerPlayer.cpp:1603`):

```cpp
connection->send(std::make_shared<ContainerSetSlotPacket>(container->containerId, slotIndex, item));
```

**6 — Client apply (`handleContainerSetSlot`).**
`ClientConnection::handleContainerSetSlot` (`ClientConnection.cpp:3342`) routes by
`containerId`: `CONTAINER_ID_CARRIED` sets the cursor item, `CONTAINER_ID_INVENTORY`
writes the player inventory menu (with the 4J Stu creative-menu pickup fix at
`:3353-3364`), and the live window id writes `player->containerMenu->setItem(...)`
(`:3369`) — refreshing the scene.

So a correctly-predicted click is nearly silent on the wire — one
`ContainerClickPacket` up, one `ContainerAckPacket` down, and (thanks to
`ignoreSlotUpdateHack`) **no** `ContainerSetSlotPacket` echo. A mispredicted click
costs a rejecting ack plus a full `refreshContainer` resend of the window.

### Container packet family

Sync rides on a fixed set of packets (`getId()` values read from each header):

| Packet | ID | Direction / purpose |
|--------|----|--------------------|
| `ContainerOpenPacket` | 100 | server → client: open GUI (`containerId`, `type`, title, size) |
| `ContainerClosePacket` | 101 | close the window |
| `ContainerClickPacket` | 102 | client → server: `slotNum`, `buttonNum`, `clickType`, carried item, `uid` |
| `ContainerSetSlotPacket` | 103 | server → client: one slot changed |
| `ContainerSetContentPacket` | 104 | server → client: full contents |
| `ContainerSetDataPacket` | 105 | server → client: scalar `(id, value)` |
| `ContainerAckPacket` | 106 | server → client: accept/reject a click `uid` |
| `ContainerButtonClickPacket` | 108 | client → server: a menu button (enchant slot, etc.) |

`ContainerOpenPacket` carries a `type` discriminator selecting which GUI to build
(`ContainerOpenPacket.h:9-26`):

| Type | Value | | Type | Value |
|------|-------|---|------|-------|
| `CONTAINER` | 0 | | `REPAIR_TABLE` | 8 |
| `WORKBENCH` | 1 | | `HOPPER` | 9 |
| `FURNACE` | 2 | | `DROPPER` | 10 |
| `TRAP` | 3 | | `HORSE` | 11 |
| `ENCHANTMENT` | 4 | | `FIREWORKS` | 12 *(4J)* |
| `BREWING_STAND` | 5 | | `BONUS_CHEST` | 13 *(4J)* |
| `TRADER_NPC` | 6 | | `LARGE_CHEST` | 14 *(4J)* |
| `BEACON` | 7 | | `ENDER_CHEST` | 15 *(4J)* |

Plus `MINECART_CHEST = 16` and `MINECART_HOPPER = 17`, all marked "4J Added"
(`ContainerOpenPacket.h:21-26`) — these open-types don't exist in the PC Java
protocol and were added for LCE's minecart and fireworks containers.

## Slots

Each menu builds its layout by `addSlot()`-ing `Slot` objects in a fixed order,
then exposing named **slot-range constants** so the renderer and quick-move logic
can reason about regions. The universal convention across menus: content/result
slots first, then the 27-slot inventory (`INV_SLOT_START..INV_SLOT_END`), then the
9-slot hotbar (`USE_ROW_SLOT_START..USE_ROW_SLOT_END`).

Menus frequently define **custom Slot subclasses** with placement rules:
`BeaconMenu::PaymentSlot` (only accepts emerald/diamond/gold/iron),
`BrewingStandMenu::PotionSlot` / `IngredientsSlot`,
`HorseSaddleSlot` / `HorseArmorSlot`, and the anvil/repair `RepairResultSlot`.

## The 14 menus

All derive from `AbstractContainerMenu`. Slot-range constants are read directly
from each header.

| Menu | Opens from | Content slots |
|------|-----------|---------------|
| `InventoryMenu` | player inventory | result 0, craft 1-4 (2×2), armor, inv, hotbar |
| `ContainerMenu` | chest / large chest | N rows of container + inv + hotbar |
| `CraftingMenu` | crafting table | result 0, craft 1-9 (3×3) |
| `FurnaceMenu` | furnace | ingredient 0, fuel 1, result 2 |
| `AnvilMenu` | anvil | input 0, additional 1, result 2 |
| `RepairMenu` | (repair table) | input 0, additional 1, result 2 |
| `EnchantmentMenu` | enchantment table | ingredient 0, lapis 1 |
| `BeaconMenu` | beacon | payment 0 |
| `BrewingStandMenu` | brewing stand | bottles 0-2, ingredient 3 |
| `HopperMenu` | hopper | contents 0-4 |
| `TrapMenu` | dispenser / dropper | 3×3 (slots 0-8) |
| `MerchantMenu` | villager trade | payment 0, payment 1, result 2 |
| `HorseInventoryMenu` | horse / donkey | saddle + armor + chest |
| `FireworksMenu` | (fireworks crafting) | result 0, craft 1-9 (3×3) |

`AnvilMenu` and `RepairMenu` are near-identical twins (input/additional/result
0-1-2, `DATA_TOTAL_COST = 0` scalar sync), differing only in how the result is
computed. `FireworksMenu` mirrors `CraftingMenu`'s 3×3 layout but overrides
`isValidIngredient()` (`FireworksMenu.h:42`) and tracks
`m_canMakeFireworks`/`m_canMakeCharge`/`m_canMakeFade` — it is a **neoLegacy/newer-TU
addition** paired with the fireworks item set.

### Crafting menu

Files: `CraftingMenu.h`, `CraftingMenu.cpp`.

The crafting-table menu is a **separate class** from the 2×2 grid built into
`InventoryMenu`. `CraftingMenu` (`CraftingMenu.h:8`) is a full 3×3 grid opened
against a workbench block, holding a `CraftingContainer craftSlots` and a
one-slot `resultSlots`. Slot ranges (`CraftingMenu.h:12-18`):

| Constant | Value | Region |
|----------|-------|--------|
| `RESULT_SLOT` | 0 | crafted output |
| `CRAFT_SLOT_START` | 1 | 3×3 grid start |
| `CRAFT_SLOT_END` | 10 | grid end (`START + 9`) |
| `INV_SLOT_START` | 10 | inventory start |
| `INV_SLOT_END` | 37 | inventory end (`+ 9*3`) |
| `USE_ROW_SLOT_START` | 37 | hotbar start |
| `USE_ROW_SLOT_END` | 46 | hotbar end (`+ 9`) |

It stores its owning block position (`x, y, z` + `Level*`) so `stillValid()` can
re-check the workbench is still there and `removed()` can dump the grid back to
the player on close. `slotsChanged()` re-runs the recipe match to populate the
result slot; `canTakeItemForPickAll()` is overridden so double-click doesn't
vacuum the result slot.

> This full-grid `CraftingMenu` and its workbench GUI are attributed to a
> community contribution to neoLegacy. The class itself, its slot ranges, and its
> recipe-driven `slotsChanged()` are verifiable in `CraftingMenu.{h,cpp}`; the
> attribution/provenance is not recorded in the source and is noted here only as
> context.

By contrast the **player inventory** grid (`InventoryMenu`) is always a 2×2:
`CRAFT_SLOT_START..CRAFT_SLOT_END` spans four slots, and it additionally owns the
four armor slots (`ARMOR_SLOT_START..ARMOR_SLOT_END`, `InventoryMenu.h:15-23`).

## Related

- [Block Entities (TileEntity)](/slop-docs/world/tile-entities/) — the storage
  behind chest/furnace/hopper/beacon/brewing-stand menus.
- [Crafting / Recipes](/slop-docs/world/crafting/) — what `slotsChanged()` matches
  against.
- [Networking / Packets](/slop-docs/world/networking/) — the full 100-108 container
  packet family and `getId()` assignment.
- [Items](/slop-docs/world/items/) — `ItemInstance` and the `matches()`/`copy()`
  calls the sync diff relies on.

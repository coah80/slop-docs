---
title: Custom Container Menus
description: Add a container GUI to neoLegacy end to end — the world-side AbstractContainerMenu, the open/sync network flow, and the matching client UIScene — modeled on the real HopperMenu and FireworksMenu.
---

A container menu is the two-sided object behind any inventory GUI: a **world-side
`AbstractContainerMenu`** subclass that owns the slots and item-movement logic, and
a **client-side `UIScene_*Menu`** that renders it. They are joined by a network
handshake — the server tells the client *which* container to open via a
`ContainerOpenPacket` type constant, and the client's local player maps that to a
scene. This page walks the whole path using neoLegacy's two real templates:
**`HopperMenu`** (a fixed-slot container — the cleanest template) and
**`FireworksMenu`** (a crafting-style container with a result slot).

Read [Custom UI Scenes](/slop-docs/modding/custom-ui/) first for how a `UIScene`
and its movie work; this page focuses on the container half. See also the
[Containers reference](/slop-docs/world/containers/) for the full menu registry.

## The base class: `AbstractContainerMenu`

`AbstractContainerMenu` (`Minecraft.World/AbstractContainerMenu.h`) is the shared
base. The members and methods you actually use:

| Member / method | File | Purpose |
|-----------------|------|---------|
| `vector<Slot*> slots` | `AbstractContainerMenu.h:39` | the slot list (index = slot id) |
| `int containerId` | `AbstractContainerMenu.h:40` | per-open network id (set on open) |
| `Slot *addSlot(Slot *slot)` | `AbstractContainerMenu.h:59` | append a slot; call in ctor |
| `virtual bool stillValid(shared_ptr<Player>) = 0` | `:95` | is the container still open-able? (must override) |
| `virtual shared_ptr<ItemInstance> quickMoveStack(player, slotIndex)` | `:72` | shift-click item transfer |
| `virtual void removed(shared_ptr<Player>)` | `:81` | on close (call base, then release container) |
| `bool moveItemStackTo(stack, startSlot, endSlot, backwards)` | `:103` | helper for quickMove |
| `virtual void addSlotListener(ContainerListener*)` | `:63` | server attaches its sync listener |
| `virtual void broadcastChanges()` | `:67` | push slot changes to listeners |

Every container defines its slot layout with `static const int` slot-range
constants so both the menu and the client scene agree on indices.

## Template A — `HopperMenu` (fixed-slot container)

`HopperMenu` (`Minecraft.World/HopperMenu.h` / `.cpp`) is the minimal example: a
5-slot container plus the player inventory. Its slot map:

```cpp
// HopperMenu.h
class HopperMenu : public AbstractContainerMenu
{
    shared_ptr<Container> hopper;
public:
    static const int CONTENTS_SLOT_START = 0;
    static const int INV_SLOT_START      = CONTENTS_SLOT_START + 5;  // 5
    static const int INV_SLOT_END        = INV_SLOT_START + 9 * 3;   // 32
    static const int USE_ROW_SLOT_START  = INV_SLOT_END;             // 32
    static const int USE_ROW_SLOT_END    = USE_ROW_SLOT_START + 9;   // 41

    HopperMenu(shared_ptr<Container> inventory, shared_ptr<Container> hopper);
    bool stillValid(shared_ptr<Player> player);
    shared_ptr<ItemInstance> quickMoveStack(shared_ptr<Player> player, int slotIndex);
    void removed(shared_ptr<Player> player);
    shared_ptr<Container> getContainer();
};
```

The **constructor builds the slot list** — container slots first, then the 3×9
inventory grid, then the 9-slot hotbar (`HopperMenu.cpp:5`):

```cpp
HopperMenu::HopperMenu(shared_ptr<Container> inventory, shared_ptr<Container> hopper)
{
    this->hopper = hopper;
    hopper->startOpen();
    int yo = 51;

    for (int x = 0; x < hopper->getContainerSize(); x++)
        addSlot(new Slot(hopper, x, 44 + x * 18, 20));           // container slots

    for (int y = 0; y < 3; y++)                                   // inventory 3x9
        for (int x = 0; x < 9; x++)
            addSlot(new Slot(inventory, x + y * 9 + 9, 8 + x * 18, y * 18 + yo));

    for (int x = 0; x < 9; x++)                                   // hotbar
        addSlot(new Slot(inventory, x, 8 + x * 18, 58 + yo));
}
```

Slot order matters: the container's own slots come first (indices
`0..containerSize-1`), so `quickMoveStack` can branch on
`slotIndex < hopper->getContainerSize()`.

`stillValid`, `removed`, and `quickMoveStack` are the three overrides that give a
container its behaviour (`HopperMenu.cpp:28`):

```cpp
bool HopperMenu::stillValid(shared_ptr<Player> player)
{
    return hopper->stillValid(player);
}

void HopperMenu::removed(shared_ptr<Player> player)
{
    AbstractContainerMenu::removed(player);   // always call base first
    hopper->stopOpen();                        // release the container
}
```

`quickMoveStack` uses `moveItemStackTo` to shuttle a shift-clicked stack between
the container region and the inventory region:

```cpp
shared_ptr<ItemInstance> HopperMenu::quickMoveStack(shared_ptr<Player> player, int slotIndex)
{
    shared_ptr<ItemInstance> clicked = nullptr;
    Slot *slot = slots.at(slotIndex);
    if (slot != nullptr && slot->hasItem())
    {
        shared_ptr<ItemInstance> stack = slot->getItem();
        clicked = stack->copy();

        if (slotIndex < hopper->getContainerSize())   // from container -> inventory
        {
            if (!moveItemStackTo(stack, hopper->getContainerSize(), slots.size(), true))
                return nullptr;
        }
        else                                           // from inventory -> container
        {
            if (!moveItemStackTo(stack, 0, hopper->getContainerSize(), false))
                return nullptr;
        }
        if (stack->count == 0) slot->set(nullptr);
        else                   slot->setChanged();
    }
    return clicked;
}
```

## Template B — `FireworksMenu` (crafting-style with a result slot)

`FireworksMenu` (`Minecraft.World/FireworksMenu.h`) is the template when your
container **crafts** (an input grid + a computed result slot). Its slot map uses a
`CraftingContainer` and a separate result `Container`:

```cpp
class FireworksMenu : public AbstractContainerMenu
{
public:
    static const int RESULT_SLOT       = 0;
    static const int CRAFT_SLOT_START  = 1;
    static const int CRAFT_SLOT_END    = CRAFT_SLOT_START + 9;   // 3x3 grid
    static const int INV_SLOT_START    = CRAFT_SLOT_END;
    // ... inventory + use-row ranges ...

    shared_ptr<CraftingContainer> craftSlots;
    shared_ptr<Container>         resultSlots;

    FireworksMenu(shared_ptr<Inventory> inventory, Level *level, int xt, int yt, int zt);

    virtual void slotsChanged();          // recompute the result when inputs change
    virtual void removed(shared_ptr<Player> player);
    virtual bool stillValid(shared_ptr<Player> player);
    virtual shared_ptr<ItemInstance> quickMoveStack(shared_ptr<Player> player, int slotIndex);
    virtual bool isValidIngredient(shared_ptr<ItemInstance> item, int slotId);  // 4J added
};
```

The key difference from Hopper: `slotsChanged()` is overridden to recompute the
result slot whenever an input changes, and it takes the world position
(`level, x, y, z`) so it can validate against the world. Use this template if your
menu produces an output; use the Hopper template if it's pure storage.

## The open/sync network flow

This is the part that's easy to get wrong. There is **no direct "open my scene"
call** — the server opens the menu and sends a typed packet; the client maps the
type to a scene. Trace it through Hopper:

### 1. World tile triggers the open (server side)

`HopperTile::use()` (`HopperTile.cpp:97`) — note it returns early on the client and
only opens on the server:

```cpp
bool HopperTile::use(Level *level, int x, int y, int z, shared_ptr<Player> player, ...)
{
    if (level->isClientSide) return true;                 // server-authoritative
    shared_ptr<HopperTileEntity> hopper = getHopper(level, x, y, z);
    if (hopper != nullptr) player->openHopper(hopper);
    return true;
}
```

### 2. `Player::openHopper` is virtual; `ServerPlayer` builds the menu + sends the packet

The base `Player::openHopper` is a no-op stub returning `true`
(`Player.cpp:1392`) — the real work is in the override. `ServerPlayer::openHopper`
(`ServerPlayer.cpp`) constructs the `HopperMenu`, assigns a container id, attaches
the sync listener, and sends a `ContainerOpenPacket` tagged with the **HOPPER**
type:

```cpp
bool ServerPlayer::openHopper(shared_ptr<HopperTileEntity> container)
{
    if (containerMenu == inventoryMenu)
    {
        nextContainerCounter();
        containerMenu = new HopperMenu(inventory, container);
        containerMenu->containerId = containerCounter;
        containerMenu->addSlotListener(this);
        // (FourKit build fires an inventory-open plugin event here)
        connection->send(std::make_shared<ContainerOpenPacket>(
            containerCounter, ContainerOpenPacket::HOPPER,
            container->getCustomName(), container->getContainerSize(),
            container->hasCustomName()));
        refreshContainer(containerMenu);
    }
    return true;
}
```

`FireworksMenu` opens the same way via `ServerPlayer::openFireworks`
(`ServerPlayer.cpp:1237`), sending `ContainerOpenPacket::FIREWORKS`.

### 3. `ContainerOpenPacket` type constants (`ContainerOpenPacket.h`)

The type constant is the contract between server and client:

| Constant | Value | | Constant | Value |
|----------|-------|-|----------|-------|
| `CONTAINER` | 0 | | `REPAIR_TABLE` | 8 |
| `WORKBENCH` | 1 | | `HOPPER` | 9 |
| `FURNACE` | 2 | | `DROPPER` | 10 |
| `TRAP` | 3 | | `HORSE` | 11 |
| `ENCHANTMENT` | 4 | | `FIREWORKS` | 12 (4J added) |
| `BREWING_STAND` | 5 | | `BONUS_CHEST` | 13 (4J added) |
| `TRADER_NPC` | 6 | | `LARGE_CHEST` | 14 (4J added) |
| `BEACON` | 7 | | `ENDER_CHEST` | 15 (4J added) |

(Full list `ContainerOpenPacket.h:9-26`.) A **new** container type needs a new
constant added here.

### 4. Client receives the packet and re-opens locally

`ClientConnection::handleContainerOpen` (`ClientConnection.cpp:3116`) switches on
the type and reconstructs a client-side tile entity, then calls the **local
player's** `openHopper` — which, on the client, navigates to the scene
(`:3151`):

```cpp
case ContainerOpenPacket::HOPPER:
{
    shared_ptr<HopperTileEntity> hopper = std::make_shared<HopperTileEntity>();
    if (packet->customName) hopper->setCustomName(packet->title);
    if (player->openHopper(hopper))
        player->containerMenu->containerId = packet->containerId;   // match the server id
    else
        failed = true;
}
break;
```

### 5. `LocalPlayer::openHopper` navigates to the scene

On the client the same virtual routes to the UI (`LocalPlayer.cpp:676`):

```cpp
bool LocalPlayer::openHopper(shared_ptr<HopperTileEntity> container)
{
    bool success = app.LoadHopperMenu(GetXboxPad(), inventory, container);
    if (success) ui.PlayUISFX(eSFX_Press);
    return success;
}
```

`CMinecraftApp::LoadHopperMenu` (`Consoles_App.cpp:809`) packs a `HopperScreenInput`
and calls `ui.NavigateToScene(iPad, eUIScene_HopperMenu, initData)`:

```cpp
bool CMinecraftApp::LoadHopperMenu(int iPad, shared_ptr<Inventory> inventory,
                                   shared_ptr<HopperTileEntity> hopper)
{
    HopperScreenInput *initData = new HopperScreenInput();
    initData->inventory = inventory;
    initData->hopper    = hopper;
    initData->iPad      = iPad;
    initData->bSplitscreen = (app.GetLocalPlayerCount() > 1);
    return ui.NavigateToScene(iPad, eUIScene_HopperMenu, initData);
}
```

## The matching client scene: `UIScene_HopperMenu`

The client scene (`Common/UI/UIScene_HopperMenu.h/.cpp`) is an ordinary
`UIScene_AbstractContainerMenu` (see [Custom UI Scenes](/slop-docs/modding/custom-ui/)).
Two things make it a *container* scene:

**It constructs its own copy of the world-side menu from the init data**
(`UIScene_HopperMenu.cpp:8`):

```cpp
UIScene_HopperMenu::UIScene_HopperMenu(int iPad, void *_initData, UILayer *parentLayer)
    : UIScene_AbstractContainerMenu(iPad, parentLayer)
{
    initialiseMovie();
    HopperScreenInput *initData = static_cast<HopperScreenInput *>(_initData);
    m_labelDispenser.init(initData->hopper->getName());

    HopperMenu* menu = new HopperMenu(initData->inventory, initData->hopper);
    m_containerSize = initData->hopper->getContainerSize();
    Initialize(initData->iPad, menu, true, m_containerSize,
               eSectionHopperUsing, eSectionHopperMax);
    m_slotListTrap.addSlots(0, 9);
    delete initData;
}
```

**It binds slot lists to movie clips** with the map macros, and picks the movie:

```cpp
UI_BEGIN_MAP_ELEMENTS_AND_NAMES(UIScene_AbstractContainerMenu)
    UI_BEGIN_MAP_CHILD_ELEMENTS(m_controlMainPanel)
        UI_MAP_ELEMENT(m_slotListTrap,   "Trap")
        UI_MAP_ELEMENT(m_labelDispenser, "dispenserLabel")
    UI_END_MAP_CHILD_ELEMENTS()
UI_END_MAP_ELEMENTS_AND_NAMES()

wstring UIScene_HopperMenu::getMoviePath()
{
    if (app.GetLocalPlayerCount() > 1) return L"HopperMenuSplit";
    else                               return L"HopperMenu";
}
```

And, like every scene, it is registered in the `UILayer` factory
(`UILayer.cpp:258`):

```cpp
case eUIScene_HopperMenu:
    newScene = new UIScene_HopperMenu(iPad, initData, this);
    break;
```

## Adding your own container — the checklist of edits

Putting it together, a brand-new container ("`FooMenu`") requires:

**World side (`Minecraft.World/`):**
1. `FooMenu.h` / `FooMenu.cpp` — subclass `AbstractContainerMenu`, define slot-range
   constants, build slots in the ctor, override `stillValid` / `removed` /
   `quickMoveStack` (+ `slotsChanged` if it crafts). Model on `HopperMenu` (storage)
   or `FireworksMenu` (crafting).
2. Add both files to `Minecraft.World/cmake/sources/Common.cmake` (HopperMenu is at
   `Common.cmake:1010`, FireworksMenu at `:1004`).
3. Add a `ContainerOpenPacket::FOO` constant in `ContainerOpenPacket.h`.
4. A `Player::openFoo(...)` virtual (stub in `Player.cpp`) + a `ServerPlayer::openFoo`
   override that builds the menu, sets `containerId`, `addSlotListener(this)`, and
   sends the `ContainerOpenPacket`.
5. Trigger it from your tile's `use()` (server-only branch), like `HopperTile::use`.

**Client side (`Minecraft.Client/`):**
6. A `case ContainerOpenPacket::FOO:` in `ClientConnection::handleContainerOpen`
   that reconstructs the client tile entity and calls `player->openFoo(...)`.
7. A `LocalPlayer::openFoo` override calling `app.LoadFooMenu(...)`, plus
   `CMinecraftApp::LoadFooMenu` that packs a `FooScreenInput` and calls
   `NavigateToScene(iPad, eUIScene_FooMenu, initData)`.
8. `UIScene_FooMenu.h/.cpp` (+ `IUIScene_FooMenu` pair) — construct the world menu
   from init data, `UI_MAP_ELEMENT` the slot lists, `getMoviePath()`, register the
   `eUIScene_FooMenu` enum in `UIEnums.h`, add the `UILayer` factory case, include in
   `UI.h`, and add the files to `Minecraft.Client/cmake/sources/Common.cmake`.
9. Author the `FooMenu*.swf` (+ `...Split`) movie under
   `Common/Media/MediaWindows64/` with clips named to match your `UI_MAP_ELEMENT`s
   (see [Custom UI Scenes](/slop-docs/modding/custom-ui/) and
   [Textures & Asset Pipeline](/slop-docs/modding/textures-assets/)).

## Testing checklist

- [ ] All world-side and client-side files are in their `cmake/sources/Common.cmake`
      lists — the project configures and compiles.
- [ ] Right-clicking the tile opens the container (server logs no
      "tried to open ... when one was already open").
- [ ] The container shows the right slot count and layout; items place/remove in the
      container slots.
- [ ] Shift-click (`quickMoveStack`) moves stacks between the container and the
      inventory in both directions.
- [ ] `stillValid` closes the menu when you walk away / break the block.
- [ ] Put items in, close and reopen — the container's contents persist (server is
      authoritative; the tile entity holds the items).
- [ ] Multiplayer: a second player opening the same tile syncs correctly; the
      `containerId` from the packet matches on both ends.
- [ ] Splitscreen: 2+ local players → the `...Split` movie loads.
- [ ] For a crafting container: changing inputs updates the result slot
      (`slotsChanged`), and taking the result consumes the inputs.

## Where to go next

- [Custom UI Scenes](/slop-docs/modding/custom-ui/) — the scene/movie half of a
  container in full.
- [Containers reference](/slop-docs/world/containers/) — every menu class and its
  slot layout.
- [Crafting & recipes](/slop-docs/world/crafting/) — if your container crafts.
- [Networking (world)](/slop-docs/world/networking/) — the container packet family
  (`ContainerOpen/Click/SetSlot/...`).

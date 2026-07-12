---
title: "Template: Custom Workbench"
description: A complete copy-paste mod recipe — a new crafting-station block with its own Tile, TileEntity, AbstractContainerMenu, container-open packet flow, and console UIScene, wired the neoLegacy way from the Furnace/Dispenser stack.
---

This is a **complete mod recipe**. Follow it top to bottom and you get a working
crafting-station block — the **Fabricator** — that you can place, right-click to
open a custom container UI, fill with items, and that drops its contents when
broken. It is a 9-slot storage-plus-station block modeled directly on two things
that ship in neoLegacy today: the **Furnace** stack (`FurnaceTile` /
`FurnaceTileEntity` / `FurnaceMenu` / `UIScene_FurnaceMenu`) and the simpler
**Dispenser** stack (`DispenserTile` / `DispenserTileEntity` / `TrapMenu` /
`UIScene_DispenserMenu`), which is the cleanest single-grid container in the
codebase.

There is no registry for "container blocks." Everything is explicit static-ctor
wiring plus one packet round-trip. The chain you are building is:

```
right-click Tile  →  Tile::use()  →  ServerPlayer::openFabricator()
  →  new FabricatorMenu   +   ContainerOpenPacket(FABRICATOR)  ──►  client
  →  ClientConnection::handleContainerOpen()  →  LocalPlayer::openFabricator()
  →  app.LoadFabricatorMenu()  →  ui.NavigateToScene(eUIScene_FabricatorMenu)
  →  UIScene_FabricatorMenu (builds its own client-side FabricatorMenu)
```

If you want the concepts behind any step, keep these open:
[Custom Containers](/slop-docs/modding/custom-containers/),
[Custom UI](/slop-docs/modding/custom-ui/),
[Adding Blocks](/slop-docs/modding/adding-blocks/),
[Multiplayer Packets](/slop-docs/modding/multiplayer-packets/),
[Block IDs](/slop-docs/reference/block-ids/). New to the build? Start with
[Getting Started](/slop-docs/modding/getting-started/).

Paths in `Minecraft.World/` are the shared game logic; paths in
`Minecraft.Client/` are the client (menu open flow + console UI). Both libraries
are built into the one game.

## Files you will create

| File | Library | Purpose |
|------|---------|---------|
| `FabricatorTile.h` / `.cpp` | World | the placeable block; its `use()` opens the menu |
| `FabricatorTileEntity.h` / `.cpp` | World | the block-entity that stores the 9 slots |
| `FabricatorMenu.h` / `.cpp` | World | the `AbstractContainerMenu` (server + client slot layout) |
| `UIScene_FabricatorMenu.h` / `.cpp` | Client | the console Iggy-backed UI scene |

## Files you will edit

| File | Library | Change | Anchor |
|------|---------|--------|--------|
| `Tile.h` | World | tile id + `static Tile *fabricator;` | `Tile.h:414` / `:522` |
| `Tile.cpp` | World | register the block in `staticCtor()` | `Tile.cpp:447` |
| `Class.h` | World | `eTYPE_FABRICATORTILEENTITY` + SUBCLASS | `Class.h:320` / `:544` |
| `TileEntity.cpp` | World | register the block-entity save id | `TileEntity.cpp:34` |
| `ContainerOpenPacket.h` | World | `static const int FABRICATOR` | `ContainerOpenPacket.h:26` |
| `Player.h` / `.cpp` | World | `virtual bool openFabricator(...)` stub | `Player.h:279` / `.cpp:1543` |
| `ServerPlayer.cpp` | Client | real `openFabricator()` (builds menu, sends packet) | `ServerPlayer.cpp:1416` |
| `LocalPlayer.cpp` | Client | client `openFabricator()` (loads the scene) | `LocalPlayer.cpp:758` |
| `ClientConnection.cpp` | Client | handle the `FABRICATOR` packet case | `ClientConnection.cpp:3165` |
| `Consoles_App.h` / `.cpp` | Client | `LoadFabricatorMenu()` | `Consoles_App.h:143` / `.cpp:647` |
| `UIStructs.h` | Client | `FabricatorScreenInput` struct | `UIStructs.h:86` |
| `UIEnums.h` | Client | `eUIScene_FabricatorMenu` | `UIEnums.h:50` |
| `IUIScene_AbstractContainerMenu.h` | Client | `eSectionFabricator*` section enum block | `IUIScene_AbstractContainerMenu.h:41` |
| `UILayer.cpp` | Client | scene factory + two switch sites | `UILayer.cpp:242` / `:756` |
| `UIController.cpp` | Client | navigate-guard switch | `UIController.cpp:2223` |
| `stringsGeneric.xml` | Client | block + label strings | near `IDS_TILE_FURNACE` |
| `cmake/sources/Common.cmake` + client cmake | build | add all new files | near `FurnaceTile.cpp` |

That table is long, but every line is a one- or two-line paste. The block itself
is small; most of the work is the console UI's fixed enum plumbing.

---

## Part 1 — the block (World)

### Step 1.1 — pick an id and declare the block

The tile registry is a fixed array `Tile *tiles[TILE_NUM_COUNT]`
(`Tile.h:210`, `TILE_NUM_COUNT = 4096`) indexed by the numeric block id. The
highest id in use is `frosted_ice_Id = 212` (`Tile.h:453`); ids 218+ are free. Add
to `Tile.h` after `frosted_ice_Id`:

```cpp
    static const int frosted_ice_Id = 212;
    static const int fabricator_Id = 218;   // <-- add
```

Add the static pointer near `Tile::furnace` (`Tile.h:522`):

```cpp
    static Tile *furnace;
    static Tile *fabricator;   // <-- add
```

### Step 1.2 — `FabricatorTile.h`

A block with a block-entity derives from `BaseEntityTile` (`Tile.h` hierarchy;
`FurnaceTile.h:9` does the same). You override `newTileEntity` to spawn the
block-entity, `use` to open the menu, and `onRemove` to drop the contents. This
mirrors `FurnaceTile.h` minus the smelting/lit machinery.

```cpp
// FabricatorTile.h
#pragma once
#include "BaseEntityTile.h"

class Random;
class Player;

class FabricatorTile : public BaseEntityTile
{
    friend class Tile;
private:
    Random *random;
    static bool noDrop;

protected:
    FabricatorTile(int id);

public:
    virtual bool use(Level *level, int x, int y, int z, shared_ptr<Player> player,
        int clickedFace, float clickX, float clickY, float clickZ, bool soundOnly = false) override; // 4J soundOnly
    virtual bool TestUse() override;               // shows the "open" tooltip
    virtual void onRemove(Level *level, int x, int y, int z, int id, int data) override;
    virtual bool hasAnalogOutputSignal() override;
    virtual int getAnalogOutputSignal(Level *level, int x, int y, int z, int dir) override;

protected:
    virtual shared_ptr<TileEntity> newTileEntity(Level *level) override;
};
```

### Step 1.3 — `FabricatorTile.cpp`

The `use()` body is the heart of the block. It returns `true` on the client (so
the client doesn't double-handle) and, **server-side**, calls
`player->openFabricator(entity)`. That is exactly how `FurnaceTile::use`
(`FurnaceTile.cpp:111`) and `DispenserTile::use` (`DispenserTile.cpp:125`) work.

```cpp
// FabricatorTile.cpp
#include "stdafx.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.entity.item.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.item.h"
#include "net.minecraft.world.level.tile.entity.h"
#include "net.minecraft.world.h"
#include "FabricatorTile.h"
#include "FabricatorTileEntity.h"

bool FabricatorTile::noDrop = false;

FabricatorTile::FabricatorTile(int id) : BaseEntityTile(id, Material::stone)
{
    random = new Random();
}

bool FabricatorTile::TestUse() { return true; }   // 4J-PB tooltip hook, like FurnaceTile.cpp:106

bool FabricatorTile::use(Level *level, int x, int y, int z, shared_ptr<Player> player,
    int clickedFace, float clickX, float clickY, float clickZ, bool soundOnly /*=false*/)
{
    if (soundOnly) return false;

    if (level->isClientSide)
    {
        return true;   // client waits for the container-open packet
    }

    shared_ptr<FabricatorTileEntity> te =
        dynamic_pointer_cast<FabricatorTileEntity>(level->getTileEntity(x, y, z));
    if (te != nullptr) player->openFabricator(te);
    return true;
}

shared_ptr<TileEntity> FabricatorTile::newTileEntity(Level *level)
{
    return std::make_shared<FabricatorTileEntity>();
}

void FabricatorTile::onRemove(Level *level, int x, int y, int z, int id, int data)
{
    if (!noDrop)
    {
        shared_ptr<Container> container =
            dynamic_pointer_cast<FabricatorTileEntity>(level->getTileEntity(x, y, z));
        if (container != nullptr)
        {
            for (unsigned int i = 0; i < container->getContainerSize(); i++)
            {
                shared_ptr<ItemInstance> item = container->getItem(i);
                if (item != nullptr && item->count > 0)
                {
                    float xo = random->nextFloat() * 0.8f + 0.1f;
                    float yo = random->nextFloat() * 0.8f + 0.1f;
                    float zo = random->nextFloat() * 0.8f + 0.1f;
                    shared_ptr<ItemEntity> ie = std::make_shared<ItemEntity>(
                        level, x + xo, y + yo, z + zo, item->copy());
                    level->addEntity(ie);
                    container->setItem(i, nullptr);   // 4J Stu dupe-glitch fix (FurnaceTile.cpp:210)
                }
            }
            level->updateNeighbourForOutputSignal(x, y, z, id);
        }
    }
    BaseEntityTile::onRemove(level, x, y, z, id, data);
}

bool FabricatorTile::hasAnalogOutputSignal() { return true; }

int FabricatorTile::getAnalogOutputSignal(Level *level, int x, int y, int z, int dir)
{
    return AbstractContainerMenu::getRedstoneSignalFromContainer(
        dynamic_pointer_cast<Container>(level->getTileEntity(x, y, z)));
}
```

The comparator-output methods are the same two lines every container block uses
(`FurnaceTile.cpp:220-228`) via `AbstractContainerMenu::getRedstoneSignalFromContainer`
(`AbstractContainerMenu.h:118`).

### Step 1.4 — register the block in `Tile.cpp`

`Tile::staticCtor()` (`Tile.cpp:359`) `new`s each block with a fluent builder. The
furnace registration is the template (`Tile.cpp:447`):

```cpp
Tile::furnace = (new FurnaceTile(61, false))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_device, Item::eMaterial_stone)
    ->setDestroyTime(3.5f)->setSoundType(Tile::SOUND_STONE)
    ->setIconName(L"furnace")->setDescriptionId(IDS_TILE_FURNACE)
    ->sendTileData()->setUseDescriptionId(IDS_DESC_FURNACE);
```

Add ours next to it (include `FabricatorTile.h` at the top of `Tile.cpp` with the
other tile includes):

```cpp
Tile::fabricator = (new FabricatorTile(Tile::fabricator_Id))
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_device, Item::eMaterial_stone)
    ->setDestroyTime(3.5f)->setSoundType(Tile::SOUND_STONE)
    ->setIconName(L"fabricator")->setDescriptionId(IDS_TILE_FABRICATOR)
    ->sendTileData()->setUseDescriptionId(IDS_DESC_FABRICATOR);
```

`sendTileData()` marks the block's metadata for net-sync (it stores no rotation
here, but container blocks conventionally send data). Define the static pointer at
the top of `Tile.cpp` next to `Tile *Tile::furnace = nullptr;` (`Tile.cpp:119`):

```cpp
Tile *Tile::fabricator = nullptr;
```

Because ids under 256 auto-create a `TileItem` (the placeable item form) during
`Item::staticInit` (`Item.cpp:558`), **you do not register a separate item** — the
block is placeable for free. See [Adding Blocks](/slop-docs/modding/adding-blocks/)
for the item-form details.

---

## Part 2 — the block-entity (World)

### Step 2.1 — a type id in `Class.h`

Every `TileEntity` has an `eINSTANCEOF` type used for the `instanceof` bitmask and
the save-id map. The tile-entity block runs `eTYPE_TILEENTITY | 0xNN`
(`Class.h:302-320`). The last one is `eTYPE_HOPPERTILEENTITY = ... | 0x11`
(`Class.h:320`). Add the next value:

```cpp
    eTYPE_HOPPERTILEENTITY				= eTYPE_TILEENTITY | 0x11,
    eTYPE_COMPARATORTILEENTITY			= eTYPE_TILEENTITY | 0x0F,
    ...
    eTYPE_FABRICATORTILEENTITY			= eTYPE_TILEENTITY | 0x12,   // <-- add (next free discriminator)
```

And register it in the `SUBCLASS` table (`Class.h:544`, in the block that lists
`eTYPE_HOPPERTILEENTITY`):

```cpp
    classes->push_back( SUBCLASS(eTYPE_FABRICATORTILEENTITY)->addParent( eTYPE_TILEENTITY ) );
```

### Step 2.2 — `FabricatorTileEntity.h`

The block-entity implements `Container` (the pure-virtual interface,
`Container.h:7`) and stores an `ItemInstanceArray`. This is `BrewingStandTileEntity`
(`BrewingStandTileEntity.h:5`) with the brewing logic stripped out — a plain
9-slot store. `create()` and `GetType()` feed the `TileEntity` registry.

```cpp
// FabricatorTileEntity.h
#pragma once
#include "TileEntity.h"
#include "Container.h"

class Player;

class FabricatorTileEntity : public TileEntity, public Container
{
public:
    eINSTANCEOF GetType() { return eTYPE_FABRICATORTILEENTITY; }
    static TileEntity *create() { return new FabricatorTileEntity(); }

    static const int CONTAINER_SIZE = 9;

    FabricatorTileEntity();
    virtual ~FabricatorTileEntity();

    // Container interface (Container.h:15-28)
    virtual unsigned int getContainerSize() override { return CONTAINER_SIZE; }
    virtual shared_ptr<ItemInstance> getItem(unsigned int slot) override;
    virtual shared_ptr<ItemInstance> removeItem(unsigned int slot, int count) override;
    virtual shared_ptr<ItemInstance> removeItemNoUpdate(int slot) override;
    virtual void setItem(unsigned int slot, shared_ptr<ItemInstance> item) override;
    virtual wstring getName() override;
    virtual wstring getCustomName() override;
    virtual bool hasCustomName() override;
    virtual void setCustomName(const wstring &name) override;
    virtual int getMaxStackSize() const override { return 64; }
    virtual void setChanged() override { TileEntity::setChanged(); }
    virtual bool stillValid(shared_ptr<Player> player) override;
    virtual void startOpen() override {}
    virtual void stopOpen() override {}
    virtual bool canPlaceItem(int slot, shared_ptr<ItemInstance> item) override { return true; }

    // TileEntity save/load
    virtual void load(CompoundTag *tag) override;
    virtual void save(CompoundTag *tag) override;

    // 4J clone hook (every TileEntity has one, TileEntity.cpp:209)
    virtual shared_ptr<TileEntity> clone() override;

    // container type for the open packet / name display
    virtual int getContainerType() override { return -1; }

private:
    ItemInstanceArray items;
    wstring name;
};
```

### Step 2.3 — `FabricatorTileEntity.cpp`

The container methods are array-backed and hand-roll the NBT `"Items"` list — this
codebase has **no `ContainerHelper`**; every block-entity serializes its slots
inline. The `removeItem` split logic and the `load`/`save` bodies below are copied
directly from `BrewingStandTileEntity.cpp:303-345` (the "Slot"/"Items" NBT format
and the 4J dupe-glitch fix in `removeItem`).

```cpp
// FabricatorTileEntity.cpp
#include "stdafx.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.item.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.nbt.h"
#include "FabricatorTileEntity.h"

FabricatorTileEntity::FabricatorTileEntity()
{
    items = ItemInstanceArray(CONTAINER_SIZE);
}

FabricatorTileEntity::~FabricatorTileEntity() {}

shared_ptr<ItemInstance> FabricatorTileEntity::getItem(unsigned int slot)
{
    if (slot >= 0 && slot < items.length) return items[slot];
    return nullptr;
}

// Same shape as BrewingStandTileEntity::removeItem (BrewingStandTileEntity.cpp:309).
shared_ptr<ItemInstance> FabricatorTileEntity::removeItem(unsigned int slot, int count)
{
    if (slot >= 0 && slot < items.length && items[slot] != nullptr)
    {
        if (items[slot]->count <= count)
        {
            shared_ptr<ItemInstance> item = items[slot];
            items[slot] = nullptr;
            setChanged();
            if (item->count <= 0) return nullptr;   // 4J dupe-glitch fix
            return item;
        }
        else
        {
            shared_ptr<ItemInstance> i = items[slot]->remove(count);
            if (items[slot]->count == 0) items[slot] = nullptr;
            setChanged();
            if (i->count <= 0) return nullptr;
            return i;
        }
    }
    return nullptr;
}

shared_ptr<ItemInstance> FabricatorTileEntity::removeItemNoUpdate(int slot)
{
    if (slot >= 0 && slot < items.length)
    {
        shared_ptr<ItemInstance> item = items[slot];
        items[slot] = nullptr;
        return item;
    }
    return nullptr;
}

void FabricatorTileEntity::setItem(unsigned int slot, shared_ptr<ItemInstance> item)
{
    if (slot >= 0 && slot < items.length)
    {
        items[slot] = item;
        if (item != nullptr && item->count > getMaxStackSize()) item->count = getMaxStackSize();
        setChanged();
    }
}

wstring FabricatorTileEntity::getName()       { return hasCustomName() ? name : app.GetString(IDS_TILE_FABRICATOR); }
wstring FabricatorTileEntity::getCustomName() { return name; }
bool    FabricatorTileEntity::hasCustomName() { return !name.empty(); }
void    FabricatorTileEntity::setCustomName(const wstring &n) { name = n; }

bool FabricatorTileEntity::stillValid(shared_ptr<Player> player)
{
    if (level->getTileEntity(x, y, z).get() != this) return false;
    return player->distanceToSqr(x + 0.5, y + 0.5, z + 0.5) <= 64.0;
}

// Copied from BrewingStandTileEntity.cpp:303 / :321 — the "Slot"/"Items" NBT format.
void FabricatorTileEntity::load(CompoundTag *base)
{
    TileEntity::load(base);

    ListTag<CompoundTag> *inventoryList = (ListTag<CompoundTag> *) base->getList(L"Items");
    delete [] items.data;
    items = ItemInstanceArray(getContainerSize());
    for (int i = 0; i < inventoryList->size(); i++)
    {
        CompoundTag *tag = inventoryList->get(i);
        int slot = tag->getByte(L"Slot");
        if (slot >= 0 && slot < items.length) items[slot] = ItemInstance::fromTag(tag);
    }

    if (base->contains(L"CustomName")) name = base->getString(L"CustomName");
}

void FabricatorTileEntity::save(CompoundTag *base)
{
    TileEntity::save(base);                          // writes id/x/y/z (TileEntity.cpp:79)

    ListTag<CompoundTag> *listTag = new ListTag<CompoundTag>();
    for (int i = 0; i < items.length; i++)
    {
        if (items[i] != nullptr)
        {
            CompoundTag *tag = new CompoundTag();
            tag->putByte(L"Slot", static_cast<byte>(i));
            items[i]->save(tag);
            listTag->add(tag);
        }
    }
    base->put(L"Items", listTag);
    if (hasCustomName()) base->putString(L"CustomName", name);
}

shared_ptr<TileEntity> FabricatorTileEntity::clone()
{
    shared_ptr<FabricatorTileEntity> te = std::make_shared<FabricatorTileEntity>();
    TileEntity::clone(te);
    te->items = items;
    te->name = name;
    return te;
}
```

`TileEntity::save` (`TileEntity.cpp:79`) writes the save-id string first, which is
why the next step (registering the id) matters.

### Step 2.4 — register the save id in `TileEntity.cpp`

`TileEntity::staticCtor()` (`TileEntity.cpp:14`) maps a factory fn + type + a
**legacy save-id string** so loaded worlds find the class. Add ours to the end of
the list (`TileEntity.cpp:34`):

```cpp
    TileEntity::setId(ComparatorTileEntity::create, eTYPE_COMPARATORTILEENTITY, L"Comparator");
    TileEntity::setId(FabricatorTileEntity::create, eTYPE_FABRICATORTILEENTITY, L"Fabricator");   // <-- add
```

The string `L"Fabricator"` is what gets written into save NBT (`tag->putString(L"id", ...)`,
`TileEntity.cpp:88`) and matched on load (`loadStatic`, `TileEntity.cpp:98`). Pick a
unique name; existing ids include quirky legacy names like `L"Cauldron"` for the
brewing stand and `L"Trap"` for the dispenser (`TileEntity.cpp:20,26`).

---

## Part 3 — the menu (World)

### Step 3.1 — the container-open packet type

`ContainerOpenPacket` carries a `type` int that the client switches on. The types
are fixed constants (`ContainerOpenPacket.h:9-26`), the last 4J-added one being
`MINECART_HOPPER = 17`. Add:

```cpp
    static const int MINECART_HOPPER = 17; // 4J Added
    static const int FABRICATOR = 18;      // <-- add
```

This is the only packet change needed — `ContainerOpenPacket` already serializes
`{containerId, type, size, customName, title}` (`ContainerOpenPacket.h:28-32`), so
a new `type` value rides the existing wire format. See
[Multiplayer Packets](/slop-docs/modding/multiplayer-packets/) and
[Packet IDs](/slop-docs/reference/packet-ids/) (this is packet id 100).

### Step 3.2 — `FabricatorMenu.h`

The menu is an `AbstractContainerMenu` (`AbstractContainerMenu.h:14`). It lays out
`Slot`s over the container + the player inventory + the hotbar. `TrapMenu`
(`TrapMenu.h`) is the minimal template — a 3×3 container grid plus inventory, no
smelting/progress fields:

```cpp
// FabricatorMenu.h
#pragma once
#include "AbstractContainerMenu.h"

class FabricatorTileEntity;
class Inventory;

class FabricatorMenu : public AbstractContainerMenu
{
public:
    static const int CONTAINER_SLOT_START = 0;
    static const int CONTAINER_SLOT_END   = 9;                 // 9 station slots
    static const int INV_SLOT_START       = CONTAINER_SLOT_END;
    static const int INV_SLOT_END         = INV_SLOT_START + 9 * 3;
    static const int USE_ROW_SLOT_START   = INV_SLOT_END;
    static const int USE_ROW_SLOT_END     = USE_ROW_SLOT_START + 9;

    FabricatorMenu(shared_ptr<Inventory> inventory, shared_ptr<FabricatorTileEntity> fabricator);

    virtual bool stillValid(shared_ptr<Player> player) override;
    virtual shared_ptr<ItemInstance> quickMoveStack(shared_ptr<Player> player, int slotIndex) override;

private:
    shared_ptr<FabricatorTileEntity> fabricator;
};
```

### Step 3.3 — `FabricatorMenu.cpp`

The ctor `addSlot`s the container grid, then the 27 inventory slots, then the
9-slot hotbar — the exact three-loop pattern from `TrapMenu.cpp:8-31` and
`FurnaceMenu.cpp:23-33`. `quickMoveStack` is the shift-click handler; the TrapMenu
version (`TrapMenu.cpp:39`) is the right template for a plain store.

```cpp
// FabricatorMenu.cpp
#include "stdafx.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.level.tile.entity.h"
#include "Container.h"
#include "Slot.h"
#include "FabricatorMenu.h"
#include "FabricatorTileEntity.h"

FabricatorMenu::FabricatorMenu(shared_ptr<Inventory> inventory, shared_ptr<FabricatorTileEntity> fabricator)
    : AbstractContainerMenu()
{
    this->fabricator = fabricator;

    // 3x3 station grid (container slots 0..8)
    for (int y = 0; y < 3; y++)
        for (int x = 0; x < 3; x++)
            addSlot(new Slot(fabricator, x + y * 3, 62 + x * 18, 17 + y * 18));

    // player inventory (3 rows)
    for (int y = 0; y < 3; y++)
        for (int x = 0; x < 9; x++)
            addSlot(new Slot(inventory, x + y * 9 + 9, 8 + x * 18, 84 + y * 18));

    // hotbar
    for (int x = 0; x < 9; x++)
        addSlot(new Slot(inventory, x, 8 + x * 18, 142));
}

bool FabricatorMenu::stillValid(shared_ptr<Player> player)
{
    return fabricator->stillValid(player);
}

shared_ptr<ItemInstance> FabricatorMenu::quickMoveStack(shared_ptr<Player> player, int slotIndex)
{
    shared_ptr<ItemInstance> clicked = nullptr;
    Slot *slot = slots.at(slotIndex);
    if (slot != nullptr && slot->hasItem())
    {
        shared_ptr<ItemInstance> stack = slot->getItem();
        clicked = stack->copy();

        if (slotIndex < CONTAINER_SLOT_END)
        {
            // from station → into inventory/hotbar
            if (!moveItemStackTo(stack, INV_SLOT_START, USE_ROW_SLOT_END, true))
                return nullptr;
        }
        else
        {
            // from inventory → into the station grid
            if (!moveItemStackTo(stack, CONTAINER_SLOT_START, CONTAINER_SLOT_END, false))
                return nullptr;
        }

        if (stack->count == 0) slot->set(nullptr);
        else                   slot->setChanged();

        if (stack->count == clicked->count) return nullptr;
        slot->onTake(player, stack);
    }
    return clicked;
}
```

The pixel coordinates (`62 + x*18`, etc.) match the container slot geometry the
classic screens use; on console they are re-mapped by the UIScene's
`GetItemScreenData` (Part 5), so exact pixels only matter for the legacy
`Screen` path.

---

## Part 4 — the open flow (Player + packet)

### Step 4.1 — the `Player` base stub

`Player.h:279` declares the virtual open methods; the base bodies in `Player.cpp`
are no-op `return true;` stubs (`Player.cpp:1543` for `openFurnace`) — the real
work lives in the `ServerPlayer` / `LocalPlayer` overrides. Add the declaration
(`Player.h`, next to `openFurnace`):

```cpp
    virtual bool openFurnace(shared_ptr<FurnaceTileEntity> container);
    virtual bool openFabricator(shared_ptr<FabricatorTileEntity> container);   // <-- add
```

Add the stub in `Player.cpp` (next to `Player::openFurnace`, `Player.cpp:1543`):

```cpp
bool Player::openFabricator(shared_ptr<FabricatorTileEntity> container)
{
    return true;
}
```

Forward-declare `class FabricatorTileEntity;` near the other tile-entity forward
declarations at the top of `Player.h`.

### Step 4.2 — `ServerPlayer::openFabricator` (Client library, server role)

This is the authoritative half: bump the container counter, build the **server**
menu, register the slot listener, and send the `ContainerOpenPacket`. Copy
`ServerPlayer::openFurnace` (`ServerPlayer.cpp:1416`) verbatim and swap the types:

```cpp
// ServerPlayer.cpp — add near openFurnace
bool ServerPlayer::openFabricator(shared_ptr<FabricatorTileEntity> fabricator)
{
    if (containerMenu == inventoryMenu)
    {
        nextContainerCounter();
        containerMenu = new FabricatorMenu(inventory, fabricator);
        containerMenu->containerId = containerCounter;
        containerMenu->addSlotListener(this);
#if defined(_WINDOWS64) && defined(MINECRAFT_SERVER_BUILD)
        if (FourKitBridge::FireInventoryOpen(entityId, ContainerOpenPacket::FABRICATOR,
                fabricator->getCustomName(), fabricator->getContainerSize()))
        {
            doCloseContainer();
            return true;
        }
#endif
        connection->send(std::make_shared<ContainerOpenPacket>(containerCounter,
            ContainerOpenPacket::FABRICATOR, fabricator->getCustomName(),
            fabricator->getContainerSize(), fabricator->hasCustomName()));
        refreshContainer(containerMenu);
    }
    else
    {
        app.DebugPrintf("ServerPlayer tried to open fabricator when one was already open\n");
    }
    return true;
}
```

Add the `override` declaration to `ServerPlayer.h` next to its `openFurnace`
declaration, and `#include "FabricatorMenu.h"` / `FabricatorTileEntity.h`. The
`FourKitBridge::FireInventoryOpen` block is the 4Kit server hook the other
containers have — see [4Kit ecosystem](/slop-docs/mods/fourkit-ecosystem/) and
[4Kit events](/slop-docs/reference/fourkit-events/) if you're targeting the
dedicated-server build; it's compiled out otherwise.

### Step 4.3 — the client handles the packet

`ClientConnection::handleContainerOpen` (`ClientConnection.cpp:3116`) switches on
`packet->type` and, for tile-entity containers, builds a client-side stand-in and
calls the matching `LocalPlayer::open*`. Add a case next to `FURNACE`
(`ClientConnection.cpp:3165`):

```cpp
case ContainerOpenPacket::FABRICATOR:
    {
        shared_ptr<FabricatorTileEntity> fabricator = std::make_shared<FabricatorTileEntity>();
        if (packet->customName) fabricator->setCustomName(packet->title);
        if (player->openFabricator(fabricator))
        {
            player->containerMenu->containerId = packet->containerId;
        }
        else
        {
            failed = true;
        }
    }
    break;
```

### Step 4.4 — `LocalPlayer::openFabricator` (Client library, client role)

The client override loads the console UI scene. Copy `LocalPlayer::openFurnace`
(`LocalPlayer.cpp:758`):

```cpp
bool LocalPlayer::openFabricator(shared_ptr<FabricatorTileEntity> fabricator)
{
    bool success = app.LoadFabricatorMenu(GetXboxPad(), inventory, fabricator);
    if (success) ui.PlayUISFX(eSFX_Press);
    return success;
}
```

Add the `override` to `LocalPlayer.h`.

---

## Part 5 — the console UI (Client)

This is the biggest section by line count but every piece is boilerplate that
parallels the Dispenser scene.

### Step 5.1 — the scene enum + input struct

`UIEnums.h:50` — add the scene id after `eUIScene_FurnaceMenu`:

```cpp
    eUIScene_FurnaceMenu,
    eUIScene_FabricatorMenu,   // <-- add
```

`UIStructs.h:86` — the init-data blob passed to the scene (copy `FurnaceScreenInput`):

```cpp
// Fabricator
typedef struct _FabricatorScreenInput
{
    shared_ptr<Inventory> inventory;
    shared_ptr<FabricatorTileEntity> fabricator;
    int iPad;
    bool bSplitscreen;
} FabricatorScreenInput;
```

### Step 5.2 — the section enum

The console UI navigates by "sections" (an item grid + the inventory + the
hotbar). These are a **fixed enum** in `IUIScene_AbstractContainerMenu.h:28`. Add a
block after `eSectionFurnaceMax` (`:41`), following the Dispenser/Trap pattern
(`:49-52`):

```cpp
    eSectionFabricatorUsing,       // hotbar "using" row
    eSectionFabricatorInventory,   // 27-slot inventory
    eSectionFabricatorGrid,        // the 9 station slots
    eSectionFabricatorMax,
```

`eSection*Using` and `eSection*Inventory` are always the player's hotbar and
inventory; the middle sections are your container's own regions.

### Step 5.3 — `UIScene_FabricatorMenu.h`

Model on `UIScene_DispenserMenu.h` — a single container `UIControl_SlotList` plus a
title label. The `UI_MAP_ELEMENT` macros bind C++ members to named elements inside
the Iggy movie (see [Custom UI](/slop-docs/modding/custom-ui/) for how these movie
bindings work).

```cpp
// UIScene_FabricatorMenu.h
#pragma once
#include "UIScene_AbstractContainerMenu.h"
#include "IUIScene_DispenserMenu.h"   // reuse the single-grid navigation interface

class UIScene_FabricatorMenu : public UIScene_AbstractContainerMenu, public IUIScene_DispenserMenu
{
private:
    int m_containerSize;

public:
    UIScene_FabricatorMenu(int iPad, void *initData, UILayer *parentLayer);
    virtual EUIScene getSceneType() { return eUIScene_FabricatorMenu; }

protected:
    UIControl_SlotList m_slotListGrid;
    UIControl_Label    m_labelFabricator;

    UI_BEGIN_MAP_ELEMENTS_AND_NAMES(UIScene_AbstractContainerMenu)
        UI_BEGIN_MAP_CHILD_ELEMENTS( m_controlMainPanel )
            UI_MAP_ELEMENT( m_slotListGrid,    "Grid")
            UI_MAP_ELEMENT( m_labelFabricator, "fabricatorLabel")
        UI_END_MAP_CHILD_ELEMENTS()
    UI_END_MAP_ELEMENTS_AND_NAMES()

    virtual wstring getMoviePath();
    virtual void handleReload();

    virtual int getSectionColumns(ESceneSection eSection);
    virtual int getSectionRows(ESceneSection eSection);
    virtual void GetPositionOfSection( ESceneSection eSection, UIVec2D* pPosition );
    virtual void GetItemScreenData( ESceneSection eSection, int iItemIndex, UIVec2D* pPosition, UIVec2D* pSize );
    virtual void handleSectionClick(ESceneSection eSection) {}
    virtual void setSectionSelectedSlot(ESceneSection eSection, int x, int y);
    virtual UIControl *getSection(ESceneSection eSection);
};
```

> **`IUIScene_DispenserMenu`** already implements the up/down navigation for a
> single container grid + inventory + hotbar. Reusing it saves writing
> `GetSectionAndSlotInDirection`. If your grid shape differs from the dispenser's
> 3×3, write your own `IUIScene_FabricatorMenu` interface modeled on
> `IUIScene_FurnaceMenu.h`.

### Step 5.4 — `UIScene_FabricatorMenu.cpp`

The ctor is the same shape as `UIScene_DispenserMenu.cpp:8-32`: `initialiseMovie()`,
pull the init struct, init the label, build the **client-side** `FabricatorMenu`,
call `Initialize(...)`, then register the container's slot ranges into the
`UIControl_SlotList`.

```cpp
// UIScene_FabricatorMenu.cpp
#include "stdafx.h"
#include "UI.h"
#include "../../../Minecraft.World/net.minecraft.world.level.tile.entity.h"
#include "../../../Minecraft.World/net.minecraft.world.inventory.h"
#include "../../Minecraft.h"
#include "UIScene_FabricatorMenu.h"

UIScene_FabricatorMenu::UIScene_FabricatorMenu(int iPad, void *_initData, UILayer *parentLayer)
    : UIScene_AbstractContainerMenu(iPad, parentLayer)
{
    initialiseMovie();

    FabricatorScreenInput *initData = static_cast<FabricatorScreenInput *>(_initData);

    m_labelFabricator.init(initData->fabricator->getName());

    FabricatorMenu *menu = new FabricatorMenu(initData->inventory, initData->fabricator);

    m_containerSize = initData->fabricator->getContainerSize();
    Initialize(initData->iPad, menu, true, m_containerSize,
        eSectionFabricatorUsing, eSectionFabricatorMax);

    m_slotListGrid.addSlots(FabricatorMenu::CONTAINER_SLOT_START, FabricatorTileEntity::CONTAINER_SIZE);

    // Rich-presence context is a platform-specific id (Minecraft.spa.h per console);
    // reuse FORGING like the furnace scene (UIScene_FurnaceMenu.cpp:38) rather than
    // minting a new one — there is no generic "in menu" context.
    app.SetRichPresenceContext(m_iPad, CONTEXT_GAME_STATE_FORGING);

    delete initData;
}

wstring UIScene_FabricatorMenu::getMoviePath()
{
    return (app.GetLocalPlayerCount() > 1) ? L"FabricatorMenuSplit" : L"FabricatorMenu";
}

void UIScene_FabricatorMenu::handleReload()
{
    Initialize(m_iPad, m_menu, true, m_containerSize,
        eSectionFabricatorUsing, eSectionFabricatorMax);
    m_slotListGrid.addSlots(FabricatorMenu::CONTAINER_SLOT_START, FabricatorTileEntity::CONTAINER_SIZE);
}

int UIScene_FabricatorMenu::getSectionColumns(ESceneSection eSection)
{
    switch (eSection)
    {
    case eSectionFabricatorGrid:      return 3;
    case eSectionFabricatorInventory: return 9;
    case eSectionFabricatorUsing:     return 9;
    default:                          return 0;
    }
}

int UIScene_FabricatorMenu::getSectionRows(ESceneSection eSection)
{
    switch (eSection)
    {
    case eSectionFabricatorGrid:      return 3;
    case eSectionFabricatorInventory: return 3;
    case eSectionFabricatorUsing:     return 1;
    default:                          return 0;
    }
}

// GetPositionOfSection / GetItemScreenData / setSectionSelectedSlot are pure
// virtual on IUIScene_AbstractContainerMenu (:211-212), so we MUST provide real
// bodies. m_slotListHotbar and m_slotListInventory are base members
// (UIScene_AbstractContainerMenu.h:18); m_slotListGrid is ours. This is
// UIScene_DispenserMenu.cpp's implementation with the section names swapped.
void UIScene_FabricatorMenu::GetPositionOfSection(ESceneSection eSection, UIVec2D *pPosition)
{
    switch (eSection)
    {
    case eSectionFabricatorGrid:      pPosition->x = m_slotListGrid.getXPos();      pPosition->y = m_slotListGrid.getYPos();      break;
    case eSectionFabricatorInventory: pPosition->x = m_slotListInventory.getXPos(); pPosition->y = m_slotListInventory.getYPos(); break;
    case eSectionFabricatorUsing:     pPosition->x = m_slotListHotbar.getXPos();    pPosition->y = m_slotListHotbar.getYPos();    break;
    default: assert(false); break;
    }
}

void UIScene_FabricatorMenu::GetItemScreenData(ESceneSection eSection, int iItemIndex,
    UIVec2D *pPosition, UIVec2D *pSize)
{
    UIVec2D sectionSize;
    switch (eSection)
    {
    case eSectionFabricatorGrid:      sectionSize.x = m_slotListGrid.getWidth();      sectionSize.y = m_slotListGrid.getHeight();      break;
    case eSectionFabricatorInventory: sectionSize.x = m_slotListInventory.getWidth(); sectionSize.y = m_slotListInventory.getHeight(); break;
    case eSectionFabricatorUsing:     sectionSize.x = m_slotListHotbar.getWidth();    sectionSize.y = m_slotListHotbar.getHeight();    break;
    default: assert(false); break;
    }

    int rows = getSectionRows(eSection);
    int cols = getSectionColumns(eSection);
    pSize->x = sectionSize.x / cols;
    pSize->y = sectionSize.y / rows;
    pPosition->x = (iItemIndex % cols) * pSize->x;
    pPosition->y = (iItemIndex / cols) * pSize->y;
}

void UIScene_FabricatorMenu::setSectionSelectedSlot(ESceneSection eSection, int x, int y)
{
    int cols = getSectionColumns(eSection);
    int index = (y * cols) + x;

    UIControl_SlotList *slotList = nullptr;
    switch (eSection)
    {
    case eSectionFabricatorGrid:      slotList = &m_slotListGrid;      break;
    case eSectionFabricatorInventory: slotList = &m_slotListInventory; break;
    case eSectionFabricatorUsing:     slotList = &m_slotListHotbar;    break;
    default: assert(false); break;
    }
    slotList->setHighlightSlot(index);
}

UIControl *UIScene_FabricatorMenu::getSection(ESceneSection eSection)
{
    if (eSection == eSectionFabricatorGrid) return &m_slotListGrid;
    return nullptr;
}
```

`Initialize(iPad, menu, autoDeleteMenu, startIndex, firstSection, maxSection)`
(`IUIScene_AbstractContainerMenu.h:226`) wires the menu into the scene's slot
routing; `startIndex` is the first non-container slot index (== container size),
matching how the Dispenser passes `m_containerSize` (`UIScene_DispenserMenu.cpp:27`).

> **Movie asset caveat (unverifiable here).** `getMoviePath()` returns the name of
> an **Iggy movie** (`FabricatorMenu` / `FabricatorMenuSplit`) that lives under the
> per-platform `*Media/` directories, which are **binary and out of scope for this
> repo view**. A brand-new scene needs a matching movie with elements named
> `"Grid"` and `"fabricatorLabel"` (the strings in your `UI_MAP_ELEMENT` calls). If
> you have no tooling to author Iggy movies, the practical shortcut is to **reuse
> the Dispenser movie** by returning `L"DispenserMenu"` from `getMoviePath()` and
> naming your slot list `"Trap"` to match its existing element — a 3×3 grid scene
> renders identically. This is the only step you cannot fully verify from source.

### Step 5.5 — the scene factory + the three switch sites

The `UILayer` factory `new`s scenes by enum. Add the case
(`UILayer.cpp:242`, next to `eUIScene_FurnaceMenu`):

```cpp
    case eUIScene_FabricatorMenu:
        newScene = new UIScene_FabricatorMenu(iPad, initData, this);
        break;
```

`UILayer.cpp:756` — the "this scene is a container/pauses the world" list. Add
`case eUIScene_FabricatorMenu:` alongside `eUIScene_FurnaceMenu`.

`UIController.cpp:2223` — the navigate-guard list (don't re-open if a menu is
already up). Add `case eUIScene_FabricatorMenu:` alongside `eUIScene_FurnaceMenu`.

Grep `eUIScene_DispenserMenu` (3 hits: `UILayer.cpp:236`, `UILayer.cpp:756`,
`UIController.cpp:2228`) to confirm you've matched every site the Dispenser scene
touches.

### Step 5.6 — `LoadFabricatorMenu` in `Consoles_App`

`Consoles_App.h:143` — declare it next to `LoadFurnaceMenu`:

```cpp
    bool LoadFabricatorMenu(int iPad, shared_ptr<Inventory> inventory, shared_ptr<FabricatorTileEntity> fabricator);
```

`Consoles_App.cpp:647` — copy `LoadFurnaceMenu` and swap the struct + scene id:

```cpp
bool CMinecraftApp::LoadFabricatorMenu(int iPad, shared_ptr<Inventory> inventory,
    shared_ptr<FabricatorTileEntity> fabricator)
{
    FabricatorScreenInput *initData = new FabricatorScreenInput();
    initData->fabricator = fabricator;
    initData->inventory  = inventory;
    initData->iPad       = iPad;
    initData->bSplitscreen = (app.GetLocalPlayerCount() > 1);

    return ui.NavigateToScene(iPad, eUIScene_FabricatorMenu, initData);
}
```

`NavigateToScene` hands `initData` to the `UILayer` factory, which builds the scene
and `delete`s the struct in the scene ctor (`UIScene_FabricatorMenu.cpp`, last
line).

### Step 5.7 — the strings

Add to `Minecraft.Client/Windows64Media/loc/stringsGeneric.xml` near
`IDS_TILE_FURNACE`. `IDS_*` constants are generated from this XML at configure time
by `cmake/GenerateStringIdLookup.cmake` — no manual `#define`:

```xml
	<data name="IDS_TILE_FABRICATOR">
		<value>Fabricator</value>
	</data>
	<data name="IDS_DESC_FABRICATOR">
		<value>Stores and arranges crafting materials.</value>
	</data>
```

---

## Step 6 — the build files

`cmake/sources/Common.cmake` lists sources explicitly, grouped by folder
(`source_group`). Add the four World files to the block that already contains
`FurnaceTile.cpp` (`Common.cmake:1867`) / `FurnaceMenu.cpp` (`:1006`):

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/FabricatorTile.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/FabricatorTile.h"
  "${CMAKE_CURRENT_SOURCE_DIR}/FabricatorTileEntity.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/FabricatorTileEntity.h"
  "${CMAKE_CURRENT_SOURCE_DIR}/FabricatorMenu.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/FabricatorMenu.h"
```

Add the two client UI files to the client's source list
(`Minecraft.Client/CMakeLists.txt` or its included `cmake/sources/*.cmake`, in the
group that lists `UIScene_FurnaceMenu.cpp`):

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/Common/UI/UIScene_FabricatorMenu.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/Common/UI/UIScene_FabricatorMenu.h"
```

---

## Build & test checklist

1. **Configure** so the loc header regenerates; confirm `IDS_TILE_FABRICATOR` and
   `IDS_DESC_FABRICATOR` appear in the generated `strings.h`
   (`build/<preset>/generated/Windows64Media/strings.h`).
2. **Build both libraries.** Common link errors: a missing source-list entry
   (unresolved `FabricatorMenu::...`), or a forgotten `#include` /
   forward-declaration for `FabricatorTileEntity` in `Player.h` / `ServerPlayer.cpp`
   / `ClientConnection.cpp`.
3. **Placement:** give yourself the block in creative (id 218). It places and the
   `TileItem` icon uses `setIconName(L"fabricator")` — drop a `fabricator` PNG in
   the terrain/item atlas per [Textures & Assets](/slop-docs/modding/textures-assets/).
4. **Open flow:** right-click the block. Server-side `use()` →
   `ServerPlayer::openFabricator` sends `ContainerOpenPacket(FABRICATOR)` →
   `ClientConnection::handleContainerOpen` → `LocalPlayer::openFabricator` →
   `UIScene_FabricatorMenu`. If nothing opens, add a `DebugPrintf` in each hop and
   watch which one is missed — the most common miss is forgetting the
   `ClientConnection` case or a `UILayer`/`UIController` switch site.
5. **Slots:** put items in the 9-slot grid, shift-click to bulk-move, close and
   reopen — items persist (they live on the `FabricatorTileEntity`, synced via the
   menu's slot listeners).
6. **Persistence:** save and reload the world. The block-entity serializes under
   save-id `L"Fabricator"` (`TileEntity.cpp:34`); `ContainerHelper::saveAllItems`
   writes the `"Items"` NBT list. Contents survive.
7. **Break drops:** mine the block — `onRemove` scatters the stored items as
   `ItemEntity`s (the `noDrop` guard prevents double-drops during the
   `setTileAndUpdate` swap the way the furnace's `setLit` does).
8. **Comparator:** place a comparator against it — `getAnalogOutputSignal` reports
   fullness via `AbstractContainerMenu::getRedstoneSignalFromContainer`.

## Where each layer really lives (quick reference)

| Layer | Template file:line |
|-------|--------------------|
| Container block (with block-entity) | `FurnaceTile.cpp:111` (`use`), `:142` (`newTileEntity`), `:162` (`onRemove`) |
| Simplest full block-entity container | `BrewingStandTileEntity.h/.cpp` |
| Container save id registry | `TileEntity.cpp:14`, `setId` `:37` |
| Tile-entity type enum | `Class.h:302-320`, SUBCLASS `:531-544` |
| Minimal `AbstractContainerMenu` | `TrapMenu.cpp` (whole file) |
| Menu base | `AbstractContainerMenu.h:14` |
| Container-open packet | `ContainerOpenPacket.h` (packet id 100) |
| Server open (build menu + send packet) | `ServerPlayer.cpp:1416` (`openFurnace`) |
| Client packet handler | `ClientConnection.cpp:3116` |
| Client open (load scene) | `LocalPlayer.cpp:758` |
| App scene loader | `Consoles_App.cpp:647` (`LoadFurnaceMenu`) |
| Scene init struct | `UIStructs.h:86` |
| Simplest single-grid scene | `UIScene_DispenserMenu.cpp` (whole file) |
| Scene section enum | `IUIScene_AbstractContainerMenu.h:28` |
| Scene factory + guards | `UILayer.cpp:242`/`:756`, `UIController.cpp:2223` |
| Loc generation | `cmake/GenerateStringIdLookup.cmake` |

For the concepts behind the container/menu split and the packet round-trip, read
[Custom Containers](/slop-docs/modding/custom-containers/) and
[Custom UI](/slop-docs/modding/custom-ui/).

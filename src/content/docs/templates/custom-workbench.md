---
title: "Template: Custom Workbench"
description: A complete starter mod that adds a custom 4x4 crafting workbench with GUI.
---

This template walks you through building a fully working custom workbench block with a 4x4 crafting grid, a container menu, a SWF-based UI screen, multiplayer sync, and a custom recipe. By the end you will have a new block that players can place, right-click to open a 4x4 crafting interface, and use to craft items that the normal 3x3 table cannot.

If you have not set up your build environment yet, start with [Getting Started](/slop-docs/modding/getting-started/) first.

## What we are building

- A **MegaWorkbenchTile** block that opens a crafting UI on right-click
- A **MegaCraftingMenu** container menu with 16 input slots (4x4) and 1 output slot
- A **UIScene** that renders the grid and connects to the menu
- A custom **4x4 recipe** for the mega workbench
- A **block texture** on the terrain atlas

## Files you will create

| File | Purpose |
|------|---------|
| `Minecraft.World/MegaWorkbenchTile.h` | Block subclass header |
| `Minecraft.World/MegaWorkbenchTile.cpp` | Block behavior (opens menu on right-click) |
| `Minecraft.World/MegaCraftingMenu.h` | Container menu header |
| `Minecraft.World/MegaCraftingMenu.cpp` | 4x4 slot layout, crafting logic, shift-click |
| `Minecraft.World/MegaCraftingContainer.h` | Transient container for the 16 crafting slots |
| `Minecraft.World/MegaRecipes.h` | 4x4 recipe manager header |
| `Minecraft.World/MegaRecipes.cpp` | Recipe matching logic |
| `Minecraft.Client/Common/UI/UIScene_MegaCrafting.h` | SWF screen class header |
| `Minecraft.Client/Common/UI/UIScene_MegaCrafting.cpp` | Screen behavior, pointer navigation |

## Files you will modify

| File | What you change |
|------|----------------|
| `Minecraft.World/Tile.h` | Add `megaWorkbench` static pointer and ID constant |
| `Minecraft.World/Tile.cpp` | Static def, register the block in `staticCtor()` |
| `Minecraft.Client/Common/UI/UIEnums.h` | Add `eUIScene_MegaCrafting` to the `EUIScene` enum |
| `Minecraft.Client/CConsoleMinecraftApp.cpp` | Add navigation case for the new scene |
| `Minecraft.Client/PreStitchedTextureMap.cpp` | Register UV entries in `loadUVs()` for block texture |
| `cmake/Sources.cmake` | Add new source files |

## Includes you will add

**In `MegaWorkbenchTile.cpp`**:

```cpp
#include "stdafx.h"
#include "MegaWorkbenchTile.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.level.h"
#include "MegaCraftingMenu.h"
```

**In `MegaCraftingMenu.cpp`**:

```cpp
#include "stdafx.h"
#include "MegaCraftingMenu.h"
#include "MegaCraftingContainer.h"
#include "ResultContainer.h"
#include "ResultSlot.h"
#include "Slot.h"
#include "MegaRecipes.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.level.h"
```

**In `MegaRecipes.cpp`**:

```cpp
#include "stdafx.h"
#include "MegaRecipes.h"
#include "net.minecraft.world.item.h"
#include "net.minecraft.world.level.tile.h"
```

**In `UIScene_MegaCrafting.cpp`**:

```cpp
#include "stdafx.h"
#include "UI.h"
#include "UIScene_MegaCrafting.h"
#include "MegaCraftingMenu.h"
```

**In `Tile.cpp`**, add with the other tile includes:

```cpp
#include "MegaWorkbenchTile.h"
```

## Sources.cmake entries

Add your new files to `cmake/Sources.cmake`. World-side files go under `MINECRAFT_WORLD_SOURCES`, client-side files go under `MINECRAFT_CLIENT_SOURCES`:

```cmake
# In MINECRAFT_WORLD_SOURCES:
"MegaWorkbenchTile.cpp"
"MegaCraftingMenu.cpp"
"MegaRecipes.cpp"

# In MINECRAFT_CLIENT_SOURCES:
"Common/UI/UIScene_MegaCrafting.cpp"
```

`MegaCraftingContainer.h` is header-only, so it does not need a Sources.cmake entry.

---

## Step 1: The workbench tile (block)

The block itself is simple. It just needs to open the crafting menu when a player right-clicks it.

### MegaWorkbenchTile.h

```cpp
#pragma once
#include "Tile.h"

class Level;
class Player;

class MegaWorkbenchTile : public Tile
{
public:
    MegaWorkbenchTile(int id);

    virtual bool use(Level *level, int x, int y, int z,
                     shared_ptr<Player> player, int clickedFace,
                     float clickX, float clickY, float clickZ,
                     bool soundOnly = false);
};
```

### MegaWorkbenchTile.cpp

```cpp
#include "stdafx.h"
#include "MegaWorkbenchTile.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.level.h"
#include "MegaCraftingMenu.h"

MegaWorkbenchTile::MegaWorkbenchTile(int id) : Tile(id, Material::wood)
{
}

bool MegaWorkbenchTile::use(Level *level, int x, int y, int z,
                             shared_ptr<Player> player, int clickedFace,
                             float clickX, float clickY, float clickZ,
                             bool soundOnly)
{
    if (soundOnly)
        return true;

    if (!level->isClientSide)
    {
        // Open the container menu for this player
        auto menu = make_shared<MegaCraftingMenu>(
            player, player->inventory, level, x, y, z);

        player->openMenu(menu);
    }

    return true;
}
```

The `soundOnly` check is a 4J thing. When the engine just wants the interaction sound (no side effects), it passes `true`. We return `true` to say "yes, this block is interactive" without actually opening anything.

The `!level->isClientSide` guard makes sure we only create the menu on the server side. The menu system handles syncing it to the client automatically.

### Register the block

In `Tile.h`, add the forward declaration and static pointer:

```cpp
class MegaWorkbenchTile;

// Inside the Tile class, with the other static pointers:
static MegaWorkbenchTile *megaWorkbench;
static const int megaWorkbench_Id = 200;  // pick an unused ID
```

In `Tile.cpp`, add the static definition and registration inside `Tile::staticCtor()`:

```cpp
MegaWorkbenchTile *Tile::megaWorkbench = NULL;

// Inside Tile::staticCtor():
Tile::megaWorkbench = (MegaWorkbenchTile *)(new MegaWorkbenchTile(200))
    ->setDestroyTime(2.5f)
    ->setExplodeable(5)
    ->setSoundType(Tile::SOUND_WOOD)
    ->setTextureName(L"megaWorkbench")
    ->setDescriptionId(IDS_TILE_MEGA_WORKBENCH)
    ->setBaseItemTypeAndMaterial(Item::eBaseItemType_device, Item::eMaterial_wood);
```

See [Adding Blocks](/slop-docs/modding/adding-blocks/) for the full breakdown of the registration system and available properties.

---

## Step 2: The container menu (MegaCraftingMenu)

This is the core of the whole thing. The menu defines the slot layout, wires up crafting logic, and handles shift-clicking.

### The backing container

First we need a transient container to hold the 16 crafting input slots. This container only lives while the menu is open. We extend `SimpleContainer` which provides working implementations for all of `Container`'s pure virtual methods (item storage, getters, setters, etc.) backed by a simple item array.

```cpp
// MegaCraftingContainer.h
#pragma once
#include "SimpleContainer.h"

class MegaCraftingContainer : public SimpleContainer
{
public:
    static const int GRID_SIZE = 16;  // 4x4

    MegaCraftingContainer()
        : SimpleContainer(IDS_CONTAINER_MEGA_CRAFTING, GRID_SIZE)
    {
    }
};
```

> **Note:** `SimpleContainer`'s constructor takes `(name, size)` where name is a string table ID (int). Define `IDS_CONTAINER_MEGA_CRAFTING` in your string table with the display text "Mega Crafting". If you extend `Container` directly instead, you have to implement all of its pure virtual methods yourself: `getItem`, `removeItem`, `removeItemNoUpdate`, `setItem`, `getName`, `getMaxStackSize`, `setChanged`, `stillValid`, `startOpen`, and `stopOpen`.

### MegaCraftingMenu.h

```cpp
#pragma once
#include "AbstractContainerMenu.h"

class Container;
class MegaCraftingContainer;
class ResultContainer;
class Level;
class Player;

class MegaCraftingMenu : public AbstractContainerMenu
{
private:
    shared_ptr<MegaCraftingContainer> craftGrid;
    shared_ptr<ResultContainer> resultContainer;
    Level *level;
    int posX, posY, posZ;

public:
    static const int GRID_WIDTH = 4;
    static const int GRID_HEIGHT = 4;
    static const int GRID_SLOTS = 16;
    static const int RESULT_SLOT = 0;

    MegaCraftingMenu(shared_ptr<Player> player,
                     shared_ptr<Container> playerInventory,
                     Level *level, int x, int y, int z);

    virtual bool stillValid(shared_ptr<Player> player);
    virtual void slotsChanged();
    virtual shared_ptr<ItemInstance> quickMoveStack(shared_ptr<Player> player,
                                                    int slotIndex);
    virtual void removed(shared_ptr<Player> player);
};
```

### MegaCraftingMenu.cpp

```cpp
#include "stdafx.h"
#include "MegaCraftingMenu.h"
#include "MegaCraftingContainer.h"
#include "ResultContainer.h"
#include "ResultSlot.h"
#include "Slot.h"
#include "MegaRecipes.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.level.h"

MegaCraftingMenu::MegaCraftingMenu(shared_ptr<Player> player,
                                   shared_ptr<Container> playerInventory,
                                   Level *level, int x, int y, int z)
    : level(level), posX(x), posY(y), posZ(z)
{
    craftGrid = make_shared<MegaCraftingContainer>();
    resultContainer = make_shared<ResultContainer>();

    // --- Result slot (index 0 in the menu) ---
    // Position it to the right of the 4x4 grid
    // ResultSlot takes: player, craftSlots, resultContainer, slotIndex, pixelX, pixelY
    addSlot(new ResultSlot(player, craftGrid, resultContainer, RESULT_SLOT, 144, 35));

    // --- 4x4 crafting grid (menu indices 1 through 16) ---
    for (int row = 0; row < GRID_HEIGHT; row++)
    {
        for (int col = 0; col < GRID_WIDTH; col++)
        {
            int slotIndex = col + row * GRID_WIDTH;
            int pixelX = 8 + col * 18;
            int pixelY = 8 + row * 18;
            addSlot(new Slot(craftGrid, slotIndex, pixelX, pixelY));
        }
    }

    // --- Player inventory (menu indices 17 through 43) ---
    for (int row = 0; row < 3; row++)
    {
        for (int col = 0; col < 9; col++)
        {
            addSlot(new Slot(playerInventory, col + row * 9 + 9,
                             8 + col * 18, 90 + row * 18));
        }
    }

    // --- Hotbar (menu indices 44 through 52) ---
    for (int col = 0; col < 9; col++)
    {
        addSlot(new Slot(playerInventory, col, 8 + col * 18, 148));
    }
}

bool MegaCraftingMenu::stillValid(shared_ptr<Player> player)
{
    // Close the menu if the block was destroyed or the player walked away
    if (level->getTile(posX, posY, posZ) != Tile::megaWorkbench_Id)
        return false;

    float dx = player->x - (posX + 0.5f);
    float dy = player->y - (posY + 0.5f);
    float dz = player->z - (posZ + 0.5f);
    return (dx * dx + dy * dy + dz * dz) <= 64.0f;
}

void MegaCraftingMenu::slotsChanged()
{
    // Check if the current grid matches any 4x4 recipe
    auto result = MegaRecipes::getInstance()->getResult(craftGrid);
    resultContainer->setItem(RESULT_SLOT, result);
}

shared_ptr<ItemInstance> MegaCraftingMenu::quickMoveStack(
    shared_ptr<Player> player, int slotIndex)
{
    Slot *slot = getSlot(slotIndex);
    if (!slot || !slot->hasItem())
        return nullptr;

    auto original = slot->getItem();
    auto copy = make_shared<ItemInstance>(*original);

    if (slotIndex == 0)
    {
        // Shift-click the result: move to player inventory (17-52)
        if (!moveItemStackTo(original, 17, 53, true))
            return nullptr;
    }
    else if (slotIndex >= 1 && slotIndex <= 16)
    {
        // Shift-click a grid slot: move to player inventory
        if (!moveItemStackTo(original, 17, 53, false))
            return nullptr;
    }
    else if (slotIndex >= 17 && slotIndex <= 52)
    {
        // Shift-click from player inventory: move into the grid
        if (!moveItemStackTo(original, 1, 17, false))
            return nullptr;
    }

    if (original->count == 0)
        slot->set(nullptr);
    else
        slot->setChanged();

    return copy;
}

void MegaCraftingMenu::removed(shared_ptr<Player> player)
{
    AbstractContainerMenu::removed(player);

    // Drop everything left in the crafting grid back to the player
    if (!level->isClientSide)
    {
        for (int i = 0; i < MegaCraftingContainer::GRID_SIZE; i++)
        {
            auto item = craftGrid->removeItem(i, craftGrid->getMaxStackSize());
            if (item != nullptr)
                player->drop(item);
        }
    }
}
```

### How the slot layout works

Here is a visual map of every slot index in the menu:

```
Menu index:    Slot type:
0              ResultSlot (output)
1-16           Crafting grid (4x4)
17-43          Player inventory (3 rows of 9)
44-52          Hotbar (1 row of 9)
```

The pixel positions (`x`, `y` passed to each `Slot` constructor) are used by the UI layer to figure out where items render. The 18px spacing is standard: 16px icon + 2px gap.

`ResultSlot` is a special slot subclass that the base game provides. It blocks `mayPlace()` (so you cannot put items into the output) and fires crafting events when you take items out. It also calls `slotsChanged()` after each take so the menu can check for a new recipe match.

For the full details on slots, shift-clicking, and the container lifecycle, see [Custom Container Menus](/slop-docs/modding/custom-containers/).

---

## Step 3: The SWF-based UI screen

On console, all menus render through Flash SWF files controlled by the Iggy runtime (RAD Game Tools, v1.2.30). You need two things: the SWF movie file and a C++ scene class.

### Add the scene to the enum

In `Common/UI/UIEnums.h`:

```cpp
enum EUIScene
{
    // ... existing entries ...

    eUIScene_MegaCrafting,

    // ... rest of enum ...
};
```

### UIScene_MegaCrafting.h

This scene extends `UIScene_AbstractContainerMenu`, which gives us player inventory rendering, pointer navigation, and slot interaction for free.

```cpp
#pragma once
#include "UIScene_AbstractContainerMenu.h"
#include "IUIScene_AbstractContainerMenu.h"

class MegaCraftingMenu;

class UIScene_MegaCrafting : public UIScene_AbstractContainerMenu,
                              public IUIScene_AbstractContainerMenu
{
private:
    UIControl_SlotList m_slotListGrid;
    UIControl_SlotList m_slotListResult;

    UI_BEGIN_MAP_ELEMENTS_AND_NAMES(UIScene_AbstractContainerMenu)
        UI_BEGIN_MAP_CHILD_ELEMENTS(m_controlMainPanel)
            UI_MAP_ELEMENT(m_slotListGrid, "megaGridList")
            UI_MAP_ELEMENT(m_slotListResult, "megaResultList")
        UI_END_MAP_CHILD_ELEMENTS()
    UI_END_MAP_ELEMENTS_AND_NAMES()

public:
    UIScene_MegaCrafting(int iPad, void *initData, UILayer *parentLayer);

    virtual EUIScene getSceneType() { return eUIScene_MegaCrafting; }

protected:
    virtual wstring getMoviePath();
    virtual void handleReload();

public:
    virtual void handleInput(int iPad, int key, bool repeat,
                             bool pressed, bool released, bool &handled);
    virtual void updateTooltips();

    // IUIScene_AbstractContainerMenu interface
    virtual int getSectionColumns(ESceneSection eSection);
    virtual int getSectionRows(ESceneSection eSection);
    virtual ESceneSection GetSectionAndSlotInDirection(
        ESceneSection eSection, ETapState eTapDirection,
        int *piTargetX, int *piTargetY);
    virtual void GetPositionOfSection(ESceneSection eSection,
                                       UIVec2D *pPosition);
    virtual void GetItemScreenData(ESceneSection eSection, int iItemIndex,
                                    UIVec2D *pPosition, UIVec2D *pSize);
    virtual int getSectionStartOffset(ESceneSection eSection);
};
```

### UIScene_MegaCrafting.cpp

```cpp
#include "stdafx.h"
#include "UI.h"
#include "UIScene_MegaCrafting.h"
#include "MegaCraftingMenu.h"

// Section IDs for pointer navigation
enum EMegaCraftingSection
{
    eSection_Grid = 0,
    eSection_Result = 1,
    eSection_Inventory = 2,
    eSection_Hotbar = 3,
};

UIScene_MegaCrafting::UIScene_MegaCrafting(int iPad, void *initData,
                                            UILayer *parentLayer)
    : UIScene_AbstractContainerMenu(iPad, parentLayer)
{
    initialiseMovie();

    m_slotListGrid.init(L"", 0);
    m_slotListResult.init(L"", 1);
}

wstring UIScene_MegaCrafting::getMoviePath()
{
    return L"MegaCrafting";
}

void UIScene_MegaCrafting::handleReload()
{
    m_slotListGrid.init(L"", 0);
    m_slotListResult.init(L"", 1);
}

void UIScene_MegaCrafting::updateTooltips()
{
    ui.SetTooltips(m_iPad, eToolTipExit);
}

void UIScene_MegaCrafting::handleInput(int iPad, int key, bool repeat,
                                        bool pressed, bool released,
                                        bool &handled)
{
    if (!pressed) return;

    if (key == ACTION_MENU_B)
    {
        navigateBack();
        handled = true;
        return;
    }

    sendInputToMovie(key, repeat, pressed, released);
    handled = true;
}

// --- Section layout for pointer navigation ---

int UIScene_MegaCrafting::getSectionColumns(ESceneSection eSection)
{
    switch (eSection)
    {
    case eSection_Grid:      return 4;
    case eSection_Result:    return 1;
    case eSection_Inventory: return 9;
    case eSection_Hotbar:    return 9;
    default:                 return 0;
    }
}

int UIScene_MegaCrafting::getSectionRows(ESceneSection eSection)
{
    switch (eSection)
    {
    case eSection_Grid:      return 4;
    case eSection_Result:    return 1;
    case eSection_Inventory: return 3;
    case eSection_Hotbar:    return 1;
    default:                 return 0;
    }
}

int UIScene_MegaCrafting::getSectionStartOffset(ESceneSection eSection)
{
    // Maps sections to the starting menu slot index
    switch (eSection)
    {
    case eSection_Grid:      return 1;   // slots 1-16
    case eSection_Result:    return 0;   // slot 0
    case eSection_Inventory: return 17;  // slots 17-43
    case eSection_Hotbar:    return 44;  // slots 44-52
    default:                 return 0;
    }
}

ESceneSection UIScene_MegaCrafting::GetSectionAndSlotInDirection(
    ESceneSection eSection, ETapState eTapDirection,
    int *piTargetX, int *piTargetY)
{
    // Define how the analog stick navigates between sections.
    // When the pointer reaches the edge of one section, this tells
    // the system which section to jump to next.
    switch (eSection)
    {
    case eSection_Grid:
        if (eTapDirection == eTap_Right)  return (ESceneSection)eSection_Result;
        if (eTapDirection == eTap_Down)   return (ESceneSection)eSection_Inventory;
        break;
    case eSection_Result:
        if (eTapDirection == eTap_Left)   return (ESceneSection)eSection_Grid;
        if (eTapDirection == eTap_Down)   return (ESceneSection)eSection_Inventory;
        break;
    case eSection_Inventory:
        if (eTapDirection == eTap_Up)     return (ESceneSection)eSection_Grid;
        if (eTapDirection == eTap_Down)   return (ESceneSection)eSection_Hotbar;
        break;
    case eSection_Hotbar:
        if (eTapDirection == eTap_Up)     return (ESceneSection)eSection_Inventory;
        break;
    }
    return eSection;  // stay in current section
}

void UIScene_MegaCrafting::GetPositionOfSection(ESceneSection eSection,
                                                 UIVec2D *pPosition)
{
    // Screen-space origin of each section (matches your SWF layout)
    switch (eSection)
    {
    case eSection_Grid:      pPosition->x = 8;   pPosition->y = 8;   break;
    case eSection_Result:    pPosition->x = 144;  pPosition->y = 35;  break;
    case eSection_Inventory: pPosition->x = 8;    pPosition->y = 90;  break;
    case eSection_Hotbar:    pPosition->x = 8;    pPosition->y = 148; break;
    }
}

void UIScene_MegaCrafting::GetItemScreenData(ESceneSection eSection,
                                              int iItemIndex,
                                              UIVec2D *pPosition,
                                              UIVec2D *pSize)
{
    int cols = getSectionColumns(eSection);
    int row = iItemIndex / cols;
    int col = iItemIndex % cols;

    UIVec2D origin;
    GetPositionOfSection(eSection, &origin);

    pPosition->x = origin.x + col * 18.0f;
    pPosition->y = origin.y + row * 18.0f;
    pSize->x = 16.0f;
    pSize->y = 16.0f;
}
```

### How UIScene connects to the menu

The `UIScene_AbstractContainerMenu` base class does the heavy lifting. When the scene opens, it reads the menu's slot list and renders item icons at the pixel positions each `Slot` defines. Every frame, it calls `broadcastChanges()` on the menu to detect item changes and redraws any slots that differ.

The `IUIScene_AbstractContainerMenu` interface you implement tells the pointer navigation system how your grid is shaped. When a player pushes the analog stick, the system calls `GetSectionAndSlotInDirection()` to figure out which slot to highlight next.

### The SWF movie file

You need a `MegaCrafting720.swf` (and ideally 1080p/480p variants) authored in Adobe Flash. The SWF should contain:

- A `megaGridList` slot list element (4 columns, 4 rows of 18px-spaced slot icons)
- A `megaResultList` slot list element (single slot)
- The standard `inventoryList` and `hotbarList` inherited from the container base
- An arrow or plus graphic between the grid and the result (purely decorative)
- Root functions: `SetSafeZone()`, `SetFocus()`, `SetAlpha()`
- Button press callbacks via `fscommand("handlePress", ...)`

Place the SWF in your game archive alongside the other UI movies. The resolution suffix is appended automatically by `getMoviePath()`.

For the full details on SWF authoring, element mapping, and Iggy integration, see [Custom GUI Screens](/slop-docs/modding/custom-screens/).

### Register the scene in navigation

In `CConsoleMinecraftApp::NavigateToScene`:

```cpp
case eUIScene_MegaCrafting:
    scene = new UIScene_MegaCrafting(iPad, initData, parentLayer);
    break;
```

---

## Step 4: Network sync for multiplayer

Good news: if you use the container menu system properly, you get multiplayer sync for free. Here is what happens under the hood.

### The automatic sync pipeline

1. When `player->openMenu(menu)` is called on the server, it assigns the menu a `containerId` and sends a `ContainerOpenPacket` to the client.
2. The client creates a matching menu instance locally and wires it to the UIScene.
3. Every tick, `broadcastChanges()` runs on the server. It compares each slot against `lastSlots`. If anything changed, it sends `ContainerSetSlotPacket` to the client.
4. When the player clicks a slot, the client sends a `ContainerClickPacket` to the server. The server runs `clicked()` on the authoritative menu, then the next `broadcastChanges()` sends any resulting changes back.
5. When the menu closes, a `ContainerClosePacket` fires and both sides call `removed()`.

### What you need to do

Nothing extra, as long as you follow these rules:

- All item mutations go through `Slot::set()` and `Slot::setChanged()`, not direct container writes
- Your `slotsChanged()` updates the result container through the slot system
- Your `stillValid()` correctly detects when the menu should close
- Your `removed()` properly drops leftover items

If you need to send custom data (like a progress bar or status value), use `sendData(id, value)` in your menu and override `setData(id, value)` on the client side. The container system routes these through `ContainerSetDataPacket` automatically.

For custom packet types beyond what the container system provides, see [Multiplayer & Packets](/slop-docs/modding/multiplayer/).

---

## Step 5: Custom 4x4 recipes

The vanilla `Recipes` class only supports up to 3x3 grids. We need our own recipe manager for the 4x4 grid.

### MegaRecipes.h

```cpp
#pragma once
#include <vector>
#include <memory>

class ItemInstance;
class Container;

struct MegaRecipy
{
    int width;
    int height;
    vector<shared_ptr<ItemInstance>> ingredients;  // width * height entries
    shared_ptr<ItemInstance> result;
};

class MegaRecipes
{
private:
    vector<MegaRecipy> recipes;

    MegaRecipes();

public:
    static MegaRecipes *getInstance();

    void addRecipy(int width, int height,
                   const vector<shared_ptr<ItemInstance>> &ingredients,
                   shared_ptr<ItemInstance> result);

    shared_ptr<ItemInstance> getResult(shared_ptr<Container> grid) const;

private:
    bool matches(const MegaRecipy &recipy,
                 shared_ptr<Container> grid) const;

    void registerRecipes();
};
```

### MegaRecipes.cpp

```cpp
#include "stdafx.h"
#include "MegaRecipes.h"
#include "net.minecraft.world.item.h"
#include "net.minecraft.world.level.tile.h"

static MegaRecipes *s_instance = nullptr;

MegaRecipes::MegaRecipes()
{
    registerRecipes();
}

MegaRecipes *MegaRecipes::getInstance()
{
    if (s_instance == nullptr)
        s_instance = new MegaRecipes();
    return s_instance;
}

void MegaRecipes::addRecipy(int width, int height,
                             const vector<shared_ptr<ItemInstance>> &ingredients,
                             shared_ptr<ItemInstance> result)
{
    MegaRecipy recipy;
    recipy.width = width;
    recipy.height = height;
    recipy.ingredients = ingredients;
    recipy.result = result;
    recipes.push_back(recipy);
}

shared_ptr<ItemInstance> MegaRecipes::getResult(
    shared_ptr<Container> grid) const
{
    for (const auto &recipy : recipes)
    {
        if (matches(recipy, grid))
            return make_shared<ItemInstance>(*recipy.result);
    }
    return nullptr;
}

bool MegaRecipes::matches(const MegaRecipy &recipy,
                           shared_ptr<Container> grid) const
{
    // Try every possible offset within the 4x4 grid
    for (int offX = 0; offX <= 4 - recipy.width; offX++)
    {
        for (int offY = 0; offY <= 4 - recipy.height; offY++)
        {
            bool valid = true;

            for (int gy = 0; gy < 4 && valid; gy++)
            {
                for (int gx = 0; gx < 4 && valid; gx++)
                {
                    int rx = gx - offX;
                    int ry = gy - offY;

                    shared_ptr<ItemInstance> expected = nullptr;
                    if (rx >= 0 && rx < recipy.width &&
                        ry >= 0 && ry < recipy.height)
                    {
                        expected = recipy.ingredients[rx + ry * recipy.width];
                    }

                    auto actual = grid->getItem(gx + gy * 4);

                    if (expected == nullptr && actual == nullptr)
                        continue;
                    if (expected == nullptr || actual == nullptr)
                    {
                        valid = false;
                        continue;
                    }
                    if (actual->id != expected->id)
                    {
                        valid = false;
                        continue;
                    }
                    // Use ANY_AUX_VALUE (-1) to accept any data value
                    if (expected->auxValue != -1 &&
                        actual->auxValue != expected->auxValue)
                    {
                        valid = false;
                    }
                }
            }

            if (valid) return true;
        }
    }
    return false;
}

void MegaRecipes::registerRecipes()
{
    // Example: 4x4 diamond block ring makes a "Mega Diamond Block"
    // Layout:
    //   DDDD
    //   D  D
    //   D  D
    //   DDDD
    auto d = make_shared<ItemInstance>(Tile::diamondBlock, 1);
    auto empty = shared_ptr<ItemInstance>(nullptr);

    vector<shared_ptr<ItemInstance>> ring = {
        d,     d,     d,     d,
        d,     empty, empty, d,
        d,     empty, empty, d,
        d,     d,     d,     d
    };

    // Result: 4 diamond blocks (or whatever you want)
    addRecipy(4, 4, ring,
              make_shared<ItemInstance>(Tile::diamondBlock, 4));
}
```

The matching logic works the same way the vanilla `ShapedRecipy` does: it slides the recipe pattern around within the grid to find a match at any offset. Smaller recipes (like a 2x4) will match if placed anywhere in the grid with the remaining slots empty.

To add more recipes, just add more calls to `addRecipy()` inside `registerRecipes()`. For the type string encoding used by the vanilla recipe system, see [Adding Recipes](/slop-docs/modding/adding-recipes/).

---

## Step 6: Block texture

You need a texture for your workbench block on the terrain atlas.

### Add the UV mapping

In `PreStitchedTextureMap::loadUVs()`, add an entry for your texture name:

```cpp
float slotSize = 1.0f / 16.0f;

// Pick an empty slot on the atlas grid (e.g. column 15, row 12)
texturesByName.insert(stringIconMap::value_type(
    L"megaWorkbench",
    new SimpleIcon(L"megaWorkbench",
                   slotSize * 15, slotSize * 12,
                   slotSize * 16, slotSize * 13)
));
```

### Paint the texture

Open your `terrain.png` file and paint a 16x16 pixel texture at the grid position you chose (column 15, row 12 in this example). A workbench-style block usually has a top face with the grid pattern and sides with a planks-like texture.

If you want different textures per face (like the vanilla crafting table), override `registerIcons()` in your tile class:

```cpp
void MegaWorkbenchTile::registerIcons(IconRegister *iconRegister)
{
    iconTop = iconRegister->registerIcon(L"megaWorkbench_top");
    iconSide = iconRegister->registerIcon(L"megaWorkbench_side");
    iconBottom = iconRegister->registerIcon(L"megaWorkbench_bottom");
}

Icon *MegaWorkbenchTile::getTexture(int face)
{
    if (face == 1) return iconTop;     // top
    if (face == 0) return iconBottom;  // bottom
    return iconSide;                    // all four sides
}
```

Then register all three texture names in `loadUVs()` at different atlas positions.

For the full guide on the terrain atlas system and UV mapping, see [Block Textures](/slop-docs/modding/block-textures/).

---

## Build and test

Build the project:

```bash
cmake --build build --config Release
```

Launch the game and test:

1. Place the mega workbench block (creative mode or `/give`)
2. Right-click it to open the 4x4 crafting grid
3. Put 12 diamond blocks in a ring pattern (the example recipe) to test
4. The result should appear in the output slot
5. Shift-click the result to move it to your inventory
6. Close the menu and check that leftover items drop back to you
7. In multiplayer, have another player watch while you craft. Items should sync correctly.

If the block does not open the UI, double-check that `eUIScene_MegaCrafting` is in the enum and the `NavigateToScene` switch has your case. If items do not sync in multiplayer, make sure all item changes go through `Slot::set()` and not direct container writes.

## Related guides

- [Adding Blocks](/slop-docs/modding/adding-blocks/) for the tile registration system
- [Custom Container Menus](/slop-docs/modding/custom-containers/) for the full container menu reference
- [Custom GUI Screens](/slop-docs/modding/custom-screens/) for SWF authoring and UIScene details
- [Adding Recipes](/slop-docs/modding/adding-recipes/) for the vanilla recipe system
- [Block Textures](/slop-docs/modding/block-textures/) for the terrain atlas
- [Multiplayer & Packets](/slop-docs/modding/multiplayer/) for custom networking

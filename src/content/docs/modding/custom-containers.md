---
title: Custom Container Menus & UIs
description: How the container menu system works in LCE and how to build your own.
---

When you open a chest, crafting table, furnace, or anvil in Minecraft, you're looking at a container menu. It's the system that manages slots, items, click behavior, shift-clicking, and syncing everything between client and server. This guide breaks down how all of that works and shows you how to build your own.

## How the system fits together

There are two sides to every container UI:

1. **The menu** (`AbstractContainerMenu` and its subclasses) handles the game logic: which slots exist, what items can go where, what happens when you click, and shift-click behavior.
2. **The screen** (`AbstractContainerScreen` and its subclasses) handles rendering: drawing the background texture, rendering items in slots, hover tooltips, and forwarding mouse clicks to the menu.

On console, the screen layer is mostly bypassed. Instead, 4J uses a SWF/Iggy-based UI system (more on that later). But the menu side is the same on every platform.

The menu is the brain. The screen is the face.

```
AbstractContainerMenu          -- slots, click logic, sync
    |
    v
CraftingMenu / FurnaceMenu    -- your specific menu
    |
    v
AbstractContainerScreen        -- rendering, mouse input (PC)
    |                           or
    v                          UIScene_AbstractContainerMenu -- SWF/Iggy rendering (console)
CraftingScreen / FurnaceScreen -- your specific screen
```

## AbstractContainerMenu: the base class

Every container menu inherits from `AbstractContainerMenu`. It lives in `Minecraft.World/AbstractContainerMenu.h`.

Here's what it gives you:

```cpp
class AbstractContainerMenu
{
public:
    static const int SLOT_CLICKED_OUTSIDE = -999;

    static const int CLICK_PICKUP = 0;
    static const int CLICK_QUICK_MOVE = 1;
    static const int CLICK_SWAP = 2;
    static const int CLICK_CLONE = 3;

    // Note: CLICK_THROW (4), CLICK_QUICK_CRAFT (5), CLICK_PICKUP_ALL (6),
    // and the QUICKCRAFT_TYPE_* / QUICKCRAFT_HEADER_* constants only exist
    // in MinecraftConsoles. LCEMP only has the four click types above.

    // 4J added these to fix creative mode slot replacement bugs
    static const int CONTAINER_ID_CARRIED = -1;
    static const int CONTAINER_ID_INVENTORY = 0;
    static const int CONTAINER_ID_CREATIVE = -2;

    vector<shared_ptr<ItemInstance>> lastSlots;  // previous frame's items (for change detection)
    vector<Slot *> slots;                         // all slots in this menu
    int containerId;

protected:
    vector<ContainerListener *> containerListeners;

    AbstractContainerMenu();
    Slot *addSlot(Slot *slot);

public:
    virtual ~AbstractContainerMenu();
    virtual void addSlotListener(ContainerListener *listener);
    // Note: removeSlotListener() only exists in MinecraftConsoles, not LCEMP.
    virtual vector<shared_ptr<ItemInstance>> *getItems();
    virtual void sendData(int id, int value);
    virtual void broadcastChanges();
    virtual bool needsRendered();
    virtual bool clickMenuButton(shared_ptr<Player> player, int buttonId);
    virtual Slot *getSlotFor(shared_ptr<Container> c, int index);
    virtual Slot *getSlot(int index);
    virtual shared_ptr<ItemInstance> quickMoveStack(shared_ptr<Player> player, int slotIndex);
    virtual shared_ptr<ItemInstance> clicked(int slotIndex, int buttonNum, int clickType,
                                             shared_ptr<Player> player);
    virtual bool mayCombine(Slot *slot, shared_ptr<ItemInstance> item);
    // Note: canTakeItemForPickAll() only exists in MinecraftConsoles, not LCEMP.
    virtual void removed(shared_ptr<Player> player);
    virtual void slotsChanged();
    virtual void setData(int id, int value);
    virtual bool stillValid(shared_ptr<Player> player) = 0;
    // Note: isValidIngredient() only exists in MinecraftConsoles, not LCEMP.

protected:
    bool moveItemStackTo(shared_ptr<ItemInstance> itemStack, int startSlot, int endSlot,
                         bool backwards);
};
```

### The lifecycle end to end

Here's what happens from when a player opens a container to when it closes:

1. **Construction.** The menu subclass constructor calls `addSlot()` for every slot, setting up the layout. Each slot gets an auto-incrementing `index` based on add order.

2. **Listener attachment.** `addSlotListener()` is called. This sends a full `refreshContainer()` to the listener with every slot's current contents, then calls `broadcastChanges()` to catch anything that changed between construction and listener attachment.

3. **Ticking.** Every game tick, `broadcastChanges()` runs. It compares each slot's current contents against `lastSlots`. If anything is different, it notifies all `ContainerListener`s via `slotChanged()`. Subclasses like `FurnaceMenu` also send extra integer data (burn time, progress) via `setContainerData()`.

4. **Player interaction.** When the player clicks, the `clicked()` method runs. It handles pickup, place, swap, and clone. For shift-click, it calls your `quickMoveStack()` override. For button clicks (like selecting an enchantment), it calls `clickMenuButton()`.

5. **Slot changes.** When items in the backing container change (like from crafting or furnace output), `slotsChanged()` fires. This is where menus like `CraftingMenu` check for recipe matches.

6. **Validity checking.** Each tick, `stillValid()` is checked. If the player walks too far away or the block gets destroyed, the menu closes.

7. **Closing.** `removed()` is called. This drops any carried item and any items left in temporary slots (like crafting grids) back to the player. Container-backed menus also call `stopOpen()` on their container.

### Key methods in detail

**`addSlot()`** registers a slot in the menu. Each slot gets its `index` set to the current size of the slots vector, so the first slot added is index 0, second is index 1, and so on.

**`clicked()`** is the big one. It handles all the pickup, place, swap, and clone logic. You usually don't need to override this. The full list of click types:

| Click type | Constant | What it does |
|---|---|---|
| Pickup | `CLICK_PICKUP` | Left-click picks up a full stack, right-click picks up half. Place items into slots. Swap items if types don't match. |
| Quick move | `CLICK_QUICK_MOVE` | Shift-click. Calls your `quickMoveStack()` override. |
| Swap | `CLICK_SWAP` | Hotbar number keys (1-9). Swaps the hovered slot with a hotbar slot. |
| Clone | `CLICK_CLONE` | Middle-click in creative mode. Copies a full stack to the cursor. |

The above four are the only click types in LCEMP. MinecraftConsoles adds more (throw, quick craft, pickup all) but those aren't in the LCEMP codebase.

Clicking outside the menu window (`SLOT_CLICKED_OUTSIDE = -999`) drops the carried item into the world. Left-click drops the whole stack, right-click drops one.

**`quickMoveStack()`** handles shift-click. You almost always need to override this because the base version just returns the slot's item without moving anything. More on this below.

**`stillValid()`** is pure virtual. You must implement it. Return `false` if the player walked too far away or the block was destroyed.

**`moveItemStackTo()`** is your helper for shift-click. It tries to move an item stack into a range of slots. It does two passes: first it tries stacking into existing matching slots, then it fills empty ones. The `backwards` parameter controls direction. Returns `true` if anything moved.

**`broadcastChanges()`** compares current slot contents against `lastSlots` and notifies all `ContainerListener`s about changes. It also sets a `m_bNeedsRendered` flag that the UI layer reads.

**`needsRendered()`** resets `m_bNeedsRendered` to false and also does its own change-detection pass against `lastSlots`. Because of that second check, it can return `true` even if the flag was false. The UI layer calls this to decide whether it needs to redraw.

**`removed()`** is called when the player closes the menu. The base implementation drops any item the player is carrying on the cursor.

**`clickMenuButton()`** handles non-slot button clicks. Used by the enchanting table (to select which enchantment) and the merchant (to select a trade). Base version returns `false`.

**`setData()`** base implementation is a no-op. Subclasses (like FurnaceMenu, EnchantmentMenu) override this to track furnace burn progress, enchantment costs, etc.

**`mayCombine()`** is a 4J addition. It lets the inventory menu detect when a right-click should combine items (like dyeing leather armor or repairing damaged tools) instead of doing a normal placement. Base returns `false`; `InventoryMenu` delegates to `Slot::mayCombine()`.

**`isValidIngredient()`** (MinecraftConsoles only, not in LCEMP) lets the fireworks menu dim items in the inventory that can't be used as ingredients.

**`canTakeItemForPickAll()`** (MinecraftConsoles only, not in LCEMP) controls which slots participate in double-click pickup-all.

**`loopClick()`** is a 4J fix for an infinite recursion bug in creative mode. When shift-clicking moves items and more remain, it calls `clicked()` with `CLICK_QUICK_MOVE` as the click type to keep moving items until the recipe runs out or the inventory is full.

## How Slot works

The `Slot` class (`Minecraft.World/Slot.h`) represents one square in the container grid:

```cpp
class Slot
{
private:
    int slot;              // index into the backing container

public:
    shared_ptr<Container> container;  // the backing inventory
    int index;                         // position in the menu's slot list
    int x, y;                          // pixel position for rendering

    Slot(shared_ptr<Container> container, int slot, int x, int y);

    virtual bool mayPlace(shared_ptr<ItemInstance> item);   // can this item go here?
    virtual bool mayPickup(shared_ptr<Player> player);      // can the player take from here?
    virtual shared_ptr<ItemInstance> getItem();
    virtual bool hasItem();
    virtual void set(shared_ptr<ItemInstance> item);
    virtual shared_ptr<ItemInstance> remove(int count);
    virtual int getMaxStackSize();                     // usually 64
    virtual void setChanged();
    virtual void onTake(shared_ptr<Player> player, shared_ptr<ItemInstance> carried);
    virtual Icon *getNoItemIcon();
    virtual bool isAt(shared_ptr<Container> c, int s);
    // Note: isActive() only exists in MinecraftConsoles, not the LCEMP Slot base class.

    void onQuickCraft(shared_ptr<ItemInstance> picked, shared_ptr<ItemInstance> original);
    void swap(Slot *other);

    // 4J additions for combining items (dye armor, repair)
    virtual bool mayCombine(shared_ptr<ItemInstance> item);
    virtual shared_ptr<ItemInstance> combine(shared_ptr<ItemInstance> item);
};
```

The `x` and `y` values are pixel coordinates for where the slot renders on screen. The standard spacing is 18 pixels between slots (16px item icon + 2px gap).

The private `slot` field is the index into the backing `Container`, while the public `index` field is the position in the menu's slot list. These are different! A single menu can have slots from multiple containers (like player inventory + chest), and the `slot` field tells the `Container` which of its items this slot maps to.

### How `getItem()`, `set()`, and `remove()` work

All three delegate to the backing container:

- `getItem()` calls `container->getItem(slot)` to read the item
- `set()` calls `container->setItem(slot, item)` then `setChanged()`
- `remove()` calls `container->removeItem(slot, count)` which splits the stack

This means the `Slot` itself doesn't store items. It's just a view into a `Container`.

### The `mayCombine()` and `combine()` system

This is a 4J addition for console editions. It lets you right-click a dye onto leather armor in an inventory slot to color it, or right-click two damaged tools together to repair them. The base `Slot` class checks:

1. Is the first item dyeable armor and the second item a dye? Allow combining.
2. Are both items the same depleting item type, both have a stack size of 1, at least one is damaged, and neither is enchanted? Allow repair combining.

The `combine()` method creates a temporary 2x2 `CraftingContainer`, puts both items in, and runs it through the recipe system to get the result.

### The `swap()` method

Slot-to-slot swaps respect `getMaxStackSize()`. If the item being swapped is bigger than the target slot's max stack size, it splits it. This prevents you from accidentally stuffing 64 items into a slot that only holds 1.

### The `getNoItemIcon()` method

Returns an icon to show when the slot is empty. Only `ArmorSlot` uses this, showing the ghost armor piece outline for each body slot. Other slots return `nullptr`.

### The `isActive()` method (MinecraftConsoles only)

This method only exists in MinecraftConsoles, not in LCEMP's Slot base class. In MinecraftConsoles, it controls whether the slot should even be rendered. `HorseArmorSlot` uses this to hide the armor slot when the horse can't wear armor (like donkeys).

## Slot subclasses in detail

Here's every `Slot` subclass in the codebase and exactly what each one does:

### ResultSlot

Used by: `CraftingMenu`, `InventoryMenu`, `FireworksMenu`

The output slot for crafting grids. Has three important behaviors:

1. **`mayPlace()` returns `false`.** You can't put items into the output slot.
2. **`onTake()` consumes ingredients.** When you take the crafted item, it loops through all slots in the crafting container and removes one item from each. If an ingredient has a crafting remaining item (like a bucket after using milk), it either places it back in the slot, adds it to the player's inventory, or drops it.
3. **`checkTakeAchievements()`** awards achievements for crafting specific items like workbenches, pickaxes, furnaces, bread, cake, swords, bookshelves, and dispensers.

The `removeCount` field tracks how many items were taken (including via shift-click batches) so the achievement/stat system gets the right count.

### FurnaceResultSlot

Used by: `FurnaceMenu`

Similar to `ResultSlot` but for furnace output:

1. **`mayPlace()` returns `false`.** Can't put items into the result.
2. **`onTake()` spawns XP orbs.** When you take smelted items, it calculates XP based on the recipe value and spawns `ExperienceOrb` entities on top of the player.
3. **`checkTakeAchievements()`** awards stats for smelting iron and cooking fish. On Xbox One, it tracks all smelted items.

The XP calculation handles fractional values. If a recipe gives 0.7 XP per item and you take 3, it calculates `floor(3 * 0.7) = 2` XP, with a random chance of giving 1 more based on the remainder.

### ArmorSlot

Used by: `InventoryMenu`

Restricts what can be placed in each armor slot:

1. **`mayPlace()` checks the armor type.** It uses `dynamic_cast<ArmorItem *>` to check if the item is armor, then compares the armor's `slot` field against this slot's `slotNum` (0=helmet, 1=chest, 2=legs, 3=boots).
2. **Special cases:** Pumpkins and skulls are allowed in the helmet slot (slotNum 0) even though they aren't `ArmorItem`.
3. **`getMaxStackSize()` returns 1.** You can only wear one piece per slot.
4. **`getNoItemIcon()`** returns a ghost icon showing which armor piece goes in this slot.

### RepairResultSlot

Used by: `RepairMenu` / `AnvilMenu`

The anvil's output slot. More complex than `ResultSlot`:

1. **`mayPlace()` returns `false`.** Can't place items in the output.
2. **`mayPickup()` checks the player's XP level.** Returns `false` if the player can't afford the repair cost (unless they're in creative mode). Also requires the slot to actually have an item and the cost to be > 0.
3. **`onTake()` does a lot:**
   - Deducts XP levels from the player
   - Clears the input slot
   - Partially consumes the addition slot (for material repairs, only uses as many items as needed)
   - Has a 12% chance of damaging the anvil (increasing its damage stage or destroying it)
   - Plays anvil sound effects

### MerchantResultSlot

Used by: `MerchantMenu`

The villager trade output slot:

1. **`mayPlace()` returns `false`.** Can't place items in the trade output.
2. **`onTake()` processes the trade.** It removes the correct payment items from the two input slots and tells the merchant to complete the trade (updating the trade count and potentially locking the offer).
3. **`checkTakeAchievements()`** awards the trading stat.

### PotionSlot (nested in BrewingStandMenu)

Used by: `BrewingStandMenu`

Restricts potion slots:

1. **`mayPlace()` only allows potions and glass bottles.** Checks `item->id == Item::potion_Id || item->id == Item::glassBottle_Id`.
2. **`getMaxStackSize()` returns 1.** One bottle per slot.
3. **`onTake()` awards the potion achievement** when you take a potion with a non-zero aux value.
4. **`mayCombine()` returns `false`.** No dye/repair combining in potion slots.

### IngredientsSlot (nested in BrewingStandMenu)

Used by: `BrewingStandMenu`

Restricts the ingredient slot:

1. **`mayPlace()` checks brewing formulas.** Only accepts items that have a potion brewing formula. When simplified brewing is off, also accepts nether wart and water buckets.
2. **`getMaxStackSize()` returns 64.** Ingredients stack normally.
3. **`mayCombine()` returns `false`.** No combining.

### PaymentSlot (nested in BeaconMenu)

Used by: `BeaconMenu`

Restricts what you can feed a beacon:

1. **`mayPlace()` only accepts emerald, diamond, gold ingot, or iron ingot.**
2. **`getMaxStackSize()` returns 1.** One payment at a time.

### EnchantmentSlot

Used by: `EnchantmentMenu`

A simple slot that accepts any item (`mayPlace()` returns `true`). It exists as a separate class mainly to override `mayCombine()` to return `false`, preventing dye/repair behavior in the enchanting slot.

### HorseSaddleSlot

Used by: `HorseInventoryMenu`

1. **`mayPlace()` only accepts saddles.** Checks `item->id == Item::saddle_Id`. Also rejects placement if a saddle is already equipped (`!hasItem()`).

### HorseArmorSlot

Used by: `HorseInventoryMenu`

1. **`mayPlace()` checks if the horse can wear armor** (`horse->canWearArmor()`) and if the item is valid horse armor (`EntityHorse::isHorseArmor()`).
2. **`isActive()` returns `false`** for horses that can't wear armor (donkeys, mules). This hides the slot in the UI entirely.

## Existing container types in detail

Here's every menu class in the codebase. For each one, I'll show the slot layout, how it builds the menu, and any special behavior.

### InventoryMenu (player inventory)

**Slot layout:** result (0) + 4 craft (1-4) + 4 armor (5-8) + 27 inventory (9-35) + 9 hotbar (36-44)

```cpp
InventoryMenu::InventoryMenu(shared_ptr<Inventory> inventory, bool active, Player *player)
{
    craftSlots = std::make_shared<CraftingContainer>(this, 2, 2);
    resultSlots = std::make_shared<ResultContainer>();

    addSlot(new ResultSlot(inventory->player, craftSlots, resultSlots, 0, 144, 36));

    // 2x2 crafting grid
    for (int y = 0; y < 2; y++)
        for (int x = 0; x < 2; x++)
            addSlot(new Slot(craftSlots, x + y * 2, 88 + x * 18, 26 + y * 18));

    // 4 armor slots (helmet at top, boots at bottom)
    for (int i = 0; i < 4; i++)
        addSlot(new ArmorSlot(i, inventory, inventory->getContainerSize() - 1 - i, 8, 8 + i * 18));

    // standard inventory + hotbar
    // ... (same as every other menu)
}
```

**Special behaviors:**
- `stillValid()` always returns `true` (you can always access your own inventory).
- `slotsChanged()` runs the recipe system against the 2x2 crafting grid.
- `removed()` drops items from the 2x2 grid and clears the result.
- `mayCombine()` delegates to `Slot::mayCombine()`, which enables dye armor and repair combining.
- `quickMoveStack()` has smart armor equipping. If you shift-click armor from your inventory, it goes to the correct armor slot instead of the hotbar. This checks `ArmorRecipes::GetArmorType()` for each piece type.
- The clicked override checks for the "Iron Man" achievement (wearing a full set of iron armor).

### CraftingMenu (crafting table)

**Slot layout:** result (0) + 9 craft (1-9) + 27 inventory (10-36) + 9 hotbar (37-45)

```cpp
CraftingMenu::CraftingMenu(shared_ptr<Inventory> inventory, Level *level, int xt, int yt, int zt)
{
    craftSlots = std::make_shared<CraftingContainer>(this, 3, 3);
    resultSlots = std::make_shared<ResultContainer>();

    addSlot(new ResultSlot(inventory->player, craftSlots, resultSlots, 0, 120 + 4, 31 + 4));

    // 3x3 crafting grid
    for (int y = 0; y < 3; y++)
        for (int x = 0; x < 3; x++)
            addSlot(new Slot(craftSlots, x + y * 3, 30 + x * 18, 17 + y * 18));

    // standard inventory + hotbar
}
```

**Special behaviors:**
- `slotsChanged()` calls `Recipes::getInstance()->getItemFor(craftSlots, level)` to check if the current grid makes anything.
- `removed()` drops all 9 crafting slots back to the player.
- `stillValid()` checks the block is still a workbench and the player is within 8 blocks.
- `canTakeItemForPickAll()` excludes the result container from double-click collection.
- Shift-clicking the result sends items to inventory+hotbar with `backwards = true` (fills from hotbar up).

### ContainerMenu (chest / ender chest)

**Slot layout:** N*9 container slots + 27 inventory + 9 hotbar (N = number of rows in the chest)

```cpp
ContainerMenu::ContainerMenu(shared_ptr<Container> inventory, shared_ptr<Container> container)
{
    containerRows = container->getContainerSize() / 9;
    container->startOpen();

    int yo = (containerRows - 4) * 18;

    // container slots
    for (int y = 0; y < containerRows; y++)
        for (int x = 0; x < 9; x++)
            addSlot(new Slot(container, x + y * 9, 8 + x * 18, 18 + y * 18));

    // player inventory (position adjusted by yo offset)
    for (int y = 0; y < 3; y++)
        for (int x = 0; x < 9; x++)
            addSlot(new Slot(inventory, x + y * 9 + 9, 8 + x * 18, 103 + y * 18 + yo));

    // hotbar
    for (int x = 0; x < 9; x++)
        addSlot(new Slot(inventory, x, 8 + x * 18, 161 + yo));
}
```

**Special behaviors:**
- Dynamic row count. The number of rows adapts to the container size. Single chests have 3 rows, double chests have 6.
- `startOpen()` is called on construction, `stopOpen()` on removal. This lets chests animate their lids and play sounds.
- `stillValid()` delegates to the container (which checks distance).
- Simple shift-click: container slots go to player inventory, player slots go to container.
- The `clicked()` override checks for the "Chestful o' Cobblestone" achievement on Xbox (1728 cobblestone in one chest).

### FurnaceMenu

**Slot layout:** ingredient (0) + fuel (1) + result (2) + 27 inventory (3-29) + 9 hotbar (30-38)

```cpp
FurnaceMenu::FurnaceMenu(shared_ptr<Inventory> inventory, shared_ptr<FurnaceTileEntity> furnace)
{
    addSlot(new Slot(furnace, 0, 52 + 4, 13 + 4));         // ingredient
    addSlot(new Slot(furnace, 1, 52 + 4, 49 + 4));         // fuel
    addSlot(new FurnaceResultSlot(player, furnace, 2, 112 + 4, 31 + 4));  // result

    // standard inventory + hotbar
}
```

**Special behaviors:**
- **Data sync.** The furnace syncs three integer values: `tickCount` (smelt progress), `litTime` (remaining burn ticks), and `litDuration` (total burn time of current fuel). These drive the fire icon and progress arrow on the UI.
- **Smart shift-click.** When shift-clicking from the player inventory, it checks:
  - Is the item smeltable? (`FurnaceRecipes::getInstance()->getResult()`) Send to ingredient slot.
  - Is it fuel? (`FurnaceTileEntity::isFuel()`) Send to fuel slot.
  - Otherwise, just move between inventory and hotbar.
- **Achievement tracking.** The `clicked()` override tracks charcoal-to-charcoal smelting for the "Renewable Energy" achievement.

### EnchantmentMenu

**Slot layout:** ingredient (0) + 27 inventory (1-27) + 9 hotbar (28-36)

```cpp
EnchantmentMenu::EnchantmentMenu(shared_ptr<Inventory> inventory, Level *level, int xt, int yt, int zt)
{
    enchantSlots = std::make_shared<EnchantmentContainer>(this);
    addSlot(new EnchantmentSlot(enchantSlots, 0, 21 + 4, 43 + 4));

    // standard inventory + hotbar
}
```

**Special behaviors:**
- **Data sync.** Syncs three cost values (one per enchantment option). Uses a `m_costsChanged` flag to avoid sending packets when nothing changed.
- **`slotsChanged()` calculates enchantment costs.** It counts nearby bookshelves (in a specific pattern, up to 2 blocks away with air between), then generates three enchantment options with costs based on bookshelf count.
- **`clickMenuButton()` handles enchanting.** When the player selects an enchantment option:
  1. Checks the player has enough XP levels
  2. Generates the actual enchantment list using `EnchantmentHelper::selectEnchantment()`
  3. Deducts XP
  4. For books, picks one random enchantment. For items, applies all of them.
  5. Calls `slotsChanged()` to refresh the options
- **Smart shift-click.** Enchantable items go to the ingredient slot.

### BrewingStandMenu

**Slot layout:** 3 bottles (0-2) + ingredient (3) + 27 inventory (4-30) + 9 hotbar (31-39)

```cpp
BrewingStandMenu::BrewingStandMenu(shared_ptr<Inventory> inventory,
                                     shared_ptr<BrewingStandTileEntity> brewingStand)
{
    addSlot(new PotionSlot(player, brewingStand, 0, 56, 46));
    addSlot(new PotionSlot(player, brewingStand, 1, 79, 53));
    addSlot(new PotionSlot(player, brewingStand, 2, 102, 46));
    ingredientSlot = addSlot(new IngredientsSlot(brewingStand, 3, 79, 17));

    // standard inventory + hotbar
}
```

**Special behaviors:**
- **Data sync.** Syncs one value: brew time remaining.
- **Custom slot types.** `PotionSlot` limits to bottles (stack size 1), `IngredientsSlot` limits to valid brewing ingredients.
- **Smart shift-click with multiple checks.** Shift-clicking from inventory checks:
  - Is it a brewing ingredient and the ingredient slot is empty/matching? Send to ingredient slot.
  - Is it a potion and there's an empty bottle slot? Send to a bottle slot.
  - Otherwise, move between inventory and hotbar.

### RepairMenu / AnvilMenu

**Slot layout:** input (0) + addition (1) + result (2) + 27 inventory (3-29) + 9 hotbar (30-38)

Note: In the LCEMP project this class is called `RepairMenu`, in MinecraftConsoles it's called `AnvilMenu`. Same thing.

```cpp
RepairMenu::RepairMenu(shared_ptr<Inventory> inventory, Level *level,
                         int xt, int yt, int zt, shared_ptr<Player> player)
{
    resultSlots = std::make_shared<ResultContainer>();
    repairSlots = std::make_shared<RepairContainer>(this, IDS_REPAIR_AND_NAME, 2);

    addSlot(new Slot(repairSlots, INPUT_SLOT, 27, 43 + 4));
    addSlot(new Slot(repairSlots, ADDITIONAL_SLOT, 76, 43 + 4));
    addSlot(new RepairResultSlot(this, xt, yt, zt, resultSlots, RESULT_SLOT, 134, 43 + 4));

    // standard inventory + hotbar
}
```

**Special behaviors:**
- **`createResult()` is the most complex method in the entire container system.** It handles:
  - Material repair (using raw materials to fix durability)
  - Item combining (two damaged items of the same type merge durability with 12% bonus)
  - Enchantment merging (combining enchantments from two items, resolving conflicts)
  - Enchanted book application
  - Item renaming
  - Cost calculation with tax (based on existing enchantments and prior repairs)
  - The 39-level cap (40+ levels rejected unless in creative)
  - Enchantment frequency pricing (common=1, uncommon=2, rare=4, very rare=8)
- **Data sync.** Syncs one value: total XP cost.
- **`setItemName()`** lets the player type a custom name.
- **`slotsChanged()` takes a `Container` parameter** (unlike most other menus) to know which side changed, then calls `createResult()`.
- **`RepairResultSlot::onTake()`** handles anvil damage (12% chance to increase damage stage or break).

### MerchantMenu (villager trading)

**Slot layout:** payment1 (0) + payment2 (1) + result (2) + 27 inventory (3-29) + 9 hotbar (30-38)

```cpp
MerchantMenu::MerchantMenu(shared_ptr<Inventory> inventory, shared_ptr<Merchant> merchant, Level *level)
{
    tradeContainer = std::make_shared<MerchantContainer>(player, merchant);
    addSlot(new Slot(tradeContainer, PAYMENT1_SLOT, 36, 53));
    addSlot(new Slot(tradeContainer, PAYMENT2_SLOT, 62, 53));
    addSlot(new MerchantResultSlot(player, merchant, tradeContainer, RESULT_SLOT, 120, 53));

    // standard inventory + hotbar
}
```

**Special behaviors:**
- **`slotsChanged()` calls `tradeContainer->updateSellItem()`** which checks if the current payment items match any available trade.
- **`setSelectionHint()`** is called when the player selects a different trade offer in the list.
- **`stillValid()` checks `trader->getTradingPlayer() == player`**. The menu stays open as long as the villager is still trading with this player.
- **`removed()` drops payment items** and calls `trader->setTradingPlayer(nullptr)`.

### TrapMenu (dispenser / dropper)

**Slot layout:** 9 dispenser slots (0-8) + 27 inventory (9-35) + 9 hotbar (36-44)

```cpp
TrapMenu::TrapMenu(shared_ptr<Container> inventory, shared_ptr<DispenserTileEntity> trap)
{
    // 3x3 grid of dispenser slots
    for (int y = 0; y < 3; y++)
        for (int x = 0; x < 3; x++)
            addSlot(new Slot(trap, x + y * 3, 62 + x * 18, 17 + y * 18));

    // standard inventory + hotbar
}
```

**Special behaviors:**
- The simplest menu. No custom slots, no data sync, no special shift-click logic.
- Uses the same 3x3 layout as a crafting table, but the slots are plain `Slot` objects so anything can go in them.
- `stillValid()` delegates to the tile entity.

### HopperMenu

**Slot layout:** 5 hopper slots (0-4) + 27 inventory (5-31) + 9 hotbar (32-40)

```cpp
HopperMenu::HopperMenu(shared_ptr<Container> inventory, shared_ptr<Container> hopper)
{
    hopper->startOpen();

    // 5 slots in a single row
    for (int x = 0; x < hopper->getContainerSize(); x++)
        addSlot(new Slot(hopper, x, 44 + x * 18, 20));

    // inventory at y offset of 51
    // standard inventory + hotbar
}
```

**Special behaviors:**
- 5-wide single row layout instead of the usual 9-wide grid.
- `startOpen()` / `stopOpen()` like chests.
- Simple two-way shift-click: hopper to player, player to hopper.

### BeaconMenu

**Slot layout:** payment (0) + 27 inventory (1-27) + 9 hotbar (28-36)

```cpp
BeaconMenu::BeaconMenu(shared_ptr<Container> inventory, shared_ptr<BeaconTileEntity> beacon)
{
    addSlot(paymentSlot = new BeaconMenu::PaymentSlot(beacon, PAYMENT_SLOT, 136, 110));

    // inventory at unusual offset (xo=36, yo=137)
    // standard inventory + hotbar
}
```

**Special behaviors:**
- **Data sync.** Syncs three values: pyramid levels, primary power, and secondary power.
- **`PaymentSlot`** only accepts emerald, diamond, gold ingot, or iron ingot. Stack size of 1.
- **Smart shift-click.** Shift-clicking a valid payment item sends it to the payment slot, but only if the slot is empty and the item count is 1.
- The inventory position is at an unusual offset (x=36, y=137) because the beacon UI is much taller than usual.

### HorseInventoryMenu

**Slot layout:** saddle (0) + armor (1) + [0-15 chest slots if horse is chested] + 27 inventory + 9 hotbar

```cpp
HorseInventoryMenu::HorseInventoryMenu(shared_ptr<Container> playerInventory,
                                         shared_ptr<Container> horseInventory,
                                         shared_ptr<EntityHorse> horse)
{
    addSlot(new HorseSaddleSlot(horseInventory));
    addSlot(new HorseArmorSlot(this, horseInventory));

    if (horse->isChestedHorse())
    {
        for (int y = 0; y < 3; y++)
            for (int x = 0; x < 5; x++)
                addSlot(new Slot(horseInventory, INV_BASE_COUNT + x + y * 5,
                                 80 + x * 18, 18 + y * 18));
    }

    // standard inventory + hotbar
}
```

**Special behaviors:**
- **Dynamic slot count.** Chested horses (donkeys/mules with a chest) get a 5x3 grid of inventory slots. Non-chested horses only have saddle and armor.
- **`HorseSaddleSlot`** only accepts saddles and rejects placement when already equipped.
- **`HorseArmorSlot`** checks `horse->canWearArmor()` and `EntityHorse::isHorseArmor()`. Returns `isActive() = false` for non-armor horses, hiding the slot.
- **`stillValid()`** requires the horse to be alive and within 8 blocks.
- **Smart shift-click.** From player inventory: tries armor first, then saddle, then chest slots.

### FireworksMenu

**Slot layout:** result (0) + 9 craft (1-9) + 27 inventory (10-36) + 9 hotbar (37-45)

Same layout as `CraftingMenu`, but specialized for fireworks crafting.

```cpp
FireworksMenu::FireworksMenu(shared_ptr<Inventory> inventory, Level *level, int xt, int yt, int zt)
{
    craftSlots = std::make_shared<CraftingContainer>(this, 3, 3);
    resultSlots = std::make_shared<ResultContainer>();

    addSlot(new ResultSlot(inventory->player, craftSlots, resultSlots, 0, 120 + 4, 31 + 4));

    // 3x3 grid
    // standard inventory + hotbar
}
```

**Special behaviors:**
- **`slotsChanged()` uses specialized fireworks recipe logic.** It calls `FireworksRecipe::updatePossibleRecipes()` to figure out what can be made, then `Recipes::getInstance()->getItemFor()` with `Recipes::pFireworksRecipes` instead of the normal recipe list.
- **`isValidIngredient()`** is overridden. It dims items in the player inventory that aren't valid fireworks ingredients based on what's currently craftable. This is checked by the UI layer when rendering slots.
- **`stillValid()` returns `true`** since fireworks crafting doesn't require a specific block.
- **Smart shift-click.** Valid ingredients get moved to the crafting grid before falling back to hotbar/inventory swaps.

## Slot layout conventions

Every menu follows the same pattern for the player's inventory at the bottom:

```cpp
// Main inventory (3 rows of 9, slot indices 9-35 in the player inventory)
for (int y = 0; y < 3; y++)
{
    for (int x = 0; x < 9; x++)
    {
        addSlot(new Slot(inventory, x + y * 9 + 9, 8 + x * 18, 84 + y * 18));
    }
}

// Hotbar (slot indices 0-8 in the player inventory)
for (int x = 0; x < 9; x++)
{
    addSlot(new Slot(inventory, x, 8 + x * 18, 142));
}
```

The `8 + x * 18` puts slots 8 pixels from the left edge, each one 18 pixels apart. The Y values change depending on how tall your menu is.

The slot constants follow a naming convention to keep shift-click logic readable:

```cpp
static const int RESULT_SLOT = 0;
static const int CRAFT_SLOT_START = 1;
static const int CRAFT_SLOT_END = CRAFT_SLOT_START + 9;   // exclusive
static const int INV_SLOT_START = CRAFT_SLOT_END;
static const int INV_SLOT_END = INV_SLOT_START + 27;
static const int USE_ROW_SLOT_START = INV_SLOT_END;
static const int USE_ROW_SLOT_END = USE_ROW_SLOT_START + 9;
```

These constants make `quickMoveStack()` much easier to write.

## Shift-click behavior (quickMoveStack) deep dive

Shift-clicking is the most annoying part of writing a container menu. You need to tell the game where items go when shift-clicked from each zone.

The base `AbstractContainerMenu::quickMoveStack()` does basically nothing useful. It just returns the item in the slot without moving it. You need to override it. The pattern is always the same:

1. Get the slot that was shift-clicked
2. Copy the item (to return later)
3. Figure out where the item should go based on which slot zone it came from
4. Call `moveItemStackTo()` to try putting it there
5. If the stack is now empty, clear the slot. Otherwise mark it changed.

Here's how the crafting table does it:

```cpp
shared_ptr<ItemInstance> CraftingMenu::quickMoveStack(shared_ptr<Player> player,
                                                       int slotIndex)
{
    shared_ptr<ItemInstance> clicked = nullptr;
    Slot *slot = slots.at(slotIndex);

    if (slot != nullptr && slot->hasItem())
    {
        shared_ptr<ItemInstance> stack = slot->getItem();
        clicked = stack->copy();

        if (slotIndex == RESULT_SLOT)
        {
            // Result goes to inventory + hotbar
            if (!moveItemStackTo(stack, INV_SLOT_START, USE_ROW_SLOT_END, true))
                return nullptr;
            slot->onQuickCraft(stack, clicked);
        }
        else if (slotIndex >= INV_SLOT_START && slotIndex < INV_SLOT_END)
        {
            // Main inventory goes to hotbar
            if (!moveItemStackTo(stack, USE_ROW_SLOT_START, USE_ROW_SLOT_END, false))
                return nullptr;
        }
        else if (slotIndex >= USE_ROW_SLOT_START && slotIndex < USE_ROW_SLOT_END)
        {
            // Hotbar goes to main inventory
            if (!moveItemStackTo(stack, INV_SLOT_START, INV_SLOT_END, false))
                return nullptr;
        }
        else
        {
            // Craft slots go to inventory + hotbar
            if (!moveItemStackTo(stack, INV_SLOT_START, USE_ROW_SLOT_END, false))
                return nullptr;
        }

        if (stack->count == 0)
            slot->set(nullptr);
        else
            slot->setChanged();

        if (stack->count == clicked->count)
            return nullptr;  // nothing actually moved
        else
            slot->onTake(player, stack);
    }
    return clicked;
}
```

### How moveItemStackTo() works internally

This is the function that does the actual item movement. Here's the full algorithm:

```cpp
bool AbstractContainerMenu::moveItemStackTo(shared_ptr<ItemInstance> itemStack,
                                              int startSlot, int endSlot, bool backwards)
{
    bool anythingChanged = false;
    int destSlot = backwards ? endSlot - 1 : startSlot;

    // Pass 1: try stacking into existing matching slots
    if (itemStack->isStackable())
    {
        while (itemStack->count > 0 && ((!backwards && destSlot < endSlot) ||
                                          (backwards && destSlot >= startSlot)))
        {
            Slot *slot = slots.at(destSlot);
            shared_ptr<ItemInstance> target = slot->getItem();

            if (target != nullptr && target->id == itemStack->id &&
                (!itemStack->isStackedByData() ||
                 itemStack->getAuxValue() == target->getAuxValue()) &&
                ItemInstance::tagMatches(itemStack, target))
            {
                int totalStack = target->count + itemStack->count;
                if (totalStack <= itemStack->getMaxStackSize())
                {
                    itemStack->count = 0;
                    target->count = totalStack;
                    slot->setChanged();
                    anythingChanged = true;
                }
                else if (target->count < itemStack->getMaxStackSize())
                {
                    itemStack->count -= (itemStack->getMaxStackSize() - target->count);
                    target->count = itemStack->getMaxStackSize();
                    slot->setChanged();
                    anythingChanged = true;
                }
            }
            destSlot += backwards ? -1 : 1;
        }
    }

    // Pass 2: try placing in empty slots
    if (itemStack->count > 0)
    {
        destSlot = backwards ? endSlot - 1 : startSlot;
        while ((!backwards && destSlot < endSlot) || (backwards && destSlot >= startSlot))
        {
            Slot *slot = slots.at(destSlot);
            if (slot->getItem() == nullptr)
            {
                slot->set(itemStack->copy());
                slot->setChanged();
                itemStack->count = 0;
                anythingChanged = true;
                break;
            }
            destSlot += backwards ? -1 : 1;
        }
    }
    return anythingChanged;
}
```

Key things to know:
- **Two passes.** Stack first, then fill empties. This means shift-clicking 32 cobblestone into a chest that already has a stack of 48 will fill that stack to 64 first, then put the remaining 16 in a new slot.
- **The `backwards` flag** controls iteration direction. Result slots typically use `backwards = true` to fill from hotbar upward.
- **Matching is strict.** Items must match on ID, aux value (if data-stacked), and NBT tags.
- **Important:** `moveItemStackTo` does NOT check `mayPlace()`. It'll put items into any empty slot in the range. If you need to restrict where items go, use a narrow slot range (like `FUEL_SLOT, FUEL_SLOT + 1`).

### The loopClick recursion system

When you shift-click a result slot in a crafting table, the game tries to craft as many as possible. Here's how:

1. `clicked()` calls `quickMoveStack()` for the result slot
2. `quickMoveStack()` moves the result to the inventory
3. `clicked()` checks: does the slot still have an item with the same ID? (It will if the recipe can be crafted again)
4. If yes, it calls `loopClick()` which calls `clicked()` again with `CLICK_QUICK_MOVE` as the click type
5. This loop continues until the recipe can't be crafted anymore or the inventory is full

This was a 4J fix for an infinite recursion bug in creative mode. There is no special `looped` parameter.

## Syncing container state over the network

The container system uses `ContainerListener` to keep clients in sync. There are actually two `ContainerListener` interfaces in the codebase (in different namespaces), but the one for container menus is:

```cpp
namespace net_minecraft_world_inventory
{
    class ContainerListener
    {
    public:
        virtual void refreshContainer(AbstractContainerMenu *container,
                                       vector<shared_ptr<ItemInstance>> *items) = 0;
        virtual void slotChanged(AbstractContainerMenu *container, int slotIndex,
                                  shared_ptr<ItemInstance> item) = 0;
        virtual void setContainerData(AbstractContainerMenu *container,
                                       int id, int value) = 0;
    };
}
```

There are three things that get synced:

1. **Full refresh** via `refreshContainer()`. Happens when a listener first connects (when the menu opens). Sends every slot's contents.
2. **Slot changes** via `slotChanged()`. Happens every time `broadcastChanges()` detects a slot differs from `lastSlots`.
3. **Data values** via `setContainerData()`. Used for things like furnace burn progress or anvil repair cost. Just integer key-value pairs.

### The network packets

Container interactions use these packets:

| Packet | ID | Direction | Purpose |
|---|---|---|---|
| `ContainerOpenPacket` | 100 | Server to Client | Opens a container menu on the client |
| `ContainerClickPacket` | 102 | Client to Server | Sends a slot click (with slot, button, click type, item, and a UID for transaction tracking) |
| `ContainerSetSlotPacket` | - | Server to Client | Updates a single slot's contents |
| `ContainerSetContentPacket` | - | Server to Client | Updates all slots at once (full refresh) |
| `ContainerSetDataPacket` | 105 | Server to Client | Sends an integer data value (like furnace progress) |
| `ContainerAckPacket` | - | Both | Transaction acknowledgment (for rollback if client/server disagree) |
| `ContainerClosePacket` | - | Both | Closes the menu |
| `ContainerButtonClickPacket` | - | Client to Server | For `clickMenuButton()` (enchanting, trading) |

The `ContainerOpenPacket` has a `type` field that tells the client what kind of UI to show:

```cpp
static const int CONTAINER = 0;      // Chest
static const int WORKBENCH = 1;      // Crafting table
static const int FURNACE = 2;        // Furnace
static const int TRAP = 3;           // Dispenser
static const int ENCHANTMENT = 4;    // Enchanting table
static const int BREWING_STAND = 5;  // Brewing stand
static const int TRADER_NPC = 6;     // Villager
static const int BEACON = 7;         // Beacon
static const int REPAIR_TABLE = 8;   // Anvil
static const int HOPPER = 9;         // Hopper
static const int DROPPER = 10;       // Dropper
static const int HORSE = 11;         // Horse inventory
static const int FIREWORKS = 12;     // Fireworks (4J added)
static const int BONUS_CHEST = 13;   // Bonus chest (4J added)
static const int LARGE_CHEST = 14;   // Large chest (4J added)
static const int ENDER_CHEST = 15;   // Ender chest (4J added)
static const int MINECART_CHEST = 16; // Minecart chest (4J added)
static const int MINECART_HOPPER = 17; // Minecart hopper (4J added)
```

### How data sync works in practice

The furnace menu is the best example. It tracks three values using integer IDs:

```cpp
// Data ID 0: tickCount (smelt progress, 0-200)
// Data ID 1: litTime (remaining fuel burn ticks, counts down)
// Data ID 2: litDuration (total burn time of current fuel)

void FurnaceMenu::addSlotListener(ContainerListener *listener)
{
    AbstractContainerMenu::addSlotListener(listener);
    // Send initial values when listener first connects
    listener->setContainerData(this, 0, furnace->tickCount);
    listener->setContainerData(this, 1, furnace->litTime);
    listener->setContainerData(this, 2, furnace->litDuration);
}

void FurnaceMenu::broadcastChanges()
{
    AbstractContainerMenu::broadcastChanges();  // handles slot changes

    for (auto& listener : containerListeners)
    {
        if (tc != furnace->tickCount)
            listener->setContainerData(this, 0, furnace->tickCount);
        if (lt != furnace->litTime)
            listener->setContainerData(this, 1, furnace->litTime);
        if (ld != furnace->litDuration)
            listener->setContainerData(this, 2, furnace->litDuration);
    }

    tc = furnace->tickCount;
    lt = furnace->litTime;
    ld = furnace->litDuration;
}

void FurnaceMenu::setData(int id, int value)
{
    if (id == 0) furnace->tickCount = value;
    if (id == 1) furnace->litTime = value;
    if (id == 2) furnace->litDuration = value;
}
```

The pattern is:
1. **`addSlotListener()`** sends initial values so a newly-connected client gets the current state.
2. **`broadcastChanges()`** checks each value against a cached copy. Only sends updates when something changed.
3. **`setData()`** receives values on the client side and writes them to the tile entity so the UI can read them.

The enchantment and beacon menus use the same pattern but with different data IDs:
- **EnchantmentMenu:** IDs 0-2 for the three enchantment cost options
- **BeaconMenu:** ID 0 = levels, ID 1 = primary power, ID 2 = secondary power
- **BrewingStandMenu:** ID 0 = brew time remaining
- **RepairMenu/AnvilMenu:** ID 0 = total repair cost

## The screen rendering side (AbstractContainerScreen)

`AbstractContainerScreen` lives in `Minecraft.Client/AbstractContainerScreen.h` and handles the PC-style rendering of container menus. On console editions, this is mostly stub code (wrapped in `#if 0` blocks), because 4J uses the SWF/Iggy UI system instead. But the architecture is still there and worth understanding.

### The base class

```cpp
class AbstractContainerScreen : public Screen
{
protected:
    int imageWidth;    // default 176
    int imageHeight;   // default 166

public:
    AbstractContainerMenu *menu;

    AbstractContainerScreen(AbstractContainerMenu *menu);

    virtual void init();
    virtual void render(int xm, int ym, float a);

protected:
    virtual void renderLabels();
    virtual void renderBg(float a) = 0;  // you must implement this

private:
    virtual void renderSlot(Slot *slot);
    virtual Slot *findSlot(int x, int y);
    virtual bool isHovering(Slot *slot, int xm, int ym);

protected:
    virtual void mouseClicked(int x, int y, int buttonNum);
    virtual void keyPressed(wchar_t eventCharacter, int eventKey);

public:
    virtual void removed();
    virtual void tick();
};
```

### How rendering works

The `render()` method does everything in a specific order:

1. Draw the darkened background (`renderBackground()`)
2. Call `renderBg()` which subclasses implement to draw their specific texture
3. Turn on lighting for 3D item rendering
4. Loop through all slots, calling `renderSlot()` for each
5. For hovered slots, draw a white semi-transparent overlay (`fillGradient` with `0x80ffffff`)
6. Draw the carried item (the item on the cursor) at the mouse position
7. Turn off lighting
8. Call `renderLabels()` for text like "Crafting" or "Inventory"
9. Draw tooltip for hovered slot if the cursor is empty

### Slot rendering

`renderSlot()` does two things:
1. If the slot is empty but has a `getNoItemIcon()` (like armor slots), draw the ghost icon
2. If the slot has an item, draw the item icon and stack count overlay

### Hover detection

`isHovering()` checks if the mouse (xm, ym) is within 1 pixel of the slot's bounds:

```cpp
return xm >= slot->x - 1 && xm < slot->x + 16 + 1 &&
       ym >= slot->y - 1 && ym < slot->y + 16 + 1;
```

This gives each 16x16 slot a 1-pixel padding for easier clicking.

### Tooltip rendering

When hovering over a slot with no carried item, the screen draws the item's name in a dark box:

```cpp
int width = font->width(elementName);
fillGradient(x - 3, y - 3, x + width + 3, y + 8 + 3, 0xc0000000, 0xc0000000);
font->drawShadow(elementName, x, y, 0xffffffff);
```

The tooltip appears 12 pixels to the right and 12 pixels above the cursor.

### Mouse click handling

`mouseClicked()` finds which slot was clicked, determines if it was outside the menu window, and calls `gameMode->handleInventoryMouseClick()` with the slot ID, button number, and whether shift was held. The game mode then creates a `ContainerClickPacket` and sends it to the server.

Pressing Escape or the inventory key closes the container.

### How specific screens customize rendering

Each screen subclass provides `renderBg()` and `renderLabels()`:

**FurnaceScreen** draws the furnace texture, then overlays two animated elements:
- A fire icon that fills from bottom to top based on `furnace->getLitProgress(12)` (burn progress out of 12 pixels)
- A progress arrow that fills from left to right based on `furnace->getBurnProgress(24)` (smelt progress out of 24 pixels)

Both use `blit()` to copy a region from the texture atlas at x=176 (to the right of the main texture).

**ContainerScreen** adjusts `imageHeight` based on the number of rows:
```cpp
int defaultHeight = 222;
int noRowHeight = defaultHeight - 6 * 18;
containerRows = container->getContainerSize() / 9;
imageHeight = noRowHeight + containerRows * 18;
```

And draws the texture in two pieces: the container rows, and the player inventory section below.

**CraftingScreen** just draws the crafting texture at full size. Nothing animated.

## The SWF/Iggy UI layer (console rendering)

On console editions, 4J replaced the OpenGL-based screen rendering with a Flash/SWF-based system powered by the Iggy library (from RAD Game Tools). This is a completely separate rendering path from `AbstractContainerScreen`.

### Architecture

The console UI has three layers:

1. **`IUIScene_AbstractContainerMenu`** - The platform-independent interface. Defines the section system, pointer movement, tooltip logic, and click handling. Contains the `ESceneSection` enum that maps UI regions to logical zones.

2. **`UIScene_AbstractContainerMenu`** (SWF/Iggy path) - The newer rendering backend used on PS3, PS4, Vita, and Windows. Uses Iggy SWF movies for layout and rendering. Controls like `UIControl_SlotList`, `UIControl_Cursor`, and `UIControl_Label` are mapped to named Flash elements.

3. **`CXuiSceneAbstractContainer`** (XUI path) - The older rendering backend for Xbox 360 and early Xbox One. Uses Microsoft's XUI framework with `CXuiCtrlSlotList` and `CXuiCtrlSlotItem` controls.

### The section system

Instead of pixel-based slot coordinates, the console UI divides every menu into logical "sections". Each menu type has its own section enum range:

```cpp
enum ESceneSection
{
    // Container (chest)
    eSectionContainerUsing = 0,      // hotbar
    eSectionContainerInventory,       // main inventory
    eSectionContainerChest,           // chest slots

    // Furnace
    eSectionFurnaceUsing,
    eSectionFurnaceInventory,
    eSectionFurnaceIngredient,
    eSectionFurnaceFuel,
    eSectionFurnaceResult,

    // Inventory
    eSectionInventoryUsing,
    eSectionInventoryInventory,
    eSectionInventoryArmor,

    // Enchanting
    eSectionEnchantUsing,
    eSectionEnchantInventory,
    eSectionEnchantSlot,
    eSectionEnchantButton1,          // enchant options are buttons, not slots
    eSectionEnchantButton2,
    eSectionEnchantButton3,

    // Brewing
    eSectionBrewingUsing,
    eSectionBrewingInventory,
    eSectionBrewingBottle1,
    eSectionBrewingBottle2,
    eSectionBrewingBottle3,
    eSectionBrewingIngredient,

    // Anvil
    eSectionAnvilUsing,
    eSectionAnvilInventory,
    eSectionAnvilItem1,
    eSectionAnvilItem2,
    eSectionAnvilResult,
    eSectionAnvilName,               // text input section

    // Beacon, Hopper, Horse, Fireworks... (all follow the same pattern)
};
```

The "Using" section is always the hotbar. Each menu declares its `m_eFirstSection` and `m_eMaxSection` to define which sections it uses.

### The pointer system

Console menus use a virtual pointer controlled by the analog stick, not a mouse. The pointer implementation:

1. **Movement.** A 60Hz timer polls the stick input and updates `m_pointerPos`. Speed is set by `POINTER_SPEED_FACTOR` (13.0). The pointer is clamped to panel bounds with some extra overshoot so you can drop items outside the menu.
2. **Section detection.** Each tick, the UI checks which section the pointer is over and which slot within that section.
3. **D-pad navigation.** The "tap detection" system lets you use the d-pad to jump between slots. It tracks consecutive input ticks and determines if the input was a tap or a hold.
4. **Slot clicking.** When the player presses a button (A, X, Y, etc.), the UI maps it to a slot ID and calls `slotClicked()`, which delegates to `clicked()` on the menu.

### Tooltip system

The console tooltip system shows contextual button prompts. The `EToolTipItem` enum defines possible actions (like "Place Item", "Take Half", "Swap", etc.), and each button (A, X, Y, RT, Back) gets assigned an action based on what's under the pointer:

- Is the cursor carrying an item? Show "Place" or "Place One"
- Is there an item in the slot? Show "Take" or "Take Half"
- Are they the same type? Show "Stack"
- Is the pointer outside the menu? Show "Drop"

Menus can override this with `overrideTooltips()` for special cases.

### Custom draw callbacks

Items in slots are rendered using Iggy's custom draw callback system. The SWF movie has named regions like `"slot_0"`, `"slot_1"`, etc. When Iggy hits a custom draw region during rendering, it calls `customDraw()`:

```cpp
void UIScene_AbstractContainerMenu::customDraw(IggyCustomDrawCallbackRegion *region)
{
    int slotId = -1;
    if (wcscmp(region->name, L"pointerIcon") == 0)
    {
        item = player->inventory->getCarried();
    }
    else
    {
        swscanf(region->name, L"slot_%d", &slotId);
        item = m_menu->getSlot(slotId)->getItem();
    }

    if (item != nullptr)
        customDrawSlotControl(region, iPad, item,
                              m_menu->isValidIngredient(item, slotId) ? 1.0f : 0.5f,
                              item->isFoil(), true);
}
```

Notice the `isValidIngredient()` check: invalid ingredients render at 50% opacity (0.5f alpha). This is how the fireworks menu dims unusable items.

### PS4 touchpad support

On PS4, the pointer can be controlled by the DualShock 4 touchpad. The UI maps the touchpad coordinate space (0-1919 x 0-941) to the panel dimensions and uses relative movement with a dead zone:

```cpp
m_fTouchPadMulX = fPanelWidth / 1919.0f;
m_fTouchPadMulY = fPanelHeight / 941.0f;
m_fTouchPadDeadZoneX = 15.0f * m_fTouchPadMulX;
m_fTouchPadDeadZoneY = 15.0f * m_fTouchPadMulY;
```

### Split-screen considerations

In split-screen mode, each player's UI pointer is restricted to their portion of the screen. The `m_fPointerMinY` is set to `floor(fPointerHeight/2.0f)` instead of extending beyond the panel edge, preventing pointers from wandering into another player's area.

## Creating a custom container menu from scratch

Let's build a 5-slot "gem polisher" workbench. You put a raw gem in one slot, a polishing tool in another, and the result appears in the output slot. It also has two extra material slots for modifiers.

### Step 1: The backing container

You need a `Container` to store the items in your crafting grid. The `CraftingContainer` class already does this. It takes the menu, width, and height:

```cpp
// GemPolisherMenu.h
#pragma once
#include "AbstractContainerMenu.h"

class CraftingContainer;
class Container;

class GemPolisherMenu : public AbstractContainerMenu
{
public:
    static const int GEM_SLOT = 0;
    static const int TOOL_SLOT = 1;
    static const int MODIFIER_SLOT_1 = 2;
    static const int MODIFIER_SLOT_2 = 3;
    static const int RESULT_SLOT = 4;

    static const int INV_SLOT_START = 5;
    static const int INV_SLOT_END = INV_SLOT_START + 27;
    static const int USE_ROW_SLOT_START = INV_SLOT_END;
    static const int USE_ROW_SLOT_END = USE_ROW_SLOT_START + 9;

    shared_ptr<CraftingContainer> polishSlots;
    shared_ptr<Container> resultSlots;

private:
    Level *level;
    int x, y, z;

public:
    GemPolisherMenu(shared_ptr<Inventory> inventory, Level *level,
                    int xt, int yt, int zt);

    virtual void slotsChanged();
    virtual void removed(shared_ptr<Player> player);
    virtual bool stillValid(shared_ptr<Player> player);
    virtual shared_ptr<ItemInstance> quickMoveStack(shared_ptr<Player> player,
                                                     int slotIndex);
};
```

### Step 2: Implement the menu

```cpp
// GemPolisherMenu.cpp
#include "stdafx.h"
#include "net.minecraft.world.entity.player.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.level.tile.h"
#include "net.minecraft.world.item.h"
#include "CraftingContainer.h"
#include "ResultContainer.h"
#include "ResultSlot.h"
#include "GemPolisherMenu.h"

GemPolisherMenu::GemPolisherMenu(shared_ptr<Inventory> inventory, Level *level,
                                   int xt, int yt, int zt)
    : AbstractContainerMenu()
{
    // 4 input slots arranged as a 4x1 grid internally
    polishSlots = std::make_shared<CraftingContainer>(this, 4, 1);
    resultSlots = std::make_shared<ResultContainer>();

    this->level = level;
    this->x = xt;
    this->y = yt;
    this->z = zt;

    // Gem input (left side)
    addSlot(new Slot(polishSlots, 0, 26, 35));

    // Tool slot (next to gem)
    addSlot(new Slot(polishSlots, 1, 50, 35));

    // Two modifier slots (below)
    addSlot(new Slot(polishSlots, 2, 26, 59));
    addSlot(new Slot(polishSlots, 3, 50, 59));

    // Result slot (right side, using ResultSlot so you can't place items in it)
    addSlot(new ResultSlot(inventory->player, polishSlots, resultSlots, 0, 120, 47));

    // Player inventory (standard layout)
    for (int row = 0; row < 3; row++)
    {
        for (int col = 0; col < 9; col++)
        {
            addSlot(new Slot(inventory, col + row * 9 + 9,
                             8 + col * 18, 84 + row * 18));
        }
    }

    // Hotbar
    for (int col = 0; col < 9; col++)
    {
        addSlot(new Slot(inventory, col, 8 + col * 18, 142));
    }

    slotsChanged();
}
```

### Step 3: Recipe checking

When any slot changes, `slotsChanged()` gets called. This is where you check if the current inputs produce a result:

```cpp
void GemPolisherMenu::slotsChanged()
{
    // Check if we have a valid gem + tool combination
    shared_ptr<ItemInstance> gem = polishSlots->getItem(0);
    shared_ptr<ItemInstance> tool = polishSlots->getItem(1);

    if (gem != nullptr && tool != nullptr)
    {
        // Example: raw ruby + flint = polished ruby
        if (gem->id == Item::ruby_raw_Id && tool->id == Item::flint_Id)
        {
            shared_ptr<ItemInstance> result =
                std::make_shared<ItemInstance>(Item::ruby, 1);

            // Check modifiers for bonus output
            shared_ptr<ItemInstance> mod1 = polishSlots->getItem(2);
            if (mod1 != nullptr && mod1->id == Item::glowstoneDust_Id)
            {
                result->count = 2;  // glowstone doubles the output
            }

            resultSlots->setItem(0, result);
            return;
        }
    }

    resultSlots->setItem(0, nullptr);
}
```

For a real mod, you'd want a proper recipe registry instead of hardcoded checks. But this shows the idea.

### Step 4: Cleanup when closed

When the player closes the menu, drop any items left in the input slots back to them:

```cpp
void GemPolisherMenu::removed(shared_ptr<Player> player)
{
    AbstractContainerMenu::removed(player);  // drops carried item
    if (level->isClientSide) return;

    for (int i = 0; i < 4; i++)
    {
        shared_ptr<ItemInstance> item = polishSlots->removeItemNoUpdate(i);
        if (item != nullptr)
        {
            player->drop(item);
        }
    }
}
```

### Step 5: Validity check

Keep the menu open only if the block still exists and the player is close enough:

```cpp
bool GemPolisherMenu::stillValid(shared_ptr<Player> player)
{
    if (level->getTile(x, y, z) != Tile::gemPolisher_Id) return false;
    if (player->distanceToSqr(x + 0.5, y + 0.5, z + 0.5) > 64.0) return false;
    return true;
}
```

The `64.0` is `8 * 8`, which is 8 blocks. This matches the vanilla crafting table range.

### Step 6: Shift-click logic

```cpp
shared_ptr<ItemInstance> GemPolisherMenu::quickMoveStack(shared_ptr<Player> player,
                                                          int slotIndex)
{
    shared_ptr<ItemInstance> clicked = nullptr;
    Slot *slot = slots.at(slotIndex);

    if (slot != nullptr && slot->hasItem())
    {
        shared_ptr<ItemInstance> stack = slot->getItem();
        clicked = stack->copy();

        if (slotIndex == RESULT_SLOT)
        {
            // Output goes to player inventory
            if (!moveItemStackTo(stack, INV_SLOT_START, USE_ROW_SLOT_END, true))
                return nullptr;
            slot->onQuickCraft(stack, clicked);
        }
        else if (slotIndex >= GEM_SLOT && slotIndex <= MODIFIER_SLOT_2)
        {
            // Input slots go to player inventory
            if (!moveItemStackTo(stack, INV_SLOT_START, USE_ROW_SLOT_END, false))
                return nullptr;
        }
        else if (slotIndex >= INV_SLOT_START && slotIndex < INV_SLOT_END)
        {
            // Main inventory goes to hotbar
            if (!moveItemStackTo(stack, USE_ROW_SLOT_START, USE_ROW_SLOT_END, false))
                return nullptr;
        }
        else if (slotIndex >= USE_ROW_SLOT_START && slotIndex < USE_ROW_SLOT_END)
        {
            // Hotbar goes to main inventory
            if (!moveItemStackTo(stack, INV_SLOT_START, INV_SLOT_END, false))
                return nullptr;
        }

        if (stack->count == 0)
            slot->set(nullptr);
        else
            slot->setChanged();

        if (stack->count == clicked->count)
            return nullptr;
        else
            slot->onTake(player, stack);
    }
    return clicked;
}
```

### Step 7: The screen

You also need a screen class to render the UI. See the [Custom GUI Screens](/slop-docs/modding/custom-screens/) guide for the full screen system. The short version:

```cpp
// GemPolisherScreen.h
#pragma once
#include "AbstractContainerScreen.h"

class GemPolisherScreen : public AbstractContainerScreen
{
public:
    GemPolisherScreen(shared_ptr<Inventory> inventory, Level *level,
                      int x, int y, int z)
        : AbstractContainerScreen(new GemPolisherMenu(inventory, level, x, y, z))
    {
        passEvents = false;
    }

protected:
    virtual void renderBg(float a);
    virtual void renderLabels();
};
```

The `AbstractContainerScreen` base class already handles rendering items in slots, hover highlights, click forwarding, and tooltip display. You just need to draw your background texture.

### Step 8: Open the menu from a block

In your custom tile entity or block's `use()` method:

```cpp
bool GemPolisherTile::use(Level *level, int x, int y, int z,
                           shared_ptr<Player> player)
{
    if (level->isClientSide) return true;

    player->openMenu(new GemPolisherScreen(player->inventory, level, x, y, z));
    return true;
}
```

## Building a custom crafting table with a different grid size

The crafting table uses a 3x3 `CraftingContainer`. The inventory uses a 2x2 one. You can make any size. Here's a 4x4 grid:

```cpp
// BigCraftingMenu constructor
craftSlots = std::make_shared<CraftingContainer>(this, 4, 4);
resultSlots = std::make_shared<ResultContainer>();

addSlot(new ResultSlot(inventory->player, craftSlots, resultSlots, 0, 140, 35));

for (int y = 0; y < 4; y++)
    for (int x = 0; x < 4; x++)
        addSlot(new Slot(craftSlots, x + y * 4, 12 + x * 18, 8 + y * 18));
```

The tricky part is recipes. `Recipes::getInstance()->getItemFor()` takes a `CraftingContainer` and checks against all registered recipes. The recipe system checks the container's width to find matches, so a 4x4 recipe won't match a 3x3 grid and vice versa. You'd need to register new recipes that are 4x4 patterns.

The `CraftingContainer` constructor takes `(menu, width, height)`. The menu pointer is used so `setChanged()` can call back to `slotsChanged()`:

```cpp
void CraftingContainer::setChanged()
{
    if (menu != nullptr) menu->slotsChanged();
}
```

## Building a custom furnace-like processor

A furnace-like menu needs:
1. Input slot(s)
2. Fuel slot (or some other power source)
3. Output slot (using `FurnaceResultSlot` or your own result slot)
4. Progress tracking via integer data IDs

Here's a smelter that takes two inputs:

```cpp
class DualSmelterMenu : public AbstractContainerMenu
{
public:
    static const int INPUT_SLOT_1 = 0;
    static const int INPUT_SLOT_2 = 1;
    static const int FUEL_SLOT = 2;
    static const int RESULT_SLOT = 3;

    static const int DATA_PROGRESS = 0;
    static const int DATA_MAX_PROGRESS = 1;
    static const int DATA_LIT_TIME = 2;
    static const int DATA_LIT_DURATION = 3;

private:
    shared_ptr<DualSmelterTileEntity> tileEntity;
    int cachedProgress, cachedMaxProgress, cachedLitTime, cachedLitDuration;

public:
    DualSmelterMenu(shared_ptr<Inventory> inventory,
                    shared_ptr<DualSmelterTileEntity> te)
    {
        tileEntity = te;
        cachedProgress = cachedMaxProgress = cachedLitTime = cachedLitDuration = 0;

        addSlot(new Slot(te, 0, 40, 17));           // input 1
        addSlot(new Slot(te, 1, 64, 17));           // input 2
        addSlot(new Slot(te, 2, 52, 53));           // fuel
        addSlot(new FurnaceResultSlot(player, te, 3, 116, 35)); // output

        // standard inventory + hotbar
    }

    void addSlotListener(ContainerListener *listener)
    {
        AbstractContainerMenu::addSlotListener(listener);
        listener->setContainerData(this, DATA_PROGRESS, tileEntity->progress);
        listener->setContainerData(this, DATA_MAX_PROGRESS, tileEntity->maxProgress);
        listener->setContainerData(this, DATA_LIT_TIME, tileEntity->litTime);
        listener->setContainerData(this, DATA_LIT_DURATION, tileEntity->litDuration);
    }

    void broadcastChanges()
    {
        AbstractContainerMenu::broadcastChanges();
        for (auto& listener : containerListeners)
        {
            if (cachedProgress != tileEntity->progress)
                listener->setContainerData(this, DATA_PROGRESS, tileEntity->progress);
            if (cachedMaxProgress != tileEntity->maxProgress)
                listener->setContainerData(this, DATA_MAX_PROGRESS, tileEntity->maxProgress);
            if (cachedLitTime != tileEntity->litTime)
                listener->setContainerData(this, DATA_LIT_TIME, tileEntity->litTime);
            if (cachedLitDuration != tileEntity->litDuration)
                listener->setContainerData(this, DATA_LIT_DURATION, tileEntity->litDuration);
        }
        cachedProgress = tileEntity->progress;
        cachedMaxProgress = tileEntity->maxProgress;
        cachedLitTime = tileEntity->litTime;
        cachedLitDuration = tileEntity->litDuration;
    }

    void setData(int id, int value)
    {
        if (id == DATA_PROGRESS) tileEntity->progress = value;
        if (id == DATA_MAX_PROGRESS) tileEntity->maxProgress = value;
        if (id == DATA_LIT_TIME) tileEntity->litTime = value;
        if (id == DATA_LIT_DURATION) tileEntity->litDuration = value;
    }
};
```

Then in your screen's `renderBg()`, use the synced data to draw animated progress:

```cpp
void DualSmelterScreen::renderBg(float a)
{
    // Draw base texture
    // ...

    // Draw fire icon (fuel indicator)
    if (tileEntity->isLit())
    {
        int p = tileEntity->litTime * 12 / tileEntity->litDuration;
        blit(xo + 52, yo + 36 + 12 - p, 176, 12 - p, 14, p + 2);
    }

    // Draw progress arrow
    int p = tileEntity->progress * 24 / tileEntity->maxProgress;
    blit(xo + 79, yo + 34, 176, 14, p + 1, 16);
}
```

The progress bar and fuel indicator both use the same trick: source a region from the right side of the texture (x=176) and blit a variable-height or variable-width portion.

## Custom slot restrictions

If you want a slot that only accepts certain items, subclass `Slot` and override `mayPlace()`:

```cpp
class GemOnlySlot : public Slot
{
public:
    GemOnlySlot(shared_ptr<Container> container, int slot, int x, int y)
        : Slot(container, slot, x, y) {}

    virtual bool mayPlace(shared_ptr<ItemInstance> item)
    {
        if (item == nullptr) return false;
        // Only accept ruby, emerald, diamond
        return item->id == Item::ruby_Id
            || item->id == Item::emerald_Id
            || item->id == Item::diamond_Id;
    }

    virtual int getMaxStackSize()
    {
        return 1;  // one gem at a time
    }
};
```

Then use it in your menu constructor instead of a regular `Slot`:

```cpp
addSlot(new GemOnlySlot(polishSlots, 0, 26, 35));
```

### Output-only slots

For slots where you can take items out but can't put items in, override `mayPlace()` to return `false`:

```cpp
class OutputOnlySlot : public Slot
{
public:
    OutputOnlySlot(shared_ptr<Container> c, int s, int x, int y) : Slot(c, s, x, y) {}
    virtual bool mayPlace(shared_ptr<ItemInstance> item) { return false; }
};
```

If your output slot also needs to consume ingredients when taken, see `ResultSlot` for the pattern.

### Conditional pickup slots

For slots where you can't take items unless a condition is met (like the anvil requiring enough XP), override `mayPickup()`:

```cpp
class ConditionalPickupSlot : public Slot
{
    int *costRef;
public:
    ConditionalPickupSlot(shared_ptr<Container> c, int s, int x, int y, int *cost)
        : Slot(c, s, x, y), costRef(cost) {}

    virtual bool mayPickup(shared_ptr<Player> player)
    {
        return (player->abilities.instabuild || player->experienceLevel >= *costRef)
               && *costRef > 0 && hasItem();
    }
};
```

### Slots with item-specific max stack sizes

```cpp
class SingleItemSlot : public Slot
{
public:
    SingleItemSlot(shared_ptr<Container> c, int s, int x, int y) : Slot(c, s, x, y) {}
    virtual int getMaxStackSize() { return 1; }
};
```

### Hiding slots dynamically

Override `isActive()` to conditionally show/hide a slot:

```cpp
class ConditionalSlot : public Slot
{
    bool *visibleRef;
public:
    ConditionalSlot(shared_ptr<Container> c, int s, int x, int y, bool *visible)
        : Slot(c, s, x, y), visibleRef(visible) {}
    virtual bool isActive() { return *visibleRef; }
};
```

## Building a complete new inventory type end to end

Here's the full process for adding a completely new container type:

### 1. Add a container open type

In `ContainerOpenPacket.h`, add a new constant:

```cpp
static const int GEM_POLISHER = 18; // pick the next available number
```

### 2. Create the tile entity

Your block needs a tile entity to store items. Extend `Container` or `TileEntity` (or both). The tile entity holds the actual item data and persists when the menu is closed.

### 3. Create the menu class

As shown in the gem polisher example above. This is the logic layer.

### 4. Create the screen class (PC path)

Extend `AbstractContainerScreen`, implement `renderBg()` and `renderLabels()`.

### 5. Create the UI scene (console path)

For the SWF/Iggy path:
1. Add new section enum values in `IUIScene_AbstractContainerMenu`
2. Create a subclass of `UIScene_AbstractContainerMenu`
3. Create a SWF movie with named slot regions (`slot_0`, `slot_1`, etc.)
4. Map sections to slot lists in `PlatformInitialize()`
5. Implement `getSectionStartOffset()` and `GetSectionAndSlotInDirection()`

For the XUI path (Xbox 360):
1. Create a subclass of `CXuiSceneAbstractContainer`
2. Create XUI scene files
3. Implement `GetSectionControl()` and `GetSectionSlotList()`

### 6. Hook up the open packet handler

In the client's packet handler for `ContainerOpenPacket`, add a case for your new type that creates the right menu and screen.

### 7. Open the menu from a block

In your block or tile entity's `use()` method, create the menu and open it on the player.

## Key source files

### Menu classes
- `Minecraft.World/AbstractContainerMenu.h` and `.cpp` - the base menu class
- `Minecraft.World/ContainerMenu.h` and `.cpp` - chest/ender chest
- `Minecraft.World/CraftingMenu.h` and `.cpp` - crafting table with recipe lookup
- `Minecraft.World/FurnaceMenu.h` and `.cpp` - furnace with data sync
- `Minecraft.World/InventoryMenu.h` and `.cpp` - player inventory with armor
- `Minecraft.World/BrewingStandMenu.h` and `.cpp` - brewing stand with custom slot subclasses
- `Minecraft.World/EnchantmentMenu.h` and `.cpp` - enchanting table with bookshelf detection
- `Minecraft.World/RepairMenu.h` / `AnvilMenu.h` and `.cpp` - anvil with complex cost calculation
- `Minecraft.World/MerchantMenu.h` and `.cpp` - villager trading
- `Minecraft.World/TrapMenu.h` and `.cpp` - dispenser/dropper (simplest example)
- `Minecraft.World/HopperMenu.h` and `.cpp` - hopper (5-slot row)
- `Minecraft.World/BeaconMenu.h` and `.cpp` - beacon with power selection
- `Minecraft.World/HorseInventoryMenu.h` and `.cpp` - horse with dynamic slots
- `Minecraft.World/FireworksMenu.h` and `.cpp` - fireworks with ingredient validation

### Slot classes
- `Minecraft.World/Slot.h` and `.cpp` - base slot
- `Minecraft.World/ResultSlot.h` and `.cpp` - crafting output (blocks placement, consumes ingredients)
- `Minecraft.World/FurnaceResultSlot.h` and `.cpp` - furnace output (spawns XP)
- `Minecraft.World/ArmorSlot.h` and `.cpp` - armor (type checking, ghost icons)
- `Minecraft.World/RepairResultSlot.h` and `.cpp` - anvil output (XP cost, anvil damage)
- `Minecraft.World/MerchantResultSlot.h` - trade output (payment processing)
- `Minecraft.World/EnchantmentSlot.h` - enchanting input (accepts anything)

### Container classes
- `Minecraft.World/Container.h` - abstract container interface
- `Minecraft.World/CraftingContainer.h` and `.cpp` - temporary crafting grid storage
- `Minecraft.World/ResultContainer.h` and `.cpp` - single-slot result storage
- `Minecraft.World/SimpleContainer.h` and `.cpp` - basic container with fixed size
- `Minecraft.World/CompoundContainer.h` and `.cpp` - two containers combined (double chests)

### Screen classes
- `Minecraft.Client/AbstractContainerScreen.h` and `.cpp` - base screen (PC rendering)
- `Minecraft.Client/ContainerScreen.h` and `.cpp` - chest screen (dynamic height)
- `Minecraft.Client/CraftingScreen.h` and `.cpp` - crafting table screen
- `Minecraft.Client/FurnaceScreen.h` and `.cpp` - furnace screen (animated progress)
- `Minecraft.Client/InventoryScreen.h` and `.cpp` - player inventory screen
- `Minecraft.Client/TrapScreen.h` and `.cpp` - dispenser screen

### UI layer (console)
- `Minecraft.Client/Common/UI/IUIScene_AbstractContainerMenu.h` and `.cpp` - platform-independent interface (sections, pointer, tooltips)
- `Minecraft.Client/Common/UI/UIScene_AbstractContainerMenu.h` and `.cpp` - SWF/Iggy rendering backend
- `Minecraft.Client/Common/XUI/XUI_Scene_AbstractContainer.h` and `.cpp` - XUI rendering backend (Xbox)

### Network
- `Minecraft.World/net.minecraft.world.inventory.ContainerListener.h` - sync interface
- `Minecraft.World/ContainerOpenPacket.h` - opens a menu on the client (has all type constants)
- `Minecraft.World/ContainerClickPacket.h` - client sends slot clicks
- `Minecraft.World/ContainerSetDataPacket.h` - server sends integer data
- `Minecraft.World/ContainerSetSlotPacket.h` - server sends slot updates
- `Minecraft.World/ContainerSetContentPacket.h` - server sends full refresh
- `Minecraft.World/ContainerAckPacket.h` - transaction acknowledgment
- `Minecraft.World/ContainerClosePacket.h` - closes the menu
- `Minecraft.World/ContainerButtonClickPacket.h` - enchant/trade button clicks

## Related guides

- [Custom GUI Screens](/slop-docs/modding/custom-screens/) for the screen and rendering system
- [Adding Items](/slop-docs/modding/adding-items/) for creating the items that go in your container
- [Adding Blocks](/slop-docs/modding/adding-blocks/) for creating the block that opens your container

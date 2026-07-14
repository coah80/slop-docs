---
title: Custom Enchantments
description: A full worked example — add an Enchantment subclass to neoLegacy end to end, modeled on how Depth Strider (WaterWalkerEnchantment) and Frost Walker are actually registered today.
---

This walks the complete process of adding an enchantment, using the two real
neoLegacy TU31 backports as the template: **`WaterWalkerEnchantment`** (Depth
Strider — an armor-boots enchant that changes a movement calculation) and
**`FrostWalkerEnchantment`** (a treasure enchant that runs custom world logic
every tick). Both were merged as real features
([`2a86a939`](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/commit/2a86a939), Depth
Strider; `9` = Frost Walker), so you can diff against them.

Read [Adding Blocks](/slop-docs/modding/adding-blocks/) first for the
`staticCtor` idiom and the build setup, and keep the
[Enchantments reference](/slop-docs/world/enchantments/) open for the full
registry. Enchantments are wired up in `Enchantment::staticCtor()`
(`Enchantment.cpp:54`), bootstrapped from `Minecraft.World.cpp:78`.

For the worked example we'll add **Sprint Boots**: a boots enchantment (like
Depth Strider) that gives the wearer a small movement-speed bonus. It's
deliberately close to `WaterWalkerEnchantment` so you can copy the pattern.

## How enchantments are registered

The whole registry lives on the `Enchantment` base class (`Enchantment.h`):

- `static EnchantmentArray enchantments` — a 256-slot id→`Enchantment*` array
  (`Enchantment.cpp:13`).
- `static vector<Enchantment*> validEnchantments` — the subset that the
  enchanting table can roll (everything that isn't a treasure enchant;
  `Enchantment.cpp:14`, filled at the end of `staticCtor`).
- ~30 named `static Enchantment *field` pointers (`Enchantment.h:22`+).

Each enchant is `new`'d in `Enchantment::staticCtor()` with an **id** and a
**frequency** (rarity weight), and the base ctor calls `_init(id)`
(`Enchantment.cpp:104`) which slots `this` into `enchantments[id]` and asserts
the id isn't a duplicate. The four frequency constants (`Enchantment.h:15`):

| Constant | Value |
|---|---|
| `FREQ_COMMON` | 10 |
| `FREQ_UNCOMMON` | 5 |
| `FREQ_RARE` | 2 |
| `FREQ_VERY_RARE` | 1 |

The real Depth Strider registration is one line
(`Enchantment.cpp:63`):

```cpp
waterWalker = new WaterWalkerEnchantment(8, FREQ_RARE);
```

Frost Walker is right below it (`Enchantment.cpp:64`):

```cpp
frostWalker = new FrostWalkerEnchantment(9, FREQ_RARE);
```

## Step 0 — pick an ID

Enchantment IDs are grouped by category and hard-coded inline in `staticCtor`.
The vanilla LCE ranges (from `Enchantment.cpp:55`+):

| Range | Category |
|---|---|
| 0–9 | armor (protection, aqua affinity, depth strider, frost walker, thorns) |
| 16–21 | weapon (sharpness, smite, bane, knockback, fire aspect, looting) |
| 32–35 | digger (efficiency, silk touch, unbreaking, fortune) |
| 48–51 | bow (power, punch, flame, infinity) |
| 64–65 | fishing rod (lure, luck of the sea) |
| 70 | mending |

Pick a free slot. IDs are baked into saved items (an enchanted item stores its
enchant ids in NBT), so **never renumber a shipped id.** For this example
assume **10** is free (next after Frost Walker's 9).

## Step 1 — the enchantment header

Create `Minecraft.World/SprintBootsEnchantment.h`. `WaterWalkerEnchantment.h`
is the exact template:

```cpp
// WaterWalkerEnchantment.h — the template
#pragma once
#include "Enchantment.h"

class WaterWalkerEnchantment : public Enchantment
{
public:
	WaterWalkerEnchantment(int id, int freq);

	virtual int getMinCost(int level);
	virtual int getMaxCost(int level);
	virtual int getMaxLevel();
};
```

Ours mirrors it:

```cpp
// SprintBootsEnchantment.h
#pragma once
#include "Enchantment.h"

class SprintBootsEnchantment : public Enchantment
{
public:
	SprintBootsEnchantment(int id, int freq);

	virtual int getMinCost(int level) override;
	virtual int getMaxCost(int level) override;
	virtual int getMaxLevel() override;
};
```

`getMinCost`/`getMaxCost` define the enchanting-table XP-level window the
enchant can appear in; `getMaxLevel` caps the roman-numeral level.

## Step 2 — the enchantment source, and picking a category (canEnchant target)

`WaterWalkerEnchantment.cpp` is the whole template:

```cpp
// WaterWalkerEnchantment.cpp — the template
#include "WaterWalkerEnchantment.h"

WaterWalkerEnchantment::WaterWalkerEnchantment(int id, int frequency)
	: Enchantment(id, frequency, EnchantmentCategory::armor_feet)
{
	setDescriptionId(IDS_ENCHANTMENT_WATER_WALKER);
}

int WaterWalkerEnchantment::getMinCost(int level) { return 1 + (level - 1) * 10; }
int WaterWalkerEnchantment::getMaxCost(int level) { return getMinCost(level) + 15; }
int WaterWalkerEnchantment::getMaxLevel()         { return 3; }
```

The **third ctor argument is the category** — this is what decides *which items
the enchant can go on* (`canEnchant` targets). The base `Enchantment::canEnchant`
(`Enchantment.cpp:187`) just delegates to `category->canEnchant(item->getItem())`,
and `EnchantmentCategory::canEnchant` (`EnchantmentCategory.cpp:16`) is a big
`dynamic_cast` dispatch. The categories (`EnchantmentCategory.h:8`):

| Category | Matches (via `dynamic_cast`) |
|---|---|
| `all` | anything |
| `armor` | any `ArmorItem` |
| `armor_head` / `armor_torso` / `armor_legs` / `armor_feet` | `ArmorItem` with the matching `slot` |
| `weapon` | any `WeaponItem` (swords) |
| `digger` | any `DiggerItem` (pickaxe/shovel/axe) |
| `bow` | any `BowItem` |
| `fishing_rod` | any `FishingRodItem` |

Because Sprint Boots is a boots enchant, we use `armor_feet` — same as Depth
Strider and Frost Walker:

```cpp
// SprintBootsEnchantment.cpp
#include "SprintBootsEnchantment.h"

SprintBootsEnchantment::SprintBootsEnchantment(int id, int frequency)
	: Enchantment(id, frequency, EnchantmentCategory::armor_feet)
{
	setDescriptionId(IDS_ENCHANTMENT_SPRINT_BOOTS);
}

int SprintBootsEnchantment::getMinCost(int level) { return 1 + (level - 1) * 10; }
int SprintBootsEnchantment::getMaxCost(int level) { return getMinCost(level) + 15; }
int SprintBootsEnchantment::getMaxLevel()         { return 3; }
```

:::note[Treasure enchantments]
If your enchant should only come from loot/trading and never appear in the
enchanting table, override `isTreasureEnchantment()` to return `true` — that's
how `FrostWalkerEnchantment.h` and `MendingEnchantment.h` do it. The
`validEnchantments` filter at the end of `staticCtor` skips any enchant whose
`isTreasureEnchantment()` is true, so it won't roll on the table.
:::

## Step 3 — register it in `staticCtor`

Add one line to `Enchantment::staticCtor()` (`Enchantment.cpp:54`), next to the
other armor-feet enchants, and add the include at the top of the file (the real
`WaterWalkerEnchantment.h`/`FrostWalkerEnchantment.h`/`MendingEnchantment.h`
includes sit at `Enchantment.cpp:6-8`):

```cpp
// at the top of Enchantment.cpp, with the other subclass includes
#include "SprintBootsEnchantment.h"

// inside Enchantment::staticCtor(), after frostWalker (line 64)
sprintBoots = new SprintBootsEnchantment(10, FREQ_RARE);
```

You also need the static pointer. In `Enchantment.h`, add it next to the armor
group (`Enchantment.h:22`+):

```cpp
static Enchantment *sprintBoots;
```

…and define it at the top of `Enchantment.cpp` (with the other
`Enchantment *Enchantment::xxx = nullptr;` lines, `Enchantment.cpp:16`+):

```cpp
Enchantment *Enchantment::sprintBoots = nullptr;
```

## Step 4 — the effect hookup

An enchantment class is inert on its own — the base `Enchantment` has no
per-tick hook. The effect is applied by **gameplay code that queries the
wearer's enchant level** via `EnchantmentHelper`. That helper is the pattern to
copy. Depth Strider and Frost Walker each add a typed accessor
(`EnchantmentHelper.cpp:237` / `:242`):

```cpp
int EnchantmentHelper::getWaterWalker(shared_ptr<LivingEntity> source)
{
	return getEnchantmentLevel(Enchantment::waterWalker->id, source->getEquipmentSlots());
}

int EnchantmentHelper::getFrostWalker(shared_ptr<LivingEntity> source)
{
	return getEnchantmentLevel(Enchantment::frostWalker->id, source->getEquipmentSlots());
}
```

`getEnchantmentLevel(enchId, inventory)` (`EnchantmentHelper.cpp:89`) scans the
equipment slots and returns the highest level found. Then the actual gameplay
code uses it:

- **Depth Strider** is consumed in `LivingEntity` swimming physics
  (`LivingEntity.cpp:1523`). It clamps the level to 3, then blends the wearer's
  water friction/speed toward their land values:

  ```cpp
  int waterWalkerLever = EnchantmentHelper::getWaterWalker(...);
  if (waterWalkerLever > 3) waterWalkerLever = 3;
  ...
  if (waterWalkerLever > 0) {
      waterFriction += (0.5f - waterFriction) * waterWalkerLever / 3.0f;
      waterSpeed    += (getSpeed() * 1.0f - waterSpeed) * waterWalkerLever / 3.0f;
  }
  ```

- **Frost Walker** runs a world hook once per tick in `LivingEntity` movement
  (`LivingEntity.cpp:293`), calling a static on the enchant class itself:

  ```cpp
  int frostWalkerLevel = EnchantmentHelper::getFrostWalker(...);
  if (frostWalkerLevel > 0)
      FrostWalkerEnchantment::freezeNearby(..., level,
          Mth::floor(x), Mth::floor(y), Mth::floor(z), frostWalkerLevel);
  ```

  `FrostWalkerEnchantment::freezeNearby` (`FrostWalkerEnchantment.cpp:29`) scans
  a `2 + level` radius under the entity and converts source-water blocks to
  `Tile::frosted_ice` — a concrete example of an enchant driving a
  [block](/slop-docs/world/blocks/) placement.

For **Sprint Boots**, mirror the Depth Strider accessor and hook. Add to
`EnchantmentHelper`:

```cpp
// EnchantmentHelper.h
static int getSprintBoots(shared_ptr<LivingEntity> source);

// EnchantmentHelper.cpp
int EnchantmentHelper::getSprintBoots(shared_ptr<LivingEntity> source)
{
	return getEnchantmentLevel(Enchantment::sprintBoots->id, source->getEquipmentSlots());
}
```

Then read it where land movement speed is computed in `LivingEntity` (the
`getSpeed()` path, near the Depth Strider block) and scale the movement input by
`1.0f + 0.1f * level`. Keep the change server-authoritative — the Frost Walker
call is guarded by `if (!level->isClientSide && isAlive())`
(`LivingEntity.cpp:291`); do the same for anything that mutates the world.

## Step 5 — strings / localization

Enchantment display names come from the `descriptionId` set in the ctor. The
base `Enchantment::getFullname(int level)` (`Enchantment.cpp:178`) formats
`"<name> <level roman numeral>"`:

```cpp
swprintf(formatted, 256, L"%ls %ls",
    app.GetString(getDescriptionId()), getLevelString(level).c_str());
```

The level suffix (`getLevelString`, `Enchantment.cpp:192`) is itself a string:
`IDS_ENCHANTMENT_LEVEL_1` … `IDS_ENCHANTMENT_LEVEL_6`.

Add your name string to
`Minecraft.Client/Windows64Media/loc/stringsGeneric.xml`, right next to the
other enchant names. This is exactly what the Depth Strider commit did — it
added `IDS_ENCHANTMENT_WATER_WALKER` = "Depth Strider" at
`stringsGeneric.xml:8079`:

```xml
<data name="IDS_ENCHANTMENT_SPRINT_BOOTS">
    <value>Sprint Boots</value>
</data>
```

The build's `GenerateStringsHeaderFromXml` step turns every `name="IDS_…"` into
a `#define IDS_… <n>` in the generated `strings.h`, so once the XML entry
exists, `IDS_ENCHANTMENT_SPRINT_BOOTS` is usable from C++ with no extra
declaration. See the [strings pipeline](/slop-docs/client/resources/) for
details.

Depth Strider's real strings entry is one file, one block — you don't touch a
central table.

## Step 6 — register the source files in CMake

Add the header + source to `Minecraft.World/cmake/sources/Common.cmake`, in the
`_MINECRAFT_WORLD_COMMON_NET_MINECRAFT_WORLD_ITEM_ENCHANTMENT` group. The Depth
Strider commit added exactly these two lines (`Common.cmake:1274`):

```cmake
"${CMAKE_CURRENT_SOURCE_DIR}/SprintBootsEnchantment.cpp"
"${CMAKE_CURRENT_SOURCE_DIR}/SprintBootsEnchantment.h"
```

## Step 7 — icon / texture (optional)

Base LCE enchantments don't carry a per-enchant sprite — they render as text in
the enchanting-table tooltip and the anvil/enchant UI, using the name string
from step 5. There's no separate icon-registration step for an enchant, unlike
[items](/slop-docs/modding/adding-items/) or [particles](/slop-docs/modding/custom-particles/).
If your enchant produces a visible in-world effect (like Frost Walker's frosted
ice), that effect's rendering comes from the block/particle it spawns, not from
the enchant.

## Testing checklist

- [ ] `SprintBootsEnchantment.cpp`/`.h` are in `Minecraft.World/cmake/sources/Common.cmake`; the project configures and compiles them.
- [ ] The build links — the `Enchantment *Enchantment::sprintBoots = nullptr;` definition and the `new SprintBootsEnchantment(10, …)` in `staticCtor` both exist, or you get an undefined-symbol / null-deref.
- [ ] Boot up, `/enchant`-command or enchanting-table the boots, and confirm the enchant applies only to boots (category = `armor_feet`) and not to a sword or pickaxe.
- [ ] The enchant name renders correctly in the item tooltip — "Sprint Boots III", not a missing-string placeholder (`IDS_ENCHANTMENT_SPRINT_BOOTS` resolved).
- [ ] The enchant rolls in the enchanting table (it's non-treasure, so it lands in `validEnchantments`); a treasure enchant should NOT roll.
- [ ] The effect fires — wear the boots and confirm the speed bonus scales with level; verify no effect at level 0 / when not wearing them.
- [ ] Any world-mutating effect is guarded by `!level->isClientSide` (copy the Frost Walker guard).
- [ ] Enchant, save, quit, reload — the enchant persists on the item (id is stable in the save).

## Where to go next

- [Enchantments reference](/slop-docs/world/enchantments/) — the full registry, all frequencies and categories.
- [Custom Potions & Effects](/slop-docs/modding/custom-potions/) — the parallel `MobEffect` system for status effects.
- [Adding Items](/slop-docs/modding/adding-items/) — if your enchant needs a new enchantable tool/armor item.
- [Backporting Overview](/slop-docs/backporting/overview/) — Depth Strider, Frost Walker and Mending are all real later-TU backports.

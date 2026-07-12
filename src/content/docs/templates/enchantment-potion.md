---
title: "Template: Enchantment & Potion"
description: A complete copy-paste mod recipe — one new armor-feet enchantment modeled on Frost Walker, plus one brand-new potion with a brewing recipe, wired the neoLegacy way with real effect logic.
---

This is a **complete mod recipe**. Follow it top to bottom and you get two things
that ship exactly the way neoLegacy's own content does:

1. **`SoulStriderEnchantment`** — a new **armor-feet** enchantment that makes you
   walk at full speed on soul sand, modeled bit-for-bit on the two post-TU19
   boot enchantments already in the tree: **Depth Strider**
   (`WaterWalkerEnchantment`, id 8) and **Frost Walker**
   (`FrostWalkerEnchantment`, id 9). It reuses the exact
   `LivingEntity` tick hook Frost Walker uses.
2. **Potion of the Strider** — a brand-new brewable potion built on a new
   `MobEffect` (id 24, the first free "reserved" slot) with a brewing-graph
   entry and a creative-menu form. The potion, its color, its brew recipe, and
   its appearance in the creative menu all fall out of the existing
   `PotionBrewing` bit-formula system once you register the effect.

If you want the *concepts* behind any step, keep these open:
[Custom Enchantments](/slop-docs/modding/custom-enchantments/),
[Custom Potions](/slop-docs/modding/custom-potions/),
[Enchantment & Effect IDs](/slop-docs/reference/enchantment-effect-ids/),
[Item IDs](/slop-docs/reference/item-ids/), and
[Textures & Assets](/slop-docs/modding/textures-assets/). New to the build?
Start with [Getting Started](/slop-docs/modding/getting-started/).

Everything lives in `Minecraft.World/` unless a path says otherwise.

## How enchantments and potions register (read this first)

Neither system has a data file. Both are pure C++ static-ctor registries, the
classic Java-LCE way:

- **Enchantments:** `Enchantment::staticCtor()` (`Enchantment.cpp:54`) `new`s each
  enchantment into a fixed `EnchantmentArray enchantments(256)` (`Enchantment.cpp:13`),
  keyed by its numeric id, then a loop at the end pushes every non-treasure entry
  into `validEnchantments` (`Enchantment.cpp:94-101`) — that vector *is* the
  enchanting-table pool. Boot order is fixed in
  `MinecraftWorld_RunStaticCtors()` (`Minecraft.World.cpp:74`, `Enchantment::staticCtor()`).
- **Effects:** `MobEffect::staticCtor()` (`MobEffect.cpp:47`) `new`s effects 1–23
  into `MobEffect *effects[NUM_EFFECTS]` (`MobEffect.h:41`, `NUM_EFFECTS = 32`).
  Slots **24–31 are reserved and currently `nullptr`** (`MobEffect.cpp:73-80`,
  `reserved_24`…`reserved_31`) — we take slot 24. Boot: `MobEffect::staticCtor()`
  runs at `Minecraft.World.cpp:42`.
- **Brewing:** `PotionBrewing::staticCtor()` (`PotionBrewing.cpp:110`) fills a
  `potionEffectDuration` map keyed by `MobEffect::<effect>->getId()` with a
  **bit-formula string**. `PotionBrewing::getEffects(brew)` (`PotionBrewing.cpp:558`)
  walks every registered `MobEffect`, looks up its formula, and includes the
  effect if the brew's bits satisfy it. This one function drives *both* what a
  brewing stand produces **and** what appears in the creative potion list
  (`PotionItem::getUniquePotionValues()`, `PotionItem.cpp:376`).
- **Ingredients:** a brewing ingredient is just an `Item` with a formula set via
  `setPotionBrewingFormula(...)` (`Item.h:808`), read by the brewing stand at
  `BrewingStandTileEntity.cpp:298`.

That means a working potion is: **register a `MobEffect` → add a duration formula
→ point an ingredient's `MOD_*` formula at the right bits.** No UI code needed;
the creative form and brewing-stand output are automatic.

---

## Part A — the enchantment

### What Depth Strider / Frost Walker look like

Both boot enchantments are tiny. Depth Strider (`WaterWalkerEnchantment`) is the
minimal shape:

```cpp
// WaterWalkerEnchantment.cpp (the whole file)
WaterWalkerEnchantment::WaterWalkerEnchantment(int id, int frequency)
    : Enchantment(id, frequency, EnchantmentCategory::armor_feet)
{
    setDescriptionId(IDS_ENCHANTMENT_WATER_WALKER);
}

int WaterWalkerEnchantment::getMinCost(int level) { return 1 + (level - 1) * 10; }
int WaterWalkerEnchantment::getMaxCost(int level) { return getMinCost(level) + 15; }
int WaterWalkerEnchantment::getMaxLevel()         { return 3; }
```

Frost Walker (`FrostWalkerEnchantment`) adds two things worth copying: it marks
itself `isTreasureEnchantment() → true` (so it is **not** obtainable at the
enchanting table, only via treasure/trades) and it owns a `static freezeNearby(...)`
that does the actual per-tick world effect. Its effect is *driven from
`LivingEntity`*, not from the enchantment object:

```cpp
// LivingEntity.cpp:290-298 (server-side, once per tick, inside baseTick)
if (!level->isClientSide && isAlive())
{
    int frostWalkerLevel = EnchantmentHelper::getFrostWalker(dynamic_pointer_cast<LivingEntity>(shared_from_this()));
    if (frostWalkerLevel > 0)
    {
        FrostWalkerEnchantment::freezeNearby(dynamic_pointer_cast<LivingEntity>(shared_from_this()), level,
            Mth::floor(x), Mth::floor(y), Mth::floor(z), frostWalkerLevel);
    }
}
```

`EnchantmentHelper::getFrostWalker` (`EnchantmentHelper.cpp:242`) is a one-liner:

```cpp
int EnchantmentHelper::getFrostWalker(shared_ptr<LivingEntity> source)
{
    return getEnchantmentLevel(Enchantment::frostWalker->id, source->getEquipmentSlots());
}
```

We follow that exact pattern: a small `Enchantment` subclass + a helper + a
`LivingEntity` tick hook.

### Files you will create

| File | Purpose |
|------|---------|
| `SoulStriderEnchantment.h` | the `Enchantment` subclass declaration |
| `SoulStriderEnchantment.cpp` | costs + level cap + the per-tick effect |

### Files you will edit

| File | Change | Anchor |
|------|--------|--------|
| `Enchantment.h` | declare `static Enchantment *soulStrider;` | `Enchantment.h:57` |
| `Enchantment.cpp` | define + register it in `staticCtor()` | `Enchantment.cpp:52` / `:92` |
| `EnchantmentHelper.h` / `.cpp` | add `getSoulStrider(...)` | `EnchantmentHelper.h:84` / `.cpp:242` |
| `LivingEntity.cpp` | call the effect each tick | `LivingEntity.cpp:290` |
| `Minecraft.Client/Windows64Media/loc/stringsGeneric.xml` | the enchantment name | near `IDS_ENCHANTMENT_FROST_WALKER` |
| `cmake/sources/Common.cmake` | add the two new files | near `FrostWalkerEnchantment.cpp`, `Common.cmake:1276` |

### Step A1 — `SoulStriderEnchantment.h`

We keep it obtainable at the enchanting table (no `isTreasureEnchantment`
override, so it defaults to `false` at `Enchantment.h:88` and joins
`validEnchantments`). Feet slot, max level 3, like Depth Strider.

```cpp
// SoulStriderEnchantment.h
#pragma once

#include "Enchantment.h"

class Level;
class LivingEntity;

class SoulStriderEnchantment : public Enchantment
{
public:
    SoulStriderEnchantment(int id, int freq);

    virtual int getMinCost(int level) override;
    virtual int getMaxCost(int level) override;
    virtual int getMaxLevel() override;

    // Per-tick effect, called from LivingEntity like Frost Walker's freezeNearby.
    static void applyStride(shared_ptr<LivingEntity> living, Level *level, int enchLevel);
};
```

### Step A2 — `SoulStriderEnchantment.cpp`

The constructor mirrors Frost Walker's (`FrostWalkerEnchantment.cpp:9`): pass the
category to the base ctor, then set the description id. The effect walks the same
way Frost Walker's `freezeNearby` walks — it reads the block under the entity's
feet and, if it is soul sand, cancels the soul-sand slowdown by nudging the
entity's horizontal motion back up. Soul sand's tile id is
`Tile::soul_sand_Id` (used in `Item.cpp:446` for the netherwart seed placer).

```cpp
// SoulStriderEnchantment.cpp
#include "stdafx.h"
#include "net.minecraft.world.level.h"
#include "net.minecraft.world.level.tile.h"
#include "net.minecraft.world.entity.h"
#include "Mth.h"
#include "SoulStriderEnchantment.h"

SoulStriderEnchantment::SoulStriderEnchantment(int id, int frequency)
    : Enchantment(id, frequency, EnchantmentCategory::armor_feet)
{
    setDescriptionId(IDS_ENCHANTMENT_SOUL_STRIDER);
}

// Same cost curve as Depth Strider (WaterWalkerEnchantment.cpp:8-16).
int SoulStriderEnchantment::getMinCost(int level) { return 1 + (level - 1) * 10; }
int SoulStriderEnchantment::getMaxCost(int level) { return getMinCost(level) + 15; }
int SoulStriderEnchantment::getMaxLevel()         { return 3; }

void SoulStriderEnchantment::applyStride(shared_ptr<LivingEntity> living, Level *level, int enchLevel)
{
    if (!living->onGround) return;

    int bx = Mth::floor(living->x);
    int by = Mth::floor(living->y) - 1;
    int bz = Mth::floor(living->z);

    // Only counteract the slowdown while actually standing on soul sand.
    if (level->getTile(bx, by, bz) != Tile::soul_sand_Id) return;

    // Soul sand multiplies horizontal motion by ~0.4 each tick. Depth Strider
    // scales water friction back toward 1.0 by level/3 (LivingEntity.cpp:1523-1539);
    // we do the analogous thing for soul sand, capping the boost at level 3.
    if (enchLevel > 3) enchLevel = 3;
    float boost = 1.0f + (1.0f / 0.4f - 1.0f) * (enchLevel / 3.0f);

    living->xd *= boost;
    living->zd *= boost;
}
```

`onGround`, `x`/`y`/`z`, `xd`/`zd` are all public members inherited from `Entity`
(the Frost Walker and Depth Strider code touches the same ones —
`FrostWalkerEnchantment.cpp:31,46`, `LivingEntity.cpp:1537-1539`).

### Step A3 — declare the static in `Enchantment.h`

Add one line to the "misc / treasure" block (after `mending`, `Enchantment.h:57`):

```cpp
    // misc / treasure
    static Enchantment *mending;
    static Enchantment *soulStrider;   // <-- add
```

### Step A4 — register it in `Enchantment.cpp`

**Include** the header near the other enchantment includes (`Enchantment.cpp:6-10`):

```cpp
#include "FrostWalkerEnchantment.h"
#include "SoulStriderEnchantment.h"   // <-- add
```

**Define** the static pointer after `mending` (`Enchantment.cpp:52`):

```cpp
Enchantment *Enchantment::mending = nullptr;
Enchantment *Enchantment::soulStrider = nullptr;   // <-- add
```

**Instantiate** it in `staticCtor()`. Pick a free id — ids 6/8/9 are the boot
enchantments, so use **id 10** (the next free armor id; the armor block runs
0–9). Add it just after `mending` at `Enchantment.cpp:92`:

```cpp
    // misc / treasure
    mending = new MendingEnchantment(70, FREQ_RARE);
    soulStrider = new SoulStriderEnchantment(10, FREQ_RARE);   // <-- add
```

Because `SoulStriderEnchantment` does **not** override `isTreasureEnchantment()`,
the loop at `Enchantment.cpp:94-101` automatically appends it to
`validEnchantments`, so it shows up at the enchanting table with no further work.

> **Id collisions are fatal.** `Enchantment::_init` (`Enchantment.cpp:104`) hits
> `DEBUG_BREAK()` on a duplicate id. Double-check nothing else uses id 10 before
> building.

### Step A5 — the helper

`EnchantmentHelper.h:84`, alongside `getFrostWalker`:

```cpp
    static int getFrostWalker(shared_ptr<LivingEntity> source);
    static int getSoulStrider(shared_ptr<LivingEntity> source);   // <-- add
```

`EnchantmentHelper.cpp:242`, right after `getFrostWalker`:

```cpp
int EnchantmentHelper::getSoulStrider(shared_ptr<LivingEntity> source)
{
    return getEnchantmentLevel(Enchantment::soulStrider->id, source->getEquipmentSlots());
}
```

### Step A6 — drive it from `LivingEntity`

Extend the Frost Walker block already at `LivingEntity.cpp:290-298`. Add our call
inside the same `!level->isClientSide && isAlive()` guard:

```cpp
if (!level->isClientSide && isAlive())
{
    int frostWalkerLevel = EnchantmentHelper::getFrostWalker(dynamic_pointer_cast<LivingEntity>(shared_from_this()));
    if (frostWalkerLevel > 0)
    {
        FrostWalkerEnchantment::freezeNearby(dynamic_pointer_cast<LivingEntity>(shared_from_this()), level,
            Mth::floor(x), Mth::floor(y), Mth::floor(z), frostWalkerLevel);
    }

    // vvv add
    int soulStriderLevel = EnchantmentHelper::getSoulStrider(dynamic_pointer_cast<LivingEntity>(shared_from_this()));
    if (soulStriderLevel > 0)
    {
        SoulStriderEnchantment::applyStride(dynamic_pointer_cast<LivingEntity>(shared_from_this()), level, soulStriderLevel);
    }
    // ^^^ add
}
```

Add `#include "SoulStriderEnchantment.h"` to `LivingEntity.cpp`'s include block
(it already includes `FrostWalkerEnchantment.h` implicitly through the effect
call — add ours explicitly).

### Step A7 — the name string

The `IDS_*` constants are **generated at build time** from the loc XML by
`cmake/GenerateStringIdLookup.cmake` — you never write a `#define` yourself. Add a
`<data>` block to `Minecraft.Client/Windows64Media/loc/stringsGeneric.xml` next to
the existing enchantment names (`IDS_ENCHANTMENT_FROST_WALKER` is at line 9472):

```xml
	<data name="IDS_ENCHANTMENT_SOUL_STRIDER">
		<value>Soul Strider</value>
	</data>
```

On the next configure, `IDS_ENCHANTMENT_SOUL_STRIDER` becomes a real constant in
the generated `strings.h`. The enchanting table renders it through
`Enchantment::getFullname` (`Enchantment.cpp:178`), which appends the roman-numeral
level via `getLevelString` (`Enchantment.cpp:192`) using the existing
`IDS_ENCHANTMENT_LEVEL_1..10` strings — nothing to add there.

### Step A8 — add the files to the build

`cmake/sources/Common.cmake`, in the same `set(...)` block that lists
`FrostWalkerEnchantment.cpp` (`Common.cmake:1276`):

```cmake
  "${CMAKE_CURRENT_SOURCE_DIR}/FrostWalkerEnchantment.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/FrostWalkerEnchantment.h"
  "${CMAKE_CURRENT_SOURCE_DIR}/SoulStriderEnchantment.cpp"    # <-- add
  "${CMAKE_CURRENT_SOURCE_DIR}/SoulStriderEnchantment.h"      # <-- add
```

That is the whole enchantment. It is now rollable at the table (frequency
`FREQ_RARE = 2`, `Enchantment.h:17`), applies to boots, and speeds you across soul
sand each server tick.

---

## Part B — the potion

We add **Potion of the Strider**: a new `MobEffect` ("Striding", a movement-speed
buff specifically flavored for the Nether) using reserved effect slot **24**,
plus a brewing recipe that turns an Awkward potion into it, plus its automatic
creative form.

### Files you will create

None — the effect and brew live entirely in existing files.

### Files you will edit

| File | Change | Anchor |
|------|--------|--------|
| `MobEffect.h` | declare `static MobEffect *striding;` | `MobEffect.h:66` (near `reserved_24`) |
| `MobEffect.cpp` | define it + register in `staticCtor()` | `MobEffect.cpp:38` / `:72` |
| `Minecraft.Client/Common/App_enums.h` | add `eMinecraftColour_Effect_Striding` | `App_enums.h:412` |
| `Minecraft.Client/Common/Colours/ColourTable.cpp` | add the color name | `ColourTable.cpp:215` |
| `.../res/TitleUpdate/res/colours.xml` | add the color value | after `Effect_Saturation` |
| `PotionBrewing.h` / `.cpp` | new `MOD_*` ingredient formula + duration entry | `PotionBrewing.h:38` / `.cpp:120` |
| `Item.cpp` | point an ingredient at the new formula | `Item.cpp:443`+ |
| `stringsGeneric.xml` | effect + postfix names | near `IDS_POTION_MOVESPEED` |

### Step B1 — register the `MobEffect`

Every registered effect is `new`'d in `MobEffect::staticCtor()` with
`(new MobEffect(id, isBad, color))->setDescriptionId(...)->setPostfixDescriptionId(...)->setIcon(...)`
and, for attribute effects, `->addAttributeModifier(...)`. Movement Speed is the
template (`MobEffect.cpp:50`):

```cpp
movementSpeed = (new MobEffect(1, false, eMinecraftColour_Effect_MovementSpeed))
    ->setDescriptionId(IDS_POTION_MOVESPEED)
    ->setPostfixDescriptionId(IDS_POTION_MOVESPEED_POSTFIX)
    ->setIcon(MobEffect::e_MobEffectIcon_Speed)
    ->addAttributeModifier(SharedMonsterAttributes::MOVEMENT_SPEED,
        eModifierId_POTION_MOVESPEED, 0.2f, AttributeModifier::OPERATION_MULTIPLY_TOTAL);
```

**Declare** the static in `MobEffect.h`. Replace the first reserved slot
(`MobEffect.h:67`, `static MobEffect *reserved_24;`) with our named one so the
array index (24) is unmistakable:

```cpp
    static MobEffect *saturation;
    static MobEffect *striding;        // <-- was reserved_24 (effect id 24)
    static MobEffect *reserved_25;
```

**Define + register** in `MobEffect.cpp`. Change the definition line
(`MobEffect.cpp:38`) from `reserved_24` to `striding`, then in `staticCtor()`
replace the `reserved_24 = nullptr;` line (`MobEffect.cpp:73`) with a real
registration. Reuse the existing Speed icon and add a `+30%` speed modifier so
the potion is stronger than the vanilla Swiftness (`+20%`):

```cpp
// MobEffect.cpp:38 — definition
MobEffect *MobEffect::striding;      // was: reserved_24
```

```cpp
// MobEffect.cpp:72-73 — inside staticCtor(), after saturation:
saturation = (new InstantenousMobEffect(23, false, eMinecraftColour_Effect_Saturation))
    ->setDescriptionId(IDS_POTION_SATURATION)->setPostfixDescriptionId(IDS_POTION_SATURATION_POSTFIX);

striding = (new MobEffect(24, false, eMinecraftColour_Effect_Striding))   // <-- was reserved_24 = nullptr;
    ->setDescriptionId(IDS_POTION_STRIDING)
    ->setPostfixDescriptionId(IDS_POTION_STRIDING_POSTFIX)
    ->setIcon(MobEffect::e_MobEffectIcon_Speed)
    ->addAttributeModifier(SharedMonsterAttributes::MOVEMENT_SPEED,
        eModifierId_POTION_MOVESPEED, 0.3f, AttributeModifier::OPERATION_MULTIPLY_TOTAL);
```

The `MobEffect` ctor (`MobEffect.cpp:83`) stores `this` into `effects[24]`
automatically, so slot 24 is now live. Because we reuse
`eModifierId_POTION_MOVESPEED` (`AttributeModifier.h:32`) and the existing Speed
icon (`MobEffect.h:29`), **no new modifier id or icon asset is required** — the
attribute-buff plumbing (`MobEffect::addAttributeModifiers`, `MobEffect.cpp:373`)
just works.

### Step B2 — the effect color

Effect colors are an `enum` (`App_enums.h`) paralleled by a name array
(`ColourTable.cpp`) paralleled by `colours.xml` entries. Add all three, at the
tail of the effect block so you don't renumber existing entries:

`Minecraft.Client/Common/App_enums.h`, after `eMinecraftColour_Effect_Saturation`
(`App_enums.h:412`):

```cpp
    eMinecraftColour_Effect_Saturation,
    eMinecraftColour_Effect_Striding,      // <-- add (before Potion_BaseColour)
```

`Minecraft.Client/Common/Colours/ColourTable.cpp`, matching position in the name
array (`ColourTable.cpp:215`, after `L"Effect_Saturation",`):

```cpp
    L"Effect_Saturation",
    L"Effect_Striding",                    // <-- add
```

`Minecraft.Client/Common/res/TitleUpdate/res/colours.xml`, after the
`Effect_Saturation` line:

```xml
  <colour name="Effect_Striding" value="7cafc6"/>
```

(`7cafc6` is Movement Speed's own value — `colours.xml:212` — a pale blue; pick
your own hex if you want a distinct potion tint.) `PotionBrewing::getColorValue`
(`PotionBrewing.cpp:194`) blends this into the rendered bottle color.

### Step B3 — the brewing recipe

Two pieces: a **duration formula** that ties brew-bit patterns to our effect, and
an **ingredient** that lights those bits.

**Understand the bit layout.** In simplified brewing (`_SIMPLIFIED_BREWING`, the
mode neoLegacy ships — `PotionBrewing.h:16-18`), bits 0–3 pick the effect, bit 4
is the "enabler" lit by nether wart, bits 5/6 are glowstone/redstone
amplify/extend, bit 13 marks a functional potion, bit 14 marks splash
(`PotionBrewing.cpp` header comment, lines 165-181). Each existing effect claims a
0–3 pattern via its duration formula (`PotionBrewing.cpp:111-120`), e.g. Fire
Resistance is `"0 & 1 & !2 & !3 & 0+6"` (bits 0 and 1 on, 2 and 3 off).

The 0–3 patterns `1011`, `1101`, `1110`, `1111` are unused in the ship set (see
the effect-id comment block at `PotionBrewing.cpp:170-181`). We claim **`1011`**
(bits 0,1,3 on; bit 2 off).

**Add the duration entry** in `PotionBrewing::staticCtor()`, in the
`_SIMPLIFIED_BREWING` block after the `waterBreathing` line (`PotionBrewing.cpp:120`):

```cpp
    potionEffectDuration.insert(intStringMap::value_type( MobEffect::waterBreathing->getId(), L"0 & 1 & 2 & 3 & 0+6" ));
    // vvv add — pattern 1011 (bits 0,1,3 set, 2 clear); "0+6" = redstone (bit 6) extends duration
    potionEffectDuration.insert(intStringMap::value_type( MobEffect::striding->getId(), L"0 & 1 & !2 & 3 & 0+6" ));
```

The `& 0+6` tail is the same "redstone extends me" suffix Fire Resistance uses; it
lets a redstone brew lengthen the potion. Our effect is not instantaneous, so
`getEffects` (`PotionBrewing.cpp:558`) gives it the standard 3/8/13-minute duration
curve automatically. If you want it to accept glowstone (stronger, `+30% → +60%`),
also add an amplifier entry next to the others at `PotionBrewing.cpp:123`:

```cpp
    potionEffectAmplifier.insert(intStringMap::value_type( MobEffect::striding->getId(), L"5" ));
```

**Declare the ingredient formula.** Add a `MOD_*` constant. Header
(`PotionBrewing.h`), in the `MOD_*` list after `MOD_PUFFERFISH` (`PotionBrewing.h:39`):

```cpp
    static const wstring MOD_PUFFERFISH;
    static const wstring MOD_MAGMA_CREAM_STRIDER;   // <-- add
```

Source (`PotionBrewing.cpp`), in the `#if _SIMPLIFIED_BREWING` string block after
`MOD_PUFFERFISH` (`PotionBrewing.cpp:100`):

```cpp
const wstring PotionBrewing::MOD_PUFFERFISH = L"+0+1+2+3&4-4+13";
// vvv add — set bits 0,1,3, clear bit 2, require+consume enabler bit 4, mark functional bit 13
const wstring PotionBrewing::MOD_MAGMA_CREAM_STRIDER = L"+0+1-2+3&4-4+13";
```

Compare the neighbors: Magma Cream is `"+0+1-2-3&4-4+13"` (`PotionBrewing.cpp:98`),
Rabbit's Foot is `"+0+1-2+3&4-4+13"`. Ours sets the same enabler/functional
handshake (`&4-4+13`) and picks the `1011` effect pattern.

> **`&4-4` is the nether-wart handshake.** It requires bit 4 (lit by nether wart,
> `MOD_NETHERWART = "+4&!13"`, `PotionBrewing.cpp:76`) then clears it, exactly like
> every other real potion ingredient. Skip it and you brew a useless Mundane
> potion.

**Point an item at the formula.** You can reuse an existing item or add one. To
mirror how Ghast Tear is wired (`Item.cpp:443`), append `->setPotionBrewingFormula(...)`
to a food/material item's builder. Reusing **magma cream**
(id 128 in this codebase — grep `magma_cream` in `Item.cpp`) as a *second*
recipe path would collide with its own `MOD_MAGMACREAM`, so instead register a
fresh ingredient. If you already added a custom item via the
[Adding Items template](/slop-docs/modding/adding-items/), just chain the setter:

```cpp
// Item.cpp — on whatever ingredient item you choose, e.g. a new "strider_essence":
Item::strider_essence = (new Item(<free id>))
    ->setIconName(L"strider_essence")
    ->setDescriptionId(IDS_ITEM_STRIDER_ESSENCE)
    ->setUseDescriptionId(IDS_DESC_STRIDER_ESSENCE)
    ->setPotionBrewingFormula(PotionBrewing::MOD_MAGMA_CREAM_STRIDER);   // <-- the hookup
```

The brewing stand reads that formula at `BrewingStandTileEntity.cpp:298`
(`applyBrew(currentBrew, Item::items[ingredient->id]->getPotionBrewingFormula())`)
— nothing else to wire. See [Adding Items](/slop-docs/modding/adding-items/) for
the full item registration if you need a brand-new ingredient item.

### Step B4 — the creative form is automatic

You do **not** touch the creative menu. `PotionItem::getUniquePotionValues()`
(`PotionItem.cpp:376`) loops every brew value `0..BREW_MASK`, calls
`PotionBrewing::getEffects(brew)`, and keeps one entry per unique effect set. The
moment your `striding` duration formula is satisfiable by some brew, that brew
becomes a distinct creative potion. Drinking it applies the effect through
`PotionItem::useTimeDepleted` → `player->addEffect(...)` (`PotionItem.cpp:89`),
which is the same path every potion uses.

### Step B5 — the strings

Add three `<data>` blocks to `stringsGeneric.xml` next to the other
`IDS_POTION_*` names (Movement Speed's pair is at `strings.h`
generated lines 1438-1439; find `IDS_POTION_MOVESPEED` in the XML):

```xml
	<data name="IDS_POTION_STRIDING">
		<value>Striding</value>
	</data>
	<data name="IDS_POTION_STRIDING_POSTFIX">
		<value>of Striding</value>
	</data>
```

If you added a fresh ingredient item, also add `IDS_ITEM_STRIDER_ESSENCE` and
`IDS_DESC_STRIDER_ESSENCE` (see the item template for the naming convention). The
potion's own display name is assembled by `PotionItem` from the appearance prefix
+ the effect postfix (`PotionItem.cpp:233`), so `..._POSTFIX` is what shows on the
bottle ("Potion **of Striding**").

### Step B6 — textures

- **Enchantment:** no texture. The enchanting-table glint is generic; the name
  string is all you need.
- **Effect icon:** we reused `e_MobEffectIcon_Speed`, so no new sprite. If you
  want a unique icon, add an enum value to `MobEffect::EMobEffectIcon`
  (`MobEffect.h:13-38`) and a sprite — see [Textures & Assets](/slop-docs/modding/textures-assets/).
- **Potion bottle:** potions share one bottle sprite tinted by
  `getColorValue`; only the ingredient item (if new) needs an icon PNG matching
  its `setIconName(L"strider_essence")` — drop it in the item atlas per the
  texture guide.

---

## Build & test checklist

1. **Configure** so the loc header regenerates:
   `cmake --preset windows64-clang-mac` (or your platform preset). Confirm the
   generated `strings.h` now contains `IDS_ENCHANTMENT_SOUL_STRIDER`,
   `IDS_POTION_STRIDING`, and `IDS_POTION_STRIDING_POSTFIX`
   (`build/<preset>/generated/Windows64Media/strings.h`). If they're missing, the
   XML edit didn't land in the loc root that preset points at.
2. **Build.** A duplicate enchantment or effect id trips `DEBUG_BREAK()`
   (`Enchantment.cpp:110`) — if the game halts at boot, you reused an id.
3. **Enchantment, table path:** creative world, enchant a pair of boots. Soul
   Strider should appear in the pool (frequency `FREQ_RARE`). Wear them, stand on
   soul sand, and you keep near-full walk speed.
4. **Enchantment, tick path:** confirm the effect only runs server-side (the
   `!level->isClientSide` guard at `LivingEntity.cpp:290`) — in singleplayer the
   embedded server ticks it; in multiplayer the host applies it and syncs motion.
5. **Potion, brewing:** put your ingredient in the brewing-stand fuel/ingredient
   slot over an Awkward potion (nether-wart base). It should yield **Potion of
   Striding**; adding redstone should extend its duration, glowstone (if you added
   the amplifier entry) should upgrade to level II.
6. **Potion, creative:** open the creative potion list — Potion of Striding should
   be a distinct entry with your `colours.xml` tint. Drink it and watch the
   speed buff apply (HUD effect icon = the Speed icon we reused).
7. **Persistence:** re-log. The effect id (24) and enchantment id (10) are written
   into save NBT; because both are stable registry ids, enchanted boots and active
   effects survive a save/load round-trip.

## Where each piece really lives (quick reference)

| Piece | File:line |
|-------|-----------|
| Enchantment registry / pool | `Enchantment.cpp:13` / `:94` |
| Enchantment boot template | `WaterWalkerEnchantment.cpp`, `FrostWalkerEnchantment.cpp:9` |
| Per-tick enchant hook | `LivingEntity.cpp:290` |
| Enchant level lookup | `EnchantmentHelper.cpp:242` |
| Effect registry | `MobEffect.cpp:47`, array `MobEffect.h:41` |
| Reserved effect slots 24–31 | `MobEffect.cpp:73-80` |
| Attribute-buff plumbing | `MobEffect.cpp:373`, ids `AttributeModifier.h:30-34` |
| Brew formula map | `PotionBrewing.cpp:110`, `getEffects` `:558` |
| Ingredient formula hook | `Item.h:808`, read at `BrewingStandTileEntity.cpp:298` |
| Creative potion enumeration | `PotionItem.cpp:376` |
| Drink → apply effect | `PotionItem.cpp:89` |
| Effect colors | `App_enums.h:390`, `ColourTable.cpp:193`, `colours.xml:212` |
| Loc generation | `cmake/GenerateStringIdLookup.cmake` |

For the reference tables of every existing enchantment and effect id, see
[Enchantment & Effect IDs](/slop-docs/reference/enchantment-effect-ids/).

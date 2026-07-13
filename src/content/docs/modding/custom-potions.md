---
title: Custom Potions & Effects
description: A full worked example — add a MobEffect and a brewable potion to neoLegacy end to end, modeled on how the TU31 Potion of Leaping and Water Breathing were actually added.
---

Potions in LCE are two separate systems glued together:

1. **`MobEffect`** — the status effect itself (a numbered effect with a color,
   icon, and optional attribute modifier). Registered in
   `MobEffect::staticCtor()` (`MobEffect.cpp:47`), bootstrapped from
   `Minecraft.World.cpp:42`.
2. **The potion item** — a single `potion` item whose **aux value** encodes
   which effect + strength + splash/extended flags it carries. Brewing recipes,
   creative-menu entries, and tooltips all key off bit masks in that aux value.

This page uses the real TU31 backport as the template:
[**Potion of Leaping (Jump Boost) and Water Breathing**](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/commit/b7a07cfb)
(`b7a07cfb`), plus the follow-up
[**creative-menu fix**](https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/commit/a5455295)
(`a5455295`) — which is the gotcha section below. Both `MobEffect::jump` (id 8)
and `MobEffect::waterBreathing` (id 13) already existed as effects; the TU31
work was making them *brewable and obtainable*.

For the worked example we'll add a **Potion of Haste** (using the existing
`MobEffect::digSpeed`, id 3) so the effect side is already done and we can focus
on the potion plumbing — then note what changes if your effect is brand new.

Keep the [Mob Effects reference](/slop-docs/world/effects/) and
[Brewing reference](/slop-docs/world/effects/) open.

## Part A — the MobEffect (skip if reusing an existing effect)

Effects live on the `MobEffect` base class (`MobEffect.h`): a
`static MobEffect *effects[NUM_EFFECTS]` array (`NUM_EFFECTS = 32`) plus 23 named
statics (`movementSpeed`…`saturation`) and 8 `reserved_24..31` free slots.
Registration is one fluent line per effect in `MobEffect::staticCtor()`. Water
Breathing (id 13) is a clean template (`MobEffect.cpp:62`):

```cpp
waterBreathing = (new MobEffect(13, false, eMinecraftColour_Effect_WaterBreathing))
    ->setDescriptionId(IDS_POTION_WATERBREATHING)
    ->setPostfixDescriptionId(IDS_POTION_WATERBREATHING_POSTFIX)
    ->setIcon(MobEffect::e_MobEffectIcon_WaterBreathing);
```

The ctor takes `(id, bool isHarmful, eMinecraftColour color)`. The builder
methods:

| Method | Purpose |
|---|---|
| `setDescriptionId(IDS_…)` | the effect's display name string |
| `setPostfixDescriptionId(IDS_…)` | the "(2:30)" style postfix name |
| `setIcon(e_MobEffectIcon_…)` | which HUD icon (enum in `MobEffect.h:13`) |
| `setDurationModifier(d)` | scales default duration (harmful effects default to 0.5) |
| `addAttributeModifier(attr, modifierId, amount, op)` | attach a `SharedMonsterAttributes` modifier (e.g. Jump/Speed/Strength) |

Jump Boost (id 8) is registered at `MobEffect.cpp:57`:

```cpp
jump = (new MobEffect(8, false, eMinecraftColour_Effect_Jump))
    ->setDescriptionId(IDS_POTION_JUMP)
    ->setPostfixDescriptionId(IDS_POTION_JUMP_POSTFIX)
    ->setIcon(MobEffect::e_MobEffectIcon_JumpBoost);
```

**To add a brand-new effect**, take one of the `reserved_24..31` slots
(`MobEffect.h:66`; they're `nullptr` in `staticCtor` today), register it exactly
like above, and — if it modifies a stat — call `addAttributeModifier`. Instant
effects (heal/harm/saturation) use the `InstantenousMobEffect` subclass instead
of plain `MobEffect`. For our Haste potion we reuse `digSpeed` (id 3), which is
already fully registered, so **Part A is nothing** — the effect exists.

## Part B — the potion aux-value masks

Every potion is `Item::potion` with an aux value built from bit masks defined in
`Minecraft.Client/Common/Potion_Macros.h`. The effect masks (`Potion_Macros.h:5`):

| Mask | Value | Effect |
|---|---|---|
| `MASK_REGENERATION` | `0x2001` | Regeneration |
| `MASK_SPEED` | `0x2002` | Swiftness |
| `MASK_FIRE_RESISTANCE` | `0x2003` | Fire Resistance |
| `MASK_POISON` | `0x2004` | Poison |
| `MASK_INSTANTHEALTH` | `0x2005` | Healing |
| `MASK_NIGHTVISION` | `0x2006` | Night Vision |
| `MASK_WEAKNESS` | `0x2008` | Weakness |
| `MASK_STRENGTH` | `0x2009` | Strength |
| `MASK_SLOWNESS` | `0x200A` | Slowness |
| `MASK_JUMPBOOST` | `0x200B` | Leaping (TU31) |
| `MASK_INSTANTDAMAGE` | `0x200C` | Harming |
| `MASK_INVISIBILITY` | `0x200E` | Invisibility |
| `MASK_WATERBREATHING` | `0x200F` | Water Breathing (TU31) |

Bit 13 (`0x2000`, `MASK_BIT13`) marks a *functional* potion (set on every real
brew so netherwart can't "reset" it). Modifier masks: `MASK_SPLASH` (`0x4000`),
`MASK_LEVEL2` (`0x0020`), `MASK_EXTENDED` (`0x0040`), `MASK_LEVEL2EXTENDED`
(`0x0060`). An aux value is assembled with
`MACRO_MAKEPOTION_AUXVAL(type, strength, effect)`.

:::caution[The mask values are fragile]
The TU31 author left a warning in `Potion_Macros.h:20-24` when adding Jump Boost /
Water Breathing:

> *"if youre adding a new potion, i genuinely hope you know what youre doing … i
> legit had to guess for both waterbreathing and jump boost. dont do 0x2007 or
> 0x200D btw, they show up as 'artless potion' and 'clear potion' resectively."*

The low nibble is an effect discriminator that the brewing math also reads.
**Don't invent a new mask value out of thin air** — pick one whose bits round-trip
through the brewing formula (below) or you'll get a broken/"mundane" potion.
:::

For Potion of Haste you'd add, alongside the others:

```cpp
// Potion_Macros.h
#define MASK_HASTE  0x200?   // <-- pick a free low nibble; NOT 0x2007 or 0x200D
                             //     (both are called out in the caution above), and
                             //     verify it round-trips through the brewing formula

#define MACRO_POTION_IS_HASTE(aux)  ((aux & 0x200F) == MASK_HASTE)
```

## Part C — the brewing recipe

A brewed potion's aux value is transformed by an *ingredient formula* string.
Each brewing ingredient is a normal [item](/slop-docs/modding/adding-items/) that
carries a formula via `setPotionBrewingFormula(...)`. Rabbit's Foot → Jump Boost
and Pufferfish → Water Breathing are the TU31 examples (`Item.cpp:542` / `:410`):

```cpp
Item::rabbit_foot = (new Item(158))
    ->setIconName(L"rabbitsFoot")->setDescriptionId(IDS_ITEM_RABBIT_FOOT)
    ->setUseDescriptionId(IDS_DESC_RABBIT_FOOT)
    ->setPotionBrewingFormula(PotionBrewing::MOD_RABBITS_FOOT);

Item::raw_fish = (new FishFoodItem(93, false))
    ->setIconName(L"fishRaw")-> ...
    ->setPotionBrewingFormula(PotionBrewing::MOD_PUFFERFISH);
```

The formula strings are defined in `PotionBrewing.cpp` (the `_SIMPLIFIED_BREWING`
branch, `:71`+) — bit-toggle expressions applied to the potion aux:

```cpp
const wstring PotionBrewing::MOD_RABBITS_FOOT = L"+0+1-2+3&4-4+13";
const wstring PotionBrewing::MOD_PUFFERFISH   = L"+0+1+2+3&4-4+13";
```

`+n` sets bit n, `-n` clears it, `&n-n` requires-then-clears (a gate), `+13` sets
the functional bit. There's also a duration/amplifier table in
`PotionBrewing::staticCtor()` (`PotionBrewing.cpp:100`). The TU31 fix added a
Jump-Boost amplifier so a Level II Leaping potion works (`PotionBrewing.cpp:131`):

```cpp
potionEffectAmplifier.insert(intStringMap::value_type(MobEffect::jump->getId(), L"5"));
```

For a new ingredient → effect, add a `MOD_<INGREDIENT>` string in
`PotionBrewing.cpp`, declare it in `PotionBrewing.h` (`:25`+), and attach it to
your ingredient item with `setPotionBrewingFormula`. The `BrewingStandMenu`
(`BrewingStandMenu.cpp`) already runs the formula on brew — including a
pufferfish-only guard at `:93` that restricts fish-food ingredients to the
pufferfish aux (3), which is worth noting if your ingredient is a multi-aux item.

## Part D — potion item forms (name + tooltip)

The `PotionItem` class (`PotionItem.h`) resolves an aux value to name, color,
and effects. The tooltip description is `PotionItem::getUseDescriptionId`
(`PotionItem.cpp:340`+) — a chain of `MACRO_POTION_IS_*` tests. The TU31 fix
added the two new ones (`PotionItem.cpp:356`):

```cpp
else if (MACRO_POTION_IS_WATERBREATHING(brew)) return IDS_POTION_DESC_WATERBREATHING;
else if (MACRO_POTION_IS_JUMPBOOST(brew))      return IDS_POTION_DESC_JUMPBOOST;
```

For Potion of Haste, add your line to the same chain:

```cpp
else if (MACRO_POTION_IS_HASTE(brew)) return IDS_POTION_DESC_HASTE;
```

## Part E — the creative menu (the gotcha)

**This is the step people forget.** A potion that brews correctly still won't
appear in the Creative inventory unless you add its aux value to the creative
potion tabs. The TU31 effects worked in survival but were invisible in creative
until the follow-up fix `a5455295` ("fix: tu31 potions in creative menu + level
2 abilities").

The creative potion entries live in `IUIScene_CreativeMenu::staticCtor()`
(`IUIScene_CreativeMenu.cpp`, the `eCreativeInventory_Potions_*` groups). The
fix added a matched pair of lines to **every** potion tier — regular, splash,
Level II, extended, and Level II-extended:

```cpp
// tu31 potions
ITEM_AUX(Item::potion_Id, MACRO_MAKEPOTION_AUXVAL(0, 0, MASK_WATERBREATHING))
ITEM_AUX(Item::potion_Id, MACRO_MAKEPOTION_AUXVAL(0, 0, MASK_JUMPBOOST))
// end of tu31 potions
...
ITEM_AUX(Item::potion_Id, MACRO_MAKEPOTION_AUXVAL(MASK_SPLASH, 0, MASK_WATERBREATHING))
ITEM_AUX(Item::potion_Id, MACRO_MAKEPOTION_AUXVAL(MASK_SPLASH, 0, MASK_JUMPBOOST))
...
ITEM_AUX(Item::potion_Id, MACRO_MAKEPOTION_AUXVAL(0, MASK_LEVEL2, MASK_WATERBREATHING))
ITEM_AUX(Item::potion_Id, MACRO_MAKEPOTION_AUXVAL(0, MASK_LEVEL2, MASK_JUMPBOOST))
```

For Potion of Haste, add the same pattern for each tier you want available in
creative:

```cpp
ITEM_AUX(Item::potion_Id, MACRO_MAKEPOTION_AUXVAL(0, 0, MASK_HASTE))
ITEM_AUX(Item::potion_Id, MACRO_MAKEPOTION_AUXVAL(MASK_SPLASH, 0, MASK_HASTE))
```

:::note
The fix author also noted that Water Breathing had a spurious Level II entry in
the vanilla creative tables ("i have no idea why water breathing had a level 2
version"). Only add the tiers that make sense for your effect — a
non-amplifiable effect shouldn't get a `MASK_LEVEL2` entry.
:::

## Part F — strings / localization

Add the effect name (Part A) and the potion tooltip description (Part D) to
`Minecraft.Client/Windows64Media/loc/stringsGeneric.xml`. The TU31 creative fix
added the two potion descriptions there (`stringsGeneric.xml`, next to the other
`IDS_POTION_DESC_*`):

```xml
<data name="IDS_POTION_DESC_WATERBREATHING">
    <value>Allows affected players to breathe normally underwater.</value>
</data>
<data name="IDS_POTION_DESC_JUMPBOOST">
    <value>Increases the jump height of the affected player.</value>
</data>
```

For Haste, add `IDS_POTION_DESC_HASTE` and (if the effect is new) its
`IDS_POTION_HASTE` / `IDS_POTION_HASTE_POSTFIX` name strings. The build's
strings pipeline picks them up automatically — see
[localization](/slop-docs/client/resources/).

## Part G — potion icon / color

The potion item is a single sprite tinted by the effect color. `PotionItem`
computes the liquid color from the aux value (`PotionItem::getColor`,
`PotionItem.h`), and the tint comes from the `eMinecraftColour` you passed to the
`MobEffect` ctor plus the `colours.xml` table
(`Common/res/TitleUpdate/res/colours.xml` — the b7a07cfb commit touched this file
for the new effects). If you're reusing an existing effect (like Haste/digSpeed),
its color already exists. For a brand-new effect, add its `eMinecraftColour_Effect_*`
entry and a `colours.xml` row so the bottle tints correctly. See the
[color table docs](/slop-docs/client/resources/).

## Testing checklist

- [ ] New source (if any) is in `cmake/sources/Common.cmake`; the project configures and compiles.
- [ ] The effect exists and applies — drink/`/effect` it and confirm the HUD icon, name, and behavior (attribute modifier or instant effect).
- [ ] The brewing recipe works — put the base potion + your ingredient in a brewing stand and get the right potion out (aux value round-trips through the formula; bit 13 stays set).
- [ ] The potion name and tooltip resolve — no missing-string placeholder (`IDS_POTION_DESC_*` present).
- [ ] **The potion shows in the Creative menu** — this is the step the TU31 backport initially missed. Check every tier you added (regular / splash / Level II / extended).
- [ ] Splash variant throws and applies to nearby entities.
- [ ] The bottle is tinted the correct color (effect color + `colours.xml`).
- [ ] Brew, save, quit, reload — the potion's aux value persists in the save.

## Where to go next

- [Mob Effects reference](/slop-docs/world/effects/) — every effect id, color, icon and attribute modifier.
- [Brewing reference](/slop-docs/world/effects/) — the full ingredient → formula table.
- [Adding Items](/slop-docs/modding/adding-items/) — for a new brewing ingredient item.
- [Custom Particles](/slop-docs/modding/custom-particles/) — potion splash/effect particles.

---
title: Items
description: Complete documentation of the LCE item system.
---

The item system in LCE is built around the `Item` base class. Every non-block item gets a numeric ID starting at **256** (the constructor adds +256 internally). The global registry can hold up to **32,000** slots.

For the full architecture (base class, ItemInstance, registration system, class hierarchy, crafting menu enums), head over to the **[Item System Overview](/slop-docs/world/items/overview/)**.

## Item Categories

| Category | Description |
|----------|-------------|
| [Item System Overview](/slop-docs/world/items/overview/) | Base Item class, ItemInstance, registration, ID offset, class hierarchy, eMaterial/eBaseItemType enums |
| [Tools & Weapons](/slop-docs/world/items/tools/) | Swords, pickaxes, axes, shovels, hoes, shears, fishing rod. Tool tiers, durability, speed, damage |
| [Armor](/slop-docs/world/items/armor/) | All armor materials, defense values, durability, slots, leather dyeing |
| [Food](/slop-docs/world/items/food/) | Nutrition, saturation, exhaustion, all food types, golden apples, seed foods |
| [Combat Items](/slop-docs/world/items/combat/) | Bow, arrows, snowballs, ender pearls, fire charges, potions, brewing ingredients |
| [Music Discs](/slop-docs/world/items/music-discs/) | All disc IDs, RecordingItem internals, jukebox interaction |
| [Decorative & Placement](/slop-docs/world/items/decorative/) | Paintings, item frames, signs, buckets, dyes, maps, books, beds, doors, minecarts |
| [Raw Materials](/slop-docs/world/items/materials/) | Ingots, diamonds, redstone, glowstone dust, string, leather, crafting ingredients, seeds |
| [Special Items](/slop-docs/world/items/special/) | Spawn eggs (MonsterPlacerItem), enchanted books, maps, compass, clock |

## Complete Item ID Registry

For a quick reference of all item IDs, see the [Item ID Registry](/slop-docs/reference/item-ids/) in the Reference section.

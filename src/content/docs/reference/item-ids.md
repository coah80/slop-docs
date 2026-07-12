---
title: Item ID Registry
description: Every non-block item ID registered in neoLegacy, with its constant, class, icon, and TU flag.
---

Complete registry of the item IDs registered by `Item::staticCtor()`. Every entry is
extracted from **`Minecraft.World/Item.cpp:282-552`** (the body of `Item::staticCtor`)
cross-referenced with the `_Id` constants in **`Minecraft.World/Item.h:447-681`**.

For prose on the item system see [Items](/slop-docs/world/items/); for the newer-TU
additions flagged in the last column see [TU25](/slop-docs/features/tu25/),
[TU31](/slop-docs/features/tu31/), and [neoLegacy Additions](/slop-docs/features/neolegacy-additions/).

## How registration &amp; the 256 offset work

Item IDs live in a **256+ address space** so that IDs 0-255 can alias the block (tile)
IDs — a `TileItem` is auto-created for every block, and pure items begin above 255. The
`Item` constructor bakes the offset in:

```cpp
Item::Item(int id) : id(256 + id) { ... }   // Item.cpp:624
```

So the integer passed to `new XItem(n)` is an **offset**, and the real item ID is
`256 + n`. For example `Item::rabbit_stew = new BowlFoodItem(157, 10)` (`Item.cpp:367`)
has real ID `256 + 157 = 413`, which matches `rabbit_stew_Id = 413` (`Item.h:660`). Each
registration then chains a fluent builder:

```cpp
Item::apple = (new FoodItem(4, 4, FoodConstants::FOOD_SATURATION_LOW, false))
    ->setIconName(L"apple")
    ->setDescriptionId(IDS_ITEM_APPLE)
    ->setUseDescriptionId(IDS_DESC_APPLE);
```
(`Item.cpp:362`, real ID `256 + 4 = 260` = `apple_Id`)

The **ID** column below is the real ID (`256 + offset`); the **Offset** column is the
literal passed to the constructor. `ICON_DESCRIPTION_PREFIX = L"item."` (`Item.h:26`)
prefixes every localization key. The **Flag** column marks items added on top of
neoLegacy's TU19 base (see the linked feature pages).

## Tools, weapons &amp; armor

| ID | Offset | Constant (`Item.h`) | Class | Icon | Flag | Source |
|---:|---:|---|---|---|:---:|---|
| 256 | 0 | `iron_shovel_Id` | `ShovelItem` (IRON) | `shovelIron` | | `Item.cpp:292` |
| 257 | 1 | `iron_pickaxe_Id` | `PickaxeItem` (IRON) | `pickaxeIron` | | `Item.cpp:298` |
| 258 | 2 | `iron_axe_Id` | `HatchetItem` (IRON) | `hatchetIron` | | `Item.cpp:304` |
| 259 | 3 | `flint_and_steel_Id` | `FlintAndSteelItem` | `flint_and_steel` | | `Item.cpp:361` |
| 261 | 5 | `bow_Id` | `BowItem` | `bow` | | `Item.cpp:354` |
| 262 | 6 | `arrow_Id` | `Item` | `arrow` | | `Item.cpp:355` |
| 267 | 11 | `iron_sword_Id` | `WeaponItem` (IRON) | `swordIron` | | `Item.cpp:286` |
| 268 | 12 | `wooden_sword_Id` | `WeaponItem` (WOOD) | `swordWood` | | `Item.cpp:284` |
| 269 | 13 | `wooden_shovel_Id` | `ShovelItem` (WOOD) | `shovelWood` | | `Item.cpp:290` |
| 270 | 14 | `wooden_pickaxe_Id` | `PickaxeItem` (WOOD) | `pickaxeWood` | | `Item.cpp:296` |
| 271 | 15 | `wooden_axe_Id` | `HatchetItem` (WOOD) | `hatchetWood` | | `Item.cpp:302` |
| 272 | 16 | `stone_sword_Id` | `WeaponItem` (STONE) | `swordStone` | | `Item.cpp:285` |
| 273 | 17 | `stone_shovel_Id` | `ShovelItem` (STONE) | `shovelStone` | | `Item.cpp:291` |
| 274 | 18 | `stone_pickaxe_Id` | `PickaxeItem` (STONE) | `pickaxeStone` | | `Item.cpp:297` |
| 275 | 19 | `stone_axe_Id` | `HatchetItem` (STONE) | `hatchetStone` | | `Item.cpp:303` |
| 276 | 20 | `diamond_sword_Id` | `WeaponItem` (DIAMOND) | `swordDiamond` | | `Item.cpp:287` |
| 277 | 21 | `diamond_shovel_Id` | `ShovelItem` (DIAMOND) | `shovelDiamond` | | `Item.cpp:293` |
| 278 | 22 | `diamond_pickaxe_Id` | `PickaxeItem` (DIAMOND) | `pickaxeDiamond` | | `Item.cpp:299` |
| 279 | 23 | `diamond_axe_Id` | `HatchetItem` (DIAMOND) | `hatchetDiamond` | | `Item.cpp:305` |
| 283 | 27 | `golden_sword_Id` | `WeaponItem` (GOLD) | `swordGold` | | `Item.cpp:288` |
| 284 | 28 | `golden_shovel_Id` | `ShovelItem` (GOLD) | `shovelGold` | | `Item.cpp:294` |
| 285 | 29 | `golden_pickaxe_Id` | `PickaxeItem` (GOLD) | `pickaxeGold` | | `Item.cpp:300` |
| 286 | 30 | `golden_axe_Id` | `HatchetItem` (GOLD) | `hatchetGold` | | `Item.cpp:306` |
| 290 | 34 | `wooden_hoe_Id` | `HoeItem` (WOOD) | `hoeWood` | | `Item.cpp:308` |
| 291 | 35 | `stone_hoe_Id` | `HoeItem` (STONE) | `hoeStone` | | `Item.cpp:309` |
| 292 | 36 | `iron_hoe_Id` | `HoeItem` (IRON) | `hoeIron` | | `Item.cpp:310` |
| 293 | 37 | `diamond_hoe_Id` | `HoeItem` (DIAMOND) | `hoeDiamond` | | `Item.cpp:311` |
| 294 | 38 | `golden_hoe_Id` | `HoeItem` (GOLD) | `hoeGold` | | `Item.cpp:312` |
| 298 | 42 | `leather_helmet_Id` | `ArmorItem` (CLOTH) | `helmetCloth` | | `Item.cpp:317` |
| 299 | 43 | `leather_chestplate_Id` | `ArmorItem` (CLOTH) | `chestplateCloth` | | `Item.cpp:322` |
| 300 | 44 | `leather_leggings_Id` | `ArmorItem` (CLOTH) | `leggingsCloth` | | `Item.cpp:327` |
| 301 | 45 | `leather_boots_Id` | `ArmorItem` (CLOTH) | `bootsCloth` | | `Item.cpp:337` |
| 302 | 46 | `chainmail_helmet_Id` | `ArmorItem` (CHAIN) | `helmetChain` | | `Item.cpp:332` |
| 303 | 47 | `chainmail_chestplate_Id` | `ArmorItem` (CHAIN) | `chestplateChain` | | `Item.cpp:333` |
| 304 | 48 | `chainmail_leggings_Id` | `ArmorItem` (CHAIN) | `leggingsChain` | | `Item.cpp:334` |
| 305 | 49 | `chainmail_boots_Id` | `ArmorItem` (CHAIN) | `bootsChain` | | `Item.cpp:335` |
| 306 | 50 | `iron_helmet_Id` | `ArmorItem` (IRON) | `helmetIron` | | `Item.cpp:318` |
| 307 | 51 | `iron_chestplate_Id` | `ArmorItem` (IRON) | `chestplateIron` | | `Item.cpp:323` |
| 308 | 52 | `iron_leggings_Id` | `ArmorItem` (IRON) | `leggingsIron` | | `Item.cpp:328` |
| 309 | 53 | `iron_boots_Id` | `ArmorItem` (IRON) | `bootsIron` | | `Item.cpp:338` |
| 310 | 54 | `diamond_helmet_Id` | `ArmorItem` (DIAMOND) | `helmetDiamond` | | `Item.cpp:319` |
| 311 | 55 | `diamond_chestplate_Id` | `ArmorItem` (DIAMOND) | `chestplateDiamond` | | `Item.cpp:324` |
| 312 | 56 | `diamond_leggings_Id` | `ArmorItem` (DIAMOND) | `leggingsDiamond` | | `Item.cpp:329` |
| 313 | 57 | `diamond_boots_Id` | `ArmorItem` (DIAMOND) | `bootsDiamond` | | `Item.cpp:339` |
| 314 | 58 | `golden_helmet_Id` | `ArmorItem` (GOLD) | `helmetGold` | | `Item.cpp:320` |
| 315 | 59 | `golden_chestplate_Id` | `ArmorItem` (GOLD) | `chestplateGold` | | `Item.cpp:325` |
| 316 | 60 | `golden_leggings_Id` | `ArmorItem` (GOLD) | `leggingsGold` | | `Item.cpp:330` |
| 317 | 61 | `golden_boots_Id` | `ArmorItem` (GOLD) | `bootsGold` | | `Item.cpp:340` |
| 359 | 103 | `shears_Id` | `ShearsItem` | `shears` | | `Item.cpp:427` |
| 346 | 90 | `fishing_rod_Id` | `FishingRodItem` | `fishing_rod` | | `Item.cpp:408` |
| 443 | 187 | `elytra_Id` | `ElytraItem` | `elytra` | TU31 | `Item.cpp:547` |

## Materials, treasure &amp; misc

| ID | Offset | Constant (`Item.h`) | Class | Icon | Flag | Source |
|---:|---:|---|---|---|:---:|---|
| 260 | 4 | `apple_Id` | `FoodItem` | `apple` | | `Item.cpp:362` |
| 263 | 7 | `coal_Id` | `CoalItem` | `coal` | | `Item.cpp:363` |
| 264 | 8 | `diamond_Id` | `Item` | `diamond` | | `Item.cpp:364` |
| 265 | 9 | `iron_ingot_Id` | `Item` | `ingotIron` | | `Item.cpp:342` |
| 266 | 10 | `gold_ingot_Id` | `Item` | `ingotGold` | | `Item.cpp:343` |
| 280 | 24 | `stick_Id` | `Item` | `stick` | | `Item.cpp:365` |
| 281 | 25 | `bowl_Id` | `Item` | `bowl` | | `Item.cpp:348` |
| 282 | 26 | `mushroom_stew_Id` | `BowlFoodItem` | `mushroom_stew` | | `Item.cpp:366` |
| 287 | 31 | `string_Id` | `TilePlanterItem` (tripwire) | `string` | | `Item.cpp:369` |
| 288 | 32 | `feather_Id` | `Item` | `feather` | | `Item.cpp:370` |
| 289 | 33 | `gunpowder_Id` | `Item` | `sulphur` | | `Item.cpp:371` |
| 295 | 39 | `wheat_seeds_Id` | `SeedItem` | `seeds` | | `Item.cpp:374` |
| 296 | 40 | `wheat_Id` | `Item` | `wheat` | | `Item.cpp:375` |
| 297 | 41 | `bread_Id` | `FoodItem` | `bread` | | `Item.cpp:376` |
| 318 | 62 | `flint_Id` | `Item` | `flint` | | `Item.cpp:379` |
| 319 | 63 | `porkchop_Id` | `FoodItem` | `porkchopRaw` | | `Item.cpp:380` |
| 320 | 64 | `cooked_porkchop_Id` | `FoodItem` | `porkchopCooked` | | `Item.cpp:381` |
| 321 | 65 | `painting_Id` | `HangingEntityItem` (PAINTING) | `painting` | | `Item.cpp:382` |
| 322 | 66 | `golden_apple_Id` | `GoldenAppleItem` | `appleGold` | | `Item.cpp:384` |
| 323 | 67 | `standing_sign_Id` | `SignItem` | `sign` | | `Item.cpp:387` |
| 324 | 68 | `wooden_door_Id` | `DoorItem` (`doorWood`) | `doorWood` | | `Item.cpp:314` |
| 325 | 69 | `bucket_Id` | `BucketItem` | `bucket` | | `Item.cpp:347` |
| 326 | 70 | `water_bucket_Id` | `BucketItem` (water) | `bucketWater` | | `Item.cpp:350` |
| 327 | 71 | `lava_bucket_Id` | `BucketItem` (lava) | `bucketLava` | | `Item.cpp:351` |
| 328 | 72 | `minecart_Id` | `MinecartItem` (RIDEABLE) | `minecart` | | `Item.cpp:391` |
| 329 | 73 | `saddle_Id` | `SaddleItem` | `saddle` | | `Item.cpp:392` |
| 330 | 74 | `iron_door_Id` | `DoorItem` (`doorIron`) | `doorIron` | | `Item.cpp:315` |
| 331 | 75 | `redstone_Id` | `RedStoneItem` | `redstone` | | `Item.cpp:393` |
| 332 | 76 | `snowball_Id` | `SnowballItem` | `snowball` | | `Item.cpp:394` |
| 333 | 77 | `boat_Id` | `BoatItem` | `boat` | | `Item.cpp:396` |
| 334 | 78 | `leather_Id` | `Item` | `leather` | | `Item.cpp:398` |
| 335 | 79 | `milk_bucket_Id` | `MilkBucketItem` | `milk` | | `Item.cpp:352` |
| 336 | 80 | `brick_Id` | `Item` | `brick` | | `Item.cpp:399` |
| 337 | 81 | `clay_Id` | `Item` | `clay` | | `Item.cpp:400` |
| 338 | 82 | `reeds_Id` | `TilePlanterItem` (reeds) | `reeds` | | `Item.cpp:401` |
| 339 | 83 | `paper_Id` | `Item` | `paper` | | `Item.cpp:402` |
| 340 | 84 | `book_Id` | `BookItem` | `book` | | `Item.cpp:403` |
| 341 | 85 | `slime_ball_Id` | `Item` | `slimeball` | | `Item.cpp:404` |
| 342 | 86 | `chest_minecart_Id` | `MinecartItem` (CHEST) | `chest_minecart` | | `Item.cpp:405` |
| 343 | 87 | `furnace_minecart_Id` | `MinecartItem` (FURNACE) | `furnace_minecart` | | `Item.cpp:406` |
| 344 | 88 | `egg_Id` | `EggItem` | `egg` | | `Item.cpp:407` |
| 345 | 89 | `compass_Id` | `CompassItem` | `compass` | | `Item.cpp:357` |
| 347 | 91 | `clock_Id` | `ClockItem` | `clock` | | `Item.cpp:358` |
| 348 | 92 | `glowstone_dust_Id` | `Item` | `glowstone_dust` | | `Item.cpp:409` |
| 349 | 93 | `fish_Id` | `FishFoodItem` (raw) | `fishRaw` | | `Item.cpp:410` |
| 350 | 94 | `cooked_fish_Id` | `FishFoodItem` (cooked) | `fishCooked` | | `Item.cpp:411` |
| 351 | 95 | `dye_Id` | `DyePowderItem` | `dyePowder` | | `Item.cpp:413` |
| 352 | 96 | `bone_Id` | `Item` | `bone` | | `Item.cpp:415` |
| 353 | 97 | `sugar_Id` | `Item` | `sugar` | | `Item.cpp:416` |
| 354 | 98 | `cake_Id` | `TilePlanterItem` (cake) | `cake` | | `Item.cpp:419` |
| 355 | 99 | `bed_Id` | `BedItem` | `bed` | | `Item.cpp:421` |
| 356 | 100 | `repeater_Id` | `TilePlanterItem` (repeater) | `diode` | | `Item.cpp:423` |
| 357 | 101 | `cookie_Id` | `FoodItem` | `cookie` | | `Item.cpp:424` |
| 358 | 102 | `filled_map_Id` | `MapItem` | `map` | | `Item.cpp:359` |
| 360 | 104 | `melon_block_Id` | `FoodItem` (melon slice) | `melon` | | `Item.cpp:429` |
| 361 | 105 | `pumpkin_seeds_Id` | `SeedItem` (pumpkin) | `seeds_pumpkin` | | `Item.cpp:431` |
| 362 | 106 | `melon_seeds_Id` | `SeedItem` (melon) | `seeds_melon` | | `Item.cpp:432` |
| 363 | 107 | `beef_Id` | `FoodItem` | `beefRaw` | | `Item.cpp:434` |
| 364 | 108 | `cooked_beef_Id` | `FoodItem` | `beefCooked` | | `Item.cpp:435` |
| 365 | 109 | `chicken_Id` | `FoodItem` | `chickenRaw` | | `Item.cpp:436` |
| 366 | 110 | `cooked_chicken_Id` | `FoodItem` | `chickenCooked` | | `Item.cpp:437` |
| 367 | 111 | `rotten_flesh_Id` | `FoodItem` | `rottenFlesh` | | `Item.cpp:438` |
| 368 | 112 | `ender_pearl_Id` | `EnderpearlItem` | `ender_pearl` | | `Item.cpp:440` |
| 369 | 113 | `blaze_rod_Id` | `Item` | `blaze_rod` | | `Item.cpp:442` |
| 370 | 114 | `ghast_tear_Id` | `Item` | `ghast_tear` | | `Item.cpp:443` |
| 371 | 115 | `gold_nugget_Id` | `Item` | `gold_nugget` | | `Item.cpp:444` |
| 372 | 116 | `netherwart_seeds_Id` | `SeedItem` (nether wart) | `netherStalkSeeds` | | `Item.cpp:446` |
| 373 | 117 | `potion_Id` | `PotionItem` | `potion` | | `Item.cpp:448` |
| 374 | 118 | `glass_bottle_Id` | `BottleItem` | `glassBottle` | | `Item.cpp:449` |
| 375 | 119 | `spider_eye_Id` | `FoodItem` | `spider_eye` | | `Item.cpp:451` |
| 376 | 120 | `fermented_spider_eye_Id` | `Item` | `fermented_spider_eye` | | `Item.cpp:452` |
| 377 | 121 | `blaze_powder_Id` | `Item` | `blaze_powder` | | `Item.cpp:454` |
| 378 | 122 | `magma_cream_Id` | `Item` | `magma_cream` | | `Item.cpp:455` |
| 379 | 123 | `brewing_stand_Id` | `TilePlanterItem` (brewing) | `brewing_stand` | | `Item.cpp:457` |
| 380 | 124 | `cauldron_Id` | `TilePlanterItem` (cauldron) | `cauldron` | | `Item.cpp:458` |
| 381 | 125 | `eye_of_ender_Id` | `EnderEyeItem` | `eye_of_ender` | | `Item.cpp:459` |
| 382 | 126 | `speckled_melon_block_Id` | `Item` | `speckled_melon` | | `Item.cpp:460` |
| 383 | 127 | `spawn_egg_Id` | `SpawnEggItem` | `monsterPlacer` | | `Item.cpp:462` |
| 384 | 128 | `experience_bottle_Id` | `ExperienceItem` | `experience_bottle` | | `Item.cpp:465` |
| 385 | 129 | `fire_charge_Id` | `FireChargeItem` | `fireball` | | `Item.cpp:484` |
| 386 | 130 | `writable_book_Id` | `WritingBookItem` | `writable_book` | | `Item.cpp:496` |
| 387 | 131 | `written_book_Id` | `WrittenBookItem` | `written_book` | | `Item.cpp:497` |
| 388 | 132 | `emerald_Id` | `Item` | `emerald` | | `Item.cpp:499` |
| 389 | 133 | `item_frame_Id` | `HangingEntityItem` (ITEM_FRAME) | `frame` | | `Item.cpp:485` |
| 390 | 134 | `flower_pot_Id` | `TilePlanterItem` (flower pot) | `flower_pot` | | `Item.cpp:501` |
| 391 | 135 | `carrot_Id` | `SeedFoodItem` (carrots) | `carrots` | | `Item.cpp:503` |
| 392 | 136 | `potato_Id` | `SeedFoodItem` (potatoes) | `potato` | | `Item.cpp:504` |
| 393 | 137 | `baked_potato_Id` | `FoodItem` | `baked_potato` | | `Item.cpp:505` |
| 394 | 138 | `poisonous_potato_Id` | `FoodItem` | `poisonous_potato` | | `Item.cpp:506` |
| 395 | 139 | `map_Id` | `EmptyMapItem` | `map_empty` | | `Item.cpp:508` |
| 396 | 140 | `golden_carrot_Id` | `FoodItem` | `golden_carrot` | | `Item.cpp:510` |
| 397 | 141 | `skull_Id` | `SkullItem` | `skull` | | `Item.cpp:489` |
| 398 | 142 | `carrot_on_a_stick_Id` | `CarrotOnAStickItem` | `carrot_on_a_stick` | | `Item.cpp:512` |
| 399 | 143 | `nether_star_Id` | `SimpleFoiledItem` | `nether_star` | | `Item.cpp:513` |
| 400 | 144 | `pumpkin_pie_Id` | `FoodItem` | `pumpkin_pie` | | `Item.cpp:514` |
| 401 | 145 | `fireworks_Id` | `FireworksItem` | `fireworks` | TU31 | `Item.cpp:515` |
| 402 | 146 | `firework_charge_Id` | `FireworksChargeItem` | `fireworks_charge` | TU31 | `Item.cpp:516` |
| 403 | 147 | `enchanted_book_Id` | `EnchantedBookItem` | `enchanted_book` | | `Item.cpp:517` |
| 404 | 148 | `comparator_Id` | `TilePlanterItem` (comparator) | `comparator` | | `Item.cpp:518` |
| 405 | 149 | `nether_brick_Id` | `Item` | `netherbrick` | | `Item.cpp:519` |
| 406 | 150 | `quartz_Id` | `Item` | `netherquartz` | | `Item.cpp:520` |
| 407 | 151 | `tnt_minecart_Id` | `MinecartItem` (TNT) | `tnt_minecart` | | `Item.cpp:521` |
| 408 | 152 | `hopper_minecart_Id` | `MinecartItem` (HOPPER) | `hopper_minecart` | | `Item.cpp:522` |
| 409 | 153 | `prismarine_shard_Id` | `Item` | `prismarineShard` | TU31 | `Item.cpp:546` |
| 410 | 154 | `prismarine_crystals_Id` | `Item` | `prismarineCrystal` | TU31 | `Item.cpp:545` |
| 411 | 155 | `rabbit_Id` | `FoodItem` (raw rabbit) | `rabbitRaw` | TU31 | `Item.cpp:532` |
| 412 | 156 | `cooked_rabbit_Id` | `FoodItem` (cooked rabbit) | `rabbitCooked` | TU31 | `Item.cpp:533` |
| 413 | 157 | `rabbit_stew_Id` | `BowlFoodItem` | `rabbit_stew` | TU31 | `Item.cpp:367` |
| 414 | 158 | `rabbit_foot_Id` | `Item` | `rabbitsFoot` | TU31 | `Item.cpp:542` |
| 415 | 159 | `rabbit_hide_Id` | `Item` | `rabbitHide` | TU31 | `Item.cpp:541` |
| 416 | 160 | `armor_stand_Id` | `ArmorStandItem` | `armorStand` | TU31 | `Item.cpp:544` |
| 417 | 161 | `iron_horse_armor_Id` | `Item` | `iron_horse_armor` | | `Item.cpp:524` |
| 418 | 162 | `golden_horse_armor_Id` | `Item` | `golden_horse_armor` | | `Item.cpp:525` |
| 419 | 163 | `diamond_horse_armor_Id` | `Item` | `diamond_horse_armor` | | `Item.cpp:526` |
| 420 | 164 | `lead_Id` | `LeashItem` | `lead` | | `Item.cpp:527` |
| 421 | 165 | `name_tag_Id` | `NameTagItem` | `name_tag` | | `Item.cpp:528` |
| 423 | 167 | `mutton_Id` | `FoodItem` (raw mutton) | `muttonRaw` | TU31 | `Item.cpp:530` |
| 424 | 168 | `cooked_mutton_Id` | `FoodItem` (cooked mutton) | `muttonCooked` | TU31 | `Item.cpp:531` |
| 427 | 171 | `spruce_door_Id` | `DoorItem` (`doorSpruce`) | `doorSpruce` | TU25 | `Item.cpp:535` |
| 428 | 172 | `birch_door_Id` | `DoorItem` (`doorBirch`) | `doorBirch` | TU25 | `Item.cpp:536` |
| 429 | 173 | `jungle_door_Id` | `DoorItem` (`doorJungle`) | `doorJungle` | TU25 | `Item.cpp:537` |
| 430 | 174 | `acacia_door_Id` | `DoorItem` (`doorAcacia`) | `doorAcacia` | TU25 | `Item.cpp:538` |
| 431 | 175 | `dark_oak_door_Id` | `DoorItem` (`doorDark`) | `doorDark` | TU25 | `Item.cpp:539` |
| 434 | 178 | `beetroot_Id` | `FoodItem` | `beetroot` | TU31 | `Item.cpp:549` |
| 435 | 179 | `beetroot_seeds_Id` | `SeedItem` (beetroots) | `beetroot_seeds` | TU31 | `Item.cpp:550` |
| 436 | 180 | `beetroot_soup_Id` | `BowlFoodItem` | `beetroot_soup` | TU31 | `Item.cpp:551` |

## Music discs

Records use a distinct high ID block. The offsets 2000-2011 map to real IDs 2256-2267;
`Item::record_08` and `record_09`/`record_11`/`record_12` field names do **not** match
the disc name (the 4J-era ordering was reshuffled), so both the disc name and the
matching `record_*_Id` constant are shown.

| ID | Offset | Disc | Field | Constant (`Item.h`) | Source |
|---:|---:|---|---|---|---|
| 2256 | 2000 | `13` | `record_01` | `record_13_Id` | `Item.cpp:467` |
| 2257 | 2001 | `cat` | `record_02` | `record_cat_Id` | `Item.cpp:468` |
| 2258 | 2002 | `blocks` | `record_03` | `record_blocks_Id` | `Item.cpp:471` |
| 2259 | 2003 | `chirp` | `record_04` | `record_chirp_Id` | `Item.cpp:472` |
| 2260 | 2004 | `far` | `record_05` | `record_far_Id` | `Item.cpp:473` |
| 2261 | 2005 | `mall` | `record_06` | `record_mall_Id` | `Item.cpp:474` |
| 2262 | 2006 | `mellohi` | `record_07` | `record_mellohi_Id` | `Item.cpp:475` |
| 2263 | 2007 | `stal` | `record_09` | `record_stal_Id` | `Item.cpp:476` |
| 2264 | 2008 | `strad` | `record_10` | `record_strad_Id` | `Item.cpp:477` |
| 2265 | 2009 | `ward` | `record_11` | `record_ward_Id` | `Item.cpp:478` |
| 2266 | 2010 | `11` | `record_12` | `record_11_Id` | `Item.cpp:479` |
| 2267 | 2011 | `where are we now` | `record_08` | `record_wait_Id` | `Item.cpp:480` |

## Notes

- **ID = 256 + offset.** Every non-record item's real ID equals `256 +` the constructor
  argument (`Item::Item(int id) : id(256 + id)`, `Item.cpp:624`). Records pass offsets
  2000-2011 for real IDs 2256-2267.
- **Registration order &ne; ID order.** `staticCtor` groups items by category (tools,
  armor, materials, food, …), not by ID, and several TU31 items (rabbit/mutton/prismarine/
  armor stand/beetroot/elytra) are appended at the end (`Item.cpp:530-551`). The tables
  above are sorted by ID.
- **`elytra` has no offset literal.** `Item::elytra = new ElytraItem()` (`Item.cpp:547`);
  the offset 187 (real ID 443) is baked into `ElytraItem::ElytraItem() : Item(187)`
  (`ElytraItem.cpp:10`), matching `elytra_Id = 443` (`Item.h:677`).
- **Commented-out registrations.** The old `writable_book`/`written_book` prototype lines
  and a `TileItem` cake variant are commented out at `Item.cpp:492-494` and `:417-418`; the
  live entries are the ones tabled above.
- **Block-shadow items (IDs 0-255).** IDs below 256 are auto-generated `TileItem`s for
  blocks and are not registered here; see the [Block (Tile) ID Registry](/slop-docs/reference/block-ids/).
  A handful of block items get custom classes at `Tile.cpp:611-646`.
- **`ITEM_NUM_COUNT` = 32000** (`Item.h:34`) sizes the `Item::items` array, leaving ample
  headroom above the record IDs.

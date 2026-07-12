---
title: Glossary
description: A full index of every page in the LCE docs, organized by category.
---

Every page on this site, organized by section. Use this as a quick reference to find what you need.

## Overview

- [Introduction](/slop-docs/overview/introduction/) - What LCE is and what this documentation covers
- [Architecture](/slop-docs/overview/architecture/) - How the two-module setup works
- [Building & Compiling](/slop-docs/overview/building/) - How to build the project from source

## Minecraft.World

The game logic layer. Blocks, items, entities, world generation, networking, and everything that runs the actual game.

### Core Systems

- [Overview](/slop-docs/world/overview/) - High-level look at the World module
- [Blocks (Tiles)](/slop-docs/world/blocks/) - Every block type and the Tile class system
- [Entities](/slop-docs/world/entities/) - All entity types and the Entity class hierarchy
- [Tile Entities](/slop-docs/world/tile-entities/) - Block entities like chests, furnaces, signs

### World

- [World Generation](/slop-docs/world/worldgen/) - How worlds get generated
- [Biomes](/slop-docs/world/biomes/) - All biome types and the biome system
- [Structures](/slop-docs/world/structures/) - Generated structures like villages and strongholds

### Gameplay

- [AI & Goals](/slop-docs/world/ai-goals/) - The Goal-based AI system for mobs
- [Enchantments](/slop-docs/world/enchantments/) - All enchantment types and the enchantment system
- [Effects (Potions)](/slop-docs/world/effects/) - Potion effects and the MobEffect system
- [Crafting & Recipes](/slop-docs/world/crafting/) - Recipe types and the crafting system
- [Container Menus](/slop-docs/world/containers/) - Inventory and container menu system
- [Game Rules](/slop-docs/world/gamerules/) - All game rules and the GameRules system

### Infrastructure

- [Networking & Packets](/slop-docs/world/networking/) - Packet types and multiplayer networking
- [Level Storage & IO](/slop-docs/world/storage/) - Save/load and level storage

### Items

- [Items Overview](/slop-docs/world/items/overview/) - The Item class system and registration
- [Tools & Weapons](/slop-docs/world/items/tools/) - Swords, pickaxes, shovels, axes, hoes, bows
- [Armor](/slop-docs/world/items/armor/) - Helmets, chestplates, leggings, boots
- [Food](/slop-docs/world/items/food/) - All food items and hunger mechanics
- [Combat Items](/slop-docs/world/items/combat/) - Arrows, snowballs, ender pearls, potions
- [Music Discs](/slop-docs/world/items/music-discs/) - All music disc items
- [Decorative & Placement](/slop-docs/world/items/decorative/) - Signs, paintings, doors, beds, buckets
- [Raw Materials](/slop-docs/world/items/materials/) - Ingots, gems, dyes, and crafting materials
- [Special Items](/slop-docs/world/items/special/) - Maps, clocks, compasses, written books, spawn eggs

## Minecraft.Client

The rendering and UI layer. Everything the player sees and interacts with.

### Rendering

- [Overview](/slop-docs/client/overview/) - High-level look at the Client module
- [Rendering Pipeline](/slop-docs/client/rendering/) - How frames get drawn
- [Models](/slop-docs/client/models/) - Entity and block models
- [Particles](/slop-docs/client/particles/) - The particle system

### UI & Input

- [Screens & GUI](/slop-docs/client/screens/) - The SWF/Iggy UI system and all screen types
- [Input System](/slop-docs/client/input/) - Keyboard, mouse, and controller input
- [Settings](/slop-docs/client/settings/) - Game settings and options

### Resources

- [Textures & Resources](/slop-docs/client/textures/) - Texture loading, atlases, and resource management
- [Audio](/slop-docs/client/audio/) - Miles Sound System and audio playback

## Platform Code

Platform-specific code for each console and PC target.

- [Overview](/slop-docs/platforms/overview/) - How platform abstraction works
- [Windows 64](/slop-docs/platforms/windows64/) - The Win64 PC build target
- [Xbox 360](/slop-docs/platforms/xbox360/) - Xbox 360 platform code
- [Xbox One (Durango)](/slop-docs/platforms/durango/) - Xbox One platform code
- [PS3](/slop-docs/platforms/ps3/) - PlayStation 3 platform code
- [PS4 (Orbis)](/slop-docs/platforms/orbis/) - PlayStation 4 platform code
- [PS Vita](/slop-docs/platforms/psvita/) - PS Vita platform code
- [Dedicated Server](/slop-docs/platforms/dedicated-server/) - Standalone dedicated server module
- [DLC Pipeline](/slop-docs/platforms/dlc-pipeline/) - DLC pack system and content loading
- [Telemetry](/slop-docs/platforms/telemetry/) - Gameplay event tracking system
- [Leaderboards](/slop-docs/platforms/leaderboards/) - Persistent player stats and rankings
- [Tutorial System](/slop-docs/platforms/tutorial-system/) - In-game tutorial with tasks, hints, and constraints

## Modding Guide

Step-by-step guides for modifying the codebase.

- [Getting Started](/slop-docs/modding/getting-started/) - How to set up your environment and make your first change

### Blocks & World

- [Adding Blocks](/slop-docs/modding/adding-blocks/) - How to add new block types
- [Custom Materials](/slop-docs/modding/custom-materials/) - Creating custom block materials
- [Adding Biomes](/slop-docs/modding/adding-biomes/) - How to add new biomes
- [Custom World Generation](/slop-docs/modding/custom-worldgen/) - Modifying terrain generation
- [Custom Structures](/slop-docs/modding/custom-structures/) - Adding generated structures
- [Custom Dimensions](/slop-docs/modding/custom-dimensions/) - Creating new dimensions with portals
- [Fog & Sky Effects](/slop-docs/modding/fog-sky/) - Custom fog colors and sky rendering

### Items & Crafting

- [Adding Items](/slop-docs/modding/adding-items/) - How to add new items
- [Adding Recipes](/slop-docs/modding/adding-recipes/) - Crafting and smelting recipes
- [Custom Potions & Brewing](/slop-docs/modding/custom-potions/) - New potion effects and brewing recipes
- [Custom Enchantments](/slop-docs/modding/custom-enchantments/) - Advanced enchantment customization
- [Custom Loot Tables](/slop-docs/modding/custom-loot/) - Loot table creation and modification
- [Making a Full Ore](/slop-docs/modding/full-ore/) - End-to-end ore, tools, armor, and worldgen

### Entities & Mobs

- [Adding Entities](/slop-docs/modding/adding-entities/) - How to add new entities
- [Custom AI Behaviors](/slop-docs/modding/custom-ai/) - Goal-based AI for mobs
- [Custom Death Messages](/slop-docs/modding/custom-death-messages/) - Adding death message strings
- [Custom Villager Trades](/slop-docs/modding/custom-trades/) - Modifying villager trade lists

### UI & Visuals

- [Custom GUI Screens](/slop-docs/modding/custom-screens/) - SWF-based screen creation
- [Custom Container Menus](/slop-docs/modding/custom-containers/) - Inventory and crafting menus
- [Creative Mode Tabs](/slop-docs/modding/creative-tabs/) - Adding creative inventory tabs
- [Custom Paintings](/slop-docs/modding/custom-paintings/) - Adding new painting motifs
- [Custom Achievements](/slop-docs/modding/custom-achievements/) - Adding achievements

### Assets & Resources

- [Block Textures](/slop-docs/modding/block-textures/) - Terrain atlas and block texture system
- [Entity Models](/slop-docs/modding/entity-models/) - ModelPart-based entity models
- [Custom Animations](/slop-docs/modding/custom-animations/) - Entity animation system
- [Custom Particles](/slop-docs/modding/custom-particles/) - Adding particle effects
- [Custom Sounds & Music](/slop-docs/modding/custom-sounds/) - Audio and sound events
- [Texture Packs](/slop-docs/modding/texture-packs/) - The texture pack system and DLC format

### Gameplay & Systems

- [Custom Game Rules](/slop-docs/modding/custom-gamerules/) - Adding new game rules
- [Adding Commands](/slop-docs/modding/adding-commands/) - Chat commands
- [World Size Limits](/slop-docs/modding/world-size/) - Changing world boundaries
- [Splitscreen Modding](/slop-docs/modding/splitscreen/) - Splitscreen multiplayer system
- [Increasing Player Limit](/slop-docs/modding/player-limit/) - Changing max player count
- [Multiplayer & Packets](/slop-docs/modding/multiplayer/) - Custom packets and networking

## Mod Templates

Complete starter mods you can follow end-to-end. Each one teaches multiple systems at once.

- [Random Wooden House](/slop-docs/templates/random-house/) - A structure that spawns randomly with custom loot
- [Purple Dimension](/slop-docs/templates/purple-dimension/) - A custom dimension with terrain, fog, blocks, and a portal
- [Ruby Ore & Tools](/slop-docs/templates/ruby-tools/) - Full ore to tools to armor pipeline
- [Custom Mob](/slop-docs/templates/custom-mob/) - A hostile mob with AI, model, renderer, sounds, and drops
- [Enchantment & Potion](/slop-docs/templates/enchantment-potion/) - Vampiric enchantment and Levitation potion
- [Custom Workbench](/slop-docs/templates/custom-workbench/) - A 4x4 crafting grid with custom GUI
- [Textures from Scratch](/slop-docs/templates/texture-tutorial/) - Making, loading, and replacing textures

## MinecraftConsoles

Documentation for smartcmd's MinecraftConsoles fork, which builds on the LCE codebase with more content.

### Core Changes

- [Overview & Differences](/slop-docs/mc/overview/) - What MinecraftConsoles adds and changes
- [Attribute System](/slop-docs/mc/attributes/) - Entity attribute system
- [Behavior System](/slop-docs/mc/behaviors/) - Entity behavior system
- [Build System & CI](/slop-docs/mc/build/) - Build system and CI setup
- [Commands](/slop-docs/mc/commands/) - Command system changes

### New Content

- [New Blocks & Items](/slop-docs/mc/new-content/) - Blocks and items added by MinecraftConsoles
- [New Entities & Models](/slop-docs/mc/new-entities/) - Entities and models added
- [Horse Entities](/slop-docs/mc/horses/) - Horse entity implementation
- [Fireworks](/slop-docs/mc/fireworks/) - Firework rockets and stars

### Systems

- [Scoreboard & Teams](/slop-docs/mc/scoreboard/) - Scoreboard and team system
- [Redstone Mechanics](/slop-docs/mc/redstone/) - Redstone system changes
- [Hoppers & Droppers](/slop-docs/mc/hoppers-droppers/) - Hopper and dropper mechanics
- [Minecart Variants](/slop-docs/mc/minecarts/) - Minecart types

## Reference

Lookup tables and indexes for quick reference.

- [Block ID Registry](/slop-docs/reference/block-ids/) - Every block ID
- [Item ID Registry](/slop-docs/reference/item-ids/) - Every item ID
- [Entity Type Registry](/slop-docs/reference/entity-types/) - Every entity type
- [Packet ID Registry](/slop-docs/reference/packet-ids/) - Every packet ID
- [Tile Class Index](/slop-docs/reference/tile-classes/) - Every Tile subclass
- [Complete File Index](/slop-docs/reference/file-index/) - Every source file in the codebase
- [Console Enums & Structs](/slop-docs/reference/console-enums/) - Core defines, enums, and data structures from Common/

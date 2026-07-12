---
title: "Overview & Differences"
description: "How MinecraftConsoles differs from LCE."
---

MinecraftConsoles is a community fork of the Legacy Console Edition source code, maintained by **smartcmd** and contributors. It's built on the same TU19 (v1.6.0560.0) codebase that LCEMP uses, and it credits LCEMP for its multiplayer networking implementation. While LCEMP focuses on preserving and documenting the original 4J Studios code, MinecraftConsoles pushes things forward with modern tooling, new gameplay systems, and a bigger feature set.

## At a glance

| | **LCEMP** | **MinecraftConsoles** |
|---|---|---|
| Source files | ~2,959 | ~3,968 |
| C++ standard | C++11 | C++17 |
| Commits | -- | 409+ |
| CI | -- | GitHub Actions (build, debug-test, nightly) |
| Build system | Visual Studio solution | Visual Studio solution + CMake |
| Platform | Windows | Windows (Linux via Wine unofficial) |

## New systems

MinecraftConsoles adds a ton of gameplay systems that don't exist in LCEMP. Each one has its own page with more details.

### Entity attributes and combat

A full [attribute system](/slop-docs/mc/attributes/) with modifier operations (`ADDITION`, `MULTIPLY_BASE`, `MULTIPLY_TOTAL`), shared monster attributes (max health, follow range, knockback resistance, movement speed, attack damage), and a combat tracker that records damage entries and generates death messages. Seven attribute types and twelve named modifier IDs are defined.

### Scoreboard and teams

A complete [scoreboard system](/slop-docs/mc/scoreboard/) with objectives, criteria (`dummy`, `deathCount`, `playerKillCount`, `totalKillCount`, `health`), player scores, display slots (list, sidebar, below-name), and player teams with friendly-fire and invisibility options. Includes a `ServerScoreboard` subclass that tracks objectives and sends packets to clients.

### Horse entities

Full [horse entities](/slop-docs/mc/horses/) with five types (horse, donkey, mule, zombie, skeleton), seven coat variants, five markings, four armor tiers (none, iron, gold, diamond), saddle and chest support, breeding, taming, jump strength attribute, and a dedicated inventory menu. Layered texture rendering combines variant, marking, and armor textures.

### Minecart variants

Multiple [minecart subtypes](/slop-docs/mc/minecarts/) beyond the base rideable minecart:

- **MinecartChest**, chest storage on rails
- **MinecartFurnace**, self-propelled furnace cart
- **MinecartHopper**, item collection on rails with cooldown and enable/disable via activator rail
- **MinecartTNT**, explosive cart with fuse, priming, and blast resistance checks
- **MinecartSpawner**, mob spawner on rails with its own `BaseMobSpawner` instance

### Hoppers and dispensers

The [hopper and dropper systems](/slop-docs/mc/hoppers-droppers/) handle item transfer logic with cooldown timing, item ejection, item suction from above, and container-to-container moves. The `DispenseItemBehavior` system provides a registry (`BehaviorRegistry`) that maps items to custom dispense actions.

### Fireworks

A [fireworks system](/slop-docs/mc/fireworks/) including `FireworksRocketEntity` (projectile with lifetime), `FireworksItem` (placement and hover text), `FireworksChargeItem`, `FireworksRecipe` (crafting), `FireworksMenu` (UI), and `FireworksParticles` (client-side rendering). Explosion types include small, big, star, creeper, and burst.

### Redstone

A full [redstone system](/slop-docs/mc/redstone/) with signal constants (`SIGNAL_NONE = 0`, `SIGNAL_MAX = 15`), comparators with compare and subtract modes, repeaters with four delay settings, daylight detectors, and powered rails with chain propagation up to 8 blocks.

### Wither Boss

`WitherBoss` entity implementing `Monster`, `RangedAttackMob`, and `BossMob` interfaces, with multi-head targeting (three heads), invulnerability phase, block destruction, ranged skull attacks, and boss health bar.

### Behavior and dispense registry

A [behavior system](/slop-docs/mc/behaviors/) with a `Behavior` base class and `BehaviorRegistry` that maps `Item` pointers to `DispenseItemBehavior` instances, with a `DefaultDispenseItemBehavior` fallback (drops items as pickups). The `DispenserBootstrap` registers 15 item-specific dispense actions at startup.

### New blocks and items

MinecraftConsoles adds [many blocks and items](/slop-docs/mc/new-content/) beyond the LCEMP base, including stained glass (blocks and panes), hay bales, note blocks, jukeboxes, beacons, anvils, command blocks, flower pots, skulls, hoppers, droppers, comparators, daylight detectors, weighted pressure plates, wood and stone buttons, nether wart, soul sand, netherrack, and glowstone, along with items like leads, name tags, empty maps, spawn eggs, firework rockets, firework charges, and the Nether Star.

### New entities

Several [new entity types](/slop-docs/mc/new-entities/) are implemented, including horses, ocelots (both new AI and legacy versions), witches, the Wither boss, Wither skulls, bats, leash fence knots, and firework rockets.

### Commands

An expanded [command system](/slop-docs/mc/commands/) with binary packet-based dispatch and ten implemented commands (9 shared with LCEMP, only `/effect` is MC-exclusive). Several more commands exist in Java-reference form waiting to be ported.

### Build system

A [dual build system](/slop-docs/mc/build/) with the original Visual Studio solution and a newer CMake build, three GitHub Actions CI workflows, and clang-format code style enforcement.

## What LCEMP has that MinecraftConsoles does not

LCEMP includes a `ConsoleSaveFileSplit` system that doesn't exist in MinecraftConsoles. This handles splitting save data across multiple files for console memory constraints.

## Shared foundation

Both projects share the same TU19 base. The core entity system, world generation, tile system, chunk management, biome layers, networking packets, and rendering pipeline all come from the same 4J Studios C++ port of Minecraft Java Edition 1.6.4. The differences are in what each project has added on top of that shared base.

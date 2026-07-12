---
title: "Commands"
description: "New and enhanced commands in MinecraftConsoles."
---

MinecraftConsoles has a command system based on the 4J Studios console edition architecture. Commands use a binary packet-based dispatch instead of the text-parsing approach from Java Edition.

## Command architecture

### Base class: Command

**File**: `Minecraft.World/Command.h`, `.cpp`

All commands extend the abstract `Command` class.

```cpp
class Command
{
public:
    virtual EGameCommand getId() = 0;
    virtual int getPermissionLevel();
    virtual void execute(shared_ptr<CommandSender> source, byteArray commandData) = 0;
    virtual bool canExecute(shared_ptr<CommandSender> source);

    static void logAdminAction(...);
};
```

Permission levels:

| Level | Constant | Examples |
|-------|----------|----------|
| 0 | `LEVEL_ALL` | help, emote |
| 1 | `LEVEL_MODERATORS` | mute |
| 2 | `LEVEL_GAMEMASTERS` | seed, tp, give |
| 3 | `LEVEL_ADMINS` | whitelist, ban |
| 4 | `LEVEL_OWNERS` | stop, save-all |

Unlike Java Edition, commands receive `byteArray commandData` (a binary packet) instead of parsed string arguments. The default `getPermissionLevel()` returns `LEVEL_GAMEMASTERS` (2).

### Admin logging

Two static `logAdminAction()` overloads handle command logging:

- `logAdminAction(source, messageType, message, customData, additionalMessage)` for standard logging
- `logAdminAction(source, type, messageType, message, customData, additionalMessage)` with an extra type parameter

These use `ChatPacket::EChatPacketMessage` for message categorization. A static `AdminLogCommand *logger` pointer is set via `setLogger()`.

### Protected helper

`getPlayer(PlayerUID)` returns a `shared_ptr<ServerPlayer>` for a given player UID, used by commands that target specific players.

### CommandDispatcher

**File**: `Minecraft.World/CommandDispatcher.h`, `.cpp`

Routes commands by their `EGameCommand` enum value.

```cpp
class CommandDispatcher
{
    unordered_map<EGameCommand, Command*> commandsById;
    unordered_set<Command*> commands;

public:
    int performCommand(shared_ptr<CommandSender> sender, EGameCommand command, byteArray commandData);
    Command *addCommand(Command *command);
};
```

`performCommand()` checks `canExecute()` before running. If the sender doesn't have permission, a red "You do not have permission" message is shown (except in content packages). Returns an integer status code.

`addCommand()` registers a command and returns it for chaining.

### EGameCommand enum

**File**: `Minecraft.World/CommandsEnum.h`

```cpp
enum EGameCommand
{
    eGameCommand_DefaultGameMode,
    eGameCommand_Effect,
    eGameCommand_EnchantItem,
    eGameCommand_Experience,
    eGameCommand_GameMode,
    eGameCommand_Give,
    eGameCommand_Kill,
    eGameCommand_Time,
    eGameCommand_ToggleDownfall,
    eGameCommand_Teleport,
    eGameCommand_COUNT
};
```

The `eGameCommand_COUNT` value is 10, meaning there are 10 registered command types.

### CommandSender

**File**: `Minecraft.World/CommandSender.h`

The interface for anything that can send commands:

- `sendMessage(wstring message, EChatPacketMessage type, int customData, wstring additionalMessage)` sends feedback
- `hasPermission(EGameCommand command)` checks if the sender can use a command

`CommandBlockEntity` implements this interface directly.

## Implemented commands (C++)

These commands have native C++ implementations that are fully functional:

### GameModeCommand

**File**: `Minecraft.World/GameModeCommand.h`, `.cpp`

Changes a player's game mode. Permission level: `LEVEL_GAMEMASTERS`. Command ID: `eGameCommand_GameMode`.

Includes `getModeForString()` to parse the mode argument from the binary packet.

### DefaultGameModeCommand

**File**: `Minecraft.World/DefaultGameModeCommand.h`, `.cpp`

Sets the server's default game mode. Extends `GameModeCommand`. Command ID: `eGameCommand_DefaultGameMode`. Permission level: `LEVEL_GAMEMASTERS`.

### GiveItemCommand

**File**: `Minecraft.World/GiveItemCommand.h`, `.cpp`

Gives items to players. Permission level: `LEVEL_GAMEMASTERS`. Command ID: `eGameCommand_Give`.

Has a static `preparePacket()` helper that builds a `GameCommandPacket` with item ID, amount, aux value, and optional NBT tag string.

### KillCommand

**File**: `Minecraft.World/KillCommand.h`, `.cpp`

Kills the command sender. Permission level: `LEVEL_GAMEMASTERS`. Command ID: `eGameCommand_Kill`.

### TimeCommand

**File**: `Minecraft.World/TimeCommand.h`, `.cpp`

Sets or adds to the world time. Permission level: `LEVEL_GAMEMASTERS`. Command ID: `eGameCommand_Time`.

Methods: `doSetTime()` and `doAddTime()`. Has a static `preparePacket()` for toggling day/night via a packet.

### ToggleDownfallCommand

**File**: `Minecraft.World/ToggleDownfallCommand.h`, `.cpp`

Toggles weather. Permission level: `LEVEL_GAMEMASTERS`. Command ID: `eGameCommand_ToggleDownfall`.

### EnchantItemCommand

**File**: `Minecraft.World/EnchantItemCommand.h`, `.cpp`

Enchants a player's held item. Permission level: `LEVEL_GAMEMASTERS`. Command ID: `eGameCommand_EnchantItem`.

Has a static `preparePacket()` that takes enchantment ID and level (default 1).

### ExperienceCommand

**File**: `Minecraft.World/ExperienceCommand.h`, `.cpp`

Grants experience to a player. Permission level: `LEVEL_GAMEMASTERS`. Command ID: `eGameCommand_Experience`.

### TeleportCommand

**File**: `Minecraft.Client/TeleportCommand.h`, `.cpp`

Teleports players. Lives in `Minecraft.Client` rather than `Minecraft.World`, which is unusual. Command ID: `eGameCommand_Teleport`.

### EffectCommand

**File**: `Minecraft.World/EffectCommand.h`, `.cpp`

Applies or removes status effects from players. Permission level: `LEVEL_GAMEMASTERS`. Command ID: `eGameCommand_Effect`.

:::caution[Stub implementation]
The `execute()` method body is entirely commented out in the current source. The Java-style pseudocode in the comments shows the intended behavior: parse player name, effect ID, duration, and amplifier; apply or clear effects. The command is registered but does nothing when called.
:::

## Java reference commands (commented out)

Several command files have complete Java source code in block comments. These are reference implementations that haven't been ported to C++ yet. They exist only as `#if 0` blocks or Java code in comments.

### GameDifficultyCommand

**File**: `Minecraft.World/GameDifficultyCommand.h`

Sets the server difficulty. Accepts `peaceful`/`p`, `easy`/`e`, `normal`/`n`, `hard`/`h`, or numeric `0-3`. Tab-completion supported. Default permission level 2.

### GameRuleCommand

**File**: `Minecraft.World/GameRuleCommand.h`

Gets, sets, or lists game rules. With 0 args it lists all rules, with 1 arg it shows a rule value, with 2 args it sets a rule. Tab-completes rule names and `true`/`false` values. Default permission level 2.

### ShowSeedCommand

**File**: `Minecraft.World/ShowSeedCommand.h`

Displays the world seed. Allows execution in singleplayer regardless of permission level (overrides `canExecute()`). Default permission level 2.

### WeatherCommand

**File**: `Minecraft.World/WeatherCommand.h`

Sets weather to `clear`, `rain`, or `thunder` with an optional duration in seconds. Default duration is 300 to 600 seconds (randomly chosen). Tab-completes weather type names. Default permission level 2.

### PlaySoundCommand

**File**: `Minecraft.World/PlaySoundCommand.h`

Plays a sound at a location for a specific player. Supports position, volume, pitch, and minimum volume arguments. Handles the case where the player is too far away by either sending the sound at reduced volume from a closer position or throwing an error. Default permission level 2.

### SpreadPlayersCommand

**File**: `Minecraft.World/SpreadPlayersCommand.h`

Spreads players randomly across an area. Has a `MAX_ITERATION_COUNT` of 10,000 for the randomization algorithm. Default permission level 2.

### SetPlayerTimeoutCommand

**File**: `Minecraft.World/SetPlayerTimeoutCommand.h`

Sets the connection timeout for a player.

### AdminLogCommand

**File**: `Minecraft.World/AdminLogCommand.h`

The logging backend used by `Command::logAdminAction()`.

## GameRules

**File**: `Minecraft.World/GameRules.h`, `.cpp`

While the `GameRuleCommand` itself isn't ported, the `GameRules` class is implemented in C++. It stores game rules as typed values.

The inner `GameRule` class stores each rule as a `wstring` with cached `bool`, `int`, and `double` conversions.

Defined rules (4J converted from strings to integer constants):

| Rule constant | Purpose |
|---|---|
| `RULE_DOFIRETICK` | Fire spread |
| `RULE_MOBGRIEFING` | Mob block destruction |
| `RULE_KEEPINVENTORY` | Keep items on death |
| `RULE_DOMOBSPAWNING` | Mob spawning |
| `RULE_DOMOBLOOT` | Mob item drops |
| `RULE_DOTILEDROPS` | Block item drops |
| `RULE_COMMANDBLOCKOUTPUT` | Command block output to chat |
| `RULE_NATURAL_REGENERATION` | Natural health regeneration |
| `RULE_DAYLIGHT` | Daylight cycle |

`getBoolean(int rule)` is the main query method.

## EntitySelector

**File**: `Minecraft.World/EntitySelector.h`, `.cpp`

Used throughout the command and entity systems for filtering entities.

```cpp
class EntitySelector
{
public:
    static const EntitySelector *ENTITY_STILL_ALIVE;
    static const EntitySelector *CONTAINER_ENTITY_SELECTOR;
    virtual bool matches(shared_ptr<Entity> entity) const = 0;
};
```

Built-in selectors:

| Class | File | Purpose |
|-------|------|---------|
| `AliveEntitySelector` | `EntitySelector.cpp` | Matches entities that are still alive |
| `ContainerEntitySelector` | `EntitySelector.cpp` | Matches entities that are containers |
| `MobCanWearArmourEntitySelector` | `EntitySelector.cpp` | Matches mobs that can wear a specific armor item |
| `HorseEntitySelector` | `EntityHorse.h` | Matches horse entities (for breeding) |
| `LivingEntitySelector` | `WitherBoss.h` | Matches living entities (for Wither targeting) |

The two static singleton instances (`ENTITY_STILL_ALIVE`, `CONTAINER_ENTITY_SELECTOR`) are used throughout the codebase for common filtering operations.

:::note
This is not the `@a`/`@p`/`@r`/`@e` target selector system from Java Edition. The console edition uses a different packet-based player selection mechanism through its UI-driven command system.
:::

## Comparison with LCEMP

LCEMP has 9 of the 10 implemented commands. The shared commands are: `/gamemode`, `/give`, `/kill`, `/time`, `/toggledownfall`, `/tp`, `/enchant`, `/xp`, and `/defaultgamemode`. LCEMP has matching implementations for all of these (e.g. `EnchantItemCommand.h/cpp` with `eGameCommand_EnchantItem`, `ExperienceCommand.h/cpp` with `eGameCommand_Experience`, `DefaultGameModeCommand.h/cpp` with `eGameCommand_DefaultGameMode`).

The only implemented command in MinecraftConsoles but not in LCEMP is:

- `/effect` (stub, execute body is commented out)

All the Java-reference commands (difficulty, gamerule, seed, weather, playsound, spreadplayers) are also MC-only.

MinecraftConsoles also adds the `GameRules` system, `CommandBlock` / `CommandBlockEntity`, and the `EntitySelector` system, none of which exist in LCEMP.

## Dedicated Server Commands

LCEMP also has a completely separate text-based command system in the `Minecraft.Server/` module for the standalone dedicated server. This system uses `ServerCommand` and `ConsoleCommandDispatcher` instead of the binary packet-based `Command` and `CommandDispatcher` from `Minecraft.World`. The dedicated server has 27 commands typed into the server console (stop, tp, time, give, kick, ban, whitelist, etc.).

These two command systems overlap in functionality but are entirely separate implementations. See the [Dedicated Server](/slop-docs/platforms/dedicated-server/) page for the full command list and architecture.

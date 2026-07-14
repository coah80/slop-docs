---
title: Commands
description: The Command base class, the CommandDispatcher, and how neoLegacy runs console commands as GameCommandPacket round-trips instead of typed chat.
---

neoLegacy has no chat parser. There is no code that scans a chat line for a
leading `/` and splits it into `argv` — the Java `CommandDispatcher`/`Commands`
brigadier-style tree is **not** ported. Instead, every command is a small class
with an integer ID, triggered from the console's in-game menus, marshalled into a
`GameCommandPacket` (ID 167), sent to the server, and executed there. This is the
LCE console model, and it is the biggest structural delta from Java command
handling.

Files: `Command.h`/`Command.cpp`, `CommandDispatcher.h`/`.cpp`, `CommandsEnum.h`,
`CommandSender.h`, `GameCommandPacket.h`, plus one `*Command.cpp` per command.
Registration lives in `Minecraft.Client/ServerCommandDispatcher.cpp`.

## The Command base class

`class Command` (`Command.h:12`) is abstract. Each command implements three things
(`Command.h:30-33`):

```cpp
virtual EGameCommand getId() = 0;                                    // which command
virtual void execute(shared_ptr<CommandSender> source, byteArray commandData) = 0;
virtual bool canExecute(shared_ptr<CommandSender> source);          // permission gate
```

There is no argument string. `execute` receives a raw `byteArray` payload that each
command decodes itself with a `ByteArrayInputStream` + `DataInputStream`. For
example `GameModeCommand::execute` reads a player UID and an int mode
(`GameModeCommand.cpp:22-25`):

```cpp
ByteArrayInputStream bais(commandData);
DataInputStream dis(&bais);
PlayerUID uid = dis.readPlayerUID();
int modeId = dis.readInt();
```

The inverse — building that payload on the client — is a static
`preparePacket(...)` on each command that writes the fields and wraps them in a
`GameCommandPacket` (`GameModeCommand.cpp:39-47`). So each command class owns both
ends of its own wire format.

### Permission levels

`Command` defines five permission tiers (`Command.h:16-24`):

| Constant | Value | Java analogue |
|----------|-------|---------------|
| `LEVEL_ALL` | 0 | `help`, `emote` |
| `LEVEL_MODERATORS` | 1 | `mute` |
| `LEVEL_GAMEMASTERS` | 2 | `seed`, `tp`, `spawnpoint`, `give` |
| `LEVEL_ADMINS` | 3 | `whitelist`, `ban` |
| `LEVEL_OWNERS` | 4 | `stop`, `save-all` |

The default `getPermissionLevel()` returns `LEVEL_OWNERS` (`Command.cpp:12`), and
individual commands override it (e.g. `GameModeCommand::getPermissionLevel()`
returns `LEVEL_GAMEMASTERS`, `GameModeCommand.cpp:15`). **However, the level is
effectively vestigial**: `canExecute` just calls `source->hasPermission(getId())`
(`Command.cpp:15-18`), and the server implementation of `hasPermission` ignores the
level entirely — it returns a plain OP check (`ServerPlayer.cpp:2032-2042`):

```cpp
bool ServerPlayer::hasPermission(EGameCommand command)
{
    return server->getPlayers()->isOp(dynamic_pointer_cast<ServerPlayer>(...));
    // 4J: Removed permission level
}
```

On the client, `LocalPlayer::hasPermission` returns
`level->getLevelData()->getAllowCommands()` (`LocalPlayer.cpp:1339-1342`) — i.e. the
per-world "allow commands / cheats" toggle. So in practice a command runs if you
are OP (multiplayer server) or if cheats are enabled (local world); the five-tier
level table is retained from Java but not consulted.

## The command ID enum

Commands are keyed by `enum EGameCommand` (`CommandsEnum.h:3-15`) — a fixed enum,
not a string registry:

| Enum | Command class | Registered? |
|------|---------------|-------------|
| `eGameCommand_DefaultGameMode` | `DefaultGameModeCommand` | yes |
| `eGameCommand_Effect` | `EffectCommand` | **no** |
| `eGameCommand_EnchantItem` | `EnchantItemCommand` | yes |
| `eGameCommand_Experience` | `ExperienceCommand` | yes |
| `eGameCommand_GameMode` | `GameModeCommand` | yes |
| `eGameCommand_Give` | `GiveItemCommand` | yes |
| `eGameCommand_Kill` | `KillCommand` | yes |
| `eGameCommand_Time` | `TimeCommand` | yes |
| `eGameCommand_ToggleDownfall` | `ToggleDownfallCommand` | yes |
| `eGameCommand_Teleport` | `TeleportCommand` | yes |
| `eGameCommand_COUNT` | — | (terminator) |

`EffectCommand` is fully implemented — it has `getId()` returning
`eGameCommand_Effect`, a `getPermissionLevel()`, and an `execute()`
(`EffectCommand.cpp:5`, `:10`, `:20`) — but it is **not added to the dispatcher**
(see below), so no `performCommand(source, eGameCommand_Effect, ...)` call path
reaches it. It is dead-registered: the class exists, the enum slot exists, but the
wiring does not.

## The dispatcher

`class CommandDispatcher` (`CommandDispatcher.h:6`) is a two-map registry:

```cpp
unordered_map<EGameCommand, Command *> commandsById;
unordered_set<Command *> commands;
```

`addCommand(cmd)` inserts by `cmd->getId()` (`CommandDispatcher.cpp:31-36`).
`performCommand(sender, command, data)` looks the ID up, checks
`canExecute(sender)`, and calls `execute` (`CommandDispatcher.cpp:5-29`):

```cpp
auto it = commandsById.find(command);
if (it != commandsById.end()) {
    Command *command = it->second;
    if (command->canExecute(sender))
        command->execute(sender, commandData);
    else
        sender->sendMessage(L"§cYou do not have permission to use this command.");
} else {
    app.DebugPrintf("Command %d not found!\n", command);
}
```

An unregistered ID (like `eGameCommand_Effect`) falls into the `else` branch and is
logged as "Command N not found".

### Registration

The one and only registration site is `ServerCommandDispatcher` (a `CommandDispatcher`
subclass that also acts as the admin logger) in its constructor
(`ServerCommandDispatcher.cpp:10-53`):

```cpp
addCommand(new TimeCommand());
addCommand(new GameModeCommand());
addCommand(new DefaultGameModeCommand());
addCommand(new KillCommand());
addCommand(new ToggleDownfallCommand());
addCommand(new ExperienceCommand());
addCommand(new TeleportCommand());
addCommand(new GiveItemCommand());
addCommand(new EnchantItemCommand());
```

That is **nine** live commands. Everything else is commented out: the Java admin
commands (`OpCommand`, `StopCommand`, `SaveAllCommand`, ban/whitelist family,
`ListPlayersCommand`, …) are all present as `//addCommand(...)` lines
(`ServerCommandDispatcher.cpp:21-48`) but disabled, and `EffectCommand` is not in
the list at all. `Command::setLogger(this)` at the end of the constructor makes the
dispatcher the target for `logAdminAction` calls.

`TeleportCommand` lives in `Minecraft.Client` rather than `Minecraft.World`
(`Minecraft.Client/TeleportCommand.cpp`); it maps to `eGameCommand_Teleport`.

### Additional command headers (unbuilt)

Several `*Command.h` headers exist with no registration and, in most cases, no
`.cpp`: `GameDifficultyCommand.h`, `GameRuleCommand.h`, `PlaySoundCommand.h`,
`SetPlayerTimeoutCommand.h`, `ShowSeedCommand.h`, `SpreadPlayersCommand.h`,
`WeatherCommand.h`. These are leftover Java scaffolding, not usable commands.

## How a command runs: chat vs server console

There is no "typed into chat" path in neoLegacy — the console UI is the entry
point. The flow is identical whether triggered from a local host menu or a
multiplayer host:

1. **Trigger.** A menu action (host options, the coordinate/teleport screen, the
   creative give screen, etc.) calls a helper on `PlayerConnection` in
   `Minecraft.Client/PlayerConnection.cpp`. Those helpers call the command's static
   `preparePacket(...)` to serialize the arguments, e.g.
   `GiveItemCommand::preparePacket(target, item, amount, aux)`
   (`PlayerConnection.cpp:1412`).

2. **Marshal.** `preparePacket` returns a `GameCommandPacket` (`GameCommandPacket.h:7`)
   carrying `{ EGameCommand command; byteArray data; }` and reporting `getId()` = 167.

3. **Dispatch.** The connection calls
   `server->getCommandDispatcher()->performCommand(player, packet->command, packet->data)`
   (`PlayerConnection.cpp:1413`). On a local single-player host this is a direct
   in-process call; on a remote server the packet is sent over the wire and arrives
   at the server's `handleGameCommand`.

4. **Server receipt.** `PlayerConnection::handleGameCommand`
   (`PlayerConnection.cpp:1912-1941`) re-checks authorization on the server side and
   then calls `performCommand`:

   ```cpp
   MinecraftServer::getInstance()->getCommandDispatcher()->performCommand(
       player, packet->command, packet->data);
   ```

5. **Execute.** The dispatcher runs the matching `Command::execute`, which decodes
   the `byteArray` and applies the effect, sending a confirmation back via
   `source->sendMessage(...)`.

So "run from chat" and "run from the server console" collapse into the same
`GameCommandPacket` → `handleGameCommand` → `performCommand` → `execute` pipeline.
The only difference is who constructs the packet.

### Worked trace: `/give`, entry to feedback

Making the pipeline concrete with `GiveItemCommand`, and following the feedback
message all the way back to the issuer.

**1 — Marshal (client).** The give/creative screen calls
`GiveItemCommand::preparePacket(player, item, amount, aux, tag)`
(`GiveItemCommand.cpp:43`). It writes the target UID and fields into a byte buffer
and wraps them in a `GameCommandPacket` tagged `eGameCommand_Give` (`:50-56`):

```cpp
dos.writePlayerUID(player->getXuid());
dos.writeInt(item);  dos.writeInt(amount);  dos.writeInt(aux);  dos.writeUTF(tag);
return std::make_shared<GameCommandPacket>(eGameCommand_Give, baos.toByteArray());
```

That packet flows through the general pipeline above (send → `handleGameCommand`
re-auth → `performCommand`).

**2 — Execute (server).** `performCommand` calls `GiveItemCommand::execute`
(`GiveItemCommand.cpp:19`), which decodes the *same* byte layout it wrote, validates
the item id, and drops the stack onto the target player (`:19-40`):

```cpp
PlayerUID uid = dis.readPlayerUID();
int item = dis.readInt(), amount = dis.readInt(), aux = dis.readInt();
wstring tag = dis.readUTF();
shared_ptr<ServerPlayer> player = getPlayer(uid);
if (player != nullptr && item > 0 && Item::items[item] != nullptr) {
    shared_ptr<ItemInstance> itemInstance = std::make_shared<ItemInstance>(item, amount, aux);
    shared_ptr<ItemEntity> drop = player->drop(itemInstance);   // spawns the item
    drop->throwTime = 0;
    logAdminAction(source, ChatPacket::e_ChatCustom, L"commands.give.success", item, player->getAName());  // -> §3
}
```

Note the item is given by **dropping** it at the player (`player->drop(...)`), not by
inserting into a slot.

**3 — Feedback (`logAdminAction` → `sendMessage` → chat).** The confirmation path is
the command *logger*. `Command::logAdminAction` (`Command.cpp:20`) forwards to the
registered logger (`:29`), which is the `ServerCommandDispatcher` itself
(`Command::setLogger(this)` in its constructor). `ServerCommandDispatcher::logAdminCommand`
(`ServerCommandDispatcher.cpp:55`) would broadcast to other OPs (that branch is
commented out, `:65-66`) and, unless suppressed, sends the message to the issuer
(`:72`):

```cpp
if ((type & LOGTYPE_DONT_SHOW_TO_SELF) != LOGTYPE_DONT_SHOW_TO_SELF)
    source->sendMessage(message, messageType, customData, additionalMessage);
```

For a `ServerPlayer` source, `sendMessage` emits a `ChatPacket` back down that
player's connection, which the client renders as the `commands.give.success`
localized line. So the round-trip is: creative screen →
`GameCommandPacket(eGameCommand_Give)` → server `execute` (drop the stack) →
`logAdminAction` → `source->sendMessage` → `ChatPacket` back to the issuer.

### neoLegacy server-side hardening

On the dedicated Windows server build, `handleGameCommand` adds a **live OP
re-check** that the original 4J code did not have (`PlayerConnection.cpp:1914-1937`).
Rather than trusting the in-memory moderator flag (which can go stale if `ops.json`
is edited mid-session), it queries `ServerRuntime::Access::IsPlayerOp(cmdXuid)` for
non-host players and, on failure, logs the attempt and drops the command:

```cpp
app.DebugPrintf("SECURITY: Non-OP player %ls attempted server command id=%d\n", ...);
ServerRuntime::ServerLogManager::OnUnauthorizedCommand(...);
return;
```

This is a neoLegacy addition — the console client-side `hasPermission` check alone
was trivially bypassable by a modified client, so the authoritative re-check moved
to the server. See [Networking & Packets](/slop-docs/world/networking/) for the
matching input-validation hardening on the packet layer.

## The CommandSender interface

`class CommandSender` (`CommandSender.h:6`) is the tiny interface a command acts
on:

```cpp
virtual void sendMessage(const wstring& message, ChatPacket::EChatPacketMessage type = e_ChatCustom,
                         int customData = -1, const wstring& additionalMessage = L"") = 0;
virtual bool hasPermission(EGameCommand command) = 0;
```

It is implemented by `ServerPlayer` and `LocalPlayer` (the two `hasPermission`
bodies above) and by `CommandBlockEntity` (`CommandBlock.cpp`), which is how
command blocks issue commands through the same dispatcher. `EntitySelector.h`
(`@a`/`@p`/`@e`) exists for target resolution but is only used by the commands that
accept a target.

## The command roster

The nine live commands and what they do:

| Command | Enum | Effect |
|---------|------|--------|
| `TimeCommand` | `eGameCommand_Time` | Set/add world time (`TimeCommand::preparePacket(ticks)`) |
| `GameModeCommand` | `eGameCommand_GameMode` | Set a player's `GameType` (`GameType::byId`) |
| `DefaultGameModeCommand` | `eGameCommand_DefaultGameMode` | Set the world's default game mode |
| `KillCommand` | `eGameCommand_Kill` | Kill the invoking player (empty payload) or a target |
| `ToggleDownfallCommand` | `eGameCommand_ToggleDownfall` | Toggle rain/snow |
| `ExperienceCommand` | `eGameCommand_Experience` | Grant XP points/levels |
| `TeleportCommand` | `eGameCommand_Teleport` | Teleport a player (`Minecraft.Client`) |
| `GiveItemCommand` | `eGameCommand_Give` | Give an item stack (item + amount + aux data) |
| `EnchantItemCommand` | `eGameCommand_EnchantItem` | Enchant the held item |

`EffectCommand` (potion effects, `/effect` in Java) is implemented but **not
registered**, so it cannot be invoked in the current build.

## Related pages

- [Networking & Packets](/slop-docs/world/networking/) — `GameCommandPacket` (167) and the server-side authorization re-check.
- [Effects & Potions](/slop-docs/world/effects/) — the effect system the unregistered `EffectCommand` would drive.
- [Game Rules](/slop-docs/world/gamerules/) — likewise routed to console host options rather than a `/gamerule` command.
- [Enchantments](/slop-docs/world/enchantments/) — what `EnchantItemCommand` applies.

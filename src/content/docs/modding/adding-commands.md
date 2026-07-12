---
title: Adding Commands
description: Add a slash command to neoLegacy by subclassing Command, registering it in the dispatcher, and wiring the GameCommandPacket path — worked from the real TeleportCommand.
---

This is a step-by-step guide to adding a new server command. It walks the exact
files, classes, and registration lines used by the real `TeleportCommand`, which
is the cleanest full example in the tree (it has both a server executor and a
client-side packet builder).

Two things to understand before you start:

1. Commands in neoLegacy are **not parsed from text** by the `Command` classes.
   Every command has a numeric id (an `EGameCommand` enum value) and a binary
   payload. The `Command` subclass only *executes* a decoded payload. Text
   parsing (`/tp a b`) happens elsewhere and produces a `GameCommandPacket`.
2. All command execution is **server-side**. A `Command` runs inside the
   embedded/dedicated server (`MinecraftServer`), never on the client. The client
   just sends a `GameCommandPacket` (id 167).

See [World / Commands](/slop-docs/world/commands/) for the full command roster and
[Multiplayer & Packets](/slop-docs/modding/multiplayer-packets/) for the packet
mechanics referenced here.

## The pieces

| Piece | File | Role |
|-------|------|------|
| Base class | `Minecraft.World/Command.h` / `Command.cpp` | abstract `Command`, permission levels, admin logging |
| Command id enum | `Minecraft.World/CommandsEnum.h` | `enum EGameCommand` — one value per command |
| Sender interface | `Minecraft.World/CommandSender.h` | `sendMessage()`, `hasPermission()` (implemented by `ServerPlayer`) |
| Dispatcher | `Minecraft.World/CommandDispatcher.h` / `.cpp` | id → `Command*` map, permission gate |
| Server dispatcher | `Minecraft.Client/ServerCommandDispatcher.cpp` | the registration list (`addCommand(...)`) |
| Transport | `Minecraft.World/GameCommandPacket.h` / `.cpp` | packet id 167 carrying `(EGameCommand, byte[] data)` |
| Template | `Minecraft.Client/TeleportCommand.h` / `.cpp` | the command we mirror below |

## The base class

Every command derives from `Command` ([`Command.h:12`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/Command.h#L12)):

```cpp
class Command
{
public:
    static const int LEVEL_ALL = 0;
    static const int LEVEL_MODERATORS = 1;
    static const int LEVEL_GAMEMASTERS = 2;  // seed, tp, spawnpoint, give
    static const int LEVEL_ADMINS = 3;
    static const int LEVEL_OWNERS = 4;

    virtual EGameCommand getId() = 0;
    virtual int getPermissionLevel();
    virtual void execute(shared_ptr<CommandSender> source, byteArray commandData) = 0;
    virtual bool canExecute(shared_ptr<CommandSender> source);

    static void logAdminAction(shared_ptr<CommandSender> source,
        ChatPacket::EChatPacketMessage messageType, const wstring& message = L"",
        int customData = -1, const wstring& additionalMessage = L"");
    ...
};
```

The two pure-virtual methods you *must* override are `getId()` and `execute()`.
`getPermissionLevel()` and `canExecute()` have defaults (see the permissions
section below).

## Worked example: `SetSpawnCommand`

We'll add a `/setspawn` command that moves the world spawn point to a player's
position. It is deliberately shaped like `TeleportCommand` so you can compare
line-for-line.

### Step 1 — add an id to `EGameCommand`

Open [`Minecraft.World/CommandsEnum.h`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/CommandsEnum.h). Add your value **before** the
`eGameCommand_COUNT` sentinel so the count stays correct:

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
    eGameCommand_SetSpawn,   // <-- new
    eGameCommand_COUNT
};
```

The enum value is **serialized over the network** by `GameCommandPacket` (it is
written with `dos->writeInt(command)`, `GameCommandPacket.cpp:51`). Appending
before `eGameCommand_COUNT` keeps existing ids stable — do not reorder existing
entries, or you break protocol compatibility with older clients (see the
[protocol version warning](/slop-docs/modding/multiplayer-packets/)).

### Step 2 — create the command class

Create `Minecraft.Client/SetSpawnCommand.h`. `TeleportCommand` lives in
`Minecraft.Client` (not `Minecraft.World`) because its executor touches
`MinecraftServer`, `PlayerList`, and `ServerPlayer`, which are client-module
classes; follow the same placement.

```cpp
#pragma once

#include "../Minecraft.World/Command.h"

class GameCommandPacket;

class SetSpawnCommand : public Command
{
public:
    virtual EGameCommand getId();
    virtual int getPermissionLevel();
    virtual void execute(shared_ptr<CommandSender> source, byteArray commandData);

    static shared_ptr<GameCommandPacket> preparePacket(PlayerUID subject);
};
```

Compare to [`TeleportCommand.h`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/TeleportCommand.h): identical shape — `getId`, `execute`, and a static
`preparePacket` factory that builds the wire payload.

### Step 3 — implement the executor

Create `Minecraft.Client/SetSpawnCommand.cpp`. This mirrors
[`TeleportCommand.cpp`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/TeleportCommand.cpp): read the payload with a
`DataInputStream` over a `ByteArrayInputStream`, resolve the subject from the
`PlayerList`, act, then log the admin action.

```cpp
#include "stdafx.h"
#include "MinecraftServer.h"
#include "PlayerList.h"
#include "ServerPlayer.h"
#include "../Minecraft.World/net.minecraft.commands.h"
#include "../Minecraft.World/net.minecraft.network.packet.h"
#include "../Minecraft.World/net.minecraft.world.level.h"
#include "SetSpawnCommand.h"

EGameCommand SetSpawnCommand::getId()
{
    return eGameCommand_SetSpawn;
}

int SetSpawnCommand::getPermissionLevel()
{
    return LEVEL_GAMEMASTERS;   // same tier as /tp and /give
}

void SetSpawnCommand::execute(shared_ptr<CommandSender> source, byteArray commandData)
{
    ByteArrayInputStream bais(commandData);
    DataInputStream dis(&bais);
    PlayerUID subjectID = dis.readPlayerUID();

    PlayerList *players = MinecraftServer::getInstance()->getPlayerList();
    shared_ptr<ServerPlayer> subject = players->getPlayer(subjectID);
    if (subject == nullptr || !subject->isAlive())
        return;

    subject->level->setSpawnPos(
        (int)subject->x, (int)subject->y, (int)subject->z);

    logAdminAction(source, ChatPacket::e_ChatCustom, L"commands.setworldspawn.success");
}

shared_ptr<GameCommandPacket> SetSpawnCommand::preparePacket(PlayerUID subject)
{
    ByteArrayOutputStream baos;
    DataOutputStream dos(&baos);
    dos.writePlayerUID(subject);
    return std::make_shared<GameCommandPacket>(eGameCommand_SetSpawn, baos.toByteArray());
}
```

Key points, all taken from `TeleportCommand`:

- **Read the payload defensively.** `execute()` receives raw `byteArray`. Decode
  it in the exact order `preparePacket()` wrote it. In `TeleportCommand` the
  first byte is a flag distinguishing "tp to coords" from "tp to player"
  (`TeleportCommand.cpp:24`); use the same technique if your command has
  variants.
- **Always null-check the resolved player.** `players->getPlayer(...)` returns
  `nullptr` for an unknown/offline UID — `TeleportCommand.cpp:28` bails out
  exactly this way.
- **`logAdminAction`** routes a chat/localization message back to the sender (and
  potentially to ops). It is inherited from `Command`. The simplest form takes a
  localization key string, as `ToggleDownfallCommand::execute` does
  (`ToggleDownfallCommand.cpp:23`, `L"commands.downfall.success"`).

### Step 4 — register it in the dispatcher

Open [`Minecraft.Client/ServerCommandDispatcher.cpp`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/ServerCommandDispatcher.cpp). The constructor is the
whole registry — one `addCommand(new X())` per command
(`ServerCommandDispatcher.cpp:10-53`). Add yours next to the others:

```cpp
ServerCommandDispatcher::ServerCommandDispatcher()
{
    addCommand(new TimeCommand());
    addCommand(new GameModeCommand());
    addCommand(new DefaultGameModeCommand());
    addCommand(new KillCommand());
    addCommand(new ToggleDownfallCommand());
    addCommand(new ExperienceCommand());
    addCommand(new TeleportCommand());
    addCommand(new GiveItemCommand());
    addCommand(new EnchantItemCommand());
    addCommand(new SetSpawnCommand());   // <-- new
    ...
    Command::setLogger(this);
}
```

`addCommand` inserts the command into the id-keyed map
(`CommandDispatcher.cpp:31`):

```cpp
Command *CommandDispatcher::addCommand(Command *command)
{
    commandsById[command->getId()] = command;
    commands.insert(command);
    return command;
}
```

Add the include for `SetSpawnCommand.h` at the top of
`ServerCommandDispatcher.cpp` (the file already includes `TeleportCommand.h`).

`ServerCommandDispatcher` is instantiated once by the server at
`MinecraftServer.cpp:583` (`commandDispatcher = new ServerCommandDispatcher();`).

### Step 5 — invoke it (the two entry paths)

There are two ways execution is triggered. Both end at
`CommandDispatcher::performCommand`, which looks up the id, checks
`canExecute`, and calls `execute` (`CommandDispatcher.cpp:5-29`).

**Path A — from a `GameCommandPacket` sent by a client.** The client builds the
packet with your `preparePacket()` factory and sends it. On the server,
`PlayerConnection::handleGameCommand` (`PlayerConnection.cpp:1912`) receives it
and forwards to the dispatcher:

```cpp
void PlayerConnection::handleGameCommand(shared_ptr<GameCommandPacket> packet)
{
    ...
    MinecraftServer::getInstance()->getCommandDispatcher()
        ->performCommand(player, packet->command, packet->data);
}
```

**Path B — from a text command typed in chat or the server console.** Text is
parsed in `PlayerConnection::handleCommand` (`PlayerConnection.cpp:1035`), a big
`if (cmd == L"...")` chain. Each branch builds the payload and calls
`performCommand` directly. For `/tp` it does exactly this
(`PlayerConnection.cpp:1142`):

```cpp
shared_ptr<GameCommandPacket> gamePacket =
    TeleportCommand::preparePacket(tpTarget->getXuid(), x, y, z, yRot, xRot);
server->getCommandDispatcher()->performCommand(
    tpTarget, eGameCommand_Teleport, gamePacket->data);
```

To make `/setspawn` typable, add a branch to `handleCommand` alongside the `tp`
branch:

```cpp
else if (cmd == L"setspawn")
{
    if (!app.GetGameHostOption(eGameHostOption_CheatsEnabled))
    {
        warn(L"Cheats are not enabled on this server.");
        return;
    }
    shared_ptr<GameCommandPacket> p = SetSpawnCommand::preparePacket(player->getXuid());
    server->getCommandDispatcher()->performCommand(
        player, eGameCommand_SetSpawn, p->data);
}
```

The cheats-enabled check (`app.GetGameHostOption(eGameHostOption_CheatsEnabled)`)
is what the existing `time` branch does at `PlayerConnection.cpp:1149`; use it
for anything that should be gated behind the world's "Host Privileges / Cheats"
toggle.

## Server-console vs chat availability

Both chat commands and server-console commands funnel through the same
`PlayerConnection::handleChat` → `handleCommand` text parser:

- **Chat:** `handleChat` (`PlayerConnection.cpp:999`) checks whether the trimmed
  message starts with `/` and, if so, calls `handleCommand`
  (`PlayerConnection.cpp:1009-1013`). Otherwise it broadcasts the line as chat.
- **Server console:** the dedicated-server console loop feeds typed lines into
  `MinecraftServer::handleConsoleInput` → `handleConsoleInputs` →
  `ExecuteConsoleCommand` (`MinecraftServer.cpp:2495-2515`), which routes into the
  same command handling.

Because there is a **single** parser, a command you add to the `if (cmd == ...)`
chain is reachable from both chat and console automatically. If you want a
command to be console-only (e.g. `stop`, `ban`), gate its branch on the source —
the commented-out `isDedicatedServer()` block in
`ServerCommandDispatcher.cpp:27-48` shows where 4J intended dedicated-only
commands (`stop`, `ban`, `whitelist`, …) to be registered separately.

## Permissions

The dispatcher gates execution through `Command::canExecute`
(`CommandDispatcher.cpp:12`), whose default implementation is
(`Command.cpp:15`):

```cpp
bool Command::canExecute(shared_ptr<CommandSender> source)
{
    return source->hasPermission(getId());
}
```

For a `ServerPlayer` sender, `hasPermission` is currently a simple op check —
**`getPermissionLevel()` is not consulted** (`ServerPlayer.cpp:2032`):

```cpp
bool ServerPlayer::hasPermission(EGameCommand command)
{
    return server->getPlayers()->isOp(dynamic_pointer_cast<ServerPlayer>(shared_from_this()));
    // 4J: Removed permission level
}
```

So in practice: **any op can run any command; non-ops can run none.** Setting
`getPermissionLevel()` to `LEVEL_GAMEMASTERS` (as we did above, and as
`ToggleDownfallCommand.cpp:15` does) documents intent and is preserved for the
future, but does not currently change who may run the command. If `canExecute`
returns false the dispatcher sends the sender a red "no permission" message
(`CommandDispatcher.cpp:19`, gated out of `_CONTENT_PACKAGE` builds).

On the dedicated `MINECRAFT_SERVER_BUILD`, `handleGameCommand` additionally
re-checks the live `ops.json` before dispatch (`PlayerConnection.cpp:1914-1937`),
so a player de-opped mid-session is blocked even if their in-memory flag is
stale. See [Server / Console](/slop-docs/server/console/) and
[Server / FourKit](/slop-docs/server/fourkit/) for op management and the FourKit
event hooks (`FourKitBridge::FirePlayerTeleport` etc.) that command executors
fire.

## Testing checklist

- [ ] `eGameCommand_SetSpawn` added **before** `eGameCommand_COUNT` in
      `CommandsEnum.h`; no existing enum values reordered.
- [ ] `SetSpawnCommand.h` / `.cpp` created under `Minecraft.Client/`, added to the
      build (they compile flat with the rest of the module — no CMake list edit is
      needed beyond the glob, but confirm your build picks up new files).
- [ ] `addCommand(new SetSpawnCommand());` present in
      `ServerCommandDispatcher::ServerCommandDispatcher()` and its header included.
- [ ] `execute()` decodes the payload in the same order `preparePacket()` wrote
      it, and null-checks the resolved player.
- [ ] A `handleCommand` branch parses `/setspawn`, builds the packet via
      `preparePacket`, and calls `performCommand`.
- [ ] In-game: as an **op**, `/setspawn` succeeds and the success message appears;
      as a **non-op**, it is rejected.
- [ ] From the **server console**, the same command runs (confirms the shared
      parser path).
- [ ] Localization key (`commands.setworldspawn.success` here) resolves to real
      text — add it to the strings tables if it does not already exist (see
      [Textures & Assets](/slop-docs/modding/textures-assets/) for how strings are
      wired).

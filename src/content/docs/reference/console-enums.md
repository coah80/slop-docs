---
title: Console Enums & Structs
description: Core enums, defines, and structs from the Common/ shared code in LCE.
---

The `Common/` directory has three files that define the core constants, enums, and data structures shared across all platforms: `App_Defines.h`, `App_enums.h`, and `App_structs.h`. This page is a reference for the most important definitions.

## App_Defines.h

### Player Limits

```cpp
#ifdef __PSVITA__
#define MAX_LOCAL_PLAYERS 1
#else
#define MAX_LOCAL_PLAYERS 4
#endif
```

PS Vita is single-player only. All other platforms support up to 4 local splitscreen players.

### Language Codes

The game supports 20 languages, each with a numeric ID:

| ID | Language | ID | Language |
|---|---|---|---|
| 0 | English | 10 | Korean |
| 1 | French | 11 | Chinese Traditional |
| 2 | Italian | 12 | Chinese Simplified |
| 3 | German | 13 | Finnish |
| 4 | Spanish | 14 | Swedish |
| 5 | Portuguese | 15 | Danish |
| 6 | Russian | 16 | Norwegian |
| 7 | Japanese | 17 | Polish |
| 8 | Dutch | 18 | Turkish |
| 9 | Portuguese (Brazil) | 19 | Greek |

### Profile Versions

Version constants are used for save data migration. When the profile format changes between title updates, the version number increments and the loader knows to convert old data.

## App_enums.h

This is the largest enum file in the codebase. Here are the most important enums.

### eGameMode

```cpp
enum eGameMode
{
    eGameMode_Survival,
    eGameMode_Creative,
    eGameMode_Adventure
};
```

### eGameHostOption

Controls world-level settings. These are stored as a bitmask in save data. See [Custom GameRules](/slop-docs/modding/custom-gamerules/) for the full list and how to add new options.

The 25 host options include:

| Option | What it controls |
|---|---|
| `eGameHostOption_Difficulty` | World difficulty |
| `eGameHostOption_GameType` | Survival/Creative/Adventure |
| `eGameHostOption_Structures` | Generate structures |
| `eGameHostOption_BonusChest` | Bonus chest at spawn |
| `eGameHostOption_PvP` | Player vs player |
| `eGameHostOption_TrustPlayers` | Players can build/break |
| `eGameHostOption_TNT` | TNT explosions |
| `eGameHostOption_FireSpreads` | Fire spread |
| `eGameHostOption_CheatsEnabled` | Host privileges |
| `eGameHostOption_HasBeenInCreative` | Disables achievements |
| `eGameHostOption_DisableSaving` | Prevent world saves |
| `eGameHostOption_All` | Pack all options into one bitmask |

:::note
Options must be added at the end of the enum. Inserting one in the middle breaks every existing save file because the bitmask positions would shift.
:::

### eGameSetting

Per-player settings stored in the `GAME_SETTINGS` struct. These grow with each title update:

| Setting | What it controls |
|---|---|
| `eGameSetting_AutoSave` | Automatic saving |
| `eGameSetting_SplitScreenVertical` | Vertical vs horizontal split |
| `eGameSetting_Tooltips` | Show item tooltips |
| `eGameSetting_DeathMessages` | Show death messages in chat |
| `eGameSetting_AutoJump` | Auto-jump when walking into blocks |
| `eGameSetting_HideHand` | Hide the hand model in first person |
| `eGameSetting_HideGUI` | Hide the HUD |
| `eGameSetting_InvertYAxis` | Invert look controls |

### eDLCContentType

Classifies DLC packs by their content:

| Type | What it is |
|---|---|
| `e_DLCContentType_SkinPack` | Player skins |
| `e_DLCContentType_TexturePack` | Texture replacements |
| `e_DLCContentType_MashupPack` | Full mashup (textures + world + skins + music) |

### eDLCContentState

Tracks the download/install state of a DLC pack:

| State | Meaning |
|---|---|
| `e_DLCContentState_NotInstalled` | Available for purchase but not downloaded |
| `e_DLCContentState_Installing` | Currently downloading |
| `e_DLCContentState_Installed` | Ready to use |
| `e_DLCContentState_NeedsUpdate` | Newer version available |

### eXuiAction

Application lifecycle actions. These drive the main state machine:

| Action | When it fires |
|---|---|
| `eAppAction_ExitGame` | Player quits |
| `eAppAction_StartGame` | Player starts a world |
| `eAppAction_ReloadTexturePack` | Texture pack changed |
| `eAppAction_SaveAndQuit` | Save and return to menu |
| `eAppAction_ReturnToTitle` | Go back to title screen |

### EControllerActions

Maps physical button presses to game actions. Split into two groups:

**Menu actions**: Navigate, confirm, cancel, tab left/right, scroll, etc.

**Game actions**: Move, look, attack, use item, jump, sneak, drop, inventory, etc.

Multiple control schemes (MAP_STYLE_0 through MAP_STYLE_2) remap these actions to different button layouts.

### eMinecraftColour

This is the biggest enum in the file -- 500+ entries defining every color ID used in the game. Categories include:

- **Biome grass tint** per biome type
- **Biome foliage tint** per biome type
- **Biome water tint** per biome type
- **Sky color** per biome
- **Fog color** per biome
- **Particle colors** (nether portal, redstone dust, note block, etc.)
- **Mob-specific colors** (sheep wool, cat collar, etc.)

These IDs map into the `ColourTable` class (in `Common/Colours/`). Texture packs and mashup packs can override these colors by including a custom `colours.col` file.

### eXUID

Special player IDs for well-known Minecraft accounts:

| Constant | Who |
|---|---|
| `eXUID_Notch` | Notch (Markus Persson) |
| `eXUID_Deadmau5` | Deadmau5 |

These are checked to give special players unique capes or skins.

### eMCLang

50+ locale codes for all supported languages and regional variants. This is separate from the 20 language IDs in `App_Defines.h` -- the locale system is more granular with regional variants like `en_US`, `en_GB`, `pt_BR`, `zh_CN`, `zh_TW`, etc.

## App_structs.h

### GAME_SETTINGS

The per-player settings struct. This is 204 bytes of profile data:

| Field | What it stores |
|---|---|
| Tutorial completion | Which tutorial states are done (64 bytes / 512 bits) |
| Selected skin ID | Currently equipped skin |
| Selected cape | Currently equipped cape |
| Bitmask values | Boolean settings packed into bitmasks |
| Favorites | Favorited DLC packs |
| Control scheme | Which button layout is active |
| Sensitivity | Look sensitivity |
| Volume levels | Music, sound, voice |

### DLC_INFO

Platform-specific DLC metadata. Uses `#ifdef` branches:

- **Xbox 360**: Xbox content package descriptors
- **Xbox One**: Content package with marketplace metadata
- **PS3/PS4/Vita**: PSN entitlement data with content IDs
- **Windows 64**: File path and pack metadata

### NOTIFICATION

In-game notification data (achievement unlocks, player joins, etc.).

### BANNEDLISTDATA / BANNEDLIST

Player ban tracking. `BANNEDLISTDATA` holds a single ban entry (player name + ID). `BANNEDLIST` is the full ban list container.

### GameSessionData (in SessionInfo.h)

Network session advertising data. Contains per-player arrays sized to `MINECRAFT_NET_MAX_PLAYERS`. Used for LAN discovery and platform matchmaking. See [Player Limit](/slop-docs/modding/player-limit/) for details on how this struct varies per platform.

## Console_Awards_enum.h

The `eAward` enum defines all achievements/trophies:

### Base Achievements (20)

| Award | What the player does |
|---|---|
| `TakingInventory` | Open the inventory |
| `GettingWood` | Punch a tree |
| `Benchmarking` | Craft a workbench |
| `TimeToMine` | Craft a wooden pickaxe |
| `HotTopic` | Craft a furnace |
| `AcquireHardware` | Smelt an iron ingot |
| `TimeToFarm` | Craft a wooden hoe |
| `BakeABread` | Make bread |
| `TheLieWasTrue` | Bake a cake |
| `GettingAnUpgrade` | Craft a stone pickaxe |
| `TimeToStrike` | Craft a stone sword |
| `CowTipper` | Pick up leather |
| `MonsterHunter` | Kill a hostile mob |
| `WhenPigsFly` | Saddle a pig and ride off a cliff |
| `Leader` | Get all 20 base achievements |
| `ArcherAchievement` | Kill a creeper with arrows |
| `OnARail` | Travel 500m by minecart |
| `DeliciousFish` | Catch and cook fish |
| `InToTheNether` | Enter the Nether |
| `ReturnToSender` | Kill a ghast with a fireball |

### PS3-Only Awards

PS3 has additional achievements not present on other platforms:

| Award | What the player does |
|---|---|
| `snipeSkeleton` | Kill a skeleton from 50+ blocks away |
| `diamonds` | Mine diamond ore |
| `portal` | Build a nether portal |
| `ghast` | Earn a ghast tear |
| `bookcase` | Build a bookshelf |

### Extended Achievements

Later title updates added more achievements through the `_EXTENDED_ACHIEVEMENTS` section, covering content like the End dimension, enchanting, potions, and animal taming.

## Console_Debug_enum.h

### eDebugSetting

20+ debug settings that can be toggled in debug builds:

| Setting | What it does |
|---|---|
| `LoadSavesFromDisk` | Load saves from files instead of memory |
| `WriteSavesToDisk` | Write saves to files |
| `FreezePlayers` | Stop all player movement |
| `FreezeAnimals` | Stop all animal AI |
| `FreezeMonsters` | Stop all monster AI |
| `DisableWeather` | Turn off weather |
| `UnlockAllSkins` | Make all skins available |
| `ShowChunkBorders` | Render chunk boundaries |

### eDebugButton

8 debug buttons that can be bound to debug actions in development builds.

## Key Files

| File | What it defines |
|---|---|
| `Common/App_Defines.h` | Player limits, language codes, profile versions, bitmask helpers |
| `Common/App_enums.h` | All major enums: game modes, host options, DLC types, colors, actions |
| `Common/App_structs.h` | GAME_SETTINGS, DLC_INFO, NOTIFICATION, ban lists |
| `Common/Console_Awards_enum.h` | Achievement/trophy definitions |
| `Common/Console_Debug_enum.h` | Debug settings and buttons |

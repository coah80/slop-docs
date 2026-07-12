---
title: Custom Game Rules
description: How game rules actually work in neoLegacy — the GameRules router into host options, how they sync to clients, and the separate console GameRule/minigame-ruleset system.
---

"Game rules" in neoLegacy are not what the class name suggests. There are **two
entirely separate systems** with confusingly similar names, and adding a rule to
the wrong one will not do what you expect. This page explains both, shows how to
add a real boolean rule, and documents how it reaches clients.

Related: [World / Game Rules](/slop-docs/world/gamerules/) for the rule roster and
[World / Storage](/slop-docs/world/storage/) for how world settings persist.

## The two systems

| System | Files | What it is |
|--------|-------|------------|
| **`GameRules`** (`Minecraft.World`) | `GameRules.h` / `GameRules.cpp` | A thin, fixed enum of vanilla-style boolean rules (`doFireTick`, `mobGriefing`, …). In neoLegacy it is a **read-only router** into the console host options. |
| **Console `GameRule` / minigame rulesets** (`Common/GameRules`) | `GameRule.*`, `GameRuleDefinition.*`, `GameRuleManager.*`, `LevelRuleset.*`, `ConsoleGameRules.h` | The console mini-game / mash-up-map scripting system: schematic placement, structure generation, "collect item" objectives, etc. Driven by downloadable map data, synced with `UpdateGameRuleProgressPacket` (id 158). |

The `Minecraft.World/GameRules.cpp` header comment is explicit
(`GameRules.cpp:5`):

> `// 4J: GameRules isn't in use anymore, just routes any requests to app game host options, kept things commented out for context`

## System 1: `GameRules` → host options

### What it looks like today

`GameRules` ([`GameRules.h:3`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/GameRules.h#L3)) is a fixed set of `static const int` ids and a
single `getBoolean(rule)` accessor — there is **no dynamic map** and **no
setter**. The ids are (`GameRules.cpp:7-15`):

| Constant | Value | Notes |
|----------|-------|-------|
| `RULE_DOFIRETICK` | 0 | |
| `RULE_MOBGRIEFING` | 1 | |
| `RULE_KEEPINVENTORY` | 2 | |
| `RULE_DOMOBSPAWNING` | 3 | |
| `RULE_DOMOBLOOT` | 4 | |
| `RULE_DOTILEDROPS` | 5 | |
| `RULE_COMMANDBLOCKOUTPUT` | 6 | declared in `.h`, **commented out** in `.cpp` (`GameRules.cpp:13`) — unmapped |
| `RULE_NATURAL_REGENERATION` | 7 | |
| `RULE_DAYLIGHT` | 8 | |

`getBoolean` is a switch that forwards each id to a host option
(`GameRules.cpp:17-41`):

```cpp
bool GameRules::getBoolean(const int rule)
{
    switch(rule)
    {
    case GameRules::RULE_DOFIRETICK:
        return app.GetGameHostOption(eGameHostOption_FireSpreads);
    case GameRules::RULE_MOBGRIEFING:
        return app.GetGameHostOption(eGameHostOption_MobGriefing);
    case GameRules::RULE_KEEPINVENTORY:
        return app.GetGameHostOption(eGameHostOption_KeepInventory);
    case GameRules::RULE_DOMOBSPAWNING:
        return app.GetGameHostOption(eGameHostOption_DoMobSpawning);
    case GameRules::RULE_DOMOBLOOT:
        return app.GetGameHostOption(eGameHostOption_DoMobLoot);
    case GameRules::RULE_DOTILEDROPS:
        return app.GetGameHostOption(eGameHostOption_DoTileDrops);
    case GameRules::RULE_NATURAL_REGENERATION:
        return app.GetGameHostOption(eGameHostOption_NaturalRegeneration);
    case GameRules::RULE_DAYLIGHT:
        return app.GetGameHostOption(eGameHostOption_DoDaylightCycle);
    default:
        assert(0);
        return false;
    }
}
```

The backing store is the per-pad **host options** array owned by `Consoles_App`
(global `app`). The relevant enum values live in
[`Common/App_enums.h`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/Common/App_enums.h) (`App_enums.h:663-683`): `eGameHostOption_FireSpreads`,
`eGameHostOption_MobGriefing`, `eGameHostOption_KeepInventory`,
`eGameHostOption_DoMobSpawning`, `eGameHostOption_DoMobLoot`,
`eGameHostOption_DoTileDrops`, `eGameHostOption_NaturalRegeneration`,
`eGameHostOption_DoDaylightCycle`, plus `eGameHostOption_All` (the packed
bitfield). Read/write with (`Consoles_App.h:727-729`):

```cpp
void         SetGameHostOption(eGameHostOption eVal, unsigned int uiVal);
unsigned int GetGameHostOption(eGameHostOption eVal);
```

**Consequence for modders:** to add a "game rule" of this kind you do **not** edit
a rules map — you add a host option and route it. The UI toggle lives in the
console settings scenes, not in a `/gamerule` command.

### Worked example: add a `doWeatherCycle` rule

Suppose you want a boolean that governs whether weather changes over time,
paralleling `RULE_DAYLIGHT`.

**Step 1 — add a host option.** In `Common/App_enums.h`, add a value to
`enum eGameHostOption` (append near the other 4J-added booleans at the end of the
enum, `App_enums.h:676-683`, so existing values keep their positions):

```cpp
    eGameHostOption_NaturalRegeneration,
    eGameHostOption_DoDaylightCycle,
    eGameHostOption_Hardcore,        // 4J Added
    eGameHostOption_DoWeatherCycle,  // <-- new
};
```

**Step 2 — add the rule id.** In `Minecraft.World/GameRules.h`, declare the
constant next to the others (`GameRules.h:27-35`):

```cpp
    static const int RULE_DAYLIGHT;
    static const int RULE_DOWEATHERCYCLE;   // <-- new
```

Define its value in `GameRules.cpp` (pick the next free integer — `9`, since
`6` is the unmapped `commandBlockOutput` gap):

```cpp
const int GameRules::RULE_DAYLIGHT = 8;
const int GameRules::RULE_DOWEATHERCYCLE = 9;   // <-- new
```

**Step 3 — route it.** Add a `case` to `getBoolean` (`GameRules.cpp:35`):

```cpp
    case GameRules::RULE_DAYLIGHT:
        return app.GetGameHostOption(eGameHostOption_DoDaylightCycle);
    case GameRules::RULE_DOWEATHERCYCLE:
        return app.GetGameHostOption(eGameHostOption_DoWeatherCycle);   // <-- new
```

**Step 4 — read it in gameplay.** Wherever weather ticks (e.g. the level weather
update), query it:

```cpp
if (GameRules().getBoolean(GameRules::RULE_DOWEATHERCYCLE))
{
    // advance rain/thunder timers
}
```

This mirrors how the daylight rule already gates the day/night cycle. Note
`GameRules` has a default constructor and no state of its own
(`GameRules.h:38`) — it is a stateless facade over `app`, so constructing one
inline is fine.

### Sync behavior

Because the values live in `Consoles_App`'s host-option store, they are **not**
synced by the `GameRules` class at all — the host's `Consoles_App` is the source
of truth, and the whole packed bitfield rides to clients through the connection
handshake:

- **On join:** the host sends every option packed into
  `PreLoginPacket::m_serverSettings` — built from
  `app.GetGameHostOption(eGameHostOption_All)` on the server
  ([`PendingConnection.cpp:229`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/PendingConnection.cpp#L229)) and applied on the client with
  `app.SetGameHostOption(eGameHostOption_All, packet->m_serverSettings)`
  (`ClientConnection.cpp:2119`).
- **On change mid-game:** the host broadcasts a `ServerSettingsChangedPacket`
  (id 153); the client applies it in
  `ClientConnection::handleServerSettingsChanged` with
  `app.SetGameHostOption(eGameHostOption_All, packet->data)` when the action is
  `HOST_IN_GAME_SETTINGS` (`ClientConnection.cpp:4082-4087`).

So the packed `eGameHostOption_All` bitfield is the wire format. **Any new host
option you add participates in that bitfield automatically** — but that is exactly
why bit ordering matters for cross-compatibility. Appending your enum value at
the end (Step 1) preserves the bit positions older clients expect. Reordering the
enum shifts every bit and desyncs against unmodified clients. See the protocol
compatibility warning in
[Multiplayer & Packets](/slop-docs/modding/multiplayer-packets/).

`UpdateGameRuleProgressPacket` (id 158) does **not** carry these booleans — it
belongs to System 2 below.

## System 2: console `GameRule` / minigame rulesets

This is a completely different feature that happens to share the "game rule"
name. It is the console **mini-game / mash-up map** scripting layer, under
[`Common/GameRules/`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.Client/Common/GameRules). Modders adding survival/creative behaviour usually do **not**
touch this; it exists for map-maker content (Battle/Tumble/Glide mini-games,
tutorial world, structure-generation maps).

### Structure

- **`GameRuleDefinition`** — the static, immutable definition of a rule
  (loaded from map data).
- **`GameRule`** (`GameRule.h:11`) — a live instance holding per-rule mutable
  state in a `unordered_map<wstring, ValueType> m_parameters`, plus hooks
  `onUseTile(...)` and `onCollectItem(...)` (`GameRule.h:52-54`). It carries a
  `Connection*` so a rule can belong to a specific player.
- **`GameRuleManager`** (`GameRuleManager.h:24`) — owns the current
  `LevelRuleset *m_currentGameRuleDefinitions` and does the binary
  read/write (`readAttributes`, `readChildren`).
- **`LevelRuleset` / `LevelRules`** — a tree of definitions describing one map's
  ruleset.
- **`ConsoleGameRules`** (`ConsoleGameRulesConstants.h`) — the enum vocabulary.

The definition types (`ConsoleGameRulesConstants.h:8-35`,
`enum EGameRuleType`) are the "verbs" a map ruleset can use:

| Type | Meaning |
|------|---------|
| `eGameRuleType_Root` | top-level game-mode definition; generates new-player data |
| `eGameRuleType_LevelGenerationOptions` | seed / flatworld generation params |
| `eGameRuleType_ApplySchematic` | stamp a schematic into the world |
| `eGameRuleType_GenerateStructure` | run a structure generator |
| `eGameRuleType_GenerateBox` / `PlaceBlock` / `PlaceContainer` / `PlaceSpawner` | primitive world edits |
| `eGameRuleType_BiomeOverride` | force a biome |
| `eGameRuleType_StartFeature` | place a feature |
| `eGameRuleType_AddItem` / `AddEnchantment` | grant items/enchants |
| `eGameRuleType_LevelRules` / `NamedArea` | area-scoped rules |
| `eGameRuleType_UseTileRule` / `CollectItemRule` / `CompleteAllRule` / `UpdatePlayerRule` | objective/event hooks |

Each type is implemented by a matching `*RuleDefinition.cpp` in
`Common/GameRules/` (e.g. `ApplySchematicRuleDefinition.cpp`,
`CollectItemRuleDefinition.cpp`, `XboxStructureActionPlaceBlock.cpp`).

### Sync behavior (this is what packet 158 is for)

The console ruleset system syncs progress with
[`UpdateGameRuleProgressPacket`](https://git.neolegacy.dev/coah80/neoLegacy/src/branch/main/Minecraft.World/UpdateGameRuleProgressPacket.h) (id 158). Its payload is
ruleset-typed, not a boolean bag (`UpdateGameRuleProgressPacket.h:9-13`):

```cpp
ConsoleGameRules::EGameRuleType m_definitionType;
wstring m_messageId;
int m_icon, m_auxValue;
int m_dataTag;
byteArray m_data;
```

It carries a rule-definition type, a localization message id, an icon/aux value,
and an opaque data blob (up to 64 KB, `UpdateGameRuleProgressPacket.cpp:21`) —
i.e. "objective X progressed, show this toast." The client dispatches it via
`PacketListener::handleUpdateGameRuleProgressPacket`
(`UpdateGameRuleProgressPacket.cpp:63`). It is a **client-received** packet only
(mapped `true, false` at `Packet.cpp:122`).

### Adding a new console rule definition type

If you genuinely need a new mini-game verb:

1. Add an `eGameRuleType_*` value to `enum EGameRuleType` **before**
   `eGameRuleType_Count` in `ConsoleGameRulesConstants.h` (same append rule as
   everywhere else — the enum is serialized by
   `ConsoleGameRules::write(dos, EGameRuleType)`, which just does
   `dos->writeInt(eType)`, `ConsoleGameRulesConstants.h:110`).
2. Add any new attribute keys to `enum EGameRuleAttr` (again before
   `eGameRuleAttr_Count`); attributes are written offset past the type count
   (`ConsoleGameRulesConstants.h:113-116`), so type and attribute ids must stay
   stable.
3. Create `YourRuleDefinition.h/.cpp` under `Common/GameRules/`, following an
   existing one like `CollectItemRuleDefinition.cpp` as the template.
4. Hook it into `GameRuleManager`'s reader so the new type is parsed from map
   data.

This path is only exercised by map/mini-game content; ordinary gameplay mods
should use System 1.

## Testing checklist

For a System 1 boolean rule (`doWeatherCycle` above):

- [ ] New `eGameHostOption_*` appended at the **end** of `enum eGameHostOption`
      (`App_enums.h`); no existing values reordered.
- [ ] `RULE_*` constant declared in `GameRules.h` and defined in `GameRules.cpp`
      with a free integer value.
- [ ] `case` added to `GameRules::getBoolean`; no `assert(0)` hit at runtime for
      the new id.
- [ ] Gameplay code reads the rule via `GameRules().getBoolean(RULE_...)`.
- [ ] Host toggling the option and a fresh client join: the client observes the
      correct value (confirms `PreLoginPacket` sync).
- [ ] Host toggling mid-game: connected clients update (confirms
      `ServerSettingsChangedPacket` / `HOST_IN_GAME_SETTINGS`).
- [ ] Unmodified/older client can still connect and read all *pre-existing* rules
      correctly (confirms you did not shift the `eGameHostOption_All` bitfield).

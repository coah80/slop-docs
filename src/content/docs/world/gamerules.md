---
title: Game Rules
description: The GameRules class in neoLegacy — a fixed enum of eight boolean rules that now routes every query to the console host-options system.
---

In vanilla Java, `GameRules` is a dynamic string-keyed map of typed rules
(`doFireTick`, `keepInventory`, …) that you edit with `/gamerule`. neoLegacy keeps
the class name and the callsites, but the implementation has been **gutted into a
thin passthrough**: every rule query now routes to the console's host-options
system (`app.GetGameHostOption(...)`). The rule set is a fixed enum of eight
booleans, not a map, and there is no per-world storage of rule values.

Files: `GameRules.h`, `GameRules.cpp`.

The intent is stated in the file's own header comment (`GameRules.cpp:5`):

```cpp
// 4J: GameRules isn't in use anymore, just routes any requests to app game host
// options, kept things commented out for context
```

## The rules

The rules are `static const int` IDs on `GameRules`, not strings
(`GameRules.h:27-35`; defined `GameRules.cpp:7-15`). The comment
`// 4J: Originally strings` marks the change from the Java string keys.

| Constant | ID | Vanilla name | Routed host option |
|----------|----|-------------|--------------------|
| `RULE_DOFIRETICK` | 0 | `doFireTick` | `eGameHostOption_FireSpreads` |
| `RULE_MOBGRIEFING` | 1 | `mobGriefing` | `eGameHostOption_MobGriefing` |
| `RULE_KEEPINVENTORY` | 2 | `keepInventory` | `eGameHostOption_KeepInventory` |
| `RULE_DOMOBSPAWNING` | 3 | `doMobSpawning` | `eGameHostOption_DoMobSpawning` |
| `RULE_DOMOBLOOT` | 4 | `doMobLoot` | `eGameHostOption_DoMobLoot` |
| `RULE_DOTILEDROPS` | 5 | `doTileDrops` | `eGameHostOption_DoTileDrops` |
| `RULE_COMMANDBLOCKOUTPUT` | 6 | `commandBlockOutput` | — (commented out) |
| `RULE_NATURAL_REGENERATION` | 7 | `naturalRegeneration` | `eGameHostOption_NaturalRegeneration` |
| `RULE_DAYLIGHT` | 8 | `doDaylightCycle` | `eGameHostOption_DoDaylightCycle` |

`RULE_COMMANDBLOCKOUTPUT` is **declared in the header** (`GameRules.h:33`) but its
definition is **commented out** in the `.cpp` (`GameRules.cpp:13`), and it is not
handled in the switch. Referencing it would fail to link. ID 6 is effectively a
hole in the sequence (0–5, then 7–8).

Every rule is a boolean here; the typed `GameRule` inner class (`GameRules.h:6`)
that could hold string/int/double values still exists but is unused — see below.

## Reading a rule

The only public runtime method is `getBoolean(int rule)` (`GameRules.cpp:17`). It
is a plain switch that forwards to `app.GetGameHostOption(...)`:

```cpp
bool GameRules::getBoolean(const int rule)
{
    switch(rule)
    {
    case GameRules::RULE_DOFIRETICK:
        return app.GetGameHostOption(eGameHostOption_FireSpreads);
    case GameRules::RULE_KEEPINVENTORY:
        return app.GetGameHostOption(eGameHostOption_KeepInventory);
    // ... one case per rule ...
    default:
        assert(0);
        return false;
    }
}
```

Passing an unmapped ID (including the commented-out `6`) hits the `default`,
which `assert(0)`s in debug and returns `false` in release.

`GetGameHostOption(eGameHostOption)` is declared on the app object
(`Minecraft.Client/Common/Consoles_App.h:729`); the `eGameHostOption` enum lives
in `Minecraft.Client/Common/App_enums.h:647`. So the true source of every game-rule
value is the **host-options bitset** the world host configured in the pause/host
menu — not any NBT field.

## How callsites use it

A `GameRules` instance is reached through the level's world metadata:
`Level::getGameRules()` (`Level.cpp:4413`) returns
`levelData->getGameRules()`. Gameplay code then calls `getBoolean` with a rule
constant. Representative callers:

| File | Rule read | Effect |
|------|-----------|--------|
| `Player.cpp:1154`, `:2685` | `RULE_KEEPINVENTORY` | keep / drop inventory on death |
| `Player.cpp:1021` | `RULE_NATURAL_REGENERATION` | peaceful-difficulty health regen |
| `Creeper.cpp:122` | `RULE_MOBGRIEFING` | whether the explosion breaks blocks |
| `FireTile.cpp` | `RULE_DOFIRETICK` | whether fire spreads/burns out |
| `Mob.cpp`, `EatTileGoal.cpp`, `Silverfish.cpp`, `BreakDoorGoal.cpp`, `FoodData.cpp`, `LargeFireball.cpp` | various | mob griefing / drops / regen gates |

Example (`Player.cpp:1154`):

```cpp
if (!level->getGameRules()->getBoolean(GameRules::RULE_KEEPINVENTORY))
    // ... drop the player's items ...
```

## Sync: there is no GameRules packet

Because rule values are **derived from host options at read time**, `GameRules`
itself is never serialized and never sent over the network. There is no
"gamerule value" NBT and no `GameRules` write path — the `GameRule::set()` inner
method exists but is not wired to any persistence.

Do not confuse this with `UpdateGameRuleProgressPacket` (packet id 158). Despite
the name, that packet does **not** carry `GameRules` values — it belongs to a
separate console system, `ConsoleGameRules`, and its payload is a
`ConsoleGameRules::EGameRuleType` plus a progress/message tuple
(`UpdateGameRuleProgressPacket.h:9-16`). `ConsoleGameRules` (declared in
`Minecraft.Client/Common/GameRules/ConsoleGameRulesConstants.h`) is the console
"game rules / objectives" progress feature, unrelated to the eight booleans on the
`GameRules` class documented here.

## neoLegacy / 4J delta vs vanilla TU19

- **No dynamic rule map.** Rules are a fixed `int` enum, not string keys; there is
  no runtime registration of new rules.
- **No `/gamerule`-editable storage.** Values are read straight from the host
  options bitset via `app.GetGameHostOption(...)` every call, so the world host's
  menu settings *are* the game rules. `GameRules::set()` / the typed `GameRule`
  value slots are vestigial.
- **`commandBlockOutput` is absent** — declared but not defined, not switched.
- The typed `GameRule` inner class (`bool`/`int`/`double`/`wstring` value slots,
  `GameRules.h:6`) survives from the original design but nothing constructs or
  mutates it in the live path.

## Related pages

- [Minecraft.World Overview](/slop-docs/world/overview/) — module layout and bootstrap
- [Materials](/slop-docs/world/materials/)

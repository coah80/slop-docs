---
title: Tutorial, DLC & Console Systems
description: The Common/Tutorial task-hint-constraint state machine (updated to TU31), the Common/GameRules console minigame/map-rule system, the DLCManager/DLCPack downloadable-content pipeline (skins, capes, texture packs, game rules), and Trial Mode gating.
---

Three console-specific subsystems sit on top of the game engine, none of which
exist in the plain Java port: the **tutorial** state machine, the **game-rules /
minigame** system, and **DLC**. A fourth — **Trial Mode** — is really a thin
subclass of the tutorial that also gates persistence. All four are owned by the
`Consoles_App` (`app`) and its members.

Files: `Common/Tutorial/`, `Common/GameRules/`, `Common/DLC/`,
`Common/Trial/TrialMode.*`, `Common/Consoles_App.h`, `Minecraft.cpp`
(`isTutorial`, game-mode creation).

## The Tutorial state machine

The tutorial is a task/hint/constraint machine driven by `class Tutorial`
(`Common/Tutorial/Tutorial.h:21`), one instance per pad. It is created via the
game-mode hierarchy rather than directly: when `app.GetTutorialMode()` is set, the
per-player game mode is a `FullTutorialMode` instead of the normal
`ConsoleGameMode` (`Minecraft.cpp:1048-1050`):

```cpp
if( app.GetTutorialMode() )
    localgameModes[idx] = new FullTutorialMode(idx, this, clientConnection);
else if(ProfileManager.IsFullVersion()==false)
    localgameModes[idx] = new TrialMode(idx, this, clientConnection);
else
    localgameModes[idx] = new ConsoleGameMode(idx, this, clientConnection);
```

`Tutorial::staticCtor()` runs at boot (`Minecraft.cpp:4936`), and
`Minecraft::isTutorial()` simply tests a per-pad bitmask
(`m_inFullTutorialBits > 0`, `Minecraft.cpp:5175`), set by
`playerStartedTutorial(iPad)`.

> **neoLegacy delta:** the bundled tutorial world has been updated to **TU31**
> (NOTES.md v1.0.9b). The state machine below is the mechanism; the map it plays
> out on is the newer TU31 tutorial level.

> **Changed in v1.1.0b:** the bundled `Windows64Media/Tutorial/Tutorial.mcs` was
> re-exported for the "16x16 tutorial" (commit `91192b70`) — an asset-only change
> to the tutorial map, not a TU-version bump. The tutorial code below (state
> machine, `TutorialEnum` budget, game-mode hierarchy) is unchanged.

### Game-mode hierarchy

```
MultiPlayerGameMode
  └─ TutorialMode          (abstract; owns a Tutorial*, isImplemented() = 0)
       └─ FullTutorialMode (isImplemented / isTutorial = true)
            └─ TrialMode    (trial gameplay = full tutorial that never persists)
```

`TutorialMode` (`TutorialMode.h`) overrides the gameplay hooks
(`startDestroyBlock`, `destroyBlock`, `useItemOn`, `attack`, `isInputAllowed`) to
feed each action into its `Tutorial` and to gate input while a hint is up.

### States, hints and telemetry markers

Everything the tutorial can teach is one of three enum values in
`TutorialEnum.h`, packed into a single 512-bit completion namespace:

| Enum | Range | Purpose |
|------|-------|---------|
| `eTutorial_State` (`:28`) | `0 .. e_Tutorial_State_Max` | multi-message flows (Inventory, 2×2/3×3 Crafting, Furnace, Riding, Bed, Redstone, Portal, Brewing, Enchanting, Trading, Anvil, Beacon, …) |
| `eTutorial_Hint` (`:78`) | starts at `e_Tutorial_State_Max` | one-shot "you found X" popups for nearly every block, mob and item |
| `eTutorial_Telemetry` (`:321`) | after hints | first-time markers (`TrialStart`, `Halfway`, `Complete`) recorded for telemetry |

The header is explicit about the budget (`TutorialEnum.h:20-27`):

> The total number of `eTutorial_State` and `eTutorial_Hint` must be less than
> 512, as we only have 512 bits of profile data to flag whether or not the player
> has seen them.

That budget is `TUTORIAL_PROFILE_STORAGE_BITS = 512`
(`TUTORIAL_PROFILE_STORAGE_BYTES = 64`). Completion is persisted in the profile
blob (like [stats](/slop-docs/client/achievements/#persistence-into-the-profile-blob)),
and `Tutorial::s_completableTasks` gives a stable state→bit mapping so saved
progress survives version bumps.

### Tasks, hints and constraints

`Tutorial` keeps, **per state**, parallel arrays (`Tutorial.h:81-89`):

- `tasks` / `activeTasks[state]` — the ordered `TutorialTask`s (e.g.
  `PickupTask`, `CraftTask`, `UseTileTask`, `RideEntityTask`, `StatTask`,
  `ControllerTask`, `ChoiceTask`). Each concrete task is its own file under
  `Common/Tutorial/`.
- `hints[state]` — `TutorialHint`s (`LookAtTileHint`, `LookAtEntityHint`,
  `DiggerItemHint`, `TakeItemHint`, …).
- `constraints[state]` + `m_globalConstraints` — `TutorialConstraint`s
  (`AreaConstraint`, `InputConstraint`, `ChangeStateConstraint`) that gate
  progress, plus a `constraintsToRemove[state]` deferral list.

Gameplay events are pushed in through the `Tutorial::on*` API — `onCrafted`,
`onTake`, `onLookAt`, `onLookAtEntity`, `onRideEntity`, `onEffectChanged`,
`onSelectedItemChanged` — and `tick()` advances the current task, evaluates
constraints, and raises the next hint. Messages are described by an inner
`PopupMessageDetails` (`Tutorial.h:24`) carrying message/prompt/title ids, an
icon, and flags like `m_isReminder`, `m_forceDisplay`, `m_allowFade`. The live
popup itself is a `UIScene` (`UIComponent_TutorialPopup`; see
[UI System](/slop-docs/client/ui-system/)). Completion timing is governed by the
static timers `m_iTutorialDisplayMessageTime`, `m_iTutorialReminderTime`,
`m_iTutorialFreezeTimeValue`, etc. (`Tutorial.h:63-69`).

## Console GameRules — the minigame / map system

`Common/GameRules/` is the console "mini-game" and custom-map rule engine —
unrelated to the vanilla `/gamerule` command. It is what drives Battle/Tumble
maps, tutorial objectives, and DLC mini-games. The root is `app.m_gameRules`, a
`GameRuleManager` (`GameRuleManager.h:24`), booted by `app.loadDefaultGameRules()`
at startup (`Minecraft.cpp:4938`, `Consoles_App.cpp:8761`).

### The rule grammar

Rules are a tree of `GameRuleDefinition`s serialised in a binary `.grf` file
(`GAME_RULE_SAVENAME = requiredGameRules.grf`, format `version_number = 2`). The
node and attribute kinds are enumerated in
`ConsoleGameRulesConstants.h`:

| `EGameRuleType` (`:8`) | Meaning |
|------------------------|---------|
| `eGameRuleType_Root` | top-level game-mode definition; seeds new players |
| `eGameRuleType_LevelGenerationOptions` | how the world is generated |
| `eGameRuleType_ApplySchematic` / `eGameRuleType_GenerateStructure` | place prefabs |
| `eGameRuleType_GenerateBox` / `PlaceBlock` / `PlaceContainer` / `PlaceSpawner` | primitive structure actions |
| `eGameRuleType_BiomeOverride` / `StartFeature` | terrain overrides |
| `eGameRuleType_AddItem` / `AddEnchantment` | starting inventory |
| `eGameRuleType_LevelRules` / `NamedArea` | scoring regions / area triggers |
| `eGameRuleType_UseTileRule` / `CollectItemRule` / `CompleteAllRule` / `UpdatePlayerRule` | objective triggers |

Each type has a matching `*RuleDefinition.cpp`, and each structure action a
matching `XboxStructureAction*` (`GenerateBox`, `PlaceBlock`, `PlaceContainer`,
`PlaceSpawner`). Attributes (`EGameRuleAttr`, `ConsoleGameRulesConstants.h:37`)
cover coordinates (`x/x0/x1`, `y…`, `z…`, `chunkX/chunkZ`), item fields (`itemId`,
`quantity`, `auxValue`, `slot`), enchant fields, biome/feature ids, and seeds.
`ConsoleGameRules::write()` disambiguates the two enums on the wire by offsetting
attributes past `eGameRuleType_Count`.

### What the manager does

`GameRuleManager` (`GameRuleManager.h`) holds the current
`LevelGenerationOptions*`, a `LevelRuleset*`, and the catalogue of available
generators (`LevelGenerators`) and rulesets (`LevelRules`). Key entry points:

- `loadDefaultGameRules()` / `loadGameRulesPack(File*)` — load the built-in and
  packaged rule sets.
- `loadGameRules(DLCPack*)` and `loadGameRules(byte*, size)` — load rules from a
  DLC pack or a raw buffer (`DLCGameRulesFile` / `DLCGameRulesHeader`).
- `processSchematics(LevelChunk*)` / `processSchematicsLighting(...)` — stamp
  schematic blocks into a chunk as it loads (`ConsoleSchematicFile`,
  `ConsoleGenerateStructure`).
- `getLevelGenerators()` — the list surfaced in the Create-World menu.
- `unloadCurrentGameRules()` — teardown between worlds.

## DLC

Downloadable content is managed by `DLCManager` (`Common/DLC/DLCManager.h`), a
member of `Consoles_App` (`app.m_dlcManager`, `Consoles_App.h:84`). It owns a
`vector<DLCPack*>` and a corruption-check flag.

### DLC types

Every file inside a pack is typed by `EDLCType` (`DLCManager.h:10`):

| `EDLCType` | Content |
|-----------|---------|
| `e_DLCType_Skin` | player skins (→ [Skin Select](/slop-docs/client/settings/)) |
| `e_DLCType_Cape` | capes |
| `e_DLCType_Texture` / `e_DLCType_TexturePack` | texture-pack assets (→ [Resources](/slop-docs/client/resources/)) |
| `e_DLCType_UIData` | menu/Iggy data |
| `e_DLCType_LocalisationData` | strings |
| `e_DLCType_GameRules` / `e_DLCType_GameRulesHeader` | minigame rule files |
| `e_DLCType_Audio` | music / SFX (→ [Audio](/slop-docs/client/audio/)) |
| `e_DLCType_ColourTable` | biome grass/foliage colours |
| `e_DLCType_PackConfig` | the pack's XML manifest |

Each maps to a concrete `DLC*File` loader: `DLCSkinFile`, `DLCCapeFile`,
`DLCTextureFile`, `DLCAudioFile`, `DLCColourTableFile`, `DLCLocalisationFile`,
`DLCGameRulesFile`, `DLCUIDataFile`. Pack manifest fields are the
`EDLCParameterType` set (`DLCManager.h:30`): `DisplayName`, `ThemeName`, `Free`,
`Credit`, `Cape`, `Box`, `Anim`, `PackId`, `NetherParticleColour`,
`EnchantmentTextColour`, `DataPath`, `PackVersion`, `Offset`.

### DLCPack

`DLCPack` (`DLCPack.h`) is one content pack. Its files are bucketed by type
(`vector<DLCFile*> m_files[e_DLCType_Max]`), and packs can nest via
`m_childPacks` / `m_parentPack` — a **Mash-Up pack** is a parent whose children
supply skins, textures, music and colour tables together. It carries a
`m_dwLicenseMask` (ownership/entitlement bits), a `m_packId`/`m_packVersion`, and
platform-specific offer ids (`m_wsProductId` on Xbox One, `m_ullFullOfferId`
elsewhere) used by the store. Skin access has dedicated helpers:
`getSkinCount()`, `getSkinFile(path|index)`, `doesPackContainSkin(path)`.

`DLCManager` resolves a loose skin path back to its owning pack with
`getPackContainingSkin(path)` — exactly what the skin-select scene calls
(`UIScene_SkinSelectMenu.cpp:417`, `app.m_dlcManager.getPackContainingSkin(...)`).
Because console DLC archives are big-endian, `DLCManager` provides the
`SwapInt16/SwapInt32/SwapUTF16Bytes` byte-swap helpers used while parsing
(`DLCManager.h:100-122`).

> **neoLegacy delta (TU25 skin packs):** the Skin Select menu was rewritten for
> TU36+ parity (NOTES.md), and along with it the skin-pack pipeline — including
> the TU25-era skin packs — was fixed so packs show the correct icons. See the
> `UIScene_SkinSelectMenu` notes in [Settings & Skin Select](/slop-docs/client/settings/).

> **Changed in v1.1.0b:** the bundled **retail DLC assets** under
> `Minecraft.Client/Windows64Media/DLC/` (Mash-Up packs, skin packs, texture
> packs — 511 binary files) were deleted (commit `8cfce8ee`, "chore: delete
> dlcs"). This is an asset-only removal: the `DLCManager` / `DLCPack` code, the
> `EDLCType` set, and the built-in resource-tree packs under
> `Common/res/TitleUpdate/DLC/` (182 `.pck` files, unchanged) all remain. The
> pipeline documented here is intact; only the shipped downloadable payloads are
> gone.

### DLC scenes

The front-end lives in `UIScene_DLCMainMenu` and `UIScene_DLCOffersMenu`
(`Common/UI/`), which list owned packs and store offers respectively, backed by
`UIControl_DLCList`.

## Trial Mode

Trial/demo play reuses the tutorial machinery. `TrialMode : public
FullTutorialMode` (`Common/Trial/TrialMode.h`) is almost empty — it is a full
tutorial that runs on the bundled `TrialLevel.mcs` demo world:

```cpp
class TrialMode : public FullTutorialMode
{
public:
    TrialMode(int iPad, Minecraft *minecraft, ClientConnection *connection);
    virtual bool isImplemented() { return true; }
};
```

The gating happens elsewhere, keyed on `ProfileManager.IsFullVersion()`:

- Game-mode selection picks `TrialMode` when the profile is not full-version
  (`Minecraft.cpp:1053`).
- `StatsCounter::save()`, `saveLeaderboards()` and `writeStats()` all early-out on
  a trial profile, so demo play never persists stats or scores (see
  [Achievements & Stats](/slop-docs/client/achievements/#persistence-into-the-profile-blob)).
- The up-sell path is surfaced by `UIScene_TrialExitUpsell` /
  `UIScene_DLCOffersMenu`, and recorded through the telemetry
  `RecordUpsellPresented` / `RecordUpsellResponded` events.

## Related pages

- [Settings & Skin Select](/slop-docs/client/settings/) — the DLC-backed skin carousel
- [Texture Packs & Resources](/slop-docs/client/resources/) — `DLCTexturePack` and Mash-Up pack assets
- [Achievements & Stats](/slop-docs/client/achievements/) — the profile blob that also stores tutorial completion, and trial gating
- [Multiplayer & Client Networking](/slop-docs/client/networking/) — `NetworkGameInitData` carries the texture-pack / game-rule ids into a world
- [UI System](/slop-docs/client/ui-system/) — the `UIScene`s that render tutorial popups and DLC menus

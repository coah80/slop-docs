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

### Worked trace: one tutorial task transition

This follows a single tutorial step from the gameplay action that completes it to
the next hint appearing on screen, citing every hop. The key structural fact:
gameplay pushes events into every active task, but the actual **advance** happens
in `tick()`, which drains completed tasks and promotes the next one.

**1 — Event in (`Tutorial::on*`).** A gameplay action routed through the
`TutorialMode` game mode calls a `Tutorial::on*` hook — e.g. crafting an item hits
`Tutorial::onCrafted(item)` (`Tutorial.cpp:1951`), which fans the event out to
**every** task in the current state so whichever task is watching for it can flag
itself done (`:1953-1959`):

```cpp
for(auto& subtasks : activeTasks)
    for(auto& task : subtasks)
        task->onCrafted(item);
```

**2 — Condition check + advance (`tick`).** `Tutorial::tick()` (`Tutorial.cpp:1297`)
walks `activeTasks[m_CurrentState]` and, for the current task, checks completion —
gated on a minimum on-screen time so a message can't flash past
(`:1492-1495`):

```cpp
if( ( !task->ShowMinimumTime() ||
      (task->hasBeenActivated() && (lastMessageTime + m_iTutorialMinimumDisplayMessageTime) < GetTickCount()) )
    && task->isCompleted() )
```

When it passes, the task is erased and deleted (`:1497-1500`), its
`getCompletionAction()` decides how the rest of the state's tasks are handled
(`e_Tutorial_Completion_Complete_State` clears them, `_Jump_To_Last_Task` keeps
only the last, `:1504-1544`), and the **next** task is promoted as current via
`currentTask[state] = activeTasks[state][0]; …->setAsCurrentTask()` (`:1547-1551`).
If the list drained, `setStateCompleted(m_CurrentState)` marks the state done
(`:1554`) and flips its completion bit in the profile budget.

**3 — Hint UI out.** With a new current task, `tick()` builds the popup: it
assembles a `TutorialPopupInfo` with the message text, icon, aux value and the
`allowFade`/`isReminder` flags (`Tutorial.cpp:1737-1744`) and pushes it to the live
scene — `ui.SetTutorialDescription(m_iPad, &popupInfo)` (`:1751/1755`). The popup
scene itself is navigated in when the tutorial becomes visible —
`app.NavigateToScene(m_iPad, eUIComponent_TutorialPopup, this, …)`
(`Tutorial.cpp:1381-1406`) — and input is gated while a hint is up
(`ui.SetTutorialVisible`, `:1420-1425`). Completion of the whole state persists as
one of the 512 profile bits ([above](#states-hints-and-telemetry-markers)), so the
step never re-plays on reload.

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

### Worked trace: one DLC pack mount, file to available content

This follows a single `.pck` from disk to the point its content is selectable,
citing every hop. A pack is a versioned binary blob; `DLCManager` parses it into
typed `DLCFile`s, buckets them on a `DLCPack`, registers the pack, and — for a
texture pack — surfaces it through the texture repository.

**1 — Read the file (`readDLCDataFile`).** A driver points `DLCManager` at a `.pck`
path — the app's DLC scan (`Consoles_App.cpp:5995/5999`), the texture repo's
dummy-pack load (`TexturePackRepository.cpp:64`), or a `DLCTexturePack`'s lazy
mount (`DLCTexturePack.cpp:377`). `DLCManager::readDLCDataFile`
(`DLCManager.cpp:407`) resolves the path — from the media archive
(`app.getArchiveFile`, `:412`) or a `StorageManager.GetMountedPath` on
Windows64/Durango (`:419-425`), with a `.pck`-folder fallback
(`hasPckFolderFallback` → `readDLCDataFolder`, `:431-448`) — and hands the bytes to
`processDLCDataFile`.

**2 — Parse the versioned format (`processDLCDataFile`).**
`DLCManager::processDLCDataFile(pbData, dwLength, pack)` (`DLCManager.cpp:569`)
reads the format documented inline (`:574-584`): a version int, a parameter-type
map, a file count, and per-file details + data. It **auto-detects endianness** by
testing the version both ways (`:588-598`) — console packs are big-endian — and
uses the `SwapInt32`/`SwapUTF16Bytes` helpers throughout. It builds the
DLC-string→`EDLCParameterType` mapping (`:605-628`), then reads the file table.

**3 — Type each file (`addFile`).** For each entry it reads the `EDLCType`
(`:659`) and materialises the right object (`DLCManager.cpp:664-671`):

```cpp
if(type == e_DLCType_TexturePack)
    dlcTexturePack = new DLCPack(pack->getName(), pack->getLicenseMask());  // nested pack
else if(type != e_DLCType_PackConfig)
    dlcFile = pack->addFile(type, (WCHAR*)pFile->wchFile);                  // typed DLCFile
```

`pack->addFile(type, name)` buckets the file into `m_files[type]` on the
`DLCPack` — so afterward `getSkinCount()`, `getSkinFile(path)`,
`doesPackContainSkin(path)` etc. answer from the parsed contents. A nested
`e_DLCType_TexturePack` becomes a **child** `DLCPack` (the Mash-Up nesting from
[DLCPack](#dlcpack)).

**4 — Register the pack (`addPack`).** The driver then calls
`app.m_dlcManager.addPack(pack)` (`DLCManager.cpp:166`, e.g.
`Consoles_App.cpp:5928`, `TexturePackRepository.cpp:68`), adding it to the
manager's `vector<DLCPack*>`. From here `getPack(name)`,
`getPackContainingSkin(path)` and `checkForCorruptDLCAndAlert()`
(`Minecraft.cpp:1423`) can all see it.

**5 — Surface as content.** How the pack becomes *usable* depends on its type:

- **Texture pack** → `TexturePackRepository::addTexturePackFromDLC(dlcPack, id)`
  (`TexturePackRepository.cpp:363`) wraps it in a `DLCTexturePack` and caches it by
  id, so `selectTexturePackById(id)`
  ([the resources trace](/slop-docs/client/resources/#worked-trace-one-texture-pack-switch-selection-to-re-bound-atlas))
  can now select it.
- **Skin** → the skin-select scene resolves a loose path back to its pack with
  `app.m_dlcManager.getPackContainingSkin(...)`
  (`UIScene_SkinSelectMenu.cpp:417`).
- **Game rules / audio / colours** → loaded on demand by the matching subsystem
  (`GameRuleManager::loadGameRules(DLCPack*)`, `DLCTexturePack`'s sound banks, the
  `ColourTable` two-arg override).

> **neoLegacy delta (TU25 skin packs):** the Skin Select menu was rewritten for
> TU36+ parity (NOTES.md), and along with it the skin-pack pipeline — including
> the TU25-era skin packs — was fixed so packs show the correct icons. See the
> `UIScene_SkinSelectMenu` notes in [Settings & Skin Select](/slop-docs/client/settings/).

> **Changed in v1.1.0b:** most of the bundled **retail DLC assets** under
> `Minecraft.Client/Windows64Media/DLC/` (Mash-Up packs, licensed skin packs,
> texture packs — 511 binary files, including the Star Wars, Simpsons, Festive
> and Battle & Beasts packs) were deleted (commit `8cfce8ee`, "chore: delete
> dlcs"). The directory is **not** emptied, though: nine `.pck` files for the
> generic **Skin Pack 1–6** dirs survive the cull and are still present at the
> upstream head `3833d0f3`. This is an asset-only removal: the `DLCManager` /
> `DLCPack` code, the `EDLCType` set, and the built-in resource-tree packs under
> `Common/res/TitleUpdate/DLC/` (28 `.pck` files, unchanged) all remain. The
> pipeline documented here is intact; only the licensed downloadable payloads are
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

---
title: Achievements & Stats
description: The AchievementPopup toast, the classic and console achievement screens, the StatsCounter difficulty-bucketed stat store, the leaderboard write path (incl. the Sony PSN implementation), and the telemetry event manager.
---

Achievements, stats, leaderboards and telemetry are four loosely-coupled
subsystems that all sit on top of the world-side `Stat`/`Achievement` registries
(from `../Minecraft.World/Stats.h`, `Achievements.h`). On console, everything
persists into the per-user **profile blob** (`GAME_DEFINED_PROFILE_DATA`), not a
save file, and leaderboards are pushed out through a platform manager.

Files: `AchievementPopup.h`/`.cpp`, `AchievementScreen.h`/`.cpp`,
`StatsCounter.h`/`.cpp`, `StatsScreen.h`/`.cpp`, `StatsSyncher.h`/`.cpp`,
`Common/Leaderboards/`, `Common/Telemetry/TelemetryManager.h`/`.cpp`,
`Common/UI/UIScene_AchievementsMenu.*`, `Common/UI/UIScene_LeaderboardsMenu.*`.

## AchievementPopup — the toast overlay

`AchievementPopup : public GuiComponent` (`AchievementPopup.h`) is the little
sliding "Achievement get!" banner. `Minecraft` owns one as
`Minecraft::achievementPopup` (`Minecraft.h:154`). It has two entry points:

| Method | Effect |
|--------|--------|
| `popup(Achievement *ach)` | transient toast: `title = I18n::get(L"achievement.get")`, `desc = ach->name`, `startTime = System::currentTimeMillis()` (`AchievementPopup.cpp:25`) |
| `permanent(Achievement *ach)` | pinned display used on the achievement screen: `title = ach->name`, `desc = ach->getDescription()`, `startTime` back-dated 2500 ms so it renders fully open (`AchievementPopup.cpp:34`) |

`render()` sets up an ortho projection via `ScreenSizeCalculator`, eases the
banner's Y with a quartic curve, blits `/achievement/bg.png`, draws the title in
yellow / description in white, and renders the achievement's item icon through an
owned `ItemRenderer` (`AchievementPopup.cpp:69`).

> **Status note:** the entire body of `render()` is wrapped in `#if 0`
> (`AchievementPopup.cpp:72-150`) — including the old anti-piracy "Unlicensed
> Copy" watermark that used `Minecraft::warezTime`. On the console/neoLegacy build
> the live achievement toast is drawn by the XUI/UIScene layer, not this classic
> `GuiComponent`. Treat `AchievementPopup` as the vestigial Java-port version; see
> the [two GUI stacks](/slop-docs/client/overview/#read-this-first-two-gui-stacks)
> note.

## Achievement screens

Two parallel screens exist, mirroring the two GUI stacks:

- **`AchievementScreen`** (`AchievementScreen.h`, `: public Screen`) — the classic
  Java-port pannable achievement tree. Draws the connecting lines and locked/
  unlocked tiles. Vestigial on console.
- **`UIScene_AchievementsMenu`** (`Common/UI/UIScene_AchievementsMenu.h`) — the
  live console scene. It is an Iggy-movie-backed `UIScene` whose element map binds
  `AcheivementsLabel`, `AchievementName`, `AchievementDescription` and an
  `AchievementsList` child control (`UIControl_AchievementsList`). Its scene type
  is `eUIScene_AchievementsMenu`. Selecting a row calls
  `SetAchievementDescription(...)` back through the `SetAchievementDescription`
  Iggy callback (`UIScene_AchievementsMenu.h:27-37`).

## StatsCounter — the per-player stat store

`class StatsCounter` (`StatsCounter.h`) is the in-memory tally of every stat and
achievement for one signed-in player. `Minecraft` holds an array of four
(`StatsCounter* stats[4]`, `Minecraft.h:184`) — one per splitscreen pad — and the
in-game stat views come from `Minecraft::gatherStats1()..gatherStats4()`
(`Minecraft.h:287-290`).

### Difficulty bucketing

Each stat value is stored **four times**, once per difficulty, in a
`StatContainer` (`StatsCounter.h:21`):

| `eDifficulty` | Index |
|---------------|-------|
| `eDifficulty_Peaceful` | 0 |
| `eDifficulty_Easy` | 1 |
| `eDifficulty_Normal` | 2 |
| `eDifficulty_Hard` | 3 |

`award(stat, difficulty, count)` (`StatsCounter.cpp:35`) adds `count` into the
right bucket. Achievements are always written to difficulty 0 (`if
(stat->isAchievement()) difficulty = 0`). It also does overflow clamping: a value
that wraps is capped to `UINT_MAX`, and any non-*large* stat over `USHRT_MAX` is
clamped to `USHRT_MAX` — because most stats are serialised as `unsigned short`.

### Large stats

Eight distance/time stats need full 32-bit range and are exempt from the
`USHRT_MAX` clamp. `LARGE_STATS` (`StatsCounter.cpp:14`):

`Stats::walkOneM`, `swimOneM`, `fallOneM`, `climbOneM`, `minecartOneM`,
`boatOneM`, `pigOneM`, `timePlayed`.

`isLargeStat(stat)` (`StatsCounter.cpp:1278`) linear-scans this table, and
`save()` writes those eight as `unsigned int` while everything else is
`unsigned short` (`StatsCounter.cpp:241-264`).

### Persistence into the profile blob

There is **no stats file**. `parse(void* data)` (`StatsCounter.cpp:131`) and
`save(int player, bool force)` (`StatsCounter.cpp:203`) read/write directly into
the profile's `GAME_DEFINED_PROFILE_DATA`, skipping past a `GAME_SETTINGS`
header. `save()` first `assert`s the whole stat set fits in
`CConsoleMinecraftApp::GAME_DEFINED_PROFILE_DATA_BYTES - sizeof(GAME_SETTINGS)`,
then `memset`s and re-serialises every `Stats::all` entry in order.

Save is rate-limited by two tick counters (`StatsCounter.h:36-37`):

| Constant | Value | Meaning |
|----------|-------|---------|
| `SAVE_DELAY` | `30*60` | ticks between profile writes after a change |
| `FLUSH_DELAY` | `30*60*5` | ticks before a modified leaderboard is flushed |

`tick(player)` (`StatsCounter.cpp:105`) counts `saveCounter` down and calls
`save()` when it hits zero and `requiresSave` is set; separately it counts
`flushCounter` down to trigger `flushLeaderboards()`.

> **Trial gating:** `save()`, `saveLeaderboards()` and `writeStats()` all early-out
> on `!ProfileManager.IsFullVersion()` — a trial/demo profile never persists stats
> or scores (`StatsCounter.cpp:207`, `327`, `353`). See [Trial Mode](/slop-docs/client/consoles-systems/#trialmode).

### canTake — neoLegacy always-unlockable achievements

`canTake(Achievement*)` in vanilla walked the achievement's parent dependency
chain. Here it is short-circuited:

```cpp
bool StatsCounter::canTake(Achievement *ach)
{
    //4J Gordon: Remove achievement dependencies, always able to take
    return true;
}
```

`StatsCounter.cpp:83`. Any achievement can be awarded regardless of whether its
prerequisite was earned first.

### Worked trace: one achievement unlock, trigger to persisted

This follows a single achievement from the gameplay event that grants it to the
on-screen toast and the profile write, citing every hop. The classic
`AchievementPopup` is **not** on this path — the live toast is the XUI one, and the
grant, telemetry and persistence are all driven from `LocalPlayer::awardStat`.

**1 — Grant (`LocalPlayer::awardStat`).** A stat/achievement is awarded through
`LocalPlayer::awardStat(Stat *stat, byteArray param)` (`LocalPlayer.cpp:888`). On
the desktop `#else` branch it reads the param count, then early-outs if stats are
disabled or the stat is null (`:904-905`), and branches on
`stat->isAchievement()` (`:907`).

**2 — Fresh-unlock gate + toast.** For an achievement it casts to `Achievement*`,
builds the icon path `Graphics\Achievements\TROP<icon>.png` and loads its bytes
(`:918-921`), then gates on **not already taken** and shows the live XUI toast
(`LocalPlayer.cpp:924-931`):

```cpp
if (!minecraft->stats[m_iPad]->hasTaken(ach)) {
    ui.ShowAchievementToast(
        WideToUtf8(app.GetString(ach->nameID)),
        WideToUtf8(app.FormatHTMLString(0, app.GetString(IDS_ACHIEVEMENT_VIEW), 0xFFFFFFFF, true).c_str()),
        ba, WideToUtf8(path.c_str()));
    minecraft->achID = ach->getAchievementID();
}
```

`hasTaken(ach)` is a plain map membership test —
`stats.find(ach) != stats.end()` (`StatsCounter.cpp:78`) — so the toast only fires
the first time.

**3 — Platform award + telemetry.** Guarded by
`ProfileManager.CanBeAwarded(m_iPad, id)` (splitscreen/trial players are filtered),
it records `TelemetryManager->RecordAchievementUnlocked(m_iPad, id, 0)`
(`LocalPlayer.cpp:949`) and, for a full-version local single-player game, may pop
the platform award menu (`:953-957`). The actual entitlement grant is
`ProfileManager.Award(m_iPad, id)`, itself gated by a per-session bitmask
`m_awardedThisSession` to stop trophy spam (`:960-967`).

**4 — Tally into StatsCounter.** Finally it folds the stat into the difficulty
store — `minecraft->stats[m_iPad]->award(stat, level->difficulty, count)`
(`LocalPlayer.cpp:969`). `StatsCounter::award` (`StatsCounter.cpp:35`) forces
achievements to difficulty bucket `0` (`:38-39`), inserts/adds into the
`StatContainer` (`:41-62`), sets `requiresSave = true` (`:64`), and — if the stat
is on a leaderboard — ORs its flag into `modifiedBoards` shifted by difficulty and
arms `flushCounter = FLUSH_DELAY` (`:67-74`).

**5 — Persist (deferred).** No disk write happens inline. `StatsCounter::tick(player)`
(`StatsCounter.cpp:105`) counts `saveCounter` down and, when it hits zero with
`requiresSave` set, calls `save()` — which serialises the whole stat set into the
profile blob's `GAME_DEFINED_PROFILE_DATA` (see
[Persistence into the profile blob](#persistence-into-the-profile-blob)) — while
`flushCounter` separately drives `flushLeaderboards()`. On a trial profile all of
`save()` / `saveLeaderboards()` / `writeStats()` early-out, so a demo unlock shows
the toast but never persists.

## Leaderboards

### The abstract manager

`LeaderboardManager` (`Common/Leaderboards/LeaderboardManager.h`) is a pure-virtual
singleton (`LeaderboardManager::Instance()`). Four leaderboard categories are
defined by `EStatsType` (`LeaderboardManager.h:68`):

| `EStatsType` | Columns (`eProperty_*`) |
|--------------|-------------------------|
| `eStatsType_Travelling` | walked, fallen, minecart, boat (+ rating) |
| `eStatsType_Mining` | dirt, stone, sand, cobblestone, gravel, clay, obsidian (+ rating) |
| `eStatsType_Farming` | egg, wheat, mushroom, sugarcane, milk, pumpkin (+ rating) |
| `eStatsType_Kills` | zombie, skeleton, creeper, spider, spider-jockey, zombie-pigman, slime (+ rating) |

Reads are filtered by `EFilterMode` — `eFM_Friends`, `eFM_MyScore`, `eFM_TopRank`
(`LeaderboardManager.h:78`). The read API is
`ReadStats_Friends/_MyScore/_TopRank(...)`, and writes go through
`WriteStats(viewCount, views)` + `FlushStats()`. `LeaderboardInterface`
(`LeaderboardInterface.h`) is a thin retry wrapper 4J added around a single
pending read.

### Mapping stats onto boards

`StatsCounter::setupStatBoards()` (`StatsCounter.cpp:1244`) builds the static
`statBoards` map from individual `Stat*`s to a `LEADERBOARD_*` bitflag. The
`LEADERBOARD_FLAG` enum (`StatsCounter.h:39`) packs **category × difficulty** into
one 32-bit mask: e.g. `LEADERBOARD_KILLS_PEACEFUL = 0x1`, and `award()` shifts by
difficulty (`modifiedBoards |= (flag << difficulty)`, `StatsCounter.cpp:71`) so
`_EASY`/`_NORMAL`/`_HARD` fall out of the same base bit. `writeStats()`
(`StatsCounter.cpp:349`) walks `modifiedBoards`, packs a `RegisterScore` per dirty
board (score = sum of that board's columns), and hands them to the manager.

### The Sony (PSN) implementation

`SonyLeaderboardManager : public LeaderboardManager`
(`Common/Leaderboards/SonyLeaderboardManager.h`) is the PS3/PS4/Vita concrete
manager (guarded per-platform: `__PS3__`, `__ORBIS__`, `__PSVITA__`). It runs the
SCE NP score utility on a dedicated worker thread (`m_threadScoreboard`,
`scoreboardThreadEntry`) and queues `RegisterScore`s under a `CRITICAL_SECTION`
(`m_csViewsLock`). Because PSN score "comments" are a small binary blob, it packs
the per-column record with a **base32** codec (`RECORD_SIZE = 40 // base32`,
`LeaderboardManager.h:140`) via `toBase32`/`fromBase32` and the `base64.cpp`
helper. Platform-specific NP calls (`createTitleContext`,
`createTransactionContext`, `getFriendsList` on Orbis/Vita, `getComment`) are left
pure-virtual for the concrete per-console subclass to fill in.

### The console scene

`UIScene_LeaderboardsMenu : public UIScene, public LeaderboardReadListener`
(`Common/UI/UIScene_LeaderboardsMenu.h`) is the front-end. Constants
(`UIScene_LeaderboardsMenu.h:14-18`):

| Constant | Value |
|----------|-------|
| `NUM_LEADERBOARDS` | `4` |
| `NUM_ENTRIES` | `101` (max cached rows) |
| `READ_SIZE` | `15` (rows per read) |
| `LEADERBOARD_KILLS_POSITION` | `3` |

The kills board has no Peaceful column, so the scene special-cases
`LEADERBOARD_KILLS_POSITION` when mapping the difficulty selector to columns
(comment at `UIScene_LeaderboardsMenu.h:10`). It implements `OnStatsReadComplete`
as the async read callback and paginates via `handleRequestMoreData(startIndex,
up)`.

## StatsSyncher — the (unimplemented) server sync

`StatsSyncher` (`StatsSyncher.h`) was Mojang's PC-era background thread that
double-buffered stats to a stats server (`SEND_INTERVAL = 20*60`, `SAVE_INTERVAL =
20*5`; `loadStatsFromDisk`, `doSend`, `getStatsFromServer`). On this build it is a
**stub** — `StatsSyncher.cpp` contains only:

```cpp
#include "stdafx.h"
#include "StatsSyncher.h"

// 4J - TODO
```

The header is kept for source parity, but no method is defined. Console stat
persistence is entirely `StatsCounter` → profile blob + `LeaderboardManager`.

## Telemetry

`CTelemetryManager` (`Common/Telemetry/TelemetryManager.h`, global
`TelemetryManager`) is a virtual event recorder. `Init()`/`Tick()`/`Flush()`
bookend a session, and a `RecordHeartBeat` fires periodically. The event surface
covers the whole play session:

| Event | Notable args |
|-------|--------------|
| `RecordPlayerSessionStart` / `RecordPlayerSessionExit` | `iPad`, exit status |
| `RecordLevelStart` / `RecordLevelResume` / `RecordLevelExit` | friends-or-match, compete-or-coop, difficulty, local/online player counts |
| `RecordLevelSaveOrCheckpoint` | save id, size in bytes |
| `RecordMenuShown` | `EUIScene menuID` — ties telemetry to the [UIScene enum](/slop-docs/client/ui-system/) |
| `RecordAchievementUnlocked` | achievement id + gamerscore |
| `RecordSkinChanged` | `dwSkinId` — see [Skin Select](/slop-docs/client/settings/) |
| `RecordTexturePackLoaded` | pack id, `purchased` |
| `RecordUpsellPresented` / `RecordUpsellResponded` | `ESen_UpsellID`, marketplace offer id, outcome |
| `RecordPlayerDiedOrFailed` / `RecordEnemyKilledOrOvercome` | low-res map coords, weapon ids, `ETelemetryChallenges` enemy type |
| `RecordBanLevel` / `RecordUnBanLevel` | content moderation |

It also owns the multiplayer instance id (`GenerateMultiplayerInstanceId`,
`GetMultiplayerInstanceID`) that stitches a session's events together, and a set
of `Get*` helpers that pull common fields (mode, difficulty, license, controls,
audio) from `Consoles_App`. The enum types (`ESen_FriendOrMatch`,
`ESen_UpsellOutcome`, `ETelemetryChallenges`, …) live in `Common/UI/UIEnums.h`.

## Related pages

- [Settings & Skin Select](/slop-docs/client/settings/) — the scenes that raise `RecordSkinChanged` / `RecordTexturePackLoaded`
- [Multiplayer & Client Networking](/slop-docs/client/networking/) — where session/level telemetry is driven from
- [Tutorial, DLC & Console Systems](/slop-docs/client/consoles-systems/) — Trial Mode gating that blocks stat/leaderboard writes
- [Client Overview](/slop-docs/client/overview/) — the `Minecraft` god-object that owns `stats[4]` and `achievementPopup`

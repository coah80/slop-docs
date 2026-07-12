---
title: Minecraft.Client Overview
description: The Minecraft god-object, its static-ctor boot sequence, the run()/run_middle()/run_end() console-loop split, Consoles_App (CMinecraftApp) as the real driver, splitscreen viewport assignment, and the two-GUI-stacks situation.
---

The `Minecraft.Client` project is the platform-independent half of the client:
one giant singleton (`class Minecraft`, the "god-object") plus a console
application driver (`CMinecraftApp`, global `app`) that owns menus, sign-in,
game settings and DLC. The per-platform `main`/`WinMain`, the D3D/GL device, and
the actual frame loop live in the skipped per-platform dirs (`Windows64/`,
`Durango/`, `Orbis/`, …); they call *into* the platform-independent code.

Files: `Minecraft.h` (353 lines), `Minecraft.cpp` (5420 lines),
`Common/Consoles_App.h`/`.cpp`, `Common/ConsoleGameMode.cpp`,
`Common/UI/UIController.cpp`, `Common/UI/UILayer.cpp`.

## Read this first: two GUI stacks

The client carries **two entirely separate UI systems**, and later docs must not
conflate them.

| Stack | Root class / files | Status on console |
|-------|-------------------|-------------------|
| Classic Java-port `Screen` hierarchy | `Screen : GuiComponent` (`Screen.h`, 58 lines), all root-level `*Screen.cpp` | **Largely vestigial.** The original Mojang Java UI ported to C++. Kept only because renderers, the HUD `Gui`, `Font`, `Button` etc. still reference `GuiComponent`. |
| Console XUI / "UIScene" stack | `Common/UI/UIScene_*`, `Common/XUI/XUI_*` | **Live front-end.** Every menu you actually see is a `UIScene` backed by an Iggy (Scaleform/Flash) movie, driven by the global `ui` controller. |

**All neoLegacy UI changes** — skin select, the updated controls menu, the wider
settings pages, the controller-icon slider — live in `Common/UI/UIScene_*`, **not**
in the root `*Screen` classes. Two things do survive from the classic stack and
are genuinely live: the in-world HUD (`Gui : GuiComponent`, `Minecraft::gui`) and
the achievement toast (`AchievementPopup`). `Common/XUI/` is the even older
Xbox-360-era XUI implementation of the same scenes; treat `Common/UI/` as
canonical and `Common/XUI/` as its legacy sibling.

See [Rendering Pipeline](/slop-docs/client/rendering/) for the HUD and world
renderers, and [Input](/slop-docs/client/input/) for how `UIController` routes
button presses down to each scene.

## The Minecraft god-object

`class Minecraft` (`Minecraft.h:48`) is a singleton reached through
`Minecraft::GetInstance()` (`Minecraft.cpp:4912`), which returns the static
`Minecraft::m_instance`. It directly owns almost every client subsystem as a raw
pointer member:

| Member | Type | Purpose |
|--------|------|---------|
| `level` | `MultiPlayerLevel*` | the active client world (a `Level` subclass) |
| `levelRenderer` | `LevelRenderer*` | terrain geometry + `LevelListener` bridge to the world |
| `gameRenderer` | `GameRenderer*` | camera / per-frame render orchestration |
| `particleEngine` | `ParticleEngine*` | client particle system |
| `gui` | `Gui*` | in-world HUD (live classic-stack component) |
| `textures` | `Textures*` | texture manager / atlas |
| `soundEngine` | `SoundEngine*` | audio (see `Common/Audio/`) |
| `options` | `Options*` | classic-port settings mirror (see [Settings](/slop-docs/client/settings/)) |
| `screen` | `Screen*` | classic-stack current screen (vestigial) |
| `progressRenderer` | `ProgressRenderer*` | loading screen |
| `achievementPopup` | `AchievementPopup*` | achievement toast overlay |
| `user` | `User*` | account / profile |
| `skins` | `TexturePackRepository*` | texture-pack enumeration |
| `gameMode` | `MultiPlayerGameMode*` | *active* player's game mode |

Note that `Minecraft::gameMode`, `Minecraft::player` and `Minecraft::level` are
not fixed — they are *repointed* every time a different splitscreen player is
selected for processing (see [Splitscreen](#splitscreen-localplayers-and-viewports)).

### Per-player (splitscreen) arrays

Anything that used to be a single value in Java LCE is now an array indexed by
pad, `[0 .. XUSER_MAX_COUNT-1]` (`Minecraft.h:103-113`):

```cpp
shared_ptr<MultiplayerLocalPlayer> localplayers[XUSER_MAX_COUNT];
MultiPlayerGameMode *localgameModes[XUSER_MAX_COUNT];
ItemInHandRenderer *localitemInHandRenderers[XUSER_MAX_COUNT];
ClientConnection *m_pendingLocalConnections[XUSER_MAX_COUNT];
```

`localPlayerIdx` records which of these is currently "swapped in".

## Entry point: Minecraft::main()

`Minecraft::main()` (`Minecraft.cpp:4921`) is the platform-independent entry the
platform `main`/`WinMain` calls once. It runs the static-constructor chain that
builds every global registry, loads the default game rules, then hands off to
`Minecraft::start()`:

```cpp
void Minecraft::main()
{
    ...
    MinecraftWorld_RunStaticCtors();
#ifndef MINECRAFT_SERVER_BUILD
    EntityRenderDispatcher::staticCtor();
    TileEntityRenderDispatcher::staticCtor();
#endif
    User::staticCtor();
    Tutorial::staticCtor();
    ColourTable::staticCtor();
    app.loadDefaultGameRules();
    ...
    IUIScene_CreativeMenu::staticCtor();
#ifndef __ORBIS__
    Minecraft::start(name, sessionId);
#endif
}
```

| Static ctor | Registers |
|-------------|-----------|
| `MinecraftWorld_RunStaticCtors()` | all of `Minecraft.World` (tiles, items, entities, blocks) |
| `EntityRenderDispatcher::staticCtor()` | every mob/entity renderer, keyed by `eINSTANCEOF` |
| `TileEntityRenderDispatcher::staticCtor()` | block-entity renderers (chest, sign, beacon, …) |
| `User::staticCtor()` | account/profile globals |
| `Tutorial::staticCtor()` | tutorial task/hint state machine |
| `ColourTable::staticCtor()` | grass/foliage/water biome colour lookup |
| `app.loadDefaultGameRules()` | the console mini-game/map rule system (`Common/GameRules/`) |
| `IUIScene_CreativeMenu::staticCtor()` | creative-menu item layout |

The render-dispatcher ctors are compiled out for `MINECRAFT_SERVER_BUILD`, since a
headless server needs no renderers. On PS4 (`__ORBIS__`) the final
`Minecraft::start()` call is deferred to another thread because it takes ~2.5s and
would otherwise break Sony's TRC timing on `SubmitDone`.

## The run() split: run() / run_middle() / run_end()

In Java LCE, `Minecraft::run()` was a single blocking function containing the
whole game loop. 4J split it into three so the loop could be driven from the
console's own top-level game loop. The comment at `Minecraft.h:218` reads
*"split the run into 3 parts so we can run it from our xbox game loop."* The
original single-body `run()` still exists at `Minecraft.cpp:650` but is dead —
it is wrapped in `#if 0`.

| Function | Location | What it does |
|----------|----------|--------------|
| `run()` | `Minecraft.cpp:805` | just `running = true; init();` — one-time startup |
| `run_middle()` | `Minecraft.cpp:1270` | **the actual per-frame body**: world tick, per-viewport `tick()`, game render |
| `run_end()` | `Minecraft.cpp:2160` | just `destroy();` — teardown |

So `run_middle()` is where the real work is. Its shape:

1. `pause = app.IsAppPaused();` and autosave/countdown bookkeeping.
2. For each occupied pad, `setLocalPlayerIdx(idx)` then `tick(bFirst, bUpdateTextures)`
   — the per-viewport world tick (`Minecraft.cpp:1937`).
3. `ui.HandleGameTick();` and `soundEngine->tick(...)`.
4. If not `noRender`, loop the pads again: `setLocalPlayerIdx(i)`, set the D3D/GL
   viewport for `player->m_iScreenSection`, then `gameRenderer->render(timer->a, bFirst)`
   (`Minecraft.cpp:1998-2026`).
5. `achievementPopup->render(); Display::update();`.

`tick(bool bFirst, bool bUpdateTextures)` (`Minecraft.h:268`) is the per-viewport
tick. `bFirst` is true for the first active viewport in splitscreen; `bUpdateTextures`
is true only on the last first-viewport pass of the tick, so animated textures
are stepped exactly once per frame rather than once per viewport.

## Consoles_App (CMinecraftApp) — the real driver

Despite the filename `Consoles_App.*`, the class is **`CMinecraftApp`**
(`Common/Consoles_App.h:63`). Each platform subclasses it as
`CConsoleMinecraftApp` and declares the single global `app` (e.g.
`Windows64/Windows64_App.h:38`: `extern CConsoleMinecraftApp app;`). `app` — not
`Minecraft` — is the top of the stack. It owns:

- **Menu/scene flow**: `app.SetAction(iPad, action, param)` requests scene
  transitions that `UILayer` turns into `new UIScene_*(...)`.
- **Per-pad game settings**: `GAME_SETTINGS *GameSettingsA[XUSER_MAX_COUNT]`
  (`Consoles_App.h:485`) via `Get/SetGameSettings` — the authoritative settings
  store (see [Settings](/slop-docs/client/settings/)).
- **DLC**: `DLCManager m_dlcManager` (`Consoles_App.h:84`).
- **Skins**: skin-adjustment map, `GetSkinAdjustments`/`SetSkinAdjustments`.
- **Sign-in / profiles / trial gating**, credits text, and the string table.

`app` calls into `Minecraft::GetInstance()` for all gameplay; the console
front-end (`app` + the global `ui` `UIController` + the `UIScene_*` scenes) sits
*above* the `Minecraft` engine.

### One frame, in order (Windows64)

The Windows64 loop (`Windows64/Windows64_Minecraft.cpp`) shows how the split
functions and the UI stack interleave each frame:

```cpp
if(app.GetGameStarted())
{
    pMinecraft->applyFrameMouseLook();   // per-frame mouse look (before ticks + render)
    pMinecraft->run_middle();            // world tick + game render, all viewports
    app.SetAppPaused( ... ui.IsPauseMenuDisplayed(...) );
}
...
pMinecraft->soundEngine->playMusicTick();
...
ui.tick();                               // UIController: tickInput() + scene ticks
ui.render();                             // UIController::renderScenes() — draw the XUI scenes on top
pMinecraft->gameRenderer->ApplyGammaPostProcess();
```

The world is drawn inside `run_middle()`; the live menu/HUD scenes are drawn
afterward by `ui.render()`, so the XUI stack always composites on top of the 3D
world. This is why a paused game still shows the world behind the pause menu.

## Splitscreen: localplayers[] and viewports

Splitscreen is implemented by repointing the "current player" fields and by
assigning each player a viewport quadrant.

`setLocalPlayerIdx(int idx)` (`Minecraft.cpp:819`) swaps a pad's state into the
active fields so the rest of the (single-player-shaped) engine code can run
unchanged:

```cpp
bool Minecraft::setLocalPlayerIdx(int idx)
{
    localPlayerIdx = idx;
    if( localplayers[idx] == nullptr || localgameModes[idx] == nullptr ) return false;
    gameMode          = localgameModes[idx];
    player            = localplayers[idx];
    cameraTargetPlayer = localplayers[idx];
    gameRenderer->itemInHandRenderer = localitemInHandRenderers[idx];
    level             = getLevel( localplayers[idx]->dimension );
    particleEngine->setLevel( level );
    return true;
}
```

Both the world-tick loop and the render loop in `run_middle()` iterate the pads
and call `setLocalPlayerIdx(i)` before touching `player`/`level`/`gameMode`.

`updatePlayerViewportAssignments()` (`Minecraft.cpp:841`) decides the layout from
the count of non-null `localplayers[]`:

| Players | Layout | `m_iScreenSection` values |
|---------|--------|---------------------------|
| 1 | fullscreen | `VIEWPORT_TYPE_FULLSCREEN` |
| 2 | horizontal or vertical split | `VIEWPORT_TYPE_SPLIT_TOP + n` **or** `VIEWPORT_TYPE_SPLIT_LEFT + n` |
| 3–4 | quadrants (3 promoted to 4) | `VIEWPORT_TYPE_QUADRANT_TOP_LEFT .. BOTTOM_RIGHT` |

For two players the split orientation is keyed off the primary pad's setting:

```cpp
if(app.GetGameSettings(ProfileManager.GetPrimaryPad(),eGameSetting_SplitScreenVertical))
    localplayers[i]->m_iScreenSection = C4JRender::VIEWPORT_TYPE_SPLIT_LEFT + found;
else
    localplayers[i]->m_iScreenSection = C4JRender::VIEWPORT_TYPE_SPLIT_TOP + found;
```

With three players a fourth quadrant is left empty; `unoccupiedQuadrant` records
which one, and `run_middle()` clears it to black and drops a logo there
(`Minecraft.cpp:2028-2036`, `ui.SetEmptyQuadrantLogo(...)`). The render loop sets
each viewport with `RenderManager.StateSetViewport(player->m_iScreenSection)`
before `gameRenderer->render(...)`.

## See also

- [Rendering Pipeline](/slop-docs/client/rendering/) — how one viewport is drawn.
- [Input](/slop-docs/client/input/) — `UIController::tickInput` and per-scene routing.
- [Settings & Options](/slop-docs/client/settings/) — the per-pad `eGameSetting` store vs the classic `Options` mirror.

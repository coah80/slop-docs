---
title: Classic Screens & HUD
description: "The vestigial Screen : GuiComponent hierarchy ported from Java, the one live class from it (the Gui HUD), and the text/widget primitives — Font, StringTable, Button, EditBox, ScrolledSelectionList."
---

The client ships **two** UI stacks. The console front-end you actually see —
menus, inventory, settings — is the XUI / `UIScene_*` stack documented under the
[client overview](/slop-docs/client/overview/#read-this-first-two-gui-stacks).
This page covers the **other** stack: the classic Mojang-Java `Screen`
hierarchy that was ported to C++ and then mostly left behind. Almost all of it
is vestigial. The one part that stayed live is the in-world `Gui` HUD.

Files: `Screen.h`/`.cpp`, `GuiComponent.h`/`.cpp`, `Gui.h`/`.cpp`,
`Font.h`/`.cpp`, `StringTable.h`/`.cpp`, `WstringLookup.cpp`, `Button.h`/`.cpp`,
`SmallButton.*`, `SlideButton.*`, `EditBox.*`, `ScrolledSelectionList.*`,
`GuiMessage.*`, `GuiParticles.*`, and one `*Screen.cpp` per classic screen.

## GuiComponent — the drawing base

Everything in this stack derives from `GuiComponent` (`GuiComponent.h`), a thin
immediate-mode drawing helper. It holds a single `blitOffset` and exposes the
primitive draw calls every screen and widget reuses:

| Method | Purpose |
|--------|---------|
| `hLine` / `vLine` | 1px axis lines |
| `fill(x0,y0,x1,y1,col)` | Solid rectangle |
| `fillGradient(...)` | Vertical two-colour gradient |
| `drawString` / `drawCenteredString` | Text via a `Font*` (parses `§` codes) |
| `drawStringLiteral` | Text without `§` parsing |
| `drawStringPreshaped` | Text already shaped (Arabic/bidi) |
| `blit(x,y,sx,sy,w,h)` | Blit a region of the bound texture |

`Screen`, `Button`, and `Gui` all extend this class directly.

## The vestigial Screen hierarchy

`Screen` (`Screen.h:8`) is `class Screen : public GuiComponent`. It is the
direct port of Java's `Screen`: it holds a `Minecraft*`, `width`/`height`, a
`vector<Button*>`, a `Font*`, and a `GuiParticles*` for the menu backdrop. The
lifecycle virtuals are all present — `init(Minecraft*, w, h)`, `render(xm, ym,
a)`, `tick()`, `mouseClicked`/`mouseReleased`, `keyPressed`, `buttonClicked`,
`renderBackground`, `renderDirtBackground`, `isPauseScreen`, `confirmResult`.

### Why it's vestigial

The classic screen is set through `Minecraft::setScreen(Screen*)`
(`Minecraft.h:205`) into `Minecraft::screen` (`Minecraft.h:141`), and the game
loop still has hooks for it — `screen->init(...)` when the viewport resizes
(`Minecraft.cpp:583`), `screen->tick()` (`Minecraft.cpp:2418`),
`isPauseScreen()` for pause gating (`Minecraft.cpp:770`). But the **live console
front-end never routes through it**: menus are driven by `ui`
(`UIController`/`UILayer`) and the `GetMenuDisplayed(iPad)` check sits right
alongside the `screen != nullptr` checks (e.g. `Minecraft.cpp:2427`,
`Minecraft.cpp:2434`). Several re-init calls are commented out with 4J TODOs
("`// screen->init(this, screenWidth, screenHeight); // 4J - TODO - put back
in`", `Minecraft.cpp:2287`). In practice the console game shows XUI scenes, not
these `Screen`s. They are kept compiling because renderers, `Gui`, `Font`,
`Button`, and `EditBox` still reference the classic types.

### The classic screens

Direct `Screen` subclasses (grep `public Screen` across the `*.h`):

`TitleScreen`, `OptionsScreen`, `VideoSettingsScreen`, `ControlsScreen`,
`PauseScreen`, `ChatScreen`, `DeathScreen`,
`AchievementScreen`, `StatsScreen`, `ConfirmScreen`, `ConnectScreen`,
`DisconnectedScreen`, `ErrorScreen`, `JoinMultiplayerScreen`, `NameEntryScreen`,
`ReceivingLevelScreen`, `RenameWorldScreen`, `SelectWorldScreen`,
`CreateWorldScreen`, `TextEditScreen`. (`InBedChatScreen` extends `ChatScreen`,
not `Screen` directly.)

Container screens form a small chain under `AbstractContainerScreen`
(`AbstractContainerScreen.h:8`, `: public Screen`). Each of these extends it
**directly**:

| Class | Extends |
|-------|---------|
| `AbstractContainerScreen` | `Screen` |
| `ContainerScreen` | `AbstractContainerScreen` |
| `CraftingScreen` | `AbstractContainerScreen` |
| `InventoryScreen` | `AbstractContainerScreen` |
| `FurnaceScreen` | `AbstractContainerScreen` |
| `TrapScreen` | `AbstractContainerScreen` |

The live equivalents — what you actually open in-game — are the
`UIScene_InventoryMenu`, `UIScene_CraftingMenu`, `UIScene_FurnaceMenu`,
`UIScene_ContainerMenu` scenes in `Common/UI/`.

`Screen::render` (`Screen.cpp:38`) just iterates its `buttons` and renders each;
the `particles` (menu-background `GuiParticles`) pointer is initialised to
`nullptr` in the ctor (`Screen.cpp:22`) — another sign the console build no
longer wires up the animated menu backdrop through this path (it uses
`UIComponent_Panorama` instead; see [Particles](/slop-docs/client/particles/#gui-particles-menu-background)).

## Gui — the live HUD

`Gui` (`Gui.h:11`, `class Gui : public GuiComponent`) is the exception. This is
`Minecraft::gui`, the in-world **heads-up display**, and it runs every frame in
the real game. It is a `GuiComponent`, not a `Screen`.

Entry point:

```cpp
void render(float a, bool mouseFree, int xMouse, int yMouse);
```

### What it draws

| Member | Draws |
|--------|-------|
| `renderSlot(slot, x, y, a)` | One hotbar slot + item |
| `renderVignette(br, w, h)` | Screen-edge darkening |
| `renderPumpkin(w, h)` | Pumpkin-helmet overlay (uses `PUMPKIN_BLUR_LOCATION`) |
| `renderTp(br, w, h)` | Portal/teleport wobble overlay |
| `renderGraph(...)` | **4J** debug frame-time graph |
| `renderStackedGraph(...)` | **4J** stacked debug graph |

Chat/message state is per-player for splitscreen:
`vector<GuiMessage> guiMessages[XUSER_MAX_COUNT]` (`Gui.h:19`), with
`addMessage(str, iPad, bIsDeathMessage)`, `clearMessages(iPad)`,
`getMessagesCount(iPad)`, `getMessage(iPad, index)`, and per-message fade
`getOpacity(iPad, index)`. `MAX_MESSAGE_WIDTH` is a private
`m_iMaxMessageWidth = 280` (`Gui.h:17`) — 4J note that the old `320` value
"doesn't account for the safe zone" so the effective width was reduced.

The "now playing" / jukebox action bar is `overlayMessageString` +
`overlayMessageTime`, set via `setNowPlaying(str)` / `setActionBarMessage(str)`
and read back through `getJukeboxMessage`/`getJukeboxOpacity`. Two 4J static
blend factors, `Gui::currentGuiBlendFactor` and `Gui::currentGuiScaleFactor`
(`Gui.h:36`), let the HUD fade/scale in sync with the console UI.

## Text: Font & StringTable

### Font

`Font` (`Font.h:8`) is the bitmap+unicode text renderer used by both the classic
screens and the live `Gui`. It loads an ASCII sheet plus lazily-paged unicode
sheets (`unicodeTexID[256]`, `loadUnicodePage(page)`), tracks `§`-code style
state (`m_bold`, `m_italic`, `m_underline`, `m_strikethrough`), and supports
bidirectional reorder for RTL scripts (`setBidirectional`, `reorderBidi`).

Public draw / measure API (selection):

| Method | Notes |
|--------|-------|
| `draw(str, x, y, color)` | Standard, parses `§` codes |
| `drawShadow(str, x, y, color)` | With drop shadow |
| `drawLiteral(str, x, y, color)` | No `§` parsing |
| `drawShadowLiteral` / `drawShadowLiteralPreshaped` | Literal / already-shaped variants |
| `drawWordWrap(str, x, y, w, col, h)` | Wrapped (note the 4J-added `h` height param) |
| `wordWrapHeight(str, w)` | Measure wrapped height |
| `width(str)` / `widthLiteral(str)` / `widthPreshaped(str)` | Pixel width; literal keeps `§` codes (for chat input) |
| `sanitize(str)` / `AllCharactersValid(str)` | 4J: strip / validate (rejects invalid player-name chars) |

Note the destructor is `#ifndef _XBOX` only — 4J comment: "This dtor clashes
with one in xui! We never delete these anyway" (`Font.h:46`), a direct artifact
of the two-stack coexistence.

### StringTable

`StringTable` (`StringTable.h:13`) is the localisation lookup. It loads
per-locale XML string tables into an `unordered_map<wstring, wstring>` (plus an
indexed `vector<wstring>`), with `getString(const wstring& id)` and
`getString(int id)` accessors, `setStringValue(id, value)`, and
`hasStringKey(id)`. `LOCALE_COUNT` is platform-dependent:

| Platform | `LOCALE_COUNT` |
|----------|----------------|
| PS3 / Orbis / PSVita | `21` |
| Xbox One | `19` |
| Everything else | `11` |

`WstringLookup.cpp` is the companion helper. On console the live XUI menus draw
their text through `UIString`/`UIBitmapFont` (see the overview), but both stacks
share this same `StringTable` for the actual localised strings.

## Widgets

The classic widgets all extend `Button` or wrap a `Screen`.

### Button

`Button` (`Button.h:5`, `: public GuiComponent`) — `x/y`, `w/h`, `msg`, `id`,
`active`, `visible`. Virtuals `render(Minecraft*, xm, ym)`, `renderBg(...)`,
`clicked(Minecraft*, mx, my)`, `released(mx, my)`, and `getYImage(hovered)` for
the hover/disabled sprite row. A 4J-added `init(...)` lets it be reconstructed
in place.

- `SmallButton` (`SmallButton.h:5`) — narrow variant; can carry an
  `Options::Option*` so a toggle button knows which setting it edits.
- `SlideButton` (`SlideButton.h:6`) — a slider bound to an `Options::Option*`,
  with `float value` and `bool sliding`; overrides `clicked`/`released` to drag.

These are the *classic* controls. The **live** console sliders and lists are
`UIControl_Slider`, `UIControl_MultiList`, `UIControl_Button` in `Common/UI/`
(see the overview's UI-controls list) — that is where neoLegacy's widened
settings and the controller-icon slider actually live, not in `SlideButton`.

### EditBox

`EditBox` (`EditBox.h:7`) — single-line text field owned by a `Screen`. Holds
`value`, `maxLength`, focus/active flags, and a `frame` counter for the caret
blink. `keyPressed(ch, eventKey)`, `mouseClicked`, `focus(bool)`, `tick()`,
`render()`, `setMaxLength`/`getMaxLength`. Used by classic screens like
`NameEntryScreen`, `CreateWorldScreen`, `RenameWorldScreen`.

### ScrolledSelectionList

`ScrolledSelectionList` (`ScrolledSelectionList.h:5`) is the abstract
scrollable list (world lists, server lists). It is **not** a `GuiComponent` — it
takes a `Minecraft*` and its own bounds. Subclasses implement the pure virtuals:

```cpp
virtual int  getNumberOfItems() = 0;
virtual void selectItem(int item, bool doubleClick) = 0;
virtual bool isSelectedItem(int item) = 0;
virtual void renderBackground() = 0;
virtual void renderItem(int i, int x, int y, int h, Tesselator *t) = 0;
```

It handles drag scrolling (`yDrag`, `yDragScale`, `NO_DRAG = -1`,
`DRAG_OUTSIDE = -2`), double-click detection (`lastSelection`,
`lastSelectionTime`), an optional header row (`setRenderHeader`), and up/down
buttons wired via `init(vector<Button*>*, upId, downId)`. Its live console
counterparts are the `UIControl_SaveList` / `UIControl_*List` classes.

## Related

- [Client overview](/slop-docs/client/overview/#read-this-first-two-gui-stacks) — the two-GUI-stacks split and the live XUI/`UIScene_*` front-end.
- [Input](/slop-docs/client/input/) — how menu input reaches `UIScene::handleInput` rather than these `Screen`s.
- [Particles](/slop-docs/client/particles/#gui-particles-menu-background) — `GuiParticles`, the classic menu backdrop.
- [Settings](/slop-docs/client/settings/) — `Options`/`Settings` vs the live `eGameSetting` store the widened menus write to.

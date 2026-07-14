---
title: Input
description: How input reaches the game — the vestigial Input/KeyMapping classes, UIController::tickInput menu routing down to each UIScene::handleInput, the neoLegacy keyboard/mouse-to-ACTION mapping, and Windows64 per-frame mouse look.
---

Input on console splits cleanly along the [two-GUI-stacks](/slop-docs/client/overview/#read-this-first-two-gui-stacks)
line. **Menu input** flows through the live `UIController` and lands in each
`UIScene::handleInput`. **In-world look/movement** is applied to the
`MultiplayerLocalPlayer` — on Windows64 there is an extra per-frame mouse-look
path that bypasses the 20 Hz tick. Of the two classic Java classes, `KeyMapping`
is dead, but `Input` is **not**: it was repurposed as the per-player movement-intent
object and its `tick()` runs live every player tick (see
[the vestigial classes](#the-vestigial-classic-classes-input-and-keymapping) below).

Files: `Input.h`/`.cpp`, `KeyMapping.h`/`.cpp`, `Common/UI/UIController.cpp`,
`Common/UI/UIScene.h`, `Common/UI/UIGroup.cpp`, `Minecraft.cpp`
(`applyFrameMouseLook`).

## The classic classes: Input (live) and KeyMapping (dead)

`class Input` (`Input.h`) is the Mojang movement-intent object — `xa`, `ya`,
`jumping`, `sneaking`, `sprinting`, and `virtual void tick(LocalPlayer *player)`.
Despite being a Java port, **it is live**: each `LocalPlayer` owns an `Input *input`
(`LocalPlayer.h:28`), constructed per pad (`Minecraft.cpp:1097`,
`localplayers[idx]->input = new Input()`), and `LocalPlayer::aiStep` calls
`input->tick(this)` (`LocalPlayer.cpp:230`) every player tick. `Input::tick`
(`Input.cpp:27`) is where mouse-look and the jump/movement intent are actually
computed — its own comment says *"4J Stu - Assume that we only need one input class …
based on the ControllerInput class in the Java"* (`Input.cpp:29-30`). See the
[keypress trace](#worked-trace-one-keypress-to-a-jump-and-the-menu-fork) below.

`class KeyMapping` (`KeyMapping.h`) is the one that is genuinely dead — the name/key
binding record. The header is blunt about its status:

```cpp
// KeyMapping.h
// 4J Stu - Not updated to 1.8.2 as we don't use this
class KeyMapping
{
public:
    wstring name;
    int key;
    KeyMapping(const wstring& name, int key);
};
```

`Options` still holds a `KeyMapping *keyMappings[14]` table
(`Options.h:74-90`) — `keyUp`, `keyJump`, `keyAttack`, `keyUse`, etc. — because
it is a straight port of the Java options file, but the console build does not
route input through it. Real *binding* lives in the platform `InputManager` and the
`ACTION_*` enum below; `KeyMapping` is kept only for source parity with the Java
codebase. (`Input` is the exception — it is repurposed and live, as above.)

## Menu input: UIController::tickInput → UIScene::handleInput

The global `ui` (a per-platform `ConsoleUIController : UIController`) owns all
menu input. Every frame `ui.tick()` (`UIController.cpp:559`) calls
`tickInput()` once per accumulated tick:

```cpp
// UIController::tick(), UIController.cpp:592
if(m_accumulatedTicks == 0) tickInput();
```

`tickInput()` (`UIController.cpp:998`) does two jobs:

1. **(Windows64 only)** mouse hover / click hit-testing against the top scene's
   controls — see [Mouse in menus](#mouse-in-menus-windows64) below.
2. Calls `handleInput()` (`UIController.cpp:1418`), the controller/keyboard path.

`handleInput()` loops every pad and every menu action key, calling
`handleKeyPress(iPad, key)`:

```cpp
// UIController.cpp:1418
void UIController::handleInput()
{
    for(unsigned int iPad = 0; iPad < XUSER_MAX_COUNT; ++iPad)
    {
        for(unsigned int key = 0; key <= ACTION_MAX_MENU; ++key)
        {
            handleKeyPress(iPad, key);
        }
    }
}
```

`handleKeyPress` reads edge state from the platform `InputManager`
(`InputManager.ButtonPressed(iPad, key)` / `ButtonReleased(...)`), then dispatches
the event to the UI groups. The fullscreen group is offered the key first, then
the pad's own player group (`UIController.cpp:1841-1845`):

```cpp
m_groups[static_cast<int>(eUIGroup_Fullscreen)]->handleInput(iPad, key, repeat, pressed, released, handled);
...
m_groups[(iPad+1)]->handleInput(iPad, key, repeat, pressed, released, handled);
```

`UIGroup::handleInput` (`UIGroup.cpp:227`) forwards to the top scene of the group,
whose `handleInput` is the per-scene virtual:

```cpp
// UIScene.h:243
virtual void handleInput(int iPad, int key, bool repeat,
                         bool pressed, bool released, bool &handled) {}
```

The `handled` out-parameter is a bool passed by reference through the whole chain,
so a scene that consumes an event stops it from bubbling further. Concrete scenes
override `handleInput` plus, for their widgets, `handleSliderMove`,
`handleCheckboxToggled`, and `handlePress` (e.g.
`UIScene_SettingsUIMenu.h:58-62`; see [Settings](/slop-docs/client/settings/)).

### The ACTION_* menu keys

Menu input is expressed in abstract action codes, not raw buttons, so the same
scene code works on every controller. The set runs `0 .. ACTION_MAX_MENU`; the
ones the controller/KBM code maps include:

| Action | Meaning |
|--------|---------|
| `ACTION_MENU_OK` / `ACTION_MENU_A` | confirm / A |
| `ACTION_MENU_CANCEL` / `ACTION_MENU_B` | back / B |
| `ACTION_MENU_UP` / `_DOWN` / `_LEFT` / `_RIGHT` | d-pad navigation |
| `ACTION_MENU_X` / `ACTION_MENU_Y` | X / Y face buttons |
| `ACTION_MENU_LEFT_SCROLL` / `_RIGHT_SCROLL` | shoulder tab-left / tab-right |
| `ACTION_MENU_PAGEUP` / `_PAGEDOWN` | trigger paging |
| `ACTION_MENU_OTHER_STICK_UP` / `_DOWN` | right-stick scroll |
| `ACTION_MENU_STICK_PRESS` | stick click |

## Keyboard & mouse to ACTION mapping (neoLegacy)

Windows64 support is a neoLegacy addition, so `handleKeyPress` contains a
KBM-specific layer that translates keyboard and mouse events into the abstract
menu actions above. When the mouse is *not* grabbed (i.e. a menu is up), each
`ACTION_*` key is given a virtual-key equivalent (`UIController.cpp:1651-1662`):

| Menu action | Keyboard |
|-------------|----------|
| `ACTION_MENU_OK` / `_A` | `VK_RETURN` |
| `ACTION_MENU_CANCEL` / `_B` | `VK_ESCAPE` |
| `ACTION_MENU_UP/DOWN/LEFT/RIGHT` | arrow keys |
| `ACTION_MENU_X` | `R` |
| `ACTION_MENU_Y` | `VK_TAB` |
| `ACTION_MENU_LEFT_SCROLL` / `_RIGHT_SCROLL` | `Q` / `E` |
| `ACTION_MENU_PAGEUP` / `_PAGEDOWN` | `VK_PRIOR` / `VK_NEXT` |

Mouse buttons are folded into the same actions when the cursor is free
(`UIController.cpp:1671-1683`):

- **Left click** → `ACTION_MENU_OK` / `ACTION_MENU_A` (confirm / select).
- **Right click** → `ACTION_MENU_X` (e.g. pick up half a stack in inventory).
- **Mouse wheel** → `ACTION_MENU_OTHER_STICK_UP` / `_DOWN`, further remapped to
  `LEFT`/`RIGHT` or `UP`/`DOWN` depending on the top scene (`UIController.cpp:1691-1719`).

### Mouse in menus (Windows64)

The Windows64 half of `tickInput()` (`UIController.cpp:1012+`) does real cursor
hit-testing that the console builds never needed. When the mouse is active and
not grabbed, it walks the menu layers by priority —

```cpp
static const EUILayer mouseLayers[] = {
    eUILayer_Debug,   // (skipped for _CONTENT_PACKAGE)
    eUILayer_Error, eUILayer_Alert, eUILayer_Popup,
    eUILayer_Fullscreen, eUILayer_Scene,
};
```

— finds the top scene, scales the raw window mouse position into the scene's
1280×720 space using the real `GetClientRect(g_hWnd, ...)` size, then hit-tests
each `UIControl`. Buttons, `UIControl_ButtonList`/`UIControl_MultiList`,
`UIControl_TexturePackList`, achievement lists and sliders each get their own
`SetTouchFocus(...)` handling so hover, click, and slider-drag all work with a
mouse. The smallest-area control under the cursor wins focus
(`UIController.cpp:1239-1247`), and slider drags are tracked across frames via
`m_mouseDraggingSliderScene` / `m_mouseDraggingSliderId`. The tooltip layer is
deliberately excluded from mouse hit-testing so non-interactive button hints
never steal focus.

## In-world look: applyFrameMouseLook (Windows64)

Because gameplay ticks at 20 Hz, applying mouse look only in the tick would make
the camera feel laggy at high frame rates. neoLegacy adds
`Minecraft::applyFrameMouseLook()` (`Minecraft.h:223`, guarded by `#ifdef
_WINDOWS64`; implementation at `Minecraft.cpp:1224`), called **every frame before
`run_middle()`** (see the [frame order](/slop-docs/client/overview/#one-frame-in-order-windows64)).

It consumes accumulated mouse deltas and applies them directly to the local
player's rotation:

```cpp
// Minecraft.cpp:1224
void Minecraft::applyFrameMouseLook()
{
    if (level == nullptr) return;
    for (int i = 0; i < XUSER_MAX_COUNT; i++)
    {
        if (localplayers[i] == nullptr) continue;
        int iPad = localplayers[i]->GetXboxPad();
        if (iPad != 0) continue;              // mouse only applies to pad 0
        if (!g_KBMInput.IsMouseGrabbed()) continue;

        float rawDx, rawDy;
        g_KBMInput.ConsumeMouseDelta(rawDx, rawDy);
        ...
        float mouseSensitivity = app.GetGameSettings(iPad, eGameSetting_Sensitivity_InGame) / 100.0f;
        float dyaw   =  (rawDx * mouseSensitivity) * 0.15f;
        float dpitch = -(-rawDy * mouseSensitivity) * 0.15f;
        localplayers[i]->yRot += dyaw;  localplayers[i]->yRotO += dyaw;
        localplayers[i]->xRot += dpitch; localplayers[i]->xRotO += dpitch;
        // clamp pitch to ±90°
    }
}
```

Key behaviours:

- **Pad 0 only** — the keyboard/mouse always drives pad 0; other splitscreen
  players use controllers.
- Sensitivity comes from the authoritative per-pad
  `eGameSetting_Sensitivity_InGame` (0–100, divided by 100), and invert is
  `eGameSetting_ControlInvertLook` — the same store the menu writes (see
  [Settings](/slop-docs/client/settings/)).
- The `0.15f` factor matches `Entity::turn` so per-frame look and tick-based look
  agree.
- The delta is applied to **both** the current rotation (`xRot`/`yRot`) **and**
  the previous-tick rotation (`xRotO`/`yRotO`), so the render interpolation
  reflects the movement immediately instead of waiting up to 50 ms for the next
  tick. Pitch is clamped to ±90° on both.

> **Changed in v1.1.0b** (`a59d441a feat: pick block (#40)` / `6e59e404 feat: pick
> block + jukebox fixes`): a **middle-mouse pick block** was added to the Windows64
> input path in `Minecraft::tick` (`Minecraft.cpp`, `#ifdef _WINDOWS64`). It watches
> `g_KBMInput.IsMouseButtonDown(KeyboardMouseInput::MOUSE_MIDDLE)` on pad 0 with an
> edge-detect (`wasMiddleMouseDown`), and — only when `gameMode->hasInfiniteItems()`
> (creative) and a `hitResult` exists — copies the looked-at tile (via
> `mayPick`/`cloneTileId`/`cloneTileData`) or entity (mapped through
> `EntityIO::eTypeToIoid`, with Elder-Guardian, horse-variant and Ocelot-cat-type
> special cases, falling back to the base spawn-egg aux via
> `EntityIO::idsSpawnableInCreative`) into the hotbar. See the
> [Changelog v1.1.0b section](/slop-docs/features/changelog/#v110b-current).

## Worked trace: one keypress to a jump (and the menu fork)

This follows a single Windows64 keypress from the OS message to its effect, citing
every hop, and shows the **`GetMenuDisplayed` fork** that sends the same physical key
to either a menu action or player movement — the two never both consume it, because
the fork is gated on whether the mouse is grabbed.

**1 — Capture (`WndProc`).** Every OS key event enters
`WndProc(hWnd, message, wParam, lParam)` (`Windows64_Minecraft.cpp:612`). A
`WM_KEYDOWN` (`:660`) is normalized and stored via `g_KBMInput.OnKeyDown(vk)`
(`:687`); `WM_KEYUP` → `OnKeyUp` (`:700`); text goes to `OnChar` (`:657`); mouse
buttons/move/wheel to `OnMouseButtonDown/OnMouseMove/OnMouseWheel` (`:705-728`); and
raw relative mouse deltas to `OnRawMouseDelta` (`:743`). Nothing is *acted on* here —
`g_KBMInput` (a `KeyboardMouseInput`) is just the edge/held-state buffer, drained
once a frame by `g_KBMInput.Tick()` (`:1836`).

**2 — The grab decides the fork.** Whether the key becomes a menu action or a move
intent is decided entirely by **mouse grab**, which tracks whether a menu is up. The
loop sets `shouldCapture = app.GetGameStarted() && !ui.GetMenuDisplayed(0) &&
pMinecraft->screen == nullptr` (`Windows64_Minecraft.cpp:2068`) and grabs the mouse
only when that holds (`SetMouseGrabbed(true)`, `:2082`); pressing Escape in-world
releases it (`Input.cpp:203-205`). So `IsMouseGrabbed()` is a live proxy for "no menu
displayed."

**3a — Menu branch (menu up → `UIController`).** When a menu is displayed the mouse
is *not* grabbed, and `ui.tick()` (`UIController.cpp:559`) runs `tickInput()`
(`:998` — see [menu input](#menu-input-uicontrollertickinput--uiscenehandleinput)),
which for KBM translates the key to an abstract `ACTION_*` (e.g. `VK_RETURN` →
`ACTION_MENU_OK`, `UIController.cpp:1651-1662`) and routes it through
`UIGroup::handleInput` → `UIScene::handleInput`. In this branch a Space press does
**not** reach the player.

**3b — Gameplay branch (no menu → `Input::tick`).** When the mouse *is* grabbed, the
key feeds movement instead. Each player tick, `LocalPlayer::aiStep` calls
`input->tick(this)` (`LocalPlayer.cpp:230`). `Input::tick` (`Input.cpp:27`) reads the
jump intent from two sources OR'd together (`Input.cpp:188-194`):

```cpp
unsigned int jump = InputManager.GetValue(iPad, MINECRAFT_ACTION_JUMP);   // pad
bool kbJump = (iPad == 0) && g_KBMInput.IsMouseGrabbed()
              && g_KBMInput.IsKBMActive()
              && g_KBMInput.IsKeyDown(KeyboardMouseInput::KEY_JUMP);       // keyboard
if( (jump > 0 || kbJump) && localgameModes[iPad]->isInputAllowed(MINECRAFT_ACTION_JUMP) )
    jumping = true;
```

The keyboard leg is explicitly re-gated on `IsMouseGrabbed()` (`:191`) — belt-and-
braces so a keystroke can never drive movement while a menu is up. The same tick pulls
mouse-look deltas (again gated on grab, `Input.cpp:167`) and applies them via
`player->interpolateTurn(turnX, turnY)` (`:184`).

**4 — Effect.** `Input::tick` leaves the result on the `Input` object's fields
(`jumping`, `xa`, `ya`). Back in `LocalPlayer::aiStep`, the physics step reads
`input->jumping`/`input->xa`/`input->ya` (`LocalPlayer.cpp:225-234`) and turns
`jumping` into upward velocity — the player leaves the ground. Discrete action
presses (inventory, attack, use) take a parallel path: they are gathered into the
player's `ullButtonsPressed` bitmask each tick (`Minecraft.cpp:1476-1480`), with the
KBM legs folded in for pad 0 (e.g. left-mouse → `MINECRAFT_ACTION_ACTION`,
`Minecraft.cpp:3662`; right-mouse → `MINECRAFT_ACTION_USE`, `:3696`).

## Server-side command input

Distinct from player/menu input: `ConsoleInput.cpp` +
`ConsoleInputSource.h` provide a console-command input stream on the server side.
`PlayerConnection` derives from both `PacketListener` and `ConsoleInputSource`,
feeding chat/commands into the embedded server's command dispatcher. This is not
part of the client input loop above.

## See also

- [Overview](/slop-docs/client/overview/) — where `ui.tick()` sits in the frame.
- [Settings & Options](/slop-docs/client/settings/) — the `eGameSetting` store the input paths read.

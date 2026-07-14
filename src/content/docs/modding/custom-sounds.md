---
title: Custom Sounds & Music
description: A full worked example — add a new sound effect and stream music in neoLegacy end to end, from the eSOUND_TYPE enum through file layout to playing it from tiles and entities.
---

Sound in neoLegacy is a numbered-event system. Every sound is an `eSOUND_TYPE`
enum value with a matching dotted event name, and the cross-platform engine
resolves that name to an `.ogg`/`.wav`/`.mp3` file on disk and decodes it with
**miniaudio** + **stb_vorbis**. Music (records, biome/menu tracks) is a separate
*streaming* path.

The pieces:

1. **`eSOUND_TYPE` enum** (`Minecraft.World/SoundTypes.h`) — the shared sound id.
2. **`wchSoundNames[]` table** (`Minecraft.Client/Common/Audio/SoundNames.cpp`)
   — the parallel array of dotted event names (`L"mob.rabbit.hurt"`, etc.).
3. **The audio files** — under `Windows64Media/Sound/Minecraft/<path>.ogg`.
4. **Playback calls** — `Level::playSound(...)` / `Entity::playSound(...)`
   (`Level.cpp:1664` / `Entity.cpp:1046`), which fan out through the
   `LevelListener` to the `SoundEngine`.

Keep the [audio docs](/slop-docs/client/audio/) and
[sound reference](/slop-docs/client/audio/) open.

For the worked example we'll add a **`eSoundType_TILE_CHIME_RING`** — a sound a
custom block plays when interacted with — and then cover streaming a music track.

## Step 0 — how a sound id becomes audio

`eSOUND_TYPE` (`SoundTypes.h:4`) and `wchSoundNames[]` (`SoundNames.cpp:6`) are
**two parallel arrays that must stay in lockstep** — the enum indexes the name
table. The file even warns you (`SoundTypes.h:3`):

> *"4J-PB - if you change this, you need to update SoundEngine::wchSoundNames[]"*

At runtime `SoundEngine::play(iSound, x,y,z, vol, pitch)` (`SoundEngine.cpp:482`)
does:

1. `wstring name = wchSoundNames[iSound];`
2. `ConvertSoundPathToName(name)` (`SoundEngine.cpp:1721`) — replaces every `.`
   in the dotted name with `/`, giving a relative path.
3. Builds `Windows64Media/Sound/Minecraft/<path>` and tries extensions
   `.ogg`, `.wav`, `.mp3` in that order (`SoundEngine.cpp:508`).
4. If no exact file, it looks for **numbered variants** `<path>1.ogg` …
   `<path>31.ogg` and picks one at random (`SoundEngine.cpp:527`) — that's how a
   single event name (`dig.stone`) maps to several random takes.

So the event name `L"tile.chime.ring"` resolves to a file at
`Windows64Media/Sound/Minecraft/tile/chime/ring.ogg` (or `ring1.ogg`,
`ring2.ogg`, … for random variants).

## Step 1 — add the `eSOUND_TYPE` enum value

Add your value to `Minecraft.World/SoundTypes.h`. Order matters only in that the
enum position must match the name table position — append near related sounds.
The rabbit sounds are a real neoLegacy addition and a clean example
(`SoundTypes.h:216`):

```cpp
eSoundType_MOB_RABBIT_IDLE,
eSoundType_MOB_RABBIT_HURT,
eSoundType_MOB_RABBIT_DEATH,
eSoundType_MOB_RABBIT_HOP,
```

Add yours:

```cpp
eSoundType_TILE_CHIME_RING,
```

:::caution[Keep the two tables aligned]
`eSoundType_MAX` is the array bound for both `wchSoundNames[eSoundType_MAX]`
(`Consoles_SoundEngine.h:68`) and the engine's `CurrentSoundsPlaying`
(`SoundEngine.h:203`). If you add an enum entry but forget the name-table entry
(or add them in different positions), every sound after your insertion point
plays the **wrong** clip. Always add both, at the **same relative position.**
:::

## Step 2 — add the event name to `wchSoundNames[]`

In `Minecraft.Client/Common/Audio/SoundNames.cpp`, add the matching dotted name
at the same position, following the existing `L"…", // eSoundType_…` convention:

```cpp
L"tile.chime.ring",   // eSoundType_TILE_CHIME_RING
```

The dotted name is exactly what maps to the file path (step 0). Existing groups
use prefixes like `mob.`, `random.`, `dig.`, `step.`, `fire.` — pick a sensible
namespace (`tile.` here).

## Step 3 — drop in the audio file(s)

Put the OGG at the path the name resolves to:

```
Windows64Media/Sound/Minecraft/tile/chime/ring.ogg
```

For random variants, use numbered files instead:

```
Windows64Media/Sound/Minecraft/tile/chime/ring1.ogg
Windows64Media/Sound/Minecraft/tile/chime/ring2.ogg
Windows64Media/Sound/Minecraft/tile/chime/ring3.ogg
```

The engine decodes OGG via **stb_vorbis** (`SoundEngine.cpp:21`) and mixes with
**miniaudio** (`SoundEngine.h:7`), so a standard Vorbis `.ogg` at a normal
sample rate is all you need — no bank compilation, no format conversion. `.wav`
and `.mp3` also work (`SoundEngine.cpp:508`).

:::note[Getting the original clips: `.msscmp` extraction]
The shipped console banks are Miles Sound System `.msscmp` files
(`Minecraft.msscmp`) — binary, not loose OGGs. To pull clips out of an original
bank, use `tools/msscmp_extract.py`:

```
python3 tools/msscmp_extract.py Minecraft.msscmp
```

It parses the `BANK` header, walks the file table, dumps the raw Bink-audio
(`.binka`) entries into `extracted_binka/`, and (if `ffmpeg` is on your PATH)
transcodes them to FLAC in `extracted_flac/` (`msscmp_extract.py:24`). Convert
FLAC → OGG for the game. The `.pck` archives have their own tool pair
(`tools/pck_extract.py` / `tools/pck_pack.py`). See the [tools reference](/slop-docs/tools/repo-tools/).
:::

## Step 4 — play the sound from a tile or entity

You never call the `SoundEngine` directly from gameplay — you call `Level` or
`Entity`, which forward through the `LevelListener` to the engine.

### From a tile (positional)

`Level::playSound(x, y, z, iSound, volume, pitch, clipDist)` (`Level.cpp:1664`)
is the positional call. `BasePressurePlateTile` is a real example
(`BasePressurePlateTile.cpp:143`):

```cpp
level->playSound(x + 0.5, y + 0.1, z + 0.5, eSoundType_RANDOM_CLICK, 0.3f, 0.5f);
```

For our chime block, in your tile's `use`/interaction handler:

```cpp
level->playSound(x + 0.5, y + 0.5, z + 0.5, eSoundType_TILE_CHIME_RING, 1.0f, 1.0f);
```

`volume` scales loudness; `pitch` multiplies playback speed (1.0 = normal). Many
callers randomize pitch, e.g. Arrow's pickup pop (`Arrow.cpp:514`):

```cpp
playSound(eSoundType_RANDOM_POP, 0.2f,
    ((random->nextFloat() - random->nextFloat()) * 0.7f + 1.0f) * 2.0f);
```

### From an entity

`Entity::playSound(iSound, volume, pitch)` (`Entity.cpp:1046`) plays at the
entity's position — it calls `level->playEntitySound(shared_from_this(), …)`.
Mobs expose their sounds through the standard overrides; `Rabbit` is the
template (`Rabbit.cpp:143`):

```cpp
int Rabbit::getAmbientSound() { return eSoundType_MOB_RABBIT_IDLE; }
int Rabbit::getHurtSound()    { return eSoundType_MOB_RABBIT_HURT; }
int Rabbit::getDeathSound()   { return eSoundType_MOB_RABBIT_DEATH; }
```

The base `Mob` code calls these and plays the returned id at the right moments,
so for a custom mob you only override the getters — see
[Adding Entities](/slop-docs/modding/adding-entities/).

### Block break/step sounds (the `SoundType` route)

Block dig/step sounds go through a different, per-tile object: `Tile::SoundType`
(`Tile.h:128`), set with `setSoundType(...)`. The types are built at the top of
`Tile::staticCtor()` (`Tile.cpp:361`+):

```cpp
Tile::SOUND_STONE = new Tile::SoundType(eMaterialSoundType_STONE, 1, 1);
Tile::SOUND_SLIME = new Tile::SoundType(eMaterialSoundType_STONE, 1, 1,
                        eSoundType_MOB_SLIME_BIG, eSoundType_MOB_SLIME_BIG);
```

`SOUND_SLIME` is a neoLegacy addition — note it overrides the break/step sound
with a specific `eSOUND_TYPE`. If your block just needs a stock material sound,
call `setSoundType(Tile::SOUND_STONE)` in its registration
([Adding Blocks](/slop-docs/modding/adding-blocks/)). The break sound is played
automatically by the client on block destroy (`LevelRenderer.cpp:3516`).

## Step 5 — music streaming

Music (records, ambient/menu tracks) uses a **separate streaming path**, not the
`play(iSound…)` one. The entry point is `Level::playStreamingMusic(name, x,y,z)`
(`Level.cpp:1676`), which forwards to `LevelRenderer::playStreamingMusic`
(`LevelRenderer.cpp:2772`) → `SoundEngine::playStreaming(name, …)`
(`SoundEngine.cpp:821`). The streaming resolver tries `.ogg`/`.mp3`/`.wav`
(`SoundEngine.cpp:1323`) and decodes on a background thread
(`OpenStreamThreadProc`).

Music discs are the concrete example. `RecordingItem` (`RecordingItem.cpp:13`)
stores a `recording` string per disc and registers it in a `BY_NAME` map; when a
disc is inserted in a jukebox, the client streams that name. The disc-insert
render hook passes the recording name straight to the streamer
(`LevelRenderer.cpp:3564`):

```cpp
level[playerIndex]->playStreamingMusic(rci->recording, x, y, z);
```

Stopping music passes an empty string (`LevelRenderer.cpp:3571`):

```cpp
level[playerIndex]->playStreamingMusic(L"", x, y, z);
```

To add a **new music track / record**:

1. Put the track at the streaming path the name resolves to (same
   dotted-name → path rule; `.ogg` preferred).
2. For a record, add a `RecordingItem` in `Item::staticCtor` with its recording
   name (mirror the existing discs), plus its name/tooltip
   [strings](/slop-docs/client/resources/) and disc icon.
3. To trigger biome/context music instead, call
   `Level::playStreamingMusic(L"your.track.name", x, y, z)` from the relevant
   game code.

:::note[Music fade on world enter/leave]
neoLegacy fixed the music transition so it fades in/out when entering and leaving
a world (per NOTES.md). That logic lives in the `ConsoleSoundEngine` streaming
state (`updateMusicVolume`, `Consoles_SoundEngine.h:48`+) — if you add music that
should participate in the fade, route it through the streaming path above rather
than the one-shot `play` path.
:::

:::note[Music cross-fade]
`SoundEngine::playStreaming` (`SoundEngine.cpp:821`) already cross-fades in this
snapshot: if the stream is `Playing` and the *custom-vs-vanilla* source changes
(`bCurrentCustom != bNextCustom`, `SoundEngine.cpp:838`) it switches to
`eMusicStreamState_Fading` with
`m_musicFadeSecondsRemaining = MUSIC_FADE_DURATION_SECONDS` (`:840-841`) instead of
hard-cutting; an already-`Opening` stream is cancelled via
`eMusicStreamState_OpeningCancel` (`:847`). On `origin/main` (v1.1.0b) this was
extended with a `SoundEngine::stopStreamingNow()` helper (not present at this
snapshot) to tear the stream down cleanly. Either way, the
`Level::playStreamingMusic(name, …)` → `LevelRenderer` → `playStreaming` call chain
you use to trigger music is unchanged — route through the streaming path and you
get the fade for free; you don't drive the state machine directly.
:::

## Step 6 — no CMake change for the sound *event*

Adding an `eSOUND_TYPE` value and a `wchSoundNames[]` entry needs **no new source
files** — you're editing `SoundTypes.h` (already compiled) and `SoundNames.cpp`
(already in the build). Only a new `RecordingItem` (music disc) or a new sound
consumer would touch [CMake sources](/slop-docs/overview/building/). The audio
files are copied next to the exe by the asset-copy step, which excludes
audio-*source* formats but ships the shipped `Windows64Media/Sound/` tree.

## What can go wrong

Sound resolution is name-driven and file-system-probed, so the failure modes split
between *table misalignment* (silent, corrupts every later sound) and *missing
file* (which logs — but not the message you might expect, and a different one per
playback path). Verified behaviours at this snapshot:

### File absent at every probed path → `Failed to initialize sound from file`, not "No audio file found"

`SoundEngine::play(iSound, …)` (`SoundEngine.cpp:482`) builds the base path from
the dotted name, tries `.ogg`/`.wav`/`.mp3` (`:513-525`), then the numbered
variants `<path>1..31` (`:531-544`; the loop is `for i = 1; i < 32`, so 1 through
31). If **nothing** is found, `finalPath` is left holding a path that doesn't exist,
and the miss surfaces only when miniaudio fails to open it:
`ma_sound_init_from_file(...) != MA_SUCCESS` logs
**`Failed to initialize sound from file: <path>`** (`SoundEngine.cpp:590`) and
returns. Note this is *not* the string the other paths use — the
`WARNING: No audio file found for music ID %d` message (`:1349`) is the **music
streaming** path, and `No sound file found for UI sound` (`:776`) is the **UI**
path. Grep the debug log for `Failed to initialize sound from file` when a
positional block/entity sound is silent.

### Enum / name-table misalignment → every later sound plays the wrong clip

`eSOUND_TYPE` (`SoundTypes.h`) and `wchSoundNames[]` (`SoundNames.cpp:6`) are
parallel arrays; `play` does `wstring name = wchSoundNames[iSound];`
(`SoundEngine.cpp:494`) — a **direct index** with no cross-check that the name
belongs to that enum. Add an enum entry but forget the name-table entry (or add
them at different positions) and every entry after the insertion point is shifted
by one: each `eSoundType_X` now indexes the *previous* entry's name, so a whole
run of sounds plays the wrong clip. Nothing errors — the wrong file resolves and
plays cleanly. This is why the Step 1/2 caution insists on adding both at the same
relative position; the symptom is "some other sound changed," not "my sound is
missing."

### `iSound == -1` → early-out with a debug print, no playback

`play` special-cases `-1`: it `DebugPrintf`s
`"PlaySound with sound of -1 !!!!!!!!!!!!!!!"` and returns (`SoundEngine.cpp:486-490`).
A getter that returns `-1` (e.g. a mob sound override left at the default) is
therefore a silent no-sound, not a crash — worth knowing when a mob is mute.

### Name not resolvable to a namespace/path → probes a directory that never exists

The dotted name maps to a path by replacing `.` with `/`
(`ConvertSoundPathToName`, `SoundEngine.cpp:1721`). A typo in the dotted name
(`tile.chime.ring` vs the file at `tile/chime/ring.ogg`) doesn't error at
registration — it just probes a path that has no file and lands in the
`Failed to initialize sound from file` case above. The name string and the
on-disk folder layout must match exactly.

### Streaming vs. one-shot mismatch → music won't fade / disc won't stream

Music must go through `Level::playStreamingMusic` →
`SoundEngine::playStreaming` (`SoundEngine.cpp:821`), not the `play(iSound…)`
one-shot path. Route a track through `play` and it plays once with no streaming,
no loop, and no participation in the world enter/leave fade state
(`m_musicFadeSecondsRemaining`, `SoundEngine.cpp:841`). No error — it just behaves
like a sound effect instead of music.

## Testing checklist

- [ ] The `eSOUND_TYPE` enum entry and the `wchSoundNames[]` entry are at the **same relative position** — verify a nearby existing sound still plays its own clip (misalignment shifts every later sound).
- [ ] The audio file exists at `Windows64Media/Sound/Minecraft/<dotted/path>.ogg` (or numbered variants).
- [ ] Trigger the sound in-game (interact with the block / hurt the mob) and confirm it plays at the right 3D position with the right volume/pitch.
- [ ] Random variants (`ring1.ogg`, `ring2.ogg`, …) actually rotate — trigger repeatedly.
- [ ] The OGG decodes (miniaudio/stb_vorbis) — no `Failed to initialize sound from file: <path>` in the debug log (that's the positional `play` miss path, `SoundEngine.cpp:590`).
- [ ] Block break/step sounds use the intended `Tile::SoundType`.
- [ ] For music: the track streams (background thread), loops/stops correctly, and participates in the world enter/leave fade.
- [ ] `/give` a new record and confirm it plays in a jukebox and shows its name/tooltip.

## Where to go next

- [Sounds reference](/slop-docs/client/audio/) — the full `eSOUND_TYPE` ↔ event-name table.
- [Audio pipeline](/slop-docs/client/audio/) — miniaudio/stb_vorbis engine and streaming internals.
- [Tools reference](/slop-docs/tools/repo-tools/) — `msscmp_extract.py`, `pck_extract.py`/`pck_pack.py`.
- [Adding Entities](/slop-docs/modding/adding-entities/) — hook mob ambient/hurt/death sounds.
- [Adding Blocks](/slop-docs/modding/adding-blocks/) — set a block's break/step `SoundType`.

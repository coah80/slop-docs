---
title: Audio
description: The ConsoleSoundEngine abstract interface and its cross-platform SoundEngine implementation (miniaudio + stb_vorbis), the sound-name tables, the music-streaming state machine, and the neoLegacy music-fade fix on world transitions.
---

Audio is split the same way most of the client is: a **platform-independent
abstract interface** plus a **cross-platform concrete implementation**. The
engine is reached through `Minecraft::soundEngine` (a `ConsoleSoundEngine*`).
On the original consoles this was backed by Miles Sound System (`.msscmp`
banks); the desktop/neoLegacy build replaces that with a self-contained
**miniaudio + stb_vorbis** engine.

Files: `Common/Audio/Consoles_SoundEngine.h`/`.cpp`,
`Common/Audio/SoundEngine.h`/`.cpp`, `Common/Audio/SoundNames.cpp`,
`Common/Audio/miniaudio.h`, `Common/Audio/stb_vorbis.h`,
`../Minecraft.World/SoundTypes.h`.

## ConsoleSoundEngine — the abstract interface

`ConsoleSoundEngine` (`Consoles_SoundEngine.h:42`) is the pure-virtual base every
platform satisfies. Its virtuals:

| Method | Purpose |
|--------|---------|
| `tick(shared_ptr<Mob>* players, float a)` | per-frame update; takes the local-player array (splitscreen) |
| `play(iSound, x, y, z, volume, pitch)` | fire a positional SFX by `eSOUND_TYPE` id |
| `playStreaming(name, x, y, z, volume, pitch, bMusicDelay=true)` | queue a streamed track (music / CD) |
| `playUI(iSound, volume, pitch)` | fire a non-positional menu SFX by `eSFX` id |
| `updateMusicVolume(fVal)` / `updateSoundEffectVolume(fVal)` | master volume setters |
| `updateSystemMusicPlaying(bool)` | notify that OS/dashboard music is playing |
| `add(name, File*)` / `addMusic(name, File*)` / `addStreaming(name, File*)` | register sound assets |
| `playMusicTick()` | drive the music state machine one step |
| `ConvertSoundPathToName(name, bConvertSpaces)` | map a dotted sound name to a file name |
| `schedule(iSound, ..., delayTicks)` | delayed one-shot (see `ScheduledSound`) |

It also owns the **streaming-music state flags**, all defaulted `false` in the
constructor (`Consoles_SoundEngine.h:44`):

| Flag | Getter / setter |
|------|-----------------|
| `m_bIsPlayingStreamingCDMusic` | `Get/SetIsPlayingStreamingCDMusic` |
| `m_bIsPlayingStreamingGameMusic` | `Get/SetIsPlayingStreamingGameMusic` |
| `m_bIsPlayingEndMusic` | `Get/SetIsPlayingEndMusic` |
| `m_bIsPlayingNetherMusic` | `Get/SetIsPlayingNetherMusic` |

The base also implements the **scheduled-sound queue**: `schedule(...)` pushes a
private `ScheduledSound` (`Consoles_SoundEngine.h:76`) with a tick delay, and the
non-virtual `tick()` decrements delays and fires them.

### The two sound-name tables

Both live in `SoundNames.cpp` as static arrays on `ConsoleSoundEngine`:

- **`wchSoundNames[eSoundType_MAX]`** — positional SFX. Maps each `eSOUND_TYPE`
  (`SoundTypes.h:4`, `enum eSOUND_TYPE`) to a dotted name, e.g.
  `eSoundType_MOB_CREEPER_HURT → L"mob.creeper.say"`,
  `eSoundType_MOB_GHAST_FIREBALL → L"mob.ghast.fireball"`.
- **`wchUISoundNames[eSFX_MAX]`** — menu SFX (`SoundTypes.h:284`, `enum` ending
  `eSFX_MAX`):

  | `eSFX` | Name |
  |--------|------|
  | `eSFX_Back` | `back` |
  | `eSFX_Craft` | `craft` |
  | `eSFX_CraftFail` | `craftfail` |
  | `eSFX_Focus` | `focus` |
  | `eSFX_Press` | `press` |
  | `eSFX_Scroll` | `scroll` |
  | `eSFX_BookTurn1..3` | `open_flip1..3` |

`play()` looks up `wchSoundNames[iSound]`, converts it with
`ConvertSoundPathToName`, and resolves it to a file (`SoundEngine.cpp:482-497`).

## SoundEngine — the concrete miniaudio implementation

`SoundEngine : public ConsoleSoundEngine` (`SoundEngine.h:122`) is the
cross-platform engine. On desktop it is driven entirely by two single-header
libraries vendored into `Common/Audio/`:

- **`miniaudio.h`** — decode + mixing + device output. Pulled in with
  `MINIAUDIO_IMPLEMENTATION`, and with `MA_NO_DSOUND` / `MA_NO_WINMM` disabling
  the legacy Windows backends (`SoundEngine.cpp:23-25`).
- **`stb_vorbis.h`** — OGG Vorbis decoding (`SoundEngine.cpp:21`).

`init()` builds a `ma_engine` with `listenerCount = MAX_LOCAL_PLAYERS` so
splitscreen players each get a 3D listener (`SoundEngine.cpp:179-188`).

3D SFX tuning constants (`SoundEngine.h:10-14`):

| Constant | Value |
|----------|-------|
| `SFX_3D_MIN_DISTANCE` | `1.0f` |
| `SFX_3D_MAX_DISTANCE` | `16.0f` |
| `SFX_3D_ROLLOFF` | `0.5f` |
| `SFX_VOLUME_MULTIPLIER` | `1.5f` |
| `SFX_MAX_GAIN` | `1.5f` |
| `MAX_SAME_SOUNDS_PLAYING` | `8` |

> **neoLegacy delta:** on the original `_XBOX` build every `SoundEngine` method
> is an empty stub (`SoundEngine.cpp:40-66`) — audio there went through Miles.
> The real implementation is the `#else` branch (`SoundEngine.cpp:68` onward),
> which is what desktop/neoLegacy runs.

### SFX file resolution

Because the shipped `.msscmp` banks are opaque, `play()` resolves a sound name to
a loose file on disk instead. It builds `Windows64Media/Sound/Minecraft/<name>`
and probes extensions in order **`.ogg`, `.wav`, `.mp3`** (`SoundEngine.cpp:509`).
If no bare file exists it looks for **numbered variants** (`<name>1.ogg`,
`<name>2.ogg`, … up to 31) and picks one at random — this is how multi-variant
sounds like footsteps and dig sounds are chosen (`SoundEngine.cpp:527-551`).

Base search paths are per-platform statics; on Windows64 they are
`Windows64Media\Sound\` and `music\` (`SoundEngine.cpp:71-72`).

### The .msscmp banks

Four Miles bank files sit at the client root: `Minecraft.msscmp`,
`examples.msscmp`, `examples_64.msscmp`, `examples_win.msscmp`. These are the
original **Miles Sound System** compiled sound projects (binary, not documented
here). The neoLegacy desktop engine does **not** read them at runtime — it reads
loose `.ogg`/`.wav`/`.mp3` from the media folders as described above. The banks
remain in the tree for the console builds.

## Worked trace: one block-break sound, trigger to output

This follows a single block-break SFX from the world event to the miniaudio
device, citing every hop. The path is entirely client-side: the break arrives as
a level event, `LevelRenderer` resolves the tile's sound, and `SoundEngine::play`
loads a loose file and starts a spatialized miniaudio voice.

**1 — Level event → LevelRenderer.** A block break reaches the client's
`LevelRenderer` as a `LevelEvent::PARTICLES_DESTROY_BLOCK` (the same event that
spawns the break particles). In `LevelRenderer::levelEvent` (the `LevelListener`
callback), the `PARTICLES_DESTROY_BLOCK` case pulls the destroyed tile and fires
its break sound (`LevelRenderer.cpp:3510-3516`):

```cpp
case LevelEvent::PARTICLES_DESTROY_BLOCK:
    int t = data & Tile::TILE_NUM_MASK;
    if (t > 0) {
        Tile *oldTile = Tile::tiles[t];
        mc->soundEngine->play(oldTile->soundType->getBreakSound(),
            x + 0.5f, y + 0.5f, z + 0.5f,
            (oldTile->soundType->getVolume() + 1) / 2,
            oldTile->soundType->getPitch() * 0.8f);
    }
```

The sound id comes from the tile's `soundType` (`getBreakSound()`), the position is
the block centre, and volume/pitch are derived from the sound type — pitch scaled
by `0.8` for the dig/break variant.

**2 — Name resolve (`SoundEngine::play`).** `SoundEngine::play(iSound, x,y,z,
volume, pitch)` (`SoundEngine.cpp:482`, the desktop `#else` branch) rejects the
`-1` sentinel (`:486`), then maps the id to a dotted name through the
`wchSoundNames[iSound]` table (`:494`) and converts it with
`ConvertSoundPathToName` (`:496`). It prefixes `Minecraft/` and builds a base path
`Windows64Media/Sound/Minecraft/<name>` (`:492-504`).

**3 — File probe.** It probes extensions `.ogg`, `.wav`, `.mp3` in that order
(`:509-525`); on a miss it scans **numbered variants** `<name>1..31.<ext>` and
picks one at random (`:527-567`) — this is how a break sound with several takes
gets varied. The winner lands in `finalPath`.

**4 — miniaudio voice setup.** A `MiniAudioSound` is allocated and its `AUDIO_INFO`
filled with position, volume, pitch and `bIs3D = true` (`:569-580`). The file is
decoded and a voice created with
`ma_sound_init_from_file(&m_engine, finalPath, MA_SOUND_FLAG_ASYNC, …, &s->sound)`
(`:582`) — async so decode doesn't stall the caller; on failure it logs and bails
(`:590-592`). It then configures 3D attenuation from the tuning constants:

```cpp
ma_sound_set_spatialization_enabled(&s->sound, MA_TRUE);      // :595
ma_sound_set_min_distance(&s->sound, SFX_3D_MIN_DISTANCE);    // 1.0f
ma_sound_set_max_distance(&s->sound, SFX_3D_MAX_DISTANCE);    // 16.0f
ma_sound_set_rolloff(&s->sound, SFX_3D_ROLLOFF);              // 0.5f
```

Final gain is `volume * m_MasterEffectsVolume * SFX_VOLUME_MULTIPLIER`, clamped to
`SFX_MAX_GAIN = 1.5` (`:600-604`), then `ma_sound_set_pitch` and
`ma_sound_set_position(x,y,z)` place the voice in the world (`:605-606`).

**5 — Start + lifecycle.** `ma_sound_start(&s->sound)` (`:608`) begins playback and
the voice is pushed onto `m_activeSounds` (`:610`). Each frame `tick()` reaps it:
it walks `m_activeSounds`, and any voice where `!ma_sound_is_playing` is
`ma_sound_uninit`'d, `delete`d, and erased (`SoundEngine.cpp:265-275`); still-playing
voices have their gain re-clamped against the current master volume each tick
(`:277-281`). `tick()` also re-points the miniaudio listener(s) to the local
player position, so a moving player hears the attenuation update
(`ma_engine_listener_set_position`, `:260`).

The **music** side — entering a world, the fade steps, and the track swap — is the
separate state machine walked in [The neoLegacy music-fade fix](#the-neolegacy-music-fade-fix)
below; it does not touch this per-SFX path.

## Music streaming

Music is a **state machine**, not a direct play. `playStreaming(name, ...)` does
not actually start audio — it "just sets states and an id for the music tick to
play it" (`SoundEngine.cpp:822-824`). `playMusicTick()` / `playMusicUpdate()`
advance the machine each frame.

The stream states (`SoundEngine.h:82`, `enum eMusicStreamState`):

`Idle → Opening → (OpeningCancel) → Play → Playing → Fading / Stopping / Stop → Completed`

### Music domains and the track table

Tracks are enumerated in `eMusicFiles` (`SoundEngine.h:16`), and their file stems
are in `m_szStreamFileA[eStream_Max]` (`SoundEngine.cpp:110`). Domains map to
ranges via `SetStreamingSounds(...)`, wired up at init as
(`SoundEngine.cpp:437-443`):

| Domain (`eMusicType`) | Range | Track stems |
|-----------------------|-------|-------------|
| Overworld (`=7`) | `Calm1 … piano3` | `calm1..3`, `hal1..4`, `nuance1..2`, `piano1..3` |
| Creative (`=5`) | `Creative1 … Creative6` | `creative1..6` |
| Menu (`=2`) | `Menu1 … Menu4` | `menu1..4` |
| Nether (`=0`) | `Nether1 … Nether4` | `nether1..4` |
| End (`=4`) | `end_dragon … end_end` | `the_end_dragon_alive`, `the_end_end` |
| Battle (`=6`) | `BattleMode1 … BattleMode4` | `BattleMode1..4` |
| CD (records) | `CD_1 …` | `11`, `13`, `blocks`, `cat`, `chirp`, `far`, `mall`, `mellohi`, `stal`, `strad`, `ward`, `where_are_we_now` |

`getMusicID(eMusicType)` (`SoundEngine.cpp:967`) picks a track via
`GetRandomishTrack(min,max)`. Note the texture-pack coupling: if
`Minecraft::skins->isUsingDefaultSkin()` is **false**, the End domain may return
one of several End tracks (a Mash-Up pack can supply multiple), whereas the
default pack path treats the End as fixed (`SoundEngine.cpp:971-1010`). Streaming
file names are assembled from `m_szMusicPath` + the stem, again probing
`.ogg`/`.mp3`/`.wav` (`SoundEngine.cpp:1323`).

Master music volume is a plain setter: `updateMusicVolume(fVal)` stores
`m_MasterMusicVolume = fVal` (`SoundEngine.cpp:1065-1068`), and
`updateSystemMusicPlaying(bool)` stores `m_bSystemMusicPlaying` so game music can
duck under dashboard/system music.

## The neoLegacy music-fade fix

On the original game, switching music context — e.g. entering or leaving a world,
or toggling a Mash-Up pack's custom music — cut the current track off abruptly.
neoLegacy adds a **cross-fade** rather than a hard stop.

The mechanism lives entirely in `SoundEngine`:

- A fade duration constant: `MUSIC_FADE_DURATION_SECONDS = 4.0f`
  (`SoundEngine.cpp:32`).
- Two fields track the fade: `m_musicFadeSecondsRemaining` and
  `m_musicFadeLastUpdateTime` (a `std::chrono::steady_clock::time_point`),
  plus `m_bCurrentStreamIsCustom` to detect custom↔default transitions
  (`SoundEngine.h:172-174`).

When a new stream is requested while one is `Playing`, and the
**custom-vs-default state actually changes**, the engine enters the `Fading`
state instead of stopping (`SoundEngine.cpp:836-843`):

```cpp
if(m_StreamState == eMusicStreamState_Playing)
{
    if (bCurrentCustom != bNextCustom)
    {
        m_StreamState = eMusicStreamState_Fading;
        m_musicFadeSecondsRemaining = MUSIC_FADE_DURATION_SECONDS;
        m_musicFadeLastUpdateTime = std::chrono::steady_clock::now();
    }
}
```

The `Fading` case in the tick then ramps the volume down over real (wall-clock)
seconds and only uninitialises the stream once the fade completes
(`SoundEngine.cpp:1471-1500`):

```cpp
case eMusicStreamState_Fading:
    ...
    if (m_musicFadeSecondsRemaining > 0.0f)
    {
        const float fadeFactor = m_musicFadeSecondsRemaining / MUSIC_FADE_DURATION_SECONDS;
        const float finalVolume = m_StreamingAudioInfo.volume * getMasterMusicVolume() * fadeFactor;
        ma_sound_set_volume(&m_musicStream, finalVolume);
        break;
    }
    ma_sound_stop(&m_musicStream);
    ma_sound_uninit(&m_musicStream);
    ...
```

Using `steady_clock` deltas (rather than counting ticks) makes the 4-second fade
frame-rate-independent. This is the "music fade on world enter/leave" fix noted
in the project changelog for v1.0.9b.

> **Changed in v1.1.0b:** the jukebox fix extends the fade to record playback.
> `playStreaming` now enters the `Fading` state whenever a jukebox track starts
> while a stream is `Playing`/`Opening` (or `m_musicStreamActive` is set), so the
> in-game soundtrack fades out before a record plays (`SoundEngine.cpp:921-935`).
> A new `stopStreamingNow()` method (`SoundEngine.h:138`) tears the stream down
> immediately — `ma_sound_stop`/`ma_sound_uninit`, clears the CD/game-music flags,
> and resets `m_StreamState` to `Idle` — for the hard-stop path. NOTES.md v1.1.0b:
> "Jukeboxes now play audio correctly, causing the in-game soundtrack to fade out
> before playing any music."

## Related pages

- [Texture Packs & Resources](/slop-docs/client/resources/) — Mash-Up pack sound banks and the `isUsingDefaultSkin()` coupling
- [Settings & Skin Select](/slop-docs/client/settings/) — the audio settings scene that drives `updateMusicVolume`
- [Client Overview](/slop-docs/client/overview/) — where `Minecraft::soundEngine` sits in the god-object

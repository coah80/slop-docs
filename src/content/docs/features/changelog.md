---
title: Version History
description: neoLegacy's release history from v1.0.0b to v1.1.0b — the nightly build model, the network-protocol 570 bump, per-tag release notes, and the currently active development branches.
---

neoLegacy ships on two tracks: a rolling **Nightly** build cut from `main`, and periodic **stable**
point releases tagged `v1.0.Nb` (and now `v1.1.0b`). The current version is **1.1.0b** (`BUMP` =
`1.1.0b`, `NOTES.md:1` = "neoLegacy v1.1.0b").

> These docs were audited against commit `47e5cba3` (v1.0.9b). Upstream `main` has since advanced to
> `245cbb18` (v1.1.0b) with 36 further commits; the [v1.1.0b section](#v110b-current) below records
> that delta. The rest of this site still describes the `47e5cba3` snapshot.

## Release model

Two GitHub Actions workflows in `.github/workflows/` drive releases:

| Workflow | File | Trigger | Output |
|---|---|---|---|
| **Nightly Release** | `nightly.yml` | every push to `main` (and manual dispatch) | rolling `.zip` build; the primary user download (`README.md`) |
| **Stable Release** | `stable.yml` | a push that edits the `BUMP` file | a tagged `v1.0.Nb` stable build |
| Pull request CI | `pull-request.yml` | PRs | build/validation |
| Branch sync | `sync.yml` | every push to `main` | merges `main` into the `feat/*`, `exp/*`, `experimental` (and `TU*` as of v1.1.0b) work branches |

The stable workflow is deliberately wired to `BUMP` only — an inline note in `stable.yml` reads
`#neo: DO NOT ADD NOTES.md HERE.`, so bumping the version number in `BUMP` is what publishes a
stable release. Nightly builds skip when a commit message contains `[skip ci]`.

Every stable tag has a matching `-Dedicated-Server` tag (e.g. `v1.0.9b-Dedicated-Server`) for the
[dedicated server](/slop-docs/server/deployment/) build. There are also floating `Stable` and
`Stable-Dedicated-Server` tags.

## Network protocol: build number 570

Multiplayer compatibility is gated on a static build/network number, not the `1.0.Nb` version.
`fd43009a chore: bump network version to 570 (#78)` raised it from **560 to 570**:

```cmake
# cmake/GenerateBuildVer.cmake:10
set(BUILD_NUMBER 570) # Note: Build/network has to stay static for now, as without it builds wont
                      # be able to play together. We can change it later when we have a better
                      # versioning scheme in place.
```

The commit message notes that clients older than this point cannot connect and that mismatched
clients are prompted with a version error on smartcmd servers. `BUILD_NUMBER` also feeds
`VER_PRODUCTBUILD` (`GenerateBuildVer.cmake:68`) and is parsed by the Nix flake
(`flake.nix:30`). See [Networking](/slop-docs/client/networking/).

## Release timeline (v1.0.0b → v1.0.9b)

Tag dates and release-commit hashes are from `git log` on each tag. Notes are transcribed from
`NOTES.md` as it stood at each tag.

| Tag | Date | Commit | Highlights (from `NOTES.md`) |
|---|---|---|---|
| `v1.0.0b` | 2026-05-04 | `69fdfafe` | First tagged stable ("Merge experimental into main"); no `NOTES.md` yet at this tag |
| `v1.0.1b` | 2026-05-04 | `12bacaf3` | Classic Crafting; commands support (`/give`, `/tp`/`/teleport`, `/gamemode`, …) |
| `v1.0.2b` | 2026-05-13 | `60189f6a` | Load/Create/Join tabs now clickable; fixed a `/gamemode` switch crash on Windows |
| `v1.0.3b` | 2026-05-14 | `9db673dc` | Fixed a crash running the server software on Linux via Wine |
| `v1.0.4b` | 2026-05-19 | `db6d5a76` | Podzol bottom-face texture fix; cursor-icon fix; TU31 parity: flint-and-steel creeper ignition, cobblestone under village gravel roads, villagers → witches on lightning |
| `v1.0.5b` | 2026-05-25 | `25e13583` | Server-click blue-flash fix; andesite/diorite/granite recipes; Rabbit Stew strings; tall-block break fix; paused-game damage fix; poison floors at 1 HP. TU31: 8-direction item frames, comparators read item-frame rotation, pistons honour block updates |
| `v1.0.6b` | 2026-05-25 | `f5d9db33` | Fixed crashing/lag/lighting from expanded world generation |
| `v1.0.7b` | 2026-05-25 | `6ed34078` | Reverted the "Expanded" world size (crashing + lighting issues) |
| `v1.0.8b` | 2026-06-26 | `2799c88f` | Heavy optimization (more FPS); fullscreen-on-startup fix; `/kill` in creative; boat-follow fix; ocelot taming; elytra/items render on armor stands. New logo (rdust); TU31: flower dye recipes, prismarine animation |
| `v1.0.9b` | 2026-07-05 | `ac9217e4` | Slime blocks & sunflowers; world copy/save; modifiable controller icons / logo slider; 3D skulls; Java-parity worldgen; TU36+ skin-select; updated controls menu; TU31 tutorial world; wider TU31+ settings; music fade; correct world-size display; no more infinite spinner |
| `v1.1.0b` | 2026-07-12 | `245cbb18` | Mario world; TU43 structures/blocks (Igloos, Fossils); loot tables; pick block; release-build logger + debug spectator; neoLegacy title-screen branding; universal DLC-capable save format; localization-menu crash fix; jukebox fade; 64×64 zombie-villager model. See [v1.1.0b](#v110b-current) below |

> `v1.0.5b` and `v1.0.6b` both carry the header "neoLegacy v1.0.5b" inside `NOTES.md` at their tag
> (a copy-paste slip in the notes), and `v1.0.6b`/`v1.0.7b` were tagged the same day as `v1.0.5b`
> during the expanded-worldgen revert cycle. Treat the tag, not the in-file header, as canonical.

For the feature detail behind the 1.0.9b line, see
[neoLegacy Additions](/slop-docs/features/neolegacy-additions/), and for the parity milestones see
[TU25 Backport](/slop-docs/features/tu25/) and [TU31 Backport](/slop-docs/features/tu31/).

## v1.1.0b {#v110b-current}

`v1.1.0b` (`245cbb18`, 2026-07-12) is the first release past the `47e5cba3` snapshot these docs were
audited against — **36 commits** on top of v1.0.9b. The version bump lands in
`0449af2b chore: bump again` / `d236146e chore: bump version` (`BUMP` → `1.1.0b`), and `NOTES.md` was
rewritten for the release. Highlights, with source commits:

**Additions**

- **Super Mario World support** — the Mario DLC world plus a `wiiU2Windows.py` conversion tool and a
  large `UIScene` rework (`042ee0a2 feat: super mario world support (#37)`, `929b32ff feat: mario
  world`; localization/crash follow-ups `adaff9e9`, `24a0b070`).
- **TU43 structures & blocks** — Igloo and Fossil generation, TU43 blocks (magma, real prismarine
  texture, etc.), Elytra/kinetic-energy/paper-doll fixes, debug-mode spectator, and a release-build
  txt logger (`a4c746be TU43 Structures, bug fixes & minor changes`; the earlier `558173cf`/
  `d1bf3952`/`be3bf0ae` TU43 Release 2–4 also merged in this range). TU43 work is now on `main`, not
  branch-only — see [the TU43 note in the Introduction](/slop-docs/overview/introduction/#roadmap).
  The Fossil/Igloo structure **XML data files** they generate from
  (`Common/Media/MediaWindows64/Structures/fossils/`, `.../igloo/`) landed in
  `52138bfe feat: structure files, updated sounds, and village improvements (#33)`.
- **Structure files, new mob sounds & village improvements** — `52138bfe (#33)` adds the
  fossil/igloo structure XML set, new **polar bear** sound effects and re-cut **cow** milk/idle
  sounds, `VillagePieces` generation tweaks, and the `tools/struct_parse.py` NBT→XML helper.
- **Loot tables** — a data-driven drop system shipped as XML assets under
  `Common/Media/MediaWindows64/Structures/loot_tables/` (chest, entity, and gameplay/fishing tables),
  copied into the build by a new CMake `AssetLootTablesCopy` target
  (`54528fac feat: loot tables (#43)`).
- **Pick block** — middle-mouse pick block in creative (infinite-items) mode, implemented in
  `Minecraft.cpp` against `KeyboardMouseInput::MOUSE_MIDDLE`
  (`a59d441a feat: pick block (#40)` / `6e59e404 feat: pick block + jukebox fixes`). See
  [Input](/slop-docs/client/input/#in-world-actions).

**Changes**

- **Universal save format** — DLC worlds can now load any region format. The
  `region_format_16` marker (not the save platform) now decides split-vs-legacy region layout, and
  Windows64 saves opt into split saves; the level-gen `region_format_16` stamp was removed and
  `ConvertToLocalPlatform()` is now run on load (`48b80ba8 fix: world format discrepancies`,
  `245cbb18 fix(?): world save region stuff yay (#45)`). This is the "anyone can make a DLC world
  from their own saves" note in `NOTES.md`. See
  [Level Storage & IO](/slop-docs/world/storage/#the-console-save-file-format).
- neoLegacy branding on the title screen; dedicated-server stability fixes; animated-texture
  frame interpolation; Elytra accuracy improvements (`a4c746be`). The re-cut cow/polar-bear mob
  sounds ship in `52138bfe (#33)`, not `a4c746be`.
- **16×16 tutorial world** — the bundled `Tutorial.mcs` was rebuilt to the 16×16 size
  (`91192b70 feat: 16x16 tutorial`).
- DLC world updates (Greek Mythology, Halo, Mass Effect, etc.) — `079f0e02 feat: dlc worlds+`.
- The bundled retail **DLC packs were deleted** from the tree
  (`8cfce8ee chore: delete dlcs`), with `.gitignore`/localization restored afterwards
  (`6db3e912`, `24a0b070`).

**Bug fixes**

- Localization menu no longer crashes switching between Japanese/Chinese/Korean; kanji-font and
  UTF-widening fixes (`5d9417ee fix: kanji fonts (#36)`, `e6085e18`, `9f5de77d`).
- Jukeboxes fade the soundtrack before playing (`6e59e404`); flower-pot storage, zombie-villager
  64×64 model, and dedicated-server missing-color-file crash fixed (`a4c746be` / `NOTES.md`).
- Build-failure fixes (`6148d850 (#44)`, `f0a86841`) and CI support for `TUXX` branches
  (`f32ce319`).

## History root caveat

`git log --reverse` reports the earliest commit as `def8cb41 "first commit"` by `daoge_cmd` on
**2026-03-01**, and files such as `SkullTile.cpp` trace to an `Initial commit`. This is a
**squashed / re-rooted history**, not the birth of LCE reconstruction. neoLegacy's *tracked*
history starts 2026-03; its *code lineage* is inherited from LCE-Revelations (and LCERenewed before
it) — see [Introduction](/slop-docs/overview/introduction/) and the `README.md` acknowledgments.
The latest commit at the time of writing is `47e5cba3 "Actualizar BUMP"` (`aRockefeller`,
2026-07-07); the repository has **1645** commits total.

## Active development branches

`main` is the default and release branch. `git branch -a` shows several long-lived feature branches
that receive frequent `Merge origin/main` syncs (many automated):

| Branch | Focus |
|---|---|
| `main` | default; nightly + stable releases cut from here |
| `origin/TU43` | TU43 work; its structures/blocks have since merged to `main` in v1.1.0b (`a4c746be`), so the branch is no longer the only home of TU43 content |
| `origin/exp/worldgen` | experimental worldgen (Mesa/ocean-monument/biome overhaul staging) |
| `origin/experimental` | general experimental integration |
| `origin/feat/minigames` | minigame modes |
| `origin/guardians` | Guardian mob / Ocean Monument spawn work |
| `origin/commands` | command-system work |
| `origin/dbgRT` | debug / ray-trace debugging |
| `origin/simpleKeyBind-modifier` | keybind-modifier support |

The `TU43` line indicates neoLegacy is prototyping the next milestone beyond TU31; see the
[Roadmap in the Introduction](/slop-docs/overview/introduction/) and
[Contributing](/slop-docs/overview/contributing/) for how milestone order gates what lands on
`main`.

## Where the version truth lives

| Fact | Source of truth |
|---|---|
| Current version number | `BUMP` |
| Per-release notes | `NOTES.md` (current) / `NOTES.md` at each tag |
| Stable release list | `git tag` (`v1.0.0b` … `v1.0.9b` + `-Dedicated-Server` pairs) |
| Network/build compatibility | `cmake/GenerateBuildVer.cmake` (`BUILD_NUMBER`) |
| Scope / milestone rules | `CONTRIBUTING.md` |

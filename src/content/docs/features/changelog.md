---
title: Version History
description: neoLegacy's release history from v1.0.0b to v1.0.9b — the nightly build model, the network-protocol 570 bump, per-tag release notes, and the currently active development branches.
---

neoLegacy ships on two tracks: a rolling **Nightly** build cut from `main`, and periodic **stable**
point releases tagged `v1.0.Nb`. The current version is **1.0.9b** (`BUMP` = `1.0.9b`,
`NOTES.md:1` = "neoLegacy v1.0.9b").

## Release model

Two GitHub Actions workflows in `.github/workflows/` drive releases:

| Workflow | File | Trigger | Output |
|---|---|---|---|
| **Nightly Release** | `nightly.yml` | every push to `main` (and manual dispatch) | rolling `.zip` build; the primary user download (`README.md`) |
| **Stable Release** | `stable.yml` | a push that edits the `BUMP` file | a tagged `v1.0.Nb` stable build |
| Pull request CI | `pull-request.yml` | PRs | build/validation |
| Upstream sync | `sync.yml` | scheduled | pulls from the LCE-Revelations base |

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

> `v1.0.5b` and `v1.0.6b` both carry the header "neoLegacy v1.0.5b" inside `NOTES.md` at their tag
> (a copy-paste slip in the notes), and `v1.0.6b`/`v1.0.7b` were tagged the same day as `v1.0.5b`
> during the expanded-worldgen revert cycle. Treat the tag, not the in-file header, as canonical.

For the feature detail behind the 1.0.9b line, see
[neoLegacy Additions](/slop-docs/features/neolegacy-additions/), and for the parity milestones see
[TU25 Backport](/slop-docs/features/tu25/) and [TU31 Backport](/slop-docs/features/tu31/).

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
| `origin/TU43` | TU43 work, already begun past the README's stated TU31 milestone |
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

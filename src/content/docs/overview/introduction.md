---
title: Introduction
description: What neoLegacy is, where it comes from, its roadmap, and where to download it.
---

**neoLegacy** is a community continuation of Minecraft: Legacy Console Edition (LCE). It is a C++ codebase — a reconstructed LCE source tree — whose stated goal is to backport newer Title Updates onto the **TU19** base engine (Xbox 360 Edition, released 2014-12-18).

> "This project aims to backport the newer title updates back to Legacy Console Edition (which is based on TU19)." — `README.md:3`

neoLegacy is **not** vanilla LCE. It is a fork lineage descendant that adds gameplay content (blocks, items, mobs, mechanics), a Linux/dedicated-server build path, and a C# plugin API on top of a TU19-era engine. Throughout these docs, anything that differs from stock TU19 is called out as a **neoLegacy-vs-vanilla-LCE delta**.

## Fast facts

| | |
|---|---|
| Base version | TU19 (`CONTRIBUTING.md:2`) |
| Current version | **1.0.9b** (`BUMP`) |
| Language | C++17 engine (CMake) + C# plugin layer (FourKit, .NET 10) |
| Primary forge | `https://git.neolegacy.dev/coah80/neoLegacy` (self-hosted Gitea/Forgejo) |
| Public mirror | `github.com/pieeebot/neoLegacy` (Nightly release for end users) |
| Network/protocol version | 570 — **static**, gates cross-play (`cmake/GenerateBuildVer.cmake:10`) |

## Roadmap

Per `README.md:8-12`:

| Title Update | Status |
|---|---|
| **TU25** | 100% complete 🎉 |
| **TU31** | 97.01% complete |
| TU43 | Work started on the `TU43` branch (commit `37cd6215 TU43 Release 1`), ahead of the README's stated 97% TU31 milestone |

The overall goal (`CONTRIBUTING.md:26`) is bluntly "Implementing all title updates LCE had." Content is added **in original LCE release order**, one Title Update milestone at a time, starting from TU19 — see [Contributing & Releases](/slop-docs/overview/contributing/) for the parity rules.

## Lineage

neoLegacy stands on a chain of prior LCE reconstruction and backport projects. The acknowledgments in `README.md:19-26`:

| Project | Role in the lineage |
|---|---|
| **itsRevela / LCE-Revelations** | The stable base neoLegacy continues from. The internal CMake project name is still `LCE-Revelations`; `itsRevela`/`Revela` are among the top committers (126 + 86 commits). |
| **Patoke / LCERenewed** | Patches that required deep decompilation. |
| **GabsPuNs / Project-Zenith** | Donated the **Classic Crafting** implementation (`IUIScene_ClassicCraftingMenu.cpp/.h`, added in `05d7ccb6 feat(TU31): classic crafting (#48)`). |
| **rdust_dusted** (Discord) | The redesigned logo currently in use. |

Because of this heritage, strings and file names across the tree are inconsistent: the CMake project is `LCE-Revelations`, some scripts say `LegacyEvolved`, the GHCR image and legacy publisher say `itsrevela`, and the user-facing name is **neoLegacy**. They are all the same codebase.

## What neoLegacy adds vs vanilla LCE TU19

A high-level list — each has its own docs section:

- **TU25 content** — Acacia & Dark Oak wood sets, fences/gates/doors for all wood types, iron trapdoors, inverted daylight sensor, expanded textures. See [TU25 Backport](/slop-docs/features/tu25/).
- **TU31 content** — Andesite/Diorite/Granite (+ polished + recipes), barrier block, prismarine, packed ice, red sandstone, stained glass (+ panes), podzol, comparator, item frames, armor stands, Depth Strider, Leaping/Water Breathing potions, guardians/ocean monuments, villager→witch, creeper flint-and-steel ignition, and more. See [TU31 Backport](/slop-docs/features/tu31/).
- **Classic Crafting** — the TU31 classic crafting menu, donated by Project-Zenith.
- **Java-parity worldgen** — Mesa biomes, deep ocean, ocean monuments, double plants/sunflowers, world generation rewritten to match Java much more closely (`720e1a77`). See [World Generation](/slop-docs/world/worldgen/).
- **v1.0.9b additions** — slime blocks, sunflowers, world copy/save, modifiable in-game logos, 3D skulls, TU36+ skin-select menu, TU31 tutorial world, music-fade fixes (see the current changelog below).
- **Linux support** — `build-linux.sh` cross-compile and a Nix flake (`nix run .#client`).
- **Dedicated server + FourKit** — a headless server (vanilla and FourKit flavours), plus a C# plugin API that vanilla LCE never had. See [Dedicated Server Overview](/slop-docs/server/overview/).

## The v1.0.9b release

From `NOTES.md` (consumed verbatim as the stable-release body):

**Additions** — slime blocks, sunflowers; copy/save worlds on the LoadCreateJoin menu; modifiable controller icons and in-game logos via a slider in the *User Interface* menu.

**Changes** — 3D in-game skulls; worldgen altered to match Java much more closely; Skin Select menu reworked for TU36+ parity; updated Controls menu; tutorial world updated to TU31; settings menus widened to match TU31+.

**Bug fixes** — in-game music fades when leaving/joining a world; correct world-size display in the worlds list; the LoadCreateJoin infinite spinner removed.

See [Version History](/slop-docs/features/changelog/) for the full per-release changelog.

## Downloads

End users do **not** build from source. Two supported channels:

- **LCE Emerald Launcher** — `github.com/LCE-Hub/LCE-Emerald-Launcher` (the recommended way to get and manage builds).
- **Nightly build** — `github.com/pieeebot/neoLegacy/releases/tag/Nightly`. Download the `.zip`, extract, and run `Minecraft.Client.exe`. The Nightly release body includes newcomer, Steam Deck/Proton, and playit.gg multiplayer-tunnel instructions.

Nightlies are produced by CI on every push to `main`; stable `v1.0.x` tags are cut when the `BUMP` file changes. See [Building & Compiling](/slop-docs/overview/building/) if you want to compile it yourself, and [Contributing & Releases](/slop-docs/overview/contributing/) for the CI pipeline.

## Community

- **Discord** — `discord.gg/neolegacy` (badge in `README.md:5`).
- **Source** — `git.neolegacy.dev/coah80/neoLegacy` (canonical) and the `pieeebot/neoLegacy` GitHub mirror.

## History-root caveat

`git log --reverse` shows the repository's earliest commit is `def8cb41 "first commit"` by `daoge_cmd` on **2026-03-01**. This is a **squashed / re-rooted history**, not the genuine start of LCE reconstruction. neoLegacy's *tracked git history* begins 2026-03, but its *code lineage* is inherited from LCE-Revelations → LCERenewed and predates that date. Treat 2026-03-01 as the history-root date, not "the day the project was created."

As of the snapshot these docs were written from, the tree had **1645 commits**. By author count the largest is release owner `piebot`, followed closely by the automated `github-actions` nightly-commit bot, then `Fireblade` and the LCE-Revelations maintainer `itsRevela`/`Revela`.

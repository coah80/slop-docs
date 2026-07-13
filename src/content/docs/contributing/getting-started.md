---
title: "Contributing: Getting Started"
description: Practical onboarding for a first neoLegacy PR — account, fork, the 4JLibs submodule, branch naming, issues, Discord, and the PR lifecycle.
---

This is the hands-on onboarding guide: how to get an account, clone the source
(with the one submodule gotcha that trips everyone up), build a debug client,
file an issue, and land a pull request. For the *rules* that govern what gets
accepted — the milestone-parity policy, the completeness bar, the no-LLM rule,
and how releases are cut — read [Contributing &
Releases](/slop-docs/overview/contributing/) first. This page assumes you have
already read it.

## The canonical forge is `git.neolegacy.dev`

neoLegacy is developed on a self-hosted Gitea/Forgejo instance, **not** on
GitHub. The `origin` remote of a real clone points at
`https://git.neolegacy.dev/coah80/neoLegacy.git`, and the CI workflows are Gitea
Actions (they reference `gitea.*` contexts, e.g. `gitea.event_name`,
`gitea.ref_name` in `.github/workflows/pull-request.yml`). GitHub is used only as
a **download mirror**: the README points end users at
`github.com/pieeebot/neoLegacy/releases/tag/Nightly` for the Nightly build.

To contribute:

1. **Make an account on `git.neolegacy.dev`.** This is where you fork, push, and
   open pull requests.
2. **Fork** `coah80/neoLegacy` into your namespace on that forge.
3. **Clone your fork** — and mind the submodule (below).

The 4JLibs submodule lives on the same forge under the `neoStudiosLCE`
organization (`.gitmodules` → `https://git.neolegacy.dev/neoStudiosLCE/4JLibs.git`).

## Fork, clone — and the 4JLibs submodule gotcha

The client depends on a git submodule, **4JLibs**, declared in `.gitmodules`:

```ini
[submodule "Minecraft.Client/Windows64/4JLibs"]
	path = Minecraft.Client/Windows64/4JLibs
	url = https://git.neolegacy.dev/neoStudiosLCE/4JLibs.git
```

A plain `git clone` leaves that directory **empty**, and the build will fail
looking for the Iggy/Render libraries and the `fxc.exe` shader compiler that live
under it. Always clone recursively:

```bash
git clone --recurse-submodules https://git.neolegacy.dev/<you>/neoLegacy.git
```

If you already cloned without `--recurse-submodules`, fix it in place:

```bash
git submodule update --init --recursive
```

:::caution[Nix does not fetch submodules]
The Nix flake path can't fetch git submodules the normal way — `flake.nix`
patches `github:Patoke/4JLibs` in via `postUnpack` instead. If you're building
with Nix you don't run the `git submodule` step; for every other path (native
Windows or `build-linux.sh`) you must. See [Building &
Compiling](/slop-docs/overview/building/#common-pitfalls).
:::

The submodule URL itself has churned — one of the earliest merged PRs was
`#2 update 4jlibs submodule url` (branch `fix/4jlibs-submodule`), so if an old
checkout points somewhere stale, re-sync `.gitmodules`.

## Branch naming observed in history

There is no written branch-naming policy, but the history and the
[`sync.yml`](/slop-docs/overview/contributing/#branch-sync) auto-merge job impose
a de-facto convention. `sync.yml` runs on every push to `main` and force-merges
`main` into any branch matching:

- `feat/*` — feature branches (`feat/minigames`, `feat/mario-world`)
- `exp/*` — experimental/long-running work (`exp/worldgen`)
- `experimental` — the catch-all experimental branch

Other live branches in the tree don't match those globs and so are **not**
auto-synced: `TU43`, `commands`, `guardians`, `dbgRT`,
`simpleKeyBind-modifier`. Name a long-running feature branch `feat/<thing>` or
`exp/<thing>` if you want it kept current with `main` automatically; name it
something else if you want to control merges yourself.

Contributor forks also push topic branches that get merged by PR, e.g.
`fix/chat-formatting`, `fix/consistent-gui-colors`, `dlc-skin-corrections`.

### Commits: milestone tags and fix chains

Commit subjects follow a loose Conventional-Commits style with an optional
Title-Update scope:

- `feat: <thing>` / `feat(TU31): <thing>` — new content, milestone-tagged when
  relevant.
- `fix: <thing>` / `fix(TU31): <thing>` — a follow-up correcting a specific gap.

Features usually don't land complete in one commit — they arrive as a `feat`
followed by a **fix chain** (the slime block took five `fix:` commits). See the
[Backport Case Studies](/slop-docs/backporting/case-studies/) for worked
examples. When a PR is merged, its number is folded into the squash/merge
subject as `(#NN)` — e.g. `feat: loot tables (#43)`, `feat: pick block (#40)`.

## Build a debug client and run it

Before writing anything, get a build running so you can verify your changes
in-game. The full matrix (native Windows VS2022, the `build-linux.sh` cross
compile, and the Nix flake) is documented in [Building &
Compiling](/slop-docs/overview/building/) — read it. The short version:

**Windows (recommended for development):** install Visual Studio 2022 with the
"Desktop development with C++" workload, open the repo folder (VS reads
`CMakePresets.json`), pick the **Windows64 - Debug** configuration, build, and
launch `Minecraft.Client` with F5. Release also works but "is missing some debug
features" (`README.md`). Run the exe **from its output directory** so relative
asset paths resolve.

**Linux:** `./build-linux.sh . Debug` cross-compiles a Windows x64 binary with
clang-cl + a Windows SDK fetched by `xwin`, and installs Wine launcher scripts.
This is exactly what the PR CI does.

You'll want a Debug build for development because the bug-report template asks
which build type reproduced a bug, and because Debug carries extra diagnostics.

## Filing issues

Issues live on `git.neolegacy.dev`. Blank issues are disabled
(`.github/ISSUE_TEMPLATE/config.yml` sets `blank_issues_enabled: false`) — you
must pick one of two templates.

### Bug Report — `bug_report.yml`

Titled `[Bug] `, labelled `bug`. Required fields (`validations.required: true`):

| Field | What it asks |
|-------|--------------|
| **Bug description** | Clear, concise description of the bug |
| **To Reproduce** | Numbered steps |
| **Expected behavior** | What you expected instead |
| **Version** | The short commit hash (placeholder `e.g. 55a86b8`) |
| **Is this reproducible in `itsRevela/LCE-Revelations`?** | A "no idea" or similar answer gets the report **rejected** |
| **Build Type** | Release / Debug checkbox |
| **Screen Resolution(s)** | 1080p / 720p / 480p |
| **Operating System(s)** | Win 11 / 10 / 8.1 *(not very supported)* / Debian / Arch / Gentoo |
| **Launcher** | e.g. Emerald Launcher |

Optional: Screenshots, Videos, Additional context. The Revelations-parity field
is doing real triage work — neoLegacy is built **on top of** LCE-Revelations, so
a bug that also reproduces in Revelations is upstream, not a neoLegacy
regression. Report the exact commit hash in **Version**; it's how a maintainer
pins down whether the bug still exists.

### Suggestion — `suggestion_request.yml`

Titled `[Suggestion] `, labelled `enhancement`. One required field —
**Describe the solution you'd like** — plus optional **Is your suggestion
related to a problem?** and **Additional context**. Note that suggestions are
still bound by the parity policy: a suggestion for content outside the current
milestone, or not in any official LCE Title Update, is out of scope
(`CONTRIBUTING.md`).

## Where discussion happens: Discord

Real-time help and design discussion happen on Discord, not in issues. The
issue-template config points there explicitly:

> "If you need help, please ask for it in our Discord! You will get assistance
> much faster there, **including help getting the project to compile**." —
> `.github/ISSUE_TEMPLATE/config.yml`

The README links the server via `discord.gg/neolegacy`. (The template config
uses a different invite code, `discord.gg/D6hEPNYeyn` — both point at the same
community; prefer the README link.) Compile trouble in particular is a
Discord-first question — the maintainers would rather walk you through the
toolchain there than in a bug report.

## The pull-request lifecycle

Once your feature builds and passes the [completeness
bar](/slop-docs/backporting/overview/#the-complete-content-bar), open a PR
against `main` on `git.neolegacy.dev`. What actually happens, drawn from merged
PRs in the history:

1. **Single topic.** A PR must stay on one cohesive topic and fully document its
   file changes; undocumented changes get it closed (`CONTRIBUTING.md`). A block
   *with* its recipe, rendering, and icons is one topic; a block *plus*
   unrelated AI fixes is not. See the policy detail in [Contributing &
   Releases](/slop-docs/overview/contributing/#single-topic-prs).
2. **Human-authored only.** Code written "largely, entirely, or even noticeably
   by an LLM" is rejected (`CONTRIBUTING.md`).
3. **The PR CI runs a Debug cross build.** `pull-request.yml` triggers on
   `opened`, `reopened`, and `synchronize` (i.e. every push to the PR branch),
   installs LLVM 21 + Wine + xwin, and runs `./build-linux.sh . Debug` pinned to
   2 cores. It ignores PRs that only touch `.md`, `.gitignore`, or
   `.github/*.md`. It's a **build gate**, not a test suite — green means it
   compiles, nothing more. See [Testing Your
   Changes](/slop-docs/contributing/testing/).
4. **Review + merge.** Maintainers review; merges show up in the log as either a
   Gitea "Merge pull request '<title>' (#NN)" commit or a squashed
   `<type>: <thing> (#NN)`. Merges carry a `Reviewed-on:` trailer pointing at the
   pull URL (e.g. `feat: loot tables (#43)` records
   `Reviewed-on: .../pulls/43`).
5. **`sync.yml` propagates `main`.** After your PR lands on `main`, the sync job
   force-merges `main` into every `feat/*`, `exp/*`, and `experimental` branch
   (aborting on conflict). This is why the log is full of `github-actions` merge
   commits — long-running feature branches are continuously rebuilt on top of
   `main`. If you maintain such a branch, expect these automatic merges and
   resolve any conflicts the bot couldn't.
6. **Ship.** Once merged, your change rides the next **Nightly** build
   automatically, and is folded into the next **stable** `v<version>` tag when
   `BUMP` is bumped. The release pipeline is documented in [Contributing &
   Releases](/slop-docs/overview/contributing/#release-pipeline).

## Next steps

- Read [Contributing & Releases](/slop-docs/overview/contributing/) for the full
  policy and the release pipeline.
- Read [Building & Compiling](/slop-docs/overview/building/) before your first
  build — it's the single biggest source of first-PR friction.
- Match the house style: [Code Style](/slop-docs/contributing/code-style/).
- Verify your work the way the project actually does: [Testing Your
  Changes](/slop-docs/contributing/testing/).
- If you're backporting a Title-Update feature, follow the [Backporting
  Workflow](/slop-docs/backporting/workflow/).

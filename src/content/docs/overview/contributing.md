---
title: Contributing & Releases
description: neoLegacy's contribution policy, PR rules, and the nightly/stable CI release pipeline.
---

This page covers the rules for getting code into neoLegacy and how releases are cut. The authoritative source is `CONTRIBUTING.md`; the CI lives in `.github/workflows/`.

## Contribution policy

### Milestone-ordered parity

neoLegacy's whole design is **backporting Title Updates in original LCE release order, starting from TU19** (`CONTRIBUTING.md:1-5`). The current milestone gates what's acceptable:

- All content **before TU25** is treated as already present in the TU19 base and is not reimplemented unless it is buggy or broken (`CONTRIBUTING.md:4`).
- You may only implement content from the **current target milestone**. Submitting TU27 content while the project targets TU25 is rejected (`CONTRIBUTING.md:8-9`).
- No Java/Bedrock features that were not in LCE at that milestone (`CONTRIBUTING.md:10`).
- No stub/placeholder content — "a mob with no AI, drops, or behavior, or a block with no crafting recipe" is not accepted (`CONTRIBUTING.md:11-13`).
- No gameplay content that has no reference in any official LCE Title Update (`CONTRIBUTING.md:14`).

What **is** welcomed (`CONTRIBUTING.md:16-23`): faithful, complete milestone content; fixes to legitimately buggy existing behavior; minimal non-invasive QoL that doesn't stray from the LCE experience; asset-quality upgrades that preserve the original content; and transparent platform/stability/performance improvements.

### Definition of "Complete"

A feature is not merge-ready until it meets a completeness bar (`CONTRIBUTING.md:28-37`):

| Requirement | |
|---|---|
| Worldgen presence / spawn behavior | correct, where applicable |
| Crafting recipe(s) / acquisition | proper and functional |
| Inventory + tooltip representation | correct |
| Drops on destruction / death | correct |
| Interactions with same-milestone content | functional |
| Stability | no crashes, soft-locks, or game-breaking bugs introduced |

> "If a feature cannot be implemented fully yet, it should not be implemented at all until it can be." — `CONTRIBUTING.md:37`

### Single-topic PRs

PRs must fully document their changes and stay on **one topic** (`CONTRIBUTING.md:39-44`). A PR that adds a block *plus* unrelated mob-AI fixes *plus* an audio rework will be closed — too much unrelated code to review. A PR that adds a block *with its recipes, world rendering, and inventory icons* is one cohesive topic and is fine. Undocumented changes get the PR closed. Use the PR template to the fullest extent (`CONTRIBUTING.md:49-50`).

### No LLM-written code

This is stated plainly in `CONTRIBUTING.md:46-47`:

> "We currently do not accept any new code into the project that was written largely, entirely, or even noticeably by an LLM. All contributions should be made by humans that understand the codebase."

Contributions must be human-authored by people who understand the codebase.

:::note[The irony, acknowledged]
These documentation pages were themselves AI-generated (that's the whole "slop docs" bit). That policy applies to **code contributed to neoLegacy**, not to this third-party docs site. If you're writing code for neoLegacy: write it yourself. If you spot something wrong in these docs, [open an issue on the docs repo](https://github.com/coah80/slop-docs).
:::

## Release pipeline

CI runs as **Gitea Actions** on the canonical forge `git.neolegacy.dev` (the workflow files use `gitea.*` contexts and Gitea release actions). The GitHub `pieeebot/neoLegacy` repo mirrors the Nightly release for end users.

| Workflow | Trigger | Produces |
|---|---|---|
| `nightly.yml` | push to `main` or dispatch | Nightly build zips on the `Nightly` / `Nightly-Server` tags |
| `stable.yml` | push to the **`BUMP`** file, or dispatch | Tagged `v<version>` stable release |
| `pull-request.yml` | pull request | Debug cross build (no release) |
| `sync.yml` | push to `main` | Merges `main` into `exp/*`, `feat/*`, `experimental` branches |

### Nightly builds — `nightly.yml`

On every push to `main` (unless the commit message contains `[skip ci]`, `nightly.yml:25`). Runs on Ubuntu 24.04:

1. Installs **LLVM 21** via `llvm.sh 21`, plus Wine and cmake/ninja/rsync/zip; grabs the `xwin` binary and symlinks `clang-cl`/`llvm-*`/`lld-link` → the `-21` binaries; sets up .NET `10.0.x`.
2. Runs `./build-linux.sh . Release` with `INSTALL_PREFIX=$PWD/result`.
3. Packages `result/{client,server,fourkit}` into three zips:
   - `neoLegacyWindows64.zip` (client)
   - `neoLegacyServerWindows64.zip` (vanilla server)
   - `neoLegacyServerWindows64-FourKit.zip` (FourKit server)
4. Publishes to tag `Nightly` (client, named `Client: <sha7>`) and `Nightly-Server` (both server zips, named `Server: <sha7>`), then a cleanup job deletes the CI artifacts.

Nightlies are the primary end-user download (`README.md:16-17`); the Nightly release body carries newcomer, Steam Deck/Proton, and playit.gg tunnel instructions.

### Stable releases — the BUMP trigger

`stable.yml` triggers **only on a push that touches the `BUMP` file** (`stable.yml:4-6`):

```yaml
push:
  paths:
    - 'BUMP' #neo: this is a file. edit it. contains version number
    #neo: DO NOT ADD NOTES.md HERE.
```

To cut a stable release you edit `BUMP` (e.g. bump `1.0.9b` → `1.0.10b`) and push it. The workflow:

1. Reads the version from `BUMP` (`VERSION="$(tr -d '\r\n' < BUMP)"`).
2. Runs the same cross build + packaging as nightly.
3. Uses `NOTES.md` **verbatim** as the release body.
4. Publishes tags `v<version>` (client) and `v<version>-Dedicated-Server` (servers), both with `prerelease: false`.

:::caution[Never add NOTES.md to the path filter]
The comment in `stable.yml:7` is explicit: **do NOT add `NOTES.md`** to the trigger's `paths`. If you did, editing the changelog would fire a release. `NOTES.md` is edited *alongside* the `BUMP` change and consumed as the body — the `BUMP` push is what triggers the release.
:::

So the release ritual is: write the changelog into `NOTES.md`, then edit `BUMP` to the new version, and push both together. Existing stable tags run `v1.0.0b` … `v1.0.9b` with matching `-Dedicated-Server` tags. See [Version History](/slop-docs/features/changelog/).

### Pull-request builds

`pull-request.yml` builds a **Debug** cross build (`build-linux.sh . Debug`, pinned to 2 cores via `taskset` + `CMAKE_BUILD_PARALLEL_LEVEL=2`) and ignores `.md`/`.gitignore` path-only changes. It's a build gate — no release.

### Branch sync

`sync.yml` runs on push to `main` and merges `main` into all `exp/*`, `feat/*`, and `experimental` branches, aborting on conflict. This keeps long-running feature branches (worldgen, minigames, guardians, TU43) current — hence the many `github-actions` merge commits in the log.

## Legacy publisher (superseded)

`Update-NightlyRelease.ps1` is a pre-Gitea local Windows publisher (hardcoded `itsRevela/LCE-Revelations` + `C:\Users\revela\...` paths, needs a `GITHUB_TOKEN`). It zips `build\Minecraft.Client\Release` and `build\Minecraft.Server\Release` and recreates GitHub `Nightly`/`Nightly-Dedicated-Server` releases. It's been superseded by `nightly.yml` for the neoLegacy pipeline but is still in the tree.

## Where to get help

- **Source / issues** — `git.neolegacy.dev/coah80/neoLegacy` (issue templates: `bug_report.yml`, `suggestion_request.yml`).
- **Discord** — `discord.gg/neolegacy`.
- Read [Building & Compiling](/slop-docs/overview/building/) before your first PR so your changes actually compile on the CI cross toolchain.

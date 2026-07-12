---
title: CI & Release Pipeline
description: The Gitea Actions workflows — nightly.yml, stable.yml, pull-request.yml, sync.yml — plus the legacy PowerShell publisher and the GHCR server image.
---

neoLegacy's CI lives in `.github/workflows/` but runs on **Gitea Actions**, not GitHub — the workflows use `gitea.*` contexts and Gitea-specific release/artifact actions. The canonical forge is Gitea at `git.neolegacy.dev`; the GitHub `pieeebot/neoLegacy` repo is a public mirror of the Nightly release for end users.

All release builds go through the same Linux cross-compile path used locally — `build-linux.sh` (see [Building neoLegacy](/slop-docs/overview/building/)) — producing Windows x64 binaries. For running the resulting server, see [Deployment](/slop-docs/server/deployment/).

## Shared build steps

`nightly.yml`, `stable.yml`, and `pull-request.yml` all provision the same toolchain on `ubuntu-24.04`:

1. Checkout with `submodules: recursive` (pulls the `4JLibs` submodule).
2. Install **LLVM 21** via `apt.llvm.org/llvm.sh 21`, plus `wine`, `cmake`, `ninja-build`, `rsync`, `zip`, `util-linux`, `jq`.
3. Install **xwin 0.8.0** (Windows SDK splatter) from the pinned GitHub release binary.
4. Symlink the versioned LLVM tools to their unsuffixed names — `clang-cl`, `llvm-ml`, `lld-link`, `clang`, `llvm-rc`, `llvm-lib`, `llvm-mt` all point at the `-21` binaries.
5. Set up **.NET 10** (`10.0.x`) for the FourKit managed host.
6. `./build-linux.sh . <Release|Debug>` with `INSTALL_PREFIX=$PWD/result`.

Every job is gated by a `[skip ci]` check on the head commit message:

```yaml
if: >
  !gitea.event.head_commit ||
  !contains(gitea.event.head_commit.message, '[skip ci]')
```

## `nightly.yml` — Nightly Release

**Trigger:** push to `main`, or `workflow_dispatch` (with a `branch` input, default `main`). Concurrency group `nightly` with `cancel-in-progress: true`, so a new push cancels an in-flight nightly.

Three jobs — `build`, `release`, `cleanup`:

### `build`

After the shared toolchain steps, `build-linux.sh . Release` installs into `result/`. The install layout (from `build-linux.sh`'s `do_install`) is `result/{client,server,fourkit}`, which the packaging step zips one folder at a time:

```yaml
cd result/client  && zip -r ../../staging/neoLegacyWindows64.zip .
cd result/server  && zip -r ../../staging/neoLegacyServerWindows64.zip .
cd result/fourkit && zip -r ../../staging/neoLegacyServerWindows64-FourKit.zip .
```

The three zips are uploaded as a single `build-windows64` artifact (`christopherhx/gitea-upload-artifact@v4`).

### `release`

Downloads the artifact and publishes two Gitea releases (`akkuman/gitea-release-action@v1`), both `prerelease: true`:

| Tag | Name | Assets |
|---|---|---|
| `Nightly` | `Client: <sha7>` | `neoLegacyWindows64.zip` |
| `Nightly-Server` | `Server: <sha7>` | `neoLegacyServerWindows64*.zip` (both server flavours) |

`<sha7>` is `${GITHUB_SHA::7}`. The client release body is the full **newcomer / Steam Deck / playit.gg** instruction block (this is the text end users see on the mirror); the server release body explains the two flavours and points plugin authors at the empty `plugins/` folder in the FourKit zip.

### `cleanup`

`if: always()` — deletes the `build-windows64` CI artifact via the Gitea API (`DELETE /repos/$REPO/actions/artifacts/$ID`) so nightly artifacts don't accumulate. The published release zips are untouched.

Files: `.github/workflows/nightly.yml`

## `stable.yml` — Stable Release

**Trigger:** push that touches the **`BUMP`** file (or `workflow_dispatch`). `BUMP` is the human-facing version string — currently `1.0.9b`. Editing `BUMP` and pushing is the release ritual.

```yaml
on:
  push:
    paths:
      - 'BUMP' #neo: this is a file. edit it. contains version number
      #neo: DO NOT ADD NOTES.md HERE.
  workflow_dispatch:
```

:::caution[Do not add `NOTES.md` to the path filter]
The workflow is intentionally triggered **only** by `BUMP` changes. `NOTES.md` is the changelog that becomes the release **body**, but if it were in the path filter, editing notes would fire a full stable release. The inline comment in the workflow spells this out.
:::

The build/package steps are identical to nightly (Release build, same three zips). The `release` job differs:

- **Minimal checkout first.** A sparse checkout of just `BUMP` + `NOTES.md` runs *before* the artifact download, with a comment noting that a normal checkout can "replace artifact data."
- **Version** is read from `BUMP` (`tr -d '\r\n' < BUMP`); the **body** is `NOTES.md` verbatim, captured into a heredoc `GITHUB_OUTPUT`.
- Publishes two releases with `prerelease: false`:

| Tag | Name | Body |
|---|---|---|
| `v<version>` | `v<version>` | `NOTES.md` contents |
| `v<version>-Dedicated-Server` | `v<version> Server` | Two-flavours server blurb |

A `cleanup` job identical to nightly's deletes the build artifact afterward.

Files: `.github/workflows/stable.yml`, `BUMP`, `NOTES.md`

## `pull-request.yml` — Pull Request Build

**Trigger:** `pull_request` (`opened`/`reopened`/`synchronize`) with `paths-ignore` for `.gitignore`, `*.md`, and `.github/*.md` — doc-only PRs don't build. Also `workflow_dispatch`.

A single `build` job, same toolchain, but a **Debug** cross build pinned to two cores:

```yaml
export CMAKE_BUILD_PARALLEL_LEVEL=2
export INSTALL_PREFIX=$PWD/result
taskset -c 2-3 ./build-linux.sh . Debug
```

No packaging, no release — it just verifies the PR compiles.

Files: `.github/workflows/pull-request.yml`

## `sync.yml` — Branch sync

**Trigger:** push to `main`. Merges `main` into every long-lived work branch and pushes the result:

```yaml
for branch in $(git for-each-ref ... refs/remotes/origin/); do
  if [[ "$branch" == "origin/exp/"* || "$branch" == "origin/feat/"* \
        || "$branch" == "origin/experimental" ]]; then
    git checkout -B "$local_branch" "$branch"
    if git merge origin/main --no-edit; then
      git push origin "$local_branch"
    else
      git merge --abort   # conflict → leave branch alone
    fi
  fi
done
```

Only `exp/*`, `feat/*`, and `experimental` branches are synced; a merge conflict aborts cleanly (the branch is skipped, not force-pushed). Runs on `ubuntu-latest`.

> **Changed in v1.1.0b:** `f32ce319 feat(ci/sync): support for TUXX branches` widened the branch
> filter to also cover `origin/TU*` — so the condition is now
> `origin/exp/* || origin/feat/* || origin/experimental || origin/TU*`. `TU31`, `TU43`, and any
> future `TUxx` milestone branch are now auto-synced with `main` too. This is the **only** workflow
> change between `47e5cba3` and `origin/main` (`v1.1.0b`); `nightly.yml`, `stable.yml`, and
> `pull-request.yml` are byte-identical across the two refs.

Files: `.github/workflows/sync.yml`

## GHCR dedicated-server image

The Docker path (vanilla server only) can pull a prebuilt image from GitHub Container Registry instead of building locally. `docker-compose.dedicated-server.ghcr.yml` references:

```yaml
image: ghcr.io/itsrevela/lce-revelations-dedicated-server:nightly
```

Note the image path still carries the old `itsrevela` / `lce-revelations` naming (upstream lineage), not `neoLegacy`. The compose file runs the container under Wine (`WINEARCH=win64`, `WINEPREFIX=/var/opt/wineprefix64`), mounts `./server-data:/srv/persist`, and publishes `25565` on TCP + UDP. The root helper `start-dedicated-server.sh` pulls this image and brings it up. See [Deployment](/slop-docs/server/deployment/) for the full Docker story, including why the FourKit image is intentionally not published.

## `Update-NightlyRelease.ps1` — legacy publisher

A **pre-CI**, local Windows PowerShell publisher that predates the Gitea pipeline. It is superseded by `nightly.yml` but still present in the tree. It is hardcoded to the old upstream (`itsRevela/LCE-Revelations`) and a personal archive path (`C:\Users\revela\Documents\Minecraft\itsRevelaReleases`), and requires a `GITHUB_TOKEN` with `repo` scope.

What it does:

1. Fetches the latest commit SHA via the GitHub API.
2. Zips `build\Minecraft.Client\Release` → `LCREWindows64.zip` and `build\Minecraft.Server\Release` → `LCREServerWindows64.zip` into a dated archive folder (skipping `.pch`/`.zip` files).
3. For both the `Nightly` and `Nightly-Dedicated-Server` releases: **deletes and recreates** the release (to get a fresh "released just now" timestamp), force-moves the tag to the latest commit, and re-uploads.
4. Client assets uploaded: the zip + `Minecraft.Client.exe`. Server assets: the server zip. Titles are rewritten with the short SHA (`Client: <sha7>` / `Server: <sha7>`).

The important behavioral deltas versus the Gitea pipeline: it targets **GitHub** (not Gitea), uses the old `LCRE*` zip names and `itsRevela/LCE-Revelations` repo, and destructively recreates releases rather than uploading into an existing tag. Do not run it against the neoLegacy pipeline.

Files: `Update-NightlyRelease.ps1`

## Distribution to end users

The README and `NOTES.md` point players at the **LCE Emerald Launcher** (`github.com/LCE-Hub/LCE-Emerald-Launcher`) and the GitHub Nightly mirror (`github.com/pieeebot/neoLegacy/releases/tag/Nightly`): download the `.zip`, extract, run `Minecraft.Client.exe`. The Nightly release body baked into `nightly.yml` includes the newcomer, Steam Deck/Proton, and playit.gg multiplayer-tunnel instructions verbatim.

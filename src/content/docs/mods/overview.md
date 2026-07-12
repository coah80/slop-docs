---
title: Mods & Distribution
description: How modding neoLegacy works ecosystem-wise — the fork-and-build model, what upstream accepts, distribution channels, keeping a mod branch synced, and the network-compat rule that decides when a mod breaks cross-play.
---

There is no mod loader for the neoLegacy **client**. The game is a C++ engine (base TU19, with TU25/TU31 backports) compiled to a single `Minecraft.Client.exe` — no plugin API, no runtime asset injection, no Forge/Fabric equivalent. A "client mod" is therefore a **source patch**: you fork the tree, change C++/assets, and rebuild the exe. The only in-process extension surface anywhere in the project is **FourKit**, and that is server-side only — see [FourKit Plugins](/slop-docs/mods/fourkit-ecosystem/).

This page covers the modding *ecosystem*: how you get a build, what upstream will and won't take, how to keep a personal fork synced, and the one constant (`BUILD_NUMBER 570`) that decides whether your build can still join anyone else's.

## The fork-and-build model

Because there is no loader, every client modification follows the same shape:

1. **Fork** the canonical repo (`https://git.neolegacy.dev/coah80/neoLegacy`, a self-hosted Forgejo/Gitea; GitHub `pieeebot/neoLegacy` is a public mirror).
2. **Patch** the source. Blocks/items/entities/worldgen live in `Minecraft.World/`; rendering, UI, screens, and models in `Minecraft.Client/`; the dedicated server in `Minecraft.Server/`; the plugin host in `Minecraft.Server.FourKit/`.
3. **Rebuild** the affected target with CMake — Visual Studio 2022 natively on Windows, or `build-linux.sh` / the Nix flake to cross-compile Windows x64 binaries from Linux. See [Building & Compiling](/slop-docs/overview/building/).
4. **Distribute** the resulting `.zip` (client) or server runtime (see [Distribution channels](#distribution-channels)).

A few consequences fall out of this that are worth stating plainly:

| Consequence | Why |
|---|---|
| Client mods are not composable | Two forks that both edit `TileRenderer.cpp` must be merged by hand — there is no load-order or overlay system. |
| Distributing a client mod means distributing a whole build | You ship the full extracted game, not a patch file. Users run your `Minecraft.Client.exe`. |
| Assets are baked into archives | UI lives in Scaleform/SWF inside `Common/Media/MediaWindows64.arc`; changing it means rebuilding the `.arc` (see the `tools/` SWF/`.arc` patchers). |
| Server-side behavior *can* be extended without a fork | That is exactly what FourKit exists for. If your mod is server-only gameplay logic, prefer a FourKit plugin over a server fork. |

Files: `Minecraft.World/`, `Minecraft.Client/`, `Minecraft.Server/`, `Minecraft.Server.FourKit/`

## What upstream accepts vs what stays a personal mod

neoLegacy has a strict, published scope. Whether your change belongs upstream or stays a private fork is decided by two documents: the contribution policy (`CONTRIBUTING.md`) and the milestone order.

### The milestone policy

The project implements LCE content **as it existed at each Title Update, in original release order, starting from TU19** — nothing from a Title Update beyond the current milestone (`CONTRIBUTING.md:6-14`). Concretely, upstream **will not accept**:

- Blocks/items/mobs/mechanics from a Title Update not yet reached (e.g. TU27 content while the milestone is TU25).
- Java or Bedrock features that were not in LCE at the relevant milestone.
- Placeholder or stub content — a mob with no AI/drops, a block with no recipe.
- Content with **no reference point in any official LCE Title Update at all**.

Upstream **will accept**: faithful, complete implementations of the current milestone; bug fixes to already-shipped content; minimal, non-invasive QoL that preserves the LCE feel; asset-quality improvements that preserve content; and transparent platform/stability/performance work.

A change that is out-of-scope for the milestone isn't "rejected forever" — it's simply **your personal mod** until the project reaches that milestone. Anything genuinely non-LCE (custom blocks, Java-style features that never shipped on console) is *permanently* a personal fork; it will never be upstreamed by policy.

The bar for "complete" content is itself codified (`CONTRIBUTING.md:28-37`): correct worldgen/spawn, a real acquisition method, correct inventory + tooltip, correct drops, functional interactions with same-milestone content, and no crashes/soft-locks. If a feature can't meet that, upstream's rule is *don't ship it partially*.

### The no-LLM rule

> We currently do not accept any new code into the project that was written largely, entirely, or even noticeably by an LLM. All contributions should be made by humans that understand the codebase. — `CONTRIBUTING.md:46-47`

This is a hard gate on upstream contributions. It has no bearing on what you run privately, but a PR that reads as machine-generated will be closed.

### PR hygiene

PRs must be **single-topic** and fully document their file changes (`CONTRIBUTING.md:39-44`). A block plus its recipes, rendering, and inventory icon is one cohesive topic and is fine; a block plus unrelated mob-AI fixes plus an audio rework is not. Undocumented changes get the PR closed, and the PR template is expected to be filled out.

Files: `CONTRIBUTING.md`

## Distribution channels

How a finished build reaches players depends on whether it's the client or the dedicated server.

### Nightly zips (the primary channel)

Every push to `main` triggers `.github/workflows/nightly.yml`, which cross-compiles Windows x64 on Ubuntu (LLVM 21 + `xwin` + `.NET 10`), packages three artifacts, and publishes them to rolling release tags:

| Artifact | Contents | Release tag |
|---|---|---|
| `neoLegacyWindows64.zip` | The client. Extract, run `Minecraft.Client.exe`. | `Nightly` (name `Client: <sha7>`) |
| `neoLegacyServerWindows64.zip` | Vanilla dedicated server, no plugin support, smallest. | `Nightly-Server` |
| `neoLegacyServerWindows64-FourKit.zip` | Server + FourKit host, bundled .NET 10 runtime, empty `plugins/`. | `Nightly-Server` |

The nightly is a "fresh timestamp each build" rolling release, not versioned. The nightly client release body even ships end-user instructions: set a username via a `username.txt` file before launch, run on Steam Deck/Linux by adding `Minecraft.Client.exe` as a non-Steam game under Proton Experimental, and host online multiplayer through a playit.gg TCP tunnel (Local IP `127.0.0.1`, Local Port `25565`, Proxy Protocol `None`). LAN games are natively supported and auto-appear.

**Stable releases** are separate: pushing a change to the `BUMP` file (currently `1.0.9b`) triggers `stable.yml`, which reads the version from `BUMP` and the release body from `NOTES.md`, and publishes non-prerelease tags `v<version>` (client) and `v<version>-Dedicated-Server` (servers). If you fork and want your own release pipeline, this is the model to copy. See [Contributing & Releases](/slop-docs/overview/contributing/).

Files: `.github/workflows/nightly.yml`, `.github/workflows/stable.yml`, `BUMP`, `NOTES.md`

### LCE Emerald Launcher (current) and LC Launcher (upcoming)

For non-technical users, neoLegacy points at the **LCE Emerald Launcher** (`github.com/LCE-Hub/LCE-Emerald-Launcher`) — the badge in `README.md` and the download line in `NOTES.md` both link it. It fetches and runs the neoLegacy build without the user touching a `.zip`. `NOTES.md:24` additionally names an **upcoming LC Launcher** as a second launcher target ("or the upcoming LC Launcher"); as of `NOTES.md` for v1.0.9b it is not yet the primary channel.

If you fork, note that a launcher only knows how to fetch *known* release tags/repos — a personal fork's builds won't appear in Emerald Launcher unless the launcher is configured for your repo. Personal-mod distribution is realistically "hand someone your zip" or "point them at your fork's own nightly release."

Files: `README.md`, `NOTES.md`

### The GHCR server image

The dedicated server also has a prebuilt-image path: `docker-compose.dedicated-server.ghcr.yml` pulls `ghcr.io/itsrevela/lce-revelations-dedicated-server:nightly` (vanilla only — the FourKit image is intentionally not published because self-contained .NET 10 through Wine is unvalidated). A fork that changes server code has to build its own image; there is no per-fork GHCR wiring. See [Deployment](/slop-docs/server/deployment/).

Files: `docker-compose.dedicated-server.ghcr.yml`

## Keeping a mod branch synced (the `sync.yml` pattern)

A long-lived personal fork drifts from `main` quickly (the repo does ~hundreds of commits a month). neoLegacy solves this internally with `.github/workflows/sync.yml`, and the same pattern is the recommended way to keep a mod branch current.

`sync.yml` fires on every push to `main` and merges `main` into every long-running feature/experimental branch, **aborting on conflict** so a bad merge never lands unattended:

```yaml
git fetch --all
for branch in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/); do
  if [[ "$branch" == "origin/exp/"* || "$branch" == "origin/feat/"* || "$branch" == "origin/experimental" ]]; then
    local_branch="${branch#origin/}"
    git checkout -B "$local_branch" "$branch"
    if git merge origin/main --no-edit; then
      git push origin "$local_branch"
    else
      echo "Merge conflict in $local_branch"
      git merge --abort
    fi
  fi
done
```

The takeaways for a mod branch:

- **Name your branch to match a synced prefix** (`exp/*`, `feat/*`, or `experimental`) if you want upstream's own automation to keep it merged — those are the exact patterns `sync.yml` targets. Branches like `origin/guardians` and `origin/commands` exist but are *not* auto-synced. (**Changed in v1.1.0b:** `f32ce319` added `origin/TU*` to the filter, so `TU31`/`TU43`/any `TUxx` branch **is** now auto-synced — see [CI § sync.yml](/slop-docs/tools/ci/#syncyml--branch-sync).)
- **Conflicts are yours to resolve.** The workflow deliberately `--abort`s on conflict rather than committing a mangled merge; a conflicting mod branch just stops receiving syncs until a human fixes it.
- **Rebuild after every sync.** A merged-in change to a shared renderer or `Tile.h` can silently change codegen (`ItemNameMap.h` is generated from `Item.h`/`Tile.h`) — always rebuild the affected target, don't trust a stale exe.

If your fork is on GitHub or another host without this workflow, copy `sync.yml` into your fork, or run the equivalent `git merge origin/main` locally on a cadence.

Files: `.github/workflows/sync.yml`

## Network compatibility: `BUILD_NUMBER 570`

The single most important number for any mod that touches networking, and the rule that decides whether your build can still play with others.

`cmake/GenerateBuildVer.cmake` hardcodes:

```cmake
set(BUILD_NUMBER 570)
```

and sets `VER_NETWORK = VER_PRODUCTBUILD` from it. `BUILD_NUMBER` is the **network/protocol version**, and it is deliberately static — it was bumped to 570 once (`chore: bump network version to 570 (#78)`) and is meant to stay there so every neoLegacy build stays cross-compatible on the wire.

**The rule: a client and server (or two clients on LAN/P2P) can only talk if their `BUILD_NUMBER` matches.** So:

- A mod that changes *only* gameplay logic, blocks, textures, or UI and does **not** alter packet layout can keep `BUILD_NUMBER 570` — it stays cross-play compatible with vanilla neoLegacy and every other 570 build.
- A mod that changes the **packet format / netcode** (new fields, reordered packets, different serialization) is on the wire incompatible with vanilla. Such a mod *must* bump `BUILD_NUMBER` so incompatible builds refuse to connect instead of desyncing or crashing — the version mismatch is the safety gate.

This is why upstream treats 570 as sacred: bumping it partitions the network. If your personal mod bumps it, you have forked the network too — only other copies of your exact build can join you. Keep it at 570 unless you have genuinely changed the protocol.

`GenerateBuildVer.cmake` also embeds the git short SHA, branch, `owner/repo/branch`, and a `-dev` suffix if the tree is dirty into `generated/Common/BuildVer.h`; `include/Common/BuildVer.h` is a committed fallback so the tree compiles before codegen runs. None of those affect wire compatibility — only `BUILD_NUMBER` does.

Files: `cmake/GenerateBuildVer.cmake`, `include/Common/BuildVer.h`

## neoLegacy vs vanilla LCE

| Aspect | Vanilla LCE (TU19-era) | neoLegacy |
|---|---|---|
| Client mod loader | None (closed console binary) | None — mods are source patches you rebuild |
| Server-side extension | None (split-screen P2P, no dedicated server) | FourKit plugins on `Minecraft.Server.FourKit` |
| Distribution | Console store / disc | Nightly/stable `.zip`, Emerald Launcher, GHCR server image |
| Cross-play gate | Console title-update version | `BUILD_NUMBER 570` (static protocol version) |
| Contribution policy | N/A | Milestone-ordered parity, no-LLM, single-topic PRs |

For the server-side extension path in full, continue to [FourKit Plugins](/slop-docs/mods/fourkit-ecosystem/).

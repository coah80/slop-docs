---
title: How neoLegacy Backports
description: The milestone-ordered parity policy as an engineering method — donor sources, commit conventions, branch model, review culture, and the "complete content" bar.
---

neoLegacy exists to do one thing: **backport the newer Legacy Console Edition
Title Updates onto a TU19 base**, in the order LCE originally shipped them
(`README.md:3`, `CONTRIBUTING.md:2`). This page describes how that is done as an
engineering discipline — the rules, sources, and conventions that turn "port
TU31" into a stream of reviewable commits. It is derived from the actual commit
history and the project's own governance files, not from general Minecraft lore.

For worked examples of each idea here, see
[Backport Case Studies](/slop-docs/backporting/case-studies/). For a
step-by-step you can follow yourself, see the
[Backporting Workflow](/slop-docs/backporting/workflow/).

## The parity policy is the method

Everything starts from `CONTRIBUTING.md`. The scope is deliberately narrow:
implement LCE content **as it existed at each Title Update, in original release
order, starting from TU19** (`CONTRIBUTING.md:2-6`). That single rule drives
every downstream decision.

| Rule | Source | Consequence for a backport |
|------|--------|----------------------------|
| Milestone order, TU19 → forward | `CONTRIBUTING.md:6` | You may only add content from the *current* target TU (TU25, then TU31…). TU27 content is rejected while TU25 is the milestone. |
| Everything before TU25 is "already present" | `CONTRIBUTING.md:4` | Pre-TU25 blocks/items are not reimplemented unless genuinely buggy. |
| No cross-edition backdoors | `CONTRIBUTING.md:9` | No Java/Bedrock feature that LCE did not have at that milestone. Where behaviour is ambiguous, Java is used as a *reference* for parity (see below), not as a source of new content. |
| No stubs / placeholders | `CONTRIBUTING.md:10-11` | A mob with no AI/drops, or a block with no recipe, is not mergeable. |
| Behavioural fidelity to the original build | `CONTRIBUTING.md:12` | The port must match how the feature worked in the real LCE build at that milestone. |

The roadmap tracks this as a percentage: **TU25 is 100% complete**, **TU31 is
97.01% complete** (`README.md:11-12`). The milestone number *is* the project's
definition of done for that batch.

### The "complete content" bar

A feature is not a backport until it clears the completeness checklist
(`CONTRIBUTING.md:28-37`). This is the acceptance test every case study is judged
against:

- Correct **world generation / spawn** presence where applicable.
- Proper **crafting recipe(s) or acquisition** method.
- Correct **inventory and tooltip** representation.
- Correct **drops** on destruction or death.
- **Functional interactions** with other content at the same milestone.
- **No crashes, soft-locks, or game-breaking bugs** introduced.

> "If a feature cannot be implemented fully yet, it should not be implemented at
> all until it can be." — `CONTRIBUTING.md:37`

In practice a single "feat" commit rarely clears the whole bar at once; the bar
is cleared by the *feat + its fix chain*. The
[slime block case study](/slop-docs/backporting/case-studies/#1-slime-block) is
the canonical example: `feat: slime block` was followed by five fix commits that
added the recipe, piston push behaviour, render priority, and damage properties
before the block met the completeness definition.

## Donor sources

neoLegacy does not decompile everything from scratch. It sits on top of a chain
of prior LCE reconstruction projects and pulls implementations from them
(`README.md:19-26`). Knowing which donor a feature comes from tells you where to
look for the reference implementation.

| Donor | What it provides | Cited by |
|-------|------------------|----------|
| **itsRevela / LCE-Revelations** | The stable base neoLegacy continues from. The FourKit port doc notes hooks were applied *to the LCE-Revelations base*. | `README.md:22`, `docs/FOURKIT_PARITY.md:5` |
| **Patoke / LCERenewed** | Patches that required *deep decompilation* — the hard, low-level reconstructions. | `README.md:21` |
| **GabsPuNs / Project-Zenith** | Donated the **Classic Crafting** feature implementation wholesale. | `README.md:23` |
| **Java Edition** | Used as the **parity reference for worldgen** — "changed world generation according to java" (commit `720e1a77`). Not a content source; a behavioural yardstick. | `NOTES.md:11`, commit `720e1a77` |
| Decomps (in-repo) | Some features land straight "from decomp" — e.g. `383302eb feat: armorstand from decomp`. | commit log |

The lineage is visible in the author list: `itsRevela`/`Revela` is the #2
committer, and the classic-crafting merge `05d7ccb6 feat(TU31): classic crafting
(#48)` carries `credits: comicgab` and adds the Project-Zenith
`IUIScene_ClassicCraftingMenu` files verbatim. See
[classic crafting](/slop-docs/backporting/case-studies/#5-classic-crafting-a-donated-feature).

### Human-only contributions

`CONTRIBUTING.md:46-47` is explicit: **no code written largely, entirely, or even
noticeably by an LLM is accepted.** Every contributor is expected to understand
the codebase. This is a hard gate on *how* a backport may be produced, not just
*what* it contains.

## Commit conventions

The history follows a Conventional-Commits-style prefix scheme. Across the most
recent ~400 commits the distribution is roughly:

| Prefix | Meaning | Approx. share (recent 400) |
|--------|---------|-----------|
| `fix:` / `Fix:` | bug fix, usually part of a feature's fix chain | most common (~140) |
| `Merge` | branch merge (many auto-generated by `sync.yml`) | ~57 |
| `chore:` | releases, version bumps, housekeeping | ~46 |
| `feat:` | new content, no TU tag | ~43 |
| `feat(TU31):` | new content scoped to a target milestone | ~11 |
| `fix(TU31):` | fix scoped to a milestone feature | ~4 |
| `refactor:` / `docs:` / `perf:` | supporting work | a handful each |

The `feat(TUxx):` / `fix(TUxx):` scope is the load-bearing convention for this
project: it tags a commit with the milestone it belongs to, which is how the
parity policy is enforced at the log level. Examples straight from the log:

```
2a86a939 feat(TU31): add Depth Strider enchantment
a51d7ae8 feat(TU31): barrier block.
dc5ad7aa feat(TU31): added craft recipes for andesite, diorite and granite (and polished) blocks (#97)
05d7ccb6 feat(TU31): classic crafting (#48)
e176a9f5 fix(TU31): fix podzol down face texture (#71)
1cd3f977 fix(TU31): prismarine animation (#134)
```

Plain `feat:` is used for content whose milestone is obvious or already implied
by context (`05c14bc0 feat: slime block`, `383302eb feat: armorstand from
decomp`). Releases are `chore:` (`4b93dbee chore: release v1.0.8b (#143)`,
`80c1ac8d chore: bump version number to 1.0.9b`). Merged PRs carry the `(#nn)`
number so a commit traces back to its review thread.

## Branch model

The default branch is `main`. Alongside it the remote carries a set of
long-running feature and experimental branches (`git branch -a`):

| Branch | Purpose |
|--------|---------|
| `main` | integration / release branch |
| `TU43` | work already started beyond the stated TU31 milestone (`37cd6215 TU43 Release 1`) |
| `exp/worldgen` | long-running worldgen experiments |
| `experimental` | general experimental staging |
| `feat/minigames` | in-progress feature branch |
| `guardians`, `commands`, `dbgRT`, `simpleKeyBind-modifier` | topic branches |

### `sync.yml` — auto-merge of `main` into feature branches

The key piece of automation is `.github/workflows/sync.yml`. On every push to
`main`, a GitHub Action iterates every remote branch and, **for branches named
`exp/*`, `feat/*`, or `experimental`**, merges `origin/main` into them and pushes
the result:

```yaml
# .github/workflows/sync.yml
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

This is why the history is full of `Merge origin/main` commits authored by
`github-actions` — long-lived branches never drift far from `main`, and conflicts
that can't auto-resolve are simply aborted (left for a human). The branch-naming
convention (`exp/`, `feat/`, `experimental`) is therefore functional, not
cosmetic: naming a branch this way opts it into automatic upstream syncing.

## Release cadence — the nightly model

The primary user download is a **Nightly** `.zip` build (`README.md:16-17`). CI
in `.github/workflows/` splits into:

| Workflow | Role |
|----------|------|
| `nightly.yml` | nightly build artifacts (the default download) |
| `stable.yml` | tagged stable releases |
| `pull-request.yml` | PR validation |
| `sync.yml` | the auto-merge described above |

Stable releases are cut per feature batch as tags `v1.0.0b … v1.0.9b` (each with
a matching `-Dedicated-Server` tag), plus a rolling `Stable` tag. The current
version is **1.0.9b** (`BUMP`). Backports flow: land on a feature/exp branch or
directly via PR to `main` → ride nightly → get folded into the next `chore:
release vX.Y.Zb` stable tag.

## PR review culture

Contribution rules (`CONTRIBUTING.md:39-44`) shape what a mergeable backport PR
looks like:

- **Single-topic PRs.** A PR that implements a new block *plus* unrelated mob-AI
  fixes *plus* an audio rework is rejected as unreviewable. But a block *with its
  recipes, world rendering, and inventory icons* is one cohesive topic and is
  accepted (`CONTRIBUTING.md:41-43`). This is why case-study commits touch a
  tightly related fan of files and nothing else.
- **Fully documented file changes.** "If your PR includes any undocumented
  changes it will be closed." (`CONTRIBUTING.md:44`)
- **PR template required.** Wiping the template to write minimal info gets a PR
  closed (`CONTRIBUTING.md:50-51`).
- **`(#nn)` traceability.** Merged feature commits keep their PR number, so any
  block in the game traces to a review thread.

The observable effect on the log: features arrive as a focused `feat` commit
whose diff is *exactly* the surface the feature needs — a new `*Tile.cpp/.h`
pair, its registration line in `Tile.cpp`, its strings in `stringsGeneric.xml`,
its recipe, and its renderer — and nothing else. Anything that turns out to be
missing arrives later as a scoped `fix:` commit rather than being crammed into
the original PR.

## What this looks like end to end

Putting it together, a neoLegacy backport is:

1. A feature drawn from the **current milestone** (`CONTRIBUTING.md`) — never
   ahead of it.
2. Sourced from a **known donor** (LCE-Revelations base, LCERenewed decomp,
   Project-Zenith donation) or decompiled, with **Java as a parity reference**
   for worldgen only.
3. Written **by a human** who understands the codebase (`CONTRIBUTING.md:46`).
4. Landed as a **single-topic, `feat(TUxx):`-tagged** commit/PR that touches only
   the feature's own files.
5. Brought to the **completeness bar** (`CONTRIBUTING.md:28-37`) by a following
   **`fix:` chain**.
6. Carried to users through the **nightly build**, then folded into the next
   **`chore: release`** stable tag.

The next page walks five real backports through exactly this arc.

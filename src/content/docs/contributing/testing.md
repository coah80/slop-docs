---
title: Testing Your Changes
description: neoLegacy has no unit-test suite — verification is manual and empirical. Here's what the project actually does to check a change.
---

Be honest with yourself up front: **neoLegacy has no automated test suite.**
There is no `ctest`, no unit tests, no integration harness. Verification is
**manual and empirical** — you build the game, you play it, and you watch for
regressions against the [completeness
bar](/slop-docs/backporting/overview/#the-complete-content-bar). The only
automation is a build gate in CI (does it *compile*?) and two optional
load-testing tools for the server. This page describes what maintainers actually
do so your PR survives review.

## What CI does — and doesn't — check

The pull-request workflow (`.github/workflows/pull-request.yml`) is a **build
gate, not a test suite.** On every push to a PR (`opened`, `reopened`,
`synchronize`) it:

1. Installs LLVM 21, Wine, xwin, cmake, ninja, and .NET `10.0.x`.
2. Runs `./build-linux.sh . Debug` — a **Debug** cross build — pinned to 2 cores
   (`CMAKE_BUILD_PARALLEL_LEVEL=2`, `taskset -c 2-3`).

It **ignores** PRs that only touch `.gitignore`, `*.md`, or `.github/*.md`
(`paths-ignore`). A green check means one thing only: **your code compiles on the
cross toolchain.** It does not run the game, does not load a world, does not
verify any behaviour. Everything below is on you and the reviewer.

## Build both Debug and Release

Build configurations diverge — the client "is missing some debug features" in
Release (`README.md`), and cross Debug builds go through a special CRT
compatibility path (`LCE_XWIN_CROSS_DEBUG_COMPAT`, see [Building &
Compiling](/slop-docs/overview/building/#common-pitfalls)). A change can compile
and run in one config and break in the other. Build **both**:

```bash
./build-linux.sh . Debug
./build-linux.sh . Release
```

or the equivalent Windows64 - Debug / Windows64 - Release presets in Visual
Studio. Verify your feature in Debug (extra diagnostics) *and* confirm it still
works in the Release build users actually download.

## In-game verification against "complete content"

This is the core of neoLegacy testing. A feature is not merge-ready until it
clears every clause of the completeness definition (`CONTRIBUTING.md`) — and the
only way to check those clauses is to play. Walk each one in a running client:

- [ ] **Worldgen / spawn** — the block/mob/structure actually generates or
      spawns where it should. Fly around, use a fresh seed, check the right
      biome.
- [ ] **Crafting / acquisition** — the recipe works and the item is reachable in
      survival (or is correctly creative-only for admin blocks like the barrier).
- [ ] **Inventory + tooltip** — the creative-menu entry, the item name, and the
      hover tooltip all render.
- [ ] **Drops** — destroying the block / killing the mob drops the correct items.
- [ ] **Interactions** — same-milestone content behaves together (pistons for
      slime, water for depth strider, chests/loot for structures).
- [ ] **No crashes / soft-locks** — the single most important clause.

This checklist is the same one the [Backporting
Workflow](/slop-docs/backporting/workflow/#step-5--test-against-the-completeness-definition)
walks through. If you can't check a clause because the feature isn't finished,
the feature isn't ready — "if a feature cannot be implemented fully yet, it
should not be implemented at all until it can be" (`CONTRIBUTING.md`).

## Tutorial-world regression testing

The tutorial world is a recurring crash source, so it deserves its own explicit
check. The history is full of tutorial-world fixes — `fix: tu31 tutorial world
crashes`, `fix: tutorial world`, `fix: tutorial`, `fix: item frames in tutorial
+ non-ugc worlds`, and a `feat: TU19 tutorial world` origin — because the
tutorial level exercises a fixed, hand-authored world that trips over content
changes in ways a random world doesn't.

**After any content or worldgen change, load the tutorial world and confirm it
doesn't crash.** It's a cheap, high-signal regression test that has caught real
bugs repeatedly. Test non-UGC worlds too, per the item-frame fix above.

## Dedicated-server smoke test

If your change touches anything the server runs — entities, worldgen, netcode,
save/load — smoke-test the **dedicated server**, not just the client. Build the
`Minecraft.Server` target (or `Minecraft.Server.FourKit` for plugin paths; see
[Deployment](/slop-docs/server/deployment/)), start it, connect a client, and
confirm the world generates, players join, and it survives a save cycle. The
server has its own crash surface — several history commits are server-only fixes,
and the TU43 structures drop included "several server fixes."

For a scripted local server there are helper scripts in the tree
(`start-dedicated-server.sh`, `build-start-dedicated-server.sh`, and the
`docker-compose.dedicated-server*.yml` files).

## Load testing — the stress-test bot swarm

For changes to connection handling, the player list, movement validation, or
thread-safety-sensitive server paths, drive `tools/stress-test/`. It's a Python
bot swarm that rapidly connects/disconnects real protocol clients to shake out
races (player-list add/remove, socket-write-during-disconnect, the "moved
wrongly" movement check, concurrent join/leave bursts):

```bash
python stress_test.py 127.0.0.1 19132 --bots 12 --hold 0.5 2 --ramp 0.2
```

Full option reference and the `.bat` presets (including the FourKit-specific
soak tests) are in [Performance & Stress
Testing](/slop-docs/tools/testing/#toolsstress-test--the-bot-swarm). Use this
when your change *could* introduce a race — it's the closest thing the project
has to an integration test.

## Performance-sensitive changes — the performance monitor

If your change is in a hot path (the tick loop, entity ticking, chunk handling,
autosave), profile it with `tools/performance-monitor/`. It injects a C++ DLL
into the running `Minecraft.Server.exe`, hooks `MinecraftServer::tick()`, times
each tick phase, and streams the data to a PySide6 GUI that breaks down
tick-phase timing, entity/chunk counts, memory, and lag-spike root causes. Take
a baseline before your change and compare after — regressions in `entityTickUs`,
`levelTickUs`, or autosave `flushUs` show up immediately.

See [Performance & Stress
Testing](/slop-docs/tools/testing/#toolsperformance-monitor--live-server-instrumentation)
for setup, the injection technique, and the full tick-phase field reference.

## Honest framing

There is no green "tests pass" to hide behind here. Verification is you, a
build, and the game — repeated across Debug and Release, the tutorial world, and
(where relevant) a dedicated server under bot load. The CI only proves it
compiles. The completeness bar is enforced by review and by playing, not by a
test runner. Budget time for the manual pass; it's the actual quality gate.

## See also

- [Getting Started](/slop-docs/contributing/getting-started/) — the PR CI and
  lifecycle.
- [Building & Compiling](/slop-docs/overview/building/) — Debug vs Release, the
  cross toolchain.
- [Backporting Workflow — Step 5](/slop-docs/backporting/workflow/#step-5--test-against-the-completeness-definition)
  — the completeness checklist in context.
- [Performance & Stress Testing](/slop-docs/tools/testing/) — the two server
  load/profiling tools.

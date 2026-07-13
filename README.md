# Slop Docs — neoLegacy Documentation

**Live site: https://coah80.github.io/slop-docs/**

AI-generated documentation for [neoLegacy](https://git.neolegacy.dev/coah80/neoLegacy) — the community continuation of Minecraft Legacy Console Edition that backports newer Title Updates onto the TU19 base (TU25 done, TU31 ~97%, TU43 landing).

An AI went through all ~13,000 source files across dozens of analysis passes, then adversarially fact-checked its own output claim-by-claim against the code. It's still AI-written, so if anything is wrong, PR the page — that's the deal.

> These docs were previously for the old LCE decomp (LCEMP / MinecraftConsoles). That version lives in this repo's git history; everything current is neoLegacy, top to bottom.

## What's documented

- **Architecture** — the four CMake targets (`Minecraft.World`, `Minecraft.Client`, `Minecraft.Server`, `Minecraft.Server.FourKit`), bootstrap chain, and the two GUI stacks
- **Minecraft.World** — every subsystem: blocks (tiles), items, entities, AI, worldgen, biomes, structures, enchantments, potions, crafting, redstone, packets, save format, game rules
- **Minecraft.Client** — rendering pipeline, entity renderers/models, particles, the live UIScene/Iggy UI system, input, texture packs, audio, client networking
- **Platform code** — Windows64 (the one that builds) plus the Xbox 360/One, PS3/PS4/Vita trees and their honest build status
- **Dedicated server** — a capability LCE never had: architecture, `server.properties`, console CLI, docker/nix deployment
- **FourKit** — the C# server plugin system: architecture, writing plugins, full event reference
- **neoLegacy features** — TU25/TU31 backport catalogs, neoLegacy-original additions, version history
- **Backporting guide** — how the team actually backports, reverse-engineered from commit history, with commit-by-commit case studies (slime block → the TU43 template-XML era)
- **Modding guide** — 20 step-by-step guides with worked examples modeled on real features
- **Mod templates** — 7 complete copy-paste mods (ore + tools, custom mob, dimension, workbench, and more)
- **Contributing** — practical onboarding, code style, and how changes get verified
- **Reference** — exhaustive ID registries: blocks, items, entities, packets, enchantments/effects, server properties, FourKit events, tile classes, console enums, file index

## Version basis

Pages are verified against neoLegacy commit `47e5cba3` (v1.0.9b), with **"Changed in v1.1.0b"** notes wherever newer upstream work moved things. The docs re-sync against upstream on an ongoing basis.

## Built with

- [Astro Starlight](https://starlight.astro.build/)
- Source analyzed: [neoLegacy](https://git.neolegacy.dev/coah80/neoLegacy) (`git.neolegacy.dev`), lineage: LCE-Revelations → neoLegacy

## Contributing

Found something wrong? PR the page. The AI audits its own claims against the source on a recurring loop, but it will never be smarter than someone who actually read the code — corrections welcome.

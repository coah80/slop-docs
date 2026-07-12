---
title: Backport Case Studies
description: Commit-by-commit anatomy of five real neoLegacy backports — slime block, barrier block, depth strider, Java-parity worldgen, and the donated classic crafting menu.
---

This page dissects five real backports from the neoLegacy history, at four
different scales — from a single block to a 3,349-line worldgen overhaul to a
wholesale donated UI. Each one is traced through its actual commits so you can
see *what files were touched and why*, and *how the feature was iterated to the
completeness bar* after the initial `feat` commit.

Background on the conventions used below is in
[How neoLegacy Backports](/slop-docs/backporting/overview/). To reproduce this
process yourself, see the [Backporting Workflow](/slop-docs/backporting/workflow/).

All hashes, file lists, and line counts are read from `git show` /
`git show --stat` in the repository.

---

## 1. Slime block

**Scale:** one block, but with cross-cutting physics. **Milestone:** TU31.
**Author:** Fireblade.

The slime block is the model example of how a neoLegacy feature reaches the
[completeness bar](/slop-docs/backporting/overview/#the-complete-content-bar) not
in one commit but across a *fix chain*.

### The feature commit — `05c14bc0 feat: slime block`

`git show --stat` shows a diff that fans across exactly the surface a
bouncing/pushing block needs, and no further:

| File | Why it was touched |
|------|--------------------|
| `Minecraft.World/SlimeTile.{cpp,h}` | new block class (93 + 21 lines) |
| `Minecraft.World/Tile.cpp` / `Tile.h` | registration: new static pointer, `SOUND_SLIME`, `slime_Id` |
| `Minecraft.World/Material.h` | new `PUSH_SLIME` push-reaction constant |
| `Minecraft.World/PistonBaseTile.cpp` (+109) | sticky-piston push-chain logic for slime |
| `Minecraft.World/PistonPieceEntity.cpp` | moving-piece behaviour |
| `Minecraft.Client/TileRenderer.cpp` (+150) / `.h` | translucent render shape |
| `Minecraft.Client/PistonPieceRenderer.cpp` | render pushed slime blocks |
| `Minecraft.Client/Chunk.cpp` | render-layer bookkeeping |
| `Minecraft.Client/Common/UI/IUIScene_CreativeMenu.cpp` | creative-menu entry |
| `…/Windows64Media/loc/stringsGeneric.xml` (+8) | name + tooltip strings |
| ~20 `*Tile.cpp` files | one-line `getPistonPushReaction()` overrides so every existing block reports its push reaction to the new slime push logic |

The registration is the standard fluent-builder idiom, added in
`Tile::staticCtor()` at ID 165:

```cpp
Tile::slimeBlock = (new SlimeTile(165))
    ->setSoundType(SOUND_SLIME)
    ->setIconName(L"slime")
    ->setDescriptionId(IDS_TILE_SLIME_BLOCK)
    ->setUseDescriptionId(IDS_DESC_SLIME_BLOCK)
    ->disableMipmap();
```

`SlimeTile` subclasses `HalfTransparentTile` and overrides the physics hooks —
`getPistonPushReaction()` returns `Material::PUSH_SLIME`, and `fallOn` implements
the bounce (reflect `entity->yd`, damp non-living entities by 0.8, zero
`fallDistance`). The strings diff adds both the item name and the
mechanically-accurate tooltip:

```xml
<data name="IDS_DESC_SLIME_BLOCK">
    <value>Causes players and mobs to bounce when they jump on it.</value>
</data>
<data name="IDS_TILE_SLIME_BLOCK">
    <value>Slime Block</value>
</data>
```

At this point the block exists and bounces — but it is **not yet complete**: it
has no recipe and its piston interactions are unfinished.

### The fix chain

Five follow-up commits bring it to the completeness bar:

| Commit | What it fixed | Key files |
|--------|---------------|-----------|
| `85112485 fix: slime block` ("now craftable + pushable") | added the 9× slimeball → slime block recipe and reworked piston push | `OreRecipies.cpp` (+3), `PistonBaseTile.cpp` (+91), `ItemRenderer.cpp` |
| `e2b81cae fix: slime block inaccurate damage properties + weird ui stuff` | fall-damage nullification correctness | `SlimeTile.cpp`, `Entity.{cpp,h}` (+27), `LivingEntity.cpp` |
| `e8b66c62 fix: slime block render priority` ("thanks to Tranq for calling it out") | translucent draw order vs stained glass | `Chunk.cpp`, `LevelRenderer.cpp`, `GameRenderer.cpp`, `StainedGlassBlock.cpp` |
| `ab6e232d fix: slime block piston reaction(s)` | remaining sticky-push edge cases | `PistonBaseTile.cpp` (+54) |
| `1f2e82c0 fix: sunflower + slime block` | shared cleanup with another feature | — |

The recipe that finally makes the block *acquirable* (a completeness-bar
requirement) is one `ADD_OBJECT` pair in `OreRecipies::_init()`:

```cpp
ADD_OBJECT(map[8], Tile::slimeBlock);
ADD_OBJECT(map[8], new ItemInstance(Item::slimeBall, 9));
```

**Lesson:** the `feat` commit establishes the block and its riskiest system
(piston push); the `fix:` chain closes the recipe, drops, render-order, and
damage-property gaps that the completeness definition requires.

Reference: [Slime block](/slop-docs/world/redstone/) interactions;
[Tiles](/slop-docs/world/blocks/) registration.

---

## 2. Barrier block

**Scale:** one block + one client particle. **Milestone:** TU31.
**Authors:** Fireblade (implementation), piebot (merge).

The barrier shows the **two-commit merge model**: a contributor's feature commit
and a maintainer's merge commit carrying the same diff.

### The commits

- `950de854 feat: barrier block` (Fireblade) — the implementation, with a
  `todo: deprecate *.col file usage` note.
- `a51d7ae8 feat(TU31): barrier block.` (piebot) — the **merge commit**
  (parents `afb7bf43` + `950de854`) that lands it on `main` with the TU-scoped
  message.

Both carry the identical 22-file, +325/−12 diff.

### What was touched and why

| File | Why |
|------|-----|
| `Minecraft.World/BarrierTile.{cpp,h}` | new block (31 + 17 lines) — invisible, indestructible, non-cube |
| `Minecraft.World/Tile.cpp` / `Tile.h` | registration at ID 166 |
| `Minecraft.World/Class.h`, `ParticleTypes.h` | new `eType_BARRIERPARTICLE` type + particle-type id |
| `Minecraft.Client/BarrierParticle.{cpp,h}` | new client particle (80 + 23 lines) — the red "no entry" icon shown when holding a barrier |
| `Minecraft.Client/LevelRenderer.{cpp,h}` (+85 / +10) | `doBarrierParticles(...)` — emit particles around nearby barriers while the player holds one |
| `…/HTMLColours.xml` (+44) | colour table entries |
| `PreStitchedTextureMap.cpp`, `TileRenderer.cpp`, `ItemRenderer.cpp`, `ItemInHandRenderer.cpp` | texture/render wiring |
| `…/loc/stringsGeneric.xml` (+8) | name + tooltip |

The block class is deliberately spare — a barrier's entire behaviour is "render
nothing, drop nothing, can't be mined":

```cpp
BarrierTile::BarrierTile(int id, Material *material, bool allowSame)
    : HalfTransparentTile(id, L"barrier", material, allowSame) {}

int  BarrierTile::getResourceCount(Random *random) { return 0; }  // no drops
int  BarrierTile::getRenderLayer()                 { return 0; }
bool BarrierTile::isSolidRender()                  { return false; }
bool BarrierTile::isCubeShaped()                   { return false; }
bool BarrierTile::isSilkTouchable()                { return false; }  // can't be collected
```

Registration marks it indestructible and blast-proof, and opts it out of
statistics tracking (a barrier is an admin block, not a survival one):

```cpp
Tile::barrier = (new BarrierTile(166, Material::stone, false))
    ->setIndestructible()->setExplodeable(6000000)
    ->setSoundType(Tile::SOUND_STONE)->setIconName(L"barrier")
    ->setDescriptionId(IDS_TILE_BARRIER)->setNotCollectStatistics()
    ->setUseDescriptionId(IDS_DESC_BARRIER);
```

### The interesting half: `BarrierParticle`

The barrier's visual feedback is a whole client subsystem the base game didn't
have. `BarrierParticle` subclasses `Particle` and reports its own
`eType_BARRIERPARTICLE`; `LevelRenderer::doBarrierParticles(x,y,z)` is called
from `LevelRenderer::tick()` around the player when they hold a barrier item:

```cpp
// LevelRenderer::tick()
if (mc && mc->player)
    doBarrierParticles(mc->player->x, mc->player->y, mc->player->z);
```

**Lesson:** even a "one block" backport can require a new *client-side* type
(a particle, its type id, and a renderer hook) to hit the completeness bar's
"correct inventory/interaction representation" — the block logic is the small
part.

Reference: [Blocks (Tiles)](/slop-docs/world/blocks/).

---

## 3. Depth Strider enchantment

**Scale:** one enchantment touching movement physics + the FourKit C# API.
**Milestone:** TU31. **Author:** George V. (merge by piebot).

### The commits

- `2a86a939 feat(TU31): add Depth Strider enchantment` — the implementation.
- `1566d4c6 feat(TU31): depth strider!` — the merge commit (parents `e776c55a` +
  `2a86a939`) carrying the same 11-file, +110/−8 diff.

### What was touched and why

Note the class name: LCE calls this enchantment **Water Walker**, so the C++
class is `WaterWalkerEnchantment`, not `DepthStriderEnchantment`. The FourKit
(C# plugin) side, however, uses the modern name.

| File | Why |
|------|-----|
| `Minecraft.World/WaterWalkerEnchantment.{cpp,h}` | new enchantment (21 + 13 lines) |
| `Minecraft.World/Enchantment.{cpp,h}` | register `waterWalker` at ID 8, `FREQ_RARE` |
| `Minecraft.World/EnchantmentHelper.{cpp,h}` | `getWaterWalker(source)` accessor |
| `Minecraft.World/LivingEntity.cpp` (+35/−8) | apply the speed/friction bonus inside `travel()` |
| `Minecraft.Server.FourKit/Enchantments/DepthStriderEnchantment.cs` (+26) | C# plugin-API surface for the enchantment |
| `Minecraft.Server.FourKit/Enchantments/Enchantment.cs` | register it in the managed enum |
| `…/loc/stringsGeneric.xml` (+4) | name string |

The enchantment class is tiny — it defines only its category and cost curve
(`armor_feet`, max level 3):

```cpp
WaterWalkerEnchantment::WaterWalkerEnchantment(int id, int frequency)
    : Enchantment(id, frequency, EnchantmentCategory::armor_feet) {
    setDescriptionId(IDS_ENCHANTMENT_WATER_WALKER);
}
int WaterWalkerEnchantment::getMinCost(int level) { return 1 + (level - 1) * 10; }
int WaterWalkerEnchantment::getMaxCost(int level) { return getMinCost(level) + 15; }
int WaterWalkerEnchantment::getMaxLevel()         { return 3; }
```

Registration slots it in beside the other armour enchantments in
`Enchantment::staticCtor()`:

```cpp
waterWorker = new WaterWorkerEnchantment(6, FREQ_RARE);
waterWalker = new WaterWalkerEnchantment(8, FREQ_RARE);   // depth strider
thorns      = new ThornsEnchantment(7, FREQ_VERY_RARE);
```

### The real work: `LivingEntity::travel()`

The mechanic lives in the water branch of `LivingEntity::travel()`. The original
code moved with a fixed `0.8` friction and a fixed water speed; the backport
reads the enchantment level (clamped to 3, halved while airborne) and
interpolates both friction and speed toward the on-land values:

```cpp
int waterWalkerLever = EnchantmentHelper::getWaterWalker(
    dynamic_pointer_cast<LivingEntity>(shared_from_this()));
if (waterWalkerLever > 3) waterWalkerLever = 3;

float waterFriction = 0.8f;
float waterSpeed    = useNewAi() ? 0.04f : 0.02f;
if (!onGround) waterWalkerLever *= 0.5f;

if (waterWalkerLever > 0) {
    waterFriction += (0.5f - waterFriction) * waterWalkerLever / 3.0f;
    waterSpeed    += (getSpeed() * 1.0f - waterSpeed) * waterWalkerLever / 3.0f;
}
moveRelative(xa, ya, waterSpeed);
move(xd, yd, zd);
xd *= waterFriction;  yd *= 0.8;  zd *= waterFriction;  yd -= 0.02;
```

**Lesson:** an enchantment backport is not "add a class" — the class is trivial.
The substance is (a) finding the exact physics site to modify, (b) preserving the
old behaviour when the level is 0, and (c) mirroring the addition onto the
**FourKit C# API** so plugins can see the new enchantment.

Reference: [Enchantments](/slop-docs/world/enchantments/);
[FourKit](/slop-docs/server/fourkit/) and its
[plugin API](/slop-docs/server/fourkit-plugins/).

---

## 4. Java-parity worldgen overhaul

**Scale:** the largest single backport in the history — 57 files, +3,349/−330.
**Milestone:** TU31. **Author:** Lord_Cambion.

### The commit — `720e1a77`

One commit with a four-line message documenting four distinct pieces of work:

```
feat: oceanMonument
feat: Mesa biomes
feat: changed world generation according to java
fix: swamp hut changed to spruce
```

This is the concrete evidence behind `NOTES.md:11` — "World gen has now been
altered in order to match significantly more with Java." Java Edition is used
here purely as a **parity reference**: the goal is to make LCE's layered biome
pipeline behave like Java's, not to import Java content.

### New files (the additive part)

| New file(s) | Feature |
|-------------|---------|
| `MesaBiome.{cpp,h}` (296 + 62) | Mesa/badlands biomes |
| `OceanMonumentFeature.{cpp,h}` (142 + 52) | ocean monument structure |
| `OceanMonumentPieces.{cpp,h}` (1660 + 287) | every monument room/piece — the single biggest file in the diff |
| `DeepOceanLayer.{cpp,h}` (63 + 11) | deep-ocean gen layer |
| `RareBiomeLayer.{cpp,h}` (42 + 11) | rare/mutated biome placement |
| `RemoveTooMuchOceanLayer.{cpp,h}` (40 + 11) | ocean-ratio correction layer |

### Modified files (the parity part)

| Modified file | Change |
|---------------|--------|
| `Biome.cpp` (+215) / `Biome.h` | new biome table entries + spawn/decorator data |
| `BiomeInitLayer.cpp` (+154) / `.h` | Java-shaped biome-seeding: separate desert/temperate/cool biome arrays with weighted picks, and a rare-bit flag to swap plains → sunflower plains |
| `RegionHillsLayer.cpp` (+161) | hills/mutated placement matching Java |
| `RandomLevelSource.cpp` (+136) | terrain-shape changes |
| `StructureFeatureIO.{cpp,h}` | register the ocean-monument structure type |
| `ShoreLayer.cpp`, `Layer.cpp`, `ChunkPrimer.cpp`, `Dimension.cpp`, `CustomLevelSource.cpp` | pipeline plumbing |
| `ScatteredFeaturePieces.cpp` | the swamp-hut fix (below) |

`BiomeInitLayer` is the heart of the parity work. The pre-existing code used a
single flat 14-biome array with a defensive comment about avoiding null crashes;
the backport replaces it with Java-style *weighted category arrays*:

```cpp
// desert biomes (Java: desert 30, savanna 20, plains 10  -> total 60)
desertBiomes = BiomeArray(6);
// ...
// RareBiomeLayer encodes a flag by setting k = plains->id + 128
// When rareBit is set and we would pick plains -> pick sunflowersPlains
```

### The `fix:` folded into the same commit

The `fix: swamp hut changed to spruce` line corrects the swamp-hut (witch hut)
build material. In `ScatteredFeaturePieces::SwamplandHut::postProcess`, every
`generateBox(...)` call that placed dark-oak wood is changed to spruce, matching
the correct LCE appearance:

```cpp
// before
generateBox(level, chunkBB, 1,1,1, 5,1,7, Tile::wood_Id, TreeTile::DARK_TRUNK, ...);
// after
generateBox(level, chunkBB, 1,1,1, 5,1,7, Tile::wood_Id, TreeTile::SPRUCE_TRUNK, ...);
```

**Lesson:** worldgen backports are the exception to the strict single-topic PR
rule *within reason* — this commit bundles four related worldgen changes because
they share the biome/structure pipeline and are one cohesive topic
(`CONTRIBUTING.md:41`). It also shows the donor-source policy in action: brand-new
*structures* (monument, mesa) are additive files, while the "match Java" work is
surgical edits to existing layer classes.

Reference: [World generation](/slop-docs/world/worldgen/);
[Biomes](/slop-docs/world/biomes/); [Structures](/slop-docs/world/structures/).

---

## 5. Classic crafting — a donated feature

**Scale:** a whole UI subsystem, donated wholesale. **Milestone:** TU31.
**Author:** SevenToaster509 (integrating a Project-Zenith donation).

### The commit — `05d7ccb6 feat(TU31): classic crafting (#48)`

The commit body is two words: `credits: comicgab`. This is the
[Project-Zenith donation](/slop-docs/backporting/overview/#donor-sources) named
in `README.md:23`. The diff is 32 files, +819/−186, and it is an *integration*
job rather than a from-scratch implementation.

### What was touched and why

| File(s) | Why |
|---------|-----|
| `…/Common/UI/IUIScene_ClassicCraftingMenu.{cpp,h}` (129 + 10) | the donated Flash-UI scene controller |
| `…/Common/UI/UIScene_ClassicCraftingMenu.{cpp,h}` (222 + 38) | the donated menu logic |
| `…/MediaWindows64/ClassicCraftingMenu720.swf`, `ClassicCraftingMenuSplit720.swf` | new Flash menu assets (single + split-screen) |
| `InventoryMenu{480,720,1080}.swf` | reworked inventory menus that now route to classic crafting |
| `…/Common/UI/IUIScene_InventoryMenu.cpp` (+219/−…), `UIScene_InventoryMenu.{cpp,h}` | inventory menu rework to host the new flow |
| `SettingsUIMenu{480,720,1080}.swf`, `UIScene_SettingsUIMenu.{cpp,h}` | widened settings menus bundled in the same drop |
| `Common/App_Defines.h`, `App_enums.h`, `UIEnums.h`, `UI.h` | new UI-scene enum + defines |
| `Common/Consoles_App.cpp` (+45) | wire the scene into the app's scene dispatch |
| `Minecraft.World/CraftingMenu.{cpp,h}` | container-side hooks the donated UI drives |
| `README.md` (+1) | add the Project-Zenith acknowledgment |

### How a donation gets integrated

The donor code arrives as a matched set of `IUIScene_*` / `UIScene_*` files plus
`.swf` assets. Integration is the work of *wiring it into neoLegacy's scene
system*: a new value in `UIEnums.h`, a case in `Consoles_App.cpp`'s scene
dispatch, the inventory-menu rework so the existing inventory routes into the
classic-crafting scene, and the `CraftingMenu` container hooks the UI binds to.
The `.swf` files are dropped in as-is; the C++ side is adapted to this codebase's
UI-scene idioms.

Crucially, the PR also **records the donation in `README.md`** — the +1 line to
the acknowledgments — closing the loop required by the human/attribution culture
of the project.

**Lesson:** a donated feature is not "copy files in." It is a smaller version of
a normal backport: map the donor's UI-scene concepts onto neoLegacy's scene
enum + dispatch + container hooks, ship the assets, and attribute the source.

Reference: [Container menus](/slop-docs/world/containers/);
[Client UI](/slop-docs/client/ui-system/).

---

## Cross-cutting patterns

Reading all five together, the same shape recurs:

| Pattern | Slime | Barrier | Depth Strider | Worldgen | Classic Crafting |
|---------|:-:|:-:|:-:|:-:|:-:|
| New `*.{cpp,h}` class pair | ✓ | ✓ | ✓ | ✓ (many) | ✓ |
| Registration in a `staticCtor` | ✓ | ✓ | ✓ | ✓ | — (UI enum) |
| `stringsGeneric.xml` name/tooltip | ✓ | ✓ | ✓ | — | ✓ |
| Recipe / acquisition | ✓ (fix) | — (admin block) | via table | — | — |
| Client render/particle/UI work | ✓ | ✓ | — | — | ✓ (donated) |
| FourKit C# mirror | — | — | ✓ | — | — |
| `feat` + follow-up `fix:` chain | ✓ (5) | 1 merge | 1 merge | bundled | ✓ |

The [Backporting Workflow](/slop-docs/backporting/workflow/) turns this recurring
shape into a checklist you can follow.

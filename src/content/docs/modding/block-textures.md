---
title: Block Textures
description: How the terrain atlas works, how blocks reference textures, and how to add your own.
---

Blocks in LCE get their textures from a single big image called the **terrain atlas**. Unlike Java Edition (which stitches individual image files at runtime), Legacy Console Edition uses a pre-stitched `terrain.png` where every block texture sits at a fixed position on a 16x16 grid. This guide covers how that system works and how to add your own textures to it.

## How the Terrain Atlas Works

The terrain atlas is loaded during startup by the `PreStitchedTextureMap` class in `Minecraft.Client/PreStitchedTextureMap.cpp`. The constructor sets it up like this:

```cpp
// From Textures.cpp - the two atlas maps
terrain = new PreStitchedTextureMap(Icon::TYPE_TERRAIN, L"terrain", L"textures/blocks/", missingNo, true);
items = new PreStitchedTextureMap(Icon::TYPE_ITEM, L"items", L"textures/items/", missingNo, true);
```

The terrain atlas starts as a `terrain.png` file. 4J Studios made a deliberate design choice here: instead of stitching textures together at runtime like the Java version does, the atlas is **pre-stitched**. Every texture has a hardcoded position that's defined in the `loadUVs()` method.

The atlas is a 16x16 grid (vanilla). Each cell is one block texture. Positions are defined as UV coordinates using `SimpleIcon`:

```cpp
float slotSize = 1.0f / 16.0f;

// "grass_top" is at column 0, row 0 of the terrain atlas
texturesByName.insert(stringIconMap::value_type(
    L"grass_top",
    new SimpleIcon(L"grass_top", slotSize*0, slotSize*0, slotSize*1, slotSize*1)
));
```

The four float parameters to `SimpleIcon` are `U0, V0, U1, V1`, which map to the top-left and bottom-right corners of the texture in UV space (0.0 to 1.0).

## How Blocks Reference Their Textures

Every tile has a `getTexture()` method that returns an `Icon*`. There are three overloads:

```cpp
// Simple: just give me the texture for this face
virtual Icon *getTexture(int face);

// With aux data: face + block data value
virtual Icon *getTexture(int face, int data);

// Full context: access the level for neighbor-dependent textures
virtual Icon *getTexture(LevelSource *level, int x, int y, int z, int face);
```

For the simplest blocks (stone, dirt, ores), the base `Tile` class handles everything. You just call `setTextureName()` during registration, and the default `registerIcons()` does the rest:

```cpp
// Base Tile::registerIcons just registers one icon for all faces
void Tile::registerIcons(IconRegister *iconRegister)
{
    icon = iconRegister->registerIcon(m_textureName);
}
```

The `registerIcon()` call looks up the name in the `texturesByName` map and returns the matching `Icon*` with its UV coordinates. Then `getTexture()` returns that icon for every face.

### The Icon System

`Icon` is an interface defined in `Minecraft.World/Icon.h`. It provides UV coordinates for rendering:

```cpp
class Icon
{
public:
    static const int TYPE_TERRAIN = 0;
    static const int TYPE_ITEM = 1;

    virtual float getU0(bool adjust = false) const = 0;
    virtual float getU1(bool adjust = false) const = 0;
    virtual float getV0(bool adjust = false) const = 0;
    virtual float getV1(bool adjust = false) const = 0;
    virtual int getWidth() const = 0;
    virtual int getHeight() const = 0;
    // ...
};
```

The concrete implementation is `StitchedTexture`, which stores the pixel position within the atlas and computes UVs from that:

```cpp
this->u0 = x / (float)source->getWidth();
this->u1 = (x + width) / (float)source->getWidth();
this->v0 = y / (float)source->getHeight();
this->v1 = (y + height) / (float)source->getHeight();
```

`SimpleIcon` is a lighter implementation that takes UV values directly. It also supports flags like `IS_GRASS_TOP` that tell the renderer to apply biome-dependent color tinting.

## Texture Formats and Sizes

Each texture slot in the vanilla terrain atlas is **16x16 pixels**. The atlas itself is 256x256 (16 slots of 16px each). Textures are stored as 32-bit RGBA.

The pixel format depends on platform:

```cpp
// Xbox: ARGB byte order
newPixels[i * 4 + 0] = (byte) a;
newPixels[i * 4 + 1] = (byte) r;
newPixels[i * 4 + 2] = (byte) g;
newPixels[i * 4 + 3] = (byte) b;

// Other platforms: RGBA byte order
newPixels[i * 4 + 0] = (byte) r;
newPixels[i * 4 + 1] = (byte) g;
newPixels[i * 4 + 2] = (byte) b;
newPixels[i * 4 + 3] = (byte) a;
```

Mipmapping is enabled by default for block textures (the `true` parameter in the `PreStitchedTextureMap` constructor). The engine generates up to 5 mip levels. Some blocks like cross-texture plants (flowers, saplings) disable mipmapping with `->disableMipmap()` because the mip chain would make them look blurry.

## UV Coordinate System

UVs in the terrain atlas go from `(0.0, 0.0)` at the top-left to `(1.0, 1.0)` at the bottom-right. For a 16x16 grid, each slot is `1/16 = 0.0625` wide and tall.

To calculate the UV rectangle for a texture at grid position `(col, row)`:

```
U0 = col / 16.0
V0 = row / 16.0
U1 = (col + 1) / 16.0
V1 = (row + 1) / 16.0
```

Some textures take up more than one slot. Flowing water and lava use 2x2 slots:

```cpp
// water_flow takes columns 14-15, rows 12-13
texturesByName.insert(stringIconMap::value_type(
    L"water_flow",
    new SimpleIcon(L"water_flow", slotW*14, slotH*12, slotW*(14+2), slotH*(12+2))
));
```

## Multi-Face Textures

Many blocks need different textures on different faces. There are a few patterns for this.

### Pattern 1: Override getTexture() Directly

The simplest approach. Override `getTexture()` and return different icons based on the `face` parameter. Face IDs come from `Facing.h`:

| Constant | Value | Direction |
|----------|-------|-----------|
| `Facing::DOWN` | 0 | Bottom |
| `Facing::UP` | 1 | Top |
| `Facing::NORTH` | 2 | North |
| `Facing::SOUTH` | 3 | South |
| `Facing::WEST` | 4 | West |
| `Facing::EAST` | 5 | East |

Here's how vanilla grass does it:

```cpp
Icon *GrassTile::getTexture(int face, int data)
{
    if (face == Facing::UP) return iconTop;
    if (face == Facing::DOWN) return Tile::dirt->getTexture(face);
    return icon;  // sides
}

void GrassTile::registerIcons(IconRegister *iconRegister)
{
    icon = iconRegister->registerIcon(L"grass_side");
    iconTop = iconRegister->registerIcon(L"grass_top");
    iconSnowSide = iconRegister->registerIcon(L"snow_side");
    iconSideOverlay = iconRegister->registerIcon(L"grass_side_overlay");
}
```

Grass has three faces: top is green, bottom reuses dirt's texture, and sides get the half-dirt-half-green texture. It even swaps to a snowy side texture when there's snow on top, using the level-aware overload:

```cpp
Icon *GrassTile::getTexture(LevelSource *level, int x, int y, int z, int face)
{
    if (face == Facing::UP) return iconTop;
    if (face == Facing::DOWN) return Tile::dirt->getTexture(face);
    Material *above = level->getMaterial(x, y + 1, z);
    if (above == Material::topSnow || above == Material::snow) return iconSnowSide;
    else return icon;
}
```

### Pattern 2: The AetherMultiFaceTile Helper

The Aether client created a reusable helper class for the common "top is different from sides" pattern:

```cpp
// AetherMultiFaceTile.h
class AetherMultiFaceTile : public Tile
{
private:
    Icon *iconTop;
    Icon *iconSide;
    wstring texTop;
    wstring texSide;

protected:
    AetherMultiFaceTile(int id, const wstring &topTex, const wstring &sideTex);

public:
    virtual Icon *getTexture(int face, int data);
    void registerIcons(IconRegister *iconRegister);
};
```

```cpp
// AetherMultiFaceTile.cpp
Icon *AetherMultiFaceTile::getTexture(int face, int data)
{
    if (face == Facing::UP || face == Facing::DOWN) return iconTop;
    return iconSide;
}

void AetherMultiFaceTile::registerIcons(IconRegister *iconRegister)
{
    iconTop = iconRegister->registerIcon(texTop);
    iconSide = iconRegister->registerIcon(texSide);
}
```

Used like this during registration:

```cpp
Tile::enchanter = (new AetherMultiFaceTile(190, L"EnchanterTop", L"EnchanterSide"))
    ->setDestroyTime(2.0f)
    ->setSoundType(SOUND_STONE)
    ->setTextureName(L"EnchanterSide")
    ->setDescriptionId(IDS_TILE_ENCHANTER);
```

### Pattern 3: Logs (Rotation-Aware)

Logs are trickier because the "top" face changes based on which axis the log was placed on. The `data` value stores the orientation:

```cpp
// SkyrootLogTile.h
static const int MASK_FACING = 0xC;
static const int FACING_Y = 0 << 2;  // Upright (default)
static const int FACING_X = 1 << 2;  // East-west
static const int FACING_Z = 2 << 2;  // North-south

Icon *SkyrootLogTile::getTexture(int face, int data)
{
    int dir = data & MASK_FACING;
    if (dir == FACING_Y && (face == Facing::UP || face == Facing::DOWN)) return iconTop;
    else if (dir == FACING_X && (face == Facing::EAST || face == Facing::WEST)) return iconTop;
    else if (dir == FACING_Z && (face == Facing::NORTH || face == Facing::SOUTH)) return iconTop;
    return iconSide;
}
```

### Pattern 4: Data-Variant Blocks

Some blocks use the data value to pick between multiple texture sets. Wool, planks, and stone variants all work this way. Override `registerIcons()` to register an array of icons, then index into it using the data value:

```cpp
void WoolTile::registerIcons(IconRegister *iconRegister)
{
    for (int i = 0; i < 16; i++)
        iconByData[i] = iconRegister->registerIcon(woolNames[i]);
}

Icon *WoolTile::getTexture(int face, int data)
{
    return iconByData[data & 0xF];
}
```

## Animated Textures

Some textures animate: water, lava, fire, and portal effects. The system works like this:

1. During `loadUVs()`, animated textures are registered in the `texturesToAnimate` list alongside their normal UV entry
2. The actual animation frames are loaded from separate image files (strips of frames stacked vertically)
3. Every tick, `cycleAnimationFrames()` advances each animated texture to its next frame by blitting the frame data onto the atlas

```cpp
// Registering an animated texture in loadUVs()
texturesByName.insert(stringIconMap::value_type(
    L"lava", new SimpleIcon(L"lava", slotW*13, slotH*14, slotW*14, slotH*15)
));
texturesToAnimate.push_back(pair<wstring, wstring>(L"lava", L"lava"));
```

The second value in the pair is the filename of the animation strip (loaded from `textures/blocks/lava.png`).

The frame cycling logic in `StitchedTexture::cycleFrames()` supports two modes:

**Simple mode:** frames advance one at a time, looping back to the start:

```cpp
frame = (frame + 1) % frames->size();
if (oldFrame != frame)
{
    source->blit(x, y, frames->at(frame), rotated);
}
```

**Override mode:** a custom frame sequence with per-frame durations, defined with the `*` syntax (e.g., `4*10` means "frame 4 for 10 ticks"):

```
0,1,2,3,
4*10,5*10,
4*10,3,2,1,
0
```

The animation strip file should be 16 pixels wide and `16 * frameCount` pixels tall. Each 16x16 section is one frame, stacked top to bottom.

The animated textures that ship with vanilla LCE are:

| Texture Name | Description |
|-------------|-------------|
| `water` | Still water surface |
| `water_flow` | Flowing water (2x2 slots) |
| `lava` | Still lava surface |
| `lava_flow` | Flowing lava (2x2 slots) |
| `fire_0` | Fire layer 1 |
| `fire_1` | Fire layer 2 |
| `portal` | Nether portal effect |

Fire uses two separate animated layers that get composited by the renderer.

## Biome-Tinted Textures

Some block textures get tinted based on the biome. Grass tops, grass sides (the overlay), and leaves all use the colour table for their tint. The `Icon::IS_GRASS_TOP` flag marks a texture as needing biome coloring:

```cpp
texturesByName[L"AetherGrassTop"]->setFlags(Icon::IS_GRASS_TOP);
```

The actual tinting happens in `TileRenderer` during block rendering. It reads the biome color from the active `ColourTable` and multiplies it with the vertex colors.

If you want your custom block texture to respond to biome colors, set the `IS_GRASS_TOP` flag on its icon. If you want a custom tint that doesn't follow biome rules, set the color directly in your tile's `getColor()` method instead.

## How the Aether Client Added Block Textures

The Aether mod is a good case study for adding a bunch of new textures. Here's what they did:

### 1. Expanded the Atlas

The terrain atlas was expanded beyond the vanilla 16x16 grid. The Aether textures were placed in rows 16-18 (below the vanilla content). The UV calculations use separate width/height slot sizes to handle the non-square atlas:

```cpp
// Aether Block Textures (rows 16-18)
// Row 16
texturesByName.insert(stringIconMap::value_type(
    L"Aercloud", new SimpleIcon(L"Aercloud", slotW*0, slotH*16, slotW*1, slotH*17)
));
texturesByName.insert(stringIconMap::value_type(
    L"AetherDirt", new SimpleIcon(L"AetherDirt", slotW*2, slotH*16, slotW*3, slotH*17)
));
texturesByName.insert(stringIconMap::value_type(
    L"AetherGrassSide", new SimpleIcon(L"AetherGrassSide", slotW*3, slotH*16, slotW*4, slotH*17)
));
texturesByName.insert(stringIconMap::value_type(
    L"AetherGrassTop", new SimpleIcon(L"AetherGrassTop", slotW*4, slotH*16, slotW*5, slotH*17)
));
texturesByName[L"AetherGrassTop"]->setFlags(Icon::IS_GRASS_TOP);
```

Note the `setFlags(Icon::IS_GRASS_TOP)` call. This tells the renderer that this texture needs biome-dependent color tinting, just like vanilla grass.

### 2. Painted the Textures Into the Atlas Image

The actual pixel data was added to the `terrain.png` file. The existing vanilla textures stay in their original positions (rows 0-15) and the new Aether textures go in the extra rows below.

### 3. Created Tile Classes With registerIcons()

Each Aether tile class overrides `registerIcons()` to look up its texture by name. For example, `AetherGrassTile`:

```cpp
void AetherGrassTile::registerIcons(IconRegister *iconRegister)
{
    iconSide = iconRegister->registerIcon(L"AetherGrassSide");
    iconTop = iconRegister->registerIcon(L"AetherGrassTop");
}
```

### 4. Registered Tiles With setTextureName()

During tile registration in `staticCtor()`, each tile gets its texture name set. This name is used by the base `registerIcons()` as a fallback, and also by the item renderer:

```cpp
Tile::aetherGrass = (new AetherGrassTile(160))
    ->setDestroyTime(0.45f)
    ->setSoundType(SOUND_GRASS)
    ->setTextureName(L"AetherGrassTop")
    ->sendTileData()
    ->setDescriptionId(IDS_TILE_AETHER_GRASS);
```

## Step-by-Step: Adding a New Block Texture

Here's the full process for adding a texture for a new block.

### 1. Draw Your Texture

Create a 16x16 pixel image in your editor of choice. Save it as 32-bit RGBA PNG.

### 2. Pick a Slot in the Atlas

Find an empty slot or add new rows. If you're just adding a few blocks, look for unused slots in the existing 16x16 grid. If you need more room, extend the atlas vertically.

### 3. Paint It Into terrain.png

Open your `terrain.png` and paste your 16x16 texture into the slot you chose. If your texture is at column 5, row 16, that means pixel position `(80, 256)` in the image.

### 4. Register the UV Entry in loadUVs()

Open `Minecraft.Client/PreStitchedTextureMap.cpp` and add your texture to the terrain section of `loadUVs()`:

```cpp
// In the terrain (iconType == Icon::TYPE_TERRAIN) block of loadUVs():
texturesByName.insert(stringIconMap::value_type(
    L"myBlockTexture",
    new SimpleIcon(L"myBlockTexture", slotSize*5, slotSize*16, slotSize*(5+1), slotSize*(16+1))
));
```

Replace `5` and `16` with your column and row. The `slotSize` variable is already defined in the function as `1.0f / 16.0f`. If you extend the atlas vertically beyond 16 rows, you will need to define separate `slotW` and `slotH` variables instead (like the Aether client does), since the atlas is no longer square.

### 5. Set the Texture Name on Your Tile

In `Tile::staticCtor()`, use `setTextureName()` with the same string:

```cpp
Tile::myBlock = (new MyBlockTile(200))
    ->setDestroyTime(1.5f)
    ->setSoundType(Tile::SOUND_STONE)
    ->setTextureName(L"myBlockTexture")
    ->setDescriptionId(IDS_TILE_MY_BLOCK);
```

For a single-texture block, that's it. The base `Tile::registerIcons()` will call `registerIcon(L"myBlockTexture")`, which finds your UV entry and stores the resulting `Icon*`. All six faces will use the same texture.

### 6. For Multi-Face Blocks

If your block needs different textures per face, register multiple UV entries and override `registerIcons()`:

```cpp
// In loadUVs():
texturesByName.insert(stringIconMap::value_type(
    L"myBlockTop",
    new SimpleIcon(L"myBlockTop", slotSize*5, slotSize*16, slotSize*6, slotSize*17)
));
texturesByName.insert(stringIconMap::value_type(
    L"myBlockSide",
    new SimpleIcon(L"myBlockSide", slotSize*6, slotSize*16, slotSize*7, slotSize*17)
));
texturesByName.insert(stringIconMap::value_type(
    L"myBlockBottom",
    new SimpleIcon(L"myBlockBottom", slotSize*7, slotSize*16, slotSize*8, slotSize*17)
));
```

```cpp
// In your tile class:
void MyBlockTile::registerIcons(IconRegister *iconRegister)
{
    iconTop = iconRegister->registerIcon(L"myBlockTop");
    iconSide = iconRegister->registerIcon(L"myBlockSide");
    iconBottom = iconRegister->registerIcon(L"myBlockBottom");
}

Icon *MyBlockTile::getTexture(int face, int data)
{
    if (face == Facing::UP) return iconTop;
    if (face == Facing::DOWN) return iconBottom;
    return iconSide;
}
```

### 7. For Animated Textures

If your texture should animate:

1. Add the UV entry as normal
2. Add a `texturesToAnimate` entry pointing to the animation strip filename
3. Create the animation strip image in `textures/blocks/`

```cpp
// In loadUVs():
texturesByName.insert(stringIconMap::value_type(
    L"myAnimatedBlock",
    new SimpleIcon(L"myAnimatedBlock", slotSize*8, slotSize*16, slotSize*9, slotSize*17)
));
texturesToAnimate.push_back(pair<wstring, wstring>(L"myAnimatedBlock", L"myAnimatedBlock"));
```

The animation strip file (`textures/blocks/myAnimatedBlock.png`) should be 16 pixels wide and `16 * frameCount` pixels tall. Each 16x16 section is one frame, stacked top to bottom.

For custom frame timing, add a `.txt` file next to the animation strip with comma-separated frame indices and optional `*duration` suffixes.

### 8. Rebuild and Test

If you created new `.cpp` files for tile subclasses, add them to `cmake/Sources.cmake` (only `.cpp` files, not headers). Re-run CMake, rebuild the project, and your block should render with the new texture.

## Common Pitfalls

**Texture name mismatch.** The string you pass to `setTextureName()` must exactly match the key you used in `loadUVs()`. If it doesn't match, you'll get the "missingno" purple-black checkerboard and a debug break.

**Forgetting the UV entry.** If you override `registerIcons()` and call `registerIcon()` with a name that doesn't exist in `texturesByName`, the engine will hit a `__debugbreak()` in debug builds.

**Wrong atlas dimensions.** If you extend the atlas vertically, make sure the slot size calculations account for the new height. The Aether client uses separate `slotW` and `slotH` variables instead of a single `slotSize` for this reason.

**Not calling sendTileData().** If your block uses the `data` parameter in `getTexture(int face, int data)` for different visual states, you need `->sendTileData()` during registration so the data bits get synced to clients.

**Forgetting to compile after atlas changes.** If you change the atlas image but don't rebuild the project, the old atlas stays cached. Do a clean build after changing `terrain.png`.

## Related Guides

- [Adding Blocks](/slop-docs/modding/adding-blocks/) for the full tile creation process
- [Adding Items](/slop-docs/modding/adding-items/) to create matching item textures
- [Texture Packs](/slop-docs/modding/texture-packs/) for the texture pack override system

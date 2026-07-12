---
title: "Template: Textures from Scratch"
description: A complete guide to making, loading, and replacing textures in LCE, covering blocks, items, entities, and texture packs.
---

This is the full-picture guide to textures in Legacy Console Edition. By the end, you will know how to add brand-new textures for blocks, items, and entities, how to replace existing ones, and how the texture pack system works under the hood.

Here is what we will cover:

1. How the terrain atlas works (the big picture)
2. Adding a new block texture to the atlas
3. Adding item textures
4. Adding entity textures
5. Replacing existing textures
6. How the texture pack system works
7. Common pitfalls and how to fix them

If you have not set up a build environment yet, start with [Getting Started](/slop-docs/modding/getting-started/) first. This tutorial assumes you can build and run the game.

## Files you will create or modify

What you touch depends on what kind of texture you are adding. Here is the full picture:

### For block textures

| File | Action |
|------|--------|
| `Common/res/TitleUpdate/res/terrain.png` | Paint your 16x16 texture into an empty atlas slot |
| `Minecraft.Client/PreStitchedTextureMap.cpp` | Register UV entry in `loadUVs()` (terrain section) |
| `Minecraft.World/Tile.cpp` | Call `setTextureName()` with your texture name |
| Your tile `.h`/`.cpp` (optional) | Override `registerIcons()` and `getTexture()` for multi-face blocks |

### For item textures

| File | Action |
|------|--------|
| `Common/res/TitleUpdate/res/gui/items.png` | Paint your 16x16 texture into an empty atlas slot |
| `Minecraft.Client/PreStitchedTextureMap.cpp` | Register UV entry in `loadUVs()` (items section) |
| `Minecraft.World/Item.cpp` | Call `setTextureName()` with your texture name |

### For entity textures

| File | Action |
|------|--------|
| `Common/res/TitleUpdate/res/mob/your_entity.png` | Create a standalone PNG (usually 64x32 or 64x64) |
| `Minecraft.Client/Textures.h` | Add a `TEXTURE_NAME` enum entry |
| `Minecraft.Client/Textures.cpp` | Map the enum to a file path in `preLoaded[]` |
| Your renderer `.cpp` | Call `textures->bindTexture()` with the enum value |

### For texture replacement (non-destructive)

| File | Action |
|------|--------|
| `Common/DummyTexturePack/res/...` | Drop replacement PNGs matching vanilla paths |
| `Minecraft.Client/TexturePackRepository.cpp` | Enable `FolderTexturePack` in `addDebugPacks()` |

### Resource directory structure

Here is where texture files live on disk:

```
Common/
  res/
    TitleUpdate/
      res/
        terrain.png                   <-- block atlas (256x256)
        gui/
          items.png                   <-- item atlas
        mob/
          creeper.png                 <-- entity textures (standalone)
          zombie.png
          your_entity.png
        environment/
          clouds.png
        particles.png
```

No new `.cpp` or `.h` files are needed for textures alone. You only modify existing source files to register your texture names. If you do add new tile or item classes that need source files, add those `.cpp` files to `cmake/Sources.cmake` under the appropriate section (`MINECRAFT_WORLD_SOURCES` or `MINECRAFT_CLIENT_SOURCES`).

---

## Part 1: How the Terrain Atlas Works

LCE does not stitch textures together at runtime like Java Edition does. Instead, every block texture lives on a single pre-built image called `terrain.png`. This is a 16x16 grid where each cell holds one 16x16 pixel block texture. The whole image is 256x256 pixels.

At startup, the `PreStitchedTextureMap` class loads this atlas. Two atlases get created in `Textures.cpp`:

```cpp
// terrain atlas (blocks) and items atlas
terrain = new PreStitchedTextureMap(Icon::TYPE_TERRAIN, L"terrain", L"textures/blocks/", missingNo, true);
items = new PreStitchedTextureMap(Icon::TYPE_ITEM, L"items", L"textures/items/", missingNo, true);
```

The last `true` parameter enables mipmapping. Cross-texture plants like flowers call `->disableMipmap()` to turn it off so they do not look blurry.

### UV coordinates and SimpleIcon

Every texture slot has a UV rectangle that tells the renderer where on the atlas to sample from. UVs go from `(0.0, 0.0)` at the top-left corner to `(1.0, 1.0)` at the bottom-right.

For a 16x16 grid, each slot is `1/16 = 0.0625` wide and tall. The mapping from grid position to UVs is straightforward:

```
U0 = column / 16.0
V0 = row / 16.0
U1 = (column + 1) / 16.0
V1 = (row + 1) / 16.0
```

These get registered in the `loadUVs()` method of `PreStitchedTextureMap` using `SimpleIcon`:

```cpp
float slotSize = 1.0f / 16.0f;

// "grass_top" sits at column 0, row 0
texturesByName.insert(stringIconMap::value_type(
    L"grass_top",
    new SimpleIcon(L"grass_top", slotSize*0, slotSize*0, slotSize*1, slotSize*1)
));
```

The four float parameters are `U0, V0, U1, V1`. That is the top-left and bottom-right corners in UV space.

Some textures are bigger than one slot. Flowing water and lava use 2x2 slots:

```cpp
// water_flow takes columns 14-15, rows 12-13
texturesByName.insert(stringIconMap::value_type(
    L"water_flow",
    new SimpleIcon(L"water_flow", slotW*14, slotH*12, slotW*(14+2), slotH*(12+2))
));
```

### How blocks find their texture

Every tile has a `getTexture()` method that returns an `Icon*`. The simplest blocks just call `setTextureName()` during registration, and the base `Tile::registerIcons()` handles the rest:

```cpp
void Tile::registerIcons(IconRegister *iconRegister)
{
    icon = iconRegister->registerIcon(m_textureName);
}
```

The `registerIcon()` call looks up the name in the `texturesByName` map and returns the matching `Icon*` with its UV coordinates. Then `getTexture()` returns that icon for every face.

For blocks with different textures per face, you override `registerIcons()` and `getTexture()`. See [Block Textures](/slop-docs/modding/block-textures/) for the full breakdown of multi-face patterns.

---

## Part 2: Adding a New Block Texture

This is the step-by-step process. We will add a texture for a fictional "ruby ore" block.

### Step 1: Draw your texture

Create a 16x16 pixel image. Save it as 32-bit RGBA PNG. Any image editor works. Keep it simple for your first try.

### Step 2: Pick a slot in the atlas

Open the vanilla `terrain.png` and find an empty slot. If the vanilla 16x16 grid is full, you can extend the atlas vertically by adding rows below row 15. The Aether client did exactly this, placing new textures in rows 16-18.

If you extend the atlas, it will no longer be square (256x256). That is fine, but you need to use separate width and height slot sizes in `loadUVs()`:

```cpp
// For a non-square atlas (e.g., 256 wide, 304 tall for 19 rows)
float slotW = 1.0f / 16.0f;   // still 16 columns
float slotH = 1.0f / 19.0f;   // now 19 rows
```

For this tutorial, let's say we are using column 5, row 16 (the first extra row).

### Step 3: Paint it into terrain.png

Open `terrain.png` in your image editor. Paste your 16x16 texture at pixel position `(80, 256)`. That is column 5 times 16 pixels, row 16 times 16 pixels. Save the file.

### Step 4: Register the UV in loadUVs()

Open `Minecraft.Client/PreStitchedTextureMap.cpp`. Inside the `loadUVs()` function, in the terrain section (`iconType == Icon::TYPE_TERRAIN`), add your entry:

```cpp
texturesByName.insert(stringIconMap::value_type(
    L"oreRuby",
    new SimpleIcon(L"oreRuby", slotW*5, slotH*16, slotW*(5+1), slotH*(16+1))
));
```

The string `L"oreRuby"` is the texture name. It must exactly match what you pass to `setTextureName()` later.

### Step 5: Reference from your Tile

In `Tile::staticCtor()` (inside `Minecraft.World/Tile.cpp`), register your block with the matching texture name:

```cpp
Tile::rubyOre = (new RubyOreTile(160))
    ->setDestroyTime(3.0f)
    ->setExplodeable(5)
    ->setSoundType(Tile::SOUND_STONE)
    ->setTextureName(L"oreRuby")
    ->setDescriptionId(IDS_TILE_RUBY_ORE);
```

For a single-texture block, that is everything. The base `Tile::registerIcons()` calls `registerIcon(L"oreRuby")`, which finds your UV entry and stores the `Icon*`. All six faces will use the same texture.

### Step 6: Multi-face blocks (optional)

If your block needs different textures per face (like a furnace or log), register multiple UV entries and override `registerIcons()` in your tile class:

```cpp
// In loadUVs() - register three textures
texturesByName.insert(stringIconMap::value_type(
    L"rubyBlockTop",
    new SimpleIcon(L"rubyBlockTop", slotW*5, slotH*16, slotW*6, slotH*17)
));
texturesByName.insert(stringIconMap::value_type(
    L"rubyBlockSide",
    new SimpleIcon(L"rubyBlockSide", slotW*6, slotH*16, slotW*7, slotH*17)
));
texturesByName.insert(stringIconMap::value_type(
    L"rubyBlockBottom",
    new SimpleIcon(L"rubyBlockBottom", slotW*7, slotH*16, slotW*8, slotH*17)
));
```

Then in your tile class:

```cpp
// RubyBlockTile.h
class RubyBlockTile : public Tile
{
    Icon *iconTop;
    Icon *iconSide;
    Icon *iconBottom;
public:
    RubyBlockTile(int id);
    void registerIcons(IconRegister *iconRegister);
    Icon *getTexture(int face, int data);
};

// RubyBlockTile.cpp
void RubyBlockTile::registerIcons(IconRegister *iconRegister)
{
    iconTop = iconRegister->registerIcon(L"rubyBlockTop");
    iconSide = iconRegister->registerIcon(L"rubyBlockSide");
    iconBottom = iconRegister->registerIcon(L"rubyBlockBottom");
}

Icon *RubyBlockTile::getTexture(int face, int data)
{
    if (face == Facing::UP) return iconTop;
    if (face == Facing::DOWN) return iconBottom;
    return iconSide;
}
```

Face constants from `Facing.h`: `DOWN=0, UP=1, NORTH=2, SOUTH=3, WEST=4, EAST=5`.

### Step 7: Biome-tinted textures (optional)

If you want your texture to be tinted by biome color (like grass), set the flag after registering the UV:

```cpp
texturesByName[L"myGrassTexture"]->setFlags(Icon::IS_GRASS_TOP);
```

The renderer will then multiply vertex colors with the biome's color table values.

### Step 8: Animated textures (optional)

To make a texture animate (like water or lava):

1. Register the UV entry as normal
2. Add a `texturesToAnimate` entry in `loadUVs()`
3. Create an animation strip image in `textures/blocks/`

```cpp
// In loadUVs()
texturesByName.insert(stringIconMap::value_type(
    L"rubyGlow",
    new SimpleIcon(L"rubyGlow", slotW*8, slotH*16, slotW*9, slotH*17)
));
texturesToAnimate.push_back(pair<wstring, wstring>(L"rubyGlow", L"rubyGlow"));
```

The animation strip file (`textures/blocks/rubyGlow.png`) should be 16 pixels wide and `16 * frameCount` pixels tall. Each 16x16 chunk is one frame, stacked top to bottom. Frames advance one per tick by default.

For custom frame timing, add a `.txt` file next to the strip with comma-separated frame indices. Use `*` for duration: `0,1,2,3,4*10,3,2,1` means "play frames 0-3 at 1 tick each, hold frame 4 for 10 ticks, then 3-1 at 1 tick each."

### Step 9: Build and test

Add any new `.h` and `.cpp` files to `cmake/Sources.cmake`, rebuild the project, and your block should render with the new texture. If you see a purple-black checkerboard (missingno), the texture name does not match. Double-check your strings.

---

## Part 3: Adding Item Textures

Items use the exact same atlas system, just a different atlas. The items atlas is `gui/items.png` and the UV entries live in the items section of `loadUVs()`.

### Step 1: Draw and place your item texture

Same as blocks: 16x16 pixels, 32-bit RGBA. Open the items atlas (`gui/items.png`) and paste your texture into an empty slot.

### Step 2: Register the UV

In `loadUVs()`, in the items section (`iconType == Icon::TYPE_ITEM`):

```cpp
texturesByName.insert(stringIconMap::value_type(
    L"ruby",
    new SimpleIcon(L"ruby", slotSize*5, slotSize*10, slotSize*6, slotSize*11)
));
```

Adjust the column and row to match where you placed it.

### Step 3: Set the texture name on your Item

In `Item::staticCtor()`:

```cpp
Item::ruby = ( new Item(151) )  // ID = 256 + 151 = 407
    ->setBaseItemTypeAndMaterial(eBaseItemType_treasure, eMaterial_emerald)
    ->setTextureName(L"ruby")
    ->setDescriptionId(IDS_ITEM_RUBY);
```

Items use `registerIcons()` the same way tiles do. The base `Item::registerIcons()` calls `registerIcon(m_textureName)` and stores the result. If your item needs multiple icons (like a durability bar overlay or colored layer), override `registerIcons()`:

```cpp
void MyFancyItem::registerIcons(IconRegister *iconRegister)
{
    icon = iconRegister->registerIcon(L"myFancyItemBase");
    overlayIcon = iconRegister->registerIcon(L"myFancyItemOverlay");
}
```

See [Adding Items](/slop-docs/modding/adding-items/) for the full item creation process.

---

## Part 4: Adding Entity Textures

Entity textures work completely differently from block and item textures. They are **not** on an atlas. Each entity has its own separate image file.

### How entity textures are loaded

Entity textures are standalone PNG files listed in the `preLoaded[]` array in `Textures.cpp`. Each one has a `TEXTURE_NAME` enum value and a string path:

```cpp
// From the preLoaded array
preLoaded[TN_MOB_CREEPER] = L"mob/creeper";
preLoaded[TN_MOB_ZOMBIE] = L"mob/zombie";
preLoaded[TN_MOB_SKELETON] = L"mob/skeleton";
// ... etc
```

At startup, `Textures::loadIndexedTextures()` loops through this array, appends `.png`, and loads each one through `readImage()`. The result gets uploaded to the GPU with a texture ID that the renderer can bind later.

### Step 1: Add a TEXTURE_NAME enum entry

In `Textures.h`, add a new entry to the `TEXTURE_NAME` enum:

```cpp
// In the TEXTURE_NAME enum
TN_MOB_MY_ENTITY,
```

### Step 2: Add the path to preLoaded

In `Textures.cpp`, map the enum to a file path:

```cpp
preLoaded[TN_MOB_MY_ENTITY] = L"mob/my_entity";
```

This means the engine will look for `mob/my_entity.png` in the resource directory.

### Step 3: Create the texture file

Place your texture at the right path. For the default pack, that is:

```
Common/res/TitleUpdate/res/mob/my_entity.png
```

Most mob textures are either 64x32 or 64x64. Match the dimensions to the UV layout your model expects. If you are making a humanoid mob, use 64x64 and follow the standard player/zombie skin layout.

### Step 4: Bind the texture in the renderer

Entity renderers bind textures before drawing. Your renderer class needs to reference the `TEXTURE_NAME` constant:

```cpp
// In your entity renderer's render method
textures->bindTexture(Textures::TN_MOB_MY_ENTITY);
// Then draw the model
model->render(entity, limbSwing, limbSwingAmount, ageInTicks, headYaw, headPitch, scale);
```

The `bindTexture()` call tells the GPU to use that texture for subsequent draw calls. You typically do this once at the start of your render method, before calling `model->render()`.

If your entity has multiple textures (like a sheep with a wool overlay), bind each one before drawing the relevant model part:

```cpp
// Draw base body
textures->bindTexture(Textures::TN_MOB_SHEEP);
model->render(entity, ...);

// Draw wool overlay
textures->bindTexture(Textures::TN_MOB_SHEEP_FUR);
woolModel->render(entity, ...);
```

See [Adding Entities](/slop-docs/modding/adding-entities/) for the full entity creation and rendering pipeline.

---

## Part 5: Replacing Existing Textures

You do not always need to add new textures. Sometimes you just want to change how existing things look. There are two approaches depending on what you want to change.

### Approach A: Edit the atlas directly

The simplest way to change a block or item texture is to open the atlas file (`terrain.png` for blocks, `gui/items.png` for items), find the slot you want to change, paint over it, and save. The UV coordinates stay the same, so the engine picks up your new pixel data automatically.

Use the `loadUVs()` function as a reference to find which slot maps to which block or item. For example, if `grass_top` is at `slotSize*0, slotSize*0`, that is the top-left slot (column 0, row 0).

### Approach B: Use the texture pack system

For non-destructive replacement, use the `FolderTexturePack` system. This lets you override textures without modifying the originals.

**Set up the folder structure:**

```
Common/
  DummyTexturePack/
    res/
      terrain.png              <-- custom block atlas
      gui/
        items.png              <-- custom items atlas
      mob/
        creeper.png            <-- custom creeper texture
      environment/
        clouds.png             <-- custom clouds
```

Files under `res/` mirror the vanilla paths. Any file you include here overrides the vanilla version. Everything else falls through to the default pack.

**Enable the debug pack:**

In `TexturePackRepository::addDebugPacks()`, uncomment the `FolderTexturePack` creation:

```cpp
void TexturePackRepository::addDebugPacks()
{
#ifndef _CONTENT_PACKAGE
    File *file = new File(L"DummyTexturePack");
    m_dummyTexturePack = new FolderTexturePack(
        FOLDER_TEST_TEXTURE_PACK_ID,
        L"FolderTestPack", file, DEFAULT_TEXTURE_PACK);
    texturePacks->push_back(m_dummyTexturePack);
    cacheById[m_dummyTexturePack->getId()] = m_dummyTexturePack;
#endif
}
```

**Select the pack:**

```cpp
skins->selectTexturePackById(TexturePackRepository::FOLDER_TEST_TEXTURE_PACK_ID);
```

Or set it as the default selected pack in the repository constructor for testing.

### Replacing standalone textures

For entity textures, particles, GUI elements, and other standalone files, just drop a PNG at the matching path in your texture pack folder. The `preLoaded[]` enum maps directly to file paths:

| Texture | Path |
|---------|------|
| Creeper | `res/mob/creeper.png` |
| Zombie | `res/mob/zombie.png` |
| Particles | `res/particles.png` |
| GUI | `res/gui/gui.png` |
| Clouds | `res/environment/clouds.png` |
| Sun | `res/terrain/sun.png` |

Keep the same dimensions as the originals. Most mob textures are 64x32 or 64x64.

---

## Part 6: How the Texture Pack System Works

Understanding the pack system helps when you want to do more than simple replacements.

### The class hierarchy

```
TexturePack (interface)
  +-- AbstractTexturePack (fallback logic, colour tables)
       +-- DefaultTexturePack   built-in vanilla textures
       +-- FolderTexturePack    loose files in a folder (dev/debug)
       +-- FileTexturePack      zip-based packs (mostly stubbed on console)
       +-- DLCTexturePack       DLC .pck-based packs (how real packs ship)
```

### TexturePack interface

The base interface is in `Minecraft.Client/TexturePack.h`. The key methods:

```cpp
class TexturePack
{
public:
    virtual bool hasData() = 0;
    virtual void load(Textures *textures) = 0;
    virtual void unload(Textures *textures) = 0;
    virtual InputStream *getResource(const wstring &name, bool allowFallback) = 0;
    virtual bool hasFile(const wstring &name, bool allowFallback) = 0;
    virtual BufferedImage *getImageResource(const wstring &File, ...) = 0;
    virtual ColourTable *getColourTable() = 0;
    // ...
};
```

- `getResource()` fetches raw data for a texture name
- `getImageResource()` returns a `BufferedImage` ready for GPU upload
- `hasFile()` checks if this pack contains a given texture

### The fallback chain

This is the most important concept. When `AbstractTexturePack::getResource()` is called, it checks if the current pack has the file. If not, it asks the fallback pack:

```cpp
InputStream *AbstractTexturePack::getResource(const wstring &name, bool allowFallback)
{
    InputStream *is = getResourceImplementation(name);
    if (is == NULL && fallback != NULL && allowFallback)
    {
        is = fallback->getResource(name, true);
    }
    return is;
}
```

Every non-default pack gets `DefaultTexturePack` as its fallback. So you only need to include the textures you want to change. Everything else falls through to vanilla automatically.

### DefaultTexturePack

This is the built-in vanilla pack. It always exists and is always ID `0`. It reads from the platform's base resource directory:

```cpp
// On Xbox:    "GAME:\\res\\TitleUpdate\\res" + name
// On PS3:     "/app_home/Common/res/TitleUpdate/res" + name
// On Windows: "Common\\res\\TitleUpdate\\res" + name
```

### FolderTexturePack

Reads loose files from a folder on disk. On Xbox, that is `GAME:\DummyTexturePack\res`. On other platforms, it is `Common\DummyTexturePack\res`. This is the easiest way to test texture replacements during development.

### DLCTexturePack

This is how real texture packs ship to players. DLC packs use the `.pck` format and the `DLCManager` system. A DLC texture pack has two `DLCPack` objects:

- `m_dlcInfoPack` has metadata: name, icon, description, localization strings
- `m_dlcDataPack` has the actual texture data, loaded on demand when the pack gets selected

DLC packs can include colour tables (`colours.col`), UI skins, audio banks, and game rules for mashup packs.

The data pack gets mounted from console DLC storage asynchronously:

```cpp
void DLCTexturePack::loadData()
{
    int mountIndex = m_dlcInfoPack->GetDLCMountIndex();
    if (mountIndex > -1)
    {
        StorageManager.MountInstalledDLC(
            ProfileManager.GetPrimaryPad(),
            mountIndex,
            &DLCTexturePack::packMounted, this, "TPACK");
    }
}
```

### TexturePackRepository

All packs are managed by `TexturePackRepository`. It holds a vector of all available packs and a hash map for lookup by ID. When you select a pack, it triggers `eAppAction_ReloadTexturePack`, which calls `Textures::reloadAll()` to clear everything and re-stitch from the new pack.

### Colour tables

Texture packs can include custom colour tables that change biome tinting across the entire game. The `ColourTable` class provides biome-specific color lookup for grass, foliage, water, sky, and fog. Mashup packs use colour tables to give the world a completely different feel.

If you want to change biome colors in your pack, create a `colours.col` binary file with one RGBA value per colour ID and include it in your pack.

See [Texture Packs](/slop-docs/modding/texture-packs/) for the full deep-dive on every pack type and the reload pipeline.

---

## Part 7: Common Pitfalls

These are the things that trip people up most often.

### Texture name mismatch

The string you pass to `setTextureName()` must **exactly** match the key you used in `loadUVs()`. If `loadUVs()` registers `L"oreRuby"` but you call `setTextureName(L"rubyOre")`, you will get the missingno purple-black checkerboard and a `__debugbreak()` in debug builds.

Fix: copy-paste the texture name string to make sure it is identical in both places.

### Forgetting to register UVs

If you override `registerIcons()` and call `registerIcon()` with a name that does not exist in the `texturesByName` map, the engine will crash (debug break in debug builds, undefined behavior in release). Every texture name you use in `registerIcon()` needs a matching entry in `loadUVs()`.

Fix: always add the `loadUVs()` entry before referencing the name anywhere else.

### Wrong atlas slot size

If you extend the atlas vertically, the slot size calculation changes. A common mistake is using `1.0f / 16.0f` for both width and height when the atlas is no longer square. The Aether client uses separate `slotW` and `slotH` variables for this reason.

Fix: use separate slot width and height variables when your atlas is not 16x16:

```cpp
float slotW = 1.0f / 16.0f;   // number of columns
float slotH = 1.0f / 19.0f;   // number of rows (if you added 3 rows)
```

### Atlas dimensions not a power of 2

The atlas width should stay a power of 2 (256 pixels for 16 columns of 16px tiles). The height does not strictly need to be a power of 2, but some platforms handle non-power-of-2 textures poorly. If you can, pad to the next power of 2 (e.g., 512 pixels tall) and adjust your slot count accordingly.

### Texture not showing up on entities

Entity textures are not on the atlas. If you added a `preLoaded[]` entry but the entity still renders white or invisible, check these things:

1. Did you add the `TEXTURE_NAME` enum entry?
2. Does the `preLoaded[]` path match the actual file location?
3. Is your renderer calling `textures->bindTexture()` with the right enum value?
4. Is the PNG file actually at the right path in the resource directory?

### Forgetting sendTileData()

If your block uses the `data` parameter in `getTexture(int face, int data)` for different visual states, you need `->sendTileData()` during registration. Without it, the data bits do not get synced to clients in multiplayer, and other players see the wrong texture.

### Platform pixel format differences

Xbox uses ARGB byte order. Other platforms use RGBA. If you are writing code that manipulates pixel data directly (not just providing PNG files), check the platform:

```cpp
// Xbox: ARGB
newPixels[i * 4 + 0] = (byte) a;
newPixels[i * 4 + 1] = (byte) r;
newPixels[i * 4 + 2] = (byte) g;
newPixels[i * 4 + 3] = (byte) b;

// Others: RGBA
newPixels[i * 4 + 0] = (byte) r;
newPixels[i * 4 + 1] = (byte) g;
newPixels[i * 4 + 2] = (byte) b;
newPixels[i * 4 + 3] = (byte) a;
```

### Memory limits on console

Console hardware has tight memory budgets. Keep replacement textures at the same resolution as the originals. Going higher resolution will eat into the memory budget fast, especially on PS3 and Vita.

### Stale cache after atlas changes

If you change the atlas image but do not rebuild the project, the old atlas may stay cached. Do a clean build after changing `terrain.png` or `items.png`.

---

## Quick Reference: Files You Will Touch

Here is every file involved in textures, at a glance:

| File | What you do there |
|------|-------------------|
| `terrain.png` | Paint block textures into atlas slots |
| `gui/items.png` | Paint item textures into atlas slots |
| `Minecraft.Client/PreStitchedTextureMap.cpp` | Register UV entries in `loadUVs()` |
| `Minecraft.Client/Textures.h` | Add `TEXTURE_NAME` enum entries for entities |
| `Minecraft.Client/Textures.cpp` | Add `preLoaded[]` paths for entity textures |
| `Minecraft.World/Tile.cpp` | Call `setTextureName()` during tile registration |
| `Minecraft.World/Item.cpp` | Call `setTextureName()` during item registration |
| Your tile `.h` / `.cpp` | Override `registerIcons()` and `getTexture()` |
| Your item `.h` / `.cpp` | Override `registerIcons()` if needed |
| Your renderer `.cpp` | Call `bindTexture()` for entity textures |
| `Minecraft.Client/TexturePackRepository.cpp` | Enable `FolderTexturePack` for testing |
| `cmake/Sources.cmake` | Add new source files to the build |

---

## Build and test

After making your texture changes, do a clean build to make sure the atlas gets rebuilt:

```bash
cmake --build build --config Release --clean-first
```

The `--clean-first` flag is important for atlas changes. Without it, the old atlas may stay cached and you will not see your new textures.

Once in-game, check for these common problems:

- **Purple-black checkerboard (missingno):** Texture name mismatch between `loadUVs()` and `setTextureName()`. Copy-paste the string to make sure it is identical.
- **White or invisible entity:** The `preLoaded[]` path does not match the actual file location, or `bindTexture()` is using the wrong enum value.
- **Texture on the wrong face:** Your `getTexture()` override has the face indices backwards. Check `Facing.h` for the constants: `DOWN=0, UP=1, NORTH=2, SOUTH=3, WEST=4, EAST=5`.
- **Squished or stretched texture:** Your atlas slot size calculation is wrong. If you extended the atlas vertically, use separate `slotW` and `slotH` variables.

## What to try next

Now that you understand how textures work in LCE, here are some good next steps:

- **Add a full block with texture.** Follow [Adding Blocks](/slop-docs/modding/adding-blocks/) and use what you learned here for the texture side. Try a multi-face block like a furnace or log.
- **Add a custom item with an icon.** Follow [Adding Items](/slop-docs/modding/adding-items/) and register your own item texture on the items atlas.
- **Add a custom mob with its own skin.** Follow [Adding Entities](/slop-docs/modding/adding-entities/) and set up the texture pipeline for a new entity.
- **Make an animated block texture.** Try creating a glowing ore that pulses, using the animation strip system.
- **Build a texture pack.** Set up a `FolderTexturePack` and replace a handful of vanilla textures to see the fallback system in action. Then read [Texture Packs](/slop-docs/modding/texture-packs/) for the full DLC pack format.
- **Experiment with biome tinting.** Create a custom grass-like block and set the `IS_GRASS_TOP` flag to see how biome colors affect your texture.

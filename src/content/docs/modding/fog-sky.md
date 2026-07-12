---
title: Fog & Sky
description: How fog colors, sky rendering, fog distance, and custom sky gradients work per dimension.
---

The fog and sky systems in LCE are responsible for the mood of each dimension. The Overworld gets warm sunrise gradients, the Nether gets thick red fog, and the End gets a dark purple haze. This page covers how all of that works and how to customize it.

## The Color Table

Before we get into the rendering, you need to know about the `ColourTable`. Instead of hardcoding colors, 4J made nearly all environment colors data-driven. They're loaded from binary color data files that ship with each texture pack.

The relevant color entries are defined in `ColourTable.cpp`:

```cpp
// ColourTable.cpp - fog and sky related entries
L"Sky_Ocean",
L"Sky_Plains",
L"Sky_Desert",
L"Sky_ExtremeHills",
L"Sky_Forest",
L"Sky_Taiga",
L"Sky_Swampland",
// ... one per biome ...

L"Sky_Dawn_Dark",      // sunrise dark color (horizon)
L"Sky_Dawn_Bright",    // sunrise bright color (zenith)

L"Default_Fog_Colour", // Overworld fog
L"Nether_Fog_Colour",  // Nether fog
L"End_Fog_Colour",     // End fog

L"Under_Water_Fog_Colour",
L"Under_Lava_Fog_Colour",
L"In_Cloud_Fog_Colour",
```

These are all loaded from binary data and looked up by name at runtime:

```cpp
// ColourTable.h
unsigned int getColour(eMinecraftColour id);
unsigned int getColor(eMinecraftColour id) { return getColour(id); }
```

Texture packs can override any of these colors, which is how mashup packs give each world a unique feel.

## Fog Color Per Dimension

Each dimension has its own `getFogColor()` method. Here's how they differ:

### Overworld

The Overworld fog color is based on time of day. It uses the `Default_Fog_Colour` from the color table, then modulates it by brightness:

```cpp
// Dimension.cpp
Vec3 *Dimension::getFogColor(float td, float a) const
{
    float br = Mth::cos(td * PI * 2) * 2 + 0.5f;
    if (br < 0.0f) br = 0.0f;
    if (br > 1.0f) br = 1.0f;

    unsigned int baseFogColour =
        Minecraft::GetInstance()->getColourTable()->getColor(
            eMinecraftColour_Default_Fog_Colour
        );

    float r = ((baseFogColour >> 16) & 0xff) / 255.0f;
    float g = ((baseFogColour >> 8) & 0xff) / 255.0f;
    float b = ((baseFogColour) & 0xff) / 255.0f;

    r *= br * 0.94f + 0.06f;
    g *= br * 0.94f + 0.06f;
    b *= br * 0.91f + 0.09f;

    return Vec3::newTemp(r, g, b);
}
```

The `td` parameter is the time of day (0.0 to 1.0). The cosine curve makes the fog brighter during the day and darker at night. Notice the blue channel gets a slightly different multiplier (`0.91f + 0.09f` vs `0.94f + 0.06f`), which keeps a faint blue tint even at night.

### Nether

The Nether has a flat, constant fog color with no day/night cycle:

```cpp
// HellDimension.cpp
Vec3 *HellDimension::getFogColor(float td, float a) const
{
    int colour = Minecraft::GetInstance()->getColourTable()->getColor(
        eMinecraftColour_Nether_Fog_Colour
    );

    byte redComponent = ((colour >> 16) & 0xFF);
    byte greenComponent = ((colour >> 8) & 0xFF);
    byte blueComponent = ((colour) & 0xFF);

    float rr = static_cast<float>(redComponent) / 256;
    float gg = static_cast<float>(greenComponent) / 256;
    float bb = static_cast<float>(blueComponent) / 256;

    return Vec3::newTemp(rr, gg, bb);
}
```

No brightness modulation, no time-of-day math. Just a flat color from the table. The default is a dark reddish-brown (`0x330808` or similar, depending on the texture pack).

The Nether's `getTimeOfDay()` returns `0.5f` (perpetual sunset/sunrise time), which is different from the End's `0.0f`. This doesn't affect the fog color since the Nether ignores the brightness curve, but it does matter for any code that reads the time of day value directly.

The Nether also reports `isFoggyAt()` as true everywhere, and has brighter ambient light:

```cpp
// HellDimension.cpp
void HellDimension::updateLightRamp()
{
    float ambientLight = 0.10f;  // vs 0.0f in Overworld
    for (int i = 0; i <= Level::MAX_BRIGHTNESS; i++)
    {
        float v = (1 - i / static_cast<float>(Level::MAX_BRIGHTNESS));
        brightnessRamp[i] =
            ((1 - v) / (v * 3 + 1)) * (1 - ambientLight) + ambientLight;
    }
}

bool HellDimension::isFoggyAt(int x, int z)
{
    return true;
}
```

### The End

The End's fog uses the color table but with a fixed low brightness, giving it that dark purple look:

```cpp
// TheEndDimension.cpp
Vec3 *TheEndDimension::getFogColor(float td, float a) const
{
    int fogColor = Minecraft::GetInstance()->getColourTable()->getColor(
        eMinecraftColour_End_Fog_Colour
    );

    float br = Mth::cos(td * PI * 2) * 2 + 0.5f;
    if (br < 0.0f) br = 0.0f;
    if (br > 1.0f) br = 1.0f;

    float r = ((fogColor >> 16) & 0xff) / 255.0f;
    float g = ((fogColor >> 8) & 0xff) / 255.0f;
    float b = ((fogColor) & 0xff) / 255.0f;

    // The key line: brightness is clamped very low
    r *= br * 0.0f + 0.15f;
    g *= br * 0.0f + 0.15f;
    b *= br * 0.0f + 0.15f;

    return Vec3::newTemp(r, g, b);
}
```

See that `br * 0.0f + 0.15f`? The brightness multiplier is literally zero, so `br` has no effect. The End always uses 15% of the base color.

Like the Nether, `TheEndDimension::isFoggyAt()` also returns `true`, so the End is always foggy with the same shortened fog distance formula.

The time of day is also fixed at 0.0:

```cpp
float TheEndDimension::getTimeOfDay(int64_t time, float a) const
{
    return 0.0f;  // always "midnight"
}
```

## Sunrise Colors

The Overworld has a special sunrise/sunset gradient. The `getSunriseColor()` method returns RGBA values when the sun is near the horizon:

```cpp
// Dimension.cpp
float *Dimension::getSunriseColor(float td, float a)
{
    unsigned int clr1 = Minecraft::GetInstance()->getColourTable()->getColor(
        eMinecraftColour_Sky_Dawn_Dark     // horizon color
    );
    unsigned int clr2 = Minecraft::GetInstance()->getColourTable()->getColor(
        eMinecraftColour_Sky_Dawn_Bright   // zenith color
    );

    // Convert to floats
    double r1 = ((clr1 >> 16) & 0xFF) / 255.0f;
    double g1 = ((clr1 >> 8) & 0xFF) / 255.0;
    double b1 = (clr1 & 0xFF) / 255.0;

    double r2 = ((clr2 >> 16) & 0xFF) / 255.0f;
    double g2 = ((clr2 >> 8) & 0xFF) / 255.0;
    double b2 = (clr2 & 0xFF) / 255.0;

    float span = 0.4f;
    float tt = Mth::cos(td * PI * 2) - 0.0f;
    float mid = -0.0f;

    if (tt >= mid - span && tt <= mid + span)
    {
        float aa = ((tt - mid) / span) * 0.5f + 0.5f;
        float mix = 1 - (((1 - sin(aa * PI))) * 0.99f);
        mix = mix * mix;

        sunriseCol[0] = (aa * (r2 - r1) + r1);
        sunriseCol[1] = (aa * (g2 - g1) + g1);
        sunriseCol[2] = (aa * (b2 - b1) + b1);
        sunriseCol[3] = mix;  // alpha/intensity
        return sunriseCol;
    }

    return nullptr;  // no sunrise effect right now
}
```

The sunrise color gets blended into the fog during `setupClearColor()`:

```cpp
// GameRenderer.cpp - setupClearColor()
float *c = level->dimension->getSunriseColor(level->getTimeOfDay(a), a);
if (c != nullptr)
{
    d *= c[3];
    fr = fr * (1 - d) + c[0] * d;
    fg = fg * (1 - d) + c[1] * d;
    fb = fb * (1 - d) + c[2] * d;
}
```

The End returns `nullptr` from `getSunriseColor()`, which means no sunrise effect at all.

## Sky Color

Sky color comes from the biome, not the dimension. Each biome has a `getSkyColor()` method that returns an RGB int based on temperature. The level blends this with brightness:

```cpp
// Level.cpp
Vec3 *Level::getSkyColor(shared_ptr<Entity> source, float a)
{
    float td = getTimeOfDay(a);
    float br = Mth::cos(td * PI * 2) * 2 + 0.5f;
    if (br < 0.0f) br = 0.0f;
    if (br > 1.0f) br = 1.0f;

    int xx = Mth::floor(source->x);
    int zz = Mth::floor(source->z);
    Biome *biome = getBiome(xx, zz);
    float temp = biome->getTemperature();
    int skyColor = biome->getSkyColor(temp);

    float r = ((skyColor >> 16) & 0xff) / 255.0f;
    float g = ((skyColor >> 8) & 0xff) / 255.0f;
    float b = ((skyColor) & 0xff) / 255.0f;
    r *= br;
    g *= br;
    b *= br;
    // ... rain/thunder darkening follows ...
}
```

The biome sky colors are also stored in the `ColourTable` with entries like `Sky_Plains`, `Sky_Desert`, `Sky_Forest`, etc.

## Fog Distance

The fog distance is set up in `GameRenderer::setupFog()`. It handles several cases:

```cpp
// GameRenderer.cpp
void GameRenderer::setupFog(int i, float alpha)
{
    // ... permission checks ...

    glFog(GL_FOG_COLOR, getBuffer(fr, fg, fb, 1));

    int t = Camera::getBlockAt(mc->level, player, alpha);

    if (player->hasEffect(MobEffect::blindness))
    {
        // Blindness: very short fog distance
        float distance = 5.0f;
        glFogi(GL_FOG_MODE, GL_LINEAR);
        glFogf(GL_FOG_START, distance * 0.25f);
        glFogf(GL_FOG_END, distance);
    }
    else if (isInClouds)
    {
        // Inside clouds: exponential fog
        glFogi(GL_FOG_MODE, GL_EXP);
        glFogf(GL_FOG_DENSITY, 0.1f);
    }
    else if (t > 0 && Tile::tiles[t]->material == Material::water)
    {
        // Underwater: exponential fog, affected by enchantments
        glFogi(GL_FOG_MODE, GL_EXP);
        if (player->hasEffect(MobEffect::waterBreathing))
            glFogf(GL_FOG_DENSITY, 0.05f);
        else
            glFogf(GL_FOG_DENSITY,
                0.1f - (EnchantmentHelper::getOxygenBonus(player) * 0.03f));
    }
    else if (t > 0 && Tile::tiles[t]->material == Material::lava)
    {
        // In lava: very thick fog
        glFogi(GL_FOG_MODE, GL_EXP);
        glFogf(GL_FOG_DENSITY, 2.0f);
    }
    else
    {
        // Normal: linear fog based on render distance
        float distance = renderDistance;

        // Bedrock fog effect near y=0
        if (!mc->level->dimension->hasCeiling)
        {
            if (mc->level->dimension->hasBedrockFog() && !creative)
            {
                // Reduces fog distance near bedrock level
                double yy = /* light and position calculation */;
                if (yy < 1)
                {
                    if (yy < 0) yy = 0;
                    yy = yy * yy;
                    float dist = 100 * static_cast<float>(yy);
                    if (dist < 5) dist = 5;
                    if (distance > dist) distance = dist;
                }
            }
        }

        glFogi(GL_FOG_MODE, GL_LINEAR);
        glFogf(GL_FOG_START, distance * 0.25f);
        glFogf(GL_FOG_END, distance);
    }
}
```

Bedrock fog can be toggled off by the host through the `eGameHostOption_BedrockFog` option:

```cpp
// Dimension.cpp
bool Dimension::hasBedrockFog()
{
    if (app.GetGameHostOption(eGameHostOption_BedrockFog) == 0)
        return false;
    return (levelType != LevelType::lvl_flat && !hasCeiling);
}
```

## Adding a Custom Dimension's Fog

If you're adding a [custom dimension](/slop-docs/modding/custom-dimensions/), you need to override `getFogColor()` in your dimension class. Here's a template:

```cpp
// MyDimension.h
class MyDimension : public Dimension
{
public:
    virtual void init();
    virtual Vec3 *getFogColor(float td, float a) const;
    virtual float getTimeOfDay(int64_t time, float a) const;
    virtual bool isFoggyAt(int x, int z);
};

// MyDimension.cpp
Vec3 *MyDimension::getFogColor(float td, float a) const
{
    // A teal fog that pulses slightly with time
    float pulse = Mth::sin(td * PI * 4) * 0.1f + 0.9f;
    float r = 0.1f * pulse;
    float g = 0.5f * pulse;
    float b = 0.5f * pulse;
    return Vec3::newTemp(r, g, b);
}

float MyDimension::getTimeOfDay(int64_t time, float a) const
{
    // Slow day cycle (2x normal length)
    int dayStep = static_cast<int>(time % (Level::TICKS_PER_DAY * 2));
    return (dayStep + a) / (Level::TICKS_PER_DAY * 2);
}

bool MyDimension::isFoggyAt(int x, int z)
{
    return false;  // or true for thick fog everywhere like the Nether
}
```

## Changing Fog via Texture Packs

The easiest way to change fog colors without touching code is through the `ColourTable`. Texture packs include a binary color data file that overrides the default colors. The `ColourTable` constructor supports layering:

```cpp
// ColourTable constructor that layers on top of defaults
ColourTable::ColourTable(ColourTable *defaultColours, PBYTE pbData, DWORD dwLength)
{
    // Start with default colors
    XMemCpy((void *)m_colourValues,
            (void *)defaultColours->m_colourValues,
            sizeof(int) * eMinecraftColour_COUNT);
    // Override with pack-specific colors
    loadColoursFromData(pbData, dwLength);
}
```

So a texture pack only needs to include the colors it wants to change. Everything else falls back to the default.

## The Full Rendering Pipeline

The fog and sky colors don't just come from one place. They go through a multi-step blending process in `GameRenderer::setupClearColor()`. Here's the full flow, step by step:

### Step 1: Get the base colors

```cpp
Vec3 *skyColor = level->getSkyColor(mc->cameraTargetPlayer, a);
Vec3 *fogColor = level->getFogColor(a);
```

Sky color comes from the biome (temperature-based). Fog color comes from the dimension.

### Step 2: Blend sunrise into the fog

If the view distance is low enough (less than 2) and the player is looking toward the sun, the sunrise color gets blended in:

```cpp
float *c = level->dimension->getSunriseColor(level->getTimeOfDay(a), a);
if (c != NULL) {
    d *= c[3];  // scale by sunrise alpha/intensity
    fr = fr * (1 - d) + c[0] * d;
    fg = fg * (1 - d) + c[1] * d;
    fb = fb * (1 - d) + c[2] * d;
}
```

The `d` factor is the dot product between the player's view direction and the sun's position. So the sunrise effect is strongest when you look directly at it.

### Step 3: Mix fog toward sky color

The fog gets pulled toward the sky color based on the view distance setting. At shorter render distances, the fog is more distinct from the sky. At longer distances, they blend together:

```cpp
float whiteness = 1.0f / (4 - mc->options->viewDistance);
whiteness = 1 - pow(whiteness, 0.25);

fr += (sr - fr) * whiteness;
fg += (sg - fg) * whiteness;
fb += (sb - fb) * whiteness;
```

### Step 4: Rain and thunder darkening

Rain reduces both fog and sky brightness. Thunder makes it even darker:

```cpp
float rainLevel = level->getRainLevel(a);
if (rainLevel > 0) {
    fr *= 1 - rainLevel * 0.5f;
    fg *= 1 - rainLevel * 0.5f;
    fb *= 1 - rainLevel * 0.4f;  // blue gets less reduction
}

float thunderLevel = level->getThunderLevel(a);
if (thunderLevel > 0) {
    float ba = 1 - thunderLevel * 0.5f;
    fr *= ba;
    fg *= ba;
    fb *= ba;
}
```

Notice that rain preserves a bit more blue than red/green (0.4 vs 0.5). This gives rainy skies a slightly blue-gray tint.

### Step 5: Override for special camera positions

If the camera is inside clouds, underwater, or in lava, the fog color gets completely replaced:

```cpp
if (isInClouds) {
    Vec3 *cc = level->getCloudColor(a);
    fr = cc->x;  fg = cc->y;  fb = cc->z;
}
else if (t == Material::water) {
    // Use ColourTable eMinecraftColour_Under_Water_Clear_Colour
}
else if (t == Material::lava) {
    // Use ColourTable eMinecraftColour_Under_Lava_Clear_Colour
}
```

These are separate color table entries from the fog colors. The "clear color" entries control what the background looks like. The "fog color" entries (used in `setupFog`) control the distance fade.

### Step 6: Height-based darkness

The player's Y position gets scaled by `getClearColorScale()` (which returns 1/32 for the Overworld). This makes everything darker when you're deep underground:

```cpp
double yy = player->y * level->dimension->getClearColorScale();
if (yy < 1) {
    if (yy < 0) yy = 0;
    yy = yy * yy;
    fr *= yy;  fg *= yy;  fb *= yy;
}
```

At y=0 (bedrock level), multiplied by 1/32, `yy` is 0, so the fog is completely black. At y=32, `yy` is 1 and there's no darkening. The squaring (`yy * yy`) makes the transition gradual.

Flat worlds are an exception: `getClearColorScale()` returns `1.0` instead of `1.0/32.0` for flat worlds. This means the height-based darkness effect doesn't apply in flat worlds, since any positive Y position will produce `yy >= 1`.

### Step 7: Blindness effect

If the player has the blindness status effect, the fog dims to black over 20 ticks:

```cpp
if (player->hasEffect(MobEffect::blindness)) {
    int duration = player->getEffect(MobEffect::blindness)->getDuration();
    if (duration < 20)
        yy = yy * (1.0f - duration / 20.0f);
    else
        yy = 0;
}
```

### Step 8: Night vision effect

Night vision does the opposite of blindness. It finds the brightest color channel and scales all channels up so the brightest one hits 1.0:

```cpp
if (player->hasEffect(MobEffect::nightVision)) {
    float scale = getNightVisionScale(mc->player, a);
    float dist = FLT_MAX;
    if (fr > 0 && dist > 1.0f / fr) dist = 1.0f / fr;
    if (fg > 0 && dist > 1.0f / fg) dist = 1.0f / fg;
    if (fb > 0 && dist > 1.0f / fb) dist = 1.0f / fb;
    fr = fr * (1 - scale) + (fr * dist) * scale;
    fg = fg * (1 - scale) + (fg * dist) * scale;
    fb = fb * (1 - scale) + (fb * dist) * scale;
}
```

### Step 9: Anaglyph 3D

If anaglyph 3D mode is enabled, the colors get remixed for red-cyan glasses. This is a console-era feature:

```cpp
if (mc->options->anaglyph3d) {
    float frr = (fr * 30 + fg * 59 + fb * 11) / 100;
    float fgg = (fr * 30 + fg * 70) / 100;
    float fbb = (fr * 30 + fb * 70) / 100;
    fr = frr;  fg = fgg;  fb = fbb;
}
```

### Step 10: Apply

Finally, `glClearColor(fr, fg, fb, 0.0f)` sets the background clear color that everything renders on top of.

## setupFog: The Distance Settings

After `setupClearColor` determines the color, `setupFog` determines how far away the fog starts and ends. The fog color is passed to OpenGL with `glFog(GL_FOG_COLOR, ...)`, then the mode and distance are set based on the camera situation.

### Fog modes

| Situation | Mode | Start | End/Density |
|---|---|---|---|
| Blindness | `GL_LINEAR` | distance * 0.25 | 5.0 (grows as effect wears off) |
| In clouds | `GL_EXP` | n/a | density 0.1 |
| Underwater | `GL_EXP` | n/a | density 0.1 (or 0.05 with Water Breathing) |
| In lava | `GL_EXP` | n/a | density 2.0 (very thick) |
| Normal | `GL_LINEAR` | distance * 0.25 | renderDistance |
| Foggy biome (`isFoggyAt`) | `GL_LINEAR` | distance * 0.05 | min(distance, 192) * 0.5 |

The `isFoggyAt` check comes from the dimension. The Nether returns `true` everywhere, which is why the Nether has that thick fog that cuts visibility short. The distance formula `min(distance, 16 * 16 * 0.75) * 0.5` caps at 96 blocks even on max render distance.

### Cloud fog color

Clouds use a separate color table entry:

```cpp
unsigned int colour = getColourTable()->getColor(
    eMinecraftColour_In_Cloud_Fog_Colour);
```

This is why flying through clouds has a different tint than normal fog.

### Underwater and lava fog colors

These also come from the colour table:

| Entry | Used for |
|---|---|
| `eMinecraftColour_Under_Water_Fog_Colour` | Underwater fog distance color |
| `eMinecraftColour_Under_Water_Clear_Colour` | Underwater background clear color |
| `eMinecraftColour_Under_Lava_Fog_Colour` | Lava fog distance color |
| `eMinecraftColour_Under_Lava_Clear_Colour` | Lava background clear color |

Notice there are separate entries for "fog" and "clear" for both water and lava. The fog entry is used in `setupFog` (distance-based fade), while the clear entry is used in `setupClearColor` (the background fill). They can be different colors in a texture pack.

## The Full ColourTable

The `ColourTable` has 277 named color entries (276 colors + 1 `NOTSET` sentinel). The `eMinecraftColour_COUNT` is 277. Here are all the ones relevant to fog and sky:

### Per-biome colors

Each biome gets dedicated color entries, but the counts aren't the same across all four categories:

| Pattern | Example | Purpose | Entries |
|---|---|---|---|
| `Foliage_{BiomeName}` | `Foliage_Plains` | Leaf block tint | 27 (23 biome-specific + Evergreen, Birch, Default, Common) |
| `Grass_{BiomeName}` | `Grass_Plains` | Grass block tint | 24 (23 biome-specific + Common) |
| `Water_{BiomeName}` | `Water_Plains` | Water tint | 23 |
| `Sky_{BiomeName}` | `Sky_Plains` | Sky color | 23 |

This gives 97 total biome-related color entries.

### Environment colors

| Entry | Purpose |
|---|---|
| `Sky_Dawn_Dark` | Sunrise horizon color |
| `Sky_Dawn_Bright` | Sunrise zenith color |
| `Default_Fog_Colour` | Overworld fog base |
| `Nether_Fog_Colour` | Nether fog (flat, constant) |
| `End_Fog_Colour` | End fog (15% brightness) |
| `Under_Water_Fog_Colour` | Underwater distance fog |
| `Under_Water_Clear_Colour` | Underwater background |
| `Under_Lava_Fog_Colour` | Lava distance fog |
| `Under_Lava_Clear_Colour` | Lava background |
| `In_Cloud_Fog_Colour` | Inside-cloud fog |

### How texture packs override colors

The `ColourTable` constructor supports layering. When a texture pack is loaded, it starts from the default colors and overwrites only the entries it includes:

```cpp
ColourTable::ColourTable(ColourTable *defaultColours,
                         PBYTE pbData, DWORD dwLength) {
    // Copy all defaults
    XMemCpy(m_colourValues, defaultColours->m_colourValues,
            sizeof(int) * eMinecraftColour_COUNT);
    // Override with pack-specific data
    loadColoursFromData(pbData, dwLength);
}
```

The binary color data is a packed format that maps string names to ARGB values. A mashup pack only needs to include the colors it changes. Everything else stays at the default.

## Time of Day Math

The time-of-day value drives the brightness curve for fog, sky, and sunrise. Here's how it works in detail.

The Overworld keeps a tick counter. One full day is `Level::TICKS_PER_DAY` ticks (24000). The float time is:

```cpp
float Dimension::getTimeOfDay(int64_t time, float a) const {
    int dayStep = (int)(time % Level::TICKS_PER_DAY);
    return (dayStep + a) / Level::TICKS_PER_DAY;
}
```

This gives a 0.0 to 1.0 value that resets every day. The `a` parameter is a partial tick fraction for smooth animation.

The brightness curve is:

```cpp
float br = Mth::cos(td * PI * 2) * 2 + 0.5f;
if (br < 0.0f) br = 0.0f;
if (br > 1.0f) br = 1.0f;
```

At `td = 0.0` (noon), `cos(0) = 1.0`, so `br = 2.5`, clamped to `1.0`. Full brightness.
At `td = 0.25` (sunset), `cos(PI/2) = 0`, so `br = 0.5`. Half brightness.
At `td = 0.5` (midnight), `cos(PI) = -1.0`, so `br = -1.5`, clamped to `0.0`. Complete darkness.
At `td = 0.75` (sunrise), `cos(3PI/2) = 0`, so `br = 0.5`. Half brightness again.

The End ignores all of this. It multiplies by `br * 0.0 + 0.15`, which is always 0.15 regardless of time. And its `getTimeOfDay()` always returns 0.0.

The Nether doesn't use the brightness curve at all. It just reads the flat color from the table and divides by 256 (note: 256 not 255, which makes the colors slightly darker than you'd expect from the raw hex values).

## Key Files

| File | What it does |
|---|---|
| `Dimension.h/.cpp` | Base fog/sky methods, Overworld sunrise, getClearColorScale() |
| `HellDimension.cpp` | Nether fog color, light ramp, isFoggyAt() always true |
| `TheEndDimension.cpp` | End fog color (fixed 15% brightness), fixed time of day |
| `GameRenderer.cpp` | `setupClearColor()` (full color pipeline), `setupFog()` (distance settings) |
| `Level.cpp` | `getSkyColor()` (biome-based, brightness-modulated) |
| `ColourTable.h/.cpp` | Data-driven color system with 277 named entries |
| `Biome.h/.cpp` | Per-biome sky colors via ColourTable lookups |
| `NormalDimension.h` | Overworld dimension (inherits everything from Dimension) |
| `AetherDimension.cpp` | Custom fog example: blue fog (0.62, 0.80, 1.0), permanent day |

---
title: Localization
description: The neoLegacy string and translation system — the loc XML assets, the CMake codegen that turns them into IDS_ defines, and how an IDS_ id becomes on-screen text in both the Iggy and classic GUI stacks.
---

Every piece of user-facing text in the client is a **string id** of the form
`IDS_SOMETHING`. Those ids live in XML files under
`Minecraft.Client/Windows64Media/loc/`, get compiled into numeric `#define`s at
build time, and are resolved to translated `wstring`s at runtime through the
`StringTable`. This page walks the pipeline: asset layout, the two CMake code
generators, the runtime resolution chain, CJK font handling, and a modder
how-to for adding or translating a string.

The system was rebuilt from the original binary `.loc` format to plain XML by
Fireblade — see `// Fireblade - switched from locs to xmls` at the top of
`Minecraft.Client/StringTable.cpp`.

## Asset layout

All English base strings and the eight shipped translations live under one
directory:

`Minecraft.Client/Windows64Media/loc/`

### English base files

The base (English) strings sit directly in `loc/`. Each is a plain
`<root>` XML document of `<data name="IDS_...">` entries:

```xml
<root>
	<data name="IDS_TIPS_GAMETIP_NEWDLC">
		<value>New Downloadable Content is available! Access it from the Minecraft Store button on the Main Menu.</value>
	</data>
</root>
```

| File | Contents |
|------|----------|
| `stringsGeneric.xml` | The bulk of the game text (~9,700 lines): gameplay tips, menu labels, item/tile names, achievements, messages. |
| `stringsPlatformSpecific.xml` | Text that varies by console (split-screen counts, controller wording, forum blurbs). |
| `4J_stringsGeneric.xml` | 4J Studios' generic UI strings — `IDS_OK`, `IDS_BACK`, `IDS_NULL` ("Not Used"), etc. |
| `4J_stringsPlatformSpecific.xml` | 4J platform strings — storage-device errors, save overwrite prompts. |
| `AdditionalStrings.xml` | Later additions — mash-up world toggles, tooltips, `IDS_GAMENAME`. |
| `extra.xml` | A handful of neoLegacy/backport extras (`IDS_INCREASE_WORLD_SIZE`, world-size overwrite options). |
| `stringsDynafont.xml` | The single `IDS_DYNAFONT` attribution string ("DynaFont developed by DynaComware."). |
| `stringsLanguages.xml` | Language display names (`IDS_LANG_ENGLISH`, `IDS_LANG_GERMAN`, …) shown in the language selector. |
| `stringsLeaderboards.xml` | Leaderboard category labels (`IDS_LEADERBOARD_KILLS_EASY`, …). |
| `stringsRichPresence.xml` | Rich-presence status strings (`IDS_RICHPRESENCE_IDLE`, `IDS_RICHPRESENCE_MENUS`, …). |
| `EULA.xml` | The end-user licence agreement text under `IDS_EULA`. |

### Translated language directories

Eight locale sub-directories carry the translations:

`de-DE` · `es-ES` · `fr-FR` · `it-IT` · `ja-JP` · `ko-KR` · `pt-BR` · `zh-CHT`

Each holds the subset of files that were translated:

```
loc/de-DE/
	4J_stringsGeneric.xml
	4J_stringsPlatformSpecific.xml
	stringsGeneric.xml
	stringsLeaderboards.xml
	stringsPlatformSpecific.xml
	strings.lang
```

The translated XMLs use exactly the same `<data name="IDS_...">` structure as
the base — only the `<value>` text differs:

```xml
<data name="IDS_TIPS_GAMETIP_NEWDLC">
	<value>Es sind neue Inhalte zum Herunterladen verfügbar! …</value>
</data>
```

> **`strings.lang` is not loaded.** Each locale dir also contains a
> `strings.lang` file which, despite the extension, is XML-formatted. The
> loader only accepts files ending in `.xml` (see `IsXmlFileName` in
> `Minecraft.Client/StringTable.cpp`), so `strings.lang` is ignored at runtime.
> Treat it as a legacy leftover — put real translations in the `.xml` files.

Files: `Minecraft.Client/Windows64Media/loc/` and its eight locale
sub-directories.

## Build-time codegen

Two CMake scripts turn the XML into compilable headers. Neither is invoked by
hand — they run as custom build steps wired into the client target.

### 1. XML → `strings.h` (numeric defines)

`cmake/GenerateStringsHeaderFromXml.cmake` globs every `*.xml` under the loc
root, extracts each unique `name="IDS_..."`, sorts, and emits one `#define` per
id with a sequential integer:

```c
#pragma once
// Auto-generated from localization XML. Do not edit manually.
// Total strings: 2573

#define IDS_ACHIEVEMENTS 0
#define IDS_ACHIEVEMENT_VIEW 1
#define IDS_ACHIEVE_DESC_ACQUIRE_HARDWARE 2
…
#define IDS_ZOMBIE_HORSE 2572
```

Numbering rules, straight from the script:

- Ids are collected from **all** XML files (base + every locale dir), then
  deduplicated, then `list(SORT)`ed alphabetically. The alphabetical order is
  what fixes each id's integer.
- The Windows64 build starts numbering at **0** (`_max_id` begins at `-1`,
  first id gets `0`).
- The script supports a `BASE_HEADER` argument: if given an existing header, it
  reuses those ids and appends new ones after the current maximum (this is the
  "`BASE_HEADER` continuation" mode, letting a platform keep a stable numbering
  while new strings extend it). **The Windows64 build does not pass
  `BASE_HEADER`** — see the `add_custom_command` in
  `Minecraft.Client/CMakeLists.txt`, which passes only `XML_ROOT` and
  `OUTPUT_FILE`. So on Windows the ids are re-derived alphabetically from
  scratch every configure.

The output lands at `${CMAKE_BINARY_DIR}/generated/Windows64Media/strings.h`
(referenced via `MINECRAFT_CLIENT_COMPILETIME_STRINGS_HEADER`). Because ids are
position-dependent, **adding a string can renumber every id after it
alphabetically** — harmless, because the numbers are never persisted and the
string key stays authoritative at runtime (see below).

Wiring (`Minecraft.Client/CMakeLists.txt`):

```cmake
add_custom_command(
  OUTPUT "${MINECRAFT_CLIENT_COMPILETIME_STRINGS_HEADER}"
  COMMAND ${CMAKE_COMMAND}
    "-DXML_ROOT=.../Windows64Media/loc"
    "-DOUTPUT_FILE=${MINECRAFT_CLIENT_COMPILETIME_STRINGS_HEADER}"
    -P ".../cmake/GenerateStringsHeaderFromXml.cmake"
  DEPENDS ${MINECRAFT_CLIENT_WINDOWS_LOCALIZATION_XML} …
)
add_custom_target(GenerateStringsHeader_Minecraft.Client DEPENDS …)
add_dependencies(Minecraft.Client GenerateStringsHeader_Minecraft.Client)
```

The XML glob uses `CONFIGURE_DEPENDS`, so touching any loc XML re-triggers
codegen on the next build without re-running CMake by hand.

### 2. `strings.h` → `StringIdLookup.generated.inc` (reverse switch)

`cmake/GenerateStringIdLookup.cmake` reads the generated `strings.h` and emits a
`switch`-body fragment that maps each numeric id **back to its `IDS_` key
string**:

```c
// Auto-generated by cmake/GenerateStringIdLookup.cmake.
#ifdef IDS_ACHIEVEMENTS
case IDS_ACHIEVEMENTS: return L"IDS_ACHIEVEMENTS";
#endif
#ifdef IDS_ACHIEVEMENT_VIEW
case IDS_ACHIEVEMENT_VIEW: return L"IDS_ACHIEVEMENT_VIEW";
#endif
…
```

It is wired in the root `CMakeLists.txt` (output
`generated/StringIdLookup.generated.inc`, `HEADER_LIST` = the generated
`strings.h`) and depends on the strings-header target. The `.inc` is
`#include`d inside a `switch` in the client (see runtime), and the generator
fatally errors if it finds zero `IDS_` defines. Both generators are
`add_dependencies` of `Minecraft.Client` (and `Minecraft.Server` /
`Minecraft.World` where relevant), so the chain runs before compilation.

## Runtime resolution

### Loading the table

`CMinecraftApp::loadStringTable()`
(`Minecraft.Client/Common/Consoles_App.cpp`) builds the live `StringTable`. On
Windows64 it probes three candidate directories in order and takes the first
that yields usable strings:

```cpp
const wstring localisationCandidates[] =
{
	L"Common\\Localization",
	L"Windows64Media\\loc",
	L"..\\Minecraft.Client\\Windows64Media\\loc"
};
```

For each it constructs `StringTable(folder)`, checks for `IDS_OK` by key **and**
by index, and keeps the first that has them. If none work it falls back to the
legacy binary `languages.loc` inside the media archive, and finally asserts if
even that is missing.

### Language selection

Which translation loads is decided inside
`StringTable::ProcessXmlStringTableData`:

1. `ProcessXmlDirectory(root)` loads every base `*.xml` (English) first.
2. `app.getLocale(locales)` returns an **ordered fallback list** of locale
   directory names for the current language.
3. The loader walks that list and loads the **first** matching sub-directory
   (`root\<locale>`) that exists, then stops.

Because the base English files are loaded first and each locale file only
**overwrites** the keys it defines (`m_stringsMap[id] = value` in
`setStringValue`), any id a translation omits automatically keeps its English
value. That is the fallback mechanism — there is no separate "missing
translation" branch; untranslated ids simply retain the base string.

`CMinecraftApp::getLocale` (`Consoles_App.cpp`) always appends the safety net:

```cpp
locales.push_back(eMCLang_enUS);
locales.push_back(eMCLang_null);
```

so English (`en-US`) and the null locale (`en-EN`) are the last resorts. The
locale enum → directory-name map is set in
`CMinecraftApp::LocaleAndLanguageInit` (`m_localeA[eMCLang_deDE] = L"de-DE"`,
`m_localeA[eMCLang_zhCHT] = L"zh-CHT"`, etc.).

The current language/locale come from `XGetLanguage()` / `XGetLocale()`. The
in-game **language selector**, `UIScene_LanguageSelector`
(`Minecraft.Client/Common/UI/UIScene_LanguageSelector.cpp`), lists one button
per available language (its `m_uiHTPButtonNameA` array is the `IDS_LANG_*`
labels from `stringsLanguages.xml`). Picking one calls
`app.SetMinecraftLanguage` / `app.SetMinecraftLocale`, flags a reload, and on
the next `tick()` calls `app.loadStringTable()` to swap the table and reloads
the movie.

### XML parsing

`StringTable` parses each file with a SAX callback
(`XmlStringTableCallback`), reading the `data` element's `name` attribute as the
id and the `value` element's text as the string. If the SAX parse fails or
yields no new keys, it falls back to a hand-rolled `<data …><value>…</value>`
scanner (`ProcessXmlFileLoose`) that also decodes `&lt; &gt; &quot; &apos;
&amp;`. Files within a directory are sorted before loading, so load order is
deterministic.

### From `IDS_` id to on-screen text

The bridge between the compile-time number and the runtime table is
`CMinecraftApp::GetString(int)` in `Consoles_App.cpp`. There are two overloads —
one taking the numeric id, one taking the key string directly:

```cpp
LPCWSTR CMinecraftApp::GetString(int iID)
{
    if (app.m_stringTable == nullptr)
    {
        const wchar_t *key = ResolveStringKeyFromId(iID);
        return key != nullptr ? key : L"";
    }

    LPCWSTR byIndex = app.m_stringTable->getString(iID);   // vector lookup
    if (byIndex != nullptr && byIndex[0] != L'\0')
        return byIndex;

    const wchar_t *key = ResolveStringKeyFromId(iID);       // int -> "IDS_..."
    if (key != nullptr)
    {
        LPCWSTR byKey = app.m_stringTable->getString(key);  // map lookup
        if (byKey != nullptr && byKey[0] != L'\0')
            return byKey;
        return key;   // visible fallback: show the key name, not empty text
    }
    return L"";
}
```

`ResolveStringKeyFromId` is where the generated `.inc` is used — it is a
`switch(iID)` whose body is `#include "StringIdLookup.generated.inc"` (guarded
by `#ifdef _WINDOWS64`). So a numeric id is turned back into its `IDS_` key,
and that key is looked up in the map. This double lookup is what makes the
numbering non-fragile: even if the compile-time number and the table index
disagree, resolution falls through to the stable string key.

Inside `StringTable` (`StringTable.h` / `.cpp`):

- `getString(const wstring &id)` — the primary path — looks up
  `m_stringsMap` (an `unordered_map<wstring,wstring>`). On a miss it returns the
  **id itself** as a visible fallback.
- `getString(int id)` indexes `m_stringsVec` (only populated by the legacy
  binary `.loc` "static" format; empty in XML mode, so the int path returns
  `L""` and resolution proceeds to the key lookup above).
- `WstringLookup` (`WstringLookup.h/.cpp`) is a companion bidirectional
  `wstring ⇄ UINT` map used by the binary-table path.

Both GUI stacks funnel through `GetString`:

- **Iggy / Scaleform UI** (the `UIScene`s, see
  [UI System](/slop-docs/client/ui-system/) and
  [Screens](/slop-docs/client/screens/)). `UIString`
  (`Minecraft.Client/Common/UI/UIString.cpp`) wraps a lazily-evaluated
  `StringBuilder`; the `IdsStringBuilder` variant simply calls
  `app.GetString(m_ids)`. `UIString::setCurrentLanguage()` reads
  `XGetLanguage()/XGetLocale()` and reports when the language changed so scenes
  can rebuild their text.
- **Classic (`Minecraft.World`) stack.** Item/tile names come from
  `getDescriptionId()` (returns an `unsigned int` `IDS_` id, e.g.
  `Tile.h:823`), resolved through `app.GetString(id)` at draw sites like
  `UIScene_DebugOverlay.cpp` and `Minecraft.cpp`. Note the `Language` / `I18n`
  classes in `Minecraft.World/Language.cpp` are **stubs** — `getElementName`
  returns its argument unchanged — so translation flows through `StringTable`,
  not through a separate `I18n` catalogue.

### Fonts

Latin text uses the Mojangles bitmap font; CJK languages need a TrueType font
with the right glyph coverage, handled in `UIController`
(`Minecraft.Client/Common/UI/UIController.cpp`):

- `getFontForLanguage(int)` maps `XC_LANGUAGE_JAPANESE`/`TCHINESE`/`KOREAN` (and
  `SCHINESE` on Durango) to an `EFont` enum; everything else is `eFont_Bitmap`.
- `SetupFont()` runs on language change: it reloads the string table, and if the
  target font differs it swaps fonts. Bitmap languages register
  `UIBitmapFont(SFontData::Mojangles_7/Mojangles_11)`; CJK builds a `UITTFFont`
  via `createFont()` and redirects Iggy's `Mojangles7`/`Mojangles11` logical
  fonts to the TTF with `IggyFontSetIndirectUTF8`.
  The Windows64 CJK fonts (`createFont`) are
  `Common/Media/font/JPN/DFGMaruGothic-Md.ttf`, `.../CHT/DFHeiMedium-B5.ttf`,
  and `.../KOR/BOKMSD.ttf`.
- A **global fallback** bitmap font (`UIUnicodeBitmapFont
  "Mojangles_Unicode_Bitmap"`) is registered in `postInit()` via
  `IggyFontSetFallbackFontUTF8`, covering CJK/Thai/Arabic glyphs the Mojangles
  bitmap sheet lacks. If a TTF fails to load, `SetupFont` logs and falls back to
  the Mojangles bitmaps.
- `IDS_DYNAFONT` (from `stringsDynafont.xml`) is the DynaComware attribution in
  the credits (`UIScene_Credits.cpp`); the CJK glyph handling is the TTF path.

The classic `Font` class (`Minecraft.Client/Font.h`) renders in-world text
(chat, signs, debug HUD). It keeps its own glyph sheets — an ASCII sheet plus
256 unicode glyph pages (`unicodeTexID[256]`, `unicodeWidth[65536]`) — and
handles `§` colour/format codes, rendering the resolved `wstring` after
`GetString`, downstream of the same lookup.

## How-to: add and translate a string (for modders)

### Add a new string

1. **Add the English base entry.** Pick the right base file (usually
   `stringsGeneric.xml`) and add a `<data>` block:

   ```xml
   <data name="IDS_TILE_MY_BLOCK">
   	<value>My Block</value>
   </data>
   ```

   Keep the `IDS_` prefix — the codegen regex only picks up
   `name="IDS_[A-Za-z0-9_]+"`.

2. **Reference it in code by its `IDS_` symbol.** After a build the id exists as
   a `#define` (e.g. `->setDescriptionId(IDS_TILE_MY_BLOCK)`; see the strings
   step in [Adding Blocks](/slop-docs/modding/adding-blocks/)). No manual number
   assignment — the generator numbers it alphabetically.

3. **Rebuild.** The `CONFIGURE_DEPENDS` glob re-runs
   `GenerateStringsHeaderFromXml` and `GenerateStringIdLookup`, regenerating
   `strings.h` and the lookup `.inc`. You do not edit any generated file by
   hand.

### Translate it per language

Add the **same** `IDS_` id with a translated `<value>` to the matching file
inside the locale dir(s), e.g. `loc/de-DE/stringsGeneric.xml`:

```xml
<data name="IDS_TILE_MY_BLOCK">
	<value>Mein Block</value>
</data>
```

Only translate the languages you can; the file/id must match so the locale value
overwrites the English one when that language loads.

### Missing-translation behaviour (verified)

- **Untranslated id, translated language selected:** the base English value
  loaded first is kept (locale files only overwrite ids they contain).
- **Unknown id entirely (not in any XML):** `StringTable::getString(key)`
  misses the map and returns the **id string itself**
  (`m_missingKeyFallback = id`), and `GetString(int)` likewise returns the key
  name — so you see the literal `IDS_...` text on screen rather than blank
  space. That visible fallback is deliberate ("Prefer visible fallback text
  instead of returning an empty string").

### Gotchas

- **A stable release only fires on a `BUMP` change.** The stable workflow
  (`.github/workflows/stable.yml`) is triggered by `paths: - 'BUMP'` only.
  Editing loc XML alone will **not** cut a release — you must also bump the
  version in `BUMP`. Conversely, note there is **no** path filter that excludes
  loc from the build itself: the CMake glob (`CONFIGURE_DEPENDS`) always picks
  up loc XML edits, so do not try to path-filter loc changes out of the build —
  the codegen depends on seeing them.
- **Numbering is not stable across edits.** Because ids are re-sorted
  alphabetically each configure, the numeric `#define`s shift when you add a
  string. This is safe (the runtime keys on the string, not the number) but
  means you must never hardcode a raw integer id — always use the `IDS_` symbol.
- **Put translations in `.xml`, never `strings.lang`.** The `.lang` files in
  each locale dir are not loaded.
- **CJK needs both a translation and a font.** A translated CJK string with no
  matching TTF renders through the unicode bitmap fallback; the dedicated TTF
  path (`SetupFont`/`createFont`) is what gives correct CJK glyphs.

## v1.1.0b drift notes

The snapshot documented here is TU43 Release 1 (`47e5cba3`). A few
localization-relevant changes exist between it and `origin/main` (v1.1.0b);
verify against the branch you build:

- **`24a0b070` "chore: restore localization"** — restored proper localized
  texture-pack text in `IUIScene_StartGame.cpp`
  (`UpdateTexturePackDescription`). It removed a temporary hard-coded English
  "Super Mario" mash-up name/description (id `1034`) so all packs again call
  `tp->getName()` / `tp->getDesc1()` instead of a special-cased literal.
- **`#36` / `5d9417ee` "fix: kanji fonts"** — added the Windows64 CJK TTFs
  (`DFGMaruGothic-Md.ttf`, `DFHeiMedium-B5.ttf`, `BOKMSD.ttf`, plus
  `Mojangles.ttf`) and hardened the loc path. Its child commit `e6085e18`
  ("fix: font crash when switching languages") had temporarily `#if 0`'d the
  `IggyFontSetIndirectUTF8` calls in `SetupFont` to dodge a crash when switching
  from a custom font back to the bitmap font. **In the current snapshot those
  calls are active again** (`UIController.cpp` `SetupFont`), so that guard was
  reverted after the merge — the font-switch path is the one described above.
- **v1.1.0b further loc work (on `origin/main`, not in this snapshot):**
  `Minecraft.World/StringHelpers.cpp` rewrites `convStringToWstring` to do a
  real UTF-8→UTF-16 decode (via `std::wstring_convert` /
  `codecvt_utf8_utf16`) with a widening fallback — important for the loose XML
  parser handling multi-byte CJK values correctly. `StringTable.cpp` gains a
  `printf` logging every missing key. `Windows64Media/loc/stringsGeneric.xml`
  receives ~155 lines of edits. These are on the release branch, so the exact
  UTF-8 handling and missing-key logging depend on which revision you build.

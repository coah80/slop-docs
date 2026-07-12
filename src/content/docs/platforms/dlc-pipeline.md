---
title: DLC Pipeline
description: How DLC packs are structured, loaded, and managed in LCE.
---

4J Studios built a custom DLC system for LCE that handles skin packs, texture packs, mashup packs, and all downloadable content. The system is centered around `DLCManager`, `DLCPack`, and a set of typed `DLCFile` subclasses. This page covers how it all fits together.

## Overview

DLC in LCE is not a simple "drop files in a folder" system. Every piece of downloadable content goes through a pipeline:

1. Content is packaged into `.pck` files with a binary format
2. The platform's store (Xbox Live, PSN, etc.) delivers the package
3. `DLCManager` discovers and registers available packs
4. Individual files within packs are accessed through typed `DLCFile` subclasses
5. Game systems (textures, audio, skins, game rules) pull data from these files on demand

## DLCManager

**File**: `Common/DLC/DLCManager.h`

The `DLCManager` is the central hub for all DLC operations. It maintains a list of `DLCPack` objects and provides lookup methods.

### DLC Types

Every file in a DLC pack has a type that determines how it gets used:

```cpp
enum EDLCType
{
    e_DLCType_All,              // wildcard for queries
    e_DLCType_Skin,             // player skin texture
    e_DLCType_Texture,          // block/item/mob texture replacement
    e_DLCType_TexturePack,      // full texture pack metadata
    e_DLCType_Audio,            // sound bank replacement
    e_DLCType_GameRulesHeader,  // game rules metadata
    e_DLCType_GameRules,        // console game rules data
    e_DLCType_LocalisationData, // translated strings
    e_DLCType_ColourTable,      // biome color overrides
    e_DLCType_UIData            // UI theme/skin data
};
```

### DLC Parameter Types

Files can carry additional metadata through parameters:

```cpp
enum EDLCParameterType
{
    e_DLCParamType_Free,        // whether the content is free
    e_DLCParamType_Cape,        // cape texture reference
    e_DLCParamType_DisplayName, // human-readable name
    e_DLCParamType_ThemeName,   // UI theme name
    e_DLCParamType_Anim         // animation data (for animated textures)
};
```

### Key Methods

| Method | What it does |
|---|---|
| `getSkinFile(skinId)` | Looks up a skin file by its ID |
| `getPack(name)` | Finds a pack by display name |
| `getPack(index, type)` | Gets the Nth pack of a given type |
| `getPackContainingSkin(skinId)` | Finds which pack owns a specific skin |
| `addPack(pack)` | Registers a new DLC pack |
| `removePack(pack)` | Unregisters a pack |
| `readDLCDataFile(pack)` | Reads the binary data from a pack's `.pck` file |
| `getPackCount(type)` | Returns how many packs exist of a given type |

## DLCPack

**File**: `Common/DLC/DLCPack.h`

A `DLCPack` represents one downloadable content package. It contains multiple `DLCFile` entries and metadata about the pack itself.

### Pack Identification

Each pack has two IDs:

- **PackID** -- the unique identifier for this pack
- **ParentPackId** -- links child packs to their parent (for content that ships as multiple related packages)

### File Access

Packs expose their contents through typed file queries:

| Method | What it does |
|---|---|
| `getFile(type, path)` | Gets a specific file by type and path |
| `getFile(type, index)` | Gets the Nth file of a given type |
| `addFile(file)` | Adds a file to the pack |
| `doesPackContainFile(type, name)` | Checks if a file exists in the pack |

### Skin Operations

Packs also have skin-specific helpers for the skin selection menu:

| Method | What it does |
|---|---|
| `getSkinByIndex(index)` | Gets a skin file by its position in the pack |
| `getSkinCount()` | Returns how many skins this pack contains |
| `getPackIcon()` | Returns the pack's icon image |

## DLCFile

**File**: `Common/DLC/DLCFile.h`

`DLCFile` is the base class for every file stored inside a DLC pack.

```cpp
class DLCFile
{
protected:
    DLCManager::EDLCType m_type;
    wstring m_path;
    DWORD m_dwSkinId;

public:
    DLCFile(DLCManager::EDLCType type, const wstring &path);

    DLCManager::EDLCType getType()  { return m_type; }
    wstring getPath()               { return m_path; }
    DWORD getSkinID()               { return m_dwSkinId; }

    virtual void addData(PBYTE pbData, DWORD dwBytes) {}
    virtual PBYTE getData(DWORD &dwBytes) { dwBytes = 0; return NULL; }
    virtual void addParameter(EDLCParameterType type, const wstring &value) {}
    virtual wstring getParameterAsString(EDLCParameterType type) { return L""; }
    virtual bool getParameterAsBool(EDLCParameterType type) { return false; }
};
```

The base class tracks the file type, its path within the pack, and a skin ID (used when the file is a skin texture). Subclasses add data storage and parameter handling.

### DLCFile Subclasses

Each DLC type has a specialized file class:

| Class | File | Type | What it stores |
|---|---|---|---|
| `DLCSkinFile` | `DLCSkinFile.h` | `e_DLCType_Skin` | Player skin texture data |
| `DLCTextureFile` | `DLCTextureFile.h` | `e_DLCType_Texture` | Block/item texture replacement |
| `DLCColourTableFile` | `DLCColourTableFile.h` | `e_DLCType_ColourTable` | Biome color override table |
| `DLCAudioFile` | `DLCAudioFile.h` | `e_DLCType_Audio` | Sound bank data |
| `DLCGameRulesHeader` | `DLCGameRulesHeader.h` | `e_DLCType_GameRulesHeader` | Game rules metadata |
| `DLCGameRulesFile` | `DLCGameRulesFile.h` | `e_DLCType_GameRules` | Console game rules binary data |
| `DLCLocalisationFile` | `DLCLocalisationFile.h` | `e_DLCType_LocalisationData` | Translated string tables |
| `DLCCapeFile` | `DLCCapeFile.h` | `e_DLCType_Skin` | Player cape texture data |
| `DLCUIDataFile` | `DLCUIDataFile.h` | `e_DLCType_UIData` | UI theme and skin data |

## How DLC Gets Loaded

The loading flow depends on the platform, but the general sequence is:

### Step 1: Discovery

When the game starts, the platform's storage system scans for installed DLC packages. On Xbox, this checks the content packages. On PlayStation, it checks the download list. On PC, it checks the DLC directory.

### Step 2: Registration

For each discovered package, `DLCManager::addPack()` creates a `DLCPack` and registers it. At this point, only the metadata (pack name, icon, file list) is loaded. The actual content data stays on disk.

### Step 3: On-Demand Loading

When the player selects a texture pack or skin pack, the system calls `DLCManager::readDLCDataFile()` to load the actual binary data. This triggers platform-specific mount operations:

- **Xbox**: `StorageManager.MountInstalledDLC()` mounts the content package
- **PlayStation**: PSN content is mounted through the commerce system
- **PC**: Files are read directly from the DLC directory

### Step 4: Content Access

Once loaded, game systems access DLC content through the typed file classes:

- **Texture system**: `DLCTexturePack` queries files with `e_DLCType_Texture`
- **Audio system**: Queries files with `e_DLCType_Audio`
- **Skin selector**: Queries files with `e_DLCType_Skin`
- **Game rules**: `GameRuleManager` reads from `e_DLCType_GameRules` files
- **Colour tables**: Loaded from `e_DLCType_ColourTable` files

## DLC_INFO Struct

**File**: `Common/App_structs.h`

The `DLC_INFO` struct holds platform-specific metadata about a DLC package. It uses `#ifdef` branches for each platform:

- **Xbox 360**: Content package descriptors
- **Xbox One (Durango)**: Content package with marketplace info
- **PS3/PS4/Vita**: PSN entitlement data
- **Windows 64**: File path and metadata

This struct gets stored in `CMinecraftApp` alongside the DLC manager and is used during the discovery phase to match platform store entries to in-game packs.

## DLC and Mashup Packs

Mashup packs are the most complex DLC type. A single mashup pack bundles multiple file types together:

- **Textures** (`e_DLCType_Texture` + `e_DLCType_TexturePack`): Full texture replacement
- **Colour table** (`e_DLCType_ColourTable`): Custom biome colors
- **Audio** (`e_DLCType_Audio`): Custom music and sounds
- **Game rules** (`e_DLCType_GameRules` + `e_DLCType_GameRulesHeader`): Custom world generation with schematics, biome overrides, and structure placement
- **Skins** (`e_DLCType_Skin`): Themed player skins
- **UI data** (`e_DLCType_UIData`): Custom menu themes
- **Localisation** (`e_DLCType_LocalisationData`): Translated pack descriptions

The game rules data is what makes mashup worlds special. It feeds into the `GameRuleManager` system (documented in [Custom GameRules](/slop-docs/modding/custom-gamerules/)) which handles schematic placement, biome overrides, and progress tracking.

## DLC in CMinecraftApp

**File**: `Common/Consoles_App.h`

The main application class `CMinecraftApp` owns the `DLCManager` and coordinates DLC operations with other systems:

- DLC download queues for background content installation
- Skin and cape management per player (tracked in `GAME_SETTINGS`)
- DLC request handling for platform store interactions
- Pack selection state (which texture/skin pack is active)

The `GAME_SETTINGS` struct in `App_structs.h` stores per-player DLC state including selected skin ID, selected cape, and favorite packs. This data is 204 bytes per player and persists across sessions.

## Key Files

| File | What it does |
|---|---|
| `Common/DLC/DLCManager.h` | Central DLC management, pack registry, file lookup |
| `Common/DLC/DLCPack.h` | Single pack container with file access methods |
| `Common/DLC/DLCFile.h` | Base class for typed DLC files |
| `Common/DLC/DLCSkinFile.h` | Player skin texture files |
| `Common/DLC/DLCTextureFile.h` | Texture replacement files |
| `Common/DLC/DLCAudioFile.h` | Audio bank files |
| `Common/DLC/DLCGameRulesFile.h` | Console game rules binary data |
| `Common/DLC/DLCGameRulesHeader.h` | Game rules metadata |
| `Common/DLC/DLCColourTableFile.h` | Biome color override files |
| `Common/DLC/DLCLocalisationFile.h` | Translated string files |
| `Common/DLC/DLCUIDataFile.h` | UI theme data files |
| `Common/App_structs.h` | `DLC_INFO` struct with platform-specific fields |
| `Common/Consoles_App.h` | Application-level DLC coordination |

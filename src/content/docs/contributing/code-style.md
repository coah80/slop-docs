---
title: Code Style
description: The real .clang-format and .clang-tidy rules neoLegacy enforces, plus the unwritten conventions the tools can't catch.
---

neoLegacy's formatting is defined by two files in the repo root — `.clang-format`
and `.clang-tidy` — plus a set of conventions the tools don't enforce but the
codebase follows consistently. This page documents both. When in doubt, run
`clang-format` and match the surrounding code.

## `.clang-format` — the enforced formatting

The style is `BasedOnStyle: Microsoft` with a set of overrides. The rules that
actually change how you write code:

| Setting | Value | Effect |
|---------|-------|--------|
| `IndentWidth` / `TabWidth` | `4` | Four columns per indent level |
| `UseTab` | `Never` | **Spaces only** — never hard tabs |
| `ColumnLimit` | `0` | **No line-length limit.** clang-format will not wrap long lines for you |
| `PointerAlignment` | `Right` | `Type *ptr`, not `Type* ptr` |
| `AccessModifierOffset` | `-2` | `public:` / `private:` outdent by 2 from members |
| `NamespaceIndentation` | `None` | Namespace bodies are not indented |
| `IndentCaseLabels` | `false` | `case` labels align with `switch` |
| `IndentCaseBlocks` | `true` | The `{ }` block under a case *is* indented |
| `InsertBraces` | `true` | Braces are **added** to any single-statement `if`/`for`/`while` |
| `InsertNewlineAtEOF` | `true` | Every file ends with a trailing newline |
| `RemoveSemicolon` | `false` | Redundant semicolons are left alone |
| `SortIncludes` | `CaseSensitive` | Includes are sorted, case-sensitively |
| `IncludeBlocks` | `Preserve` | Blank-line-separated include groups are kept as-is |
| `SpacesInParens` | `Never` | `foo(x)`, never `foo( x )` |
| `Standard` | `Latest` | Parse with the newest C++ standard clang-format knows |

### Brace wrapping — Allman, with exceptions

`BraceWrapping` is customized on top of Microsoft. The important ones:

- `AfterFunction: true`, `AfterClass: true`, `AfterStruct: true`,
  `AfterEnum: true`, `AfterNamespace: true`, `AfterControlStatement: Always` —
  the **opening brace goes on its own line** for functions, classes, structs,
  enums, namespaces, and control statements (Allman/BSD style):

  ```cpp
  bool FossilFeature::place(Level *level, Random *random, int x, int y, int z)
  {
      if (by < 1 || by >= Level::maxBuildHeight)
      {
          continue;
      }
  }
  ```

- `AfterUnion: false` — unions keep the brace on the same line.
- `BeforeElse: true`, `BeforeCatch: true` — `else` and `catch` start on a new
  line after the closing brace.
- `BeforeWhile: false` — a `do { } while` keeps `while` on the closing-brace line.
- `SplitEmptyFunction` / `SplitEmptyRecord` / `SplitEmptyNamespace: true` —
  empty bodies still split across lines.

Because `InsertBraces: true` is set, you can write a bare `if (x) return;` and
clang-format will brace it for you — but the result is the multi-line Allman
form above, so write it that way to begin with.

:::note[No column limit means you format your own long lines]
`ColumnLimit: 0` means clang-format will never break a long call for you. Long
argument lists and the fluent-builder registration chains are wrapped **by
hand** — see how the case studies lay out `(new SlimeTile(165))->setSoundType(...)`
one setter per line.
:::

## `.clang-tidy` — the enforced lint

`.clang-tidy` enables a narrow, deliberate check set. The `Checks:` list is:

```yaml
Checks: >
  -*,
  modernize-*,
  google-readability-casting,
  cppcoreguidelines-pro-type-cstyle-cast,
  -modernize-use-trailing-return-type
```

Reading that:

- `-*` disables everything, then the list re-enables specific families.
- **`modernize-*`** — the whole modernize family is on: `modernize-use-auto`,
  `modernize-use-nullptr`, `modernize-loop-convert`, `modernize-use-override`,
  `modernize-use-using`, and the rest. Prefer `nullptr` over `NULL`, range-based
  `for` where it applies, `auto` for long type names, `override` on overrides.
- **`google-readability-casting`** and
  **`cppcoreguidelines-pro-type-cstyle-cast`** — both flag C-style casts. Use
  C++ casts (`static_cast`, `reinterpret_cast`, `dynamic_pointer_cast`).
- **`-modernize-use-trailing-return-type`** is explicitly **excluded** (note the
  leading `-`). Do **not** rewrite `int foo()` as `auto foo() -> int`. The
  comment in the file says so: "explicitly exclude trailing return types."

### Tidy options

```yaml
ExtraArgs: ['-std=c++14']
CheckOptions:
  - key:   modernize-loop-convert.MinConfidence
    value: reasonable
  - key:   modernize-use-auto.MinTypeNameLength
    value: 5
```

- `modernize-loop-convert` only converts loops it's *reasonably* confident about.
- `modernize-use-auto` only suggests `auto` when the spelled type name is at
  least 5 characters, so short types like `int` are left alone.

:::caution[The tidy `-std` differs from the build's `-std`]
`.clang-tidy` passes `-std=c++14` to its internal Clang, but the actual build
compiles as **C++17** (`CMakeLists.txt` sets `CMAKE_CXX_STANDARD 17`). The tidy
C++14 setting only affects how the linter parses for modernize suggestions; it
does not lower the language level your code is compiled at. Write C++17.
:::

## Conventions the tools don't enforce

clang-format and clang-tidy can't see intent. These are the house conventions
you learn by reading the code.

### `4J:` and `neo:` provenance comments

Two comment prefixes tag where a line *came from*:

- **`// 4J:`** marks logic that mirrors the original 4J Studios LCE code —
  behaviour preserved verbatim from the decompiled game. It appears throughout
  the netcode and UI (e.g. `ClientConnection.cpp`:
  `// 4J: Check our deferred entity link packets`; `UIScene_MainMenu.cpp`:
  `// 4J: Launch the dummy xbox help application.`). Keep these when you touch
  4J-derived code — they document that a quirk is intentional parity, not a bug.
- **`//neo:`** marks a neoLegacy addition on top of the original (e.g.
  `PlayerConnection.cpp`: `//neo: Command Includes`, `//neo: added`). Use it to
  flag a line that isn't in the upstream so future readers know it's a port
  addition.

Match the exact spacing of nearby comments (`// 4J:` with a space, `//neo:`
without is common — follow the file you're in).

### Registration idiom placement

New content is registered with a static pointer field plus a hard-coded integer
ID, assigned in the subsystem's `staticCtor()` via chained fluent setters that
return `this`. This is a fixed idiom — put the registration in the right
`staticCtor`, at the next free ID, in fluent form:

```cpp
Tile::slimeBlock = (new SlimeTile(165))
    ->setSoundType(SOUND_SLIME)
    ->setIconName(L"slime")
    ->setDescriptionId(IDS_TILE_SLIME_BLOCK)
    ->disableMipmap();
```

The [Backporting Workflow](/slop-docs/backporting/workflow/#step-3--register-it)
lists the exact `staticCtor` site for every subsystem (blocks, items,
enchantments, biomes, structures, …). One setter per line; the `->` chain wraps
by hand because there's no column limit.

### TU-tagged commit prefixes

Commits — not code — carry the milestone. Use Conventional-Commits-style
prefixes with an optional Title-Update scope: `feat(TU31): <thing>`,
`fix(TU31): <thing>`, or plain `feat:` / `fix:` when the milestone is obvious.
Full detail in [Getting
Started](/slop-docs/contributing/getting-started/#commits-milestone-tags-and-fix-chains).

### File naming mirrors class naming

Each class lives in a `.cpp`/`.h` pair named after the class:
`SlimeTile.{cpp,h}` holds `SlimeTile`, `FossilFeature.{cpp,h}` holds
`FossilFeature`, `WaterWalkerEnchantment.{cpp,h}` holds
`WaterWalkerEnchantment`. When you create a new class, name the files exactly
after it (PascalCase), and remember that **LCE legacy names win** — Depth Strider
is `WaterWalkerEnchantment`, a block is a `Tile` not a `Block`. See
[Step 2 of the workflow](/slop-docs/backporting/workflow/#step-2--map-the-concept-onto-this-codebases-idioms).

### Where new files go in the CMake source lists

Adding a `.cpp`/`.h` pair is **not enough** — CMake won't compile a file that
isn't in a source list. Each module keeps its sources in
`cmake/sources/Common.cmake` (plus per-platform files like `Durango.cmake`),
included from the module's `CMakeLists.txt`:

```cmake
# Minecraft.World/CMakeLists.txt
include("${CMAKE_CURRENT_LIST_DIR}/cmake/sources/Common.cmake")
```

Inside `Common.cmake`, sources are grouped into `set(_MINECRAFT_WORLD_COMMON_* ...)`
variables, one path per line as `"${CMAKE_CURRENT_SOURCE_DIR}/Name.cpp"`. Add
**both** the `.cpp` and the `.h` to the appropriate group, alphabetically near
related files. The TU43 structures work did exactly this — its
`Minecraft.World/cmake/sources/Common.cmake` diff added:

```cmake
"${CMAKE_CURRENT_SOURCE_DIR}/FossilFeature.cpp"
"${CMAKE_CURRENT_SOURCE_DIR}/FossilFeature.h"
"${CMAKE_CURRENT_SOURCE_DIR}/IglooFeature.cpp"
"${CMAKE_CURRENT_SOURCE_DIR}/IglooFeature.h"
```

Note that some files are also listed in **another module's** source list when
they're shared — e.g. the dedicated server's
`Minecraft.Server/cmake/sources/Common.cmake` pulls certain
`../Minecraft.Client/*.cpp` files (models, renderers) so the server links them
too. If your class is needed on both client and server, add it to both lists.
Miss the CMake edit and your class simply won't be compiled in — a classic
first-PR mistake.

## See also

- [Getting Started](/slop-docs/contributing/getting-started/) — account, clone,
  submodule, PR lifecycle.
- [Testing Your Changes](/slop-docs/contributing/testing/) — how verification
  actually works (manually).
- [Backporting Workflow](/slop-docs/backporting/workflow/) — the end-to-end
  process these conventions serve.

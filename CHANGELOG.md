# Changelog

All notable changes to this project are documented in this file.

## [0.1.0] - 2026-09-10

### Added

- Add comprehensive CUE syntax highlighting for declarations, literals, interpolation, operators, delimiters, and contextual keywords.
- Support simple, multiline, and hash-delimited string and byte literals, including escapes and interpolation.
- Support legacy and postfix aliases, explicit-open postfix expressions, optional references, and experimental `try`, `else`, `fallback`, and `otherwise` comprehensions.
- Add indentation and folding support for structures, lists, argument lists, import groups, and multiline literals.
- Add pinned upstream CUE formatter fixtures and a reproducible importer for broader parser coverage.

### Changed

- Expand parser coverage for imports, dynamic labels and selectors, slices, attributes, contextual keywords, numeric literals, newline-based comma insertion, Unicode identifiers, and byte-order marks.
- Correct binary operator precedence and associativity and improve incremental parsing across string and mixed-syntax edits.
- Avoid quadratic import-path hashing.
- Default `cue()` to tab indentation while allowing callers to override the indentation unit.

### Compatibility note

The grammar and syntax tree have changed substantially since `0.1.0-alpha`. Consumers that inspect `cueLanguage.parser` trees or match syntax node names may need to update their selectors.

[0.1.0]: https://github.com/haoqixu/codemirror-lang-cue/compare/v0.1.0-alpha...v0.1.0

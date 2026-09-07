# codemirror-lang-cue

[![NPM Version](https://img.shields.io/npm/v/codemirror-lang-cue)](https://www.npmjs.com/package/codemirror-lang-cue)

This package implements [CUE](https://cuelang.org) language support for the [CodeMirror](https://codemirror.net/6/) code editor.

## Getting Started

### Installation

```bash
npm i codemirror-lang-cue
```

### Usage

```javascript
import {EditorView} from '@codemirror/view';
import {EditorState} from '@codemirror/state';
import {cue} from "codemirror-lang-cue";

const state = EditorState.create({
	doc: 'my cue code',
	extensions: [
		cue(),
	]
});

const view = new EditorView({
	parent: document.querySelector('#editor'),
	state
});
```

## Testing

```sh
pnpm prepare
pnpm test
```

Tests include vendored [upstream CUE fixtures](test/testdata/cue/README.md),
with a pinned source revision and a reproducible importer. No network is needed
to run them.

## Example

TODO:

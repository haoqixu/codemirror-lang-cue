import {deepStrictEqual, strictEqual} from "node:assert"
import {EditorState} from "@codemirror/state"
import {foldable, indentOnInput, indentRange, indentUnit} from "@codemirror/language"
import {cue} from "../dist/index.js"

function state(doc, extensions = []) {
  return EditorState.create({doc, extensions: [cue(), extensions]})
}

function reindent(doc, extensions = []) {
  const editor = state(doc, extensions)
  return indentRange(editor, 0, editor.doc.length).apply(editor.doc).toString()
}

function typeAtEnd(doc, text) {
  const editor = EditorState.create({
    doc,
    selection: {anchor: doc.length},
    extensions: [cue(), indentOnInput()]
  })
  return editor.update({
    changes: {from: doc.length, insert: text},
    selection: {anchor: doc.length + text.length},
    userEvent: "input.type"
  }).state.doc.toString()
}

function folded(doc) {
  const editor = state(doc), line = editor.doc.line(1)
  return foldable(editor, line.from, line.to)
}

describe("language support", () => {
  it("does not reindent multiline string or bytes content", () => {
    for (const doc of [
      'message: """\n  keep\n    extra\n  """',
      "payload: ##'''\n\tkeep\n\t  extra\n\t'''##",
      '@data("""\n  keep\n    extra\n  """)'
    ]) strictEqual(reindent(doc), doc)
  })

  it("defaults to tab indentation and allows callers to override it", () => {
    const doc = "x: f(first,\nsecond\n)"
    strictEqual(reindent(doc), "x: f(first,\n\tsecond\n)")
    strictEqual(reindent(doc, indentUnit.of("    ")), "x: f(first,\n    second\n)")
  })

  it("reindents closing delimiters on input", () => {
    for (const [before, close, after] of [
      ["x: {\n    ", "}", "x: {\n}"],
      ["x: [\n    ", "]", "x: [\n]"],
      ["x: f(\n    ", ")", "x: f(\n)"]
    ]) strictEqual(typeAtEnd(before, close), after)
  })

  for (const [name, doc, open, close] of [
    ["structs", "x: {\n  y: 1\n}", "{", "}"],
    ["lists", "x: [\n  1,\n  2\n]", "[", "]"],
    ["argument lists", "x: f(\n  1,\n  2\n)", "(", ")"],
    ["import groups", "import (\n  \"math\"\n  \"strings\"\n)", "(", ")"]
  ]) it(`folds ${name}`, () => {
    deepStrictEqual(folded(doc), {from: doc.indexOf(open) + 1, to: doc.lastIndexOf(close)})
  })

  it("folds multiline string and bytes contents between their delimiters", () => {
    for (const [doc, opening, closing] of [
      ['value: """\n  text\n  """', '"""', '"""'],
      ["value: ##'''\n  bytes\n  '''##", "##'''", "'''##"]
    ]) deepStrictEqual(folded(doc), {
      from: doc.indexOf(opening) + opening.length,
      to: doc.lastIndexOf(closing)
    })
  })
})

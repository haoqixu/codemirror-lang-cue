import {deepStrictEqual, strictEqual} from "node:assert"
import {EditorState} from "@codemirror/state"
import {foldable, indentRange} from "@codemirror/language"
import {cue} from "../dist/index.js"

function state(doc) {
  return EditorState.create({doc, extensions: [cue()]})
}

function reindent(doc) {
  const editor = state(doc)
  return indentRange(editor, 0, editor.doc.length).apply(editor.doc).toString()
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

  it("uses the argument-list indentation rule", () => {
    strictEqual(reindent("x: f(first,\nsecond\n)"), "x: f(first,\n  second\n)")
  })

  for (const [name, doc, open, close] of [
    ["structs", "x: {\n  y: 1\n}", "{", "}"],
    ["lists", "x: [\n  1,\n  2\n]", "[", "]"],
    ["argument lists", "x: f(\n  1,\n  2\n)", "(", ")"]
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

import {deepStrictEqual, ok} from "node:assert"
import {highlightTree, tagHighlighter, tags as t} from "@lezer/highlight"
import {cueLanguage} from "../dist/index.js"

const highlighter = tagHighlighter([
  {tag: t.controlKeyword, class: "keyword"},
  {tag: t.definitionKeyword, class: "keyword"},
  {tag: t.operatorKeyword, class: "keyword"},
  {tag: t.definition(t.variableName), class: "definition"},
  {tag: t.propertyName, class: "property"},
  {tag: t.variableName, class: "variable"},
  {tag: t.null, class: "null"},
  {tag: t.bool, class: "bool"},
  {tag: t.logicOperator, class: "operator"},
  {tag: t.arithmeticOperator, class: "operator"},
  {tag: t.bitwiseOperator, class: "operator"},
  {tag: t.compareOperator, class: "operator"},
  {tag: t.definitionOperator, class: "operator"},
  {tag: t.derefOperator, class: "operator"},
  {tag: t.separator, class: "separator"},
  {tag: t.paren, class: "bracket"},
  {tag: t.squareBracket, class: "bracket"},
  {tag: t.brace, class: "bracket"},
  {tag: t.punctuation, class: "punctuation"}
])

function spans(source) {
  const result = []
  highlightTree(cueLanguage.parser.parse(source), highlighter,
    (from, to, style) => result.push([source.slice(from, to), style]))
  return result
}

function withStyle(source, style) {
  return spans(source).filter(span => span[1] === style).map(span => span[0])
}

describe("CUE highlighting", () => {
  it("highlights clause keywords and their bindings", () => {
    const source = "for item in items if item {let local = item}"
    deepStrictEqual(withStyle(source, "keyword"), ["for", "in", "if", "let"])
    deepStrictEqual(withStyle(source, "definition"), ["item", "local"])
  })

  it("treats selectors and keyword-shaped field names as properties", () => {
    const source = "if: 1, true: 2, null: 3, result: obj.field"
    deepStrictEqual(withStyle(source, "property"), ["if", "true", "null", "result", "field"])
    ok(!withStyle(source, "null").includes("null"))
  })

  it("highlights prefix and postfix alias bindings", () => {
    const source = "Old=legacy: 1, modern~(Key, Value): {name: Key, copy: Value}"
    deepStrictEqual(withStyle(source, "definition"), ["Old", "Key", "Value"])
    deepStrictEqual(withStyle(source, "operator"), ["=", "~"])
  })

  it("highlights explicit-open ellipses", () => {
    const source = "x: #Schema... & (#A | #B)..."
    deepStrictEqual(withStyle(source, "punctuation"), [":", "...", "..."])
    deepStrictEqual(withStyle(source, "operator"), ["&", "|"])
  })

  it("highlights operators and separators that used to be absent from the tree", () => {
    const operators = ["+", "-", "*", "/", "==", "!=", "<", "<=", ">", ">=", "=~", "!~", "&&", "||", "&", "|", "!"]
    const source = `ops: [${operators.map(op => op === "!" ? "!a" : `a ${op} b`).join(", ")}]`
    deepStrictEqual(withStyle(source, "operator"), operators)
    deepStrictEqual(withStyle(source, "punctuation"), [":"])
    deepStrictEqual(withStyle(source, "separator"), Array(operators.length - 1).fill(","))
  })
})

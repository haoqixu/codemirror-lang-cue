import {deepStrictEqual, ok} from "node:assert"
import {highlightTree, tagHighlighter, tags as t} from "@lezer/highlight"
import {cueLanguage} from "../dist/index.js"

const highlighter = tagHighlighter([
  {tag: t.moduleKeyword, class: "keyword"},
  {tag: t.controlKeyword, class: "keyword"},
  {tag: t.definitionKeyword, class: "keyword"},
  {tag: t.operatorKeyword, class: "keyword"},
  {tag: t.definition(t.variableName), class: "definition"},
  {tag: t.definition(t.propertyName), class: "property-definition"},
  {tag: t.definition(t.typeName), class: "type-definition"},
  {tag: t.definition(t.namespace), class: "namespace-definition"},
  {tag: t.standard(t.typeName), class: "builtin-type"},
  {tag: t.typeName, class: "type"},
  {tag: t.standard(t.function(t.variableName)), class: "builtin-function"},
  {tag: t.function(t.variableName), class: "function"},
  {tag: t.function(t.propertyName), class: "method"},
  {tag: t.function(t.typeName), class: "type-function"},
  {tag: t.propertyName, class: "property"},
  {tag: t.variableName, class: "variable"},
  {tag: t.attributeName, class: "attribute"},
  {tag: t.attributeValue, class: "attribute-value"},
  {tag: t.special(t.string), class: "bytes"},
  {tag: t.string, class: "string"},
  {tag: t.lineComment, class: "comment"},
  {tag: t.null, class: "null"},
  {tag: t.bool, class: "bool"},
  {tag: t.logicOperator, class: "operator"},
  {tag: t.arithmeticOperator, class: "operator"},
  {tag: t.typeOperator, class: "operator"},
  {tag: t.compareOperator, class: "operator"},
  {tag: t.definitionOperator, class: "operator"},
  {tag: t.derefOperator, class: "operator"},
  {tag: t.annotation, class: "annotation"},
  {tag: t.separator, class: "separator"},
  {tag: t.special(t.punctuation), class: "special-punctuation"},
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

  it("distinguishes field declarations from selectors", () => {
    const source = "if: 1, try: 2, else: 3, fallback: 4, otherwise: 5, true: 6, null: 7, result: obj.try"
    deepStrictEqual(withStyle(source, "property-definition"),
      ["if", "try", "else", "fallback", "otherwise", "true", "null", "result"])
    deepStrictEqual(withStyle(source, "property"), ["try"])
    ok(!withStyle(source, "null").includes("null"))
  })

  it("highlights definitions as types in declarations and references", () => {
    const source = "#Schema: {_#Private: #Value}, value: #Schema & obj.#Member"
    deepStrictEqual(withStyle(source, "type-definition"), ["#Schema", "_#Private"])
    deepStrictEqual(withStyle(source, "type"), ["#Value", "#Schema", "#Member"])
  })

  it("distinguishes predeclared types from names that look like fields", () => {
    const source = "string: 1, schema: {text: string, count: uint64}, selected: schema.string, let int = 1"
    deepStrictEqual(withStyle(source, "builtin-type"), ["string", "uint64"])
    deepStrictEqual(withStyle(source, "property"), ["string"])
    deepStrictEqual(withStyle(source, "definition"), ["int"])
  })

  it("highlights functions, methods, and callable definitions", () => {
    const source = "a: validate(x), b: pkg.Validate(x), c: pkg.\"quoted\"(x), d: len(x), e: #Validate(x)"
    deepStrictEqual(withStyle(source, "function"), ["validate"])
    deepStrictEqual(withStyle(source, "method"), ["Validate", "\"quoted\""])
    deepStrictEqual(withStyle(source, "builtin-function"), ["len"])
    deepStrictEqual(withStyle(source, "type-function"), ["#Validate"])
  })

  it("highlights namespaces, attributes, and their values", () => {
    const source = "package demo\nimport strings \"strings\"\n@tag(key=\"value\")"
    deepStrictEqual(withStyle(source, "namespace-definition"), ["demo", "strings"])
    deepStrictEqual(withStyle(source, "attribute"), ["tag"])
    deepStrictEqual(withStyle(source, "annotation"), ["@"])
    deepStrictEqual(withStyle(source, "attribute-value"), ["\"value\""])
    deepStrictEqual(withStyle(source, "string"), ["\"strings\""])
  })

  it("distinguishes strings, byte strings, and line comments", () => {
    const source = "text: \"hello\", data: 'hello' // byte sequence"
    deepStrictEqual(withStyle(source, "string"), ["\"hello\""])
    deepStrictEqual(withStyle(source, "bytes"), ["'hello'"])
    deepStrictEqual(withStyle(source, "comment"), ["// byte sequence"])
  })

  it("highlights prefix, dynamic-label, and postfix alias bindings", () => {
    const source = "Old=legacy: 1, (Dynamic=key): Dynamic, modern~(Key, Value): {name: Key, copy: Value}"
    deepStrictEqual(withStyle(source, "definition"), ["Old", "Dynamic", "Key", "Value"])
    deepStrictEqual(withStyle(source, "operator"), ["=", "=", "~"])
  })

  it("highlights try clauses, fallbacks, and optional references", () => {
    const source = [
      "try value = input? if value > 0 {out: value} otherwise {out: 0}",
      "try {out: input?} else {out: 0}",
      "for value in [] {value} fallback {0}",
    ].join("\n")
    deepStrictEqual(withStyle(source, "keyword"), [
      "try", "if", "otherwise", "try", "else", "for", "in", "fallback",
    ])
    deepStrictEqual(withStyle(source, "definition"), ["value", "value"])
    deepStrictEqual(withStyle(source, "special-punctuation"), ["?", "?"])
  })

  it("highlights explicit-open ellipses", () => {
    const source = "x: #Schema... & (#A | #B)..."
    deepStrictEqual(withStyle(source, "special-punctuation"), ["...", "..."])
    deepStrictEqual(withStyle(source, "operator"), ["&", "|"])
    deepStrictEqual(withStyle(source, "separator"), [":"])
  })

  it("highlights operators and separators that used to be absent from the tree", () => {
    const operators = ["+", "-", "*", "/", "==", "!=", "<", "<=", ">", ">=", "=~", "!~", "&&", "||", "&", "|", "!"]
    const source = `ops: [${operators.map(op => op === "!" ? "!a" : `a ${op} b`).join(", ")}]`
    deepStrictEqual(withStyle(source, "operator"), operators)
    deepStrictEqual(withStyle(source, "separator"), [":", ...Array(operators.length - 1).fill(",")])
  })
})

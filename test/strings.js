import {deepStrictEqual, ok, strictEqual, throws} from "node:assert"
import {TreeFragment} from "@lezer/common"
import {highlightTree, tagHighlighter, tags} from "@lezer/highlight"
import {cueLanguage} from "../dist/index.js"

const parser = cueLanguage.parser.configure({strict: true})
function nodes(tree, name) {
  const result = []
  tree.iterate({enter(node) { if (node.name === name) result.push(node.node) }})
  return result
}
function textNodes(tree, source, name) {
  return nodes(tree, name).map(node => source.slice(node.from, node.to))
}

// These expectations describe lexical forms and tree boundaries independently
// of the parser, rather than accepting whatever tree a snapshot update produces.
export const validStrings = []
export const invalidStrings = []
for (const quote of ['"', "'"]) {
  for (const hashes of [0, 1, 2, 5]) {
    for (const multiline of [false, true]) {
      const padding = "#".repeat(hashes), escape = "\\" + padding
      const delimiter = quote.repeat(multiline ? 3 : 1)
      const wrap = text => padding + delimiter + (multiline ? "\n" : "") + text +
        (multiline ? "\n" : "") + delimiter + padding
      const kind = (multiline ? "Multiline" : "Simple") + (quote === '"' ? "StringLit" : "BytesLit")
      const add = (text, escapes = 0) => validStrings.push({source: wrap(text), kind, escapes})
      add("")
      add("hello 世界 🌍 // not a comment ([]) #")
      add("\t spaces \r stay text")
      add(escape + quote, 1)
      add(escape + "\\", 1)
      add(escape + "u0041" + escape + "U0001F600", 2)
      add(escape + "uD800", 1) // Like the upstream parser, accept surrogate escapes.
      for (const ch of ["a", "b", "f", "n", "r", "t", "v", "/"]) add(escape + ch, 1)
      if (quote === "'") add(escape + "000" + escape + "377" + escape + "xFF", 3)
      if (hashes) {
        add('unescaped "quotes" and \'quotes\' and \\q and \\(notCode)')
        if (hashes > 1) add("\\" + "#".repeat(hashes - 1) + "(stillText)")
      }
      for (const bad of ["q", "8", "u123", "uZZZZ", "U00110000", "U0000000Z", quote === '"' ? "'" : '"'])
        invalidStrings.push(wrap(escape + bad))
      if (quote === '"') {
        invalidStrings.push(wrap(escape + "x61"), wrap(escape + "141"))
      } else {
        invalidStrings.push(wrap(escape + "400"), wrap(escape + "xF"), wrap(escape + "089"))
      }
    }
  }
}
for (const source of ['#"""#', '##"""##', '#""leading and trailing quotes""#', '##"one "# quote"##'])
  validStrings.push({source, kind: "SimpleStringLit", escapes: 0})
for (const source of [
  '"""\n  first\n    second\n\n  """',
  '"""\r\n\tfirst\r\n\tsecond\r\n\t"""',
  '"""\n  quote """ in content\n  """',
  '"""\n    \n  text\n  """'
]) validStrings.push({source, kind: "MultilineStringLit", escapes: 0})
invalidStrings.push(
  '"unterminated', "'unterminated", '#"unmatched"', '##"unmatched"#',
  '"line\nbreak"', "'line\nbreak'", '"nul\0byte"', '"raw \ufeff BOM"',
  '"""same line"""', "'''same line'''", '"""\rtext\n"""',
  '"""\ntext"""', '"""\ntext\n  """', '"""\n\ttext\n  """',
  '"""\n \n  text\n  """', "###'''\n  \\x41\n\r\n  '''###", '"backslash\\\nnewline"',
  String.raw`"\(a + )"`, String.raw`"\(1,)"`, String.raw`"\()"`, String.raw`"\(a"`
)

describe("string and bytes literals", () => {
  for (const {source, kind, escapes} of validStrings) {
    it(JSON.stringify(source), () => {
      const tree = parser.parse(source)
      deepStrictEqual(textNodes(tree, source, kind), [source])
      strictEqual(nodes(tree, "Escape").length, escapes)
      strictEqual(nodes(tree, "Interpolation").length, 0)
      strictEqual(tree.length, source.length)
    })
  }
  for (const source of invalidStrings) {
    it(`rejects ${JSON.stringify(source)}`, () => throws(() => parser.parse(source)))
  }
})

describe("string interpolation", () => {
  for (const quote of ['"', "'"]) for (const hashes of [0, 1, 3]) for (const multiline of [false, true]) {
    const padding = "#".repeat(hashes), delimiter = quote.repeat(multiline ? 3 : 1)
    const start = "\\" + padding + "("
    const expression = "a * b + f((c + d), {x: 1}).x"
    const source = padding + delimiter + (multiline ? "\n" : "") +
      `before ${start}${expression}) after ${start}other)` + (multiline ? "\n" : "") + delimiter + padding
    it(JSON.stringify(source), () => {
      const tree = parser.parse(source), interpolations = nodes(tree, "Interpolation")
      strictEqual(interpolations.length, 2)
      deepStrictEqual(interpolations.map(node => {
        const expr = node.getChild("Expression")
        return source.slice(expr.from, expr.to)
      }), [expression, "other"])
      deepStrictEqual(textNodes(tree, source, "InterpolationStart"), [start, start])
      deepStrictEqual(textNodes(tree, source, "InterpolationEnd"), [")", ")"])
      const binary = interpolations[0].getChild("Expression").getChild("BinExpr")
      const [left, right] = binary.getChildren("Expression")
      strictEqual(source.slice(left.from, left.to), "a * b")
      strictEqual(source.slice(left.to, right.from).trim(), "+")
    })
  }
  for (const [source, expressions] of [
    [String.raw`"outer \("inner \(x)") end \(y)"`, [String.raw`"inner \(x)"`, "x", "y"]],
    [String.raw`#"outer \#(##'inner \##(x)'##) end"#`, [String.raw`##'inner \##(x)'##`, "x"]],
    ['"value \\(\n1 +\n2\n)"', ["1 +\n2"]],
    ['"value \\(f(1, // comment\n2))"', ["f(1, // comment\n2)"]],
    ['"""\n  value \\(\n1\n)\n  """', ["1"]],
    [String.raw`"\({a: "nested", b: [1, 2]}.b[0])"`, ['{a: "nested", b: [1, 2]}.b[0]']]
  ]) it(`nested / multiline ${JSON.stringify(source)}`, () => {
    const tree = parser.parse(source)
    deepStrictEqual(nodes(tree, "Interpolation").map(node => {
      const expr = node.getChild("Expression")
      return source.slice(expr.from, expr.to)
    }), expressions)
  })

  it("supports interpolation and escaped quotes in labels", () => {
    const source = String.raw`"prefix \("key")"?: 1, "a\"b"!: 2`
    const tree = parser.parse(source)
    strictEqual(nodes(tree, "Field").length, 2)
    strictEqual(nodes(tree, "Interpolation").length, 1)
    strictEqual(nodes(tree, "Escape").length, 1)
  })
  it("does not insert commas inside literal content or leak quote state after a literal", () => {
    const source = 'a: "x \\(f(1))"\n// comment\nb: #""#\nc: ["x", \'y\']\nd: """\ntext\n"""\ne: 1'
    const tree = parser.parse(source)
    strictEqual(nodes(tree, "Field").length, 5)
    deepStrictEqual(textNodes(tree, source, "Comment"), ["// comment"])
  })
})

export const validStringContexts = [
  String.raw`x: obj."a\"b"`, String.raw`#"key \#(v)"#: 1`,
  String.raw`@foo(")", "[", #"}"#)`, String.raw`@foo(key="(", nested=["}"])`,
  "@foo('it\\'s')", '@foo("""\n  )]}\n  """)',
  'import "math"', "import 'm\\x61th'", String.raw`import #"math"#`,
  String.raw`import "m\u0061th"`, 'import "example.com/a+b:pkg"',
  String.raw`import "example.com/\uD83D\uDE00"`, String.raw`import '\uD83D\uDE00'`,
  'import """\n  math\n  """', 'import (\n#"math"#\n\'strings\'\n)'
]
export const invalidStringContexts = [
  String.raw`x: obj."\(key)"`, "x: obj.'bytes'", 'x: obj."""\nx\n"""',
  'x: obj.""', String.raw`x: obj.#"a "quote""#`,
  String.raw`@foo("\(x)")`, String.raw`import "\(x)"`, 'import ""',
  'import "a b"', String.raw`import "a\u0020b"`, "import '\\xff'",
  'import "example.com/a$b"', 'import "a\\uFFFD"', 'import "\\uFEFFmath"',
  String.raw`import '\xef\xbb\xbfmath'`, String.raw`import "\uD83D"`, String.raw`import "\uDE00"`
]
describe("strings in selectors, attributes, and imports", () => {
  for (const source of validStringContexts) it(source, () => parser.parse(source))
  for (const source of invalidStringContexts) it(`rejects ${source}`, () => throws(() => parser.parse(source)))
})

describe("string highlighting", () => {
  it("highlights expressions inside interpolation as code, not string content", () => {
    const source = String.raw`x: "text\n\(name + 42) tail"`
    const spans = []
    highlightTree(parser.parse(source), tagHighlighter([
      {tag: tags.string, class: "string"}, {tag: tags.escape, class: "escape"},
      {tag: tags.variableName, class: "variable"}, {tag: tags.number, class: "number"},
      {tag: tags.special(tags.brace), class: "interpolation"}
    ]), (from, to, style) => spans.push([source.slice(from, to), style]))
    deepStrictEqual(spans, [
      ['"text', "string"], [String.raw`\n`, "escape"], [String.raw`\(`, "interpolation"],
      ["name", "variable"], ["42", "number"], [")", "interpolation"], [' tail"', "string"]
    ])
  })
})

function treeShape(tree) {
  const shape = []
  tree.iterate({enter(node) { shape.push([node.name, node.from, node.to]) }})
  return shape
}
function treeObjects(tree, result = new Set()) {
  result.add(tree)
  for (const child of tree.children ?? []) if (child.children) treeObjects(child, result)
  return result
}

describe("incremental string parsing", () => {
  const incremental = parser.configure({bufferLength: 32})
  const before = Array.from({length: 30}, (_, i) => `before${i}: ${i}\n`).join("")
  const after = Array.from({length: 30}, (_, i) => `after${i}: ${i}\n`).join("")
  const body = Array.from({length: 60}, (_, i) => `  line ${i} \\#(f(${i}, "nested \\(x)"))\n`).join("")
  const document = before + 'value: #"""\n' + body + '  """#\n' + after
  for (const [find, replacement] of [
    ["line 30", "longer line"], ['f(30, "nested', 'f((30+1), "nested'],
    ['"nested \\(x)"', '##"raw \\##(y)"##'], ['line 30', 'escape \\#n'],
    ["  line 30", "    line 30"], ["after15: 15", 'after15: "new \\(z)"']
  ]) it(`${JSON.stringify(find)} → ${JSON.stringify(replacement)}`, () => {
    const old = incremental.parse(document), from = document.indexOf(find), to = from + find.length
    ok(from >= 0)
    const source = document.slice(0, from) + replacement + document.slice(to)
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(old),
      [{fromA: from, toA: to, fromB: from, toB: from + replacement.length}], 0)
    const updated = incremental.parse(source, fragments)
    deepStrictEqual(treeShape(updated), treeShape(incremental.parse(source)))
    const oldNodes = treeObjects(old)
    ok([...treeObjects(updated)].some(node => oldNodes.has(node)), "must actually reuse tree fragments")
  })

  it("preserves decoded import-path context when reusing fragments", () => {
    const path = Array.from({length: 60}, (_, i) => `part${i}\\u0061/`).join("")
    const oldSource = `import "example.com/${path}pkg"\n` + after
    const from = oldSource.indexOf("part30"), replacement = "renamed30"
    const source = oldSource.slice(0, from) + replacement + oldSource.slice(from + 6)
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(incremental.parse(oldSource)),
      [{fromA: from, toA: from + 6, fromB: from, toB: from + replacement.length}], 0)
    deepStrictEqual(treeShape(incremental.parse(source, fragments)), treeShape(incremental.parse(source)))
  })

  it("can repair a literal from a recovered tree", () => {
    const oldSource = before + 'value: "unfinished\n' + after
    const pos = oldSource.indexOf("\n", before.length)
    const source = oldSource.slice(0, pos) + '"' + oldSource.slice(pos)
    const old = incremental.configure({strict: false}).parse(oldSource)
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(old),
      [{fromA: pos, toA: pos, fromB: pos, toB: pos + 1}], 0)
    deepStrictEqual(treeShape(incremental.parse(source, fragments)), treeShape(incremental.parse(source)))
  })

  it("reparses changed delimiters and escape delimiters without retaining stale context", () => {
    const oldSource = before + 'value: "raw \\(x)"\n' + after
    const source = before + 'value: #"raw \\(x)"#\n' + after
    const first = before.length + 'value: '.length, last = oldSource.indexOf('"\n', first) + 1
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(incremental.parse(oldSource)), [
      {fromA: first, toA: first, fromB: first, toB: first + 1},
      {fromA: last, toA: last, fromB: last + 1, toB: last + 2}
    ], 0)
    const updated = incremental.parse(source, fragments)
    deepStrictEqual(treeShape(updated), treeShape(incremental.parse(source)))
    strictEqual(nodes(updated, "Interpolation").length, 0)
  })

  for (const source of ['x: "unfinished', 'x: "bad\\q"\ny: 2', 'x: "unterminated\ny: 2', 'x: "value \\(f(1)']) {
    it(`recovers from incomplete input: ${JSON.stringify(source)}`, () => {
      const tree = cueLanguage.parser.parse(source)
      strictEqual(tree.length, source.length)
      ok(nodes(tree, "⚠").length > 0)
      if (source.includes("\ny: 2")) {
        ok(textNodes(tree, source, "Field").includes("y: 2"), "recovery must not consume the next field as string content")
      }
    })
  }
})

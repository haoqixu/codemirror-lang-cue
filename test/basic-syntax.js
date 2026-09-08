import {deepStrictEqual, ok, strictEqual, throws} from "node:assert"
import {TreeFragment} from "@lezer/common"
import {cueLanguage} from "../dist/index.js"

const parser = cueLanguage.parser.configure({strict: true})
export const validBasicSyntax = []
export const invalidBasicSyntax = []
function nodes(tree, name) {
  const result = []
  tree.iterate({enter(ref) { if (ref.name === name) result.push(ref.node) }})
  return result
}
function texts(tree, source, name) {
  return nodes(tree, name).map(node => source.slice(node.from, node.to))
}
function accepts(source, check = () => {}) {
  validBasicSyntax.push(source)
  it(JSON.stringify(source), () => {
    const tree = parser.parse(source)
    strictEqual(tree.length, source.length)
    check(tree)
  })
}
function rejects(source) {
  invalidBasicSyntax.push(source)
  it(`rejects ${JSON.stringify(source)}`, () => throws(() => parser.parse(source)))
}

const clauseWords = ["for", "if", "let", "in"]
const valueWords = ["true", "false", "null"]
const preambleWords = ["package", "import"]
const fieldWords = [...clauseWords, ...valueWords, ...preambleWords, "_"]

describe("contextual keywords", () => {
  for (const word of fieldWords) {
    for (const marker of ["", "?", "!"]) {
      const source = `x: {${word}${marker}: 1}`
      accepts(source, tree => {
        const label = nodes(tree, "LabelName").find(node => source.slice(node.from, node.to) === word)
        ok(label?.getChild("Identifier"), "keyword field names are identifiers")
        strictEqual(nodes(tree, "Comprehension").length, 0)
      })
    }
    const source = `x: obj.${word}`
    accepts(source, tree => {
      const selector = nodes(tree, "Selector")[0]
      ok(selector.getChild("Identifier"))
      strictEqual(source.slice(selector.from, selector.to), `.${word}`)
    })
  }
  for (const word of [...clauseWords, ...preambleWords]) {
    const source = `x: ${word}`
    accepts(source, tree => deepStrictEqual(texts(tree, source, "OperandName"), [word]))
    // Prefix aliases are retained for pre-v0.18 CUE source files.
    accepts(`x: ${word}=1`)
    accepts(`x: {${word}=label: 1}`)
  }
  for (const word of valueWords) {
    const source = `x: ${word}`
    accepts(source, tree => {
      strictEqual(nodes(tree, word === "null" ? "NullLit" : "BoolLit").length, 1)
      strictEqual(nodes(tree, "OperandName").length, 0)
    })
    rejects(`x: ${word}=1`)
  }
  accepts("x: _", tree => strictEqual(nodes(tree, "Top").length, 1))
  for (const word of ["iffy", "forEach", "for1", "if_", "if$", "for界", "#if", "_#for"]) {
    accepts(`${word}: 1`, tree => strictEqual(nodes(tree, "Comprehension").length, 0))
  }
  accepts(String.raw`x: "\(for) \(obj.if)"`, tree => {
    strictEqual(nodes(tree, "Interpolation").length, 2)
    strictEqual(nodes(tree, "Comprehension").length, 0)
  })
  for (const word of [...clauseWords, ...valueWords]) {
    rejects(`let ${word} = 1`)
    rejects(`for ${word} in xs {1}`)
    rejects(`package ${word}`)
    rejects(`import ${word} "math"`)
  }
  for (const word of [...preambleWords, "_"]) {
    accepts(`let ${word} = 1`)
    accepts(`for ${word} in xs {1}`)
    accepts(`package ${word}`)
    accepts(`import ${word} "math"`)
  }
  accepts("if !condition {value: 1}", tree => strictEqual(nodes(tree, "GuardClause").length, 1))
  accepts("if!\n: 1", tree => strictEqual(nodes(tree, "GuardClause").length, 0))
  rejects("if! // not a required-field marker in the upstream parser\n: 1")
  accepts("x: if(condition)", tree => strictEqual(nodes(tree, "Arguments").length, 1))
  accepts("if\ntrue\n{}", tree => {
    strictEqual(nodes(tree, "Comprehension").length, 0)
    strictEqual(tree.topNode.getChildren("Declaration").length, 3)
  })
  for (const source of ["if(condition)", "for(1)", "for[0]", "for+1", "x: {if}", "x: {for}"])
    rejects(source)
  accepts("x: 0\npackage: 1\nimport: 2", tree => {
    strictEqual(nodes(tree, "PackageClause").length, 0)
    strictEqual(nodes(tree, "ImportDecl").length, 0)
    strictEqual(nodes(tree, "Field").length, 3)
  })
  for (const source of ["package", "package: 1", "import", "import: 1", "import=foo: 1"])
    rejects(source)
})

describe("commas and ellipses", () => {
  for (const newline of ["\n", "\r\n"]) {
    const source = `x: f(${newline}1${newline}2${newline})`
    accepts(source, tree => deepStrictEqual(texts(tree, source, "Argument"), ["1", "2"]))
    accepts(`x: f(1 // separator${newline}2)`)
    accepts(`x: [1${newline}, 2]`)
    accepts(`x${newline}: 1`)
    accepts(`...${newline}x: 1`, tree => {
      strictEqual(tree.topNode.getChildren("Declaration").length, 2)
      strictEqual(nodes(tree, "Ellipsis")[0].getChild("Expression"), null)
    })
    accepts(`{...${newline}_}`, tree => {
      const struct = nodes(tree, "StructLit")[0]
      deepStrictEqual(struct.getChildren("Declaration").map(node => node.firstChild.name), ["Ellipsis", "Embedding"])
    })
    accepts(`x: [...${newline}]`)
    accepts(`[string${newline}]: int`)
    accepts(`for k, v in xs${newline}if v > 0${newline}let n = v+1${newline}{(k): n}`, tree => {
      strictEqual(nodes(tree, "ForClause").length, 1)
      strictEqual(nodes(tree, "GuardClause").length, 1)
      strictEqual(nodes(tree, "LetClause").length, 1)
    })
  }
  accepts("...", tree => strictEqual(nodes(tree, "Ellipsis").length, 1))
  accepts("{...}")
  accepts("{a: 1, ...}")
  accepts("x: [1, ...int]", tree => ok(nodes(tree, "Ellipsis")[0].getChild("Expression")))
  accepts("if true, {x: 1}")
  accepts("for x in xs, if x > 0, {x}")
  accepts("if true // comment\n{x: 1}")
  accepts("[string,]: int")
  accepts("[Name=string,]: Name")
  for (const source of [
    "x: f()", "x: f(1)", "x: f(1,)", "x: f(\n1,\n2\n)",
    "x: []", "x: [1]", "x: [1,]", "x: [...int,]", "x: {}", "x: {a: 1}",
    "import ()", 'import ("math")'
  ]) accepts(source)
  for (const source of [
    "x: f(1 2)", "x: f(1,,2)", "x: f(,)", "x: f(1\r2)",
    "x: f(1 // already inserts a comma\n,2)", "x: [1,,]", "x: {a: 1 b: 2}",
    "x: (1\n)", "x: (1,)", "x: [for x in xs,, {x}]", "if true,, {x: 1}",
    "for x\nin xs {x}", "let x\n= 1", "x: [...\nint]"
  ]) rejects(source)
})

describe("indices and slices", () => {
  for (const [suffix, bounds] of [
    ["[1:2]", ["1", "2"]], ["[:2]", ["2"]], ["[1:]", ["1"]], ["[:]", []],
    ["[1+2:len(xs)-1]", ["1+2", "len(xs)-1"]], ["[1\n:2]", ["1", "2"]],
    ["[1:\n2]", ["1", "2"]]
  ]) {
    const source = `x: xs${suffix}`
    accepts(source, tree => {
      const slice = nodes(tree, "Slice")[0]
      strictEqual(source.slice(slice.from, slice.to), suffix)
      deepStrictEqual(slice.getChildren("Expression").map(node => source.slice(node.from, node.to)), bounds)
      strictEqual(nodes(tree, "Index").length, 0)
    })
  }
  for (const suffix of ['["key"]', '["key",]', '[\n"key"\n]', '[\n"key",\n]', '["key" // comment\n]']) {
    const source = `x: obj${suffix}`
    accepts(source, tree => {
      strictEqual(nodes(tree, "Index").length, 1)
      strictEqual(nodes(tree, "Slice").length, 0)
    })
  }
  accepts("x: xs[1:len(xs)-1][0].field", tree => {
    strictEqual(nodes(tree, "Slice").length, 1)
    strictEqual(nodes(tree, "Index").length, 1)
    strictEqual(nodes(tree, "Selector").length, 1)
  })
  for (const suffix of ["[]", "[1,2]", "[1,,]", "[1:2:3]", "[::]", "[1:2,]", "[1:2\n]", "[:,]"])
    rejects(`x: xs${suffix}`)
})

describe("numeric literal boundaries", () => {
  const cases = [
    ["DecimalLit", "0"], ["DecimalLit", "123_456"],
    ["HexLit", "0x_FF"], ["HexLit", "0X_Ab_Cd"],
    ["OctalLit", "0o_7_55"], ["BinaryLit", "0b_10_01"],
    ["FloatLit", "3."], ["FloatLit", "3.e+2"], ["FloatLit", ".5E-2"]
  ]
  for (const multiplier of ["K", "M", "G", "T", "P"]) for (const binary of ["", "i"])
    for (const value of ["0", "1", "1.5", "3.", ".5"])
      cases.push(["SiLit", value + multiplier + binary])
  for (const [kind, value] of cases) {
    const source = `x: ${value}`
    accepts(source, tree => deepStrictEqual(texts(tree, source, kind), [value]))
  }
  accepts("x: >=3.T & <4.T")
  accepts("x: 3.T + 1 * 0x_FF")
  for (const value of ["0x", "0x_", "0x__FF", "0x_FF_", "0b_2", "0o_8", "0b__1", "0o__7", "3.T0", "3.Kii", "3.__5T"])
    rejects(`x: ${value}`)
})

describe("preamble attributes", () => {
  const source = '@file()\npackage p\n@pkg()\nimport "strings"\n@body()\nx: 1'
  accepts(source, tree => {
    deepStrictEqual(tree.topNode.getChildren("Attribute").map(node => source.slice(node.from, node.to)), ["@file()", "@pkg()"])
    strictEqual(nodes(tree, "PackageClause").length, 1)
    strictEqual(nodes(tree, "ImportDecl").length, 1)
    strictEqual(tree.topNode.getChildren("Declaration").length, 2)
  })
  for (const source of [
    'package p\n@first()\n@second()\nimport ("math"\n"strings")',
    '@one()\n@two()\nimport "math"', 'package p\n@one()', 'package p\n@one()\nx: 1',
    '@foo("a"\n"b")', '@foo("a" // comment with )\n"b")'
  ]) accepts(source)
  for (const name of fieldWords) accepts(`@${name}()`)
  for (const source of [
    'package p\nimport "math"\n@body()\nimport "strings"',
    'package p\nx: 1\nimport "math"', 'x: 1\npackage p', 'package p\npackage q'
  ]) rejects(source)
})

function shape(tree) {
  const result = []
  tree.iterate({enter(node) { result.push([node.name, node.from, node.to]) }})
  return result
}
function treeObjects(tree, result = new Set()) {
  result.add(tree)
  for (const child of tree.children ?? []) if (child.children) treeObjects(child, result)
  return result
}

for (const bufferLength of [16, 32, 128]) describe(`incremental basic syntax (buffer ${bufferLength})`, () => {
  const incremental = parser.configure({bufferLength})
  const before = Array.from({length: 35}, (_, i) => `before${i}: ${i}\n`).join("")
  const after = Array.from({length: 35}, (_, i) => `after${i}: ${i}\n`).join("")
  for (const [original, find, replacement] of [
    ['if!: 1', '!:', ':'], ['if!: 1', '!: 1', '!condition {x: 1}'],
    ['x: f(1, 2)', ', ', '\n'], ['x: { ... }', '... ', '...\n_ '],
    ['x: xs[1]', '1', '1:2'], ['x: xs[1:2]', ':2', ','],
    ['x: 3.T', '3.T', '0x_FF'], ['x: [string]: int', 'string', 'string\n']
  ]) it(`${JSON.stringify(original)}: ${JSON.stringify(find)} → ${JSON.stringify(replacement)}`, () => {
    const oldSource = before + original + '\n' + after
    const from = before.length + original.indexOf(find), to = from + find.length
    const source = oldSource.slice(0, from) + replacement + oldSource.slice(to)
    const old = incremental.parse(oldSource)
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(old),
      [{fromA: from, toA: to, fromB: from, toB: from + replacement.length}], 0)
    const updated = incremental.parse(source, fragments)
    deepStrictEqual(shape(updated), shape(incremental.parse(source)))
    const oldNodes = treeObjects(old)
    ok([...treeObjects(updated)].some(node => oldNodes.has(node)), 'must reuse tree fragments')
  })
  for (const [index, [original, replacement]] of [
    ['package p\n', 'package package\n'], ['@file()\n', '@file()\npackage p\n@pkg()\n'],
    ['x: package\n', 'package\n'], ['x: import\n', 'import\n'],
    ['package package\n', 'package\n'],
    ...['package', 'import'].map(word => {
      const expression = word + '.field'.repeat(50) + '\n'
      const padding = '// keep the reused expression far from the edit\n'.repeat(20)
      return ['x: ' + padding + expression, padding + expression]
    })
  ].entries()) it(`preamble edit ${index + 1}`, () => {
    const oldSource = original + after, source = replacement + after
    const old = incremental.parse(oldSource)
    let from = 0, toA = oldSource.length, toB = source.length
    while (from < toA && from < toB && oldSource[from] === source[from]) from++
    while (toA > from && toB > from && oldSource[toA - 1] === source[toB - 1]) { toA--; toB-- }
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(old),
      [{fromA: from, toA, fromB: from, toB}], 0)
    const recovering = incremental.configure({strict: false})
    deepStrictEqual(shape(recovering.parse(source, fragments)), shape(recovering.parse(source)))
  })
  it('preserves separators at the end of reused attribute contents', () => {
    const original = '@foo' + ' '.repeat(80) + '("' + 'a'.repeat(300) + '"\n)\n' + after
    const source = original.replace('@foo', '@bar'), old = incremental.parse(original)
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(old),
      [{fromA: 1, toA: 4, fromB: 1, toB: 4}], 0)
    const updated = incremental.parse(source, fragments), oldNodes = treeObjects(old)
    deepStrictEqual(shape(updated), shape(incremental.parse(source)))
    ok([...treeObjects(updated)].some(node => node.type.name === 'AttrTokens' && oldNodes.has(node)),
      'must reuse the attribute contents')
  })
  it('keeps separator state across repeated mixed-syntax edits', () => {
    const bodies = [
      'if: 1\ntrue: false\nx: obj.for', 'if!: 1\nfor?: 2\nx: let',
      'if !false, {enabled: true}', 'for item in items\nif item.ok\n{x: item}',
      '...\n_', 'x: [...int]', 'x: a[1:2].if\ny: a["key",]',
      'x: f(1\n2\n)', 'x: [1, ...\n]', 'x: 3.Ki\ny: 0x_FF',
      'x: {last: 1 // comment\n}', String.raw`x: "\(for) \(obj.if)"`,
      'package: 1\nimport: 2', 'let value = 1\nx: value',
      'x: """\n  for if package\n  \\(a[1:\n2])\n  """'
    ]
    const parts = Array.from({length: 40}, (_, i) => `block${i}: {\n${bodies[i % bodies.length]}\n}\n`)
    const header = '@file()\npackage p\n@package()\nimport "math"\n'
    let tree = incremental.parse(header + parts.join('')), seed = 123456789
    function random(n) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n }
    for (let i = 0; i < 80; i++) {
      const index = random(parts.length), from = header.length + parts.slice(0, index).join('').length
      const toA = from + parts[index].length
      parts[index] = `block${index}: {\n${bodies[random(bodies.length)]}\n}\n`
      const toB = from + parts[index].length, source = header + parts.join('')
      const fragments = TreeFragment.applyChanges(TreeFragment.addTree(tree),
        [{fromA: from, toA, fromB: from, toB}], 0)
      tree = incremental.parse(source, fragments)
      deepStrictEqual(shape(tree), shape(incremental.parse(source)), `edit ${i}`)
    }
  })
  it('does not lose mandatory commas when reusing a parenthesized operand', () => {
    const original = before + 'x: (1)\n' + after
    const at = original.indexOf(')', before.length), source = original.slice(0, at) + '\n' + original.slice(at)
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(incremental.parse(original)),
      [{fromA: at, toA: at, fromB: at, toB: at + 1}], 0)
    throws(() => incremental.parse(source))
    throws(() => incremental.parse(source, fragments))
    const recovering = incremental.configure({strict: false})
    deepStrictEqual(shape(recovering.parse(source, fragments)), shape(recovering.parse(source)))
  })
})

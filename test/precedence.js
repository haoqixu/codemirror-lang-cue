import {deepStrictEqual, strictEqual} from "node:assert"
import {cueLanguage} from "../dist/index.js"

const parser = cueLanguage.parser.configure({strict: true})

// Inspect grouping directly instead of generating expectations from the parser.
// Keep unary/primary operands as source text; unwrap explicit grouping parens.
function expressionShape(source) {
  const tree = parser.parse(source)
  const expression = tree.topNode.getChild("Declaration").firstChild
    .getChild("AliasExpr").getChild("Expression")

  function shape(expression) {
    const binary = expression.getChild("BinExpr")
    if (binary) {
      const operands = binary.getChildren("Expression")
      strictEqual(operands.length, 2)
      const [left, right] = operands
      const operator = source.slice(left.to, right.from).trim()
      return [operator, shape(left), shape(right)]
    }
    const inner = expression.getChild("PrimaryExpr")?.getChild("Expression")
    return inner ? shape(inner) : source.slice(expression.from, expression.to)
  }

  return shape(expression)
}

// CUE precedence, from weakest to strongest. Equal precedence is left-associative.
// https://cuelang.org/docs/reference/spec/#operator-precedence
const levels = [
  ["|"],
  ["&"],
  ["||"],
  ["&&"],
  ["==", "!=", "<", "<=", ">", ">=", "=~", "!~"],
  ["+", "-"],
  ["*", "/"]
]
const operators = levels.flatMap((ops, precedence) => ops.map(op => ({op, precedence})))

describe("binary operator precedence", () => {
  for (const left of operators) {
    for (const right of operators) {
      const source = `a ${left.op} b ${right.op} c`
      const expected = left.precedence >= right.precedence
        ? [right.op, [left.op, "a", "b"], "c"]
        : [left.op, "a", [right.op, "b", "c"]]
      it(source, () => deepStrictEqual(expressionShape(source), expected))
    }
  }

  for (const [source, expected] of [
    ["a*b+c", ["+", ["*", "a", "b"], "c"]],
    ["a-b-c", ["-", ["-", "a", "b"], "c"]],
    ["a/b*c", ["*", ["/", "a", "b"], "c"]],
    ["(a + b) * c", ["*", ["+", "a", "b"], "c"]],
    ["a * (b + c)", ["*", "a", ["+", "b", "c"]]],
    ["a - (b - c)", ["-", "a", ["-", "b", "c"]]],
    ["-a * b + c", ["+", ["*", "-a", "b"], "c"]],
    ["a * -b + c", ["+", ["*", "a", "-b"], "c"]],
    ["a + b * -c", ["+", "a", ["*", "b", "-c"]]],
    ["!(a && b) || c", ["||", "!(a && b)", "c"]],
    ["*a | b & c", ["|", "*a", ["&", "b", "c"]]],
    ["*>=5 & <=10 | int", ["|", ["&", "*>=5", "<=10"], "int"]],
    ["f(a)[i].x * b + c", ["+", ["*", "f(a)[i].x", "b"], "c"]],
    ["a +\nb * c", ["+", "a", ["*", "b", "c"]]],
    ["x: a*b+c", ["+", ["*", "a", "b"], "c"]],
    ["a || b && c == d + e * f & g | h",
      ["|", ["&", ["||", "a", ["&&", "b", ["==", "c", ["+", "d", ["*", "e", "f"]]]]], "g"], "h"]]
  ]) {
    it(source, () => deepStrictEqual(expressionShape(source), expected))
  }
})

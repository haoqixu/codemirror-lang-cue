import {styleTags, tags as t} from "@lezer/highlight"

export const cueHighlighting = styleTags({
  "import package": t.moduleKeyword,
  "Literal/...": t.literal,
  "StringLit/...": t.string,
  "IntLit/...": t.number,
  "BoolLit/...": t.bool,
  FloatLit: t.float,
  null: t.null,
  "OperandName/Identifier": t.variableName,
  "LabelName/Identifier": t.propertyName,
  Comment: t.comment,
  "&& ||": t.logicOperator,
  // "+ - * /": t.arithmeticOperator,
  "| &": t.bitwiseOperator,
  // "== != < <= > >= =~ !~": t.compareOperator,
  ",": t.separator,
  "Ellipsis/... :": t.punctuation,
  "( )": t.paren,
  "[ ]": t.squareBracket,
  "{ }": t.brace,
})

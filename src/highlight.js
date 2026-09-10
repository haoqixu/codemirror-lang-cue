import {styleTags, tags as t} from "@lezer/highlight"

const binding = name =>
  `ForClause/${name}! TryClause/${name}! LetClause/${name}! LabelAlias/${name}! ` +
  `AliasExpr/${name}! Label/${name}! PostfixAlias/${name}!`

export const cueHighlighting = styleTags({
  "import package": t.moduleKeyword,
  "for if try else fallback otherwise": t.controlKeyword,
  let: t.definitionKeyword,
  in: t.operatorKeyword,

  "LabelName/Identifier! LabelName/SimpleStringLit": t.definition(t.propertyName),
  "Selector/Identifier! Selector/SimpleStringLit": t.propertyName,
  [binding("Identifier")]: t.definition(t.variableName),

  DefinitionIdentifier: t.typeName,
  "LabelName/DefinitionIdentifier!": t.definition(t.typeName),
  [binding("DefinitionIdentifier")]: t.definition(t.typeName),

  PredeclaredType: t.standard(t.typeName),
  PredeclaredFunction: t.standard(t.function(t.variableName)),
  "LabelName/PredeclaredType! LabelName/PredeclaredFunction!": t.definition(t.propertyName),
  "Selector/PredeclaredType! Selector/PredeclaredFunction!": t.propertyName,
  [binding("PredeclaredType")]: t.definition(t.variableName),
  [binding("PredeclaredFunction")]: t.definition(t.variableName),

  "PackageName/Identifier! PackageName/DefinitionIdentifier! PackageName/PredeclaredType! PackageName/PredeclaredFunction!": t.definition(t.namespace),
  "OperandName/Identifier!": t.variableName,
  "Attribute/Identifier! Attribute/DefinitionIdentifier! Attribute/PredeclaredType! Attribute/PredeclaredFunction!": t.attributeName,

  "CallExpr/PrimaryExpr/OperandName/Identifier!": t.function(t.variableName),
  "CallExpr/PrimaryExpr/OperandName/DefinitionIdentifier!": t.function(t.typeName),
  "CallExpr/PrimaryExpr/Selector/Identifier! CallExpr/PrimaryExpr/Selector/PredeclaredType! CallExpr/PrimaryExpr/Selector/PredeclaredFunction! CallExpr/PrimaryExpr/Selector/SimpleStringLit": t.function(t.propertyName),
  "CallExpr/PrimaryExpr/Selector/DefinitionIdentifier!": t.function(t.typeName),

  Literal: t.literal,
  "SimpleStringLit MultilineStringLit ImportPath": t.string,
  "SimpleBytesLit MultilineBytesLit": t.special(t.string),
  AttributeString: t.attributeValue,
  Escape: t.escape,
  Interpolation: [],
  "InterpolationStart InterpolationEnd": t.special(t.brace),
  "IntLit/...": t.integer,
  "BoolLit/...": t.bool,
  FloatLit: t.float,
  "NullLit/...": t.null,
  "BottomLit Top": t.atom,
  Comment: t.lineComment,

  "&& ||": t.logicOperator,
  "+ -": t.arithmeticOperator,
  '"*" "/"': t.arithmeticOperator,
  "| &": t.typeOperator,
  '== "!=" < <= > >= =~ "!~"': t.compareOperator,
  '"!"': t.logicOperator,
  "= ~": t.definitionOperator,
  ".": t.derefOperator,
  ", :": t.separator,
  '"..." ?': t.special(t.punctuation),
  "@": t.annotation,
  'LabelExpr/"!" Label/"!"': t.special(t.punctuation),
  "( )": t.paren,
  "[ ]": t.squareBracket,
  "{ }": t.brace,
})

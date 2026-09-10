import {parser} from "./syntax.grammar"
import {LRLanguage, LanguageSupport, indentNodeProp, foldNodeProp, foldInside, delimitedIndent, indentUnit} from "@codemirror/language"
import type {TreeIndentContext} from "@codemirror/language"
import {Prec} from "@codemirror/state"
import type {EditorState} from "@codemirror/state"
import type {SyntaxNode} from "@lezer/common"

function multilineDelimiter(node: SyntaxNode, state: EditorState) {
  let hashes = 0
  while (state.doc.sliceString(node.from + hashes, node.from + hashes + 1) === "#") hashes++
  const quoteAt = node.from + hashes
  const quote = state.doc.sliceString(quoteAt, quoteAt + 1)
  if ((quote !== "\"" && quote !== "'") ||
      state.doc.sliceString(quoteAt, quoteAt + 3) !== quote.repeat(3)) return null
  let newlineAt = quoteAt + 3
  if (state.doc.sliceString(newlineAt, newlineAt + 1) === "\r") newlineAt++
  if (state.doc.sliceString(newlineAt, newlineAt + 1) !== "\n") return null
  return {from: quoteAt + 3, close: quote.repeat(3) + "#".repeat(hashes)}
}

const keepMultilineIndent = (context: TreeIndentContext) =>
  multilineDelimiter(context.node, context.state) ? null : context.continue()

const foldMultilineString = (node: SyntaxNode, state: EditorState) => {
  const delimiter = multilineDelimiter(node, state)
  if (!delimiter || state.doc.sliceString(node.to - delimiter.close.length, node.to) !== delimiter.close) return null
  const to = node.to - delimiter.close.length
  return delimiter.from < to ? {from: delimiter.from, to} : null
}

const foldImportGroup = (node: SyntaxNode) => {
  const open = node.getChild("("), close = node.getChild(")")
  return open && close && open.to < close.from ? {from: open.to, to: close.from} : null
}

export const cueLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        Arguments: delimitedIndent({closing: ")", align: false}),
        "MultilineStringLit MultilineBytesLit AttributeString ImportPath": keepMultilineIndent
      }),
      foldNodeProp.add({
        "StructLit ListLit Arguments": foldInside,
        ImportDecl: foldImportGroup,
        "MultilineStringLit MultilineBytesLit AttributeString ImportPath": foldMultilineString
      }),
    ]
  }),
  languageData: {
    commentTokens: {line: "//"},
    indentOnInput: /^\s*[}\]\)]$/
  }
})

export function cue() {
  return new LanguageSupport(cueLanguage, Prec.lowest(indentUnit.of("\t")))
}

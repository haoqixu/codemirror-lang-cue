import {ExternalTokenizer, ContextTracker} from "@lezer/lr"
import {
    DecimalLit, SiLit, OctalLit, BinaryLit, HexLit,
    SimpleStringLit, SimpleBytesLit, _null, BottomLit, _true, _false,
    Top, FloatLit, ImportPath,
    insertedComma, space as spaceToken,
    Identifier,
    closeBracket,
    closeParen as closeParenToken,
    closeBrace as closeBraceToken,
} from "./syntax.grammar.terms"

const newline = 10, carriageReturn = 13, space = 32, tab = 9, slash = 47, closeParen = 41, closeBrace = 125, comma = 44, colon = 58

export const insertComma = new ExternalTokenizer((input, stack) => {
  for (let scan = 0, next = input.next;;) {
    if (stack.context && (next < 0 || next == newline || next == carriageReturn ||
                          next == slash && input.peek(scan + 1) == slash) ||
        next == closeParen || next == closeBrace) {
      // Suppress comma before ',' or ':' to match CUE scanner behavior
      let peek = scan
      let ch = next
      if (ch == newline || ch == carriageReturn) {
        ch = input.peek(++peek)
        while (ch == space || ch == tab || ch == newline || ch == carriageReturn) ch = input.peek(++peek)
      }
      if (ch != comma && ch != colon)
        input.acceptToken(insertedComma)
    }
    if (next != space && next != tab) break
    next = input.peek(++scan)
  }
}, {contextual: true})

let trackedTokens = new Set([
  Identifier,
  DecimalLit, SiLit, OctalLit, BinaryLit, HexLit,
  SimpleStringLit, SimpleBytesLit, _null, BottomLit, _true, _false,
  Top, FloatLit, ImportPath,
  closeParenToken, closeBracket, closeBraceToken])

export const trackTokens = new ContextTracker({
  start: false,
  shift: (context, term) => term == spaceToken ? context : trackedTokens.has(term)
})

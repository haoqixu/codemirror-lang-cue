import {ExternalTokenizer, ContextTracker} from "@lezer/lr"
import {
  DecimalLit, SiLit, OctalLit, BinaryLit, HexLit, postfixDecimal,
  SimpleStringLit, SimpleBytesLit, MultilineStringLit, MultilineBytesLit,
  SelectorString, AttributeString, ImportPath,
  simpleStringStart, simpleBytesStart, multilineStringStart, multilineBytesStart,
  importStringStart, selectorStringStart, stringContent, stringEnd, Escape, InterpolationStart, InterpolationEnd,
  _null, BottomLit, _true, _false, Top, FloatLit,
  _for, _if, _let, _in, _try, _else, fallback, otherwise, _package, _import,
  PredeclaredType, PredeclaredFunction,
  forStart, ifStart, tryStart, ellipsisToken, optionalMarker,
  insertedComma, space as spaceToken, Identifier, DefinitionIdentifier, Comment, bom, SourceFile,
  singleGuardClauses, generalClauses, AttrTokens,
  closeBracket, closeParen as closeParenToken, closeBrace as closeBraceToken,
} from "./syntax.grammar.terms"

const newline = 10, carriageReturn = 13, space = 32, tab = 9, slash = 47,
  closeParen = 41, comma = 44, period = 46, colon = 58, hash = 35, underscore = 95, backslash = 92
const starts = new Set([simpleStringStart, simpleBytesStart, multilineStringStart,
  multilineBytesStart, importStringStart, selectorStringStart])
const literals = new Set([SimpleStringLit, SimpleBytesLit, MultilineStringLit,
  MultilineBytesLit, SelectorString, AttributeString, ImportPath])
// These wrappers, like anonymous repetitions, may consume a trailing separator
// that is not represented by a named syntax-tree node.
const separatorLists = new Set([SourceFile, singleGuardClauses, generalClauses, AttrTokens])
const trackedTokens = new Set([
  Identifier, DefinitionIdentifier, PredeclaredType, PredeclaredFunction,
  DecimalLit, postfixDecimal, SiLit, OctalLit, BinaryLit, HexLit,
  _null, BottomLit, _true, _false, Top, FloatLit, stringEnd,
  closeParenToken, closeBracket, closeBraceToken,
  _for, _if, _let, _in, _try, _else, fallback, otherwise, _package, _import,
  forStart, ifStart, tryStart, ellipsisToken, optionalMarker
])

export const fileStart = new ExternalTokenizer(input => {
  if (input.pos !== 0 || input.next !== 0xfeff) return
  input.advance()
  input.acceptToken(bom)
})

// CUE scans a decimal followed by two dots as an integer, so the canonical
// explicit-open spelling `1...` is an integer followed by the postfix operator,
// not the otherwise valid float `1.` followed by two stray periods.
export const numericEllipsis = new ExternalTokenizer((input, stack) => {
  if (!stack.canShift(postfixDecimal)) return
  let offset = 0
  if (input.next === 48) {
    offset = 1
  } else if (input.next >= 49 && input.next <= 57) {
    offset = 1
    while (true) {
      const ch = input.peek(offset)
      if (ch >= 48 && ch <= 57) {
        offset++
      } else if (ch === underscore && input.peek(offset + 1) >= 48 && input.peek(offset + 1) <= 57) {
        offset += 2
      } else {
        break
      }
    }
  } else {
    return
  }
  if (input.peek(offset) !== period || input.peek(offset + 1) !== period ||
      input.peek(offset + 2) !== period) return
  input.advance(offset)
  input.acceptToken(postfixDecimal)
}, {contextual: true})

const unicodeLetter = /^\p{L}$/u, unicodeDigit = /^\p{Nd}$/u

// Lezer exposes UTF-16 code units, so combine surrogate pairs before applying
// Unicode category tests.
function codePointAt(input, offset) {
  const first = input.peek(offset)
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = input.peek(offset + 1)
    if (second >= 0xdc00 && second <= 0xdfff)
      return (first - 0xd800) * 0x400 + second - 0xdc00 + 0x10000
  }
  return first
}

function isIdentifierLetter(ch) {
  return ch === 36 || ch === 95 ||
    ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122 ||
    ch >= 0x80 && unicodeLetter.test(String.fromCodePoint(ch))
}

function isIdentifierDigit(ch) {
  return ch >= 48 && ch <= 57 ||
    ch >= 0x80 && unicodeDigit.test(String.fromCodePoint(ch))
}

function isIdentifierContinue(ch) {
  return isIdentifierLetter(ch) || isIdentifierDigit(ch)
}

export const identifiers = new ExternalTokenizer(input => {
  // Leave bottom to the generated tokenizer, rather than accepting its leading
  // underscore as an identifier.
  if (input.next === 95 && input.peek(1) === 124 && input.peek(2) === 95) return

  // Definitions (`#name`) and hidden definitions (`_#name`) need their own
  // term so themes can distinguish them from ordinary and hidden fields.
  const definition = input.next === hash || input.next === underscore && input.peek(1) === hash
  let offset = input.next === hash ? 1
    : input.next === underscore && input.peek(1) === hash ? 2 : 0
  let ch = codePointAt(input, offset)
  if (!isIdentifierLetter(ch)) return
  do {
    offset += ch > 0xffff ? 2 : 1
    ch = codePointAt(input, offset)
  } while (isIdentifierContinue(ch))
  input.advance(offset)
  input.acceptToken(definition ? DefinitionIdentifier : Identifier)
})

const predeclaredTypes = new Set([
  "bool", "int", "float", "string", "bytes", "number",
  "uint", "uint8", "uint16", "uint32", "uint64", "uint128",
  "int8", "int16", "int32", "int64", "int128", "rune", "float32", "float64"
])

const predeclaredFunctions = new Set([
  "len", "close", "and", "or", "div", "mod", "quo", "rem", "error"
])

export function identifierKind(word, stack) {
  const term = word === "package" ? _package : word === "import" ? _import
    : predeclaredTypes.has(word) ? PredeclaredType
    : predeclaredFunctions.has(word) ? PredeclaredFunction : -1
  return term >= 0 && stack.canShift(term) ? term : -1
}

// Keep a decoded BOM visible to import-path validation. Invalid UTF-8 becomes
// U+FFFD, which is forbidden in the path (as in the upstream parser).
const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", {ignoreBOM: true})

function hashesAt(input, offset, count) {
  for (let i = 0; i < count; i++) if (input.peek(offset + i) !== hash) return false
  return true
}

function opening(input) {
  let hashes = 0
  while (input.peek(hashes) === hash) hashes++
  const quote = input.peek(hashes)
  if (quote !== 34 && quote !== 39) return null
  // #"""# is a single-line raw string containing one quote, not a multiline opener.
  const multiline = input.peek(hashes + 1) === quote && input.peek(hashes + 2) === quote &&
    !(hashes && hashesAt(input, hashes + 3, hashes))
  let length = hashes + (multiline ? 3 : 1)
  if (multiline) {
    if (input.peek(length) === carriageReturn) length++
    if (input.peek(length) !== newline) return {invalid: true}
    length++
  }
  return {quote, hashes, multiline, length}
}

function closing(input, frame) {
  const quotes = frame.multiline ? 3 : 1
  for (let i = 0; i < quotes; i++) if (input.peek(i) !== frame.quote) return false
  return hashesAt(input, quotes, frame.hashes)
}

function escapeAt(input, frame) {
  return input.next === backslash && hashesAt(input, 1, frame.hashes)
}

// Decode only escapes, not expressions. Byte escapes are distinct from Unicode
// escapes so import-path validation can reject invalid UTF-8 byte sequences.
function escape(input, frame) {
  let offset = 1 + frame.hashes, ch = input.peek(offset++)
  if (ch === 40) return {length: offset, interpolation: true}
  const simple = {97: "\x07", 98: "\b", 102: "\f", 110: "\n", 114: "\r", 116: "\t", 118: "\v", 92: "\\", 47: "/"}
  if (ch === frame.quote || simple[ch] != null)
    return {length: offset, value: ch === frame.quote ? String.fromCharCode(ch) : simple[ch]}
  let digits, base = 16, byte = false
  if (ch === 117 || ch === 85) digits = ch === 117 ? 4 : 8
  else if (frame.quote === 39 && ch === 120) { digits = 2; byte = true }
  else if (frame.quote === 39 && ch >= 48 && ch <= 55) {
    digits = 3; base = 8; byte = true; offset--
  } else return null
  let value = 0
  for (let i = 0; i < digits; i++) {
    ch = input.peek(offset++)
    const digit = ch >= 48 && ch <= 57 ? ch - 48 :
      ch >= 65 && ch <= 70 ? ch - 55 : ch >= 97 && ch <= 102 ? ch - 87 : -1
    if (digit < 0 || digit >= base) return null
    value = value * base + digit
  }
  if (value > (byte ? 255 : 0x10ffff)) return null
  return {length: offset, value: String.fromCodePoint(value), byte}
}

function invalid(input) {
  if (input.next >= 0) input.advance()
  input.acceptToken(0) // Lezer's error token: never a successful strict parse.
}

export const strings = new ExternalTokenizer((input, stack) => {
  const frame = stack.context.string
  if (frame && !frame.expression) {
    // A newline cannot belong to a single-line literal. Offering the outer
    // separator makes recovery insert the missing quote rather than swallow the
    // next declaration. It is not accepted by the literal grammar in strict mode.
    if (!frame.multiline && input.next === newline) return input.acceptToken(insertedComma)
    if (input.next < 0 || input.next === 0 || input.next === 0xfeff) return invalid(input)
    if (closing(input, frame) && (!frame.multiline || frame.lineStart)) {
      if (frame.multiline && frame.minIndent != null && !frame.minIndent.startsWith(frame.indent) ||
          frame.path != null && !validImport(frame)) return invalid(input)
      input.advance((frame.multiline ? 3 : 1) + frame.hashes)
      return input.acceptToken(stringEnd)
    }
    if (escapeAt(input, frame)) {
      const token = escape(input, frame)
      if (!token) return invalid(input)
      input.advance(token.length)
      return input.acceptToken(token.interpolation ? InterpolationStart : Escape)
    }
    let lineStart = frame.lineStart
    do {
      const ch = input.next
      if (ch < 0 || ch === 0 || ch === 0xfeff || !frame.multiline && ch === newline || escapeAt(input, frame) ||
          closing(input, frame) && (!frame.multiline || lineStart)) break
      if (ch === newline) lineStart = true
      else if (ch !== carriageReturn && ch !== space && ch !== tab) lineStart = false
      input.advance()
    } while (true)
    return input.acceptToken(stringContent)
  }
  // Only the interpolation's own ')' ends it; calls and parenthesized expressions
  // must consume their regular closeParen tokens first.
  if (frame && input.next === closeParen && stack.canShift(InterpolationEnd)) {
    input.advance()
    return input.acceptToken(InterpolationEnd)
  }
  const open = opening(input)
  if (!open) return
  if (open.invalid) return invalid(input)
  const selector = stack.canShift(selectorStringStart)
  if (selector && (open.hashes || open.quote !== 34 || input.peek(1) === 34)) return invalid(input)
  const term = selector ? selectorStringStart : stack.canShift(importStringStart) ? importStringStart : open.multiline
    ? open.quote === 34 ? multilineStringStart : multilineBytesStart
    : open.quote === 34 ? simpleStringStart : simpleBytesStart
  if (!stack.canShift(term)) return
  input.advance(open.length)
  input.acceptToken(term)
}, {contextual: true})

// At declaration/list-element boundaries, for/if/try introduce a comprehension
// unless followed by a label/alias marker or a separator. Commit to that choice:
// an incomplete `if(x)` must not silently turn into a call of a field named if.
export const clauseKeywords = new ExternalTokenizer((input, stack) => {
  if (stack.context.string && !stack.context.string.expression) return
  const word = input.next === 102 ? "for"
    : input.next === 105 ? "if"
    : input.next === 116 ? "try"
    : null
  if (!word) return
  const term = word === "for" ? forStart : word === "if" ? ifStart : tryStart
  if (!stack.canShift(term)) return
  for (let i = 0; i < word.length; i++) if (input.peek(i) !== word.charCodeAt(i)) return
  let offset = word.length
  // Match the same Unicode identifier boundary as the identifier tokenizer,
  // not just an ASCII word prefix.
  if (isIdentifierContinue(codePointAt(input, offset))) return
  let ch = input.peek(offset)
  while (ch === space || ch === tab || ch === carriageReturn) ch = input.peek(++offset)
  if (ch === newline) {
    do { ch = input.peek(++offset) }
    while (ch === space || ch === tab || ch === newline || ch === carriageReturn)
    if (ch !== comma && ch !== colon) ch = comma // an automatically inserted comma
  } else if (ch === slash && input.peek(offset + 1) === slash) ch = comma
  if (ch < 0 || ch === comma || ch === colon || ch === 63 ||
      ch === 61 && input.peek(offset + 1) !== 61 && input.peek(offset + 1) !== 126) return
  if (ch === 33 && input.peek(offset + 1) !== 61 && input.peek(offset + 1) !== 126) {
    if (word !== "if") return
    // The upstream parser distinguishes `if!: ...` from `if !condition {...}`
    // by peeking past whitespace (but not comments) for the following colon.
    do { ch = input.peek(++offset) }
    while (ch === space || ch === tab || ch === newline || ch === carriageReturn)
    if (ch === colon) return
  }
  input.advance(word.length)
  input.acceptToken(term)
}, {contextual: true})

export const layout = new ExternalTokenizer((input, stack) => {
  if (stack.context.string && !stack.context.string.expression) return
  let scan = 0, ch = input.next
  while (ch === space || ch === tab || ch === carriageReturn) ch = input.peek(++scan)
  if (stack.context.comma) {
    let next = ch
    if (ch === newline) {
      let peek = scan
      do { next = input.peek(++peek) }
      while (next === space || next === tab || next === newline || next === carriageReturn)
    }
    if (ch < 0 || ch === slash && input.peek(scan + 1) === slash ||
        ch === newline && next !== comma && next !== colon) {
      return input.acceptToken(insertedComma)
    }
  }
  // Whitespace is emitted by this same tokenizer even in contexts where comma
  // insertion is illegal (e.g. a parenthesized expression or a slice bound).
  if (input.next === space || input.next === tab || input.next === carriageReturn || input.next === newline) {
    do { input.advance() }
    while (input.next === space || input.next === tab || input.next === carriageReturn || input.next === newline)
    return input.acceptToken(spaceToken)
  }
  if (input.next === slash && input.peek(1) === slash) {
    do { input.advance() }
    while (input.next >= 0 && input.next !== newline && input.next !== 0xfeff)
    input.acceptToken(Comment)
  }
}, {contextual: true})

function readTo(input, end) {
  let text = ""
  while (input.pos < end && input.next >= 0) {
    text += String.fromCharCode(input.next)
    input.advance()
  }
  return text
}

function utf8(text) {
  let bytes = ""
  for (const byte of encoder.encode(text)) bytes += String.fromCharCode(byte)
  return bytes
}

function commonPrefix(a, b) {
  if (a == null) return b
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return a.slice(0, i)
}

function textContext(frame, text, escaped) {
  let {lineStart, indent, minIndent, path, pathHash, pathHashPower, pendingSurrogate} = frame
  if (frame.multiline) for (const ch of text) {
    if (ch === "\r") { if (lineStart) indent += ch; continue }
    if (lineStart) {
      if (ch === " " || ch === "\t") { indent += ch; continue }
      if (ch !== "\n" || indent) minIndent = commonPrefix(minIndent, indent)
    }
    lineStart = ch === "\n"
    if (lineStart) indent = ""
  }
  if (path != null) {
    let value
    if (escaped?.byte) {
      value = utf8(pendingSurrogate) + escaped.value
      pendingSurrogate = ""
    } else {
      // Adjacent \\u escapes may form a surrogate pair. Do not encode the high
      // surrogate separately, which would prematurely replace it with U+FFFD.
      value = pendingSurrogate + (escaped ? escaped.value : text.replace(/\r/g, ""))
      const last = value.charCodeAt(value.length - 1)
      pendingSurrogate = last >= 0xd800 && last <= 0xdbff ? value.slice(-1) : ""
      if (pendingSurrogate) value = value.slice(0, -1)
      value = utf8(value)
    }
    path += value
    // Keep the polynomial hash and its multiplier in step with the path. This
    // lets contextHash compose the accumulated path in constant time.
    for (let i = 0; i < value.length; i++) {
      pathHash = (Math.imul(pathHash, 31) + value.charCodeAt(i)) | 0
      pathHashPower = Math.imul(pathHashPower, 31)
    }
  }
  return {...frame, lineStart, indent, minIndent, path, pathHash, pathHashPower, pendingSurrogate}
}

function validImport(frame) {
  let value = decoder.decode(Uint8Array.from(frame.path + utf8(frame.pendingSurrogate), ch => ch.charCodeAt(0)))
  if (frame.multiline) {
    const indent = frame.indent.replace(/\r/g, "")
    value = value.slice(0, value.length - indent.length)
    if (value.endsWith("\n")) value = value.slice(0, -1)
    value = value.split("\n").map(line => line.startsWith(indent) ? line.slice(indent.length) : line).join("\n")
  }
  const colon = value.lastIndexOf(":")
  if (colon >= 0) value = value.slice(0, colon)
  return /^[\p{L}\p{M}\p{N}\p{P}\p{S}]+$/u.test(value) &&
    !/[!"#$%&'()*,:;<=>?\[\]\\^`{|}\uFFFD]/u.test(value)
}

function contextHash(context) {
  let hash = context.comma ? 1 : 0
  function add(value) { hash = (Math.imul(hash, 31) + value) | 0 }
  function text(value) {
    add(value == null ? -1 : value.length)
    if (value != null) for (let i = 0; i < value.length; i++) add(value.charCodeAt(i))
  }
  for (let frame = context.string; frame; frame = frame.parent) {
    add(frame.quote); add(frame.hashes); add(+frame.multiline); add(+frame.expression); add(+frame.lineStart)
    text(frame.indent); text(frame.minIndent)
    if (frame.path == null) add(-1)
    else {
      add(frame.path.length)
      hash = (Math.imul(hash, frame.pathHashPower) + frame.pathHash) | 0
    }
    text(frame.pendingSurrogate)
  }
  return hash
}

// Reused literal-body fragments must have the same effect as freshly shifted
// text. Interpolation code is not literal text (its newlines/quotes/indentation
// must not change the enclosing string). Whole nested literals are balanced and
// therefore leave the enclosing quote stack unchanged when reused in code.
function reuse(context, node, stack, input) {
  let frame = context.string
  if (frame && !frame.expression) {
    const start = input.pos
    node.iterate({enter(ref) {
      if (ref.name !== "Interpolation" && ref.name !== "Escape") return
      frame = textContext(frame, readTo(input, start + ref.from))
      if (ref.name === "Interpolation") {
        frame = textContext(frame, "\\")
        readTo(input, start + ref.to)
        frame = {...frame, lineStart: false, indent: ""}
      } else {
        const token = escape(input, frame)
        frame = textContext(frame, readTo(input, start + ref.to), token ?? {value: ""})
      }
      return false
    }})
    frame = textContext(frame, readTo(input, start + node.length))
    return {comma: false, string: frame}
  }
  const cursor = node.cursor()
  while (!literals.has(cursor.type.id) && cursor.lastChild()) {}
  // Repetitions and separator lists may already include an invisible trailing
  // comma. Other named expressions must retain their lexical comma state even
  // where the grammar cannot accept a comma (e.g. a slice's upper bound).
  return {comma: cursor.type.id !== Comment &&
    (!node.type.isAnonymous && !separatorLists.has(node.type.id) || stack.canShift(insertedComma)) &&
    (literals.has(cursor.type.id) || trackedTokens.has(cursor.type.id)), string: frame}
}

export const trackTokens = new ContextTracker({
  start: {comma: false, string: null},
  hash: contextHash,
  reuse,
  reduce(context, term, stack, input) {
    // Recovery can finish a literal without shifting its closing delimiter.
    // Do not let that unfinished frame consume the following declarations.
    return literals.has(term) && context.string?.start === input.pos
      ? {comma: true, string: context.string.parent} : context
  },
  shift(context, term, stack, input) {
    const frame = context.string
    if (starts.has(term)) {
      // Recovery may insert an opener. Use a safe default when it has no text.
      const open = opening(input)
      return {comma: false, string: {
        start: input.pos, quote: open?.quote ?? 34, hashes: open?.hashes ?? 0,
        multiline: open?.multiline ?? false, expression: false,
        lineStart: open?.multiline ?? false, indent: "", minIndent: null,
        path: term === importStringStart ? "" : null, pathHash: 0, pathHashPower: 1,
        pendingSurrogate: "", parent: frame
      }}
    }
    if (term === stringEnd) return {comma: true, string: frame?.parent ?? null}
    if (frame && term === InterpolationEnd)
      return {comma: false, string: {...frame, expression: false, lineStart: false, indent: ""}}
    if (frame && (term === stringContent || term === Escape || term === InterpolationStart)) {
      const token = term === Escape ? escape(input, frame) : null
      const next = textContext(frame, readTo(input, stack.pos), token)
      return {comma: false, string: term === InterpolationStart ? {...next, expression: true} : next}
    }
    return term === spaceToken ? context : {comma: trackedTokens.has(term), string: frame}
  }
})

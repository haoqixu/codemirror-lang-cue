import {cueLanguage} from "../dist/index.js"
import {fileTests} from "@lezer/generator/dist/test"

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from 'url';
let caseDir = path.dirname(fileURLToPath(import.meta.url))

const UPDATE = process.env.TEST_UPDATE === "1"

function printTree(tree, indent = "") {
  let cursor = tree.cursor()
  let result = ""
  let depth = 0
  do {
    // Adjust depth based on cursor movement
    const name = cursor.name
    if (/\W/.test(name) && !cursor.type.isError) {
      result += JSON.stringify(name)
    } else {
      result += name
    }
    if (cursor.firstChild()) {
      result += "(\n"
      depth++
      result += indent + "  ".repeat(depth)
    } else {
      // Check if there's a sibling
      if (cursor.nextSibling()) {
        result += ",\n" + indent + "  ".repeat(depth)
      } else {
        // Go up until we find a sibling or reach root
        while (true) {
          if (!cursor.parent()) break
          depth--
          result += ")"
          if (cursor.nextSibling()) {
            result += ",\n" + indent + "  ".repeat(depth)
            break
          }
        }
      }
    }
  } while (depth > 0 || cursor.nextSibling())
  return result
}

function updateFile(filePath, content) {
  const parser = cueLanguage.parser
  // Replace each expected output in-place, preserving original formatting
  const updated = content.replace(
    /(#[ \t]*(.*?)(?:\{.*?\})?\s*(?:\r\n|\r|\n)([^]*?)==+>)([^]*?)(?=$|(?:\r\n|\r|\n)+(?=#))/g,
    (match, before, name, input, expectedBlock) => {
      const text = input.trim()
      const configMatch = /\{.*\}$/.exec(name)
      const config = configMatch ? JSON.parse(configMatch[0]) : null
      const strict = true
      let p = parser
      if (p.configure && (strict || config))
        p = p.configure(Object.assign({strict}, config))
      const tree = p.parse(text)
      const actual = printTree(tree)
      return `${before}\n${actual}`
    }
  )
  fs.writeFileSync(filePath, updated)
}

for (let file of fs.readdirSync(caseDir)) {
  if (!/\.txt$/.test(file)) continue

  let filePath = path.join(caseDir, file)
  let content = fs.readFileSync(filePath, "utf8")
  let name = /^[^\.]*/.exec(file)[0]

  if (UPDATE) {
    updateFile(filePath, content)
    describe(name, () => {
      it("updated", () => {})
    })
  } else {
    describe(name, () => {
      for (let {name, run} of fileTests(content, file))
        it(name, () => run(cueLanguage.parser))
    })
  }
}

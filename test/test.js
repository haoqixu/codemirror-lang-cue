import {cueLanguage} from "../dist/index.js"
import {fileTests} from "@lezer/generator/dist/test"
import {printTree} from "./tree.js"

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from 'url';
let caseDir = path.dirname(fileURLToPath(import.meta.url))

const UPDATE = process.env.TEST_UPDATE === "1"

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

for (let file of fs.readdirSync(caseDir, { recursive: true })) {
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

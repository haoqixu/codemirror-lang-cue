import {execFileSync} from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import {fileURLToPath} from "node:url"
import {fileTests} from "@lezer/generator/dist/test"
import {cueLanguage} from "../dist/index.js"
import {printTree} from "../test/tree.js"

const [checkout, ...args] = process.argv.slice(2)
if (!checkout || args.some(arg => arg !== "--check")) {
  console.error("Usage: node scripts/import-cue-tests.js /path/to/cue [--check]")
  process.exit(1)
}
const check = args.includes("--check")
const destination = fileURLToPath(new URL("../test/testdata/cue/", import.meta.url))
const upstream = JSON.parse(fs.readFileSync(path.join(destination, "upstream.json"), "utf8"))
const parser = cueLanguage.parser.configure({strict: true})
const remainingExclusions = new Set(Object.keys(upstream.exclude))

function git(...args) {
  return execFileSync("git", ["-C", checkout, ...args], {encoding: "utf8"})
}

// txtar comments and golden outputs are not CUE inputs. Only .input members
// are used by the upstream format.TestFiles test, which requires them to parse.
function inputs(archive) {
  const headers = [...archive.matchAll(/^-- (.+) --(?:\r?\n|$)/gm)]
  const entries = new Map()
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const name = header[1]
    if (!name.endsWith(".input")) continue
    if (entries.has(name)) throw new Error(`Duplicate txtar input: ${name}`)
    entries.set(name, archive.slice(header.index + header[0].length,
      headers[i + 1]?.index ?? archive.length))
  }
  return entries
}

// Read the pinned Git objects, not the checkout's possibly modified files.
const archives = git("ls-tree", "--name-only", `${upstream.revision}:${upstream.directory}`)
  .trim().split("\n").filter(name => name.endsWith(".txtar")).sort()
const files = new Map()
let count = 0
for (const archive of archives) {
  const source = `${upstream.directory}/${archive}`
  const cases = []
  for (const [name, input] of inputs(git("show", `${upstream.revision}:${source}`))) {
    const id = `${archive}/${name}`
    if (remainingExclusions.delete(id)) continue
    // Never bless recovery trees as valid syntax, or silently skip a failure.
    let tree
    try {
      tree = parser.parse(input.trim())
    } catch (error) {
      throw new Error(`${source}/${name}: ${error.message}`)
    }
    const newline = input && !input.endsWith("\n") ? "\n" : ""
    cases.push(`# ${source} / ${name} (adapted to Lezer)\n${input}${newline}==>\n${printTree(tree)}`)
    count++
  }
  if (cases.length) {
    const filename = archive.replace(/\.txtar$/, ".txt")
    const content = cases.join("\n\n")
    // Also validate the generated Lezer fixture format before writing anything.
    for (const test of fileTests(content, filename)) test.run(parser)
    files.set(filename, content)
  }
}
if (remainingExclusions.size) {
  throw new Error(`Unknown excluded inputs: ${[...remainingExclusions].join(", ")}`)
}
if (!count) throw new Error("No upstream CUE inputs found")
const stale = fs.readdirSync(destination).filter(name => name.endsWith(".txt") && !files.has(name))
if (stale.length) {
  throw new Error(`Remove obsolete generated fixtures before importing: ${stale.join(", ")}`)
}

for (const [filename, content] of files) {
  const target = path.join(destination, filename)
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) {
      throw new Error(`Out-of-date fixture: ${target}`)
    }
  } else {
    fs.writeFileSync(target, content)
  }
}
console.log(`${check ? "Checked" : "Imported"} ${count} CUE cases (${Object.keys(upstream.exclude).length} explicitly excluded) at ${upstream.revision}`)

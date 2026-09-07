export function printTree(tree, indent = "") {
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

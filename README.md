**stdio!!!** 

# motion-mcp

An [MCP](https://modelcontextprotocol.io) server for **Apple Motion**. It lets an
AI assistant inspect and edit Motion documents (`.motn`, `.moti`, `.moef`,
`.motr`, `.molo`) — reading the layer graph, resolving object types, and getting
or setting parameters — and drive the Motion app on macOS (open a document,
check status, quit).

## What this can and can't do

Apple Motion stores its projects and Final Cut Pro templates as **plain-text XML**
(`<ozml>` / `ozxmlscene`), which is documented by Apple's
[Motion XML guide](https://developer.apple.com/library/archive/documentation/AppleApplications/Conceptual/motion_XML_guide/).
This server reads and writes that XML directly, so the **file tools work even
without Motion installed** and are the core of what it does.

Motion itself has essentially **no AppleScript dictionary**, so there is no way to
script rendering or exporting. App control is limited to Launch Services / Standard
Suite verbs: open a document, report status, quit. To render, use Motion's **Share**
menu or drop the project onto **Compressor**.

## Tools

**Inspection & search (no Motion required)**

| Tool | Description |
| --- | --- |
| `inspect_project` | Summarize a document: ozml/display version, scene settings (dimensions, duration, fps), factory/type table, the full layer tree, and candidate text/string values. |
| `list_objects` | Flat list of every object/layer with `id`, `name`, resolved `type`, and hierarchy path. |
| `get_object` | One object (by `id`) plus its full parameter tree. |
| `list_parameters` | The parameter tree for an object: name paths, ids, values, and animation state. |
| `find` | Case-insensitive substring search across object names/types and parameter name paths/values. |
| `list_templates` | List installed FCP/Motion templates under `~/Movies/Motion Templates`, optionally filtered by kind. |

**Editing (writes back to disk, creates a `.bak` backup)**

| Tool | Description |
| --- | --- |
| `set_parameter` | Set the constant value of a parameter (addressed by name path e.g. `Transform/Position/X`, or by id). Refuses animated parameters unless `force=true`. |
| `rename_object` | Set the display name of an object (by `id`). |

**App control (macOS, Motion required)**

| Tool | Description |
| --- | --- |
| `motion_status` | Is Motion installed / running, and what version. |
| `open_in_motion` | Open a document in Motion (launches it if needed). |
| `reveal_in_finder` | Reveal a file in Finder. |
| `quit_motion` | Ask Motion to quit. |

### How objects and parameters are addressed

- **Objects** are addressed by their `id` attribute (see `list_objects`).
- **Parameters** are addressed by a **name path** like `Transform/Position/X`
  (recommended, from `list_parameters`) or by parameter `id`. Motion reuses small
  ids across folders, so name paths are unambiguous where ids may not be.
- Parameters with a `<curve>` are **animated** (keyframed); their value lives in
  keypoints rather than a single constant. `set_parameter` refuses these unless
  `force=true`, which replaces the animation with a constant.

## Install & build

```bash
git clone https://github.com/kerodem/motion-mcp.git
cd motion-mcp
npm install
npm run build
```

## Configure your MCP client

Add the server to your client config, pointing at the built entry point.

**Claude Code** (`claude mcp add`):

```bash
claude mcp add motion -- node /absolute/path/to/motion-mcp/dist/index.js
```

**Generic MCP config** (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "motion": {
      "command": "node",
      "args": ["/absolute/path/to/motion-mcp/dist/index.js"]
    }
  }
}
```

The server speaks MCP over stdio.

## Development

```bash
npm run watch      # recompile on change
npm run typecheck  # type-check only
npm test           # build + run the test suite (node --test)
node scripts/smoke.mjs  # spin up the server and exercise it via the MCP client SDK
```

Tests run against a fixture Motion document (`test/fixtures/sample.motn`) modeled on
Apple's documented schema, so the full read/edit round-trip is verified without
Motion installed.

## Notes & limitations

- **Rendering/exporting is not supported** — Motion isn't scriptable for it. Use
  Share or Compressor.
- Text-layer content representation varies by object; `inspect_project` surfaces
  non-numeric parameter values as `textCandidates`, and `find` locates them, but
  there is no dedicated "set text" tool yet (`set_parameter` covers string-valued
  channels).
- Edits preserve document structure (Motion re-parses by `id`); incidental
  whitespace/formatting may change. A `.bak` is written on first edit.

## License

MIT

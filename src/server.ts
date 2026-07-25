import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { loadDocument, saveDocument } from "./motion/xml.js";
import { inspectDocument } from "./motion/inspect.js";
import {
  buildSceneGraph,
  findObjectById,
  flattenObjects,
  objectToJson,
} from "./motion/model.js";
import { listParameters, setParameterValue } from "./motion/params.js";
import { renameObject, search } from "./motion/objects.js";
import { KNOWN_KINDS, TEMPLATE_ROOT, listTemplates } from "./motion/templates.js";
import {
  motionStatus,
  openProject,
  quitMotion,
  revealInFinder,
} from "./motion/app.js";
import { jsonResult, resolvePath } from "./util.js";

const pathArg = z
  .string()
  .describe("Path to a Motion document (.motn/.moti/.moef/...). ~ is expanded.");

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "motion-mcp", version: "0.1.0" },
    {
      instructions:
        "Tools for Apple Motion. File tools read/edit the XML of Motion documents " +
        "(.motn/.moti/...) and work without Motion installed; edits create a .bak " +
        "backup. App tools (open/quit) require Motion on macOS. Motion cannot be " +
        "scripted to render/export — use its Share menu or Compressor. Objects and " +
        "parameters are addressed by id and by name path (e.g. 'Transform/Position/X').",
    },
  );

  // --- Environment ---------------------------------------------------------
  server.registerTool(
    "motion_status",
    {
      title: "Motion app status",
      description:
        "Report whether Apple Motion is installed and running on this machine, plus its version.",
      inputSchema: {},
    },
    async () => jsonResult(motionStatus()),
  );

  server.registerTool(
    "list_templates",
    {
      title: "List installed Motion/FCP templates",
      description: `List Final Cut Pro / Motion templates under ${TEMPLATE_ROOT}. Optionally filter by kind (${KNOWN_KINDS.join(", ")}).`,
      inputSchema: {
        kind: z
          .string()
          .optional()
          .describe(`Optional kind filter, e.g. one of: ${KNOWN_KINDS.join(", ")}`),
      },
    },
    async ({ kind }) => {
      const templates = listTemplates(kind);
      return jsonResult({ root: TEMPLATE_ROOT, count: templates.length, templates });
    },
  );

  // --- Inspection ----------------------------------------------------------
  server.registerTool(
    "inspect_project",
    {
      title: "Inspect a Motion document",
      description:
        "Parse a Motion document and summarize it: version, scene settings (dimensions/duration/fps), " +
        "factory/type table, the full layer tree, and candidate text/string values.",
      inputSchema: { path: pathArg },
    },
    async ({ path }) => {
      const file = resolvePath(path);
      return jsonResult(inspectDocument(loadDocument(file), file));
    },
  );

  server.registerTool(
    "list_objects",
    {
      title: "List scene objects",
      description:
        "Flat list of every object/layer in the scene graph with id, name, type and hierarchy path.",
      inputSchema: { path: pathArg },
    },
    async ({ path }) => {
      const doc = loadDocument(resolvePath(path));
      const objects = flattenObjects(buildSceneGraph(doc)).map((o) => ({
        id: o.id,
        name: o.name,
        kind: o.kind,
        type: o.type,
        path: o.path,
      }));
      return jsonResult({ count: objects.length, objects });
    },
  );

  server.registerTool(
    "get_object",
    {
      title: "Get one object with its parameters",
      description:
        "Return a single object (by id) including its full parameter tree (values, folders, and animation state).",
      inputSchema: {
        path: pathArg,
        id: z.string().describe("The object's id attribute (see list_objects)."),
      },
    },
    async ({ path, id }) => {
      const doc = loadDocument(resolvePath(path));
      const obj = findObjectById(doc, id);
      if (!obj) throw new Error(`No object with id="${id}".`);
      return jsonResult({ ...objectToJson(obj), parameters: listParameters(obj.el) });
    },
  );

  server.registerTool(
    "list_parameters",
    {
      title: "List an object's parameters",
      description:
        "Return the parameter tree for an object (by id): name paths, ids, constant values, and animation state.",
      inputSchema: {
        path: pathArg,
        objectId: z.string().describe("The object's id attribute."),
      },
    },
    async ({ path, objectId }) => {
      const doc = loadDocument(resolvePath(path));
      const obj = findObjectById(doc, objectId);
      if (!obj) throw new Error(`No object with id="${objectId}".`);
      return jsonResult({
        objectId,
        objectName: obj.name,
        parameters: listParameters(obj.el),
      });
    },
  );

  server.registerTool(
    "find",
    {
      title: "Search objects and parameters",
      description:
        "Case-insensitive substring search across object names/types and parameter name paths/values.",
      inputSchema: {
        path: pathArg,
        query: z.string().describe("Text to search for."),
      },
    },
    async ({ path, query }) => {
      const doc = loadDocument(resolvePath(path));
      const hits = search(doc, query);
      return jsonResult({ query, count: hits.length, hits });
    },
  );

  // --- Editing (writes back to disk, creates .bak) -------------------------
  server.registerTool(
    "set_parameter",
    {
      title: "Set a parameter's value",
      description:
        "Set the constant value of a parameter on an object and save the file. Address the parameter by " +
        "name path (e.g. 'Transform/Position/X') or by id. Animated (keyframed) parameters are refused " +
        "unless force=true (which replaces the animation with a constant). A .bak backup is created.",
      inputSchema: {
        path: pathArg,
        objectId: z.string().describe("The object's id attribute."),
        parameterPath: z
          .string()
          .optional()
          .describe("Name path to the parameter, e.g. 'Transform/Position/X'."),
        parameterId: z
          .string()
          .optional()
          .describe("Parameter id (alternative to parameterPath)."),
        value: z.string().describe("New value (as a string; numbers accepted)."),
        force: z
          .boolean()
          .optional()
          .describe("Overwrite an animated parameter with a constant value."),
        backup: z
          .boolean()
          .optional()
          .describe("Create a .bak backup before writing (default true)."),
      },
    },
    async ({ path, objectId, parameterPath, parameterId, value, force, backup }) => {
      if (!parameterPath && !parameterId) {
        throw new Error("Provide either parameterPath or parameterId.");
      }
      const file = resolvePath(path);
      const doc = loadDocument(file);
      const obj = findObjectById(doc, objectId);
      if (!obj) throw new Error(`No object with id="${objectId}".`);
      const result = setParameterValue(
        obj.el,
        { path: parameterPath, id: parameterId },
        value,
        { force },
      );
      const { backupPath } = saveDocument(file, doc, { backup });
      return jsonResult({ ok: true, objectId, ...result, backupPath });
    },
  );

  server.registerTool(
    "rename_object",
    {
      title: "Rename an object",
      description:
        "Set the display name of an object (by id) and save the file. A .bak backup is created.",
      inputSchema: {
        path: pathArg,
        id: z.string().describe("The object's id attribute."),
        name: z.string().describe("New display name."),
        backup: z.boolean().optional().describe("Create a .bak backup (default true)."),
      },
    },
    async ({ path, id, name, backup }) => {
      const file = resolvePath(path);
      const doc = loadDocument(file);
      const result = renameObject(doc, id, name);
      const { backupPath } = saveDocument(file, doc, { backup });
      return jsonResult({ ok: true, ...result, backupPath });
    },
  );

  // --- App control (macOS, Motion required) --------------------------------
  server.registerTool(
    "open_in_motion",
    {
      title: "Open a document in Motion",
      description: "Open a Motion document in the Motion app (launches Motion if needed). macOS only.",
      inputSchema: { path: pathArg },
    },
    async ({ path }) => jsonResult(openProject(resolvePath(path))),
  );

  server.registerTool(
    "reveal_in_finder",
    {
      title: "Reveal a file in Finder",
      description: "Reveal a file in macOS Finder.",
      inputSchema: { path: pathArg },
    },
    async ({ path }) => jsonResult(revealInFinder(resolvePath(path))),
  );

  server.registerTool(
    "quit_motion",
    {
      title: "Quit Motion",
      description: "Ask the Motion app to quit. macOS only.",
      inputSchema: {},
    },
    async () => jsonResult(quitMotion()),
  );

  return server;
}

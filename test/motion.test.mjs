import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { loadDocument, saveDocument, parseDocument } from "../dist/motion/xml.js";
import {
  buildSceneGraph,
  flattenObjects,
  findObjectById,
  getDocumentMeta,
  getSceneSettings,
  buildFactoryMap,
} from "../dist/motion/model.js";
import { listParameters, leafParameters, setParameterValue, findParameterElement } from "../dist/motion/params.js";
import { search, renameObject } from "../dist/motion/objects.js";
import { inspectDocument } from "../dist/motion/inspect.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "sample.motn");

/** Copy the fixture into a temp dir so edit tests never mutate the original. */
function tempCopy() {
  const dir = mkdtempSync(join(tmpdir(), "motion-mcp-"));
  const dest = join(dir, "sample.motn");
  copyFileSync(FIXTURE, dest);
  return dest;
}

test("parses ozml document metadata", () => {
  const doc = loadDocument(FIXTURE);
  const meta = getDocumentMeta(doc);
  assert.equal(meta.ozmlVersion, "4.0");
  assert.equal(meta.displayVersion, "5.5");
});

test("rejects non-Motion XML", () => {
  assert.throws(() => parseDocument("<foo/>"), /not an Apple Motion document/);
});

test("reads scene settings", () => {
  const s = getSceneSettings(loadDocument(FIXTURE));
  assert.equal(s.width, 1920);
  assert.equal(s.height, 1080);
  assert.equal(s.frameRate, 30);
  assert.equal(s.duration, 300);
  assert.equal(s.raw.bgColor, "0 0 0 1");
});

test("builds factory table", () => {
  const map = buildFactoryMap(loadDocument(FIXTURE));
  assert.equal(map.get("1").description, "Image");
  assert.equal(map.get("2").description, "Text");
});

test("walks the scene graph and resolves object types via factories", () => {
  const objects = flattenObjects(buildSceneGraph(loadDocument(FIXTURE)));
  const byName = Object.fromEntries(objects.map((o) => [o.name, o]));
  assert.equal(objects.length, 3); // Project, Title, Background
  assert.equal(byName.Project.kind, "layer");
  assert.equal(byName.Title.type, "Text");
  assert.equal(byName.Background.type, "Image");
  assert.equal(byName.Title.path, "Project/Title");
});

test("lists parameters including folders and animation state", () => {
  const title = findObjectById(loadDocument(FIXTURE), "10011");
  const params = listParameters(title.el);
  const leaves = leafParameters(params);
  const scaleX = leaves.find((p) => p.namePath === "Transform/Scale/X");
  assert.ok(scaleX, "found Transform/Scale/X");
  assert.equal(scaleX.animated, true);
  assert.equal(scaleX.keyframeCount, 2);
  const posX = leaves.find((p) => p.namePath === "Transform/Position/X");
  assert.equal(posX.animated, false);
  assert.equal(posX.value, "-166.08");
});

test("resolves parameters by name path and by id", () => {
  const title = findObjectById(loadDocument(FIXTURE), "10011");
  const byPath = findParameterElement(title.el, { path: "Transform/Position/Y" });
  assert.equal(byPath.getAttribute("value"), "-83.97");
  const byId = findParameterElement(title.el, { id: "200" });
  assert.equal(byId.getAttribute("name"), "Text");
});

test("search finds objects and parameter values", () => {
  const doc = loadDocument(FIXTURE);
  const hits = search(doc, "hello");
  assert.ok(hits.some((h) => h.kind === "parameter" && h.value === "Hello Motion"));
  const typeHits = search(doc, "image");
  assert.ok(typeHits.some((h) => h.kind === "object" && h.objectName === "Background"));
});

test("inspect summarizes the document", () => {
  const doc = loadDocument(FIXTURE);
  const info = inspectDocument(doc, FIXTURE);
  assert.equal(info.dimensions, "1920x1080");
  assert.equal(info.counts.objects, 3);
  assert.equal(info.counts.objectsByType.Text, 1);
  assert.ok(info.textCandidates.includes("Hello Motion"));
});

test("set_parameter writes a constant value and round-trips", () => {
  const file = tempCopy();
  const doc = loadDocument(file);
  const title = findObjectById(doc, "10011");
  const res = setParameterValue(title.el, { path: "Transform/Position/X" }, "42.5");
  assert.equal(res.previousValue, "-166.08");
  assert.equal(res.newValue, "42.5");
  saveDocument(file, doc, { backup: false });

  const reloaded = findObjectById(loadDocument(file), "10011");
  const posX = findParameterElement(reloaded.el, { path: "Transform/Position/X" });
  assert.equal(posX.getAttribute("value"), "42.5");
});

test("set_parameter refuses animated parameters unless forced", () => {
  const doc = loadDocument(FIXTURE);
  const title = findObjectById(doc, "10011");
  assert.throws(
    () => setParameterValue(title.el, { path: "Transform/Scale/X" }, "50"),
    /animated/,
  );
  // With force it replaces the curve with a constant.
  const res = setParameterValue(title.el, { path: "Transform/Scale/X" }, "50", { force: true });
  assert.equal(res.newValue, "50");
  const el = findParameterElement(title.el, { path: "Transform/Scale/X" });
  assert.equal(el.getAttribute("value"), "50");
  assert.equal(el.getElementsByTagName("curve").length, 0);
});

test("set_parameter refuses folders", () => {
  const doc = loadDocument(FIXTURE);
  const title = findObjectById(doc, "10011");
  assert.throws(
    () => setParameterValue(title.el, { path: "Transform/Position" }, "1"),
    /folder/,
  );
});

test("rename_object updates the name and creates a backup", () => {
  const file = tempCopy();
  const doc = loadDocument(file);
  const res = renameObject(doc, "10011", "Main Title");
  assert.equal(res.previousName, "Title");
  const { backupPath } = saveDocument(file, doc, { backup: true });
  assert.ok(readFileSync(backupPath, "utf8").includes('name="Title"'));
  assert.ok(readFileSync(file, "utf8").includes('name="Main Title"'));
});

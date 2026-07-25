/**
 * Structural model of a Motion scene: document metadata, the factory table
 * (which types every object), and the layer/scenenode scene graph.
 */
import {
  attr,
  childElements,
  childText,
  descendantsByTag,
  firstChild,
} from "./xml.js";
import type { Document, Element } from "./xml.js";

/** Tags that represent nodes in the scene graph (as opposed to parameters). */
const GRAPH_TAGS = new Set(["layer", "scenenode"]);

export interface DocumentMeta {
  ozmlVersion?: string;
  displayVersion?: string;
}

export interface SceneSettings {
  width?: number;
  height?: number;
  duration?: number;
  frameRate?: number;
  /** Raw, unparsed settings fields for anything we don't specifically model. */
  raw: Record<string, string>;
}

export interface FactoryInfo {
  id: string;
  uuid?: string;
  description?: string; // the human-readable object type, e.g. "Image", "Text"
  manufacturer?: string;
  version?: string;
}

export interface SceneObject {
  /** "layer" (a group) or "scenenode" (a leaf/object). */
  kind: "layer" | "scenenode";
  id?: string;
  name?: string;
  factoryID?: string;
  /** Resolved type from the factory table (falls back to kind). */
  type: string;
  /** Slash path of names from the root, e.g. "Project/Group/Title". */
  path: string;
  children: SceneObject[];
  /** The backing DOM element (not serialized in JSON output). */
  el: Element;
}

export function getDocumentMeta(doc: Document): DocumentMeta {
  const root = doc.documentElement!;
  return {
    ozmlVersion: attr(root, "version"),
    displayVersion: childText(root, "displayversion"),
  };
}

/** Build a map of factory id -> factory info, used to type scene objects. */
export function buildFactoryMap(doc: Document): Map<string, FactoryInfo> {
  const map = new Map<string, FactoryInfo>();
  for (const el of descendantsByTag(doc.documentElement!, "factory")) {
    const id = attr(el, "id");
    if (!id) continue;
    map.set(id, {
      id,
      uuid: attr(el, "uuid"),
      description: childText(el, "description"),
      manufacturer: childText(el, "manufacturer"),
      version: childText(el, "version"),
    });
  }
  return map;
}

export function getSceneSettings(doc: Document): SceneSettings {
  const settingsEl =
    descendantsByTag(doc.documentElement!, "sceneSettings")[0] ??
    descendantsByTag(doc.documentElement!, "scenesettings")[0];
  const raw: Record<string, string> = {};
  if (settingsEl) {
    for (const child of childElements(settingsEl)) {
      const text = child.textContent?.trim();
      if (text != null && text !== "") raw[child.tagName] = text;
    }
  }
  const num = (k: string) => {
    const v = raw[k];
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    raw,
    width: num("width"),
    height: num("height"),
    duration: num("duration"),
    frameRate: num("frameRate"),
  };
}

/** Locate the graph root elements (layer/scenenode) under <scene>. */
function graphRoots(doc: Document): Element[] {
  const scene = firstChild(doc.documentElement!, "scene");
  const container = scene ?? doc.documentElement!;
  return childElements(container).filter((el) => GRAPH_TAGS.has(el.tagName));
}

/** Walk the scene graph into a tree of SceneObjects. */
export function buildSceneGraph(doc: Document): SceneObject[] {
  const factories = buildFactoryMap(doc);
  const build = (el: Element, parentPath: string): SceneObject => {
    const kind = el.tagName === "layer" ? "layer" : "scenenode";
    const name = attr(el, "name");
    const factoryID = attr(el, "factoryID");
    const factoryType = factoryID ? factories.get(factoryID)?.description : undefined;
    const type = factoryType ?? (kind === "layer" ? "Group" : "Object");
    const path = parentPath ? `${parentPath}/${name ?? "?"}` : (name ?? "?");
    const childEls = childElements(el).filter((c) => GRAPH_TAGS.has(c.tagName));
    return {
      kind,
      id: attr(el, "id"),
      name,
      factoryID,
      type,
      path,
      children: childEls.map((c) => build(c, path)),
      el,
    };
  };
  return graphRoots(doc).map((el) => build(el, ""));
}

/** Flatten the scene graph to a list (depth-first, document order). */
export function flattenObjects(roots: SceneObject[]): SceneObject[] {
  const out: SceneObject[] = [];
  const walk = (o: SceneObject) => {
    out.push(o);
    o.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

/** Find a single object by its `id` attribute. */
export function findObjectById(doc: Document, id: string): SceneObject | undefined {
  return flattenObjects(buildSceneGraph(doc)).find((o) => o.id === id);
}

/** JSON-safe projection of a SceneObject (drops the DOM element, recurses). */
export function objectToJson(o: SceneObject): Record<string, unknown> {
  return {
    id: o.id,
    name: o.name,
    kind: o.kind,
    type: o.type,
    factoryID: o.factoryID,
    path: o.path,
    children: o.children.map(objectToJson),
  };
}

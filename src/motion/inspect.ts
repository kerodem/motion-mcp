/**
 * High-level, human/agent-friendly inspection of a Motion document.
 */
import { basename } from "node:path";
import { descendantsByTag, attr } from "./xml.js";
import type { Document } from "./xml.js";
import {
  buildFactoryMap,
  buildSceneGraph,
  flattenObjects,
  getDocumentMeta,
  getSceneSettings,
  objectToJson,
} from "./model.js";

const NUMERIC_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/**
 * Heuristic: surface parameter `value` attributes that are not plain numbers.
 * Motion stores many strings (including some text-layer content) this way.
 * Labeled as candidates because the exact text representation varies by object.
 */
function stringValueCandidates(doc: Document, limit = 50): string[] {
  const seen = new Set<string>();
  for (const p of descendantsByTag(doc.documentElement!, "parameter")) {
    const v = attr(p, "value");
    if (!v) continue;
    const trimmed = v.trim();
    if (trimmed.length === 0 || NUMERIC_RE.test(trimmed)) continue;
    seen.add(trimmed);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function inspectDocument(doc: Document, filePath: string) {
  const meta = getDocumentMeta(doc);
  const settings = getSceneSettings(doc);
  const factories = buildFactoryMap(doc);
  const tree = buildSceneGraph(doc);
  const objects = flattenObjects(tree);

  const typeCounts: Record<string, number> = {};
  for (const o of objects) typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1;

  return {
    file: basename(filePath),
    path: filePath,
    meta,
    sceneSettings: settings,
    dimensions:
      settings.width && settings.height
        ? `${settings.width}x${settings.height}`
        : undefined,
    counts: {
      objects: objects.length,
      factories: factories.size,
      objectsByType: typeCounts,
    },
    factories: [...factories.values()].map((f) => ({
      id: f.id,
      type: f.description,
      manufacturer: f.manufacturer,
    })),
    tree: tree.map(objectToJson),
    textCandidates: stringValueCandidates(doc),
  };
}

/**
 * Object-level search and edits over the scene graph.
 */
import { attr } from "./xml.js";
import type { Document } from "./xml.js";
import { buildSceneGraph, flattenObjects, findObjectById } from "./model.js";
import { leafParameters, listParameters } from "./params.js";

export interface SearchHit {
  kind: "object" | "parameter";
  objectId?: string;
  objectName?: string;
  objectType?: string;
  parameterPath?: string;
  value?: string;
}

/** Case-insensitive substring search across object names/types and parameter names/values. */
export function search(doc: Document, query: string): SearchHit[] {
  const q = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const o of flattenObjects(buildSceneGraph(doc))) {
    if (
      (o.name && o.name.toLowerCase().includes(q)) ||
      o.type.toLowerCase().includes(q)
    ) {
      hits.push({ kind: "object", objectId: o.id, objectName: o.name, objectType: o.type });
    }
    for (const p of leafParameters(listParameters(o.el))) {
      const nameHit = p.namePath.toLowerCase().includes(q);
      const valueHit = p.value != null && p.value.toLowerCase().includes(q);
      if (nameHit || valueHit) {
        hits.push({
          kind: "parameter",
          objectId: o.id,
          objectName: o.name,
          objectType: o.type,
          parameterPath: p.namePath,
          value: p.value,
        });
      }
    }
  }
  return hits;
}

export interface RenameResult {
  id: string;
  previousName?: string;
  newName: string;
}

/** Rename an object by id (sets its `name` attribute). */
export function renameObject(doc: Document, id: string, newName: string): RenameResult {
  const obj = findObjectById(doc, id);
  if (!obj) throw new Error(`No object with id="${id}".`);
  const previousName = attr(obj.el, "name");
  obj.el.setAttribute("name", newName);
  return { id, previousName, newName };
}

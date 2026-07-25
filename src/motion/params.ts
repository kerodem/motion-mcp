/**
 * Reading and editing Motion parameters (channels).
 *
 * A parameter is `<parameter name id flags default value>`. Parameters nest
 * into folders (e.g. Transform > Position > X). A leaf holds a constant in its
 * `value` attribute, OR is animated via a `<curve>` of `<keypoint>`s (in which
 * case there is no single constant value).
 *
 * Motion matches parameters by `id`, but ids are only locally unique and are
 * reused across folders, so we prefer addressing by *name path* (e.g.
 * "Transform/Position/X") and treat id as a secondary locator.
 */
import { attr, childElements, descendantsByTag } from "./xml.js";
import type { Element } from "./xml.js";

export interface ParameterInfo {
  id?: string;
  name?: string;
  flags?: string;
  default?: string;
  /** Constant value, if the parameter is not animated. */
  value?: string;
  /** True when the parameter is driven by a keyframe curve. */
  animated: boolean;
  keyframeCount?: number;
  /** Name path from the object root, e.g. "Transform/Position/X". */
  namePath: string;
  /** Nested parameters, for folders. Empty for leaves. */
  children: ParameterInfo[];
}

/** Direct `<parameter>` children of an element. */
function parameterChildren(el: Element): Element[] {
  return childElements(el).filter((c) => c.tagName === "parameter");
}

function isFolder(el: Element): boolean {
  return parameterChildren(el).length > 0;
}

function curveOf(el: Element): Element | undefined {
  return childElements(el).find((c) => c.tagName === "curve");
}

function describe(el: Element, parentPath: string): ParameterInfo {
  const name = attr(el, "name");
  const namePath = parentPath ? `${parentPath}/${name ?? "?"}` : (name ?? "?");
  const curve = curveOf(el);
  const kids = parameterChildren(el);
  return {
    id: attr(el, "id"),
    name,
    flags: attr(el, "flags"),
    default: attr(el, "default"),
    value: attr(el, "value"),
    animated: !!curve,
    keyframeCount: curve ? descendantsByTag(curve, "keypoint").length : undefined,
    namePath,
    children: kids.map((k) => describe(k, namePath)),
  };
}

/** Full parameter tree for an object element. */
export function listParameters(objectEl: Element): ParameterInfo[] {
  return parameterChildren(objectEl).map((p) => describe(p, ""));
}

/** Flatten a parameter tree to leaves only (things with a value or a curve). */
export function leafParameters(params: ParameterInfo[]): ParameterInfo[] {
  const out: ParameterInfo[] = [];
  const walk = (p: ParameterInfo) => {
    if (p.children.length === 0) out.push(p);
    else p.children.forEach(walk);
  };
  params.forEach(walk);
  return out;
}

export interface ParameterLocator {
  /** Name path, e.g. "Transform/Position/X" (recommended). */
  path?: string;
  /** Parameter id (first match within the object wins). */
  id?: string;
}

/** Resolve a locator to the backing `<parameter>` element within an object. */
export function findParameterElement(
  objectEl: Element,
  locator: ParameterLocator,
): Element | undefined {
  if (locator.path) {
    const segments = locator.path.split("/").map((s) => s.trim()).filter(Boolean);
    let current: Element = objectEl;
    for (const seg of segments) {
      const next = parameterChildren(current).find((p) => attr(p, "name") === seg);
      if (!next) return undefined;
      current = next;
    }
    return current === objectEl ? undefined : current;
  }
  if (locator.id) {
    // Depth-first over the parameter subtree only.
    const stack = [...parameterChildren(objectEl)];
    while (stack.length) {
      const el = stack.shift()!;
      if (attr(el, "id") === locator.id) return el;
      stack.unshift(...parameterChildren(el));
    }
  }
  return undefined;
}

export interface SetResult {
  namePath: string;
  previousValue?: string;
  newValue: string;
}

/**
 * Set a parameter's constant value. Refuses animated parameters unless `force`
 * is set (animated channels store their value in keyframes, not `value`).
 */
export function setParameterValue(
  objectEl: Element,
  locator: ParameterLocator,
  value: string,
  opts: { force?: boolean } = {},
): SetResult {
  const el = findParameterElement(objectEl, locator);
  if (!el) {
    throw new Error(
      `Parameter not found (${locator.path ? `path="${locator.path}"` : `id="${locator.id}"`}).`,
    );
  }
  if (isFolder(el)) {
    throw new Error(
      `"${attr(el, "name")}" is a parameter folder, not a settable channel.`,
    );
  }
  if (curveOf(el) && !opts.force) {
    throw new Error(
      `"${attr(el, "name")}" is animated (keyframed). Pass force=true to overwrite it with a constant value.`,
    );
  }
  const previousValue = attr(el, "value");
  // Overwriting an animated channel with a constant means dropping its curve.
  const curve = curveOf(el);
  if (curve) el.removeChild(curve);
  el.setAttribute("value", value);
  return {
    namePath: locator.path ?? attr(el, "name") ?? locator.id ?? "?",
    previousValue,
    newValue: value,
  };
}

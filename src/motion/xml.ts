/**
 * Low-level XML engine for Apple Motion documents.
 *
 * Motion project/template files (.motn, .moti, .moef, .motr, .molo, ...) are
 * plain-text XML with a `<ozml version="...">` root and a `<!DOCTYPE ozxmlscene>`.
 * See: https://developer.apple.com/library/archive/documentation/AppleApplications/Conceptual/motion_XML_guide/
 *
 * We use @xmldom/xmldom so we can read AND round-trip writes back to disk.
 * Motion re-parses documents by element `id`, so structural fidelity matters
 * far more than incidental whitespace.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document, Element, Node } from "@xmldom/xmldom";

/** File extensions Motion uses for scene/template documents. */
export const MOTION_EXTENSIONS = [
  ".motn", // Motion project / FCP generator
  ".moti", // FCP title
  ".moef", // FCP effect
  ".motr", // FCP transition
  ".moin", // FCP text-only / other
  ".molo", // Motion library object
] as const;

const ELEMENT_NODE = 1;

export class MotionXmlError extends Error {}

/** Read a Motion document from disk into a DOM. Transparently gunzips if needed. */
export function loadDocument(filePath: string): Document {
  if (!existsSync(filePath)) {
    throw new MotionXmlError(`File not found: ${filePath}`);
  }
  let buf = readFileSync(filePath);
  // Some exported documents may be gzip-compressed (magic bytes 1f 8b).
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    buf = Buffer.from(gunzipSync(buf));
  }
  const text = buf.toString("utf8");
  return parseDocument(text, filePath);
}

/** Parse a Motion XML string into a DOM, validating that it is an ozml scene. */
export function parseDocument(text: string, source = "<string>"): Document {
  const errors: string[] = [];
  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level === "error" || level === "fatalError") errors.push(msg);
    },
  });
  const doc = parser.parseFromString(text, "text/xml");
  if (errors.length) {
    throw new MotionXmlError(`Failed to parse ${source}: ${errors[0]}`);
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== "ozml") {
    throw new MotionXmlError(
      `${source} is not an Apple Motion document (expected <ozml> root, got <${root?.tagName ?? "?"}>).`,
    );
  }
  return doc;
}

/** Serialize a DOM back to an XML string. */
export function serializeDocument(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Write a document back to disk. By default a `.bak` sibling is created the
 * first time a file is written, so edits are always recoverable.
 */
export function saveDocument(
  filePath: string,
  doc: Document,
  opts: { backup?: boolean } = {},
): { backupPath?: string } {
  const backup = opts.backup ?? true;
  let backupPath: string | undefined;
  if (backup) {
    backupPath = `${filePath}.bak`;
    if (!existsSync(backupPath)) copyFileSync(filePath, backupPath);
  }
  writeFileSync(filePath, serializeDocument(doc), "utf8");
  return { backupPath };
}

// --- DOM traversal helpers (typed, predictable) ---------------------------

/** Direct child elements of a node. */
export function childElements(node: Node): Element[] {
  const out: Element[] = [];
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const c = children.item(i);
    if (c && c.nodeType === ELEMENT_NODE) out.push(c as Element);
  }
  return out;
}

/** First direct child element with the given tag name, or undefined. */
export function firstChild(node: Node, tag: string): Element | undefined {
  return childElements(node).find((el) => el.tagName === tag);
}

/** Text content of the first direct child element with the given tag name. */
export function childText(node: Node, tag: string): string | undefined {
  const el = firstChild(node, tag);
  const t = el?.textContent;
  return t == null ? undefined : t.trim();
}

/** All descendant elements with the given tag name (document order). */
export function descendantsByTag(node: Node, tag: string): Element[] {
  const out: Element[] = [];
  const walk = (n: Node) => {
    for (const el of childElements(n)) {
      if (el.tagName === tag) out.push(el);
      walk(el);
    }
  };
  walk(node);
  return out;
}

/** Get an attribute value or undefined (xmldom returns "" for missing). */
export function attr(el: Element, name: string): string | undefined {
  return el.hasAttribute(name) ? el.getAttribute(name) ?? undefined : undefined;
}

export type { Document, Element, Node };

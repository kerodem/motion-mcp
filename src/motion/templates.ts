/**
 * Discovery of Final Cut Pro / Motion templates installed on this machine.
 *
 * Motion saves FCP templates under ~/Movies/Motion Templates, organized by
 * kind (Titles, Effects, Transitions, Generators, Compositions) and then by
 * user-defined category folders, each holding a document file.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { MOTION_EXTENSIONS } from "./xml.js";

export const TEMPLATE_ROOT = join(homedir(), "Movies", "Motion Templates");

const KIND_FOLDERS = [
  "Titles",
  "Effects",
  "Transitions",
  "Generators",
  "Compositions",
] as const;

export interface TemplateEntry {
  kind: string;
  category: string;
  name: string;
  path: string;
}

function isMotionDoc(file: string): boolean {
  return MOTION_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));
}

/** Find the first Motion document file directly inside a template folder. */
function docInFolder(dir: string): string | undefined {
  try {
    for (const entry of readdirSync(dir)) {
      if (isMotionDoc(entry)) return join(dir, entry);
    }
  } catch {
    /* unreadable dir */
  }
  return undefined;
}

/**
 * List installed templates. Optionally filter by kind (e.g. "Titles").
 * Returns an empty list if no Motion Templates folder exists.
 */
export function listTemplates(kindFilter?: string): TemplateEntry[] {
  if (!existsSync(TEMPLATE_ROOT)) return [];
  const out: TemplateEntry[] = [];
  const kinds = readdirSync(TEMPLATE_ROOT).filter((k) => {
    if (!statSafe(join(TEMPLATE_ROOT, k))) return false;
    if (kindFilter) return k.toLowerCase() === kindFilter.toLowerCase();
    return true;
  });
  for (const kind of kinds) {
    const kindDir = join(TEMPLATE_ROOT, kind);
    for (const category of readdirSyncSafe(kindDir)) {
      const catDir = join(kindDir, category);
      if (!statSafe(catDir)) continue;
      // A template folder may sit directly under the category, and each theme
      // folder holds its own document file.
      for (const name of readdirSyncSafe(catDir)) {
        const tplDir = join(catDir, name);
        if (!statSafe(tplDir)) continue;
        const doc = docInFolder(tplDir);
        if (doc) out.push({ kind, category, name, path: doc });
      }
      // Some templates live one level up (document directly in the category).
      const directDoc = docInFolder(catDir);
      if (directDoc) out.push({ kind, category, name: category, path: directDoc });
    }
  }
  return out;
}

function statSafe(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readdirSyncSafe(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

export const KNOWN_KINDS = KIND_FOLDERS;

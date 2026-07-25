import { homedir } from "node:os";
import { resolve } from "node:path";

/** Expand a leading ~ and resolve to an absolute path. */
export function resolvePath(p: string): string {
  let out = p.trim();
  if (out === "~") out = homedir();
  else if (out.startsWith("~/")) out = homedir() + out.slice(1);
  return resolve(out);
}

/** Build a successful MCP text result carrying JSON. */
export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

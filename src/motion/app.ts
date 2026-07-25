/**
 * Control of the Motion application on macOS.
 *
 * Motion has essentially no AppleScript dictionary of its own, so automation is
 * limited to Launch Services (open a document) and Standard Suite verbs
 * (is running / quit). Rendering & export are NOT scriptable — that is a
 * documented Motion limitation; use Motion's Share menu or Compressor instead.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";

const MOTION_BUNDLE_ID = "com.apple.motionapp";
const DEFAULT_APP_PATH = "/Applications/Motion.app";

export class NotMacOSError extends Error {
  constructor() {
    super("Motion app control is only available on macOS.");
  }
}

function assertMac() {
  if (platform() !== "darwin") throw new NotMacOSError();
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

/** Absolute path to Motion.app, or undefined if not installed. */
export function findMotionApp(): string | undefined {
  if (existsSync(DEFAULT_APP_PATH)) return DEFAULT_APP_PATH;
  try {
    const hit = run("mdfind", [
      `kMDItemCFBundleIdentifier == '${MOTION_BUNDLE_ID}'`,
    ]).split("\n")[0];
    return hit && existsSync(hit) ? hit : undefined;
  } catch {
    return undefined;
  }
}

export interface MotionStatus {
  platform: string;
  installed: boolean;
  appPath?: string;
  version?: string;
  running: boolean;
}

export function motionStatus(): MotionStatus {
  const isMac = platform() === "darwin";
  if (!isMac) {
    return { platform: platform(), installed: false, running: false };
  }
  const appPath = findMotionApp();
  let version: string | undefined;
  if (appPath) {
    try {
      version = run("defaults", ["read", `${appPath}/Contents/Info`, "CFBundleShortVersionString"]);
    } catch {
      /* version unavailable */
    }
  }
  let running = false;
  try {
    running = run("pgrep", ["-x", "Motion"]).length > 0;
  } catch {
    running = false; // pgrep exits non-zero when no match
  }
  return { platform: "darwin", installed: !!appPath, appPath, version, running };
}

/** Open a document in Motion (launches Motion if needed). */
export function openProject(filePath: string): { opened: string } {
  assertMac();
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  if (!findMotionApp()) throw new Error("Motion is not installed on this machine.");
  run("open", ["-a", "Motion", filePath]);
  return { opened: filePath };
}

/** Reveal a file in Finder. */
export function revealInFinder(filePath: string): { revealed: string } {
  assertMac();
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  run("open", ["-R", filePath]);
  return { revealed: filePath };
}

/** Ask Motion to quit (Standard Suite verb). */
export function quitMotion(): { quit: boolean } {
  assertMac();
  try {
    run("osascript", ["-e", 'tell application "Motion" to quit']);
  } catch {
    /* not running */
  }
  return { quit: true };
}

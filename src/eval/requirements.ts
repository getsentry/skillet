import { execSync } from "node:child_process";
import type { Requirement } from "./parser.js";

/**
 * Check if all requirements for an eval case are met.
 * Returns null if all met, or a skip reason string if not.
 */
export function checkRequirements(requires: Requirement[]): string | null {
  for (const req of requires) {
    if ("env" in req) {
      if (!process.env[req.env]) {
        return `missing env: ${req.env}`;
      }
    } else if ("command" in req) {
      try {
        execSync(`command -v ${req.command}`, { stdio: "pipe" });
      } catch {
        return `missing command: ${req.command}`;
      }
    }
  }
  return null;
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isRecord } from "./guards.js";
import { CURRENT_SKILLET } from "./invocation.js";

const DEFAULT_CACHE_DIR = join(homedir(), ".skillet");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRY_URL = "https://registry.npmjs.org/@sentry/skillet/latest";
const FETCH_TIMEOUT_MS = 3000;

interface CacheData {
  lastCheck: number;
  latestVersion: string;
}

/** Compare stable x.y.z versions, returning positive when latest is newer. */
export const compareSemver = (current: string, latest: string): number => {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (latestParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const readCache = async (cacheFile: string): Promise<CacheData | null> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(cacheFile, "utf8"));
    if (isRecord(parsed) && typeof parsed["lastCheck"] === "number") {
      const latestVersion = parsed["latestVersion"];
      if (typeof latestVersion === "string") {
        return { lastCheck: parsed["lastCheck"], latestVersion };
      }
    }
    return null;
  } catch {
    return null;
  }
};

const writeCache = async (cacheDir: string, data: CacheData): Promise<boolean> => {
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, "update-check.json"), JSON.stringify(data), "utf8");
    return true;
  } catch {
    return false;
  }
};

const fetchLatestVersion = async (): Promise<string | null> => {
  try {
    const response = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (isRecord(data)) {
      return typeof data["version"] === "string" ? data["version"] : null;
    }
    return null;
  } catch {
    return null;
  }
};

/** Format the stderr notice shown after an outdated command finishes. */
export const formatUpdateMessage = (currentVersion: string, latestVersion: string): string => {
  return `Update available: ${currentVersion} → ${latestVersion}\nRun \`${CURRENT_SKILLET}\` to use the latest version`;
};

/** Return an update notice when npm has a newer release, otherwise null. */
export const checkForUpdate = async (
  currentVersion: string,
  options?: { cacheDir?: string; now?: () => number },
): Promise<string | null> => {
  try {
    const cacheDir = options?.cacheDir ?? DEFAULT_CACHE_DIR;
    const cache = await readCache(join(cacheDir, "update-check.json"));
    const now = options?.now?.() ?? Date.now();
    let latestVersion: string | null;

    if (cache != null && now - cache.lastCheck < ONE_DAY_MS) {
      latestVersion = cache.latestVersion;
    } else {
      latestVersion = await fetchLatestVersion();
      if (latestVersion != null) {
        await writeCache(cacheDir, { lastCheck: now, latestVersion });
      }
    }

    if (latestVersion == null || compareSemver(currentVersion, latestVersion) <= 0) return null;
    return formatUpdateMessage(currentVersion, latestVersion);
  } catch {
    return null;
  }
};

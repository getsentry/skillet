import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, compareSemver, formatUpdateMessage } from "./update-notifier.js";

describe("compareSemver", () => {
  it("orders stable semantic versions", () => {
    expect(compareSemver("1.4.1", "1.4.2")).toBeGreaterThan(0);
    expect(compareSemver("1.9.9", "2.0.0")).toBeGreaterThan(0);
    expect(compareSemver("2.0.0", "1.9.9")).toBeLessThan(0);
    expect(compareSemver("1.4.1", "1.4.1")).toBe(0);
  });
});

describe("formatUpdateMessage", () => {
  it("names both versions and the current package command", () => {
    const message = formatUpdateMessage("1.4.1", "1.5.0");
    expect(message).toContain("1.4.1 → 1.5.0");
    expect(message).toContain("npx -y @sentry/skillet@latest");
  });
});

describe("checkForUpdate", () => {
  const now = 1_800_000_000_000;
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "skillet-update-"));
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("returns an update notice and caches the registry result", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ version: "1.5.0" }));

    await expect(checkForUpdate("1.4.1", { cacheDir, now: () => now })).resolves.toContain("1.5.0");
    const cache = JSON.parse(await readFile(join(cacheDir, "update-check.json"), "utf8"));
    expect(cache.latestVersion).toBe("1.5.0");
  });

  it("uses a fresh cache without fetching", async () => {
    await writeFile(
      join(cacheDir, "update-check.json"),
      JSON.stringify({ lastCheck: now, latestVersion: "1.5.0" }),
    );

    await expect(checkForUpdate("1.4.1", { cacheDir, now: () => now })).resolves.toContain("1.5.0");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes an expired cache", async () => {
    await writeFile(
      join(cacheDir, "update-check.json"),
      JSON.stringify({ lastCheck: now - 60 * 60 * 1000 - 1, latestVersion: "1.5.0" }),
    );
    vi.mocked(fetch).mockResolvedValue(Response.json({ version: "1.6.0" }));

    await expect(checkForUpdate("1.4.1", { cacheDir, now: () => now })).resolves.toContain("1.6.0");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns null when current or registry lookup fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ version: "1.4.1" }));
    await expect(checkForUpdate("1.4.1", { cacheDir, now: () => now })).resolves.toBeNull();

    await rm(join(cacheDir, "update-check.json"), { force: true });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await expect(checkForUpdate("1.4.1", { cacheDir, now: () => now })).resolves.toBeNull();
  });
});

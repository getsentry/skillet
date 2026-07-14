import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const cliConfig = {
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/cli.js",
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Keep node_modules external — resolved from skillet's own
  // node_modules at runtime under npm/npx.
  packages: "external",
};

/** @type {esbuild.BuildOptions} */
const workerConfig = {
  // Loaded by generated eval files inside vitest workers, never by
  // cli.js — a separate bundle so its absolute path is stable next
  // to cli.js (compile.ts resolves ./worker.js from import.meta.url).
  entryPoints: ["src/engine/worker.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/worker.js",
  sourcemap: true,
  packages: "external",
};

if (watch) {
  const contexts = await Promise.all([esbuild.context(cliConfig), esbuild.context(workerConfig)]);
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("watching...");
} else {
  await Promise.all([esbuild.build(cliConfig), esbuild.build(workerConfig)]);
  console.log("built dist/cli.js and dist/worker.js");
}

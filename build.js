import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const config = {
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
  external: [
    // AI SDK loads providers dynamically — keep them external
    // so npm can resolve them at runtime from skillkit's own node_modules
  ],
  // Keep node_modules external — they'll be resolved from skillkit's
  // own node_modules when installed via npm/npx
  packages: "external",
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("watching...");
} else {
  await esbuild.build(config);
  console.log("built dist/cli.js");
}

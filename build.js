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

if (watch) {
  const ctx = await esbuild.context(cliConfig);
  await ctx.watch();
  console.log("watching...");
} else {
  await esbuild.build(cliConfig);
  console.log("built dist/cli.js");
}

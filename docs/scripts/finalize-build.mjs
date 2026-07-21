import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "src", "content", "docs");
const distRoot = join(root, "dist");
const agentIndexSource = join(root, "src", "agent", "index.md");

copyFileSync(agentIndexSource, join(distRoot, "index.md"));

const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

const missingRoutes = walk(sourceRoot)
  .filter((path) => [".md", ".mdx"].includes(extname(path)))
  .map((path) => relative(sourceRoot, path))
  .filter((path) => path !== "index.mdx")
  .map((path) => path.replace(/\.mdx?$/, ".md"))
  .filter((path) => !existsSync(join(distRoot, path)));

if (missingRoutes.length > 0) {
  throw new Error(`Missing agent Markdown routes: ${missingRoutes.join(", ")}`);
}

const missingLinks = [];
for (const file of walk(distRoot).filter((path) => path.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|#|javascript:)/.test(href)) continue;
    const target = href.split(/[?#]/)[0];
    if (target === "") continue;

    const path = target.startsWith("/")
      ? join(distRoot, target)
      : resolve(dirname(file), target);
    const candidates = [path, `${path}.html`, join(path, "index.html")];
    if (!candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile())) {
      missingLinks.push(`${relative(distRoot, file)} -> ${href}`);
    }
  }
}

if (missingLinks.length > 0) {
  throw new Error(`Broken local links:\n${missingLinks.join("\n")}`);
}

console.log("Validated agent Markdown routes and local links.");

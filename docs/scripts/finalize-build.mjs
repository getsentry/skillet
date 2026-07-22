import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
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

const sourcePages = walk(sourceRoot)
  .filter((path) => [".md", ".mdx"].includes(extname(path)))
  .map((path) => ({ source: path, route: relative(sourceRoot, path) }))
  .filter(({ route }) => route !== "index.mdx");

for (const { source, route } of sourcePages) {
  const output = join(distRoot, route.replace(/\.mdx?$/, ".md"));
  const content = readFileSync(source, "utf8").replace(
    /(\]\()(\/[^)\s?#]+)\/([?#][^)]*)?(\))/g,
    (_, open, path, suffix = "", close) => `${open}${path}.md${suffix}${close}`,
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, content);
}

const missingRoutes = sourcePages
  .map(({ route }) => route.replace(/\.mdx?$/, ".md"))
  .filter((path) => !existsSync(join(distRoot, path)));

if (missingRoutes.length > 0) {
  throw new Error(`Missing agent Markdown routes: ${missingRoutes.join(", ")}`);
}

const missingLinks = [];
for (const file of walk(distRoot).filter((path) => /\.(?:html|md)$/.test(path))) {
  const content = readFileSync(file, "utf8");
  const links = file.endsWith(".html")
    ? content.matchAll(/href="([^"]+)"/g)
    : content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);

  for (const match of links) {
    const href = match[1];
    if (/^(?:https?:|mailto:|#|javascript:)/.test(href)) continue;
    const target = href.split(/[?#]/)[0];
    if (target === "") continue;

    const path = target.startsWith("/")
      ? join(distRoot, target)
      : resolve(dirname(file), target);
    const candidates = file.endsWith(".md")
      ? [path]
      : [path, `${path}.html`, join(path, "index.html")];
    if (!candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile())) {
      missingLinks.push(`${relative(distRoot, file)} -> ${href}`);
    }
  }
}

if (missingLinks.length > 0) {
  throw new Error(`Broken local links:\n${missingLinks.join("\n")}`);
}

console.log("Validated agent Markdown routes and local links.");

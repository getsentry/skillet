import starlight from "@astrojs/starlight";
import sentryStarlightTheme, {
  monochromeCodeTheme,
} from "@sentry/starlight-theme";
import { sentryAgentMarkdown } from "@sentry/starlight-theme/agent-markdown";
import { defineConfig } from "astro/config";

export default defineConfig({
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: "Skillet",
      description: "Build agent skills from a spec, evaluate them, and improve them over time.",
      favicon: "/favicon.ico",
      logo: {
        src: "./src/assets/skillet-logo.png",
        alt: "Skillet",
      },
      head: [
        {
          tag: "link",
          attrs: { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
        },
        {
          tag: "link",
          attrs: { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
        },
        {
          tag: "link",
          attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        },
        {
          tag: "link",
          attrs: { rel: "manifest", href: "/site.webmanifest" },
        },
      ],
      customCss: ["./src/styles/custom.css"],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
      pagination: true,
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Overview", link: "/" },
            { label: "Quickstart", link: "/quickstart/" },
            { label: "Create Your First Skill", link: "/first-skill/" },
            { label: "Adopt an Existing Skill", link: "/existing-skill/" },
            { label: "Examples", link: "/examples/" },
          ],
        },
        {
          label: "Build a Skill",
          items: [
            { label: "Specifications", link: "/concepts/specifications/" },
            { label: "Write Agent Instructions", link: "/guides/write-agent-instructions/" },
            { label: "Write Honest Evals", link: "/guides/write-honest-evals/" },
            { label: "Understand Eval Results", link: "/concepts/evaluations-and-lift/" },
          ],
        },
        {
          label: "How Skillet Works",
          items: [
            { label: "Artifact Lifecycle", link: "/concepts/artifact-lifecycle/" },
            { label: "Configure Harnesses", link: "/guides/configure-harnesses/" },
            { label: "Sandbox and CI", link: "/guides/sandbox-and-ci/" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "CLI", link: "/reference/cli/" },
            { label: "Eval Case YAML", link: "/reference/eval-case/" },
            { label: ".skillet.yaml", link: "/reference/configuration/" },
          ],
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/getsentry/skillet",
        },
      ],
      plugins: [sentryStarlightTheme(), sentryAgentMarkdown()],
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: monochromeCodeTheme,
    },
  },
});

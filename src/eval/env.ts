/**
 * Eval cases run in per-case workspaces. By default we strip
 * credential-looking environment variables from the env passed to
 * setup scripts, the agent's bash tool, and workspace check commands.
 * Otherwise the agent picks up the host user's real GitHub/AWS/etc.
 * credentials and the eval no longer tests an isolated scenario —
 * `gh api user` returns the host operator's login, `aws s3 ls` hits
 * the operator's real bucket, etc.
 *
 * Stripped:
 * - Anything ending in `_API_KEY`, `_TOKEN`, `_SECRET`, `_PASSWORD`,
 *   `_PRIVATE_KEY`, `_CREDENTIALS`.
 * - An explicit list of well-known credential references whose names
 *   don't match the suffix pattern (KUBECONFIG, AWS_*, GH_HOST, etc.).
 *
 * Not stripped: PATH, HOME, USER, LANG, LC_*, etc. — those are needed
 * for shells and tools to function.
 */

const CREDENTIAL_SUFFIX = /_(API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIALS)$/;

const EXPLICIT_CREDENTIAL_VARS: ReadonlySet<string> = new Set([
  // AWS
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_DEFAULT_PROFILE",
  // GitHub CLI
  "GH_HOST",
  "GH_ENTERPRISE_TOKEN",
  // Kubernetes
  "KUBECONFIG",
  // Google
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_GHA_CREDS_PATH",
  // Docker
  "DOCKER_AUTH_CONFIG",
]);

const isCredentialVar = (key: string): boolean => {
  return EXPLICIT_CREDENTIAL_VARS.has(key) || CREDENTIAL_SUFFIX.test(key);
};

/**
 * Return a copy of `process.env` with credential-looking variables
 * removed. Use this for any subprocess spawned during eval execution
 * (setup, agent bash, workspace checks).
 */
export const sanitizedProcessEnv = (): NodeJS.ProcessEnv => {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (isCredentialVar(key)) continue;
    out[key] = value;
  }
  return out;
};

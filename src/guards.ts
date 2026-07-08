/** The one unknown-to-structure guard used at every YAML/JSON boundary. */
export const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

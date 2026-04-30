/**
 * Wrap a progress callback so each line is prefixed with elapsed
 * time since the wrapper was created. Helps users tell a slow phase
 * from a stuck process during long regen runs.
 *
 * Usage:
 *   const log = withElapsed((msg) => console.log(`  ${msg}`));
 *   await regenerate(dir, { ..., onProgress: log });
 */
export const withElapsed = (sink: (msg: string) => void): ((msg: string) => void) => {
  const start = Date.now();
  return (msg) => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    sink(`[${elapsed}s] ${msg}`);
  };
};

/**
 * Type guard for errors thrown by `execSync`-family functions that
 * carry status / stderr / stdout. Used by every shell-out site
 * (workspace setup, agent tools) to surface a useful message.
 */
export interface ExecError {
  status: number | null;
  stderr: Buffer | null;
  stdout: Buffer | null;
}

export const isExecError = (err: unknown): err is ExecError => {
  return err != null && typeof err === "object" && "status" in err;
};

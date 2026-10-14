export interface ProbeResult {
  status: number | null;
  durationMs: number;
  outcome: "ok" | "slow" | "failed";
}

export interface DatabaseProbe {
  publicApi: ProbeResult;
  management: ProbeResult;
  healthy: boolean;
}

// The sentinel sends URL strings only; production fetch also satisfies this
// narrower boundary, while tests need not implement unused Request inputs.
type ProbeFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function pickPublicApiKey(keys: unknown): string | null;

export function probeDatabase(options: {
  ref: string;
  token: string;
  publicKey: string;
  thresholdMs?: number;
}, send?: ProbeFetch, clock?: () => number): Promise<DatabaseProbe>;

export function runSentinel(env?: Record<string, string | undefined>, send?: ProbeFetch,
  wait?: (ms: number) => unknown): Promise<{
    healthy: boolean;
    managementHealthy: boolean;
    attempts: DatabaseProbe[];
  }>;

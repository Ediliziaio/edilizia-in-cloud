/**
 * outreach-warmup — logica PURA del riscaldamento caselle (niente Deno/Supabase).
 * Vero warm-up: le caselle del pool si scambiano email tra loro per costruire
 * reputazione (come la rete di Instantly), con volume crescente per giorno.
 * Testato in vitest.
 */

export interface WarmupBox {
  id: string;
  email: string;
  display_name?: string | null;
  warmup_day: number;
  status: string; // 'warming' | 'active' | 'paused' | 'disabled'
}

/** Volume di warm-up del giorno: cresce piano e si cappa (default 2 → +1/giorno → max 8). */
export function warmupTargetForDay(day: number, base = 2, step = 1, max = 8): number {
  return Math.max(0, Math.min(max, base + Math.max(0, day) * step));
}

export interface WarmupPair { fromId: string; fromEmail: string; toId: string; toEmail: string; }

/**
 * Costruisce le coppie mittente→destinatario per il giro di warm-up. Ogni casella
 * (attiva o in warm-up) manda alle ALTRE del pool, round-robin, mai a se stessa.
 * `countEach` può variare per casella (es. in base al suo warmup_day).
 */
export function buildWarmupPairs(
  boxes: WarmupBox[],
  countEach: number | ((b: WarmupBox) => number),
): WarmupPair[] {
  const active = boxes.filter((b) => b.status === "active" || b.status === "warming");
  const pairs: WarmupPair[] = [];
  if (active.length < 2) return pairs;

  for (let i = 0; i < active.length; i++) {
    const from = active[i];
    const want = typeof countEach === "function" ? countEach(from) : countEach;
    const cap = Math.min(Math.max(0, want), active.length - 1);
    for (let k = 1; k <= cap; k++) {
      const to = active[(i + k) % active.length];
      pairs.push({ fromId: from.id, fromEmail: from.email, toId: to.id, toEmail: to.email });
    }
  }
  return pairs;
}

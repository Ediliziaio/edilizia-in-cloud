/**
 * email-poll-inbox: tetto per giro.
 *
 * Il poller della posta gira ogni pochi minuti e il worker edge ha un budget di
 * CPU ridotto. Questi test fissano i due presìdi che tengono ogni giro piccolo e
 * certo di finire — così `last_synced_at` avanza e il lavoro resta leggero:
 *   1. i tetti per giro (caselle, messaggi, allegati) restano contenuti;
 *   2. `fermaIlGiro` chiude il giro quando il tempo è finito, ma MAI prima di
 *      aver servito almeno una casella (nessuna casella resta indietro per
 *      sempre). La lista è ordinata dalle più indietro, quindi su più giri le
 *      tocca tutte a rotazione.
 */
import { describe, expect, it } from "vitest";

const MOD = "../../../supabase/functions/email-poll-inbox/limiti";

type Limiti = typeof import("../../../supabase/functions/email-poll-inbox/limiti");

async function carica(): Promise<Limiti> {
  return (await import(/* @vite-ignore */ MOD)) as Limiti;
}

describe("email-poll-inbox — tetti per giro", () => {
  it("tiene i tetti contenuti (niente ritorno ai valori che sforavano la CPU)", async () => {
    const { LIMITI_POLL } = await carica();
    expect(LIMITI_POLL.casellePerGiro).toBeGreaterThan(0);
    expect(LIMITI_POLL.casellePerGiro).toBeLessThanOrEqual(25);
    expect(LIMITI_POLL.gmailIncrementale).toBeLessThanOrEqual(60);
    expect(LIMITI_POLL.gmailPrimoGiro).toBeLessThanOrEqual(400);
    expect(LIMITI_POLL.gmailInviateIncrementale).toBeLessThanOrEqual(30);
    expect(LIMITI_POLL.gmailInviatePrimoGiro).toBeLessThanOrEqual(200);
    expect(LIMITI_POLL.imapPerGiro).toBeLessThanOrEqual(25);
    expect(LIMITI_POLL.allegatiPerGiro).toBeLessThanOrEqual(15);
    expect(LIMITI_POLL.reconcilePagine).toBeLessThanOrEqual(3);
    expect(LIMITI_POLL.reconcileCandidati).toBeLessThanOrEqual(1000);
  });

  it("lascia margine sotto la chiusura del worker (~4-5s)", async () => {
    const { LIMITI_POLL } = await carica();
    expect(LIMITI_POLL.budgetGiroMs).toBeGreaterThan(0);
    expect(LIMITI_POLL.budgetGiroMs).toBeLessThanOrEqual(4000);
  });

  it("non ferma mai prima della prima casella, anche a tempo scaduto", async () => {
    const { fermaIlGiro, LIMITI_POLL } = await carica();
    const t0 = 1_000_000;
    const moltoDopo = t0 + LIMITI_POLL.budgetGiroMs + 10_000;
    expect(fermaIlGiro(t0, moltoDopo, 0)).toBe(false);
  });

  it("non ferma entro il budget, ferma dopo (servita almeno una casella)", async () => {
    const { fermaIlGiro, LIMITI_POLL } = await carica();
    const t0 = 1_000_000;
    // Entro il budget: si continua.
    expect(fermaIlGiro(t0, t0 + LIMITI_POLL.budgetGiroMs - 1, 1)).toBe(false);
    // Budget esaurito: ci si ferma e il resto va al giro dopo.
    expect(fermaIlGiro(t0, t0 + LIMITI_POLL.budgetGiroMs, 1)).toBe(true);
    expect(fermaIlGiro(t0, t0 + LIMITI_POLL.budgetGiroMs + 5_000, 3)).toBe(true);
  });
});

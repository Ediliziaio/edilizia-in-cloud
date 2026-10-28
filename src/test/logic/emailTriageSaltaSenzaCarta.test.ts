/**
 * Un'azienda senza metodo di pagamento non può usare l'AI: aiRouterComplete
 * lancia prima di chiamare il provider. Fino al 28/10/2026 il triage lo scopriva
 * una email alla volta — tre tentativi a testa, 322 righe «[email-triage] ai
 * failure» in 24 ore su Innovasol, New Habitat e Palma. Ora il gate si guarda
 * una volta per azienda: qui si prova che si guarda DAVVERO una volta sola e che
 * l'esito negativo non si dimentica fra una email e l'altra.
 */
import { describe, expect, it, vi } from "vitest";
import { gestoriVeri } from "../helpers/gestoriVeri";

const FILE = "supabase/functions/email-triage-ai/index.ts";
const SENZA_CARTA = { allowed: false, paymentMethod: "none", message: "Registra una carta" };
const CON_CARTA = { allowed: true, paymentMethod: "stripe" };

function monta(esiti: Record<string, typeof SENZA_CARTA | typeof CON_CARTA>) {
  const checkPaymentMethod = vi.fn(async (_db: unknown, companyId: string) => esiti[companyId]);
  const log = vi.fn();
  const { puoPagare } = gestoriVeri(FILE, ["puoPagare"], {
    cartaPerAzienda: new Map<string, boolean>(),
    checkPaymentMethod,
    supa: {},
    console: { log, error: vi.fn(), warn: vi.fn() },
  }) as unknown as { puoPagare: (companyId: string) => Promise<boolean> };
  return { puoPagare, checkPaymentMethod, log };
}

describe("email-triage: il gate della carta si guarda una volta per azienda", () => {
  it("dieci email della stessa azienda senza carta = una sola lettura e una sola riga di log", async () => {
    const { puoPagare, checkPaymentMethod, log } = monta({ innovasol: SENZA_CARTA });
    const esiti = [];
    for (let i = 0; i < 10; i++) esiti.push(await puoPagare("innovasol"));
    expect(esiti.every((e) => e === false)).toBe(true);
    expect(checkPaymentMethod).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain("senza metodo di pagamento");
  });

  it("l'azienda con la carta passa e non finisce nel log", async () => {
    const { puoPagare, checkPaymentMethod, log } = monta({ dimora: CON_CARTA });
    expect(await puoPagare("dimora")).toBe(true);
    expect(await puoPagare("dimora")).toBe(true);
    expect(checkPaymentMethod).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("due aziende nello stesso giro si giudicano una per una", async () => {
    const { puoPagare, checkPaymentMethod } = monta({ innovasol: SENZA_CARTA, dimora: CON_CARTA });
    expect(await puoPagare("innovasol")).toBe(false);
    expect(await puoPagare("dimora")).toBe(true);
    expect(await puoPagare("innovasol")).toBe(false);
    expect(checkPaymentMethod).toHaveBeenCalledTimes(2);
  });
});

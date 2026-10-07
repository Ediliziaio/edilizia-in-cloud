/**
 * Quando un preventivo Serramenti è «deciso» (firmato, accettato o in commessa) e lo step Economia non lo riscrive da
 * solo: tutti i modi in cui lo diventa, e gli stati in cui è ancora aperto.
 */
import { describe, expect, it } from "vitest";
import type { SrStatoProgetto } from "@/types/serramenti";
import { motivoPreventivoDeciso } from "@/lib/serramenti/preventivoDeciso";

describe("motivoPreventivoDeciso", () => {
  it("la firma del cliente (firmato_il, o l'immagine della firma) dice «firmato», anche con lo stato ancora vecchio", () => {
    expect(motivoPreventivoDeciso({ stato: "consegnato", firmato_il: "2026-10-05T09:00:00Z" })).toBe("firmato");
    expect(motivoPreventivoDeciso({ stato: "in_valutazione", firma_cliente_url: "firme/p1.png" })).toBe("firmato");
    expect(motivoPreventivoDeciso({ stato: "accettato", firmato_il: "2026-10-05T09:00:00Z" })).toBe("firmato");
  });

  it("la commessa nata dal preventivo (ordine_id) dice «in commessa»", () => {
    expect(motivoPreventivoDeciso({ stato: "consegnato", ordine_id: "o1" })).toBe("in commessa");
    expect(motivoPreventivoDeciso({ stato: "accettato", ordine_id: "o1" })).toBe("in commessa");
  });

  it("lo stato «accettato» da solo (segnato a mano) dice «accettato»", () => {
    expect(motivoPreventivoDeciso({ stato: "accettato" })).toBe("accettato");
  });

  it.each(["bozza", "da_consegnare", "consegnato", "in_valutazione", "rifiutato", "scaduto", "archiviato"] as SrStatoProgetto[])(
    "uno stato «%s» senza firma né commessa è ancora aperto",
    (stato) => {
      expect(motivoPreventivoDeciso({ stato, firmato_il: null, firma_cliente_url: null, ordine_id: null })).toBeNull();
    },
  );

  it("senza dati (preventivo nuovo, nessun campo) non è deciso", () => {
    expect(motivoPreventivoDeciso({})).toBeNull();
    expect(motivoPreventivoDeciso(null)).toBeNull();
    expect(motivoPreventivoDeciso(undefined)).toBeNull();
  });
});

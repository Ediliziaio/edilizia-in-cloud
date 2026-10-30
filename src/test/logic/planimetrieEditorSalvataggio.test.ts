import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { messaggioErrorePlanimetria } from "@/lib/planimetrie/archivio";
import { MESSAGGIO_CONFLITTO, salvaPianta, type ScrittureArchivio } from "@/components/planimetrie/editor/salvataggio";
import {
  confermaScala,
  fileNonValido,
  leggiRispostaAI,
  scalaDaConfermare,
  type InfoGenerazione,
} from "@/components/planimetrie/editor/generazione";
import { aPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { aggiungiStanza, rettangolo } from "@/components/planimetrie/editor/comandi";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const documento = aPlanimetria(aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 })).pianta);

function archivioFinto(over: Partial<ScrittureArchivio> = {}) {
  const crea = vi.fn(async () => "nuova-id");
  const salva = vi.fn(async () => 4);
  return { crea, salva, ...over } as ScrittureArchivio & { crea: typeof crea; salva: typeof salva };
}

describe("salvare la pianta dall'editor", () => {
  it("la prima volta la crea col titolo, e la pianta prende il titolo", async () => {
    const a = archivioFinto();
    const esito = await salvaPianta(a, { companyId: "az", documento, titolo: "  Casa Rossi " });
    expect(esito).toEqual({ ok: true, id: "nuova-id", versione: 1, creata: true });
    expect(a.crea).toHaveBeenCalledWith(expect.objectContaining({ companyId: "az", titolo: "Casa Rossi", origine: "manuale" }));
    expect((a.crea.mock.calls[0] as unknown as [{ documento: Planimetria }])[0].documento.titolo).toBe("Casa Rossi");
  });

  it("senza nome non crea niente", async () => {
    const a = archivioFinto();
    const esito = await salvaPianta(a, { companyId: "az", documento, titolo: " " });
    expect(esito.ok).toBe(false);
    expect(a.crea).not.toHaveBeenCalled();
  });

  it("dopo, ogni salvataggio è una versione nuova con la versione attesa", async () => {
    const a = archivioFinto();
    const esito = await salvaPianta(a, { companyId: "az", documento, planimetriaId: "p1", versioneAttesa: 3, origine: "ai_pdf" });
    expect(esito).toEqual({ ok: true, id: "p1", versione: 4, creata: false });
    expect(a.salva).toHaveBeenCalledWith({ planimetriaId: "p1", documento, versioneAttesa: 3, origine: "ai_pdf" });
  });

  it("se qualcun altro ha salvato nel frattempo lo dice, senza sovrascrivere", async () => {
    const a = archivioFinto({ salva: vi.fn(async () => { throw new Error(messaggioErrorePlanimetria({ code: "40001" })); }) });
    const esito = await salvaPianta(a, { companyId: "az", documento, planimetriaId: "p1", versioneAttesa: 3 });
    expect(esito).toEqual({ ok: false, conflitto: true, messaggio: MESSAGGIO_CONFLITTO });
  });

  it("gli altri errori passano con il loro messaggio, senza conflitto", async () => {
    const a = archivioFinto({ salva: vi.fn(async () => { throw new Error(messaggioErrorePlanimetria({ code: "42501" })); }) });
    const esito = await salvaPianta(a, { companyId: "az", documento, planimetriaId: "p1", versioneAttesa: 3 });
    expect(esito).toMatchObject({ ok: false, conflitto: false });
    expect(esito.ok === false && esito.messaggio).toMatch(/permesso/);
  });
});

const generazione = (over: Partial<InfoGenerazione> = {}): InfoGenerazione => ({
  ingresso: "documento",
  scala: { metodo: "porte", cm_per_unita: 1, da_confermare: true },
  avvisi: [],
  sorgente_path: null,
  sfondo_dxf: null,
  superfici_scritte: {},
  ...over,
});

describe("risposta della generazione con l'AI", () => {
  it("una pianta buona passa con la sua origine", () => {
    const esito = leggiRispostaAI({ success: true, planimetria: bilocale, generazione: generazione(), origine_versione: "ai_pdf" }, 200);
    expect(esito.ok).toBe(true);
    expect(esito.ok && esito.origine).toBe("ai_pdf");
  });

  it("crediti finiti: frase semplice e suggerimento di disegnarla a mano", () => {
    const esito = leggiRispostaAI({ success: false, codice: "crediti", messaggio: "Crediti AI esauriti" }, 402);
    expect(esito).toMatchObject({ ok: false, motivo: "crediti" });
    expect(esito.ok === false && esito.messaggio).toMatch(/a mano/);
  });

  it("funzione che non risponde o va in errore", () => {
    expect(leggiRispostaAI(null, null)).toMatchObject({ ok: false, motivo: "non_risponde" });
    expect(leggiRispostaAI({ success: false, codice: "errore" }, 500)).toMatchObject({ ok: false, motivo: "non_risponde" });
    expect(leggiRispostaAI({ error: "timeout" }, 504)).toMatchObject({ ok: false, motivo: "non_risponde" });
  });

  it("pianta non ricavata: il messaggio della funzione più il disegno a mano", () => {
    const esito = leggiRispostaAI({ success: false, codice: "non_riconosciuta", messaggio: "Non vedo una pianta in questa immagine." }, 422);
    expect(esito).toMatchObject({ ok: false, motivo: "non_riuscita" });
    expect(esito.ok === false && esito.messaggio).toBe("Non vedo una pianta in questa immagine. Puoi sempre disegnarla a mano.");
  });

  it("una risposta con una pianta rotta non arriva all'editor", () => {
    expect(leggiRispostaAI({ success: true, planimetria: { schema: 1 }, generazione: generazione() }, 200)).toMatchObject({ ok: false });
  });

  it("controlla il file prima di mandarlo", () => {
    expect(fileNonValido({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(fileNonValido({ type: "image/heic", size: 1000 })).toMatch(/PDF o una foto/);
    expect(fileNonValido({ type: "image/jpeg", size: 11 * 1024 * 1024 })).toMatch(/troppo grande/);
  });
});

describe("conferma della scala", () => {
  it("serve solo sui disegni in scala ancora da confermare", () => {
    expect(scalaDaConfermare("documento", generazione())).toBe(true);
    expect(scalaDaConfermare("documento", generazione({ scala: { metodo: "quota_letta", cm_per_unita: 1, da_confermare: false } }))).toBe(false);
    expect(scalaDaConfermare("descrizione", generazione({ ingresso: "descrizione" }))).toBe(false);
  });

  it("una misura scritta adegua tutta la pianta", () => {
    const doc = bilocale as unknown as Planimetria;
    const locale = doc.livelli[0].fatto.locali[0];
    const xs = locale.contorno.map((p) => p.x);
    const larghezza = Math.max(...xs) - Math.min(...xs);
    const r = confermaScala(doc, generazione(), locale.id, "x", larghezza * 2);
    const xs2 = r.planimetria.livelli[0].fatto.locali[0].contorno.map((p) => p.x);
    expect(Math.max(...xs2) - Math.min(...xs2)).toBeCloseTo(larghezza * 2, 1);
    expect(r.generazione.scala?.da_confermare).toBe(false);
  });
});

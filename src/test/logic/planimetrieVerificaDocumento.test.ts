import { describe, expect, it } from "vitest";
import { bagnoDaVerificare, bagnoVerificatoSintetico } from "../fixtures/bagnoDaVerificare";
import { confermaVerifica, controlloPrimaDellUso, esigiVerificaDocumento, firmaVerifica, revocaVerifica, valoreSulDisegno, verificaConfermata, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";
import { validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { applicaQuotaDocumento } from "@/lib/planimetrie/confermaQuoteDocumento";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { annulla, esegui, nuovaStoria } from "@/components/planimetrie/editor/storia";
import { caricaPiantaDelRender } from "../../../supabase/functions/generate-room-render/pianta.ts";
import { generaPlanimetria } from "../../../supabase/functions/planimetria-genera/genera.ts";
import { leggiRispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI.ts";
import { collegaControlliDocumento } from "../../../supabase/functions/planimetria-genera/controlliDocumento.ts";

describe("documento, quote e utilizzi della pianta", () => {
  it.each(["3d", "render", "computo", "pdf"] as const)("%s non parte con quote dubbie o confronto ancora aperto", (uso) => {
    const d = bagnoDaVerificare();
    expect(controlloPrimaDellUso(d, uso)).toMatchObject({ ok: false });
    expect(verificheDelDocumento(d)[0].valoriLettiCm).toEqual([423,421.5,422.5]);
    expect(verificheDelDocumento(d).every((v) => !v.conferma)).toBe(true);
    expect(() => esigiVerificaDocumento(d, uso)).toThrow(/Prima di/);
  });
  it("applica la quota scelta al contorno e alle pareti, mantenendo il rientro e tutte le letture alternative", () => {
    const prima = bagnoDaVerificare();
    const d = applicaQuotaDocumento(prima, "lettura-1", 421.5);
    const v = verificheDelDocumento(d)[0];
    expect(valoreSulDisegno(d, v)).toBe(421.5);
    expect(valoreSulDisegno(prima, v)).toBe(423);
    expect(d.livelli[0].fatto.muri).toHaveLength(6);
    expect(d.livelli[0].fatto.locali[0].contorno).toHaveLength(6);
    expect(verificaConfermata(d, v)).toBe(true);
    expect(v.valoriLettiCm).toEqual([423,421.5,422.5]);
    expect(validaPlanimetria(d).ok).toBe(true);
    expect(controlloPrimaDellUso(d, "render").problemi).toEqual([]);
  });
  it("una spunta non può confermare una misura diversa dal disegno né un verso sconosciuto", () => {
    const d = bagnoDaVerificare();
    expect(() => confermaVerifica(d, "lettura-1", { valoreCm: 421.5 })).toThrow(/corrispondere al disegno/);
    expect(() => confermaVerifica(d, "lettura-3", { nota: "Non si legge" })).toThrow(/Imposta il verso/);
  });
  it("tutte le conferme esplicite sbloccano gli utilizzi; dopo modifica tornano da controllare", () => {
    const d = bagnoVerificatoSintetico();
    for (const uso of ["3d", "render", "computo", "pdf"] as const) expect(controlloPrimaDellUso(d, uso).ok).toBe(true);
    const nome = { ...d, titolo: "Titolo diverso", materialiProgetto: { fatto: { infissi: { profilo: "pvc" as const, colore: "bianco" as const } } } };
    expect(controlloPrimaDellUso(nome, "render").ok).toBe(true);
    const modificata = structuredClone(d);
    modificata.livelli[0].fatto.aperture[1].larghezza += 5;
    expect(controlloPrimaDellUso(modificata, "render").ok).toBe(false);
    expect(controlloPrimaDellUso(modificata, "render").daVerificare.some((v) => v.id === "lettura-2")).toBe(true);
    expect(verificaConfermata(modificata, verificheDelDocumento(modificata)[0])).toBe(true);
  });
  it("salvataggio, riapertura e annulla conservano conferme e revoche, senza scegliere una quota automaticamente", () => {
    const d = bagnoVerificatoSintetico();
    const p = daPlanimetria(d);
    const storia = esegui(nuovaStoria(p), { ...p, letturaDocumento: revocaVerifica(d, "lettura-1").letturaDocumento });
    const revocata = aPlanimetria(storia.presente, d);
    expect(controlloPrimaDellUso(revocata, "pdf").ok).toBe(false);
    const ripristinata = aPlanimetria(annulla(storia).presente, revocata);
    const riaperta = JSON.parse(JSON.stringify(ripristinata));
    expect(validaPlanimetria(riaperta).ok).toBe(true);
    expect(controlloPrimaDellUso(riaperta, "pdf").ok).toBe(true);
    expect(firmaVerifica(riaperta, verificheDelDocumento(riaperta)[0])).toBe(firmaVerifica(d, verificheDelDocumento(d)[0]));
  });
  it("non allarga una porta oltre l'angolo e non la sposta per farla entrare", () => {
    const d = bagnoDaVerificare(); const prima = JSON.stringify(d);
    expect(() => applicaQuotaDocumento(d, "lettura-2", 140)).toThrow(/supererebbe l'angolo/);
    expect(JSON.stringify(d)).toBe(prima);
  });
  it("una spalla di 17,5 cm non viene applicata come larghezza dell'intero bagno", () => {
    const d = bagnoDaVerificare();
    const r = leggiRispostaAI({ sistema: "metri", verifiche_documento: [{ descrizione: "Ultimo tratto a destra della porta", locale_nome: "Bagno", campo: "larghezza", ambito_misura: "segmento", valori_cm: [17.5,14.5] }] }, "metri");
    const g = collegaControlliDocumento({ planimetria: d, generazione: { ingresso: "schizzo", scala: null, avvisi: [], superfici_scritte: {}, sorgente_path: null, sfondo_dxf: null } }, r);
    const v = g.planimetria.letturaDocumento!.verifiche![0];
    expect(v.riferimento?.campo).toBe("contorno");
    expect(valoreSulDisegno(g.planimetria, v)).toBeNull();
    expect(() => applicaQuotaDocumento(d, "lettura-1", 17.5)).toThrow(/solo un tratto/);
  });
  it("la conferma dell'altezza aggiorna anche le pareti del 3D e non taglia porte o finestre", () => {
    const d = bagnoDaVerificare();
    d.letturaDocumento!.verifiche!.push({ id: "altezza", tipo: "quota", descrizione: "Altezza soffitto da verificare", riferimento: { livelloId: "pt", tipo: "locale", oggettoId: "l1", campo: "altezza" }, valoriLettiCm: [266,280] });
    const nuova = applicaQuotaDocumento(d, "altezza", 280);
    expect(nuova.livelli[0].fatto.locali[0].altezza).toBe(280);
    expect(nuova.livelli[0].fatto.muri.every((m) => m.altezza === 280)).toBe(true);
    expect(() => applicaQuotaDocumento(d, "altezza", 180)).toThrow(/taglierebbe un'apertura/);
  });
  it("aggiunge il controllo del verso mancante anche quando l'AI lo dimentica nel suo elenco", async () => {
    const r = { sistema: "metri", locali: [{ nome: "Bagno", contorno: [[0,0],[2,0],[2,4],[0,4]], misure_lette: true }], aperture: [{ tipo: "portafinestra", da: [0.5,0], a: [1.6,0] }] };
    const esito = await generaPlanimetria({ ingresso: "schizzo", file: { dataUrl: "data:image/png;base64,TEST", mime: "image/png", larghezza: 1000, altezza: 1000 } }, async (_m, n) => ({ modello: "test", testo: JSON.stringify(n === 3 ? { verifiche: [{ id: "a1", esito: "visibile", evidenza: "simbolo_porta" }] } : r) }));
    if (esito.ok === false) throw new Error(esito.messaggio);
    expect(esito.pianta.planimetria.letturaDocumento?.verifiche).toContainEqual(expect.objectContaining({ riferimento: { livelloId: "pt", tipo: "apertura", oggettoId: "a1", campo: "verso" } }));
  });
  it("il server blocca il render prima di leggere immagini o generare crediti anche passando direttamente la sessione", async () => {
    const d = bagnoDaVerificare();
    const company = "22222222-2222-4222-8222-222222222222";
    const db = { from: (table: string) => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ error: null as null, data: table === "planimetrie" ? { company_id: company, versione_corrente: 1, deleted_at: null as null } : { documento: d } }) }; return q; } };
    await expect(caricaPiantaDelRender(db as never, company, { planimetria_id: "11111111-1111-4111-8111-111111111111", versione: 1, livello_id: d.livelli[0].id, locale_id: d.livelli[0].fatto.locali[0].id, ambito: "fatto" }, () => undefined)).rejects.toThrow(/Prima di Render AI/);
  });
});

/**
 * I PDF che si generano sul server dopo le richieste di Renova (05/10/2026, valgono per tutti i preventivi):
 *  - la versione HTML dei serramenti (il link da mandare al cliente): in testata l'azienda e il numero della stima, non il
 *    nome del cliente; nel riquadro del consulente il telefono sì, l'email del profilo no; l'Art. 1 dice dove sono i lavori;
 *  - il preventivo standard (pdf-lib): col logo il nome dell'azienda non si ripete, la firma è «ACCETTAZIONE PROPOSTA».
 * L'HTML dei serramenti è una funzione pura e si prova com'è; il preventivo standard vive dentro una funzione edge di
 * duemila righe e, come per gli altri controlli sulle edge, si guarda il codice (vedi pdfEdgeImpaginazioneFix).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderSrPdfHtml, type SrPdfData } from "../../../supabase/functions/_shared/srHtmlTemplate.ts";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

function datiSerramenti(extra: Partial<SrPdfData> = {}): SrPdfData {
  return {
    code: "SF-DEMO-0001", data_emissione: "2026-10-05",
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_indirizzo: null, cliente_telefono: null, cliente_email: null, cliente_citta: "Trieste",
    cantiere_citta: "Trieste", totale_serramenti: 3, totale_accessori: 0, tipo_intervento: "sostituzione",
    intervento_titolo: null, intervento_sintesi: "Sostituzione di 3 finestre.", materiale_principale: null,
    esigenze: [], soluzione: [], perche_noi: [], incluso_investimento: [], testimonianze: [], prossimi_passi: [],
    totale_min: 5000, totale_max: 5000, iva_inclusa: true, fin_anticipo_pct: 0, fin_anticipo_eur: 0, fin_finanziato_eur: 0, fin_piani: [],
    risparmio_eur_anno: null, detrazione_aliquota: null, detrazione_eur_totale: null, detrazione_eur_anno: null,
    payback_anni: null, co2_risparmiata_t_anno: null, cashflow: null,
    serramenti: [], accessori: [], renders: [], public_url: null,
    consulenza_at: null, consulenza_luogo: null,
    consulente_nome: "Marco Bianchi", consulente_ruolo: "Consulente tecnico", consulente_telefono: "+39 02 12345678", consulente_foto_url: null,
    crono_fasi: [], crono_durata_giorni: 0, valido_fino_giorni: 15,
    azienda_nome: "Impresa esempio", azienda_indirizzo: null, azienda_telefono: null, azienda_email: null, azienda_partita_iva: null,
    azienda_logo_url: null, colore_primario: "#2D7D5C",
    ...extra,
  };
}

describe("serramenti, versione HTML sul server", () => {
  it("la testata di ogni pagina dice l'azienda e il numero della stima, mai il nome del cliente", () => {
    const html = renderSrPdfHtml(datiSerramenti());
    const testate = html.match(/<header class="page-header">[\s\S]*?<\/header>/g) ?? [];
    expect(testate.length, "le pagine").toBeGreaterThanOrEqual(4);
    for (const [i, t] of testate.entries()) {
      expect(t.includes("Impresa esempio") && t.includes("SF-DEMO-0001"), `testata ${i + 1}`).toBe(true);
      expect(/Mario|Rossi|Trieste/.test(t), `il cliente nella testata ${i + 1}`).toBe(false);
    }
    expect(html.includes("company-sub"), "la riga del cliente sotto il nome").toBe(false);
  });

  it("nel riquadro del consulente c'è il telefono; l'email non si stampa nemmeno se arriva", () => {
    // Il generatore non la legge più; se un giorno un chiamante la passasse ancora, nel documento non finisce.
    // (Il riquadro «La tua consulenza» c'è quando il preventivo ha un appuntamento.)
    const html = renderSrPdfHtml({ ...datiSerramenti({ consulenza_at: "2026-10-12T09:00:00Z", consulenza_luogo: "In sede" }), consulente_email: "marco.bianchi@example.com" } as SrPdfData);
    expect(html.includes("Marco Bianchi")).toBe(true);
    expect(html.includes("+39 02 12345678")).toBe(true);
    expect(html.includes("marco.bianchi@example.com")).toBe(false);
  });

  it("il generatore non legge l'email del profilo e porta i lavori nell'Art. 1 (luogo dei lavori, non solo indirizzo del cliente)", () => {
    const src = leggi("supabase/functions/sr-genera-pdf/index.ts");
    expect(src).toContain('.select("first_name, last_name, phone, role_interno, avatar_url")');
    expect(src).not.toContain("consulente_email");
    expect(src).toContain("[prog.cantiere_indirizzo ?? prog.cliente_indirizzo, prog.cantiere_citta ?? prog.cliente_citta].filter(Boolean).join(\", \")");
  });
});

describe("preventivo standard (pdf-lib, generate-quote-pdf)", () => {
  const src = leggi("supabase/functions/generate-quote-pdf/index.ts");

  it("la firma si chiama «ACCETTAZIONE PROPOSTA», come in tutti gli altri PDF dei preventivi", () => {
    expect(src).toContain('titolinoSu(page, "ACCETTAZIONE PROPOSTA", margin, y, contentWidth);');
    expect(src).not.toContain("ACCETTAZIONE DEL PREVENTIVO");
  });

  it("copertina: col logo a destra restano i contatti dell'impresa, non il suo nome", () => {
    const riquadro = src.slice(src.indexOf("const righeEmittente"), src.indexOf("const largoDestra"));
    expect(riquadro).toContain("contattiC");
    expect(riquadro).not.toContain("company.name");
  });

  it("layout «modern» e «minimal»: il nome dell'azienda si scrive solo se non c'è il logo", () => {
    const modern = src.slice(src.indexOf('if (t.layout === "modern")'), src.indexOf('} else if (t.layout === "minimal")'));
    const minimal = src.slice(src.indexOf('} else if (t.layout === "minimal")'), src.indexOf('} else if (t.layout === "bold")'));
    for (const blocco of [modern, minimal]) {
      const logo = blocco.indexOf("drawLogo(page");
      const nome = blocco.indexOf('company?.name || "Azienda"');
      expect(logo, "il logo").toBeGreaterThan(0);
      expect(nome, "il nome").toBeGreaterThan(logo);
      // Tra il logo e il nome c'è l'else: il nome sta nel ramo «senza logo».
      expect(blocco.slice(logo, nome)).toContain("} else {");
    }
  });
});

import {
  numeroDocumento,
  unitaConfronto,
  type RigaConfronto,
} from "./confrontoFatture.ts";
import {
  datiRiconciliazione,
  type ContestoRiconciliazione,
  type PropostaRiconciliazione,
} from "./riconciliazioneFattureAI.ts";
export const identitaFornitore = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
export function equivalenzeConfermate(
  c: ContestoRiconciliazione,
): PropostaRiconciliazione {
  const d = datiRiconciliazione(c),
    regole = c.equivalenze ?? [];
  return {
    righe: d.fattura.map((f) => {
      const uguale = (r: RigaConfronto) =>
        regole.some(
          (e) =>
            e.attiva !== false &&
            e.fattura_descrizione === identitaFornitore(f.descrizione) &&
            e.fattura_codice === identitaFornitore(f.codice) &&
            e.documento_descrizione === identitaFornitore(r.descrizione) &&
            e.documento_codice === identitaFornitore(r.codice),
        );
      return {
        fattura: f.id,
        ddt: d.bolle.filter(uguale).map((r) => r.id),
        oda: d.ordini.filter(uguale).map((r) => r.id),
        affidabilita: "alta" as const,
        motivo: "Equivalenza confermata in precedenza per questo fornitore.",
      };
    }),
    avvisi: [],
  };
}
export interface QuotaFattura {
  chiave: string;
  fattura_riga: string;
  ddt_riga: string;
  quantita_fattura: string;
  fattore: string;
  unita_fattura: string;
  unita_ddt: string;
  conferma_unita: boolean;
  conferma_conversione: boolean;
  conferma_residuo: boolean;
  ricorda_conversione: boolean;
  rettifica_di?: string;
  descrizione: string;
  documento: string;
  residuo: number | null;
  incerto: boolean;
  massimo: number;
}
export function preparaQuote(
  c: ContestoRiconciliazione,
  p: PropostaRiconciliazione,
  decisioni: Record<string, string>,
): QuotaFattura[] {
  const d = datiRiconciliazione(c),
    restanti = new Map(
      d.bolle.map((r) => [
        r.id,
        r.quantita == null ? null : Math.max(0, r.quantita - r.giaFatturata),
      ]),
    );
  const esistenti = c.allocazioni_questa_fattura ?? [],
    out: QuotaFattura[] = [];
  for (const f of d.fattura) {
    const pr = p.righe.find((r) => r.fattura === f.id);
    if (!pr || decisioni[f.id] !== "accettata") continue;
    let daRipartire = Math.abs(f.quantita ?? 0);
    for (const r of d.bolle.filter((r) => pr.ddt.includes(r.id))) {
      const doc = c.ddt.find((d) => d.id === r.documentoId);
      const origini =
        c.fattura.tipo_documento === "TD04"
          ? (c.allocazioni_origine ?? []).filter((a) => a.ddt_riga === r.id)
          : [null];
      for (const origine of origini) {
        const sal = esistenti.find(
          (e) =>
            e.fattura_riga === f.id &&
            e.ddt_riga === r.id &&
            (e.rettifica_di ?? null) === (origine?.id ?? null),
        );
        const uf = String(sal?.unita_fattura ?? f.um ?? ""),
          ud = String(sal?.unita_ddt ?? r.um ?? "");
        const cv = (c.conversioni ?? []).find(
          (v) =>
            v.descrizione_articolo === identitaFornitore(f.descrizione) &&
            v.codice_articolo === identitaFornitore(f.codice) &&
            v.unita_fattura === unitaConfronto(uf) &&
            v.unita_ddt === unitaConfronto(ud),
        );
        const fattore =
          numeroDocumento(sal?.fattore ?? cv?.fattore) ??
          (unitaConfronto(uf) && unitaConfronto(uf) === unitaConfronto(ud)
            ? 1
            : null);
        const disponibile = origine
          ? numeroDocumento(origine.residuo_stornabile)
          : (restanti.get(r.id) ?? null);
        const q =
          numeroDocumento(sal?.quantita_fattura) ??
          (fattore && disponibile != null && !r.residuoIncerto
            ? Math.min(daRipartire, disponibile / fattore)
            : 0);
        daRipartire = Math.max(0, daRipartire - q);
        if (!origine && fattore && disponibile != null)
          restanti.set(r.id, Math.max(0, disponibile - q * fattore));
        out.push({
          chiave: `${f.id}:${r.id}:${origine?.id ?? ""}`,
          fattura_riga: f.id,
          ddt_riga: r.id,
          quantita_fattura: q ? String(q) : "",
          fattore: fattore ? String(fattore) : "",
          unita_fattura: uf,
          unita_ddt: ud,
          conferma_unita: !!sal,
          conferma_conversione: !!sal || !!cv,
          conferma_residuo: !!sal,
          ricorda_conversione: false,
          rettifica_di: origine ? String(origine.id) : undefined,
          descrizione: f.descrizione,
          documento: `DDT ${doc?.numero ?? ""}${origine ? ` · fattura ${origine.numero_fattura ?? ""}` : ""}`,
          residuo: disponibile,
          incerto: r.residuoIncerto,
          massimo: Math.abs(f.quantita ?? 0),
        });
      }
    }
  }
  return out;
}
export function quoteDaSalvare(quote: QuotaFattura[]) {
  return quote
    .filter(
      (r) =>
        r.quantita_fattura.trim() !== "" &&
        numeroDocumento(r.quantita_fattura) !== 0,
    )
    .map((r) => {
      const q = numeroDocumento(r.quantita_fattura),
        fattore = numeroDocumento(r.fattore);
      if (
        q == null ||
        q < 0 ||
        fattore == null ||
        fattore <= 0 ||
        !r.unita_fattura.trim() ||
        !r.unita_ddt.trim()
      )
        throw new Error(
          "Controlla quantità, unità e fattore delle righe compilate.",
        );
      return {
        fattura_riga: r.fattura_riga,
        ddt_riga: r.ddt_riga,
        quantita_fattura: q,
        fattore,
        unita_fattura: r.unita_fattura,
        unita_ddt: r.unita_ddt,
        conferma_unita: r.conferma_unita,
        conferma_conversione: r.conferma_conversione,
        conferma_residuo: r.conferma_residuo,
        ricorda_conversione: r.ricorda_conversione,
        rettifica_di: r.rettifica_di ?? null,
      };
    });
}

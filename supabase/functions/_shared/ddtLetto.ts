/**
 * Il DDT fotografato e mandato su WhatsApp, letto e messo in parole per
 * l'assistente di cantiere (25/09/2026).
 *
 * Prima la foto veniva «descritta» in 2-4 righe a bassa risoluzione, e letta
 * come DDT solo se l'operaio scriveva «ddt» nel testo: righe e quantità non
 * arrivavano mai all'assistente, e carica_ddt partiva senza righe. Ora la foto
 * passa dallo stesso lettore dell'app (task ddt_ocr) e qui si trasforma il
 * risultato in un testo che l'assistente mostra all'operaio e poi passa a
 * carica_ddt così com'è.
 */

export interface RigaDdtLetta {
  descrizione: string;
  quantita: number | null;
  unita_misura: string | null;
  codice: string | null;
}

export interface DdtLetto {
  fornitore: string | null;
  partitaIva: string | null;
  numero: string | null;
  data: string | null;
  righe: RigaDdtLetta[];
  affidabilita: "alta" | "media" | "bassa" | null;
  /** Che documento è (18/10/2026): decide se è merce da cantiere o una spesa. */
  tipo: "ddt" | "scontrino" | "fattura" | "altro" | null;
  totale: number | null;
  /** Indirizzo di consegna e ordine citato: servono a capire il cantiere. */
  indirizzoConsegna: string | null;
  riferimentoOrdine: string | null;
}

const PAROLE_DDT = /\b(ddt|bolla|bolle|bollettino|documento di trasporto|consegna|scarico|merce|materiale arrivato)\b/i;

/** L'operaio ha detto lui che è un DDT: non serve chiederlo all'AI. */
export function sembraDdtDallaDidascalia(testo: string | null | undefined): boolean {
  return PAROLE_DDT.test(testo ?? "");
}

function testoONull(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "non leggibile" ? s : null;
}

function numeroONull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  // «1.234,5» all'italiana; «1.5» col punto decimale come chiede il lettore.
  const s = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}

/** Il JSON del lettore (stesso formato di ai-ddt-analyzer), ripulito. */
export function normalizzaDdtLetto(grezzo: unknown): DdtLetto {
  const o = (grezzo && typeof grezzo === "object" ? grezzo : {}) as Record<string, unknown>;
  const voci = Array.isArray(o.items) ? o.items : [];
  const righe: RigaDdtLetta[] = [];
  for (const v of voci) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const descrizione = testoONull(r.description);
    if (!descrizione) continue;
    righe.push({
      descrizione,
      quantita: numeroONull(r.quantity),
      unita_misura: testoONull(r.unit),
      codice: testoONull(r.code),
    });
  }
  const aff = testoONull(o.confidenza_estrazione)?.toLowerCase();
  const tipo = testoONull(o.document_type)?.toLowerCase();
  return {
    fornitore: testoONull(o.supplier_name),
    partitaIva: testoONull(o.supplier_vat),
    numero: testoONull(o.ddt_number),
    data: testoONull(o.ddt_date),
    righe,
    affidabilita: aff === "alta" || aff === "media" || aff === "bassa" ? aff : null,
    tipo: tipo === "ddt" || tipo === "scontrino" || tipo === "fattura" || tipo === "altro" ? tipo : null,
    totale: numeroONull(o.total_amount),
    indirizzoConsegna: testoONull(o.delivery_address),
    riferimentoOrdine: testoONull(o.order_reference),
  };
}

function quantitaItaliana(n: number): string {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
}

/**
 * Il testo che riceve l'assistente al posto della foto. null se dalla foto
 * non è uscito niente di un DDT (né fornitore né righe): allora la foto
 * viene trattata come una foto qualsiasi.
 */
export function testoDdtPerAssistente(ddt: DdtLetto, didascalia: string | null | undefined): string | null {
  if (!ddt.fornitore && ddt.righe.length === 0) return null;
  const righe = ddt.righe.map((r) => {
    const q = r.quantita != null ? ` × ${quantitaItaliana(r.quantita)}${r.unita_misura ? ` ${r.unita_misura}` : ""}` : "";
    const c = r.codice ? ` (cod. ${r.codice})` : "";
    return `- ${r.descrizione}${q}${c}`;
  });
  const intestazione: Record<string, string> = {
    scontrino: "[Foto di uno scontrino — dati letti dal documento]",
    fattura: "[Foto di una fattura del fornitore — dati letti dal documento]",
  };
  return [
    intestazione[ddt.tipo ?? ""] ?? "[Foto di un DDT — dati letti dal documento]",
    `Fornitore: ${ddt.fornitore ?? "non leggibile"}${ddt.partitaIva ? ` (P.IVA ${ddt.partitaIva})` : ""}`,
    `${ddt.tipo && ddt.tipo !== "ddt" ? "Numero documento" : "Numero DDT"}: ${ddt.numero ?? "non leggibile"}`,
    `Data: ${ddt.data ?? "non leggibile"}`,
    ...(ddt.totale != null ? [`Totale: ${ddt.totale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`] : []),
    ...(ddt.indirizzoConsegna ? [`Indirizzo di consegna: ${ddt.indirizzoConsegna}`] : []),
    ...(ddt.riferimentoOrdine ? [`Riferimento ordine: ${ddt.riferimentoOrdine}`] : []),
    righe.length ? `Righe (${righe.length}):\n${righe.join("\n")}` : "Righe: non leggibili",
    `Affidabilità della lettura: ${ddt.affidabilita ?? "non indicata"}`,
    "",
    `Testo dell'utente: ${didascalia?.trim() || "(nessuno)"}`,
  ].join("\n");
}

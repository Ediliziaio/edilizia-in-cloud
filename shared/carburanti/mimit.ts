export const PAGINA_MIMIT = "https://www.mimit.gov.it/it/prezzo-medio-carburanti/regioni";
const CSV_MIMIT = "https://www.mimit.gov.it/images/stories/carburanti/MediaRegionaleStradale.csv";
export const PERCORSO_MIMIT = "/api/carburanti-mimit";

type Tipo = "gasolio" | "benzina";
export type PrezziMimit = {
  giorno: string;
  territori: { chiave: string; nome: string; prezzi: Partial<Record<Tipo, number>> }[];
};

export const chiaveTerritorio = (nome: string) => nome.normalize("NFD").replace(/\p{M}/gu, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function leggiPrezziMimit(csv: string): PrezziMimit {
  const [intestazione, colonne, ...righe] = csv.trim().split(/\r?\n/);
  const data = intestazione?.match(/^Aggiornamento\s+(\d{2})-(\d{2})-(\d{4})$/i);
  if (!data || colonne?.trim().toUpperCase() !== "REGIONE;TIPOLOGIA;EROGAZIONE;PREZZO MEDIO") {
    throw new Error("Formato del listino MIMIT non riconosciuto");
  }
  const giorno = `${data[3]}-${data[2]}-${data[1]}`;
  const d = new Date(giorno);
  if (!Number.isFinite(d.getTime()) || !d.toISOString().startsWith(giorno)) throw new Error("Data del listino MIMIT non valida");

  const territori = new Map<string, PrezziMimit["territori"][number]>();
  for (const riga of righe) {
    const [nome, tipo, servizio, prezzo] = riga.split(";").map(c => c.trim());
    const carburante = tipo?.toLowerCase();
    if (!nome || (carburante !== "gasolio" && carburante !== "benzina") || servizio?.toUpperCase() !== "SELF") continue;
    const chiave = chiaveTerritorio(nome);
    if (!chiave) continue;
    const territorio = territori.get(chiave) ?? { chiave, nome, prezzi: {} };
    if (prezzo && /^\d{1,2}(?:[.,]\d{1,4})?$/.test(prezzo)) {
      const valore = Number(prezzo.replace(",", "."));
      if (valore > 0 && valore <= 20) territorio.prezzi[carburante] = valore;
    }
    territori.set(chiave, territorio);
  }
  if (!territori.size || ![...territori.values()].some(t => Object.keys(t.prezzi).length > 0)) {
    throw new Error("Prezzi MIMIT non disponibili");
  }
  return { giorno, territori: [...territori.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it")) };
}

const VALIDITA_MS = 15 * 60_000;
let rilevazione: { expires: number; data: PrezziMimit } | undefined;
let inCorso: Promise<PrezziMimit> | undefined;

export async function scaricaRilevazioneMimit() {
  if (rilevazione && rilevazione.expires > Date.now()) return rilevazione.data;
  inCorso ??= (async () => {
    const res = await fetch(CSV_MIMIT, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!res.ok) throw new Error("Listino MIMIT non raggiungibile");
    const csv = await res.text();
    if (csv.length > 64_000) throw new Error("Listino MIMIT troppo grande");
    const data = leggiPrezziMimit(csv);
    rilevazione = { expires: Date.now() + VALIDITA_MS, data };
    return data;
  })().finally(() => { inCorso = undefined; });
  return inCorso;
}

export async function rispostaPrezziMimit(): Promise<Response> {
  try {
    return Response.json(await scaricaRilevazioneMimit(), { headers: { "Cache-Control": "public, max-age=900" } });
  } catch {
    return Response.json({ error: "Rilevazione MIMIT temporaneamente non disponibile" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}

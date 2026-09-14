/**
 * Le voci dentro una variante.
 *
 * «Colore Standard +10%» è una fascia di prezzo: dentro ci sono i colori veri
 * (Grigio antracite RAL 7016, effetto legno noce). Il listino li scrive in
 * article_family_axis_values.opzioni; il preventivo salva quale è stato scelto
 * in scelte_assi ({"colore": "Grigio antracite RAL 7016"}), e il prezzo resta
 * quello della fascia.
 *
 * Solo testi e controlli, senza import: li usano il listino, il preventivatore
 * e il PDF, che gira in un worker.
 */

/** Il testo come si confronta: maiuscole, accenti e punteggiatura non contano. */
function chiave(testo: string): string {
  return testo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const MAX_VOCI = 300;
export const MAX_LUNGHEZZA_VOCE = 120;

/**
 * Un elenco incollato o scritto di seguito: una voce per riga, o separate dal
 * punto e virgola. La virgola no: «Effetto legno (noce, rovere)» è una voce sola.
 */
export function dividiVoci(testo: string): string[] {
  return testo
    .split(/[\r\n;]+/)
    .map((voce) => voce.trim())
    .filter(Boolean);
}

/** Senza vuoti né doppioni (scritti in un altro modo), nell'ordine in cui arrivano. */
export function pulisciVoci(voci: readonly unknown[] | null | undefined): string[] {
  const viste = new Set<string>();
  const risultato: string[] = [];
  for (const voce of voci ?? []) {
    if (typeof voce !== "string") continue;
    const testo = voce.replace(/\s+/g, " ").trim();
    const k = chiave(testo);
    if (!k || viste.has(k)) continue;
    viste.add(k);
    risultato.push(testo);
  }
  return risultato;
}

export function stesseVoci(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((voce, i) => voce === b[i]);
}

/** Le voci di un valore del listino; i dati di prima non hanno la colonna. */
export function vociDi(valore: { opzioni?: unknown } | null | undefined): string[] {
  return Array.isArray(valore?.opzioni) ? pulisciVoci(valore.opzioni) : [];
}

/** Perché un elenco non si può salvare, o null. */
export function problemaVoci(nomeValore: string, voci: readonly string[]): string | null {
  if (voci.length > MAX_VOCI) return `«${nomeValore}»: al massimo ${MAX_VOCI} voci nell'elenco.`;
  const lunga = voci.find((voce) => voce.length > MAX_LUNGHEZZA_VOCE);
  if (lunga) return `«${nomeValore}»: «${lunga.slice(0, 40)}…» è più lunga di ${MAX_LUNGHEZZA_VOCE} caratteri.`;
  return null;
}

// ─── Nel preventivo ─────────────────────────────────────────────────────────

/**
 * Il valore di una tendina che ha, per ogni valore, sia il valore stesso
 * («da decidere») sia le sue voci: v:<id>, o:<id>:<indice>, x:<id> per una
 * voce che nel listino non c'è più.
 */
export function codificaScelta(valoreId: string, scelta: string | null | undefined, voci: readonly string[]): string {
  // Un valore rimasto senza elenco non ha voci da mostrare: la scelta si legge solo sulla tendina chiusa.
  if (!scelta || voci.length === 0) return `v:${valoreId}`;
  const indice = voci.indexOf(scelta);
  return indice >= 0 ? `o:${valoreId}:${indice}` : `x:${valoreId}`;
}

export function decodificaScelta(
  codice: string,
  valori: ReadonlyArray<{ id: string; opzioni?: unknown }>,
): { valoreId: string; scelta: string | null } | null {
  const [tipo, id, indice] = codice.split(":");
  if (!id) return null;
  if (tipo === "v") return { valoreId: id, scelta: null };
  if (tipo !== "o") return null;
  const voce = vociDi(valori.find((v) => v.id === id))[Number(indice)];
  return voce ? { valoreId: id, scelta: voce } : null;
}

/** Le scelte della riga dopo un cambio: la voce si scrive, o si toglie. */
export function scelteDopo(
  scelte: Record<string, string> | null | undefined,
  codiceAsse: string,
  scelta: string | null,
): Record<string, string> {
  const dopo = { ...(scelte ?? {}) };
  if (scelta) dopo[codiceAsse] = scelta;
  else delete dopo[codiceAsse];
  return dopo;
}

/**
 * Come si legge la scelta: «Grigio antracite RAL 7016 (Colore Standard)». Se
 * la voce dice già il valore («Bianco RAL 9010» dentro «Bianco»), basta la voce.
 */
export function testoScelta(nomeValore: string, scelta: string | null | undefined): string {
  const voce = (scelta ?? "").trim();
  if (!voce) return nomeValore;
  const valore = chiave(nomeValore);
  return !valore || ` ${chiave(voce)} `.includes(` ${valore} `) ? voce : `${voce} (${nomeValore})`;
}

// ─── Nel listino ────────────────────────────────────────────────────────────

export interface ParoleVoci {
  /** «un colore», «un vetro», «una voce». */
  una: string;
  /** «colore», «vetro», «voce». */
  singolare: string;
  /** «colori», «vetri», «voci». */
  tante: string;
}

type Asse = { codice?: string | null; nome: string };

const eColore = (k: string) => /\b(colore|colori|finitura|finiture|essenza|ral|pellicola)\b/.test(k) || k.includes("color");
const eVetro = (k: string) => k.includes("vetr");

export function paroleVoci(asse: Asse): ParoleVoci {
  const k = chiave(`${asse.codice ?? ""} ${asse.nome}`.replace(/_/g, " "));
  if (eColore(k)) return { una: "un colore", singolare: "colore", tante: "colori" };
  if (eVetro(k)) return { una: "un vetro", singolare: "vetro", tante: "vetri" };
  if (k.includes("maniglia")) return { una: "una maniglia", singolare: "maniglia", tante: "maniglie" };
  return { una: "una voce", singolare: "voce", tante: "voci" };
}

/** Colori RAL e finiture che si trovano in quasi tutti i listini di serramenti. */
const COLORI_COMUNI = [
  "Bianco RAL 9010",
  "Bianco traffico RAL 9016",
  "Bianco crema RAL 9001",
  "Bianco perla RAL 1013",
  "Grigio luce RAL 7035",
  "Grigio argento RAL 7001",
  "Grigio antracite RAL 7016",
  "Grigio nerastro RAL 7021",
  "Marrone cioccolata RAL 8017",
  "Marrone grigiastro RAL 8019",
  "Verde muschio RAL 6005",
  "Rosso vino RAL 3005",
  "Nero intenso RAL 9005",
  "Alluminio brillante RAL 9006",
  "Effetto legno noce",
  "Effetto legno rovere",
  "Effetto legno ciliegio",
  "Effetto legno douglas",
  "Effetto legno castagno",
];

const VETRI_COMUNI = [
  "Vetrocamera 4/16/4 basso emissivo",
  "Vetrocamera 33.1/16/4 basso emissivo",
  "Triplo vetro 4/12/4/12/4",
  "Stratificato acustico 44.2",
  "Stratificato di sicurezza 33.1",
  "Antisfondamento P4A",
  "Vetro satinato",
  "Vetro a controllo solare",
];

/** I suggerimenti mentre si scrive l'elenco: colori o vetri, secondo la variante. */
export function suggerimentiVoci(asse: Asse): string[] {
  const k = chiave(`${asse.codice ?? ""} ${asse.nome}`.replace(/_/g, " "));
  if (eColore(k)) return COLORI_COMUNI;
  if (eVetro(k)) return VETRI_COMUNI;
  return [];
}

/** Le voci scritte nei valori di una variante «colore», per suggerire colore interno ed esterno. */
export function coloriDelListino(assi: ReadonlyArray<Asse & { values: ReadonlyArray<{ attivo: boolean; opzioni?: unknown }> }>): string[] {
  return pulisciVoci(
    assi
      .filter((a) => eColore(chiave(`${a.codice ?? ""} ${a.nome}`.replace(/_/g, " "))))
      .flatMap((a) => a.values.filter((v) => v.attivo).flatMap((v) => vociDi(v))),
  );
}

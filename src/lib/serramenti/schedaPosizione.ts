/**
 * Cosa si legge di una finestra nel preventivo, come la descrive il titolare:
 * «Finestra 2 Ante — PVC Salamander 76 · Colore interno: Bianco · Colore
 * esterno: 21 - Nussbaum (noce) · Doppio vetro, antisfondamento · Telaio a L ·
 * Trasmittanza termica Uw ≤ 1,3 W/m²K».
 *
 * Le varianti scelte si riconoscono dal codice dell'asse: la linea va nel
 * titolo; il colore vale per i due lati, tranne la pellicola su un lato che
 * lascia l'interno del colore di serie; vetrocamera e tipologia del vetro
 * fanno una riga sola, il telaio un'altra; la descrizione di un valore scelto
 * (la trasmittanza del doppio vetro) è un dato tecnico. Il resto resta
 * «Variante: valore». I colori scritti a mano sulla riga vincono; il vetro
 * scritto a mano si aggiunge a quello della variante.
 *
 * Senza React né database: la usano il preventivatore e il PDF.
 */
import { testoScelta, vociDi } from "@/lib/listino/scelteVariante";

export interface VarianteScelta {
  /** Codice dell'asse: «colore», «vetrocamera», «telaio»… */
  codice: string;
  nomeAsse: string;
  /** Il valore scelto: «Colore Standard», «Doppio vetro». */
  valore: string;
  /** La voce scelta dentro il valore: «21 - Nussbaum (noce)». */
  voce?: string | null;
  descrizione?: string | null;
  /** Il valore di serie dell'asse: il colore dell'interno con la pellicola su un lato. */
  diSerie?: string | null;
  /** Il valore ha un elenco di voci («Colore Standard»): senza voce, il colore è da scegliere. */
  conElenco?: boolean;
}

export interface SchedaPosizione {
  linea: string | null;
  coloreInterno: string | null;
  coloreEsterno: string | null;
  vetro: string | null;
  telaio: string | null;
  /** Le descrizioni dei valori scelti, senza doppioni: «Trasmittanza termica Uw ≤ 1,3 W/m²K». */
  datiTecnici: string[];
  /** Le varianti che non hanno una riga loro (maniglia, soglia…). */
  altre: Array<{ label: string; value: string }>;
}

type Ruolo = "linea" | "colore" | "coloreInterno" | "coloreEsterno" | "vetrocamera" | "vetro" | "telaio" | "altro";

const RUOLI: Record<string, Ruolo> = {
  linea: "linea",
  serie: "linea",
  colore: "colore",
  colori: "colore",
  colore_ral: "colore",
  finitura: "colore",
  colore_interno: "coloreInterno",
  finitura_interna: "coloreInterno",
  colore_esterno: "coloreEsterno",
  finitura_esterna: "coloreEsterno",
  vetrocamera: "vetrocamera",
  vetro: "vetro",
  tipologia_vetro: "vetro",
  telaio: "telaio",
};

function chiave(testo: string | null | undefined): string {
  return (testo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ruolo = (s: VarianteScelta): Ruolo => RUOLI[chiave(s.codice)] ?? RUOLI[chiave(s.nomeAsse)] ?? "altro";

const minuscola = (testo: string) => (testo ? testo.charAt(0).toLocaleLowerCase("it-IT") + testo.slice(1) : testo);

/** La voce, se c'è, altrimenti il valore. */
const testoDi = (s: VarianteScelta) => (s.voce ?? "").trim() || s.valore.trim();

/** La pellicola su un lato (nella fascia o nel colore): l'interno resta di serie. */
const suUnLato = (s: VarianteScelta) =>
  /(^|_)(un_lato|monolato|solo_esterno)(_|$)/.test(`${chiave(s.valore)}_${chiave(s.voce)}`);

/** Accanto al doppio vetro «Vetro Antisfondamento» si legge «antisfondamento»; lo standard non si ripete. */
function tipologiaDopoLaVetrocamera(s: VarianteScelta): string | null {
  const voce = (s.voce ?? "").trim();
  if (voce) return voce;
  const senzaVetro = s.valore.trim().replace(/^vetro\s+/i, "");
  return !senzaVetro || chiave(senzaVetro) === "standard" ? null : minuscola(senzaVetro);
}

export function schedaPosizione(
  scelte: readonly VarianteScelta[],
  manuali: { coloreInterno?: string | null; coloreEsterno?: string | null; vetro?: string | null } = {},
): SchedaPosizione {
  let linea: string | null = null;
  let colore: VarianteScelta | null = null;
  let interno: string | null = null;
  let esterno: string | null = null;
  let vetrocamera: string | null = null;
  let tipologiaVetro: VarianteScelta | null = null;
  let telaio: string | null = null;
  const datiTecnici: string[] = [];
  const altre: Array<{ label: string; value: string }> = [];

  for (const s of scelte) {
    const r = ruolo(s);
    if (r === "linea") linea = testoDi(s);
    else if (r === "colore") colore = s;
    else if (r === "coloreInterno") interno = testoDi(s);
    else if (r === "coloreEsterno") esterno = testoDi(s);
    else if (r === "vetrocamera") vetrocamera = testoDi(s);
    else if (r === "vetro") tipologiaVetro = s;
    else if (r === "telaio") telaio = s.voce?.trim() ? `${s.valore.trim()}, ${minuscola(s.voce.trim())}` : s.valore.trim();
    else altre.push({ label: s.nomeAsse, value: testoScelta(s.valore, s.voce) });
    // La linea ha la sua scheda: la descrizione del valore non è un dato della finestra.
    const descrizione = s.descrizione?.trim();
    if (descrizione && r !== "linea" && !datiTecnici.includes(descrizione)) datiTecnici.push(descrizione);
  }

  // «Colore Standard» senza il colore scelto dall'elenco: il cliente legge che è da scegliere.
  const coloreScelto = colore
    ? colore.voce?.trim() || (colore.conElenco ? `${colore.valore.trim()} (da scegliere)` : colore.valore.trim())
    : null;
  const internoDaVariante = colore ? (suUnLato(colore) ? colore.diSerie?.trim() || "Bianco" : coloreScelto) : null;
  const vetroDaVarianti = vetrocamera
    ? [vetrocamera, tipologiaVetro ? tipologiaDopoLaVetrocamera(tipologiaVetro) : null].filter(Boolean).join(", ")
    : tipologiaVetro
      ? testoDi(tipologiaVetro)
      : null;
  // Il vetro scritto a mano è la composizione («33.1/16/4 basso emissivo»):
  // si aggiunge alla variante, e la sostituisce solo se la dice già.
  const vetroScritto = manuali.vetro?.trim() || null;
  const vetro = !vetroScritto
    ? vetroDaVarianti || null
    : !vetroDaVarianti || chiave(vetroScritto).includes(chiave(vetroDaVarianti))
      ? vetroScritto
      : `${vetroDaVarianti} · ${vetroScritto}`;

  // Mai una stringa vuota: il PDF la scriverebbe fuori da un <Text>.
  return {
    linea: linea || null,
    coloreInterno: manuali.coloreInterno?.trim() || interno || internoDaVariante || null,
    coloreEsterno: manuali.coloreEsterno?.trim() || esterno || coloreScelto || null,
    vetro: vetro || null,
    telaio: telaio || null,
    datiTecnici,
    altre,
  };
}

/** «Finestra 2 Ante — PVC Salamander 76»; la linea non si ripete se il nome la dice già. */
export function titoloConLinea(titolo: string, linea: string | null | undefined): string {
  const l = (linea ?? "").trim();
  return !l || chiave(titolo).includes(chiave(l)) ? titolo : `${titolo} — ${l}`;
}

/** Le varianti scelte su una riga, lette dagli assi del prodotto (valori_assi + scelte_assi). */
export function scelteDaAssi(
  assi: ReadonlyArray<{
    codice: string;
    nome: string;
    values: ReadonlyArray<{
      id: string;
      label: string;
      valore: string;
      descrizione?: string | null;
      is_default?: boolean;
      opzioni?: unknown;
    }>;
  }>,
  valoriAssi: Record<string, string> | null | undefined,
  scelteAssi: Record<string, string> | null | undefined,
): VarianteScelta[] {
  const scelte: VarianteScelta[] = [];
  for (const asse of assi) {
    const valueId = valoriAssi?.[asse.codice];
    const valore = valueId ? asse.values.find((v) => v.id === valueId) : undefined;
    if (!valore) continue;
    const diSerie = asse.values.find((v) => v.is_default);
    scelte.push({
      codice: asse.codice,
      nomeAsse: asse.nome,
      valore: valore.label || valore.valore,
      voce: scelteAssi?.[asse.codice] ?? null,
      descrizione: valore.descrizione ?? null,
      diSerie: diSerie ? diSerie.label || diSerie.valore : null,
      conElenco: vociDi(valore).length > 0,
    });
  }
  return scelte;
}

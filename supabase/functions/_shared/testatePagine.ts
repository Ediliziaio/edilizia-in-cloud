/**
 * La testata delle pagine che raccontano l'azienda: «Dicono di noi», le domande,
 * le garanzie, i nostri lavori. Occhiello, titolo e introduzione.
 *
 * Fino al 22/09/2026 erano scritte nei motori, uguali per tutti: l'azienda
 * cambiava recensioni, domande e garanzie, ma non come la pagina le presentava.
 * Ora le riscrive dall'editor del modello («Ordine e pagine», la matita della
 * pagina). Si salvano in `pdf_blocchi` sotto «testata_<pagina>», solo i campi
 * cambiati, come i blocchi: un campo lasciato vuoto torna quello di serie.
 *
 * Ogni motore ha le sue di serie, perché scrive i titoli in un altro modo: nel
 * Piano dei lavori una parola fra asterischi esce in corsivo, nel colore
 * dell'azienda; nei Serramenti e nel Fotovoltaico il titolo va a capo (\n).
 */

export type PaginaConTestata = "recensioni" | "domande" | "garanzie" | "lavori";
export type MotoreTestate = "edili" | "serramenti" | "fotovoltaico";

export interface TestataPagina {
  occhiello: string;
  /** Null: lo sceglie il documento (il Fotovoltaico conta gli anni di garanzia dei pannelli). */
  titolo: string | null;
  /** Null: nessuna, o quella che il documento scrive secondo i contenuti (c'è un voto? ci sono recensioni?). */
  intro: string | null;
}

export interface TestataDiSerie extends TestataPagina {
  /** Nell'editor, al posto di un titolo o di un'introduzione che il documento sceglie da sé. */
  segnaposto?: { titolo?: string; intro?: string };
}

/**
 * Lunghezze massime: la testata sta sopra a quello che la pagina deve mostrare,
 * e il Fotovoltaico ha pagine di altezza fissa (quello che sborda si taglia).
 */
export const LUNGHEZZA_TESTATA = { occhiello: 60, titolo: 90, intro: 300 } as const;

const INTRO_RECENSIONI = "Cambia con quello che c'è: il voto, le parole dei clienti o tutti e due.";

const DI_SERIE: Record<MotoreTestate, Partial<Record<PaginaConTestata, TestataDiSerie>>> = {
  edili: {
    recensioni: { occhiello: "Dicono di noi", titolo: "La parola ai *nostri clienti*.", intro: null, segnaposto: { intro: INTRO_RECENSIONI } },
    domande: { occhiello: "Domande e risposte", titolo: "Le domande che ci fanno *più spesso*.", intro: null },
    garanzie: { occhiello: "Le nostre garanzie", titolo: "Più *certezze*, meno dubbi.", intro: null },
    lavori: { occhiello: "I nostri lavori", titolo: "Lavori *finiti*, non promesse.", intro: "Alcuni interventi che abbiamo già consegnato." },
  },
  serramenti: {
    recensioni: { occhiello: "Dicono di noi", titolo: "La parola ai nostri clienti.", intro: null, segnaposto: { intro: INTRO_RECENSIONI } },
    domande: { occhiello: "Domande frequenti", titolo: "Le risposte\nprima della conferma.", intro: "I dubbi più comuni spiegati in modo semplice, prima di decidere." },
    garanzie: { occhiello: "Le nostre garanzie", titolo: "Più controllo.\nMeno dubbi.", intro: "Le garanzie che rendono il progetto più chiaro prima della conferma." },
    lavori: { occhiello: "I nostri lavori", titolo: "Lavori finiti, non promesse.", intro: "Alcuni interventi che abbiamo già consegnato." },
  },
  fotovoltaico: {
    recensioni: { occhiello: "Dicono di noi", titolo: "La parola ai\nnostri clienti.", intro: null, segnaposto: { intro: INTRO_RECENSIONI } },
    domande: { occhiello: "Domande frequenti", titolo: "Le domande\nche fanno tutti.", intro: null },
    garanzie: {
      occhiello: "Garanzie e assistenza", titolo: null,
      intro: "Le garanzie reali sui componenti, sulla manodopera e sulla nostra azienda.",
      segnaposto: { titolo: "Di serie: «25 anni di tranquillità», con gli anni di garanzia dei pannelli scelti." },
    },
  },
};

/** Le pagine con una testata in un motore: il Fotovoltaico non ha «I nostri lavori». */
export function pagineConTestata(motore: MotoreTestate): PaginaConTestata[] {
  return Object.keys(DI_SERIE[motore]) as PaginaConTestata[];
}

export function testataDiSerie(pagina: PaginaConTestata, motore: MotoreTestate): TestataDiSerie | null {
  return DI_SERIE[motore][pagina] ?? null;
}

export const chiaveTestata = (pagina: PaginaConTestata): string => `testata_${pagina}`;

/** Quello che l'azienda ha scritto in un campo, pulito: null se non ha scritto niente. */
function scritto(valore: unknown, massimo: number): string | null {
  if (typeof valore !== "string") return null;
  // Niente caratteri di controllo (tranne l'a capo), niente righe vuote in fila.
  const pulito = Array.from(valore.replace(/\r\n?/g, "\n"))
    .filter((c) => c === "\n" || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
    .join("")
    .split("\n").map((r) => r.trim()).filter(Boolean).join("\n");
  if (!pulito) return null;
  return pulito.length > massimo ? `${pulito.slice(0, massimo - 1).trimEnd()}…` : pulito;
}

/** La testata di una pagina: quella di serie del motore con sopra i campi scritti dall'azienda. */
export function leggiTestata(pagina: PaginaConTestata, motore: MotoreTestate, salvati: unknown): TestataPagina {
  const base = testataDiSerie(pagina, motore) ?? { occhiello: "", titolo: null, intro: null };
  const tutti = salvati && typeof salvati === "object" ? (salvati as Record<string, unknown>) : {};
  const s = tutti[chiaveTestata(pagina)];
  const propria = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
  return {
    occhiello: scritto(propria.occhiello, LUNGHEZZA_TESTATA.occhiello) ?? base.occhiello,
    titolo: scritto(propria.titolo, LUNGHEZZA_TESTATA.titolo) ?? base.titolo,
    intro: scritto(propria.intro, LUNGHEZZA_TESTATA.intro) ?? base.intro,
  };
}

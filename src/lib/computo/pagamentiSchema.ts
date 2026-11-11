/**
 * Le rate del piano dei pagamenti nella bozza del computo. File a sé perché lo importa `editorNativo`,
 * che `economiaComputo.ts` usa.
 *
 * 11/11/2026 — il computo parla la lingua del resto del gestionale. Prima una rata aveva cinque momenti
 * suoi (`quando`: firma/inizio/sal/fine/collaudo), il SAL era un giorno di cantiere e il termine di
 * pagamento un intero fra cinque valori. Ora il momento è un EVENTO del cantiere come in
 * `lib/orders/rateEventi` (gli stessi che usano commesse e preventivatori edili), il SAL è un numero, e
 * si può dire anche «al 30% dei lavori» o «a completamento delle strutture».
 *
 * Due cose nuove che l'edilizia richiede e che non si potevano dire:
 *  · una rata A MISURA (`base: "avanzamento"`), senza percentuale: si fattura quello che risulta dal SAL,
 *    perché al momento del preventivo quell'importo non si conosce;
 *  · il TERMINE di pagamento vero («45 giorni data fattura fine mese»), con le stesse regole di
 *    `lib/terminiPagamento` che già si usano per gli ordini a fornitore.
 *
 * Le bozze scritte prima si leggono senza perdere niente: `rataSchema` converte i vecchi campi.
 */
import { z } from "zod";

/** I momenti in cui una rata di preventivo può scattare. I primi sei esistono già in `EVENTI_RATA`. */
export const MOMENTI_RATA = {
  firma_contratto: "Alla firma del contratto",
  inizio_lavori: "All'inizio dei lavori",
  merce_magazzino: "All'arrivo della merce",
  sal_numero: "Al SAL numero…",
  sal_percentuale: "Al raggiungimento di una percentuale di lavori",
  fase_completata: "A completamento di una fase",
  fine_lavori: "A fine lavori",
  collaudo: "Al collaudo / consegna",
} as const;
export type MomentoRata = keyof typeof MOMENTI_RATA;
export const MOMENTI_SAL: readonly MomentoRata[] = ["sal_numero", "sal_percentuale", "fase_completata"];

/** I vecchi `quando` della bozza del computo, e dove finiscono adesso. */
const MOMENTI_VECCHI: Record<string, MomentoRata> = {
  firma: "firma_contratto", inizio: "inizio_lavori", sal: "sal_numero", fine: "fine_lavori", collaudo: "collaudo",
};

/** I termini che si offrono nella tendina. Ci si può scrivere qualunque numero di giorni. */
export const TERMINI_RATA: readonly { giorni: number; fineMese: boolean }[] = [
  { giorni: 0, fineMese: false }, { giorni: 30, fineMese: false }, { giorni: 30, fineMese: true },
  { giorni: 45, fineMese: false }, { giorni: 45, fineMese: true }, { giorni: 60, fineMese: false },
  { giorni: 60, fineMese: true }, { giorni: 90, fineMese: false },
];

/** «A vista», «45 giorni data fattura», «60 giorni data fattura fine mese». */
export function testoTermine(giorni: number, fineMese: boolean): string {
  if (!giorni) return fineMese ? "fine mese" : "a vista";
  return `${giorni} giorni data fattura${fineMese ? " fine mese" : ""}`;
}

export const rataSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const r = { ...(raw as Record<string, unknown>) };
    if (r.evento == null && typeof r.quando === "string") r.evento = MOMENTI_VECCHI[r.quando] ?? "sal_numero";
    if (r.termineGiorni == null && r.giorniPagamento != null) r.termineGiorni = r.giorniPagamento;
    delete r.quando; delete r.giorniPagamento;
    return r;
  },
  z.object({
    id: z.string().max(80),
    /** Come si legge la rata nel documento («Acconto», «1° SAL»). */
    descrizione: z.string().max(200).default(""),
    /** Percentuale del totale, come la scrive l'utente («30», «12,5»). Vuota se la rata è a misura. */
    percentuale: z.string().max(20).default(""),
    /** `avanzamento`: l'importo non si conosce al preventivo, si fattura quello che risulta dal SAL. */
    base: z.enum(["percentuale", "avanzamento"]).default("percentuale"),
    evento: z.enum(Object.keys(MOMENTI_RATA) as [MomentoRata, ...MomentoRata[]]).default("sal_numero"),
    /** Per `sal_numero`: quale SAL. */
    numero: z.number().int().min(1).max(60).nullable().default(null),
    /** Per `sal_percentuale`: la percentuale di avanzamento che fa scattare la rata. */
    soglia: z.number().min(0).max(100).nullable().default(null),
    /** Per `fase_completata`: i nomi delle fasi (o dei capitoli) che devono essere finite. */
    fasi: z.array(z.string().max(200)).max(20).default([]),
    /** Il giorno lavorativo del cronoprogramma in cui si stima l'incasso: serve alla cassa, non al contratto. */
    giorno: z.number().int().min(1).max(2000).nullable().default(null),
    /** Giorni per pagare dopo la fattura (rimessa diretta = 0) e se si va a fine mese. */
    termineGiorni: z.number().int().min(0).max(365).default(0),
    termineFineMese: z.boolean().default(false),
  }),
);
export type Rata = z.output<typeof rataSchema>;

/** La ritenuta a garanzia: non è una rata, è una trattenuta su ogni pagamento che torna allo svincolo. */
export const ritenutaSchema = z.object({
  /** Percentuale trattenuta, come la scrive l'utente («5», «0,50»). Vuota = nessuna ritenuta. */
  percentuale: z.string().max(10).default(""),
  /** Su quali pagamenti si trattiene: solo i SAL, oppure tutti. */
  su: z.enum(["sal", "tutte"]).default("sal"),
  svincolo: z.enum(["collaudo", "mesi"]).default("collaudo"),
  /** Mesi dopo la fine lavori, quando lo svincolo non è legato al collaudo. */
  mesi: z.number().int().min(0).max(60).default(12),
});
export type RitenutaGaranzia = z.infer<typeof ritenutaSchema>;

export const pianoPagamentiSchema = z.object({
  rate: z.array(rataSchema).max(24).default([]),
  ritenuta: ritenutaSchema.prefault({}),
}).prefault({});

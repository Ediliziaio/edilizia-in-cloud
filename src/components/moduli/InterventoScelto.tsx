import type { SalesIntervention } from "@/lib/moduli-vendita/areas";

/**
 * Preventivo nato da un intervento della libreria: al posto del menu «Tipo di
 * intervento» (già deciso all'inizio) si mostra quale intervento è. Come Tetti.
 */
export function InterventoScelto({ intervento }: { intervento: SalesIntervention }) {
  // Telefono: solo il nome dell'intervento, senza la descrizione.
  return <div className="mt-1 rounded-lg border bg-muted/30 p-3 max-sm:py-2">
    <p className="font-medium">{intervento.title}</p>
    <p className="mt-1 text-xs text-muted-foreground max-sm:hidden">Intervento scelto all'inizio del preventivo. {intervento.summary}</p>
  </div>;
}

/**
 * Nel computo: le lavorazioni tipiche dell'intervento, come promemoria. Nessun importo.
 * Telefono no: è un promemoria, e sopra il computo spingeva le voci fuori schermo.
 */
export function LavorazioniDelModello({ intervento }: { intervento: SalesIntervention }) {
  return <section className="rounded-xl border bg-muted/20 p-4 max-sm:hidden" aria-label={`Lavorazioni per ${intervento.title}`}>
    <h3 className="text-sm font-semibold">{intervento.title}: componi le lavorazioni</h3>
    <p className="mt-1 text-xs text-muted-foreground">Aggiungi dal listino o inserisci una voce libera. Questo schema non aggiunge importi né quantità di esempio.</p>
    <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{intervento.fields.map((voce) => <li key={voce}>• {voce}</li>)}</ul>
  </section>;
}

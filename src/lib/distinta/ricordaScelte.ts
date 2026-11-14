/**
 * «Genera dal computo» impara dalle scelte (14/11/2026): quello che l'utente
 * conferma o toglie in una commessa vale per i computi dopo.
 *
 * - Una proposta dell'AI accesa e salvata è approvata: la scomposizione diventa
 *   attiva e la prossima volta vale come una dell'azienda («Sicuro»).
 * - Una scomposizione della libreria standard da cui l'utente ha tolto dei
 *   materiali (il paraspigolo che non usa, la striscia perimetrale) diventa una
 *   scomposizione dell'azienda senza quei materiali: le scomposizioni
 *   dell'azienda vengono prima della libreria.
 *
 * Si ricorda solo se qualcosa resta: se l'utente spegne tutti i materiali di una
 * voce (non li compra in questa commessa) non vuol dire che la voce non ne abbia.
 * Regole pure: il popup le mostra e, se l'utente lo vuole, le scrive.
 */
import { normalizzaTesto, type ComponenteScomposizione, type Scomposizione } from "./generaDistinta";
import type { MaterialeCollegato } from "./collegaArticoli";

export interface DaRicordareLibreria {
  standard: Scomposizione;
  tolti: string[];
  tenuti: ComponenteScomposizione[];
}

export interface SceltePerRicordare {
  approvaAI: { id: string; nome: string }[];
  libreria: DaRicordareLibreria[];
}

export function sceltePerRicordare(
  materiali: MaterialeCollegato[],
  accesa: (m: MaterialeCollegato) => boolean,
  libreria: Scomposizione[],
  proposteAI: Scomposizione[] = [],
): SceltePerRicordare {
  // Le proposte dell'AI accese: una per scomposizione.
  const ai = new Map<string, string>();
  for (const m of materiali) {
    if (!m.proposta_ai || !accesa(m) || !m.scomposizione_id) continue;
    ai.set(m.scomposizione_id, proposteAI.find((s) => s.id === m.scomposizione_id)?.nome ?? m.descrizione);
  }

  // Per ogni scomposizione della libreria usata: i suoi materiali accesi e spenti.
  const stato = new Map<string, Map<string, boolean>>();
  for (const m of materiali) {
    const k = normalizzaTesto(m.descrizione);
    for (const o of m.origini) {
      if (o.tipo !== "computo" || !o.standard) continue;
      const perComponente = stato.get(o.standard) ?? new Map<string, boolean>();
      // Basta una riga accesa perché il materiale resti.
      perComponente.set(k, (perComponente.get(k) ?? false) || accesa(m));
      stato.set(o.standard, perComponente);
    }
  }
  const daLibreria: DaRicordareLibreria[] = [];
  for (const [codice, perComponente] of stato) {
    const standard = libreria.find((s) => s.id === codice);
    if (!standard) continue;
    const tolti = standard.componenti.filter((c) => perComponente.get(normalizzaTesto(c.descrizione)) === false);
    const tenuti = standard.componenti.filter((c) => !tolti.includes(c));
    if (tolti.length && tenuti.length) daLibreria.push({ standard, tolti: tolti.map((c) => c.descrizione), tenuti });
  }
  return { approvaAI: [...ai].map(([id, nome]) => ({ id, nome })), libreria: daLibreria };
}

/** «Approva 1 proposta dell'AI · Intonaco premiscelato (1,5 cm) senza Paraspigolo». */
export function testoRicordi(r: SceltePerRicordare): string[] {
  return [
    ...r.approvaAI.map((a) => `Approva la proposta dell'AI «${a.nome}»`),
    ...r.libreria.map((l) => `«${l.standard.nome}» senza ${l.tolti.join(", ")}`),
  ];
}

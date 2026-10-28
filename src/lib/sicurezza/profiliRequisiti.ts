import { nuovoCriterioItp, type CriterioItp } from "./itp";
import { voceCatalogo } from "./catalogoDocumenti";
import { MAX_CRITERI_ITP, destinatarioCriterio } from "./soggettiItp";
export interface RequisitoProfilo {
  id: string;
  titolo: string;
  catalogo_id: string | null;
  catalogo_versione: number | null;
  riferimento: string;
  indicazioni: string;
}
export interface DatiProfiloRequisiti {
  nome: string;
  attivita: string;
  ruoli: string;
  limiti: string;
  criteri: RequisitoProfilo[];
  testi_generici: boolean;
}
export interface ProfiloRequisiti extends Omit<
  DatiProfiloRequisiti,
  "testi_generici"
> {
  id: string;
  company_id: string;
  famiglia_id: string;
  versione: number;
  precedente_id: string | null;
  creato_da: string;
  creato_il: string;
  archiviato: boolean;
}
export interface ProfiloSnapshot {
  id: string;
  famiglia_id: string;
  versione: number;
  nome: string;
  attivita: string;
  ruoli: string;
  limiti: string;
  requisito: RequisitoProfilo;
}
export function nuovoRequisitoProfilo(): RequisitoProfilo {
  return {
    id: crypto.randomUUID(),
    titolo: "",
    catalogo_id: null,
    catalogo_versione: null,
    riferimento: "",
    indicazioni: "",
  };
}
export function datiProfiloVuoto(): DatiProfiloRequisiti {
  return {
    nome: "",
    attivita: "",
    ruoli: "",
    limiti: "",
    criteri: [],
    testi_generici: false,
  };
}
export function erroreProfilo(d: DatiProfiloRequisiti): string | null {
  if (
    !d.nome.trim() ||
    d.nome.trim().length > 120 ||
    !d.attivita.trim() ||
    !d.ruoli.trim() ||
    !d.limiti.trim()
  )
    return "Indica nome, attività, ruoli e limiti del profilo.";
  if (!d.testi_generici)
    return "Conferma che i testi siano generici e riutilizzabili.";
  if (!d.criteri.length || d.criteri.length > 50)
    return "Definisci da 1 a 50 criteri.";
  if ([d.attivita, d.ruoli, d.limiti].some((x) => x.length > 4000))
    return "Riduci attività, ruoli e limiti a 4000 caratteri ciascuno.";
  const ids = new Set<string>();
  for (const c of d.criteri) {
    if (
      !c.id ||
      ids.has(c.id) ||
      !c.titolo.trim() ||
      c.titolo.length > 300 ||
      c.riferimento.length > 1000 ||
      c.indicazioni.length > 2000
    )
      return "Controlla titoli, riferimenti e indicazioni dei criteri.";
    ids.add(c.id);
    if (c.catalogo_id) {
      const v = voceCatalogo(c.catalogo_id, c.catalogo_versione);
      if (!v || v.destinazione !== "sicurezza" || v.titolo !== c.titolo)
        return "Voce del catalogo non disponibile per la sicurezza o titolo non coerente.";
    }
  }
  return null;
}
/** Selected versions are copied as unreviewed criteria. No people, decisions or files are reused. */
export function criteriDaProfilo(p: ProfiloRequisiti): CriterioItp[] {
  return p.criteri.map((r) => ({
    ...nuovoCriterioItp(),
    titolo: r.titolo,
    catalogo_id: r.catalogo_id,
    catalogo_versione: r.catalogo_versione,
    destinatario: destinatarioCriterio({
      ...nuovoCriterioItp(),
      catalogo_id: r.catalogo_id,
      catalogo_versione: r.catalogo_versione,
    }),
    riferimento: r.riferimento,
    profilo_id: p.id,
    profilo_versione: p.versione,
    requisito_id: r.id,
    profilo_snapshot: {
      id: p.id,
      famiglia_id: p.famiglia_id,
      versione: p.versione,
      nome: p.nome,
      attivita: p.attivita,
      ruoli: p.ruoli,
      limiti: p.limiti,
      requisito: { ...r },
    },
  }));
}
export function erroreCaricamentoProfilo(
  p: ProfiloRequisiti,
  criteri: readonly CriterioItp[],
): string | null {
  if (p.archiviato) return "Questa versione è archiviata.";
  if (criteri.some((c) => c.profilo_id === p.id))
    return "Questa versione del profilo è già inclusa.";
  if (criteri.length + p.criteri.length > MAX_CRITERI_ITP)
    return "Il caricamento supererebbe i 500 criteri.";
  return null;
}
export function cercaProfili(p: readonly ProfiloRequisiti[], testo: string) {
  const parole = testo.toLocaleLowerCase("it").split(/\s+/).filter(Boolean);
  return p.filter((p) =>
    parole.every((x) =>
      `${p.nome} ${p.attivita} ${p.ruoli} ${p.limiti}`
        .toLocaleLowerCase("it")
        .includes(x),
    ),
  );
}

/** A newer or archived reference invites review; it never rewrites the recorded verdict. */
export function avvisiProfili(
  criteri: readonly CriterioItp[],
  profili: readonly ProfiloRequisiti[],
): string[] {
  const avvisi = new Set<string>();
  for (const c of criteri) {
    const s = c.profilo_snapshot;
    if (!s) continue;
    const corrente = profili.find((p) => p.id === s.id);
    if (!corrente) {
      avvisi.add(
        `Profilo di riferimento non disponibile: ${s.nome} v${s.versione}.`,
      );
      continue;
    }
    if (corrente.archiviato)
      avvisi.add(
        `La versione di riferimento è stata archiviata: ${s.nome} v${s.versione}.`,
      );
    if (
      profili.some(
        (p) => p.famiglia_id === s.famiglia_id && p.versione > s.versione,
      )
    )
      avvisi.add(
        `Esiste una versione successiva del profilo ${s.nome}: riesamina i requisiti del caso.`,
      );
  }
  return [...avvisi];
}

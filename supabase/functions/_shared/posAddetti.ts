import type { RigaFormazione } from "./posModello.ts";
/** Stable internal identities for POS preparation. No name matching or global user profiles. */
type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nome = (r: Row) =>
  [s(r.nome ?? r.first_name), s(r.cognome ?? r.last_name)]
    .filter(Boolean)
    .join(" ");
export interface AddettoProprioPos {
  chiave: string;
  nome: string;
  qualifica: string;
  hrId: string | null;
  nota: string;
}
export function risolviAddettiPropriPos(
  employees: Row[],
  campo: Row[],
  profili: Row[],
  dipendentiAssegnati: readonly string[] = employees.map((e) => s(e.id)),
) {
  const hr = [
    ...new Map(
      profili.filter((h) => s(h.id)).map((h) => [s(h.id), h]),
    ).values(),
  ];
  const persone = new Map<string, AddettoProprioPos>();
  const avvisi: string[] = [];
  const interni = employees.filter(
    (e) => e.role_type !== "subappaltatore" && e.role_type !== "subcontractor",
  );
  const esterni = new Set(
    employees.filter((e) => !interni.includes(e)).map((e) => s(e.id)),
  );
  const ammessi = hr.filter((h) => !esterni.has(s(h.employee_id)));
  const unico = (candidati: Row[]) =>
    candidati.length === 1 ? candidati[0] : null;
  const aggiungi = (p: AddettoProprioPos) => {
    if (p.nome && !persone.has(p.chiave)) persone.set(p.chiave, p);
  };
  for (const e of interni.filter((e) =>
    dipendentiAssegnati.includes(s(e.id)),
  )) {
    const diretti = ammessi.filter((h) => h.employee_id === e.id);
    const candidati = diretti.length
      ? diretti
      : ammessi.filter(
          (h) => s(e.user_id) && h.user_id === e.user_id && !s(h.employee_id),
        );
    const h = unico(candidati);
    if (!h)
      avvisi.push(
        `${nome(e) || "Dipendente"}: ${candidati.length > 1 ? "collegamento HR ambiguo" : "profilo HR da collegare"}; attestati non attribuiti automaticamente.`,
      );
    aggiungi({
      chiave: h ? `hr:${s(h.id)}` : `employee:${s(e.id)}`,
      nome: nome(e),
      qualifica: s(e.qualifica) || s(h?.mansione) || s(e.livello_inquadramento),
      hrId: h ? s(h.id) : null,
      nota: [
        e.formazione_sicurezza_completed === true
          ? "Indicazione HR storica di formazione completata: da verificare per il cantiere"
          : "",
        e.formazione_sicurezza_scadenza
          ? `scadenza HR ${s(e.formazione_sicurezza_scadenza)}`
          : "",
      ]
        .filter(Boolean)
        .join("; "),
    });
  }
  for (const c of campo) {
    if (
      c.role_type &&
      !["employee", "operaio", "capocantiere"].includes(s(c.role_type))
    )
      continue;
    const collegati = interni.filter(
      (e) => s(c.user_id) && e.user_id === c.user_id,
    );
    const candidati = ammessi.filter(
      (h) =>
        s(c.user_id) &&
        (h.user_id === c.user_id ||
          collegati.some((e) => e.id === h.employee_id)),
    );
    const h = unico(candidati);
    if (!h) {
      avvisi.push(
        `Assegnazione Campo: ${candidati.length > 1 ? "collegamento HR ambiguo" : "anagrafica aziendale da collegare"}; nessun nome recuperato dall’elenco utenti globale.`,
      );
      if (collegati.length === 1 && !candidati.length) {
        const e = collegati[0];
        aggiungi({
          chiave: `employee:${s(e.id)}`,
          nome: nome(e),
          qualifica: s(e.qualifica),
          hrId: null,
          nota: "",
        });
      }
      continue;
    }
    aggiungi({
      chiave: `hr:${s(h.id)}`,
      nome: nome(h),
      qualifica:
        s(h.mansione) || (c.is_capocantiere ? "Capocantiere" : "Operaio"),
      hrId: s(h.id),
      nota: "",
    });
  }
  if (esterni.size)
    avvisi.push(
      "Anagrafiche esterne legacy escluse dall’organico della propria impresa: riconciliale nel fascicolo del subappaltatore.",
    );
  return { persone: [...persone.values()], avvisi };
}

/** A renamed manual row must not keep another person's documentary references or judgements. */
export function cambiaNominativoFormazione(
  riga: RigaFormazione,
  nominativo: string,
): RigaFormazione {
  return {
    qualifica: riga.qualifica,
    nominativo,
    attestati: "",
    altro: "",
    base: false,
    rischi_specifici: false,
    rischi_cantiere: false,
    dpi_terza_categoria: false,
    verificata: false,
  };
}

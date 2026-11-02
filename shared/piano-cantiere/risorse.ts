/**
 * Chi e con che cosa, fase per fase (2/11/2026): solo persone e mezzi veri, liberi nelle date
 * della fase. Se le persone libere non bastano lo dice: non assegna nessuno da solo.
 */
import { personaOccupata, mezzoOccupato, type ContestoRisorse } from "../silvio-commessa/risorse.ts";
import { piuSimili } from "../silvio-commessa/somiglianza.ts";
import type { PianoCantiere } from "./calcolo.ts";

export interface PersonaFase {
  employee_id: string; nome: string; fase: string; faseId?: string | null; dal: string | null; al: string | null; motivo: string;
  /** Già assegnata a questa commessa: non si assegna di nuovo. */
  gia?: boolean;
}
export interface MezzoFase { mezzo_id: string; nome: string; fase: string; dal: string | null; al: string | null; motivo: string }
export interface RisorsePiano {
  persone: PersonaFase[];
  mezzi: MezzoFase[];
  mancano: { fase: string; persone: number; specialisti?: boolean }[];
  /** Fasi per cui di solito serve un mezzo che l'azienda non ha libero. */
  mezziMancanti: { fase: string; cosa: string }[];
}

/** Persone di cantiere: fuori ufficio e ditte. Il ruolo è libero, quindi si escludono solo questi. */
const FUORI_CANTIERE = new Set(["staff_interno", "impiegato", "subappaltatore"]);

/**
 * Che mezzo serve di solito per una lavorazione. È un punto di partenza, modificabile
 * dall'azienda scegliendo un altro mezzo: lo storico dell'azienda viene sempre prima.
 */
const MEZZI_DI_SOLITO: ReadonlyArray<{ fase: RegExp; mezzo: RegExp; cosa: string }> = [
  { fase: /demoli|scav|sbanc/i, mezzo: /escavat|miniescav|demolitor|martell|cassone/i, cosa: "un mezzo per demolizioni o scavi" },
  { fase: /facciat|cappott|tett|copertur|intonac|ponteg/i, mezzo: /ponteg|trabatt|piattaform|sollevat/i, cosa: "un ponteggio o un sollevatore" },
  { fase: /murar|massett|gett|calcestr/i, mezzo: /betonier|impastatr|pompa/i, cosa: "una betoniera" },
  { fase: /serrament|infiss|posa|impiant|finitur/i, mezzo: /furgon|ducato|daily|transit/i, cosa: "un furgone" },
];

/** Questi lavori non si danno al primo libero: serve chi lo fa di mestiere, o una ditta. */
const LAVORO_DA_SPECIALISTI = /impiant|elettric|idraul|termo/i;

export function risorsePerPiano(
  piano: PianoCantiere, ctx: ContestoRisorse,
  ruoli: ReadonlyMap<string, { role_type: string | null; area: string | null }>,
  assegnati: readonly { employee_id: string; fase: string | null }[] = [],
): RisorsePiano {
  const adatta = (id: string) => {
    const r = ruoli.get(id);
    return !FUORI_CANTIERE.has(String(r?.role_type ?? "").toLowerCase()) && (r?.area == null || r.area === "cantiere");
  };
  const attivi = ctx.dipendenti.filter((d) => d.attivo && adatta(d.id));
  const nome = (id: string) => ctx.dipendenti.find((d) => d.id === id)?.nome ?? "Dipendente";
  const storico = ctx.storicoDipendenti.map((s) => ({ id: s.employee_id, nome: s.fase }));
  const persone: PersonaFase[] = [];
  const mancano: RisorsePiano["mancano"] = [];
  const giaNelCantiere = new Set<string>();

  for (const f of piano.fasi) {
    if (!f.operaiNecessari) continue;
    // Le date del piano sono una proposta: deve essere libera anche in quelle vere della commessa.
    const libera = (id: string) => !personaOccupata(ctx, id, f.dal, f.al) && !personaOccupata(ctx, id, f.dalInCommessa, f.alInCommessa);
    // Chi è già su questa fase, o sulla commessa senza una fase, conta fra quelli che servono.
    const gia = assegnati.filter((a) => a.fase === f.nome || a.fase === null).map((a) => a.employee_id);
    const scelti: { id: string; motivo: string; gia?: boolean }[] = [...new Set(gia)].slice(0, f.operaiNecessari).map((id) => ({ id, motivo: "è già assegnato a questa commessa", gia: true }));
    const simili = piuSimili(f.nome, storico).filter((c) => attivi.some((d) => d.id === c.id) && libera(c.id) && !scelti.some((s) => s.id === c.id));
    for (const c of simili) {
      if (scelti.length >= f.operaiNecessari) break;
      scelti.push({ id: c.id, motivo: `ha fatto ${c.volte === 1 ? "una fase simile" : `${c.volte} fasi simili`}` });
    }
    // Poi chi è già sul cantiere per un'altra fase, poi chiunque sia libero: senza fingere esperienza.
    const specialisti = LAVORO_DA_SPECIALISTI.test(f.nome);
    const altri = attivi.filter((d) => !scelti.some((s) => s.id === d.id) && libera(d.id)
      && (!specialisti || LAVORO_DA_SPECIALISTI.test(String(ruoli.get(d.id)?.role_type ?? ""))))
      .sort((a, b) => Number(giaNelCantiere.has(b.id)) - Number(giaNelCantiere.has(a.id)) || a.nome.localeCompare(b.nome));
    for (const d of altri) {
      if (scelti.length >= f.operaiNecessari) break;
      scelti.push({ id: d.id, motivo: giaNelCantiere.has(d.id) ? "è già su questo cantiere" : "è libero in queste date" });
    }
    for (const s of scelti) {
      giaNelCantiere.add(s.id);
      persone.push({ employee_id: s.id, nome: nome(s.id), fase: f.nome, faseId: f.id ?? null, dal: f.dal, al: f.al, motivo: s.motivo, gia: s.gia });
    }
    if (scelti.length < f.operaiNecessari) mancano.push({ fase: f.nome, persone: f.operaiNecessari - scelti.length, specialisti: specialisti || undefined });
  }

  const mezzi: MezzoFase[] = [];
  const mezziMancanti: RisorsePiano["mezziMancanti"] = [];
  const utilizzabili = ctx.mezzi.filter((m) => m.stato !== "fuori_servizio");
  const storicoMezzi = ctx.storicoMezzi.map((s) => ({ id: s.mezzo_id, nome: s.fase }));
  for (const f of piano.fasi) {
    if (!f.dal || !f.giorni || f.ditta) continue;
    const libero = (id: string) => !mezzoOccupato(ctx, id, f.dal, f.al);
    const dalloStorico = piuSimili(f.nome, storicoMezzi).find((c) => utilizzabili.some((m) => m.id === c.id) && libero(c.id));
    if (dalloStorico) {
      const m = utilizzabili.find((x) => x.id === dalloStorico.id)!;
      mezzi.push({ mezzo_id: m.id, nome: m.nome, fase: f.nome, dal: f.dal, al: f.al, motivo: "usato in lavori simili" });
      continue;
    }
    const regola = MEZZI_DI_SOLITO.find((r) => r.fase.test(f.nome));
    if (!regola) continue;
    const adatti = utilizzabili.filter((m) => regola.mezzo.test(m.nome));
    const m = adatti.find((x) => libero(x.id));
    if (m) mezzi.push({ mezzo_id: m.id, nome: m.nome, fase: f.nome, dal: f.dal, al: f.al, motivo: "di solito serve per questo lavoro" });
    else mezziMancanti.push({ fase: f.nome, cosa: regola.cosa });
  }
  return { persone, mezzi, mancano, mezziMancanti };
}

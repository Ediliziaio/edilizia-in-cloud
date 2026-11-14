/**
 * L'elenco dei materiali proposti da «Genera dal computo» (14/11/2026, ridisegno).
 *
 * Una riga per materiale, alta come una riga di tabella: spunta, materiale con la
 * specifica e la voce da cui viene, quantità d'acquisto (le confezioni, con i kg o
 * i litri sotto), articolo o listino collegato col fornitore, prezzo, totale e la
 * sicurezza come pallino (fonte e note nel suggerimento). I gruppi sono le fasi,
 * con spunta, numero, collegati e totale. Sopra, i filtri come pastiglie.
 *
 * L'articolo si cambia nella riga stessa: si apre sotto un pannello con gli
 * abbinamenti possibili (col perché), la ricerca nel catalogo e «Nessun articolo».
 * Niente Popover: dentro un Dialog il cursore e l'Esc litigano (vedi memoria
 * «Tendine in uno Sheet»).
 */
import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, Box, ChevronDown, Link2, Plus, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ETICHETTA_FONTE_MATERIALE, normalizzaTesto, type OrigineRiga } from "@/lib/distinta/generaDistinta";
import {
  articoloDaMateriale, prezzoRiga, quantitaAcquisto,
  type ArticoloCatalogo, type Collegamento, type MaterialeCollegato, type SceltaArticolo, type VoceListino,
} from "@/lib/distinta/collegaArticoli";

export type FiltroMateriali = "tutti" | "da_controllare" | "senza_articolo" | "senza_prezzo" | "in_magazzino";

const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

function filtraMateriali(m: MaterialeCollegato, f: FiltroMateriali, avvisi?: Map<string, string>): boolean {
  if (f === "da_controllare") return m.affidabilita < 0.65 || !!avvisi?.has(m.chiave);
  if (f === "senza_articolo") return !m.collegamento;
  if (f === "senza_prezzo") return !prezzoRiga(m);
  if (f === "in_magazzino") return !!m.magazzino;
  return true;
}

const ETICHETTE_FILTRO: Record<FiltroMateriali, string> = {
  tutti: "Tutti", da_controllare: "Da controllare", senza_articolo: "Senza articolo", senza_prezzo: "Senza prezzo", in_magazzino: "In magazzino",
};

function Sicurezza({ m }: { m: MaterialeCollegato }) {
  const v = m.affidabilita;
  const [testo, colore] = v >= 0.85 ? ["Sicuro", "bg-emerald-500"] : v >= 0.65 ? ["Probabile", "bg-sky-500"] : ["Da controllare", "bg-amber-500"];
  const dettagli = [`${testo} ${Math.round(v * 100)}%`, ETICHETTA_FONTE_MATERIALE[m.fonte], ...m.note].join("\n");
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] tabular-nums text-slate-600" title={dettagli} aria-label={`${testo} ${Math.round(v * 100)}%`}>
      <span className={cn("h-2 w-2 rounded-full", colore)} aria-hidden />{Math.round(v * 100)}%
    </span>
  );
}

function provenienza(origini: OrigineRiga[]): { breve: string; tutte: string } {
  const etichetta = (o: OrigineRiga) => o.tipo === "computo"
    ? `${o.codice ? `${o.codice} · ` : ""}${o.descrizione} (${o.quantita_voce.toLocaleString("it-IT")} ${o.unita_voce ?? ""})`.replace(/ \)$/, ")")
    : `Tavola ${o.documento ?? ""} · ${o.simbolo}${o.locale ? ` · ${o.locale}` : ""}`;
  const prima = origini[0];
  if (!prima) return { breve: "", tutte: "" };
  return { breve: `da ${etichetta(prima)}${origini.length > 1 ? ` e altre ${origini.length - 1}` : ""}`, tutte: origini.map(etichetta).join("\n") };
}

/** «Listino Primavera 2026», ma «Listino» se il listino si chiama già così (Demo 2: «Listino Listino»). */
const nomeListino = (nome: string | null | undefined) => !nome?.trim() ? "Listino" : /^listino\b/i.test(nome.trim()) ? nome.trim() : `Listino ${nome.trim()}`;

function nomeCollegamento(c: Collegamento, fornitori: Map<string, string>): { nome: string; sotto: string } {
  const fornitore = c.supplier_id ? fornitori.get(c.supplier_id) : null;
  const dove = c.tipo === "listino" ? [nomeListino(c.listino), fornitore].filter(Boolean).join(" · ") : fornitore ?? "Catalogo";
  return { nome: c.nome, sotto: dove };
}

/** Il pannello sotto la riga: abbinamenti possibili, ricerca nel catalogo, nessun articolo. */
function SceltaArticoloRiga({ m, articoli, listini, fornitori, mostraPrezzi, onScegli, onChiudi, onAggiungiAlCatalogo }: {
  m: MaterialeCollegato; articoli: ArticoloCatalogo[]; listini: VoceListino[]; fornitori: Map<string, string>; mostraPrezzi: boolean;
  onScegli: (s: SceltaArticolo) => void; onChiudi: () => void;
  onAggiungiAlCatalogo?: (m: MaterialeCollegato) => Promise<string | null>;
}) {
  const [aggiungo, setAggiungo] = useState(false);
  const [cerca, setCerca] = useState("");
  const trovati = useMemo(() => {
    const t = normalizzaTesto(cerca);
    if (t.length < 2) return [];
    const parole = t.split(" ");
    const ok = (testo: string) => { const n = normalizzaTesto(testo); return parole.every((p) => n.includes(p)); };
    return [
      ...articoli.filter((a) => ok(`${a.name} ${a.sku ?? ""} ${a.marca ?? ""} ${a.modello ?? ""}`)).slice(0, 6)
        .map((a) => ({ tipo: "articolo" as const, id: a.id, nome: a.name, sotto: (a.supplier_id && fornitori.get(a.supplier_id)) || "Catalogo", unita: a.unit_of_measure ?? null, prezzo: Number(a.prezzo_acquisto_netto) || Number(a.standard_cost) || null })),
      ...listini.filter((l) => ok(`${l.descrizione} ${l.codice ?? ""}`)).slice(0, 6)
        .map((l) => ({ tipo: "listino" as const, id: l.id, nome: l.descrizione, sotto: [nomeListino(l.listino), l.supplier_id ? fornitori.get(l.supplier_id) : null].filter(Boolean).join(" · "), unita: l.unita ?? null,
          prezzo: Number(l.prezzo) > 0 ? Math.round(Number(l.prezzo) * (1 - (Number(l.sconto_pct) || 0) / 100) * 100) / 100 : null })),
    ];
  }, [cerca, articoli, listini, fornitori]);
  const attuale = m.collegamento ? `${m.collegamento.tipo}:${m.collegamento.id}` : null;
  const Voce = ({ id, tipo, nome, sotto, motivo, prezzo, unita }: { id: string; tipo: "articolo" | "listino"; nome: string; sotto: string; motivo?: string; prezzo: number | null; unita: string | null }) => (
    <li>
      <button type="button" onClick={() => onScegli({ tipo, id })}
        className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-100", attuale === `${tipo}:${id}` && "bg-emerald-50 ring-1 ring-emerald-200")}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-slate-900">{nome}</span>
          <span className="block truncate text-[11px] text-slate-500">{[sotto, motivo].filter(Boolean).join(" · ")}</span>
        </span>
        {mostraPrezzi && prezzo ? <span className="shrink-0 text-[11px] tabular-nums text-slate-700">{euro(prezzo)}{unita ? `/${unita}` : ""}</span> : null}
      </button>
    </li>
  );
  return (
    <div className="space-y-2 rounded-md border bg-white p-2 shadow-sm" data-scelta-articolo={m.descrizione}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-700">Articolo per «{m.descrizione}»</span>
        <button type="button" onClick={onChiudi} className="ml-auto rounded p-0.5 text-slate-500 hover:bg-slate-100" aria-label="Chiudi la scelta dell'articolo"><X className="h-3.5 w-3.5" /></button>
      </div>
      {m.candidati.length > 0 ? (
        <ul className="space-y-0.5" aria-label="Abbinamenti possibili">
          {m.candidati.map((c) => {
            const n = nomeCollegamento(c.collegamento, fornitori);
            return <Voce key={`${c.collegamento.tipo}:${c.collegamento.id}`} tipo={c.collegamento.tipo} id={c.collegamento.id} nome={n.nome} sotto={n.sotto} motivo={c.motivo} prezzo={c.collegamento.prezzo} unita={c.collegamento.unita} />;
          })}
        </ul>
      ) : <p className="text-[11px] text-slate-500">Nessun articolo o listino che gli somigli: cercalo qui sotto.</p>}
      <label className="flex items-center gap-1.5 rounded border px-2">
        <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nel catalogo e nei listini…" aria-label="Cerca un articolo"
          className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onChiudi(); } }} />
      </label>
      {trovati.length > 0 && <ul className="max-h-48 space-y-0.5 overflow-auto" aria-label="Risultati della ricerca">{trovati.map((t) => <Voce key={`${t.tipo}:${t.id}`} {...t} />)}</ul>}
      {cerca.trim().length >= 2 && !trovati.length && <p className="text-[11px] text-slate-500">Niente nel catalogo con «{cerca.trim()}».</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {onAggiungiAlCatalogo && (
          <button type="button" disabled={aggiungo} className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 underline-offset-2 hover:underline disabled:opacity-60"
            onClick={async () => {
              setAggiungo(true);
              const id = await onAggiungiAlCatalogo(m);
              setAggiungo(false);
              if (id) onScegli({ tipo: "articolo", id });
            }}>
            <Plus className="h-3 w-3" aria-hidden />{aggiungo ? "Aggiungo…" : `Aggiungi «${articoloDaMateriale(m).name}» al catalogo`}
          </button>
        )}
        <button type="button" onClick={() => onScegli({ tipo: "nessuno" })} className="text-[11px] font-medium text-slate-600 underline-offset-2 hover:underline">Nessun articolo: lo scelgo dopo</button>
      </div>
    </div>
  );
}

export function MaterialiProposti({
  materiali, accesa, setAccese, perFase, nomeFase, articoli, listini, fornitori, mostraPrezzi, onScegliArticolo, onAggiungiAlCatalogo, avvisiCosto,
}: {
  materiali: MaterialeCollegato[];
  accesa: (m: MaterialeCollegato) => boolean;
  setAccese: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void;
  perFase: [string, MaterialeCollegato[]][];
  nomeFase: (id: string) => string;
  articoli: ArticoloCatalogo[];
  listini: VoceListino[];
  fornitori: Map<string, string>;
  mostraPrezzi: boolean;
  onScegliArticolo: (chiave: string, s: SceltaArticolo) => void;
  /** Crea l'articolo nel catalogo e ne restituisce l'id (null se non riesce). */
  onAggiungiAlCatalogo?: (m: MaterialeCollegato) => Promise<string | null>;
  /** Materiali (chiave) le cui voci costano meno dei loro materiali: quantità o resa da controllare. */
  avvisiCosto?: Map<string, string>;
}) {
  const [filtro, setFiltro] = useState<FiltroMateriali>("tutti");
  const [aperta, setAperta] = useState<string | null>(null);
  const [chiuse, setChiuse] = useState<Record<string, boolean>>({});
  const conteggi = useMemo(() => Object.fromEntries((Object.keys(ETICHETTE_FILTRO) as FiltroMateriali[])
    .map((f) => [f, materiali.filter((m) => filtraMateriali(m, f, avvisiCosto)).length])) as Record<FiltroMateriali, number>, [materiali, avvisiCosto]);
  const accesi = materiali.filter(accesa);
  const tuttiAccesi = !!materiali.length && accesi.length === materiali.length;
  const colonne = mostraPrezzi ? 7 : 5;

  return (
    <section aria-label="Materiali che entrano" className="text-sm">
      <div className="sticky top-0 z-10 -mx-5 flex flex-wrap items-center gap-1.5 border-b bg-white/95 px-5 py-2 backdrop-blur">
        <label className="mr-1 flex items-center gap-1.5 text-xs font-medium">
          <input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" aria-label="Seleziona tutti i materiali" checked={tuttiAccesi}
            ref={(el) => { if (el) el.indeterminate = accesi.length > 0 && !tuttiAccesi; }}
            onChange={(e) => { const si = e.target.checked; setAccese(() => Object.fromEntries(materiali.map((r) => [r.chiave, si]))); }} />
          {accesi.length === materiali.length ? `${materiali.length} materiali` : `${accesi.length} su ${materiali.length}`}
        </label>
        {(Object.keys(ETICHETTE_FILTRO) as FiltroMateriali[]).filter((f) => f === "tutti" || conteggi[f] > 0)
          .filter((f) => mostraPrezzi || f !== "senza_prezzo")
          .map((f) => (
            <button key={f} type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f}
              className={cn("rounded-full border px-2 py-0.5 text-[11px] tabular-nums transition-colors",
                filtro === f ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                f === "da_controllare" && filtro !== f && "border-amber-200 bg-amber-50 text-amber-900")}>
              {ETICHETTE_FILTRO[f]} {conteggi[f]}
            </button>
          ))}
      </div>

      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col className="w-7" /><col /><col className="w-28" /><col className="w-56" />
          {mostraPrezzi && <><col className="w-24" /><col className="w-24" /></>}
          <col className="w-14" />
        </colgroup>
        <thead className="text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th /><th className="py-1.5 text-left font-medium">Materiale</th><th className="text-right font-medium">Da ordinare</th>
            <th className="pl-3 text-left font-medium">Articolo · fornitore</th>
            {mostraPrezzi && <><th className="text-right font-medium">Prezzo</th><th className="text-right font-medium">Totale</th></>}
            <th className="text-right font-medium" title="Quanto è sicura la proposta">Sic.</th>
          </tr>
        </thead>
        {perFase.map(([fase, tutte]) => {
          const righe = tutte.filter((m) => filtraMateriali(m, filtro, avvisiCosto));
          if (!righe.length) return null;
          const chiusa = !!chiuse[fase];
          const totaleFase = tutte.filter(accesa).reduce((s, m) => s + (prezzoRiga(m)?.totale ?? 0), 0);
          const collegati = tutte.filter((m) => m.collegamento).length;
          return (
            <tbody key={fase} className="border-t">
              <tr className="bg-slate-50">
                <td className="py-1.5 pl-1">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" aria-label={`Seleziona i materiali di ${nomeFase(fase)}`}
                    checked={tutte.every(accesa)} ref={(el) => { if (el) el.indeterminate = tutte.some(accesa) && !tutte.every(accesa); }}
                    onChange={(e) => { const si = e.target.checked; setAccese((a) => ({ ...a, ...Object.fromEntries(tutte.map((r) => [r.chiave, si])) })); }} />
                </td>
                <td colSpan={colonne - 1} className="py-1.5">
                  <button type="button" onClick={() => setChiuse((c) => ({ ...c, [fase]: !chiusa }))} aria-expanded={!chiusa}
                    className="flex w-full items-center gap-2 text-left">
                    <ChevronDown className={cn("h-3.5 w-3.5 text-slate-500 transition-transform", chiusa && "-rotate-90")} aria-hidden />
                    <span className="font-semibold text-slate-900">{nomeFase(fase)}</span>
                    <span className="text-slate-500">· {tutte.filter(accesa).length}{tutte.some((r) => !accesa(r)) ? ` su ${tutte.length}` : ""}</span>
                    <span className="text-[11px] text-slate-500">· collegati {collegati}/{tutte.length}</span>
                    {mostraPrezzi && totaleFase > 0 && <span className="ml-auto pr-14 tabular-nums font-medium text-slate-700">{euro(totaleFase)}</span>}
                  </button>
                </td>
              </tr>
              {!chiusa && righe.map((m) => {
                const p = provenienza(m.origini);
                const q = quantitaAcquisto(m);
                const prezzo = prezzoRiga(m);
                const c = m.collegamento ? nomeCollegamento(m.collegamento, fornitori) : null;
                const on = accesa(m);
                return (
                  <Fragment key={m.chiave}>
                    <tr className={cn("border-t border-slate-100 align-top hover:bg-slate-50/60", !on && "opacity-50")} data-materiale={m.descrizione}>
                      <td className="py-1.5 pl-1">
                        <Checkbox checked={on} aria-label={`Includi ${m.descrizione}`} onCheckedChange={(v) => setAccese((a) => ({ ...a, [m.chiave]: v === true }))} />
                      </td>
                      <td className="min-w-0 py-1.5 pr-2">
                        <p className="truncate" title={[m.descrizione, m.specifiche].filter(Boolean).join(" · ")}>
                          <span className="font-medium text-slate-900">{m.descrizione}</span>
                          {m.specifiche && <span className="text-slate-500"> · {m.specifiche}</span>}
                        </p>
                        <p className="truncate text-[11px] text-slate-500" title={p.tutte}>{p.breve}</p>
                        {m.note.map((n) => <p key={n} className="truncate text-[11px] text-slate-500" title={n}>{n}</p>)}
                        {avvisiCosto?.get(m.chiave) && (
                          <p className="flex items-center gap-1 text-[11px] font-medium text-amber-800" title={avvisiCosto.get(m.chiave)}>
                            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{avvisiCosto.get(m.chiave)}</span>
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        <span className="font-medium text-slate-900">{num(q.quantita)} {q.unita}</span>
                        {m.conversione
                          ? <span className="block text-[11px] text-slate-500" title={m.conversione.comune ? "Confezione d'uso comune: cambia scegliendo l'articolo" : m.conversione.testo}>{num(m.quantita_calcolata)} {m.unita_misura}{m.conversione.comune ? " · uso comune" : ""}</span>
                          : m.sfrido ? <span className="block text-[11px] text-slate-400">+{m.sfrido}% sfrido</span> : null}
                      </td>
                      <td className="min-w-0 py-1.5 pl-3">
                        <button type="button" onClick={() => setAperta(aperta === m.chiave ? null : m.chiave)} aria-expanded={aperta === m.chiave}
                          aria-label={c ? `Cambia l'articolo di ${m.descrizione}` : `Scegli l'articolo di ${m.descrizione}`}
                          className={cn("group flex w-full min-w-0 items-start gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100",
                            !c && "border border-dashed border-slate-300 text-slate-500")}>
                          {c ? <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" aria-hidden /> : null}
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate", c ? "text-slate-900" : "text-[11px]")}>{c ? c.nome : m.candidati.length ? `Scegli fra ${m.candidati.length} simili` : "Scegli l'articolo"}</span>
                            {c && <span className="block truncate text-[11px] text-slate-500">{c.sotto}</span>}
                          </span>
                          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-slate-400 opacity-0 group-hover:opacity-100" aria-hidden />
                        </button>
                        {m.magazzino && (
                          <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-emerald-700" title={`In magazzino: ${m.magazzino.nome}`}>
                            <Box className="h-3 w-3" aria-hidden />In magazzino {num(m.magazzino.disponibile)} {m.magazzino.unita ?? ""}
                          </span>
                        )}
                      </td>
                      {mostraPrezzi && (
                        <>
                          <td className="py-1.5 text-right tabular-nums text-slate-700">{prezzo ? <>{euro(prezzo.unitario)}<span className="block text-[11px] text-slate-400">/{prezzo.unita}</span></> : <span className="text-slate-400">—</span>}</td>
                          <td className="py-1.5 text-right font-medium tabular-nums text-slate-900">{prezzo ? euro(prezzo.totale) : <span className="font-normal text-slate-400">—</span>}</td>
                        </>
                      )}
                      <td className="py-1.5 pr-1 text-right"><Sicurezza m={m} /></td>
                    </tr>
                    {aperta === m.chiave && (
                      <tr className="bg-slate-50/80">
                        <td />
                        <td colSpan={colonne - 1} className="py-2 pr-2">
                          <SceltaArticoloRiga m={m} articoli={articoli} listini={listini} fornitori={fornitori} mostraPrezzi={mostraPrezzi}
                            onScegli={(s) => { onScegliArticolo(m.chiave, s); setAperta(null); }} onChiudi={() => setAperta(null)}
                            onAggiungiAlCatalogo={onAggiungiAlCatalogo} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          );
        })}
      </table>
      {!materiali.some((m) => filtraMateriali(m, filtro, avvisiCosto)) && <p className="py-6 text-center text-xs text-slate-500">Nessun materiale con questo filtro.</p>}
    </section>
  );
}

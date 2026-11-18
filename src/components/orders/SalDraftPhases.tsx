import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import { salLineAmount, salNumber, type SalDraftLine } from "@/lib/orders/salDraft";
import { percentualePrecedenteVoce, type PercentualiPrecedenti } from "@/lib/orders/salDaFasi";

interface Props {
  lines: SalDraftLine[];
  previous: PercentualiPrecedenti;
  unchanged: Set<string>;
  showAll: boolean;
  onShowAll: () => void;
  onChange: (index: number, field: keyof SalDraftLine, value: string) => void;
  onSubphaseChange: (index: number, sub: number, field: "quantita" | "percentuale", value: string) => void;
  onRemove: (index: number) => void;
}

const amount = (v: SalDraftLine) => {
  const a = salNumber(v.importo_contrattuale), p = salNumber(v.percentuale_avanzamento);
  return a !== null && p !== null && p <= 100 ? salLineAmount(a, p) : 0;
};
const keyOf = (v: SalDraftLine, i: number) => v.fase_id ?? `libera-${i}`;
const quantity = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });

/** La stessa gerarchia del cantiere: fase → voci. I filtri cambiano solo la vista, mai il verbale. */
export function SalDraftPhases({ lines, previous, unchanged, showAll, onShowAll, onChange, onSubphaseChange, onRemove }: Props) {
  const [selection, setSelection] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandAll, setExpandAll] = useState(lines.length <= 3);
  const [expansion, setExpansion] = useState<Record<string, boolean>>({});
  const confronto = previous.numero !== null;
  const selected = lines.some((v, i) => keyOf(v, i) === selection) ? selection : null;
  const isUnchanged = (v: SalDraftLine) => !!v.fase_id && unchanged.has(v.fase_id);
  const visible = lines.map((v, i) => ({ v, i, key: keyOf(v, i) })).filter(({ v, key }) => {
    if (selected && key !== selected) return false;
    if (!selected && !showAll && isUnchanged(v)) return false;
    const text = [v.descrizione, ...(v.sottofasi ?? []).map(d => d.descrizione)].join(" ").toLocaleLowerCase("it");
    return text.includes(search.trim().toLocaleLowerCase("it"));
  });

  return <div className="sal-phase-workspace">
    <nav aria-label="Fasi del verbale" className="sal-phase-nav" data-single={lines.length === 1}>
      <button type="button" aria-pressed={!selected} onClick={() => { setSelection(null); setSearch(""); onShowAll(); }} className="sal-phase-nav-all">Tutte le fasi <span>{lines.length}</span></button>
      <div className="sal-phase-nav-list">
      {lines.map((v, i) => <button key={keyOf(v, i)} type="button" aria-pressed={selected === keyOf(v, i)} onClick={() => {
        const key = keyOf(v, i);
        setSelection(key);
        setSearch("");
        setExpansion(current => ({ ...current, [key]: true }));
      }} className="sal-phase-nav-item">
        <span title={v.descrizione}>{v.descrizione || `Voce ${i + 1}`}</span>
        <small>{isUnchanged(v) ? "Invariata" : `${v.percentuale_avanzamento || 0}% a oggi`} <b>{formatCurrency(amount(v))}</b></small>
      </button>)}
      </div>
    </nav>
    <div className="min-w-0 space-y-2">
      <div className="sal-phase-tools">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden /><Input aria-label="Cerca nelle fasi e nelle voci del SAL" placeholder="Cerca una fase o una voce…" className="h-9 pl-8" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {unchanged.size > 0 && !showAll && <Button type="button" size="sm" variant="outline" onClick={() => { setSelection(null); setSearch(""); onShowAll(); }}>Mostra tutte le voci</Button>}
        {!selected && !search.trim() && lines.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => {
          setExpansion({});
          setExpandAll(!expandAll);
        }}>{expandAll ? "Chiudi le voci" : "Apri le voci"}</Button>}
      </div>
      {search.trim() && <p className="text-xs text-muted-foreground">{visible.length} di {lines.length} fasi</p>}
      <div className="sal-phase-table-scroll" role="region" aria-label="Tabella delle lavorazioni, scorribile orizzontalmente" tabIndex={0}>
        <table className="sal-phase-table" data-confronto={confronto}>
          <caption className="sr-only">Lavorazioni del verbale SAL: importi netti e avanzamento cumulativo</caption>
          <colgroup><col className="sal-col-name" /><col className="sal-col-quantity" />{confronto && <col className="sal-col-previous" />}<col className="sal-col-progress" /><col className="sal-col-money" /><col className="sal-col-money" /><col className="sal-col-action" /></colgroup>
          <thead><tr><th>Fase / voce</th><th>Quantità a oggi</th>{confronto && <th>SAL {previous.numero}</th>}<th>% a oggi</th><th className="text-right">Contrattuale €</th><th className="text-right">Eseguito €</th><th><span className="sr-only">Azioni</span></th></tr></thead>
          <tbody>{visible.map(({ v, i, key }) => {
            const before = percentualePrecedenteVoce(v, previous);
            const pct = salNumber(v.percentuale_avanzamento);
            const regression = before !== null && pct !== null && pct < before;
            const open = expansion[key] ?? (expandAll || !!search.trim());
            return <Fragment key={key}>
              <tr className="sal-phase-main">
                <td><div className="flex items-center gap-1"><button type="button" aria-label={`${open ? "Chiudi" : "Apri"} le voci di ${v.descrizione || `Voce ${i + 1}`}`} aria-expanded={open} onClick={() => setExpansion(current => ({ ...current, [key]: !open }))} className="rounded p-1 hover:bg-muted">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                  <Label htmlFor={`sal-desc-${i}`} className="sr-only">Descrizione *</Label><Textarea id={`sal-desc-${i}`} value={v.descrizione} onChange={e => onChange(i, "descrizione", e.target.value)} placeholder="Descrizione della lavorazione" rows={2} className="sal-phase-description min-h-0 resize-none" /></div>
                  <small className="sal-cell-helper ml-7 text-muted-foreground">{v.fase_id ? `${v.sottofasi?.length ?? 0} ${v.sottofasi?.length === 1 ? "voce" : "voci"} · dalla commessa` : "Voce libera"}{isUnchanged(v) ? " · invariata" : ""}</small></td>
                <td />
                {confronto && <td className={regression ? "text-amber-700" : "text-muted-foreground"}>{before !== null ? `${before}%` : "—"}</td>}
                <td><Label htmlFor={`sal-pct-${i}`} className="sr-only">Avanzamento cumulativo (%)</Label><div className="sal-percent-field"><Input id={`sal-pct-${i}`} inputMode="decimal" value={v.percentuale_avanzamento} onChange={e => onChange(i, "percentuale_avanzamento", e.target.value)} readOnly={!!v.sottofasi?.length} title={v.sottofasi?.length ? "Calcolato dalle voci qui sotto" : undefined} className="h-8 text-right" /><span>%</span></div><small className={`sal-cell-helper ${regression ? "text-amber-700" : "text-muted-foreground"}`}>{regression ? "In calo" : !confronto && v.sottofasi?.length ? "Dalle voci" : ""}</small></td>
                <td><Label htmlFor={`sal-amount-${i}`} className="sr-only">Importo contrattuale netto (€)</Label><Input id={`sal-amount-${i}`} inputMode="decimal" value={v.importo_contrattuale} onChange={e => onChange(i, "importo_contrattuale", e.target.value)} placeholder="Da completare" className="h-8 text-right" /><small className="sal-cell-helper text-amber-700">{!v.importo_contrattuale.trim() ? "Da completare" : ""}</small></td>
                <td className="sal-money-cell font-semibold text-primary"><span>{formatCurrency(amount(v))}</span></td>
                <td>{lines.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => onRemove(i)} aria-label={`Rimuovi voce ${v.descrizione || i + 1}`} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button>}</td>
              </tr>
              {open && <>
                {(v.sottofasi ?? []).map((d, j) => {
                  const previousPct = d.sottofase_id ? previous.perSottofase.get(d.sottofase_id) : undefined;
                  const previousQuantity = d.sottofase_id ? previous.quantitaPerSottofase?.get(d.sottofase_id) : undefined;
                  const measured = !!d.quantita_contratto && !["corpo", "a corpo"].includes((d.unita ?? "").trim().toLocaleLowerCase("it"));
                  const subPct = salNumber(d.percentuale_avanzamento);
                  const subAmount = d.importo_contrattuale != null && subPct !== null && subPct <= 100 ? salLineAmount(d.importo_contrattuale, subPct) : null;
                  return <tr key={d.sottofase_id ?? j} className="sal-subphase-row">
                    <td>{d.descrizione}</td>
                    <td>{measured ? <div className="sal-quantity-field"><Input inputMode="decimal" value={d.quantita_a_oggi} aria-label={`Quantità a oggi di ${d.descrizione}`} className="h-8 text-right" onChange={e => onSubphaseChange(i, j, "quantita", e.target.value)} /><small>su {quantity(d.quantita_contratto!)} {d.unita}</small></div> : <span className="sal-body-unit text-muted-foreground">{d.quantita_contratto ? `${quantity(d.quantita_contratto)} ${d.unita ?? ""}` : "A percentuale"}</span>}</td>
                    {confronto && <td className={previousPct != null && subPct != null && subPct < previousPct ? "text-amber-700" : "text-muted-foreground"}>
                      {previousPct != null ? `${previousPct}%` : "—"}
                      {measured && previousQuantity && <small>{quantity(previousQuantity.quantita)} {previousQuantity.unita}</small>}
                    </td>}
                    <td><div className="sal-percent-field"><Input inputMode="decimal" value={d.percentuale_avanzamento} aria-label={`Avanzamento di ${d.descrizione}`} readOnly={measured} title={measured ? "Calcolato dalla quantità eseguita" : undefined} className="h-8 text-right" onChange={e => onSubphaseChange(i, j, "percentuale", e.target.value)} /><span>%</span></div></td>
                    <td className="sal-money-cell sal-contract-cell">{d.importo_contrattuale != null ? formatCurrency(d.importo_contrattuale) : "—"}</td>
                    <td className="sal-money-cell">{subAmount != null ? formatCurrency(subAmount) : "—"}</td><td />
                  </tr>;
                })}
                <tr id={`sal-detail-${i}`}><td colSpan={confronto ? 7 : 6} className="sal-phase-detail"><details className="sal-draft-note" open={v.note ? true : undefined}><summary>Note per il cliente</summary><div className="pt-2"><Label htmlFor={`sal-note-${i}`} className="sr-only">Note voce · visibili al cliente</Label><Input id={`sal-note-${i}`} value={v.note} onChange={e => onChange(i, "note", e.target.value)} placeholder="Annotazione facoltativa per il verbale" className="h-8" /></div></details></td></tr>
              </>}
            </Fragment>;
          })}</tbody>
        </table>
        {!visible.length && <div className="p-4 text-sm text-muted-foreground">Nessuna voce in questa vista. <button type="button" className="underline" onClick={() => { setSearch(""); setSelection(null); onShowAll(); }}>Mostra tutte le fasi</button></div>}
      </div>

    </div>
  </div>;
}

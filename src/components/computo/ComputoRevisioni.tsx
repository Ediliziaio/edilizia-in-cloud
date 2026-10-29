/**
 * Le revisioni del preventivo con computo: si salva la versione mandata al
 * cliente («Rev. 2») e poi si vede cosa è cambiato rispetto ad adesso, voce
 * per voce, con quanto si è spostato il totale.
 */
import { useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BozzaComputo } from "@/lib/computo/editorNativo";
import { confrontaRevisioni, fotografaRevisione, MAX_REVISIONI, prossimaRevisione } from "@/lib/computo/revisioniComputo";
import { formatEuro } from "@/lib/computo/computoStrutturato";

const ADESSO = "adesso";
const segno = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${formatEuro(Math.abs(n))} €`;

export default function ComputoRevisioni({ bozza, open, onOpenChange, onChange }: {
  bozza: BozzaComputo; open: boolean; onOpenChange: (open: boolean) => void;
  onChange: (patch: Pick<Partial<BozzaComputo>, "revisioni" | "revisione">) => void;
}) {
  const revisioni = bozza.revisioni;
  const [nome, setNome] = useState("");
  const [base, setBase] = useState<string>("");
  const [contro, setContro] = useState<string>(ADESSO);
  const adesso = useMemo(() => fotografaRevisione(bozza, "Il computo di adesso"), [bozza]);
  const trova = (id: string) => (id === ADESSO ? adesso : revisioni.find(r => r.id === id));
  const scelta = base || revisioni.at(-1)?.id || "";
  const confronto = useMemo(() => {
    const a = trova(scelta), b = trova(contro);
    return a && b && a.id !== b.id ? confrontaRevisioni(a, b) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `trova` dipende solo da questi
  }, [scelta, contro, revisioni, adesso]);
  const data = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const salva = () => {
    const n = nome.trim() || prossimaRevisione(revisioni);
    const nuova = fotografaRevisione(bozza, n);
    onChange({ revisioni: [...revisioni, nuova].slice(-MAX_REVISIONI), revisione: n.replace(/^rev\.?\s*/i, "") });
    setNome(""); setBase(nuova.id); setContro(ADESSO);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>Revisioni del preventivo</DialogTitle>
        <DialogDescription>Salva la versione che mandi al cliente: poi vedi cosa è cambiato, voce per voce.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1"><label htmlFor="revisione-nome" className="text-xs font-medium">Nome della revisione</label>
          <Input id="revisione-nome" className="h-9" maxLength={80} placeholder={prossimaRevisione(revisioni)} value={nome} onChange={e => setNome(e.target.value)} /></div>
        <Button size="sm" onClick={salva} disabled={!bozza.voci.length}><Save className="mr-1 h-4 w-4" />Salva revisione</Button>
      </div>
      {!revisioni.length ? <p className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">Ancora nessuna revisione. Salvane una prima di mandare il preventivo: alla prossima modifica vedrai le differenze.</p> : <>
        <ul className="divide-y rounded-md border text-sm">{[...revisioni].reverse().map(r => <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="min-w-0"><strong>{r.nome}</strong> <span className="text-xs text-muted-foreground">· {data(r.data)} · {r.voci.length} voci</span></span>
          <span className="flex items-center gap-2"><span className="tabular-nums">{formatEuro(r.totale)} €</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Togli la revisione ${r.nome}`} onClick={() => onChange({ revisioni: revisioni.filter(x => x.id !== r.id) })}><Trash2 className="h-3.5 w-3.5" /></Button></span>
        </li>)}</ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1"><span className="text-xs font-medium">Confronta</span>
            <Select value={scelta} onValueChange={setBase}><SelectTrigger aria-label="Revisione di partenza" className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{revisioni.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><span className="text-xs font-medium">con</span>
            <Select value={contro} onValueChange={setContro}><SelectTrigger aria-label="Revisione di confronto" className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ADESSO}>Il computo di adesso</SelectItem>{revisioni.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {confronto && <section aria-label="Differenze" className="space-y-2">
          <p className="text-sm">Totale: <strong className={confronto.delta > 0 ? "text-emerald-700" : confronto.delta < 0 ? "text-red-700" : ""}>{segno(confronto.delta)}</strong> · {confronto.differenze.length ? `${confronto.differenze.length} ${confronto.differenze.length === 1 ? "voce cambiata" : "voci cambiate"}` : "nessuna differenza nelle voci"}</p>
          {!!confronto.differenze.length && <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-1 pr-2 font-medium">Voce</th><th className="py-1 pr-2 font-medium">Cosa</th><th className="w-28 py-1 text-right font-medium">Totale</th></tr></thead>
            <tbody>{confronto.differenze.map((d, k) => {
              const v = d.tipo === "tolta" ? d.prima : d.dopo;
              const cosa = d.tipo === "aggiunta" ? "aggiunta" : d.tipo === "tolta" ? "tolta" : d.cosa.map(c => c === "quantità" ? `quantità ${d.prima.quantita ?? "-"} → ${d.dopo.quantita ?? "-"}` : c === "prezzo" ? `prezzo ${d.prima.prezzo == null ? "-" : formatEuro(d.prima.prezzo)} → ${d.dopo.prezzo == null ? "-" : formatEuro(d.dopo.prezzo)}` : c).join(", ");
              return <tr key={`${v.id}-${k}`} className="border-t align-top">
                <td className="py-1.5 pr-2">{v.descrizione}</td>
                <td className={`py-1.5 pr-2 text-xs ${d.tipo === "aggiunta" ? "text-emerald-700" : d.tipo === "tolta" ? "text-red-700" : "text-amber-800"}`}>{cosa}</td>
                <td className="py-1.5 text-right tabular-nums">{segno(d.delta)}</td>
              </tr>;
            })}</tbody>
          </table></div>}
        </section>}
      </>}
    </DialogContent>
  </Dialog>;
}

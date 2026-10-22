/**
 * Perizie di variante: una variante è una nuova versione del computo
 * contrattuale (copia legata voce per voce). Si cambiano quantità e prezzi, si
 * aggiungono nuovi prezzi (NP); il quadro di confronto «contratto / variante /
 * differenza» dà l'importo variato e la percentuale. Approvata, diventa il
 * computo contrattuale e il libretto continua sulle stesse voci.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { confrontoVariante, numeroDigitato, vociContratto, type EsitoConfronto } from "@/lib/computo/contabilitaLavori";
import { useVociComputo, type ComputoCommessa } from "@/hooks/useComputoCommessa";
import {
  useAggiungiNuovoPrezzo, useApprovaVariante, useCreaVariante, useEliminaNuovoPrezzo, useModificaVoceVariante, useScartaVariante,
} from "@/hooks/useContabilitaLavori";
import { dataIt, euro, intestazioneDa, quant, type PropsScheda } from "./comune";

const ESITO: Record<EsitoConfronto, { testo: string; classe: string }> = {
  invariata: { testo: "invariata", classe: "" },
  aumentata: { testo: "aumentata", classe: "border-sky-300 text-sky-800" },
  ridotta: { testo: "ridotta", classe: "border-amber-300 text-amber-800" },
  nuova: { testo: "nuovo prezzo", classe: "border-violet-300 text-violet-800" },
  soppressa: { testo: "soppressa", classe: "border-rose-300 text-rose-800" },
  prezzo_cambiato: { testo: "prezzo cambiato", classe: "border-amber-300 text-amber-800" },
};

function CellaNumero({ valore, etichetta, disabilitato, onSalva }: { valore: number; etichetta: string; disabilitato: boolean; onSalva: (n: number) => void }) {
  const [testo, setTesto] = useState(String(valore).replace(".", ","));
  return (
    <Input aria-label={etichetta} value={testo} disabled={disabilitato} inputMode="decimal" className="h-7 w-24 text-right tabular-nums"
      onChange={e => setTesto(e.target.value)}
      onBlur={() => {
        const n = numeroDigitato(testo);
        if (n == null || Number.isNaN(n)) { setTesto(String(valore).replace(".", ",")); return; }
        if (n !== valore) onSalva(n);
      }} />
  );
}

function EditorVariante({ variante, props }: { variante: ComputoCommessa; props: PropsScheda }) {
  const { computo, contratto, companyId, orderId, canEdit, impostazioni, orderLabel } = props;
  const confirm = useConfirm();
  const { data: vociVariante = [], isLoading } = useVociComputo(variante.id, true);
  const modifica = useModificaVoceVariante(variante.id);
  const aggiungi = useAggiungiNuovoPrezzo(variante.id, companyId);
  const eliminaNp = useEliminaNuovoPrezzo(variante.id);
  const approva = useApprovaVariante(orderId);
  const scarta = useScartaVariante(orderId);
  const [soloCambiate, setSoloCambiate] = useState(false);
  const [np, setNp] = useState<{ descrizione: string; um: string; q: string; p: string } | null>(null);
  const [stampa, setStampa] = useState(false);
  const modificabile = canEdit && variante.stato !== "contrattuale";
  const cv = vociContratto(vociVariante);
  const confronto = confrontoVariante(contratto, cv, computo.ribasso_percentuale);
  const perRadice = new Map(cv.map(v => [v.radice, v]));
  const righe = soloCambiate ? confronto.righe.filter(r => r.esito !== "invariata") : confronto.righe;
  const salvaVoce = (radice: string, campo: "quantita" | "prezzo", n: number) => {
    const v = perRadice.get(radice);
    if (!v) return;
    modifica.mutate({ id: v.voce_id, quantita: campo === "quantita" ? n : v.quantita, prezzo: campo === "prezzo" ? n : v.prezzo }, { onError: e => toast.error(e.message) });
  };
  const aggiungiNp = () => {
    if (!np) return;
    const q = numeroDigitato(np.q), p = numeroDigitato(np.p);
    if (!np.descrizione.trim() || q == null || p == null || Number.isNaN(q) || Number.isNaN(p)) { toast.error("Descrizione, quantità e prezzo del nuovo prezzo."); return; }
    const n = vociVariante.filter(v => v.nuovo_prezzo).length + 1;
    aggiungi.mutate({ numero: `NP.${n}`, descrizione: np.descrizione.trim(), unita_misura: np.um.trim(), quantita: q, prezzo: p, is_sicurezza: false,
      ordine: Math.max(0, ...vociVariante.map(v => v.ordine)) + 1, capitolo: "Nuovi prezzi" },
    { onSuccess: () => setNp(null), onError: e => toast.error(e.message) });
  };

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Carico la variante…</div>;
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-lg border p-2"><dt className="text-xs text-slate-500">Importo contrattuale</dt><dd className="font-semibold tabular-nums">{euro(confronto.contratto.importo_contrattuale)}</dd></div>
        <div className="rounded-lg border p-2"><dt className="text-xs text-slate-500">Dopo la variante</dt><dd className="font-semibold tabular-nums">{euro(confronto.variante.importo_contrattuale)}</dd></div>
        <div className="rounded-lg border p-2"><dt className="text-xs text-slate-500">Differenza</dt><dd className="font-semibold tabular-nums">{confronto.differenza > 0 ? "+" : ""}{euro(confronto.differenza)}</dd></div>
        <div className={`rounded-lg border p-2 ${confronto.oltre_quinto ? "border-amber-300 bg-amber-50" : ""}`}><dt className="text-xs text-slate-500">Variazione</dt>
          <dd className="font-semibold tabular-nums">{confronto.percentuale > 0 ? "+" : ""}{confronto.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%</dd></div>
      </dl>
      {confronto.oltre_quinto && <p className="flex items-center gap-2 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" />Oltre il quinto d'obbligo (20%): serve l'atto di sottomissione / il consenso dell'impresa.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soloCambiate} onChange={e => setSoloCambiate(e.target.checked)} />Solo le voci che cambiano</label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={stampa} onClick={async () => {
            setStampa(true);
            try { const { stampaConfrontoVariante } = await import("@/lib/computo/stampeContabilita");
              await stampaConfrontoVariante(confronto, variante.titolo || `Perizia di variante n. ${variante.numero_variante}`, intestazioneDa(computo, impostazioni, orderLabel)); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Stampa non riuscita."); } finally { setStampa(false); }
          }}><FileDown className="mr-1 h-4 w-4" />Quadro di confronto</Button>
          {modificabile && !np && <Button type="button" size="sm" variant="outline" onClick={() => setNp({ descrizione: "", um: "", q: "", p: "" })}><Plus className="mr-1 h-4 w-4" />Nuovo prezzo (NP)</Button>}
        </div>
      </div>
      {np && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-slate-50/60 p-2 text-sm">
          <div className="min-w-[14rem] flex-1 space-y-1"><Label htmlFor="np-descr">Descrizione del nuovo prezzo</Label><Input id="np-descr" className="h-8" value={np.descrizione} onChange={e => setNp(x => x && { ...x, descrizione: e.target.value })} /></div>
          <div className="w-20 space-y-1"><Label htmlFor="np-um">U.M.</Label><Input id="np-um" className="h-8" value={np.um} onChange={e => setNp(x => x && { ...x, um: e.target.value })} /></div>
          <div className="w-24 space-y-1"><Label htmlFor="np-q">Quantità</Label><Input id="np-q" className="h-8" inputMode="decimal" value={np.q} onChange={e => setNp(x => x && { ...x, q: e.target.value })} /></div>
          <div className="w-28 space-y-1"><Label htmlFor="np-p">Prezzo €</Label><Input id="np-p" className="h-8" inputMode="decimal" value={np.p} onChange={e => setNp(x => x && { ...x, p: e.target.value })} /></div>
          <Button type="button" size="sm" onClick={aggiungiNp} disabled={aggiungi.isPending}>Aggiungi</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNp(null)}>Annulla</Button>
          <p className="w-full text-xs text-slate-500">Il nuovo prezzo va concordato (verbale di concordamento) e si intende soggetto al ribasso d'asta del contratto.</p>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr><th className="px-2 py-1.5">N.</th><th className="px-2 py-1.5">Descrizione</th><th className="px-2 py-1.5 text-right">Contratto</th>
              <th className="px-2 py-1.5 text-right">Q.tà variante</th><th className="px-2 py-1.5 text-right">Prezzo variante</th><th className="px-2 py-1.5 text-right">Importo variante</th><th className="px-2 py-1.5 text-right">Differenza</th><th /></tr>
          </thead>
          <tbody className="divide-y">
            {righe.map(r => {
              const v = perRadice.get(r.radice);
              return (
                <tr key={r.radice}>
                  <td className="px-2 py-1 font-semibold tabular-nums">{r.numero}</td>
                  <td className="min-w-[14rem] px-2 py-1"><span className="line-clamp-1" title={r.descrizione}>{r.descrizione}</span>
                    {r.esito !== "invariata" && <Badge variant="outline" className={ESITO[r.esito].classe}>{ESITO[r.esito].testo}</Badge>}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right text-xs tabular-nums text-slate-600">{quant(r.quantita_contratto)} {r.unita_misura} × {euro(r.prezzo_contratto)}</td>
                  <td className="px-2 py-1 text-right">{v ? <CellaNumero key={`${v.voce_id}-q-${v.quantita}`} valore={v.quantita} etichetta={`Quantità variante della voce ${r.numero}`} disabilitato={!modificabile || modifica.isPending} onSalva={n => salvaVoce(r.radice, "quantita", n)} /> : "—"}</td>
                  <td className="px-2 py-1 text-right">{v ? <CellaNumero key={`${v.voce_id}-p-${v.prezzo}`} valore={v.prezzo} etichetta={`Prezzo variante della voce ${r.numero}`} disabilitato={!modificabile || modifica.isPending} onSalva={n => salvaVoce(r.radice, "prezzo", n)} /> : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{euro(r.importo_variante)}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${r.differenza > 0 ? "text-sky-800" : r.differenza < 0 ? "text-amber-800" : "text-slate-400"}`}>{r.differenza ? euro(r.differenza) : "—"}</td>
                  <td className="px-1">{modificabile && v?.nuovo_prezzo && !contratto.some(c => c.radice === r.radice) && (
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Togli ${r.numero}`} onClick={() => eliminaNp.mutate(v.voce_id, { onError: e => toast.error(e.message) })}><Trash2 className="h-3.5 w-3.5" /></Button>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Per sopprimere una voce porta la quantità a zero. Le somme a disposizione non compaiono: la variante riguarda i lavori.</p>
      {modificabile && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" className="text-rose-700" onClick={async () => {
            if (await confirm({ title: "Scartare la perizia di variante?", description: "Si cancella la copia del computo con le modifiche. Il contratto non cambia.", confirmLabel: "Scarta", variant: "destructive" })) {
              scarta.mutate(variante.id, { onError: e => toast.error(e.message) });
            }
          }}>Scarta</Button>
          <Button type="button" disabled={approva.isPending} onClick={async () => {
            if (await confirm({ title: "Approvare la perizia di variante?",
              description: `Diventa il computo contrattuale (${euro(confronto.variante.importo_contrattuale)}, ${confronto.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%). Il contratto precedente resta archiviato e bloccato; il libretto prosegue sulle stesse voci.`,
              confirmLabel: "Approva la variante" })) {
              approva.mutate(variante.id, { onSuccess: () => toast.success("Variante approvata: è il nuovo computo contrattuale"), onError: e => toast.error(e.message) });
            }
          }}>Approva la variante</Button>
        </div>
      )}
    </div>
  );
}

export default function SchedaVarianti(props: PropsScheda & { computi: ComputoCommessa[] }) {
  const { computo, computi, orderId, canEdit, canViewAmounts } = props;
  const crea = useCreaVariante(orderId);
  const [nuova, setNuova] = useState<{ titolo: string; motivo: string } | null>(null);
  const varianti = computi.filter(c => c.variante_di).sort((a, b) => (b.numero_variante ?? 0) - (a.numero_variante ?? 0));
  const aperta = varianti.find(v => v.variante_di === computo.id && v.stato !== "contrattuale" && v.stato !== "archiviato");
  const [scelta, setScelta] = useState<string | null>(null);
  const mostrata = varianti.find(v => v.id === scelta) ?? aperta ?? null;
  if (!canViewAmounts) return <p className="text-sm text-slate-600">Gli importi della commessa non sono visibili con i tuoi permessi.</p>;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">Perizie di variante</CardTitle>
        {canEdit && !aperta && !nuova && <Button type="button" size="sm" onClick={() => setNuova({ titolo: "", motivo: "" })}><Plus className="mr-1 h-4 w-4" />Nuova perizia di variante</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {nuova && (
          <div className="space-y-2 rounded-lg border bg-slate-50/60 p-3 text-sm">
            <div className="space-y-1"><Label htmlFor="variante-titolo">Titolo</Label>
              <Input id="variante-titolo" className="h-8" value={nuova.titolo} placeholder={`Perizia di variante n. ${(Math.max(0, ...varianti.map(v => v.numero_variante ?? 0))) + 1}`} onChange={e => setNuova(n => n && { ...n, titolo: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="variante-motivo">Motivo (art. 120 D.Lgs. 36/2023)</Label>
              <Textarea id="variante-motivo" rows={2} value={nuova.motivo} placeholder="Es. maggiori quantità di massetto per quote del rilievo diverse da progetto" onChange={e => setNuova(n => n && { ...n, motivo: e.target.value })} /></div>
            <p className="text-xs text-slate-500">Si crea una copia del computo contrattuale da modificare. Finché non è approvata il contratto non cambia.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNuova(null)}>Annulla</Button>
              <Button type="button" disabled={crea.isPending || !nuova.motivo.trim()} onClick={() => crea.mutate({ uploadId: computo.id, titolo: nuova.titolo, motivo: nuova.motivo }, {
                onSuccess: id => { setNuova(null); setScelta(id); toast.success("Perizia di variante creata"); }, onError: e => toast.error(e.message),
              })}>{crea.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Crea</Button>
            </div>
          </div>
        )}
        {varianti.length === 0 && !nuova && <p className="text-sm text-slate-600">Nessuna perizia di variante. Il contratto è quello del computo contrattuale.</p>}
        {varianti.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {varianti.map(v => (
              <li key={v.id}>
                <button type="button" onClick={() => setScelta(v.id)} className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 ${mostrata?.id === v.id ? "bg-slate-50" : ""}`}>
                  <span className="font-medium">{v.titolo || `Perizia di variante n. ${v.numero_variante}`}<span className="ml-2 text-xs font-normal text-slate-500">{v.motivo_variante}</span></span>
                  <Badge variant="outline" className={v.stato === "contrattuale" ? "border-emerald-400 text-emerald-800" : v.stato === "archiviato" ? "text-slate-500" : ""}>
                    {v.stato === "contrattuale" ? `In vigore dal ${dataIt(v.contrattuale_dal)}` : v.stato === "archiviato" ? "Superata" : "Da approvare"}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
        {mostrata && mostrata.stato !== "archiviato" && mostrata.stato !== "contrattuale" && <EditorVariante key={mostrata.id} variante={mostrata} props={props} />}
        {mostrata && mostrata.stato === "contrattuale" && <p className="text-sm text-slate-600">Questa variante è il computo contrattuale in vigore: la vedi nella scheda «Computo». Per cambiarla serve una nuova perizia.</p>}
      </CardContent>
    </Card>
  );
}

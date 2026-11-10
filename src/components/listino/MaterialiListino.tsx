import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDialogFocusReturn } from "@/hooks/useDialogFocusReturn";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { MaterialeListino } from "@/hooks/useMaterialiListino";
import { parseDecimalField } from "@/lib/listino/numeriEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const euro = (value: number | null) => value == null ? "Da impostare" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value);
const metadata = (r: MaterialeListino) => r.custom_field_values && typeof r.custom_field_values === "object" && !Array.isArray(r.custom_field_values) ? r.custom_field_values : {};

export function MaterialiListino({ righe, puoModificare }: { righe: MaterialeListino[]; puoModificare: boolean }) {
  const focusReturn = useDialogFocusReturn();
  const richiestaInCorsoRef = useRef(false);
  const [cerca, setCerca] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [categoria, setCategoria] = useState("");
  const [stato, setStato] = useState("");
  const [pagina, setPagina] = useState(0);
  const [scelto, setScelto] = useState<MaterialeListino | null>(null);
  const fornitori = useMemo(() => Array.from(new Map(righe.filter(r => r.supplier_id).map(r => [r.supplier_id!, r.suppliers?.name ?? "Fornitore"]))).sort((a, b) => a[1].localeCompare(b[1])), [righe]);
  const categorie = useMemo(() => [...new Set(righe.map(r => r.category).filter((c): c is string => !!c))].sort(), [righe]);
  const filtrate = useMemo(() => righe.filter(r =>
    (!fornitore || r.supplier_id === fornitore) && (!categoria || r.category === categoria) &&
    (!stato || (stato === "attivi" ? r.attivo === true : r.attivo !== true)) &&
    `${r.name} ${r.sku ?? ""} ${r.suppliers?.name ?? ""} ${String(metadata(r).vendor_code ?? "")}`.toLocaleLowerCase("it").includes(cerca.trim().toLocaleLowerCase("it"))),
  [righe, fornitore, categoria, stato, cerca]);
  const ultima = Math.max(0, Math.ceil(filtrate.length / 50) - 1);
  const corrente = Math.min(pagina, ultima);
  return <section className="space-y-4" aria-label="Materiali e servizi">
    <p className="text-sm text-muted-foreground">Costi dei materiali e dei servizi per ordini e preventivi. Le voci inattive restano consultabili e non vengono proposte per nuove righe.</p>
    <div className="flex flex-wrap gap-3">
      <Input aria-label="Cerca materiale" placeholder="Descrizione, codice o fornitore…" className="sm:max-w-sm" value={cerca} onChange={e => { setCerca(e.target.value); setPagina(0); }} />
      <select aria-label="Fornitore" className="h-10 rounded-md border bg-background px-3 text-sm" value={fornitore} onChange={e => { setFornitore(e.target.value); setPagina(0); }}><option value="">Tutti i fornitori</option>{fornitori.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select>
      <select aria-label="Categoria" className="h-10 rounded-md border bg-background px-3 text-sm" value={categoria} onChange={e => { setCategoria(e.target.value); setPagina(0); }}><option value="">Tutte le categorie</option>{categorie.map(c => <option key={c}>{c}</option>)}</select>
      <select aria-label="Stato materiale" className="h-10 rounded-md border bg-background px-3 text-sm" value={stato} onChange={e => { setStato(e.target.value); setPagina(0); }}><option value="">Tutti gli stati</option><option value="attivi">Attivi</option><option value="inattivi">Inattivi / da confermare</option></select>
      <Button variant="ghost" onClick={() => { setCerca(""); setFornitore(""); setCategoria(""); setStato(""); setPagina(0); }}>Azzera filtri</Button>
    </div>
    <p className="text-sm" aria-live="polite">{filtrate.length} voci su {righe.length} · {righe.filter(r => r.attivo === true).length} attive</p>
    <div className="rounded-md border overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Materiale / servizio</TableHead><TableHead>Fornitore</TableHead><TableHead>Costo netto</TableHead><TableHead>Unità</TableHead><TableHead>Stato</TableHead><TableHead><span className="sr-only">Scheda</span></TableHead></TableRow></TableHeader><TableBody>
      {filtrate.slice(corrente * 50, (corrente + 1) * 50).map(r => <TableRow key={r.id}>
        <TableCell><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{String(metadata(r).vendor_code ?? r.sku ?? "")} · {r.category}</p></TableCell>
        <TableCell>{r.suppliers?.name ?? "—"}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{euro(r.standard_cost ?? r.prezzo_acquisto_netto)}</TableCell><TableCell>{r.unit_of_measure ?? "—"}</TableCell>
        <TableCell><Badge variant={r.attivo === true ? "default" : "secondary"}>{r.attivo === true ? "Attivo" : "Inattivo / da confermare"}</Badge></TableCell>
        <TableCell><Button variant="outline" size="sm" onClick={() => setScelto(r)} aria-label={`Apri ${r.name}`}>Scheda</Button></TableCell>
      </TableRow>)}
      {!filtrate.length && <TableRow><TableCell colSpan={6} className="py-8 text-center">Nessuna voce corrisponde ai filtri.</TableCell></TableRow>}
    </TableBody></Table></div>
    {ultima > 0 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={corrente === 0} onClick={() => setPagina(corrente - 1)}>Precedente</Button><span className="text-sm">Pagina {corrente + 1} di {ultima + 1}</span><Button variant="outline" disabled={corrente === ultima} onClick={() => setPagina(corrente + 1)}>Successiva</Button></div>}
    <Dialog open={!!scelto} onOpenChange={open => { if (!open && !richiestaInCorsoRef.current) setScelto(null); }}><DialogContent {...focusReturn} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      {scelto && <SchedaMateriale key={scelto.id} riga={scelto} puoModificare={puoModificare} richiestaInCorsoRef={richiestaInCorsoRef} chiudi={() => setScelto(null)} />}
    </DialogContent></Dialog>
  </section>;
}

function SchedaMateriale({ riga, puoModificare, richiestaInCorsoRef, chiudi }: { riga: MaterialeListino; puoModificare: boolean; richiestaInCorsoRef: MutableRefObject<boolean>; chiudi: () => void }) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const [nome, setNome] = useState(riga.name);
  const [costo, setCosto] = useState(String(riga.standard_cost ?? riga.prezzo_acquisto_netto ?? ""));
  const [vendita, setVendita] = useState(String(riga.prezzo_vendita ?? ""));
  const [unita, setUnita] = useState(riga.unit_of_measure ?? "");
  const [iva, setIva] = useState(String(riga.vat_rate ?? ""));
  const [attivo, setAttivo] = useState(riga.attivo === true);
  const [note, setNote] = useState(riga.note_interne ?? "");
  const fonte = metadata(riga);
  const salva = useMutation({ mutationFn: async () => {
    if (!puoModificare || !companyId || companyId !== riga.company_id) throw new Error("Non puoi modificare questo materiale.");
    const prezzo = (testo: string, label: string) => {
      if (!testo.trim()) return null;
      const n = parseDecimalField(testo, Number.NaN);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${label}: inserisci un numero valido non negativo.`);
      return n;
    };
    const c = prezzo(costo, "Costo"), v = prezzo(vendita, "Vendita"), i = prezzo(iva, "IVA");
    if (!nome.trim() || !unita.trim()) throw new Error("Compila descrizione e unità di misura.");
    if (i != null && i > 100) throw new Error("L’IVA deve essere compresa fra 0 e 100.");
    if (attivo && c == null) throw new Error("Per attivare la voce devi confermare il costo netto.");
    const { error, data } = await supabase.from("article_templates").update({
      name: nome.trim(), standard_cost: c, prezzo_acquisto_netto: c, prezzo_vendita: v, unit_price: v,
      unit_of_measure: unita.trim(), vat_rate: i, attivo, note_interne: note,
      custom_field_values: { ...fonte, source_import_cost: fonte.source_import_cost === undefined ? riga.standard_cost : fonte.source_import_cost, review_status: "manually_reviewed", reviewed_at: new Date().toISOString() },
    }).eq("id", riga.id).eq("company_id", companyId).select("id").single();
    if (error || !data) throw new Error("Salvataggio non riuscito: controlla i permessi o riprova.");
  }, onSuccess: () => {
    for (const key of [["materiali-listino"], ["article-templates"], ["article-templates-full"], ["article-templates-pro"], ["catalog"], ["edilizia-listino"], ["bundle-editor-articoli"]]) void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ predicate: q => q.queryKey.some(k => typeof k === "string" && /articoli|articles/.test(k)) });
    toast.success("Materiale aggiornato"); chiudi();
  }, onError: e => toast.error(e.message), onSettled: () => { richiestaInCorsoRef.current = false; } });
  const disabilitato = !puoModificare || salva.isPending;
  return <>
    <DialogHeader><DialogTitle>Scheda materiale o servizio</DialogTitle><DialogDescription>{riga.suppliers?.name ?? "Listino aziendale"} · {riga.sku}</DialogDescription></DialogHeader>
    {typeof fonte.source_file === "string" && <div className="rounded-md bg-muted p-3 text-sm"><p>Documento: {fonte.source_file} · pagina {String(fonte.source_page ?? "—")}</p>{typeof fonte.source_period === "string" && <p>Listino: {fonte.source_period}</p>}{typeof fonte.vendor_code === "string" && <p>Codice fornitore: {fonte.vendor_code}</p>}</div>}
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!richiestaInCorsoRef.current) { richiestaInCorsoRef.current = true; salva.mutate(); } }}>
      <div><Label htmlFor="materiale-nome">Descrizione</Label><Input id="materiale-nome" value={nome} disabled={disabilitato} onChange={e => setNome(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="materiale-costo">Costo netto (€)</Label><Input id="materiale-costo" inputMode="decimal" value={costo} disabled={disabilitato} onChange={e => setCosto(e.target.value)} /></div>
        <div><Label htmlFor="materiale-vendita">Prezzo di vendita (€)</Label><Input id="materiale-vendita" inputMode="decimal" value={vendita} disabled={disabilitato} onChange={e => setVendita(e.target.value)} /></div>
        <div><Label htmlFor="materiale-unita">Unità di misura</Label><Input id="materiale-unita" value={unita} disabled={disabilitato} onChange={e => setUnita(e.target.value)} /></div>
        <div><Label htmlFor="materiale-iva">IVA (%)</Label><Input id="materiale-iva" inputMode="decimal" value={iva} disabled={disabilitato} onChange={e => setIva(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Un campo prezzo o IVA vuoto resta da impostare. Il costo è al netto dell’IVA e si riferisce all’unità indicata.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attivo} disabled={disabilitato} onChange={e => setAttivo(e.target.checked)} />Voce attiva, utilizzabile per nuove righe</label>
      <div><Label htmlFor="materiale-note">Note e condizioni di utilizzo</Label><textarea id="materiale-note" className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={note} disabled={disabilitato} onChange={e => setNote(e.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={salva.isPending} onClick={chiudi}>Chiudi</Button>{puoModificare && <Button type="submit" disabled={salva.isPending}>{salva.isPending ? "Salvataggio…" : "Salva materiale"}</Button>}</div>
    </form>
  </>;
}

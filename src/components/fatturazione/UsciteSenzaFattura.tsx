/**
 * Le uscite senza fattura: bollo, tassa, F24 di un cantiere. Stanno accanto alle fatture dei fornitori con
 * un'etichetta chiara, ma non sono fatture: fuori dal registro IVA e dai totali dei documenti.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { erroreUscita, formDaUscita, meseMostrato, partiUguali, rigaUscita, type FormUscita } from "@/lib/costi/usciteSenzaFattura";
import { AllegatiFattura, caricaAllegati, dimensioneLeggibile } from "@/components/fatturazione/AllegatiFattura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ViaggioSelect } from "@/components/mezzi/ViaggioSelect";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { Textarea } from "@/components/ui/textarea";
import { userErrorMessage } from "@/lib/userErrorMessage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const NESSUNO = "__nessuno__";

interface Uscita {
  id: string; name: string; amount: number; vat_rate: number | null; documento_data: string | null; due_date: string; documento_riferimento: string | null;
  mese_competenza: string | null; is_paid: boolean; notes: string | null; allocations: Array<{ order_id: string; pct: number }> | null;
  supplier_id: string | null; order_id: string | null; mezzo_id: string | null;
  suppliers: { name: string } | null; orders: { order_code: string | null } | null; mezzi: { nome: string } | null;
}

export function UsciteSenzaFattura({ companyId, puoModificare }: { companyId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const oggi = useMemo(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }), []);
  const vuoto: FormUscita = { descrizione: "", imponibile: "", aliquota: "0", data: oggi, mese: "", riferimento: "", fornitoreId: "", commesse: [{ id: "", pct: "100" }], mezzoId: "", pagata: true, note: "" };
  const [form, setForm] = useState<FormUscita>(vuoto);
  const set = <K extends keyof FormUscita>(k: K, v: FormUscita[K]) => setForm((f) => ({ ...f, [k]: v }));
  // I documenti si scelgono subito, con il resto; si caricano appena l'uscita è salvata.
  const [file, setFile] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  // Un'uscita già registrata si riapre nella stessa finestra e si corregge (12/11/2026).
  const [inModifica, setInModifica] = useState<string | null>(null);
  const chiudi = () => { setDialogo(false); setForm(vuoto); setFile([]); setInModifica(null); };
  const apriModifica = (u: Uscita) => { setForm(formDaUscita(u)); setFile([]); setInModifica(u.id); setDialogo(true); };
  const cambiaCommessa = (i: number, id: string) => set("commesse", form.commesse.map((c, j) => (j === i ? { ...c, id } : c)));
  const cambiaQuota = (i: number, pct: string) => set("commesse", form.commesse.map((c, j) => (j === i ? { ...c, pct } : c)));
  // Aggiungere o togliere una commessa rifà le parti uguali: poi si correggono a mano.
  const ridividi = (commesse: FormUscita["commesse"]) => { const parti = partiUguali(commesse.length); return commesse.map((c, i) => ({ ...c, pct: parti[i] })); };
  const aggiungiCommessa = () => set("commesse", ridividi([...form.commesse, { id: "", pct: "" }]));
  const togliCommessa = (i: number) => set("commesse", ridividi(form.commesse.filter((_, j) => j !== i)));
  const { data: uscite = [] } = useQuery({
    queryKey: ["uscite-senza-fattura", companyId],
    queryFn: () => tutteLePagine<Uscita>((from, to) => db.from("company_costs")
      .select("id, name, amount, vat_rate, documento_data, due_date, documento_riferimento, mese_competenza, is_paid, notes, allocations, supplier_id, order_id, mezzo_id, suppliers(name), orders(order_code), mezzi(nome)")
      .eq("company_id", companyId).eq("senza_fattura", true).order("due_date", { ascending: false }).order("id").range(from, to)),
  });
  const { data: scelte } = useQuery({
    queryKey: ["uscite-senza-fattura-scelte", companyId],
    enabled: dialogo,
    queryFn: async () => {
      // I fornitori li carica SupplierSelect, che li cerca e ne crea di nuovi.
      const [o, m] = await Promise.all([
        db.from("orders").select("id, order_code, description").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        db.from("mezzi").select("id, nome, targa").eq("company_id", companyId).is("deleted_at", null).order("nome").limit(1000),
      ]);
      return { commesse: (o.data ?? []) as Array<{ id: string; order_code: string | null; description: string | null }>, mezzi: (m.data ?? []) as Array<{ id: string; nome: string; targa: string | null }> };
    },
  });
  const salva = useMutation({
    mutationFn: async () => {
      const riga = rigaUscita(form, companyId);
      const { data, error } = inModifica
        ? await db.from("company_costs").update(riga).eq("id", inModifica).eq("company_id", companyId).eq("senza_fattura", true).select("id").single()
        : await db.from("company_costs").insert(riga).select("id").single();
      if (error) throw error;
      const id = data.id as string;
      // L'uscita è salvata comunque: se un file non passa, lo si riallega dal dettaglio.
      let erroreFile: string | null = null;
      if (file.length) {
        try { await caricaAllegati({ companyId, madre: { costoId: id }, tipo: "altro", files: file }); }
        catch (e) { erroreFile = e instanceof Error ? e.message : String(e); }
      }
      return { id, erroreFile, conFile: file.length, modificata: !!inModifica };
    },
    onSuccess: ({ id, erroreFile, conFile, modificata }) => {
      const fatto = modificata ? "Uscita aggiornata" : "Uscita registrata";
      if (erroreFile) toast.warning(`${fatto}, ma un documento non è stato caricato`, { description: `${erroreFile} Riallegalo qui sotto.` });
      else toast.success(conFile ? `${fatto} con ${conFile === 1 ? "il documento" : `${conFile} documenti`}` : fatto);
      chiudi(); setAperto(true); setDettaglio(id);
      void qc.invalidateQueries({ queryKey: ["uscite-senza-fattura"] });
      void qc.invalidateQueries({ queryKey: ["fattura-allegati"] });
      void qc.invalidateQueries({ queryKey: ["fattura-allegati-conteggi"] });
    },
    // Il messaggio tecnico («violates row-level security policy») non diceva cosa fare.
    onError: (e) => toast.error("Uscita non salvata", { description: userErrorMessage(e, "Non sono riuscito a salvarla. Riprova.") }),
  });
  // Se poi arriva la fattura vera, l'uscita si toglie: prima la finestra lo diceva ma non si poteva.
  const [daEliminare, setDaEliminare] = useState<Uscita | null>(null);
  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { data: allegati } = await db.from("fattura_allegati").select("storage_path").eq("company_id", companyId).eq("company_cost_id", id);
      const { data, error } = await db.from("company_costs").delete().eq("id", id).eq("company_id", companyId).eq("senza_fattura", true).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Non hai i permessi per questa operazione. Chiedi al titolare dell'azienda di darti l'accesso.");
      // Le righe degli allegati vanno via col costo; i file si tolgono dall'archivio.
      const percorsi = ((allegati ?? []) as Array<{ storage_path: string }>).map((a) => a.storage_path).filter(Boolean);
      if (percorsi.length) await supabase.storage.from("fatture-allegati").remove(percorsi);
    },
    onSuccess: () => { toast.success("Uscita eliminata"); setDaEliminare(null); setDettaglio(null); void qc.invalidateQueries({ queryKey: ["uscite-senza-fattura"] }); },
    onError: (e) => toast.error("Uscita non eliminata", { description: userErrorMessage(e, "Non sono riuscito a eliminarla. Riprova.") }),
  });
  const errore = erroreUscita(form);
  const opzioniCommesse = useMemo(() => (scelte?.commesse ?? []).map((x) => ({ value: x.id, label: [x.order_code, x.description].filter(Boolean).join(" · ") || "Commessa" })), [scelte]);
  const totale = uscite.reduce((s, u) => s + Number(u.amount ?? 0), 0);
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="flex flex-1 items-center gap-2 text-left text-sm font-medium" aria-expanded={aperto} onClick={() => setAperto((v) => !v)}>
            <ChevronDown className={`h-4 w-4 transition-transform ${aperto ? "rotate-180" : ""}`} />
            Uscite senza fattura · {uscite.length}{uscite.length > 0 ? ` · ${formatCurrency(totale)}` : ""}
          </button>
          {puoModificare && <Button size="sm" variant="outline" onClick={() => setDialogo(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Nuova uscita</Button>}
        </div>
        {aperto && (
          <div className="mt-3 divide-y rounded-md border">
            {!uscite.length && <p className="p-3 text-sm text-muted-foreground">Bollo, tasse, spese senza fattura: registrale qui, con i documenti. Non entrano nel registro IVA.</p>}
            {uscite.map((u) => (
              <div key={u.id} className="p-2 text-sm">
                <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" aria-expanded={dettaglio === u.id} onClick={() => setDettaglio((d) => (d === u.id ? null : u.id))}>
                  <Badge variant="outline">Senza fattura</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{[u.suppliers?.name, u.orders?.order_code, u.allocations?.length ? `${u.allocations.length} commesse` : null, u.mezzi?.nome, u.documento_riferimento, formatDateShort(u.documento_data ?? u.due_date)].filter(Boolean).join(" · ")}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(u.amount)}</span>
                  <span className={`text-xs ${u.is_paid ? "text-emerald-600" : "text-amber-700"}`}>{u.is_paid ? "Pagata" : "Da pagare"}</span>
                </button>
                {dettaglio === u.id && <div className="mt-2 space-y-2 border-t pt-2">{puoModificare && <div className="flex gap-2"><Button size="sm" variant="outline" className="h-7" onClick={() => apriModifica(u)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Modifica</Button><Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setDaEliminare(u)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Elimina</Button></div>}{u.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{u.notes}</p>}<AllegatiFattura companyId={companyId} madre={{ costoId: u.id }} sola_lettura={!puoModificare} /></div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={dialogo} onOpenChange={(v) => (v ? setDialogo(true) : chiudi())}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{inModifica ? "Modifica uscita senza fattura" : "Nuova uscita senza fattura"}</DialogTitle>
            <DialogDescription>Non è una fattura: non entra nel registro IVA. Se poi arriva la fattura vera, questa va tolta per non contare il costo due volte.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="us-desc">Cos'è</Label><Input id="us-desc" value={form.descrizione} maxLength={200} onChange={(e) => set("descrizione", e.target.value)} placeholder="Bollo, tassa comunale…" /></div>
            <div className="space-y-1"><Label htmlFor="us-imp">Importo €</Label><Input id="us-imp" inputMode="decimal" value={form.imponibile} onChange={(e) => set("imponibile", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="us-iva">IVA %</Label><Input id="us-iva" inputMode="decimal" value={form.aliquota} onChange={(e) => set("aliquota", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="us-data">Data</Label><Input id="us-data" type="date" value={form.data} onChange={(e) => set("data", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="us-mese">Mese di competenza</Label><Input id="us-mese" type="month" value={meseMostrato(form)} onChange={(e) => set("mese", e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="us-rif">Riferimento del documento</Label><Input id="us-rif" value={form.riferimento} maxLength={100} onChange={(e) => set("riferimento", e.target.value)} placeholder="Numero ricevuta, avviso…" /></div>
            {/* Fornitore con la ricerca e il «+» per crearlo (12/11/2026): era una tendina con
                tutti i fornitori, senza ricerca, che non si scorreva bene con le frecce o col
                trackpad; e chi non c'era (il Comune, per una tassa) non si poteva aggiungere. */}
            <div className="space-y-1 sm:col-span-2">
              <Label>Fornitore o ente</Label>
              <SupplierSelect value={form.fornitoreId} onValueChange={(v) => set("fornitoreId", v ?? "")} fallbackCompanyId={companyId} searchable allowCreate />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>{form.commesse.length > 1 ? "Commesse e quota" : "Commessa"}</Label>
              {form.commesse.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ViaggioSelect
                      label={`Commessa ${i + 1}`}
                      value={c.id || NESSUNO}
                      onValueChange={(v) => cambiaCommessa(i, v === NESSUNO ? "" : v)}
                      emptyMessage="Nessuna corrispondenza."
                      options={[{ value: NESSUNO, label: "Nessuna" }, ...opzioniCommesse]}
                    />
                  </div>
                  {form.commesse.length > 1 && (
                    <>
                      <Input aria-label={`Quota commessa ${i + 1} %`} inputMode="decimal" className="w-20" value={c.pct} onChange={(e) => cambiaQuota(i, e.target.value)} />
                      <span className="text-xs text-muted-foreground">%</span>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Togli commessa ${i + 1}`} onClick={() => togliCommessa(i)}><X className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={aggiungiCommessa}><Plus className="mr-1 h-3 w-3" />Dividi su un'altra commessa</Button>
            </div>
            <Scelta etichetta="Mezzo" valore={form.mezzoId} cambia={(v) => set("mezzoId", v)} opzioni={(scelte?.mezzi ?? []).map((x) => [x.id, x.targa ? `${x.nome} · ${x.targa}` : x.nome])} />
            <label className="flex items-center gap-2 self-end text-sm"><Checkbox checked={form.pagata} onCheckedChange={(v) => set("pagata", v === true)} />Già pagata</label>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="us-note">Note</Label><Textarea id="us-note" rows={2} maxLength={2000} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="A cosa si riferisce, chi l'ha pagata…" /></div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Documenti</Label>
              <input ref={fileInput} type="file" multiple className="hidden" aria-label="Scegli i documenti" onChange={(e) => { const nuovi = Array.from(e.target.files ?? []); setFile((f) => [...f, ...nuovi]); e.target.value = ""; }} />
              {file.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{dimensioneLeggibile(f.size)}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label={`Togli ${f.name}`} onClick={() => setFile((l) => l.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}><Paperclip className="mr-1.5 h-3.5 w-3.5" />Allega ricevuta, F24, foto…</Button>
            </div>
          </div>
          {errore && form.descrizione && <p className="text-xs text-muted-foreground">{errore}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={chiudi}>Annulla</Button>
            <Button disabled={!!errore || salva.isPending} onClick={() => salva.mutate()}>{inModifica ? "Salva modifiche" : "Salva"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!daEliminare} onOpenChange={(v) => { if (!v) setDaEliminare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Il costo esce dai conti, insieme ai documenti allegati. Non si recupera.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={elimina.isPending} onClick={() => daEliminare && elimina.mutate(daEliminare.id)}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Scelta({ etichetta, valore, cambia, opzioni }: { etichetta: string; valore: string; cambia: (v: string) => void; opzioni: Array<[string, string]> }) {
  // Con la ricerca, come il fornitore: frecce, Invio e scorrimento funzionano anche dentro la finestra.
  return (
    <div className="space-y-1">
      <Label>{etichetta}</Label>
      <ViaggioSelect
        label={etichetta}
        value={valore || NESSUNO}
        onValueChange={(v) => cambia(v === NESSUNO ? "" : v)}
        emptyMessage="Nessuna corrispondenza."
        options={[{ value: NESSUNO, label: "Nessuno" }, ...opzioni.map(([value, label]) => ({ value, label }))]}
      />
    </div>
  );
}

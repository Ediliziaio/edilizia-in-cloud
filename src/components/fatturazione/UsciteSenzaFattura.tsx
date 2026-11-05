/**
 * Le uscite senza fattura: bollo, tassa, F24 di un cantiere. Stanno accanto alle fatture dei fornitori con
 * un'etichetta chiara, ma non sono fatture: fuori dal registro IVA e dai totali dei documenti.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { erroreUscita, rigaUscita, type FormUscita } from "@/lib/costi/usciteSenzaFattura";
import { AllegatiFattura } from "@/components/fatturazione/AllegatiFattura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const NESSUNO = "__nessuno__";

interface Uscita {
  id: string; name: string; amount: number; vat_rate: number | null; documento_data: string | null; due_date: string; documento_riferimento: string | null;
  mese_competenza: string | null; is_paid: boolean; suppliers: { name: string } | null; orders: { order_code: string | null } | null; mezzi: { nome: string } | null;
}

export function UsciteSenzaFattura({ companyId, puoModificare }: { companyId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const oggi = useMemo(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }), []);
  const vuoto: FormUscita = { descrizione: "", imponibile: "", aliquota: "0", data: oggi, mese: "", riferimento: "", fornitoreId: "", commessaId: "", mezzoId: "", pagata: true };
  const [form, setForm] = useState<FormUscita>(vuoto);
  const set = <K extends keyof FormUscita>(k: K, v: FormUscita[K]) => setForm((f) => ({ ...f, [k]: v }));
  const { data: uscite = [] } = useQuery({
    queryKey: ["uscite-senza-fattura", companyId],
    queryFn: () => tutteLePagine<Uscita>((from, to) => db.from("company_costs")
      .select("id, name, amount, vat_rate, documento_data, due_date, documento_riferimento, mese_competenza, is_paid, suppliers(name), orders(order_code), mezzi(nome)")
      .eq("company_id", companyId).eq("senza_fattura", true).order("due_date", { ascending: false }).order("id").range(from, to)),
  });
  const { data: scelte } = useQuery({
    queryKey: ["uscite-senza-fattura-scelte", companyId],
    enabled: dialogo,
    queryFn: async () => {
      const [f, o, m] = await Promise.all([
        tutteLePagine<{ id: string; name: string }>((from, to) => db.from("suppliers").select("id, name").eq("company_id", companyId).order("name").order("id").range(from, to)),
        db.from("orders").select("id, order_code, description").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        db.from("mezzi").select("id, nome, targa").eq("company_id", companyId).is("deleted_at", null).order("nome").limit(1000),
      ]);
      return { fornitori: f, commesse: (o.data ?? []) as Array<{ id: string; order_code: string | null; description: string | null }>, mezzi: (m.data ?? []) as Array<{ id: string; nome: string; targa: string | null }> };
    },
  });
  const salva = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.from("company_costs").insert(rigaUscita(form, companyId)).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Uscita registrata: ora puoi allegare i documenti");
      setDialogo(false); setForm(vuoto); setAperto(true); setDettaglio(id);
      void qc.invalidateQueries({ queryKey: ["uscite-senza-fattura"] });
    },
    onError: (e) => toast.error("Uscita non salvata", { description: e instanceof Error ? e.message : String(e) }),
  });
  const errore = erroreUscita(form);
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
                  <span className="text-xs text-muted-foreground">{[u.suppliers?.name, u.orders?.order_code, u.mezzi?.nome, u.documento_riferimento, formatDateShort(u.documento_data ?? u.due_date)].filter(Boolean).join(" · ")}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(u.amount)}</span>
                  <span className={`text-xs ${u.is_paid ? "text-emerald-600" : "text-amber-700"}`}>{u.is_paid ? "Pagata" : "Da pagare"}</span>
                </button>
                {dettaglio === u.id && <div className="mt-2 border-t pt-2"><AllegatiFattura companyId={companyId} madre={{ costoId: u.id }} sola_lettura={!puoModificare} /></div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Nuova uscita senza fattura</DialogTitle>
            <DialogDescription>Non è una fattura: non entra nel registro IVA. Se poi arriva la fattura vera, questa va tolta per non contare il costo due volte.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="us-desc">Cos'è</Label><Input id="us-desc" value={form.descrizione} maxLength={200} onChange={(e) => set("descrizione", e.target.value)} placeholder="Bollo, tassa comunale…" /></div>
            <div className="space-y-1"><Label htmlFor="us-imp">Importo €</Label><Input id="us-imp" inputMode="decimal" value={form.imponibile} onChange={(e) => set("imponibile", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="us-iva">IVA %</Label><Input id="us-iva" inputMode="decimal" value={form.aliquota} onChange={(e) => set("aliquota", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="us-data">Data</Label><Input id="us-data" type="date" value={form.data} onChange={(e) => set("data", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="us-mese">Mese di competenza</Label><Input id="us-mese" type="month" value={form.mese} onChange={(e) => set("mese", e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="us-rif">Riferimento del documento</Label><Input id="us-rif" value={form.riferimento} maxLength={100} onChange={(e) => set("riferimento", e.target.value)} placeholder="Numero ricevuta, avviso…" /></div>
            <Scelta etichetta="Fornitore" valore={form.fornitoreId} cambia={(v) => set("fornitoreId", v)} opzioni={(scelte?.fornitori ?? []).map((x) => [x.id, x.name])} />
            <Scelta etichetta="Commessa" valore={form.commessaId} cambia={(v) => set("commessaId", v)} opzioni={(scelte?.commesse ?? []).map((x) => [x.id, [x.order_code, x.description].filter(Boolean).join(" · ") || "Commessa"])} />
            <Scelta etichetta="Mezzo" valore={form.mezzoId} cambia={(v) => set("mezzoId", v)} opzioni={(scelte?.mezzi ?? []).map((x) => [x.id, x.targa ? `${x.nome} · ${x.targa}` : x.nome])} />
            <label className="flex items-center gap-2 self-end text-sm"><Checkbox checked={form.pagata} onCheckedChange={(v) => set("pagata", v === true)} />Già pagata</label>
          </div>
          {errore && form.descrizione && <p className="text-xs text-muted-foreground">{errore}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(false)}>Annulla</Button>
            <Button disabled={!!errore || salva.isPending} onClick={() => salva.mutate()}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Scelta({ etichetta, valore, cambia, opzioni }: { etichetta: string; valore: string; cambia: (v: string) => void; opzioni: Array<[string, string]> }) {
  return (
    <div className="space-y-1">
      <Label>{etichetta}</Label>
      <Select value={valore || NESSUNO} onValueChange={(v) => cambia(v === NESSUNO ? "" : v)}>
        <SelectTrigger aria-label={etichetta}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NESSUNO}>Nessuno</SelectItem>
          {opzioni.map(([id, testo]) => <SelectItem key={id} value={id}>{testo}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

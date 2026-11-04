/** Mezzi e DDT di una fattura ricevuta: li propone il sistema, una persona conferma. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link2, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const errore = (e: unknown) => toast.error("Non salvato", { description: e instanceof Error ? e.message : String(e) });

interface LegameMezzo { id: string; mezzo_id: string; importo: number | null; origine: string; confermata: boolean; mezzi: { nome: string; targa: string | null } | null }
interface LegameDdt { id: string; numero_ddt: string; data_ddt: string | null; origine: string; ddt_ricezione_id: string | null }

export function CollegamentiFattura({ fatturaId, companyId, puoModificare }: { fatturaId: string; companyId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const chiave = ["fattura-collegamenti", fatturaId];
  const { data } = useQuery({
    queryKey: chiave,
    queryFn: async () => {
      const [m, d] = await Promise.all([
        db.from("fattura_ricevuta_mezzi").select("id, mezzo_id, importo, origine, confermata, mezzi(nome, targa)").eq("fattura_ricevuta_id", fatturaId).order("created_at"),
        db.from("fattura_ddt").select("id, numero_ddt, data_ddt, origine, ddt_ricezione_id").eq("fattura_ricevuta_id", fatturaId).order("data_ddt"),
      ]);
      if (m.error) throw m.error;
      if (d.error) throw d.error;
      return { mezzi: (m.data ?? []) as LegameMezzo[], ddt: (d.data ?? []) as LegameDdt[] };
    },
  });
  const { data: tuttiMezzi = [] } = useQuery({
    queryKey: ["fattura-collegamenti-mezzi", companyId],
    enabled: puoModificare,
    queryFn: async () => {
      const { data: righe, error } = await db.from("mezzi").select("id, nome, targa").eq("company_id", companyId).is("deleted_at", null).order("nome").limit(1000);
      if (error) throw error;
      return (righe ?? []) as Array<{ id: string; nome: string; targa: string | null }>;
    },
  });
  const aggiorna = () => {
    void qc.invalidateQueries({ queryKey: chiave });
    void qc.invalidateQueries({ queryKey: ["mezzo-fatture"] });
  };
  const conferma = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("fattura_ricevuta_mezzi").update({ confermata: true, confermata_da: u.user?.id ?? null, confermata_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna, onError: errore,
  });
  const togliMezzo = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("fattura_ricevuta_mezzi").delete().eq("id", id); if (error) throw error; },
    onSuccess: aggiorna, onError: errore,
  });
  const aggiungiMezzo = useMutation({
    mutationFn: async (mezzoId: string) => {
      const { error } = await db.from("fattura_ricevuta_mezzi").insert({ company_id: companyId, fattura_ricevuta_id: fatturaId, mezzo_id: mezzoId, origine: "manuale", confermata: true });
      if (error) throw error;
    },
    onSuccess: aggiorna, onError: errore,
  });
  const [numero, setNumero] = useState("");
  const [dataDdt, setDataDdt] = useState("");
  const aggiungiDdt = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("fattura_ddt").insert({ company_id: companyId, fattura_ricevuta_id: fatturaId, numero_ddt: numero.trim(), data_ddt: dataDdt || null, origine: "manuale" });
      if (error) throw error;
    },
    onSuccess: () => { setNumero(""); setDataDdt(""); aggiorna(); }, onError: errore,
  });
  const togliDdt = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("fattura_ddt").delete().eq("id", id); if (error) throw error; },
    onSuccess: aggiorna, onError: errore,
  });
  const collegati = new Set((data?.mezzi ?? []).map((m) => m.mezzo_id));
  const liberi = tuttiMezzi.filter((m) => !collegati.has(m.id));
  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Truck className="h-4 w-4" /> Mezzi</h3>
        {(data?.mezzi ?? []).map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{m.mezzi?.nome ?? "Mezzo"}{m.mezzi?.targa ? ` · ${m.mezzi.targa}` : ""}</span>
            {m.importo != null && <span className="text-muted-foreground">{formatCurrency(m.importo)}</span>}
            {!m.confermata && <Badge variant="outline">Proposto dalla targa</Badge>}
            {puoModificare && !m.confermata && <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Conferma ${m.mezzi?.nome ?? "mezzo"}`} title="Conferma" onClick={() => conferma.mutate(m.id)}><Check className="h-3.5 w-3.5" /></Button>}
            {puoModificare && <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Togli ${m.mezzi?.nome ?? "mezzo"}`} title="Togli" onClick={() => togliMezzo.mutate(m.id)}><X className="h-3.5 w-3.5" /></Button>}
          </div>
        ))}
        {puoModificare && liberi.length > 0 && (
          <Select value="" onValueChange={(v) => aggiungiMezzo.mutate(v)}>
            <SelectTrigger className="h-8 w-64" aria-label="Collega a un mezzo"><SelectValue placeholder="Collega a un mezzo…" /></SelectTrigger>
            <SelectContent>{liberi.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}{m.targa ? ` · ${m.targa}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4" /> DDT</h3>
        <div className="flex flex-wrap gap-1.5">
          {(data?.ddt ?? []).map((d) => (
            <Badge key={d.id} variant="outline" className="gap-1 font-normal">
              {d.ddt_ricezione_id ? <a className="underline" href={`/azienda/ddt/${d.ddt_ricezione_id}`}>{d.numero_ddt}</a> : d.numero_ddt}
              {d.data_ddt ? ` · ${formatDateShort(d.data_ddt)}` : ""}
              {puoModificare && <button type="button" aria-label={`Togli DDT ${d.numero_ddt}`} onClick={() => togliDdt.mutate(d.id)}><X className="h-3 w-3" /></button>}
            </Badge>
          ))}
          {!data?.ddt.length && <span className="text-sm text-muted-foreground">Nessun DDT</span>}
        </div>
        {puoModificare && (
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-8 w-32" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={100} placeholder="Numero DDT" aria-label="Numero DDT" />
            <Input className="h-8 w-40" type="date" value={dataDdt} onChange={(e) => setDataDdt(e.target.value)} aria-label="Data DDT" />
            <Button size="sm" variant="outline" className="h-8" disabled={!numero.trim() || aggiungiDdt.isPending} onClick={() => aggiungiDdt.mutate()}>Aggiungi</Button>
          </div>
        )}
      </div>
    </section>
  );
}

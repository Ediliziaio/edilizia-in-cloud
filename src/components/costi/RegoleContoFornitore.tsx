import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { etichettaCategoria } from "@/lib/fatturazione/contoPerRiga";
import { corrispondeRicercaRicevute, terminiRicercaRicevute } from "@/lib/fatturazione/ricercaRicevute";
import { normalizeVatNumber } from "@/lib/suppliers/anagraficaFornitore";

type Categoria = { id: string; name: string };

export function RegoleContoFornitore({ companyId, categorie, modifica, onClose }: {
  companyId: string; categorie: Categoria[]; modifica: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [cerca, setCerca] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [categoria, setCategoria] = useState<{ attesa: string; scelta: string } | null>(null);
  const [regolaCambiata, setRegolaCambiata] = useState(false);
  const chiave = ["fornitori-conti-costo", companyId];
  const archivio = () => supabase.from("fornitori_conti_costo");
  const regole = useQuery({
    queryKey: chiave,
    queryFn: () => tutteLePagine((da, a) => archivio().select("fornitore_id,categoria_id")
      .eq("company_id", companyId).order("fornitore_id").range(da, a)),
  });
  const fornitori = useQuery({
    queryKey: ["fornitori-regole-costi", companyId],
    queryFn: () => tutteLePagine((da, a) => supabase.from("suppliers")
      .select("id,name,vat_number,fiscal_code").eq("company_id", companyId).order("name").order("id").range(da, a)),
  });
  const corrente = regole.data?.find(r => r.fornitore_id === fornitore)?.categoria_id ?? "";
  const assegnata = categoria?.scelta ?? corrente;
  const salva = useMutation({
    mutationFn: async ({ attesa, selezionata }: { attesa: string; selezionata: string | null }) => {
      if (!attesa && selezionata) {
        const { error } = await archivio().insert({ company_id: companyId, fornitore_id: fornitore, categoria_id: selezionata });
        if (error?.code === "23505") return false;
        if (error) throw error;
        return true;
      }
      const modificaRegola = selezionata ? archivio().update({ categoria_id: selezionata }) : archivio().delete();
      const { data, error } = await modificaRegola.eq("company_id", companyId).eq("fornitore_id", fornitore)
        .eq("categoria_id", attesa).select("fornitore_id").maybeSingle();
      if (error) throw error;
      return !!data;
    },
    onSuccess: async (applicata, { selezionata }) => {
      await qc.invalidateQueries({ queryKey: chiave });
      setCategoria(null);
      setRegolaCambiata(!applicata);
      if (applicata) toast.success(selezionata ? "Conto predefinito salvato" : "Regola rimossa");
    },
    onError: () => toast.error("Regola non salvata. Verifica i permessi e riprova."),
  });
  const scegli = (id: string) => { setFornitore(id); setCategoria(null); setRegolaCambiata(false); };
  const termini = terminiRicercaRicevute(cerca);
  const numeroFiscale = /\d/.test(cerca) ? normalizeVatNumber(cerca) : "";
  const numeroCorrisponde = (valore: string | null) => !!valore && !!numeroFiscale
    && normalizeVatNumber(valore).replace(/^IT(?=\d)/, "").includes(numeroFiscale.replace(/^IT(?=\d)/, ""));
  const filtrati = (fornitori.data ?? []).filter(f =>
    f.id === fornitore || corrispondeRicercaRicevute(termini, [f.name, f.vat_number, f.fiscal_code])
    || numeroCorrisponde(f.vat_number) || numeroCorrisponde(f.fiscal_code));
  const stati = new Map((regole.data ?? []).map(r => [r.fornitore_id, r.categoria_id]));
  const attive = (fornitori.data ?? []).filter(f => stati.has(f.id));
  const carica = fornitori.isLoading || regole.isLoading;
  const errore = fornitori.isError || regole.isError;
  const bloccato = !modifica || salva.isPending;
  return <Dialog open onOpenChange={open => { if (!open && !salva.isPending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Conto predefinito per fornitore</DialogTitle>
        <DialogDescription>Il conto si applica alle nuove fatture del fornitore e alle ricevute appena collegate, se sono ancora da contabilizzare e senza conto.</DialogDescription>
      </DialogHeader>
      {carica && <p role="status" className="text-sm">Carico fornitori e regole…</p>}
      {errore && <p role="alert" className="text-sm">Fornitori o regole non disponibili. <button type="button" className="underline" onClick={() => { void fornitori.refetch(); void regole.refetch(); }}>Riprova</button></p>}
      {!errore && !carica && <>
        {modifica && <div className="grid gap-3 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="regola-cerca-fornitore">Cerca fornitore</Label>
            <Input id="regola-cerca-fornitore" placeholder="Nome, partita IVA o codice fiscale" value={cerca} onChange={e => setCerca(e.target.value)} disabled={bloccato} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="regola-fornitore">Fornitore</Label>
              <select id="regola-fornitore" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={fornitore} onChange={e => scegli(e.target.value)} disabled={bloccato}>
                <option value="">{filtrati.length ? "Seleziona fornitore" : "Nessun fornitore trovato"}</option>
                {filtrati.map(f => <option key={f.id} value={f.id}>{f.name}{f.vat_number ? ` · ${f.vat_number}` : ""}</option>)}
              </select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="regola-categoria">Conto di costo</Label>
              <select id="regola-categoria" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={assegnata}
                onChange={e => setCategoria({ attesa: categoria?.attesa ?? corrente, scelta: e.target.value })} disabled={bloccato || !fornitore}>
                <option value="">Seleziona conto</option>
                {categorie.map(c => <option key={c.id} value={c.id}>{etichettaCategoria(c.name)}</option>)}
              </select>
            </div>
          </div>
          {!categorie.length && <p className="text-sm text-muted-foreground">Aggiungi il conto in Categorie costi per poterlo selezionare.</p>}
          {regolaCambiata && <p role="alert" className="text-sm text-destructive">
            La regola è cambiata o non è più modificabile. Controlla il conto attuale prima di riprovare.
          </p>}
          <div className="flex justify-end gap-2">
            {corrente && <Button variant="outline" size="sm" disabled={bloccato} onClick={() => salva.mutate({ attesa: categoria?.attesa ?? corrente, selezionata: null })}>Rimuovi regola</Button>}
            <Button size="sm" disabled={bloccato || !fornitore || !assegnata || assegnata === corrente}
              onClick={() => salva.mutate({ attesa: categoria?.attesa ?? corrente, selezionata: assegnata })}>Salva regola</Button>
          </div>
        </div>}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Regole attive</h3>
          {attive.length ? <ul className="divide-y rounded-md border">
            {attive.map(f => <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>{f.name}</span>
              <span className="text-muted-foreground">{etichettaCategoria(categorie.find(c => c.id === stati.get(f.id))?.name ?? "—")}</span>
              {modifica && <Button variant="ghost" size="sm" disabled={bloccato} onClick={() => scegli(f.id)}>Modifica</Button>}
            </li>)}
          </ul> : <p className="text-sm text-muted-foreground">Nessuna regola visibile per i fornitori di questa azienda.</p>}
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}

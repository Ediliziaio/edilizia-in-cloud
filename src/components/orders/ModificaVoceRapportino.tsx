import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { misuraRapportino } from "@/lib/campo/correzioneRapportino";
import { dettagliViaggio, leggiDettagliViaggio, misureViaggioValide, unitaChilometro, voceTrasporto, type BozzaViaggio } from "@/lib/campo/viaggiRapportino";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampiViaggioRapportino } from "./CampiViaggioRapportino";

export function ModificaVoceRapportino({ id, rapportinoId, nome }: { id: string; rapportinoId: string; nome: string }) {
  const [aperto, setAperto] = useState(false);
  return <>
    <button type="button" aria-label={`Modifica ${nome}`} className="tap-compact rounded p-1 text-blue-700" onClick={() => setAperto(true)}><PenLine className="h-3.5 w-3.5" /></button>
    {aperto && <Editor id={id} rapportinoId={rapportinoId} onClose={() => setAperto(false)} />}
  </>;
}

type VoceLetta = { descrizione: string; quantita: number; unita: string; costo_unitario: number | null; vendita_unitaria?: number | null; viaggio: unknown; updated_at: string; order_id: string };
type Bozza = { descrizione: string; quantita: string; unita: string; costo: string; vendita: string; motivo: string; viaggio?: BozzaViaggio; updatedAt: string; orderId: string };
function Editor({ id, rapportinoId, onClose }: { id: string; rapportinoId: string; onClose: () => void }) {
  const { effectiveCompany } = useAuth();
  const { canViewOrderAmounts } = usePermissions();
  const q = useQuery({
    queryKey: ["rapportino-voce-correggere", effectiveCompany?.id, rapportinoId, id], retry: false, staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("rapportino_voci_libere")
        .select(`id, order_id, descrizione, quantita, unita, costo_unitario, updated_at, viaggio${canViewOrderAmounts ? ", vendita_unitaria" : ""}`)
        .eq("id", id).eq("rapportino_id", rapportinoId).eq("company_id", effectiveCompany!.id).single();
      if (error) throw error;
      return data as unknown as VoceLetta;
    },
  });
  if (!q.data || q.isError) return <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Modifica voce del rapportino</DialogTitle></DialogHeader>
    {q.isError ? <p role="alert">Voce non disponibile. <Button variant="outline" onClick={() => void q.refetch()}>Riprova</Button></p> : <p role="status">Carico…</p>}<Button variant="outline" onClick={onClose}>Annulla</Button></DialogContent></Dialog>;
  return <FormVoce id={id} onClose={onClose} v={q.data} fetching={q.isFetching} />;
}
function FormVoce({ id, onClose, v, fetching }: { id: string; onClose: () => void; v: VoceLetta; fetching: boolean }) {
  const { effectiveCompany } = useAuth();
  const { canViewOrderAmounts } = usePermissions();
  const qc = useQueryClient();
  const [b, setB] = useState<Bozza>(() => ({ descrizione: v.descrizione, quantita: String(v.quantita), unita: v.unita, costo: v.costo_unitario == null ? "" : String(v.costo_unitario),
      vendita: v.vendita_unitaria == null ? "" : String(v.vendita_unitaria), motivo: "", updatedAt: v.updated_at, orderId: v.order_id,
      viaggio: v.viaggio ? Object.fromEntries(Object.entries(leggiDettagliViaggio(v.viaggio)).map(([k, valore]) => [k, String(valore)])) : undefined }));
  const salva = useMutation({
    mutationFn: async () => {
      if (!b || !b.descrizione.trim() || !b.unita.trim()) throw new Error("Scrivi descrizione e unità.");
      const quantita = misuraRapportino(b.quantita, "Quantità");
      if (!quantita) throw new Error("La quantità deve essere maggiore di zero.");
      if (b.viaggio && !misureViaggioValide(b.viaggio)) throw new Error("Controlla chilometri e ore del viaggio.");
      const campi = { descrizione: b.descrizione.trim(), quantita, unita: b.unita.trim(),
        costo_unitario: b.costo.trim() ? misuraRapportino(b.costo, "Costo unitario") : null,
        ...(canViewOrderAmounts ? { vendita_unitaria: b.vendita.trim() ? misuraRapportino(b.vendita, "Vendita unitaria") : null } : {}),
        ...(b.viaggio || voceTrasporto(b.descrizione, b.unita) ? { viaggio: dettagliViaggio(b.viaggio ?? {}, b.unita, b.quantita) } : {}) };
      const { error } = await (supabase as unknown as { rpc: (f: string, p: object) => Promise<{ error: { message: string } | null }> })
        .rpc("rapportino_voce_correggi", { p_id: id, p_updated_at: b.updatedAt, p_campi: campi, p_motivo: b.motivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refreshWorkQueries(qc, b!.orderId, effectiveCompany?.id);
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && /rapport|appalto-rendiconto/.test(queryKey[0]) });
      toast.success("Voce corretta. Se il rapportino è tornato in attesa, serve una nuova approvazione."); onClose();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Correzione non salvata"),
  });
  return <Dialog open onOpenChange={(o) => { if (!o && !salva.isPending) onClose(); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Modifica voce del rapportino</DialogTitle></DialogHeader>
      {<fieldset disabled={salva.isPending} className="grid gap-3">
        <label className="text-sm">Descrizione<Input value={b.descrizione} onChange={(e) => setB({ ...b, descrizione: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Quantità<Input inputMode="decimal" value={b.quantita} onChange={(e) => setB({ ...b, quantita: e.target.value })} /></label>
          <label className="text-sm">Unità<Input value={b.unita} onChange={(e) => setB({ ...b, unita: e.target.value })} /></label>
          <label className="text-sm">Costo unitario<Input inputMode="decimal" value={b.costo} onChange={(e) => setB({ ...b, costo: e.target.value })} /></label>
          {canViewOrderAmounts && <label className="text-sm">Vendita unitaria<Input inputMode="decimal" value={b.vendita} onChange={(e) => setB({ ...b, vendita: e.target.value })} /></label>}
        </div>
        {(b.viaggio || voceTrasporto(b.descrizione, b.unita)) && <CampiViaggioRapportino valore={b.viaggio ?? {}} quantitaInKm={unitaChilometro(b.unita)} onChange={(viaggio) => setB({ ...b, viaggio })} />}
        <label className="text-sm">Motivo della correzione<Input placeholder="Obbligatorio sui rapportini approvati" value={b.motivo} onChange={(e) => setB({ ...b, motivo: e.target.value })} /></label>
        <p className="text-xs text-muted-foreground">La voce mantiene il collegamento al listino. Costi e rendiconto in bozza si aggiornano insieme; i documenti confermati o firmati impediscono la modifica.</p>
      </fieldset>}
      <DialogFooter><Button variant="outline" disabled={salva.isPending} onClick={onClose}>Annulla</Button><Button disabled={!b || fetching || salva.isPending} onClick={() => salva.mutate()}>Salva modifiche</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

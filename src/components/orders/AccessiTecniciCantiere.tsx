import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";

export function AccessiTecniciCantiere({ orderId, capo }: { orderId: string; capo?: string }) {
  const { user, effectiveCompany, profile } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  const chiave = ["commessa-accessi-tecnici", orderId, companyId, user?.id];
  const qc = useQueryClient();
  const [persona, setPersona] = useState("");
  const accessi = useQuery({
    queryKey: chiave,
    enabled: !!companyId && !!user?.id,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("commessa_accessi_tecnici", { p_ordine: orderId }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
  const persone = accessi.data ?? [];
  const abilitati = persone.filter(p => p.abilitato);
  const candidati = persone.filter(p => p.ammissibile && !p.abilitato && p.id !== capo);
  const salva = useMutation({
    mutationFn: async ({ id, consenti }: { id: string; consenti: boolean }) => {
      const { error } = await supabase.rpc("commessa_accesso_tecnico", {
        p_ordine: orderId, p_persona: id, p_consentito: consenti,
      });
      if (error) throw error;
    },
    onSuccess: async (_dati, { consenti }) => {
      setPersona("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: chiave }),
        qc.invalidateQueries({ queryKey: ["campo-cantieri-tecnici", companyId] }),
        qc.invalidateQueries({ queryKey: ["campo-scheda-cantiere", orderId, companyId] }),
      ]);
      toast.success(consenti ? "Accesso alla scheda attivato" : "Accesso alla scheda rimosso");
    },
    onError: (error: { code?: string; message?: string }) => {
      toast.error(error.code === "22023" ? error.message || "Persona non disponibile." : "Non riesco ad aggiornare l’accesso. Riprova.");
    },
  });

  return <section aria-label="Accessi a piano e documenti" className="space-y-2 rounded-lg border bg-background p-3">
    <div>
      <h3 className="text-sm font-semibold">Accessi a piano e documenti</h3>
      <p className="text-xs text-muted-foreground">Abilita geometri o altre persone del team alla consultazione. Il capocantiere accede in automatico.</p>
    </div>
    {accessi.isError ? <p role="alert" className="text-sm">Accessi non disponibili.{" "}
      <button type="button" className="min-h-11 font-medium underline" onClick={() => void accessi.refetch()}>Riprova</button></p>
      : accessi.isPending ? <p role="status" className="text-xs text-muted-foreground">Carico gli accessi…</p> : <>
        {!!abilitati.length && <ul className="divide-y text-sm" aria-label="Persone abilitate">
          {abilitati.map(p => <li key={p.id} className="flex min-h-11 items-center justify-between gap-2">
            <span className="min-w-0 break-words">{p.nome}{p.id === capo && " · Capocantiere"}</span>
            <Button size="sm" variant="ghost" type="button" className="min-h-11 shrink-0"
              aria-label={`Revoca accesso di ${p.nome}`}
              disabled={salva.isPending} onClick={() => salva.mutate({ id: p.id, consenti: false })}>Revoca</Button>
          </li>)}
        </ul>}
        {candidati.length === 0 ? <p className="text-xs text-muted-foreground">Nessuna persona da aggiungere.</p>
          : <div className="flex flex-col gap-2 sm:flex-row">
            <UniformSelect aria-label="Persona da abilitare" className="min-h-11 flex-1" value={persona}
              onChange={event => setPersona(event.target.value)} disabled={salva.isPending}>
              <option value="">Scegli una persona</option>
              {candidati.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </UniformSelect>
            <Button type="button" className="min-h-11 shrink-0" disabled={!persona || salva.isPending || !candidati.some(u => u.id === persona)}
              onClick={() => salva.mutate({ id: persona, consenti: true })}>Abilita consultazione</Button>
          </div>}
      </>}
  </section>;
}

/** Le voci che l'azienda usa nei rapportini: si attivano qui, con unità, costo e vendita già pronti. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface Voce { id: string; nome: string; unita: string; costo_unitario: number | null; vendita_unitaria: number | null; attivo: boolean; ordine: number }
const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const numero = (v: string) => { if (!v.trim()) return null; const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : null; };

function RigaVoce({ voce, puoModificare, onSalva, onTogli }: { voce: Voce; puoModificare: boolean; onSalva: (c: Partial<Voce>) => void; onTogli: () => void }) {
  const [nome, setNome] = useState(voce.nome);
  const [unita, setUnita] = useState(voce.unita);
  const [costo, setCosto] = useState(voce.costo_unitario?.toString() ?? "");
  const [vendita, setVendita] = useState(voce.vendita_unitaria?.toString() ?? "");
  return (
    <li className="grid grid-cols-6 items-center gap-1.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_6rem_auto_auto]">
      <Input aria-label="Nome voce" disabled={!puoModificare} className="col-span-6 h-8 text-[13px] sm:col-span-1" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={() => nome.trim() && nome !== voce.nome && onSalva({ nome: nome.trim() })} />
      <Input aria-label="Unità" disabled={!puoModificare} className="col-span-1 h-8 px-1.5 text-[13px]" value={unita} onChange={(e) => setUnita(e.target.value)} onBlur={() => unita !== voce.unita && onSalva({ unita: unita.trim() || "cad" })} />
      <Input aria-label="Costo" inputMode="decimal" placeholder="Costo €" disabled={!puoModificare} className="col-span-2 h-8 text-[13px] sm:col-span-1" value={costo} onChange={(e) => setCosto(e.target.value)} onBlur={() => onSalva({ costo_unitario: numero(costo) })} />
      <Input aria-label="Vendita" inputMode="decimal" placeholder="Vendita €" disabled={!puoModificare} className="col-span-2 h-8 text-[13px] sm:col-span-1" value={vendita} onChange={(e) => setVendita(e.target.value)} onBlur={() => onSalva({ vendita_unitaria: numero(vendita) })} />
      <Switch aria-label={`Attiva ${voce.nome}`} disabled={!puoModificare} checked={voce.attivo} onCheckedChange={(v) => onSalva({ attivo: v })} />
      {puoModificare && <button type="button" aria-label={`Elimina ${voce.nome}`} onClick={onTogli} className="tap-compact justify-self-end p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
    </li>
  );
}

export default function VociRapportinoConfig() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const { canEditSettingsOrders } = usePermissions();
  const companyId = effectiveCompany?.id;
  const [nuovo, setNuovo] = useState("");
  const chiave = ["rapportino-voci-modello", companyId];
  const voci = useQuery({
    queryKey: chiave, enabled: !!companyId,
    queryFn: async (): Promise<{ voci: Voce[]; aMano: boolean }> => {
      const [a, b] = await Promise.all([
        db.from("rapportino_voci_modello").select("*").eq("company_id", companyId).order("ordine").order("created_at"),
        db.from("rapportino_voci_impostazioni").select("a_mano").eq("company_id", companyId).maybeSingle(),
      ]);
      if (a.error) throw a.error;
      return { voci: a.data ?? [], aMano: b.data?.a_mano ?? true };
    },
  });
  const aggiorna = (): void => { void qc.invalidateQueries({ queryKey: chiave }); };
  const errore = (e: unknown) => toast.error(e instanceof Error ? e.message : "Non salvato");
  const salva = useMutation({ mutationFn: async ({ id, campi }: { id: string; campi: Partial<Voce> }) => { const { error } = await db.from("rapportino_voci_modello").update(campi).eq("id", id); if (error) throw error; }, onSuccess: aggiorna, onError: errore });
  const togli = useMutation({ mutationFn: async (id: string) => { const { error } = await db.from("rapportino_voci_modello").delete().eq("id", id); if (error) throw error; }, onSuccess: aggiorna, onError: errore });
  const aggiungi = useMutation({
    mutationFn: async () => { const { error } = await db.from("rapportino_voci_modello").insert({ company_id: companyId, nome: nuovo.trim(), ordine: voci.data?.voci.length ?? 0 }); if (error) throw error; },
    onSuccess: () => { setNuovo(""); aggiorna(); }, onError: errore,
  });
  const aMano = useMutation({ mutationFn: async (v: boolean) => { const { error } = await db.from("rapportino_voci_impostazioni").upsert({ company_id: companyId, a_mano: v, updated_at: new Date().toISOString() }); if (error) throw error; }, onSuccess: aggiorna, onError: errore });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Voci del rapportino</CardTitle>
        <p className="text-xs text-muted-foreground">Trasporti, noli, smaltimenti: le voci che la tua azienda mette nei rapportini, con costo e vendita. Si scelgono dal rapportino.</p>
      </CardHeader>
      <CardContent className="space-y-3 text-[13px]">
        {(voci.data?.voci.length ?? 0) > 0 && <ul className="divide-y">{voci.data!.voci.map((v) => <RigaVoce key={v.id} voce={v} puoModificare={canEditSettingsOrders} onSalva={(campi) => salva.mutate({ id: v.id, campi })} onTogli={() => togli.mutate(v.id)} />)}</ul>}
        {canEditSettingsOrders && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (nuovo.trim()) aggiungi.mutate(); }}>
            <Input aria-label="Nuova voce" placeholder="Nuova voce (es. Trasporto macerie)" className="h-8 text-[13px]" value={nuovo} onChange={(e) => setNuovo(e.target.value)} />
            <Button type="submit" size="sm" className="h-8 shrink-0" disabled={!nuovo.trim() || aggiungi.isPending}><Plus className="mr-1 h-3.5 w-3.5" />Aggiungi</Button>
          </form>
        )}
        <label className="flex items-center justify-between gap-3 border-t pt-2">
          <span>Permetti anche voci scritte a mano nel rapportino</span>
          <Switch disabled={!canEditSettingsOrders} checked={voci.data?.aMano ?? true} onCheckedChange={(v) => aMano.mutate(v)} />
        </label>
      </CardContent>
    </Card>
  );
}

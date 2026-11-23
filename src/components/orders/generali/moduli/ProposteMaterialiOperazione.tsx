import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";

type GruppoProposte = { order_id: string; phase_id: string | null; fase: string | null; n: number };

export function ProposteMaterialiOperazione({ riepilogo, edificio, edifici, chiudi, apri }: {
  riepilogo: RiepilogoGenerale; edificio: string; edifici: ReadonlyMap<string, string>;
  chiudi: () => void; apri: (id: string, fase: string | null) => void;
}) {
  const companyId = useEffectiveCompanyId();
  const [cerca, setCerca] = useState("");
  const [limite, setLimite] = useState(30);
  const { generale, figlie } = riepilogo;
  const commesse = new Map([...figlie, generale].map(c => [c.id, [c.codice, c.nome].filter(Boolean).join(" · ")]));
  const proposte = useQuery({
    queryKey: ["generale-materiali-operazione", "proposte", companyId, generale.id],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("materiali_proposti_operazione" as never, { p_generale: generale.id } as never);
      if (error) throw error;
      return (data as unknown as GruppoProposte[] | null) ?? [];
    },
  });
  const righe = (proposte.data ?? []).filter(r => (!edificio || edifici.get(r.order_id) === edificio)
    && cercaNellOperazione(cerca, [r.fase, commesse.get(r.order_id), edifici.get(r.order_id)]))
    .sort((a, b) => (commesse.get(a.order_id) ?? "").localeCompare(commesse.get(b.order_id) ?? "", "it", { numeric: true })
      || (a.fase ?? "").localeCompare(b.fase ?? "", "it"));
  const totale = righe.reduce((n, r) => n + Number(r.n), 0);
  return <Dialog open onOpenChange={open => { if (!open) chiudi(); }}>
    <DialogContent className="max-h-[90dvh] max-w-2xl gap-3 overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Proposte dal computo</DialogTitle>
        <DialogDescription>Rivedi le proposte per commessa e fase prima di inserirle negli articoli.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" value={cerca} onChange={e => { setCerca(e.target.value); setLimite(30); }}
          aria-label="Cerca fase o commessa nelle proposte" placeholder="Cerca fase o commessa…" className="h-8 w-auto max-w-full text-sm" />
        {!proposte.isPending && !proposte.isError && <span className="text-xs text-muted-foreground">{totale} da decidere</span>}
      </div>
      {proposte.isPending ? <p role="status" className="text-sm">Carico le proposte…</p>
        : proposte.isError ? <p role="status" className="text-sm">Coda delle proposte non disponibile.{" "}
          <Button size="sm" variant="link" onClick={() => void proposte.refetch()}>Riprova</Button></p>
        : !righe.length ? <p className="rounded-md border p-3 text-sm text-muted-foreground">Nessuna proposta per questa selezione.</p>
        : <ul className="divide-y rounded-md border">{righe.slice(0, limite).map(r => <li key={`${r.order_id}:${r.phase_id ?? ""}`}
          className="flex items-center justify-between gap-2 px-3 py-1.5">
          <div className="min-w-0"><p className="text-sm font-medium">{r.fase ?? "Senza fase"}</p>
            <p className="truncate text-xs text-muted-foreground" title={commesse.get(r.order_id)}>{commesse.get(r.order_id) ?? "Commessa"} · {r.n} {Number(r.n) === 1 ? "proposta" : "proposte"}</p>
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={() => apri(r.order_id, r.phase_id)}>
            Rivedi <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </li>)}</ul>}
      {righe.length > limite && <Button size="sm" variant="outline" onClick={() => setLimite(n => n + 30)}>Mostra altre fasi</Button>}
    </DialogContent>
  </Dialog>;
}

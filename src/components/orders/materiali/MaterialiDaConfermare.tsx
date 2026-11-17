/**
 * I materiali che il computo propone, da confermare (17/11/2026). «Genera dal computo» crea le
 * lavorazioni e PROPONE i materiali (materiali_proponi): qui si spuntano quelli da comprare e
 * «Inserisci negli articoli» li mette nelle loro fasi (materiali_proposti_conferma). Quelli
 * scartati non tornano quando si rigenera. Nella pagina una riga sola col bottone; la scelta si fa
 * in un popup diviso per fasi (come il Fabbisogno), che si apre anche da solo dopo «Genera dal computo».
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";
import { nomeBreve } from "@/lib/acquisti/fabbisogno";
import { quantitaLeggibile } from "@/lib/distinta/statoMateriale";
import { cn } from "@/lib/utils";

export interface MaterialeProposto {
  id: string;
  chiave: string;
  phase_id: string | null;
  descrizione: string;
  specifiche: string | null;
  quantita: number;
  unita_misura: string | null;
  supplier_id: string | null;
  fornitore: string | null;
  consigliata: boolean;
  origine: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown>) => (supabase as any).rpc(f, a) as Promise<{ data: unknown; error: { message: string } | null }>;

export const chiaveProposti = (orderId: string) => ["materiali-proposti", orderId] as const;

export function useMaterialiProposti(orderId: string, abilitato: boolean) {
  return useQuery({
    queryKey: chiaveProposti(orderId),
    enabled: abilitato && !!orderId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await rpc("materiali_proposti_elenco", { p_order: orderId });
      if (error) throw error;
      return ((data ?? []) as MaterialeProposto[]).map((m) => ({ ...m, quantita: Number(m.quantita ?? 0) }));
    },
  });
}

export function MaterialiDaConfermare({ orderId, fasi, aperto, onAperto }: {
  orderId: string;
  fasi: { id: string | null; nome: string }[];
  aperto: boolean;
  onAperto: (a: boolean) => void;
}) {
  const proposti = useMaterialiProposti(orderId, true);
  const qc = useQueryClient();
  // Le spunte scelte a mano; senza, vale «consigliata» (le proposte dell'AI da controllare partono spente).
  const [spunte, setSpunte] = useState<Record<string, boolean>>({});
  const [faseScelta, setFaseScelta] = useState<string | null>(null);
  const righe = useMemo(() => proposti.data ?? [], [proposti.data]);
  const spuntato = (m: MaterialeProposto) => spunte[m.id] ?? m.consigliata;
  const scelti = righe.filter(spuntato);
  const altri = righe.filter((m) => !spuntato(m));

  const perFase = useMemo(() => {
    const ordine = new Map(fasi.map((f, i) => [f.id ?? "_senza", i]));
    const m = new Map<string, MaterialeProposto[]>();
    for (const r of righe) {
      const k = r.phase_id && ordine.has(r.phase_id) ? r.phase_id : "_senza";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()]
      .map(([k, rr]) => [k, [...rr].sort((a, b) => nomeBreve(a.descrizione).titolo.localeCompare(nomeBreve(b.descrizione).titolo, "it"))] as const)
      .sort(([a], [b]) => (ordine.get(a) ?? 999) - (ordine.get(b) ?? 999));
  }, [righe, fasi]);
  const nomeFase = (k: string) => (k === "_senza" ? "Senza fase" : fasi.find((f) => f.id === k)?.nome ?? "Fase");
  const attiva = perFase.find(([k]) => k === faseScelta) ?? perFase[0];

  const aggiorna = () => {
    void qc.invalidateQueries({ queryKey: chiaveProposti(orderId) });
    void qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
    void qc.invalidateQueries({ queryKey: ["fabbisogno-materiali"] });
    void qc.invalidateQueries({ queryKey: ["order-items"] });
    setSpunte({});
  };
  const conferma = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await rpc("materiali_proposti_conferma", { p_order: orderId, p_ids: ids });
      if (error) throw error;
      return data as { inserite: number; confermate: number };
    },
    onSuccess: (d) => {
      toast.success(`${d.inserite} ${d.inserite === 1 ? "materiale inserito" : "materiali inseriti"} negli articoli`, {
        description: "Li trovi nelle loro fasi, pronti da ordinare.",
      });
      aggiorna();
      onAperto(false);
    },
    onError: (e) => toast.error("Materiali non inseriti", { description: e instanceof Error ? e.message : String(e) }),
  });
  const scarta = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await rpc("materiali_proposti_scarta", { p_order: orderId, p_ids: ids });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? "proposta scartata" : "proposte scartate"}`, { description: "Rigenerando dal computo non tornano." });
      aggiorna();
    },
    onError: (e) => toast.error("Proposte non scartate", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (!righe.length) return null;
  const occupato = conferma.isPending || scarta.isPending;
  const tutti = scelti.length === righe.length;
  const cambiaGruppo = (rr: readonly MaterialeProposto[], si: boolean) => setSpunte((s) => ({ ...s, ...Object.fromEntries(rr.map((m) => [m.id, si])) }));

  return (
    <>
      {/* Nella pagina: una riga sola. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <FileSearch className="h-4 w-4 text-amber-800 dark:text-amber-200" aria-hidden />
        <span className="font-semibold text-amber-900 dark:text-amber-100">Dal computo: {righe.length} {righe.length === 1 ? "materiale" : "materiali"} da confermare</span>
        <span className="text-xs text-amber-800 dark:text-amber-200">in {perFase.length} {perFase.length === 1 ? "fase" : "fasi"}</span>
        <Button size="sm" className="ml-auto h-8 text-xs" onClick={() => onAperto(true)}>Scegli e inserisci</Button>
      </div>

      <Dialog open={aperto} onOpenChange={onAperto}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSearch className="h-5 w-5" aria-hidden /> Materiali dal computo</DialogTitle>
            <DialogDescription>
              Spunta, fase per fase, quelli da comprare: con «Inserisci» entrano negli articoli, nelle loro fasi.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 rounded-lg border sm:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label="Fasi" className="flex gap-1 overflow-x-auto border-b p-2 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
              {perFase.map(([k, rr]) => {
                const sel = k === attiva?.[0];
                const n = rr.filter(spuntato).length;
                return (
                  <button key={k} type="button" onClick={() => setFaseScelta(k)} aria-current={sel ? "true" : undefined}
                    className={cn("w-48 shrink-0 rounded-md px-2.5 py-2 text-left text-sm transition-colors sm:w-full", sel ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted")}>
                    <span className={cn("block font-medium", sel && "text-primary")}>{nomeFase(k)}</span>
                    <span className={cn("block text-[11px]", n === rr.length ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300")}>
                      {n} su {rr.length} da inserire
                    </span>
                  </button>
                );
              })}
            </nav>

            {attiva && (
              <section aria-label={`Materiali proposti: ${nomeFase(attiva[0])}`} className="min-w-0 space-y-2 p-3 sm:pl-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{nomeFase(attiva[0])}</h3>
                  <span className="text-xs text-muted-foreground">{attiva[1].length} materiali</span>
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
                    onClick={() => cambiaGruppo(attiva[1], !attiva[1].every(spuntato))}>
                    {attiva[1].every(spuntato) ? "Togli la fase" : "Seleziona la fase"}
                  </Button>
                </div>
                <ul className="divide-y rounded-md border">
                  {attiva[1].map((m) => {
                    const { titolo, accorciato } = nomeBreve(m.descrizione);
                    const q = quantitaLeggibile(m.quantita, m.unita_misura);
                    return (
                      <li key={m.id}>
                        <label className={cn("grid cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40", !spuntato(m) && "text-muted-foreground")}>
                          <Checkbox checked={spuntato(m)} onCheckedChange={(v) => setSpunte((s) => ({ ...s, [m.id]: v === true }))} aria-label={`Seleziona ${titolo}`} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium" title={accorciato ? m.descrizione : undefined}>{titolo}</span>
                            {(m.fornitore || !m.consigliata) && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {[!m.consigliata ? "proposto dall'AI: da controllare" : null, m.fornitore].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                          <span className="whitespace-nowrap text-right text-xs tabular-nums">{q.numero} {q.unita}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          {/* La barra delle azioni resta in fondo alla finestra mentre si scorre. */}
          <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-wrap items-center gap-2 border-t bg-background px-6 py-2.5">
            <span className="text-sm text-muted-foreground">{scelti.length} su {righe.length} selezionati</span>
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={occupato}
              onClick={() => setSpunte(Object.fromEntries(righe.map((m) => [m.id, !tutti])))}>
              {tutti ? "Togli tutti" : "Seleziona tutti"}
            </Button>
            {altri.length > 0 && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" disabled={occupato}
                onClick={() => scarta.mutate(altri.map((m) => m.id))} title="Non si comprano: rigenerando dal computo non tornano">
                {altri.length === 1 ? "Scarta quello non spuntato" : `Scarta i ${altri.length} non spuntati`}
              </Button>
            )}
            <Button size="sm" className="ml-auto h-8" disabled={occupato || scelti.length === 0} onClick={() => conferma.mutate(scelti.map((m) => m.id))}>
              {conferma.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Inserisci {scelti.length} negli articoli
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

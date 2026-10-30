// src/components/orders/RapportiniUfficio.tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Hammer, NotebookPen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useSottofasi } from "@/hooks/useSottofasi";
import { nomeAccesso, useAccessiCommessa } from "@/hooks/useAccessiCommessa";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { messaggioErrore } from "@/lib/orders/sottofasi";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { caricoRapportini, erroriGiorni, giornoVuoto, type GiornoUfficio } from "@/lib/campo/rapportiniUfficio";

/**
 * «Scrivi rapportini» dalla commessa (31/10/2026): l'ufficio scrive il diario di
 * uno o più giorni — cosa si è fatto, su quali fasi, quali sottofasi lavorate o
 * finite — a nome suo o di chi lavora in cantiere con l'app. Entrano da
 * approvare come quelli del cantiere; le ore passano dal registro ore.
 */
export function RapportiniUfficio({ orderId, className }: { orderId: string; className?: string }) {
  const [aperta, setAperta] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className={cn("h-8", className)} onClick={() => setAperta(true)}>
        <NotebookPen className="mr-1.5 h-4 w-4" />Scrivi rapportini
      </Button>
      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rapportini dall'ufficio</DialogTitle>
            <DialogDescription>Uno per giorno, anche più giorni insieme. Entrano da approvare come quelli del cantiere; le ore si registrano in «Ore e persone».</DialogDescription>
          </DialogHeader>
          {aperta && <Finestra orderId={orderId} onFatto={() => setAperta(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Finestra({ orderId, onFatto }: { orderId: string; onFatto: () => void }) {
  const qc = useQueryClient();
  const oggi = giornoLocale(new Date().toISOString());
  const { phases } = useOrderWorkPhases(orderId);
  const { perFase: sottofasiDi } = useSottofasi(orderId);
  const { data: accessi = [] } = useAccessiCommessa(orderId);
  const persone = accessi.filter((a) => a.role_type === "employee");
  const [giorni, setGiorni] = useState<GiornoUfficio[]>(() => [giornoVuoto(oggi, "g0")]);
  const [tentato, setTentato] = useState(false);
  const errori = erroriGiorni(giorni, oggi);
  const cambia = (chiave: string, patch: Partial<GiornoUfficio>) => setGiorni((gs) => gs.map((g) => (g.chiave === chiave ? { ...g, ...patch } : g)));

  const salva = useMutation({
    mutationFn: async () => {
      const carico = caricoRapportini(giorni, phases.map((p) => ({ id: p.id, percentuale: p.percentuale })), sottofasiDi);
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        "ufficio_crea_rapportini", { p_order_id: orderId, p_rapportini: carico });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: (n) => {
      refreshWorkQueries(qc, orderId);
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && queryKey[0].includes("rapportini") });
      toast.success(n === 1 ? "Rapportino scritto: è da approvare" : `${n} rapportini scritti: sono da approvare`);
      onFatto();
    },
    onError: (e) => toast.error(messaggioErrore(e, "Rapportini non salvati. Riprova.")),
  });

  return (
    <div className="space-y-4">
      {giorni.map((g, i) => (
        <section key={g.chiave} aria-label={`Rapportino ${i + 1}`} className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">Giorno
              <Input type="date" max={oggi} value={g.data} onChange={(e) => cambia(g.chiave, { data: e.target.value })} className="h-9 w-40" aria-label={`Giorno del rapportino ${i + 1}`} />
            </label>
            <label className="grid min-w-[12rem] flex-1 gap-1 text-xs text-muted-foreground">A nome di
              <select value={g.autore} onChange={(e) => cambia(g.chiave, { autore: e.target.value })} aria-label={`A nome di, rapportino ${i + 1}`}
                className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                <option value="">Ufficio (chi scrive)</option>
                {persone.map((a) => <option key={a.user_id} value={a.user_id}>{nomeAccesso(a)}{a.is_capocantiere ? " · capocantiere" : ""}</option>)}
              </select>
            </label>
            {giorni.length > 1 && (
              <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-600" aria-label={`Togli il rapportino ${i + 1}`} onClick={() => setGiorni((gs) => gs.filter((x) => x.chiave !== g.chiave))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">Cosa si è fatto
            <Textarea rows={2} maxLength={4000} value={g.descrizione} onChange={(e) => cambia(g.chiave, { descrizione: e.target.value })}
              placeholder="Es. smontaggio manto lato nord, posa guaina" aria-label={`Cosa si è fatto, rapportino ${i + 1}`} />
          </label>
          {phases.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Fasi lavorate</p>
              <div className="flex flex-wrap gap-1.5">
                {phases.map((p) => {
                  const si = g.fasi.includes(p.id);
                  return (
                    <button key={p.id} type="button" aria-pressed={si} onClick={() => cambia(g.chiave, { fasi: si ? g.fasi.filter((x) => x !== p.id) : [...g.fasi, p.id] })}
                      className={cn("rounded-full border px-2.5 py-1 text-xs", si ? "border-blue-600 bg-blue-50 font-medium text-blue-900" : "border-border text-muted-foreground hover:bg-slate-50")}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
              {g.fasi.map((id) => {
                const sotto = (sottofasiDi.get(id) ?? []).filter((s) => !s.fatta);
                if (!sotto.length) return null;
                const fase = phases.find((p) => p.id === id);
                return (
                  <div key={id} className="rounded-md bg-slate-50 p-2">
                    <p className="mb-1 text-xs font-medium">{fase?.name}</p>
                    <ul className="space-y-1">
                      {sotto.map((s) => {
                        const stato = g.sottofasi[s.id];
                        const imposta = (v: "lavorata" | "finita") => {
                          const nuove = { ...g.sottofasi };
                          if (stato === v) delete nuove[s.id]; else nuove[s.id] = v;
                          cambia(g.chiave, { sottofasi: nuove });
                        };
                        return (
                          <li key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1">{s.name}</span>
                            <button type="button" aria-pressed={stato === "lavorata"} aria-label={`${s.name}: lavorata`} onClick={() => imposta("lavorata")}
                              className={cn("flex items-center gap-1 rounded-md border px-2 py-1", stato === "lavorata" ? "border-blue-600 bg-blue-50 text-blue-900" : "border-border text-muted-foreground")}>
                              <Hammer className="h-3.5 w-3.5" />Lavorata
                            </button>
                            <button type="button" aria-pressed={stato === "finita"} aria-label={`${s.name}: finita`} onClick={() => imposta("finita")}
                              className={cn("flex items-center gap-1 rounded-md border px-2 py-1", stato === "finita" ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-border text-muted-foreground")}>
                              <Check className="h-3.5 w-3.5" />Finita
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <label className="grid gap-1 text-xs text-muted-foreground">Note (facoltative)
            <Input value={g.note} maxLength={4000} onChange={(e) => cambia(g.chiave, { note: e.target.value })} aria-label={`Note, rapportino ${i + 1}`} />
          </label>
        </section>
      ))}
      <Button variant="outline" size="sm" disabled={giorni.length >= 31}
        onClick={() => setGiorni((gs) => [...gs, giornoVuoto(oggi, `g${Date.now()}`, gs[gs.length - 1])])}>
        <Plus className="mr-1 h-4 w-4" />Aggiungi un altro giorno
      </Button>
      {tentato && errori.length > 0 && <ul role="alert" className="list-disc pl-5 text-xs text-rose-700">{errori.map((e) => <li key={e}>{e}</li>)}</ul>}
      <DialogFooter>
        <Button variant="ghost" onClick={onFatto}>Annulla</Button>
        <Button disabled={salva.isPending} onClick={() => { setTentato(true); if (!errori.length) salva.mutate(); }}>
          {salva.isPending ? "Salvo…" : giorni.length === 1 ? "Salva il rapportino" : `Salva ${giorni.length} rapportini`}
        </Button>
      </DialogFooter>
    </div>
  );
}

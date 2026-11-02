/**
 * «Calcola come finire» (2/11/2026): ore, operai, persone, mezzi e margine per finire la commessa
 * entro una data. I numeri vengono da shared/piano-cantiere, ogni ipotesi si può cambiare e ogni
 * stima dice da dove viene. Niente si assegna senza premere «Assegna».
 */
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsCompanyAdmin } from "@/hooks/useIsCompanyAdmin";
import { formatCurrency } from "@/lib/formatters";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { chiaveLavorazione, FONTE_A_PAROLE } from "../../../shared/piano-cantiere/calcolo.ts";
import { costruisciPiano, type ClientPiano, type OpzioniPiano } from "../../../shared/piano-cantiere/costruisci.ts";

const db = supabase as unknown as ClientPiano;
const COSTO_DA = { scelto: "scelto da te", schede: "media delle schede dei tuoi operai", predefinito: "valore di partenza: nessuna scheda ha il costo" };
const dataIt = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");
const ore = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 0 })} ore`;

interface Props { orderId: string; puoModificare: boolean; open: boolean; onOpenChange: (open: boolean) => void }

export function PianoCantiereDialog({ orderId, puoModificare, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [opzioni, setOpzioni] = useState<OpzioniPiano>({});
  const chiave = ["piano-cantiere", orderId, opzioni];
  // Assegnare scrive su order_employees, che accetta solo gli amministratori.
  const puoAssegnare = useIsCompanyAdmin();
  const { data: e, isLoading, isFetching, error } = useQuery({
    queryKey: chiave, enabled: open, staleTime: 60_000, placeholderData: keepPreviousData, queryFn: () => costruisciPiano(db, orderId, opzioni),
  });
  /** Solo se il valore cambia: passare su un campo non è una scelta. */
  const ricalcola = (k: keyof OpzioniPiano, v: string, attuale: unknown) => {
    if (v === "" || String(attuale ?? "") === v) return;
    setOpzioni((o) => ({ ...o, [k]: k === "al" ? v : Number(v) }));
  };

  const assegna = useMutation({
    mutationFn: async () => {
      // Si rilegge prima di scrivere: dopo un errore a metà chi è già passato non si ripete.
      const { data: presenti, error: errPresenti } = await supabase.from("order_employees").select("employee_id, phase_id").eq("order_id", orderId);
      if (errPresenti) throw errPresenti;
      const gia = new Set((presenti ?? []).map((r) => `${r.employee_id}|${r.phase_id ?? ""}`));
      const nuove = (e?.risorse.persone ?? []).filter((p) => !p.gia && !gia.has(`${p.employee_id}|${p.faseId ?? ""}`));
      for (const p of nuove) {
        const { data: costo, error: errCosto } = await supabase.rpc("costo_orario_dipendente", { p_employee_id: p.employee_id });
        if (errCosto) throw errCosto;
        const fase = e?.piano.fasi.find((f) => f.nome === p.fase);
        const tariffa = Number(costo) > 0 ? Math.round(Number(costo) * 100) / 100 : 0;
        const { error: errIns } = await supabase.from("order_employees").insert({
          order_id: orderId, employee_id: p.employee_id, phase_id: p.faseId ?? null, hours_worked: 0, hourly_rate: tariffa, total_cost: 0,
          planned_hours: fase && fase.operaiNecessari ? Math.round(fase.ore / fase.operaiNecessari * 10) / 10 : null, planned_hourly_rate: tariffa,
        });
        if (errIns) throw errIns;
      }
      return nuove.length;
    },
    onSuccess: async (n) => {
      toast.success(n === 1 ? "Una persona assegnata" : `${n} assegnazioni fatte`);
      refreshWorkQueries(qc, orderId, e?.commessa.company_id);
      await qc.invalidateQueries({ queryKey: ["piano-cantiere", orderId] });
    },
    onError: () => toast.error("Non sono riuscito ad assegnare tutti: controlla la commessa e riprova."),
  });

  const salvaResa = useMutation({
    mutationFn: async (r: { descrizione: string; unita: string | null; valore: number }) => {
      const { error: errResa } = await db.rpc("piano_cantiere_salva_resa", {
        p_company_id: e!.commessa.company_id, p_chiave: chiaveLavorazione(r.descrizione), p_descrizione: r.descrizione, p_ore_per_unita: r.valore, p_unita: r.unita,
      });
      if (errResa) throw new Error(errResa.message);
    },
    onSuccess: () => { toast.success("Resa salvata per la tua azienda"); qc.invalidateQueries({ queryKey: ["piano-cantiere", orderId] }); },
    onError: () => toast.error("Non sono riuscito a salvare la resa."),
  });

  const daAssegnare = e?.risorse.persone.filter((p) => !p.gia).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calcola come finire{e ? ` · ${e.commessa.codice}` : ""}</DialogTitle>
          <DialogDescription>Quante ore e quanti operai servono per finire entro una data, chi è libero e quanto margine resta. Non cambia nulla finché non premi «Assegna».</DialogDescription>
        </DialogHeader>

        {isLoading && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Sto facendo i conti…</div>}
        {error && <Alert variant="destructive"><AlertDescription>Non riesco a fare il calcolo per questa commessa. Se non hai il permesso di vedere i costi, chiedilo all'amministratore; altrimenti riprova tra poco.</AlertDescription></Alert>}

        {e && (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><Label htmlFor="piano-al">Finire entro</Label><Input id="piano-al" type="date" value={opzioni.al ?? e.piano.al ?? ""} onChange={(x) => ricalcola("al", x.target.value, e.piano.al)} /></div>
              <div><Label htmlFor="piano-costo">Costo orario (€)</Label><Input id="piano-costo" type="number" min={1} defaultValue={e.ipotesi.costoOrario} onBlur={(x) => ricalcola("costoOrario", x.target.value, e.ipotesi.costoOrario)} /></div>
              <div><Label htmlFor="piano-ore">Ore al giorno</Label><Input id="piano-ore" type="number" min={1} max={12} defaultValue={e.ipotesi.oreGiorno} onBlur={(x) => ricalcola("oreGiorno", x.target.value, e.ipotesi.oreGiorno)} /></div>
              <div><Label htmlFor="piano-resa">Ore produttive (%)</Label><Input id="piano-resa" type="number" min={10} max={100} defaultValue={e.ipotesi.resaPct} onBlur={(x) => ricalcola("resaPct", x.target.value, e.ipotesi.resaPct)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Costo orario: {COSTO_DA[e.costoOrarioDa]}. Prezzario usato per le stime: {e.regione ?? "tutta Italia"}.</p>

            {[...e.piano.avvisi, ...e.avvisiLettura].map((a) => (
              <Alert key={a}><AlertTriangle className="h-4 w-4" /><AlertDescription>{a}</AlertDescription></Alert>
            ))}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato titolo="Lavoro che resta" valore={ore(e.piano.oreTotali)} nota={e.piano.oreMin !== e.piano.oreMax ? `da ${ore(e.piano.oreMin)} a ${ore(e.piano.oreMax)}` : undefined} />
              <Dato titolo="Giorni lavorativi" valore={String(e.piano.giorniDisponibili)} nota={`fino al ${dataIt(e.piano.al)}`} />
              <Dato titolo="Operai insieme" valore={e.piano.operaiMassimi ? String(e.piano.operaiMassimi) : "—"} nota="nel momento di punta" />
              <Dato titolo={e.margine?.completo ? "Margine previsto" : "Margine al massimo"} valore={e.margine ? formatCurrency(e.margine.margineMassimo) : "—"} nota={e.margine?.percentuale != null ? `${e.margine.percentuale}%` : undefined} />
            </div>

            {e.margine && !e.margine.completo && <p className="text-muted-foreground">Per il margine esatto mancano: {e.margine.mancano.join(", ")}.</p>}

            <section>
              <h3 className="mb-2 font-medium">Fase per fase</h3>
              <div className="space-y-2">
                {e.piano.fasi.filter((f) => f.giorni).map((f) => (
                  <div key={f.nome} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{f.nome}</span>
                      <span className="text-muted-foreground">{dataIt(f.dal)} – {dataIt(f.al)} · {f.giorni} {f.giorni === 1 ? "giorno" : "giorni"}</span>
                    </div>
                    <p>{ore(f.ore)}{f.ditta ? ` · lavoro della ditta ${f.ditta}` : f.operaiNecessari ? ` · ${f.operaiNecessari} ${f.operaiNecessari === 1 ? "operaio" : "operai"}` : ""}</p>
                    {!!f.fonti.length && <p className="text-xs text-muted-foreground">Da: {f.fonti.map((x) => FONTE_A_PAROLE[x]).join(", ")}</p>}
                    {e.risorse.persone.filter((p) => p.fase === f.nome).map((p) => <p key={p.employee_id} className="text-xs">{p.nome}: {p.motivo}</p>)}
                    {e.risorse.mancano.filter((m) => m.fase === f.nome).map((m) => <p key={m.fase} className="text-xs text-amber-700">{m.specialisti ? `Servono ${m.persone} impiantisti: non vedo nessuno libero con questo mestiere, valuta una ditta.` : `Mancano ${m.persone} ${m.persone === 1 ? "persona" : "persone"} libere: valuta una ditta o sposta la data.`}</p>)}
                    {e.risorse.mezzi.filter((m) => m.fase === f.nome).map((m) => <p key={m.mezzo_id} className="text-xs">Mezzo: {m.nome} ({m.motivo})</p>)}
                    {e.risorse.mezziMancanti.filter((m) => m.fase === f.nome).map((m) => <p key={m.cosa} className="text-xs text-amber-700">Di solito serve {m.cosa}: non ne vedo liberi.</p>)}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Le date delle fasi qui sono una proposta: «Assegna» aggiunge le persone ma non cambia le date della commessa.</p>
              {puoModificare && puoAssegnare && daAssegnare > 0 && (
                <Button className="mt-3" disabled={assegna.isPending || isFetching} onClick={() => assegna.mutate()}>
                  {assegna.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Assegna {daAssegnare === 1 ? "questa persona" : "le persone proposte"}
                </Button>
              )}
            </section>

            <section>
              <h3 className="mb-2 font-medium">Previsione al ritmo attuale</h3>
              <p>{e.previsione.dataPrevista ? `Finirebbe il ${dataIt(e.previsione.dataPrevista)}${e.previsione.ritardoGiorni ? `, con ${e.previsione.ritardoGiorni} giorni lavorativi di ritardo` : ", in tempo"}.` : "Per ora non posso prevedere la fine."} <span className="text-muted-foreground">{e.previsione.perche}</span></p>
            </section>

            {puoModificare && !!e.voci.length && (
              <details>
                <summary className="cursor-pointer font-medium">Correggi le ore di una lavorazione</summary>
                <p className="my-2 text-xs text-muted-foreground">Scrivi quante ore servono alla tua azienda per ogni unità: valgono per tutti i prossimi calcoli.</p>
                <div className="space-y-2">
                  {e.voci.slice(0, 40).map((v, i) => (
                    <div key={`${v.descrizione}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b pb-2">
                      <div>
                        <p>{v.descrizione}</p>
                        <p className="text-xs text-muted-foreground">{v.quantita} {v.unita ?? ""} · {v.calcolo ? `${ore(v.calcolo.ore)}, ${FONTE_A_PAROLE[v.calcolo.fonte]}` : FONTE_A_PAROLE.manca}</p>
                      </div>
                      {v.calcolo?.fonte !== "scritte" && <Input aria-label={`Ore per unità: ${v.descrizione}`} className="h-8 w-24" type="number" min={0} step="0.01" placeholder="ore/unità"
                        onBlur={(x) => { const n = Number(x.target.value); if (x.target.value !== "" && n > 0) salvaResa.mutate({ descrizione: v.descrizione, unita: v.unita, valore: n }); }} />}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Dato({ titolo, valore, nota }: { titolo: string; valore: string; nota?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{titolo}</p>
      <p className="text-lg font-semibold">{valore}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

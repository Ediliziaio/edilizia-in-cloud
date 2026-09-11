/**
 * Le soglie di un cliente (Allegato A del manuale): settore, classe, budget,
 * ticket, chi richiama, e i target — costo per richiesta con giallo e rosso,
 * la regola dello zero (3× / 5×), lead attesi al giorno, costo per
 * appuntamento, costo per vendita, ritorno minimo. Il titolare li scrive; il
 * sistema li adatta al mese (stagionalità del settore) e dal giorno 91
 * propone il valore dello storico. Una soglia manuale non viene mai
 * sovrascritta: riceve la proposta.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfiloCliente, useSalvaSoglie, type Benchmark, type ProfiloCliente, type Soglia } from "./useMktConsole";
import { eur } from "./formato";
import type { ClienteMarketing } from "./provvigioni";

const SETTORI = [
  { value: "serramenti", label: "Serramenti / infissi" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "bagni", label: "Ristrutturazione bagni" },
  { value: "ristrutturazioni", label: "Ristrutturazioni complete" },
  { value: "facciate", label: "Facciate / cappotto" },
  { value: "clima", label: "Pompe di calore / clima" },
  { value: "altro", label: "Altro" },
];
const CHI_RICHIAMA = [
  { value: "cliente", label: "Il cliente con i suoi utenti" },
  { value: "call_center", label: "Call center esterno" },
  { value: "voce_ai", label: "Voce AI di richiamo a caldo" },
  { value: "noi", label: "Noi" },
];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

interface Form {
  settore: string; classe: string; budget: string; ticket: string; chi: string;
  cpl: string; giallo: string; rosso: string; zg: string; zr: string; attesi: string; costoApp: string; cac: string; roas: string;
  stagionalita: boolean; blocca: boolean; note: string;
  gialloRossoAuto: boolean;
}

const s = (v: number | null | undefined) => (v == null ? "" : String(v));

function daSoglia(soglia: Soglia | null, bm: Benchmark | undefined, profilo: ProfiloCliente): Form {
  const cplBase = soglia?.cpl_target ?? (bm ? Math.round(((bm.cpl_min + bm.cpl_max) / 2) * 100) / 100 : 20);
  return {
    settore: profilo.mkt_settore ?? "altro", classe: profilo.mkt_classe ?? "", budget: s(profilo.mkt_budget_mensile), ticket: s(profilo.mkt_ticket_medio), chi: profilo.mkt_chi_richiama ?? "",
    cpl: String(cplBase), giallo: s(soglia?.cpl_giallo ?? Math.round(cplBase * 150) / 100), rosso: s(soglia?.cpl_rosso ?? Math.round(cplBase * 200) / 100),
    zg: s(soglia?.moltiplicatore_zero_giallo ?? 3), zr: s(soglia?.moltiplicatore_zero_rosso ?? 5), attesi: s(soglia?.lead_attesi_giorno),
    costoApp: s(soglia?.costo_appuntamento_target), cac: s(soglia?.cac_target), roas: s(soglia?.roas_minimo ?? 3),
    stagionalita: soglia?.stagionalita_applicata ?? true, blocca: soglia?.blocca_ritaratura ?? false, note: soglia?.note ?? "",
    gialloRossoAuto: soglia == null || (Math.abs(soglia.cpl_giallo - soglia.cpl_target * 1.5) < 0.02 && Math.abs(soglia.cpl_rosso - soglia.cpl_target * 2) < 0.02),
  };
}

interface Props {
  cliente: ClienteMarketing | null;
  soglia: Soglia | null;
  benchmark: Benchmark[];
  oggi: Date;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SoglieDialog({ cliente, soglia, benchmark, oggi, open, onOpenChange }: Props) {
  const profilo = useProfiloCliente(open ? cliente?.service_client_id ?? null : null);
  if (!cliente) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Soglie e obiettivi · {cliente.cliente_nome}</DialogTitle>
          <DialogDescription>
            I numeri che decidono verde, giallo e rosso per questo cliente. Il target base si adatta al mese con la stagionalità del settore; dal giorno 91 il sistema propone il valore dello storico.
          </DialogDescription>
        </DialogHeader>
        {!profilo.data ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          // Il modulo nasce quando arriva il profilo, con i valori in vigore: da lì comanda l'utente.
          <SoglieForm cliente={cliente} profilo={profilo.data} soglia={soglia} benchmark={benchmark} oggi={oggi} onChiudi={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SoglieForm({ cliente, profilo, soglia, benchmark, oggi, onChiudi }: { cliente: ClienteMarketing; profilo: ProfiloCliente; soglia: Soglia | null; benchmark: Benchmark[]; oggi: Date; onChiudi: () => void }) {
  const salva = useSalvaSoglie();
  const [form, setForm] = useState<Form>(() => daSoglia(soglia, benchmark.find((b) => b.settore === (profilo.mkt_settore ?? "altro")), profilo));
  const bm = benchmark.find((b) => b.settore === form.settore);
  const mese = oggi.getMonth();
  const fattore = form.stagionalita ? (bm?.stagionalita[mese] ?? 1) : 1;
  const cplNum = Number(form.cpl) || 0;
  const effettivo = Math.round(cplNum * fattore * 100) / 100;
  const budgetNum = Number(form.budget) || 0;
  const giorniMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).getDate();
  const attesiAuto = budgetNum > 0 && effettivo > 0 ? Math.round((budgetNum / giorniMese / effettivo) * 10) / 10 : null;
  const set = (patch: Partial<Form>) => setForm((f) => {
    const next = { ...f, ...patch };
    if (next.gialloRossoAuto) {
      const c = Number(next.cpl) || 0;
      next.giallo = c ? String(Math.round(c * 150) / 100) : "";
      next.rosso = c ? String(Math.round(c * 200) / 100) : "";
    }
    return next;
  });

  const conferma = async () => {
    if (!(Number(form.cpl) > 0)) { toast.error("Serve un costo per richiesta target maggiore di zero"); return; }
    const minimo = Number(form.ticket) > 0 && Number(form.ticket) < 15000 ? 3000 : 2000;
    if (budgetNum > 0 && budgetNum < minimo && !form.note.trim()) {
      toast.error(`Budget sotto la soglia minima del manuale (${eur(minimo)}/mese)`, { description: "Scrivi la deroga nelle note per salvare comunque." });
      return;
    }
    try {
      await salva.mutateAsync({
        service_client_id: cliente.service_client_id,
        profilo: { mkt_settore: form.settore || null, mkt_classe: form.classe || null, mkt_budget_mensile: budgetNum || null, mkt_ticket_medio: Number(form.ticket) || null, mkt_chi_richiama: form.chi || null },
        soglia: {
          cpl_target: Number(form.cpl), cpl_giallo: Number(form.giallo) || Number(form.cpl) * 1.5, cpl_rosso: Number(form.rosso) || Number(form.cpl) * 2,
          moltiplicatore_zero_giallo: Number(form.zg) || 3, moltiplicatore_zero_rosso: Number(form.zr) || 5,
          lead_attesi_giorno: Number(form.attesi) || null, costo_appuntamento_target: Number(form.costoApp) || null, cac_target: Number(form.cac) || null,
          roas_minimo: Number(form.roas) || 3, stagionalita_applicata: form.stagionalita, blocca_ritaratura: form.blocca, note: form.note.trim() || null,
        },
      });
      toast.success("Soglie salvate: valgono da oggi", { description: "Il semaforo e le regole le usano dal prossimo ricalcolo." });
      onChiudi();
    } catch (e) {
      toast.error("Soglie non salvate", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <div className="grid gap-4">
        <section className="grid gap-3 rounded-lg border p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Il cliente</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Settore</Label>
              <Select value={form.settore} onValueChange={(v) => set({ settore: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SETTORI.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Classe</Label>
              <Select value={form.classe || "nessuna"} onValueChange={(v) => set({ classe: v === "nessuna" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuna">— da decidere —</SelectItem>
                  <SelectItem value="A">A — portante (≥ 800 €/mese o budget ≥ 5.000 €)</SelectItem>
                  <SelectItem value="B">B — normale (300-800 €/mese)</SelectItem>
                  <SelectItem value="C">C — sotto soglia (&lt; 300 €/mese)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Chi richiama i lead</Label>
              <Select value={form.chi || "nessuno"} onValueChange={(v) => set({ chi: v === "nessuno" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">— da decidere —</SelectItem>
                  {CHI_RICHIAMA.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Budget ads mensile €</Label>
              <Input type="number" min={0} value={form.budget} onChange={(e) => set({ budget: e.target.value })} placeholder="es. 3000" />
            </div>
            <div className="grid gap-1.5">
              <Label>Ticket medio dichiarato €</Label>
              <Input type="number" min={0} value={form.ticket} onChange={(e) => set({ ticket: e.target.value })} placeholder={bm ? `${eur(bm.ticket_min)} – ${eur(bm.ticket_max)}` : ""} />
            </div>
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Costo per richiesta</div>
            {bm && <span className="text-[11px] text-muted-foreground">banda di settore {eur(bm.cpl_min)} – {eur(bm.cpl_max)}</span>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Target base €</Label>
              <Input type="number" min={0} step="0.5" value={form.cpl} onChange={(e) => set({ cpl: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Giallo € {form.gialloRossoAuto && <span className="text-[10px] text-muted-foreground">(×1,5)</span>}</Label>
              <Input type="number" min={0} step="0.5" value={form.giallo} onChange={(e) => set({ giallo: e.target.value, gialloRossoAuto: false })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Rosso € {form.gialloRossoAuto && <span className="text-[10px] text-muted-foreground">(×2)</span>}</Label>
              <Input type="number" min={0} step="0.5" value={form.rosso} onChange={(e) => set({ rosso: e.target.value, gialloRossoAuto: false })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-2"><Switch checked={form.stagionalita} onCheckedChange={(v) => set({ stagionalita: v })} /> Adatta al mese</label>
            <span className="text-muted-foreground">
              {MESI[mese]}: fattore ×{fattore.toLocaleString("it-IT")} → target effettivo <strong className="text-foreground">{eur(effettivo, 2)}</strong>
              {form.stagionalita && bm && <> (giallo {eur(Math.round((Number(form.giallo) || 0) * fattore * 100) / 100, 2)}, rosso {eur(Math.round((Number(form.rosso) || 0) * fattore * 100) / 100, 2)})</>}
            </span>
          </div>
          {bm && form.stagionalita && (
            <div className="grid grid-cols-12 gap-0.5 text-[10px] text-muted-foreground">
              {bm.stagionalita.map((f, i) => (
                <div key={i} className={`rounded px-0.5 py-0.5 text-center ${i === mese ? "bg-primary/10 font-semibold text-foreground" : ""}`} title={`${MESI[i]}: ×${f}`}>
                  {MESI[i].slice(0, 3)}<br />{f.toLocaleString("it-IT")}
                </div>
              ))}
            </div>
          )}
          {soglia?.cpl_suggerito != null && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Dallo storico degli ultimi 90 giorni il sistema propone <strong>{eur(soglia.cpl_suggerito, 2)}</strong> come target base.
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => set({ cpl: String(soglia.cpl_suggerito) })}>Usa</Button>
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-xs"><Switch checked={form.blocca} onCheckedChange={(v) => set({ blocca: v })} /> Non ritarare in automatico: il lunedì il sistema propone soltanto</label>
        </section>

        <section className="grid gap-3 rounded-lg border p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zero richieste, appuntamenti, vendite</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Giallo a × il target</Label>
              <Input type="number" min={1} step="0.5" value={form.zg} onChange={(e) => set({ zg: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Rosso a × il target</Label>
              <Input type="number" min={1} step="0.5" value={form.zr} onChange={(e) => set({ zr: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Richieste attese al giorno</Label>
              <Input type="number" min={0} step="0.1" value={form.attesi} onChange={(e) => set({ attesi: e.target.value })} placeholder={attesiAuto != null ? `auto: ${attesiAuto.toLocaleString("it-IT")}` : "dal budget"} />
            </div>
            <div className="grid gap-1.5">
              <Label>Costo per appuntamento €</Label>
              <Input type="number" min={0} value={form.costoApp} onChange={(e) => set({ costoApp: e.target.value })} placeholder={bm ? `${eur(bm.costo_appuntamento_min)} – ${eur(bm.costo_appuntamento_max)}` : ""} />
            </div>
            <div className="grid gap-1.5">
              <Label>Costo per vendita €</Label>
              <Input type="number" min={0} value={form.cac} onChange={(e) => set({ cac: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Ritorno minimo (×)</Label>
              <Input type="number" min={0} step="0.5" value={form.roas} onChange={(e) => set({ roas: e.target.value })} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Con {eur(effettivo, 2)} di target: giallo dopo {eur(effettivo * (Number(form.zg) || 3))} spesi senza richieste, rosso dopo {eur(effettivo * (Number(form.zr) || 5))}.
            Le regole sul costo scattano solo con almeno 10 richieste buone nella settimana; nei primi 30 giorni valgono solo velocità e tecnica.
          </p>
        </section>

        <div className="grid gap-1.5">
          <Label>Note (deroghe, accordi, motivo delle soglie)</Label>
          <Input value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="facoltative" />
        </div>
        {soglia && (
          <p className="text-[11px] text-muted-foreground">
            Soglia in vigore dal {soglia.valida_dal} ({soglia.origine === "manuale" ? "scritta a mano" : soglia.origine === "storico" ? "dallo storico" : "dalla banda di settore"}).
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onChiudi}>Annulla</Button>
        <Button onClick={() => void conferma()} disabled={salva.isPending} className="gap-2">
          {salva.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salva le soglie
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Richieste d'offerta ai fornitori — lista.
 *
 * Vive come scheda dentro l'hub Commesse, accanto agli Ordini d'Acquisto:
 * e' il passo prima, non un'altra area. La domanda a cui deve rispondere in
 * un colpo d'occhio e' "chi non mi ha ancora risposto e da quanto".
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FileQuestion, Plus, Search, Clock, Inbox, Trophy } from "lucide-react";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { useSupplierRfqs } from "@/hooks/useSupplierRfqs";
import { RDO_STATUS_LABELS, RDO_STATUS_COLORS } from "@/lib/rdoStatus";
import { formatCurrency } from "@/lib/formatters";

const dataIt = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

/** Da quanti giorni si aspetta: e' il numero che fa alzare il telefono. */
function giorniDaAttesa(iso?: string | null): number | null {
  if (!iso) return null;
  const oggi = new Date();
  const d = new Date(iso);
  const gg = Math.floor((oggi.getTime() - d.getTime()) / 86_400_000);
  return gg > 0 ? gg : null;
}

export default function SupplierRfqsList() {
  const navigate = useNavigate();
  const { rfqs, contatori, isLoading, create } = useSupplierRfqs();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"aperte" | "tutte" | "aggiudicate">("aperte");

  const [newOpen, setNewOpen] = useState(false);
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [fabbisogno, setFabbisogno] = useState("");
  const [scadenza, setScadenza] = useState("");

  const kpis = useMemo(() => {
    const aperte = rfqs.filter((r) => ["bozza", "inviata", "in_valutazione"].includes(r.status));
    let inAttesa = 0;
    let daValutare = 0;
    for (const r of aperte) {
      const c = contatori[r.id];
      if (!c) continue;
      if (c.risposte < c.invitati) inAttesa += c.invitati - c.risposte;
      if (c.risposte > 0 && r.status !== "aggiudicata") daValutare += 1;
    }
    return {
      aperteCount: aperte.length,
      inAttesa,
      daValutare,
      aggiudicate: rfqs.filter((r) => r.status === "aggiudicata").length,
    };
  }, [rfqs, contatori]);

  const filtrate = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rfqs.filter((r) => {
      if (tab === "aperte" && !["bozza", "inviata", "in_valutazione"].includes(r.status)) return false;
      if (tab === "aggiudicate" && r.status !== "aggiudicata") return false;
      if (!q) return true;
      return (
        r.rfq_number.toLowerCase().includes(q) ||
        r.titolo.toLowerCase().includes(q) ||
        (r.orders?.order_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [rfqs, search, tab]);

  const handleCreate = () => {
    if (!titolo.trim()) return;
    create.mutate(
      {
        titolo: titolo.trim(),
        descrizione: descrizione.trim() || undefined,
        data_fabbisogno: fabbisogno || null,
        scadenza_offerte: scadenza || null,
      },
      {
        onSuccess: (r) => {
          setNewOpen(false);
          setTitolo("");
          setDescrizione("");
          setFabbisogno("");
          setScadenza("");
          navigate(`/azienda/richieste-offerta/${r.id}`);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileQuestion className="h-5 w-5 text-orange-500" />
              Richieste d'offerta
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Lo stesso elenco a più fornitori, poi si confronta e si ordina a chi conviene.
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nuova richiesta
          </Button>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <OperationalKpiCard
          label="Aperte"
          value={kpis.aperteCount}
          icon={FileQuestion}
          hint="in corso"
          tone="blue"
          onClick={() => setTab("aperte")}
          active={tab === "aperte"}
        />
        <OperationalKpiCard
          label="Da valutare"
          value={kpis.daValutare}
          icon={Inbox}
          hint={kpis.daValutare > 0 ? "con offerte" : "nessuna"}
          tone={kpis.daValutare > 0 ? "amber" : "slate"}
        />
        <OperationalKpiCard
          label="Senza risposta"
          value={kpis.inAttesa}
          icon={Clock}
          hint="fornitori muti"
          tone={kpis.inAttesa > 0 ? "orange" : "green"}
        />
        <OperationalKpiCard
          label="Aggiudicate"
          value={kpis.aggiudicate}
          icon={Trophy}
          hint="ordini fatti"
          tone="green"
          onClick={() => setTab("aggiudicate")}
          active={tab === "aggiudicate"}
        />
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          {(["aperte", "tutte", "aggiudicate"] as const).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "ghost"}
              size="sm"
              onClick={() => setTab(t)}
              className="capitalize"
            >
              {t}
            </Button>
          ))}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca richiesta..."
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtrate.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <FileQuestion className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-sm text-muted-foreground">
                {rfqs.length === 0
                  ? "Nessuna richiesta d'offerta. Si parte da qui quando il prezzo non lo sai ancora."
                  : "Nessuna richiesta con questi filtri."}
              </p>
              {rfqs.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Crea la prima
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-3 font-medium">N°</th>
                    <th className="p-3 font-medium">Oggetto</th>
                    <th className="p-3 font-medium">Commessa</th>
                    <th className="p-3 font-medium">Serve entro</th>
                    <th className="p-3 font-medium">Risposte</th>
                    <th className="p-3 font-medium text-right">Migliore offerta</th>
                    <th className="p-3 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrate.map((r) => {
                    const c = contatori[r.id] ?? { invitati: 0, risposte: 0, migliore: null };
                    const attesa = r.status === "inviata" ? giorniDaAttesa(r.created_at) : null;
                    return (
                      <tr
                        key={r.id}
                        className="border-b hover:bg-muted/40 cursor-pointer"
                        onClick={() => navigate(`/azienda/richieste-offerta/${r.id}`)}
                      >
                        <td className="p-3 font-mono text-xs">{r.rfq_number}</td>
                        <td className="p-3 font-medium text-slate-900">{r.titolo}</td>
                        <td className="p-3 text-slate-500">{r.orders?.order_code ?? "—"}</td>
                        <td className="p-3 text-slate-500">{dataIt(r.data_fabbisogno)}</td>
                        <td className="p-3">
                          <span className="tabular-nums">
                            {c.risposte}/{c.invitati}
                          </span>
                          {c.invitati > 0 && c.risposte < c.invitati && attesa && attesa > 3 && (
                            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              da {attesa}gg
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {c.migliore != null ? formatCurrency(c.migliore) : "—"}
                        </td>
                        <td className="p-3">
                          <Badge className={RDO_STATUS_COLORS[r.status] ?? ""}>
                            {RDO_STATUS_LABELS[r.status] ?? r.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuova richiesta d'offerta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rdo-titolo">Cosa ti serve</Label>
              <Input
                id="rdo-titolo"
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                placeholder="Es. Ferro d'armatura per fondazioni lotto B"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rdo-desc">Dettagli per il fornitore (facoltativo)</Label>
              <Textarea
                id="rdo-desc"
                rows={2}
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                placeholder="Condizioni, luogo di consegna, requisiti particolari."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rdo-fab">Serve in cantiere entro</Label>
                <Input id="rdo-fab" type="date" value={fabbisogno} onChange={(e) => setFabbisogno(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rdo-scad">Risposta entro</Label>
                <Input id="rdo-scad" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Prossimo passo: elenchi cosa serve e scegli a quali fornitori chiederlo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!titolo.trim() || create.isPending}>
              {create.isPending ? "Creazione..." : "Crea richiesta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

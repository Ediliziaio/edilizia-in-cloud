/**
 * Fondo TFR: liquidazioni e anticipi pagati ai dipendenti, e dipendenti il cui
 * TFR va a un fondo pensione o al Fondo Tesoreria INPS. Il fondo dello Stato
 * patrimoniale è: fondo di partenza + TFR maturato in azienda − liquidazioni e
 * anticipi.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useAggiungiMovimentoTfr, useAnnullaMovimentoTfr, useDestinazioniTfr, useDipendentiTfr, useMovimentiTfr,
  useSalvaDestinazioneTfr, type DestinazioneTfr, type TipoMovimentoTfr,
} from "@/hooks/controlloGestione/useTfr";
import { formatEuro, parseImportoIt } from "@/lib/controlloGestione/indiciBanca";
import { formatDateIt } from "@/lib/formatters";
import { PiggyBank, Plus, Undo2 } from "lucide-react";

const NESSUNO = "__nessuno__";

const TIPI: { value: TipoMovimentoTfr; label: string }[] = [
  { value: "liquidazione", label: "Liquidazione (fine rapporto)" },
  { value: "anticipo", label: "Anticipo" },
];

const DESTINAZIONI: { value: DestinazioneTfr; label: string }[] = [
  { value: "fondo_pensione", label: "Fondo pensione" },
  { value: "tesoreria_inps", label: "Fondo Tesoreria INPS" },
  { value: "azienda", label: "Resta in azienda" },
];

const etichettaDestinazione = (d: DestinazioneTfr) => DESTINAZIONI.find((x) => x.value === d)?.label ?? d;

export function TfrEditor() {
  const movimenti = useMovimentiTfr();
  const destinazioni = useDestinazioniTfr();
  const dipendenti = useDipendentiTfr();
  const aggiungi = useAggiungiMovimentoTfr();
  const annulla = useAnnullaMovimentoTfr();
  const salvaDest = useSalvaDestinazioneTfr();
  const { toast } = useToast();

  const nomi = useMemo(() => new Map((dipendenti.data ?? []).map((d) => [d.id, d.nome])), [dipendenti.data]);
  const nomeDi = (id: string | null) => (id ? nomi.get(id) ?? "Dipendente" : "—");

  const [mov, setMov] = useState({ tipo: "liquidazione" as TipoMovimentoTfr, dipendente: NESSUNO, data: "", importo: "", note: "" });
  const [dest, setDest] = useState({ dipendente: "", destinazione: "fondo_pensione" as DestinazioneTfr, dal: "" });

  const handleAggiungi = async () => {
    const importo = parseImportoIt(mov.importo);
    if (!mov.data || importo === null || Number.isNaN(importo) || importo <= 0) {
      toast({ title: "Mancano dati", description: "Servono data e importo lordo (es. 12.500).", variant: "destructive" });
      return;
    }
    try {
      await aggiungi.mutateAsync({
        tipo: mov.tipo,
        employee_id: mov.dipendente === NESSUNO ? null : mov.dipendente,
        data: mov.data,
        importo,
        note: mov.note.trim() || null,
      });
      setMov({ tipo: "liquidazione", dipendente: NESSUNO, data: "", importo: "", note: "" });
      toast({ title: "Registrato: il fondo TFR cala da quella data" });
    } catch (e) {
      toast({ title: "Non registrato", description: e instanceof Error ? e.message : "Riprova.", variant: "destructive" });
    }
  };

  const handleAnnulla = async (id: string) => {
    try {
      await annulla.mutateAsync(id);
      toast({ title: "Annullato: non conta più nel fondo" });
    } catch (e) {
      toast({ title: "Non annullato", description: e instanceof Error ? e.message : "Riprova.", variant: "destructive" });
    }
  };

  const handleSalvaDest = async () => {
    if (!dest.dipendente || !dest.dal) {
      toast({ title: "Mancano dati", description: "Scegli il dipendente e da quando vale la scelta.", variant: "destructive" });
      return;
    }
    try {
      await salvaDest.mutateAsync({ employee_id: dest.dipendente, destinazione: dest.destinazione, dal: dest.dal });
      setDest({ dipendente: "", destinazione: "fondo_pensione", dal: "" });
      toast({ title: "Destinazione del TFR salvata" });
    } catch (e) {
      toast({ title: "Non salvata", description: e instanceof Error ? e.message : "Riprova.", variant: "destructive" });
    }
  };

  const fuoriAzienda = (destinazioni.data ?? []).filter((d) => d.destinazione !== "azienda");

  return (
    <Card id="tfr" className="scroll-mt-24 rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PiggyBank className="h-4 w-4" /> Fondo TFR: liquidazioni e fondi pensione
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Il fondo TFR dello Stato patrimoniale è il fondo di partenza, più il TFR che matura con i cedolini, meno
          liquidazioni e anticipi pagati. Il TFR di chi lo versa a un fondo pensione o al Fondo Tesoreria INPS resta un
          costo del conto economico, ma non entra nel fondo: finché non è versato è un debito previdenziale.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Liquidazioni e anticipi pagati</h3>
          {movimenti.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : movimenti.data && movimenti.data.length > 0 ? (
            <ul className="divide-y rounded-xl border">
              {movimenti.data.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {m.tipo === "liquidazione" ? "Liquidazione" : "Anticipo"} · {nomeDi(m.employee_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateIt(m.data)} · {formatEuro(m.importo)}{m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 text-xs" disabled={annulla.isPending}
                    onClick={() => handleAnnulla(m.id)}>
                    <Undo2 className="h-3.5 w-3.5" /> Annulla
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nessuna liquidazione o anticipo registrato.</p>
          )}

          <div className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Label className="text-xs">Tipo</Label>
              <Select value={mov.tipo} onValueChange={(v) => setMov((s) => ({ ...s, tipo: v as TipoMovimentoTfr }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPI.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs">Dipendente (facoltativo)</Label>
              <Select value={mov.dipendente} onValueChange={(v) => setMov((s) => ({ ...s, dipendente: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>Non indicato</SelectItem>
                  {(dipendenti.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="tfr-data">Data di pagamento</Label>
              <Input id="tfr-data" type="date" value={mov.data} onChange={(e) => setMov((s) => ({ ...s, data: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs" htmlFor="tfr-importo">Importo lordo (€)</Label>
              <Input id="tfr-importo" inputMode="decimal" placeholder="es. 12.500" value={mov.importo}
                onChange={(e) => setMov((s) => ({ ...s, importo: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label className="text-xs" htmlFor="tfr-note">Note</Label>
              <Input id="tfr-note" placeholder="facoltative" value={mov.note} onChange={(e) => setMov((s) => ({ ...s, note: e.target.value }))} />
            </div>
            <div className="flex items-end sm:col-span-2">
              <Button size="sm" className="gap-1.5" onClick={handleAggiungi} disabled={aggiungi.isPending}>
                <Plus className="h-4 w-4" /> Registra
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Importo lordo, prima delle ritenute: è quello che esce dal fondo. Non è un costo, il costo è già contato
            mese per mese.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Dipendenti che non lasciano il TFR in azienda</h3>
          {destinazioni.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : fuoriAzienda.length > 0 ? (
            <ul className="divide-y rounded-xl border">
              {fuoriAzienda.map((d) => (
                <li key={d.employee_id} className="px-3 py-2 text-sm">
                  <span className="font-medium">{nomeDi(d.employee_id)}</span>
                  <span className="text-muted-foreground"> · {etichettaDestinazione(d.destinazione)} dal {formatDateIt(d.dal)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Tutti lasciano il TFR in azienda.</p>
          )}

          {dipendenti.data && dipendenti.data.length === 0 && !dipendenti.isLoading ? (
            <p className="text-xs text-muted-foreground">Non vedi i dipendenti: serve il permesso di vedere il personale.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <Label className="text-xs">Dipendente</Label>
                <Select value={dest.dipendente} onValueChange={(v) => setDest((s) => ({ ...s, dipendente: v }))}>
                  <SelectTrigger><SelectValue placeholder="Scegli" /></SelectTrigger>
                  <SelectContent>
                    {(dipendenti.data ?? []).filter((d) => d.attivo).map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="lg:col-span-2">
                <Label className="text-xs">Il TFR va a</Label>
                <Select value={dest.destinazione} onValueChange={(v) => setDest((s) => ({ ...s, destinazione: v as DestinazioneTfr }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DESTINAZIONI.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs" htmlFor="tfr-dal">Dal</Label>
                <Input id="tfr-dal" type="date" value={dest.dal} onChange={(e) => setDest((s) => ({ ...s, dal: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <Button size="sm" onClick={handleSalvaDest} disabled={salvaDest.isPending}>Salva</Button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Dal mese indicato il TFR del dipendente non entra nel fondo; quello maturato prima resta in azienda. Il Fondo
            Tesoreria INPS riguarda le aziende con almeno 50 dipendenti. Si considera versato con l'F24 del 16 del mese
            dopo (Tesoreria) o entro il 16 del mese dopo la fine del trimestre (fondi pensione). «Resta in azienda»
            corregge una scelta inserita per errore.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}

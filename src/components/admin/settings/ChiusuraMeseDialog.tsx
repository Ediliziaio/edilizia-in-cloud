/**
 * ChiusuraMeseDialog — chiude il mese su TUTTI i clienti-servizio attivi in una
 * volta sola.
 *
 * Prima esisteva solo il registro per singolo cliente (ServiceBillingsDialog):
 * ogni mese andava aperto una volta per cliente e compilato a mano. Con dieci
 * clienti a provvigione sono dieci dialog identici, e alla terza mensilita' si
 * smette — motivo per cui aedix_service_billings era rimasta vuota e il
 * Fatturato Servizi non aveva niente da mostrare.
 *
 * Qui il mese si chiude in una schermata: i clienti a importo fisso arrivano
 * gia' compilati (non c'e' niente da decidere), quelli a provvigione chiedono
 * solo il dato che il sistema non puo' sapere — la base del mese, cioe' quanto
 * ha fatturato o incassato il cliente — e l'importo dovuto si calcola da se'.
 *
 * Si puo' rieseguire: l'upsert su (service_client_id, periodo) aggiorna la riga
 * del mese invece di crearne un'altra, cosi' correggere una base non produce
 * doppioni nel fatturato.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarCheck, CheckCircle2 } from "lucide-react";
import type { ProvRiga } from "./ServiceBillingsDialog";

const sb = () => supabase as any;

// useGrouping esplicito (booleano, non la stringa "always" che TS non accetta):
// il default CLDR italiano non raggruppa le migliaia sotto i 5 numeri, quindi
// 2500 e 99500 uno sotto l'altro sembrerebbero formattati male.
const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true })
    .format(Math.round(n || 0));

const toMonthInput = (iso: string) => iso.slice(0, 7);
const fromMonthInput = (m: string) => `${m}-01`;
const meseCorrente = () => new Date().toISOString().slice(0, 7);

interface ClienteAttivo {
  id: string;
  cliente_nome: string;
  billing_model: string;
  importo: number | null;
  ricorrenza: string | null;
  commerciale: string | null;
  product_line_id: string;
}
interface CommLine { id: string; service_client_id: string; etichetta: string | null; base: string; percentuale: number }

/** Riga in lavorazione nella schermata di chiusura. */
interface RigaMese {
  cliente: ClienteAttivo;
  esisteGia: boolean;
  incassatoEsistente: number;
  righe: ProvRiga[];      // solo per i clienti a provvigione
  dovuto: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nomiServizi: Map<string, string>;
}

export function ChiusuraMeseDialog({ open, onOpenChange, nomiServizi }: Props) {
  const qc = useQueryClient();
  const [mese, setMese] = useState(meseCorrente);
  const [righe, setRighe] = useState<RigaMese[]>([]);

  const periodo = fromMonthInput(mese);

  // Clienti attivi + le loro righe di provvigione + gli incassi gia' presenti
  // per il mese scelto (per non sovrascrivere quello che hai gia' incassato).
  const { data, isLoading } = useQuery({
    queryKey: ["chiusura-mese", periodo],
    enabled: open,
    queryFn: async () => {
      const [cli, lines, esistenti, storico] = await Promise.all([
        sb().from("aedix_service_clients")
          .select("id,cliente_nome,billing_model,importo,ricorrenza,commerciale,product_line_id")
          .eq("stato", "attivo").order("cliente_nome"),
        sb().from("aedix_service_commission_lines").select("id,service_client_id,etichetta,base,percentuale").eq("attivo", true).order("ordine"),
        sb().from("aedix_service_billings").select("service_client_id,importo_dovuto,importo_incassato,righe_provvigione").eq("periodo", periodo),
        // Chi e' gia' stato addebitato almeno una volta, in qualunque mese.
        sb().from("aedix_service_billings").select("service_client_id"),
      ]);
      return {
        clienti: (cli.data ?? []) as ClienteAttivo[],
        lines: (lines.data ?? []) as CommLine[],
        esistenti: (esistenti.data ?? []) as { service_client_id: string; importo_dovuto: number; importo_incassato: number; righe_provvigione: ProvRiga[] | null }[],
        giaAddebitati: new Set(((storico.data ?? []) as { service_client_id: string }[]).map((b) => b.service_client_id)),
      };
    },
  });

  // Ricostruisce la schermata quando cambia mese o arrivano i dati. Le basi gia'
  // inserite in un mese chiuso in precedenza si ripresentano, cosi' la
  // riesecuzione e' una correzione e non un ricominciare da capo.
  useEffect(() => {
    if (!data) return;
    const perCliente = new Map(data.esistenti.map((e) => [e.service_client_id, e]));
    setRighe(
      data.clienti
        // Un una-tantum si addebita una volta e basta: se e' gia' stato
        // fatturato in un mese qualsiasi non deve ripresentarsi ogni chiusura,
        // altrimenti un corso venduto a marzo continuerebbe a produrre un
        // dovuto ad aprile, maggio, giugno.
        .filter((c) => {
          const unaTantum = c.billing_model === "una_tantum" || c.ricorrenza === "una_tantum";
          if (!unaTantum) return true;
          return !data.giaAddebitati.has(c.id) || perCliente.has(c.id);
        })
        .map((c) => {
        const esistente = perCliente.get(c.id);
        const isProv = c.billing_model === "provvigione";
        const suoi = data.lines.filter((l) => l.service_client_id === c.id);
        const righeProv: ProvRiga[] = isProv
          ? (esistente?.righe_provvigione?.length
              ? esistente.righe_provvigione
              : suoi.map((l) => ({
                  line_id: l.id, etichetta: l.etichetta ?? "", base: l.base,
                  base_valore: 0, percentuale: Number(l.percentuale) || 0, importo: 0,
                })))
          : [];
        const dovuto = isProv
          ? righeProv.reduce((s, r) => s + (Number(r.importo) || 0), 0)
          : Number(esistente?.importo_dovuto ?? c.importo ?? 0);
        return {
          cliente: c,
          esisteGia: !!esistente,
          incassatoEsistente: Number(esistente?.importo_incassato ?? 0),
          righe: righeProv,
          dovuto,
        };
      }),
    );
  }, [data]);

  const aggiornaBase = (idxCliente: number, idxRiga: number, base_valore: number) =>
    setRighe((prev) => prev.map((r, i) => {
      if (i !== idxCliente) return r;
      const nuove = r.righe.map((rg, j) =>
        j === idxRiga ? { ...rg, base_valore, importo: Math.round((base_valore * rg.percentuale) / 100) } : rg);
      return { ...r, righe: nuove, dovuto: nuove.reduce((s, rg) => s + rg.importo, 0) };
    }));

  const aggiornaDovuto = (idxCliente: number, dovuto: number) =>
    setRighe((prev) => prev.map((r, i) => (i === idxCliente ? { ...r, dovuto } : r)));

  const totale = useMemo(() => righe.reduce((s, r) => s + r.dovuto, 0), [righe]);
  const daCompilare = useMemo(
    () => righe.filter((r) => r.cliente.billing_model === "provvigione" && r.dovuto === 0).length,
    [righe],
  );

  const chiudi = useMutation({
    mutationFn: async () => {
      // Si scrivono solo le righe con un importo: un cliente a provvigione di
      // cui non conosci ancora la base non deve entrare a zero nel fatturato,
      // altrimenti sembra che quel mese non abbia prodotto nulla.
      const payload = righe
        .filter((r) => r.dovuto > 0)
        .map((r) => ({
          service_client_id: r.cliente.id,
          periodo,
          importo_dovuto: r.dovuto,
          importo_incassato: r.incassatoEsistente,
          stato: r.incassatoEsistente >= r.dovuto ? "incassato" : "dovuto",
          provvigione_commerciale: r.cliente.commerciale ?? null,
          righe_provvigione: r.cliente.billing_model === "provvigione" ? r.righe : [],
          updated_at: new Date().toISOString(),
        }));
      if (!payload.length) throw new Error("Nessun importo da registrare");
      const { error } = await sb()
        .from("aedix_service_billings")
        .upsert(payload, { onConflict: "service_client_id,periodo" });
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => {
      toast.success(`Mese chiuso su ${n} client${n === 1 ? "e" : "i"}`, {
        description: "Gli importi sono ora nel Fatturato Servizi.",
      });
      qc.invalidateQueries({ queryKey: ["aedix-service-billings"] });
      qc.invalidateQueries({ queryKey: ["chiusura-mese"] });
      qc.invalidateQueries({ queryKey: ["servizi-fatturato"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Chiusura non riuscita", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" /> Chiudi il mese
          </DialogTitle>
          <DialogDescription>
            Registra in un colpo solo quanto ti devono tutti i clienti-servizio attivi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 border-b pb-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mese</Label>
            <Input type="month" value={mese} onChange={(e) => setMese(e.target.value)} className="w-[160px]" />
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-muted-foreground">Totale del mese</div>
            <div className="text-xl font-semibold tabular-nums">{eur(totale)}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : righe.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nessun cliente-servizio attivo. I clienti nascono da un'opportunità vinta, oppure dal pulsante “Nuovo cliente-servizio”.
          </div>
        ) : (
          <div className="space-y-2">
            {righe.map((r, i) => {
              const isProv = r.cliente.billing_model === "provvigione";
              return (
                <div key={r.cliente.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{r.cliente.cliente_nome}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {nomiServizi.get(r.cliente.product_line_id) ?? "—"}
                    </Badge>
                    {r.esisteGia && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> già registrato
                      </span>
                    )}
                    <span className="ml-auto text-sm font-semibold tabular-nums">{eur(r.dovuto)}</span>
                  </div>

                  {isProv ? (
                    <div className="mt-2 space-y-1.5">
                      {r.righe.length === 0 ? (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Cliente a provvigione senza righe configurate: apri la scheda del cliente e aggiungile.
                        </p>
                      ) : r.righe.map((rg, j) => (
                        <div key={rg.line_id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground min-w-[150px]">
                            {rg.etichetta || "Provvigione"} · {rg.percentuale}% su {rg.base === "incassato" ? "incassato" : "fatturato"}
                          </span>
                          <Input
                            type="number" className="h-8 w-[130px]" placeholder="base del mese"
                            value={rg.base_valore || ""}
                            onChange={(e) => aggiornaBase(i, j, Number(e.target.value))}
                          />
                          <span className="tabular-nums text-muted-foreground">→ {eur(rg.importo)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground min-w-[150px]">
                        {r.cliente.billing_model === "una_tantum" ? "Una-tantum" : "Importo fisso"}
                        {r.cliente.ricorrenza ? ` · ${r.cliente.ricorrenza}` : ""}
                      </span>
                      <Input
                        type="number" className="h-8 w-[130px]"
                        value={r.dovuto || ""}
                        onChange={(e) => aggiornaDovuto(i, Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {daCompilare > 0 && (
            <p className="text-[11px] text-muted-foreground sm:mr-auto">
              {daCompilare} client{daCompilare === 1 ? "e" : "i"} a provvigione senza base: {daCompilare === 1 ? "verrà escluso" : "verranno esclusi"} da questa chiusura.
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => chiudi.mutate()} disabled={chiudi.isPending || totale <= 0}>
            {chiudi.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registra {eur(totale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
 * Per i clienti marketing collegati a un'azienda quella base la conosce gia'
 * il gestionale (fatture del mese, o vendite chiuse nel CRM) e viene proposta;
 * i clienti a scaglioni progressivi hanno una riga sola, calcolata a scaglioni.
 *
 * Si puo' rieseguire: l'upsert su (service_client_id, periodo) aggiorna la riga
 * del mese invece di crearne un'altra, cosi' correggere una base non produce
 * doppioni nel fatturato.
 */
import { useMemo, useState } from "react";
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
import { Loader2, CalendarCheck, CheckCircle2, Sparkles } from "lucide-react";
import type { ProvRiga } from "./ServiceBillingsDialog";
import {
  aliquotaEffettiva, leggiMese, meseLeggibile, normalizzaScaglioni, provvigioneAScaglioni, type ClienteMarketing, type Scaglione,
} from "@/components/admin/clienti-marketing/provvigioni";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

// useGrouping esplicito (booleano, non la stringa "always" che TS non accetta):
// il default CLDR italiano non raggruppa le migliaia sotto i 5 numeri, quindi
// 2500 e 99500 uno sotto l'altro sembrerebbero formattati male.
const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true })
    .format(Math.round(n || 0));

const fromMonthInput = (m: string) => `${m}-01`;
const meseCorrente = () => new Date().toISOString().slice(0, 7);

/** La riga «a scaglioni» di un cliente Marketing Edile: una sola, sul venduto del mese. */
const RIGA_SCAGLIONI = "scaglioni";

interface ClienteAttivo {
  id: string;
  cliente_nome: string;
  billing_model: string;
  importo: number | null;
  ricorrenza: string | null;
  commerciale: string | null;
  product_line_id: string;
  provvigione_scaglioni: unknown;
}
interface CommLine { id: string; service_client_id: string; etichetta: string | null; base: string; percentuale: number }
interface BillingEsistente { service_client_id: string; importo_dovuto: number; importo_incassato: number; righe_provvigione: ProvRiga[] | null }

/** Il venduto del mese che il gestionale conosce già per un cliente marketing. */
interface Suggerimento { venduto: number; fonte: "fatture" | "vendite" }

interface DatiMese {
  clienti: ClienteAttivo[];
  lines: CommLine[];
  esistenti: BillingEsistente[];
  giaAddebitati: Set<string>;
  suggeriti: Map<string, Suggerimento>;
}

/** Riga in lavorazione nella schermata di chiusura. */
interface RigaMese {
  cliente: ClienteAttivo;
  esisteGia: boolean;
  incassatoEsistente: number;
  righe: ProvRiga[];      // solo per i clienti a provvigione
  scaglioni: Scaglione[]; // solo per i clienti a scaglioni progressivi
  suggerimento: Suggerimento | null;
  dovuto: number;
}

/** L'importo di una riga di provvigione a partire dalla sua base. */
function importoRiga(rg: ProvRiga, base_valore: number, scaglioni: Scaglione[]): ProvRiga {
  if (rg.line_id === RIGA_SCAGLIONI) {
    return { ...rg, base_valore, percentuale: aliquotaEffettiva(base_valore, scaglioni), importo: provvigioneAScaglioni(base_valore, scaglioni) };
  }
  return { ...rg, base_valore, importo: Math.round((base_valore * rg.percentuale) / 100) };
}

/**
 * La schermata di partenza per il mese: le basi gia' inserite in una chiusura
 * precedente si ripresentano, cosi' la riesecuzione e' una correzione e non un
 * ricominciare da capo; per le righe nuove entra il venduto proposto dal
 * gestionale.
 */
function costruisciRighe(data: DatiMese): RigaMese[] {
  const perCliente = new Map(data.esistenti.map((e) => [e.service_client_id, e]));
  return data.clienti
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
      const scaglioni = isProv ? normalizzaScaglioni(c.provvigione_scaglioni) : [];
      const sugg = data.suggeriti.get(c.id) ?? null;
      const baseProposta = (base: string) => (sugg && base === "fatturato" ? sugg.venduto : 0);
      const righeProv: ProvRiga[] = isProv
        ? (esistente?.righe_provvigione?.length
            ? esistente.righe_provvigione
            : scaglioni.length
              ? [importoRiga({ line_id: RIGA_SCAGLIONI, etichetta: "Provvigione a scaglioni", base: "fatturato", base_valore: 0, percentuale: 0, importo: 0 }, baseProposta("fatturato"), scaglioni)]
              : suoi.map((l) => importoRiga({
                  line_id: l.id, etichetta: l.etichetta ?? "", base: l.base,
                  base_valore: 0, percentuale: Number(l.percentuale) || 0, importo: 0,
                }, baseProposta(l.base), scaglioni)))
        : [];
      const dovuto = isProv
        ? righeProv.reduce((s, r) => s + (Number(r.importo) || 0), 0)
        : Number(esistente?.importo_dovuto ?? c.importo ?? 0);
      return {
        cliente: c,
        esisteGia: !!esistente,
        incassatoEsistente: Number(esistente?.importo_incassato ?? 0),
        righe: righeProv,
        scaglioni,
        suggerimento: sugg,
        dovuto,
      };
    });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nomiServizi: Map<string, string>;
}

export function ChiusuraMeseDialog({ open, onOpenChange, nomiServizi }: Props) {
  const [mese, setMese] = useState(meseCorrente);
  const periodo = fromMonthInput(mese);

  // Clienti attivi + le loro righe di provvigione + gli incassi gia' presenti
  // per il mese scelto (per non sovrascrivere quello che hai gia' incassato).
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["chiusura-mese", periodo],
    enabled: open,
    // Le basi si scrivono a mano: un cambio di finestra non deve rifare la schermata.
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DatiMese> => {
      const [cli, lines, esistenti, storico, riepilogo] = await Promise.all([
        sb().from("aedix_service_clients")
          .select("id,cliente_nome,billing_model,importo,ricorrenza,commerciale,product_line_id,provvigione_scaglioni")
          .eq("stato", "attivo").order("cliente_nome"),
        sb().from("aedix_service_commission_lines").select("id,service_client_id,etichetta,base,percentuale").eq("attivo", true).order("ordine"),
        sb().from("aedix_service_billings").select("service_client_id,importo_dovuto,importo_incassato,righe_provvigione").eq("periodo", periodo),
        // Chi e' gia' stato addebitato almeno una volta, in qualunque mese.
        sb().from("aedix_service_billings").select("service_client_id"),
        // Per i clienti marketing collegati a un'azienda il venduto del mese lo
        // sa gia' il gestionale (fatture, o vendite chiuse nel CRM): si propone.
        sb().rpc("admin_clienti_marketing_riepilogo", { p_mese: periodo }),
      ]);
      const suggeriti = new Map<string, Suggerimento>();
      for (const r of (riepilogo.data ?? []) as ClienteMarketing[]) {
        const l = leggiMese({ ...r, fatturato_mese: r.fatturato_mese == null ? null : Number(r.fatturato_mese), valore_vinto_mese: Number(r.valore_vinto_mese) || 0 }, false);
        if (l.fonteVenduto !== "nessuna" && l.venduto > 0) suggeriti.set(r.service_client_id, { venduto: l.venduto, fonte: l.fonteVenduto });
      }
      return {
        clienti: (cli.data ?? []) as ClienteAttivo[],
        lines: (lines.data ?? []) as CommLine[],
        esistenti: (esistenti.data ?? []) as BillingEsistente[],
        giaAddebitati: new Set(((storico.data ?? []) as { service_client_id: string }[]).map((b) => b.service_client_id)),
        suggeriti,
      };
    },
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

        <div className="space-y-1.5 border-b pb-3">
          <Label className="text-xs text-muted-foreground">Mese</Label>
          <Input type="month" value={mese} onChange={(e) => setMese(e.target.value)} className="w-[160px]" />
        </div>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          // La chiave rimonta la schermata a ogni mese e a ogni lettura nuova dei
          // dati: le righe ripartono da quello che il mese ha davvero.
          <CorpoChiusura key={`${periodo}-${dataUpdatedAt}`} data={data} periodo={periodo} nomiServizi={nomiServizi} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CorpoChiusura({ data, periodo, nomiServizi, onOpenChange }: { data: DatiMese; periodo: string; nomiServizi: Map<string, string>; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [righe, setRighe] = useState<RigaMese[]>(() => costruisciRighe(data));

  const aggiornaBase = (idxCliente: number, idxRiga: number, base_valore: number) =>
    setRighe((prev) => prev.map((r, i) => {
      if (i !== idxCliente) return r;
      const nuove = r.righe.map((rg, j) => (j === idxRiga ? importoRiga(rg, base_valore, r.scaglioni) : rg));
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
      qc.invalidateQueries({ queryKey: ["clienti-marketing"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Chiusura non riuscita", { description: e.message }),
  });

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Totale di {meseLeggibile(periodo)}</span>
        <span className="text-xl font-semibold tabular-nums">{eur(totale)}</span>
      </div>

      {righe.length === 0 ? (
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
                          {rg.line_id === RIGA_SCAGLIONI
                            ? <>A scaglioni · {rg.percentuale.toLocaleString("it-IT")}% effettivo sul venduto imponibile</>
                            : <>{rg.etichetta || "Provvigione"} · {rg.percentuale}% su {rg.base === "incassato" ? "incassato" : "fatturato"}</>}
                        </span>
                        <Input
                          type="number" className="h-8 w-[130px]" placeholder="base del mese"
                          value={rg.base_valore || ""}
                          onChange={(e) => aggiornaBase(i, j, Number(e.target.value))}
                        />
                        <span className="tabular-nums text-muted-foreground">→ {eur(rg.importo)}</span>
                        {r.suggerimento && rg.base === "fatturato" && rg.base_valore !== r.suggerimento.venduto && (
                          <button type="button" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" onClick={() => aggiornaBase(i, j, r.suggerimento?.venduto ?? 0)}>
                            <Sparkles className="h-3 w-3" /> usa {eur(r.suggerimento.venduto)} dal gestionale
                          </button>
                        )}
                      </div>
                    ))}
                    {r.suggerimento && (
                      <p className="text-[11px] text-muted-foreground">
                        Il gestionale conosce {r.suggerimento.fonte === "fatture" ? "il fatturato imponibile delle fatture" : "il valore delle vendite chiuse nel CRM"} di {meseLeggibile(periodo)}: {eur(r.suggerimento.venduto)}.
                      </p>
                    )}
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
    </>
  );
}

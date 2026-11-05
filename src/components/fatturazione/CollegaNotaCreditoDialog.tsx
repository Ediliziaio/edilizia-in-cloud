/**
 * Quale fattura storna questa nota di credito. Il riferimento dell'XML, se è univoco, si trova già spuntato; se non
 * c'è o non è univoco lo si dice e si sceglie a mano. In ogni caso conferma una persona: qui niente si collega da solo.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { leggiImporto } from "@/lib/fatturazione/quoteOrdini";
import {
  capienza, importoNotaCredito, numeroNormalizzato, problemaQuote, proponiStorno, quotaIniziale, riferimentiDaXml,
  type FatturaCandidata,
} from "@/lib/fatturazione/notaCreditoStorno";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import type { LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface NotaDaCollegare {
  id: string;
  company_id: string;
  numero_fattura: string | null;
  data_fattura: string | null;
  cedente_ragione_sociale: string | null;
  totale_documento: number | string | null;
  imponibile_totale?: number | string | null;
  iva_totale?: number | string | null;
}

const testoImporto = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

export function CollegaNotaCreditoDialog({ nota, onChiudi }: { nota: NotaDaCollegare; onChiudi: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["nota-credito-collega", nota.id],
    staleTime: 0,
    queryFn: async () => {
      const [candidate, doc, storni] = await Promise.all([
        db.rpc("nota_credito_candidate", { p_nota: nota.id }),
        db.from("fatture_ricevute").select("xml_raw, indice_corpo, ritenuta_importo").eq("id", nota.id).eq("company_id", nota.company_id).maybeSingle(),
        db.from("note_credito_storni").select("fattura_id, importo").eq("nota_id", nota.id).eq("company_id", nota.company_id),
      ]);
      if (candidate.error) throw candidate.error;
      if (doc.error) throw doc.error;
      if (storni.error) throw storni.error;
      return {
        candidate: (candidate.data ?? []) as FatturaCandidata[],
        xml: (doc.data?.xml_raw ?? null) as string | null,
        indiceCorpo: (doc.data?.indice_corpo ?? 0) as number,
        ritenuta: doc.data?.ritenuta_importo as number | null,
        storni: (storni.data ?? []) as { fattura_id: string; importo: number }[],
      };
    },
  });

  const importoNota = importoNotaCredito({ ...nota, ritenuta_importo: data?.ritenuta });
  const riferimenti = useMemo(
    () => (data?.xml ? riferimentiDaXml(data.xml, new DOMParser() as unknown as LettoreXml, data.indiceCorpo) : []),
    [data?.xml, data?.indiceCorpo],
  );
  const esito = useMemo(
    () => proponiStorno(riferimenti, data?.candidate ?? [], { importo: importoNota, data: nota.data_fattura }),
    [riferimenti, data?.candidate, importoNota, nota.data_fattura],
  );

  const [importi, setImporti] = useState<Record<string, string>>({});
  const [cerca, setCerca] = useState("");
  const [letto, setLetto] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);

  // Si parte da com'è ora; se non c'è ancora niente, da quello che dice l'XML.
  useEffect(() => {
    if (!data || letto) return;
    setLetto(true);
    const iniziali = data.storni.length > 0
      ? data.storni.map((s) => [s.fattura_id, Number(s.importo)] as const)
      : esito.proposte.map((p) => [p.fatturaId, p.importo] as const);
    setImporti(Object.fromEntries(iniziali.map(([id, v]) => [id, testoImporto(v)])));
  }, [data, letto, esito.proposte]);

  const collegata = (data?.storni.length ?? 0) > 0;
  const candidate = useMemo(() => data?.candidate ?? [], [data?.candidate]);
  const scelte = candidate.filter((c) => importi[c.id] !== undefined);
  const assegnato = scelte.reduce((s, c) => s + Math.round(leggiImporto(importi[c.id]) * 100), 0) / 100;
  const nonAssegnato = Math.max(0, Math.round((importoNota - assegnato) * 100) / 100);
  const problema = problemaQuote(scelte.map((c) => ({ importo: leggiImporto(importi[c.id]), capienza: capienza(c) })), importoNota);
  const daContabilizzare = scelte.filter((c) => !c.company_cost_id && !c.storico_esterno);
  const soloStorico = scelte.filter((c) => !c.company_cost_id && c.storico_esterno);
  const q = numeroNormalizzato(cerca);
  const elenco = candidate.filter((c) => importi[c.id] !== undefined || !q || numeroNormalizzato(c.numero_fattura).includes(q));

  const scegli = (c: FatturaCandidata, si: boolean) => setImporti((prima) => {
    if (!si) {
      const { [c.id]: _tolta, ...resto } = prima;
      return resto;
    }
    return { ...prima, [c.id]: testoImporto(quotaIniziale(c, importoNota, assegnato)) };
  });

  const aggiorna = () => {
    refreshFinancialQueries(queryClient);
    for (const k of ["fatture-ricevute", "fattura-ricevuta-riepilogo", "note-credito-storni", "nota-credito-collega", "fatture-ricevute-pagamento", "oda-contabilita", "margin"]) {
      void queryClient.invalidateQueries({ queryKey: [k] });
    }
  };

  const salva = async () => {
    setSalvataggio(true);
    try {
      const { data: r, error: e } = await db.rpc("nota_credito_collega", {
        p_nota: nota.id,
        p_quote: scelte.map((c) => ({ fattura_id: c.id, importo: leggiImporto(importi[c.id]) })),
      });
      if (e) throw e;
      const parti: string[] = [];
      if (r.fatture_chiuse?.length) parti.push(`Chiusa: ${r.fatture_chiuse.join(", ")}.`);
      if (Number(r.credito_residuo) > 0) parti.push(`${formatCurrency(r.credito_residuo)} non hanno trovato rate aperte: sono un credito verso il fornitore.`);
      if (Number(r.non_assegnato) > 0) parti.push(`${formatCurrency(r.non_assegnato)} della nota restano da assegnare.`);
      toast.success(`Debito ridotto di ${formatCurrency(r.stornato)}`, { description: parti.join(" ") || undefined });
      if (r.riba_avvisate?.length) {
        toast.warning("Ridotto un addebito già avvisato o vicino alla scadenza", {
          description: "La banca addebita l'importo pieno finché nessuno la blocca, e se la scadenza è passata può averlo già fatto: controlla, poi avvisa il fornitore o blocca la RiBa.",
          duration: 12_000,
        });
      }
      aggiorna();
      onChiudi();
    } catch (e) {
      toast.error("Collegamento non salvato", { description: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
    } finally {
      setSalvataggio(false);
    }
  };

  const togli = async () => {
    setSalvataggio(true);
    try {
      const { data: r, error: e } = await db.rpc("nota_credito_scollega", { p_nota: nota.id });
      if (e) throw e;
      const restano: string[] = r.fatture_restano_contabilizzate ?? [];
      toast.success("Collegamento tolto: costo e rate sono tornati come prima", {
        description: restano.length ? `${restano.join(", ")} ${restano.length === 1 ? "resta contabilizzata" : "restano contabilizzate"}: ci sono pagamenti o altri documenti sopra.` : undefined,
      });
      aggiorna();
      onChiudi();
    } catch (e) {
      toast.error("Collegamento non tolto", { description: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
    } finally {
      setSalvataggio(false);
    }
  };

  const nomeCandidata = (id: string) => candidate.find((c) => c.id === id)?.numero_fattura ?? "";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quale fattura storna?</DialogTitle>
          <DialogDescription>
            {nota.cedente_ragione_sociale ?? "Fornitore"} · nota n. {nota.numero_fattura ?? "—"} · <span className="font-medium text-foreground">{formatCurrency(importoNota)}</span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm">Non riesco a leggere le fatture di questo fornitore.</p>
        ) : (
          <div className="space-y-3">
            {!collegata && esito.proposte.length > 0 && (
              <p className="rounded-md border bg-muted/40 p-2.5 text-sm">
                Nel file la nota cita {esito.proposte.map((p) => nomeCandidata(p.fatturaId)).join(", ")}. L’ho spuntata qui sotto: controlla e conferma.
              </p>
            )}
            {!collegata && esito.irrisolti.map((x) => (
              <p key={x.riferimento.numero} role="status" className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
                {x.motivo === "non_trovata"
                  ? `Il file cita la fattura «${x.riferimento.numero}», ma tra quelle di questo fornitore non c’è: scegli qui sotto, se è un’altra.`
                  : x.motivo === "data_diversa"
                    ? `Il file cita la fattura «${x.riferimento.numero}», ma la data non torna con quella di questo fornitore: può essere un altro anno. Scegli tu.`
                    : `Più fatture di questo fornitore hanno il numero «${x.riferimento.numero}»: scegli tu quella giusta.`}
              </p>
            ))}
            {!collegata && riferimenti.length === 0 && (
              <p className="text-sm text-muted-foreground">Il documento non dice quale fattura rettifica: scegli qui sotto.</p>
            )}

            {candidate.length > 8 && (
              <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per numero" aria-label="Cerca la fattura per numero" className="h-9" />
            )}
            {candidate.length === 0 ? (
              <p className="text-sm text-muted-foreground">Questo fornitore non ha fatture registrate da stornare.</p>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                {elenco.map((c) => {
                  const scelta = importi[c.id] !== undefined;
                  const piena = capienza(c) <= 0;
                  return (
                    <li key={c.id} className="flex items-center gap-2 px-2.5 py-2 text-sm">
                      <Checkbox
                        id={`storno-${c.id}`}
                        checked={scelta}
                        disabled={piena && !scelta}
                        onCheckedChange={(v) => scegli(c, v === true)}
                        aria-label={`Storna la fattura ${c.numero_fattura ?? ""}`}
                      />
                      <label htmlFor={`storno-${c.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="font-medium">{c.numero_fattura ?? "s/n"}</span>
                        <span className="text-muted-foreground"> · {c.data_fattura ? formatDateShort(c.data_fattura) : "—"} · {formatCurrency(Math.abs(Number(c.totale_documento) || 0))}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.storico_esterno && !c.company_cost_id
                            ? "Storico: pagata fuori dal gestionale"
                            : !c.company_cost_id
                              ? "Non ancora contabilizzata"
                              : Number(c.aperto) > 0 ? `Da pagare ${formatCurrency(c.aperto)}` : "Niente da pagare"}
                          {Number(c.stornato) > 0 ? ` · già stornati ${formatCurrency(c.stornato)}` : ""}
                        </span>
                      </label>
                      {scelta && (
                        <Input
                          value={importi[c.id]}
                          onChange={(e) => setImporti((p) => ({ ...p, [c.id]: e.target.value }))}
                          inputMode="decimal"
                          aria-label={`Importo da stornare sulla fattura ${c.numero_fattura ?? ""}`}
                          className="h-8 w-24 text-right tabular-nums"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {scelte.length > 0 && !problema && (
              <div className="space-y-1 text-sm text-muted-foreground">
                {nonAssegnato > 0.01 && <p className="text-amber-700 dark:text-amber-400">{formatCurrency(nonAssegnato)} della nota restano senza fattura.</p>}
                {daContabilizzare.length > 0 && <p>{daContabilizzare.map((c) => c.numero_fattura).join(", ")} non è ancora tra i costi: la contabilizzo insieme.</p>}
                {soloStorico.length > 0 && <p>{soloStorico.map((c) => c.numero_fattura).join(", ")}: è storico, resta solo il collegamento senza toccare costi e rate.</p>}
              </div>
            )}
            {scelte.length > 0 && problema && <p role="alert" className="text-sm text-destructive">{problema}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {collegata ? (
            <Button variant="ghost" disabled={salvataggio} onClick={() => void togli()}>Togli il collegamento</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onChiudi}>Annulla</Button>
            <Button disabled={salvataggio || isLoading || !!problema} onClick={() => void salva()}>
              {salvataggio && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {collegata ? "Salva" : "Riduci il debito"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

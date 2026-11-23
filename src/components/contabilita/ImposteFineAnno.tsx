/**
 * Le imposte dell'esercizio in Fine anno (11/11/2026, lotto B delle correzioni della contabilità generale).
 *
 * IRES e IRAP di competenza le scrive chi tiene la contabilità (le calcola lo studio); il programma
 * mostra gli acconti versati con gli F24 dell'anno e registra al 31/12: imposte a costo, acconti
 * chiusi, il resto fra i debiti per imposte (contabilita_imposte). Se cambiano, si storna e si rifà.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leggiImportoItaliano } from "@/lib/orders/salCertificato";
import { ContiPerRuolo, type RuoloConto } from "./ContiPerRuolo";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const euro = (n: number) => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(n);

export const RUOLI_IMPOSTE: readonly RuoloConto[] = [
  { ruolo: "50.01", etichetta: "Imposte sul reddito dell'esercizio (conto economico, 20)", natura: "costo" },
  { ruolo: "13.13", etichetta: "Debiti per imposte (stato patrimoniale, D.12)", natura: "passivo" },
  { ruolo: "05.12", etichetta: "Crediti d'imposta e acconti versati (stato patrimoniale, C.II.5-bis)", natura: "attivo" },
];

export interface EsitoImposte {
  ires: number | null; irap: number | null; acconti: number; acconti_usati: number; da_versare: number; a_credito: number;
  registrata: boolean; da_aggiornare: boolean; conti_mancanti: string[];
}
export function leggiEsitoImposte(j: Json): EsitoImposte {
  const o = (j ?? {}) as Record<string, unknown>;
  const n = (x: unknown) => Number(x) || 0;
  return {
    ires: o.ires == null ? null : n(o.ires), irap: o.irap == null ? null : n(o.irap), acconti: n(o.acconti), acconti_usati: n(o.acconti_usati),
    da_versare: n(o.da_versare), a_credito: n(o.a_credito), registrata: o.registrata === true, da_aggiornare: o.da_aggiornare === true,
    conti_mancanti: Array.isArray(o.conti_mancanti) ? o.conti_mancanti.map(String) : [],
  };
}

export function ImposteFineAnno({ companyId, anno, chiuso }: { companyId: string; anno: number; chiuso: boolean }) {
  const tr = useT();
  const qc = useQueryClient();
  const [ires, setIres] = useState<string | null>(null);
  const [irap, setIrap] = useState<string | null>(null);
  const esito = useQuery({
    queryKey: ["contabilita-generale", companyId, "imposte", anno],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_imposte", { p_company: companyId, p_anno: anno, p_anteprima: true });
      if (error) throw error;
      return leggiEsitoImposte(data);
    },
  });
  const e = esito.data;
  const testo = (t: string | null, v: number | null | undefined) => t ?? (v != null ? String(v) : "");
  const numIres = leggiImportoItaliano(testo(ires, e?.ires) || "0");
  const numIrap = leggiImportoItaliano(testo(irap, e?.irap) || "0");
  const validi = Number.isFinite(numIres) && numIres >= 0 && Number.isFinite(numIrap) && numIrap >= 0
    && (testo(ires, e?.ires) !== "" || testo(irap, e?.irap) !== "");
  const registra = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_imposte", { p_company: companyId, p_anno: anno, p_anteprima: false, p_ires: numIres, p_irap: numIrap });
      if (error) throw error;
      return leggiEsitoImposte(data);
    },
    onSuccess: (r) => {
      toast.success(r.registrata ? tr("Imposte registrate al 31/12/{anno}", { anno: String(anno ?? "") }) : tr("Nessuna imposta da registrare"));
      setIres(null); setIrap(null);
      void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] });
    },
    onError: (err) => toast.error(tr("Imposte non registrate"), { description: err instanceof Error ? err.message : String(err) }),
  });

  if (esito.isLoading) return <p role="status" className="text-sm text-muted-foreground">{tr("Carico le imposte…")}</p>;
  if (esito.isError || !e) return <p role="alert" className="text-sm text-destructive">{tr("Imposte non disponibili.")} <Button variant="link" className="h-auto p-0" onClick={() => void esito.refetch()}>{tr("Riprova")}</Button></p>;
  const mancanti = RUOLI_IMPOSTE.filter((r) => e.conti_mancanti.includes(r.ruolo));
  const totale = numIres + numIrap;

  return (
    <div className="space-y-3">
      <ContiPerRuolo companyId={companyId} ruoli={mancanti} chiuso={chiuso} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="imp-ires" className="text-xs">{tr("IRES di competenza")}</Label>
          <Input id="imp-ires" inputMode="decimal" placeholder={tr("Dallo studio")} className="h-8 text-right tabular-nums" disabled={chiuso}
            value={testo(ires, e.ires)} onChange={(ev) => setIres(ev.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="imp-irap" className="text-xs">{tr("IRAP di competenza")}</Label>
          <Input id="imp-irap" inputMode="decimal" placeholder={tr("Dallo studio")} className="h-8 text-right tabular-nums" disabled={chiuso}
            value={testo(irap, e.irap)} onChange={(ev) => setIrap(ev.target.value)} />
        </div>
        <div className="space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">{tr("Acconti versati nel {anno} (F24 2001, 2002, 3812, 3813)", { anno: String(anno ?? "") })}</p>
          <p className="tabular-nums">{euro(e.acconti)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {e.da_aggiornare ? <strong className="text-amber-700">{tr("Da aggiornare: gli importi o gli acconti sono cambiati dopo la registrazione.")} </strong>
            : e.registrata ? `${tr("Registrate.")} ` : `${tr("Non ancora registrate.")} `}
          {totale > 0 ? (totale >= e.acconti
            ? tr("Saldo da versare: {valore}.", { valore: euro(totale - e.acconti) })
            : tr("Acconti oltre l'imposta: {valore} restano a credito.", { valore: euro(e.acconti - totale) })) : ""}
        </p>
        <Button size="sm" variant="outline" disabled={chiuso || !validi || mancanti.length > 0 || registra.isPending} onClick={() => registra.mutate()}>
          {registra.isPending ? tr("Registrazione…") : tr("Registra le imposte")}
        </Button>
      </div>
    </div>
  );
}

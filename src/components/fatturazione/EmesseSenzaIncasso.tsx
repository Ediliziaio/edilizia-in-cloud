/**
 * Le fatture emesse importate da XML che risultano incassate senza alcun incasso registrato (fase 5,
 * 14/11/2026). Il 14/11 erano 344 in due aziende: segnate pagate dopo l'import, su indicazione del
 * titolare o da uno script, con la data di pagamento uguale alla scadenza. Niente le distingueva da
 * quelle incassate davvero. Qui si vedono come tali e si riportano da incassare, una o tutte.
 * Quali sono lo dice il database (fatture_importate_senza_incasso): nessun incasso in invoice_payments,
 * nessuna scadenza incassata dallo scadenzario, nessun bonifico abbinato.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { eseguiInBlocco } from "@/lib/fatturazione/azioniInBlocco";
import { queryKeys } from "@/lib/queryKeys";
import { invalidaFattureImportate } from "./GestionaleEsterno";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

export interface SenzaIncasso { invoice_id: string; pagato: number; data_pagamento: string | null; storico: boolean }

export function useEmesseSenzaIncasso(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["fatture-emesse-importate", companyId, "senza-incasso"],
    enabled: !!companyId,
    queryFn: async (): Promise<Map<string, SenzaIncasso>> => {
      const { data, error } = await supabase.rpc("fatture_importate_senza_incasso" as never, { p_company_id: companyId } as never);
      if (error) throw error;
      return new Map(((data ?? []) as SenzaIncasso[]).map((r) => [r.invoice_id, r]));
    },
  });
}

const fatture = (n: number, t: (testo: string, valori?: Record<string, string | number>) => string) => t(n === 1 ? "{n} fattura" : "{n} fatture", { n });

/** La riga sopra l'elenco: quante sono, il filtro, e «riportale tutte da incassare». */
export function BannerSenzaIncasso({ companyId, senzaIncasso, soloQueste, onSoloQueste }: {
  companyId: string;
  senzaIncasso: Map<string, SenzaIncasso>;
  soloQueste: boolean;
  onSoloQueste: (v: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [chiedi, setChiedi] = useState(false);
  const [fatte, setFatte] = useState(0);
  const tutte = [...senzaIncasso.values()];
  const storiche = tutte.filter((r) => r.storico).length;
  const riporta = useMutation({
    mutationFn: async () => {
      setFatte(0);
      return eseguiInBlocco(tutte, async (r) => {
        const { error } = await supabase.rpc("fattura_importata_torna_da_incassare" as never, { p_invoice_id: r.invoice_id } as never);
        if (error) throw error;
      }, setFatte);
    },
    onSuccess: (esito) => {
      invalidaFattureImportate(queryClient, companyId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      if (esito.riuscite.length) toast.success(t("{fatture} di nuovo da incassare", { fatture: fatture(esito.riuscite.length, t) }));
      if (esito.fallite.length) toast.error(t("{fatture} non riportate", { fatture: fatture(esito.fallite.length, t) }), { description: esito.fallite[0].motivo });
      setChiedi(false);
      onSoloQueste(false);
    },
    onError: (e) => toast.error(t("Non riuscito"), { description: messaggioErrore(e) }),
  });
  if (!tutte.length) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{t(tutte.length === 1 ? "{fatture} risulta incassata senza un incasso registrato" : "{fatture} risultano incassate senza un incasso registrato", { fatture: fatture(tutte.length, t) })}</span>
        <span className="text-muted-foreground">{storiche ? ` (${t("{storiche} dello storico già chiuso", { storiche })})` : ""}: {t("nessun incasso, nessuna scadenza incassata, nessun bonifico abbinato.")}</span>
      </p>
      <Button size="sm" variant={soloQueste ? "default" : "outline"} onClick={() => onSoloQueste(!soloQueste)}>{soloQueste ? t("Mostra tutte") : t("Mostra solo queste")}</Button>
      <Button size="sm" variant="outline" onClick={() => setChiedi(true)}>{t("Riportale da incassare")}</Button>
      <AlertDialog open={chiedi} onOpenChange={(v) => { if (!riporta.isPending) setChiedi(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Riportare da incassare {fatture}?", { fatture: fatture(tutte.length, t) })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Tornano aperte, con le loro scadenze, nell'incassato da ricevere. Nessun movimento bancario viene creato o tolto.")}
              {storiche ? ` ${t("{storiche} sono dello storico già registrato nel gestionale di prima: riaprile solo se non erano davvero incassate.", { storiche })}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {riporta.isPending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("{fatte} di {n}…", { fatte, n: tutte.length })}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={riporta.isPending}>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction disabled={riporta.isPending} onClick={(e) => { e.preventDefault(); riporta.mutate(); }}>{t("Riporta da incassare")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

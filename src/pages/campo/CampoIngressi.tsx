/**
 * Controllo ingressi in cantiere (26/11/2026, piano campo completo, punto 2.4).
 *
 * Il capo inquadra il QR del tesserino: verde se in regola e assegnato a questo cantiere, giallo se manca
 * qualcosa o non è assegnato qui, rosso se il tesserino non è valido. Ogni controllo resta nel registro
 * ingressi del giorno (campo_ingresso_verifica).
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, ScanLine, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import { codiceTesserinoValido, NOME_CONTROLLO, SPIEGAZIONE_ESITO, testoControllo, TITOLO_ESITO, type VerificaTesserino } from "@/lib/campo/tesserino";
import { PILLOLA, RIQUADRO } from "@/lib/campo/stileCampo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Esito = VerificaTesserino & { trovato: boolean; assegnato: boolean; altra_azienda: boolean };
const db = () => supabase as unknown as {
  rpc: (n: "campo_ingresso_verifica", a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (t: "campo_ingressi") => any;
};

/** Il codice del tesserino dal testo del QR: «…/tesserino#<codice>» oppure il solo codice. */
export function codiceDaQr(testo: string): string | null {
  const dopo = testo.includes("#") ? testo.split("#").pop()!.trim() : testo.trim();
  return codiceTesserinoValido(dopo) ? dopo : null;
}

export default function CampoIngressi() {
  const t = useT();
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scanner, setScanner] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const oggi = format(new Date(), "yyyy-MM-dd");
  const registro = useQuery({
    queryKey: ["campo-ingressi", orderId, oggi],
    enabled: !!orderId,
    queryFn: async (): Promise<Array<{ id: string; nome: string; esito: string; assegnato: boolean; registrato_il: string }>> => {
      const { data, error } = await db().from("campo_ingressi").select("id, nome, esito, assegnato, registrato_il")
        .eq("order_id", orderId).eq("giorno", oggi).eq("registrato_da", user?.id).order("registrato_il", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const verifica = useMutation({
    mutationFn: async (testo: string): Promise<Esito> => {
      const codice = codiceDaQr(testo);
      if (!codice) throw new Error(t("Questo QR non è un tesserino di cantiere."));
      const { data, error } = await db().rpc("campo_ingresso_verifica", { p_token: codice, p_order_id: orderId });
      if (error) throw new Error(error.message);
      const r = data as Esito;
      if (!r?.trovato) throw new Error(t("Tesserino non trovato: non farlo entrare e avvisa l'ufficio."));
      return r;
    },
    onSuccess: r => { setEsito(r); void qc.invalidateQueries({ queryKey: ["campo-ingressi", orderId] }); },
    onError: (e: unknown) => { setEsito(null); setErrore(e instanceof Error && e.message ? e.message : t("Non riesco a verificarlo. Riprova.")); },
  });
  const colore = !esito ? "" : esito.esito === "non_valido" ? "border-red-300 bg-red-50" : esito.esito === "valido" && esito.assegnato ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50";

  return (
    <div className="mx-auto max-w-lg space-y-3 pb-24">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-primary" aria-hidden="true" />{t("Controllo ingressi")}</h1>
      <button type="button" onClick={() => { setErrore(null); setScanner(true); }} disabled={verifica.isPending} className={cn(PILLOLA, "min-h-12 w-full text-base")}>
        {verifica.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ScanLine className="size-5" aria-hidden="true" />}
        {t("Inquadra il QR del tesserino")}
      </button>
      {errore && <p role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">{errore}</p>}
      {esito && (
        <section role="status" className={cn("space-y-2 rounded-2xl border p-4", colore)}>
          <p className="text-lg font-bold">{[esito.nome, esito.cognome].filter(Boolean).join(" ")}</p>
          <p className="text-sm">{esito.azienda}{esito.mansione ? ` · ${esito.mansione}` : ""}</p>
          <p className="text-base font-semibold">{t(TITOLO_ESITO[esito.esito])}</p>
          <p className="text-sm">{t(SPIEGAZIONE_ESITO[esito.esito])}</p>
          {!esito.assegnato && esito.esito !== "non_valido" && (
            <p className="text-sm font-semibold text-amber-900">{esito.altra_azienda ? t("È di un'altra impresa: controlla che la ditta sia autorizzata su questo cantiere.") : t("Non è assegnato a questo cantiere: chiedi all'ufficio.")}</p>
          )}
          <ul className="space-y-0.5 text-sm">
            {esito.controlli.map(c => <li key={c.voce}>{t(NOME_CONTROLLO[c.voce])}: <span className="font-medium">{t(testoControllo(c))}</span></li>)}
          </ul>
        </section>
      )}
      <section className={RIQUADRO}>
        <p className="mb-1 text-sm font-semibold">{t("Ingressi di oggi")}</p>
        {(registro.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("Ancora nessuno.")}</p> : (
          <ul className="divide-y text-sm">
            {(registro.data ?? []).map(r => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">{r.nome}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(r.registrato_il), "HH:mm")} · {t(TITOLO_ESITO[r.esito as VerificaTesserino["esito"]] ?? r.esito)}{r.assegnato ? "" : ` · ${t("non assegnato")}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BarcodeScanner open={scanner} onOpenChange={setScanner} onScan={(testo: string): void => { setScanner(false); verifica.mutate(testo); }} />
    </div>
  );
}

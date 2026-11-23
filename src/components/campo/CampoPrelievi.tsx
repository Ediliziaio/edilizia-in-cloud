import { useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useMieiPrelievi, useRichiediDdt } from "@/hooks/campo/useCampoPrelievo";
import { useCodaCampo } from "@/hooks/campo/useCodaCampo";
import { formatoQuantitaMagazzino, nomeCantierePrelievo, quantitaPrelievo } from "@/lib/campo/magazzino";
import { syncQueue } from "@/lib/campo/sync-queue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const dataPrelievo = new Intl.DateTimeFormat("it-IT", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});
const stati = {
  consegnato: { label: "Consegnato", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  rifiutato: { label: "Rifiutato", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  richiesto: { label: "In attesa", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
} as const;

export function PrelieviInCoda({ companyId, userId }: { companyId: string; userId: string | undefined }) {
  const t = useT();
  const coda = useCodaCampo(companyId, userId, "prelievo");
  const online = useOnlineStatus();
  if (!coda.length) return null;

  return (
    <ul aria-label={t("Prelievi in coda")} className="mb-2 divide-y rounded-xl border bg-card text-sm">
      {coda.map(voce => {
        const { bozza } = voce.payload.locale;
        return <li key={voce.id} className="space-y-1 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words font-semibold">{bozza.nomeCantiere || t("Cantiere assegnato")}</span>
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-xs font-semibold leading-5 text-amber-900">
              {voce.status === "failed" ? t("Da verificare") : voce.status === "syncing" ? t("Invio…") : t("In coda")}
            </span>
          </div>
          <ul className="space-y-1">
            {bozza.righe.map(({ articolo, quantita }) => <li key={articolo.id} className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words">{articolo.name}</span>
              <span className="shrink-0 font-medium">{formatoQuantitaMagazzino.format(quantitaPrelievo(quantita))} {articolo.unita_misura}</span>
            </li>)}
          </ul>
          {voce.status === "failed" && <>
            <p className="break-words text-xs text-destructive">{voce.lastError}</p>
            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={!online}
              onClick={() => void syncQueue.retryFailed(i => i.id === voce.id)
                .then(syncQueue.processQueue).catch(() => toast.error(t("Non riesco a riprovare l’invio.")))}>{t("Riprova prelievo")}</Button>
          </>}
        </li>;
      })}
    </ul>
  );
}

export function CampoPrelievi({ companyId, puoPrelevare }: { companyId: string; puoPrelevare: boolean }) {
  const t = useT();
  const cronologia = useMieiPrelievi(companyId);
  const richiedi = useRichiediDdt(companyId);
  const [filtroCantiere, setFiltroCantiere] = useState("");

  if (cronologia.isLoading) return (
    <div role="status" className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin" /><span className="sr-only">{t("Carico i prelievi")}</span></div>
  );
  if (cronologia.isError) return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-sm">
      <p>{t("Impossibile caricare i prelievi.")}</p>
      <Button variant="outline" size="sm" className="min-h-11" onClick={() => void cronologia.refetch()}>{t("Riprova")}</Button>
    </div>
  );
  if (!cronologia.data?.prelievi.length) return (
    <div className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{t("Nessun prelievo")}</p>
      <p className="mt-1 text-xs">{t("Quando prendi materiale dall’Inventario, la richiesta compare qui con la risposta del magazzino.")}</p>
    </div>
  );

  const cantieri = new Map(cronologia.data.cantieri.map((cantiere) => [cantiere.id, cantiere]));
  const filtro = cantieri.size > 1 && cantieri.has(filtroCantiere) ? filtroCantiere : "";
  const prelievi = cronologia.data.prelievi.filter((prelievo) => !filtro || prelievo.order_id === filtro);
  return (
    <div className="space-y-2">
      {cantieri.size > 1 && (
        <UniformSelect aria-label={t("Filtra prelievi per cantiere")} value={filtro} onChange={(event) => setFiltroCantiere(event.target.value)}
          className="h-11 w-full rounded-lg text-sm sm:max-w-sm">
          <option value="">{t("Tutti i cantieri")}</option>
          {[...cantieri.values()].map((cantiere) => <option key={cantiere.id} value={cantiere.id}>{nomeCantierePrelievo(cantiere)}</option>)}
        </UniformSelect>
      )}
      <ul aria-label={t("I miei prelievi")} className="divide-y rounded-xl border bg-card">
        {prelievi.map((prelievo) => {
          const stato = stati[prelievo.stato] ?? stati.richiesto;
          const cantiere = cantieri.get(prelievo.order_id ?? "");
          const nomeCantiere = cantiere ? nomeCantierePrelievo(cantiere) : prelievo.order_id ? t("Cantiere assegnato") : t("Senza cantiere");
          const mostraDdt = prelievo.stato === "consegnato" && (prelievo.documento_numero || prelievo.ddt_richiesto || puoPrelevare);
          return (
            <li key={prelievo.id} className="px-2.5 pb-2.5">
              <div className="flex min-h-11 items-center justify-between gap-2 text-sm leading-tight">
                {cantiere ? (
                  <Link to={`/campo/lavoro/${encodeURIComponent(cantiere.id)}?vista=materiali`}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-md py-1 font-semibold text-primary hover:underline"
                    aria-label={t("Apri i materiali del cantiere {nome}", { nome: nomeCantiere })}>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{nomeCantiere}</span>
                    <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                ) : (
                  <p className="min-w-0 font-semibold">{nomeCantiere}</p>
                )}
                <time dateTime={prelievo.data} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {dataPrelievo.format(new Date(prelievo.data))}
                </time>
              </div>
              <div className="flex items-start gap-2">
                <ul className="min-w-0 flex-1 space-y-1 text-sm leading-5">
                  {prelievo.righe.map((riga, indice) => (
                    <li key={`${riga.stock_item_id}-${indice}`} className="flex items-start justify-between gap-1.5">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{riga.name}</span>
                      <span className="max-w-[50%] shrink-0 text-right font-semibold tabular-nums [overflow-wrap:anywhere]">
                        {formatoQuantitaMagazzino.format(riga.quantita)} {riga.unita}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex w-[4.75rem] shrink-0 justify-end">
                  <span className={`rounded-full px-1.5 text-xs font-semibold leading-5 ${stato.className}`}>
                    {t(stato.label)}{stato === stati.richiesto && <span className="sr-only"> {t("di conferma")}</span>}
                  </span>
                </div>
              </div>
              {prelievo.motivo_rifiuto && <p className="mt-1 break-words text-xs text-red-800 dark:text-red-300">{prelievo.motivo_rifiuto}</p>}
              {(prelievo.note || mostraDdt) && (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                  {prelievo.note && <p className="min-w-0 flex-1 text-muted-foreground [overflow-wrap:anywhere]">{prelievo.note}</p>}
                  {mostraDdt && (prelievo.documento_numero ? (
                    <p className="ml-auto flex min-w-0 items-center gap-1 font-medium">
                      <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span className="[overflow-wrap:anywhere]">{t("DDT {numero}", { numero: prelievo.documento_numero })}<span className="sr-only"> {t("pronto")}</span></span>
                    </p>
                  ) : prelievo.ddt_richiesto ? (
                    <p className="ml-auto text-muted-foreground">{t("DDT richiesto")}</p>
                  ) : (
                    <Button variant="outline" size="sm" className="ml-auto min-h-11 px-2.5 text-xs" disabled={richiedi.isPending}
                      onClick={() => richiedi.mutate(prelievo.id, {
                        onSuccess: () => toast.success(t("DDT richiesto all’ufficio")),
                        onError: (error) => toast.error(error.message),
                    })}>
                    {t("Richiedi DDT")}
                  </Button>
                ))}
              </div>
            )}
          </li>
        );
        })}
      </ul>
    </div>
  );
}

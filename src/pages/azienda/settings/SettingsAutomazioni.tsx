/**
 * Impostazioni → Automazioni (15/11/2026): tutti gli automatismi dell'azienda in un posto solo.
 * Una riga per automatismo: cosa fa, acceso o spento, ultimo controllo o esito.
 * L'elenco sta in components/settings/automazioni/registroAutomatismi.ts.
 * Gli interruttori li cambia l'amministratore dell'azienda; gli altri li vedono.
 */
import { Workflow } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import { AUTOMATISMI, type Automatismo } from "@/components/settings/automazioni/registroAutomatismi";
import { MisuraAutomazioni } from "@/components/settings/automazioni/MisuraAutomazioni";
import { DaFareAcquisti } from "@/components/settings/automazioni/DaFareAcquisti";
import { SoglieCollegamentiCard } from "@/components/settings/automazioni/SoglieCollegamenti";
import { EccezioniOperative } from "@/components/operazioni/EccezioniOperative";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

const TONO: Record<string, string> = {
  neutro: "text-muted-foreground",
  ok: "text-emerald-700 dark:text-emerald-400",
  attenzione: "text-amber-700 dark:text-amber-400",
  errore: "text-destructive",
};

function nessunEsito(): undefined {
  return undefined;
}

function RigaAutomatismo({ a, companyId, puoModificare, puoConfermare }: { a: Automatismo; companyId: string; puoModificare: boolean; puoConfermare: boolean }) {
  const t = useT();
  const stato = a.useStato(companyId);
  const esito = (a.useUltimoEsito ?? nessunEsito)(companyId);
  return (
    <li id={a.id} className="grid gap-3 border-b px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_11rem_14rem] md:items-start">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t(a.area)}</p>
        <p className="font-medium">{t(a.titolo)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t(a.cosaFa)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t(a.daSpento)}</p>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={stato.acceso}
          disabled={!puoModificare || stato.caricamento || stato.salvataggio}
          onCheckedChange={stato.cambia}
          aria-label={t(a.titolo)}
        />
        <span className={`text-sm font-medium ${stato.acceso ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {stato.caricamento ? "…" : stato.acceso ? t("Acceso") : t("Spento")}
        </span>
      </div>
      <div className="text-sm">
        <p className="text-xs text-muted-foreground md:hidden">{t("Ultimo esito")}</p>
        {esito ? (
          <>
            <p className={TONO[esito.tono]}>{esito.testo}</p>
            {esito.quando && (
              <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(esito.quando), { addSuffix: true, locale: dateFnsCampo() })}</p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">{t("Nessun esito registrato")}</p>
        )}
        {a.Azione && (
          <div className="mt-1">
            <a.Azione companyId={companyId} puoModificare={puoConfermare} />
          </div>
        )}
      </div>
    </li>
  );
}

export default function SettingsAutomazioni() {
  const t = useT();
  const { effectiveCompany, role } = useAuth();
  const permessi = usePermissions();
  const companyId = effectiveCompany?.id;
  if (!companyId) return null;
  // La scrittura degli interruttori è riservata all'amministratore dalle regole del database.
  const puoModificare = role === "company_admin" || role === "super_admin";
  // Confermare o annullare un collegamento: chi vede i costi o gestisce gli acquisti (regola del database).
  const puoConfermare = puoModificare || !!permessi.canViewCosts || !!permessi.canManagePurchasing;
  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Workflow className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{t("Automazioni")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Cosa fa il gestionale da solo, acceso o spento, e l'ultima volta che ha lavorato. Ogni cosa fatta da sola resta nello storico con il perché e si può annullare.")}
          </p>
        </div>
      </div>
      <div className="rounded-lg border">
        <div className="hidden border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_11rem_14rem]">
          <span>{t("Cosa fa")}</span>
          <span>{t("Stato")}</span>
          <span>{t("Ultimo esito")}</span>
        </div>
        <ul>
          {AUTOMATISMI.map((a) => (
            <RigaAutomatismo key={a.id} a={a} companyId={companyId} puoModificare={puoModificare} puoConfermare={puoConfermare} />
          ))}
        </ul>
      </div>
      {!puoModificare && <p className="text-xs text-muted-foreground">{t("Gli interruttori li cambia l'amministratore dell'azienda.")}</p>}
      <SoglieCollegamentiCard companyId={companyId} puoModificare={puoModificare} />
      {puoConfermare && <EccezioniOperative key={companyId} companyId={companyId} />}
      {puoConfermare && <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("Altri controlli acquisti")}</summary>
        <div className="pt-3"><DaFareAcquisti companyId={companyId} /></div>
      </details>}
      <MisuraAutomazioni companyId={companyId} />
    </div>
  );
}

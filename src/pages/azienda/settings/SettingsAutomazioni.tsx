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
import { it } from "date-fns/locale";
import { AUTOMATISMI, type Automatismo } from "@/components/settings/automazioni/registroAutomatismi";
import { MisuraAutomazioni } from "@/components/settings/automazioni/MisuraAutomazioni";
import { DaFareAcquisti } from "@/components/settings/automazioni/DaFareAcquisti";
import { SoglieCollegamentiCard } from "@/components/settings/automazioni/SoglieCollegamenti";

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
  const stato = a.useStato(companyId);
  const esito = (a.useUltimoEsito ?? nessunEsito)(companyId);
  return (
    <li id={a.id} className="grid gap-3 border-b px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_11rem_14rem] md:items-start">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{a.area}</p>
        <p className="font-medium">{a.titolo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{a.cosaFa}</p>
        <p className="mt-1 text-xs text-muted-foreground">{a.daSpento}</p>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={stato.acceso}
          disabled={!puoModificare || stato.caricamento || stato.salvataggio}
          onCheckedChange={stato.cambia}
          aria-label={a.titolo}
        />
        <span className={`text-sm font-medium ${stato.acceso ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {stato.caricamento ? "…" : stato.acceso ? "Acceso" : "Spento"}
        </span>
      </div>
      <div className="text-sm">
        <p className="text-xs text-muted-foreground md:hidden">Ultimo esito</p>
        {esito ? (
          <>
            <p className={TONO[esito.tono]}>{esito.testo}</p>
            {esito.quando && (
              <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(esito.quando), { addSuffix: true, locale: it })}</p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">Nessun esito registrato</p>
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
          <h2 className="text-lg font-semibold leading-tight">Automazioni</h2>
          <p className="text-sm text-muted-foreground">
            Cosa fa il gestionale da solo, acceso o spento, e l&apos;ultima volta che ha lavorato. Ogni cosa fatta da sola
            resta nello storico con il perché e si può annullare.
          </p>
        </div>
      </div>
      <div className="rounded-lg border">
        <div className="hidden border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_11rem_14rem]">
          <span>Cosa fa</span>
          <span>Stato</span>
          <span>Ultimo esito</span>
        </div>
        <ul>
          {AUTOMATISMI.map((a) => (
            <RigaAutomatismo key={a.id} a={a} companyId={companyId} puoModificare={puoModificare} puoConfermare={puoConfermare} />
          ))}
        </ul>
      </div>
      {!puoModificare && <p className="text-xs text-muted-foreground">Gli interruttori li cambia l&apos;amministratore dell&apos;azienda.</p>}
      <SoglieCollegamentiCard companyId={companyId} puoModificare={puoModificare} />
      {puoConfermare && <DaFareAcquisti companyId={companyId} />}
      <MisuraAutomazioni companyId={companyId} />
    </div>
  );
}

import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { AIUsageMonitor } from "@/components/admin/settings/AIUsageMonitor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

/**
 * Monitor Utilizzo AI — pagina dedicata nella sidebar principale (Revenue).
 *
 * NB: il tracking attuale legge dalla tabella `ai_usage_log` (singular).
 * Render AI (generate-bathroom-render, generate-facade-render, ecc.) NON
 * loggano ancora su questa tabella — vedere banner informativo sotto.
 */
export default function AdminSettingsAIUsage() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.can_view_platform_stats) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monitor Utilizzo AI</h1>
        <p className="text-muted-foreground">
          Costi e richieste AI per azienda. Monitora e previeni abusi.
        </p>
      </div>

      {/* Banner: cosa è tracciato (vista unificata). */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm font-semibold">Vista unificata costi AI</AlertTitle>
        <AlertDescription className="text-sm space-y-2 mt-1">
          <p>
            Aggrega i costi reali di tutte le funzioni AI della piattaforma:
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            <li>
              <strong>Chat AI · Voice ElevenLabs · Document Analysis · Automazioni</strong>
              {" "}— da <code className="bg-muted px-1 py-0.5 rounded">ai_usage_log</code>
            </li>
            <li>
              <strong>Render AI</strong> (bagni, facciate, tetti, persiane, piscine, pergole, infissi, stanze)
              {" "}— da <code className="bg-muted px-1 py-0.5 rounded">render_sessions.cost_real_api</code> con
              {" "}<code className="bg-muted px-1 py-0.5 rounded">provider_key</code> ({" "}
              openai · replicate · stability) e modello effettivo (gpt-image-1, dall-e-2, ecc.)
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Filtro <em>Provider</em> applica anche al merge render. Periodo aggregato come selezionato.
          </p>
        </AlertDescription>
      </Alert>

      <AIUsageMonitor />
    </div>
  );
}

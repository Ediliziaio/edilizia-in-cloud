import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { AIUsageMonitor } from "@/components/admin/settings/AIUsageMonitor";

/**
 * Monitor Utilizzo AI — pagina dedicata nella sidebar principale (Revenue).
 *
 * Vista unificata che aggrega TUTTI i sistemi AI della piattaforma:
 *   • Render AI       → tabella `render_sessions` (provider_key + model)
 *   • Chat / Voice / Doc Analysis / Automazioni → tabella `ai_usage_log`
 *
 * Il banner informativo dettagliato sui sistemi AI tracciati è dentro al
 * componente AIUsageMonitor (diagnostic banner visibile solo quando rileva
 * problemi). Qui manteniamo solo header + componente per ridurre il rumore.
 */
export default function AdminSettingsAIUsage() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.can_view_platform_stats) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monitor Utilizzo AI</h1>
        <p className="text-muted-foreground">
          Costi, ricavi e margini AI per azienda — render, chat, voice, vision e automazioni in un'unica vista.
        </p>
      </div>

      <AIUsageMonitor />
    </div>
  );
}

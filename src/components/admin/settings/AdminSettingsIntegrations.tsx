/**
 * Integrazioni del superadmin (rifatta il 25/11/2026).
 *
 * Qui solo ciò che si COLLEGA da qui:
 * - gli assistenti AI (Claude, ChatGPT) con i poteri dell'area superadmin;
 * - Facebook e Instagram dei brand, i cui lead arrivano nel CRM della piattaforma.
 *
 * Fuori, perché non sono collegamenti: le chiavi dei servizi (Stripe, Meta App,
 * Google, Maps, WhatsApp) si installano nel database (Vault) e non si scrivono
 * da una pagina; le regole di Google Calendar stanno in Calendari marketing;
 * Email, Banche e Webhook hanno le loro voci nel menu.
 */
import type { ReactNode } from "react";
import AdminAssistentiAi from "./AdminAssistentiAi";
import AdminMetaLeadsCard from "./AdminMetaLeadsCard";

export default function AdminSettingsIntegrations() {
  return (
    <div className="space-y-6">
      <Sezione
        titolo="Assistenti AI"
        descrizione="Claude e ChatGPT nell'area superadmin: statistiche, aziende, piani, CRM, email e gestionale delle aziende."
      >
        <AdminAssistentiAi />
      </Sezione>

      <Sezione
        titolo="Facebook e Instagram dei brand"
        descrizione="I lead delle sponsorizzate dei brand della piattaforma arrivano nel CRM del superadmin."
      >
        <AdminMetaLeadsCard />
      </Sezione>
    </div>
  );
}

function Sezione({ titolo, descrizione, children }: { titolo: string; descrizione: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={titolo}>
      <div>
        <h2 className="text-base font-semibold">{titolo}</h2>
        <p className="text-xs text-muted-foreground">{descrizione}</p>
      </div>
      {children}
    </section>
  );
}

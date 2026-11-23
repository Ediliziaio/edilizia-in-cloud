/**
 * Lingua nell'app dell'ufficio (/azienda), tradotta a blocchi (23/11/2026): prima rumeno e albanese, poi le altre.
 * Ogni file elencato in BLOCCHI_UFFICIO deve avere tutte le sue frasi t("…") nelle lingue già fatte per l'ufficio.
 * Quando un blocco arriva anche nelle altre lingue, si aggiunge la lingua a LINGUE_UFFICIO.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ro from "@/lib/campo/lingua/dizionari/ro";
import sq from "@/lib/campo/lingua/dizionari/sq";

const LINGUE_UFFICIO = { ro, sq };

/** I file dell'ufficio già tradotti, blocco per blocco. */
export const BLOCCHI_UFFICIO: Record<string, string[]> = {
  "Cornice (menu, intestazione, barra in basso)": [
    "src/components/layouts/CompanyLayout.tsx",
    "src/components/layouts/MobileBottomNav.tsx",
    "src/components/layouts/MobileAppGrid.tsx",
    "src/components/layouts/AreaSwitcher.tsx",
    "src/components/layouts/SidebarSubcategory.tsx",
    "src/components/layouts/CompanyContextSwitcher.tsx",
    "src/components/layouts/MobileBrandSwitcher.tsx",
    "src/components/layouts/MobileChatTeamButton.tsx",
    "src/components/layouts/SubscriptionBanner.tsx",
    "src/components/layouts/AvvisoAziendaServer.tsx",
    "src/components/layouts/SoloTabletDesktop.tsx",
    "src/components/layouts/SupportChannelDialog.tsx",
    "src/components/layouts/SettingsLayout.tsx",
    "src/components/layouts/SettingsSearch.tsx",
  ],
  "Attività (pagina di partenza)": [
    "src/pages/azienda/AttivitaStaff.tsx",
    "src/components/attivita/DashboardAgenda.tsx",
    "src/components/tasks/CollegaAttivitaPicker.tsx",
    "src/components/tasks/TaskAssignmentFields.tsx",
    "src/components/tasks/TaskOrderLink.tsx",
    "src/components/documentiAzienda/ScadenzeDittaBox.tsx",
    "src/components/email-ai/DocumentiDaConfermareBox.tsx",
    "src/components/operazioni/EccezioniOperative.tsx",
    "src/components/orders/OfficeSelect.tsx",
    "src/components/shared/ConfermaQuantita.tsx",
  ],
};

describe("Lingua nell'app dell'ufficio", () => {
  for (const [blocco, file] of Object.entries(BLOCCHI_UFFICIO)) {
    it(`${blocco}: ogni frase c'è in ${Object.keys(LINGUE_UFFICIO).join(" e ")}`, () => {
      const frasi = new Set<string>();
      for (const f of file) {
        for (const m of readFileSync(f, "utf8").matchAll(/\b(?:t|tr)\(\s*"((?:[^"\\]|\\.)*)"/g)) frasi.add(JSON.parse(`"${m[1]}"`));
      }
      expect(frasi.size, blocco).toBeGreaterThan(0);
      for (const [lingua, d] of Object.entries(LINGUE_UFFICIO)) {
        expect([...frasi].filter(k => !(k in d)), `${blocco} · ${lingua}`).toEqual([]);
      }
    });
  }
});

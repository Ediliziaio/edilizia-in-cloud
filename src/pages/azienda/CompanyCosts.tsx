// ============================================================================
// /azienda/costi — Costi aziendali in 4 viste
// ============================================================================
//   Panoramica       → dove vanno i soldi, mese per mese (ripartizione per voce)
//   Personale        → costo per dipendente: orario, ore, straordinari, commesse
//   Spese fisse      → la struttura: affitti, leasing, utenze, ricorrenti
//   Spese variabili  → i cantieri: materiali, subappalti, provvigioni
//   Pianificazione   → regia integrazioni, statistiche, budget
//   Utenze           → contatori luce/gas dalle bollette e dove va il loro costo (15/11/2026)
// La tab attiva è sincronizzata in URL (?tab=) per link condivisibili.
// ============================================================================

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { startOfMonth } from "date-fns";
import { HardHat, Landmark, PieChart, Plug, ReceiptText, Target, TrendingDown } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompanyCostsManager from "@/components/forecast/CompanyCostsManager";
import CostsOverviewTab from "@/components/costi/CostsOverviewTab";
import PersonnelCostsTab from "@/components/costi/PersonnelCostsTab";
import UtenzeTab from "@/components/costi/UtenzeTab";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const VALID_TABS = ["panoramica", "personale", "spese-fisse", "spese-variabili", "pianificazione", "utenze"] as const;
type CostsTab = (typeof VALID_TABS)[number];
// Mobile: tre schede su cinque (costo del personale e pianificazione restano
// al desktop: sono analisi da scrivania).
// 15/11/2026: le linguette nascoste sotto i 768 px (max-md), come useIsMobile: con max-sm
// tra 640 e 767 px si vedevano, ma un clic riportava alla panoramica.
const TABS_MOBILE: CostsTab[] = ["panoramica", "spese-fisse", "spese-variabili"];

export default function CompanyCosts() {
  const t = useT();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  // La vecchia tab unica "spese" ora e' divisa in due: i link storici
  // atterrano sulle variabili se portavano un preset operativo, sulle
  // fisse altrimenti.
  const legacySpese: CostsTab = searchParams.get("preset") ? "spese-variabili" : "spese-fisse";
  // Un link a un costo (?costo=<id>) apre la sua scheda dentro le spese.
  const schedaRichiesta: CostsTab = searchParams.get("costo") && rawTab !== "spese-fisse" && rawTab !== "spese-variabili"
    ? "spese-variabili"
    : rawTab === "spese"
    ? legacySpese
    : VALID_TABS.includes(rawTab as CostsTab)
      ? (rawTab as CostsTab)
      : "panoramica";
  // Mobile: un indirizzo verso una scheda che qui non c'è apre la panoramica.
  const activeTab: CostsTab = isMobile && !TABS_MOBILE.includes(schedaRichiesta) ? "panoramica" : schedaRichiesta;

  // Mese condiviso tra Panoramica e Personale: cambi mese in una tab e lo
  // ritrovi nell'altra.
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", value);
        next.delete("preset");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6 max-sm:space-y-3">
      <div className="testata-pagina rounded-2xl border border-border bg-gradient-to-br from-card via-card to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground">{t("Costi Aziendali")}</h1>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {/* Mobile: tre linguette affiancate da 32px, senza icone. */}
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/80 p-1 sm:w-auto max-sm:grid max-sm:grid-cols-3 max-sm:rounded-lg max-sm:[&_svg]:hidden">
          <TabsTrigger value="panoramica" className="tap-compact gap-1.5 rounded-lg max-sm:h-8 max-sm:rounded-md max-sm:text-xs">
            <PieChart className="h-4 w-4" /> {t("Panoramica")}
          </TabsTrigger>
          <TabsTrigger value="personale" className="gap-1.5 rounded-lg max-md:hidden">
            <HardHat className="h-4 w-4" /> {t("Personale")}
          </TabsTrigger>
          <TabsTrigger value="spese-fisse" className="tap-compact gap-1.5 rounded-lg max-sm:h-8 max-sm:rounded-md max-sm:text-xs">
            <Landmark className="h-4 w-4" /> <span className="max-sm:hidden">{t("Spese fisse")}</span><span className="sm:hidden">{t("Fisse")}</span>
          </TabsTrigger>
          <TabsTrigger value="spese-variabili" className="tap-compact gap-1.5 rounded-lg max-sm:h-8 max-sm:rounded-md max-sm:text-xs">
            <ReceiptText className="h-4 w-4" /> <span className="max-sm:hidden">{t("Spese variabili")}</span><span className="sm:hidden">{t("Variabili")}</span>
          </TabsTrigger>
          <TabsTrigger value="pianificazione" className="gap-1.5 rounded-lg max-md:hidden">
            <Target className="h-4 w-4" /> {t("Pianificazione")}
          </TabsTrigger>
          <TabsTrigger value="utenze" className="gap-1.5 rounded-lg max-md:hidden">
            <Plug className="h-4 w-4" /> {t("Utenze")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="panoramica" className="mt-4 max-sm:mt-3">
          <CostsOverviewTab month={month} onMonthChange={setMonth} />
        </TabsContent>
        <TabsContent value="personale" className="mt-4">
          <PersonnelCostsTab month={month} onMonthChange={setMonth} />
        </TabsContent>
        <TabsContent value="spese-fisse" className="mt-4 max-sm:mt-3">
          <CompanyCostsManager view="spese" typeLock="fixed" />
        </TabsContent>
        <TabsContent value="spese-variabili" className="mt-4 max-sm:mt-3">
          <CompanyCostsManager view="spese" typeLock="variable" />
        </TabsContent>
        <TabsContent value="pianificazione" className="mt-4">
          <CompanyCostsManager view="pianificazione" />
        </TabsContent>
        <TabsContent value="utenze" className="mt-4">
          <UtenzeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

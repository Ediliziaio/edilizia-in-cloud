// ============================================================================
// /azienda/costi — Costi aziendali in 4 viste
// ============================================================================
//   Panoramica     → dove vanno i soldi, mese per mese (ripartizione per voce)
//   Personale      → costo per dipendente: orario, ore, straordinari, commesse
//   Spese          → gestione operativa (tabella, filtri, pagamenti, import)
//   Pianificazione → regia integrazioni, statistiche, budget, semaforo cassa
// La tab attiva è sincronizzata in URL (?tab=) per link condivisibili.
// ============================================================================

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { startOfMonth } from "date-fns";
import { HardHat, PieChart, ReceiptText, Target, TrendingDown } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompanyCostsManager from "@/components/forecast/CompanyCostsManager";
import CostsOverviewTab from "@/components/costi/CostsOverviewTab";
import PersonnelCostsTab from "@/components/costi/PersonnelCostsTab";

const VALID_TABS = ["panoramica", "personale", "spese", "pianificazione"] as const;
type CostsTab = (typeof VALID_TABS)[number];

export default function CompanyCosts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: CostsTab = VALID_TABS.includes(rawTab as CostsTab)
    ? (rawTab as CostsTab)
    : "panoramica";

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
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Costi Aziendali</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Capisci dove vanno i soldi: personale, materiali e spese, mese per mese.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-slate-100/80 p-1 sm:w-auto">
          <TabsTrigger value="panoramica" className="gap-1.5 rounded-lg">
            <PieChart className="h-4 w-4" /> Panoramica
          </TabsTrigger>
          <TabsTrigger value="personale" className="gap-1.5 rounded-lg">
            <HardHat className="h-4 w-4" /> Personale
          </TabsTrigger>
          <TabsTrigger value="spese" className="gap-1.5 rounded-lg">
            <ReceiptText className="h-4 w-4" /> Spese
          </TabsTrigger>
          <TabsTrigger value="pianificazione" className="gap-1.5 rounded-lg">
            <Target className="h-4 w-4" /> Pianificazione
          </TabsTrigger>
        </TabsList>

        <TabsContent value="panoramica" className="mt-4">
          <CostsOverviewTab month={month} onMonthChange={setMonth} />
        </TabsContent>
        <TabsContent value="personale" className="mt-4">
          <PersonnelCostsTab month={month} onMonthChange={setMonth} />
        </TabsContent>
        <TabsContent value="spese" className="mt-4">
          <CompanyCostsManager view="spese" />
        </TabsContent>
        <TabsContent value="pianificazione" className="mt-4">
          <CompanyCostsManager view="pianificazione" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * HrRuoloObiettiviTab — contenitore del tab "Ruolo & Obiettivi" della scheda persona.
 * Impila mansionario (HrMansioneBlock), task (HrTaskBlock) e KPI (HrKpiBlock).
 */
import { Separator } from "@/components/ui/separator";
import { HrMansioneBlock } from "@/components/hr/HrMansioneBlock";
import { HrTaskBlock } from "@/components/hr/HrTaskBlock";
import { HrKpiBlock } from "@/components/hr/HrKpiBlock";
import type { HrProfilo } from "@/types/hr";

interface Props { profilo: HrProfilo; }

export function HrRuoloObiettiviTab({ profilo }: Props) {
  return (
    <div className="space-y-6">
      <HrMansioneBlock profilo={profilo} companyId={profilo.company_id} />
      <Separator />
      <HrTaskBlock profiloId={profilo.id} companyId={profilo.company_id} />
      <Separator />
      <HrKpiBlock profiloId={profilo.id} companyId={profilo.company_id} />
    </div>
  );
}

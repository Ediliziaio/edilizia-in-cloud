import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareModulePhotoRefresh } from "@/lib/moduli-vendita/modulePhotography";
import { useTemplateEditorModuleId } from "../TemplateEditorLayout";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ModulePhotoUpdateButton({ value, sector, onChange }: { value: unknown; sector: string; onChange: (value: Record<string, unknown>) => void }) {
  const t = useT();
  const moduleId = useTemplateEditorModuleId();
  const prepared = prepareModulePhotoRefresh(value, sector, moduleId);
  if (!prepared.added) return null;
  return <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
    <p className="text-xs text-sky-950">{t(prepared.added === 1 ? "Sono disponibili fotografie nuove o più pertinenti per {n} pagina. I tuoi testi, le foto personalizzate e le rimozioni restano invariati." : "Sono disponibili fotografie nuove o più pertinenti per {n} pagine. I tuoi testi, le foto personalizzate e le rimozioni restano invariati.", { n: prepared.added })}</p>
    <Button type="button" variant="outline" size="sm" className="h-auto whitespace-normal text-left" onClick={() => onChange(prepared.blocks)}><ImagePlus className="mr-2 h-4 w-4 shrink-0" />{t("Aggiorna le foto di serie del modulo")}</Button>
    <p className="text-[11px] text-sky-900">{t("Controlla l’anteprima e salva il modulo per conservare l’aggiornamento.")}</p>
  </div>;
}

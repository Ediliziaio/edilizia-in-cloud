/**
 * EditorDDTModelloCard — micro-badge che indica il template PDF in uso.
 * Era una card a tutta larghezza con un Select disabled (unica opzione,
 * inutile finché non avremo multi-template). Ora una riga sottile in cima
 * al layout DDT, non occupa più spazio.
 */
import { FileText } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function EditorDDTModelloCard() {
  const t = useT();
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
      <FileText className="h-3 w-3" />
      <span>{t("Modello PDF:")} <span className="font-medium text-foreground/80">{t("DDT senza prezzi — DPR 472/96")}</span></span>
    </div>
  );
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Pipeline {
  id: string;
  name: string;
}

export function PipelineSelector({ pipelines, value, onChange }: {
  pipelines: Pipeline[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const t = useT();
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger aria-label={t("Pipeline commerciale")} className="h-11 w-full min-w-0 text-base md:h-8 md:w-[220px] md:text-xs">
        <SelectValue placeholder={t("Seleziona pipeline")} />
      </SelectTrigger>
      <SelectContent>
        {pipelines.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

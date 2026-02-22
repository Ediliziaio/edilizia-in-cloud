import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Pipeline {
  id: string;
  name: string;
}

export function PipelineSelector({ pipelines, value, onChange }: {
  pipelines: Pipeline[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="w-[220px] h-9">
        <SelectValue placeholder="Seleziona sequenza" />
      </SelectTrigger>
      <SelectContent>
        {pipelines.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

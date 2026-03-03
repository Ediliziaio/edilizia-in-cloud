import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ReportLevel } from "@/hooks/useMetaAdsReport";

interface Props {
  level: ReportLevel;
  onChange: (level: ReportLevel) => void;
}

const LevelToggle = ({ level, onChange }: Props) => (
  <ToggleGroup type="single" value={level} onValueChange={(v) => v && onChange(v as ReportLevel)} size="sm">
    <ToggleGroupItem value="campaign" className="text-xs px-2.5">Campaign</ToggleGroupItem>
    <ToggleGroupItem value="adset" className="text-xs px-2.5">Ad Set</ToggleGroupItem>
    <ToggleGroupItem value="ad" className="text-xs px-2.5">Ad</ToggleGroupItem>
  </ToggleGroup>
);

export default LevelToggle;

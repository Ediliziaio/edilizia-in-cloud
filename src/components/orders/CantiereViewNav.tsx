import {
  CANTIERE_VIEWS,
  type CantiereView,
} from "@/lib/orders/detailNavigation";
import { OrderWorkspaceNav } from "./OrderWorkspaceNav";
import { useIsMobile } from "@/hooks/use-mobile";

/** Il Gantt è largo: da telefono la vista non c'è (06/10/2026). */
export const VISTE_SOLO_SCHERMO_GRANDE: ReadonlySet<CantiereView> = new Set(["cronoprogramma"]);

export function CantiereViewNav({
  value,
  onChange,
  counts,
}: {
  value: CantiereView;
  onChange: (value: CantiereView) => void;
  counts?: Partial<Record<CantiereView, number | null | undefined>>;
}) {
  const isMobile = useIsMobile();
  const views = isMobile ? CANTIERE_VIEWS.filter((v) => !VISTE_SOLO_SCHERMO_GRANDE.has(v.value)) : CANTIERE_VIEWS;
  return (
    <OrderWorkspaceNav
      label="Viste del cantiere"
      views={views}
      value={value}
      onChange={onChange}
      counts={counts}
    />
  );
}

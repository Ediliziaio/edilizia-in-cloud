import {
  CANTIERE_VIEWS,
  type CantiereView,
} from "@/lib/orders/detailNavigation";
import { OrderWorkspaceNav } from "./OrderWorkspaceNav";
import { useIsMobile } from "@/hooks/use-mobile";

/** Cronoprogramma uses a phase agenda on mobile instead of a reduced Gantt. */
export const VISTE_SOLO_SCHERMO_GRANDE: ReadonlySet<CantiereView> = new Set();

export function CantiereViewNav({
  value,
  onChange,
  counts,
  nascoste,
}: {
  value: CantiereView;
  onChange: (value: CantiereView) => void;
  counts?: Partial<Record<CantiereView, number | null | undefined>>;
  /** Le viste che questo utente non può aprire (permesso o piano). */
  nascoste?: ReadonlySet<CantiereView>;
}) {
  const isMobile = useIsMobile();
  const views = CANTIERE_VIEWS.filter((v) => !nascoste?.has(v.value) && !(isMobile && VISTE_SOLO_SCHERMO_GRANDE.has(v.value)));
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

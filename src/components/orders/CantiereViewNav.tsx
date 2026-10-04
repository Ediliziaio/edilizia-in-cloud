import {
  CANTIERE_VIEWS,
  type CantiereView,
} from "@/lib/orders/detailNavigation";
import { OrderWorkspaceNav } from "./OrderWorkspaceNav";

export function CantiereViewNav({
  value,
  onChange,
  counts,
}: {
  value: CantiereView;
  onChange: (value: CantiereView) => void;
  counts?: Partial<Record<CantiereView, number | null | undefined>>;
}) {
  return (
    <OrderWorkspaceNav
      label="Viste del cantiere"
      views={CANTIERE_VIEWS}
      value={value}
      onChange={onChange}
      counts={counts}
    />
  );
}

import {
  CANTIERE_VIEWS,
  type CantiereView,
} from "@/lib/orders/detailNavigation";
import { OrderWorkspaceNav } from "./OrderWorkspaceNav";

export function CantiereViewNav({
  value,
  onChange,
}: {
  value: CantiereView;
  onChange: (value: CantiereView) => void;
}) {
  return (
    <OrderWorkspaceNav
      label="Viste del cantiere"
      views={CANTIERE_VIEWS}
      value={value}
      onChange={onChange}
    />
  );
}

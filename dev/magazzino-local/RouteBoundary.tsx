import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { isWarehouseRoute, localWarehouseMode, requestsWarehouseLab } from "./mode";

export function LocalWarehouseRouteBoundary({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const reload = localWarehouseMode() ? !isWarehouseRoute(pathname) : requestsWarehouseLab(pathname, search);
  useEffect(() => {
    if (reload) window.location.reload();
  }, [reload]);
  return reload ? <p className="p-6" role="status">Apertura del gestionale…</p> : children;
}

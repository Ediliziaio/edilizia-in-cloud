import { HardHat, LayoutDashboard, Package, Wallet } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ORDER_DETAIL_TABS } from "@/lib/orders/detailNavigation";

const icons = {
  panoramica: LayoutDashboard,
  cantiere: HardHat,
  articoli: Package,
  finanza: Wallet,
};

export function OrderDetailNavigation() {
  return (
    <div
      id="order-detail-sections"
      className="sticky top-0 z-20 -mx-3 bg-slate-50/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6 scroll-mt-4"
    >
      <TabsList
        aria-label="Aree della commessa"
        className="grid h-auto w-full grid-cols-4 items-stretch gap-1 rounded-lg border bg-white p-1 shadow-sm"
      >
        {ORDER_DETAIL_TABS.map((tab) => {
          const Icon = icons[tab.value];
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              aria-label={tab.label}
              className="min-h-11 min-w-0 flex-col gap-1 whitespace-normal px-1 py-2 text-[11px] leading-tight data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  );
}

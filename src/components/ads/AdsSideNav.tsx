/**
 * AdsSideNav — sidebar verticale per filtri rapidi sulla lista campagne.
 *
 * Sezioni:
 *   • Stati (Tutte / Bozze / Review / Live / Archived) con conteggio
 *   • Piattaforma (Meta / Google)
 *   • Quick action: Nuova campagna
 *
 * Pattern Gmail-style: navigation persistent a sx, contenuto a dx.
 */
import { useMemo } from "react";
import {
  Megaphone,
  FileText,
  AlertCircle,
  Play,
  Pause,
  Archive,
  Plus,
  Target,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MetaCampaignStatus } from "@/types/metaAds";

export type AdsSideFilter =
  | "all"
  | "drafts"
  | "review"
  | "active"
  | "paused"
  | "archived"
  | "platform_meta"
  | "platform_google";

interface Props {
  current: AdsSideFilter;
  onChange: (filter: AdsSideFilter) => void;
  onCreate: () => void;
  counts: Record<MetaCampaignStatus, number> & { total: number; meta: number; google: number };
}

export function AdsSideNav({ current, onChange, onCreate, counts }: Props) {
  const sections = useMemo(
    () => [
      {
        title: "Stato",
        items: [
          { id: "all" as const, label: "Tutte le campagne", icon: Inbox, count: counts.total },
          { id: "drafts" as const, label: "Bozze", icon: FileText, count: counts.draft },
          { id: "review" as const, label: "In revisione", icon: AlertCircle, count: counts.review, badge: counts.review > 0 ? "amber" : null },
          { id: "active" as const, label: "Live", icon: Play, count: counts.active, badge: counts.active > 0 ? "emerald" : null },
          { id: "paused" as const, label: "In pausa", icon: Pause, count: counts.paused },
          { id: "archived" as const, label: "Archiviate", icon: Archive, count: counts.archived },
        ],
      },
      {
        title: "Piattaforma",
        items: [
          { id: "platform_meta" as const, label: "Meta Ads", icon: Megaphone, count: counts.meta },
          { id: "platform_google" as const, label: "Google Ads", icon: Target, count: counts.google },
        ],
      },
    ],
    [counts],
  );

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-white lg:flex lg:flex-col">
      <div className="border-b p-4">
        <Button onClick={onCreate} className="w-full">
          <Plus className="h-4 w-4" />
          Nuova campagna
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = current === item.id;
                const isBadgeAmber = "badge" in item && item.badge === "amber";
                const isBadgeEmerald = "badge" in item && item.badge === "emerald";
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onChange(item.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition",
                        isActive
                          ? "bg-orange-100 font-semibold text-orange-900"
                          : "text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.count > 0 && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 px-1.5 text-[10px]",
                            isBadgeAmber
                              ? "border-amber-300 bg-amber-100 text-amber-800"
                              : isBadgeEmerald
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                              : isActive
                              ? "border-orange-300 bg-white text-orange-700"
                              : "border-slate-200 bg-slate-50 text-slate-600",
                          )}
                        >
                          {item.count}
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

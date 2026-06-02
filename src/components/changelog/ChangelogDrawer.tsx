/**
 * ChangelogDrawer — v8.6.90
 *
 * Bottone novità cliccabile nell'header con badge "X" se ci sono entries
 * non lette. Apre uno Sheet (drawer da destra) con la lista entries published,
 * pinned in cima. Apertura → markAsSeen → badge sparisce.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Pin, Bug, Shield, Megaphone, Zap, ArrowRight } from "lucide-react";
import { useChangelog, type ChangelogEntry } from "@/hooks/useChangelog";
import { track } from "@/lib/analytics/posthog";
import { renderMarkdownLite } from "@/lib/utils/markdownLite";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<
  ChangelogEntry["category"],
  { label: string; icon: typeof Sparkles; color: string }
> = {
  feature: { label: "Nuovo", icon: Sparkles, color: "text-violet-600 bg-violet-50 border-violet-200" },
  improvement: { label: "Migliorato", icon: Zap, color: "text-blue-600 bg-blue-50 border-blue-200" },
  fix: { label: "Bugfix", icon: Bug, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  security: { label: "Sicurezza", icon: Shield, color: "text-amber-600 bg-amber-50 border-amber-200" },
  announcement: { label: "Avviso", icon: Megaphone, color: "text-rose-600 bg-rose-50 border-rose-200" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ChangelogDrawer() {
  const { entries, unreadCount, markAsSeen } = useChangelog();
  const [open, setOpen] = useState(false);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v && unreadCount > 0) {
      markAsSeen();
      track("changelog_opened", { unread_count: unreadCount, total: entries.length });
    }
  };

  if (entries.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          aria-label={unreadCount > 0 ? `${unreadCount} aggiornamenti non letti` : "Cosa c'è di nuovo"}
        >
          <Megaphone className={cn("h-4 w-4", unreadCount > 0 && "text-amber-500")} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 sm:p-6 pb-2 border-b bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20">
          <SheetTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            Cosa c&apos;è di nuovo
          </SheetTitle>
          <SheetDescription className="text-xs">
            Le ultime novità della piattaforma · {entries.length} aggiornament{entries.length === 1 ? "o" : "i"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {entries.map((entry) => {
            const meta = CATEGORY_META[entry.category];
            const Icon = meta.icon;
            return (
              <article
                key={entry.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  entry.is_pinned
                    ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/10"
                    : "border-border bg-card hover:bg-muted/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0">{entry.emoji ?? "✨"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-sm">{entry.title}</h3>
                      {entry.is_pinned && (
                        <Pin className="h-3 w-3 text-amber-600" aria-label="In evidenza" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", meta.color)}>
                        <Icon className="h-2.5 w-2.5 mr-1" />
                        {meta.label}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(entry.published_at)}
                      </span>
                    </div>
                    <div
                      className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownLite(entry.body_md) }}
                    />
                    {entry.cta_url && (() => {
                      // v8.6.96 — URL assoluti vanno su <a>, path interni su <Link>
                      const isExternal = /^https?:\/\//i.test(entry.cta_url) || /^mailto:|^tel:/i.test(entry.cta_url);
                      return (
                        <Button asChild size="sm" variant="outline" className="mt-3 h-7 text-xs">
                          {isExternal ? (
                            <a href={entry.cta_url} target="_blank" rel="noopener noreferrer">
                              {entry.cta_label ?? "Scopri"}
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </a>
                          ) : (
                            <Link to={entry.cta_url} onClick={() => setOpen(false)}>
                              {entry.cta_label ?? "Scopri"}
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Link>
                          )}
                        </Button>
                      );
                    })()}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

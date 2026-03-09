import { useContactAttribution } from "@/hooks/useContactAttribution";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, MousePointerClick, Clock, Hash } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const SOURCE_COLORS: Record<string, string> = {
  google: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  facebook: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  meta: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  instagram: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  linkedin: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  email: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  organic: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  direct: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

function SourceBadge({ source }: { source: string | null }) {
  const s = (source || "direct").toLowerCase();
  const colorClass = SOURCE_COLORS[s] || SOURCE_COLORS.direct;
  return <Badge variant="outline" className={`text-[10px] ${colorClass}`}>{source || "direct"}</Badge>;
}

interface Props {
  contactId: string;
  companyId: string;
}

export function ContactAttributionTab({ contactId, companyId }: Props) {
  const { attribution, sessions, isLoading } = useContactAttribution(contactId, companyId);

  if (isLoading) {
    return <div className="space-y-2 px-1"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  }

  if (!attribution && sessions.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground px-1 py-2">
        Nessun dato di attribuzione disponibile per questo contatto.
      </p>
    );
  }

  return (
    <div className="space-y-2 px-1">
      {/* First Touch */}
      {attribution?.first_source && (
        <div className="border rounded-md p-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
            <MousePointerClick className="h-3 w-3" /> FIRST TOUCH
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <SourceBadge source={attribution.first_source} />
            {attribution.first_medium && (
              <Badge variant="secondary" className="text-[10px]">{attribution.first_medium}</Badge>
            )}
            {attribution.first_campaign && (
              <Badge variant="secondary" className="text-[10px]">{attribution.first_campaign}</Badge>
            )}
          </div>
          {attribution.first_touch_at && (
            <p className="text-[10px] text-muted-foreground">
              {format(new Date(attribution.first_touch_at), "dd MMM yyyy, HH:mm", { locale: it })}
            </p>
          )}
        </div>
      )}

      {/* Last Touch */}
      {attribution?.last_source && attribution.last_source !== attribution.first_source && (
        <div className="border rounded-md p-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
            <Globe className="h-3 w-3" /> LAST TOUCH
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <SourceBadge source={attribution.last_source} />
            {attribution.last_medium && (
              <Badge variant="secondary" className="text-[10px]">{attribution.last_medium}</Badge>
            )}
            {attribution.last_campaign && (
              <Badge variant="secondary" className="text-[10px]">{attribution.last_campaign}</Badge>
            )}
          </div>
          {attribution.last_touch_at && (
            <p className="text-[10px] text-muted-foreground">
              {format(new Date(attribution.last_touch_at), "dd MMM yyyy, HH:mm", { locale: it })}
            </p>
          )}
        </div>
      )}

      {/* Sessions count */}
      {attribution?.total_sessions && attribution.total_sessions > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-1">
          <Hash className="h-3 w-3" />
          {attribution.total_sessions} session{attribution.total_sessions > 1 ? "i" : "e"} tracciate
        </div>
      )}

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Ultime sessioni
          </p>
          {sessions.slice(0, 5).map((s) => (
            <div key={s.id} className="text-[10px] border rounded px-2 py-1 space-y-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                <SourceBadge source={s.utm_source} />
                {s.utm_medium && <span className="text-muted-foreground">/ {s.utm_medium}</span>}
                {s.utm_campaign && <span className="text-muted-foreground">/ {s.utm_campaign}</span>}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{format(new Date(s.started_at), "dd/MM/yy HH:mm", { locale: it })}</span>
                {s.device_type && <span className="capitalize">{s.device_type}</span>}
                {s.landing_page && <span className="truncate max-w-[120px]" title={s.landing_page}>{s.landing_page}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

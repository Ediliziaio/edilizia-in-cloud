import { useContactAttribution } from "@/hooks/useContactAttribution";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, MousePointerClick, Clock, Hash, Monitor, Smartphone, Tablet, ExternalLink, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const SOURCE_COLORS: Record<string, string> = {
  google: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  facebook: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  meta: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  instagram: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  linkedin: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  tiktok: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  email: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  organic: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  direct: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

function SourceBadge({ source }: { source: string | null }) {
  const s = (source || "direct").toLowerCase();
  const colorClass = SOURCE_COLORS[s] || SOURCE_COLORS.direct;
  return <Badge variant="outline" className={`text-[10px] ${colorClass}`}>{source || "direct"}</Badge>;
}

function DeviceIcon({ type }: { type: string | null }) {
  const cls = "h-3 w-3 text-muted-foreground";
  if (type === "mobile") return <Smartphone className={cls} />;
  if (type === "tablet") return <Tablet className={cls} />;
  return <Monitor className={cls} />;
}

interface TouchCardProps {
  label: string;
  icon: React.ReactNode;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  landingUrl: string | null;
  gclid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  touchAt: string | null;
}

function TouchCard({ label, icon, source, medium, campaign, content, term, landingUrl, gclid, fbclid, ttclid, touchAt }: TouchCardProps) {
  const clickIds = [
    gclid && "gclid",
    fbclid && "fbclid",
    ttclid && "ttclid",
  ].filter(Boolean);

  return (
    <div className="border rounded-md p-2 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
        {icon} {label}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <SourceBadge source={source} />
        {medium && <Badge variant="secondary" className="text-[10px]">{medium}</Badge>}
        {campaign && <Badge variant="secondary" className="text-[10px]">{campaign}</Badge>}
        {content && <Badge variant="secondary" className="text-[10px]">{content}</Badge>}
      </div>
      {term && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Search className="h-2.5 w-2.5" /> <span className="italic">{term}</span>
        </div>
      )}
      {landingUrl && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ExternalLink className="h-2.5 w-2.5" />
          <span className="truncate max-w-[180px]" title={landingUrl}>{landingUrl}</span>
        </div>
      )}
      {clickIds.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {clickIds.map((cid) => (
            <Badge key={cid} variant="outline" className="text-[9px] font-mono bg-muted">{cid}</Badge>
          ))}
        </div>
      )}
      {touchAt && (
        <p className="text-[10px] text-muted-foreground">
          {format(new Date(touchAt), "dd MMM yyyy, HH:mm", { locale: it })}
        </p>
      )}
    </div>
  );
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
        <TouchCard
          label="FIRST TOUCH"
          icon={<MousePointerClick className="h-3 w-3" />}
          source={attribution.first_source}
          medium={attribution.first_medium}
          campaign={attribution.first_campaign}
          content={attribution.ft_content}
          term={attribution.ft_term}
          landingUrl={attribution.ft_landing_url}
          gclid={attribution.ft_gclid}
          fbclid={attribution.ft_fbclid}
          ttclid={attribution.ft_ttclid}
          touchAt={attribution.first_touch_at}
        />
      )}

      {/* Last Touch */}
      {attribution?.last_source && attribution.last_source !== attribution.first_source && (
        <TouchCard
          label="LAST TOUCH"
          icon={<Globe className="h-3 w-3" />}
          source={attribution.last_source}
          medium={attribution.last_medium}
          campaign={attribution.last_campaign}
          content={attribution.lt_content}
          term={attribution.lt_term}
          landingUrl={attribution.lt_landing_url}
          gclid={attribution.lt_gclid}
          fbclid={attribution.lt_fbclid}
          ttclid={attribution.lt_ttclid}
          touchAt={attribution.last_touch_at}
        />
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
                <DeviceIcon type={s.device_type} />
                {(s as any).landing_url && (
                  <span className="truncate max-w-[120px]" title={(s as any).landing_url}>{(s as any).landing_url}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

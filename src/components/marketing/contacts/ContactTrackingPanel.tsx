import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Radar, Facebook, Globe, Webhook, UserPlus, FileInput, Chrome,
  MessageSquare, Megaphone, Layers, Image as ImageIcon, Link2, Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getActivityIcon, getActivityColor } from "./activityHelpers";

interface SubmissionField {
  name: string;
  value: string | null;
}

interface Submission {
  event_id: string;
  provider: string;
  received_at: string;
  created_time: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  form_id: string | null;
  page_id: string | null;
  fields: SubmissionField[];
}

interface TrackingActivity {
  activity_type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ContactSnapshot {
  source: string | null;
  attr_source: string | null;
  attr_medium: string | null;
  attr_campaign: string | null;
  attr_content: string | null;
  attr_model: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  meta_lead_id: string | null;
  source_campaign_id: string | null;
  google_campaign_id: string | null;
  google_ad_group_id: string | null;
  google_ad_id: string | null;
  google_customer_id: string | null;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  fbc: string | null;
  fbp: string | null;
  created_at: string;
}

interface TrackingData {
  contact: ContactSnapshot | null;
  submissions: Submission[];
  events: TrackingActivity[];
}

/** Icona + etichetta leggibile per la fonte del contatto. */
function sourceMeta(source: string | null | undefined, attrSource: string | null | undefined) {
  const s = (source || attrSource || "").toLowerCase();
  if (s.includes("facebook") || s.includes("meta") || s.includes("instagram"))
    return { icon: Facebook, label: "Facebook / Instagram Lead", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" };
  if (s.includes("google")) return { icon: Chrome, label: "Google", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  if (s.includes("whatsapp")) return { icon: MessageSquare, label: "WhatsApp", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" };
  if (s.includes("site") || s.includes("web") || s.includes("landing"))
    return { icon: Globe, label: "Sito web", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" };
  if (s.includes("api") || s.includes("webhook"))
    return { icon: Webhook, label: "API / Webhook", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
  if (s.includes("import")) return { icon: FileInput, label: "Importazione", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
  if (!s || s.includes("manual")) return { icon: UserPlus, label: "Inserimento manuale", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
  return { icon: Radar, label: source || attrSource || "Sconosciuta", color: "bg-muted text-muted-foreground" };
}

/** Rende leggibile il nome grezzo di un campo del modulo Meta. */
function humanizeField(name: string) {
  if (!name) return "";
  const clean = name.replace(/[_-]+/g, " ").trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "";
  try {
    return format(new Date(v), "d MMM yyyy 'alle' HH:mm", { locale: it });
  } catch {
    return "";
  }
}

function activityLabel(a: TrackingActivity) {
  if (a.description) return a.description;
  switch (a.activity_type) {
    case "opportunity_created":
    case "opportunity_auto_created": return "Opportunità creata";
    case "opportunity_assigned": return "Opportunità assegnata";
    case "contact_assigned": return "Contatto assegnato";
    case "stage_changed": return "Fase opportunità cambiata";
    case "status_changed": return "Stato contatto cambiato";
    case "site_lead_submitted": return "Modulo sito compilato";
    case "note_added": return "Nota aggiunta";
    case "message_sent": return "Messaggio inviato";
    case "updated": return "Contatto aggiornato";
    default: return a.activity_type.replace(/[_-]+/g, " ");
  }
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}

export function ContactTrackingPanel({ contactId }: { contactId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["contact-tracking", contactId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_contact_tracking", { p_contact_id: contactId });
      if (error) throw error;
      return (data || { contact: null, submissions: [], events: [] }) as unknown as TrackingData;
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !data?.contact) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Radar className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-xs">Nessun dato di tracciamento disponibile</p>
      </div>
    );
  }

  const c = data.contact;
  const submissions = data.submissions || [];
  const events = data.events || [];
  const src = sourceMeta(c.source, c.attr_source);
  const SrcIcon = src.icon;

  // Attribuzione Meta: se il contatto o una submission portano dati campagna.
  const firstSub = submissions[0];
  const metaCampaign = c.attr_campaign || firstSub?.campaign_name || null;
  const metaAdset = firstSub?.adset_name || null; // il nome adset vive solo nel payload grezzo
  const metaAd = c.attr_content || firstSub?.ad_name || null;
  const hasMetaAttr = !!(metaCampaign || metaAdset || metaAd || c.meta_campaign_id || c.meta_lead_id);
  const hasGoogleAttr = !!(c.google_campaign_id || c.gclid || c.google_customer_id);
  const hasClickIds = !!(c.fbc || c.fbp || c.gclid || c.wbraid || c.gbraid);

  return (
    <div className="space-y-3">
      {/* Origine + creazione */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center h-7 w-7 rounded-md ${src.color}`}>
            <SrcIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-tight">{src.label}</p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Creato il {fmtDateTime(c.created_at)}
            </p>
          </div>
        </div>
        {c.attr_medium && (
          <Badge variant="secondary" className="text-[10px] max-md:text-[11px]">{c.attr_medium}</Badge>
        )}
      </div>

      {/* Attribuzione Meta */}
      {hasMetaAttr && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-[11px] font-semibold flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
            <Facebook className="h-3.5 w-3.5" /> Attribuzione Meta
          </p>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <Megaphone className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground max-md:text-[11px]">Campagna</p>
                <p className="text-xs font-medium break-words">{metaCampaign || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Layers className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground max-md:text-[11px]">Gruppo di inserzioni</p>
                <p className="text-xs font-medium break-words">{metaAdset || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ImageIcon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground max-md:text-[11px]">Inserzione</p>
                <p className="text-xs font-medium break-words">{metaAd || "—"}</p>
              </div>
            </div>
          </div>
          <div className="pt-1.5 border-t space-y-1">
            <Row label="Campaign ID" value={c.meta_campaign_id} />
            <Row label="Adset ID" value={c.meta_adset_id} />
            <Row label="Ad ID" value={c.meta_ad_id} />
            <Row label="Lead ID" value={c.meta_lead_id} />
          </div>
        </div>
      )}

      {/* Attribuzione Google */}
      {hasGoogleAttr && (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[11px] font-semibold flex items-center gap-1.5 text-red-700 dark:text-red-300">
            <Chrome className="h-3.5 w-3.5" /> Attribuzione Google
          </p>
          <Row label="Campaign ID" value={c.google_campaign_id} />
          <Row label="Ad Group ID" value={c.google_ad_group_id} />
          <Row label="Ad ID" value={c.google_ad_id} />
          <Row label="Customer ID" value={c.google_customer_id} />
        </div>
      )}

      {/* Click ID / cookie */}
      {hasClickIds && (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[11px] font-semibold flex items-center gap-1.5 text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" /> Identificatori tracciamento
          </p>
          <Row label="gclid" value={c.gclid} />
          <Row label="wbraid" value={c.wbraid} />
          <Row label="gbraid" value={c.gbraid} />
          <Row label="fbc" value={c.fbc} />
          <Row label="fbp" value={c.fbp} />
        </div>
      )}

      {/* Richieste / submission del modulo */}
      {submissions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold flex items-center gap-1.5">
            <FileInput className="h-3.5 w-3.5" /> Richieste inviate
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{submissions.length}</Badge>
          </p>
          {submissions.map((s, i) => (
            <div key={s.event_id || i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium">
                  Richiesta #{submissions.length - i}
                </span>
                <span className="text-[10px] text-muted-foreground max-md:text-[11px]">
                  {fmtDateTime(s.created_time || s.received_at)}
                </span>
              </div>
              {(s.campaign_name || s.adset_name || s.ad_name) && (
                <div className="flex flex-wrap gap-1">
                  {s.campaign_name && <Badge variant="outline" className="text-[10px] max-md:text-[11px]">📣 {s.campaign_name}</Badge>}
                  {s.adset_name && <Badge variant="outline" className="text-[10px] max-md:text-[11px]">🗂 {s.adset_name}</Badge>}
                  {s.ad_name && <Badge variant="outline" className="text-[10px] max-md:text-[11px]">🖼 {s.ad_name}</Badge>}
                </div>
              )}
              {s.fields?.length > 0 && (
                <div className="space-y-1 pt-1 border-t">
                  {s.fields.map((f, fi) => (
                    <div key={fi} className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="text-muted-foreground shrink-0">{humanizeField(f.name)}</span>
                      <span className="font-medium text-right break-words">{f.value || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Timeline eventi CRM */}
      {events.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground">Cronologia</p>
          <div className="space-y-2">
            {events.map((e, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${getActivityColor(e.activity_type)}`}>
                  {getActivityIcon(e.activity_type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium leading-tight break-words">{activityLabel(e)}</p>
                  <p className="text-[10px] text-muted-foreground max-md:text-[11px]">{fmtDateTime(e.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

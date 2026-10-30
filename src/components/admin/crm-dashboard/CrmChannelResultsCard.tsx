/**
 * CrmChannelResultsCard — risultati PER CANALE nel periodo scelto: email, SMS,
 * WhatsApp (Meta), WhatsApp dal telefono, telefono, Meta lead, sito.
 *
 * Per ogni canale tre numeri, sempre gli stessi: quanti messaggi/chiamate sono
 * partiti, quante risposte sono tornate, quanti lead nuovi ha portato. Dove un
 * numero non ha senso (un form del sito non «invia» niente) c'è il trattino.
 *
 * Tutto con COUNT esatti (head: true), niente righe scaricate. Ogni conteggio è
 * fail-open: una tabella non leggibile dà «—», non rompe il riquadro.
 * Usato nella Dashboard CRM e nell'Outreach (tab Oggi): solo area admin.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MessageSquare, MessageCircle, Smartphone, Phone, Facebook, Globe, Loader2, Split } from "lucide-react";

type Num = number | null;

interface RigaCanale {
  key: string;
  label: string;
  icon: typeof Mail;
  color: string;
  to: string;
  inviati: Num;
  risposte: Num;
  lead: Num;
}

const DAY = 86_400_000;
const fmt = (n: Num) => (n == null ? "—" : n.toLocaleString("it-IT"));

export function CrmChannelResultsCard({ companyId, days }: { companyId: string; days: number }) {
  const [nowMs] = useState(() => Date.now());
  const sinceIso = useMemo(() => new Date(nowMs - days * DAY).toISOString(), [nowMs, days]);

  const q = useQuery({
    queryKey: ["crm-dash", "risultati-per-canale", companyId, sinceIso],
    staleTime: 60_000,
    queryFn: async () => {
      // Tabelle fuori dai tipi generati (outreach_*, openwa_*): cast locale.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const c = async (b: PromiseLike<{ count: number | null; error: unknown }>): Promise<Num> => {
        try {
          const { count, error } = await b;
          return error ? null : count ?? 0;
        } catch {
          return null;
        }
      };
      const head = (t: string) => sb.from(t).select("id", { count: "exact", head: true });

      const [
        emailInv, emailRisp,
        smsInv, smsRisp,
        waInv, waRisp,
        owaInv, owaRisp,
        tel, telRisp,
        metaLead,
        sitoLead,
      ] = await Promise.all([
        c(head("outreach_send_queue").eq("company_id", companyId).eq("channel", "email").eq("status", "sent").gte("sent_at", sinceIso)),
        // Senza le risposte automatiche (ferie, conferme): non sono risposte ottenute.
        c(head("outreach_replies").eq("company_id", companyId).eq("channel", "email").or("intent.is.null,intent.neq.auto_reply").gte("received_at", sinceIso)),
        c(head("sms_messages").eq("company_id", companyId).eq("direction", "outbound").gte("created_at", sinceIso)),
        c(head("sms_messages").eq("company_id", companyId).eq("direction", "inbound").gte("created_at", sinceIso)),
        c(head("whatsapp_messages").eq("company_id", companyId).eq("direction", "outbound").gte("created_at", sinceIso)),
        c(head("whatsapp_messages").eq("company_id", companyId).eq("direction", "inbound").gte("created_at", sinceIso)),
        // WhatsApp dal telefono (numeri collegati con QR): solo piattaforma.
        c(head("openwa_messages").eq("direction", "outbound").gte("created_at", sinceIso)),
        c(head("openwa_messages").eq("direction", "inbound").gte("created_at", sinceIso)),
        c(head("human_call_logs").eq("company_id", companyId).gte("started_at", sinceIso)),
        c(head("human_call_logs").eq("company_id", companyId).gt("duration_seconds", 0).gte("started_at", sinceIso)),
        c(head("marketing_contacts").eq("company_id", companyId).ilike("source", "%meta%").gte("created_at", sinceIso)),
        c(
          head("marketing_contact_activities")
            .eq("company_id", companyId)
            .in("activity_type", ["site_lead_submitted", "lead_form_submission"])
            .gte("created_at", sinceIso),
        ),
      ]);

      const righe: RigaCanale[] = [
        { key: "email", label: "Email", icon: Mail, color: "hsl(217 91% 60%)", to: "/admin/marketing", inviati: emailInv, risposte: emailRisp, lead: null },
        { key: "sms", label: "SMS", icon: MessageSquare, color: "hsl(262 83% 58%)", to: "/admin/marketing/sms", inviati: smsInv, risposte: smsRisp, lead: null },
        { key: "wa-meta", label: "WhatsApp (Meta)", icon: MessageCircle, color: "hsl(142 71% 40%)", to: "/admin/marketing/whatsapp", inviati: waInv, risposte: waRisp, lead: null },
        { key: "wa-tel", label: "WhatsApp dal telefono", icon: Smartphone, color: "hsl(160 84% 32%)", to: "/admin/marketing/whatsapp-locale", inviati: owaInv, risposte: owaRisp, lead: null },
        { key: "tel", label: "Telefono", icon: Phone, color: "hsl(24 95% 53%)", to: "/admin/marketing/contatti", inviati: tel, risposte: telRisp, lead: null },
        { key: "meta", label: "Meta lead", icon: Facebook, color: "hsl(221 83% 53%)", to: "/admin/marketing/contatti", inviati: null, risposte: null, lead: metaLead },
        { key: "sito", label: "Sito", icon: Globe, color: "hsl(43 96% 46%)", to: "/admin/marketing/contatti", inviati: null, risposte: null, lead: sitoLead },
      ];
      return righe;
    },
  });

  const righe = q.data ?? [];
  const attive = righe.filter((r) => (r.inviati ?? 0) + (r.risposte ?? 0) + (r.lead ?? 0) > 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Split className="h-4 w-4" aria-hidden="true" /> Risultati per canale
          <span className="ml-auto text-xs font-normal text-muted-foreground">ultimi {days} giorni</span>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : attive.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nessun invio, risposta o lead nel periodo. Prova un periodo più lungo.
          </p>
        ) : (
          <>
            {/* Telefono: card dense, due per riga. */}
            <div className="grid grid-cols-2 gap-2 md:hidden">
              {righe.map((r) => (
                <Link key={r.key} to={r.to} className="rounded-lg border p-2.5 transition-colors hover:bg-muted/50">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                    <r.icon className="h-3.5 w-3.5 shrink-0" style={{ color: r.color }} aria-hidden="true" />
                    <span className="truncate">{r.label}</span>
                  </div>
                  <div className="text-[11px] leading-snug text-muted-foreground">
                    {r.inviati != null && <div>Inviati <span className="font-semibold text-foreground">{fmt(r.inviati)}</span></div>}
                    {r.risposte != null && <div>Risposte <span className="font-semibold text-foreground">{fmt(r.risposte)}</span></div>}
                    {r.lead != null && <div>Lead <span className="font-semibold text-foreground">{fmt(r.lead)}</span></div>}
                  </div>
                </Link>
              ))}
            </div>

            {/* Da tablet in su: tabella. */}
            <table className="hidden w-full text-[13px] md:table">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 font-medium">Canale</th>
                  <th className="pb-2 text-right font-medium">Inviati</th>
                  <th className="pb-2 text-right font-medium">Risposte</th>
                  <th className="pb-2 text-right font-medium">Tasso risposta</th>
                  <th className="pb-2 text-right font-medium">Lead nuovi</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => {
                  const tasso = r.inviati && r.risposte != null ? Math.round((r.risposte / r.inviati) * 100) : null;
                  return (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <Link to={r.to} className="inline-flex items-center gap-2 font-medium hover:underline">
                          <r.icon className="h-4 w-4 shrink-0" style={{ color: r.color }} aria-hidden="true" />
                          {r.label}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{fmt(r.inviati)}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(r.risposte)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{tasso == null ? "—" : `${tasso}%`}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(r.lead)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 hidden text-[11px] text-muted-foreground md:block">
              Telefono: «risposte» = chiamate con conversazione. Sito: form compilati.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

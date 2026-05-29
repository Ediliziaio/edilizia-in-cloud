/**
 * RischioBanner — MP-EMAIL-AI-16 · Avviso di rischio sull'email in arrivo
 *
 * Calcola i segnali DETERMINISTICI lato client (lib risk-signals, testata) e
 * mostra un banner giallo/rosso con i segnali in chiaro. Avvisa, non blocca.
 * Il segnale IBAN diverso (anti-frode BEC) eredita dall'estrazione MP-06.
 */
import { useMemo } from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { valutaRischio } from "@/lib/email-ai/risk-signals";
import { useDominiFornitoriNoti, useDocumentiEstrattiPerEmail } from "@/lib/email-ai/hooks";

interface RischioMessage {
  id: string;
  from_email?: string | null;
  subject?: string | null;
  raw_text?: string | null;
  raw_html?: string | null;
  attachments?: unknown;
  headers?: unknown;
}

function authHeaderOf(headers: unknown): string | null {
  if (!headers) return null;
  if (typeof headers === "string") return headers;
  if (typeof headers === "object") {
    const h = headers as Record<string, unknown>;
    const v = h["authentication-results"] ?? h["Authentication-Results"] ?? h["arc-authentication-results"];
    return typeof v === "string" ? v : null;
  }
  return null;
}

function extractLinks(html?: string | null): Array<{ text?: string; href?: string }> {
  if (!html) return [];
  const out: Array<{ text?: string; href?: string }> = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(html)) && i < 50) { out.push({ href: m[1], text: m[2].replace(/<[^>]+>/g, " ").trim() }); i++; }
  return out;
}

export function RischioBanner({ message }: { message: RischioMessage }) {
  const { effectiveCompany } = useAuth();
  const { data: knownDomains } = useDominiFornitoriNoti(effectiveCompany?.id);
  const { data: drafts } = useDocumentiEstrattiPerEmail(message.id);

  const { livello, segnali } = useMemo(() => {
    const senderDomain = (message.from_email || "").toLowerCase().match(/@([^@\s>]+)/)?.[1] ?? "";
    const attachmentNames = Array.isArray(message.attachments)
      ? (message.attachments as Array<{ filename?: string }>).map((a) => a.filename || "")
      : [];
    const ibanDiverso = (drafts ?? []).some((d) => d.iban_alert);
    return valutaRischio({
      authHeader: authHeaderOf(message.headers),
      senderDomain,
      knownDomains: knownDomains || [],
      testo: `${message.subject || ""}\n${message.raw_text || ""}`,
      links: extractLinks(message.raw_html),
      attachmentNames,
      ibanDiverso,
    });
  }, [message, knownDomains, drafts]);

  if (livello === "basso" || segnali.length === 0) return null;
  const alto = livello === "alto";

  return (
    <div className={cn(
      "mx-3 mb-2 mt-3 rounded-lg border p-3",
      alto ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50",
    )}>
      <div className={cn("mb-1.5 flex items-center gap-2 text-sm font-semibold", alto ? "text-rose-800" : "text-amber-800")}>
        {alto ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {alto ? "Email ad alto rischio" : "Email da verificare"}
      </div>
      <ul className="space-y-1">
        {segnali.map((s) => (
          <li key={s.codice} className={cn("flex items-start gap-1.5 text-[12px]", alto ? "text-rose-900" : "text-amber-900")}>
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-current" />
            <span>{s.descrizione}</span>
          </li>
        ))}
      </ul>
      <p className={cn("mt-2 text-[11px]", alto ? "text-rose-700" : "text-amber-700")}>
        Questo è un avviso: l'email non è stata bloccata. Valuta tu prima di agire.
      </p>
    </div>
  );
}

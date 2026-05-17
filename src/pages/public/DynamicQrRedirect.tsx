import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PublicQrRow {
  id: string;
  company_id: string;
  name: string;
  destination_url: string;
  public_token: string;
  access_level: "public" | "private";
  status: "active" | "inactive" | "archived";
  expires_at: string | null;
}

// v8.6.43 — SECURITY: validazione scheme prima del redirect.
// Senza questo check, un destination_url come `javascript:alert(1)` o
// `data:text/html,...` apre vettori XSS sul dominio dell'app. La
// `normalizeDestinationUrl` nel form di creazione blocca questi schemi
// in input, ma un valore già esistente / iniettato via API può bypassare.
// Allowlist: http://, https://, mailto:, tel:, percorsi assoluti (/...) interni.
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function isSafeRedirect(destination: string): boolean {
  if (!destination) return false;
  const trimmed = destination.trim();
  // Path assoluto interno
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function buildRedirectUrl(destination: string) {
  // Path interni: lasciali tali per il SPA router
  if (destination.startsWith("/")) return destination;
  return destination;
}

export default function DynamicQrRedirect() {
  const { token } = useParams();
  const [state, setState] = useState<"loading" | "redirecting" | "not-found" | "blocked">("loading");
  const [message, setMessage] = useState("Verifico il QR...");

  useEffect(() => {
    let cancelled = false;

    async function resolveQr() {
      if (!token) {
        setState("not-found");
        setMessage("QR non valido.");
        return;
      }

      const { data, error } = await (supabase as any)
        .from("company_qr_codes")
        .select("id, company_id, name, destination_url, public_token, access_level, status, expires_at")
        .eq("public_token", token)
        .limit(1);

      if (cancelled) return;

      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) {
        setState("not-found");
        setMessage("Questo QR non esiste, è privato, disattivato o scaduto.");
        return;
      }

      const qr = row as PublicQrRow;
      const expired = !!qr.expires_at && new Date(qr.expires_at).getTime() <= Date.now();
      const blocked = qr.status !== "active" || expired || qr.access_level !== "public";
      if (blocked) {
        const scanStatus = qr.access_level !== "public"
          ? "private_denied"
          : expired
            ? "expired"
            : qr.status === "archived"
              ? "archived"
              : "inactive";
        await (supabase as any).from("company_qr_scan_logs").insert({
          company_id: qr.company_id,
          qr_code_id: qr.id,
          scan_status: scanStatus,
          user_agent: navigator.userAgent,
          referrer: document.referrer || null,
          device_info: {
            language: navigator.language,
            platform: navigator.platform,
          },
        });
        if (cancelled) return;
        setState("blocked");
        setMessage("Questo QR non è più accessibile.");
        return;
      }

      // v8.6.43 — SECURITY: blocca redirect a schemi pericolosi
      // (javascript:, data:, ecc.) prima del setState/assign.
      if (!isSafeRedirect(qr.destination_url)) {
        await (supabase as any).from("company_qr_scan_logs").insert({
          company_id: qr.company_id,
          qr_code_id: qr.id,
          scan_status: "private_denied",
          user_agent: navigator.userAgent,
          referrer: document.referrer || null,
          device_info: {
            language: navigator.language,
            // navigator.platform deprecato ma comunque utile come fallback
            platform: navigator.platform,
          },
        });
        if (cancelled) return;
        setState("blocked");
        setMessage("Destinazione del QR non valida o non sicura.");
        return;
      }

      // v8.6.43 — Tracking scan: AWAITed prima del redirect (era già il
      // pattern attuale ma confermiamolo) per evitare race condition con
      // il successivo window.location.assign che cancella i fetch in-flight.
      await (supabase as any).from("company_qr_scan_logs").insert({
        company_id: qr.company_id,
        qr_code_id: qr.id,
        scan_status: "opened",
        user_agent: navigator.userAgent,
        referrer: document.referrer || null,
        device_info: {
          language: navigator.language,
          platform: navigator.platform,
        },
      });

      if (cancelled) return;
      setState("redirecting");
      setMessage(`Apro ${qr.name}...`);
      window.location.assign(buildRedirectUrl(qr.destination_url));
    }

    void resolveQr();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          {state === "loading" || state === "redirecting" ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : state === "blocked" ? (
            <ShieldCheck className="h-6 w-6 text-amber-600" />
          ) : (
            <AlertCircle className="h-6 w-6 text-destructive" />
          )}
        </div>
        <h1 className="text-xl font-semibold">
          {state === "loading" || state === "redirecting" ? "QR EdiliziaInCloud" : "QR non disponibile"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {(state === "blocked" || state === "not-found") && (
          <div className="mt-5 flex justify-center">
            <Button asChild variant="outline">
              <Link to="/">
                <QrCode className="mr-2 h-4 w-4" />
                Torna al sito
              </Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

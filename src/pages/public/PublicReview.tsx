import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Send, Star } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type PublicReviewStatus = "pubblicata" | "critica";

function buildReviewStorageKey(companyId: string) {
  return `eic_reputation_manager_${companyId}`;
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSchemaFallbackError(error: unknown) {
  const message = String(isRecord(error) && "message" in error ? error.message : error).toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("permission denied")
  );
}

function makeEntityId(prefix: string) {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

// RPC introdotta dalla migration reputazione; finche i tipi Supabase non sono rigenerati
// manteniamo una chiamata compatibile con fallback locale.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reputationRpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

function appendLocalReview(companyId: string, review: Record<string, unknown>) {
  try {
    const key = buildReviewStorageKey(companyId);
    const raw = window.localStorage.getItem(key);
    const current = raw ? JSON.parse(raw) : {};
    const reviews = Array.isArray(current.reviews) ? current.reviews : [];
    const events = Array.isArray(current.events) ? current.events : [];
    const status = review.status === "critica" ? "critical_alert" : "request_started";

    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...current,
        reviews: [review, ...reviews],
        events: [
          {
            id: `evt-public-${Date.now()}`,
            kind: status,
            title: review.status === "critica" ? "Feedback critico ricevuto" : "Feedback positivo ricevuto",
            detail: `${review.author ?? "Cliente"} - ${review.project ?? "Feedback pubblico"}`,
            actor: "Modulo pubblico",
            timestamp: new Date().toISOString(),
            tone: review.status === "critica" ? "warning" : "success",
          },
          ...events,
        ].slice(0, 40),
      }),
    );
  } catch {
    // Il form resta usabile anche se lo storage locale del browser non e' disponibile.
  }
}

export default function PublicReview() {
  const { companyId = "local" } = useParams();
  const [searchParams] = useSearchParams();
  const publicSlug = decodeURIComponent(companyId);
  const storageCompanyId = searchParams.get("company_id") || publicSlug;
  const campaignId = searchParams.get("campaign_id");
  const orderId = searchParams.get("order_id");
  const customerId = searchParams.get("customer_id");
  const projectFromLink = searchParams.get("project") ?? "";
  const publicCode = publicSlug.replace(/-[a-f0-9]{8}$/i, "");
  const [rating, setRating] = useState(0);
  const [author, setAuthor] = useState("");
  const [project, setProject] = useState(projectFromLink);
  const [feedback, setFeedback] = useState("");
  const [submittedStatus, setSubmittedStatus] = useState<PublicReviewStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ratingLabel = useMemo(() => {
    if (rating >= 5) return "Ottima esperienza";
    if (rating === 4) return "Buona esperienza";
    if (rating === 3) return "Da migliorare";
    if (rating > 0) return "Serve attenzione";
    return "Scegli una valutazione";
  }, [rating]);

  const submitReview = async () => {
    if (isSubmitting) return;

    const cleanAuthor = author.trim();
    const cleanFeedback = feedback.trim();

    if (!rating) {
      toast.error("Seleziona una valutazione.");
      return;
    }
    if (!cleanAuthor) {
      toast.error("Inserisci il tuo nome.");
      return;
    }
    if (!cleanFeedback) {
      toast.error("Scrivi un feedback prima di inviare.");
      return;
    }

    setIsSubmitting(true);
    try {
      const status: PublicReviewStatus = rating <= 3 ? "critica" : "pubblicata";
      const localReview = {
        id: makeEntityId("site-review"),
        author: cleanAuthor,
        source: "Sito",
        rating,
        status,
        date: new Date().toISOString().slice(0, 10),
        project: project.trim() || "Feedback pubblico",
        text: cleanFeedback,
        aiReply:
          status === "critica"
            ? "Grazie per il feedback. Apriamo una verifica interna e ti contattiamo per capire come recuperare l'esperienza."
            : "Grazie per aver condiviso la tua esperienza. Il tuo feedback aiuta il team a migliorare ancora.",
        sentiment: status === "critica" ? "critico" : "positivo",
        campaignId: isUuid(campaignId) ? campaignId : null,
        orderId: isUuid(orderId) ? orderId : null,
        customerId: isUuid(customerId) ? customerId : null,
      };

      if (isUuid(storageCompanyId)) {
        try {
          const { error } = await reputationRpc("submit_public_reputation_review", {
            p_company_id: storageCompanyId,
            p_public_slug: publicSlug,
            p_campaign_id: isUuid(campaignId) ? campaignId : null,
            p_order_id: isUuid(orderId) ? orderId : null,
            p_customer_id: isUuid(customerId) ? customerId : null,
            p_author: cleanAuthor,
            p_rating: rating,
            p_project: project.trim() || "Feedback pubblico",
            p_body: cleanFeedback,
          });
          if (error) throw error;
        } catch (error) {
          if (!isSchemaFallbackError(error)) {
            console.warn("[public-review] Salvataggio Supabase non riuscito, uso cache locale", error);
          }
        }
      }

      appendLocalReview(storageCompanyId, localReview);

      setSubmittedStatus(status);
      toast.success("Feedback inviato");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setRating(0);
    setAuthor("");
    setProject(projectFromLink);
    setFeedback("");
    setSubmittedStatus(null);
  };

  if (submittedStatus) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <Card className="mx-auto max-w-xl">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Grazie per il feedback</CardTitle>
            <CardDescription>
              {submittedStatus === "critica"
                ? "Il team ricevera una segnalazione interna prima di chiedere una recensione pubblica."
                : "Il tuo feedback e stato registrato nella reputazione aziendale e potra essere trasformato in testimonianza."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert>
              <Star className="h-4 w-4" />
              <AlertTitle>Valutazione ricevuta</AlertTitle>
              <AlertDescription>
                Hai lasciato {rating} stelle. Puoi chiudere questa pagina.
              </AlertDescription>
            </Alert>
            {submittedStatus === "pubblicata" && (
              <Alert className="border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                <AlertTitle>Pronto per recensione pubblica</AlertTitle>
                <AlertDescription>
                  Quando l'azienda colleghera Google Business o Facebook, questo feedback potra aprire il link pubblico corretto.
                </AlertDescription>
              </Alert>
            )}
            <Button variant="outline" className="w-full" onClick={resetForm}>
              Invia un altro feedback
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge variant="outline" className="mb-3">
                Feedback cliente
              </Badge>
              <CardTitle className="text-2xl">Com'e andata l'esperienza?</CardTitle>
              <CardDescription className="mt-2">
                Racconta in pochi passaggi cosa e andato bene e cosa possiamo migliorare.
              </CardDescription>
            </div>
            <div className="rounded-lg border bg-white px-3 py-2 text-xs text-muted-foreground">
              Codice: {publicCode || "azienda"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <Label>Valutazione</Label>
            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-lg border bg-white transition",
                    value <= rating ? "border-amber-300 bg-amber-50 text-amber-500" : "text-slate-300 hover:border-slate-300",
                  )}
                  aria-label={`${value} stelle`}
                >
                  <Star className={cn("h-5 w-5", value <= rating && "fill-amber-400")} />
                </button>
              ))}
              <span className="text-sm font-medium text-slate-700">{ratingLabel}</span>
            </div>
          </div>

          {rating > 0 && rating <= 3 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <AlertTitle>Ci teniamo a recuperare</AlertTitle>
              <AlertDescription>
                Il feedback critico viene inviato al team come segnalazione interna, prima di qualsiasi richiesta di recensione pubblica.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="review-author">Nome</Label>
              <Input
                id="review-author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Mario Rossi"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-project">Lavoro o intervento</Label>
              <Input
                id="review-project"
                value={project}
                onChange={(event) => setProject(event.target.value)}
                placeholder="Es. sostituzione infissi"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-feedback">Feedback</Label>
            <Textarea
              id="review-feedback"
              rows={5}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Scrivi qui la tua esperienza..."
            />
          </div>

          <Button className="w-full sm:w-auto" onClick={submitReview} disabled={isSubmitting}>
            <Send className="mr-2 h-4 w-4" />
            {isSubmitting ? "Invio..." : "Invia feedback"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

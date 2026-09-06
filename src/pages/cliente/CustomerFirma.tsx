import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSignature, Clock, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Firma documenti — portale cliente.
 *
 * Questa pagina leggeva "order_signature_requests", una tabella mai esistita:
 * l'errore veniva ingoiato e al cliente compariva sempre "Nessun documento da
 * firmare", anche con richieste in attesa. La tabella vera e' signature_requests.
 *
 * Qui si ELENCA soltanto. La firma resta sulla pagina pubblica /firma/<token>,
 * che e' quella con valore legale (consenso, OTP, IP, hash del documento):
 * duplicarla qui con una tela da disegno avrebbe prodotto firme piu' deboli.
 *
 * L'ambito e' garantito dalla RLS customer_view_own_signature_requests (sola
 * lettura, richieste indirizzate alla propria email): nessun filtro per utente
 * serve nel codice.
 */

interface SignatureRequest {
  id: string;
  token: string;
  status: string;
  signer_name: string | null;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
  tipo_documento: string | null;
  note: string | null;
  order: { order_code: string | null; description: string | null } | null;
}

/** Una richiesta e' scaduta anche se lo stato non e' stato ancora aggiornato. */
function isScaduta(r: SignatureRequest): boolean {
  if (r.status === "signed") return false;
  if (r.status === "expired" || r.status === "cancelled") return true;
  return !!r.expires_at && new Date(r.expires_at) < new Date();
}

function statusBadge(r: SignatureRequest) {
  if (r.status === "signed") {
    return (
      <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50">
        <CheckCircle2 className="h-3 w-3" /> Firmato
      </Badge>
    );
  }
  if (r.status === "refused") {
    return (
      <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50">
        <AlertCircle className="h-3 w-3" /> Rifiutato
      </Badge>
    );
  }
  if (isScaduta(r)) {
    return (
      <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50">
        <AlertCircle className="h-3 w-3" /> {r.status === "cancelled" ? "Annullato" : "Scaduto"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
      <Clock className="h-3 w-3" /> Da firmare
    </Badge>
  );
}

/** Titolo leggibile: la commessa se c'e', altrimenti il tipo di documento. */
function titoloRichiesta(r: SignatureRequest): string {
  if (r.order?.order_code) return r.order.order_code;
  if (r.tipo_documento === "order") return "Documento di commessa";
  if (r.tipo_documento === "quote") return "Preventivo";
  return "Documento da firmare";
}

export default function CustomerFirma() {
  const { user } = useAuth();

  const { data: requests = [], isLoading, isError } = useQuery({
    queryKey: ["customer-signature-requests", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<SignatureRequest[]> => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select(
          "id, token, status, signer_name, signed_at, expires_at, created_at, tipo_documento, note, " +
            "order:orders!signature_requests_order_id_fkey(order_code, description)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as SignatureRequest[];
    },
  });

  const daFirmare = requests.filter((r) => r.status !== "signed" && r.status !== "refused" && !isScaduta(r));
  const firmate = requests.filter((r) => r.status === "signed");
  const altre = requests.filter(
    (r) => !daFirmare.includes(r) && !firmate.includes(r),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Firma Documenti</h1>
        <p className="text-muted-foreground">
          Qui trovi i documenti che ti sono stati inviati da firmare.
        </p>
      </div>

      {/* Errore esplicito: meglio dirlo che fingere che non ci sia nulla */}
      {isError && (
        <Card className="border-red-200">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
            <h3 className="text-lg font-medium">Non riusciamo a caricare i documenti</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Riprova tra qualche istante. Se hai ricevuto un'email con il link di firma,
              puoi firmare direttamente da lì.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Da firmare */}
      {daFirmare.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Da firmare ({daFirmare.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {daFirmare.map((r) => (
              <Card key={r.id} className="border-amber-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{titoloRichiesta(r)}</CardTitle>
                    {statusBadge(r)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(r.order?.description || r.note) && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {r.order?.description || r.note}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Richiesta il {format(new Date(r.created_at), "d MMMM yyyy", { locale: it })}</p>
                    {r.expires_at && (
                      <p>Da firmare entro il {format(new Date(r.expires_at), "d MMMM yyyy", { locale: it })}</p>
                    )}
                  </div>
                  {/* La firma avviene sulla pagina FEA, con consenso e codice OTP */}
                  <Button asChild className="w-full gap-2">
                    <a href={`/firma-fea/${r.token}`}>
                      <FileSignature className="h-4 w-4" />
                      Vai alla firma
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Firmati */}
      {firmate.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Firmati ({firmate.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {firmate.map((r) => (
              <Card key={r.id} className="border-green-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{titoloRichiesta(r)}</CardTitle>
                    {statusBadge(r)}
                  </div>
                </CardHeader>
                <CardContent>
                  {r.signed_at && (
                    <p className="text-xs text-muted-foreground">
                      Firmato il {format(new Date(r.signed_at), "d MMMM yyyy 'alle' HH:mm", { locale: it })}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Scaduti / annullati / rifiutati */}
      {altre.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Altro ({altre.length})</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {altre.map((r) => (
              <Card key={r.id} className="opacity-70">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{titoloRichiesta(r)}</CardTitle>
                    {statusBadge(r)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {r.order?.description || r.note || "—"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Vuoto — solo se la query è andata a buon fine */}
      {!isError && requests.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileSignature className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium">Nessun documento da firmare</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Quando la tua impresa ti invierà un documento da firmare lo troverai qui,
              e riceverai anche un'email con il link.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

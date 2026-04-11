import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FirmaDigitaleCanvas } from "@/components/firma/FirmaDigitaleCanvas";
import { FileSignature, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface SignatureRequest {
  id: string;
  order_id: string;
  company_id: string;
  signer_email: string;
  signer_name: string;
  token: string;
  status: string;
  signature_url: string | null;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
  orders: {
    id: string;
    description: string;
    order_code: string;
  };
}

export default function CustomerFirma() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const [signingRequest, setSigningRequest] = useState<SignatureRequest | null>(null);

  const customerId = profile?.id;
  const companyId = company?.id;

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["customer-signature-requests", customerId],
    queryFn: async () => {
      if (!customerId || !companyId) return [];

      const { data, error } = await supabase
        .from("order_signature_requests")
        .select(`
          *,
          orders!inner(id, description, order_code)
        `)
        .eq("orders.customer_id", customerId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as SignatureRequest[];
    },
    enabled: !!customerId && !!companyId,
  });

  const signMutation = useMutation({
    mutationFn: async ({
      requestId,
      dataUrl,
    }: {
      requestId: string;
      dataUrl: string;
    }) => {
      // Convert data URL to blob
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const fileName = `signatures/${companyId}/${requestId}_${Date.now()}.png`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(fileName, blob, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("signatures").getPublicUrl(fileName);

      // Update request status
      const { error: updateError } = await supabase
        .from("order_signature_requests")
        .update({
          status: "signed",
          signature_url: publicUrl,
          signed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      return publicUrl;
    },
    onSuccess: () => {
      toast.success("Documento firmato con successo!");
      setSigningRequest(null);
      queryClient.invalidateQueries({
        queryKey: ["customer-signature-requests"],
      });
    },
    onError: (err: Error) => {
      toast.error("Errore durante la firma: " + err.message);
    },
  });

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const signedRequests = requests.filter((r) => r.status === "signed");
  const otherRequests = requests.filter(
    (r) => r.status !== "pending" && r.status !== "signed"
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50">
            <Clock className="h-3 w-3" />
            In attesa
          </Badge>
        );
      case "signed":
        return (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-300 bg-green-50">
            <CheckCircle2 className="h-3 w-3" />
            Firmato
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="gap-1 text-red-600 border-red-300 bg-red-50">
            <AlertCircle className="h-3 w-3" />
            Scaduto
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="gap-1 text-gray-500 border-gray-300 bg-gray-50">
            Annullato
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const signerFullName =
    profile?.first_name && profile?.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : undefined;

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
          Visualizza e firma i documenti che richiedono la tua approvazione.
        </p>
      </div>

      {/* Pending signatures */}
      {pendingRequests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Da firmare ({pendingRequests.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {pendingRequests.map((req) => (
              <Card key={req.id} className="border-amber-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">
                      {req.orders.order_code}
                    </CardTitle>
                    {statusBadge(req.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {req.orders.description || "Nessuna descrizione"}
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Richiesta il{" "}
                      {format(new Date(req.created_at), "d MMMM yyyy", {
                        locale: it,
                      })}
                    </p>
                    {req.expires_at && (
                      <p>
                        Scade il{" "}
                        {format(new Date(req.expires_at), "d MMMM yyyy", {
                          locale: it,
                        })}
                      </p>
                    )}
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={() => setSigningRequest(req)}
                  >
                    <FileSignature className="h-4 w-4" />
                    Firma
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Already signed */}
      {signedRequests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Firmati ({signedRequests.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {signedRequests.map((req) => (
              <Card key={req.id} className="border-green-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">
                      {req.orders.order_code}
                    </CardTitle>
                    {statusBadge(req.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {req.orders.description || "Nessuna descrizione"}
                  </p>
                  {req.signed_at && (
                    <p className="text-xs text-muted-foreground">
                      Firmato il{" "}
                      {format(new Date(req.signed_at), "d MMMM yyyy 'alle' HH:mm", {
                        locale: it,
                      })}
                    </p>
                  )}
                  {req.signature_url && (
                    <div className="border rounded-md p-2 bg-white">
                      <img
                        src={req.signature_url}
                        alt="Firma"
                        className="max-h-20 mx-auto"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Expired / Cancelled */}
      {otherRequests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Altro ({otherRequests.length})</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {otherRequests.map((req) => (
              <Card key={req.id} className="opacity-70">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">
                      {req.orders.order_code}
                    </CardTitle>
                    {statusBadge(req.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {req.orders.description || "Nessuna descrizione"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {requests.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileSignature className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium">Nessun documento da firmare</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Non ci sono richieste di firma al momento.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Signature dialog */}
      <Dialog
        open={!!signingRequest}
        onOpenChange={(open) => {
          if (!open) setSigningRequest(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Firma documento - {signingRequest?.orders.order_code}
            </DialogTitle>
          </DialogHeader>
          {signingRequest && (
            <FirmaDigitaleCanvas
              onFirmaCompleta={(dataUrl) =>
                signMutation.mutate({
                  requestId: signingRequest.id,
                  dataUrl,
                })
              }
              onAnnulla={() => setSigningRequest(null)}
              nomeTecnico={signerFullName}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PenTool, Send, CheckCircle2, Clock, XCircle, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  pending: { label: "In attesa", variant: "outline", icon: <Clock className="h-3 w-3" /> },
  signed: { label: "Firmato", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
  expired: { label: "Scaduto", variant: "secondary", icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: "Annullato", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
};

interface OrderSignatureCardProps {
  orderId: string;
  customerEmail?: string;
  customerName?: string;
}

export function OrderSignatureCard({ orderId, customerEmail, customerName }: OrderSignatureCardProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState(customerEmail || "");
  const [name, setName] = useState(customerName || "");

  const { data: signatures = [], isLoading } = useQuery({
    queryKey: ["signature-requests", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select("id, token, signer_email, signer_name, status, signed_at, created_at, expires_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-signature-token", {
        body: { order_id: orderId, signer_email: email, signer_name: name },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Richiesta di firma creata");
      qc.invalidateQueries({ queryKey: ["signature-requests", orderId] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Errore nella creazione"),
  });

  const getSignUrl = (token: string) => {
    return `${window.location.origin}/firma/${token}`;
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(getSignUrl(token));
    toast.success("Link copiato negli appunti");
  };

  const latestSigned = signatures.find(s => s.status === "signed");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <PenTool className="h-5 w-5" />
          Firma Digitale
        </CardTitle>
        <Button size="sm" onClick={() => { setEmail(customerEmail || ""); setName(customerName || ""); setDialogOpen(true); }}>
          <Send className="h-4 w-4 mr-1" /> Richiedi firma
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : signatures.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna richiesta di firma inviata</p>
        ) : (
          <div className="space-y-3">
            {signatures.map((sig) => {
              const statusInfo = STATUS_MAP[sig.status] || STATUS_MAP.pending;
              return (
                <div key={sig.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{sig.signer_name || sig.signer_email}</span>
                      <Badge variant={statusInfo.variant} className="gap-1">
                        {statusInfo.icon} {statusInfo.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {sig.signer_email} · {format(new Date(sig.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      {sig.signed_at && ` · Firmato: ${format(new Date(sig.signed_at), "dd MMM yyyy HH:mm", { locale: it })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {sig.status === "pending" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(sig.token)} title="Copia link">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(getSignUrl(sig.token), "_blank")} title="Apri link">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {latestSigned && (latestSigned as any).signature_data && (
          <div className="mt-4 border rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-2">Ultima firma:</p>
            <img src={(latestSigned as any).signature_data} alt="Firma" className="max-h-24 mx-auto" />
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Richiedi firma digitale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email destinatario</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@esempio.com" type="email" />
            </div>
            <div>
              <Label>Nome firmatario (opzionale)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome e cognome" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!email.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creazione..." : "Crea richiesta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, ExternalLink, Phone, Send, CheckCheck, Loader2, Plus } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  verified: { label: "Verificato", variant: "default" },
  pending: { label: "In sospeso", variant: "secondary" },
  not_verified: { label: "Non verificato", variant: "outline" },
};

const QUALITY_MAP: Record<string, { label: string; className: string }> = {
  green: { label: "Alta", className: "text-emerald-600" },
  yellow: { label: "Media", className: "text-amber-600" },
  red: { label: "Bassa", className: "text-destructive" },
  none: { label: "Nessuno", className: "text-muted-foreground" },
};

export function MessagingSettingsTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp-config", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("messaging_whatsapp_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const handleConnectWhatsApp = () => {
    window.open(
      "https://business.facebook.com/latest/whatsapp_manager/phone_numbers/",
      "_blank",
      "noopener,noreferrer"
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasConfig = !!config;
  const accountStatus = config?.account_status || "not_verified";
  const qualityRating = config?.quality_rating || "none";
  const statusInfo = STATUS_MAP[accountStatus] || STATUS_MAP.not_verified;
  const qualityInfo = QUALITY_MAP[qualityRating] || QUALITY_MAP.none;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Verification banner */}
      {accountStatus !== "verified" && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-4 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">Verifica di WhatsApp Business in sospeso</p>
              <p className="text-xs text-muted-foreground mt-1">
                Costruisci fiducia con i tuoi clienti mostrando un nome verificato. Completa la verifica del tuo account Meta Business per sbloccare tutte le funzionalità.
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={handleConnectWhatsApp}>
              Verifica ora
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Account overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center">
              <Phone className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp Business</CardTitle>
              <CardDescription>
                {hasConfig ? config.business_name || effectiveCompany?.name : effectiveCompany?.name}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status row */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Stato dell'account:</span>
              <Badge variant={statusInfo.variant}>
                {accountStatus === "verified" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {statusInfo.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Verifica Meta Business:</span>
              <Badge variant={accountStatus === "verified" ? "default" : "outline"}>
                {accountStatus === "verified" ? "Completata" : "In sospeso"}
              </Badge>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Send className="h-4 w-4" />
                  <span className="text-xs">Messaggi inviati (7gg)</span>
                </div>
                <p className="text-2xl font-bold">—</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckCheck className="h-4 w-4" />
                  <span className="text-xs">Messaggi consegnati (7gg)</span>
                </div>
                <p className="text-2xl font-bold">—</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Phone numbers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Numeri di telefono</CardTitle>
              <CardDescription>
                {hasConfig && config.phone_number ? "1 Numero collegato" : "Nessun numero collegato"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {hasConfig && config.phone_number ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Limite</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Qualità</TableHead>
                  <TableHead className="text-right">Attività</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">{config.phone_number}</TableCell>
                  <TableCell>{config.business_name || "—"}</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>
                    <Badge variant={config.is_connected ? "default" : "outline"}>
                      {config.is_connected ? "Collegato" : "Disconnesso"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={qualityInfo.className}>{qualityInfo.label}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={handleConnectWhatsApp} className="gap-1">
                      Gestisci
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm mb-4">Collega il tuo numero WhatsApp Business per iniziare a ricevere e inviare messaggi.</p>
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <Button onClick={handleConnectWhatsApp} className="gap-2">
              <Plus className="h-4 w-4" />
              Collega numero WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

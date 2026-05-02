/**
 * Documenti dipendente — lista sola lettura con badge scadenza.
 * Mostra documenti_dipendenti per l'utente loggato.
 */
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  FileText, AlertTriangle, CheckCircle, Clock,
  Download, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const PRIVATE_DOC_BUCKET = "documenti-dipendenti";

const TIPO_LABELS: Record<string, string> = {
  contratto: "Contratto",
  documento_identita: "Documento d'identità",
  certificazione: "Certificazione",
  corso_sicurezza: "Corso sicurezza",
  visita_medica: "Visita medica",
  patente: "Patente",
  altro: "Altro",
};

export default function CampoDocumenti() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: documenti = [], isLoading } = useQuery({
    queryKey: ["campo-documenti", companyId, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("documenti_dipendenti")
        .select("*")
        .eq("user_id", user!.id)
        .eq("company_id", companyId)
        .order("data_scadenza", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
  });

  const today = new Date();

  const getScadenzaStatus = (dataScadenza: string | null) => {
    if (!dataScadenza) return "nessuna";
    const scad = parseISO(dataScadenza);
    const diff = differenceInDays(scad, today);
    if (diff < 0) return "scaduto";
    if (diff <= 30) return "in_scadenza";
    return "valido";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const scadutiCount = documenti.filter(
    (d: any) => getScadenzaStatus(d.data_scadenza) === "scaduto"
  ).length;
  const inScadenzaCount = documenti.filter(
    (d: any) => getScadenzaStatus(d.data_scadenza) === "in_scadenza"
  ).length;

  const openDocumento = async (url: string) => {
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const { data, error } = await supabase.storage
      .from(PRIVATE_DOC_BUCKET)
      .createSignedUrl(url, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error("Impossibile aprire il documento");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 pb-24 space-y-4">

      {/* Alert scadenze */}
      {scadutiCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-500/30 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs text-red-600">
            {scadutiCount} document{scadutiCount > 1 ? "i" : "o"} scadut{scadutiCount > 1 ? "i" : "o"} — contatta l'ufficio
          </p>
        </div>
      )}
      {inScadenzaCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-primary">
            {inScadenzaCount} document{inScadenzaCount > 1 ? "i" : "o"} in scadenza entro 30 giorni
          </p>
        </div>
      )}

      {documenti.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <FileText className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Nessun documento disponibile</p>
          <p className="text-muted-foreground text-xs">I tuoi documenti caricati dall'ufficio appariranno qui</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documenti.map((doc: any) => {
            const status = getScadenzaStatus(doc.data_scadenza);
            return (
              <div
                key={doc.id}
                className={cn(
                  "bg-muted border rounded-2xl p-4",
                  status === "scaduto" ? "border-red-500/30" :
                  status === "in_scadenza" ? "border-primary/30" :
                  "border-border"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {doc.nome_file || TIPO_LABELS[doc.tipo] || doc.tipo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {TIPO_LABELS[doc.tipo] || doc.tipo}
                      </p>
                    </div>
                  </div>

                  {/* Scadenza badge */}
                  {status === "scaduto" && (
                    <span className="flex items-center gap-1 text-[10px] bg-red-500/20 text-red-600 border border-red-500/20 rounded-full px-2 py-0.5 shrink-0">
                      <AlertTriangle className="w-3 h-3" />
                      Scaduto
                    </span>
                  )}
                  {status === "in_scadenza" && (
                    <span className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 shrink-0">
                      <Clock className="w-3 h-3" />
                      In scadenza
                    </span>
                  )}
                  {status === "valido" && (
                    <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-600 border border-green-500/20 rounded-full px-2 py-0.5 shrink-0">
                      <CheckCircle className="w-3 h-3" />
                      Valido
                    </span>
                  )}
                </div>

                {doc.data_scadenza && (
                  <p className="text-xs text-muted-foreground mt-1 ml-12">
                    Scadenza: {format(parseISO(doc.data_scadenza), "d MMMM yyyy", { locale: it })}
                    {status === "in_scadenza" && (
                      <span className="text-primary ml-1">
                        (tra {differenceInDays(parseISO(doc.data_scadenza), today)} giorni)
                      </span>
                    )}
                  </p>
                )}

                {doc.url && (
                  <button
                    onClick={() => openDocumento(doc.url)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-primary ml-12"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Visualizza documento
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

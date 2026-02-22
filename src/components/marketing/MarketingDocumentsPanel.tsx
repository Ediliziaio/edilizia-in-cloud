import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Trash2, File, Image, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  contactId: string;
  opportunityId?: string;
  companyId: string;
  /** If true, uploads will be linked to the opportunityId */
  linkToOpportunity?: boolean;
  compact?: boolean;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (type.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MarketingDocumentsPanel({ contactId, opportunityId, companyId, linkToOpportunity, compact }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryKey = opportunityId
    ? ["marketing_documents", contactId, opportunityId]
    : ["marketing_documents", contactId];

  const { data: documents = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("marketing_documents" as any)
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      // Don't filter by opportunity - show all contact docs
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!contactId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: globalThis.File) => {
      const fileExt = file.name.split(".").pop();
      const filePath = `${companyId}/${contactId}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("marketing-attachments")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("marketing-attachments")
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase.from("marketing_documents" as any).insert({
        contact_id: contactId,
        opportunity_id: linkToOpportunity ? opportunityId : null,
        company_id: companyId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user?.id,
      });
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_documents"] });
      toast.success("Documento caricato");
    },
    onError: (e: any) => toast.error(e.message || "Errore upload"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      // Extract path from URL
      const url = new URL(doc.file_url);
      const pathParts = url.pathname.split("/storage/v1/object/public/marketing-attachments/");
      if (pathParts[1]) {
        await supabase.storage.from("marketing-attachments").remove([pathParts[1]]);
      }
      const { error } = await supabase.from("marketing_documents" as any).delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_documents"] });
      toast.success("Documento eliminato");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => uploadMutation.mutate(file));
    e.target.value = "";
  };

  const textSize = compact ? "text-[11px]" : "text-sm";

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt"
        multiple
        onChange={handleFileChange}
      />

      <Button
        variant="outline"
        size="sm"
        className={`w-full gap-1.5 ${compact ? "h-7 text-[11px]" : "h-8 text-xs"}`}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
      >
        {uploadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Carica documento
      </Button>

      {isLoading ? (
        <p className={`${textSize} text-muted-foreground text-center py-4`}>Caricamento...</p>
      ) : documents.length === 0 ? (
        <p className={`${textSize} text-muted-foreground text-center py-6`}>Nessun documento</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc: any) => (
            <div key={doc.id} className="flex items-start gap-2 p-2 rounded-lg border bg-muted/20 group">
              {getFileIcon(doc.file_type)}
              <div className="flex-1 min-w-0">
                <p className={`${textSize} font-medium truncate`}>{doc.file_name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(doc.created_at), "dd MMM yyyy", { locale: it })}
                  </span>
                  {doc.opportunity_id && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">Opportunità</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => window.open(doc.file_url, "_blank")}
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={() => deleteMutation.mutate(doc)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

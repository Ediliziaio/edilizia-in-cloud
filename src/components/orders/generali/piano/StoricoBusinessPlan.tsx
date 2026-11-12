import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { Button } from "@/components/ui/button";
import { ATTACHMENTS_BUCKET } from "@/components/orders/filePreviewUtils";

interface Originale {
  id: string;
  file_name: string;
  file_url: string;
  created_at: string;
}
export function StoricoBusinessPlan({ generaleId, versioneId }: { generaleId: string; versioneId: string }) {
  const q = useQuery({
    queryKey: ["order-attachments", generaleId, "business-plan"],
    queryFn: () =>
      allPaymentRows<Originale>((a, b) =>
        supabase
          .from("order_attachments")
          .select("id,file_name,file_url,created_at")
          .eq("order_id", generaleId)
          .like("file_url", `${generaleId}/business-plan/%`)
          .order("id")
          .range(a, b),
      ),
  });
  const apri = async (r: Originale) => {
    const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(r.file_url);
    if (error) {
      toast.error("Originale non disponibile", { description: error.message });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.file_name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Originali e storico importazioni ({q.data?.length ?? 0})
      </summary>
      {q.isError && (
        <p role="alert">
          Archivio non disponibile.{" "}
          <Button variant="link" onClick={() => void q.refetch()}>
            Riprova
          </Button>
        </p>
      )}
      {q.data?.map((r) => (
        <div key={r.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div>
            <p>{r.file_name}</p>
            <p className="text-xs text-muted-foreground">
              {r.created_at.slice(0, 10)} ·{" "}
              {r.file_url.includes(`/${versioneId}/`) ? "Versione in vista" : "Altra versione"} · SHA-256{" "}
              {r.file_url.split("/").at(-1)?.slice(0, 12)}…
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void apri(r)}>
            Scarica originale
          </Button>
        </div>
      ))}
      {q.isSuccess && !q.data.length && (
        <p className="mt-2 text-muted-foreground">
          Nessun originale archiviato. La prossima importazione conserverà il file insieme alla sua
          versione; la provenienza delle righe resta nella nota.
        </p>
      )}
    </details>
  );
}

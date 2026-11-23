import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Apre il PDF del rapportino: quello già pronto, altrimenti lo genera. */
export function PulsantePdfRapportino({ report, orderId, className }: {
  report: { id: string; pdf_url?: string | null }; orderId: string; className?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const apri = useMutation({
    mutationFn: () => openRapportinoPdf(report, orderId, qc),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["commesse-rapportini"] }); },
    onError: (e: unknown) => { toast.error(e instanceof Error ? e.message : t("PDF non disponibile, riprova.")); },
  });
  return (
    <Button type="button" size="sm" variant="outline" className={className} disabled={apri.isPending} onClick={() => apri.mutate()}>
      {apri.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
      {t("Apri PDF")}
    </Button>
  );
}

/**
 * In Nuova Commessa: i materiali che non si scrivono a mano. Un computo già caricato
 * (o il file, dopo) si collega alla commessa e, appena creata, si apre «Genera dal
 * computo»: la commessa deve esistere perché i materiali vadano nelle sue fasi.
 */
import { useQuery } from "@tanstack/react-query";
import { FileText, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface ComputoDaCollegare {
  /** Null: il file si carica subito dopo la creazione (o si usa il computo del preventivo). */
  id: string | null;
  nome: string;
  /** Le voci vengono dal computo del preventivo: niente file da caricare. */
  dalPreventivo?: boolean;
}

/**
 * «Materiali con l'AI» (17/11/2026): appena creata la commessa si apre «Genera dal computo»,
 * che legge le voci (dal computo del preventivo, se c'è, o dal file), applica le scomposizioni
 * e fa proporre all'AI i materiali delle voci che le regole non riconoscono.
 */
export function PulsanteMaterialiAI({ quoteNumber, conComputo, onScegli }: { quoteNumber?: string | null; conComputo: boolean; onScegli: (c: ComputoDaCollegare) => void }) {
  const t = useT();
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5 border-violet-200 text-violet-800 hover:bg-violet-50"
      onClick={() => onScegli(conComputo
        ? { id: null, nome: `computo del preventivo${quoteNumber ? ` ${quoteNumber}` : ""}`, dalPreventivo: true }
        : { id: null, nome: "file da caricare" })}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden />{t("Materiali con l'AI")}
    </Button>
  );
}

export function PulsanteDalComputo({ companyId, onScegli }: { companyId: string | undefined; onScegli: (c: ComputoDaCollegare) => void }) {
  const t = useT();
  const { data: computi = [] } = useQuery({
    queryKey: ["computi-senza-commessa", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computo_uploads")
        .select("id, titolo, file_name, created_at")
        .eq("company_id", companyId!)
        .is("order_id", null)
        .in("extraction_status", ["review", "completed"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden />{t("Dal computo")}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(24rem,calc(100vw-2rem))]">
        {computi.length > 0 && <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("Computi non ancora collegati")}</DropdownMenuLabel>}
        {computi.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => onScegli({ id: c.id, nome: c.titolo || c.file_name })}>
            <span className="truncate">{c.titolo || c.file_name}</span>
          </DropdownMenuItem>
        ))}
        {computi.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => onScegli({ id: null, nome: "file da caricare" })}>{t("Carico il file dopo la creazione")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * «Lingua dell'app» nella scheda del dipendente (26/11/2026, richiesta del founder): chi assume l'operaio
 * gli imposta subito la lingua, senza che lui debba trovare la rotella e una scheda scritta in italiano.
 * Scrive `profiles.lingua`, la stessa scelta che l'operaio fa da Impostazioni › Lingua: vale su ogni
 * telefono con cui entra. La può cambiare il titolare (RLS «Company admins can manage profiles»); gli altri
 * la vedono e basta.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { LINGUE, linguaDa } from "@/lib/campo/lingua/lingue";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { usePermissions } from "@/hooks/usePermissions";

export function LinguaAppDipendente({ userId }: { userId: string }) {
  const t = useT();
  const permessi = usePermissions();
  const puoModificare = !permessi.isLoading && permessi.isAdmin && !permessi.solaLettura;
  const qc = useQueryClient();
  const chiave = ["lingua-app-dipendente", userId];
  const attuale = useQuery({
    queryKey: chiave,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("lingua").eq("id", userId).maybeSingle();
      if (error) throw error;
      return (data as { lingua: string | null } | null)?.lingua ?? null;
    },
  });
  const salva = useMutation({
    mutationFn: async (codice: string) => {
      const { data, error } = await supabase.from("profiles").update({ lingua: codice }).eq("id", userId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("nessuna riga");
    },
    onSuccess: (_d, codice) => {
      qc.setQueryData(chiave, codice);
      toast.success(t("Lingua dell'app salvata: {lingua}", { lingua: linguaDa(codice)?.nome ?? codice }));
    },
    onError: () => toast.error(t("Non sono riuscito a salvare la lingua. Solo il titolare può cambiarla.")),
  });
  const valore = linguaDa(attuale.data ?? undefined)?.codice ?? "it";

  return (
    <div className="col-span-2 rounded-md border px-3 py-2 max-sm:order-last">
      <Label htmlFor={`lingua-app-${userId}`} className="flex items-center gap-1.5">
        <Languages className="size-4 text-primary" aria-hidden="true" />{t("Lingua dell'app")}
      </Label>
      <p className="text-xs text-muted-foreground max-sm:hidden">
        {t("La lingua in cui vede l'app degli operai. Può cambiarla anche lui da Impostazioni › Lingua.")}
      </p>
      <select id={`lingua-app-${userId}`} value={valore} disabled={!puoModificare || attuale.isLoading || salva.isPending}
        onChange={e => salva.mutate(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70">
        {LINGUE.map(l => <option key={l.codice} value={l.codice}>{l.codice === "it" ? l.nome : `${l.nome} · ${l.nomeItaliano}`}</option>)}
      </select>
    </div>
  );
}

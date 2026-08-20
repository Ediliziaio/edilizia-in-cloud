/**
 * ListinoClienteCard — lo sconto dedicato di un contatto, sulla sua scheda.
 *
 * Un numero e una nota: "a questo cliente faccio il 12% perche' porta tre
 * cantieri l'anno". Il preventivatore lo propone quando selezioni il
 * contatto. Stessa struttura guscio+editor delle sorelle: niente setState
 * negli effect.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { ListinoCliente } from "@/hooks/useListinoCliente";

export function ListinoClienteCard({ contactId }: { contactId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["listino-cliente", contactId],
    queryFn: async (): Promise<ListinoCliente | null> => {
      // `as any`: tabella nuova (migration 20280202000000).
      const { data: row, error } = await (supabase as any)
        .from("listini_cliente")
        .select("id, sconto_globale_pct, attivo, note")
        .eq("contact_id", contactId)
        .maybeSingle();
      if (error) throw error;
      return (row as ListinoCliente) ?? null;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-xs">
        <Loader2 className="h-3 w-3 animate-spin" /> Carico…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>Tabella listino cliente non ancora attiva (migration da applicare).</span>
      </div>
    );
  }

  return (
    <ListinoClienteEditor
      key={`${contactId}:${data?.id ?? "nuovo"}`}
      contactId={contactId}
      esistente={data ?? null}
    />
  );
}

function ListinoClienteEditor({
  contactId,
  esistente,
}: {
  contactId: string;
  esistente: ListinoCliente | null;
}) {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const [sconto, setSconto] = useState(() => Number(esistente?.sconto_globale_pct ?? 0));
  const [attivo, setAttivo] = useState(() => esistente?.attivo ?? true);
  const [note, setNote] = useState(() => esistente?.note ?? "");

  const salva = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      const payload = {
        company_id: companyId,
        contact_id: contactId,
        sconto_globale_pct: sconto,
        attivo,
        note: note.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (esistente) {
        const { error } = await (supabase as any)
          .from("listini_cliente")
          .update(payload)
          .eq("id", esistente.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("listini_cliente")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listino-cliente", contactId] });
      toast.success("Listino cliente salvato", {
        description:
          attivo && sconto > 0
            ? `Il preventivatore proporra' lo sconto del ${sconto}% quando selezioni questo cliente.`
            : "Nessuno sconto attivo per questo cliente.",
      });
    },
    onError: (e: Error) => toast.error("Salvataggio non riuscito", { description: e.message }),
  });

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Sconto concordato</span>
        <div className="flex items-center gap-1">
          <Input
            type="number" min={0} max={100} step="0.5"
            value={sconto}
            onChange={(e) => setSconto(parseFloat(e.target.value) || 0)}
            className="h-7 w-16 text-right text-xs"
            aria-label="Sconto concordato %"
          />
          <span className="text-muted-foreground">%</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Attivo</span>
        <Switch checked={attivo} onCheckedChange={setAttivo} aria-label="Listino attivo" />
      </div>
      <Textarea
        placeholder="Perche' questo sconto (es. porta tre cantieri l'anno)…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="text-xs"
      />
      <div className="flex justify-end">
        <Button size="sm" className="h-7 text-xs" disabled={salva.isPending} onClick={() => salva.mutate()}>
          {salva.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Salva
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Quando crei un preventivo per questo cliente, lo sconto viene proposto
        — mai applicato da solo.
      </p>
    </div>
  );
}

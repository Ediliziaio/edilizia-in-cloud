/**
 * Assistente AI dei dipendenti (25/11/2026).
 *
 * «Un operaio che collega Claude non può fare tutto.» L'amministratore decide se
 * i dipendenti possono collegare il PROPRIO Claude o ChatGPT; quando lo fanno,
 * l'assistente lavora con i permessi del dipendente (server MCP,
 * platform-mcp/permessiStrumenti.ts) e non manda mai invii reali.
 *
 * - InterruttoreDipendenti: nel connettore AI di Integrazioni, per l'amministratore.
 * - AssistenteAiPersonale: nel profilo del dipendente (istruzioni, i suoi collegamenti, revoca).
 *
 * Testi solo in italiano, per ora: il file non è ancora nei blocchi tradotti dell'ufficio.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Sparkles, Unlink, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { MCP_ENDPOINT, assistenteDelClient } from "@/lib/aiConnector";

// Colonna e funzioni nuove: non ancora nei tipi generati.
type ClientLibero = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        is: (k: string, v: null) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      };
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};
const db = supabase as unknown as ClientLibero;

const RUOLI_DIPENDENTI = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];

function useAziendaCorrente() {
  const { effectiveCompany, profile, role, user } = useAuth();
  return {
    companyId: effectiveCompany?.id ?? profile?.company_id ?? undefined,
    amministratore: role === "company_admin" || role === "super_admin",
    dipendente: !!role && RUOLI_DIPENDENTI.includes(role),
    userId: user?.id,
  };
}

function useDipendentiAmmessi(companyId: string | undefined) {
  return useQuery({
    queryKey: ["ai-connettore-dipendenti", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db.from("companies").select("ai_connettore_dipendenti").eq("id", companyId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.ai_connettore_dipendenti === true;
    },
    staleTime: 60 * 1000,
  });
}

/** Per l'amministratore: permettere ai dipendenti di collegare il proprio assistente. */
export function InterruttoreDipendenti() {
  const { companyId, amministratore } = useAziendaCorrente();
  const qc = useQueryClient();
  const { data: attivo = false, isLoading } = useDipendentiAmmessi(companyId);
  const cambia = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await db.rpc("azienda_ai_connettore_dipendenti", { p_company_id: companyId, p_attivo: v });
      if (error) throw new Error(error.message);
      return v;
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["ai-connettore-dipendenti", companyId] });
      qc.invalidateQueries({ queryKey: ["oauth-grants", companyId] });
      toast.success(v ? "I dipendenti possono collegare il proprio assistente" : "Collegamenti dei dipendenti chiusi");
    },
    onError: (e: Error) => toast.error("Impostazione non salvata", { description: e.message }),
  });
  if (!amministratore || !companyId) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border p-3">
      <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Anche i dipendenti possono collegare il proprio assistente</p>
        <p className="text-xs text-muted-foreground">
          Ognuno dal suo profilo. L'assistente fa solo ciò che quel dipendente può fare nel gestionale (i suoi
          permessi) e non manda email o messaggi veri. Se lo spegni, i loro collegamenti si chiudono subito.
        </p>
      </div>
      <Switch
        checked={attivo}
        disabled={isLoading || cambia.isPending}
        onCheckedChange={(v) => cambia.mutate(v)}
        aria-label="Permetti ai dipendenti di collegare il proprio assistente"
      />
    </div>
  );
}

interface MioCollegamento { id: string; client_name: string | null; livello: string; last_used_at: string | null }

/** Nel profilo: il dipendente collega il suo Claude/ChatGPT e vede/revoca i suoi collegamenti. */
export function AssistenteAiPersonale() {
  const { companyId, amministratore, dipendente, userId } = useAziendaCorrente();
  const qc = useQueryClient();
  const [copiato, setCopiato] = useState(false);
  const { data: ammessi = false } = useDipendentiAmmessi(dipendente ? companyId : undefined);
  const { data: miei = [] } = useQuery({
    queryKey: ["miei-collegamenti-ai", userId, companyId],
    enabled: !!userId && !!companyId && dipendente,
    queryFn: async () => {
      const { data, error } = await db.from("mcp_oauth_grants")
        .select("id, client_name, livello, last_used_at").eq("user_id", userId!).is("revoked_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MioCollegamento[];
    },
  });
  const revoca = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("mcp_revoca_collegamento", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["miei-collegamenti-ai"] });
      toast.success("Collegamento revocato");
    },
    onError: (e: Error) => toast.error("Revoca non riuscita", { description: e.message }),
  });

  // Gli amministratori lo gestiscono da Integrazioni.
  if (amministratore || !dipendente || !companyId) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Il tuo assistente AI (Claude o ChatGPT)</p>
        </div>
        {!ammessi ? (
          <p className="text-xs text-muted-foreground">
            La tua azienda non ha ancora permesso ai dipendenti di collegare il proprio assistente. Chiedilo
            all'amministratore: lo attiva da Impostazioni → Integrazioni → Claude.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              In Claude (Impostazioni → Connettori → «Aggiungi connettore personalizzato») o in ChatGPT (Modalità
              sviluppatore → Connettori) aggiungi questo indirizzo ed entra con il tuo account. L'assistente potrà fare
              solo ciò che puoi fare tu qui dentro.
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{MCP_ENDPOINT}</code>
              <Button
                size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(MCP_ENDPOINT);
                  setCopiato(true);
                  setTimeout(() => setCopiato(false), 1500);
                }}
              >
                {copiato ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiato ? "Copiato" : "Copia"}
              </Button>
            </div>
          </>
        )}
        {miei.length > 0 && (
          <ul className="divide-y rounded-md border">
            {miei.map((g) => (
              <li key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{g.client_name ?? (assistenteDelClient(g.client_name) ?? "Assistente")}</span>
                <span className="text-xs text-muted-foreground">
                  {g.livello === "operativo" ? "Operativo" : "Consulente"} ·{" "}
                  {g.last_used_at ? `usato il ${new Date(g.last_used_at).toLocaleDateString("it-IT")}` : "mai usato"}
                </span>
                <Button
                  size="sm" variant="ghost" className="ml-auto h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                  disabled={revoca.isPending}
                  onClick={() => revoca.mutate(g.id)}
                >
                  {revoca.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Revoca
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Assistenti AI collegati all'area superadmin (25/11/2026).
 *
 * «Devo poter collegare Claude e ChatGPT, ma con il potere di agire nell'area
 * del superadmin: statistiche, email, CRM, gestionale, creare aziende,
 * modificare i piani.» Il server MCP è lo stesso delle aziende (platform-mcp);
 * cambia l'ambito del consenso: sulla pagina di consenso il super admin sceglie
 * «Area superadmin» e il server gli dà gli strumenti di piattaforma.
 *
 * Qui: come collegare, chi è collegato (con revoca) e le ultime azioni.
 * I collegamenti li legge admin_mcp_collegamenti (solo i propri, solo super admin).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Crown, ExternalLink, KeyRound, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChatGptLogo, ClaudeLogo } from "@/components/integrations/brand-logos";
import {
  MCP_ENDPOINT, PASSI_CHATGPT, PASSI_CLAUDE_CONNETTORE, assistenteDelClient, statoCollegamentoAi,
  type AssistenteAi,
} from "@/lib/aiConnector";
import { cn } from "@/lib/utils";

export interface CollegamentoAi {
  id: string;
  client_id: string;
  client_name: string | null;
  ambito: "azienda" | "piattaforma" | string;
  company_id: string | null;
  company_name: string | null;
  livello: string;
  invii: boolean;
  created_at: string;
  last_used_at: string | null;
  chiamate_24h: number;
  errori_24h: number;
}

interface AzioneAi {
  created_at: string;
  strumento: string;
  esito: number;
  durata_ms: number | null;
  collegamento: string;
  azienda: string | null;
}

// Le RPC nuove non sono ancora nei tipi generati.
type RpcLibera = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const rpc = supabase as unknown as RpcLibera;
type UntypedFrom = { from: (t: string) => any };

const CHIAVE = ["admin", "assistenti-ai"] as const;

const ASSISTENTI: { id: AssistenteAi; nome: string; Logo: typeof ClaudeLogo; passi: string[] }[] = [
  { id: "claude", nome: "Claude", Logo: ClaudeLogo, passi: PASSI_CLAUDE_CONNETTORE },
  { id: "chatgpt", nome: "ChatGPT", Logo: ChatGptLogo, passi: PASSI_CHATGPT },
];

function quando(iso: string | null): string {
  if (!iso) return "mai";
  const d = new Date(iso);
  const minuti = Math.round((Date.now() - d.getTime()) / 60000);
  if (minuti < 1) return "adesso";
  if (minuti < 60) return `${minuti} min fa`;
  if (minuti < 24 * 60) return `${Math.round(minuti / 60)} h fa`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function useCollegamentiAi() {
  return useQuery({
    queryKey: [...CHIAVE, "collegamenti"],
    queryFn: async (): Promise<CollegamentoAi[]> => {
      const { data, error } = await rpc.rpc("admin_mcp_collegamenti");
      if (error) throw new Error(error.message);
      return (data ?? []) as CollegamentoAi[];
    },
    staleTime: 30 * 1000,
  });
}

function useUltimeAzioni() {
  return useQuery({
    queryKey: [...CHIAVE, "azioni"],
    queryFn: async (): Promise<AzioneAi[]> => {
      const { data, error } = await rpc.rpc("admin_mcp_ultime_azioni", { p_limite: 12 });
      if (error) throw new Error(error.message);
      return (data ?? []) as AzioneAi[];
    },
    staleTime: 30 * 1000,
  });
}

function useRevoca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: CollegamentoAi) => {
      const { data, error } = await (supabase as unknown as UntypedFrom)
        .from("mcp_oauth_grants")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", c.id).is("revoked_at", null)
        .select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Collegamento non trovato o già revocato");
      // Senza questo, al prossimo collegamento Supabase salterebbe la pagina di
      // consenso e non si potrebbe scegliere di nuovo dove lavora l'assistente.
      const { error: errProvider } = await supabase.auth.oauth.revokeGrant({ clientId: c.client_id }).catch(
        (e: unknown) => ({ error: e as Error }),
      );
      return { consensoProvider: !errProvider };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      toast.success("Collegamento revocato", {
        description: r.consensoProvider ? undefined : "Se l'assistente si ricollega da solo, rimuovi il connettore anche dalle sue impostazioni.",
      });
    },
    onError: (e: Error) => toast.error("Revoca non riuscita", { description: e.message }),
  });
}

function CopiaUrl() {
  const [copiato, setCopiato] = useState(false);
  return (
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
        {copiato ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copiato ? "Copiato" : "Copia"}
      </Button>
    </div>
  );
}

function PannelloCollega({ assistente, onClose }: { assistente: (typeof ASSISTENTI)[number] | null; onClose: () => void }) {
  return (
    <Sheet open={!!assistente} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {assistente && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <assistente.Logo className="h-5 w-5" /> Collega {assistente.nome}
              </SheetTitle>
              <SheetDescription>
                Al momento del consenso scegli <strong>«Area superadmin»</strong>: l'assistente lavora sulla
                piattaforma, non su un'azienda.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">URL del server</p>
                <CopiaUrl />
              </div>
              <ol className="space-y-2 text-sm">
                {assistente.passi.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{p.replace("scegli azienda e livello", "scegli «Area superadmin» e il livello")}</span>
                  </li>
                ))}
              </ol>
              <div className="rounded-md border bg-amber-50/60 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                Se {assistente.nome} era già collegato a un'azienda, revoca prima quel collegamento qui sotto: altrimenti
                il consenso viene saltato e resta legato all'azienda.
              </div>
              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Livelli</p>
                <p className="mt-1"><strong>Consulente</strong>: statistiche, MRR, insoluti, aziende, piani, salute, registro, CRM e gestionale. Non cambia niente.</p>
                <p className="mt-1"><strong>Operativo</strong>: in più crea aziende, cambia stato, prova e piano, regala piani, aggiunge crediti, lavora nel CRM. Ogni azione chiede conferma.</p>
                <p className="mt-1"><strong>Invii reali</strong>: spunta a parte, per mandare email vere.</p>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function AdminAssistentiAi() {
  const { data: collegamenti = [], isLoading, error } = useCollegamentiAi();
  const { data: azioni = [] } = useUltimeAzioni();
  const revoca = useRevoca();
  const [aperto, setAperto] = useState<(typeof ASSISTENTI)[number] | null>(null);
  const [daRevocare, setDaRevocare] = useState<CollegamentoAi | null>(null);
  const diPiattaforma = collegamenti.filter((c) => c.ambito === "piattaforma");

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ASSISTENTI.map((a) => {
            const stato = statoCollegamentoAi(a.id, diPiattaforma, []);
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
                <a.Logo className="h-7 w-7 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{a.nome}</span>
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        stato.status === "connected" ? "bg-emerald-500" : stato.status === "warning" ? "bg-amber-500" : "bg-muted-foreground/30",
                      )}
                      aria-hidden
                    />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {isLoading ? "…" : stato.status === "disconnected" ? "Non collegato all'area superadmin" : stato.detail}
                  </p>
                </div>
                <Button size="sm" variant={stato.status === "disconnected" ? "default" : "outline"} onClick={() => setAperto(a)}>
                  {stato.status === "disconnected" ? "Collega" : "Istruzioni"}
                </Button>
              </div>
            );
          })}
        </div>

        {error && <p className="text-xs text-destructive">Collegamenti non caricati: {(error as Error).message}</p>}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">I tuoi collegamenti</p>
            <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
              <Link to="/admin/impostazioni/api-mcp"><KeyRound className="h-3.5 w-3.5" /> Chiavi per Claude Code</Link>
            </Button>
          </div>
          {collegamenti.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              {isLoading ? "Caricamento…" : "Nessun assistente collegato."}
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {collegamenti.map((c) => {
                const chi = assistenteDelClient(c.client_name);
                const Logo = chi === "chatgpt" ? ChatGptLogo : chi === "claude" ? ClaudeLogo : null;
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    {Logo ? <Logo className="h-4 w-4" /> : <span className="h-4 w-4" />}
                    <span className="min-w-[110px] font-medium">{c.client_name ?? "Assistente"}</span>
                    {c.ambito === "piattaforma" ? (
                      <Badge className="gap-1"><Crown className="h-3 w-3" /> Area superadmin</Badge>
                    ) : (
                      <Badge variant="secondary">{c.company_name ?? "Azienda"}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {c.livello === "operativo" ? "Operativo" : "Consulente"}{c.invii ? " · invii reali" : ""}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      usato {quando(c.last_used_at)} · {c.chiamate_24h} {c.chiamate_24h === 1 ? "chiamata" : "chiamate"}/24h
                      {c.errori_24h > 0 && <span className="text-destructive"> · {c.errori_24h} {c.errori_24h === 1 ? "errore" : "errori"}</span>}
                    </span>
                    <Button
                      size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setDaRevocare(c)}
                    >
                      <Unlink className="h-3.5 w-3.5" /> Revoca
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {azioni.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ultime azioni degli assistenti</p>
            <div className="divide-y rounded-md border text-xs">
              {azioni.map((a, i) => (
                <div key={`${a.created_at}-${i}`} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="w-16 shrink-0 text-muted-foreground">{quando(a.created_at)}</span>
                  <code className="font-mono">{a.strumento}</code>
                  {a.azienda && <span className="truncate text-muted-foreground">{a.azienda}</span>}
                  <span className={cn("ml-auto shrink-0", a.esito >= 400 ? "text-destructive" : "text-emerald-600")}>
                    {a.esito >= 400 ? `errore ${a.esito}` : "ok"}
                  </span>
                </div>
              ))}
            </div>
            <Button asChild size="sm" variant="link" className="h-7 px-0 text-xs">
              <Link to="/admin/impostazioni/audit">Registro attività completo <ExternalLink className="ml-1 h-3 w-3" /></Link>
            </Button>
          </div>
        )}
      </CardContent>

      <PannelloCollega assistente={aperto} onClose={() => setAperto(null)} />

      <AlertDialog open={!!daRevocare} onOpenChange={(o) => !o && setDaRevocare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocare {daRevocare?.client_name ?? "l'assistente"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Da subito l'assistente non potrà più leggere né agire
              {daRevocare?.ambito === "piattaforma" ? " nell'area superadmin" : ` su ${daRevocare?.company_name ?? "questa azienda"}`}.
              Per ricollegarlo servirà un nuovo consenso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (daRevocare) revoca.mutate(daRevocare); setDaRevocare(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoca.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Revoca"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

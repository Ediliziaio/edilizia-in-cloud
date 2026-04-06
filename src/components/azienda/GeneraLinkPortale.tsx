import { useState } from "react";
import { Link2, Copy, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface GeneraLinkPortaleProps {
  clienteId: string;
  companyId: string;
  clienteNome: string;
}

export function GeneraLinkPortale({ clienteId, companyId, clienteNome }: GeneraLinkPortaleProps) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function generaToken(forceNew = false) {
    setLoading(true);
    try {
      if (!forceNew) {
        // Check if a valid token already exists
        const now = new Date().toISOString();
        const { data: existing } = await (supabase as any)
          .from("portale_clienti_tokens")
          .select("token, expires_at")
          .eq("cliente_id", clienteId)
          .eq("company_id", companyId)
          .gt("expires_at", now)
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing?.token) {
          const url = `${window.location.origin}/portale/${existing.token}`;
          setLink(url);
          return;
        }
      }

      // Generate a new token
      const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      if (forceNew) {
        // Update existing or insert new — upsert by cliente_id + company_id
        await (supabase as any)
          .from("portale_clienti_tokens")
          .delete()
          .eq("cliente_id", clienteId)
          .eq("company_id", companyId);
      }

      const { error } = await (supabase as any).from("portale_clienti_tokens").insert({
        cliente_id: clienteId,
        company_id: companyId,
        token: newToken,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      const url = `${window.location.origin}/portale/${newToken}`;
      setLink(url);
    } catch (err: any) {
      toast.error(err?.message ?? "Errore nella generazione del link.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiato!");
    } catch {
      toast.error("Impossibile copiare il link.");
    }
  }

  return (
    <div className="space-y-3">
      {!link ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => generaToken(false)}
          disabled={loading}
          className="h-9 gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Link2 className="w-4 h-4" />
          )}
          Genera link portale
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Link portale per <span className="font-semibold text-foreground">{clienteNome}</span>
          </p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={link}
              className="text-xs h-9 bg-muted/50 cursor-text select-all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={copyLink}
              className="h-9 px-3 flex-shrink-0"
              aria-label="Copia link"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => generaToken(true)}
            disabled={loading}
            className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Rinnova link (30 giorni)
          </Button>
        </div>
      )}
    </div>
  );
}

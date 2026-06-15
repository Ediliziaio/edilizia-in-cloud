import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Building2 } from "lucide-react";
import { isMissingTableError, MigrationGate } from "./_shared";

/**
 * Gestione Brand = pool isolati di domini+caselle per il cold multi-brand.
 * Ogni sequenza sceglie un brand e spedisce solo dai suoi domini (reputazione
 * separata per marchio). Tabella outreach_brands (migrazione 20270817000000).
 */

const T = "outreach_brands";
interface Brand { id: string; name: string; from_name: string | null; reply_to: string | null; status: string; }

export function OutreachBrands({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [signature, setSignature] = useState("");
  const [footerAddress, setFooterAddress] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const q = useQuery({
    queryKey: ["outreach-brands", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.from(T).select("*").eq("company_id", companyId).order("created_at");
      if (error) throw error;
      return (data ?? []) as Brand[];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["outreach-brands", companyId] });

  const add = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome brand mancante");
      const { error } = await db.from(T).insert({
        company_id: companyId, name: name.trim(),
        from_name: fromName.trim() || null, reply_to: replyTo.trim() || null,
        signature: signature.trim() || null, footer_address: footerAddress.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Brand creato"); setName(""); setFromName(""); setReplyTo(""); setSignature(""); setFooterAddress(""); setShow(false); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from(T).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Brand eliminato"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  if (q.isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.error && isMissingTableError(q.error)) {
    return <MigrationGate title="Brand (pool mittenti) — pronto" unlocks={[
      "Raggruppa domini e caselle per brand (es. 5 domini per ogni marchio).",
      "Ogni sequenza spedisce solo dal pool del suo brand: reputazione separata.",
      "From-name e reply-to dedicati per brand.",
    ]} />;
  }
  if (q.error) return <Card><CardContent className="p-4 text-sm text-red-600">Errore: {q.error instanceof Error ? q.error.message : "imprevisto"}</CardContent></Card>;

  const brands = q.data ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-5 w-5 text-orange-500" /> Brand · pool mittenti</CardTitle>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setShow((v) => !v)}><Plus className="h-3.5 w-3.5" /> Brand</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Ogni brand è un pool isolato di domini + caselle. Le sequenze scelgono il brand → spediscono solo da quei domini (reputazione separata per marchio).
        </p>
        {show && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
            <div className="min-w-[160px] flex-1 space-y-1"><Label className="text-xs">Nome brand</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Edilizia in Cloud — cold" className="h-8" /></div>
            <div className="min-w-[130px] flex-1 space-y-1"><Label className="text-xs">From name</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Edilizia in Cloud" className="h-8" /></div>
            <div className="min-w-[150px] flex-1 space-y-1"><Label className="text-xs">Reply-to</Label>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="risposte@dominio" className="h-8" /></div>
            <div className="basis-full space-y-1"><Label className="text-xs">Firma email</Label>
              <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={"Cordiali saluti,\n{{first_name}}\nEdilizia in Cloud"} rows={3} className="text-sm" />
              <p className="text-[11px] text-muted-foreground">Appesa in fondo a ogni email. Supporta {"{{first_name}}"} e spintax.</p></div>
            <div className="basis-full space-y-1"><Label className="text-xs">Indirizzo (footer)</Label>
              <Input value={footerAddress} onChange={(e) => setFooterAddress(e.target.value)} placeholder="Via Roma 1, 20100 Milano (MI)" className="h-8" />
              <p className="text-[11px] text-muted-foreground">Indirizzo postale nel footer (obbligo anti-spam).</p></div>
            <Button size="sm" className="h-8" disabled={add.isPending} onClick={() => add.mutate()}>{add.isPending ? "…" : "Salva"}</Button>
          </div>
        )}
        {brands.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Nessun brand. Creane uno per ogni marchio (es. "EIC cold", "Marketing edile").</p>
        ) : brands.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{b.name}</span>
                <Badge variant={b.status === "active" ? "default" : "secondary"} className="text-[10px]">{b.status}</Badge>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{b.from_name ? `From: ${b.from_name}` : "From: —"}{b.reply_to ? ` · reply: ${b.reply_to}` : ""}</div>
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => del.mutate(b.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { renderTemplate, contactToVars, hashSeed } from "../../../../supabase/functions/_shared/outreach-template";

/**
 * Playground personalizzazione — prova variabili e spintax su contatti REALI
 * prima di lanciare. Usa il motore puro renderTemplate (lo stesso degli invii).
 * Gira su marketing_contacts (esistente): funziona da subito.
 */

interface Contact {
  id: string; first_name: string; last_name: string | null;
  company_name: string | null; email: string | null; phone: string | null;
}

const DEFAULT_TPL = "{Ciao|Salve|Buongiorno} {{first_name|amico}},\n\nho visto il lavoro di {{company_name|la vostra impresa}} e volevo proporvi una cosa veloce.\n\nHa 10 minuti questa settimana?";

const FALLBACK_SAMPLE: Contact = { id: "", first_name: "Mario", last_name: "Rossi", company_name: "Rossi Costruzioni", email: "mario@rossi.it", phone: "" };

const CHIPS = ["{{first_name}}", "{{first_name|amico}}", "{{company_name}}", "{{last_name}}", "{Ciao|Salve|Buongiorno}"];

export function OutreachMessagePlayground({ companyId }: { companyId: string }) {
  const [tpl, setTpl] = useState(DEFAULT_TPL);
  const [contactId, setContactId] = useState("");
  const [angle, setAngle] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSubject, setAiSubject] = useState("");

  const contacts = useQuery({
    queryKey: ["playground-contacts", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id,first_name,last_name,company_name,email,phone")
        .eq("company_id", companyId).order("last_activity_at", { ascending: false, nullsFirst: false }).limit(50);
      if (error) return [];
      return (data ?? []) as Contact[];
    },
  });

  const list = contacts.data ?? [];
  const selected = list.find((c) => c.id === contactId) ?? list[0] ?? FALLBACK_SAMPLE;
  const seed = hashSeed(selected.email || selected.id || "seed");
  const rendered = renderTemplate(tpl, contactToVars(selected), { seed });

  async function generateAI() {
    setAiBusy(true);
    try {
      const payload: Record<string, unknown> = { angle };
      if (selected.id) payload.contact_id = selected.id;
      else payload.contact = { first_name: selected.first_name, last_name: selected.last_name, company_name: selected.company_name };
      const { data, error } = await supabase.functions.invoke("outreach-ai-email", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.body) { setTpl(data.body); setAiSubject(data.subject || ""); toast.success("Email generata con AI"); }
      else throw new Error("Nessuna email generata");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore AI");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-5 w-5 text-orange-500" /> Anteprima messaggio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Prova variabili e <strong>spintax</strong> su un contatto vero. Lo spintax <code className="rounded bg-muted px-1">{"{Ciao|Salve}"}</code> varia il messaggio tra destinatari (meno spam).
        </p>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/40 p-2">
          <Sparkles className="h-4 w-4 shrink-0 text-orange-500" />
          <Input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Angle (opzionale): es. risparmio su fatturazione e cantieri" className="h-8 flex-1 text-xs" />
          <Button size="sm" className="h-8 gap-1" disabled={aiBusy} onClick={generateAI}>
            {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Genera con AI
          </Button>
        </div>
        {aiSubject && <p className="text-xs"><span className="text-muted-foreground">Oggetto generato:</span> <strong>{aiSubject}</strong></p>}

        <div className="grid gap-3 md:grid-cols-2">
          {/* template */}
          <div className="space-y-2">
            <Label className="text-xs">Template</Label>
            <Textarea value={tpl} onChange={(e) => setTpl(e.target.value)} rows={8} className="font-mono text-xs" />
            <div className="flex flex-wrap gap-1">
              {CHIPS.map((c) => (
                <button key={c} type="button" onClick={() => setTpl((t) => `${t}${t.endsWith(" ") || !t ? "" : " "}${c}`)}
                  className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-orange-50 hover:text-orange-600">
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Anteprima per</Label>
              {list.length > 0 && (
                <Select value={selected.id} onValueChange={setContactId}>
                  <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {list.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ""} {c.company_name ? `· ${c.company_name}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="min-h-[180px] whitespace-pre-wrap rounded-lg border bg-card p-3 text-sm">{rendered}</div>
            {list.length === 0 && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowRight className="h-3 w-3" /> Nessun contatto: anteprima su un esempio. Importa una lista per provare sui tuoi lead.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AdminSettingsAIKnowledge — Gestione Knowledge Base universale Silvio.
 *
 * Funzionalità:
 *   - Lista documenti universali raggruppati per categoria
 *   - Aggiungi nuovo doc (titolo, categoria, contenuto) — auto-embed
 *   - Edit / Delete doc
 *   - Re-seed corpus base
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  BookOpen, Plus, RefreshCw, Pencil, Trash2, Sparkles, FileText, Search,
} from "lucide-react";

interface BrainDoc {
  id: string;
  category: string | null;
  title: string | null;
  source_type: string;
  content: string;
  metadata: Record<string, unknown>;
  ingested_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  "01-normativa-edilizia": "Normativa edilizia e sicurezza",
  "02-finanza-cashflow": "Finanza e cashflow",
  "03-controllo-gestione": "Controllo di gestione",
  "04-vendita-consulenziale": "Vendita consulenziale",
  "05-fiscale-compliance": "Fiscale e compliance",
  "06-hr-edile": "HR edilizia e CCNL",
  "07-strategia-imprenditoriale": "Strategia imprenditoriale",
  "08-marketing-edile": "Marketing edilizia",
  "09-tecnologie-digitalizzazione": "Tecnologie e digitalizzazione",
  "10-ai-act-governance": "AI Act e governance",
  "11-advisor-strategico": "Advisor strategico",
  normativa_sicurezza: "Normativa edilizia e sicurezza",
  normativa_fiscale: "Fiscale e compliance",
  business_finanza: "Finanza e cashflow",
  business_vendita: "Vendita consulenziale",
  business_operations: "Controllo di gestione",
  hr_ccnl: "HR edilizia e CCNL",
  uncategorized: "Senza categoria",
};

const CATEGORIES = [
  "01-normativa-edilizia",
  "02-finanza-cashflow",
  "03-controllo-gestione",
  "04-vendita-consulenziale",
  "05-fiscale-compliance",
  "06-hr-edile",
  "07-strategia-imprenditoriale",
  "08-marketing-edile",
  "09-tecnologie-digitalizzazione",
  "10-ai-act-governance",
  "11-advisor-strategico",
];

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  normativa_sicurezza: "01-normativa-edilizia",
  normativa_fiscale: "05-fiscale-compliance",
  business_finanza: "02-finanza-cashflow",
  business_vendita: "04-vendita-consulenziale",
  business_operations: "03-controllo-gestione",
  hr_ccnl: "06-hr-edile",
};

const NORMATIVE_CATEGORIES = new Set(["01-normativa-edilizia", "05-fiscale-compliance", "normativa_sicurezza", "normativa_fiscale"]);
const BUSINESS_CATEGORIES = new Set([
  "02-finanza-cashflow",
  "03-controllo-gestione",
  "04-vendita-consulenziale",
  "06-hr-edile",
  "07-strategia-imprenditoriale",
  "08-marketing-edile",
  "09-tecnologie-digitalizzazione",
  "11-advisor-strategico",
  "business_finanza",
  "business_vendita",
  "business_operations",
  "hr_ccnl",
]);

function normalizeCategory(category: string | null | undefined): string {
  if (!category) return CATEGORIES[0];
  return LEGACY_CATEGORY_MAP[category] ?? (CATEGORIES.includes(category) ? category : CATEGORIES[0]);
}

export default function AdminSettingsAIKnowledge() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BrainDoc | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["admin_brain_universal_docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_brain_documents" as never)
        .select("id, category, title, source_type, content, metadata, ingested_at")
        .eq("scope", "universal")
        .order("category")
        .order("ingested_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BrainDoc[];
    },
  });

  const filtered = useMemo(() => {
    return (docs ?? []).filter(d => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        d.title?.toLowerCase().includes(q) ||
        d.category?.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q)
      );
    });
  }, [docs, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, BrainDoc[]>();
    for (const d of filtered) {
      const cat = d.category ?? "uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(d);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const reseedMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-brain-seed-universal", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      toast.success(`Re-seed completato: ${r.ingested}/${r.total_corpus} doc indicizzati`);
      qc.invalidateQueries({ queryKey: ["admin_brain_universal_docs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_brain_documents" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento eliminato");
      qc.invalidateQueries({ queryKey: ["admin_brain_universal_docs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Alert>
        <BookOpen className="h-4 w-4" />
        <AlertDescription>
          <strong>Knowledge Base Universale</strong> — Documenti condivisi tra tutte le aziende.
          Quando un imprenditore chiede info su normative, fiscale, vendita o cashflow, Silvio cerca
          qui. Aggiungi documenti per renderlo sempre più SUPER.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Documenti totali</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{docs?.length ?? "—"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Categorie attive</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{grouped.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Sicurezza & Normativa</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(docs ?? []).filter(d => NORMATIVE_CATEGORIES.has(d.category ?? "")).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Business Knowledge</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(docs ?? []).filter(d => BUSINESS_CATEGORIES.has(d.category ?? "")).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca nel testo o titolo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => reseedMut.mutate()}
            disabled={reseedMut.isPending}
            className="gap-2"
          >
            <RefreshCw className={reseedMut.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Re-seed corpus base
          </Button>
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nuovo documento
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : grouped.length === 0 ? (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            Nessun documento universale ancora. Esegui il <strong>re-seed corpus base</strong> per partire.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-5">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[cat] ?? cat} <span className="text-xs">({items.length})</span>
              </h3>
              <div className="space-y-2">
                {items.map(doc => (
                  <Card key={doc.id} className="hover:shadow-sm transition">
                    <CardContent className="p-3 flex items-start gap-3">
                      <div className="rounded-md ring-1 ring-violet-200 bg-violet-50 p-2 shrink-0">
                        <FileText className="h-4 w-4 text-violet-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold truncate">{doc.title ?? "Senza titolo"}</h4>
                          <Badge variant="outline" className="text-[10px]">{doc.source_type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.content.slice(0, 220)}</p>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {doc.content.length.toLocaleString()} char · ~{Math.round(doc.content.length / 4).toLocaleString()} token
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(doc)} title="Modifica">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => { if (confirm(`Eliminare "${doc.title}"?`)) deleteMut.mutate(doc.id); }}
                          title="Elimina"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <DocEditDialog
          doc={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function DocEditDialog({ doc, onClose }: { doc: BrainDoc | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !doc;
  const [title, setTitle] = useState(doc?.title ?? "");
  const [category, setCategory] = useState(normalizeCategory(doc?.category));
  const [content, setContent] = useState(doc?.content ?? "");

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !content.trim()) throw new Error("Titolo e contenuto obbligatori");

      // Genera embedding via edge function (passing the user's auth token)
      const { data: tokenData } = await supabase.auth.getSession();
      const accessToken = tokenData.session?.access_token;
      if (!accessToken) throw new Error("Non autenticato");

      // Call ingest endpoint (single doc mode)
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL ?? "https://rsbrguhkodgnqfomrevo.supabase.co"}/functions/v1/ai-brain-ingest`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "items",
          items: [{
            source_type: "knowledge",
            source_id: isNew ? null : doc?.id,
            scope: "universal",
            category,
            title: title.trim(),
            content: content.trim(),
            metadata: {
              title: title.trim(),
              scope: "universal",
              category,
              source: "admin_knowledge_editor",
              edited_from_id: isNew ? null : doc?.id,
            },
          }],
        }),
      });
      const result = await r.json();
      if (!result.ok) throw new Error(result.error ?? "Errore ingest");

      if (!isNew && doc?.id) {
        const newDocumentIds = Array.isArray(result.document_ids) ? result.document_ids : [];
        if (newDocumentIds.length > 0 && !newDocumentIds.includes(doc.id)) {
          const { error: cleanupError } = await supabase
            .from("ai_brain_documents" as never)
            .delete()
            .eq("id", doc.id);
          if (cleanupError) throw new Error(`Documento indicizzato, ma vecchia versione non rimossa: ${cleanupError.message}`);
        }
      }

      return result;
    },
    onSuccess: () => {
      toast.success(isNew ? "Documento aggiunto" : "Documento aggiornato");
      qc.invalidateQueries({ queryKey: ["admin_brain_universal_docs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuovo documento universale" : "Modifica documento"}</DialogTitle>
          <DialogDescription>
            Verrà indicizzato con embedding + reso disponibile a Silvio per tutte le aziende.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Titolo</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. CCNL Edilizia — Livelli e retribuzioni" />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Contenuto (max 8000 char per chunk)</Label>
            <Textarea
              rows={16}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-xs"
              placeholder="Inserisci il contenuto del documento. Sarà splittato in chunk + embedded automaticamente."
            />
            <p className="text-xs text-muted-foreground mt-1">
              {content.length.toLocaleString()} char • ~{Math.round(content.length / 4).toLocaleString()} token
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Salvo & embed…" : "Salva e indicizza"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

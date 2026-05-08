/**
 * KbPlaygroundTab — Playground per testare la KB con embedding reale.
 *
 * Flusso:
 *   1. Utente scrive una query
 *   2. Frontend invoca edge function kb-qa-test-runner con qa_pair_id=null
 *      passando la query come question temporanea... NO, meglio:
 *      Crea un endpoint dedicato OR usa kb_test_query con embedding già fatto.
 *
 * In questa versione: usiamo la stessa edge function kb-qa-test-runner
 * ma con un Q&A pair temporaneo "ad-hoc" salvato → eseguito → eliminato.
 *
 * Alternativa più pulita: edge function dedicata `kb-playground-query`.
 * Ne creo una piccola inline qui usando supabase.functions.invoke con
 * un edge function specifico — per ora uso kb-qa-test-runner riutilizzando
 * l'inserimento temporaneo.
 *
 * Per semplicità: usiamo il RPC kb_test_query passando il testo (senza
 * embedding il RPC fa fallback fulltext); per vector reale serve edge fn.
 * Vado con la versione "best" via edge function dedicata.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Search, Sparkles, AlertTriangle, CheckCircle2, Languages } from "lucide-react";

interface SearchResult {
  chunk_id: string;
  doc_id: string;
  title: string;
  category: string | null;
  category_path: string | null;
  language?: string | null;
  content_preview: string;
  similarity: number;
  hits_count: number;
  last_used_at: string | null;
  last_verified_at: string | null;
  valid_until: string | null;
  is_expired: boolean;
  embedding_model: string;
  anti_patterns_count?: number;
  matched_via_fallback?: boolean;
}

interface SearchMeta {
  language: string | null;
  embed_model: string;
  embed_ms: number;
  total_ms: number;
}

const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Auto (no filtro lingua)" },
  { value: "it", label: "Italiano (it)" },
  { value: "en", label: "English (en)" },
  { value: "es", label: "Español (es)" },
  { value: "fr", label: "Français (fr)" },
  { value: "de", label: "Deutsch (de)" },
  { value: "pt", label: "Português (pt)" },
  { value: "ro", label: "Română (ro)" },
];

export function KbPlaygroundTab() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [language, setLanguage] = useState<string>("auto");
  const [crossLangFallback, setCrossLangFallback] = useState<boolean>(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [meta, setMeta] = useState<SearchMeta | null>(null);

  const searchMutation = useMutation({
    mutationFn: async () => {
      const t0 = Date.now();
      const reqBody: Record<string, unknown> = { query, top_k: topK, min_similarity: 0.20 };
      if (language !== "auto") {
        reqBody.language = language;
        reqBody.cross_lang_fallback = crossLangFallback;
      }
      const { data, error } = await supabase.functions.invoke("kb-playground-query", {
        body: reqBody,
      });
      if (error) throw error;
      setDuration(Date.now() - t0);
      return data as { results: SearchResult[]; meta: SearchMeta };
    },
    onSuccess: (data) => {
      setResults(data.results ?? []);
      setMeta(data.meta ?? null);
      if ((data.results ?? []).length === 0) {
        toast.info("Nessun risultato trovato — prova a riformulare o ridurre min_similarity");
      } else if ((data.results ?? []).some(r => r.matched_via_fallback)) {
        toast.info("Risultati cross-lingua via fallback", {
          description: "Nessun match nella lingua scelta, mostrati i match più simili indipendentemente dalla lingua.",
        });
      }
    },
    onError: (e) => {
      toast.error("Errore ricerca", { description: String(e) });
      setResults([]);
      setMeta(null);
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Playground KB</h3>
        <p className="text-xs text-muted-foreground">
          Testa cosa l'AI recupera dalla Knowledge Base con una query reale.
          Embedding via OpenAI <code>text-embedding-3-small</code>, vector search su pgvector.
        </p>
      </div>

      {/* Query input */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label className="text-xs">Query di test</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim().length >= 3) {
                    searchMutation.mutate();
                  }
                }}
                placeholder="Es: come gestire un cliente moroso edilizio?"
                className="flex-1"
              />
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Top-K</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value) || 5)}
                  className="w-16"
                />
              </div>
              <Button
                onClick={() => searchMutation.mutate()}
                disabled={query.trim().length < 3 || searchMutation.isPending}
              >
                {searchMutation.isPending ? (
                  <Sparkles className="h-4 w-4 animate-pulse mr-1.5" />
                ) : (
                  <Search className="h-4 w-4 mr-1.5" />
                )}
                Cerca
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Premi <kbd className="px-1 py-0.5 rounded bg-muted text-[9px]">Enter</kbd> per cercare. Min query length: 3 caratteri.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Languages className="h-3 w-3" /> Lingua query
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Lingue diverse da it/en usano <code>text-embedding-3-large</code> (multilingue).
              </p>
            </div>
            <div className="sm:col-span-2 flex items-end">
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  id="cross-lang"
                  checked={crossLangFallback}
                  onCheckedChange={setCrossLangFallback}
                  disabled={language === "auto"}
                />
                <Label htmlFor="cross-lang" className="text-xs cursor-pointer">
                  Fallback cross-lingua
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  (se nessun match nella lingua scelta, prova senza filtro)
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
            <span>
              <strong>{results.length}</strong> risultati
              {duration !== null && ` · ${duration}ms`}
              {meta?.embed_model && (
                <> · embed: <code className="text-[10px]">{meta.embed_model}</code></>
              )}
              {meta?.language && (
                <> · lang: <code className="text-[10px]">{meta.language}</code></>
              )}
            </span>
            {results.length > 0 && (
              <span>
                Top similarity: <strong>{(results[0].similarity * 100).toFixed(1)}%</strong>
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Nessun chunk recuperato. La query non ha match nella KB.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Suggerimenti: riformula la query, abbassa <code>min_similarity</code>, o aggiungi un doc rilevante.
                </p>
              </CardContent>
            </Card>
          ) : (
            results.map((r, i) => (
              <Card key={r.chunk_id} className={r.is_expired ? "border-rose-300" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                        #{i + 1}
                      </Badge>
                      <span className="truncate">{r.title}</span>
                    </span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 ${
                        r.similarity >= 0.7
                          ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                          : r.similarity >= 0.4
                          ? "border-blue-300 text-blue-700 bg-blue-50"
                          : "border-amber-300 text-amber-700 bg-amber-50"
                      }`}
                    >
                      {(r.similarity * 100).toFixed(1)}%
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <p className="text-xs text-muted-foreground line-clamp-3 font-mono">
                    {r.content_preview}
                  </p>
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <Badge variant="secondary" className="font-mono">
                      chunk:{r.chunk_id}
                    </Badge>
                    {r.category_path && (
                      <Badge variant="outline">📂 {r.category_path}</Badge>
                    )}
                    <Badge variant="outline">{r.embedding_model}</Badge>
                    {r.language && <Badge variant="outline">🌐 {r.language}</Badge>}
                    {r.matched_via_fallback && (
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        cross-lang fallback
                      </Badge>
                    )}
                    <Badge variant="outline">{r.hits_count} hits</Badge>
                    {r.is_expired && (
                      <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">
                        <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                        Scaduto
                      </Badge>
                    )}
                    {r.last_verified_at ? (
                      <Badge variant="outline" className="text-emerald-700">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                        Verificato {new Date(r.last_verified_at).toLocaleDateString("it-IT")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-700">
                        Mai verificato
                      </Badge>
                    )}
                    {(r.anti_patterns_count ?? 0) > 0 && (
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        ⚠ {r.anti_patterns_count} anti-pattern
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {!results && !searchMutation.isPending && (
        <Card>
          <CardContent className="p-6 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Inserisci una query per vedere cosa l'AI recupera dalla KB.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Prova: "fatturazione elettronica", "infortuni cantiere", "preventivi serramenti"
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

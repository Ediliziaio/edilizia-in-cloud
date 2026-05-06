/**
 * CaptureReviewPanel — UI di review dei dati estratti dall'AI prima di
 * persistere il preventivo. L'utente può:
 *   - correggere campi cliente
 *   - scegliere strategia contact: auto / manual select / always_new / use_existing
 *   - vedere i match contact in tempo reale (lookup_contact_live)
 *   - correggere ogni voce prodotto (descrizione, qty, prezzo, match listino)
 *   - rimuovere voci sbagliate, aggiungerne nuove
 *   - confermare → silvio_tool_apply_capture_review
 */
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  User,
  Package,
  Plus,
  Trash2,
  Loader2,
  UserCheck,
  UserPlus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ExtractedCustomer {
  nome?: string;
  cognome?: string;
  azienda?: string;
  telefono?: string;
  email?: string;
  indirizzo?: string;
  citta?: string;
  provincia?: string;
  cap?: string;
  cf?: string;
  piva?: string;
  confidence?: number;
}

interface MatchedProduct {
  descrizione_grezza: string;
  quantita?: number;
  unita_misura?: string;
  misure?: { x?: number; y?: number; unit?: string };
  attributi?: string[];
  matched_template_id?: string;
  matched_family_id?: string;
  matched_tariffa_id?: string;
  matched_name?: string;
  match_type?: "alias" | "vector" | "manual" | "none";
  match_confidence?: number;
  unit_price?: number;
  unit_price_source?: "griglia" | "template" | "tariffa" | "fallback";
  axis_selections?: Record<string, string>;
  // Editable fields (added during review)
  name?: string;
  description?: string;
  unit_of_measure?: string;
}

interface ContactCandidate {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  city?: string;
  match_type: string;
  match_confidence: number;
}

interface Props {
  runId: string;
  onCancel: () => void;
  onApplied: (quoteId: string) => void;
}

type ContactStrategy = "auto" | "manual" | "always_new" | "use_existing";

export function CaptureReviewPanel({ runId, onCancel, onApplied }: Props) {
  const companyId = useEffectiveCompanyId();
  const [customer, setCustomer] = useState<ExtractedCustomer>({});
  const [products, setProducts] = useState<MatchedProduct[]>([]);
  const [confidence, setConfidence] = useState<number>(0);
  const [avvertenze, setAvvertenze] = useState<string[]>([]);
  const [contactStrategy, setContactStrategy] = useState<ContactStrategy>("auto");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Carica run + estratto
  const { data: runData, isLoading } = useQuery({
    queryKey: ["capture-run", runId],
    enabled: !!companyId && !!runId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("silvio_tool_get_capture_run", {
        p_company_id: companyId!,
        p_run_id: runId,
      });
      if (error) throw new Error(error.message);
      return data as { ok: boolean; run?: Record<string, unknown> };
    },
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    const run = runData?.run;
    if (!run) return;
    setCustomer((run.extracted_customer_data as ExtractedCustomer) ?? {});
    const rawProducts = (run.extracted_products as MatchedProduct[]) ?? [];
    // Auto-popola "name" dai descrizione_grezza
    setProducts(
      rawProducts.map((p) => ({
        ...p,
        name: p.matched_name ?? p.name ?? p.descrizione_grezza,
        unit_of_measure: p.unita_misura ?? p.unit_of_measure ?? "pz",
      })),
    );
    setConfidence((run.extraction_confidence as number) ?? 0);
    const visionResults = run.vision_results as { extraction?: { avvertenze?: string[] } } | null;
    setAvvertenze(visionResults?.extraction?.avvertenze ?? []);
  }, [runData]);

  // Live contact lookup
  const { data: contactCandidates = [] } = useQuery({
    queryKey: ["lookup-contact", customer.email, customer.telefono, customer.nome, companyId],
    enabled:
      !!companyId &&
      contactStrategy === "auto" &&
      (!!customer.email || !!customer.telefono || (customer.nome && customer.nome.length >= 3)),
    queryFn: async (): Promise<ContactCandidate[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("silvio_tool_lookup_contact_live", {
        p_company_id: companyId!,
        p_email: customer.email ?? null,
        p_phone: customer.telefono ?? null,
        p_name_hint: customer.nome
          ? `${customer.nome} ${customer.cognome ?? ""}`.trim()
          : null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ContactCandidate[];
    },
    staleTime: 5 * 1000,
  });

  const exactMatch = useMemo(
    () =>
      contactCandidates.find(
        (c) => c.match_type === "email_exact" || c.match_type === "phone_exact",
      ),
    [contactCandidates],
  );

  const subtotal = useMemo(
    () =>
      products.reduce(
        (sum, p) => sum + (Number(p.quantita ?? 1) * Number(p.unit_price ?? 0)),
        0,
      ),
    [products],
  );

  const totalIva = subtotal * 0.22;
  const total = subtotal + totalIva;

  const updateProduct = (idx: number, patch: Partial<MatchedProduct>) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  };

  const removeProduct = (idx: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const addProduct = () => {
    setProducts((prev) => [
      ...prev,
      {
        descrizione_grezza: "Nuova voce",
        name: "Nuova voce",
        quantita: 1,
        unita_misura: "pz",
        unit_of_measure: "pz",
        unit_price: 0,
        match_type: "manual",
      },
    ]);
  };

  const handleApply = async () => {
    if (!companyId) return;
    if (products.length === 0) {
      toast.error("Nessun prodotto da preventivare");
      return;
    }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("silvio_tool_apply_capture_review", {
        p_company_id: companyId,
        p_run_id: runId,
        p_corrections: {
          customer,
          products: products.map((p, i) => ({
            ...p,
            name: p.name ?? p.descrizione_grezza,
            description: p.description ?? p.descrizione_grezza,
            quantity: p.quantita ?? 1,
            unit_price: p.unit_price ?? 0,
            unit_of_measure: p.unit_of_measure ?? "pz",
            article_template_id: p.matched_template_id ?? null,
            family_id: p.matched_family_id ?? null,
            tariffa_id: p.matched_tariffa_id ?? null,
            misura_x: p.misure?.x ?? null,
            misura_y: p.misure?.y ?? null,
            sort_order: i * 10,
            item_type: p.matched_tariffa_id ? "service" : "product",
          })),
          contact_strategy: contactStrategy,
          existing_contact_id: contactStrategy === "use_existing" ? selectedContactId : undefined,
        },
      });

      if (error) {
        toast.error("Errore creazione preventivo", { description: error.message });
        setSaving(false);
        return;
      }

      const result = data as {
        ok: boolean;
        quote_id?: string;
        contact_action?: string;
        updated_contact_fields?: string[];
        items_count?: number;
        error?: string;
      };

      if (!result.ok) {
        toast.error(result.error ?? "Apply fallito");
        setSaving(false);
        return;
      }

      const actionLabel: Record<string, string> = {
        created: "✓ Cliente creato",
        reused: "✓ Cliente esistente collegato",
        updated: `✓ Cliente aggiornato (${result.updated_contact_fields?.length ?? 0} campi)`,
        skipped: "✓ Cliente: nessuna azione",
      };
      toast.success(`Preventivo creato (${result.items_count} voci)`, {
        description: actionLabel[result.contact_action ?? ""] ?? "",
      });

      if (result.quote_id) {
        onApplied(result.quote_id);
      }
    } catch (e) {
      toast.error("Errore", { description: e instanceof Error ? e.message : String(e) });
    }
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header confidence */}
      <div className="flex items-center justify-between rounded-md border p-2">
        <div className="flex items-center gap-2 text-sm">
          {confidence > 0.7 ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          )}
          <span>
            Estrazione AI completata · confidence{" "}
            <strong>{(confidence * 100).toFixed(0)}%</strong>
          </span>
        </div>
        <Badge variant="outline">{products.length} voci estratte</Badge>
      </div>

      {/* Avvertenze AI */}
      {avvertenze.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
            ⚠ L'AI ha segnalato alcuni dubbi:
          </p>
          <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
            {avvertenze.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* CLIENTE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" /> Dati cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Match esistente in evidenza */}
          {exactMatch && contactStrategy === "auto" ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/10 p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                      Cliente esistente trovato
                    </p>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300">
                      {exactMatch.first_name} {exactMatch.last_name}
                      {exactMatch.company_name ? ` — ${exactMatch.company_name}` : ""}
                      {exactMatch.email ? ` · ${exactMatch.email}` : ""}
                      {exactMatch.phone ? ` · ${exactMatch.phone}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Match: <strong>{exactMatch.match_type}</strong> ·{" "}
                      {(exactMatch.match_confidence * 100).toFixed(0)}%. I campi vuoti del contatto
                      esistente verranno aggiornati con i nuovi dati.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Strategia contact */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { value: "auto", label: "Auto", icon: UserCheck, hint: "Trova per email/telefono o crea" },
              { value: "use_existing", label: "Esistente", icon: Search, hint: "Seleziona contatto manualmente" },
              { value: "always_new", label: "Nuovo", icon: UserPlus, hint: "Crea nuovo sempre" },
              { value: "manual", label: "Solo lookup", icon: Search, hint: "Non creare auto" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setContactStrategy(opt.value)}
                className={`text-left p-2 border rounded-md text-xs hover:bg-muted/40 ${
                  contactStrategy === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <div className="flex items-center gap-1 font-medium">
                  <opt.icon className="h-3 w-3" /> {opt.label}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.hint}</p>
              </button>
            ))}
          </div>

          {/* Lista candidati per use_existing */}
          {contactStrategy === "use_existing" && contactCandidates.length > 0 ? (
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {contactCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedContactId(c.id)}
                  className={`w-full text-left p-2 border-b last:border-0 text-xs hover:bg-muted/40 ${
                    selectedContactId === c.id ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="font-medium">
                    {c.first_name} {c.last_name}
                    {c.company_name ? ` — ${c.company_name}` : ""}
                  </div>
                  <div className="text-muted-foreground">
                    {[c.email, c.phone, c.city].filter(Boolean).join(" · ")}
                    <Badge variant="outline" className="ml-2 text-[9px]">
                      {c.match_type} {(c.match_confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {/* Form cliente */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={customer.nome ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, nome: e.target.value }))}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Cognome</Label>
              <Input
                value={customer.cognome ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, cognome: e.target.value }))}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Telefono</Label>
              <Input
                value={customer.telefono ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, telefono: e.target.value }))}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                value={customer.email ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Azienda</Label>
              <Input
                value={customer.azienda ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, azienda: e.target.value }))}
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Indirizzo</Label>
              <Input
                value={customer.indirizzo ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, indirizzo: e.target.value }))}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Città</Label>
              <Input
                value={customer.citta ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, citta: e.target.value }))}
                className="h-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Provincia</Label>
                <Input
                  value={customer.provincia ?? ""}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, provincia: e.target.value.toUpperCase() }))
                  }
                  maxLength={2}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs">CAP</Label>
                <Input
                  value={customer.cap ?? ""}
                  onChange={(e) => setCustomer((c) => ({ ...c, cap: e.target.value }))}
                  maxLength={5}
                  className="h-8"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">CF</Label>
              <Input
                value={customer.cf ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, cf: e.target.value.toUpperCase() }))}
                className="h-8 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">P.IVA</Label>
              <Input
                value={customer.piva ?? ""}
                onChange={(e) => setCustomer((c) => ({ ...c, piva: e.target.value }))}
                className="h-8 font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PRODOTTI */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Voci preventivo
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addProduct}>
              <Plus className="h-3 w-3 mr-1" /> Aggiungi voce
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {products.map((p, i) => (
            <div key={i} className="border rounded-md p-2 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {p.match_type && p.match_type !== "manual" ? (
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${
                          (p.match_confidence ?? 0) > 0.8
                            ? "border-emerald-300 text-emerald-700"
                            : (p.match_confidence ?? 0) > 0.5
                              ? "border-amber-300 text-amber-700"
                              : "border-rose-300 text-rose-700"
                        }`}
                      >
                        {p.match_type} {(p.match_confidence ?? 0) > 0
                          ? `${((p.match_confidence ?? 0) * 100).toFixed(0)}%`
                          : ""}
                      </Badge>
                    ) : null}
                    {p.matched_name ? (
                      <span className="text-[10px] text-muted-foreground">
                        → {p.matched_name}
                      </span>
                    ) : null}
                    {p.unit_price_source ? (
                      <Badge variant="outline" className="text-[9px]">
                        prezzo: {p.unit_price_source}
                      </Badge>
                    ) : null}
                  </div>
                  <Input
                    value={p.name ?? p.descrizione_grezza}
                    onChange={(e) => updateProduct(i, { name: e.target.value })}
                    placeholder="Descrizione"
                    className="h-8 text-sm"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px]">Q.tà</Label>
                      <Input
                        type="number"
                        value={p.quantita ?? 1}
                        onChange={(e) =>
                          updateProduct(i, { quantita: parseFloat(e.target.value) || 0 })
                        }
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">U.M.</Label>
                      <Input
                        value={p.unit_of_measure ?? "pz"}
                        onChange={(e) => updateProduct(i, { unit_of_measure: e.target.value })}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Larg. (mm)</Label>
                      <Input
                        type="number"
                        value={p.misure?.x ?? ""}
                        onChange={(e) =>
                          updateProduct(i, {
                            misure: {
                              ...p.misure,
                              x: parseFloat(e.target.value) || undefined,
                            },
                          })
                        }
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Alt. (mm)</Label>
                      <Input
                        type="number"
                        value={p.misure?.y ?? ""}
                        onChange={(e) =>
                          updateProduct(i, {
                            misure: {
                              ...p.misure,
                              y: parseFloat(e.target.value) || undefined,
                            },
                          })
                        }
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px]">Prezzo unitario (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={p.unit_price ?? 0}
                      onChange={(e) =>
                        updateProduct(i, { unit_price: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 font-mono"
                    />
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive shrink-0"
                  onClick={() => removeProduct(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {products.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-4">
              Nessuna voce. Clicca "Aggiungi voce" per crearne una manualmente.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* TOTALI */}
      <div className="border rounded-md p-3 bg-muted/30 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotale</span>
          <span className="font-mono">€ {subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">IVA 22%</span>
          <span className="font-mono">€ {totalIva.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold border-t pt-1">
          <span>Totale</span>
          <span className="font-mono text-primary">€ {total.toFixed(2)}</span>
        </div>
      </div>

      {/* AZIONI */}
      <div className="flex gap-2 pt-2 border-t">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Indietro
        </Button>
        <Button
          onClick={handleApply}
          disabled={saving || products.length === 0 || (contactStrategy === "use_existing" && !selectedContactId)}
          className="flex-1"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Crea preventivo
        </Button>
      </div>
    </div>
  );
}

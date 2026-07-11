import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShoppingBag, Loader2, CalendarClock, Pencil, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  MODULI_VENDITA,
  type ModuloFeatureKey,
  type ModuloVendutaConfig,
} from "@/lib/moduli-vendita";

interface Props {
  companyId: string;
  companyName: string;
}

interface OverrideRow {
  feature_key: string;
  is_enabled: boolean | null;
  expires_at: string | null;
  notes: string | null;
  price_override: number | null;
}

/**
 * Sezione SuperAdmin dedicata ai Moduli Vendita Verticali.
 *
 * Mostra una card per ciascuno dei 6 moduli (categoria modulo_vendita) con:
 *  - switch ON/OFF rapido (upsert override is_enabled)
 *  - dialog "Modifica" per scadenza + note + prezzo personalizzato
 *  - badge per moduli "coming soon" (disabilitati anche se override TRUE)
 *
 * Differente da CompanyFeatureOverridesCard:
 *  - vista focalizzata sui soli flag di categoria modulo_vendita
 *  - layout a card grid (più visuale, adatto al business case)
 *  - permette toggle istantaneo senza aprire l'editor avanzato
 */
export function CompanyModuliVendutaSection({ companyId, companyName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingModulo, setEditingModulo] = useState<ModuloVendutaConfig | null>(null);

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: queryKeys.admin.companyFeatureOverrides(companyId),
    queryFn: async () => {
      const moduliKeys = MODULI_VENDITA.map((m) => m.flag);
      const { data, error } = await supabase
        .from("company_feature_overrides")
        .select("feature_key, is_enabled, expires_at, notes, price_override")
        .eq("company_id", companyId)
        .in("feature_key", moduliKeys);
      if (error) throw error;
      return (data ?? []) as OverrideRow[];
    },
    staleTime: 60_000,
  });

  const overrideByKey = useMemo(() => {
    const map = new Map<ModuloFeatureKey, OverrideRow>();
    for (const o of overrides) map.set(o.feature_key as ModuloFeatureKey, o);
    return map;
  }, [overrides]);

  const toggleMutation = useMutation({
    mutationFn: async (vars: { featureKey: ModuloFeatureKey; enabled: boolean }) => {
      const { error } = await supabase
        .from("company_feature_overrides")
        .upsert(
          {
            company_id: companyId,
            feature_key: vars.featureKey,
            is_enabled: vars.enabled,
            set_by: user?.id ?? null,
            set_by_email: user?.email ?? null,
          },
          { onConflict: "company_id,feature_key" },
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.enabled ? "Modulo attivato" : "Modulo disattivato",
        { description: `${companyName} · ${vars.featureKey}` },
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.companyFeatureOverrides(companyId),
      });
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      // Stessa tabella letta anche dal tab SaaS e dalla RPC di risoluzione.
      queryClient.invalidateQueries({ queryKey: ["company-feature-overrides", companyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyResolved(companyId) });
    },
    onError: (err) => {
      toast.error("Errore aggiornamento modulo", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Moduli Vendita Verticali</CardTitle>
            <CardDescription>
              Attiva/disattiva i configuratori verticali per {companyName}.
              I moduli "in arrivo" sono disponibili solo come prenotazione.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {MODULI_VENDITA.map((modulo) => {
              const Icon = modulo.icon;
              const override = overrideByKey.get(modulo.flag);
              const isEnabled = override?.is_enabled === true;
              const isPending =
                toggleMutation.isPending &&
                toggleMutation.variables?.featureKey === modulo.flag;
              const isComingSoon = modulo.availability === "coming_soon";

              return (
                <div
                  key={modulo.slug}
                  className="relative flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm leading-tight">{modulo.nome}</p>
                          {isComingSoon && (
                            <Badge variant="secondary" className="text-[10px]">
                              <Sparkles className="mr-1 h-2.5 w-2.5" aria-hidden="true" />
                              In arrivo
                            </Badge>
                          )}
                          {isEnabled && !isComingSoon && (
                            <Badge className="bg-emerald-500 hover:bg-emerald-500 text-[10px]">
                              Attivo
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {modulo.tagline}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={isEnabled}
                      disabled={isComingSoon || isPending}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ featureKey: modulo.flag, enabled: checked })
                      }
                      aria-label={`Attiva modulo ${modulo.nome}`}
                    />
                  </div>

                  {/* Meta override visibili (scadenza / prezzo / note) */}
                  {(override?.expires_at || override?.price_override || override?.notes) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground border-t pt-2">
                      {override?.expires_at && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" aria-hidden="true" />
                          Scade {format(new Date(override.expires_at), "d MMM yyyy", { locale: it })}
                        </span>
                      )}
                      {override?.price_override !== null && override?.price_override !== undefined && (
                        <span>
                          Prezzo: €{override.price_override}/mese
                        </span>
                      )}
                      {override?.notes && (
                        <span className="line-clamp-1 max-w-full">📝 {override.notes}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {isEnabled
                        ? "Attivo per questa company"
                        : isComingSoon
                          ? "Non ancora disponibile"
                          : "Disattivato"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingModulo(modulo)}
                      disabled={isComingSoon}
                      className="h-7 text-xs"
                    >
                      <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                      Modifica
                    </Button>
                  </div>

                  {isPending && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <ModuloEditDialog
        modulo={editingModulo}
        override={editingModulo ? overrideByKey.get(editingModulo.flag) ?? null : null}
        companyId={companyId}
        companyName={companyName}
        onClose={() => setEditingModulo(null)}
      />
    </Card>
  );
}

interface ModuloEditDialogProps {
  modulo: ModuloVendutaConfig | null;
  override: OverrideRow | null;
  companyId: string;
  companyName: string;
  onClose: () => void;
}

function ModuloEditDialog({ modulo, override, companyId, companyName, onClose }: ModuloEditDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEnabled, setIsEnabled] = useState(override?.is_enabled === true);
  const [expiresAt, setExpiresAt] = useState(
    override?.expires_at ? override.expires_at.slice(0, 10) : "",
  );
  const [priceOverride, setPriceOverride] = useState(
    override?.price_override !== null && override?.price_override !== undefined
      ? String(override.price_override)
      : "",
  );
  const [notes, setNotes] = useState(override?.notes ?? "");

  // Sincronizza stato locale quando cambia il modulo target o l'override
  useEffect(() => {
    setIsEnabled(override?.is_enabled === true);
    setExpiresAt(override?.expires_at ? override.expires_at.slice(0, 10) : "");
    setPriceOverride(
      override?.price_override !== null && override?.price_override !== undefined
        ? String(override.price_override)
        : "",
    );
    setNotes(override?.notes ?? "");
  }, [override]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!modulo) return;
      const priceNum = priceOverride.trim() === "" ? null : Number(priceOverride);
      if (priceOverride.trim() !== "" && (Number.isNaN(priceNum) || (priceNum ?? 0) < 0)) {
        throw new Error("Prezzo personalizzato non valido");
      }
      const { error } = await supabase
        .from("company_feature_overrides")
        .upsert(
          {
            company_id: companyId,
            feature_key: modulo.flag,
            is_enabled: isEnabled,
            expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            price_override: priceNum,
            notes: notes.trim() === "" ? null : notes.trim(),
            set_by: user?.id ?? null,
            set_by_email: user?.email ?? null,
          },
          { onConflict: "company_id,feature_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modulo aggiornato", {
        description: `${companyName} · ${modulo?.nome}`,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.companyFeatureOverrides(companyId),
      });
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      queryClient.invalidateQueries({ queryKey: ["company-feature-overrides", companyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyResolved(companyId) });
      onClose();
    },
    onError: (err) => {
      toast.error("Errore salvataggio", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    },
  });

  if (!modulo) return null;

  return (
    <Dialog open={!!modulo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modulo {modulo.nome}</DialogTitle>
          <DialogDescription>
            Configura override per <strong>{companyName}</strong>. Tutti i campi sono opzionali
            tranne lo stato attivo/disattivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="modulo-enabled" className="text-sm font-medium">
                Stato modulo
              </Label>
              <p className="text-xs text-muted-foreground">
                {isEnabled ? "Attivo per la company" : "Disattivato"}
              </p>
            </div>
            <Switch
              id="modulo-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modulo-expires">Scadenza (opzionale)</Label>
            <Input
              id="modulo-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se valorizzata, il modulo si disattiva automaticamente dopo questa data.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="modulo-price">Prezzo personalizzato €/mese (opzionale)</Label>
            <Input
              id="modulo-price"
              type="number"
              min={0}
              step={1}
              placeholder={String(modulo.prezzoMensile)}
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Listino standard: €{modulo.prezzoMensile}/mese.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="modulo-notes">Note interne (opzionale)</Label>
            <Textarea
              id="modulo-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. attivato in trial commerciale, da rivedere a fine mese..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            Annulla
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Salvataggio...
              </>
            ) : (
              "Salva override"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

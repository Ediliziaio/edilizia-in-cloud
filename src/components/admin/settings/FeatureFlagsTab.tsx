import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Zap, Plus, RefreshCw, Globe, Building2 } from "lucide-react";
import { toast } from "sonner";

interface FeatureFlag {
  id: string;
  key: string;
  label: string;
  description: string | null;
  scope: "global" | "company";
  is_active: boolean;
  default_value: boolean;
  updated_at: string;
}

interface NewFlag {
  key: string;
  label: string;
  description: string;
  scope: "global" | "company";
  default_value: boolean;
}

const EMPTY_FLAG: NewFlag = {
  key: "",
  label: "",
  description: "",
  scope: "global",
  default_value: false,
};

export default function FeatureFlagsTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFlag, setNewFlag] = useState<NewFlag>(EMPTY_FLAG);

  const { data: flags = [], isLoading, refetch } = useQuery({
    queryKey: ["feature_flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags" as never)
        .select("*")
        .order("label");
      if (error) throw error;
      return (data ?? []) as FeatureFlag[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("feature_flags" as never)
        .update({ is_active } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature_flags"] });
    },
    onError: (err: Error) => {
      toast.error(`Errore aggiornamento flag: ${err.message}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (flag: NewFlag) => {
      const { error } = await supabase.from("feature_flags" as never).insert({
        key: flag.key.trim().toLowerCase().replace(/\s+/g, "_"),
        label: flag.label.trim(),
        description: flag.description.trim() || null,
        scope: flag.scope,
        is_active: flag.default_value,
        default_value: flag.default_value,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature_flags"] });
      setDialogOpen(false);
      setNewFlag(EMPTY_FLAG);
      toast.success("Feature flag creato");
    },
    onError: (err: Error) => {
      toast.error(`Errore: ${err.message}`);
    },
  });

  const handleToggle = (flag: FeatureFlag) => {
    toggleMutation.mutate({ id: flag.id, is_active: !flag.is_active });
    toast.success(`${flag.label}: ${!flag.is_active ? "abilitato" : "disabilitato"}`);
  };

  const globalFlags = flags.filter((f) => f.scope === "global");
  const companyFlags = flags.filter((f) => f.scope === "company");

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  const FlagRow = ({ flag }: { flag: FeatureFlag }) => (
    <div className="flex items-center justify-between py-3 px-1">
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{flag.label}</span>
          <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {flag.key}
          </code>
        </div>
        {flag.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{flag.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={flag.is_active ? "default" : "secondary"} className="text-xs">
          {flag.is_active ? "Attivo" : "Disattivo"}
        </Badge>
        <Switch
          checked={flag.is_active}
          onCheckedChange={() => handleToggle(flag)}
          disabled={toggleMutation.isPending}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Feature Flags</h1>
          <p className="text-muted-foreground">
            Abilita o disabilita funzionalità globalmente o per azienda specifica
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Aggiorna
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Aggiungi Flag
          </Button>
        </div>
      </div>

      {/* Global flags */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Flag Globali
          </CardTitle>
          <CardDescription>Applicati a tutte le aziende della piattaforma</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {globalFlags.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nessun flag globale configurato
            </p>
          ) : (
            globalFlags.map((flag) => <FlagRow key={flag.id} flag={flag} />)
          )}
        </CardContent>
      </Card>

      {/* Company-scoped flags */}
      {companyFlags.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Flag per Azienda
            </CardTitle>
            <CardDescription>Override attivabili su singole aziende</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {companyFlags.map((flag) => <FlagRow key={flag.id} flag={flag} />)}
          </CardContent>
        </Card>
      )}

      {/* Add flag dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Nuovo Feature Flag
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="flag-key">Chiave (key) *</Label>
              <Input
                id="flag-key"
                placeholder="es. beta_new_dashboard"
                value={newFlag.key}
                onChange={(e) => setNewFlag((p) => ({ ...p, key: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Minuscolo, senza spazi (snake_case)</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flag-label">Etichetta *</Label>
              <Input
                id="flag-label"
                placeholder="es. Nuova Dashboard Beta"
                value={newFlag.label}
                onChange={(e) => setNewFlag((p) => ({ ...p, label: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flag-desc">Descrizione</Label>
              <Textarea
                id="flag-desc"
                placeholder="Descrizione opzionale della funzionalità"
                rows={2}
                value={newFlag.description}
                onChange={(e) => setNewFlag((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flag-scope">Scope</Label>
              <Select
                value={newFlag.scope}
                onValueChange={(v) =>
                  setNewFlag((p) => ({ ...p, scope: v as "global" | "company" }))
                }
              >
                <SelectTrigger id="flag-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Globale (tutte le aziende)</SelectItem>
                  <SelectItem value="company">Per azienda (override)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <Label>Valore di default</Label>
                <p className="text-xs text-muted-foreground">Stato iniziale del flag</p>
              </div>
              <Switch
                checked={newFlag.default_value}
                onCheckedChange={(v) => setNewFlag((p) => ({ ...p, default_value: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => createMutation.mutate(newFlag)}
              disabled={!newFlag.key || !newFlag.label || createMutation.isPending}
            >
              {createMutation.isPending ? "Creazione..." : "Crea Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

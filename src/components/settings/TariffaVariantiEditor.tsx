/**
 * Editor varianti costo manodopera per una tariffa.
 *
 * Sprint B — Varianti Costo Manodopera. Visibile solo ad admin (can_view_costs).
 *
 * Integrato dentro TariffaDialog di SettingsTariffe: l'admin apre una tariffa
 * esistente e in fondo al form vede la lista varianti + CTA per aggiungerne.
 *
 * Varianti disattivate (attivo=false) sono escluse dalla lista a meno che
 * l'utente clicchi "Mostra varianti scadute / disattivate".
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, PowerOff, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/formatters";
import {
  useTariffaVarianti,
  useTariffaVariantiMutations,
  type VarianteCreateInput,
} from "@/hooks/useTariffaVarianti";
import type {
  TariffaCostoVariante,
  ModalitaContabile,
} from "@/types/costVariants";
import {
  MODALITA_CONTABILE_LABELS,
  MODALITA_CONTABILE_ICONS,
} from "@/types/costVariants";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  tariffaId: string;
  costoDefault: number | null;
  /** Squadra della voce stessa (tariffe_aziendali.external_team_id): se la
   *  voce appartiene GIÀ al listino di una squadra, le varianti per squadra
   *  di solito non servono — lo segnaliamo senza vietare nulla. */
  tariffaSquadraId?: string | null;
}

/** Squadra minima per select e badge. */
interface SquadraOption {
  id: string;
  name: string | null;
}

const MODALITA_OPTIONS: ModalitaContabile[] = [
  "dipendente",
  "subappalto_fatturato",
  "subappalto_forfait",
  "forfait",
  "altro",
];

export function TariffaVariantiEditor({ tariffaId, costoDefault, tariffaSquadraId }: Props) {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TariffaCostoVariante | null>(null);
  const [showExpired, setShowExpired] = useState(false);

  const { data: varianti = [], isLoading } = useTariffaVarianti(tariffaId, {
    includeExpired: showExpired,
  });
  const { setDefault, disableVariante, updateVariante: riattivaVariante } = useTariffaVariantiMutations();

  // Squadre/subappaltatori: stessa queryKey della pagina Tariffe → cache
  // condivisa, nessun fetch in più quando l'editor è dentro quel dialog.
  const { data: squadre = [] } = useQuery({
    queryKey: ["external-teams-tariffe", companyId],
    enabled: !!companyId,
    staleTime: 300_000,
    queryFn: async (): Promise<SquadraOption[]> => {
      const { data } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      return data ?? [];
    },
  });
  const squadraName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const sq of squadre) m[sq.id] = sq.name ?? t("Squadra");
    return m;
  }, [squadre, t]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (v: TariffaCostoVariante) => {
    setEditing(v);
    setDialogOpen(true);
  };

  const handleSetDefault = async (v: TariffaCostoVariante) => {
    try {
      await setDefault.mutateAsync({ tariffaId, varianteId: v.id });
      toast.success(t("\"{nome}\" impostata come variante default", { nome: String(v.nome ?? "") }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Errore impostazione default"));
    }
  };

  const handleReactivate = async (v: TariffaCostoVariante) => {
    try {
      await riattivaVariante.mutateAsync({ id: v.id, patch: { attivo: true } });
      toast.success(t("Variante riattivata"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Errore riattivazione"));
    }
  };

  const handleDisable = async (v: TariffaCostoVariante) => {
    if (!confirm(t("Disattivare la variante \"{nome}\"? Le assegnazioni storiche resteranno intatte.", { nome: String(v.nome ?? "") })))
      return;
    try {
      await disableVariante.mutateAsync(v.id);
      toast.success(t("Variante disattivata"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Errore disattivazione"));
    }
  };

  const hasVariants = varianti.length > 0;
  const defaultVar = varianti.find((v) => v.is_default);

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold">{t("Varianti di costo")}</h4>
          <p className="text-xs text-muted-foreground">
            {t("La stessa lavorazione, il costo di chi la fa: legata a una squadra, la variante si applica da sola quando in commessa scegli quella squadra.")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("Aggiungi variante")}
        </Button>
      </div>

      {tariffaSquadraId && (
        <p className="text-xs text-muted-foreground rounded-md bg-background border p-2">
          {t("Questa voce appartiene già al listino di {squadra}: le varianti per squadra servono di solito sulle voci generiche.", { squadra: squadraName[tariffaSquadraId] ?? t("una squadra") })}
        </p>
      )}

      {!hasVariants && !isLoading && (
        <div className="rounded-md bg-background border p-3 text-xs text-muted-foreground">
          {costoDefault != null && costoDefault > 0
            ? t("Questa tariffa usa solo il costo default ({costo}). Aggiungi varianti per distinguere dipendente vs subappaltatori.", { costo: formatCurrency(costoDefault) })
            : t("Questa tariffa usa solo il costo default (non impostato). Aggiungi varianti per distinguere dipendente vs subappaltatori.")}
        </div>
      )}

      {isLoading && (
        <p className="text-xs text-muted-foreground py-2">{t("Caricamento varianti…")}</p>
      )}

      {hasVariants && (
        <div className="space-y-2">
          {varianti.map((v) => {
            const icon = MODALITA_CONTABILE_ICONS[v.modalita_contabile];
            const modLabel = MODALITA_CONTABILE_LABELS[v.modalita_contabile];
            const expired = v.valid_to != null && v.valid_to < new Date().toISOString().slice(0, 10);
            return (
              <div
                key={v.id}
                className={`rounded-md border bg-background p-3 flex items-start justify-between gap-2 flex-wrap ${
                  !v.attivo ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base">{icon}</span>
                    <span className="font-medium">{v.nome}</span>
                    {v.external_team_id && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                        {squadraName[v.external_team_id] ?? t("Squadra")}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">{modLabel}</Badge>
                    {v.is_default && (
                      <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-200">
                        <Star className="h-3 w-3 mr-0.5" /> {t("Default")}
                      </Badge>
                    )}
                    {!v.attivo && <Badge variant="secondary" className="text-xs">{t("Disattivata")}</Badge>}
                    {expired && <Badge variant="destructive" className="text-xs">{t("Scaduta")}</Badge>}
                  </div>
                  {v.descrizione && (
                    <p className="text-xs text-muted-foreground mt-1">{v.descrizione}</p>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {t("Costo:")} <span className="font-semibold text-foreground">{formatCurrency(v.costo)}</span>
                    {v.valid_from && t(" · Dal {valore}", { valore: new Date(v.valid_from).toLocaleDateString(intlCampo()) })}
                    {v.valid_to && t(" · Al {valore}", { valore: new Date(v.valid_to).toLocaleDateString(intlCampo()) })}
                  </div>
                </div>
                <div className="flex gap-1">
                  {!v.is_default && v.attivo && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("Imposta come default")}
                      onClick={() => handleSetDefault(v)}
                    >
                      <StarOff className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" title={t("Modifica")} onClick={() => openEdit(v)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!v.attivo && (
                    <Button variant="ghost" size="sm" title={t("Riattiva")} onClick={() => handleReactivate(v)}>
                      {t("Riattiva")}
                    </Button>
                  )}
                  {v.attivo && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      title={t("Disattiva")}
                      onClick={() => handleDisable(v)}
                    >
                      <PowerOff className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {hasVariants && !defaultVar && (
            <p className="text-xs text-amber-600">
              {t("⚠ Nessuna variante marcata come default: verrà usato il costo della tariffa.")}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground underline"
          onClick={() => setShowExpired((s) => !s)}
        >
          {showExpired ? t("Nascondi varianti scadute / disattivate") : t("Mostra varianti scadute / disattivate")}
        </button>
      </div>

      {dialogOpen && (
        <VarianteDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editing={editing}
          tariffaId={tariffaId}
          squadre={squadre}
        />
      )}
    </div>
  );
}

// ─── Variante Dialog ──────────────────────────────────────────────────────────
function VarianteDialog({
  open,
  onClose,
  editing,
  tariffaId,
  squadre,
}: {
  open: boolean;
  onClose: () => void;
  editing: TariffaCostoVariante | null;
  tariffaId: string;
  squadre: SquadraOption[];
}) {
  const t = useT();
  const { createVariante, updateVariante } = useTariffaVariantiMutations();
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [externalTeamId, setExternalTeamId] = useState(editing?.external_team_id ?? "");
  const [descrizione, setDescrizione] = useState(editing?.descrizione ?? "");
  const [modalita, setModalita] = useState<ModalitaContabile>(
    editing?.modalita_contabile ?? "subappalto_fatturato",
  );
  const [costo, setCosto] = useState(String(editing?.costo ?? ""));
  const [validFrom, setValidFrom] = useState(
    editing?.valid_from ?? new Date().toISOString().slice(0, 10),
  );
  const [validTo, setValidTo] = useState(editing?.valid_to ?? "");
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [fornitoreId, setFornitoreId] = useState(editing?.fornitore_id ?? "");
  const [risorsaId, setRisorsaId] = useState(editing?.risorsa_id ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error(t("Il nome è obbligatorio"));
      return;
    }
    const costoNum = parseFloat(costo);
    if (isNaN(costoNum) || costoNum < 0) {
      toast.error(t("Il costo deve essere un numero ≥ 0"));
      return;
    }
    setSaving(true);
    try {
      const payload: VarianteCreateInput = {
        tariffa_id: tariffaId,
        nome: nome.trim(),
        descrizione: descrizione.trim() || null,
        modalita_contabile: modalita,
        external_team_id: externalTeamId || null,
        fornitore_id: fornitoreId.trim() || null,
        risorsa_id: risorsaId.trim() || null,
        costo: costoNum,
        valid_from: validFrom,
        valid_to: validTo.trim() || null,
        is_default: isDefault,
        // Modificare una variante disattivata non la riattiva di nascosto: per quello c'è «Riattiva».
        attivo: editing ? editing.attivo !== false : true,
        sort_order: editing?.sort_order ?? 0,
      };
      if (editing) {
        await updateVariante.mutateAsync({ id: editing.id, patch: payload });
        toast.success(t("Variante aggiornata"));
      } else {
        await createVariante.mutateAsync(payload);
        toast.success(t("Variante creata"));
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Errore salvataggio variante"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t("Modifica variante costo") : t("Nuova variante costo")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Prima "di chi è", poi il nome: scegliendo la squadra il nome si
              precompila da solo (solo se il campo è ancora vuoto). */}
          {squadre.length > 0 && (
            <div>
              <Label>{t("Squadra")}</Label>
              <Select
                value={externalTeamId || "generico"}
                onValueChange={(v) => {
                  const id = v === "generico" ? "" : v;
                  setExternalTeamId(id);
                  if (id && !nome.trim()) {
                    const sq = squadre.find((s) => s.id === id);
                    if (sq?.name) setNome(sq.name);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Variante generica")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generico">{t("Generica (nessuna squadra)")}</SelectItem>
                  {squadre.map((sq) => (
                    <SelectItem key={sq.id} value={sq.id}>{sq.name ?? t("Squadra")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {t("Legata a una squadra, si applica da sola quando in commessa scegli quella squadra.")}
              </p>
            </div>
          )}
          <div>
            <Label>{t("Nome *")}</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={t("Es. Subappalto Bianchi, Squadra interna")}
            />
          </div>
          <div>
            <Label>{t("Descrizione")}</Label>
            <Textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder={t("Opzionale")}
              rows={2}
            />
          </div>
          <div>
            <Label>{t("Modalità contabile *")}</Label>
            <Select value={modalita} onValueChange={(v) => setModalita(v as ModalitaContabile)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODALITA_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODALITA_CONTABILE_ICONS[m]} {MODALITA_CONTABILE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("Costo unitario € *")}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t("Valido dal *")}</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("Valido al (opz.)")}</Label>
              <Input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                min={validFrom}
              />
            </div>
          </div>
          {/* FK deboli: gli autocomplete fornitori/risorse saranno aggiunti quando le tabelle target saranno definite (vedi §3.1 masterprompt). */}
          <div>
            <Label className="text-xs text-muted-foreground">
              {t("ID fornitore (opz.) · ID risorsa HR (opz.)")}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={fornitoreId}
                onChange={(e) => setFornitoreId(e.target.value)}
                placeholder={t("UUID fornitore")}
                className="text-xs"
              />
              <Input
                value={risorsaId}
                onChange={(e) => setRisorsaId(e.target.value)}
                placeholder={t("UUID risorsa")}
                className="text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("Quando i moduli Fornitori/HR saranno attivi, questi ID verranno risolti in un dropdown.")}
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">{t("Imposta come variante default per questa tariffa")}</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("Annulla")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("Salvataggio…") : editing ? t("Aggiorna") : t("Crea variante")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

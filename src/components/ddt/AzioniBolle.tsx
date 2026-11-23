import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import type { ModificheBolle } from "@/lib/ddt/importBolle";
import type { FornitoreInRubrica } from "@/lib/ddt/abbinaFornitore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function AzioniBolle({
  companyId,
  fornitori,
  selezionate,
  totale,
  disabled,
  onSeleziona,
  onApplica,
  onTogli,
  onDuplicati,
}: {
  companyId?: string;
  fornitori: FornitoreInRubrica[];
  selezionate: number;
  totale: number;
  disabled: boolean;
  onSeleziona: (tutte: boolean) => void;
  onApplica: (patch: ModificheBolle) => void;
  onTogli: () => void;
  onDuplicati: () => void;
}) {
  const t = useT();
  const [fornitore, setFornitore] = useState("invariato");
  const [destinazione, setDestinazione] = useState("invariata");
  const [commessa, setCommessa] = useState<string | null | undefined>();
  const [magazzino, setMagazzino] = useState<string | null>();
  const patch: ModificheBolle = {
    ...(fornitore !== "invariato"
      ? { supplierId: fornitore === "nessuno" ? null : fornitore }
      : {}),
    ...(destinazione !== "invariata"
      ? { destinazione: destinazione as "magazzino" | "cantiere" }
      : {}),
    ...(commessa !== undefined ? { orderId: commessa } : {}),
    ...(magazzino ? { warehouseId: magazzino } : {}),
  };
  return (
    <section
      aria-label={t("Azioni multiple sulle bolle")}
      className="space-y-3 rounded-xl border bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            aria-label={t("Seleziona tutte le bolle modificabili")}
            disabled={disabled || !totale}
            checked={
              selezionate === totale && totale > 0
                ? true
                : selezionate
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(v) => onSeleziona(v === true)}
          />
          {t(selezionate === 1 ? "{selezionate} selezionata su {totale}" : "{selezionate} selezionate su {totale}", { selezionate, totale })}
        </label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={onDuplicati}
        >
          {t("Escludi duplicati")}
        </Button>
      </div>
      {selezionate > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {t("Scegli i dati comuni, poi applicali alle bolle selezionate. I campi non scelti restano invariati.")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs font-medium">
              {t("Fornitore")}
              <Select
                value={fornitore}
                disabled={disabled}
                onValueChange={setFornitore}
              >
                <SelectTrigger aria-label={t("Fornitore per le bolle selezionate")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invariato">{t("Non cambiare")}</SelectItem>
                  <SelectItem value="nessuno">{t("Rimuovi collegamento")}</SelectItem>
                  {fornitori.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              {t("Destinazione")}
              <Select
                value={destinazione}
                disabled={disabled}
                onValueChange={setDestinazione}
              >
                <SelectTrigger aria-label={t("Destinazione per le bolle selezionate")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invariata">{t("Non cambiare")}</SelectItem>
                  <SelectItem value="magazzino">{t("Magazzino")}</SelectItem>
                  <SelectItem value="cantiere">{t("Cantiere")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div className="space-y-1 text-xs font-medium">
              <span>{t("Commessa")}</span>
              <OrderSelectCombobox
                companyId={companyId}
                value={commessa ?? undefined}
                disabled={disabled}
                filtroIniziale="all"
                placeholder={
                  commessa === null ? t("Sarà rimossa") : t("Non cambiare")
                }
                onChange={(id) => setCommessa(id)}
              />
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                disabled={disabled}
                onClick={() => setCommessa(null)}
              >
                {t("Rimuovi commessa")}
              </Button>
            </div>
            <div className="space-y-1 text-xs font-medium">
              <span>{t("Magazzino")}</span>
              <WarehouseSelect
                value={magazzino}
                disabled={disabled}
                onChange={setMagazzino}
                placeholder={t("Non cambiare")}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled || !Object.keys(patch).length}
              onClick={() => {
                onApplica(patch);
                setFornitore("invariato");
                setDestinazione("invariata");
                setCommessa(undefined);
                setMagazzino(undefined);
              }}
            >
              {t(selezionate === 1 ? "Applica a {selezionate} bolla" : "Applica a {selezionate} bolle", { selezionate })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={onTogli}
            >
              {t("Togli selezionate dal caricamento")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

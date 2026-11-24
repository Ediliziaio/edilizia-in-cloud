import { UniformSelect } from "@/components/ui/uniform-select";
import { permissionChanges } from "@/lib/users/permissionChanges";
import { useId, useState } from "react";
import { Sparkles, ArrowRight, Check } from "lucide-react";
import type { StaffPermissions } from "./PermissionsDialog";
import { OFFICE_PROFILES, applyOfficeProfile } from "@/lib/users/officeProfiles";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function OfficeProfileSelector({ permissions, onChange, disabled = false }: {
  permissions: StaffPermissions;
  disabled?: boolean;
  onChange: (value: StaffPermissions) => void;
}) {
  const t = useT();
  const id = useId();
  const [choice, setChoice] = useState("");
  const profile = OFFICE_PROFILES[permissions.office_profile ?? ""];
  const next = choice ? applyOfficeProfile(permissions, choice) : permissions;
  const changes = permissionChanges(permissions,next).filter(change=>typeof change.after === "boolean");
  const enabled = changes.filter(change => change.after === true);
  const removed = changes.filter(change => change.after === false);
  const baseline = profile ? applyOfficeProfile(permissions, permissions.office_profile!) : permissions;
  const customized = profile && permissionChanges(permissions,baseline).some(change=>change.key !== "office_profile");

  return <section aria-label={t("Modello di permessi")} className="rounded-xl border bg-muted/20 p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />{t("Modello di permessi")} <span className="font-normal text-muted-foreground">{t("· facoltativo")}</span></h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("Parti da una configurazione per reparto, poi personalizza le autorizzazioni. Il tipo di accesso resta invariato.")}</p>
      </div>
      <span className="rounded-full border bg-background px-2.5 py-1 text-xs">{profile ? (customized ? t("Modello di partenza: {modello} · personalizzato", { modello: t(profile.label) }) : t("Modello di partenza: {modello}", { modello: t(profile.label) })) : t("Configurazione personalizzata")}</span>
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <div><label htmlFor={id} className="text-xs font-medium">{t("Prepara i permessi da un modello")}</label>
        <UniformSelect id={id} disabled={disabled} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm" value={choice} onChange={e => setChoice(e.target.value)}>
          <option value="">{t("Scegli un modello…")}</option>
          {Object.entries(OFFICE_PROFILES).map(([key, p]) => <option key={key} value={key}>{t(p.label)}</option>)}
        </UniformSelect>
      </div>
      <Button type="button" variant="outline" disabled={disabled || !choice} onClick={() => { onChange(next); setChoice(""); }}><ArrowRight className="mr-2 h-4 w-4" />{t("Applica alla bozza")}</Button>
    </div>
    {choice ? <div aria-live="polite" className="rounded-lg border bg-background p-3 text-xs space-y-2">
      <p className="font-medium">{t("Anteprima: {label}", { label: t(OFFICE_PROFILES[choice].label) })}</p>
      <p>{t("Il modello sostituisce i permessi personalizzati: {n} da abilitare, {n2} da disabilitare. I limiti su magazzini e pipeline e la sola lettura restano invariati. Il limite CRM è mantenuto; il modello commerciale lo attiva.", { n: enabled.length, n2: removed.length })}</p>
      {changes.length > 0 && <details><summary className="cursor-pointer font-medium">{t("Vedi le autorizzazioni che cambiano")}</summary><ul className="mt-2 max-h-48 overflow-auto space-y-1">{changes.map(change => <li key={change.key}>{change.after ? t("Abilita") : t("Disabilita")}: {t(change.label)}</li>)}</ul></details>}
      <p className="text-muted-foreground">{t("Nessuna modifica è ancora applicata. Dopo “Applica alla bozza”, controlla e salva i permessi.")}</p>
      <button type="button" className="underline underline-offset-2" onClick={() => setChoice("")}>{t("Annulla scelta")}</button>
    </div> : <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("Valgono le autorizzazioni qui sotto, anche se diverse dal modello di partenza.")}</p>}
  </section>;
}

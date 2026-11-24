
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Informativa contestuale, prima del consenso OAuth e della riconnessione. */
export function GoogleEmailPrivacyNotice() {
  const t = useT();
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {t("Con Gmail leggiamo messaggi e allegati per mostrarli nella posta e inviamo le email che scrivi o approvi. Le funzioni AI abilitate possono elaborare i contenuti tramite i nostri fornitori. Puoi scollegare la casella; le copie già importate restano nel CRM fino alla loro cancellazione secondo l'informativa.")}{" "}
      <a href="https://www.ediliziaincloud.com/privacy-policy/#dati-account-google" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {t("Privacy dei dati Google")}
      </a>
      .
    </p>
  );
}

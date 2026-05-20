/**
 * SettingsIndexRoute — v8.6.70 (rev. 2026-05-20)
 *
 * Component renderizzato dalla route index di /azienda/impostazioni.
 * MOBILE + DESKTOP: mostra la griglia di icone (SettingsMobileHub) per
 * scegliere la sezione. Prima il desktop redirect automatico a /mio-profilo
 * nascondeva le sezioni meno comuni (Memoria AI, Notifiche, ecc.) ai nuovi
 * utenti — il hub griglia rende tutto scopribile senza Cmd+K.
 *
 * Per chi vuole tornare diretto a mio-profilo: la card "Il mio profilo" è
 * prima nel hub. 1 click in più, ma -infinite confusione per esplorazione.
 */
import SettingsMobileHub from "./SettingsMobileHub";

export default function SettingsIndexRoute() {
  return <SettingsMobileHub />;
}

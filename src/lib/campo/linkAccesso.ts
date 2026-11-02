/** Accesso all'app di cantiere con un link: stesso dominio di supabase/functions/_shared/emailSuppression.ts. */
const DOMINIO_ACCESSO_CON_LINK = "operai.ediliziaincloud.com";

export function eAccessoConLink(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(`@${DOMINIO_ACCESSO_CON_LINK}`);
}

export function testoLinkAccesso(nome: string, azienda: string | null | undefined, url: string): string {
  const primoNome = nome.trim().split(/\s+/)[0];
  return [
    `Ciao ${primoNome}${azienda ? `, da ${azienda}` : ""}.`,
    "Apri questo link e tocca «Entra» per usare l'app di cantiere: timbri e mandi il rapportino dal telefono.",
    "Non serve nessuna password. Vale una volta sola, non girarlo a nessuno.",
    url,
  ].join("\n");
}

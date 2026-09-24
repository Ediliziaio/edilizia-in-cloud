// Un cliente senza accesso al portale (24/09/2026).
//
// Il portale clienti lo accende solo EdiliziaInCloud, e col portale spento ogni
// cliente è bloccato (migrazione 20280924110000). L'accesso lo chiude il
// database, ma le email partivano lo stesso: «Password dimenticata», «Reimposta
// password» dell'amministratore, gli inviti. Il cliente riceveva un link o una
// password per un portale in cui non può entrare.
//
// Qui si riconosce quel cliente: solo il ruolo «customer» e il profilo bloccato.
// Chi ha anche un altro ruolo (un dipendente che è anche cliente) non è toccato.
// Se la lettura non riesce la risposta è «no»: l'email parte come prima, e
// l'accesso resta comunque chiuso dal database.
export async function clienteSenzaAccesso(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const [profilo, ruoli] = await Promise.all([
      admin.from("profiles").select("is_blocked").eq("id", userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (profilo.error || ruoli.error || !profilo.data) return false;
    const nomi: string[] = (ruoli.data ?? []).map((r: { role: string }) => r.role);
    return profilo.data.is_blocked === true && nomi.length > 0 && nomi.every((r) => r === "customer");
  } catch {
    return false;
  }
}

/** Il messaggio per chi prova a dare una password a un cliente senza accesso. */
export const MESSAGGIO_CLIENTE_SENZA_ACCESSO =
  "Il portale clienti di questa azienda non è attivo: il cliente non ha un accesso, quindi non c'è una password da reimpostare.";

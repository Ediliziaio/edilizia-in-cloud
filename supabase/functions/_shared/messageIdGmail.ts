/**
 * Il Message-ID vero di un'email appena spedita da Gmail.
 *
 * L'id che Gmail restituisce all'invio è interno a Gmail; chi risponde cita
 * nell'In-Reply-To il Message-ID in forma `<…@…>`, che si legge dopo l'invio.
 * Se la lettura non riesce l'email resta spedita: si perde solo il riconoscimento
 * automatico delle risposte, quindi qui non si lancia mai.
 */
type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function messageIdGmail(accessToken: string, idGmail: string, chiama: Fetch = fetch as unknown as Fetch): Promise<string | null> {
  try {
    const res = await chiama(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(idGmail)}?format=metadata&metadataHeaders=Message-ID`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      console.warn(`[email-send] Message-ID Gmail non letto: ${res.status}`);
      return null;
    }
    const dati = await res.json() as { payload?: { headers?: Array<{ name?: string; value?: string }> } };
    const valore = dati.payload?.headers?.find((h) => h.name?.toLowerCase() === "message-id")?.value?.trim();
    return valore || null;
  } catch (e) {
    console.warn("[email-send] Message-ID Gmail non letto:", e instanceof Error ? e.message : e);
    return null;
  }
}

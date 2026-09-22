/**
 * Il contatto di una prenotazione dalla pagina pubblica (22/09/2026).
 *
 * Prima l'appuntamento nasceva senza contatto: niente scheda nel CRM, niente
 * evento per le automazioni (il trigger del database esce se contact_id è
 * vuoto), niente promemoria né variabili dell'appuntamento. Qui lo si trova o
 * lo si crea, nell'azienda del calendario:
 *   1. il link personale dei messaggi (?c=<id contatto>), se è di quell'azienda;
 *   2. la stessa email (senza badare a maiuscole; se ce ne sono più d'una,
 *      la più recente — un confronto esatto andava in errore sui doppioni);
 *   3. lo stesso cellulare (ultime nove cifre, come le campagne WhatsApp);
 *   4. altrimenti un contatto nuovo.
 * Di un contatto trovato si riempiono solo email o telefono mancanti: i dati
 * che ci sono non si toccano.
 */

// deno-lint-ignore-file no-explicit-any

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le ultime nove cifre di un numero ("" se sono meno): +39 351 307 1326 → 513071326. */
export function ultimeNoveCifre(tel: string | null | undefined): string {
  const cifre = String(tel ?? "").replace(/\D/g, "");
  return cifre.length >= 9 ? cifre.slice(-9) : "";
}

/** Un testo usato dentro ILIKE come uguaglianza: % e _ non devono fare da jolly. */
export function comeUguaglianzaIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface DatiPrenotante {
  companyId: string;
  contattoId?: string | null;
  email?: string | null;
  telefono?: string | null;
  nome: string;
  cognome?: string | null;
  slug: string;
}

async function completaRecapiti(admin: any, c: { id: string; email: string | null; phone: string | null }, d: DatiPrenotante) {
  const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
  if (!c.email && d.email) patch.email = d.email;
  if (!c.phone && d.telefono) patch.phone = d.telefono;
  await admin.from("marketing_contacts").update(patch).eq("id", c.id);
}

/**
 * Id del contatto della prenotazione, o null se non si è riusciti: in quel caso
 * la prenotazione resta valida (è l'appuntamento che conta per chi prenota).
 */
export async function contattoDellaPrenotazione(admin: any, d: DatiPrenotante): Promise<string | null> {
  const campi = "id, email, phone";
  const base = () => admin.from("marketing_contacts").select(campi).eq("company_id", d.companyId).is("deleted_at", null);

  try {
    if (d.contattoId && UUID_RE.test(d.contattoId)) {
      const { data } = await base().eq("id", d.contattoId).maybeSingle();
      if (data?.id) {
        await completaRecapiti(admin, data, d);
        return data.id;
      }
    }

    if (d.email) {
      const { data } = await base()
        .ilike("email", comeUguaglianzaIlike(d.email))
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (data?.[0]?.id) {
        await completaRecapiti(admin, data[0], d);
        return data[0].id;
      }
    }

    const nove = ultimeNoveCifre(d.telefono);
    if (nove) {
      // Le ultime quattro cifre stanno quasi sempre attaccate anche nei numeri
      // scritti con gli spazi; il confronto vero si fa sulle nove.
      const { data } = await base().ilike("phone", `%${nove.slice(-4)}%`).limit(50);
      const trovato = (data ?? []).find((c: any) => ultimeNoveCifre(c.phone) === nove);
      if (trovato?.id) {
        await completaRecapiti(admin, trovato, d);
        return trovato.id;
      }
    }

    const { data: nuovo, error } = await admin.from("marketing_contacts").insert({
      company_id: d.companyId,
      first_name: d.nome,
      last_name: d.cognome || null,
      email: d.email || null,
      phone: d.telefono || null,
      source: `prenotazione — ${d.slug}`,
      contact_type: "lead",
      tags: ["prenotazione"],
      last_activity_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw error;
    return nuovo?.id ?? null;
  } catch (e) {
    console.error("[contattoPrenotazione] contatto non collegato:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Promemoria appuntamento del bot operativo (28/09/2026): logica pura per capire
 * quali appuntamenti di oggi stanno per iniziare (entro l'anticipo scelto) e per
 * comporre il messaggio. L'orario è locale (Europe/Rome): il chiamante passa i
 * minuti da mezzanotte di adesso e la data di oggi in Italia.
 */

export interface AppuntamentoRow {
  id: string;
  title?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  formatted_address?: string | null;
  address_line?: string | null;
  address_city?: string | null;
  assigned_to?: string | null;
  order_id?: string | null;
}

/** "14:30" / "14:30:00" → 870 minuti; null se non valido. */
export function minutiDaHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Appuntamenti di oggi che iniziano tra adesso e (adesso + anticipoMin). */
export function appuntamentiImminenti(
  appts: AppuntamentoRow[],
  oggiRoma: string,
  nowMinuti: number,
  anticipoMin: number,
): AppuntamentoRow[] {
  const finestra = Math.max(1, Math.round(anticipoMin || 0));
  return (appts ?? []).filter((a) => {
    if (!a || a.appointment_date !== oggiRoma) return false;
    const m = minutiDaHHMM(a.appointment_time);
    if (m === null) return false;
    const delta = m - nowMinuti;
    return delta >= 0 && delta <= finestra;
  });
}

export function luogoAppuntamento(a: AppuntamentoRow): string | null {
  if (a.formatted_address?.trim()) return a.formatted_address.trim();
  const parti = [a.address_line, a.address_city].filter((x) => x && String(x).trim());
  return parti.length > 0 ? parti.join(", ") : null;
}

export function componiPromemoriaAppuntamento(a: AppuntamentoRow): string {
  const ora = (a.appointment_time ?? "").slice(0, 5);
  const luogo = luogoAppuntamento(a);
  const righe = [`⏰ Tra poco: *${a.title?.trim() || "appuntamento"}*`];
  if (ora) righe.push(`🕐 alle ${ora}`);
  if (luogo) righe.push(`📌 ${luogo}`);
  return righe.join("\n");
}

/**
 * Gli appuntamenti di oggi sui calendari della piattaforma, per «Cosa fare
 * oggi» dell'email del mattino (25/09/2026): demo, chiamate conoscitive,
 * consulenze dei tre brand, con il numero da comporre.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AppuntamentoOggi } from "../_shared/mattino.ts";

const PIATTAFORMA = "00000000-0000-0000-0000-000000000001";

const TIPO: Record<string, string> = {
  chiamata: "Chiamata conoscitiva",
  videocall: "Videochiamata",
  appuntamento: "Appuntamento",
};

/** «venerdì 26 settembre», ora di Roma. */
export function giornoLungo(adesso = new Date()): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" }).format(adesso);
}

export async function appuntamentiDiOggi(supabase: SupabaseClient, adesso = new Date()): Promise<AppuntamentoOggi[]> {
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(adesso);
  const { data, error } = await supabase.from("appointments")
    .select("appointment_time, appointment_type, title, contact_id, calendar_id")
    .eq("company_id", PIATTAFORMA).eq("appointment_date", oggi)
    .not("status", "in", '("annullato","cancelled","canceled")')
    .order("appointment_time").limit(30);
  if (error) throw new Error(`appuntamenti: ${error.message}`);
  const righe = (data ?? []) as Array<{ appointment_time: string | null; appointment_type: string | null; title: string | null; contact_id: string | null; calendar_id: string | null }>;
  if (!righe.length) return [];

  const idContatti = [...new Set(righe.map((r) => r.contact_id).filter(Boolean))] as string[];
  const idCalendari = [...new Set(righe.map((r) => r.calendar_id).filter(Boolean))] as string[];
  const [{ data: contatti }, { data: calendari }] = await Promise.all([
    idContatti.length
      ? supabase.from("marketing_contacts").select("id, first_name, last_name, company_name, phone").in("id", idContatti)
      : Promise.resolve({ data: [] }),
    idCalendari.length
      ? supabase.from("marketing_calendars").select("id, name").in("id", idCalendari)
      : Promise.resolve({ data: [] }),
  ]);
  const rubrica = new Map(((contatti ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; company_name: string | null; phone: string | null }>)
    .map((c) => [c.id, c]));
  const nomeCalendario = new Map(((calendari ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));

  return righe.map((r) => {
    const c = r.contact_id ? rubrica.get(r.contact_id) : undefined;
    const persona = [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();
    return {
      ora: String(r.appointment_time ?? "").slice(0, 5),
      tipo: TIPO[String(r.appointment_type ?? "")] ?? "Appuntamento",
      chi: persona || c?.company_name || r.title || "contatto senza nome",
      azienda: c?.company_name ?? null,
      telefono: c?.phone ?? null,
      calendario: r.calendar_id ? nomeCalendario.get(r.calendar_id) ?? null : null,
    };
  });
}

/**
 * Quello che il PDF del cronoprogramma mette in testa (31/10/2026): l'azienda
 * col suo logo, e, se si vuole la versione «con chi lavora», il responsabile
 * della commessa, il capocantiere e chi lavora in ogni fase (dipendenti e ditte).
 * Si legge solo quando si stampa, non a ogni apertura della pagina.
 */
import { supabase } from "@/integrations/supabase/client";
import { caricaAccessiCommessa, nomeAccesso } from "@/hooks/useAccessiCommessa";

export interface AziendaStampa { nome: string; contatti: string; logo: { dataUrl: string; largo: number; alto: number } | null }
export interface PersoneStampa {
  responsabile: string | null;
  capocantiere: string | null;
  /** Chi lavora in ogni fase (id fase), dipendenti prima e ditte dopo. */
  perFase: Map<string, string[]>;
  /** Le ditte esterne (subappaltatori) di tutta la commessa. */
  ditte: string[];
}

/** Il logo come PNG in data URL (qualunque formato il browser sappia disegnare), o null. */
async function logoPng(url: string): Promise<AziendaStampa["logo"]> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("logo")); img.src = url; });
    const scala = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scala));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), largo: canvas.width, alto: canvas.height };
  } catch {
    return null; // senza logo il PDF esce lo stesso
  }
}

export async function aziendaPerStampa(orderId: string): Promise<AziendaStampa | null> {
  const db = supabase as unknown as { from: (t: string) => any };
  const { data: ordine } = await db.from("orders").select("company_id").eq("id", orderId).maybeSingle();
  if (!ordine?.company_id) return null;
  const { data: az } = await db.from("companies").select("name, logo_url, phone, email, vat_number").eq("id", ordine.company_id).maybeSingle();
  if (!az) return null;
  return {
    nome: az.name ?? "",
    contatti: [az.phone, az.email, az.vat_number ? `P. IVA ${az.vat_number}` : null].filter(Boolean).join(" · "),
    logo: az.logo_url ? await logoPng(az.logo_url) : null,
  };
}

/** Chi lavora: le assegnazioni delle fasi le ha già la pagina; responsabile e capocantiere si leggono qui. */
export async function personePerStampa(
  orderId: string,
  assegnazioni: ReadonlyArray<{ phase_id: string | null; executor_label?: string | null; executor_kind?: "interna" | "esterna" }>,
): Promise<PersoneStampa> {
  const db = supabase as unknown as { from: (t: string) => any };
  const [{ data: ordine }, accessi] = await Promise.all([
    db.from("orders").select("assigned_to").eq("id", orderId).maybeSingle(),
    caricaAccessiCommessa(orderId).catch((): Awaited<ReturnType<typeof caricaAccessiCommessa>> => []),
  ]);
  let responsabile: string | null = null;
  if (ordine?.assigned_to) {
    const { data: p } = await db.from("profiles").select("first_name, last_name, email").eq("id", ordine.assigned_to).maybeSingle();
    responsabile = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || null : null;
  }
  const capo = accessi.find((a) => a.is_capocantiere);
  const perFase = new Map<string, string[]>();
  const ditte = new Set<string>();
  const ordinate = [...assegnazioni].sort((a, b) => (a.executor_kind === "esterna" ? 1 : 0) - (b.executor_kind === "esterna" ? 1 : 0));
  for (const a of ordinate) {
    const nome = a.executor_label?.trim();
    if (!nome) continue;
    if (a.executor_kind === "esterna") ditte.add(nome);
    if (!a.phase_id) continue;
    const elenco = perFase.get(a.phase_id) ?? [];
    if (!elenco.includes(nome)) elenco.push(nome);
    perFase.set(a.phase_id, elenco);
  }
  return { responsabile, capocantiere: capo ? nomeAccesso(capo) : null, perFase, ditte: [...ditte] };
}

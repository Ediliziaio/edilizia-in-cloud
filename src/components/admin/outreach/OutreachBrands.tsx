import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Building2, AtSign, CornerUpLeft, PenLine, MapPin, Check, Clock, Link2 } from "lucide-react";
import { isMissingTableError, MigrationGate } from "./_shared";
import { FieldLabel } from "./deliverabilityUi";

/**
 * Gestione Brand = pool isolati di domini+caselle per il cold multi-brand.
 * Ogni sequenza sceglie un brand e spedisce solo dai suoi domini (reputazione
 * separata per marchio). Stile Instantly/Smartlead: card pulite con identità
 * mittente, firma e indirizzo footer. Tabella outreach_brands (migrazione 20270817000000).
 */

const T = "outreach_brands";
interface Brand {
  id: string; name: string; from_name: string | null; reply_to: string | null; status: string;
  signature: string | null; footer_address: string | null;
  send_window?: Finestra | null;
  /** Base dei link di tracciamento/disiscrizione sul dominio del brand (es. https://link.dominio.it/l). */
  tracking_base_url?: string | null;
  /** Tetto di PRIMI contatti al giorno per casella (i follow-up restano nel tetto totale). */
  new_per_day?: number | null;
  /** Email che sembrano scritte a mano: niente List-Unsubscribe, link o pixel; opt-out rispondendo; follow-up che citano. */
  stile_umano?: boolean | null;
}
/** Finestra di invio del brand (stesso formato del setting globale). 0=Dom … 6=Sab. */
interface Finestra { days: number[]; startHour: number; endHour: number; timeZone: string }
const GIORNI: Array<[number, string]> = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Gio"], [5, "Ven"], [6, "Sab"], [0, "Dom"]];
function descriviFinestra(f: Finestra | null | undefined): string {
  if (!f) return "globale";
  const g = GIORNI.filter(([n]) => f.days.includes(n)).map(([, l]) => l).join(" ");
  return `${g || "nessun giorno"} · ${f.startHour}-${f.endHour}`;
}
function FinestraEditor({ value, onChange }: { value: Finestra | null; onChange: (v: Finestra | null) => void }) {
  const f = value ?? { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 19, timeZone: "Europe/Rome" };
  const attiva = value != null;
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={attiva} onChange={(e) => onChange(e.target.checked ? f : null)} /> Orari propri del brand (altrimenti finestra globale)</label>
      {attiva && (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="number" min={0} max={23} value={f.startHour} onChange={(e) => onChange({ ...f, startHour: Number(e.target.value) })} className="h-7 w-16 text-xs" aria-label="Dalle" />
          <span className="text-xs text-muted-foreground">-</span>
          <Input type="number" min={1} max={24} value={f.endHour} onChange={(e) => onChange({ ...f, endHour: Number(e.target.value) })} className="h-7 w-16 text-xs" aria-label="Alle" />
          {GIORNI.map(([n, l]) => (
            <button key={n} type="button" aria-pressed={f.days.includes(n)}
              onClick={() => onChange({ ...f, days: f.days.includes(n) ? f.days.filter((x) => x !== n) : [...f.days, n] })}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${f.days.includes(n) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OutreachBrands({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [signature, setSignature] = useState("");
  const [footerAddress, setFooterAddress] = useState("");
  const [finestra, setFinestra] = useState<Finestra | null>(null);
  const [trackingBase, setTrackingBase] = useState("");
  const [nuoviAlGiorno, setNuoviAlGiorno] = useState("");
  const [stileUmano, setStileUmano] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const q = useQuery({
    queryKey: ["outreach-brands", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.from(T).select("*").eq("company_id", companyId).order("created_at");
      if (error) throw error;
      return (data ?? []) as Brand[];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["outreach-brands", companyId] });

  const add = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome brand mancante");
      const { error } = await db.from(T).insert({
        company_id: companyId, name: name.trim(),
        from_name: fromName.trim() || null, reply_to: replyTo.trim() || null,
        signature: signature.trim() || null, footer_address: footerAddress.trim() || null,
        send_window: finestra,
        tracking_base_url: trackingBase.trim() || null,
        new_per_day: nuoviAlGiorno.trim() ? Number(nuoviAlGiorno) : null,
        stile_umano: stileUmano,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Brand creato"); setName(""); setFromName(""); setReplyTo(""); setSignature(""); setFooterAddress(""); setFinestra(null); setTrackingBase(""); setNuoviAlGiorno(""); setShow(false); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const salvaRitmo = useMutation({
    mutationFn: async ({ id, trackingBase: tb, nuoviAlGiorno: n, stileUmano: su }: { id: string; trackingBase: string; nuoviAlGiorno: string; stileUmano: boolean }) => {
      const base = tb.trim();
      if (base && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(base)) throw new Error("La base dei link deve essere un indirizzo https:// (es. https://link.tuodominio.it/l)");
      const nuovi = n.trim() ? Number(n) : null;
      if (nuovi !== null && (!Number.isInteger(nuovi) || nuovi < 0)) throw new Error("«Nuovi al giorno» deve essere un numero intero");
      const { error } = await db.from(T).update({ tracking_base_url: base || null, new_per_day: nuovi, stile_umano: su }).eq("id", id); if (error) throw error;
    },
    onSuccess: () => { toast.success("Ritmo e link del brand salvati"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const salvaFinestra = useMutation({
    mutationFn: async ({ id, finestra: f }: { id: string; finestra: Finestra | null }) => {
      const { error } = await db.from(T).update({ send_window: f }).eq("id", id); if (error) throw error;
    },
    onSuccess: () => { toast.success("Orari del brand salvati"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from(T).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Brand eliminato"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  if (q.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-muted/30 p-5">
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-20 animate-pulse rounded-lg bg-muted/70" />
        </div>
      </section>
    );
  }
  if (q.error && isMissingTableError(q.error)) {
    return <MigrationGate title="Brand (pool mittenti) — pronto" unlocks={[
      "Raggruppa domini e caselle per brand (es. 5 domini per ogni marchio).",
      "Ogni sequenza spedisce solo dal pool del suo brand: reputazione separata.",
      "From-name e reply-to dedicati per brand.",
    ]} />;
  }
  if (q.error) return <Card><CardContent className="p-4 text-sm text-red-600">Errore: {q.error instanceof Error ? q.error.message : "imprevisto"}</CardContent></Card>;

  const brands = q.data ?? [];
  return (
    <section className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Building2 className="h-4 w-4 text-primary" /> Brand · pool mittenti
          </h3>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
            Ogni brand è un pool isolato di domini + caselle. Le sequenze scelgono il brand e spediscono solo da quei domini (reputazione separata per marchio).
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-card" onClick={() => setShow((v) => !v)}><Plus className="h-3.5 w-3.5" /> Brand</Button>
      </header>

      {show && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><FieldLabel>Nome brand</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Edilizia in Cloud — cold" className="h-9" /></div>
            <div className="space-y-1.5"><FieldLabel>From name</FieldLabel>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Edilizia in Cloud" className="h-9" /></div>
            <div className="space-y-1.5"><FieldLabel>Reply-to</FieldLabel>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="risposte@dominio" className="h-9 font-mono" /></div>
            <div className="space-y-1.5 sm:col-span-3"><FieldLabel>Firma email</FieldLabel>
              <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={"Cordiali saluti,\n{{first_name}}\nEdilizia in Cloud"} rows={3} className="text-sm" />
              <p className="text-[11px] text-muted-foreground">Appesa in fondo a ogni email. Supporta {"{{first_name}}"} e spintax.</p></div>
            <div className="space-y-1.5 sm:col-span-3"><FieldLabel>Indirizzo (footer)</FieldLabel>
              <Input value={footerAddress} onChange={(e) => setFooterAddress(e.target.value)} placeholder="Via Roma 1, 20100 Milano (MI)" className="h-9" />
              <p className="text-[11px] text-muted-foreground">Indirizzo postale nel footer (obbligo anti-spam).</p></div>
            <div className="space-y-1.5 sm:col-span-2"><FieldLabel>Link su dominio del brand</FieldLabel>
              <Input value={trackingBase} onChange={(e) => setTrackingBase(e.target.value)} placeholder="https://link.tuodominio.it/l" className="h-9 font-mono" />
              <p className="text-[11px] text-muted-foreground">Base dei link di tracciamento e disiscrizione. Vuoto = dominio di piattaforma: un dominio estraneo al mittente in ogni email.</p></div>
            <div className="space-y-1.5"><FieldLabel>Nuovi al giorno / casella</FieldLabel>
              <Input value={nuoviAlGiorno} onChange={(e) => setNuoviAlGiorno(e.target.value)} placeholder="3" inputMode="numeric" className="h-9" />
              <p className="text-[11px] text-muted-foreground">Solo primi contatti; i follow-up restano nel tetto totale.</p></div>
            <div className="space-y-1.5 sm:col-span-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={stileUmano} onChange={(e) => setStileUmano(e.target.checked)} className="h-4 w-4" />
                <span>Stile umano: email che sembrano scritte a mano</span>
              </label>
              <p className="text-[11px] text-muted-foreground">Niente List-Unsubscribe, link o pixel di tracciamento; ci si disiscrive rispondendo «no»; i follow-up citano il messaggio precedente.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-3"><FieldLabel>Orari di invio</FieldLabel>
              <FinestraEditor value={finestra} onChange={setFinestra} /></div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" className="h-9" disabled={add.isPending} onClick={() => add.mutate()}>{add.isPending ? "…" : "Salva brand"}</Button>
          </div>
        </div>
      )}

      {brands.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Nessun brand</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">Creane uno per ogni marchio (es. "EIC cold", "Marketing edile"): dominio, firma e identità mittente dedicate.</p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShow(true)}><Plus className="h-3.5 w-3.5" /> Crea brand</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {brands.map((b) => <BrandCard key={b.id} brand={b} onDelete={() => del.mutate(b.id)} deleting={del.isPending} onSalvaFinestra={(f) => salvaFinestra.mutate({ id: b.id, finestra: f })} onSalvaRitmo={(tb, n, su) => salvaRitmo.mutate({ id: b.id, trackingBase: tb, nuoviAlGiorno: n, stileUmano: su })} />)}
        </div>
      )}
    </section>
  );
}

function BrandCard({ brand, onDelete, deleting, onSalvaFinestra, onSalvaRitmo }: { brand: Brand; onDelete: () => void; deleting: boolean; onSalvaFinestra: (f: Finestra | null) => void; onSalvaRitmo: (trackingBase: string, nuoviAlGiorno: string, stileUmano: boolean) => void }) {
  const [editRitmo, setEditRitmo] = useState(false);
  const [tb, setTb] = useState(brand.tracking_base_url ?? "");
  const [nuovi, setNuovi] = useState(brand.new_per_day != null ? String(brand.new_per_day) : "");
  const [umano, setUmano] = useState(brand.stile_umano !== false);
  const [editOrari, setEditOrari] = useState(false);
  const [finestra, setFinestra] = useState<Finestra | null>(brand.send_window ?? null);
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Building2 className="h-4 w-4 text-primary" /></div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{brand.name}</span>
            <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${brand.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${brand.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/50"}`} /> {brand.status}
            </span>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive" disabled={deleting} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>

      <dl className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
        <Row icon={AtSign} label="From">{brand.from_name || <span className="text-muted-foreground/70">non impostato</span>}</Row>
        <Row icon={CornerUpLeft} label="Reply-to">{brand.reply_to ? <span className="font-mono">{brand.reply_to}</span> : <span className="text-muted-foreground/70">non impostato</span>}</Row>
        <Row icon={PenLine} label="Firma">
          {brand.signature
            ? <span className="line-clamp-2 whitespace-pre-line text-muted-foreground">{brand.signature}</span>
            : <span className="text-muted-foreground/70">non impostata</span>}
        </Row>
        <Row icon={Clock} label="Orari">
          {editOrari ? (
            <div className="space-y-1.5">
              <FinestraEditor value={finestra} onChange={setFinestra} />
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setFinestra(brand.send_window ?? null); setEditOrari(false); }}>Annulla</Button>
                <Button size="sm" className="h-6 px-2 text-xs" onClick={() => { onSalvaFinestra(finestra); setEditOrari(false); }}>Salva</Button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-left hover:underline" onClick={() => setEditOrari(true)} title="Modifica gli orari di invio del brand">
              {descriviFinestra(brand.send_window)}
            </button>
          )}
        </Row>
        <Row icon={Link2} label="Ritmo e link">
          {editRitmo ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={tb} onChange={(e) => setTb(e.target.value)} placeholder="https://link.tuodominio.it/l" className="h-7 w-[260px] font-mono text-xs" />
              <Input value={nuovi} onChange={(e) => setNuovi(e.target.value)} placeholder="nuovi/giorno" inputMode="numeric" className="h-7 w-[110px] text-xs" />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs"><input type="checkbox" checked={umano} onChange={(e) => setUmano(e.target.checked)} className="h-3.5 w-3.5" /> stile umano</label>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setTb(brand.tracking_base_url ?? ""); setNuovi(brand.new_per_day != null ? String(brand.new_per_day) : ""); setUmano(brand.stile_umano !== false); setEditRitmo(false); }}>Annulla</Button>
              <Button size="sm" className="h-6 px-2 text-xs" onClick={() => { onSalvaRitmo(tb, nuovi, umano); setEditRitmo(false); }}>Salva</Button>
            </div>
          ) : (
            <button type="button" className="text-left hover:underline" onClick={() => setEditRitmo(true)} title="Tetto dei nuovi contatti al giorno per casella e dominio dei link">
              {brand.new_per_day != null ? <span>{brand.new_per_day} nuovi/giorno per casella</span> : <span className="text-amber-700">nessun tetto sui nuovi: i follow-up sfondano il ritmo</span>}
              {" · "}
              {brand.tracking_base_url ? <span className="font-mono">{brand.tracking_base_url}</span> : <span className="text-amber-700">link su dominio di piattaforma</span>}
              {" · "}
              {brand.stile_umano !== false ? <span className="text-emerald-700">stile umano</span> : <span className="text-amber-700">stile mailer (List-Unsubscribe, link tracciato)</span>}
            </button>
          )}
        </Row>
        <Row icon={MapPin} label="Footer">
          {brand.footer_address
            ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3" /> {brand.footer_address}</span>
            : <span className="text-amber-600">manca (obbligo anti-spam)</span>}
        </Row>
      </dl>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof AtSign; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </div>
  );
}

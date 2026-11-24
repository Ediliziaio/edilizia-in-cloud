/**
 * Le mie spese (24/11/2026, richiesta del founder): carburante, pedaggio, parcheggio…
 * Foto dello scontrino (facoltativa, come ogni foto), importo, tipo e cantiere: un invio. L'ufficio la approva
 * o la rifiuta e l'operaio riceve l'avviso; qui vede lo stato e la nota dell'ufficio.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, CheckCircle2, Clock, Loader2, Receipt, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { cn } from "@/lib/utils";
import { CHIP, RIQUADRO, TITOLO_RIQUADRO } from "@/lib/campo/stileCampo";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { senzaRete } from "@/lib/campo/timbra";
import {
  COLONNE_SPESA, STATI_SPESA, TIPI_SPESA, euro, leggiImporto, percorsoScontrino, totaliSpese,
  type PagataCon, type Spesa, type TipoSpesa,
} from "@/lib/campo/spese";

const PILL = "min-h-11 rounded-full border px-4 text-sm font-semibold";
const PILL_ON = "border-primary bg-primary text-primary-foreground";

function AnteprimaScontrino({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null;
}

export default function CampoSpese() {
  const t = useT();
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: assegnazioni = [] } = useCampoAssignments();
  const cantieri = useMemo(() => {
    const visti = new Map<string, { id: string; codice: string }>();
    for (const a of assegnazioni) if (a.order) visti.set(a.order.id, { id: a.order.id, codice: a.order.order_code ?? a.order.description ?? "" });
    return [...visti.values()];
  }, [assegnazioni]);

  const [foto, setFoto] = useState<File | null>(null);
  const [tipo, setTipo] = useState<TipoSpesa>("carburante");
  const [importoTesto, setImportoTesto] = useState("");
  const [orderId, setOrderId] = useState("");
  const [pagataCon, setPagataCon] = useState<PagataCon>("soldi_miei");
  const [nota, setNota] = useState("");
  const importo = leggiImporto(importoTesto);
  const cantiereScelto = orderId || (cantieri.length === 1 ? cantieri[0].id : "");

  const elenco = useQuery({
    queryKey: ["campo-mie-spese", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Spesa[]> => {
      const { data, error } = await supabase.from("campo_spese").select(COLONNE_SPESA)
        .eq("user_id", user!.id).order("giorno", { ascending: false }).order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as Spesa[];
    },
  });
  const spese = elenco.data ?? [];
  const totali = totaliSpese(spese);

  const invia = useMutation({
    mutationFn: async () => {
      if (senzaRete()) throw new Error(t("Sei senza rete: la spesa resta qui. Mandala appena torna il campo."));
      if (!companyId || !user?.id) throw new Error(t("Azienda non disponibile, riprova tra un istante"));
      if (!importo) throw new Error(t("Scrivi l'importo dello scontrino"));
      const id = crypto.randomUUID();
      let fotoPath: string | null = null;
      if (foto) {
        fotoPath = percorsoScontrino(companyId, user.id, id, foto.name);
        const { error: up } = await supabase.storage.from("campo-spese").upload(fotoPath, foto, { contentType: foto.type || "image/jpeg" });
        if (up) throw new Error(t("La foto non è partita. Riprova."));
      }
      const { error } = await supabase.from("campo_spese").insert({
        id, company_id: companyId, user_id: user.id, order_id: cantiereScelto || null,
        tipo, importo, descrizione: nota.trim() || null, foto_path: fotoPath, pagata_con: pagataCon,
      });
      if (error) {
        if (fotoPath) void supabase.storage.from("campo-spese").remove([fotoPath]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("Spesa inviata all'ufficio"));
      setFoto(null); setImportoTesto(""); setNota("");
      void qc.invalidateQueries({ queryKey: ["campo-mie-spese"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? e.message : t("Non sono riuscito a inviare. Riprova.")),
  });

  const togli = useMutation({
    mutationFn: async (s: Spesa) => {
      const { error } = await supabase.from("campo_spese").delete().eq("id", s.id).eq("stato", "inviata");
      if (error) throw error;
      if (s.foto_path) await supabase.storage.from("campo-spese").remove([s.foto_path]);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campo-mie-spese"] }),
    onError: () => toast.error(t("Non sono riuscito a togliere la spesa.")),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-lg font-bold tracking-tight">{t("Le mie spese")}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("Fai la foto allo scontrino e scrivi quanto hai speso: l'ufficio ti risponde qui.")}</p>
      </div>

      <section className={cn(RIQUADRO, "space-y-3")} aria-label={t("Nuova spesa")}>
        <div className="flex gap-3">
          <label className="relative flex size-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed text-xs font-semibold text-muted-foreground">
            <input type="file" accept="image/*" capture="environment" aria-label={t("Foto dello scontrino")} className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFoto(f); e.target.value = ""; }} />
            {foto ? <AnteprimaScontrino file={foto} /> : <><Camera className="size-6" aria-hidden="true" />{t("Scontrino")}</>}
          </label>
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="importo-spesa" className="text-xs font-semibold text-muted-foreground">{t("Importo")}</label>
            <div className="flex min-h-14 items-center rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-primary/30">
              <span className="text-lg font-bold text-muted-foreground" aria-hidden="true">€</span>
              <input id="importo-spesa" inputMode="decimal" autoComplete="off" value={importoTesto}
                onChange={(e) => setImportoTesto(e.target.value)} placeholder="0,00"
                className="min-w-0 flex-1 bg-transparent px-2 text-2xl font-bold outline-none" />
            </div>
            {foto && (
              <button type="button" onClick={() => setFoto(null)} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-muted-foreground">
                <X className="size-3.5" aria-hidden="true" />{t("Togli la foto")}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Che spesa è")}>
          {TIPI_SPESA.map(x => (
            <button key={x.value} type="button" aria-pressed={tipo === x.value} onClick={() => setTipo(x.value)}
              className={cn(PILL, tipo === x.value ? PILL_ON : "bg-background")}>{t(x.label)}</button>
          ))}
        </div>

        {cantieri.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Per quale cantiere")}>
            {cantieri.map(c => (
              <button key={c.id} type="button" aria-pressed={orderId === c.id} onClick={() => setOrderId(orderId === c.id ? "" : c.id)}
                className={cn(PILL, "max-w-full truncate", orderId === c.id ? PILL_ON : "bg-background")}>{c.codice}</button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Come hai pagato")}>
          {([["soldi_miei", "Con i miei soldi"], ["carta_aziendale", "Con la carta dell'azienda"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={pagataCon === v} onClick={() => setPagataCon(v)}
              className={cn(PILL, pagataCon === v ? PILL_ON : "bg-background")}>{t(l)}</button>
          ))}
        </div>

        <input value={nota} onChange={(e) => setNota(e.target.value.slice(0, 500))} aria-label={t("Nota (facoltativa)")}
          placeholder={t("Nota (facoltativa)")} className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm" />

        <button type="button" onClick={() => invia.mutate()} disabled={!importo || invia.isPending}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50">
          {invia.isPending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          {importo ? t("Invia {importo} all'ufficio", { importo: euro(importo) }) : t("Invia all'ufficio")}
        </button>
      </section>

      {(totali.inAttesa > 0 || totali.daRimborsare > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div className={RIQUADRO}><p className="text-xs text-muted-foreground">{t("In attesa")}</p><p className="text-lg font-bold">{euro(totali.inAttesa)}</p></div>
          <div className={RIQUADRO}><p className="text-xs text-muted-foreground">{t("Da rimborsarti")}</p><p className="text-lg font-bold text-emerald-700">{euro(totali.daRimborsare)}</p></div>
        </div>
      )}

      <section className={RIQUADRO} aria-label={t("Spese inviate")}>
        <h2 className={TITOLO_RIQUADRO}>{t("Spese inviate")}</h2>
        {elenco.isLoading ? (
          <p className="py-4 text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" aria-hidden="true" />{t("Caricamento…")}</p>
        ) : spese.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t("Nessuna spesa inviata")}</p>
        ) : (
          <ul className="mt-1 divide-y">
            {spese.map(s => {
              const Icona = s.stato === "inviata" ? Clock : s.stato === "rifiutata" ? XCircle : CheckCircle2;
              return (
                <li key={s.id} className="flex items-start gap-3 py-2.5">
                  <Receipt className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                      {euro(Number(s.importo))} · {t(TIPI_SPESA.find(x => x.value === s.tipo)?.label ?? "Altro")}
                      <span className={cn(CHIP, s.stato === "inviata" ? "bg-amber-100 text-amber-800" : s.stato === "rifiutata" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800")}>
                        <Icona className="me-1 size-3" aria-hidden="true" />{t(STATI_SPESA[s.stato])}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(`${s.giorno}T12:00:00`), "d MMM", { locale: dateFnsCampo() })}
                      {s.pagata_con === "carta_aziendale" ? ` · ${t("carta dell'azienda")}` : ""}
                      {s.descrizione ? ` · ${s.descrizione}` : ""}
                    </p>
                    {s.nota_ufficio && <p className="mt-1 rounded-lg bg-muted px-2 py-1 text-xs" dir="auto"><span className="font-semibold">{t("Ufficio:")}</span> {s.nota_ufficio}</p>}
                  </div>
                  {s.stato === "inviata" && (
                    <button type="button" aria-label={t("Togli questa spesa")} disabled={togli.isPending}
                      onClick={() => { if (window.confirm(t("Togliere questa spesa?"))) togli.mutate(s); }}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

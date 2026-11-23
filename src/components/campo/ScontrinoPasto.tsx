/**
 * Lo scontrino del pasto, fotografato dall'operaio (23/11/2026). Solo se l'azienda usa i buoni «a ricevuta»
 * (modalità «ricevuta» o «entrambi»). Va in hr_buoni_pasto come tipo «ricevuta», stato «maturato»: lo verifica
 * l'ufficio nelle Paghe, dove vede la foto. La foto sta in `buoni-pasto-ricevute/<azienda>/<scheda>/`.
 * I controlli veri li fa il database (persona abilitata, niente doppio conteggio col buono fisso, mese chiuso):
 * qui si mostra il suo messaggio.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Receipt, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/campo/compressImage";
import { senzaRete } from "@/lib/campo/timbra";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const oggi = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** «8,50» o «8.50» → 8.5; null se non è un importo valido. */
export function importoDaTesto(testo: string): number | null {
  const pulito = testo.trim().replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(pulito)) return null;
  const n = Number(pulito);
  return n > 0 && n <= 200 ? n : null;
}

export function ScontrinoPasto({ companyId, profiloId }: { companyId: string; profiloId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [giorno, setGiorno] = useState(oggi);
  const [importo, setImporto] = useState("");
  const [esercente, setEsercente] = useState("");
  const [foto, setFoto] = useState<File | null>(null);

  const invio = useMutation({
    mutationFn: async () => {
      const euro = importoDaTesto(importo);
      if (!euro) throw new Error(t("Scrivi l'importo dello scontrino, per esempio 8,50."));
      if (!foto) throw new Error(t("Fai la foto dello scontrino."));
      if (senzaRete()) throw new Error(t("Sei senza rete: riprova quando torna il campo."));
      const blob = await compressImage(foto).catch(() => foto);
      const percorso = `${companyId}/${profiloId}/${id}.jpg`;
      const caricata = await supabase.storage.from("buoni-pasto-ricevute")
        .upload(percorso, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (caricata.error && !/exists|duplicate/i.test(caricata.error.message)) throw new Error(t("La foto non è partita. Riprova."));
      const { error } = await supabase.from("hr_buoni_pasto").insert({
        id, company_id: companyId, profilo_id: profiloId, giorno, tipo: "ricevuta", importo: euro,
        esercente: esercente.trim() || null, foto_url: percorso, stato: "maturato",
      } as never);
      if (error && error.code !== "23505") throw new Error(t(error.message || "Non sono riuscito a inviare. Riprova."));
    },
    onSuccess: () => {
      toast.success(t("Scontrino inviato all'ufficio."));
      void queryClient.invalidateQueries({ queryKey: ["campo-buoni-pasto"] });
      setId(crypto.randomUUID()); setImporto(""); setEsercente(""); setFoto(null); setGiorno(oggi()); setAperto(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? e.message : t("Non sono riuscito a inviare. Riprova.")),
  });

  if (!aperto) {
    return (
      <button type="button" onClick={() => setAperto(true)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-semibold">
        <Receipt className="size-5" aria-hidden="true" /> {t("Carica lo scontrino del pranzo")}
      </button>
    );
  }
  return (
    <form className="space-y-3 rounded-2xl border bg-background p-3" onSubmit={e => { e.preventDefault(); if (!invio.isPending) invio.mutate(); }}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold"><Receipt className="size-4" aria-hidden="true" /> {t("Scontrino del pranzo")}</p>
        <button type="button" onClick={() => setAperto(false)} aria-label={t("Chiudi")} className="flex size-10 items-center justify-center rounded-xl">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm font-medium">
          <span>{t("Giorno")}</span>
          <input type="date" value={giorno} max={oggi()} onChange={e => setGiorno(e.target.value || oggi())}
            className="h-12 w-full rounded-xl border bg-background px-2 text-base" />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>{t("Importo (€)")}</span>
          <input inputMode="decimal" value={importo} onChange={e => setImporto(e.target.value)} placeholder="8,50"
            className="h-12 w-full rounded-xl border bg-background px-3 text-base tabular-nums" />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        <span>{t("Dove hai mangiato (facoltativo)")}</span>
        <input value={esercente} onChange={e => setEsercente(e.target.value)} maxLength={120}
          className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
      </label>
      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-semibold">
        <Camera className="size-5" aria-hidden="true" /> {foto ? t("Foto pronta · cambia") : t("Fai la foto dello scontrino")}
        <input type="file" accept="image/*" capture="environment" className="sr-only"
          onChange={e => { setFoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </label>
      <button type="submit" disabled={invio.isPending}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
        {invio.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} {t("Invia all'ufficio")}
      </button>
      <p className="text-xs text-muted-foreground">{t("L'ufficio controlla lo scontrino prima del rimborso.")}</p>
    </form>
  );
}

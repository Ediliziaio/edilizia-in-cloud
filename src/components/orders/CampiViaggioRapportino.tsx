import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { supabase } from "@/integrations/supabase/client";
import { useMezzi } from "@/hooks/useMezzi";
import { mezzoStradale } from "@/lib/campo/arrivoRapportino";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { CAMPI_NUMERICI_VIAGGIO, CAMPI_TESTO_VIAGGIO, type BozzaViaggio } from "@/lib/campo/viaggiRapportino";

/**
 * Il viaggio del rapportino (25/11/2026): il mezzo si sceglie tra quelli stradali dell'azienda, così all'approvazione
 * il viaggio entra nel suo registro. Carico e scarico propongono «Sede» e il cantiere della commessa, scritti come li
 * riconosce la mappa del registro; resta libero scrivere qualunque altro luogo.
 */
export function CampiViaggioRapportino({ valore, quantitaInKm, onChange, orderId }: {
  valore: BozzaViaggio;
  quantitaInKm: boolean;
  onChange: (valore: BozzaViaggio) => void;
  orderId?: string;
}) {
  const t = useT();
  const { data: tuttiMezzi = [] } = useMezzi();
  const stradali = tuttiMezzi.filter(mezzoStradale);
  const commessa = useQuery({
    queryKey: ["viaggio-rapportino-commessa", orderId],
    enabled: !!orderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("order_code, work_address, work_lat, work_lng").eq("id", orderId!).maybeSingle();
      if (error) throw error;
      return data as { order_code: string | null; work_address: string | null; work_lat: number | null; work_lng: number | null } | null;
    },
  });
  const cantiere = commessa.data?.work_address?.trim()
    ? [commessa.data.order_code, commessa.data.work_address.trim()].filter(Boolean).join(" · ")
    : null;
  const luoghi = ["Sede", ...(cantiere ? [cantiere] : [])];
  // Un luogo con la sua posizione; scrivendo a mano la posizione si toglie (non sarebbe più quella del testo).
  const conLuogo = (key: "carico" | "scarico", testo: string, lat?: number | null, lng?: number | null): BozzaViaggio => ({
    ...valore, [key]: testo,
    [`${key}Lat`]: lat != null && lng != null ? String(lat) : undefined,
    [`${key}Lng`]: lat != null && lng != null ? String(lng) : undefined,
  });
  const cantiereLat = commessa.data?.work_lat ?? null;
  const cantiereLng = commessa.data?.work_lng ?? null;
  const scelto = stradali.find((m) => m.id === valore.mezzoId);
  // «Altro»: un mezzo che non è nell'elenco (noleggio, trasportatore): resta il testo libero, senza registro.
  const [aMano, setAMano] = useState(!valore.mezzoId && !!valore.mezzo?.trim());

  return (
    <fieldset className="grid grid-cols-2 gap-2 rounded-md border p-2 text-xs sm:grid-cols-3">
      <legend className="px-1 font-medium">{t("Dettagli del viaggio")}</legend>
      {CAMPI_TESTO_VIAGGIO.map(([key, label]) => key === "mezzo" && stradali.length > 0 ? (
        <label key={key} className="space-y-1">
          <span>{t("Mezzo")}</span>
          <select className="h-8 w-full rounded-md border bg-background px-2 text-sm" aria-label={t("Mezzo del viaggio")}
            value={scelto ? scelto.id : aMano ? "altro" : ""}
            onChange={(e) => {
              const m = stradali.find((x) => x.id === e.target.value);
              setAMano(e.target.value === "altro");
              if (m) onChange({ ...valore, mezzoId: m.id, mezzo: [m.nome, m.targa].filter(Boolean).join(" · ") });
              else onChange({ ...valore, mezzoId: undefined, mezzo: e.target.value === "altro" && !valore.mezzoId ? valore.mezzo : "" });
            }}>
            <option value="">{t("Scegli il mezzo")}</option>
            {stradali.map((m) => <option key={m.id} value={m.id}>{[m.nome, m.targa].filter(Boolean).join(" · ")}</option>)}
            <option value="altro">{t("Altro (scrivi)")}</option>
          </select>
          {!scelto && aMano && (
            <Input className="h-8 text-sm" aria-label={t("Mezzo o targa")} placeholder={t("Mezzo o targa")} value={valore.mezzo ?? ""}
              onChange={(e) => onChange({ ...valore, mezzo: e.target.value })} />
          )}
        </label>
      ) : key === "carico" || key === "scarico" ? (
        <label key={key} className="space-y-1">
          <span>{t(label)}</span>
          <CampoIndirizzo value={valore[key] ?? ""} className="h-8 text-sm" aria-label={t(label)}
            placeholder={key === "scarico" && cantiere ? cantiere : t("Sede, cantiere o indirizzo")}
            onChange={(testo) => onChange(conLuogo(key, testo))}
            onScegli={(ind) => onChange(conLuogo(key, ind.testo, ind.lat, ind.lng))} />
          {!valore[key]?.trim() && (
            <span className="flex flex-wrap gap-1">
              {luoghi.map((l) => (
                <button key={l} type="button" className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-slate-50"
                  onClick={() => onChange(l === "Sede" ? conLuogo(key, l) : conLuogo(key, l, cantiereLat, cantiereLng))}>
                  {l === "Sede" ? t("Sede") : t("Questo cantiere")}
                </button>
              ))}
            </span>
          )}
          {valore[key]?.trim() && valore[`${key}Lat`] && <span className="block text-[11px] text-emerald-700">{t("Posizione sulla mappa")}</span>}
        </label>
      ) : (
        <label key={key} className="space-y-1">
          <span>{t(label)}</span>
          <Input className="h-8 text-sm" value={valore[key] ?? ""} onChange={(e) => onChange({ ...valore, [key]: e.target.value })} />
        </label>
      ))}
      {CAMPI_NUMERICI_VIAGGIO.filter(([key]) => key !== "km" || !quantitaInKm).map(([key, label]) => (
        <label key={key} className="space-y-1">
          <span>{t(label)}</span>
          <Input className="h-8 text-sm" inputMode="decimal" value={valore[key] ?? ""} onChange={(e) => onChange({ ...valore, [key]: e.target.value })} />
        </label>
      ))}
      {valore.mezzoId && (
        <p className="col-span-full text-[11px] text-muted-foreground">{t("All'approvazione il viaggio entra nel registro del mezzo: mappa, storico e km.")}</p>
      )}
    </fieldset>
  );
}

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
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
  const idLuoghi = useId();
  const { data: tuttiMezzi = [] } = useMezzi();
  const stradali = tuttiMezzi.filter(mezzoStradale);
  const commessa = useQuery({
    queryKey: ["viaggio-rapportino-commessa", orderId],
    enabled: !!orderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("order_code, work_address").eq("id", orderId!).maybeSingle();
      if (error) throw error;
      return data as { order_code: string | null; work_address: string | null } | null;
    },
  });
  const cantiere = commessa.data?.work_address?.trim()
    ? [commessa.data.order_code, commessa.data.work_address.trim()].filter(Boolean).join(" · ")
    : null;
  const luoghi = ["Sede", ...(cantiere ? [cantiere] : [])];
  const scelto = stradali.find((m) => m.id === valore.mezzoId);
  // «Altro»: un mezzo che non è nell'elenco (noleggio, trasportatore): resta il testo libero, senza registro.
  const [aMano, setAMano] = useState(!valore.mezzoId && !!valore.mezzo?.trim());

  return (
    <fieldset className="grid grid-cols-2 gap-2 rounded-md border p-2 text-xs sm:grid-cols-3">
      <legend className="px-1 font-medium">{t("Dettagli del viaggio")}</legend>
      <datalist id={idLuoghi}>{luoghi.map((l) => <option key={l} value={l} />)}</datalist>
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
      ) : (
        <label key={key} className="space-y-1">
          <span>{t(label)}</span>
          <Input className="h-8 text-sm" value={valore[key] ?? ""} list={key === "carico" || key === "scarico" ? idLuoghi : undefined}
            placeholder={key === "carico" ? t("Sede, cantiere o indirizzo") : key === "scarico" ? (cantiere ?? t("Sede, cantiere o indirizzo")) : undefined}
            onChange={(e) => onChange({ ...valore, [key]: e.target.value })} />
          {(key === "carico" || key === "scarico") && !valore[key]?.trim() && (
            <span className="flex flex-wrap gap-1">
              {luoghi.map((l) => (
                <button key={l} type="button" className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-slate-50"
                  onClick={() => onChange({ ...valore, [key]: l })}>{l === "Sede" ? t("Sede") : t("Questo cantiere")}</button>
              ))}
            </span>
          )}
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

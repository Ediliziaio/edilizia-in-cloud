import { useFotoSolarFv } from "./useFotoSolar";
import {
  pixelDaCoordinate,
  type PosizioneMappaFv,
} from "../../../../supabase/functions/_shared/fvMappa";
import type { FotoSolarFv } from "../../../../supabase/functions/_shared/fvGoogleSolar";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function FvFotoSolar(
  { foto, centro, zoom, w, h }: {
    foto?: FotoSolarFv;
    centro: PosizioneMappaFv;
    zoom: number;
    w: number;
    h: number;
  },
) {
  const t = useT();
  const carica = useFotoSolarFv(foto);
  if (!foto || !carica?.url) {
    return carica?.errore
      ? (
        <p
          role="status"
          className="absolute left-2 right-2 top-2 bg-white p-2 text-xs"
        >
          {carica.errore}
        </p>
      )
      : null;
  }
  const [a, b, c] = foto.angoli.map((p) =>
    pixelDaCoordinate(p, centro, zoom, w, h)
  );
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${w} ${h}`}
      aria-label={t("Foto Google Solar del {data}", { data: String(foto.data ?? "") })}
      style={{ clipPath: "inset(0 0 28px 0)" }}
    >
      <image
        href={carica.url}
        width={foto.larghezza}
        height={foto.altezza}
        transform={`matrix(${(b.x - a.x) / foto.larghezza} ${
          (b.y - a.y) / foto.larghezza
        } ${(c.x - a.x) / foto.altezza} ${
          (c.y - a.y) / foto.altezza
        } ${a.x} ${a.y})`}
      />
    </svg>
  );
}

/**
 * Ingresso sicuro al 3D per le pagine dell'app: three.js arriva solo quando il
 * componente viene mostrato, in un chunk a parte. Da qui si può importare senza
 * appesantire il bundle principale; `Vista3D.tsx` e `tred/*` invece no.
 */
import { forwardRef, lazy, Suspense } from "react";
import type { Vista3DHandle, Vista3DProps } from "./Vista3D";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const Vista3D = lazy(() => import("./Vista3D"));

export const Vista3DPigra = forwardRef<Vista3DHandle, Vista3DProps>(function Vista3DPigra(props, ref) {
  const t = useT();
  return (
    <Suspense fallback={<div role="status" className={props.anteprimaEditor
      ? "grid flex-1 place-content-center bg-muted/25 px-3 text-center text-sm text-muted-foreground"
      : "flex h-[60vh] min-h-[320px] items-center justify-center rounded-lg border text-sm text-muted-foreground"}>{t("Preparo il 3D…")}</div>}>
      <Vista3D ref={ref} {...props} />
    </Suspense>
  );
});

/** Il fotogramma per il render AI senza mostrare il 3D (carica three.js alla prima chiamata). */
export async function caricaFotogramma() {
  return (await import("./tred/fotogramma")).catturaFotogramma;
}

export type { Vista3DHandle, Vista3DProps, ModoVista } from "./Vista3D";
export type { Fotogramma, RichiestaFotogramma } from "./tred/fotogramma";

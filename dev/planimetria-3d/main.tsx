import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Vista3DPigra, type Fotogramma } from "../../src/components/planimetrie/Vista3DPigra";
import { BILOCALE_ESEMPIO, daPlanimetria } from "../../src/lib/planimetrie/tred";
import "../../src/index.css";

function Prova() {
  const pianta = useMemo(() => daPlanimetria(BILOCALE_ESEMPIO), []);
  const [foto, setFoto] = useState<{ url: string; f: Fotogramma } | null>(null);
  return (
    <main className="mx-auto min-h-screen max-w-[1200px] space-y-4 bg-background px-4 py-6">
      <h1 className="text-xl font-semibold">Planimetria 3D — bilocale d'esempio</h1>
      <Vista3DPigra
        piante={{ fatto: pianta, progetto: pianta }}
        nomeFile="bilocale"
        onFotogramma={(f) => setFoto((v) => (v && URL.revokeObjectURL(v.url), { url: URL.createObjectURL(f.png), f }))}
      />
      {foto && (
        <section className="grid gap-4 md:grid-cols-2" data-testid="fotogramma">
          <img src={foto.url} alt="Fotogramma per il render" className="w-full rounded border" />
          <pre className="max-h-[420px] overflow-auto rounded border bg-muted p-3 text-xs">{JSON.stringify(foto.f.metadati, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}

if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<Prova />);

import { useEffect, useState } from "react";
import {
  listRenderCatalogAssets,
  signRenderCatalogUrls,
  type RenderCatalogAsset,
  type RenderCatalogVerticale,
} from "@/lib/render/renderCatalog";

interface State {
  assets: RenderCatalogAsset[];
  urls: Record<string, string>;
  loading: boolean;
  error: string | null;
}

/** Foto del catalogo render dell'azienda per un verticale, con URL firmati. */
export function useRenderCatalogAssets(companyId: string | undefined, verticale: RenderCatalogVerticale, reloadKey = 0) {
  const [state, setState] = useState<State>({ assets: [], urls: {}, loading: Boolean(companyId), error: null });

  useEffect(() => {
    if (!companyId) { setState({ assets: [], urls: {}, loading: false, error: null }); return; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const assets = await listRenderCatalogAssets(companyId, { verticale });
        const urls = await signRenderCatalogUrls(assets.map((a) => a.storage_path));
        if (alive) setState({ assets, urls, loading: false, error: null });
      } catch (e) {
        if (alive) setState({ assets: [], urls: {}, loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { alive = false; };
  }, [companyId, verticale, reloadKey]);

  return state;
}

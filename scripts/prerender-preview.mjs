import { preview } from "vite";

/** Risolve solo dopo il bind del nostro server. Una porta occupata è un errore,
 * mai un motivo per catturare silenziosamente un'altra app già in ascolto. */
export async function avviaPreviewPrerender(root, port, configFile) {
  return preview({ root, ...(configFile === undefined ? {} : { configFile }),
    logLevel: "error", preview: { host: "127.0.0.1", port, strictPort: true, open: false },
  });
}

export async function chiudiPreviewPrerender(server) {
  server.httpServer.closeAllConnections();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}

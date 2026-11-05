export interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
  env: { ASSETS: { fetch: (request: Request) => Promise<Response> } };
  waitUntil?: (task: Promise<unknown>) => void;
}

export function onRequest(context: PagesContext): Promise<Response>;

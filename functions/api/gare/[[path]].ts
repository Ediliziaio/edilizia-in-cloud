const services = new Set(['ai', 'intake', 'journey', 'office', 'preparation', 'review', 'sources', 'templates']);
const maxBodyBytes = 2_500_000;

interface GareContext {
  request: Request;
  env: { GARE_WORKER_ORIGIN?: string; GARE_PROXY_SECRET?: string };
  params: { path?: string | string[] };
}

const responseHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function failure(status: number, error: string) {
  return Response.json({ error }, { status, headers: responseHeaders });
}

export async function onRequest({ request, env, params }: GareContext) {
  const path = params.path;
  if (!Array.isArray(path) || path.length !== 2 || !services.has(path[0]) || !/^[a-z][a-z-]*$/.test(path[1])) {
    return failure(404, 'Operazione non disponibile');
  }
  if (!['GET', 'POST'].includes(request.method)) return failure(405, 'Metodo non consentito');
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) {
    return failure(401, 'Sessione richiesta');
  }
  const origin = new URL(request.url).origin;
  if (request.headers.has('Origin') && request.headers.get('Origin') !== origin) {
    return failure(403, 'Origine non consentita');
  }

  const workerOrigin = env.GARE_WORKER_ORIGIN;
  const proxySecret = env.GARE_PROXY_SECRET;
  if (!workerOrigin || !proxySecret || !/^[a-f0-9]{64}$/.test(proxySecret)) {
    return failure(503, 'Elaborazioni Gare indisponibili');
  }
  const url = URL.parse(workerOrigin);
  if (!url || url.protocol !== 'https:' || url.origin !== workerOrigin) {
    return failure(503, 'Elaborazioni Gare indisponibili');
  }

  const headers: Record<string, string> = {
    Authorization: authorization,
    'X-Gare-Proxy-Key': proxySecret,
  };
  if (request.method === 'POST') {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
      return failure(415, 'Contenuto JSON richiesto');
    }
    if (Number(request.headers.get('Content-Length')) > maxBodyBytes) {
      return failure(413, 'Richiesta troppo grande');
    }
    headers['Content-Type'] = 'application/json';
  }

  try {
    const upstream = await fetch(new URL(`/api/gare-${path[0]}/${path[1]}`, url), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'error',
      signal: request.signal,
    });
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return failure(503, 'Elaborazioni Gare indisponibili');
  }
}

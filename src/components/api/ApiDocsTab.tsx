import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/orders",
    scope: "orders",
    description: "Lista ordini con paginazione e filtri",
    params: [
      { name: "page", type: "integer", desc: "Pagina (default: 1)" },
      { name: "limit", type: "integer", desc: "Elementi per pagina (max: 100)" },
      { name: "status", type: "string", desc: "Filtro per stato ordine" },
      { name: "from_date", type: "string", desc: "Data inizio (ISO 8601)" },
    ],
    response: `{
  "data": [{
    "id": "uuid",
    "order_code": "ORD-001",
    "description": "...",
    "total_amount": 15000,
    "status": "in_lavorazione",
    "created_at": "2026-01-15T10:30:00Z"
  }],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/orders/:id",
    scope: "orders",
    description: "Dettaglio singolo ordine con articoli e pagamenti",
    params: [],
    response: `{
  "id": "uuid",
  "order_code": "ORD-001",
  "customer": { "name": "...", "email": "..." },
  "items": [{ "name": "...", "quantity": 2, "unit_price": 500 }],
  "total_amount": 15000,
  "payments": { "deposit_paid": true, "balance_paid": false }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/contacts",
    scope: "contacts",
    description: "Lista contatti CRM con filtri per tag, sorgente e assegnazione",
    params: [
      { name: "page", type: "integer", desc: "Pagina" },
      { name: "limit", type: "integer", desc: "Elementi per pagina" },
      { name: "source", type: "string", desc: "Sorgente (es. facebook, manual)" },
      { name: "tags", type: "string[]", desc: "Filtra per tag" },
    ],
    response: `{
  "data": [{
    "id": "uuid",
    "first_name": "Mario",
    "last_name": "Rossi",
    "email": "mario@example.com",
    "phone": "+39...",
    "source": "facebook",
    "tags": ["lead-caldo"]
  }],
  "pagination": { "page": 1, "total": 500 }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/contacts",
    scope: "write",
    description: "Crea un nuovo contatto nel CRM",
    params: [
      { name: "first_name", type: "string", desc: "Nome (obbligatorio)" },
      { name: "last_name", type: "string", desc: "Cognome" },
      { name: "email", type: "string", desc: "Email" },
      { name: "phone", type: "string", desc: "Telefono" },
      { name: "source", type: "string", desc: "Sorgente del contatto" },
    ],
    response: `{
  "id": "uuid",
  "first_name": "Mario",
  "last_name": "Rossi",
  "created_at": "2026-03-09T14:00:00Z"
}`,
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/subscribe",
    scope: "webhooks",
    description: "Registra un webhook per ricevere eventi in tempo reale",
    params: [
      { name: "url", type: "string", desc: "URL endpoint webhook (HTTPS)" },
      { name: "events", type: "string[]", desc: "Eventi: order.created, order.updated, contact.created" },
    ],
    response: `{
  "id": "uuid",
  "url": "https://example.com/webhook",
  "events": ["order.created"],
  "secret": "whsec_..."
}`,
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-500/10 text-green-700 border-green-500/20",
  POST: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  PUT: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  DELETE: "bg-red-500/10 text-red-700 border-red-500/20",
};

export function ApiDocsTab() {
  return (
    <div className="space-y-6">
      {/* Auth Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔐 Autenticazione</CardTitle>
          <CardDescription>Tutte le richieste devono includere la chiave API nell'header Authorization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 font-mono text-sm">
            <p className="text-muted-foreground">{"// Header richiesto"}</p>
            <p><span className="text-primary">Authorization</span>: Bearer <span className="text-amber-600">eic_your_api_key_here</span></p>
          </div>
          <div className="mt-4 bg-muted rounded-lg p-4 font-mono text-sm">
            <p className="text-muted-foreground">{"// Esempio con cURL"}</p>
            <p>curl -X GET \</p>
            <p className="pl-4">https://api.ediliziaincloud.com/api/v1/orders \</p>
            <p className="pl-4">-H &quot;Authorization: Bearer eic_your_api_key&quot;</p>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limiting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">⚡ Rate Limiting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Ogni chiave API ha limiti configurabili per minuto e per giorno.</p>
          <p>Le risposte includono gli header:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><code className="text-xs bg-muted px-1 rounded">X-RateLimit-Limit</code> — Limite massimo</li>
            <li><code className="text-xs bg-muted px-1 rounded">X-RateLimit-Remaining</code> — Richieste rimanenti</li>
            <li><code className="text-xs bg-muted px-1 rounded">X-RateLimit-Reset</code> — Reset timestamp</li>
          </ul>
          <p className="mt-2">Superando il limite riceverai un <Badge variant="destructive">429 Too Many Requests</Badge>.</p>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📡 Endpoints</CardTitle>
          <CardDescription>Base URL: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">https://api.ediliziaincloud.com</code></CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {ENDPOINTS.map((ep, i) => (
              <AccordionItem key={i} value={`ep-${i}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Badge className={`${METHOD_COLORS[ep.method]} border font-mono text-xs`}>{ep.method}</Badge>
                    <code className="text-sm">{ep.path}</code>
                    <Badge variant="outline" className="text-xs">{ep.scope}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{ep.description}</p>
                  {ep.params.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Parametri</p>
                      <div className="space-y-1">
                        {ep.params.map((p) => (
                          <div key={p.name} className="flex items-center gap-2 text-sm">
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{p.name}</code>
                            <Badge variant="outline" className="text-xs">{p.type}</Badge>
                            <span className="text-muted-foreground">{p.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium mb-2">Risposta</p>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">{ep.response}</pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Error Codes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">❌ Codici Errore</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              { code: 400, desc: "Richiesta non valida — parametri mancanti o malformati" },
              { code: 401, desc: "Non autorizzato — chiave API mancante o non valida" },
              { code: 403, desc: "Accesso negato — scope insufficiente" },
              { code: 404, desc: "Risorsa non trovata" },
              { code: 429, desc: "Limite di richieste superato" },
              { code: 500, desc: "Errore interno del server" },
            ].map((e) => (
              <div key={e.code} className="flex items-center gap-3">
                <Badge variant={e.code >= 500 ? "destructive" : e.code >= 400 ? "secondary" : "default"} className="font-mono">{e.code}</Badge>
                <span className="text-muted-foreground">{e.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Stub: nel render server non c'è supabase. Se qualcosa lo usa, fallisce presto
// e in modo chiaro (come la QA che vieta la rete).
export const supabase: any = new Proxy({}, {
  get() { return () => { throw new Error("supabase non disponibile nel render server"); }; },
});

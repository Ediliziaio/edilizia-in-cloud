/** PostgREST/RPC in memoria: gli stessi passaggi del salvataggio, senza servizi remoti. */
type Riga = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export function commessaLocaleDb(iniziali: Record<string, Riga[]> = {}) {
  const tabelle: Record<string, Riga[]> = structuredClone(iniziali);
  const chiamate: string[] = [];
  let seriale = 0, perdeRispostaArticoli = false, conflitti = 0;
  const valore = (r: Riga, k: string) => k.split(/->>?/).reduce((v, n) => v?.[n], r);
  const db = {
    from(tabella: string) {
      let operazione = 'leggi', payload: Riga | Riga[] = {}, conflittoIgnorato = false;
      const filtri: ((r: Riga) => boolean)[] = [];
      let intervallo: [number, number] | null = null, limite = Infinity;
      const ordini: Array<[string, boolean]> = [];
      const esegui = () => {
        chiamate.push(`${operazione}:${tabella}`);
        const tutte = tabelle[tabella] ??= [];
        let righe = tutte.filter(r => filtri.every(f => f(r)));
        if (operazione === 'aggiorna') {
          if (conflitti > 0) { conflitti--; return { data: [], error: null }; }
          for (const r of righe) Object.assign(r, structuredClone(payload), { updated_at: `revisione-${++seriale}` });
        } else if (operazione === 'inserisci' || operazione === 'upsert') {
          righe = [];
          for (const p of Array.isArray(payload) ? payload : [payload]) {
            const precedente = tutte.find(r => r.id === p.id && p.id);
            if (precedente && conflittoIgnorato) continue;
            const r = precedente ?? { id: `id-${++seriale}` };
            Object.assign(r, structuredClone(p)); if (!precedente) tutte.push(r); righe.push(r);
          }
        }
        for (const [k, asc] of ordini.slice().reverse()) righe.sort((a,b) => String(a[k]).localeCompare(String(b[k]),undefined,{numeric:true})*(asc?1:-1));
        if (intervallo) righe = righe.slice(intervallo[0], intervallo[1] + 1);
        return { data: structuredClone(righe.slice(0, limite)), error: null };
      };
      const q = {
        select() { return q; },
        eq(k: string,v: unknown) { filtri.push(r => valore(r,k) === v); return q; },
        is(k: string,v: unknown) { filtri.push(r => (valore(r,k) ?? null) === v); return q; },
        not(k: string,_: string,v: unknown) { filtri.push(r => (valore(r,k) ?? null) !== v); return q; },
        order(k: string,opts?: {ascending?: boolean}) { ordini.push([k,opts?.ascending !== false]); return q; },
        range(a: number,b: number) { intervallo = [a,b]; return q; },
        limit(n: number) { limite = n; return q; },
        update(p: Riga) { operazione = 'aggiorna'; payload = p; return q; },
        insert(p: Riga | Riga[]) { operazione = 'inserisci'; payload = p; return q; },
        upsert(p: Riga,opts?: {ignoreDuplicates?: boolean}) { operazione = 'upsert'; payload = p; conflittoIgnorato = !!opts?.ignoreDuplicates; return q; },
        async maybeSingle() { const r = esegui(); return {...r,data:r.data[0] ?? null}; },
        then(ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) { return Promise.resolve(esegui()).then(ok,ko); },
      };
      return q;
    },
    async rpc(nome: string, args: Riga) {
      chiamate.push(`rpc:${nome}`);
      if (nome === 'aggiungi_fasi_commessa') {
        for (const f of args.p_fasi) {
          const id = `fase-${++seriale}`;
          (tabelle.order_work_phases ??= []).push({id,company_id:'azienda',order_id:args.p_order_id,name:f.nome,position:seriale,start_date:f.data_inizio});
          for (const [position,s] of f.sottofasi.entries()) (tabelle.order_work_subphases ??= []).push({id:`sotto-${++seriale}`,phase_id:id,name:s.nome,position,quantita_fatta:0});
        }
        return {data:args.p_fasi.length,error:null};
      }
      if (nome === 'commessa_aggiungi_voci') {
        const esistenti = tabelle.order_items ??= [];
        for (const a of args.p_voci) esistenti.push({id:`articolo-${++seriale}`,order_id:args.p_commessa,name:a.name,quantity:a.quantity,riferimento:a.riferimento,position:esistenti.length,unita_misura:a.unita_misura,phase_id:a.phase_id,purchase_price:0});
        if (perdeRispostaArticoli) { perdeRispostaArticoli = false; return {data:null,error:new Error('Connessione interrotta dopo il salvataggio')}; }
        return {data:{voci_inserite:args.p_voci.length},error:null};
      }
      throw new Error(`RPC non prevista: ${nome}`);
    },
  };
  return {db,tabelle,chiamate,perdiRispostaArticoli(){perdeRispostaArticoli=true;},conflittoProssimoUpdate(){conflitti++;}};
}

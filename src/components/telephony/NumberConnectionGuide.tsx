/** Explain number ownership before an administrator chooses to purchase a line. */
export function NumberConnectionGuide() {
  return (
    <details className="rounded-xl border bg-muted/20 p-4">
      <summary className="cursor-pointer text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        Hai già un numero aziendale? Puoi mantenere quello.
      </summary>
      <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
        <div>
          <h3 className="font-medium">Collega il numero esistente</h3>
          <p className="mt-1 text-muted-foreground">Se il tuo operatore o centralino supporta SIP, si può configurare il collegamento all’assistente. Il numero resta presso l’operatore.</p>
        </div>
        <div>
          <h3 className="font-medium">Inoltra le chiamate</h3>
          <p className="mt-1 text-muted-foreground">Una deviazione può mandare le chiamate a una linea collegata all’assistente, anche solo quando non rispondi. Disponibilità e costi dipendono dall’operatore.</p>
        </div>
        <div>
          <h3 className="font-medium">Sposta o aggiungi una linea</h3>
          <p className="mt-1 text-muted-foreground">Con la portabilità mantieni il numero cambiando operatore, se supportata. Un numero nuovo serve quando vuoi una linea aggiuntiva o dedicata alle prove.</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Per chiamare mostrando il numero aziendale serve un collegamento in uscita autorizzato dall’operatore. La sola deviazione delle chiamate in entrata non lo abilita. Verifica la linea con chi gestisce la telefonia prima di acquistare un altro numero.</p>
    </details>
  );
}

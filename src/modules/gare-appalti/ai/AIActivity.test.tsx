import{act,type ReactNode}from'react';import{createRoot,type Root}from'react-dom/client';import{afterEach,it,expect}from'vitest';import{AIActivity}from'./AIActivity';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});let root:Root|undefined,container:HTMLDivElement;
function render(node:ReactNode){container=document.createElement('div');document.body.append(container);root=createRoot(container);act(()=>root!.render(node));return container;}
afterEach(()=>{act(()=>root?.unmount());container?.remove();root=undefined;});
it('l’animazione mostra soltanto il progresso ricevuto dal servizio',()=>{render(<AIActivity status="running" progress={37} message="Lettura del disciplinare" sourceCount={2} sourceNames={['Bando.pdf','Modello.docx']}/>);expect(container.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('37');expect(container.textContent).toContain('Bando.pdf +1');expect(container.querySelector('.is-active')).not.toBeNull();act(()=>root!.render(<AIActivity status="running" progress={42} message="Secondo segmento"/>));expect(container.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('42');});
it('letture prive di percentuale non inventano un avanzamento numerico',()=>{render(<AIActivity status="running" message="Lettura della prova"/>);const bar=container.querySelector('[role=progressbar]')!;expect(bar.hasAttribute('aria-valuenow')).toBe(false);expect(bar.getAttribute('aria-valuetext')).toContain('percentuale non disponibile');expect(container.textContent).not.toContain('%');});
it('risultati pronti, errori e interruzioni fermano l’attività senza dichiarare approvazioni',()=>{render(<AIActivity status="waiting_review" progress={100} message="Risultati salvati"/>);expect(container.querySelector('.is-active')).toBeNull();expect(container.querySelector('[role=progressbar]')).toBeNull();expect(container.textContent).toContain('Le proposte richiedono la tua revisione');act(()=>root!.render(<AIActivity status="interrupted" message="Servizio riavviato"/>));expect(container.querySelector('.is-active')).toBeNull();expect(container.textContent).toContain('Riprendi dai passaggi salvati');});

it('evidenzia la fase corrente e spegne il movimento quando la preparazione finisce', () => {
 render(<AIActivity status="queued" message="In coda" labels={['Originali', 'Analisi', 'Proposte']}/>);
 expect(container.querySelector('[aria-current=step]')).toBeNull();
 expect(container.querySelectorAll('[data-flow=true]')).toHaveLength(1);
 act(() => root!.render(<AIActivity status="running" stage={2} progress={85} message="Preparazione proposte" labels={['Originali', 'Analisi', 'Proposte']}/>));
 expect(container.querySelector('[aria-current=step]')?.textContent).toBe('Proposte');
 expect(container.querySelectorAll('[data-state=done]')).toHaveLength(2);
 act(() => root!.render(<AIActivity status="waiting_review" stage={2} progress={100} message="Proposte salvate"/>));
 expect(container.querySelector('[data-flow=true]')).toBeNull();
 expect(container.querySelector('[role=progressbar]')).toBeNull();
});

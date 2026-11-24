import type { ReactNode } from 'react';

export function HubSummary({title,description,children,action,eyebrow}:{title:string;description:string;children:ReactNode;action?:ReactNode;eyebrow?:string}){
 return <section aria-label={title} className="ga-hub-summary">
  <div className="ga-hub-summary-heading"><div>{eyebrow&&<p className="ga-hub-eyebrow">{eyebrow}</p>}<h2>{title}</h2><p className="ga-hub-description">{description}</p></div>{action&&<div className="ga-hub-summary-actions">{action}</div>}</div>
  <div className="ga-hub-metrics ga-metrics">{children}</div>
 </section>;
}

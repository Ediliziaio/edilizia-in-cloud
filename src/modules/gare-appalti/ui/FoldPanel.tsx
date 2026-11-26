import type { ReactNode } from 'react';

/** Native disclosure keeps tools and their in-progress inputs mounted. */
export function FoldPanel({title,hint,children,className=''}:{title:string;hint?:ReactNode;children:ReactNode;className?:string}) {
 return <details className={`ga-fold-panel ${className}`}><summary><span>{title}</span>{hint&&<small>{hint}</small>}</summary><div className="ga-fold-content">{children}</div></details>;
}

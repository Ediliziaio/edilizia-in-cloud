import { lazy } from 'react';
import { useGareNavigation } from '../GareWorkspace';
import { OpportunitiesPage,ParticipationsPage,DeadlinesPage } from './Lists';

const SourcesPage=lazy(()=>import('./SourcesPage').then(m=>({default:m.SourcesPage})));
const CompanyFilePage=lazy(()=>import('./CompanyFile').then(m=>({default:m.CompanyFilePage})));
export function GareHub(){
 const{section}=useGareNavigation();
 switch(section){
  case 'partecipazioni':return <ParticipationsPage/>;
  case 'scadenze':return <DeadlinesPage/>;
  case 'fascicolo':return <CompanyFilePage/>;
  case 'fonti':return <SourcesPage/>;
  default:return <OpportunitiesPage/>;
 }
}

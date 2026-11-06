import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render} from '@testing-library/react';
import {BuilderGrid} from '@/components/dashboardBuilder/builder/BuilderGrid';
afterEach(cleanup);
it('usa la griglia compatibile con le proprietà del builder e rispetta la sola lettura',()=>{
 const props={widgets:[{id:'w',type:'text_markdown' as const,x:0,y:0,w:4,h:2,config:{markdown:'Test griglia'}}],selectedId:null as null,onSelect:vi.fn(),onLayoutChange:vi.fn(),width:1200};
 const {container,rerender}=render(<BuilderGrid {...props} readonly/>);
 expect(container.querySelector('.react-grid-item')).toBeInTheDocument();
 expect(container.querySelector('.react-draggable')).not.toBeInTheDocument();
 rerender(<BuilderGrid {...props}/>);
 expect(container.querySelector('.react-draggable')).toBeInTheDocument();
});

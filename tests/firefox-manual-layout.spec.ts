import {test,expect} from '@playwright/test';
import {command} from './menu-helpers';

test('scaled measurement preserves saved node centers and group bounds',async({page})=>{
 const source=`%% mermaid-bp:manual-layout
%%{init: {"flowchart":{"rankSpacing":1000}}}%%
flowchart LR
subgraph G[Group]
A[One] --> B[Two]
end
B --> C[Three]
%% graph:positions {"A":{"x":100,"y":100},"B":{"x":400,"y":200},"C":{"x":200,"y":600}}
%% graph:groups {"G":{"x":50,"y":50,"width":450,"height":250}}
`;
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('/');
 await expect(page.locator('#render-state')).toHaveText('Actualizado');
 await command(page,'save');
 await page.locator('#file').setInputFiles({name:'scaled.mmd',mimeType:'text/plain',buffer:Buffer.from(source)});
 await expect(page.locator('#diagram svg g.node')).toHaveCount(3);
 await expect(page.locator('#render-state')).toHaveText('Actualizado');
 const geometry=await page.locator('#diagram svg').evaluate((root:SVGSVGElement)=>{
  const inverse=root.getScreenCTM()!.inverse();
  const box=(el:SVGGraphicsElement)=>{
   const b=el.getBBox(),m=inverse.multiply(el.getScreenCTM()!);
   const p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m);
   return {x:p.x,y:p.y,width:b.width*m.a,height:b.height*m.d};
  };
  return {nodes:Object.fromEntries([...root.querySelectorAll<SVGGElement>('g.node')].map(n=>[n.dataset.nodeId!,box(n)])),group:box(root.querySelector<SVGGraphicsElement>('g.cluster > rect')!)};
 });
 for(const [id,x,y] of [['A',100,100],['B',400,200],['C',200,600]] as const){
  expect(geometry.nodes[id].x,`${id} x`).toBeCloseTo(x,1);
  expect(geometry.nodes[id].y,`${id} y`).toBeCloseTo(y,1);
 }
 expect(geometry.group.x).toBeCloseTo(275,1);
 expect(geometry.group.y).toBeCloseTo(175,1);
 expect(geometry.group.width).toBeCloseTo(450,1);
 expect(geometry.group.height).toBeCloseTo(250,1);
});

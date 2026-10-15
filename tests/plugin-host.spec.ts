import {test,expect} from '@playwright/test';
import {build} from 'vite';
let bundle='';
test.beforeAll(async()=>{
 const result=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/plugin-host.ts',formats:['es'],fileName:'host.js'}}});
 bundle=(Array.isArray(result)?result:[result]).flatMap(r=>'output'in r?r.output:[]).filter(r=>r.type==='chunk').map(r=>r.code).join('\n');
});
test('host aísla errores, limpia contribuciones y cancela activaciones pendientes',async({page})=>{
 await page.route('**/host-test.js',r=>r.fulfill({contentType:'text/javascript',body:bundle}));
 await page.route('**/host-test.html',r=>r.fulfill({contentType:'text/html',body:'<div id="app"><button id="plugins-button">Extensiones</button><div id="plugin-actions"></div></div><script type="module">import {PluginHost} from "./host-test.js";window.PluginHost=PluginHost;</script>'}));
 await page.goto('/host-test.html');await page.waitForFunction(()=>!!(window as any).PluginHost);
 const result=await page.evaluate(async()=>{
  const alerts:string[]=[],calls:string[]=[],snapshot={source:'flowchart TD\nA-->B',fileName:'ejemplo.mmd'};
  let finish:()=>void=()=>{};
  const descriptor=(id:string,setup:any,apiVersion=1)=>({manifest:{id,name:id,description:'Prueba',version:'1.0.0',apiVersion},load:async()=>({default:{setup}})});
  const host=new (window as any).PluginHost(()=>snapshot,(text:string)=>alerts.push(text),[
   descriptor('broken',(ctx:any)=>{ctx.ui.addAction({id:'partial',label:'Parcial'});ctx.ui.addGuideStep({id:'partial',title:'Parcial',description:'Texto',target:'#app'});throw Error('Fallo');}),
   descriptor('working',(ctx:any)=>{ctx.document.subscribe((doc:any)=>{calls.push(doc.source);});ctx.ui.addAction({id:'good',label:'Disponible'});return()=>calls.push('cleanup');}),
   descriptor('future',()=>{throw Error('No debe ejecutarse');},99),
   descriptor('slow',async(ctx:any)=>{ctx.ui.addAction({id:'pending',label:'Pendiente'});await new Promise<void>(resolve=>{finish=resolve;});ctx.ui.addAction({id:'late',label:'Tarde'});})
  ]);
  const activation=host.start();await new Promise(resolve=>setTimeout(resolve,10));await host.setEnabled('slow',false);const pendingRemoved=!document.getElementById('plugin-slow-pending');finish();await activation;
  host.documentChanged();await host.setEnabled('working',false);host.documentChanged();return{alerts,calls,pendingRemoved,steps:host.guideSteps(),actions:document.querySelectorAll('#plugin-actions>*').length,source:snapshot.source,future:document.querySelector('[data-plugin-status="future"]')?.textContent};
 });
 expect(result.pendingRemoved).toBe(true);expect(result.actions).toBe(0);expect(result.steps).toEqual([]);expect(result.calls).toEqual(['flowchart TD\nA-->B','cleanup']);expect(result.alerts).toHaveLength(1);expect(result.future).toContain('incompatible');expect(result.source).toBe('flowchart TD\nA-->B');
});

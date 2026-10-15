const plugin={
  setup(context) {
    context.ui.addAction({id:'preview',label:'BS preview',title:'Vista previa de BookStack',run(){const token=crypto.randomUUID(),channel=new BroadcastChannel('mermaid-bp:preview:'+token);channel.onmessage=event=>{if(event.data==='request')channel.postMessage(context.document.read().source);};const url=new URL('./bookstack.html',import.meta.url);url.hash=token;window.open(url,'_blank','noopener');setTimeout(()=>channel.close(),600_000);}});
    context.ui.addGuideStep({id:'bookstack-preview',title:'Vista previa de BookStack',description:'BS preview permite comprobar el diagrama con el visor de BookStack y obtener el encabezado de instalación. Es una extensión opcional; el editor y las exportaciones funcionan sin ella.',target:'#plugin-bookstack-preview'});
  },
};
export default plugin;

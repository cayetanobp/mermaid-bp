const plugin={
  setup(context) {
    context.ui.addAction({id:'preview',label:'BS preview',title:'Vista previa de BookStack',href:new URL('./bookstack.html',import.meta.url).href});
    context.ui.addGuideStep({id:'bookstack-preview',title:'Vista previa de BookStack',description:'BS preview permite comprobar el diagrama con el visor de BookStack y obtener el encabezado de instalación. Es una extensión opcional; el editor y las exportaciones funcionan sin ella.',target:'#plugin-bookstack-preview'});
  },
};
export default plugin;

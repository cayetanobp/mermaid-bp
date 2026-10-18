export default {
  setup(context) {
    context.document.subscribe((document) => {
      context.ui.notify(`Documento actualizado: ${document.fileName}`);
    });

    context.ui.addAction({
      id: 'show',
      label: 'Plugin de contrato público',
      title: 'Cuenta las líneas del documento',
      run() {
        const lines = context.document.read().source.split('\n').length;
        context.ui.notify(`Líneas: ${lines}`);
      },
    });

    context.ui.addAction({
      id: 'resource',
      label: 'Abrir recurso del plugin',
      href: new URL('./resource.html', import.meta.url).href,
    });
    context.ui.addGuideStep({
      id: 'contract-example',
      title: 'Plugin de contrato público',
      description: 'Usa la API pública v1 para consultar el documento y añadir una acción.',
      target: '#plugin-contract-example-show',
    });

    return () => context.ui.notify('Plugin de contrato público desactivado.');
  },
};

# Guía de estilo UI/UX: dirección visual "sobria e institucional"

> Documento de dirección para diseño. Los valores (hex, tamaños) son una propuesta de partida, no una imposición: el diseñador puede ajustarlos si mantiene la intención.

## 1. Objetivo

La web funciona bien a nivel funcional, pero su aspecto actual resulta genérico (el típico "SaaS de plantilla"). Queremos transmitir **seriedad, fiabilidad y criterio profesional**, con una identidad reconocible y sin parecer generada automáticamente.

**Palabras clave de la marca visual:** sobria · precisa · editorial · confiable · atemporal.
**Lo que NO queremos:** vistoso, "tech-startup", juguetón, futurista.

## 2. Qué evitar (señales de "hecho con IA")

- Degradados morados/azules/rosas y fondos con blobs o brillos.
- Tipografía Inter / system-ui en todo, con un único peso y sin jerarquía.
- Tarjetas con esquinas muy redondeadas (16–24 px), sombra difusa y borde sutil, repetidas en todas partes.
- Iconos de línea gruesa dentro de círculos de color pastel.
- Hero centrado con titular + subtítulo + dos botones (uno relleno, uno "ghost").
- Rejillas de 3 columnas con icono + título + dos líneas de texto.
- Emojis como decoración, badges de colores saturados, exceso de glassmorphism.
- Modo oscuro con neones sobre negro puro.

## 3. Principios de diseño

1. **Jerarquía por tipografía y espacio, no por color ni sombras.** El contraste de tamaños y pesos hace el trabajo.
2. **Menos contenedores.** Usar líneas finas (divisores) y espacio en blanco en lugar de meter todo en tarjetas.
3. **Densidad informativa con aire.** Contenido útil y bien ordenado; evitar el vacío decorativo.
4. **Un solo color de acento**, usado con intención (acción principal, estado activo, enlaces).
5. **Consistencia estricta:** pocos estilos, aplicados siempre igual.
6. **Contenido real antes que decoración.** Datos, tablas y texto bien tratados son el protagonista.

## 4. Color

Base neutra cálida o neutra fría (elegir una y mantenerla). Propuesta:

| Rol | Valor | Uso |
|---|---|---|
| Fondo principal | `#FAFAF8` | Fondo de página |
| Superficie | `#FFFFFF` | Paneles, tablas, formularios |
| Superficie secundaria | `#F1F0EC` | Zonas de apoyo, cabeceras de tabla |
| Borde / divisor | `#DAD8D2` | Líneas de 1 px |
| Texto principal | `#16181D` | Cuerpo y titulares |
| Texto secundario | `#5B606B` | Metadatos, ayudas |
| **Acento (primario)** | `#1F3A5F` (azul marino) | Botón principal, enlaces, foco |
| Acento hover | `#15294A` | Estados hover/pressed |

Colores de estado (usar solo para informar, siempre desaturados):

- Éxito `#2F6B4F` · Aviso `#9A6B12` · Error `#9B2C2C` · Info `#1F3A5F`.

Reglas:
- Máximo **un acento** + neutros. Los colores de estado nunca se usan como decoración.
- Contraste mínimo **WCAG AA** (4.5:1 texto normal, 3:1 texto grande y elementos de UI).
- Prohibidos los degradados en superficies y botones.

## 5. Tipografía

Combinar una serif para titulares (aporta carácter editorial y seriedad) con una sans legible para interfaz.

- **Titulares (H1–H3):** Source Serif 4 (alternativas: IBM Plex Serif, Newsreader).
- **Interfaz y cuerpo:** IBM Plex Sans (alternativas: Public Sans, Source Sans 3).
- **Datos / cifras / código:** IBM Plex Mono o activar `font-variant-numeric: tabular-nums` en tablas.

Escala (base 16 px, ratio ~1.25):

| Nivel | Tamaño / interlineado | Peso |
|---|---|---|
| H1 | 40 / 48 | 600 (serif) |
| H2 | 30 / 38 | 600 (serif) |
| H3 | 22 / 30 | 600 (serif) |
| H4 / título de panel | 18 / 26 | 600 (sans) |
| Cuerpo | 16 / 26 | 400 |
| Texto pequeño | 14 / 20 | 400 |
| Etiquetas / overline | 12 / 16, mayúsculas, tracking +6 % | 500 |

Reglas: ancho de línea de lectura 60–75 caracteres; no más de 3 pesos en toda la web; sin cursiva decorativa.

## 6. Layout y espaciado

- **Grid:** 12 columnas, contenedor máx. 1200 px (1440 px para vistas de datos), gutter 24 px.
- **Escala de espaciado (base 4):** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96.
- **Ritmo vertical** generoso entre secciones (64–96 px) y compacto dentro de ellas.
- Preferir **composición asimétrica y alineación a la izquierda** frente a todo centrado.
- Cabecera simple: logotipo a la izquierda, navegación textual, un único CTA a la derecha.
- Usar **divisores de 1 px** para separar secciones en lugar de cajas.

## 7. Forma, bordes y elevación

- **Radio de esquina:** 2–4 px en todo (botones, inputs, paneles). Nada de formas "píldora" salvo etiquetas muy concretas.
- **Bordes:** 1 px `#DAD8D2`.
- **Sombras:** prácticamente ninguna. Solo una sombra mínima en menús flotantes y modales (`0 4px 12px rgba(0,0,0,.08)`).
- Sin glassmorphism, sin blur de fondo, sin brillos.

## 8. Componentes

**Botones**
- Primario: relleno acento, texto blanco, altura 40 px, radio 3 px, peso 500.
- Secundario: borde 1 px acento, fondo transparente.
- Terciario: texto con subrayado al hover.
- Solo **un botón primario por vista**.

**Formularios**
- Etiqueta siempre visible encima del campo (no solo placeholder).
- Input: altura 40 px, borde 1 px, foco con anillo de 2 px acento. Mensajes de error junto al campo, en texto, no solo color.

**Tablas** (componente clave en una web seria)
- Cabecera con fondo `#F1F0EC`, texto 12 px en mayúsculas.
- Filas separadas por línea fina, sin cebra de colores; cifras alineadas a la derecha con números tabulares.
- Acciones de fila visibles al hover/foco.

**Tarjetas / paneles**
- Usar con moderación. Si se usan: fondo blanco, borde 1 px, sin sombra, padding 24 px.

**Navegación**
- Texto plano, estado activo con subrayado de 2 px en acento (no con "pastillas" de color).

**Iconografía**
- Set único de trazo fino y uniforme (1.5 px), p. ej. Lucide o Phosphor Regular. Sin fondos de color circulares. Usar iconos solo cuando aporten significado.

**Estados y avisos**
- Banners en línea con borde izquierdo de 3 px del color de estado y fondo muy tenue; sin iconos grandes ni ilustraciones.

## 9. Imágenes e ilustración

- Fotografía sobria y real (sin stock genérico de gente sonriendo ante un portátil). Tratamiento uniforme: mismo encuadre y temperatura de color.
- Si hay ilustración: monocroma o de dos tonos con el color de acento, estilo técnico/lineal. Evitar ilustraciones 3D y mascotas.
- Gráficos de datos: paleta limitada (acento + 2–3 neutros), ejes y rejilla discretos, etiquetas directas en lugar de leyendas cuando sea posible.

## 10. Movimiento

- Mínimo y funcional: transiciones de 150–200 ms con `ease-out` en hover, foco y apertura de menús.
- Sin animaciones de entrada decorativas, parallax ni contadores animados.
- Respetar `prefers-reduced-motion`.

## 11. Voz y microcopy

- Tono claro, directo y profesional. Frases cortas, verbos concretos ("Guardar cambios", no "¡Listo para despegar!").
- Sin exclamaciones, sin jerga de marketing, sin emojis.

## 12. Accesibilidad y responsive

- WCAG 2.2 AA como mínimo: foco visible, navegación por teclado, áreas táctiles ≥ 44 px, no depender solo del color.
- Breakpoints sugeridos: 640 · 768 · 1024 · 1280 px. Diseño mobile-first; las tablas anchas se desplazan en horizontal dentro de su contenedor.

## 13. Entregables esperados del diseñador

1. Tokens de diseño (color, tipografía, espaciado, radios) en Figma Variables y exportables a CSS.
2. Librería de componentes con estados (normal, hover, foco, deshabilitado, error).
3. Maquetas de las 3–4 pantallas clave en escritorio y móvil.
4. Una página de "antes / después" que muestre cómo se aplican los principios a la UI actual.

## 14. Referencias de tono visual (para inspiración, no para copiar)

Publicaciones y webs institucionales de carácter editorial: *Financial Times*, *The Economist*, *Stripe Docs* (por su claridad), *GOV.UK* (por su funcionalidad), informes anuales de banca de inversión. Lo común: tipografía con personalidad, mucho texto bien jerarquizado, poco adorno y un color de acento único.
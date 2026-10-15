# Próximas mejoras

Este archivo recoge propuestas futuras. El editor actual permite escribir otros tipos de Mermaid por código; las herramientas visuales y la cascada están orientadas a `flowchart` y `graph`.

## Tipos de diagramas

- Líneas de tiempo, para hitos y acontecimientos.
- Gantt, para fases, dependencias y planificación.
- Secuencias, para intercambios entre personas y sistemas.
- Estados, para el ciclo de vida de expedientes o procesos.
- Entidad-relación y clases, para datos y modelos.
- Mapas mentales y recorridos de usuario.

Cada incorporación necesita definir qué se puede editar sin perder sintaxis, sus herramientas, su representación en cascada y sus pruebas de conservación del archivo. Empezar por líneas de tiempo con una extensión pequeña.

## Evolución del sistema de extensiones

La API v1 admite acciones, lectura y suscripción al documento y pasos de guía. Añadir proveedores de tipos de diagrama y paneles cuando exista una primera necesidad concreta. Mantener las mutaciones del documento dentro de transacciones controladas por el editor, con deshacer y validación.

## Guía y accesibilidad

La guía básica está implementada. Ampliarla con recorridos específicos por tipo de diagrama y revisar con usuarios que trabajan con teclado y lectores de pantalla.

## Entregado

- Cascada con búsqueda, subgrupos y relaciones navegables.
- Ficha redimensionable y navegación al nodo sin cambiar zoom.
- Guía de uso contextual según las extensiones activas.
- BookStack como extensión opcional, con distribución sin extensiones.
- Guía visual institucional en `style.md`.

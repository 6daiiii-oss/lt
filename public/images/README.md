# Imágenes editoriales

Dos imágenes originales generadas para la portada de Lote. Representan un bodegón de objetos y una tienda de inspiración; no muestran productos disponibles ni un comercio asociado. Los pies de foto lo indican.

- `discover-720.webp` y `discover-1440.webp`: misma composición, proporción 6:5, respectivamente 720×600 y 1440×1200. La portada adapta el recorte con `object-fit: cover`: 6:5 en escritorio, vertical en tablet y 4:3 en móvil.
- `store-640.webp` y `store-1200.webp`: proporción 4:3, respectivamente 640×480 y 1200×900. Imagen de la invitación para proveedores.

Archivos WebP locales, variantes mediante `srcset` y `sizes`, dimensiones declaradas y carga diferida para la imagen inferior. La imagen principal tiene prioridad de carga. No se depende de un servicio externo de imágenes al navegar.

# Imágenes editoriales

Dos imágenes originales generadas para la portada de Lote. Representan un bodegón de objetos y una tienda de inspiración; no muestran productos disponibles ni un comercio asociado. Los pies de foto lo indican.

- `discover-720.webp` y `discover-1440.webp`: misma composición, proporción de archivo 6:5, respectivamente 720×600 y 1440×1200. El banner usa un recorte horizontal con `object-fit: cover`; el texto ocupa una columna junto a la imagen en escritorio y se coloca encima en móvil. Los contenedores reservan altura para mantener la composición durante la carga.
- `store-640.webp` y `store-1200.webp`: proporción de archivo 4:3, respectivamente 640×480 y 1200×900. Imagen del bloque de proveedores, con recorte horizontal adaptable.

Archivos WebP locales, variantes mediante `srcset` y `sizes`, dimensiones declaradas y carga diferida para la imagen inferior. La imagen principal tiene prioridad de carga. No se depende de un servicio externo de imágenes al navegar.

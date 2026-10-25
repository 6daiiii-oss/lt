# Catálogo de exhibición

50 fichas públicas de prueba, con descripciones originales en español y 77 imágenes ilustrativas de 1000 × 1000 píxeles. 27 fichas tienen dos vistas del mismo producto de origen. No representan una oferta comercial ni una relación con las marcas ilustradas.

Se muestran directamente en la misma cuadrícula de `/catalogo`, junto a los productos reales y en la portada (hasta ocho productos). No existe una pestaña separada: `/exhibicion` redirige a `/catalogo`. Cada detalle usa `/productos/exh-*`. Las fichas originales se conservaron y se añadieron 30 de tecnología, cocina y cuidado diario, priorizadas en la selección de ejemplos. Cada ficha indica Exhibición y no permite comprar. No tienen precios, stock, mínimos, proveedores ni opiniones inventadas. No se insertan en PostgreSQL ni alteran las estadísticas de los negocios. Sus identificadores `exh-*` no son UUID aceptados por el carrito. Los filtros comerciales ocultan estos ejemplos.

Selección inspirada en categorías de consumo de [Shopify Trending Products](https://www.shopify.com/blog/trending-products): belleza, hogar/cocina, tecnología y moda/accesorios. Es una selección editorial para pruebas, no un ranking de ventas peruanas ni una afirmación de tendencia de cada SKU.

Imágenes del conjunto público de pruebas [DummyJSON Products](https://dummyjson.com/docs/products), conservadas sin modificaciones y servidas desde el repositorio. El archivo `EXHIBICION_FUENTES.json` registra el producto de origen, URL de cada vista, dimensiones y SHA-256. La licencia del repositorio de origen se incluye en `public/images/exhibicion/LICENSE-DummyJSON.txt`; no se atribuyen derechos sobre marcas ni se afirma autorización comercial para revender esos productos.

No requiere migraciones, servicios externos en ejecución ni pagos. Para retirar los ejemplos basta quitar su integración de `public.js` y los archivos del catálogo de exhibición; no se modifica la base de datos.

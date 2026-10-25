# Catálogo de exhibición

20 fichas públicas de prueba, con descripciones originales en español y 30 imágenes ilustrativas de 1000 × 1000 píxeles. Diez fichas tienen dos vistas del mismo producto de origen. No representan una oferta comercial ni una relación con las marcas ilustradas.

Se muestran en `/exhibicion`, en una sección separada del catálogo y en la portada (seis ejemplos). Cada ficha indica Exhibición y no permite comprar. No tienen precios, stock, mínimos, proveedores ni opiniones inventadas. No se insertan en PostgreSQL ni alteran las estadísticas de los negocios. Sus identificadores `exh-*` no son UUID aceptados por el carrito. Los filtros comerciales ocultan estos ejemplos.

Selección inspirada en categorías de consumo de [Shopify Trending Products](https://www.shopify.com/blog/trending-products): belleza, hogar/cocina y moda/accesorios. Es una selección editorial para pruebas, no un ranking de ventas peruanas ni una afirmación de tendencia de cada SKU.

Imágenes del conjunto público de pruebas [DummyJSON Products](https://dummyjson.com/docs/products), conservadas sin modificaciones y servidas desde el repositorio. El archivo `EXHIBICION_FUENTES.json` registra el producto de origen, URL de cada vista, dimensiones y SHA-256. La licencia del repositorio de origen se incluye en `public/images/exhibicion/LICENSE-DummyJSON.txt`; no se atribuyen derechos sobre marcas ni se afirma autorización comercial para revender esos productos.

No requiere migraciones, servicios externos en ejecución ni pagos. Para retirar los ejemplos basta quitar su integración de `public.js` y los archivos del catálogo de exhibición; no se modifica la base de datos.

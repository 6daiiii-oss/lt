# Experiencia pública y accesos

## Portada

`/` es la portada del marketplace. La cabecera contiene la búsqueda principal y una descripción permanente: «Productos al por mayor». La navegación permite entrar en Inicio, Productos, Novedades, Pocas unidades, Marcas, Cómo comprar y Vender en Lote.

La portada muestra un banner corto, categorías, catálogo con pestañas y un bloque para proveedores. La explicación de compra queda en un desplegable. Se eliminaron los eslóganes, subtítulos y secciones repetidas que competían por atención. Si no existe inventario publicado, se informa en un bloque compacto sin crear productos ficticios.

El contenido principal usa 16–17 px, la navegación 15–16 px y el título del catálogo 28 px en escritorio. El banner de portada usa 38 px, frente a los 64 px de la propuesta anterior. Los títulos y mensajes usan nombres concretos: «Todos los productos», «Marcas», «Iniciar sesión» y «No encontramos productos».

Las dos fotografías de estilo editorial son generadas y están identificadas como imágenes de inspiración. Sus dimensiones, proporciones y variantes están documentadas en `public/images/README.md`. La identidad visual sigue siendo provisional.

## Catálogo y búsqueda

La búsqueda compartida de cabecera ofrece sugerencias de productos y marcas publicados, y categorías disponibles. En `/marcas` busca marcas; en `/catalogo` conserva los filtros actuales al buscar. Las sugerencias aparecen tras dos caracteres; hay espera de 280 ms, descarte de respuestas antiguas, navegación por enlaces con Tab, acceso a sugerencias con flecha abajo y cierre con Escape o al salir. Una búsqueda sin coincidencias no inventa sugerencias comerciales.

Las pestañas Todos, Novedades y Pocas unidades consultan el catálogo real. En portada muestran hasta ocho productos y en catálogo conservan la paginación. «Pocas unidades» filtra productos con un mínimo de hasta 12 unidades; el mínimo monetario por marca se revisa por separado. Cambiar entre pestañas o categorías de una misma página conserva el desplazamiento para evitar saltos a la cabecera.

La búsqueda de productos combina palabras en nombre, marca, categoría y SKU; ignora mayúsculas y acentos. Los filtros siguen en la URL y funcionan al volver/avanzar. Las categorías están a un toque; ordenar actualiza la vista; los filtros avanzados se despliegan con un botón y se cierran al aplicar, pulsar Escape o hacer clic fuera. Los filtros activos muestran nombres legibles y se quitan por separado. El rango de precios se valida antes de aplicar.

## Accesos

- Público: portada, catálogo, búsqueda, productos, marcas y contenido explicativo.
- Sin sesión no se muestra bolsa ni formulario activo de cantidad/compra o botones de guardar. Se muestran enlaces explícitos para ingresar o crear cuenta, conservando el producto de retorno.
- Cuenta, favoritos, bolsa, pedidos, incidencias y paneles consultan la sesión antes de renderizar. Sin sesión redirigen a login con `next` interno.
- Comprar requiere una cuenta de tienda con correo verificado; el checkout mantiene la verificación comercial del servidor. Los proveedores no reciben controles de compra o favoritos.
- Los paneles de proveedor y administración mantienen sus controles de rol en cliente y servidor. Los endpoints privados ya exigían autenticación; esta revisión hace explícito el límite también en la interfaz.
- El registro, login y sus enlaces conservan el destino interno, rechazan destinos externos y evitan volver a login/registro en bucle. Una cuenta que ya inició sesión pasa a su espacio al abrir login/registro.

## Alcance de la revisión

Se inspeccionaron las capturas de portada y catálogo en escritorio y móvil, usando el servidor real del entorno cloud. No se ejecutaron suites de pruebas para esta revisión; los resultados anteriores de `IMPLEMENTATION_STATUS.md` corresponden a la implementación inicial. El arranque en el PC del usuario requiere descargar los cambios y reiniciar el servidor.

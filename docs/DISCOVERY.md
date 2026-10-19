# Experiencia pública y accesos

## Portada

`/` es una landing de descubrimiento: propuesta de valor, búsqueda principal, fotografía editorial, categorías, selecciones, pasos y llamada para proveedores. No utiliza el panel privado como entrada. Si no existe inventario publicado, informa del lanzamiento sin crear productos ficticios.

Las dos fotografías de estilo editorial son generadas y están identificadas como imágenes de inspiración. Sus dimensiones, proporciones y variantes están documentadas en `public/images/README.md`. La identidad visual sigue siendo provisional.

## Catálogo y búsqueda

`/catalogo` tiene búsqueda con sugerencias de productos y marcas publicados, y categorías disponibles. Las sugerencias aparecen tras dos caracteres; hay espera de 280 ms, descarte de respuestas antiguas, navegación por enlaces con Tab, acceso a sugerencias con flecha abajo y cierre con Escape o al salir. Una búsqueda sin coincidencias no inventa sugerencias comerciales.

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

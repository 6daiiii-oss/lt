# Estadísticas sencillas de Vendo

La sección está disponible en **Mi panel → Estadísticas** y en `/panel/estadisticas`. Conserva el color, tipografía y estilo de Vendo; no añade dependencias ni servicios externos.

- **Catálogo actual:** productos no archivados, publicados y unidades disponibles. Un gráfico circular distingue publicados, pendientes y otros estados. Este resumen no depende del filtro de fechas.
- **Atención:** productos con menos unidades disponibles que su mínimo de compra, con enlace para editarlos. Se muestran tres primero y un acceso al inventario cuando hay más.
- **Ventas:** importes de productos, pedidos pagados y unidades; evolución temporal y los cinco productos con mayor importe vendido. Solo aparecen gráficos de ventas cuando hay pedidos pagados en el período.
- **Períodos:** últimos 7, 30 o 90 días y fechas personalizadas dentro de un desplegable.
- **Dinero y comisiones:** conserva liquidaciones, sus pedidos e importes y el simulador existente dentro de una sección secundaria desplegable.

## Qué significan las cifras

Las ventas son el importe bruto de productos antes de reembolsos y sin envío; no representan ganancia ni saldo disponible. El criterio comercial existente se conserva: pedidos cuya compra tiene pago aprobado, reembolsado o parcialmente reembolsado. Los filtros y agrupaciones usan la fecha de creación del pedido en **America/Lima**. Los reembolsos corresponden a esos pedidos, no necesariamente a la fecha en que se devolvió el dinero. Las liquidaciones muestran su historial completo y no se filtran por el gráfico.

No se inventan visitas, conversiones, crecimiento, ventas ni datos de comparación. Cuando no hay pedidos, se explica el estado. Cuando no hay productos, se ofrece crear el primero. Los estados y existencias se consultan a la API del proveedor autenticado.

## Implementación y verificaciones

Gráficos SVG adaptables con títulos, leyenda y consulta textual de los importes. Los períodos largos se agrupan en un máximo de treinta intervalos conservando exactamente céntimos y cantidad de pedidos. Los días sin ventas dentro del período se representan con cero; no se simulan ventas previas.

El endpoint existente de estadísticas añade únicamente `daily`, un resumen por día de las mismas filas autorizadas y filtradas. No cambia el esquema, los permisos, las comisiones, la autenticación ni el bloqueo de compras. No se ejecutan pagos reales ni se añaden datos a producción.

Validación local: 56 pruebas de lógica y servidor y 15 de Playwright aprobadas. Prueba de regresión de fechas en el límite de medianoche peruana, exclusión de pedidos no pagados y aislamiento entre marcas. Pruebas visuales de gráficos a 320, 390, 768 y 1440 píxeles, estados vacíos, filtros y acceso al simulador. Las cifras ilustrativas utilizadas por las pruebas son fixtures aislados y nunca se publican como datos del catálogo real.

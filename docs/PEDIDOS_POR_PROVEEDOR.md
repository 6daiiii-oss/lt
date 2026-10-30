# Solicitudes independientes por proveedor

## Implementado

- Solicitud de varios productos de una sola marca y destino perteneciente al comprador. No se mezclan proveedores en solicitudes, cotizaciones, nuevas incorporaciones al carrito ni recompras.
- El carrito histórico sigue mostrando todos sus grupos, con una solicitud independiente por grupo. No se vacía al solicitar ni se eliminan productos automáticamente.
- Respuesta del proveedor con cantidades, variantes de catálogo, disponibilidad, precios, descuento, envío nullable, despacho estimado, rango de llegada y modalidad agencia/domicilio.
- La respuesta del proveedor y la aceptación final del comprador son pasos diferentes. Cada respuesta genera una versión inmutable. Las modificaciones de cualquier condición requieren aceptar la nueva versión; se conservan las aceptaciones anteriores.
- Envío pendiente no equivale a cero: total null, sin aceptación hasta completar cotización y disponibilidad. Ningún cargo nuevo por cotizar ni procesamiento inventado.
- Conversación propia de cada solicitud. Consultas desde producto/tienda y conversaciones de pedidos históricos. Mensajes persistentes, paginación, fecha, no leídos por usuario, actualización periódica de 15 segundos y lectura administrativa auditada. Los mensajes no modifican cotizaciones.
- Preparación, despacho y entrega de pedidos pagados históricos conservan sus servicios; el despacho ahora registra agencia/transportista, modalidad, fecha local de Perú, destino y código o enlace http/https. La fecha no puede ser futura.

## Límite deliberado de esta entrega

Las nuevas solicitudes llegan hasta la aceptación. NO crean una reserva, un checkout, un pedido financiero, un movimiento de inventario o un cobro. El endpoint público de creación de checkout anterior se retira y responde que debe seguirse la solicitud y definirse la política de transporte. Las reservas históricas siguen siendo consultables/cancelables; no se permite reanudar el pago interactivo de una reserva histórica multiproveedor. Los eventos financieros históricos siguen conciliándose mediante los servicios existentes.

Falta definir quién paga el transporte y dónde se cobra (en Vendo o directamente a la agencia). Hasta resolverlo, no es correcto convertir automáticamente una cotización en un cobro de productos más envío. Tampoco está contratado/configurado el pago real. La futura conexión de una versión aceptada con el checkout individual deberá implementar esa política y reservar stock en una transacción; esta entrega no declara implementada esa conexión.

La comisión del 7% y las reglas financieras históricas permanecen intactas. No se incorpora crédito, retención nueva, transporte de Vendo, consolidación logística ni compra conjunta. Las fechas de llegada son estimaciones del proveedor, no garantías.

## Datos y pruebas

007_supplier_requests.sql es aditiva: nuevas tablas de conversaciones, solicitudes, cotizaciones, aceptaciones e historial; tres columnas nuevas de despacho. No modifica las migraciones 001–006 ni borra registros. Cotizaciones, aceptaciones y mensajes son inmutables. Los permisos se comprueban en el servidor por organización participante; el acceso administrativo exige administración verificada y queda auditado.

Las pruebas financieras antiguas crean exclusivamente fixtures de compras históricas con tests/legacy-checkout-fixture.js. Ese módulo no está montado en ninguna ruta de la aplicación ni se importa desde el servidor. Así se conserva la cobertura de reservas, idempotencia, pagos, comisiones, reembolsos y conciliación de datos antiguos sin volver a abrir el checkout público retirado. El recorrido de navegador de compra conjunta se reemplaza por un recorrido real de solicitud/cotización/aceptación/chat.

## Publicación separada

No desplegar solo los archivos de aplicación: /api/me y las pantallas nuevas requieren la migración 007. Antes de publicar:

1. Verificar y guardar un respaldo de PostgreSQL y comprobar su restauración en una base aislada.
2. Validar las migraciones contra esa copia y revisar recuentos e importes históricos. No corregir checksums históricos a ciegas.
3. Aplicar npm run migrate en una única ejecución controlada contra la base de destino, con el bloqueo asesor y la transacción existentes. La aplicación anterior puede seguir operando durante la preparación; no iniciar dos migradores simultáneos.
4. Desplegar el commit aprobado, conservando la configuración de pagos reales cerrada, y comprobar salud, sesión, solicitudes, permisos y conversaciones.

No hay cambios de credenciales ni contratación de servicios. No se han aplicado estas migraciones a producción en esta tarea.

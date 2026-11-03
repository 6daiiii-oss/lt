# Presentaciones, precios y cotizaciones

Política vigente desde el 3 de noviembre de 2026: comisión del 5% sobre el subtotal final de productos después de descuentos o de una oferta aceptada. IGV de la comisión incluido, sin comisión sobre envío. El comprador asume el procesamiento cuando exista una tarifa real contratada. Los pedidos previos conservan sus snapshots.

El registro conserva el celular como contacto y no envía ni exige SMS. No se marca un número sin verificar como verificado. La revisión comercial y de productos sigue siendo necesaria para publicar.

## Configuración del proveedor

En el editor de producto, activar «Vender por docena, caja u otra presentación». Hasta ocho presentaciones con nombre, contenido en unidades, mínimo, incremento, precio por presentación y hasta tres tramos adicionales. El precio de cada tramo se aplica a toda esa línea; no se suman productos, presentaciones o variantes distintas. Un surtido autorizado se ofrece como una presentación explícita del mismo SKU, con sus condiciones; no agrega automáticamente SKUs de otros colores.

Los precios finales se guardan en céntimos por presentación y se multiplican por el número entero de presentaciones. El equivalente por unidad es informativo y nunca se multiplica redondeado para cobrar. Mínimo de dos e incremento de uno admite dos, tres y cuatro cajas.

Inventario compartido: docenas y cajas descuentan unidades del stock base del producto. Inventario separado: las cajas selladas tienen su propio contador; no se abren para abastecer otras presentaciones. Cambios de stock no pueden dejar reservas sin cubrir. El checkout, consumo, liberación y reposición guardan el inventario utilizado.

Una sola presentación por producto en la bolsa o solicitud. Para colores/modelos con existencias propias se usan SKUs distintos. Productos existentes sin presentaciones conservan la venta por unidad y sus mínimos anteriores.

## Cotización opcional

El proveedor activa «Permitir solicitudes de cotización especial». La tienda solicita cantidades y destino por volumen, surtido de varios productos, personalización o transporte. El umbral por volumen no bloquea una consulta de flete o personalización.

El proveedor responde desde Cotizaciones con precios por presentación, cantidades enteras, flete separado, fecha de entrega, condiciones y vencimiento de hasta 30 días. Su panel calcula comisión y neto. La oferta incluye todos los productos de la solicitud y tiene una versión para evitar aceptar condiciones que cambiaron.

La tienda acepta la versión vigente. Pedir y aceptar ofertas no reserva inventario. Se revisan stock, presentación, destino, vencimiento y disponibilidad antes de continuar y al confirmar el pago de prueba. Una oferta completa reemplaza la bolsa cuando el comprador elige continuar con ella. La oferta no se puede usar para dos pedidos pagados.

En producción se puede solicitar, responder y aceptar cotizaciones. Las compras y cobros reales siguen cerrados, como antes de esta entrega. La conversión a bolsa y checkout se prueba en sandbox, sin abrir cobros ni configurar una pasarela real.

## Ejemplo

Cinco cajas de 144 unidades a S/540 por caja: 720 unidades, S/2,700 en productos, S/135 para Vendo y S/2,565 para el proveedor antes de otros ajustes; el flete se suma por separado y no genera comisión.

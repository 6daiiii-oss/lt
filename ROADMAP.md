# Decisiones pendientes y alcance futuro

## Requisitos externos antes de una operación comercial

- Elegir y contratar pasarela con soporte real para el modelo B2B/marketplace en Perú. Validar titularidad de fondos, split o conciliación administrativa, comisiones de pasarela, reembolsos, desembolsos y evidencia. Implementar su adaptador oficial y probar credenciales/webhooks/conciliación antes de levantar el bloqueo de checkout real.
- Aprobar tarifa comercial, base de cálculo de comisión, acuerdos con proveedores, plazos de liquidación y cancelación. Las reglas actuales son de sandbox.
- Definir política tributaria, comprobantes y base de precios con asesoría correspondiente. Integrar emisión fiscal si procede; los resúmenes actuales no son comprobantes legales.
- Revisar privacidad, tratamiento de datos, retención, contratación, cancelaciones e incidencias. Publicar un contacto operativo aprobado. Los textos actuales están rotulados como pendientes.
- Configurar SMTP y validar entrega externa. El buzón local sirve solo a desarrollo.
- Obtener autorización y contrato de inventario de cada fuente real. Configurar origen, egress y credenciales seguras; ejecutar una sincronización real supervisada antes de afirmar que el proveedor está conectado.
- Seleccionar almacenamiento persistente, backups/recuperación, protección operativa, monitorización y proceso de atención de incidencias. Conservar de forma segura las claves de cifrado junto a backups autorizados.
- Incorporar las referencias visuales faltantes si se suministran: `Prototipo_Lote.html`, guía de marca y tokens originales. La dirección actual usa la portada preservada y los valores de la solicitud.

## Posibilidades fuera de este MVP

Crédito comercial, devoluciones gratuitas garantizadas, almacén/reparto propio, publicidad pagada, inteligencia artificial, POS/ERP, aplicaciones nativas e internacionalización. No tienen fecha comprometida ni botones activos.

Posibles evoluciones técnicas, según necesidad validada: agrupación editorial de variantes bajo un producto padre, múltiples miembros con invitaciones controladas, almacenamiento de objetos, integración logística con comprobación externa de entrega y exportación documental autorizada. El modelo actual consolida cada variante vendible en un SKU y mantiene snapshots históricos.

## Publicación y repositorio

Los cambios se preparan en el checkout y la rama de trabajo. No se despliega a producción, no se activa ningún cobro y no se publica un PR automáticamente. Una futura publicación requiere revisar configuración comercial y el resultado concreto, además del procedimiento del entorno.

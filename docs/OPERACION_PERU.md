> Actualización 2026-10-20: las referencias al recargo del 10% de esta guía quedaron reemplazadas por [DESPLIEGUE.md](DESPLIEGUE.md): comisión al proveedor 10% inicial / 7% recurrente, sin recargo al comprador.

# Operación de Lote: cuentas, Faire, pagos y comprobantes

Revisión: 19 de octubre de 2026, Perú. El código se implementó en el checkout Windows `C:/Users/Rodolfo/Documents/Lote/lt`. Los servicios externos no están contratados ni activados por esta entrega.

## Qué funciona

- Registro separado de tiendas y marcas; sesiones persistentes, correo de verificación, recuperación y cambio de contraseña. Cambiar contraseña revoca todas las sesiones.
- Seguridad en `/cuenta/seguridad`: verificación de celular peruano `+519xxxxxxxx`, códigos de seis dígitos, vigencia local de 10 minutos, 5 intentos y límite de envíos persistente en PostgreSQL. El celular verificado pertenece a la cuenta; el teléfono de contacto del negocio y el de entrega son datos distintos.
- El correo y el celular se exigen antes de comprar, solicitar revisión comercial y realizar cambios desde el panel de marca. Una tienda no puede crear productos. Cada marca solo puede consultar y modificar sus productos y pedidos.
- Productos manuales, fotos, variantes por SKU, stock, carga CSV y feeds autorizados. Toda entrada de precio usa el mismo cálculo del servidor. Publicación sujeta a revisión comercial y moderación del catálogo.
- Panel de marca con pedidos recientes, buscador de pedidos, tienda compradora, artículos, unidades, dirección y contacto, preparación, transportista, seguimiento, incidencias y liquidaciones simuladas.

## Precio y comisión solicitados

La marca declara **S/100 de base**. Lote añade **S/10** y el comprador ve **S/110**, más el envío declarado. El 10% se calcula sobre la base de la marca: representa aproximadamente 9.09% del precio final, no 10% del precio final.

Se redondea por unidad a céntimos, mitad hacia arriba. Base 105 céntimos → recargo 11 → precio 116. Dos unidades cuestan 232; el recargo total es 22. Catálogo, filtros, márgenes, carrito, checkout y recompra usan el precio final. Editar un producto no vuelve a aplicar el recargo sobre el precio ya incrementado.

La marca ve base y precio al cliente en productos; por pedido ve recargo y saldo antes de gastos externos. El comprador no recibe base, comisión, política interna de precio ni ledger en las respuestas de pedidos. Ocultar el desglose no equivale a impedir que alguien deduzca un margen conocido.

La migración 004 interpreta el precio de catálogo anterior como base y añade el 10%. Los carritos anteriores requieren revisar precios. Los pedidos existentes mantienen sus snapshots. Las antiguas reglas variables se conservan como historial y ya no modifican pedidos nuevos. `SANDBOX_COMMISSION_BPS` dejó de tener efecto.

El saldo mostrado no es beneficio neto ni transferencia bancaria: faltan gastos de pasarela, tratamiento tributario y condiciones definitivas de devoluciones. Los envíos no reciben el recargo. No se añade IGV automáticamente sin definir qué incluyen los precios.

## Cómo opera Faire y qué tomar como referencia

Faire publica 15% por pedidos del marketplace y un cargo de US$10 por el primer pedido de un cliente; Faire Direct ofrece pedidos sin comisión. Hay condiciones según mercado y programa. Su modelo descuenta la comisión a la marca, mientras Lote añade el recargo solicitado. [Explicación oficial](https://external.faire.com/how-faire-works).

Las marcas producen y despachan directamente; el detalle del pedido permite consultar la liquidación: subtotal + reembolso de envío − comisión − cargo de desembolso cuando corresponda. Lote ya tiene el equivalente operativo de pedido por marca, transporte, seguimiento y desglose privado. [Ayuda oficial para marcas](https://www.faire.com/en-gb/support/brands), [ayuda de pedidos](https://www.faire.com/support).

Faire también ofrece crédito a 60 días para comercios elegibles y devoluciones gratuitas en el primer pedido de una marca, sujetas a sus condiciones. Son servicios financieros y logísticos adicionales que no deben prometerse en Lote sin financiación y operación propias. [Pagos y devoluciones de Faire](https://external.faire.com/how-faire-works).

Para empezar en Lote propongo despacho directo por marca, pedido y envío separados por proveedor, plazos declarados, seguimiento obligatorio y liquidación con incidencias conciliadas. No supone almacén propio ni integración con transportistas. Definir quién paga el retorno, daños, faltantes y contracargos antes de ofrecer garantías comerciales.

## Gmail y SMS

El correo de la cuenta puede ser Gmail personal o de empresa; no se restringen otros dominios. El **remitente de los correos de Lote** se configura por SMTP. Esto no es un botón de inicio de sesión con Google.

Para Gmail: activar verificación en dos pasos y, cuando la cuenta lo permita, generar una contraseña de aplicación. Guardarla directamente en `.env` o en el gestor de secretos del hosting; nunca en código, GitHub o chat. Google puede restringir contraseñas de aplicación según la cuenta/organización. [Guía de Google](https://support.google.com/mail/answer/185833?hl=es).

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=correo-elegido@gmail.com
SMTP_PASSWORD=contraseña_de_aplicacion
MAIL_FROM=correo-elegido@gmail.com
```

Ejecutar servidor y worker; el worker entrega verificaciones, recuperación y notificaciones. `npm run mail:check` comprueba autenticación SMTP sin enviar mensajes. Sin SMTP, `/buzon` solo muestra mensajes de la cuenta autenticada en desarrollo. Falta configurar el remitente elegido y probar entrega real.

**SMS sí cuesta**. Twilio Verify publica US$0.05 por verificación exitosa **más** cargos del canal/destino. Los intentos de entrega SMS pueden generar cargos aun sin completar la verificación; no usar el precio SMS de Estados Unidos como tarifa peruana. Confirmar el precio Perú y límites de gasto en la cuenta contratada. [Tarifas Verify](https://www.twilio.com/en-us/verify/pricing), [SMS Perú](https://www.twilio.com/en-us/sms/pricing/pe).

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=VA...
```

Crear un Verify Service con códigos de **6 dígitos**, habilitar Perú, configurar controles de gasto y usar credenciales privadas. El adaptador consume [Verifications](https://www.twilio.com/docs/verify/api/verification) y [VerificationCheck](https://www.twilio.com/docs/verify/api/verification-check). No se ha enviado ni cobrado ningún SMS real. En desarrollo, `SMS_PROVIDER=sandbox` muestra códigos solo a su titular; producción rechaza ese modo. La verificación acredita posesión del celular, no identidad legal ni autenticación de dos factores en cada login.

## Pasarela frente a POS

Para el checkout web corresponde una **pasarela online**; un POS físico solo sería adicional para una venta presencial. El problema decisivo es cómo repartir el dinero entre marcas, Lote, comisiones y reembolsos.

| Opción | Encaje | Qué falta confirmar |
| --- | --- | --- |
| Culqi Online | Candidato para cobros web y métodos locales, con APIs y entorno de prueba. | Aceptación contractual del marketplace, reparto de fondos, quién recibe los abonos, tarifas, reembolsos y conciliación. Un checkout normal no demuestra soporte de split multimarcas. |
| Niubiz Pago Web | Alternativa para ecommerce con carrito. | Cotización y evaluación comercial, modalidad marketplace, abonos, reparto y reembolsos por marca. |
| Mercado Pago Split | Tiene documentación peruana de marketplace 1:1: un vendedor y la plataforma por pago. | Habilitación, medios de pago aplicables y si se acepta pagar por marca. Un solo cobro para varias marcas requiere confirmar una solución 1:N en Perú; no asumirla por existir en otro país. |
| POS físico | Ferias, showroom o venta presencial futura. | No resuelve por sí solo el carrito web ni el reparto multimarcas. |

Fuentes: [Culqi Online](https://culqi.com/productos/online-pasarela-de-pagos/), [API Culqi](https://apidocs.culqi.com/), [Niubiz Pago Web](https://contactos.niubiz.com.pe/soluciones-de-pago/pago-web/), [requisitos Split Perú](https://www.mercadopago.com.pe/developers/es/docs/split-payments/split-1-1/prerequisites), [integración Split Perú](https://www.mercadopago.com.pe/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace).

Culqi publica como referencia 3.44% para tarjetas nacionales y un fijo de US$0.20 para online, con mínimos y condiciones sujetos a evaluación; esto no es una cotización para Lote. Ejemplo aritmético sin envío: cobro de S/110 × 3.44% = S/3.784, más el fijo. Si Lote absorbe ese gasto, el margen de S/10 disminuye. [Tarifario publicado](https://culqi.com/productos/online-pasarela-de-pagos/).

**Recomendación:** solicitar primero propuesta de Culqi y Niubiz describiendo explícitamente el marketplace y carrito multimarcas. Evaluar Mercado Pago si el pago separado por marca es aceptable. Elegir por reparto, conciliación y contrato, además de tarifa. Mantener sandbox hasta contar con una modalidad aprobada y probar cobro, fallo, webhook repetido, pago tardío, devolución parcial y conciliación.

## Boleta, factura y modelo comercial

La pasarela cobra; el sistema de comprobantes emite el documento fiscal. La confirmación de un pago no acredita que se haya emitido una factura o boleta electrónica válida. SUNAT distingue ambos tipos de comprobante y sus requisitos. [Comprobantes electrónicos](https://orientacion.sunat.gob.pe/comprobantes-de-pago-electronicos-1), [boleta electrónica](https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta).

Antes de integrar emisión se debe resolver con contabilidad quién vende jurídicamente:

1. **Intermediación:** la marca vende al comprador y Lote presta un servicio. Hay que definir cómo se documentan el precio final, el recargo, la cobranza por cuenta de terceros y la factura de servicio de Lote. Que el comprador no vea una línea comercial de comisión en la web no elimina obligaciones documentales.
2. **Reventa:** Lote compra a la marca y vende al cliente. Cambian la facturación, reconocimiento de ingresos, responsabilidad y tratamiento del margen.

Estos son modelos a evaluar, no una conclusión tributaria para la empresa. Para B2B conviene capturar RUC, razón social y dirección fiscal cuando se solicite factura. Elegir emisión por SEE/PSE según el modelo definido, manejar aceptación/rechazo, XML, representación, CDR cuando corresponda y notas de crédito. SUNAT contempla estas últimas para anulaciones/devoluciones. [Orientación de comprobantes](https://orientacion.sunat.gob.pe/04-comprobantes-de-pago).

Actualmente el checkout guarda la solicitud de boleta/factura y declara `fiscal_document_issued:false`; no emite comprobantes SUNAT. Se conserva ese estado explícito hasta integrar un emisor real.

## Funciones propuestas para decidir después

- Cotización automática de envíos y seguimiento conectado con transportistas.
- Tarifas por volumen y precios escalonados para pedidos mayoristas.
- Alertas de pedidos sin aceptar y plazos de despacho vencidos.
- Liquidaciones bancarias y comprobantes electrónicos automatizados, una vez contratados sus proveedores.

Ya existen favoritos, recompra, incidencias, control de stock/reservas, notificaciones y auditoría; no se presentan como funciones nuevas por contratar.


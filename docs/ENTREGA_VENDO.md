# Entrega de Vendo · 22 de octubre de 2026

## Alcance

Preparación del catálogo, cuentas y paneles para publicación. No constituye habilitación para cobrar: todavía no hay pasarela contratada ni identificación legal del operador completa. Se conserva el bloqueo de compras de producción.

## Cambios

- Registro de proveedor con cinco datos esenciales y verificación del celular antes de cargar productos. Los datos comerciales complementarios siguen disponibles sin alargar el primer formulario.
- Condiciones y privacidad accesibles desde el registro y el pie de página. Aceptación desmarcada por defecto y exigida también por el servidor; versión y huellas de ambos documentos se registran junto a la cuenta en una transacción. No se registra consentimiento publicitario.
- Los documentos muestran claramente la identificación pendiente. No se inventó razón social, RUC ni domicilio. Para aprobarlos hacen falta revisión y `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_RUC`, `LEGAL_OPERATOR_ADDRESS`, `BUSINESS_CONTACT_EMAIL`, `LEGAL_APPROVED=true` y `POLICIES_APPROVED=true`.
- Menú compacto para paneles móviles, campos y botones cómodos, adaptación de tarjetas, tablas, fotos, documentos y formularios entre 320 y 1440 píxeles. Inter, cobre, marfil y negro respetan la identidad existente.
- Exportación autenticada de los datos básicos de la propia cuenta y sus aceptaciones, sin contraseñas, tokens ni datos de otras cuentas. No se presenta como exportación de todo el historial comercial.
- Comisión prevista del 7%, con IGV incluido, sobre productos. Procesamiento cotizado al comprador, sin tarifa inventada. Los pedidos históricos conservan sus importes congelados.
- Simulador administrativo de reparto multimarcas con conservación exacta de céntimos. Valida proveedores, duplicados e importes, y no crea pagos ni movimientos contables.
- Ajuste del proxy de Render para los límites por IP, política de permisos del navegador y conservación de los controles existentes de acceso, CSRF, sesiones, archivos y cifrado.
- GitHub Pages conserva estilos y rutas legales; identifica su carácter de vista estática y dirige al sitio real para cuentas y catálogo.

## Comprobaciones

Resultado local: 48 pruebas del servidor y 10 pruebas del navegador aprobadas, además de sintaxis y exportación estática. Se usan bases temporales aisladas para registro y aceptación, privacidad, autorización, reparto y redondeo, dominio comercial, archivos persistentes, existencias, bloqueos de compras y flujos del navegador. No se envían SMS reales desde estas pruebas.

Antes de publicar se generó un nuevo respaldo de PostgreSQL de producción y se restauró correctamente en una base local aislada: 3 usuarios, 1 marca, 1 producto y 4 archivos. La base temporal se retiró después de verificarla; producción no se modificó. El respaldo privado se conserva fuera de Git, en `.runtime/release-backup-1792728449464` del checkout original.

La entrega no modifica el esquema SQL ni necesita migraciones nuevas. No recalcula pedidos existentes ni cambia credenciales. Conservar respaldo de PostgreSQL, archivos y claves antes de cualquier actualización; restaurar solamente en una base aislada para comprobar recuperación.

## Requisitos externos pendientes

1. Identificar al titular legal y completar revisión contractual y de privacidad antes de abrir ventas.
2. Contratar pasarela compatible con el modelo real y sus requisitos para cada proveedor. La documentación oficial de Mercado Pago indica que [1:N necesita intervención comercial](https://www.mercadopago.com.pe/developers/es/docs/split-payments/split-1-1/prerequisites); no equivale a tener esa capacidad contratada.
3. Implementar y probar OAuth/KYC de vendedores, webhooks firmados, idempotencia, conciliación, devoluciones y contracargos en la sandbox oficial de la pasarela elegida. Las pruebas internas no sustituyen esa certificación.
4. Confirmar comprobantes, tributación, logística, reclamos y tratamiento de datos con los responsables correspondientes.
5. Configurar y comprobar SMTP para recuperación de cuentas; comprobar SMS con un teléfono autorizado. Las llamadas reales de Twilio pueden generar consumo.
6. Programar respaldos externos cifrados, alertas operativas y pruebas periódicas de restauración. Esta entrega no contrata servicios ni promete seguridad absoluta.

Solo después de estas comprobaciones debe evaluarse habilitar pagos reales. El catálogo y la preparación de productos siguen disponibles mientras tanto.

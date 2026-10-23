# Despliegue en servidor

Esta entrega permite publicar el catálogo y utilizar sus paneles. **No habilita operación comercial con cobros reales.** La aplicación bloquea checkout y reembolsos en producción. El administrador puede calcular un reparto sin ejecutar pagos ni registrar liquidaciones. No hay pasarela contratada ni credenciales de pago en este repositorio.

## Condiciones implementadas

- La marca declara precio final por unidad con IGV incluido. El precio publicado no recibe un recargo de Vendo.
- Comisión del 7% sobre el total de productos, con el IGV del servicio incluido, tanto en primer pedido como en recompra. El transporte no genera comisión.
- En productos por S/1.000, la comisión total es S/70: servicio S/59,32 e IGV S/10,68. El proveedor recibe S/930 más el envío que le corresponda.
- Desglose congelado por pedido; historial sin recalcular. Si una entrega se anula posteriormente, los pedidos ya creados no cambian.
- El comprador asumiría el procesamiento de la pasarela, sujeto a contrato y condiciones legales. El simulador admite una cotización explícita; no inventa una tarifa. Por ejemplo, con productos por S/1.000 y una cotización de S/35, el comprador pagaría S/1.035 y el proveedor conservaría S/930. El simulador administrativo reparte importes en céntimos y no mueve dinero.
- Categorías exoneradas, descuentos, detracciones/retenciones, tributación específica y comprobantes electrónicos requieren definición antes del lanzamiento comercial. No usar este supuesto para todo producto sin validación.

## Preparación

Servidor con Docker y Compose v2, dominio apuntando al servidor y puertos 80/443 abiertos. Copiar `.env.example` a `.env.production`; no subirlo a GitHub. Configurar:

- `NODE_ENV=production`, `APP_ORIGIN=https://DOMINIO`, `SITE_DOMAIN=DOMINIO`.
- `DATABASE_URL` con host `db`, usuario/base `lote` y contraseña codificada como URL; `POSTGRES_PASSWORD` con la misma contraseña original.
- `SESSION_SECRET` y `SANDBOX_WEBHOOK_SECRET`: valores aleatorios independientes de al menos 32 caracteres. `ENCRYPTION_KEY`: 32 bytes hexadecimales. Puede generar cada uno localmente con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- Twilio Verify real y contacto comercial. SMTP y `MAIL_FROM` son opcionales para el registro por número; hacen falta para confirmación opcional y recuperación por correo. `POLICIES_APPROVED=true` solo después de revisión efectiva.
- Mantener `PAYMENT_PROVIDER=sandbox`. Esto no habilita pagos de producción.

## Instalación

```sh
docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d db
docker compose --env-file .env.production -f compose.production.yaml run --rm migrate
docker compose --env-file .env.production -f compose.production.yaml up -d app worker proxy
docker compose --env-file .env.production -f compose.production.yaml exec app npm run admin:create -- CORREO_DEL_OPERADOR
```

El último comando pide contraseña en terminal. No hay cuentas predeterminadas. Migrar antes de iniciar/actualizar app y worker. La nueva migración no edita migraciones antiguas; elimina el recargo de productos existentes y puede invalidar reservas pendientes al revalidar precio. Aplicarla en ventana sin compras activas. Respaldar antes de actualizar.

## Verificación y recuperación

Comprobar `/api/health`, registro, verificación, recuperación de contraseña, permisos y carga de archivos. Revisar Administración → Preparación del lanzamiento. `Configurado` no equivale a probado.

Respaldar PostgreSQL con `pg_dump` y el volumen `uploads`, además de guardar `ENCRYPTION_KEY` de forma segura. Cifrar respaldos fuera del servidor y probar restauración en entorno aislado; sin la clave no se recuperan datos cifrados. No usar `down -v`. El backup no se automatiza en esta entrega.

## Pendientes para ventas reales

1. Contrato y tarifa de Mercado Pago, alta KYC/OAuth por proveedor y split 1:N si se desea un solo pago multimarcas.
2. Adaptador de pago real, firma de webhooks, conciliación, contracargos, reembolsos y registros reales de procesamiento probados en sandbox oficial.
3. Confirmar impuestos por producto, comprobantes de cada parte y que el contrato permita la tarifa al comprador prevista en la política.
4. Completar identidad legal, contratos, privacidad, atención de reclamos y políticas operativas.
5. Validar seguridad, entrega de correo/SMS, backups y restauración en el servidor elegido.

Mensajería general, promociones, permisos granulares de empleados y emisión fiscal no se presentan como funciones terminadas. Las conversaciones de incidencias sí están operativas.

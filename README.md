# Lote · marketplace B2B en sandbox

Lote conecta marcas y proveedores revisados con tiendas independientes para reventa. Perú, español y PEN (S/). Frontend modular HTML/CSS/JavaScript, API Express 5 y PostgreSQL 17. **No hay cobros, transferencias ni comprobantes fiscales reales habilitados.**

La instalación normal empieza con cero productos, pedidos, reseñas y actividad comercial. Solo se crean seis categorías. No se crean administradores automáticamente.

## Windows / VS Code

Requisitos: Node.js **24 LTS**, npm y Docker Desktop con contenedores Linux y Docker Compose v2. Abre el checkout real en VS Code. Si está en la carpeta indicada originalmente:

```powershell
Set-Location 'C:\Users\Rodolfo\Documents\Lote'
code .
git pull --ff-only origin main
npm install
npm run dev
```

En un checkout nuevo, `npm run dev` genera la configuración local con claves aleatorias, arranca PostgreSQL con Compose y aplica migraciones. Requiere Docker Desktop iniciado. Conserva una configuración existente; con PostgreSQL propio, configura las variables y omite `LOTE_LOCAL_DATABASE=compose` para gestionar ese servicio por separado.

El servidor responde en `http://localhost:3000`. En cloud el checkout está en `/workspace/lt`; no se ha editado el disco del PC. Para instalaciones posteriores usa `npm ci`, que respeta `package-lock.json`.

En otra terminal, en el mismo checkout:

```powershell
npm run worker
```

El worker libera reservas caducadas, procesa feeds autorizados y entrega correos sin depender del navegador. Mantén ambos procesos abiertos. `Ctrl+C` los detiene. `npm run db:down` detiene PostgreSQL sin borrar el volumen `lote_lote_pg`. Evita `docker compose down -v` si necesitas conservar datos.

Los pasos también se pueden ejecutar explícitamente: `npm run setup:local`, `npm run db:up`, `npm run migrate`. En producción usa `npm start` y las migraciones como paso separado obligatorio. Las migraciones aplicadas tienen checksum: crea otra migración para evolucionar el esquema.

## Cuentas y configuración local

`npm run setup:local` crea `.env` con contraseñas/claves aleatorias; conserva un archivo existente. `.env.example` describe variables sin secretos. PostgreSQL solo se publica en la interfaz local, puerto 5432.

1. Registra tu cuenta en `/registro` como tienda o proveedor.
2. Sin SMTP, abre **Mi cuenta → Mi buzón local** y verifica el correo. Solo muestra mensajes de tu sesión; se deshabilita en producción o al configurar SMTP.
3. Completa el perfil comercial, direcciones y solicita verificación. Los documentos comerciales e imágenes de incidencias son privados.
4. Crea un administrador desde una terminal autorizada:

```powershell
npm run admin:create -- tu-correo-de-operacion@tu-dominio.pe
```

El comando pide una contraseña nueva de al menos 16 caracteres sin mostrarla. No tiene contraseña predeterminada ni eleva una cuenta existente; considera verificado al operador creado por este mecanismo controlado. Inicia sesión y abre `/administracion`. Su acceso se comprueba en el servidor y no aparece en la navegación pública.

5. Aprueba la solicitud comercial. El proveedor completa `/panel/marca`, carga productos y solicita revisión. Publica desde administración. El comprador necesita correo y negocio aprobados para iniciar checkout.

La recuperación sin sesión necesita entrega por SMTP; el buzón local no abre mensajes de otras cuentas. Verificación y recuperación usan tokens de un uso con vencimiento a 30 minutos. Cambiar contraseña revoca las sesiones.

## Demo optativa y aislada

```powershell
npm run demo:seed
npm run demo:dev
# En otra terminal:
npm run demo:worker
```

Se crea otra base `lote_demo_<identificador>` con dos marcas, dos tiendas, un operador y dos productos **DEMO**. La base normal no cambia. Los accesos aleatorios están en `.runtime/demo-access.json`, un archivo privado local: ábrelo localmente y no lo compartas. `.env.demo` selecciona esa base, incluso si la terminal tenía otra URL de base inyectada. La demo utiliza buzón local y desactiva SMTP externo. El seed conserva una demo existente y está prohibido en producción.

Detén el servidor normal antes de iniciar la demo: ambos usan el puerto 3000. Para volver a la base normal utiliza `npm run dev` y `npm run worker`.

## Catálogo y fuentes autorizadas

- `/panel/productos`: un SKU inmutable por variante vendible; precio por unidad, PVP opcional, MOQ, múltiplo y stock físico. Las imágenes se decodifican y normalizan a WebP. Usa solo imágenes con derecho de uso.
- `/panel/importaciones`: plantilla CSV UTF-8, comas y campos entrecomillados. Precios en céntimos enteros. `retail_cents` puede quedar vacío; `same_tax_basis` y `active` admiten `true/false`. Campos necesarios: `name,sku,category_id,wholesale_cents,moq,pack_multiple,stock`.
- La previsualización guarda filas/errores y no cambia productos. Política de lote atómico: ninguna fila se aplica si una falla. Aplicar requiere confirmación; nuevos productos y cambios sensibles pasan a moderación.
- `/panel/fuentes`: feeds HTTPS autorizados, con equivalencias de categorías. El operador configura `FEED_ALLOWED_ORIGINS` y permite esos dominios en la red del entorno. Las credenciales se vinculan por nombre `LOTE_FEED_...` en servidor, nunca por valor en el navegador o URL. Administración aprueba la fuente.
- El worker usa lease, exclusión, reintentos con backoff y registro. Las filas inválidas quedan como lote revisable. No hay scraping ni borrado por ausencia en un feed incremental; una baja exige `active:false`.
- El stock informado es el total vendible **incluyendo reservas locales**. La fuente incorpora ventas/reposiciones reconocidas hasta `updated_at`; Lote aplica los movimientos locales posteriores y resta reservas. Actualizaciones antiguas se ignoran. Un total inferior a reservas exige conciliación. Acuerda este contrato antes de conectar un proveedor real.

Contrato de feed y endpoints: [docs/API.md](docs/API.md).

## Compra y operación sandbox

Los importes son enteros en céntimos; cantidades y múltiplos son enteros. El servidor revalida mínimos de producto/marca, publicación, cobertura, precio y frescura. Exige revisar de nuevo si cambian precios o condiciones.

El checkout crea una compra padre y pedidos por marca, guarda snapshots y reserva inventario dentro de transacciones. El adaptador sandbox entrega eventos HMAC con cuerpo original, timestamp e ID único. Una URL del navegador no confirma pagos. Un pago tardío sin reserva válida queda en excepción para conciliación, sin sobreventa.

La tarifa comercial no está aprobada. `SANDBOX_COMMISSION_BPS=0` es el porcentaje inicial ilustrativo; las reglas de administración se congelan por pedido. El margen bruto requiere PVP positivo y declaración de igual unidad/base tributaria; en otro caso muestra “Sin referencia”. No equivale a rentabilidad neta.

Se usan los precios declarados sin inventar impuestos adicionales. El snapshot indica `tax_applied:null` y `sandbox_unconfigured`. Solicitar boleta/factura no emite un comprobante fiscal; la política tributaria y la emisión electrónica están pendientes de definición/integración.

GMV administrativo: subtotal bruto de productos de compras confirmadas, antes de reembolsos, sin envío. Pedidos operativos: todos los pedidos creados, incluidos pendientes/cancelados. Analítica de marca: venta y unidades brutas de pedidos pagados del período, antes de reembolsos; ticket = subtotal bruto / pedidos; recompra = tiendas con más de un pedido en ese período. Los reembolsos se muestran por separado. Fechas y períodos operativos se presentan en `America/Lima`.

La cancelación administrativa anterior al despacho reembolsa el saldo en sandbox y permite reposición revisada una sola vez. Un reembolso normal no repone stock; los artículos entregados no se reponen automáticamente. Las liquidaciones requieren entrega, movimientos coherentes y ausencia de incidencias abiertas. “Pagada” exige evidencia y una referencia `sandbox:...`, siempre de simulación.

## Servicios y variables

| Variable / servicio | Uso |
| --- | --- |
| PostgreSQL 17, `DATABASE_URL` | Dominio, sesiones y jobs; Compose lo proporciona en local. |
| `SESSION_SECRET` | HMAC de tokens de sesión/API; generada localmente. |
| `ENCRYPTION_KEY` | 32 bytes hexadecimales para cifrar datos de liquidación. Conservar de forma segura junto con backups. |
| `SANDBOX_WEBHOOK_SECRET` | Firma del sandbox; no es una credencial de pago real. |
| `APP_ORIGIN` | Origen exacto de CSRF y enlaces. Local: `http://localhost:3000`. |
| `SMTP_HOST/PORT/USER/PASSWORD`, `MAIL_FROM` | Correo real. Sin SMTP solo hay buzón local autenticado. Entrega externa pendiente de credenciales. |
| `FEED_ALLOWED_ORIGINS`, `LOTE_FEED_...` | Orígenes/credenciales autorizados. No hay fuentes reales configuradas por defecto. |
| `STOCK_MAX_AGE_HOURS`, `RESERVATION_MINUTES`, `NEW_PRODUCTS_DAYS` | Frescura, reservas y novedades; administración puede revisarlas. |
| `IMPORT_MAX_ROWS/BYTES`, `UPLOAD_MAX_BYTES` | Límites operativos. Imágenes JPEG/PNG/WebP; máximo 20 millones de píxeles. Se rechazan ejecutables, SVG y PDF. |
| `BUSINESS_CONTACT_EMAIL`, `POLICIES_APPROVED` | Contacto y revisión de políticas; no inventar un canal o aprobación. |

Inter y Manrope se sirven localmente con sus licencias OFL en `public/fonts`. No se necesita Google Fonts. Archivos privados/públicos en `.runtime/uploads`; operación comercial requiere almacenamiento persistente, backups y retención revisada.

Producción rechaza claves ausentes/cortas, origen sin HTTPS y SMTP/contacto/políticas sin configurar. Aun cumpliendo esto, el checkout real sigue bloqueado. Se necesitan pasarela compatible con el modelo en Perú, credenciales, reglas comerciales/tributarias, conciliación y revisión legal. Cambiar una variable no habilita cobros reales.

## Pruebas

```powershell
npm run check
npm test
# Si Playwright no tiene Chromium:
npx playwright install chromium
npm run test:ui
```

Las pruebas crean/eliminan bases `lote_test_*` y `lote_ui_test_*`, sin truncar la base normal. PostgreSQL necesita permiso `CREATEDB` para ese usuario. Se reutiliza Chromium del sistema si existe; en Windows se usa el instalado por Playwright. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permite indicar otro binario compatible.

La integración prueba dinero, dos marcas/dos tiendas, concurrencia, webhooks, recuperación, CSV, sincronización, cancelaciones, liquidaciones e imágenes. Chromium recorre proveedor → catálogo → moderación → compra multimarcas → sandbox → despacho → entrega → reseña/incidencia/recompra y los anchos 1440/1024/768/390/360.

Resultados reales: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Arquitectura: [docs/ADR-001.md](docs/ADR-001.md). Exclusiones y decisiones pendientes: [ROADMAP.md](ROADMAP.md).

## Estructura y referencias

`server/`: API y worker. `migrations/`: esquema versionado. `public/modules/`: router, vistas y componentes. `scripts/`: configuración, administrador y demo. `tests/`: integración PostgreSQL y navegador.

La portada original se conserva en `docs/reference/original/`. No se recibieron `Prototipo_Lote.html`, `01_Guia_de_marca_y_producto.md` ni un archivo de tokens previo. El nuevo `design-tokens.json` recoge los valores enviados en la solicitud.

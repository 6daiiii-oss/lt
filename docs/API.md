## Registro por número

`POST /api/auth/register` exige `phone` (nueve dígitos peruanos o +51), además de email, contraseña, nombre, nombre de negocio y tipo de cuenta. `legal_name` y `tax_id` son opcionales. Crea sesión pendiente; no envía confirmación de correo. El cliente solicita `/api/auth/phone/send` y confirma `/api/auth/phone/verify` dentro del registro. Ambos requieren sesión y CSRF. Las operaciones comerciales normales requieren celular verificado. Confirmación de celular no modifica `verified_at` del correo.

## Actualización 2026-10-20

Nuevas lecturas autenticadas de marca: `GET /api/seller/shipments`, `/incidents`, `/buyers`, filtradas por la marca de la organización activa. Nuevas lecturas solo admin: `GET /api/admin/finance`, `/logistics`, `/launch-readiness`.

Nuevos pedidos guardan `policy_snapshot.fees` con base de productos sin IGV, servicio, IGV del servicio, tasa 10/7 y procesamiento **estimado**. Esa información queda restringida a marca/admin; no se serializa al comprador. `commission_cents` incluye IGV del servicio para conservar la semántica de descuento del libro contable. Se mantienen los snapshots anteriores. No existe un endpoint de cobro real.

---

# API y contratos de integración

Base `/api`. Respuestas JSON salvo plantilla CSV y archivos. Dinero en céntimos PEN, cantidades enteras, fechas ISO 8601. Errores: `{message, code, details?}`. Las escrituras privadas y todas las lecturas privadas verifican identidad y organización en servidor.

## Demo local aislada

GET `/demo/info` informa si está habilitada. POST `/demo/login` admite `{role: buyerA|sellerA|sellerB|admin}` únicamente con `LOTE_DEMO_MODE=true`, base `lote_demo_*`, origen local y fuera de producción. Usa cookie `lote_demo_session` separada. `scripts/run-demo.js` establece ese entorno en puerto 3200. La base normal rechaza siempre este acceso.

## Autenticación

`GET /me` devuelve usuario, membresías autorizadas, organización seleccionada y token CSRF de esa sesión; no devuelve hashes, secretos ni datos bancarios. El navegador conserva una cookie HttpOnly. Las escrituras exigen `Origin` igual a `APP_ORIGIN` y, con sesión, `X-CSRF-Token`. `X-Organization-Id` solo selecciona una membresía existente. No hay selector de privilegios.

| Método / ruta | Operación |
| --- | --- |
| POST `/auth/register` | `{email,password,name,businessName,kind: buyer\|seller}`; crea negocio pendiente y correo de verificación. |
| POST `/auth/login`, `/auth/logout` | Inicio/fin de sesión y revocación del token actual. |
| POST `/auth/resend`, `/auth/verify` | Reenviar verificación / consumir `{token}` de un uso. |
| POST `/auth/forgot`, `/auth/reset` | Solicitud genérica por email / `{token,password}`; revoca sesiones. |
| POST `/auth/password` | `{currentPassword,password}`; cambia contraseña y revoca todas las sesiones. |
| GET `/auth/phone` | Número verificado y solicitud pendiente del usuario autenticado. |
| POST `/auth/phone/send` | `{phone}` con +51; exige correo verificado, cooldown 60 s y máximo 5 solicitudes/hora por usuario o número. |
| POST `/auth/phone/verify` | `{id,code}`; código de 6 dígitos, máximo 5 intentos, caduca a los 10 minutos. |
| GET `/dev/sms` | Solo desarrollo con SMS sandbox: códigos pendientes propios. |
| GET `/dev/mail` | Solo desarrollo sin SMTP y con sesión: mensajes de ese usuario. |

Los endpoints de vendedor reciben `wholesale_cents` como base de marca; sus lecturas incluyen `customer_price_cents`. Los endpoints públicos y de comprador usan `wholesale_cents` como precio final con 10% añadido. Los pedidos de comprador omiten comisión y reglas internas. La configuración histórica de comisiones es solo de consulta; POST `/admin/commissions` devuelve 409 `fixed_markup`.

## Público y cuenta

| Método / ruta | Operación |
| --- | --- |
| GET `/health` | Salud del servidor y conexión PostgreSQL. |
| GET `/categories` | Categorías/subcategorías y conteos publicados de marcas habilitadas. |
| GET `/products` | `q,category,brand,min_price,max_price,max_moq,max_brand_min,min_margin,available,selection,sort,page,limit`. Precios/filtros monetarios en céntimos. |
| GET `/products/:id`, `/products/:id/reviews` | Producto vendible y reseñas moderadas de compras entregadas. |
| GET `/brands?q=...`, `/brands/:id` | Fichas públicas aprobadas, condiciones y opiniones. Sin contacto privado ni payout. |
| GET/PUT `/organizations/me` | Perfil comercial de la organización; payout se cifra y solo se sustituye al enviar los tres campos. |
| POST `/organizations/me/verification` | `{notes}`; perfil completo, correo y celular verificados. |
| POST `/organizations/me/addresses` | `{recipient,line1,district,region,phone,country:PE}`. |
| DELETE `/organizations/me/addresses/:id` | Solo direcciones propias. |
| GET `/account/summary` | Conteos reales de pedidos de tienda. |
| GET/POST `/favorites`, DELETE `/favorites/:id` | Un producto o marca por favorito, ligado a organización. |
| GET `/notifications`, POST `/notifications/:id/read` | Notificaciones de usuario/membresías autorizadas. |

`selection=new`: publicación dentro de la ventana configurada; `small`: MOQ ≤12; `margin`: PVP positivo y base comparable, ordenado por margen. `sort=date|price|price-desc|margin|moq`. El catálogo pagina y limita a 48 filas por página.

## Carrito, pago y pedidos

| Método / ruta | Operación |
| --- | --- |
| GET `/cart` | Pedidos por marca, importes, mínimos y problemas; informa checkout pendiente. |
| POST `/cart/items` | `{product_id,quantity,expected_price_cents}`; reemplaza cantidad y confirma precio revisado. |
| DELETE `/cart/items/:id` | Quita producto si no hay checkout pendiente. |
| POST `/checkout` | Requiere correo/negocio aprobados, revisión y `Idempotency-Key`. Reserva stock y crea compra/pedidos/intento sandbox. |
| GET `/checkout/:id`, POST `/checkout/:id/cancel` | Solo comprador; consulta o libera reserva pendiente. |
| POST `/payments/sandbox/:attemptId/simulate` | Desarrollo, comprador del intento: `{outcome:approved|failed|expired}`. Genera evento en adaptador del servidor; no acepta precios del cliente. |
| POST `/webhooks/sandbox` | JSON original firmado; encabezados `X-Lote-Timestamp` (Unix segundos) y `X-Lote-Signature` (hex HMAC-SHA256 de `timestamp.body`). |
| GET `/orders`, `/orders/:id` | Comprador, proveedor propietario o administrador; filtros de listado `q,state,from,to`. |
| POST `/orders/:id/reorder` | `{confirm:false}` devuelve cambios y `quote_hash`; `{confirm:true,quote_hash}` exige revisión vigente antes de añadir. |
| POST `/orders/:id/delivery` | Tienda propietaria confirma recepción de pedido enviado. |
| POST `/reviews` | `{order_item_id,rating,body}`; entrega y propiedad comprobadas, una por elegibilidad. |
| POST `/orders/:id/incidents` | `{reason,description}`; participantes del pedido. |
| GET `/incidents/:id`, POST `/incidents/:id/messages` | Participantes/administrador; seguimiento y `{message}`. |

Cuerpo de checkout:

```json
{
  "address_id": "UUID de una dirección propia",
  "receipt": {"kind": "order_summary", "legal_name": "", "tax_id": ""},
  "reviewed_total_cents": 10000,
  "agree_to_conditions": true,
  "sandbox": true
}
```

El importe del ejemplo es ilustrativo del contrato y no crea datos. `receipt.kind` también admite `boleta_requested` y `factura_requested`: son solicitudes sin emisión fiscal. El servidor rechaza totales desactualizados. La clave de idempotencia no puede reutilizarse con otro cuerpo.

Evento sandbox: `event_id,attempt_id,kind,amount_cents,occurred_at`. El webhook firmado soporta `approved,failed,expired,refund`; un reembolso incluye pedido y referencia. El cliente no recibe la clave de firma. Eventos duplicados no repiten consumo, liberación, movimientos o reembolsos. Un pago aprobado tardío entra en excepción; no confirma fulfillment sin stock.

## Proveedor

Todas las rutas están ligadas a la marca de la membresía. No se acepta un `brand_id` del cliente para transferir propiedad.

| Método / ruta | Operación |
| --- | --- |
| GET `/seller/summary`, `/seller/analytics?from&to` | Conteos, ventas brutas, unidades, ticket y compradores recurrentes del período; definiciones en la UI. |
| PUT `/seller/brand` | Ficha, mínimos, tarifa de envío, cobertura, preparación y condiciones revisadas. |
| GET/POST `/seller/products`, PUT `/seller/products/:id` | CRUD de variantes vendibles. SKU inmutable; cambios sensibles requieren moderación. |
| POST `/seller/products/:id/archive` | Baja sin borrar historia. |
| GET `/seller/imports/template.csv` | Plantilla descargable. |
| GET/POST `/seller/imports` | Lista o staging; POST usa `Content-Type:text/csv` y cuerpo UTF-8. |
| GET `/seller/imports/:id` | Filas, errores y resultado de validación. |
| POST `/seller/imports/:id/publish` | `{confirm:true}` aplica lote atómico; nuevos productos/cambios sensibles siguen pendientes de moderación. |
| POST `/seller/catalog/upsert` | Integración autenticada; `Idempotency-Key`, `{products,dry_run:true}` o `{products,dry_run:false,confirm:true}`. |
| GET/POST `/seller/api-keys`, DELETE `/seller/api-keys/:id` | Titular aprobado crea clave limitada al upsert; solo se muestra una vez, vence a 90 días. |
| GET/POST `/seller/sources`, POST `/seller/sources/:id/run` | Configuración/revisión de fuentes y programación del worker. |
| POST `/seller/orders/:id/fulfillment` | `confirmed→preparing→shipped`; despacho exige `carrier,tracking_code`. No altera pagos. |
| GET `/seller/settlements` | Importes y desglose de pedidos propios, estados y referencias sandbox. |

Campos del producto: `name,sku,category_id,variant,description,specifications,wholesale_cents,retail_cents,same_tax_basis,moq,pack_multiple,stock,updated_at,images,external_id,active,submit_for_review`. `images` es una lista `{url,alt}`. Imágenes subidas deben pertenecer a la marca; URLs externas son HTTPS autorizadas por el proveedor. Stock manual omite `updated_at` y se fecha al guardar; no falsifiques la frescura de una fuente.

La clave Bearer solo autoriza `POST /seller/catalog/upsert`; no usa cookies/CSRF ni permite otras rutas. Mantén esta clave en la integración de servidor. Una clave revocada, caducada o de negocio suspendido no sincroniza. Los clientes que reintentan conservan clave de idempotencia y cuerpo idénticos.

## Feed JSON incremental

Origen en `FEED_ALLOWED_ORIGINS`, HTTPS sin parámetros/credenciales en URL y sin redirecciones. Redes privadas, loopback, link-local y direcciones reservadas se bloquean aunque se incluyan por error en allowlist. DNS se comprueba y la conexión se fija a una dirección pública conservando TLS.

Configuración: `{url,credential_env:null|LOTE_FEED_...,interval_minutes,category_map:{"origen":"id-lote"}}`. Administración debe autorizar fuente y origen; el secreto vive únicamente en el servidor.

```json
{
  "mode": "incremental",
  "products": [{
    "external_id": "identificador-estable-en-la-fuente",
    "sku": "SKU-del-proveedor",
    "name": "Nombre autorizado por el proveedor",
    "category_id": "hogar",
    "variant": "Variante vendible",
    "wholesale_cents": 1000,
    "retail_cents": null,
    "same_tax_basis": false,
    "moq": 6,
    "pack_multiple": 3,
    "stock": 0,
    "updated_at": "2026-10-18T18:00:00.000Z",
    "active": true
  }]
}
```

Es un esquema ilustrativo; no se carga automáticamente. Puede usarse `category` con un valor presente en `category_map`. Los SKU y external IDs son estables, y los timestamps antiguos no pisan inventario. La ausencia no implica baja. `stock` incluye reservas locales y debe incorporar movimientos reconocidos hasta `updated_at`; Lote ajusta los movimientos posteriores. Totales incompatibles con reservas requieren conciliación. Backoff de fallos acotado a 6 horas, lease de cinco minutos, descarga con timeout de 15 segundos y límite de bytes/filas.

## Administración y archivos

Prefijo `/admin`, administrador verificado y CSRF en escrituras:

- `/summary`, `/organizations`, `/verifications`, `/catalog`, `/orders`, `/payments`, `/commissions`, `/incidents`, `/reviews`, `/settlements`, `/sources`, `/sync-runs`, `/settings`, `/audit`: consultas operativas reales.
- GET `/orders` admite `q,state,payment_state,from,to`; fechas/períodos en `America/Lima`.
- POST `/organizations/:id/status`, `/verifications/:id/review`, `/catalog/:id/review`, `/reviews/:id/moderate`: decisiones con razón, historial y autorización.
- GET `/organizations/:id/payout`: descifra datos restringidos y registra lectura; no forma parte de endpoints públicos.
- POST `/categories`: categoría/subcategoría validada.
- POST `/commissions`: regla con fecha de vigencia, general o por marca; no actualiza pedidos históricos.
- POST `/incidents/:id/resolve`: resolución y responsable; no provoca reembolso automático.
- POST `/orders/:id/refund`: `{amount_cents,reference,reason}`, sandbox e idempotente. Sin reposición automática.
- POST `/orders/:id/cancel`: `{reference,reason,restock}`; sandbox anterior al despacho, reembolso del saldo y reposición explícita una sola vez.
- GET `/settlements/candidates`, POST `/settlements`: `{brand_id,order_ids}` de pedidos entregados sin incidencia abierta; neto del libro.
- POST `/settlements/:id/state`: transiciones `pending→eligible→scheduled→paid`; se puede cancelar antes de programar, conservando snapshot/auditoría. Pagada exige referencia `sandbox:...` y evidencia de simulación. No hay transferencia real.
- POST `/sources/:id/approve`: autorizar/habilitar fuente. PUT `/settings`: umbrales/frescura/cobertura/límites; cambios auditados.

`POST /uploads?purpose=product|verification|incident` acepta cuerpo binario JPEG/PNG/WebP con sesión verificada y CSRF. Incidencias requieren `incident_id` autorizado; el resto no admite esa asociación. El archivo se decodifica, limita y normaliza antes de persistir. `/media/:id` sirve únicamente imágenes públicas; `/api/attachments/:id` exige propiedad/participación o administración. No se admiten SVG, ejecutables ni documentos PDF en esta versión.


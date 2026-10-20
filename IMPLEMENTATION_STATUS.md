# Estado real de implementación · Lote

## Corrección de envío en checkout — 20 de octubre de 2026

La bolsa comprueba la dirección seleccionada antes de pagar y muestra la región y la marca que impiden continuar. Las condiciones fallidas llegan como mensajes legibles en lugar de ocultarse dentro del objeto de cotización. Direcciones ajenas siguen bloqueadas.

Las regiones de envío se eligen con casillas y las direcciones con una lista. El servidor valida regiones peruanas y compara nombres de forma consistente, incluidas tildes. No se cambia automáticamente la cobertura de un proveedor.

## Simplificación de paneles y compra — 20 de octubre de 2026

- Formulario de producto con datos básicos, inventario separado de mínimo por compra y código automático. Características en filas y opciones avanzadas plegables.
- Hasta 8 fotos: subida múltiple, vista previa, quitar y elegir portada; galería con miniaturas en producto público y revisión administrativa.
- Aprobación directa de productos y negocios con comentarios de auditoría automáticos. Motivos personalizados disponibles para otras decisiones.
- Pago de prueba con lenguaje sencillo, datos de factura solo cuando se solicitan y alta de dirección desde la bolsa.
- Demo local en http://127.0.0.1:3200/prueba-compra, con cuentas preparadas y cambio de rol. Base, cookie y puerto separados; sin cobros reales. No se habilita este acceso en la base principal ni producción.
- La lámpara reportada conserva 1100 unidades y su mínimo se corrigió a 1 mediante una operación local auditada; los datos de la base no se publican en GitHub.
- Validación de esta revisión: 25/25 pruebas del backend y 4/4 recorridos Chromium; subida de dos fotos, cambio de portada, galería pública y formulario básico sin código manual. Demo local comprobada desde entrar sin contraseña hasta recibir el pedido. Exportación de GitHub Pages compilada correctamente.
- GitHub Pages conserva la interfaz estática. Cuentas, fotos subidas y pedidos requieren servidor Express, PostgreSQL y almacenamiento persistente.

## Actualización funcional — 19 de octubre de 2026 (Windows)

Trabajo realizado en C:/Users/Rodolfo/Documents/Lote/lt, sin cambios de branding. Esta sección describe la revisión vigente; las secciones siguientes conservan el historial anterior.

- Precio base de marca +10% por unidad calculado en el servidor; catálogo, carrito y checkout coherentes. Edición sin recargo compuesto. Comisión privada en listado y detalle de pedidos. Pedidos históricos conservados.
- Verificación de celular peruano, límites persistentes, códigos de un uso, vencimiento, buzón SMS privado local y adaptador Twilio Verify. Exigida para operar; cambio de contraseña revoca sesiones.
- Panel de marca con pedidos recientes, tienda compradora, detalles, seguimiento y desglose. Solo marcas autorizadas pueden cargar productos propios.
- Guía de Gmail, SMS, Faire, pasarelas y comprobantes: [docs/OPERACION_PERU.md](docs/OPERACION_PERU.md).
- Validación ejecutada: npm run check; 23/23 pruebas de integración PostgreSQL; 3/3 recorridos Chromium, con anchos de 1440/1024/768/390/360. Se instaló Chromium para Playwright. Pruebas usan bases aisladas; el adaptador Twilio se prueba con transporte simulado.
- Migración 004 aplicada a la base local. SMTP y Twilio no tienen credenciales configuradas. No se enviaron SMS reales ni se comprobó entrega externa de correos. Sin cobros reales ni emisión SUNAT.
- Cambios locales; no se hizo push ni despliegue en esta revisión.


## Revisión de descubrimiento y accesos

Portada de marketplace con búsqueda compartida en la cabecera, navegación ampliada y pestañas de catálogo funcionales. Se redujeron eslóganes y párrafos, se aumentó el texto de lectura a 16–17 px y se redujo el título del catálogo a 28 px. Se conservan las dos imágenes editoriales con variantes WebP, las sugerencias reales y los filtros desplegables. Se consulta la sesión antes de renderizar espacios privados; los visitantes reciben llamadas de ingreso/registro en lugar de controles de compra. Los endpoints privados conservan sus comprobaciones del servidor. Detalles: [docs/DISCOVERY.md](docs/DISCOVERY.md).

Se revisaron capturas de portada y catálogo en escritorio/móvil con el servidor cloud. No se ejecutaron suites de pruebas en esta revisión; las cantidades y resultados que aparecen más abajo documentan la implementación inicial, no una nueva ejecución sobre esta interfaz.

## Entrega local / sandbox

Implementado en el checkout `/workspace/lt`, rama `feat/lote-b2b-mvp`. Se amplió el prototipo conforme a la solicitud vigente: Node/Express, PostgreSQL y frontend modular. El trabajo se realizó en cloud; no se modificó el disco Windows. La portada y README anteriores se conservan en `docs/reference/original/`.

El usuario autorizó actualizar GitHub mediante commit y push a `main`. La descarga al checkout de Windows se realiza desde VS Code con `git pull --ff-only origin main`, antes de instalar las dependencias. No se hizo despliegue ni se habilitaron cobros, transferencias o facturación reales. Durante la entrega inicial se ejecutaron servidor y worker y se verificaron respuestas funcionales, no solo procesos abiertos.

## Etapas verificadas

| Etapa | Resultado |
| --- | --- |
| Inventario y rama | Había cuatro archivos estáticos, sin framework/backend/AGENTS. Rama nueva y referencias anteriores conservadas. |
| Persistencia y acceso | Tres migraciones versionadas con checksums; cuentas, organizaciones, sesiones, catálogo, transacciones, staging y auditoría persistentes. |
| Comercio y operación | Bolsa por marcas, reservas concurrentes, compra padre/pedidos hijos, sandbox firmado, fulfillment, posventa y conciliación. |
| Interfaz | Rutas públicas/cuenta/proveedor/admin, estados vacíos/error, filtros URL, fuentes locales, tokens y adaptación responsive. |
| Validación | 18 pruebas PostgreSQL y 2 escenarios Chromium completos aprobados en la última ejecución; sin fallos ni pruebas omitidas. |

## Funciones y rutas

“Implementado” significa código ejecutable local/sandbox. La columna de evidencia distingue integración, navegador y dependencias externas.

| Función | Rutas principales | Estado / evidencia |
| --- | --- | --- |
| Inicio editorial, categorías, selecciones por reglas | `/`, `/catalogo` | Implementado; navegador vacío y poblado, sin productos ficticios en base normal. |
| Búsqueda por productos/marcas, paginación, filtros combinados y URL | `/catalogo`, `/api/products`, `/api/brands` | Implementado; historial, filtro compartible y ausencia de resultados probados en Chromium. |
| Directorio/ficha de marca y condiciones | `/marcas`, `/marcas/:id` | Implementado; API pública omite contacto privado y payouts. |
| Galería/detalle, SKU/variante, MOQ, múltiplo, margen y frescura | `/productos/:id` | Implementado; API/integración y recorrido Chromium. Sin PVP/base comparable: “Sin referencia”. |
| Ayuda, cómo funciona, proveedores, contacto y políticas | `/ayuda`, `/como-funciona`, `/proveedores`, `/contacto`, `/politicas` | Implementado; contacto ausente y políticas pendientes se rotulan honestamente. |
| Registro/login, verificación y recuperación | `/registro`, `/login`, `/verificar`, `/recuperar`, `/restablecer` | Implementado; tokens de un uso, caducidad y revocación probados. SMTP externo no verificado. |
| Perfil comercial, direcciones, documentos y solicitud de revisión | `/cuenta/perfil`, `/api/organizations/me/*` | Implementado; permisos por organización y archivos privados verificados por integración. |
| Favoritos por cuenta/organización | `/favoritos`, `/api/favorites` | Implementado y persistente; no se usa localStorage para dominio. |
| Resumen real y avisos | `/cuenta`, `/notificaciones`, `/buzon` | Implementado; conteos SQL, outbox privado de desarrollo y worker SMTP. |
| Bolsa multimarcas y mínimos de marca/producto | `/carrito`, `/api/cart/*` | Integración y Chromium, dos marcas, importes exactos y datos actuales. |
| Checkout con dirección, cobertura, comprobante solicitado y revisión | `/api/checkout`, `/checkout/:id` | Integración/Chromium; solo sandbox. No emite boleta/factura. |
| Reserva atómica, expiración y liberación | `inventory*`, worker | Último stock disputado por dos tiendas: solo una reserva; fallo/expiración no liberan dos veces. |
| Pagos firmados/idempotentes y excepción tardía | `/api/webhooks/sandbox`, `/api/payments/sandbox/*` | Integración; rechazo sin firma/importe alterado, duplicados/desorden y no sobreventa. |
| Pedidos y snapshots por proveedor | `/pedidos`, `/pedidos/:id`, `/panel/pedidos` | Persistentes; búsqueda/estado/fechas y detalle. Navegador con dos marcas. |
| Preparación, despacho y recepción | `/api/seller/orders/:id/fulfillment`, `/api/orders/:id/delivery` | Integración/Chromium; transportista/código manuales y confirmación de recepción por tienda, sin integración logística externa. |
| Recompra con cambios revisados | `/api/orders/:id/reorder` | Integración y Chromium; precio/stock/publicación/mínimos actuales, quote hash antes de añadir. |
| Reseña elegible y moderación | `/api/reviews`, `/administracion/resenas` | Compra entregada, pertenencia y duplicado probados; reseña enviada desde Chromium. |
| Incidencias, mensajes y evidencia privada | `/incidencias/:id`, `/administracion/incidencias` | Flujo Chromium y aislamiento de participantes por integración; no borra cronología. |
| Proveedor: productos/variantes y stock | `/panel/productos/*`, `/api/seller/products` | CRUD de SKU vendible, archivo sin borrar historia, stock total/reservado/disponible. Creación y envío a revisión probados en Chromium. |
| Marca y condiciones | `/panel/marca` | Persistente; preparación, cobertura, mínimos, envío y políticas por proveedor. |
| CSV UTF-8, staging, validación y aplicación atómica | `/panel/importaciones/*`, `/api/seller/imports/*` | Comillas, negativos, duplicados, MOQ inválido, archivo roto y dry run probados; carga/aplicación/moderación en Chromium. |
| Upsert API autenticado por marca | `/api/seller/catalog/upsert`, `/api/seller/api-keys` | Probada vinculación de clave a marca, idempotencia y rechazo fuera del endpoint permitido. |
| Fuente HTTPS, mapeo, worker y backoff | `/panel/fuentes`, `/api/seller/sources`, `npm run worker` | Implementado; mapeo/idempotencia/timestamp antiguo/ausencias/staging inválido probados con transporte controlado. SSRF privado bloqueado. No se conectó un proveedor externo real. |
| Analítica real por período | `/panel/analitica` | SQL y métricas definidas; venta/unidades brutas, pedidos, ticket y tiendas recurrentes. Períodos `America/Lima`. |
| Administración reservada | `/administracion/*`, `/api/admin/*` | Cuenta creada solo por CLI autorizada; aislamiento y rechazo a tiendas/marcas probados. |
| Verificar/rechazar/corregir/suspender/restaurar negocios | `/administracion/verificaciones`, `/administracion/negocios` | Decisión con razón y auditoría. Una suspensión retira catálogo/compra y bloquea panel de proveedor; no elimina pedidos previos. Operación conserva resolución/reembolso y puede restaurar acceso. |
| Moderación/categorías | `/administracion/catalogo`, `/api/admin/categories` | Primera publicación y cambios sensibles revisados; publicación de dos marcas en Chromium. |
| Pedidos/pagos/reservas y búsqueda/filtros | `/administracion/pedidos`, `/administracion/pagos` | Implementado; filtros de preparación, pago y fechas. Acceso cruzado denegado. |
| Recargo del 10% e historial | `/administracion/comisiones` | Precio base +10% por unidad; reglas anteriores solo de consulta. Los pedidos históricos no se recalculan. |
| Reembolsos y cancelación autorizada | `/api/admin/orders/:id/refund`, `/cancel` | Idempotentes; reembolso no repone automáticamente. Cancelación predespacho con reposición explícita una sola vez; entregados no se reponen. |
| Libro y liquidaciones | `/administracion/liquidaciones`, `/panel/liquidaciones` | Integración: entrega, incidencias, neto, transiciones y evidencia. Referencia `sandbox:...`; ninguna transferencia real. |
| Configuración y auditoría | `/administracion/configuracion`, `/administracion/auditoria`, `/administracion/fuentes` | Umbrales/cobertura/importación persistentes; cambios y accesos sensibles auditados; jobs con resultado. |
| Imágenes/documentos | `/api/uploads`, `/media/:id`, `/api/attachments/:id` | Decodificación/reencodificación real y límites; rechazo de bytes falsos, lectura privada autorizada y rechazo a otra marca probados. Solo imágenes JPEG/PNG/WebP. |

Las variantes se consolidan en `products` y los tokens de recuperación/verificación en `account_tokens`, sin perder sus invariantes; véase [ADR 001](docs/ADR-001.md). Contratos/endpoints en [API](docs/API.md).

## Resultados de comprobación

| Comprobación realizada | Resultado |
| --- | --- |
| `npm install`, instalación congelada con `npm ci` y postinstall | Aprobadas; lockfile y fuentes/licencias locales. |
| Configuración local, Compose, migraciones y repetición | Aprobadas; configuración preservada y migraciones sin reaplicar. |
| `npm run predev` | Aprobado; PostgreSQL local sano. `npm run dev` y worker responden en el entorno actual. |
| `npm run check` | Todos los módulos JavaScript válidos; no existe un build adicional del frontend estático. |
| `npm test` | **18/18 aprobadas**, cero fallidas, omitidas o canceladas; bases y archivos de prueba separados. |
| `npm run test:ui` | **2/2 escenarios aprobados en Chromium**, incluyendo el flujo multimarcas completo. |
| Anchos 1440/1024/768/390/360 | Sin scroll horizontal global en portada/catálogo vacío y catálogo/producto/bolsa/pedido/panel de proveedor poblados. Tablas y menú tienen desplazamiento propio. |
| Teclado/foco/etiquetas/error | Salto al contenido, foco y etiquetas comprobados; estado de red fallida y sin resultados ejercitados. Preferencia de movimiento reducido soportada. |
| Contraste de los pares principales | Texto 13.41:1; ayudas 6.18:1 en blanco, 5.07:1 en suave y 4.96:1 en peach; terracota 5.02:1; acción primaria 11.67:1; acento 9.29:1; error 6.00:1. No es una auditoría completa con lector de pantalla. |
| Inspección visual real de portada | Capturas desktop/móvil; fuentes locales cargadas. Los iconos direccionales se dibujan en SVG para evitar glifos ausentes. |
| `npm audit --omit=dev` | Cero vulnerabilidades conocidas reportadas por el registro en esta sesión; no sustituye revisión de seguridad para producción. |
| Arranque con puerto ocupado | Fallo esperado, código 1 con `EADDRINUSE`; no anuncia falsa disponibilidad. |
| HTTP del entorno actual | `/api/health`: `ok`, DB disponible; `/api/products`: arreglo vacío válido. SQL: 0 productos, 0 usuarios, 0 pedidos, 0 reseñas, 6 categorías. |
| `demo:seed` y runner de demo | Base aislada, dos productos DEMO y login/permisos de proveedor comprobados; catálogo principal sigue en cero. Accesos aleatorios solo en archivo privado local. |
| Worker como proceso independiente | Procesó un mensaje DEMO pendiente en otra base y lo dejó en buzón sandbox; sin entrega externa. Se detuvieron los procesos adicionales de comprobación. |

Los primeros intentos detectaron y corrigieron validación del correo, asociación de etiquetas, acceso autorizado a archivos en almacenamiento oculto y ancho del panel. La última ejecución de las suites anteriores es la evidencia reportada; no quedan fallos de esas suites por investigar.

## Configuración del entorno cloud

Guardados en el borrador **`install_script` y `start_skill`** para Node/PostgreSQL/worker, sustituyendo el arranque Python anterior. Se conservaron repositorios, red y requisitos de credenciales. Los comandos se ejecutaron en la instancia actual. El guardado no publica ni ejecuta el borrador; no se ha publicado un snapshot ni verificado restauración en otra tarea. Los procesos necesitan reiniciarse después de restaurar.

## Dependencias externas y verificaciones no realizadas

- **Pago real y liquidación bancaria:** no hay pasarela contratada ni credenciales/modelo de fondos aprobado. Solo sandbox; producción bloqueada para cobrar.
- **Comisión comercial, impuestos y comprobantes:** pendientes de definición/revisión. No hay tasas inventadas ni emisión fiscal. Las reglas actuales son de simulación.
- **Políticas y contacto operativo:** requieren aprobación y canal real. La interfaz los identifica como pendientes.
- **SMTP:** implementado con outbox y reintentos, pero entrega externa no verificada sin un servicio configurado. Buzón local autenticado sí funcional.
- **Fuente autorizada real:** worker/contrato/validación están implementados y probados con transporte controlado; faltan autorización, origen, egress y credenciales de cada proveedor para una sincronización externa real.
- **Logística externa:** despacho manual y recepción confirmada por tienda. No hay promesa de transportista, plazo garantizado ni devolución gratuita.
- **Referencias no recibidas:** `Prototipo_Lote.html`, guía de marca y tokens originales. Se usó la portada preservada y la dirección/tokens proporcionados en el texto.
- **Operación comercial:** almacenamiento persistente, backups, retención, monitorización, accesibilidad asistiva y revisión legal/seguridad operativa necesitan su validación específica. No se declaró listo para producción.

Las exclusiones expresas del producto están en [ROADMAP.md](ROADMAP.md). Ninguna de estas dependencias se sustituyó por productos, reseñas, pagos o estadísticas ficticias en la base principal.

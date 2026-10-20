# Abrir el catálogo en Render

La apertura del catálogo no requiere contratar SMS ni configurar correo. En producción las compras permanecen cerradas, incluso con SANDBOX_PURCHASES_ENABLED=true. Verificar el celular sigue requiriendo un proveedor SMS real; no se simula la verificación en público.

## Configuración del servicio web

- Runtime: Node 24; rama main; directorio raíz vacío.
- Build: `npm ci`.
- En un servicio Docker, Docker Command: `node scripts/start-render.js`. Este archivo aplica migraciones antes de iniciar el servidor y evita diferencias de comillas entre plataformas.
- En un servicio Node, Start: `node scripts/start-render.js`.
- Health check: `/api/health`.
- `NODE_ENV=production`.
- `DATABASE_URL`: conexión privada de PostgreSQL, configurada en Environment.
- `SESSION_SECRET`, `SANDBOX_WEBHOOK_SECRET`: claves privadas de al menos 32 caracteres.
- `ENCRYPTION_KEY`: 64 caracteres hexadecimales generados aleatoriamente.
- `PAYMENT_PROVIDER=sandbox`.
- `SMS_PROVIDER=disabled` mientras no se contrate/configure SMS.
- `APP_ORIGIN`: URL HTTPS pública; si se omite, Render puede usar su variable RENDER_EXTERNAL_URL.

No establecer POLICIES_APPROVED=true para silenciar un error: la apertura del catálogo no aprueba las políticas comerciales. El contacto operativo y las políticas deben completarse antes de operar comercialmente.

Para activar SMS, cambiar SMS_PROVIDER a twilio y configurar credenciales válidas del proveedor. El buzón SMS local nunca está permitido en producción. Si se configura SMTP_HOST, MAIL_FROM sigue siendo obligatorio. Sin SMTP, la verificación y recuperación por correo no se entregan externamente; el buzón local no se expone en producción.

Las fotos subidas requieren almacenamiento persistente. Los datos de la PC no se copian a la base de Render al conectar GitHub. No publicar .env, claves ni conexiones privadas en el repositorio.

## Pruebas

`node --test tests/render-config.test.js` comprueba arranque de catálogo, bloqueo de compras, HTTPS, claves, configuración de Twilio y separación del SMS local. No envía SMS ni correos ni conecta a una base real.

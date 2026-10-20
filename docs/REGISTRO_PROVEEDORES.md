# Registro de proveedores por celular

1. Datos: nombre, negocio, celular peruano, correo de contacto y contraseña; razón social y RUC opcionales. Se aceptan nueve dígitos o +51.
2. Se crea una cuenta pendiente y se solicita SMS dentro del registro. Si falla el servicio, los datos permanecen y se puede reintentar al iniciar sesión.
3. Código de seis dígitos, vencimiento diez minutos, cinco intentos y límites de reenvío. Los códigos locales solo existen en desarrollo.
4. Al confirmar, el proveedor entra en Crear mi catálogo. Puede guardar un producto y continuar añadiendo otros, con descripción, precio, fotos, unidades disponibles y mínimo de unidades por compra.
5. Los productos siguen sujetos a revisión. Verificar el número no aprueba el negocio ni publica automáticamente el catálogo.

## Seguridad y compatibilidad

El correo no se marca como confirmado al verificar el celular. Los permisos operativos de usuarios normales requieren número confirmado; los administradores conservan su control independiente. La recuperación por correo solo se permite tras confirmar ese correo opcionalmente en Seguridad. No se habilita una recuperación por un correo sin comprobar. La recuperación por SMS no forma parte de esta entrega; el contacto operativo debe ofrecer un procedimiento de soporte revisado para quienes no activen recuperación por correo.

Los enlaces de confirmación de correo de cuentas anteriores siguen funcionando. Nuevas cuentas no reciben ese correo automáticamente. Los endpoints de envío/verificación SMS requieren una sesión y protección CSRF, pero no verificación de correo.

`POST /api/auth/register` requiere `phone`, además de los campos anteriores; acepta `legal_name` y `tax_id`. `phone_verified_at` y `verified_at` son independientes. El proveedor puede cargar borradores antes de la aprobación comercial; la publicación conserva los controles previos.

## Publicación real

El backend y PostgreSQL deben desplegarse con almacenamiento persistente. Se necesitan Twilio Verify con credenciales y saldo, dominio HTTPS, contacto y políticas revisadas. SMTP es opcional para este registro; para confirmar correo y habilitar su recuperación sí debe configurarse y probarse. El checkout comercial permanece bloqueado.

La publicación de GitHub Pages solo muestra los formularios nuevos; no envía SMS, crea cuentas ni guarda productos. No sustituir una verificación por un código visible en producción. Las claves se configuran en el servidor, nunca en el repositorio ni en el frontend.

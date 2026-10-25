# Experiencia guiada de Vendo

## Diagnóstico y alcance

La navegación del proveedor mostraba doce opciones desde el primer acceso, incluyendo estadísticas y operaciones sin actividad. La verificación del celular llevaba a un panel con varias acciones equivalentes; guardar un producto devolvía al listado sin una confirmación persistente. El listado de productos tenía diez columnas, con datos internos mezclados con precios y existencias. Los formularios concentraban errores al final y el catálogo presentaba referencias de reventa incluso cuando no estaban disponibles.

Se conserva la arquitectura modular, la identidad visual, todas las rutas y operaciones de servidor, la revisión comercial, los permisos y el modelo de comisiones. No hay migraciones ni cambios de secretos, servicios externos o habilitación de pagos. Los cambios se preparan para revisión por pull request; no se fusionan automáticamente. La única corrección de servidor cualifica `f.organization_id` en la consulta existente de favoritos: el recorrido del comprador detectó una ambigüedad SQL que impedía abrir su lista. Se prueba también su aislamiento entre tiendas.

## Recorridos y rutas

| Uso | Ruta | Siguiente acción |
| --- | --- | --- |
| Alta de proveedor | `/registro?tipo=proveedor` | Verificar celular en `/registro/celular` |
| Bienvenida sin menú de herramientas | `/panel/empezar` | Crear el primer producto |
| Crear o editar | `/panel/productos/nuevo` o `/panel/productos/:id` | Guardar con validaciones junto a los campos |
| Confirmación persistente | `/panel/producto-guardado?id=:id` | Añadir otro, ver catálogo o continuar con el negocio |
| Inicio según estado real | `/panel` | Producto inicial, revisión pendiente o gestión del catálogo |
| Productos en tarjetas | `/panel/productos` | Editar; información complementaria desplegable; acceso a inventario |
| Preparación del negocio | `/panel/negocio` | Datos, condiciones y solicitud de revisión |
| Cuenta y herramientas secundarias | `/panel/configuracion` | Seguridad, avisos e historial operativo |
| Comprador sin cuenta | `/catalogo`, `/productos/:id`, `/marcas/:id` | Buscar, filtrar y consultar; registrarse para guardar favoritos |

El menú principal del proveedor presenta Inicio, Mis productos, Mi negocio y Configuración. Pedidos y Estadísticas se incorporan cuando la API informa compras habilitadas; la interfaz no cambia ese indicador. Las rutas de inventario, envíos, incidencias, pedidos y estadísticas siguen accesibles en herramientas secundarias. La navegación administrativa permanece completa.

## Estados y conservación

El progreso consulta `/organizations/me`, `/seller/products` y la sesión. Verificar el celular no completa el perfil comercial. La información comercial exige los datos de origen, contacto y condiciones de marca confirmadas; el RUC no se convierte en requisito nuevo. Las solicitudes pendientes, correcciones y aprobaciones se distinguen por el último registro de revisión y el estado del negocio. Los productos archivados no completan el paso de catálogo. Aprobar un negocio no marca sus productos como publicados.

Los errores de campos se vinculan mediante `aria-describedby` y `aria-invalid`. Los formularios abren la sección opcional que contiene el error y enfocan el campo correspondiente. Los mensajes se insertan fuera de la etiqueta para conservar su nombre accesible. Los errores del servidor conservan los valores y las fotos ya subidas. El código automático del producto se conserva al reintentar el mismo formulario para evitar duplicados por una respuesta perdida.

La ficha pública prioriza precio, mínimo, disponibilidad, fotos y proveedor. Características, referencias de reventa y condiciones permanecen consultables en desplegables. Los filtros habituales se agrupan y los avanzados se conservan en «Más filtros». Las tarjetas no inventan stock, reseñas ni referencias de reventa. El comprador puede guardar favoritos aunque las compras estén cerradas.

## Validación y límites

Resultado local: **52 pruebas de lógica y servidor y 13 pruebas de Playwright aprobadas**, además de sintaxis, exportación de GitHub Pages y comprobación del diff. El recorrido nuevo de proveedor se ejecuta a 390 y 1440 píxeles; las pruebas adaptables existentes cubren también 320, 360, 768 y 1024 píxeles.

Capturas con datos ficticios de la base de pruebas: [bienvenida móvil](ux-capturas/bienvenida-movil.png), [productos en móvil](ux-capturas/productos-movil.png) y [productos en escritorio](ux-capturas/productos-escritorio.png).

Los recorridos de alta, SMS simulado, bienvenida, dos productos, conservación ante error, perfil, condiciones, revisión administrativa y publicación se prueban en bases temporales aisladas, en móvil y escritorio. Se mantienen las pruebas anteriores de dominio, seguridad, administración y compra sandbox; estas últimas no representan habilitación de pagos reales. No se envían SMS reales ni se escriben datos comerciales de producción.

Las pruebas incluyen navegación con compras cerradas, menú de cuatro opciones, ausencia de métricas vacías, tarjetas móviles sin tabla horizontal y recorrido anónimo de búsqueda hasta favoritos tras el registro. La inspección visual utiliza capturas de Playwright. Las fotos se normalizan por el servicio existente; no se añade otro almacenamiento ni otro proveedor.

Las condiciones jurídicas y la pasarela mantienen sus pendientes externos anteriores. Este cambio de UX no los resuelve ni los oculta. Los datos privados de un formulario no se guardan en localStorage: se conservan durante el intento fallido, pero abandonar o recargar sin guardar puede perder la edición.

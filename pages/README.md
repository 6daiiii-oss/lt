# Lote · GitHub Pages

Web pública estática e independiente del backend Express/PostgreSQL existente.
El catálogo está vacío intencionalmente: no publica productos, marcas, testimonios
ni métricas ficticias. La búsqueda, categorías, menú móvil y preguntas funcionan
en el navegador. No recoge datos personales ni simula cuentas, pedidos o cobros.

## Publicación

En Settings → Pages, elegir **GitHub Actions** como Source. El workflow
`.github/workflows/pages.yml` publica esta carpeta junto con imágenes y fuentes
ya existentes en `public/`. Si el primer despliegue ocurrió antes de activar
Pages, volver a ejecutarlo desde Actions → Publish Lote to GitHub Pages.

Las rutas de recursos son relativas y funcionan bajo `/lt/` o dominio propio.
No publicar `server/`, `.env`, archivos de operación o documentación confidencial.
La operación comercial requiere desplegar e integrar el backend por separado.

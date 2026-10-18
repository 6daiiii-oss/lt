/*
 * LOTE: catálogo de productos.
 * Ahora se muestra el estado vacío. Cuando exista un catálogo, puedes:
 * 1) servir productos desde GET /api/products (ver README), o
 * 2) colocar el arreglo en window.LOTE_PRODUCTS antes de app.js.
 * Cada producto: { name, category, seller, price, unit, image }.
 */
(function () {
  const emptyState = document.querySelector('.empty-catalog');
  const productGrid = document.querySelector('.product-list');
  const catalogToolbar = document.querySelector('.catalog-toolbar');
  const catalogFooter = document.querySelector('.catalog-footer');

  function textElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text || '';
    return element;
  }

  function addProduct(product) {
    const card = textElement('article', 'product-card');
    if (product.image) {
      const image = document.createElement('img');
      image.className = 'product-image';
      image.src = product.image;
      image.alt = product.name ? `Producto: ${product.name}` : 'Producto de Lote';
      image.loading = 'lazy';
      image.onerror = () => image.remove();
      card.append(image);
    } else {
      const placeholder = textElement('div', 'product-image');
      placeholder.setAttribute('aria-label', 'Imagen próximamente');
      card.append(placeholder);
    }
    const meta = textElement('div', 'product-meta');
    if (product.category) meta.append(textElement('span', 'product-category', product.category));
    meta.append(textElement('h3', 'product-title', product.name || 'Producto sin nombre'));
    if (product.seller) meta.append(textElement('p', 'product-seller', `Por ${product.seller}`));
    if (product.price !== undefined && product.price !== null && product.price !== '') {
      const price = textElement('p', 'product-price', `S/ ${product.price}`);
      if (product.unit) price.append(textElement('small', '', ` / ${product.unit}`));
      meta.append(price);
    }
    card.append(meta);
    productGrid.append(card);
  }

  async function loadProducts() {
    let products = Array.isArray(window.LOTE_PRODUCTS) ? window.LOTE_PRODUCTS : null;
    try {
      const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload)) products = payload;
        else if (payload && Array.isArray(payload.products)) products = payload.products;
      }
    } catch (_) {
      // La página funciona también como sitio estático, sin servidor de catálogo.
    }
    if (!products || products.length === 0) return;
    productGrid.replaceChildren();
    products.forEach(addProduct);
    emptyState.hidden = true;
    productGrid.hidden = false;
    catalogToolbar.hidden = false;
    catalogFooter.hidden = false;
    const count = document.querySelector('.tab-count');
    if (count) count.textContent = String(products.length);
  }

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-links');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        nav.classList.remove('open');
        menuButton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  loadProducts();
})();

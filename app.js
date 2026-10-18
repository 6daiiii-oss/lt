/*
 * LOTE: catálogo, filtros de categoría y selecciones.
 * Fuente: GET /api/products o window.LOTE_PRODUCTS.
 * Campos sugeridos: name, category, brand, seller, wholesalePrice, retailPrice,
 * minUnits, stock, image, isNew, tags, createdAt.
 */
(function () {
  const productsContainer = document.querySelector('#product-grid');
  const emptyState = document.querySelector('#empty-state');
  const searchInput = document.querySelector('#search-input');
  const categoryFilter = document.querySelector('#category-filter');
  const minimumFilter = document.querySelector('#minimum-filter');
  const sortFilter = document.querySelector('#sort-filter');
  const resultsCount = document.querySelector('#results-count');
  const activeFilters = document.querySelector('#active-filters');
  const clearFilters = document.querySelector('#clear-filters');
  const clearEmpty = document.querySelector('#clear-empty');
  const emptyTitle = document.querySelector('#empty-title');
  const emptyMessage = document.querySelector('#empty-message');
  const categoryCards = [...document.querySelectorAll('.category-card')];
  const selectionCards = [...document.querySelectorAll('.selection-card')];
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-links');

  let allProducts = Array.isArray(window.LOTE_PRODUCTS) ? window.LOTE_PRODUCTS : [];
  let selectedCollection = '';

  const categoryNames = {
    hogar: 'Hogar', 'hogar y cocina': 'Hogar', cocina: 'Hogar',
    belleza: 'Belleza', 'belleza y cuidado': 'Belleza', cuidado: 'Belleza',
    moda: 'Moda', 'moda y accesorios': 'Moda', accesorios: 'Moda',
    tecnología: 'Tecnología', tecnologia: 'Tecnología', tech: 'Tecnología',
    regalos: 'Regalos', papelería: 'Regalos', papeleria: 'Regalos',
    juguetes: 'Juguetes', 'juguetes y hobbies': 'Juguetes', hobbies: 'Juguetes'
  };

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('es-PE').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function categoryKey(value) {
    const key = normalize(value);
    return categoryNames[key] || String(value || '').trim();
  }

  function wholesalePrice(product) {
    const value = product.wholesalePrice ?? product.price;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function retailPrice(product) {
    const value = product.retailPrice ?? product.suggestedRetailPrice ?? product.pvp;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function estimatedMargin(product) {
    if (product.marginPercent !== null && product.marginPercent !== undefined && Number.isFinite(Number(product.marginPercent))) return Number(product.marginPercent);
    const wholesale = wholesalePrice(product);
    const retail = retailPrice(product);
    return wholesale !== null && retail > 0 ? ((retail - wholesale) / retail) * 100 : null;
  }

  function productMatchesCollection(product, collection) {
    const tags = Array.isArray(product.tags) ? product.tags.map(normalize) : [];
    const selection = normalize(product.selection);
    if (collection === 'novedades') return product.isNew === true || tags.includes('nuevo') || selection === 'nuevo' || selection === 'novedades';
    if (collection === 'inicial') {
      const min = Number(product.minUnits ?? product.minimumOrder ?? product.minimumUnits ?? 0);
      return selection === 'inicial' || selection === 'lote pequeno' || tags.includes('lote pequeno') || (min > 0 && min <= 12);
    }
    if (collection === 'margen') return estimatedMargin(product) !== null;
    return true;
  }

  function getFilteredProducts() {
    const query = normalize(searchInput.value);
    const selectedCategory = categoryFilter.value;
    const maximumMinimum = Number(minimumFilter.value || 0);
    const filtered = allProducts.filter((product) => {
      const searchable = [product.name, product.title, product.brand, product.seller, product.category].map(normalize).join(' ');
      const categoryMatches = !selectedCategory || categoryKey(product.category) === selectedCategory;
      const minUnits = Number(product.minUnits ?? product.minimumOrder ?? product.minimumUnits ?? 0);
      const minimumMatches = !maximumMinimum || (minUnits > 0 && minUnits <= maximumMinimum);
      return (!query || searchable.includes(query)) && categoryMatches && minimumMatches && productMatchesCollection(product, selectedCollection);
    });

    switch (sortFilter.value) {
      case 'price-asc': filtered.sort((a, b) => (wholesalePrice(a) ?? Infinity) - (wholesalePrice(b) ?? Infinity)); break;
      case 'margin-desc': filtered.sort((a, b) => (estimatedMargin(b) ?? -Infinity) - (estimatedMargin(a) ?? -Infinity)); break;
      case 'newest': filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); break;
      default: filtered.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
    }
    return filtered;
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = content;
    return node;
  }

  function formatPrice(value) {
    if (value === null) return '—';
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 }).format(value);
  }

  function renderProduct(product) {
    const card = element('article', 'product-card');
    const imageUrl = product.image || product.imageUrl;
    if (imageUrl) {
      const image = element('img', 'product-image');
      image.src = imageUrl;
      image.alt = product.name || product.title || 'Producto de Lote';
      image.loading = 'lazy';
      image.onerror = () => {
        const placeholder = element('div', 'product-image-placeholder', 'L.');
        placeholder.setAttribute('aria-label', 'Imagen de producto no disponible');
        image.replaceWith(placeholder);
      };
      card.append(image);
    } else {
      const placeholder = element('div', 'product-image-placeholder', 'L.');
      placeholder.setAttribute('aria-label', 'Imagen de producto próximamente');
      card.append(placeholder);
    }

    const details = element('div', 'product-meta');
    details.append(element('span', 'product-category', categoryKey(product.category) || 'Producto'));
    details.append(element('h3', 'product-title', product.name || product.title || 'Producto sin nombre'));
    details.append(element('p', 'product-seller', product.brand || product.seller || 'Marca independiente'));

    const prices = element('div', 'product-prices');
    const wholesale = element('div', '');
    wholesale.append(element('span', 'price-label', 'Precio mayorista'));
    wholesale.append(element('strong', 'price-value', formatPrice(wholesalePrice(product))));
    const retail = element('div', '');
    retail.append(element('span', 'price-label', 'PVP sugerido'));
    retail.append(element('strong', 'price-value', formatPrice(retailPrice(product))));
    prices.append(wholesale, retail);
    details.append(prices);

    const bottom = element('div', 'product-bottom');
    const minimum = Number(product.minUnits ?? product.minimumOrder ?? product.minimumUnits ?? 0);
    bottom.append(element('span', '', minimum ? `Mínimo: ${minimum} unidades` : 'Mínimo por confirmar'));
    const margin = estimatedMargin(product);
    if (margin !== null) bottom.append(element('strong', '', `${Math.round(margin)}% margen est.`));
    details.append(bottom);
    card.append(details);
    return card;
  }

  function filterLabels() {
    const labels = [];
    if (searchInput.value.trim()) labels.push(`Búsqueda: ${searchInput.value.trim()}`);
    if (categoryFilter.value) labels.push(`Categoría: ${categoryFilter.options[categoryFilter.selectedIndex].text}`);
    if (minimumFilter.value) labels.push(`Mínimo: hasta ${minimumFilter.value} unidades`);
    const collectionLabel = { novedades: 'Recién llegados', inicial: 'Lotes pequeños', margen: 'Con margen estimado' }[selectedCollection];
    if (collectionLabel) labels.push(collectionLabel);
    return labels;
  }

  function updateCategoryCounts() {
    categoryCards.forEach((card) => {
      const category = card.dataset.category;
      const count = allProducts.filter((product) => categoryKey(product.category) === category).length;
      const number = card.querySelector('[data-count]');
      if (number) number.textContent = String(count);
      card.classList.toggle('selected', categoryFilter.value === category);
      card.setAttribute('aria-pressed', String(categoryFilter.value === category));
    });
  }

  function render() {
    const filtered = getFilteredProducts();
    const hasFilters = filterLabels().length > 0 || sortFilter.value !== 'recommended';
    productsContainer.replaceChildren(...filtered.map(renderProduct));
    productsContainer.hidden = filtered.length === 0;
    emptyState.hidden = filtered.length > 0;
    resultsCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'producto' : 'productos'}`;
    activeFilters.replaceChildren(...filterLabels().map((label) => element('span', 'filter-chip', label)));
    clearFilters.hidden = !hasFilters;
    clearEmpty.hidden = !hasFilters;

    if (hasFilters) {
      emptyTitle.textContent = 'No hay productos para estos filtros todavía.';
      emptyMessage.textContent = 'Prueba otra categoría o limpia los filtros. Estamos preparando el catálogo para que pronto puedas comparar marcas y lotes.';
    } else {
      emptyTitle.textContent = 'El catálogo está tomando forma.';
      emptyMessage.textContent = 'Todavía no hay productos publicados. Pronto podrás descubrir marcas, comparar el precio mayorista con el PVP y elegir la compra mínima que te conviene.';
    }
    selectionCards.forEach((card) => {
      const selected = card.dataset.selection === selectedCollection;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
    updateCategoryCounts();
  }

  function resetFilters() {
    searchInput.value = '';
    categoryFilter.value = '';
    minimumFilter.value = '';
    sortFilter.value = 'recommended';
    selectedCollection = '';
    render();
  }

  async function loadProducts() {
    try {
      const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload)) allProducts = payload;
        else if (payload && Array.isArray(payload.products)) allProducts = payload.products;
      }
    } catch (_) {
      // La portada también funciona sin backend, mostrando el catálogo vacío.
    }
    render();
  }

  searchInput.addEventListener('input', render);
  categoryFilter.addEventListener('change', render);
  minimumFilter.addEventListener('change', render);
  sortFilter.addEventListener('change', render);
  clearFilters.addEventListener('click', resetFilters);
  clearEmpty.addEventListener('click', resetFilters);

  categoryCards.forEach((card) => card.addEventListener('click', () => {
    categoryFilter.value = categoryFilter.value === card.dataset.category ? '' : card.dataset.category;
    render();
    document.querySelector('#catalogo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  selectionCards.forEach((card) => card.addEventListener('click', () => {
    const previousCollection = selectedCollection;
    selectedCollection = selectedCollection === card.dataset.selection ? '' : card.dataset.selection;
    if (selectedCollection === 'margen') sortFilter.value = 'margin-desc';
    else if (previousCollection === 'margen' && sortFilter.value === 'margin-desc') sortFilter.value = 'recommended';
    render();
    document.querySelector('#catalogo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

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

  render();
  loadProducts();
})();

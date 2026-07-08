// ==================== STATE ====================
let menu = [];
let config = {};
let cart = [];
let activeFilter = 'all';

const socket = io();

// Category icons mapping
const categoryIcons = {
  'menu criollo': 'fa-bowl-food',
  'platos a la carta': 'fa-plate-wheat',
  'postres': 'fa-ice-cream',
  'bebidas': 'fa-glass-water',
  'sopas': 'fa-bowl-rice',
  'entradas': 'fa-cheese',
};

// Dish images mapping (stock photos from Unsplash)
const dishImages = {
  'arroz con pollo':      'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&q=75',
  'lomo saltado':         'https://images.unsplash.com/photo-1633321702518-7fecdafb94d5?w=600&q=75',
  'frejoles con seco':    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=75',
  'pollo a la plancha':   'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&q=75',
  'churrasco':            'https://images.unsplash.com/photo-1558030006-450675393462?w=600&q=75',
  'pollo broster':        'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=600&q=75',
  'arroz chaufa':         'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&q=75',
  'menu criollo':         'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=75',
  'mazamorra morada':     'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=75',
  'arroz con leche':      'https://images.unsplash.com/photo-1517244683847-7456b63c5969?w=600&q=75',
  'chicha morada':        'https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=600&q=75',
  'limonada':             'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600&q=75',
  'gaseosa':              'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=600&q=75',
};

// Fallback images by category
const categoryImages = {
  'menu criollo':         'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=75',
  'platos a la carta':    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=75',
  'postres':              'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&q=75',
  'bebidas':              'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&q=75',
};

const defaultImage = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=75';

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadMenu();
});

// ==================== SOCKET EVENTS ====================
socket.on('menu:updated', (data) => {
  menu = data;
  renderMenu();
  validateCart();
});

socket.on('config:updated', (data) => {
  config = data;
  applyConfig();
});

// ==================== DATA LOADING ====================
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    config = await res.json();
    applyConfig();
  } catch (e) {
    console.error('Error cargando config:', e);
  }
}

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    menu = await res.json();
    renderCategoryFilter();
    renderMenu();
  } catch (e) {
    console.error('Error cargando menu:', e);
  }
}

// ==================== CONFIG ====================
function applyConfig() {
  setText('restaurantName', config.nombre_restaurante);
  setText('welcomeMsg', config.mensaje_bienvenida);
  setText('headerAddress', config.direccion);
  setText('headerHorario', config.horario);
  setText('footerName', config.nombre_restaurante);
  setText('footerAddress', config.direccion);
  setText('footerHorario', config.horario);

  if (config.nombre_restaurante) document.title = config.nombre_restaurante;

  const precio = config.precio_menu_normal || '10.00';
  const priceEl = document.getElementById('bannerPrice');
  if (priceEl) priceEl.textContent = `S/. ${precio}`;
}

function setText(id, value) {
  if (!value) return;
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ==================== CATEGORY FILTER ====================
function renderCategoryFilter() {
  const container = document.getElementById('categoryFilter');
  if (!container || !menu.length) return;

  let html = `<button class="filter-btn active" onclick="filterCategory('all')">
    <i class="fas fa-grip"></i> Todos
  </button>`;

  for (const cat of menu) {
    if (cat.platos.length === 0) continue;
    const icon = getCategoryIcon(cat.nombre);
    html += `<button class="filter-btn" data-cat="${cat.id}" onclick="filterCategory(${cat.id})">
      <i class="fas ${icon}"></i> ${cat.nombre}
    </button>`;
  }

  container.innerHTML = html;
}

function filterCategory(catId) {
  activeFilter = catId;

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    if (catId === 'all' && !btn.dataset.cat) btn.classList.add('active');
    if (btn.dataset.cat == catId) btn.classList.add('active');
  });

  renderMenu();
}

// ==================== RENDER MENU ====================
function renderMenu() {
  const container = document.getElementById('menuContainer');
  if (!menu || menu.length === 0) {
    container.innerHTML = '<div class="loading-state"><i class="fas fa-utensils"></i><p>No hay platos disponibles</p></div>';
    return;
  }

  let html = '';
  for (const cat of menu) {
    if (cat.platos.length === 0) continue;
    if (activeFilter !== 'all' && cat.id !== activeFilter) continue;

    const icon = getCategoryIcon(cat.nombre);
    const available = cat.platos.filter(p => p.disponible && p.stock > 0).length;

    html += `
      <div class="category">
        <div class="category-header">
          <div class="category-icon"><i class="fas ${icon}"></i></div>
          <h2 class="category-title">${cat.nombre}</h2>
          <span class="category-count">${available} disponibles</span>
        </div>
        <div class="dishes-grid">
    `;

    for (const plato of cat.platos) {
      const agotado = !plato.disponible || plato.stock <= 0;
      const stockClass = plato.stock <= 5 && plato.stock > 0 ? 'low' : '';
      const cartItem = cart.find(c => c.plato_id === plato.id);
      const inCart = cartItem ? cartItem.cantidad : 0;
      const imgUrl = getDishImage(plato.nombre, cat.nombre, plato.imagen);

      html += `
        <div class="dish-card ${agotado ? 'agotado' : ''}">
          <div class="dish-img" style="background-image: url('${imgUrl}')">
            <div class="dish-img-overlay"></div>
            ${agotado ? '<div class="dish-badge-agotado"><i class="fas fa-ban"></i> Agotado</div>' : ''}
          </div>
          <div class="dish-body">
            <div class="dish-name">${plato.nombre}</div>
            <div class="dish-desc">${plato.descripcion}</div>
            <div class="dish-footer">
              <div class="dish-price-block">
                <div class="dish-price">S/. ${plato.precio.toFixed(2)}</div>
                <div class="dish-stock ${stockClass}">
                  ${agotado
                    ? '<i class="fas fa-circle-xmark"></i> Sin stock'
                    : `<i class="fas fa-circle-check"></i> ${plato.stock} disponibles`
                  }
                </div>
              </div>
              <button class="btn-add"
                ${agotado ? 'disabled' : ''}
                onclick="addToCart(${plato.id})">
                <i class="fas fa-plus"></i>
                ${inCart > 0 ? `(${inCart})` : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      `;
    }

    html += '</div></div>';
  }

  container.innerHTML = html;
}

// ==================== IMAGE HELPERS ====================
function getDishImage(dishName, catName, platoImagen) {
  // Priority 1: Custom image set by admin (uploaded, gallery, or external URL)
  if (platoImagen && platoImagen.trim() !== '') {
    return platoImagen;
  }

  // Priority 2: Automatic match by dish name
  const key = dishName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [name, url] of Object.entries(dishImages)) {
    if (key.includes(name)) return url;
  }

  // Priority 3: Fallback by category
  const catKey = catName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [name, url] of Object.entries(categoryImages)) {
    if (catKey.includes(name)) return url;
  }
  return defaultImage;
}

function getCategoryIcon(catName) {
  const key = catName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [name, icon] of Object.entries(categoryIcons)) {
    if (key.includes(name)) return icon;
  }
  return 'fa-utensils';
}

// ==================== CART ====================
function addToCart(platoId) {
  const plato = findPlato(platoId);
  if (!plato || !plato.disponible || plato.stock <= 0) return;

  const existing = cart.find(c => c.plato_id === platoId);
  if (existing) {
    if (existing.cantidad >= plato.stock) {
      showToast('No hay suficiente stock', true);
      return;
    }
    existing.cantidad++;
  } else {
    cart.push({
      plato_id: platoId,
      nombre: plato.nombre,
      precio: plato.precio,
      cantidad: 1
    });
  }

  updateCartUI();
  renderMenu();
  showToast(`${plato.nombre} agregado`);
}

function removeFromCart(platoId) {
  const idx = cart.findIndex(c => c.plato_id === platoId);
  if (idx === -1) return;

  cart[idx].cantidad--;
  if (cart[idx].cantidad <= 0) {
    cart.splice(idx, 1);
  }

  updateCartUI();
  renderMenu();
}

function validateCart() {
  cart = cart.filter(item => {
    const plato = findPlato(item.plato_id);
    if (!plato || !plato.disponible || plato.stock <= 0) return false;
    if (item.cantidad > plato.stock) item.cantidad = plato.stock;
    return true;
  });
  updateCartUI();
}

function findPlato(id) {
  for (const cat of menu) {
    const p = cat.platos.find(p => p.id === id);
    if (p) return p;
  }
  return null;
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
}

function updateCartUI() {
  const badge = document.getElementById('cartBadge');
  const itemsEl = document.getElementById('cartItems');
  const totalEl = document.getElementById('cartTotal');
  const btnOrder = document.getElementById('btnOrder');
  const totalItems = cart.reduce((sum, item) => sum + item.cantidad, 0);

  if (totalItems > 0) {
    badge.style.display = 'flex';
    badge.textContent = totalItems;
  } else {
    badge.style.display = 'none';
  }

  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="empty-cart">
        <i class="fas fa-concierge-bell"></i>
        <p>Tu pedido esta vacio</p>
        <span>Agrega platos desde la carta</span>
      </div>`;
    btnOrder.disabled = true;
  } else {
    let html = '';
    for (const item of cart) {
      html += `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-name">${item.nombre}</div>
            <div class="cart-item-price">S/. ${item.precio.toFixed(2)} c/u</div>
          </div>
          <div class="cart-item-controls">
            <button onclick="removeFromCart(${item.plato_id})"><i class="fas fa-minus"></i></button>
            <span class="cart-item-qty">${item.cantidad}</span>
            <button onclick="addToCart(${item.plato_id})"><i class="fas fa-plus"></i></button>
          </div>
        </div>
      `;
    }
    itemsEl.innerHTML = html;
    btnOrder.disabled = false;
  }

  totalEl.textContent = `S/. ${getCartTotal().toFixed(2)}`;
}

function toggleCart() {
  const panel = document.getElementById('cartPanel');
  const overlay = document.getElementById('cartOverlay');
  panel.classList.toggle('open');
  overlay.classList.toggle('show');
}

// ==================== ORDER ====================
function showOrderForm() {
  if (cart.length === 0) return;
  document.getElementById('orderModal').classList.add('show');
}

function closeOrderForm() {
  document.getElementById('orderModal').classList.remove('show');
}

async function submitOrder(e) {
  e.preventDefault();

  const nombre = document.getElementById('clienteName').value.trim();
  const telefono = document.getElementById('clienteTel').value.trim();
  const direccion = document.getElementById('clienteDir').value.trim();
  const notas = document.getElementById('clienteNotas').value.trim();
  const capturaInput = document.getElementById('clienteCaptura');

  if (!nombre) {
    showToast('Ingresa tu nombre', true);
    return;
  }

  const items = cart.map(c => ({
    plato_id: c.plato_id,
    cantidad: c.cantidad
  }));

  const formData = new FormData();
  formData.append('cliente_nombre', nombre);
  formData.append('cliente_telefono', telefono);
  formData.append('cliente_direccion', direccion);
  formData.append('notas', notas);
  formData.append('items', JSON.stringify(items));
  if (capturaInput.files[0]) {
    formData.append('captura', capturaInput.files[0]);
  }

  try {
    const res = await fetch('/api/pedidos', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Error al crear pedido', true);
      return;
    }

    cart = [];
    updateCartUI();
    renderMenu();
    closeOrderForm();
    toggleCart();
    document.getElementById('orderForm').reset();

    showToast(`Pedido #${data.pedido_id} creado - Total: S/. ${data.total.toFixed(2)}`);
  } catch (e) {
    showToast('Error de conexion', true);
  }
}

// ==================== TOAST ====================
function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  const icon = isError ? 'fa-circle-exclamation' : 'fa-circle-check';
  toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

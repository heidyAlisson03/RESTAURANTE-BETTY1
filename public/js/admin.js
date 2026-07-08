// ==================== STATE ====================
let token = localStorage.getItem('admin_token') || '';
let platos = [];
let categorias = [];
let pedidos = [];
let siteConfig = {};
let newPedidosCount = 0;
let currentFilter = '';

const socket = io();

const pageTitles = {
  dashboard:  ['Dashboard', 'Resumen general del restaurante'],
  pedidos:    ['Pedidos', 'Gestiona los pedidos de tus clientes'],
  platos:     ['Platos', 'Administra tu carta y stock'],
  categorias: ['Categorias', 'Organiza tu menu por secciones'],
  config:     ['Configuracion', 'Ajustes generales del restaurante'],
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  if (token) checkAuth();
});

// ==================== AUTH ====================
async function login(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('loginError').style.display = 'block';
      return;
    }
    token = data.token;
    localStorage.setItem('admin_token', token);
    showAdmin();
  } catch (e) {
    document.getElementById('loginError').style.display = 'block';
  }
}

async function checkAuth() {
  try {
    const res = await fetch('/api/admin/platos', { headers: { 'x-admin-token': token } });
    if (res.ok) {
      showAdmin();
    } else {
      token = '';
      localStorage.removeItem('admin_token');
    }
  } catch (e) {
    token = '';
    localStorage.removeItem('admin_token');
  }
}

function logout() {
  fetch('/api/admin/logout', { method: 'POST', headers: { 'x-admin-token': token } });
  token = '';
  localStorage.removeItem('admin_token');
  document.getElementById('loginView').style.display = 'flex';
  document.getElementById('adminView').style.display = 'none';
}

function showAdmin() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('adminView').style.display = 'flex';
  loadAll();
}

// ==================== SOCKET EVENTS ====================
socket.on('menu:updated', () => { loadPlatos(); });

socket.on('pedido:nuevo', (pedido) => {
  pedidos.unshift(pedido);
  newPedidosCount++;
  updatePedidosBadge();
  renderPedidos();
  renderDashboard();
  showToast(`Nuevo pedido #${pedido.id} de ${pedido.cliente_nombre}`);
});

socket.on('pedido:actualizado', (pedido) => {
  const idx = pedidos.findIndex(p => p.id === pedido.id);
  if (idx !== -1) pedidos[idx] = pedido;
  renderPedidos();
  renderDashboard();
});

// ==================== DATA ====================
async function loadAll() {
  await Promise.all([loadPlatos(), loadCategorias(), loadPedidos(), loadConfig()]);
  renderDashboard();
}

async function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token, ...options.headers }
  });
}

async function loadPlatos() {
  try {
    const res = await apiFetch('/api/admin/platos');
    if (res.ok) platos = await res.json();
    renderPlatos();
  } catch (e) { console.error(e); }
}

async function loadCategorias() {
  try {
    const res = await apiFetch('/api/admin/categorias');
    if (res.ok) categorias = await res.json();
    renderCategorias();
    updateCategoriaSelect();
  } catch (e) { console.error(e); }
}

async function loadPedidos() {
  try {
    const res = await apiFetch('/api/admin/pedidos');
    if (res.ok) pedidos = await res.json();
    renderPedidos();
  } catch (e) { console.error(e); }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) { siteConfig = await res.json(); fillConfigForm(); }
  } catch (e) { console.error(e); }
}

// ==================== SIDEBAR & TABS ====================
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const navItem = document.querySelector(`[data-tab="${tab}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  const [title, sub] = pageTitles[tab] || [tab, ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = sub;

  if (tab === 'pedidos') { newPedidosCount = 0; updatePedidosBadge(); }

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}

// ==================== DASHBOARD ====================
function renderDashboard() {
  const stats = document.getElementById('statsGrid');
  const totalPlatos = platos.length;
  const agotados = platos.filter(p => !p.disponible || p.stock <= 0).length;
  const today = new Date().toISOString().split('T')[0];
  const pedidosHoy = pedidos.filter(p => p.created_at && p.created_at.startsWith(today)).length;
  const pendientes = pedidos.filter(p => p.estado === 'pendiente').length;
  const ventasHoy = pedidos
    .filter(p => p.created_at && p.created_at.startsWith(today) && p.estado !== 'cancelado')
    .reduce((sum, p) => sum + p.total, 0);

  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon green"><i class="fas fa-bowl-food"></i></div>
      <div class="stat-info">
        <div class="stat-label">Platos Activos</div>
        <div class="stat-value">${totalPlatos - agotados}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red"><i class="fas fa-ban"></i></div>
      <div class="stat-info">
        <div class="stat-label">Agotados</div>
        <div class="stat-value">${agotados}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fas fa-receipt"></i></div>
      <div class="stat-info">
        <div class="stat-label">Pedidos Hoy</div>
        <div class="stat-value">${pedidosHoy}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon orange"><i class="fas fa-hourglass-half"></i></div>
      <div class="stat-info">
        <div class="stat-label">Pendientes</div>
        <div class="stat-value">${pendientes}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon gold"><i class="fas fa-coins"></i></div>
      <div class="stat-info">
        <div class="stat-label">Ventas Hoy</div>
        <div class="stat-value">S/. ${ventasHoy.toFixed(2)}</div>
      </div>
    </div>
  `;

  // Recent orders
  const recent = document.getElementById('recentOrders');
  const recentPedidos = pedidos.slice(0, 5);
  if (recentPedidos.length === 0) {
    recent.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><p>No hay pedidos aun</p></div>';
  } else {
    recent.innerHTML = recentPedidos.map(p => renderOrderCard(p)).join('');
  }

  // Low stock
  const lowStock = document.getElementById('lowStockList');
  const lowItems = platos.filter(p => p.stock <= 5).sort((a, b) => a.stock - b.stock);
  if (lowItems.length === 0) {
    lowStock.innerHTML = '<div class="empty-state"><i class="fas fa-circle-check"></i><p>Todo en stock</p></div>';
  } else {
    lowStock.innerHTML = lowItems.map(p => `
      <div class="low-stock-item">
        <span class="low-stock-name">${p.nombre}</span>
        <span class="low-stock-badge ${p.stock <= 0 ? 'out' : 'low'}">
          ${p.stock <= 0 ? 'Agotado' : p.stock + ' restantes'}
        </span>
      </div>
    `).join('');
  }
}

// ==================== PLATOS ====================
function renderPlatos() {
  const tbody = document.getElementById('platosTable');
  const search = (document.getElementById('searchPlatos')?.value || '').toLowerCase();

  let filtered = platos;
  if (search) {
    filtered = platos.filter(p =>
      p.nombre.toLowerCase().includes(search) ||
      p.categoria_nombre.toLowerCase().includes(search)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-bowl-food"></i><p>${search ? 'Sin resultados' : 'No hay platos'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const agotado = !p.disponible || p.stock <= 0;
    const stockColor = agotado ? 'danger' : p.stock <= 5 ? 'warning' : 'success';

    return `
      <tr>
        <td>
          <span class="table-dish-name">${p.nombre}</span>
          <span class="table-dish-desc">${p.descripcion || '-'}</span>
        </td>
        <td><span class="badge badge-default"><i class="fas fa-tag"></i> ${p.categoria_nombre}</span></td>
        <td><strong>S/. ${p.precio.toFixed(2)}</strong></td>
        <td>
          <div class="stock-control">
            <button onclick="quickStock(${p.id}, -1)" title="Reducir"><i class="fas fa-minus"></i></button>
            <span style="color: var(--${stockColor})">${p.stock}</span>
            <button onclick="quickStock(${p.id}, 1)" title="Aumentar"><i class="fas fa-plus"></i></button>
          </div>
        </td>
        <td>
          ${p.disponible
            ? '<span class="badge badge-success"><i class="fas fa-circle-check"></i> Disponible</span>'
            : '<span class="badge badge-danger"><i class="fas fa-circle-xmark"></i> No disponible</span>'
          }
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-icon" onclick="editPlato(${p.id})" title="Editar"><i class="fas fa-pen"></i></button>
            <button class="btn-icon danger" onclick="deletePlato(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')" title="Eliminar"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function quickStock(id, delta) {
  const plato = platos.find(p => p.id === id);
  if (!plato) return;
  const newStock = Math.max(0, plato.stock + delta);
  const disponible = newStock > 0 ? 1 : 0;

  try {
    await apiFetch(`/api/admin/platos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: plato.nombre,
        descripcion: plato.descripcion,
        precio: plato.precio,
        categoria_id: plato.categoria_id,
        stock: newStock,
        disponible
      })
    });
    await loadPlatos();
    renderDashboard();
  } catch (e) {
    showToast('Error al actualizar stock', true);
  }
}

function showPlatoModal(plato = null) {
  document.getElementById('platoModalTitle').innerHTML = plato
    ? '<i class="fas fa-pen"></i> Editar Plato'
    : '<i class="fas fa-bowl-food"></i> Nuevo Plato';
  document.getElementById('platoId').value = plato ? plato.id : '';
  document.getElementById('platoNombre').value = plato ? plato.nombre : '';
  document.getElementById('platoDesc').value = plato ? plato.descripcion : '';
  document.getElementById('platoPrecio').value = plato ? plato.precio : '';
  document.getElementById('platoStock').value = plato ? plato.stock : 0;
  document.getElementById('platoCategoria').value = plato ? plato.categoria_id : (categorias[0]?.id || '');
  document.getElementById('platoDisponible').value = plato ? plato.disponible : 1;

  // Image preview setup
  const imgUrl = plato ? plato.imagen : '';
  document.getElementById('platoImagen').value = imgUrl;
  document.getElementById('platoImagenUrl').value = imgUrl.startsWith('http') ? imgUrl : '';
  setImagePreview(imgUrl);
  switchImgTab('upload');
  resetUploadState();
  loadGallery();

  document.getElementById('platoModal').classList.add('show');
}

function closePlatoModal() { document.getElementById('platoModal').classList.remove('show'); }

// ==================== IMAGE MANAGEMENT ====================
let galleryCache = null;

function switchImgTab(tab) {
  document.querySelectorAll('.img-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.img-tab-content').forEach(c => c.classList.remove('active'));
  const tabBtn = document.querySelector(`[data-imgtab="${tab}"]`);
  if (tabBtn) tabBtn.classList.add('active');
  const tabContent = document.getElementById(`imgtab-${tab}`);
  if (tabContent) tabContent.classList.add('active');
}

function setImagePreview(url) {
  const img = document.getElementById('imgPreview');
  const empty = document.getElementById('imgPreviewEmpty');
  const removeBtn = document.getElementById('imgPreviewRemove');
  if (url && url.trim() !== '') {
    img.src = url;
    img.style.display = 'block';
    empty.style.display = 'none';
    removeBtn.style.display = 'flex';
  } else {
    img.src = '';
    img.style.display = 'none';
    empty.style.display = 'flex';
    removeBtn.style.display = 'none';
  }
}

function clearImageSelection() {
  document.getElementById('platoImagen').value = '';
  document.getElementById('platoImagenUrl').value = '';
  setImagePreview('');
  // Clear active gallery selection
  document.querySelectorAll('.gallery-item').forEach(g => g.classList.remove('selected'));
}

function resetUploadState() {
  const progress = document.getElementById('uploadProgress');
  const dropZone = document.getElementById('uploadDropZone');
  if (progress) progress.style.display = 'none';
  if (dropZone) dropZone.classList.remove('dragging');
  const fileInput = document.getElementById('uploadFileInput');
  if (fileInput) fileInput.value = '';
}

// --- UPLOAD ---
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) uploadImage(file);
}

async function uploadImage(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Solo se permiten archivos de imagen', true);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('La imagen no debe superar 5MB', true);
    return;
  }

  const progress = document.getElementById('uploadProgress');
  const dropZone = document.getElementById('uploadDropZone');
  const fill = document.getElementById('uploadFill');
  const status = document.getElementById('uploadStatus');

  dropZone.style.display = 'none';
  progress.style.display = 'flex';
  fill.style.width = '30%';
  status.textContent = 'Subiendo...';

  const formData = new FormData();
  formData.append('imagen', file);

  try {
    fill.style.width = '60%';
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'x-admin-token': token },
      body: formData
    });
    fill.style.width = '90%';
    const data = await res.json();

    if (res.ok && data.url) {
      fill.style.width = '100%';
      status.textContent = 'Imagen subida correctamente';
      document.getElementById('platoImagen').value = data.url;
      setImagePreview(data.url);
      showToast('Imagen subida correctamente');
      setTimeout(() => {
        dropZone.style.display = '';
        progress.style.display = 'none';
        fill.style.width = '0%';
      }, 1500);
    } else {
      throw new Error(data.error || 'Error al subir');
    }
  } catch (err) {
    status.textContent = 'Error al subir';
    fill.style.width = '0%';
    showToast(err.message || 'Error al subir imagen', true);
    setTimeout(() => {
      dropZone.style.display = '';
      progress.style.display = 'none';
    }, 2000);
  }
}

// Drag & Drop
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const dropZone = document.getElementById('uploadDropZone');
    if (!dropZone) return;

    dropZone.addEventListener('click', () => document.getElementById('uploadFileInput').click());

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragging');
      const file = e.dataTransfer.files[0];
      if (file) uploadImage(file);
    });
  }, 100);
});

// --- GALLERY ---
async function loadGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;

  if (galleryCache) {
    renderGallery(galleryCache);
    return;
  }

  try {
    const res = await apiFetch('/api/admin/gallery');
    if (res.ok) {
      galleryCache = await res.json();
      renderGallery(galleryCache);
    }
  } catch (e) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-images"></i><p>No se pudo cargar la galería</p></div>';
  }
}

function renderGallery(items) {
  const grid = document.getElementById('galleryGrid');
  const currentImg = document.getElementById('platoImagen').value;

  if (!items || items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-images"></i><p>No hay imágenes en la galería</p><span>Usa el botón "Agregar imagen" arriba</span></div>';
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="gallery-item ${currentImg === item.url ? 'selected' : ''}" onclick="selectGalleryImage('${item.url}')">
      <img src="${item.url}" alt="${item.name}" loading="lazy">
      <span>${item.name}</span>
      <div class="gallery-check"><i class="fas fa-circle-check"></i></div>
      <button type="button" class="gallery-delete" onclick="event.stopPropagation(); deleteGalleryImage('${item.filename}')" title="Eliminar de galería">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');
}

function selectGalleryImage(url) {
  document.getElementById('platoImagen').value = url;
  setImagePreview(url);
  // Highlight selected
  document.querySelectorAll('.gallery-item').forEach(g => {
    g.classList.toggle('selected', g.querySelector('img')?.src.includes(url.split('/').pop()));
  });
  showToast('Imagen seleccionada de galería');
}

// --- GALLERY UPLOAD ---
function handleGalleryFileSelect(e) {
  const file = e.target.files[0];
  if (file) uploadToGallery(file);
  e.target.value = '';
}

async function uploadToGallery(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Solo se permiten archivos de imagen', true);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('La imagen no debe superar 5MB', true);
    return;
  }

  const nombre = document.getElementById('galleryImageName').value.trim();
  const formData = new FormData();
  formData.append('imagen', file);
  if (nombre) formData.append('nombre', nombre);

  try {
    const res = await fetch('/api/admin/gallery/upload', {
      method: 'POST',
      headers: { 'x-admin-token': token },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.url) {
      galleryCache = null; // Invalidate cache
      await loadGallery();
      document.getElementById('galleryImageName').value = '';
      showToast('Imagen agregada a la galería');
    } else {
      throw new Error(data.error || 'Error al subir');
    }
  } catch (err) {
    showToast(err.message || 'Error al subir imagen a galería', true);
  }
}

async function deleteGalleryImage(filename) {
  if (!confirm('¿Eliminar esta imagen de la galería?')) return;
  try {
    const res = await fetch(`/api/admin/gallery/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': token }
    });
    if (res.ok) {
      galleryCache = null;
      await loadGallery();
      showToast('Imagen eliminada de la galería');
    } else {
      const data = await res.json();
      showToast(data.error || 'Error al eliminar', true);
    }
  } catch (e) {
    showToast('Error al eliminar imagen', true);
  }
}

// --- URL ---
function previewUrlImage() {
  // Just a soft live preview while typing
}

function applyUrlImage() {
  const url = document.getElementById('platoImagenUrl').value.trim();
  if (!url) {
    showToast('Ingresa una URL de imagen', true);
    return;
  }
  document.getElementById('platoImagen').value = url;
  setImagePreview(url);
  showToast('URL de imagen aplicada');
}

function editPlato(id) {
  const plato = platos.find(p => p.id === id);
  if (plato) showPlatoModal(plato);
}

async function savePlato(e) {
  e.preventDefault();
  const id = document.getElementById('platoId').value;
  const body = {
  nombre: document.getElementById('platoNombre').value,
  descripcion: document.getElementById('platoDesc').value,
  imagen: document.getElementById('platoImagen').value,
  precio: parseFloat(document.getElementById('platoPrecio').value),
  stock: parseInt(document.getElementById('platoStock').value),
  categoria_id: parseInt(document.getElementById('platoCategoria').value),
  disponible: parseInt(document.getElementById('platoDisponible').value)
};

  try {
    const url = id ? `/api/admin/platos/${id}` : '/api/admin/platos';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(body) });
    if (res.ok) {
      closePlatoModal();
      await loadPlatos();
      renderDashboard();
      showToast(id ? 'Plato actualizado' : 'Plato creado');
    } else {
      const data = await res.json();
      showToast(data.error || 'Error', true);
    }
  } catch (e) {
    showToast('Error de conexion', true);
  }
}

async function deletePlato(id, nombre) {
  if (!confirm(`Eliminar "${nombre}"? Esta accion no se puede deshacer.`)) return;
  try {
    const res = await apiFetch(`/api/admin/platos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadPlatos();
      renderDashboard();
      showToast('Plato eliminado');
    }
  } catch (e) { showToast('Error', true); }
}

// ==================== CATEGORIAS ====================
function renderCategorias() {
  const tbody = document.getElementById('categoriasTable');
  if (categorias.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><i class="fas fa-tags"></i><p>No hay categorias</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = categorias.map(c => {
    const count = platos.filter(p => p.categoria_id === c.id).length;
    return `
      <tr>
        <td><strong>${c.nombre}</strong></td>
        <td>${c.orden}</td>
        <td><span class="badge badge-default">${count} platos</span></td>
        <td>
          <div class="table-actions">
            <button class="btn-icon danger" onclick="deleteCategoria(${c.id}, '${c.nombre.replace(/'/g, "\\'")}')" title="Eliminar">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateCategoriaSelect() {
  const select = document.getElementById('platoCategoria');
  select.innerHTML = categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
}

function showCategoriaModal() {
  document.getElementById('catNombre').value = '';
  document.getElementById('catOrden').value = categorias.length;
  document.getElementById('categoriaModal').classList.add('show');
}

function closeCategoriaModal() { document.getElementById('categoriaModal').classList.remove('show'); }

async function saveCategoria(e) {
  e.preventDefault();
  const body = {
    nombre: document.getElementById('catNombre').value,
    orden: parseInt(document.getElementById('catOrden').value)
  };
  try {
    const res = await apiFetch('/api/admin/categorias', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      closeCategoriaModal();
      await loadCategorias();
      showToast('Categoria creada');
    } else {
      const data = await res.json();
      showToast(data.error || 'Error', true);
    }
  } catch (e) { showToast('Error', true); }
}

async function deleteCategoria(id, nombre) {
  if (!confirm(`Eliminar categoria "${nombre}"?`)) return;
  try {
    const res = await apiFetch(`/api/admin/categorias/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadCategorias();
      showToast('Categoria eliminada');
    } else {
      const data = await res.json();
      showToast(data.error || 'Error', true);
    }
  } catch (e) { showToast('Error', true); }
}

// ==================== PEDIDOS ====================
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.filter === filter);
  });
  renderPedidos();
}

function renderPedidos() {
  const container = document.getElementById('pedidosList');
  let filtered = pedidos;
  if (currentFilter) filtered = pedidos.filter(p => p.estado === currentFilter);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><p>No hay pedidos</p></div>';
    return;
  }

  container.innerHTML = filtered.map(p => renderOrderCard(p)).join('');
}

function renderOrderCard(p) {
  const estadoMap = {
    pendiente:       ['Pendiente', 'badge-warning', 'fa-hourglass-half'],
    en_preparacion:  ['En Preparacion', 'badge-info', 'fa-fire-burner'],
    completado:      ['Completado', 'badge-success', 'fa-circle-check'],
    cancelado:       ['Cancelado', 'badge-danger', 'fa-circle-xmark']
  };
  const [label, badgeClass, icon] = estadoMap[p.estado] || ['Desconocido', 'badge-default', 'fa-question'];
  const fecha = p.created_at ? new Date(p.created_at).toLocaleString('es-PE') : '';

  let actionsHtml = '';
  if (p.estado === 'pendiente') {
    actionsHtml = `
      <button class="btn btn-info btn-sm" onclick="updateEstado(${p.id}, 'en_preparacion')">
        <i class="fas fa-fire-burner"></i> Preparar
      </button>
      <button class="btn btn-danger btn-sm" onclick="updateEstado(${p.id}, 'cancelado')">
        <i class="fas fa-xmark"></i> Cancelar
      </button>
    `;
  } else if (p.estado === 'en_preparacion') {
    actionsHtml = `
      <button class="btn btn-success btn-sm" onclick="updateEstado(${p.id}, 'completado')">
        <i class="fas fa-check"></i> Completar
      </button>
    `;
  }

  return `
    <div class="order-card ${p.estado}">
      <div class="order-header">
        <div class="order-header-left">
          <span class="order-id">#${p.id}</span>
          <span class="badge ${badgeClass}"><i class="fas ${icon}"></i> ${label}</span>
        </div>
        <span class="order-time"><i class="fas fa-clock"></i> ${fecha}</span>
      </div>
      <div class="order-body">
        <div class="order-client"><i class="fas fa-user"></i> ${p.cliente_nombre}</div>
        <div class="order-meta">
          ${p.cliente_telefono ? `<span><i class="fas fa-phone"></i> ${p.cliente_telefono}</span>` : ''}
          ${p.cliente_direccion ? `<span><i class="fas fa-location-dot"></i> ${p.cliente_direccion}</span>` : ''}
        </div>
        <div class="order-items"><i class="fas fa-utensils"></i> ${p.detalle || 'Sin detalle'}</div>
        ${p.notas ? `<div class="order-notes"><i class="fas fa-message"></i> ${p.notas}</div>` : ''}
                ${p.captura_pago ? `
          <div class="order-payment">
            <i class="fas fa-receipt"></i> Comprobante de pago:
            <a href="${p.captura_pago}" target="_blank">
              <img src="${p.captura_pago}" alt="Captura de pago" class="payment-thumb">
            </a>
          </div>
        ` : ''}
      </div>
      <div class="order-footer">
        <span class="order-total">S/. ${p.total.toFixed(2)}</span>
        <div class="order-actions">${actionsHtml}</div>
      </div>
    </div>
  `;
}

async function updateEstado(id, estado) {
  try {
    const res = await apiFetch(`/api/admin/pedidos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ estado })
    });
    if (res.ok) {
      await loadPedidos();
      renderDashboard();
      showToast(`Pedido #${id} actualizado`);
    }
  } catch (e) { showToast('Error', true); }
}

function updatePedidosBadge() {
  const badge = document.getElementById('pedidosBadge');
  if (newPedidosCount > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = newPedidosCount;
  } else {
    badge.style.display = 'none';
  }
}

// ==================== CONFIG ====================
function fillConfigForm() {
  document.getElementById('cfgNombre').value = siteConfig.nombre_restaurante || '';
  document.getElementById('cfgDireccion').value = siteConfig.direccion || '';
  document.getElementById('cfgTelefono').value = siteConfig.telefono || '';
  document.getElementById('cfgHorario').value = siteConfig.horario || '';
  document.getElementById('cfgPrecioMenu').value = siteConfig.precio_menu_normal || '10.00';
  document.getElementById('cfgMensaje').value = siteConfig.mensaje_bienvenida || '';
}

async function saveConfig() {
  const body = {
    nombre_restaurante: document.getElementById('cfgNombre').value,
    direccion: document.getElementById('cfgDireccion').value,
    telefono: document.getElementById('cfgTelefono').value,
    horario: document.getElementById('cfgHorario').value,
    precio_menu_normal: document.getElementById('cfgPrecioMenu').value,
    mensaje_bienvenida: document.getElementById('cfgMensaje').value
  };

  try {
    const res = await apiFetch('/api/admin/config', { method: 'PUT', body: JSON.stringify(body) });
    if (res.ok) showToast('Configuracion guardada');
    else showToast('Error al guardar', true);
  } catch (e) { showToast('Error de conexion', true); }
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

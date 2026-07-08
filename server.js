const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const multer = require('multer');
const db = require('./database');

// Multer config for image uploads
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen'));
  }
});
// Multer config para capturas de pago
const pagosDir = path.join(__dirname, 'public', 'uploads', 'pagos');
if (!fs.existsSync(pagosDir)) fs.mkdirSync(pagosDir, { recursive: true });

const pagoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pagosDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'pago-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
  }
});

const uploadPago = multer({
  storage: pagoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imagenes'));
  }
});
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const adminSessions = new Set();

function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/menu', (req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden').all();
  const platos = db.prepare('SELECT * FROM platos ORDER BY nombre').all();

  const menu = categorias.map(cat => ({
    ...cat,
    platos: platos.filter(p => p.categoria_id === cat.id)
  }));

  res.json(menu);
});

app.get('/api/config', (req, res) => {
  const rows = db.prepare('SELECT * FROM configuracion').all();
  const config = {};
  rows.forEach(r => { config[r.clave] = r.valor; });
  res.json(config);
});

app.post('/api/pedidos', (req, res) => {
  const { cliente_nombre, cliente_telefono, cliente_direccion, notas, items } = req.body;

  if (!cliente_nombre || !items || items.length === 0) {
    return res.status(400).json({ error: 'Nombre y al menos un plato son requeridos' });
  }

  for (const item of items) {
    const plato = db.prepare('SELECT * FROM platos WHERE id = ?').get(item.plato_id);
    if (!plato) return res.status(400).json({ error: `Plato no encontrado: ${item.plato_id}` });
    if (!plato.disponible) return res.status(400).json({ error: `${plato.nombre} no esta disponible` });
    if (plato.stock < item.cantidad) {
      return res.status(400).json({ error: `Stock insuficiente para ${plato.nombre}. Disponible: ${plato.stock}` });
    }
  }

  const createOrder = db.transaction(() => {
    let total = 0;
    const detalles = [];

    for (const item of items) {
      const plato = db.prepare('SELECT * FROM platos WHERE id = ?').get(item.plato_id);
      const subtotal = plato.precio * item.cantidad;
      total += subtotal;
      detalles.push({ plato, cantidad: item.cantidad, subtotal });
    }

    const result = db.prepare(
      'INSERT INTO pedidos (cliente_nombre, cliente_telefono, cliente_direccion, notas, total) VALUES (?, ?, ?, ?, ?)'
    ).run(cliente_nombre, cliente_telefono || '', cliente_direccion || '', notas || '', total);

    const pedidoId = result.lastInsertRowid;

    for (const det of detalles) {
      db.prepare(
        'INSERT INTO detalle_pedidos (pedido_id, plato_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
      ).run(pedidoId, det.plato.id, det.cantidad, det.plato.precio, det.subtotal);

      db.prepare('UPDATE platos SET stock = stock - ? WHERE id = ?').run(det.cantidad, det.plato.id);

      const updated = db.prepare('SELECT stock FROM platos WHERE id = ?').get(det.plato.id);
      if (updated.stock <= 0) {
        db.prepare('UPDATE platos SET disponible = 0 WHERE id = ?').run(det.plato.id);
      }
    }

    return { pedidoId, total };
  });

  const { pedidoId, total } = createOrder();

  const menuActualizado = getFullMenu();
  io.emit('menu:updated', menuActualizado);

  const pedido = db.prepare(`
    SELECT p.*, GROUP_CONCAT(pl.nombre || ' x' || dp.cantidad, ', ') as detalle
    FROM pedidos p
    JOIN detalle_pedidos dp ON dp.pedido_id = p.id
    JOIN platos pl ON pl.id = dp.plato_id
    WHERE p.id = ?
    GROUP BY p.id
  `).get(pedidoId);

  io.emit('pedido:nuevo', pedido);

  res.json({ success: true, pedido_id: pedidoId, total });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = generateToken();
  adminSessions.add(token);
  res.json({ success: true, token });
});

app.post('/api/admin/logout', authMiddleware, (req, res) => {
  const token = req.headers['x-admin-token'];
  adminSessions.delete(token);
  res.json({ success: true });
});

app.get('/api/admin/platos', authMiddleware, (req, res) => {
  const platos = db.prepare(`
    SELECT p.*, c.nombre as categoria_nombre
    FROM platos p
    JOIN categorias c ON c.id = p.categoria_id
    ORDER BY c.orden, p.nombre
  `).all();
  res.json(platos);
});

app.post('/api/admin/platos', authMiddleware, (req, res) => {
  const {
    nombre,
    descripcion,
    imagen,
    precio,
    categoria_id,
    stock,
    disponible
  } = req.body;

  const result = db.prepare(
    `INSERT INTO platos 
    (nombre, descripcion, imagen, precio, categoria_id, stock, disponible) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nombre,
    descripcion || '',
    imagen || '',
    precio,
    categoria_id,
    stock || 0,
    disponible !== undefined ? disponible : 1
  );

  emitMenuUpdate();
  res.json({ success: true, id: result.lastInsertRowid });
});
app.put('/api/admin/platos/:id', authMiddleware, (req, res) => {
  const {
    nombre,
    descripcion,
    imagen,
    precio,
    categoria_id,
    stock,
    disponible
  } = req.body;

  db.prepare(`
    UPDATE platos 
    SET nombre = ?, 
        descripcion = ?, 
        imagen = ?, 
        precio = ?, 
        categoria_id = ?, 
        stock = ?, 
        disponible = ?
    WHERE id = ?
  `).run(
    nombre,
    descripcion || '',
    imagen || '',
    precio,
    categoria_id,
    stock,
    disponible,
    req.params.id
  );

  emitMenuUpdate();
  res.json({ success: true });
});

app.delete('/api/admin/platos/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM detalle_pedidos WHERE plato_id = ?').run(req.params.id);
  db.prepare('DELETE FROM platos WHERE id = ?').run(req.params.id);
  emitMenuUpdate();
  res.json({ success: true });
});

app.get('/api/admin/categorias', authMiddleware, (req, res) => {
  const cats = db.prepare('SELECT * FROM categorias ORDER BY orden').all();
  res.json(cats);
});

app.post('/api/admin/categorias', authMiddleware, (req, res) => {
  const { nombre, orden } = req.body;
  const result = db.prepare('INSERT INTO categorias (nombre, orden) VALUES (?, ?)').run(nombre, orden || 0);
  emitMenuUpdate();
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/admin/categorias/:id', authMiddleware, (req, res) => {
  const platos = db.prepare('SELECT COUNT(*) as c FROM platos WHERE categoria_id = ?').get(req.params.id);
  if (platos.c > 0) {
    return res.status(400).json({ error: 'No se puede eliminar una categoria con platos. Elimine los platos primero.' });
  }
  db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
  emitMenuUpdate();
  res.json({ success: true });
});

app.get('/api/admin/pedidos', authMiddleware, (req, res) => {
  const pedidos = db.prepare(`
    SELECT p.*, GROUP_CONCAT(pl.nombre || ' x' || dp.cantidad, ', ') as detalle
    FROM pedidos p
    LEFT JOIN detalle_pedidos dp ON dp.pedido_id = p.id
    LEFT JOIN platos pl ON pl.id = dp.plato_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(pedidos);
});

app.put('/api/admin/pedidos/:id', authMiddleware, (req, res) => {
  const { estado } = req.body;
  db.prepare('UPDATE pedidos SET estado = ? WHERE id = ?').run(estado, req.params.id);

  const pedido = db.prepare(`
    SELECT p.*, GROUP_CONCAT(pl.nombre || ' x' || dp.cantidad, ', ') as detalle
    FROM pedidos p
    LEFT JOIN detalle_pedidos dp ON dp.pedido_id = p.id
    LEFT JOIN platos pl ON pl.id = dp.plato_id
    WHERE p.id = ?
    GROUP BY p.id
  `).get(req.params.id);

  io.emit('pedido:actualizado', pedido);
  res.json({ success: true });
});

app.put('/api/admin/config', authMiddleware, (req, res) => {
  const updates = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)');
  const updateAll = db.transaction(() => {
    for (const [clave, valor] of Object.entries(updates)) {
      stmt.run(clave, valor);
    }
  });
  updateAll();

  const rows = db.prepare('SELECT * FROM configuracion').all();
  const config = {};
  rows.forEach(r => { config[r.clave] = r.valor; });
  io.emit('config:updated', config);

  res.json({ success: true });
});

// ==================== IMAGE UPLOAD ====================
app.post('/api/admin/upload', authMiddleware, (req, res) => {
  upload.single('imagen')(req, res, (err) => {
    if (err) {
      const message = err instanceof multer.MulterError
        ? (err.code === 'LIMIT_FILE_SIZE' ? 'La imagen no debe superar 5MB' : 'Error al subir archivo')
        : err.message || 'Error al subir archivo';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se envio ningun archivo' });
    }
    const url = '/uploads/' + req.file.filename;
    res.json({ success: true, url });
  });
});

// Gallery default dir setup
const galleryDir = path.join(__dirname, 'public', 'images', 'default');
if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });

const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, galleryDir),
  filename: (req, file, cb) => {
    // Use a clean name from the original file or a custom name from the body
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = req.body.nombre
      ? req.body.nombre.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      : file.originalname.replace(/\.[^.]+$/, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    cb(null, baseName + ext);
  }
});

const galleryUpload = multer({
  storage: galleryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen'));
  }
});

app.get('/api/admin/gallery', authMiddleware, (req, res) => {
  if (!fs.existsSync(galleryDir)) return res.json([]);
  const files = fs.readdirSync(galleryDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
  const gallery = files.map(f => ({
    name: f.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
    url: '/images/default/' + f,
    filename: f
  }));
  res.json(gallery);
});

app.post('/api/admin/gallery/upload', authMiddleware, (req, res) => {
  galleryUpload.single('imagen')(req, res, (err) => {
    if (err) {
      const message = err instanceof multer.MulterError
        ? (err.code === 'LIMIT_FILE_SIZE' ? 'La imagen no debe superar 5MB' : 'Error al subir archivo')
        : err.message || 'Error al subir archivo';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se envio ningun archivo' });
    }
    const url = '/images/default/' + req.file.filename;
    const name = req.file.filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
    res.json({ success: true, url, name, filename: req.file.filename });
  });
});

app.delete('/api/admin/gallery/:filename', authMiddleware, (req, res) => {
  const filename = req.params.filename;
  // Prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Nombre de archivo invalido' });
  }
  const filePath = path.join(galleryDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

function getFullMenu() {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden').all();
  const platos = db.prepare('SELECT * FROM platos ORDER BY nombre').all();
  return categorias.map(cat => ({
    ...cat,
    platos: platos.filter(p => p.categoria_id === cat.id)
  }));
}

function emitMenuUpdate() {
  const menu = getFullMenu();
  io.emit('menu:updated', menu);
}

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

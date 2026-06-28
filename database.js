const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const db = new Database(path.join(__dirname, 'restaurante.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    orden INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS platos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    precio REAL NOT NULL,
    categoria_id INTEGER NOT NULL,
    stock INTEGER DEFAULT 0,
    disponible INTEGER DEFAULT 1,
    imagen TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nombre TEXT NOT NULL,
    cliente_telefono TEXT DEFAULT '',
    cliente_direccion TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    estado TEXT DEFAULT 'pendiente',
    total REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS detalle_pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    plato_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_unitario REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (plato_id) REFERENCES platos(id)
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

function seedData() {
  const count = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
  if (count.c > 0) return;

  const insertCat = db.prepare('INSERT INTO categorias (nombre, orden) VALUES (?, ?)');
  const cats = db.transaction(() => {
    insertCat.run('Menu Criollo', 1);
    insertCat.run('Platos a la Carta', 2);
    insertCat.run('Postres', 3);
    insertCat.run('Bebidas', 4);
  });
  cats();

  const menuCriollo = db.prepare("SELECT id FROM categorias WHERE nombre = 'Menu Criollo'").get();
  const carta = db.prepare("SELECT id FROM categorias WHERE nombre = 'Platos a la Carta'").get();
  const postres = db.prepare("SELECT id FROM categorias WHERE nombre = 'Postres'").get();
  const bebidas = db.prepare("SELECT id FROM categorias WHERE nombre = 'Bebidas'").get();

  const insertPlato = db.prepare(
    'INSERT INTO platos (nombre, descripcion, precio, categoria_id, stock, disponible) VALUES (?, ?, ?, ?, ?, 1)'
  );

  const platos = db.transaction(() => {
    insertPlato.run('Menu Criollo del Dia', 'Entrada + Plato de Fondo + Postre', 10.00, menuCriollo.id, 50);
    insertPlato.run('Arroz con Pollo', 'Clasico arroz con pollo a la peruana', 15.00, carta.id, 30);
    insertPlato.run('Lomo Saltado', 'Lomo fino saltado con papas y arroz', 18.00, carta.id, 25);
    insertPlato.run('Frejoles con Seco a la Nortena', 'Seco de res con frejoles estilo norteno', 16.00, carta.id, 20);
    insertPlato.run('Pollo a la Plancha', 'Pechuga de pollo a la plancha con guarnicion', 14.00, carta.id, 30);
    insertPlato.run('Churrasco', 'Churrasco de res con papas y ensalada', 20.00, carta.id, 15);
    insertPlato.run('Pollo Broster', 'Pollo broster crujiente con papas fritas', 14.00, carta.id, 25);
    insertPlato.run('Arroz Chaufa', 'Arroz chaufa especial de la casa', 15.00, carta.id, 30);
    insertPlato.run('Mazamorra Morada', 'Postre clasico peruano', 5.00, postres.id, 20);
    insertPlato.run('Arroz con Leche', 'Arroz con leche con canela', 5.00, postres.id, 20);
    insertPlato.run('Chicha Morada', 'Vaso de chicha morada natural', 3.00, bebidas.id, 40);
    insertPlato.run('Limonada', 'Limonada fresca', 3.00, bebidas.id, 40);
    insertPlato.run('Gaseosa', 'Gaseosa personal', 3.00, bebidas.id, 50);
  });
  platos();

  const insertConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
  const config = db.transaction(() => {
    insertConfig.run('nombre_restaurante', 'Restaurante Betty');
    insertConfig.run('direccion', 'Mz N Lt 30 Urb. Las Lurin');
    insertConfig.run('telefono', '');
    insertConfig.run('horario', 'Lunes a Sabado: 11:00 AM - 4:00 PM');
    insertConfig.run('precio_menu_inauguracion', '9.50');
    insertConfig.run('precio_menu_normal', '10.00');
    insertConfig.run('mensaje_bienvenida', 'Bienvenidos a Restaurante Betty - Los mejores menus criollos');
  });
  config();

  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT OR IGNORE INTO admin_users (username, password) VALUES (?, ?)').run('admin', hash);
}

seedData();

module.exports = db;

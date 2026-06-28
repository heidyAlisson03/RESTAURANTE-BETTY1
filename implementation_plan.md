# Plan de Implementación: Gestión Local de Imágenes 📸

Este plan describe el enfoque para implementar la subida de imágenes personalizadas y una galería de imágenes predeterminadas para los platos en el sistema de **Restaurante Betty**.

## User Review Required

> [!IMPORTANT]
> **Instalación de Dependencia:** Para habilitar la subida de archivos multimedia tradicionales (`multipart/form-data`) de forma estándar y segura en Node.js/Express, se instalará la dependencia `multer`.
> **Estructura de Carpetas:** Se crearán las carpetas `public/uploads/` (para imágenes subidas por el usuario) y `public/images/default/` (para la galería predeterminada).

---

## Proposed Changes

### 🛠️ Backend (Servidor)

#### 1. Instalar `multer`
Se ejecutará el comando para instalar la biblioteca de subida de archivos:
```bash
npm install multer
```

#### 2. [MODIFY] [server.js](file:///C:/Users/AUTONOMA/Downloads/restaurante/server.js)
- Importar y configurar `multer` para guardar las imágenes subidas en `public/uploads/` con nombres únicos (ej: usando la marca de tiempo `Date.now() + ext`).
- Crear un nuevo endpoint de tipo POST `/api/admin/upload` protegido con el middleware de autenticación (`authMiddleware`).
- Este endpoint recibirá el archivo de imagen, validará que sea una imagen (MIME type `image/*`), la guardará localmente y retornará la URL relativa (ej: `/uploads/1716942000000.jpg`).

---

### 🎨 Frontend (Diseño e Interfaz)

#### 3. [MODIFY] [admin.html](file:///C:/Users/AUTONOMA/Downloads/restaurante/public/admin.html)
- En el modal de platos (`#platoModal`), rediseñar la sección de "Foto del plato".
- Cambiar el simple campo de texto por un sistema interactivo de pestañas o botones:
  - **Subir Imagen:** Un input de tipo file (`<input type="file" accept="image/*">`) con estilo de botón de arrastrar/cargar moderno.
  - **Galería Predeterminada:** Un selector visual (grilla de imágenes pequeñas) con platos comunes pre-cargados en el sistema (ej: lomo saltado, gaseosa, postre, ceviche, etc.).
  - **URL Externa:** Mantener la opción de pegar un link externo si el usuario lo desea.
- Añadir un contenedor de **Vista Previa de Imagen** (`<img>` dinámico) dentro del modal para que el administrador vea cómo lucirá el plato antes de guardar.

#### 4. [MODIFY] [js/admin.js](file:///C:/Users/AUTONOMA/Downloads/restaurante/public/js/admin.js)
- Implementar la función `uploadFile(file)` que enviará el archivo al endpoint `/api/admin/upload` vía `FormData` y fetch.
- Actualizar la función `showPlatoModal()` para inicializar correctamente la vista previa de la imagen y las opciones de selección.
- Implementar la interacción de la galería predeterminada: al hacer clic en una miniatura de la galería, se seleccionará su ruta relativa (ej: `/images/default/lomo.jpg`) y se actualizará la vista previa.
- Modificar `savePlato()` para que envíe la URL o ruta seleccionada.

#### 5. [MODIFY] [js/app.js](file:///C:/Users/AUTONOMA/Downloads/restaurante/public/js/app.js)
- Asegurar que la función `getDishImage()` reconozca correctamente las rutas locales relativas (ej. si comienza con `/uploads/` o `/images/`) y las renderice tal cual, aplicando el fallback de Unsplash únicamente si no es una ruta local válida o externa.

---

### 🖼️ Galería Predeterminada (Imágenes Semilla)

#### 6. [NEW] Creación de Carpeta de Imágenes Predeterminadas
Crearemos la carpeta `public/images/default/` y generaremos algunas imágenes gastronómicas peruanas representativas usando la herramienta de IA:
- `menu_del_dia.jpg` (Menú criollo)
- `lomo_saltado.jpg` (Lomo saltado / platos a la carta)
- `postre.jpg` (Mazamorra morada / arroz con leche)
- `bebida.jpg` (Chicha morada / bebidas)

---

## Verification Plan

### Automated & Manual Tests
1. **Verificación de Dependencia:** Comprobar que `multer` está instalado e inicializado correctamente sin errores en la consola al iniciar el servidor con `npm run dev` o `npm start`.
2. **Prueba de Subida (Upload):**
   - Entrar al panel de administración (`/admin`).
   - Crear o editar un plato.
   - Seleccionar un archivo de imagen local y presionar guardar.
   - Verificar en la carpeta `public/uploads/` que el archivo se guardó con éxito.
   - Comprobar que en la página de cliente (`/`) el nuevo plato se muestra con la imagen cargada.
3. **Prueba de Galería:**
   - Crear o editar un plato.
   - Seleccionar una imagen de la galería de predeterminados.
   - Guardar y verificar que se renderice correctamente en la carta del cliente y en el panel.
4. **Validación de Tipos de Archivo:**
   - Intentar subir un archivo que no sea imagen (ej: un archivo `.txt` o `.pdf`) y validar que el backend o frontend lo rechace de forma segura, informando con un Toast amigable.

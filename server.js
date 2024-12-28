const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { text } = require('stream/consumers');

const app = express();
const port = 3000;

// Ruta absoluta de la carpeta 'uploads'
const uploadsDir = path.join(__dirname, 'uploads');

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir)); // Servir archivos estáticos desde la carpeta 'uploads'

// Verificar si la carpeta 'uploads' existe, si no, crearla
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Carpeta "uploads" creada');
}

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir); // Usa la ruta absoluta para la carpeta 'uploads'
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Guardar con un nombre único
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp|tiff|jfif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    return cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, webp, tiff, jfif)'));
  }
});

// Conexión a la base de datos PostgreSQL
const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'testigo',
  user: 'postgres',
  password: 'root'  // Cambiado a 'root' que es la contraseña por defecto
});

// Intentar conectar a la base de datos
let dbConnected = false;

const connectDB = async () => {
  try {
    await client.connect();
    console.log('Conexión a PostgreSQL exitosa');
    dbConnected = true;
  } catch (err) {
    console.error('Error al conectar a PostgreSQL:', err);
    dbConnected = false;
  }
};

connectDB();

// Middleware para verificar la conexión a la BD
const checkDBConnection = (req, res, next) => {
  if (!dbConnected) {
    return res.status(500).json({ message: 'Error de conexión con la base de datos' });
  }
  next();
};

// Ruta para obtener todos los usuarios
app.get('/usuarios', checkDBConnection, async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM usuarios');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/subirImagen', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún archivo o el formato no es válido' });
    }

    const filePath = `/uploads/${req.file.filename}`;
    const { idUser, isProfileImage, nameUser, lastNameUser, emailUser, password } = req.body; // Accede a idUser desde req.body

    if (!idUser) {
      return res.status(400).json({ success: false, message: 'Se requiere el id_usuario' });
    }

    let response;

    // Si es una imagen de perfil, actualiza la foto de perfil del usuario
    if (isProfileImage) {
      // Actualizar la foto de perfil del usuario, si ya existe un usuario con ese ID
      response = await client.query(
        `UPDATE usuarios 
        SET nombre = $2, apellido = $3, correo = $4, clave = $5, foto_perfil = $6 
        WHERE id = $1 
        RETURNING *`,
        [idUser, nameUser, lastNameUser, emailUser, password, filePath]
      );
    } else {
      // Si no es una foto de perfil, inserta una historia
      response = await client.query(
        'INSERT INTO historias (id_usuario, contenido) VALUES ($1, $2) RETURNING *',
        [idUser, filePath] // Usa idUser en lugar de id_usuario
      );
    }

    if (response.rows.length > 0) {
      return res.json({
        success: true,
        message: isProfileImage ? 'Foto de perfil actualizada exitosamente' : 'Historia subida exitosamente',
        data: response.rows[0]
      });
    }

    return res.status(400).json({ success: false, message: 'No se pudo realizar la operación' });
  } catch (error) {
    console.error('Error al subir la imagen:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor: ' + error.message });
  }
});

// Ruta para login
app.post('/login', checkDBConnection, async (req, res) => {
  const { correo, clave } = req.body;

  if (!correo || !clave) {
    return res.status(400).json({
      success: false,
      message: 'Correo y clave son requeridos'
    });
  }

  try {
    const result = await client.query('SELECT * FROM usuarios WHERE correo = $1 AND clave = $2', [correo, clave]);

    if (result.rows.length > 0) {
      return res.json({
        success: true,
        user: {
          id: result.rows[0].id,
          correo: result.rows[0].correo
        }
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Credenciales incorrectas'
      });
    }
  } catch (error) {
    console.error('Error al verificar las credenciales:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});

app.get('/historias', checkDBConnection, async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM historias ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener historias:', error);
    res.status(500).json({ error: 'Error al obtener historias' });
  }
});

app.get('/usuario', checkDBConnection, async (req, res) => {
  const { id } = req.query;
  try {
    const result = await client.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al recuperar los datos del usuario:', error);
    res.status(500).send('Error en el servidor');
  }
});

app.post('/insertarPost', checkDBConnection, upload.single('file'), async (req, res) => {
  const { txt, id, nombreUser } = req.body; // Usa `req.body` para obtener los datos JSON enviados en la solicitud
  const filePath = req.file ? `/uploads/${req.file.filename}` : null; // URL del archivo si existe
  
  try {
    // Inserta en la tabla posts
    const result = await client.query(
      'INSERT INTO posts(nombre, contenido, autor_id, imagen_url) VALUES($1, $2, $3, $4) RETURNING *',
      [nombreUser, txt, id, filePath] // Incluye la URL de la imagen si se subió
    );
     
    console.log(result.rows, "<<<<<<<<<<<<<"); 
    res.json({
      success: true,
      message: 'Post creado exitosamente',
      data: result.rows[0]
    }); // Devuelve los datos insertados
  } catch (error) {
    console.log("Error al insertar los datos del post:", error);
    res.status(500).send('Error en el servidor');
  }
});


app.get('/optenerPost', checkDBConnection,async(req, res)=>  {
 try {
  const result = await client.query(
    'SELECT * FROM posts ORDER BY id DESC'
  );
 res.json(result.rows)
 } catch (error) {
  console.log("Error al optener los posts del usuario", error)
  res.status(500).send("Error en el servidor")
 }
})



// Ruta raíz de prueba
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    dbConnected: dbConnected
  });
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});

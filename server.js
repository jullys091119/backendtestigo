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




app.post('/crearhistoria', upload.single('file'), async (req, res) => {
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

    // Si no es una foto de perfil, inserta una historia
    response = await client.query(
      'INSERT INTO historias (id_usuario, contenido) VALUES ($1, $2) RETURNING *',
      [idUser, filePath] // Usa idUser en lugar de id_usuario
    );

    if (response.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Historia subida exitosamente',
        data: response.rows[0]
      });
    }

    return res.status(400).json({ success: false, message: 'No se pudo realizar la operación' });
  } catch (error) {
    console.error('Error al subir la imagen:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor: ' + error.message });
  }
});



app.post('/cambiarPerfil', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún archivo o el formato no es válido' });
    }

    const filePath = `/uploads/${req.file.filename}`;
    const { idUser } = req.body; // Accede a idUser desde req.body

    if (!idUser) {
      return res.status(400).json({ success: false, message: 'Se requiere el id_usuario' });
    }

    let response;

    // Si no es una foto de perfil, inserta una historia
    response = await client.query(`
      UPDATE usuarios SET  foto_perfil = $2 WHERE id = $1 RETURNING *`,
      [idUser, filePath]);
    if (response.rows.length > 0) {
      return res.json({
        success: true,
        message: "Foto perfil subida correctamente",
        data: response.rows[0]
      });
    }

    return res.status(400).json({ success: false, message: 'No se pudo realizar la operación' });
  } catch (error) {
    console.error('Error al subir la imagen:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor: ' + error.message });
  }
});


app.post('/cambiarPortada', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún archivo o el formato no es válido' });
    }

    const filePath = `/uploads/${req.file.filename}`;
    const { idUser } = req.body; // Accede a idUser desde req.body

    if (!idUser) {
      return res.status(400).json({ success: false, message: 'Se requiere el id_usuario' });
    }

    let response;

    // Si no es una foto de perfil, inserta una historia
    response = await client.query(`
      UPDATE usuarios SET  img_portada = $2 WHERE id = $1 RETURNING *`,
      [idUser, filePath]);
    if (response.rows.length > 0) {
      return res.json({
        success: true,
        message: "Foto portada subida correctamente",
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




app.get('/optenerPost', checkDBConnection, async (req, res) => {
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
  

app.post('/likes', async (req, res) => {
  const { idPost } = req.body;  // Extraemos el id del post desde el cuerpo de la solicitud

  try {
    // Verificar si el post existe
    const postResult = await client.query(
      'SELECT * FROM posts WHERE id = $1',  // Usamos $1 como marcador de parámetro
      [idPost]  // Asegúrate de pasar el valor correctamente
    );

    // Verificamos si el post existe
    if (postResult.rows.length > 0) {
      // Si el post existe, actualizamos el contador de likes
      const response = await client.query(
        'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1 RETURNING likes_count',
        [idPost]  // Pasamos el id del post para actualizar el contador
      );

      const updatedLikesCount = response.rows[0].likes_count;

      res.json({
        success: true,
        message: 'Like agregado exitosamente',
        likes_count: updatedLikesCount
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Post no encontrado'
      });
    }
  } catch (error) {
    console.error('Error al agregar like:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
});


// Endpoint para eliminar un like
app.post('/eliminaLike', async (req, res) => {
  const { idPost } = req.body;  // 'idPost' es el ID del post al que se le quita el like

  try {
    // Verificar si el contador de likes es mayor que 0
    const postResult = await client.query(
      'SELECT likes_count FROM posts WHERE id = $1',
      [idPost]
    );

    const likesCount = postResult.rows[0]?.likes_count || 0;

    // Solo decrementamos si el contador de likes es mayor a 0
    if (likesCount > 0) {
      // Decrementar el contador de likes en el post
      const response = await client.query(
        'UPDATE posts SET likes_count = likes_count - 1 WHERE id = $1 RETURNING likes_count',
        [idPost]
      );

      const updatedLikesCount = response.rows[0].likes_count;

      res.json({ success: true, message: 'Like eliminado exitosamente', likes_count: updatedLikesCount });
    } else {
      res.status(400).json({ success: false, message: 'No hay likes para eliminar' });
    }
  } catch (error) {
    console.error('Error al eliminar like:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});


app.get('/likes/:idPost', async (req, res) => {
  const { idPost } = req.params;

  try {
    const result = await client.query(
      'SELECT likes_count FROM posts WHERE id = $1',
      [idPost]
    );

    if (result.rows.length > 0) {
      res.json({
        success: true,
        likes_count: result.rows[0].likes_count
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Post no encontrado'
      });
    }
  } catch (error) {
    console.error('Error al obtener los likes:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
});


app.post('/comentarios', checkDBConnection, async (req, res) => {
  const { idPost, nombre, comentario } = req.body;

  if (!idPost || !nombre || !comentario) {
    return res.status(400).json({
      success: false,
      message: 'Se requiere el id del post, nombre y comentario'
    });
  }

  try {
    const response = await client.query(
      'INSERT INTO comentarios(post_id, nombre, comentario) VALUES($1, $2, $3) RETURNING *',
      [idPost, nombre, comentario]
    );

    if (response.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Comentario agregado exitosamente',
        data: response.rows[0]
      });
    }

    return res.status(400).json({
      success: false,
      message: 'No se pudo agregar el comentario'
    });
  } catch (error) {
    console.error('Error al agregar el comentario:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
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

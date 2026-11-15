const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5150;
const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || 'staander-chave-local-desenvolvimento';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// -------- Persistência simples em JSON --------
let db = { items: [], tags: [], notes: [], users: [] };

function loadDb() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      db = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Não foi possível carregar data.json, iniciando vazio.', e.message);
  }
  // garante arrays
  db.items = db.items || [];
  db.tags = db.tags || [];
  db.notes = db.notes || [];
  db.users = db.users || [];
}

function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

loadDb();

// -------- Helpers CRUD genericos --------
function createRouter(collectionName) {
  const router = express.Router();

  // Listar
  router.get('/', (req, res) => {
    res.json(db[collectionName]);
  });

  // Obter por id
  router.get('/:id', (req, res) => {
    const item = db[collectionName].find((x) => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Não encontrado' });
    res.json(item);
  });

  // Criar
  router.post('/', (req, res) => {
    const novo = { id: uuidv4(), criadoEm: new Date().toISOString(), ...req.body };
    db[collectionName].push(novo);
    saveDb();
    res.status(201).json(novo);
  });

  // Atualizar
  router.put('/:id', (req, res) => {
    const idx = db[collectionName].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    const atualizado = { ...db[collectionName][idx], ...req.body, id: req.params.id };
    db[collectionName][idx] = atualizado;
    saveDb();
    res.json(atualizado);
  });

  // Deletar
  router.delete('/:id', (req, res) => {
    const idx = db[collectionName].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    const removido = db[collectionName].splice(idx, 1)[0];
    saveDb();
    res.json({ message: 'Removido com sucesso', item: removido });
  });

  return router;
}

// -------- Rotas dos 3 CRUDs --------

app.use('/api/items', autenticarToken, createRouter('items'));
app.use('/api/tags', autenticarToken, createRouter('tags'));
app.use('/api/notes', autenticarToken, createRouter('notes'));

// -------- Health --------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', itens: db.items.length, tags: db.tags.length, notas: db.notes.length });
});

// -------- AUTENTICACAO DE USUARIOS --------

// Cadastro
app.post('/api/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({
        error: 'Preencha todos os campos.'
      });
    }

    if (senha.length < 8) {
      return res.status(400).json({
        error: 'A senha deve ter pelo menos 8 caracteres.'
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    const usuarioExistente = db.users.find(
      (user) => user.email === emailNormalizado
    );

    if (usuarioExistente) {
      return res.status(409).json({
        error: 'Este email já está cadastrado.'
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoUsuario = {
      id: uuidv4(),
      nome: nome.trim(),
      email: emailNormalizado,
      senha: senhaHash,
      criadoEm: new Date().toISOString()
    };

    db.users.push(novoUsuario);
    saveDb();

    const token = jwt.sign(
      { userId: novoUsuario.id },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(201).json({
      message: 'Usuário cadastrado com sucesso!',
      token,
      user: {
        id: novoUsuario.id,
        nome: novoUsuario.nome,
        email: novoUsuario.email
      }
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    return res.status(500).json({
      error: 'Erro interno ao cadastrar usuário.'
    });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        error: 'Informe email e senha.'
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    const usuario = db.users.find(
      (user) => user.email === emailNormalizado
    );

    if (!usuario) {
      return res.status(401).json({
        error: 'Email ou senha incorretos.'
      });
    }

    const senhaValida = await bcrypt.compare(
      senha,
      usuario.senha
    );

    if (!senhaValida) {
      return res.status(401).json({
        error: 'Email ou senha incorretos.'
      });
    }

    const token = jwt.sign(
      { userId: usuario.id },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.json({
      message: 'Login realizado com sucesso!',
      token,
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({
      error: 'Erro interno ao realizar login.'
    });
  }
});

// Middleware para verificar autenticacao
function autenticarToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Token não informado.'
    });
  }

  const token = authorization.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const usuario = db.users.find(
      (user) => user.id === decoded.userId
    );

    if (!usuario) {
      return res.status(401).json({
        error: 'Usuário não encontrado.'
      });
    }

    req.usuario = usuario;
    next();

  } catch (error) {
    return res.status(401).json({
      error: 'Token inválido ou expirado.'
    });
  }
}

// Verificar usuario autenticado
app.get('/api/me', autenticarToken, (req, res) => {
  res.json({
    id: req.usuario.id,
    nome: req.usuario.nome,
    email: req.usuario.email
  });
});

app.listen(PORT, () => {
  console.log(`Staander API rodando em http://localhost:${PORT}`);
});
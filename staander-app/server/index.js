const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5150;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// -------- Persistência simples em JSON --------
let db = { items: [], tags: [], notes: [] };

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
app.use('/api/items', createRouter('items'));
app.use('/api/tags', createRouter('tags'));
app.use('/api/notes', createRouter('notes'));

// -------- Health --------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', itens: db.items.length, tags: db.tags.length, notas: db.notes.length });
});

app.listen(PORT, () => {
  console.log(`Staander API rodando em http://localhost:${PORT}`);
});

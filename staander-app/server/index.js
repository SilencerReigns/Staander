const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5150;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 50;
const MAX_FILES_PER_IMPORT = 20;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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

// -------- Arquivos importados --------
// Campos que só o servidor define (o cliente não pode sobrescrevê-los por POST/PUT).
const PROTECTED_ITEM_FIELDS = ['arquivo', 'nomeOriginal', 'tamanhoBytes'];

function uploadPath(storedName) {
  // basename evita qualquer caminho fora da pasta de uploads
  return path.join(UPLOAD_DIR, path.basename(String(storedName)));
}

function removeFileQuietly(filePath) {
  fs.unlink(filePath, () => {});
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// O multer entrega o nome em latin1; converte de volta para UTF-8 (acentos).
function decodeName(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
}

// PDFs válidos trazem "%PDF-" nos primeiros 1024 bytes.
function looksLikePdf(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(fd, buf, 0, 1024, 0);
    return buf.subarray(0, n).includes('%PDF-');
  } finally {
    fs.closeSync(fd);
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${uuidv4()}.pdf`),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: MAX_FILES_PER_IMPORT },
});

// Importa um ou mais PDFs (campo "arquivos"). Um arquivo rejeitado não cancela os demais.
app.post('/api/items/import', upload.array('arquivos', MAX_FILES_PER_IMPORT), (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const importados = [];
  const rejeitados = [];

  for (const file of files) {
    const nome = decodeName(file.originalname);
    const isPdfName = /\.pdf$/i.test(nome);

    if (file.size === 0) {
      removeFileQuietly(file.path);
      rejeitados.push({ nome, motivo: 'O arquivo está vazio.' });
      continue;
    }
    if (!isPdfName) {
      removeFileQuietly(file.path);
      rejeitados.push({ nome, motivo: 'Formato não aceito. Por enquanto só PDF.' });
      continue;
    }
    if (!looksLikePdf(file.path)) {
      removeFileQuietly(file.path);
      rejeitados.push({ nome, motivo: 'O arquivo está corrompido ou não é um PDF válido.' });
      continue;
    }

    const agora = new Date().toISOString();
    const item = {
      id: uuidv4(),
      criadoEm: agora,
      titulo: nome.replace(/\.pdf$/i, '').trim() || 'Sem título',
      tipo: 'PDF',
      tamanho: formatSize(file.size),
      tamanhoBytes: file.size,
      status: 'nao_lido',
      dataImportacao: agora,
      nomeOriginal: nome,
      arquivo: path.basename(file.path),
    };
    db.items.push(item);
    importados.push(item);
  }

  if (importados.length > 0) saveDb();
  res.status(importados.length > 0 ? 201 : 422).json({ importados, rejeitados });
});

// Entrega o arquivo importado (aberto no navegador; use ?download=1 para baixar).
app.get('/api/items/:id/arquivo', (req, res) => {
  const item = db.items.find((x) => x.id === req.params.id);
  if (!item || !item.arquivo) return res.status(404).json({ error: 'Arquivo não encontrado' });

  const filePath = uploadPath(item.arquivo);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'O arquivo não está mais no servidor' });
  }

  const nome = item.nomeOriginal || `${item.titulo}.pdf`;
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.sendFile(filePath);
});

// -------- Helpers CRUD genericos --------
function createRouter(collectionName, { protectedFields = [], onRemove } = {}) {
  const router = express.Router();

  const sanitize = (body) => {
    const clean = { ...body };
    protectedFields.forEach((f) => delete clean[f]);
    return clean;
  };

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
    const novo = { id: uuidv4(), criadoEm: new Date().toISOString(), ...sanitize(req.body) };
    db[collectionName].push(novo);
    saveDb();
    res.status(201).json(novo);
  });

  // Atualizar
  router.put('/:id', (req, res) => {
    const idx = db[collectionName].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    const atual = db[collectionName][idx];
    const atualizado = { ...atual, ...sanitize(req.body), id: req.params.id };
    protectedFields.forEach((f) => {
      if (atual[f] !== undefined) atualizado[f] = atual[f];
    });
    db[collectionName][idx] = atualizado;
    saveDb();
    res.json(atualizado);
  });

  // Deletar
  router.delete('/:id', (req, res) => {
    const idx = db[collectionName].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    const removido = db[collectionName].splice(idx, 1)[0];
    if (onRemove) onRemove(removido);
    saveDb();
    res.json({ message: 'Removido com sucesso', item: removido });
  });

  return router;
}

// -------- Rotas dos 3 CRUDs --------
app.use(
  '/api/items',
  createRouter('items', {
    protectedFields: PROTECTED_ITEM_FIELDS,
    onRemove: (item) => {
      if (item.arquivo) removeFileQuietly(uploadPath(item.arquivo));
      // as notas de um arquivo excluído também saem da biblioteca
      db.notes = db.notes.filter((n) => n.itemId !== item.id);
    },
  })
);
app.use('/api/tags', createRouter('tags'));
app.use('/api/notes', createRouter('notes'));

// -------- Health --------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', itens: db.items.length, tags: db.tags.length, notas: db.notes.length });
});

// -------- Erros (upload grande demais, excesso de arquivos etc.) --------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `Cada arquivo pode ter no máximo ${MAX_UPLOAD_MB} MB.` });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: `Envie no máximo ${MAX_FILES_PER_IMPORT} arquivos por vez.` });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Staander API rodando em http://localhost:${PORT}`);
});

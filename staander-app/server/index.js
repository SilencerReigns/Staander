const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5150;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 50;
const MAX_FILES_PER_IMPORT = 20;
const JWT_SECRET = process.env.JWT_SECRET || 'staander-chave-local-desenvolvimento';
const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@staander.com').toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '15mb' }));

// -------- Criptografia de Senha e JWT (nativo com crypto) --------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (storedHash.startsWith('scrypt:')) {
    const [, salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const derived = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }
  try {
    const bcrypt = require('bcryptjs');
    return bcrypt.compareSync(String(password), storedHash);
  } catch {
    return String(password) === storedHash;
  }
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const pad = 4 - (input.length % 4 || 4);
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + (pad < 4 ? '='.repeat(pad) : '');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function signToken(payload, expiresInSeconds = 60 * 60 * 24 * 7) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = base64UrlEncode(JSON.stringify({ ...payload, exp }));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Token malformado');
  const [header, body, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  if (sig !== expectedSig) throw new Error('Assinatura inválida');
  const payload = JSON.parse(base64UrlDecode(body));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('Token expirado');
  }
  return payload;
}

// -------- Persistência simples em JSON --------
let db = { items: [], tags: [], notes: [], users: [], activities: [] };

function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function ensureDefaultAdmin() {
  const existingAdmin = db.users.find((u) => u.email === DEFAULT_ADMIN_EMAIL);
  if (!existingAdmin) {
    const agora = new Date().toISOString();
    db.users.push({
      id: uuidv4(),
      nome: 'Administrador Staander',
      email: DEFAULT_ADMIN_EMAIL,
      senha: hashPassword(DEFAULT_ADMIN_PASSWORD),
      role: 'admin',
      plano: 'Administrador',
      criadoEm: agora,
      ultimoAcessoEm: agora,
    });
    saveDb();
  } else if (existingAdmin.role !== 'admin') {
    existingAdmin.role = 'admin';
    saveDb();
  }
}

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
  db.activities = db.activities || [];
  ensureDefaultAdmin();
}

loadDb();

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role || 'user',
    plano: user.role === 'admin' ? 'Administrador' : user.plano || 'Plano gratuito',
    criadoEm: user.criadoEm,
    ultimoAcessoEm: user.ultimoAcessoEm,
  };
}

function getUserFromRequest(req) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    return db.users.find((u) => u.id === decoded.userId) || null;
  } catch {
    return null;
  }
}

function logActivity(user, tipo, descricao, meta = {}) {
  const entry = {
    id: uuidv4(),
    userId: user ? user.id : meta.userId || null,
    userName: user ? user.nome : meta.userName || 'Usuário',
    userEmail: user ? user.email : meta.userEmail || '',
    tipo,
    descricao,
    criadoEm: new Date().toISOString(),
    ...meta,
  };
  db.activities.push(entry);
  if (db.activities.length > 500) {
    db.activities = db.activities.slice(-500);
  }
  return entry;
}

app.use((req, _res, next) => {
  req.usuario = getUserFromRequest(req);
  next();
});

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
    const titulo = nome.replace(/\.pdf$/i, '').trim() || 'Sem título';
    const item = {
      id: uuidv4(),
      criadoEm: agora,
      titulo,
      tipo: 'PDF',
      tamanho: formatSize(file.size),
      tamanhoBytes: file.size,
      status: 'nao_lido',
      naBiblioteca: true,
      dataImportacao: agora,
      nomeOriginal: nome,
      arquivo: path.basename(file.path),
      userId: req.usuario ? req.usuario.id : null,
      userName: req.usuario ? req.usuario.nome : 'Usuário',
      userEmail: req.usuario ? req.usuario.email : '',
    };
    db.items.push(item);
    importados.push(item);
    logActivity(req.usuario, 'importacao', `Importou o arquivo PDF “${titulo}” (${item.tamanho})`, {
      itemId: item.id,
      itemTitulo: titulo,
    });
  }

  if (importados.length > 0) saveDb();
  res.status(importados.length > 0 ? 201 : 422).json({ importados, rejeitados });
});

// Entrega o arquivo importado ou de texto criado no Studio (aberto no navegador; use ?download=1 para baixar).
app.get('/api/items/:id/arquivo', (req, res) => {
  const item = db.items.find((x) => x.id === req.params.id);
  if (!item || (!item.arquivo && typeof item.conteudo !== 'string')) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }

  const isTxt = item.tipo === 'TXT' || typeof item.conteudo === 'string' || /\.txt$/i.test(item.arquivo || '');
  if (isTxt) {
    const nome = item.nomeOriginal || `${item.titulo || 'arquivo'}.txt`;
    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(nome)}`);
    if (item.arquivo) {
      const txtPath = uploadPath(item.arquivo);
      if (fs.existsSync(txtPath)) return res.sendFile(txtPath);
    }
    return res.send(item.conteudo || '');
  }

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
function createRouter(collectionName, { protectedFields = [], beforeCreate, beforeUpdate, onRemove } = {}) {
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
    const id = uuidv4();
    const criadoEm = new Date().toISOString();
    const userFields = req.usuario
      ? { userId: req.usuario.id, userName: req.usuario.nome, userEmail: req.usuario.email }
      : {};
    let novo = { id, criadoEm, ...sanitize(req.body), ...userFields };
    if (beforeCreate) novo = beforeCreate(novo, req.body, req.usuario);
    db[collectionName].push(novo);
    saveDb();
    res.status(201).json(novo);
  });

  // Atualizar
  router.put('/:id', (req, res) => {
    const idx = db[collectionName].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    const atual = db[collectionName][idx];
    let atualizado = { ...atual, ...sanitize(req.body), id: req.params.id };
    protectedFields.forEach((f) => {
      if (atual[f] !== undefined) atualizado[f] = atual[f];
    });
    if (!atualizado.userId && req.usuario) {
      atualizado.userId = req.usuario.id;
      atualizado.userName = req.usuario.nome;
      atualizado.userEmail = req.usuario.email;
    }
    if (beforeUpdate) atualizado = beforeUpdate(atualizado, atual, req.body, req.usuario);
    db[collectionName][idx] = atualizado;
    saveDb();
    res.json(atualizado);
  });

  // Deletar
  router.delete('/:id', (req, res) => {
    const idx = db[collectionName].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    const removido = db[collectionName].splice(idx, 1)[0];
    if (onRemove) onRemove(removido, req.usuario);
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
    beforeCreate: (novo, body = {}, usuario) => {
      if (typeof body.conteudo === 'string' || body.tipo === 'TXT') {
        const titulo = String(body.titulo || '').trim() || 'Sem título';
        const conteudo = String(body.conteudo ?? '');
        const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
        const tamanhoBytes = Buffer.byteLength(conteudo, 'utf8');
        const arquivo = `${novo.id}.txt`;
        try {
          fs.writeFileSync(uploadPath(arquivo), conteudo, 'utf8');
        } catch (e) {
          console.warn('Não foi possível gravar arquivo de texto em disco:', e.message);
        }
        const naBiblioteca = Boolean(body.naBiblioteca);
        logActivity(
          usuario,
          naBiblioteca ? 'publicacao' : 'projeto_criado',
          naBiblioteca
            ? `Criou e publicou o arquivo de texto “${titulo}” na Biblioteca`
            : `Criou o projeto de texto “${titulo}” na aba Projetos`,
          { itemId: novo.id, itemTitulo: titulo }
        );
        return {
          ...novo,
          titulo,
          conteudo,
          descricao,
          capa: typeof body.capa === 'string' ? body.capa : undefined,
          naBiblioteca,
          tipo: 'TXT',
          tamanho: formatSize(tamanhoBytes),
          tamanhoBytes,
          status: body.status || 'nao_lido',
          dataImportacao: novo.criadoEm,
          totalPaginas: 1,
          nomeOriginal: /\.txt$/i.test(titulo) ? titulo : `${titulo}.txt`,
          arquivo,
        };
      }
      logActivity(usuario, 'item_criado', `Cadastrou o item “${novo.titulo || 'Sem título'}”`, {
        itemId: novo.id,
      });
      return {
        ...novo,
        naBiblioteca: body.naBiblioteca !== undefined ? Boolean(body.naBiblioteca) : true,
      };
    },
    beforeUpdate: (atualizado, atual, body = {}, usuario) => {
      const agora = new Date().toISOString();
      const titulo =
        body.titulo !== undefined
          ? String(body.titulo).trim() || atual.titulo || 'Sem título'
          : atual.titulo || 'Sem título';
      const descricao =
        typeof body.descricao === 'string'
          ? body.descricao.trim()
          : typeof atual.descricao === 'string'
          ? atual.descricao
          : '';
      const capa = body.capa !== undefined ? body.capa : atual.capa;
      const naBiblioteca =
        body.naBiblioteca !== undefined
          ? Boolean(body.naBiblioteca)
          : atual.naBiblioteca !== undefined
          ? Boolean(atual.naBiblioteca)
          : atual.tipo !== 'TXT';
      const publicadoEm =
        body.naBiblioteca === true && !atual.publicadoEm
          ? agora
          : body.publicadoEm || atual.publicadoEm;

      // Registra atividades relevantes (publicação, edição de projeto, leitura)
      if (body.naBiblioteca === true && (!atual.naBiblioteca || body.publicadoEm)) {
        logActivity(
          usuario,
          'publicacao',
          `Publicou/atualizou “${titulo}” na Biblioteca${capa ? ' (com capa personalizada)' : ''}`,
          { itemId: atual.id, itemTitulo: titulo }
        );
      } else if (typeof body.conteudo === 'string' && body.naBiblioteca !== true) {
        logActivity(usuario, 'projeto_editado', `Editou o rascunho de projeto “${titulo}” em Projetos`, {
          itemId: atual.id,
          itemTitulo: titulo,
        });
      } else if (body.paginaAtual && body.paginaAtual !== atual.paginaAtual) {
        logActivity(
          usuario,
          'leitura',
          `Leu “${titulo}” (página ${body.paginaAtual} de ${body.totalPaginas || atual.totalPaginas || 1})`,
          { itemId: atual.id, itemTitulo: titulo }
        );
      }

      const isTxt =
        typeof body.conteudo === 'string' ||
        atual.tipo === 'TXT' ||
        typeof atual.conteudo === 'string';
      if (isTxt) {
        const conteudo =
          typeof body.conteudo === 'string' ? body.conteudo : String(atual.conteudo ?? '');
        const tamanhoBytes = Buffer.byteLength(conteudo, 'utf8');
        const arquivo =
          atual.arquivo && /\.txt$/i.test(atual.arquivo) ? atual.arquivo : `${atual.id}.txt`;
        try {
          fs.writeFileSync(uploadPath(arquivo), conteudo, 'utf8');
        } catch (e) {
          console.warn('Não foi possível atualizar arquivo de texto em disco:', e.message);
        }
        return {
          ...atualizado,
          titulo,
          conteudo,
          descricao,
          capa,
          naBiblioteca,
          publicadoEm,
          tipo: atual.tipo || 'TXT',
          tamanho: formatSize(tamanhoBytes),
          tamanhoBytes,
          nomeOriginal: /\.txt$/i.test(titulo) ? titulo : `${titulo}.txt`,
          arquivo,
          atualizadoEm: agora,
          totalPaginas: atualizado.totalPaginas || 1,
        };
      }
      return {
        ...atualizado,
        titulo,
        descricao,
        capa,
        naBiblioteca,
        publicadoEm,
        atualizadoEm: agora,
      };
    },
    onRemove: (item, usuario) => {
      if (item.arquivo) removeFileQuietly(uploadPath(item.arquivo));
      db.notes = db.notes.filter((n) => n.itemId !== item.id);
      logActivity(usuario, 'exclusao', `Removeu “${item.titulo || 'item'}”`, { itemId: item.id });
    },
  })
);
app.use('/api/tags', createRouter('tags'));
app.use(
  '/api/notes',
  createRouter('notes', {
    beforeCreate: (novo, _body, usuario) => {
      const targetItem = db.items.find((i) => i.id === novo.itemId);
      logActivity(
        usuario,
        'nota',
        `Criou uma nota em “${targetItem ? targetItem.titulo : 'arquivo'}”: “${String(novo.conteudo || '').slice(0, 60)}”`,
        { itemId: novo.itemId, noteId: novo.id }
      );
      return novo;
    },
    onRemove: (nota, usuario) => {
      logActivity(usuario, 'exclusao_nota', `Excluiu uma nota: “${String(nota.conteudo || '').slice(0, 50)}”`);
    },
  })
);

// -------- AUTENTICAÇÃO E PERFIL DE USUÁRIO --------
function autenticarToken(req, res, next) {
  const usuario = getUserFromRequest(req);
  if (!usuario) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
  req.usuario = usuario;
  next();
}

function verificarAdmin(req, res, next) {
  if (!req.usuario || req.usuario.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

// Cadastro
app.post('/api/register', (req, res) => {
  try {
    const { nome, email, senha } = req.body || {};
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Preencha todos os campos.' });
    }
    if (String(senha).length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
    }
    const emailNormalizado = String(email).trim().toLowerCase();
    const usuarioExistente = db.users.find((u) => u.email === emailNormalizado);
    if (usuarioExistente) {
      return res.status(409).json({ error: 'Este email já está cadastrado.' });
    }
    const agora = new Date().toISOString();
    const isAdminEmail = emailNormalizado === DEFAULT_ADMIN_EMAIL;
    const novoUsuario = {
      id: uuidv4(),
      nome: String(nome).trim(),
      email: emailNormalizado,
      senha: hashPassword(senha),
      role: isAdminEmail ? 'admin' : 'user',
      plano: isAdminEmail ? 'Administrador' : 'Plano gratuito',
      criadoEm: agora,
      ultimoAcessoEm: agora,
    };
    db.users.push(novoUsuario);
    logActivity(novoUsuario, 'cadastro', `Cadastrou-se na plataforma (${novoUsuario.email})`);
    saveDb();

    const token = signToken({ userId: novoUsuario.id, role: novoUsuario.role });
    return res.status(201).json({
      message: 'Usuário cadastrado com sucesso!',
      token,
      user: sanitizeUser(novoUsuario),
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    return res.status(500).json({ error: 'Erro interno ao cadastrar usuário.' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  try {
    const { email, senha } = req.body || {};
    if (!email || !senha) {
      return res.status(400).json({ error: 'Informe email e senha.' });
    }
    const emailNormalizado = String(email).trim().toLowerCase();
    const usuario = db.users.find((u) => u.email === emailNormalizado);
    if (!usuario || !verifyPassword(senha, usuario.senha)) {
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    }
    usuario.ultimoAcessoEm = new Date().toISOString();
    logActivity(usuario, 'login', `Iniciou sessão no Staander`);
    saveDb();

    const token = signToken({ userId: usuario.id, role: usuario.role || 'user' });
    return res.json({
      message: 'Login realizado com sucesso!',
      token,
      user: sanitizeUser(usuario),
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
});

// Dados do usuário autenticado ("Meu Espaço")
app.get('/api/me', autenticarToken, (req, res) => {
  res.json(sanitizeUser(req.usuario));
});

// -------- PAINEL EXCLUSIVO DO ADMINISTRADOR --------
app.get('/api/admin/overview', autenticarToken, verificarAdmin, (_req, res) => {
  const isTxt = (item) =>
    item && (item.tipo === 'TXT' || typeof item.conteudo === 'string' || /\.txt$/i.test(item.arquivo || ''));

  const usuarios = db.users.map((u) => {
    const userItems = db.items.filter((i) => i.userId === u.id || (i.userEmail && i.userEmail === u.email));
    const projetosCriados = userItems.filter(isTxt);
    const arquivosImportados = userItems.filter((i) => !isTxt(i) && i.arquivo);
    const publicacoesBiblioteca = userItems.filter((i) =>
      isTxt(i) ? i.naBiblioteca === true : Boolean(i.arquivo && i.naBiblioteca !== false)
    );
    const notas = db.notes.filter((n) => n.userId === u.id || (n.userEmail && n.userEmail === u.email));
    const atividadesRecentes = db.activities
      .filter((a) => a.userId === u.id || (a.userEmail && a.userEmail === u.email))
      .slice()
      .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
      .slice(0, 25);

    return {
      ...sanitizeUser(u),
      projetosCriados,
      arquivosImportados,
      publicacoesBiblioteca,
      notas,
      atividadesRecentes,
    };
  });

  const todosProjetos = db.items.filter(isTxt);
  const todosImportados = db.items.filter((i) => !isTxt(i) && i.arquivo);
  const todasPublicacoes = db.items.filter((i) =>
    isTxt(i) ? i.naBiblioteca === true : Boolean(i.arquivo && i.naBiblioteca !== false)
  );
  const atividadesGlobais = db.activities
    .slice()
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    .slice(0, 60);

  res.json({
    resumo: {
      totalUsuarios: db.users.length,
      totalProjetos: todosProjetos.length,
      totalImportados: todosImportados.length,
      totalPublicacoes: todasPublicacoes.length,
      totalNotas: db.notes.length,
    },
    usuarios,
    todosItens: db.items,
    todasNotas: db.notes,
    atividadesGlobais,
  });
});

// -------- Health --------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    itens: db.items.length,
    tags: db.tags.length,
    notas: db.notes.length,
    usuarios: db.users.length,
  });
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

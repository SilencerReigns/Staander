const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5150;
const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(32).toString('hex')
);
if (!JWT_SECRET) throw new Error('Defina JWT_SECRET no ambiente de produção.');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 50;
const MAX_FILES_PER_IMPORT = 20;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '15mb' }));

// -------- Persistência simples em JSON --------
let db = { items: [], tags: [], notes: [], users: [], activities: [] };

function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
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
  db.users.forEach((user) => {
    if (user.role !== 'admin') user.role = 'user';
  });
  if (db.users.length === 1) {
    const usuarioId = db.users[0].id;
    for (const collectionName of ['items', 'tags', 'notes']) {
      db[collectionName].forEach((item) => {
        if (!item.usuarioId) item.usuarioId = item.userId || usuarioId;
      });
    }
  }
}

loadDb();

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    role: usuario.role === 'admin' ? 'admin' : 'user',
    plano: usuario.role === 'admin' ? 'Administrador' : usuario.plano || 'Plano gratuito',
    criadoEm: usuario.criadoEm,
    ultimoAcessoEm: usuario.ultimoAcessoEm,
  };
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

app.post('/api/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (typeof nome !== 'string' || typeof email !== 'string' || typeof senha !== 'string' ||
        !nome.trim() || !email.trim() || !senha) {
      return res.status(400).json({ error: 'Preencha todos os campos.' });
    }
    if (senha.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
    }

    const emailNormalizado = email.trim().toLowerCase();
    if (db.users.some((user) => user.email === emailNormalizado)) {
      return res.status(409).json({ error: 'Este email já está cadastrado.' });
    }

    const novoUsuario = {
      id: uuidv4(),
      nome: nome.trim(),
      email: emailNormalizado,
      senha: await bcrypt.hash(senha, 10),
      criadoEm: new Date().toISOString(),
      role: 'user',
      plano: 'Plano gratuito',
    };

    if (db.users.length === 0) {
      for (const collectionName of ['items', 'tags', 'notes']) {
        db[collectionName].forEach((item) => {
          if (!item.usuarioId) item.usuarioId = novoUsuario.id;
        });
      }
    }

    db.users.push(novoUsuario);
    logActivity(novoUsuario, 'cadastro', `Cadastrou-se na plataforma (${novoUsuario.email})`);
    saveDb();

    const token = jwt.sign({ userId: novoUsuario.id }, JWT_SECRET, { expiresIn: '1h' });
    return res.status(201).json({
      message: 'Usuário cadastrado com sucesso!',
      token,
      user: usuarioPublico(novoUsuario),
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    return res.status(500).json({ error: 'Erro interno ao cadastrar usuário.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (typeof email !== 'string' || typeof senha !== 'string' || !email.trim() || !senha) {
      return res.status(400).json({ error: 'Informe email e senha.' });
    }

    const emailNormalizado = email.trim().toLowerCase();
    const usuario = db.users.find((user) => user.email === emailNormalizado);
    if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    }

    usuario.ultimoAcessoEm = new Date().toISOString();
    logActivity(usuario, 'login', 'Iniciou sessão no Staander');
    saveDb();

    const token = jwt.sign({ userId: usuario.id }, JWT_SECRET, { expiresIn: '1h' });
    return res.json({
      message: 'Login realizado com sucesso!',
      token,
      user: usuarioPublico(usuario),
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
});

function autenticarToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não informado.' });
  }

  try {
    const decoded = jwt.verify(authorization.slice(7), JWT_SECRET);
    const usuario = db.users.find((user) => user.id === decoded.userId);
    if (!usuario) return res.status(401).json({ error: 'Usuário não encontrado.' });
    req.usuario = usuario;
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

function verificarAdmin(req, res, next) {
  if (!req.usuario || req.usuario.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  return next();
}

app.get('/api/me', autenticarToken, (req, res) => {
  res.json(usuarioPublico(req.usuario));
});

app.get('/api/admin/progress', autenticarToken, (req, res) => {
  if (req.usuario.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }

  const usuarios = db.users.map((usuario) => ({
    ...usuarioPublico(usuario),
    itens: db.items
      .filter((item) => item.usuarioId === usuario.id)
      .map((item) => {
        const totalPaginas = Number(item.totalPaginas) || 0;
        const paginasLidas = Math.min(Number(item.maxPagina) || 0, totalPaginas);
        return {
          id: item.id,
          titulo: item.titulo,
          status: item.status || 'nao_lido',
          paginasLidas,
          totalPaginas,
          percentual: totalPaginas
            ? Math.round((paginasLidas / totalPaginas) * 100)
            : null,
        };
      }),
  }));

  res.json({ usuarios });
});

app.use('/api/items', autenticarToken);
app.use('/api/tags', autenticarToken);
app.use('/api/notes', autenticarToken);

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
      usuarioId: req.usuario.id,
      userId: req.usuario.id,
      userName: req.usuario.nome,
      userEmail: req.usuario.email,
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
  const item = db.items.find(
    (x) => x.id === req.params.id && x.usuarioId === req.usuario.id
  );
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
function createRouter(
  collectionName,
  { protectedFields = [], beforeCreate, beforeUpdate, onRemove, canCreate } = {}
) {
  const router = express.Router();

  const sanitize = (body) => {
    const clean = { ...body };
    protectedFields.forEach((f) => delete clean[f]);
    delete clean.usuarioId;
    delete clean.userId;
    delete clean.userName;
    delete clean.userEmail;
    return clean;
  };
  const pertenceAoUsuario = (item, usuarioId) => item.usuarioId === usuarioId;

  // Listar
  router.get('/', (req, res) => {
    res.json(db[collectionName].filter((item) => pertenceAoUsuario(item, req.usuario.id)));
  });

  // Obter por id
  router.get('/:id', (req, res) => {
    const item = db[collectionName].find(
      (x) => x.id === req.params.id && pertenceAoUsuario(x, req.usuario.id)
    );
    if (!item) return res.status(404).json({ error: 'Não encontrado' });
    res.json(item);
  });

  // Criar
  router.post('/', (req, res) => {
    if (canCreate && !canCreate(req.body, req.usuario)) {
      return res.status(404).json({ error: 'Não encontrado' });
    }
    const userFields = {
      userId: req.usuario.id,
      userName: req.usuario.nome,
      userEmail: req.usuario.email,
    };
    let novo = {
      id: uuidv4(),
      criadoEm: new Date().toISOString(),
      ...sanitize(req.body),
      usuarioId: req.usuario.id,
      ...userFields,
    };
    if (beforeCreate) novo = beforeCreate(novo, req.body, req.usuario);
    db[collectionName].push(novo);
    saveDb();
    res.status(201).json(novo);
  });

  // Atualizar
  router.put('/:id', (req, res) => {
    const idx = db[collectionName].findIndex(
      (x) => x.id === req.params.id && pertenceAoUsuario(x, req.usuario.id)
    );
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    if (canCreate && req.body && req.body.itemId !== undefined && !canCreate(req.body, req.usuario)) {
      return res.status(404).json({ error: 'Não encontrado' });
    }
    const atual = db[collectionName][idx];
    let atualizado = {
      ...atual,
      ...sanitize(req.body),
      id: req.params.id,
      usuarioId: atual.usuarioId,
      userId: atual.userId || atual.usuarioId,
      userName: atual.userName || req.usuario.nome,
      userEmail: atual.userEmail || req.usuario.email,
    };
    protectedFields.forEach((f) => {
      if (atual[f] !== undefined) atualizado[f] = atual[f];
    });
    if (beforeUpdate) atualizado = beforeUpdate(atualizado, atual, req.body, req.usuario);
    db[collectionName][idx] = atualizado;
    saveDb();
    res.json(atualizado);
  });

  // Deletar
  router.delete('/:id', (req, res) => {
    const idx = db[collectionName].findIndex(
      (x) => x.id === req.params.id && pertenceAoUsuario(x, req.usuario.id)
    );
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
      // as notas de um arquivo excluído também saem da biblioteca
      db.notes = db.notes.filter(
        (n) => n.itemId !== item.id || n.usuarioId !== item.usuarioId
      );
      logActivity(usuario, 'exclusao', `Removeu “${item.titulo || 'item'}”`, { itemId: item.id });
    },
  })
);
app.use('/api/tags', createRouter('tags'));
app.use(
  '/api/notes',
  createRouter('notes', {
    canCreate: (body, usuario) =>
      Boolean(
        body &&
          db.items.some(
            (item) => item.id === body.itemId && item.usuarioId === usuario.id
          )
      ),
    beforeCreate: (novo, _body, usuario) => {
      const targetItem = db.items.find(
        (item) => item.id === novo.itemId && item.usuarioId === usuario.id
      );
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

// -------- PAINEL EXCLUSIVO DO ADMINISTRADOR --------
app.get('/api/admin/overview', autenticarToken, verificarAdmin, (_req, res) => {
  const isTxt = (item) =>
    item && (item.tipo === 'TXT' || typeof item.conteudo === 'string' || /\.txt$/i.test(item.arquivo || ''));

  const usuarios = db.users.map((u) => {
    const userItems = db.items.filter((item) => item.usuarioId === u.id);
    const projetosCriados = userItems.filter(isTxt);
    const arquivosImportados = userItems
      .filter((item) => !isTxt(item) && item.arquivo)
      .map((item) => {
        const totalPaginas = Number(item.totalPaginas) || 0;
        const paginasLidas = Math.min(Number(item.maxPagina) || 0, totalPaginas);
        return {
          ...item,
          paginasLidas,
          percentual: totalPaginas
            ? Math.round((paginasLidas / totalPaginas) * 100)
            : null,
        };
      });
    const publicacoesBiblioteca = userItems.filter((i) =>
      isTxt(i) ? i.naBiblioteca === true : Boolean(i.arquivo && i.naBiblioteca !== false)
    );
    const notas = db.notes.filter((note) => note.usuarioId === u.id);
    const atividadesRecentes = db.activities
      .filter((a) => a.userId === u.id || (a.userEmail && a.userEmail === u.email))
      .slice()
      .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
      .slice(0, 25);

    return {
      ...usuarioPublico(u),
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

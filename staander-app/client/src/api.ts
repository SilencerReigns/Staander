
export const API_BASE = '/api';
const TOKEN_KEY = 'staander_token';
// Dados do usuário autenticado
export interface AuthUser {
  id: string;
  nome: string;
  email: string;
}

// Resposta do login e cadastro
export interface AuthResponse {
  message: string;
  token: string;
  user: AuthUser;
}


// Função central para comunicação com o backend
async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers);

  headers.set('Content-Type', 'application/json');

  const tokenAtual = token || localStorage.getItem(TOKEN_KEY);

  if (tokenAtual) {
    headers.set('Authorization', `Bearer ${tokenAtual}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();

    let message = `Erro ${res.status}`;

    try {
      const parsed = JSON.parse(body);
      message = parsed.error || parsed.message || message;
    } catch {
      if (body) message = body;
    }

    throw new Error(message);
  }
  if (res.status === 204) return null as unknown as T;
  return res.json();
}


export const api = {
  // AUTENTICAÇÃO

  register: (dados: {
    nome: string;
    email: string;
    senha: string;
  }) =>
    request<AuthResponse>('/register', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),

  login: (dados: {
    email: string;
    senha: string;
  }) =>
    request<AuthResponse>('/login', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),

  me: (token: string) =>
    request<AuthUser>('/me', {}, token),

  // ITENS

  listItems: () => request<Item[]>('/items'),
  getItem: (id: string) => request<Item>(`/items/${id}`),

  createItem: (item: Partial<Item>) =>
    request<Item>('/items', {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  updateItem: (id: string, item: Partial<Item>) =>
    request<Item>(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    }),

  deleteItem: (id: string) =>
    request<{ message: string }>(`/items/${id}`, {
      method: 'DELETE',
    }),

  // TAGS

  listTags: () => request<Tag[]>('/tags'),

  createTag: (tag: Partial<Tag>) =>
    request<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify(tag),
    }),

  updateTag: (id: string, tag: Partial<Tag>) =>
    request<Tag>(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(tag),
    }),

  deleteTag: (id: string) =>
    request<{ message: string }>(`/tags/${id}`, {
      method: 'DELETE',
    }),

  // NOTAS

  listNotes: () => request<Note[]>('/notes'),

  createNote: (note: Partial<Note>) =>
    request<Note>('/notes', {
      method: 'POST',
      body: JSON.stringify(note),
    }),

  updateNote: (id: string, note: Partial<Note>) =>
    request<Note>(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(note),
    }),

  deleteNote: (id: string) =>
    request<{ message: string }>(`/notes/${id}`, {
      method: 'DELETE',
    }),
};

// INTERFACES DOS CRUDS

export interface Item {
  id: string;
  titulo: string;
  tipo: 'PDF' | 'EPUB' | 'OUTRO';
  tamanho: string;
  dataImportacao: string;
  status: 'nao_lido' | 'em_leitura' | 'lido';
  criadoEm: string;
}

export interface Tag {
  id: string;
  nome: string;
  cor?: string;
  criadoEm: string;
}

export interface Note {
  id: string;
  itemId: string;
  conteudo: string;
  posicao?: string;
  criadoEm: string;
}

export const API_BASE = '/api';
export const TOKEN_KEY = 'staander_token';
export const USER_KEY = 'staander_user';

export interface AuthUser {
  id: string;
  nome: string;
  email: string;
  role?: 'admin' | 'user';
  plano?: string;
  criadoEm?: string;
  ultimoAcessoEm?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: AuthUser;
}

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
    const body = await res.text().catch(() => '');
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
  // Autenticação
  register: (dados: { nome: string; email: string; senha: string }) =>
    request<AuthResponse>('/register', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),
  login: (dados: { email: string; senha: string }) =>
    request<AuthResponse>('/login', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),
  me: (token?: string) => request<AuthUser>('/me', {}, token),

  // Itens
  listItems: () => request<Item[]>('/items'),
  getItem: (id: string) => request<Item>(`/items/${id}`),
  createItem: (item: Partial<Item>) => request<Item>('/items', { method: 'POST', body: JSON.stringify(item) }),
  updateItem: (id: string, item: Partial<Item>) => request<Item>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
  deleteItem: (id: string) => request<{ message: string }>(`/items/${id}`, { method: 'DELETE' }),
  importItems: async (files: File[]): Promise<ImportResult> => {
    const form = new FormData();
    files.forEach((file) => form.append('arquivos', file));
    const tokenAtual = localStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = {};
    if (tokenAtual) headers['Authorization'] = `Bearer ${tokenAtual}`;
    const res = await fetch(`${API_BASE}/items/import`, { method: 'POST', headers, body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 422) throw new Error(body.error || `Erro ${res.status}`);
    return { importados: body.importados ?? [], rejeitados: body.rejeitados ?? [] };
  },
  fileUrl: (id: string) => `${API_BASE}/items/${id}/arquivo`,

  // Tags
  listTags: () => request<Tag[]>('/tags'),
  createTag: (tag: Partial<Tag>) => request<Tag>('/tags', { method: 'POST', body: JSON.stringify(tag) }),
  updateTag: (id: string, tag: Partial<Tag>) => request<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(tag) }),
  deleteTag: (id: string) => request<{ message: string }>(`/tags/${id}`, { method: 'DELETE' }),

  // Notas
  listNotes: () => request<Note[]>('/notes'),
  createNote: (note: Partial<Note>) => request<Note>('/notes', { method: 'POST', body: JSON.stringify(note) }),
  updateNote: (id: string, note: Partial<Note>) => request<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(note) }),
  deleteNote: (id: string) => request<{ message: string }>(`/notes/${id}`, { method: 'DELETE' }),
};

export interface Item {
  id: string;
  titulo: string;
  tipo: 'PDF' | 'TXT' | 'EPUB' | 'OUTRO';
  conteudo?: string;
  descricao?: string;
  capa?: string;
  naBiblioteca?: boolean;
  publicadoEm?: string;
  tamanho: string;
  dataImportacao?: string;
  atualizadoEm?: string;
  status: 'nao_lido' | 'em_leitura' | 'lido';
  criadoEm: string;
  arquivo?: string;
  nomeOriginal?: string;
  tamanhoBytes?: number;
  userId?: string;
  userName?: string;
  userEmail?: string;
}

export interface ImportResult {
  importados: Item[];
  rejeitados: { nome: string; motivo: string }[];
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
  userId?: string;
  userName?: string;
  userEmail?: string;
}

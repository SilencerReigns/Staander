export const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Erro ${res.status}`);
  }
  if (res.status === 204) return null as unknown as T;
  return res.json();
}

export const api = {
  // Itens
  listItems: () => request<Item[]>('/items'),
  getItem: (id: string) => request<Item>(`/items/${id}`),
  createItem: (item: Partial<Item>) => request<Item>('/items', { method: 'POST', body: JSON.stringify(item) }),
  updateItem: (id: string, item: Partial<Item>) => request<Item>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
  deleteItem: (id: string) => request<{ message: string }>(`/items/${id}`, { method: 'DELETE' }),

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

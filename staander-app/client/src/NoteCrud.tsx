import React, { useState, useEffect } from 'react';
import { api, type Note, type Item } from './api';

export function NoteCrud() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Note>>({});
  const [toast, setToast] = useState('');

  useEffect(() => {
    Promise.all([api.listNotes(), api.listItems()])
      .then(([ns, its]) => { setNotes(ns); setItems(its); })
      .finally(() => setLoading(false));
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const promise =
      editing === null || editing === undefined
        ? api.createNote(draft as Note)
        : api.updateNote(editing, draft as Note);
    promise
      .then(() => {
        setToast(editing ? 'Nota atualizada com sucesso' : 'Nota criada com sucesso');
        setEditing(null);
        setDraft({});
        return api.listNotes();
      })
      .then(setNotes)
      .catch((err) => setToast('Erro: ' + err.message))
      .finally(() => setTimeout(() => setToast(''), 3000));
  }

  function startEdit(note: Note) {
    setEditing(note.id);
    setDraft({ ...note });
  }

  function itemTitulo(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    return item ? item.titulo : 'Item não encontrado';
  }

  return (
    <section className="section-card">
      <h2 className="page-title">Notas e Destaques</h2>
      <p style={{ color: '#969ba8', marginBottom: 20 }}>
        Anotações vinculadas a itens da biblioteca (RF15, RF17).
      </p>

      {loading ? (
        <p style={{ color: '#969ba8' }}>Carregando notas...</p>
      ) : notes.length === 0 ? (
        <div className="empty-state">Nenhuma nota criada ainda. Crie a primeira abaixo.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Conteúdo</th>
              <th>Posição</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => (
              <tr key={note.id}>
                <td>{itemTitulo(note.itemId)}</td>
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.conteudo}</td>
                <td>{note.posicao || '—'}</td>
                <td>{new Date(note.criadoEm).toLocaleDateString('pt-BR')}</td>
                <td className="actions-cell">
                  <button className="btn-sm" onClick={() => startEdit(note)}>Editar</button>
                  <button className="btn-sm btn-danger" onClick={() => deleteNote(note.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSave} style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 12, fontSize: 18 }}>{editing ? 'Editar nota' : 'Nova nota'}</h3>
        <div className="form-row">
          <label>Item relacionado</label>
          <select required value={draft.itemId || ''} onChange={(e) => setDraft({ ...draft, itemId: e.target.value })}>
            <option value="">Selecione um item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.titulo}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Conteúdo da nota</label>
          <textarea rows={3} required value={draft.conteudo || ''} onChange={(e) => setDraft({ ...draft, conteudo: e.target.value })} />
        </div>
        <div className="form-row">
          <label>Posição (opcional)</label>
          <input placeholder="Ex: página 42" value={draft.posicao || ''} onChange={(e) => setDraft({ ...draft, posicao: e.target.value })} />
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button type="submit" className="primary">{editing ? 'Salvar alterações' : 'Criar nota'}</button>
          {editing && (
            <button type="button" className="ghost" onClick={() => { setEditing(null); setDraft({}); }}>Cancelar</button>
          )}
        </div>
      </form>

      {toast && <div className="toast">{toast}</div>}
    </section>
  );

  function deleteNote(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta nota?')) return;
    api.deleteNote(id)
      .then(() => {
        setToast('Nota excluída com sucesso');
        return api.listNotes();
      })
      .then(setNotes)
      .catch((err) => setToast('Erro: ' + err.message));
  }
}

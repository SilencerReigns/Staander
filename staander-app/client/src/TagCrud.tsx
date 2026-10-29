import React, { useState, useEffect } from 'react';
import { api, type Tag } from './api';

export function TagCrud() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Tag>>({});
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.listTags().then(setTags).finally(() => setLoading(false));
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const promise =
      editing === null || editing === undefined
        ? api.createTag(draft as Tag)
        : api.updateTag(editing, draft as Tag);
    promise
      .then(() => {
        setToast(editing ? 'Tag atualizada com sucesso' : 'Tag criada com sucesso');
        setEditing(null);
        setDraft({});
        return api.listTags();
      })
      .then(setTags)
      .catch((err) => setToast('Erro: ' + err.message))
      .finally(() => setTimeout(() => setToast(''), 3000));
  }

  function startEdit(tag: Tag) {
    setEditing(tag.id);
    setDraft({ ...tag });
  }

  return (
    <section className="section-card">
      <h2 className="page-title">Tags</h2>
      <p style={{ color: '#969ba8', marginBottom: 20 }}>
        Tags para classificar e organizar os itens da biblioteca.
      </p>

      {loading ? (
        <p style={{ color: '#969ba8' }}>Carregando tags...</p>
      ) : tags.length === 0 ? (
        <div className="empty-state">Nenhuma tag cadastrada ainda. Crie a primeira abaixo.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cor</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id}>
                <td>{tag.nome}</td>
                <td>
                  <span className="badge" style={{ background: tag.cor || 'transparent', color: tag.cor || '#969ba8', borderColor: tag.cor || '#969ba8' }}>
                    {tag.cor || '—'}
                  </span>
                </td>
                <td>{new Date(tag.criadoEm).toLocaleDateString('pt-BR')}</td>
                <td className="actions-cell">
                  <button className="btn-sm" onClick={() => startEdit(tag)}>Editar</button>
                  <button className="btn-sm btn-danger" onClick={() => deleteTag(tag.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSave} style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 12, fontSize: 18 }}>{editing ? 'Editar tag' : 'Nova tag'}</h3>
        <div className="form-row">
          <label>Nome</label>
          <input required value={draft.nome || ''} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} />
        </div>
        <div className="form-row">
          <label>Cor (opcional)</label>
          <input type="color" value={draft.cor || '#8b5cf6'} onChange={(e) => setDraft({ ...draft, cor: e.target.value })} />
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button type="submit" className="primary">{editing ? 'Salvar alterações' : 'Criar tag'}</button>
          {editing && (
            <button type="button" className="ghost" onClick={() => { setEditing(null); setDraft({}); }}>Cancelar</button>
          )}
        </div>
      </form>

      {toast && <div className="toast">{toast}</div>}
    </section>
  );

  function deleteTag(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta tag?')) return;
    api.deleteTag(id)
      .then(() => {
        setToast('Tag excluída com sucesso');
        return api.listTags();
      })
      .then(setTags)
      .catch((err) => setToast('Erro: ' + err.message));
  }
}

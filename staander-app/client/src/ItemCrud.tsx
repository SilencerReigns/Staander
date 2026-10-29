import React, { useState, useEffect } from 'react';
import { api, type Item } from './api';

export function ItemCrud() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Item>>({});
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.listItems().then(setItems).finally(() => setLoading(false));
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const item = draft as Item;
    const promise =
      editing === undefined || editing === null
        ? api.createItem(item)
        : api.updateItem(editing, item);
    promise
      .then(() => {
        setToast(editing ? 'Item atualizado com sucesso' : 'Item criado com sucesso');
        setEditing(null);
        setDraft({});
        return api.listItems();
      })
      .then(setItems)
      .catch((err) => setToast('Erro: ' + err.message))
      .finally(() => setTimeout(() => setToast(''), 3000));
  }

  function startEdit(item: Item) {
    setEditing(item.id);
    setDraft({ ...item });
  }

  return (
    <section className="section-card">
      <h2 className="page-title">Itens da Biblioteca</h2>
      <p style={{ color: '#969ba8', marginBottom: 20 }}>
        Arquivos importados (PDF, EPUB ou outros) com status de leitura.
      </p>

      {loading ? (
        <p style={{ color: '#969ba8' }}>Carregando itens...</p>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum item importado ainda. Crie o primeiro abaixo.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Tipo</th>
              <th>Tamanho</th>
              <th>Status</th>
              <th>Importado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.titulo}</td>
                <td><span className="badge">{item.tipo}</span></td>
                <td>{item.tamanho}</td>
                <td>{item.status}</td>
                <td>{new Date(item.dataImportacao).toLocaleDateString('pt-BR')}</td>
                <td className="actions-cell">
                  <button className="btn-sm" onClick={() => startEdit(item)}>Editar</button>
                  <button className="btn-sm btn-danger" onClick={() => deleteItem(item.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSave} style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 12, fontSize: 18 }}>{editing ? 'Editar item' : 'Novo item'}</h3>
        <div className="form-row">
          <label>Título</label>
          <input required value={draft.titulo || ''} onChange={(e) => setDraft({ ...draft, titulo: e.target.value })} />
        </div>
        <div className="form-row">
          <label>Tipo</label>
          <select required value={draft.tipo || 'PDF'} onChange={(e) => setDraft({ ...draft, tipo: e.target.value as any })}>
            <option value="PDF">PDF</option>
            <option value="EPUB">EPUB</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>
        <div className="form-row">
          <label>Tamanho</label>
          <input value={draft.tamanho || ''} onChange={(e) => setDraft({ ...draft, tamanho: e.target.value })} />
        </div>
        <div className="form-row">
          <label>Status</label>
          <select required value={draft.status || 'nao_lido'} onChange={(e) => setDraft({ ...draft, status: e.target.value as any })}>
            <option value="nao_lido">Não lido</option>
            <option value="em_leitura">Em leitura</option>
            <option value="lido">Lido</option>
          </select>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button type="submit" className="primary">{editing ? 'Salvar alterações' : 'Criar item'}</button>
          {editing && (
            <button type="button" className="ghost" onClick={() => { setEditing(null); setDraft({}); }}>Cancelar</button>
          )}
        </div>
      </form>

      {toast && <div className="toast">{toast}</div>}
    </section>
  );

  function deleteItem(id: string) {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    api.deleteItem(id)
      .then(() => {
        setToast('Item excluído com sucesso');
        return api.listItems();
      })
      .then(setItems)
      .catch((err) => setToast('Erro: ' + err.message));
  }
}

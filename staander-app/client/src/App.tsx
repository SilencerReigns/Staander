import { useEffect, useState } from 'react';
import { ItemCrud } from './ItemCrud';
import { TagCrud } from './TagCrud';
import { NoteCrud } from './NoteCrud';

const pages = [
  { id: 'landing', label: 'Landing page', description: 'Apresentação do Staander', src: '/paginas/landing/index.html' },
  { id: 'mvp', label: 'MVP', description: 'Quiz e recomendação', src: '/paginas/mvp/index.html' },
  { id: 'produto', label: 'Produto', description: 'Protótipo navegável', src: '/paginas/produto/index.html' },
  { id: 'app', label: 'Aplicação', description: 'Biblioteca, tags e notas' },
] as const;

type PageId = (typeof pages)[number]['id'];

function getPageFromHash(): PageId {
  const id = window.location.hash.slice(1);
  return pages.some((page) => page.id === id) ? (id as PageId) : 'landing';
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>(getPageFromHash);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', '#landing');
    const syncPage = () => setActivePage(getPageFromHash());
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);

  const activeExperience = pages.find(
    (page): page is Extract<(typeof pages)[number], { src: string }> => page.id === activePage && 'src' in page,
  );

  return (
    <div className="staander-shell">
      <header className="app-header">
        <a className="app-brand" href="#landing" aria-label="Staander — página inicial">
          staander<span>.</span>
        </a>
        <nav className="app-navigation" aria-label="Páginas do Staander">
          {pages.map((page) => (
            <a
              key={page.id}
              href={`#${page.id}`}
              className={`app-nav-link${activePage === page.id ? ' active' : ''}`}
              aria-current={activePage === page.id ? 'page' : undefined}
            >
              <span>{page.label}</span>
              <small>{page.description}</small>
            </a>
          ))}
        </nav>
      </header>

      <main className={`app-content${activePage === 'app' ? ' crud-content' : ''}`}>
        {activePage === 'app' ? (
          <div className="crud-workspace">
            <div className="crud-intro">
              <p className="kicker">SUA BIBLIOTECA</p>
              <h1>Organize seu conhecimento.</h1>
              <p>Gerencie os arquivos, as tags e as notas da sua biblioteca Staander.</p>
              <div className="crud-jump-links" aria-label="Ir para uma área">
                <a href="#biblioteca">Biblioteca</a>
                <a href="#tags">Tags</a>
                <a href="#notas">Notas</a>
              </div>
            </div>
            <section id="biblioteca" className="crud-section"><ItemCrud /></section>
            <section id="tags" className="crud-section"><TagCrud /></section>
            <section id="notas" className="crud-section"><NoteCrud /></section>
            <footer className="app-footer">© 2026 Staander · Sua biblioteca digital, finalmente sob controle.</footer>
          </div>
        ) : (
          <iframe
          key={activeExperience?.src}
            className="experience-frame"
          src={activeExperience?.src ?? '/paginas/landing/index.html'}
          title={activeExperience?.label ?? 'Staander'}
          />
        )}
      </main>
    </div>
  );
}

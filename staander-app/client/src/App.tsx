// Só o MVP é exibido: as demais páginas e a tela de CRUD não fazem mais parte da navegação.
export default function App() {
  return (
    <main className="staander-shell">
      <iframe className="experience-frame" src="/paginas/mvp/index.html" title="Staander" />
    </main>
  );
}

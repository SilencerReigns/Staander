// Só o MVP é exibido: as demais páginas e a tela de CRUD não fazem mais parte da navegação.
import { useEffect, useState } from 'react';
import { Login } from './Login';
import { api, type AuthUser } from './api';

const TOKEN_KEY = 'staander_token';

export default function App() {
  const [usuario, setUsuario] = useState<AuthUser | null>(null);
  const [verificandoSessao, setVerificandoSessao] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      setVerificandoSessao(false);
      return;
    }

    let ativo = true;

    api.me(token)
      .then((user) => {
        if (ativo) setUsuario(user);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        if (ativo) setVerificandoSessao(false);
      });

    return () => {
      ativo = false;
    };
  }, []);

  function handleAuthenticated(token: string, user: AuthUser) {
    localStorage.setItem(TOKEN_KEY, token);
    setUsuario(user);
  }

  if (verificandoSessao) {
    return (
      <div className="auth-screen">
        <p>Verificando sua sessão...</p>
      </div>
    );
  }

  if (!usuario) {
    return <Login onAuthenticated={handleAuthenticated} />;
  }

  return (
    <main className="staander-shell">
      <iframe className="experience-frame" src="/paginas/mvp/index.html" title="Staander" />
    </main>
  );
}

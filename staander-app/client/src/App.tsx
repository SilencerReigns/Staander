// Só o MVP é exibido: as demais páginas e a tela de CRUD não fazem mais parte da navegação.
import { useEffect, useState } from 'react';
import { Login } from './Login';
import { api, TOKEN_KEY, USER_KEY, type AuthUser } from './api';

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
    api
      .me(token)
      .then((user) => {
        if (ativo) {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          setUsuario(user);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      })
      .finally(() => {
        if (ativo) setVerificandoSessao(false);
      });

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data && event.data.type === 'STAANDER_LOGOUT') {
        handleLogout();
      }
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === TOKEN_KEY && !event.newValue) {
        setUsuario(null);
      }
    }
    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  function handleAuthenticated(token: string, user: AuthUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setUsuario(user);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUsuario(null);
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
      <iframe
        key={usuario.id}
        className="experience-frame"
        src="/paginas/mvp/index.html"
        title="Staander"
      />
    </main>
  );
}

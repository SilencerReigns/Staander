
import { useState, type FormEvent } from 'react';
import { api, type AuthUser } from './api';

interface LoginProps {
  onAuthenticated: (token: string, user: AuthUser) => void;
}

export function Login({ onAuthenticated }: LoginProps) {
  const [modo, setModo] = useState<'login' | 'cadastro'>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem('');
    setCarregando(true);

    try {
      const resposta =
        modo === 'login'
          ? await api.login({ email, senha })
          : await api.register({ nome, email, senha });

      onAuthenticated(resposta.token, resposta.user);
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : 'Não foi possível realizar a operação.'
      );
    } finally {
      setCarregando(false);
    }
  }

  function alternarModo() {
    setModo(modo === 'login' ? 'cadastro' : 'login');
    setMensagem('');
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <h1 className="auth-brand">
          staander<span>.</span>
        </h1>

        <p className="auth-subtitle">
          {modo === 'login'
            ? 'Entre na sua biblioteca de conhecimento.'
            : 'Crie sua conta e organize seu conhecimento.'}
        </p>

        <form onSubmit={handleSubmit}>
          {modo === 'cadastro' && (
            <div className="auth-field">
              <label htmlFor="auth-nome">Nome</label>
              <input
                id="auth-nome"
                type="text"
                placeholder="Seu nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">E-mail</label>
            <input
              id="auth-email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-senha">Senha</label>
            <input
              id="auth-senha"
              type="password"
              placeholder="Sua senha"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              minLength={8}
              required
            />
          </div>

          <p className="auth-message" role="alert">
            {mensagem}
          </p>

          <button
            className="auth-submit"
            type="submit"
            disabled={carregando}
          >
            {carregando
              ? 'Aguarde...'
              : modo === 'login'
                ? 'Entrar'
                : 'Criar conta'}
          </button>
        </form>

        <p className="auth-switch">
          {modo === 'login'
            ? 'Ainda não tem uma conta?'
            : 'Já possui uma conta?'}{' '}
          <button type="button" onClick={alternarModo}>
            {modo === 'login' ? 'Cadastre-se' : 'Faça login'}
          </button>
        </p>
      </section>
    </main>
  );
}

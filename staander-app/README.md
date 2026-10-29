# Staander App

O aplicativo reúne as experiências que antes estavam separadas nas páginas estáticas do repositório e os três cadastros ligados à API.

## Páginas disponíveis

- **Landing page** — apresentação do Staander.
- **MVP** — quiz e recomendação.
- **Produto** — protótipo navegável da biblioteca digital.
- **Aplicação** — gerenciamento de itens da biblioteca, tags e notas.

A navegação fica no topo. Cada página tem um endereço próprio com `#landing`, `#mvp`, `#produto` ou `#app`, então os botões voltar e avançar do navegador também funcionam.

## Como executar

Inicie a API em um terminal:

```bash
cd server
npm install
npm run dev
```

Inicie o site em outro terminal:

```bash
cd client
npm install
npm run dev
```

Abra o endereço informado pelo Vite (por padrão, `http://localhost:5173`). A API usa `http://localhost:5150` e guarda os registros em `server/data.json`.

As páginas estáticas originais foram mantidas em `client/public/paginas` para serem servidas junto do aplicativo.

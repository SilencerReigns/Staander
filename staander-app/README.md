# Staander App

O app exibe apenas o **MVP** do Staander (biblioteca, leitor, notas e busca), que conversa com a API para importar PDFs, ler com acompanhamento de progresso e criar notas. A landing page, o quiz e a tela de CRUD (itens, tags e notas) não fazem mais parte da navegação; seus arquivos continuam no repositório.

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

As notas cadastradas em **Aplicação → Notas** aparecem na lateral do leitor do MVP quando estão vinculadas a um item cujo título corresponde ao e-book aberto.

## Contas e perfil de administrador

- Novos cadastros recebem o perfil `user`. O nome da conta e o botão **Sair** aparecem em **Meu espaço**, na parte inferior da barra lateral do MVP.
- Para promover uma conta a administradora, pare a API, altere manualmente o campo `"role"` dessa conta para `"admin"` em `server/data.json` e reinicie a API. Exemplo: `"role": "admin"`. Não altere o campo `senha`.
- Administradores veem a opção **Progresso dos usuários**, com o status e o progresso por arquivo. O servidor também verifica o perfil antes de responder à rota administrativa.
- Arquivos, tags e notas são vinculados ao usuário por `usuarioId`; as rotas comuns retornam e alteram apenas os dados do usuário autenticado. O painel administrativo não concede acesso aos arquivos privados.

## Importação de PDFs

O botão **Importar arquivo** do MVP (na Visão geral e na Biblioteca) abre o seletor de arquivos do computador. Também é possível arrastar PDFs para a janela de importação.

- Os arquivos são enviados para `POST /api/items/import` (campo `arquivos`, até 20 por vez) e salvos em `server/uploads/`. Cada PDF vira um item (`tipo: PDF`, `status: nao_lido`) com título, tamanho e data de importação.
- Só PDFs são aceitos. O servidor confere a extensão e o cabeçalho `%PDF-` do arquivo. Um arquivo rejeitado (vazio, corrompido ou de outro formato) não cancela os demais, e a resposta traz o motivo de cada rejeição.
- O limite por arquivo é de 50 MB. Para mudar, inicie o servidor com `MAX_UPLOAD_MB=100 npm start`.
- `GET /api/items/:id/arquivo` abre o PDF no navegador (`?download=1` baixa o arquivo). No `MVP`, clicar em um PDF importado o abre no leitor.
- Excluir um item também apaga o arquivo de `server/uploads/`.
- Os campos `arquivo`, `nomeOriginal` e `tamanhoBytes` só são definidos pelo servidor e não podem ser alterados por `POST` ou `PUT`.


## Biblioteca, leitor e progresso

- A biblioteca mostra apenas os PDFs que você importou (os livros de exemplo foram removidos). Cada arquivo tem um botão de excluir (ícone de lixeira, ao passar o mouse sobre o card), com confirmação. Excluir um arquivo apaga também o PDF do servidor e as notas dele.
- O leitor usa o **pdf.js** (pasta `client/public/paginas/mvp/vendor/pdfjs`, licença Apache-2.0) para mostrar o PDF página a página. Ele descobre o total de páginas, acompanha a página em que você está pela rolagem e grava o progresso no item (`totalPaginas`, `paginaAtual`, `maxPagina`, `ultimaLeituraEm` e `status`). Ao reabrir um arquivo, a leitura continua da última página.
- O progresso usa a **maior página alcançada** sobre o total de páginas. Ao chegar à última página, o status vira `lido`.
- O botão ↗ do leitor abre o PDF original no visualizador do navegador (com seleção de texto, busca e zoom, que o leitor integrado ainda não tem).

## Visão geral

- **Continue lendo:** os 3 últimos PDFs abertos, com barra de progresso e "X / Y páginas".
- **Atividade recente:** as últimas notas criadas.
- Os números do topo (arquivos, leituras em andamento, progresso total e notas) vêm dos dados reais.

## Busca

A barra de busca do topo (ou `Ctrl + K`) abre a página de busca. Ela procura, sem diferenciar acentos, nos nomes dos arquivos e no texto das notas. Clicar em um arquivo o abre no leitor, e clicar em uma nota abre o arquivo na página dela.

## Notas

- **Aba Notas & destaques → Nova nota:** abre um formulário em que você escolhe o arquivo da biblioteca, informa a página (opcional) e escreve a descrição.
- **Leitor → Nova nota:** o mesmo formulário, com o arquivo travado no que está aberto e a página atual já preenchida. As notas aparecem no painel "Notas deste arquivo"; clicar em uma leva à página dela.
- As notas são gravadas pela API (`POST /api/notes`, campos `itemId`, `conteudo` e `posicao`) e cada uma tem um botão para excluir, com confirmação.

## Testes

Os testes E2E em `tests/test.py` mantêm a cobertura das operações antigas de itens, tags e notas e dos fluxos do MVP, além de cobrir cadastro, login inválido, perfil, logout e restrição de acesso administrativo. Itens e tags têm CRUD validado pela API autenticada no navegador; PDFs e notas são criados/excluídos pela interface, e a atualização de nota é validada pela API porque o MVP não tem editor de notas.

Os testes exigem Python 3, Selenium, Google Chrome e os servidores da API e do cliente em execução. Cada execução cria uma conta de teste com e-mail exclusivo em `server/data.json`; os testes limpam os itens, arquivos, tags e notas criados.

A partir da raiz do repositório, instale o Selenium e execute:

```bash
python3 -m pip install selenium
python3 -m unittest discover -s staander-app/tests -p test.py -v
```

Use Python 3; em algumas instalações do Windows, `python` ainda aponta para Python 2.7. Se o terminal já estiver em `staander-app/tests`, use `python3 -m unittest discover -s . -p test.py -v`.

Por padrão, o Chrome roda em modo headless. Para acompanhar a execução visualmente e deixar as interações mais lentas:

```bash
STAANDER_HEADLESS=0 STAANDER_ACTION_DELAY=0.6 python3 -m unittest discover -s staander-app/tests -p test.py -v
```

Em PowerShell, defina as variáveis com `$env:STAANDER_HEADLESS="0"` e `$env:STAANDER_ACTION_DELAY="0.6"` antes de executar `py -3 -m unittest discover -s staander-app/tests -p test.py -v`. `CHROMEDRIVER` pode apontar para um driver específico; se omitido, o Selenium Manager tenta localizar um compatível. O teste de cadastro deixa uma conta de teste com e-mail exclusivo em `server/data.json`.

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

`tests/test.py` (Selenium) foi escrito para a tela de CRUD removida e precisa ser adaptado ao MVP antes de voltar a ser usado.

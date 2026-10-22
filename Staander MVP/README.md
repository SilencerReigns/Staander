# Staander — MVP 0.2 — Protótipo da aplicação

Este protótipo representa a aplicação Staander como um produto, e não apenas o fluxo de aquisição por quiz.

## Módulos incluídos

- Dashboard / visão geral
- Biblioteca centralizada
- Importação simulada de arquivos
- Organização e filtros da biblioteca
- Leitor integrado
- Progresso de leitura
- Favoritos
- Notas e destaques
- Busca global e busca na biblioteca
- Camada de conhecimento / relações entre conceitos
- Busca inteligente simulada
- Studio
- Projetos
- Organização de produtos
- Arquivo principal, bônus, capas, versões e referências
- Publish
- Fluxo de preparação de publicação
- Configurações
- Responsividade desktop/mobile
- Dados fictícios para demonstrar o produto sem backend

## Como executar

Abra `index.html` diretamente no navegador.

## O que ainda é mock

Como é um protótipo, persistência, autenticação, upload real, parsing de PDF/EPUB, sincronização entre dispositivos, busca semântica real, IA, banco de dados e publicação real estão simulados.

## Arquitetura sugerida para o MVP funcional

Frontend: React/Next.js
Backend: API + PostgreSQL
Arquivos: storage S3-compatible
Busca: PostgreSQL full-text + vetor/embeddings posteriormente
Leitor: PDF.js + EPUB.js
Autenticação: sessão/OAuth
IA: camada separada para busca inteligente e relações de conhecimento

O quiz de aquisição pode existir como uma porta de entrada externa para o Staander, mas não é o núcleo da aplicação.

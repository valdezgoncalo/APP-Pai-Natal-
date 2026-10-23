# O Mundo do Pai Natal — PWA inicial

Protótipo front-end para o projeto **Pai Natal de Barbas Verdadeiras**. Está preparado para ser colocado num repositório GitHub e publicado como site estático.

## O que já funciona

- Página inicial responsiva e navegação por secções.
- Diário/aventuras e conto demonstrativo com expansão da história.
- Mapa ilustrativo de demonstração (não é um mapa geográfico real).
- Galeria ilustrativa com janelas de detalhe.
- Clube dos Pequenos Ajudantes com tarefas guardadas localmente.
- Formulário demonstrativo de carta com confirmação no ecrã.
- Preferências de notificações guardadas no navegador:
  - Contos e aventuras: ativo
  - Visitas e eventos: inativo
  - Fotografias e vídeos: ativo
  - Novidades sobre mensagens: ativo
- Manifesto PWA, ícone SVG e Service Worker com cache básica para utilização offline.
- Botão de instalação quando o navegador suporta o fluxo de instalação.

## Importante — o que ainda não está ligado

Esta é uma **primeira versão de interface/protótipo**, não uma plataforma de produção completa. Não tem base de dados, painel de administração real, contas, envio de cartas para um servidor, mapa geográfico real, alojamento de multimédia ou envio efetivo de notificações Push. Os dados demonstrativos são guardados apenas no dispositivo através de `localStorage`.

Antes de recolher mensagens reais de crianças ou lançar ao público, integrar backend seguro (por exemplo, Supabase), autenticação e permissões, consentimentos adequados, moderação, armazenamento privado, políticas de retenção e um serviço Web Push no servidor. Não usar este formulário demonstrativo para recolher dados pessoais reais.

## Publicar no GitHub

1. Descompacta o ZIP.
2. Cria um repositório novo no GitHub.
3. Carrega `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, a pasta `assets/` e este README para a raiz do repositório.
4. Para testar rapidamente, ativa **Settings → Pages → Deploy from a branch** e escolhe a branch `main` e a pasta `/ (root)`. Em alternativa, importa o repositório na Vercel.
5. Abre o URL publicado por HTTPS. A instalação PWA e o Service Worker requerem um contexto seguro (HTTPS ou localhost).

## Desenvolvimento local

Executa um servidor HTTP local na pasta do projeto (por exemplo `python -m http.server 8000`) e abre `http://localhost:8000`.

## Estrutura

```text
mundo-pai-natal/
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── assets/
│   └── icon.svg
└── README.md
```

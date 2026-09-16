# Complexo RP — Site Multi-HTML + Backend + Tickets

Projeto pronto para rodar localmente e publicar no Render.

## Rodar localmente

```bash
npm install
npm start
```

Site: http://localhost:3000/

Painel: http://localhost:3000/admin.html

## Login do painel

O arquivo `.env` já vem configurado com:

```env
PORT=3000
ADMIN_PASSWORD=ComplexoRP2026
```

> Em produção, altere a senha no Environment do Render. Não publique o `.env` em um repositório público.

## Deploy no Render

Configuração manual:

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable: `ADMIN_PASSWORD` = sua senha

O `render.yaml` também está incluído para facilitar o deploy.

## Estrutura

- `public/index.html` — entrada do site
- `public/pages/` — páginas públicas independentes
- `public/admin.html` — dashboard do backend
- `public/admin/` — páginas administrativas por categoria
- `public/css/` — estilos públicos e administrativos
- `public/js/` — JavaScript separado por função
- `server.js` — API e servidor
- `data/database.json` — armazenamento local das solicitações

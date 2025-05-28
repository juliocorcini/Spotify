# Spotify API Service

Um serviço Node.js modular que conecta à API do Spotify com funcionalidades avançadas de recomendação e criação de playlists. Este serviço pode ser deployed no render.com.

## 🚀 Funcionalidades

- **Autenticação Spotify OAuth 2.0** com renovação automática de tokens
- **Busca avançada de artistas** com suporte a formatos especiais (B2B sets, special performances)
- **Sistema de recomendações inteligente** baseado em busca (substitui a API de Recomendações deprecated do Spotify)
- **Criação automática de playlists** com diferentes estratégias
- **Dashboard administrativo** para monitoramento de usuários e playlists
- **Retry automático** para requests com timeouts ou falhas de rede
- **Comparação inteligente de nomes** de artistas usando distância de Levenshtein

## 📁 Estrutura do Projeto

```
├── config/             # Configurações da API do Spotify
│   └── spotify.js      # Configuração do cliente Spotify com HTTPS agent
├── middleware/         # Middlewares de autenticação
│   └── auth.js         # Auth do Spotify, admin e helpers de token
├── routes/             # Rotas organizadas por funcionalidade
│   ├── auth.js         # Login, callback, refresh token
│   ├── spotify.js      # Rotas básicas da API Spotify (/me, /top-artists, /search-artist)
│   ├── artists.js      # Rotas relacionadas a artistas e suas faixas
│   ├── recommendations.js # Sistema de recomendações baseado em busca
│   ├── playlists.js    # Criação de playlists (custom, artistas, top artists)
│   └── admin.js        # Dashboard administrativo
├── services/           # Serviços de negócio
│   ├── dataService.js  # Gerenciamento de dados (users.json, playlists.json)
│   └── recommendationService.js # Sistema avançado de recomendações
├── utils/              # Utilitários
│   ├── retry.js        # Retry com backoff exponencial
│   └── artistHelpers.js # Comparação de nomes e processamento de artistas especiais
├── public/             # Arquivos estáticos
└── data/               # Arquivos de dados JSON
```

## 🛠 Setup

1. Clone este repositório
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env` com as seguintes variáveis:
   ```
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   REDIRECT_URI=https://your-app-name.onrender.com/callback
   FRONTEND_URI=https://your-app-name.onrender.com
   ADMIN_PASSWORD=your_admin_password
   PORT=8888
   ```
4. Registre sua aplicação no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/) e obtenha seu Client ID e Client Secret
5. Adicione a redirect URI nas configurações da sua aplicação Spotify

## 🔧 Desenvolvimento Local

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

## 🚀 Deploy para Render.com

1. Faça push do código para um repositório Git (GitHub, GitLab, etc.)
2. Cadastre-se no [Render](https://render.com)
3. Crie um novo Web Service e conecte seu repositório
4. Configure o serviço:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Adicione todas as variáveis de ambiente do arquivo `.env`
5. Faça o deploy do serviço

## 📚 API Endpoints

### 🔐 Autenticação
- `GET /login` - Iniciar fluxo OAuth do Spotify
- `GET /callback` - Callback após autorização do Spotify
- `POST /refresh` - Renovar access token

### 👤 Usuário
- `GET /me` - Obter informações do perfil do usuário

### 🎵 Spotify Básico
- `GET /top-artists` - Obter artistas mais ouvidos do usuário
- `GET /search-artist` - Buscar artistas por nome

### 🎤 Artistas Avançado
- `GET /artist-top-tracks/:artistId` - Faixas mais populares de um artista
- `GET /artist-tracks/:artistId` - Mais faixas de um artista (álbuns + singles)
- `GET /search-artist-tracks` - Buscar faixas específicas de um artista
- `GET /search-artist-special` - Busca com suporte a formatos especiais (B2B, special sets)
- `GET /personalized-artist-tracks/:artistId` - Faixas personalizadas com recomendações
- `GET /artist-special-tracks/:artistId` - Faixas para artistas com formatos especiais

### 💡 Recomendações
- `GET /search-recommendations` - Recomendações baseadas em busca inteligente
- `GET /recommendations` - Endpoint de compatibilidade (usa busca internamente)

### 📝 Playlists
- `POST /create-custom-tracks-playlist` - Criar playlist com URIs específicas
- `POST /create-custom-playlist` - Criar playlist com artistas customizados
- `POST /create-artist-playlist` - Criar playlist com top artists do usuário

### 👑 Admin (requer senha)
- `GET /admin` - Dashboard administrativo
- `GET /admin/users` - Listar usuários registrados
- `GET /admin/playlists` - Listar playlists criadas
- `GET /admin/playlist-details/:playlistId` - Detalhes de uma playlist específica

## 🎯 Características Especiais

### Sistema de Recomendações Inteligente
O projeto implementa um sistema próprio de recomendações que substitui a API deprecated do Spotify:
- Análise de gêneros e características musicais
- Balanceamento entre diferentes artistas
- Busca semântica baseada em contexto
- Filtragem de duplicatas e seeds

### Suporte a Formatos Especiais de Artistas
- **B2B Sets**: Detecta formatos como "Artist A B2B Artist B" e busca colaborações
- **Special Sets**: Suporta formatos como "Artist (Live Set)" ou "Artist (DJ Set)"
- Comparação inteligente de nomes usando algoritmo de Levenshtein

### Retry Automático e Robustez
- Retry automático com backoff exponencial para falhas de rede
- Configuração otimizada de timeouts e conexões HTTPS
- Tratamento robusto de erros da API do Spotify

## 🔒 Segurança

- Middleware de autenticação para todas as rotas protegidas
- Verificação de tokens do Spotify
- Dashboard admin protegido por senha
- Validação de parâmetros de entrada

## 📊 Monitoramento

O sistema registra automaticamente:
- Usuários que fazem login
- Playlists criadas com metadados
- Artistas solicitados vs encontrados
- Timestamps de todas as ações

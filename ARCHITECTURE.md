# Arquitetura do Projeto - Spotify API Service

## 📋 Visão Geral

Este documento descreve a arquitetura modular do Spotify API Service após a refatoração. O projeto foi transformado de uma estrutura monolítica (`index.js` e `app.js`) para uma arquitetura modular organizada em camadas.

## 🏗 Estrutura de Diretórios

```
├── config/                 # Configurações centralizadas
├── middleware/             # Middlewares de autenticação e validação
├── routes/                 # Definições de rotas organizadas por domínio
├── services/               # Lógica de negócio e serviços externos
├── utils/                  # Utilitários e helpers
├── public/                 # Frontend (HTML, CSS, JS)
├── data/                   # Armazenamento de dados JSON
└── index.js               # Ponto de entrada e configuração do servidor
```

## 🔧 Componentes Principais

### 1. Configuração (`config/`)

#### `spotify.js`
- Configuração centralizada da API do Spotify
- Configuração de agente HTTPS com timeouts otimizados
- Inicialização do SpotifyWebApi com credenciais

### 2. Middleware (`middleware/`)

#### `auth.js`
- **`setTokenFromRequest()`**: Extrai e configura tokens do header Authorization
- **`checkAdminAuth()`**: Middleware para autenticação administrativa
- **`requireSpotifyAuth()`**: Middleware para verificar autenticação do Spotify

### 3. Utilitários (`utils/`)

#### `retry.js`
- **`withRetry()`**: Implementa retry automático com backoff exponencial
- Trata erros de rede específicos (ETIMEDOUT, ENETUNREACH, etc.)

#### `artistHelpers.js`
- **`compareArtistNames()`**: Comparação inteligente de nomes de artistas
- **`levenshteinDistance()`**: Cálculo de similaridade entre strings
- **`processArtistName()`**: Processamento de formatos especiais (B2B, special sets)

### 4. Serviços (`services/`)

#### `dataService.js`
- **`registerUser()`**: Registro e atualização de dados de usuários
- **`registerPlaylist()`**: Registro de playlists criadas
- **`getUsers()`, `getPlaylists()`**: Recuperação de dados
- Gerenciamento de arquivos JSON para persistência

#### `recommendationService.js`
- **`getSearchBasedRecommendations()`**: Sistema avançado de recomendações
- Substitui a API deprecated do Spotify com busca inteligente
- Análise de gêneros, características musicais e balanceamento de artistas

### 5. Rotas (`routes/`)

#### `auth.js` - Autenticação OAuth
- `GET /login`: Inicia fluxo OAuth
- `GET /callback`: Callback de autorização
- `POST /refresh`: Renovação de tokens

#### `spotify.js` - API Básica
- `GET /me`: Perfil do usuário
- `GET /top-artists`: Artistas mais ouvidos
- `GET /search-artist`: Busca de artistas

#### `artists.js` - Gestão de Artistas
- `GET /artist-top-tracks/:artistId`: Faixas populares
- `GET /artist-tracks/:artistId`: Faixas de álbuns
- `GET /search-artist-tracks`: Busca de faixas específicas
- `GET /search-artist-special`: Busca com formatos especiais

#### `recommendations.js` - Sistema de Recomendações
- `GET /search-recommendations`: Recomendações baseadas em busca
- `GET /recommendations`: Endpoint de compatibilidade

#### `playlists.js` - Criação de Playlists
- `POST /create-custom-tracks-playlist`: Playlist com URIs específicas
- `POST /create-custom-playlist`: Playlist com artistas customizados
- `POST /create-artist-playlist`: Playlist com top artists

#### `admin.js` - Dashboard Administrativo
- `GET /admin`: Dashboard principal
- `GET /admin/users`: Lista de usuários
- `GET /admin/playlists`: Lista de playlists

## 🔄 Fluxo de Dados

### 1. Autenticação
```
User → /login → Spotify OAuth → /callback → Token Storage → Profile Display
```

### 2. Criação de Playlist
```
User Input → Artist Processing → Spotify API → Track Collection → Playlist Creation → Data Registration
```

### 3. Sistema de Recomendações
```
Seed Data → Artist Analysis → Genre Extraction → Search Queries → Result Balancing → Filtered Recommendations
```

## 🛡 Tratamento de Erros

### Retry Automático
- Implementado em `utils/retry.js`
- Backoff exponencial para requests falhados
- Detecção de erros de rede específicos

### Validação de Dados
- Validação de parâmetros em todas as rotas
- Tratamento de casos de artistas não encontrados
- Fallbacks para APIs indisponíveis

### Autenticação Robusta
- Renovação automática de tokens expirados
- Tratamento de tokens inválidos
- Redirecionamento seguro para login

## 🎯 Funcionalidades Especiais

### Processamento de Artistas Especiais
- **B2B Sets**: "Artist A B2B Artist B" → Busca colaborações
- **Special Sets**: "Artist (Live Set)" → Busca performances específicas
- Múltiplos termos de busca para cada formato

### Sistema de Recomendações Inteligente
- Análise de características musicais (danceability, energy, etc.)
- Balanceamento entre diferentes artistas
- Filtragem de duplicatas e seeds
- Consultas de busca contextuais

### Persistência de Dados
- Registro automático de usuários e ações
- Rastreamento de playlists criadas
- Metadados para análise administrativa

## 🔧 Manutenção e Extensibilidade

### Adicionando Novas Rotas
1. Criar arquivo em `routes/`
2. Implementar middlewares necessários
3. Adicionar ao `index.js`

### Adicionando Novos Serviços
1. Criar arquivo em `services/`
2. Implementar interface consistente
3. Adicionar tratamento de erros

### Configurações
- Centralizadas em `config/`
- Uso de variáveis de ambiente
- Configurações específicas por módulo

## 📊 Monitoramento

### Logs Estruturados
- Console logs para debugging
- Tratamento de erros específicos
- Informações de retry e fallback

### Dados de Uso
- Registro de usuários únicos
- Contadores de playlists por tipo
- Metadados de artistas solicitados vs encontrados

## 🚀 Performance

### Otimizações Implementadas
- Configuração de agente HTTPS com keep-alive
- Timeouts configuráveis
- Retry inteligente com backoff
- Filtragem eficiente de duplicatas
- Paginação em endpoints que retornam muitos resultados

### Limitações da API Spotify
- Máximo 100 faixas por request de playlist
- Rate limiting automático
- Processamento em chunks para grandes volumes 
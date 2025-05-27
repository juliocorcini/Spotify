require('dotenv').config();
const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configurar agente HTTPS com timeout maior
const httpsAgent = new https.Agent({
  keepAlive: true,
  timeout: 60000, // 60 segundos de timeout em vez do padrão
  maxSockets: 10  // Limitar o número de conexões simultâneas
});

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
  // Usando o agente com timeout maior
  requestOptions: {
    agent: httpsAgent
  }
});

// Caminhos para arquivos de dados
const USERS_DATA_FILE = path.join(__dirname, 'data', 'users.json');
const PLAYLISTS_DATA_FILE = path.join(__dirname, 'data', 'playlists.json');

// Função para carregar dados do arquivo
function loadData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error(`Erro ao carregar dados de ${filePath}:`, error);
    return [];
  }
}

// Função para salvar dados no arquivo
function saveData(filePath, data) {
  try {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Erro ao salvar dados em ${filePath}:`, error);
  }
}

// Carregar dados existentes
let users = loadData(USERS_DATA_FILE);
let playlists = loadData(PLAYLISTS_DATA_FILE);

// Função para registrar usuário
function registerUser(userData) {
  const existingUserIndex = users.findIndex(u => u.id === userData.id);
  
  if (existingUserIndex >= 0) {
    // Atualizar usuário existente
    users[existingUserIndex] = {
      ...users[existingUserIndex],
      ...userData,
      lastLogin: new Date().toISOString()
    };
  } else {
    // Adicionar novo usuário
    users.push({
      ...userData,
      firstLogin: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    });
  }
  
  saveData(USERS_DATA_FILE, users);
}

// Função para registrar playlist
function registerPlaylist(playlistData, userId, extraData = {}) {
  playlists.push({
    ...playlistData,
    userId,
    createdAt: new Date().toISOString(),
    ...extraData
  });
  
  saveData(PLAYLISTS_DATA_FILE, playlists);
}

// Verificar senha de admin (muito simples, só para exemplo)
function checkAdminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const { password } = req.query;
  
  if (password === adminPassword) {
    next();
  } else {
    res.status(401).send('Acesso não autorizado');
  }
}

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login route
app.get('/login', (req, res) => {
  const scopes = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-modify-private',
    'playlist-modify-public',
    'user-top-read'
  ];

  const authUrl = spotifyApi.createAuthorizeURL(scopes);
  res.redirect(authUrl);
});

// Callback route after Spotify login
app.get('/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    
    const { access_token, refresh_token, expires_in } = data.body;
    
    // Definir tokens no objeto da API
    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);
    
    // Obter dados do usuário e salvar
    try {
      const userResult = await spotifyApi.getMe();
      const userData = userResult.body;
      
      registerUser({
        id: userData.id,
        displayName: userData.display_name,
        email: userData.email,
        country: userData.country,
        profileUrl: userData.external_urls.spotify,
        imageUrl: userData.images && userData.images.length > 0 ? userData.images[0].url : null
      });
    } catch (error) {
      console.error('Erro ao obter dados do usuário:', error);
    }
    
    // Redirecionar para o frontend com os tokens como parâmetros de URL
    res.redirect(`/?access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`);
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.redirect('/#/error/invalid token');
  }
});

// Função utilitária para tentativas com retry
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Verificar se é um erro de rede (timeout, conexão recusada, etc.)
      const isNetworkError = error.code === 'ETIMEDOUT' || 
                            error.code === 'ENETUNREACH' || 
                            error.code === 'ECONNREFUSED' ||
                            error.code === 'ENOTFOUND';
      
      // Se não for erro de rede ou for a última tentativa, propagar o erro
      if (!isNetworkError || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Registrar a tentativa
      console.log(`Tentativa ${attempt + 1} falhou. Tentando novamente em ${delay}ms...`);
      lastError = error;
      
      // Esperar antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Aumentar o delay para a próxima tentativa (backoff exponencial)
      delay *= 2;
    }
  }
  
  throw lastError;
}

// Helper function to set token from request
const setTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  let token = spotifyApi.getAccessToken();
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
    spotifyApi.setAccessToken(token);
  }
  
  if (!token) {
    return false;
  }
  
  return true;
};

// Route to get user profile
app.get('/me', async (req, res) => {
  try {
    // Obter token do cabeçalho Authorization
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const result = await spotifyApi.getMe();
    res.status(200).json(result.body);
  } catch (err) {
    console.error('Error getting user profile:', err);
    res.status(400).json({ error: 'Error getting user profile' });
  }
});

// Get user's top artists
app.get('/top-artists', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const result = await spotifyApi.getMyTopArtists({ 
      time_range: 'medium_term',  // últimos 6 meses
      limit: 20
    });
    
    res.status(200).json(result.body);
  } catch (err) {
    console.error('Error getting top artists:', err);
    res.status(400).json({ error: 'Error getting top artists' });
  }
});

// Search for an artist
app.get('/search-artist', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const result = await spotifyApi.searchArtists(query, { limit: 5 });
    res.status(200).json(result.body);
  } catch (err) {
    console.error('Error searching artists:', err);
    res.status(400).json({ error: 'Error searching artists' });
  }
});

// Get artist's top tracks
app.get('/artist-top-tracks/:artistId', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { artistId } = req.params;
    const { limit } = req.query;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }
    
    // Obtém as faixas mais populares (Spotify só retorna 10 por padrão)
    const result = await spotifyApi.getArtistTopTracks(artistId, 'BR');
    
    // Limita ao número solicitado (se fornecido)
    const tracks = limit ? result.body.tracks.slice(0, parseInt(limit, 10)) : result.body.tracks;
    
    res.status(200).json({ tracks });
  } catch (err) {
    console.error('Error getting artist top tracks:', err);
    res.status(400).json({ error: 'Error getting artist top tracks' });
  }
});

// Nova rota para obter mais faixas de um artista (não apenas as mais populares)
app.get('/artist-tracks/:artistId', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { artistId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }
    
    // Primeiro, obter álbuns do artista
    const albumsResult = await withRetry(() => spotifyApi.getArtistAlbums(artistId, {
      include_groups: 'album,single',
      limit: 10,
      offset: 0
    }));
    
    // Lista para armazenar todas as faixas
    let allTracks = [];
    
    // Para cada álbum, obter faixas
    for (const album of albumsResult.body.items) {
      try {
        const tracksResult = await withRetry(() => spotifyApi.getAlbumTracks(album.id, { limit: 50 }));
        
        // Filtrar faixas onde o artista requisitado é um dos artistas
        const filteredTracks = tracksResult.body.items.filter(track => 
          track.artists.some(artist => artist.id === artistId)
        );
        
        // Adicionar detalhes do álbum para cada faixa
        const tracksWithAlbum = filteredTracks.map(track => ({
          ...track,
          album: {
            id: album.id,
            name: album.name,
            images: album.images
          }
        }));
        
        allTracks = [...allTracks, ...tracksWithAlbum];
      } catch (error) {
        console.error(`Error getting tracks for album ${album.id}:`, error);
      }
    }
    
    // Remover duplicatas (mesma música em vários álbuns)
    const uniqueTracks = [];
    const trackIds = new Set();
    
    for (const track of allTracks) {
      if (!trackIds.has(track.id)) {
        trackIds.add(track.id);
        uniqueTracks.push(track);
      }
    }
    
    // Aplicar offset e limit
    const paginatedTracks = uniqueTracks.slice(
      parseInt(offset, 10),
      parseInt(offset, 10) + parseInt(limit, 10)
    );
    
    res.status(200).json({ tracks: paginatedTracks });
  } catch (err) {
    console.error('Error getting artist tracks:', err);
    res.status(400).json({ error: 'Error getting artist tracks' });
  }
});

// Nova rota para buscar faixas personalizadas de um artista para o usuário
app.get('/personalized-artist-tracks/:artistId', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { artistId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }
    
    // Obter as 50 principais faixas do artista primeiro
    const topTracksResult = await withRetry(() => spotifyApi.getArtistTopTracks(artistId, 'BR'));
    
    // Obter álbuns mais recentes
    const albumsResult = await withRetry(() => spotifyApi.getArtistAlbums(artistId, {
      include_groups: 'album,single',
      limit: 5,
      offset: 0
    }));
    
    // Lista para armazenar todas as faixas
    let allTracks = [...topTracksResult.body.tracks];
    
    // Adicionar algumas faixas dos álbuns mais recentes (não todas, para evitar álbuns completos)
    for (const album of albumsResult.body.items) {
      try {
        const tracksResult = await withRetry(() => spotifyApi.getAlbumTracks(album.id, { limit: 3 }));
        
        // Filtrar faixas onde o artista requisitado é um dos artistas
        const filteredTracks = tracksResult.body.items.filter(track => 
          track.artists.some(artist => artist.id === artistId)
        );
        
        // Adicionar detalhes do álbum para cada faixa
        const tracksWithAlbum = filteredTracks.map(track => ({
          ...track,
          album: {
            id: album.id,
            name: album.name,
            images: album.images
          }
        }));
        
        allTracks = [...allTracks, ...tracksWithAlbum];
      } catch (error) {
        console.error(`Error getting tracks for album ${album.id}:`, error);
      }
    }
    
    // Tentar obter recomendações baseadas nas faixas mais populares do artista
    try {
      // Usar até 3 faixas populares como seed
      const seedTracks = topTracksResult.body.tracks.slice(0, 3).map(track => track.id);
      
      if (seedTracks.length > 0) {
        const recsOptions = {
          seed_artists: [artistId],
          seed_tracks: seedTracks.slice(0, 2), // Limitar a 2 seeds de faixas
          limit: 10
        };
        
        // Verificar se o total de seeds não excede 5
        const totalSeeds = recsOptions.seed_artists.length + recsOptions.seed_tracks.length;
        if (totalSeeds <= 5) {
          try {
            const recommendationsResult = await spotifyApi.getRecommendations(recsOptions);
            
            // Filtrar apenas faixas do artista solicitado
            const artistRecommendations = recommendationsResult.body.tracks.filter(track => 
              track.artists.some(artist => artist.id === artistId)
            );
            
            // Adicionar as recomendações filtradas
            allTracks = [...allTracks, ...artistRecommendations];
          } catch (recError) {
            console.error('Error getting recommendations for artist tracks:', recError);
            // Não interromper a execução, apenas registrar o erro
          }
        }
      }
    } catch (error) {
      console.error('Error preparing recommendations for artist tracks:', error);
      // Não interromper a execução, apenas registrar o erro
    }
    
    // Remover duplicatas (mesma música em vários resultados)
    const uniqueTracks = [];
    const trackIds = new Set();
    
    for (const track of allTracks) {
      if (!trackIds.has(track.id)) {
        trackIds.add(track.id);
        uniqueTracks.push(track);
      }
    }
    
    // Aplicar offset e limit
    const paginatedTracks = uniqueTracks.slice(
      parseInt(offset, 10),
      parseInt(offset, 10) + parseInt(limit, 10)
    );
    
    res.status(200).json({ tracks: paginatedTracks });
  } catch (err) {
    console.error('Error getting personalized artist tracks:', err);
    res.status(400).json({ error: 'Error getting personalized artist tracks' });
  }
});

// Nova rota para buscar faixas de um artista por nome
app.get('/search-artist-tracks', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { artistId, query } = req.query;
    
    if (!artistId || !query) {
      return res.status(400).json({ error: 'Artist ID and search query are required' });
    }
    
    // Buscar músicas usando a busca geral do Spotify
    const searchResult = await withRetry(() => spotifyApi.search(query, ['track'], { limit: 50 }));
    
    // Filtrar apenas faixas do artista solicitado
    const artistTracks = searchResult.body.tracks.items.filter(track => 
      track.artists.some(artist => artist.id === artistId)
    );
    
    res.status(200).json({ tracks: artistTracks });
  } catch (err) {
    console.error('Error searching artist tracks:', err);
    res.status(400).json({ error: 'Error searching artist tracks' });
  }
});

// Nova rota para obter recomendações do Spotify
app.get('/recommendations', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { seed_tracks, seed_artists, limit = 10 } = req.query;
    
    if ((!seed_tracks || seed_tracks.split(',').length === 0) && 
        (!seed_artists || seed_artists.split(',').length === 0)) {
      return res.status(400).json({ error: 'At least one seed track or artist is required' });
    }
    
    // Construir opções para as recomendações
    const options = {
      limit: parseInt(limit, 10),
      min_popularity: 20  // Evitar músicas muito obscuras
    };
    
    if (seed_tracks) {
      const tracks = seed_tracks.split(',');
      if (tracks.length > 0) {
        options.seed_tracks = tracks.slice(0, Math.min(tracks.length, 5));
      }
    }
    
    if (seed_artists) {
      const artists = seed_artists.split(',');
      if (artists.length > 0) {
        options.seed_artists = artists.slice(0, Math.min(artists.length, 5));
      }
    }
    
    // Garantir que não temos mais do que 5 seeds no total (limitação da API)
    const totalSeeds = (options.seed_tracks?.length || 0) + (options.seed_artists?.length || 0);
    if (totalSeeds > 5) {
      // Remover excesso de seed_tracks se necessário
      if (options.seed_tracks && options.seed_tracks.length > 0) {
        const excessSeeds = totalSeeds - 5;
        options.seed_tracks = options.seed_tracks.slice(0, Math.max(0, options.seed_tracks.length - excessSeeds));
      }
    }
    
    // Verificar se o total é pelo menos 1 e não mais que 5
    const finalTotalSeeds = (options.seed_artists?.length || 0) + (options.seed_tracks?.length || 0);
    if (finalTotalSeeds === 0) {
      return res.status(400).json({ error: 'At least one valid seed is required' });
    }
    if (finalTotalSeeds > 5) {
      return res.status(400).json({ error: 'Maximum of 5 seeds (tracks + artists) allowed' });
    }
    
    // Logar as opções para debug
    console.log('Opções de recomendação:', JSON.stringify(options, null, 2));
    
    // Obter recomendações - com tratamento de erro aprimorado
    try {
      const recommendations = await spotifyApi.getRecommendations(options);
      res.status(200).json(recommendations.body);
    } catch (apiError) {
      console.error('Error in Spotify API call:', apiError);
      
      // Extrair informações úteis do erro
      const errorDetails = {
        status: apiError.statusCode,
        message: apiError.message || 'Unknown error',
        body: apiError.body || {}
      };
      
      // Tratamento específico para erros comuns
      if (apiError.statusCode === 404) {
        // Para 404, pode ser um problema com os IDs dos seeds
        res.status(400).json({
          error: 'One or more seed IDs are invalid or not found',
          details: errorDetails,
          recommendedAction: 'Check if all seed_tracks and seed_artists IDs exist and are correctly formatted'
        });
      } else if (apiError.statusCode === 401 || apiError.statusCode === 403) {
        // Problemas de autenticação/autorização
        res.status(apiError.statusCode).json({
          error: 'Authentication or authorization error',
          details: errorDetails,
          recommendedAction: 'Check authentication token or permissions'
        });
      } else {
        // Outros erros
        res.status(apiError.statusCode || 500).json({
          error: 'Error getting recommendations from Spotify API',
          details: errorDetails
        });
      }
    }
  } catch (err) {
    console.error('Error in recommendations endpoint:', err);
    res.status(500).json({ 
      error: 'Internal server error processing recommendations request',
      message: err.message
    });
  }
});

// Função para comparar nomes de artistas
function compareArtistNames(requested, found) {
  // Converter para minúsculas e remover espaços extras
  const requestedClean = requested.toLowerCase().trim();
  const foundClean = found.toLowerCase().trim();
  
  // 1. Verificar correspondência exata
  if (requestedClean === foundClean) {
    return true;
  }
  
  // 2. Verificar se o nome encontrado contém o nome solicitado completamente
  if (foundClean.includes(requestedClean) || requestedClean.includes(foundClean)) {
    return true;
  }
  
  // 3. Calcular a similaridade usando distância de Levenshtein
  const maxLength = Math.max(requestedClean.length, foundClean.length);
  if (maxLength === 0) return true; // Ambos vazios
  
  const distance = levenshteinDistance(requestedClean, foundClean);
  const similarity = (maxLength - distance) / maxLength;
  
  // Exigir pelo menos 80% de similaridade
  return similarity >= 0.8;
}

// Função para calcular a distância de Levenshtein (similaridade entre strings)
function levenshteinDistance(a, b) {
  const matrix = [];
  
  // Inicializar a matriz
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  // Preencher a matriz
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substituição
          matrix[i][j - 1] + 1,     // inserção
          matrix[i - 1][j] + 1      // exclusão
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Nova rota para criar playlist a partir de URIs de faixas específicas
app.post('/create-custom-tracks-playlist', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { trackUris, playlistName } = req.body;
    
    if (!trackUris || !Array.isArray(trackUris) || trackUris.length === 0) {
      return res.status(400).json({ error: 'Invalid track URIs list' });
    }
    
    // 1. Obter o ID do usuário
    const userInfo = await withRetry(() => spotifyApi.getMe());
    const userId = userInfo.body.id;
    
    // 2. Criar a playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlistTitle = playlistName || `Playlist Personalizada (${dateStr})`;
    
    const playlist = await withRetry(() => spotifyApi.createPlaylist(userId, {
      name: playlistTitle,
      description: `Playlist com músicas selecionadas manualmente. Criada em ${dateStr}`,
      public: false
    }));
    
    const playlistId = playlist.body.id;
    
    // 3. Adicionar faixas à playlist (limite de 100 por vez)
    for (let i = 0; i < trackUris.length; i += 100) {
      const chunk = trackUris.slice(i, i + 100);
      await withRetry(() => spotifyApi.addTracksToPlaylist(playlistId, chunk));
    }
    
    // 4. Obter informações sobre as faixas adicionadas para exibir na resposta
    const addedTracksResponse = await withRetry(() => spotifyApi.getPlaylistTracks(playlistId));
    
    // Registrar a playlist criada
    registerPlaylist({
      id: playlist.body.id,
      name: playlist.body.name,
      description: playlist.body.description,
      trackCount: trackUris.length,
      url: playlist.body.external_urls.spotify,
      type: 'custom_tracks'
    }, userId);
    
    res.status(200).json({
      success: true,
      playlist: playlist.body,
      addedTracks: addedTracksResponse.body.items
    });
  } catch (err) {
    console.error('Error creating playlist with custom tracks:', err);
    res.status(400).json({ 
      error: 'Error creating playlist with custom tracks',
      details: err.message
    });
  }
});

// Create playlist with custom artists
app.post('/create-custom-playlist', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { artists, tracksPerArtist, playlistName } = req.body;
    
    if (!artists || !Array.isArray(artists) || artists.length === 0) {
      return res.status(400).json({ error: 'Invalid artists list' });
    }
    
    // 1. Obter o ID do usuário
    const userInfo = await withRetry(() => spotifyApi.getMe());
    const userId = userInfo.body.id;
    
    // 2. Criar a playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlistTitle = playlistName || `Playlist Personalizada (${dateStr})`;
    
    const playlist = await withRetry(() => spotifyApi.createPlaylist(userId, {
      name: playlistTitle,
      description: `Playlist com músicas selecionadas manualmente. Criada em ${dateStr}`,
      public: false
    }));
    
    const playlistId = playlist.body.id;
    
    // 3. Adicionar faixas à playlist (limite de 100 por vez)
    for (let i = 0; i < trackUris.length; i += 100) {
      const chunk = trackUris.slice(i, i + 100);
      await withRetry(() => spotifyApi.addTracksToPlaylist(playlistId, chunk));
    }
    
    // 4. Obter informações sobre as faixas adicionadas para exibir na resposta
    const addedTracksResponse = await withRetry(() => spotifyApi.getPlaylistTracks(playlistId));
    
    // Registrar a playlist criada
    registerPlaylist({
      id: playlist.body.id,
      name: playlist.body.name,
      description: playlist.body.description,
      trackCount: trackUris.length,
      url: playlist.body.external_urls.spotify,
      type: 'custom_tracks'
    }, userId);
    
    res.status(200).json({
      success: true,
      playlist: playlist.body,
      addedTracks: addedTracksResponse.body.items
    });
  } catch (err) {
    console.error('Error creating playlist with custom tracks:', err);
    res.status(400).json({ 
      error: 'Error creating playlist with custom tracks',
      details: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
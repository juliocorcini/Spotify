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
    // Update existing user
    users[existingUserIndex] = {
      ...users[existingUserIndex],
      ...userData,
      lastLogin: new Date().toISOString()
    };
  } else {
    // Add new user
    users.push({
      ...userData,
      firstLogin: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    });
  }
  
  saveData(USERS_DATA_FILE, users);
}

// Função para excluir dados de usuário
function deleteUserData(userId) {
  // Remover o usuário da lista de usuários
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex >= 0) {
    users.splice(userIndex, 1);
    saveData(USERS_DATA_FILE, users);
  }
  
  // Remover as playlists associadas ao usuário
  const userPlaylists = playlists.filter(p => p.userId === userId);
  if (userPlaylists.length > 0) {
    playlists = playlists.filter(p => p.userId !== userId);
    saveData(PLAYLISTS_DATA_FILE, playlists);
  }
  
  return {
    success: true,
    message: 'Dados do usuário excluídos com sucesso'
  };
}

// Função para limitar dados armazenados sobre playlists
function limitPlaylistData(playlistData) {
  // Remover dados desnecessários para conformidade com a política do Spotify
  const limitedData = { ...playlistData };
  
  // Limitar histórico de playlists por usuário (manter apenas as 10 mais recentes)
  const userPlaylists = playlists.filter(p => p.userId === playlistData.userId);
  if (userPlaylists.length >= 10) {
    // Ordenar playlists por data de criação (mais antigas primeiro)
    const sortedPlaylists = [...userPlaylists].sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );
    
    // Remover as playlists mais antigas que excedem o limite
    const playlistsToRemove = sortedPlaylists.slice(0, userPlaylists.length - 9);
    playlistsToRemove.forEach(oldPlaylist => {
      const index = playlists.findIndex(p => p.id === oldPlaylist.id);
      if (index >= 0) {
        playlists.splice(index, 1);
      }
    });
    
    // Salvar a lista atualizada
    saveData(PLAYLISTS_DATA_FILE, playlists);
  }
  
  return limitedData;
}

// Função para registrar playlist
function registerPlaylist(playlistData, userId, extraData = {}) {
  const limitedPlaylistData = limitPlaylistData({
    ...playlistData,
    userId,
    createdAt: new Date().toISOString(),
    ...extraData
  });
  
  playlists.push(limitedPlaylistData);
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
    
    // 1. Get user ID
    const userInfo = await withRetry(() => spotifyApi.getMe());
    const userId = userInfo.body.id;
    
    // 2. Create playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlistTitle = playlistName || `Custom Playlist (${dateStr})`;
    
    const playlist = await withRetry(() => spotifyApi.createPlaylist(userId, {
      name: playlistTitle,
      description: `Playlist with tracks from selected artists. Created on ${dateStr}`,
      public: false
    }));
    
    const playlistId = playlist.body.id;
    
    // 3. Processar cada artista
    let allArtistsData = [];
    let allTracks = [];
    let foundArtists = []; // Para registrar os artistas encontrados
    
    for (const artistName of artists) {
      try {
        // Buscar o artista com retry - aumentando o limite para 5 para ter mais opções
        const searchResult = await withRetry(() => spotifyApi.searchArtists(artistName, { limit: 5 }));
        
        if (searchResult.body.artists.items.length === 0) {
          // Artista não encontrado
          allArtistsData.push({
            name: artistName,
            notFound: true
          });
          foundArtists.push({
            requestedName: artistName,
            notFound: true
          });
          continue;
        }
        
        // Procurar por um artista com nome correspondente entre os resultados
        let artist = null;
        for (const candidate of searchResult.body.artists.items) {
          if (compareArtistNames(artistName, candidate.name)) {
            artist = candidate;
            break;
          }
        }
        
        // Se não encontrou uma correspondência, registrar como não encontrado
        if (!artist) {
          allArtistsData.push({
            name: artistName,
            notFound: true
          });
          foundArtists.push({
            requestedName: artistName,
            notFound: true
          });
          continue;
        }
        
        // Obter faixas mais populares com retry
        const tracksResult = await withRetry(() => spotifyApi.getArtistTopTracks(artist.id, 'BR'));
        const limit = parseInt(tracksPerArtist, 10) || 5;
        const topTracks = tracksResult.body.tracks.slice(0, limit);
        
        // Adicionar à lista de faixas para a playlist
        const trackUris = topTracks.map(track => track.uri);
        allTracks = [...allTracks, ...trackUris];
        
        // Salvar dados do artista para exibição
        allArtistsData.push({
          id: artist.id,
          name: artist.name,
          image: artist.images.length > 0 ? artist.images[0].url : null,
          tracks: topTracks.map(track => ({
            id: track.id,
            name: track.name,
            uri: track.uri,
            duration_ms: track.duration_ms,
            album: {
              name: track.album.name,
              image: track.album.images.length > 0 ? track.album.images[0].url : null
            }
          }))
        });
        
        // Registrar o artista encontrado
        foundArtists.push({
          requestedName: artistName,
          id: artist.id,
          name: artist.name,
          exactMatch: artist.name.toLowerCase().trim() === artistName.toLowerCase().trim()
        });
      } catch (error) {
        console.error(`Error processing artist "${artistName}":`, error);
        allArtistsData.push({
          name: artistName,
          error: true,
          errorMessage: error.message || "Erro desconhecido"
        });
        foundArtists.push({
          requestedName: artistName,
          error: true,
          errorMessage: error.message || "Erro desconhecido"
        });
      }
    }
    
    // 4. Adicionar faixas à playlist (limite de 100 por vez)
    if (allTracks.length > 0) {
      // Spotify só permite adicionar 100 faixas por vez
      for (let i = 0; i < allTracks.length; i += 100) {
        const chunk = allTracks.slice(i, i + 100);
        await withRetry(() => spotifyApi.addTracksToPlaylist(playlistId, chunk));
      }
    }
    
    // Registrar a playlist criada
    registerPlaylist({
      id: playlist.body.id,
      name: playlist.body.name,
      description: playlist.body.description,
      trackCount: allTracks.length,
      url: playlist.body.external_urls.spotify,
      type: 'custom',
      artistsCount: artists.length
    }, userId, {
      requestedArtists: artists,
      foundArtists: foundArtists
    });
    
    res.status(200).json({
      success: true,
      playlist: playlist.body,
      artists: allArtistsData
    });
  } catch (err) {
    console.error('Error creating custom playlist:', err);
    res.status(400).json({ 
      error: 'Error creating custom playlist',
      details: err.message
    });
  }
});

// Create playlist with top artists' tracks
app.post('/create-artist-playlist', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // 1. Get user ID
    const userInfo = await withRetry(() => spotifyApi.getMe());
    const userId = userInfo.body.id;
    
    // 2. Get top artists
    const topArtists = await withRetry(() => spotifyApi.getMyTopArtists({ 
      time_range: 'medium_term',
      limit: 10
    }));
    
    // 3. Create playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlist = await withRetry(() => spotifyApi.createPlaylist(userId, {
      name: `My Favorite Artists (${dateStr})`,
      description: `Automatic playlist with tracks from my favorite artists. Created on ${dateStr}`,
      public: false
    }));
    
    const playlistId = playlist.body.id;
    
    // 4. Para cada artista, obter suas músicas mais populares
    let tracks = [];
    let allArtistsData = [];
    let topArtistNames = [];
    let foundArtists = [];
    
    for (const artist of topArtists.body.items) {
      try {
        topArtistNames.push(artist.name);
        
        const artistTracks = await withRetry(() => spotifyApi.getArtistTopTracks(artist.id, 'BR'));
        
        // Adicionar até 5 músicas mais populares de cada artista
        const topTracks = artistTracks.body.tracks.slice(0, 5);
        const trackUris = topTracks.map(track => track.uri);
        tracks = [...tracks, ...trackUris];
        
        // Salvar dados do artista para exibição
        allArtistsData.push({
          id: artist.id,
          name: artist.name,
          image: artist.images.length > 0 ? artist.images[0].url : null,
          tracks: topTracks.map(track => ({
            id: track.id,
            name: track.name,
            uri: track.uri,
            duration_ms: track.duration_ms,
            album: {
              name: track.album.name,
              image: track.album.images.length > 0 ? track.album.images[0].url : null
            }
          }))
        });
        
        // Registrar o artista encontrado
        foundArtists.push({
          requestedName: artist.name, // Neste caso, o artista solicitado é o mesmo que o encontrado
          id: artist.id,
          name: artist.name
        });
      } catch (error) {
        console.error(`Error processing top artist ${artist.name}:`, error);
        allArtistsData.push({
          name: artist.name,
          error: true,
          errorMessage: error.message || "Erro desconhecido"
        });
        foundArtists.push({
          requestedName: artist.name,
          error: true,
          errorMessage: error.message || "Erro desconhecido"
        });
      }
    }
    
    // 5. Adicionar músicas à playlist (limite de 100 por vez)
    if (tracks.length > 0) {
      // Spotify só permite adicionar 100 faixas por vez
      for (let i = 0; i < tracks.length; i += 100) {
        const chunk = tracks.slice(i, i + 100);
        await withRetry(() => spotifyApi.addTracksToPlaylist(playlistId, chunk));
      }
    }
    
    // Registrar a playlist criada
    registerPlaylist({
      id: playlist.body.id,
      name: playlist.body.name,
      description: playlist.body.description,
      trackCount: tracks.length,
      url: playlist.body.external_urls.spotify,
      type: 'top_artists',
      artistsCount: allArtistsData.length
    }, userId, {
      requestedArtists: topArtistNames,
      foundArtists: foundArtists
    });
    
    res.status(200).json({
      success: true,
      playlist: playlist.body,
      artists: allArtistsData
    });
  } catch (err) {
    console.error('Error creating playlist:', err);
    res.status(400).json({ 
      error: 'Error creating playlist',
      details: err.message
    });
  }
});

// Admin route para visualizar usuários
app.get('/admin/users', checkAdminAuth, (req, res) => {
  res.json(users);
});

// Admin route para visualizar playlists
app.get('/admin/playlists', checkAdminAuth, (req, res) => {
  res.json(playlists);
});

// Admin route para visualizar dashboard
app.get('/admin', checkAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin route para visualizar detalhes de uma playlist específica
app.get('/admin/playlist-details/:playlistId', checkAdminAuth, (req, res) => {
  const { playlistId } = req.params;
  const playlist = playlists.find(p => p.id === playlistId);
  
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  
  res.json({
    requestedArtists: playlist.requestedArtists || [],
    foundArtists: playlist.foundArtists || []
  });
});

// Refresh token route
app.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  
  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }
  
  spotifyApi.setRefreshToken(refresh_token);
  
  try {
    const data = await spotifyApi.refreshAccessToken();
    res.status(200).json({
      access_token: data.body.access_token,
      expires_in: data.body.expires_in
    });
  } catch (err) {
    console.error('Error refreshing token:', err);
    res.status(400).json({ error: 'Error refreshing token' });
  }
});

// Rota para excluir dados do usuário
app.delete('/api/user-data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { authorization } = req.headers;
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Verify token belongs to the user being deleted
    spotifyApi.setAccessToken(authorization.split(' ')[1]);
    const userInfo = await spotifyApi.getMe();
    
    if (userInfo.body.id !== userId) {
      return res.status(403).json({ error: 'Forbidden - You can only delete your own data' });
    }
    
    const result = deleteUserData(userId);
    res.status(200).json(result);
  } catch (err) {
    console.error('Error deleting user data:', err);
    res.status(500).json({ error: 'Error deleting user data' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 
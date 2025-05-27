require('dotenv').config();
const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const https = require('https');
const fs = require('fs');
const fetch = require('node-fetch');

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
    
    // Tentar obter recomendações baseadas nas faixas mais populares do artista usando a busca
    try {
      // Usar até 3 faixas populares como seed
      const seedTracks = topTracksResult.body.tracks.slice(0, 3).map(track => track.id);
      
      if (seedTracks.length > 0) {
        // Obter detalhes do artista para usar na busca
        const artistInfo = await withRetry(() => spotifyApi.getArtist(artistId));
        const artistName = artistInfo.body.name;
        
        // Consultas de busca para encontrar músicas relacionadas
        const searchQueries = [];
        
        // Adicionar o nome do artista como consulta básica
        searchQueries.push(artistName);
        
        // Adicionar consultas baseadas em faixas populares do artista
        for (const trackId of seedTracks) {
          try {
            const trackInfo = await withRetry(() => spotifyApi.getTrack(trackId));
            const trackName = trackInfo.body.name;
            
            // Criar consultas específicas para esta faixa
            searchQueries.push(`${artistName} similar to ${trackName}`);
          } catch (error) {
            console.error(`Error getting track info for ${trackId}:`, error);
          }
        }
        
        // Para cada consulta, fazer uma busca e coletar os resultados
        for (const query of searchQueries) {
          try {
            const searchResult = await withRetry(() => spotifyApi.search(query, ['track'], { limit: 10 }));
            
            if (searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
              // Filtrar apenas faixas do artista solicitado e pegar apenas resultados relevantes
              const artistRecommendations = searchResult.body.tracks.items
                .filter(track => track.artists.some(artist => artist.id === artistId))
                .slice(1); // Pular o primeiro resultado que provavelmente é a própria música
              
              // Adicionar as recomendações filtradas
              allTracks = [...allTracks, ...artistRecommendations];
            }
          } catch (error) {
            console.error(`Error searching for "${query}":`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error getting recommendations for artist tracks:', error);
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

// Nova rota para obter recomendações do Spotify baseadas em busca
app.get('/search-recommendations', async (req, res) => {
  try {
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const { seed_tracks, seed_artists, limit = 20 } = req.query;
    
    if ((!seed_tracks || seed_tracks.split(',').length === 0) && 
        (!seed_artists || seed_artists.split(',').length === 0)) {
      return res.status(400).json({ error: 'At least one seed track or artist is required' });
    }
    
    // Coletar informações sobre artistas e faixas para usar na busca
    let searchQueries = [];
    let allResults = [];
    let artistsInfo = new Map(); // Para armazenar informações dos artistas
    let trackGenres = new Set(); // Para armazenar gêneros
    
    // Se temos seed_artists, coletar informações sobre eles primeiro
    if (seed_artists && seed_artists.split(',').length > 0) {
      const artistIds = seed_artists.split(',');
      
      // Processar cada artista
      for (const artistId of artistIds) {
        try {
          const artistInfo = await withRetry(() => spotifyApi.getArtist(artistId));
          const artist = artistInfo.body;
          
          if (artist && artist.name) {
            // Armazenar informações do artista
            artistsInfo.set(artistId, {
              name: artist.name,
              genres: artist.genres || [],
              popularity: artist.popularity || 0,
              resultsCount: 0 // Contador para balanceamento
            });
            
            // Coletar gêneros
            if (artist.genres && artist.genres.length > 0) {
              artist.genres.forEach(genre => trackGenres.add(genre));
            }
            
            // Adicionar consultas baseadas no nome do artista
            searchQueries.push({
              query: artist.name,
              artistId: artistId,
              weight: 1.0
            });
            
            // Se o artista tem gêneros, usar nas consultas
            if (artist.genres && artist.genres.length > 0) {
              const topGenres = artist.genres.slice(0, 2); // Usar até 2 gêneros principais
              topGenres.forEach(genre => {
                searchQueries.push({
                  query: `${genre} ${artist.name}`,
                  artistId: artistId,
                  weight: 1.2
                });
              });
            }
          }
        } catch (error) {
          console.error(`Error getting artist info for ${artistId}:`, error);
        }
      }
    }
    
    // Se temos seed_tracks, buscar informações sobre elas
    if (seed_tracks && seed_tracks.split(',').length > 0) {
      const trackIds = seed_tracks.split(',');
      
      for (const trackId of trackIds) {
        try {
          const trackInfo = await withRetry(() => spotifyApi.getTrack(trackId));
          const track = trackInfo.body;
          
          if (track && track.artists && track.artists.length > 0) {
            const mainArtist = track.artists[0];
            const trackName = track.name;
            const artistId = mainArtist.id;
            
            // Adicionar ao mapa de artistas se ainda não existe
            if (!artistsInfo.has(artistId)) {
              try {
                const artistInfo = await withRetry(() => spotifyApi.getArtist(artistId));
                const artist = artistInfo.body;
                
                artistsInfo.set(artistId, {
                  name: artist.name,
                  genres: artist.genres || [],
                  popularity: artist.popularity || 0,
                  resultsCount: 0
                });
                
                // Coletar gêneros
                if (artist.genres && artist.genres.length > 0) {
                  artist.genres.forEach(genre => trackGenres.add(genre));
                }
              } catch (error) {
                console.error(`Error getting artist info for track's artist ${artistId}:`, error);
                artistsInfo.set(artistId, {
                  name: mainArtist.name,
                  genres: [],
                  popularity: 0,
                  resultsCount: 0
                });
              }
            }
            
            // Tentar obter atributos da faixa (audio features)
            try {
              const audioFeatures = await withRetry(() => spotifyApi.getAudioFeaturesForTrack(trackId));
              
              if (audioFeatures.body) {
                const features = audioFeatures.body;
                
                // Criar consultas baseadas em características da música
                const artistName = artistsInfo.get(artistId).name;
                
                // Consulta baseada no ritmo (dançabilidade + energia)
                if (features.danceability > 0.7 || features.energy > 0.7) {
                  searchQueries.push({
                    query: `${artistName} upbeat energetic dance`,
                    artistId: artistId,
                    weight: 1.3
                  });
                } else if (features.danceability < 0.4 && features.energy < 0.4) {
                  searchQueries.push({
                    query: `${artistName} calm slow`,
                    artistId: artistId,
                    weight: 1.3
                  });
                }
                
                // Consulta baseada na instrumentalidade vs. vocal
                if (features.instrumentalness > 0.5) {
                  searchQueries.push({
                    query: `${artistName} instrumental`,
                    artistId: artistId,
                    weight: 1.2
                  });
                } else if (features.speechiness > 0.3) {
                  searchQueries.push({
                    query: `${artistName} vocal rap`,
                    artistId: artistId,
                    weight: 1.2
                  });
                }
              }
            } catch (error) {
              console.error(`Error getting audio features for ${trackId}:`, error);
            }
            
            // Consultas específicas baseadas na faixa
            searchQueries.push({
              query: `${artistsInfo.get(artistId).name} similar to ${trackName}`,
              artistId: artistId,
              weight: 1.5
            });
          }
        } catch (error) {
          console.error(`Error getting track info for ${trackId}:`, error);
        }
      }
    }
    
    // Adicionar consultas de gênero se temos gêneros suficientes
    if (trackGenres.size > 0) {
      const genres = Array.from(trackGenres).slice(0, 5); // Limitar a 5 gêneros para evitar muitas consultas
      
      genres.forEach(genre => {
        searchQueries.push({
          query: `${genre} music`,
          artistId: null, // Não está associado a um artista específico
          weight: 1.0
        });
      });
    }
    
    // Se não conseguimos construir nenhuma consulta, retornar erro
    if (searchQueries.length === 0) {
      return res.status(400).json({ error: 'Could not create search queries from provided seeds' });
    }
    
    // Randomizar a ordem das consultas para melhor distribuição
    searchQueries.sort(() => Math.random() - 0.5);
    
    // Para cada consulta, fazer uma busca e coletar os resultados
    for (const queryInfo of searchQueries) {
      try {
        const searchResult = await withRetry(() => spotifyApi.search(queryInfo.query, ['track'], { limit: 15 }));
        
        if (searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
          // Pegar os resultados a partir do segundo item para evitar a mesma música
          const items = searchResult.body.tracks.items.slice(1);
          
          // Dar peso aos resultados
          const weightedItems = items.map(item => ({
            track: item,
            weight: queryInfo.weight,
            artistId: queryInfo.artistId
          }));
          
          allResults = [...allResults, ...weightedItems];
          
          // Atualizar contador de resultados para este artista
          if (queryInfo.artistId) {
            const artistInfo = artistsInfo.get(queryInfo.artistId);
            if (artistInfo) {
              artistInfo.resultsCount += items.length;
              artistsInfo.set(queryInfo.artistId, artistInfo);
            }
          }
        }
      } catch (error) {
        console.error(`Error searching for "${queryInfo.query}":`, error);
      }
    }
    
    // Verificar o balanceamento entre artistas
    const artistCounts = Array.from(artistsInfo.values()).map(info => info.resultsCount);
    const maxCount = Math.max(...artistCounts, 1);
    const minCount = Math.min(...artistCounts, 1);
    
    // Se há um grande desequilíbrio, reajustar os pesos
    if (maxCount > minCount * 3 && artistsInfo.size > 1) {
      console.log(`Balanceando resultados. Max: ${maxCount}, Min: ${minCount}`);
      
      // Ajustar os pesos para balancear resultados
      allResults = allResults.map(result => {
        if (result.artistId) {
          const artistInfo = artistsInfo.get(result.artistId);
          if (artistInfo && artistInfo.resultsCount > 0) {
            // Quanto mais resultados o artista já tem, menor o peso
            const balanceFactor = 1 - (artistInfo.resultsCount / (maxCount * 2));
            result.weight *= (balanceFactor + 0.5); // Nunca reduzir a menos de 50% do peso original
          }
        }
        return result;
      });
    }
    
    // Ordenar por peso (importância)
    allResults.sort((a, b) => b.weight - a.weight);
    
    // Extrair as faixas após a ordenação
    const sortedTracks = allResults.map(result => result.track);
    
    // Remover duplicatas baseadas no ID da faixa
    const uniqueTracks = [];
    const seenIds = new Set();
    
    for (const track of sortedTracks) {
      if (!seenIds.has(track.id)) {
        seenIds.add(track.id);
        uniqueTracks.push(track);
      }
    }
    
    // Filtrar músicas das seeds (não queremos incluir as próprias seeds)
    const seedTrackIds = seed_tracks ? new Set(seed_tracks.split(',')) : new Set();
    const filteredTracks = uniqueTracks.filter(track => !seedTrackIds.has(track.id));
    
    // Balancear resultados finais entre os artistas
    let balancedTracks = [];
    const artistBuckets = new Map();
    
    // Criar "buckets" para cada artista semente
    artistsInfo.forEach((info, artistId) => {
      artistBuckets.set(artistId, []);
    });
    
    // Adicionar também um bucket para resultados não relacionados diretamente a artistas sementes
    artistBuckets.set('other', []);
    
    // Distribuir faixas nos buckets apropriados
    filteredTracks.forEach(track => {
      let assigned = false;
      
      // Verificar se a faixa pertence a algum dos artistas sementes
      for (const [artistId, bucket] of artistBuckets.entries()) {
        if (artistId !== 'other' && track.artists.some(artist => artist.id === artistId)) {
          bucket.push(track);
          assigned = true;
          break;
        }
      }
      
      // Se não foi atribuída a nenhum bucket específico, colocar em "outros"
      if (!assigned) {
        artistBuckets.get('other').push(track);
      }
    });
    
    // Construir a lista final de forma intercalada, para balancear os artistas
    const maxTracksPerArtist = Math.ceil(parseInt(limit, 10) / (artistBuckets.size || 1));
    let remaining = parseInt(limit, 10);
    
    while (remaining > 0 && balancedTracks.length < remaining) {
      let addedThisRound = false;
      
      // Pegar uma faixa de cada bucket, em ordem
      for (const [artistId, bucket] of artistBuckets.entries()) {
        if (bucket.length > 0) {
          balancedTracks.push(bucket.shift());
          addedThisRound = true;
          remaining--;
          
          if (remaining <= 0) break;
        }
      }
      
      // Se não adicionamos nada nesta rodada, significa que todos os buckets estão vazios
      if (!addedThisRound) break;
    }
    
    // Se ainda não temos faixas suficientes, adicionar mais do bucket "outros"
    if (balancedTracks.length < parseInt(limit, 10) && artistBuckets.get('other').length > 0) {
      const moreNeeded = parseInt(limit, 10) - balancedTracks.length;
      balancedTracks = [...balancedTracks, ...artistBuckets.get('other').slice(0, moreNeeded)];
    }
    
    // Formatar a resposta para parecer com a API de recomendações do Spotify
    res.status(200).json({
      tracks: balancedTracks,
      seeds: []
    });
  } catch (err) {
    console.error('Error getting search-based recommendations:', err);
    console.error('Error details:', err.message, err.stack);
    
    if (err.statusCode) {
      console.error('Status code:', err.statusCode);
      console.error('Error body:', err.body);
    }
    
    res.status(400).json({ error: 'Error getting search-based recommendations', details: err.message });
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
    
    // Usar o novo endpoint de recomendações baseado em busca
    // Redirecionamos o pedido para manter compatibilidade com o código existente
    try {
      const response = await fetch(`${req.protocol}://${req.get('host')}/search-recommendations?seed_tracks=${seed_tracks || ''}&seed_artists=${seed_artists || ''}&limit=${limit}`, {
        headers: {
          'Authorization': req.headers.authorization
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error from search-recommendations: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      res.status(200).json(data);
      
    } catch (error) {
      console.error('Error using search-based recommendations:', error);
      
      // Se a abordagem de busca falhar, retornar um erro mais explicativo
      res.status(503).json({
        error: 'Error getting recommendations',
        details: 'The Spotify Recommendations API has been deprecated. Using search-based alternatives failed.',
        message: error.message
      });
    }
  } catch (err) {
    console.error('Error in recommendations endpoint:', err);
    console.error('Error details:', err.message, err.stack);
    
    if (err.statusCode) {
      console.error('Status code:', err.statusCode);
      console.error('Error body:', err.body);
    }
    
    res.status(400).json({ error: 'Error getting recommendations', details: err.message });
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
      description: `Playlist com músicas dos artistas selecionados. Criada em ${dateStr}`,
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
    
    // 1. Obter o ID do usuário
    const userInfo = await withRetry(() => spotifyApi.getMe());
    const userId = userInfo.body.id;
    
    // 2. Obter os artistas mais ouvidos
    const topArtists = await withRetry(() => spotifyApi.getMyTopArtists({ 
      time_range: 'medium_term',
      limit: 10
    }));
    
    // 3. Criar a playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlist = await withRetry(() => spotifyApi.createPlaylist(userId, {
      name: `Meus Artistas Favoritos (${dateStr})`,
      description: `Playlist automática com músicas dos meus artistas favoritos. Criada em ${dateStr}`,
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
    return res.status(404).json({ error: 'Playlist não encontrada' });
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 
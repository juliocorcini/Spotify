require('dotenv').config();
const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

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
    
    // Redirecionar para o frontend com os tokens como parâmetros de URL
    res.redirect(`/?access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`);
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.redirect('/#/error/invalid token');
  }
});

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
    const userInfo = await spotifyApi.getMe();
    const userId = userInfo.body.id;
    
    // 2. Criar a playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlistTitle = playlistName || `Playlist Personalizada (${dateStr})`;
    
    const playlist = await spotifyApi.createPlaylist(userId, {
      name: playlistTitle,
      description: `Playlist com músicas dos artistas selecionados. Criada em ${dateStr}`,
      public: false
    });
    
    const playlistId = playlist.body.id;
    
    // 3. Processar cada artista
    let allArtistsData = [];
    let allTracks = [];
    
    for (const artistName of artists) {
      try {
        // Buscar o artista
        const searchResult = await spotifyApi.searchArtists(artistName, { limit: 1 });
        
        if (searchResult.body.artists.items.length === 0) {
          // Artista não encontrado
          allArtistsData.push({
            name: artistName,
            notFound: true
          });
          continue;
        }
        
        const artist = searchResult.body.artists.items[0];
        
        // Obter faixas mais populares
        const tracksResult = await spotifyApi.getArtistTopTracks(artist.id, 'BR');
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
      } catch (error) {
        console.error(`Error processing artist "${artistName}":`, error);
        allArtistsData.push({
          name: artistName,
          error: true
        });
      }
    }
    
    // 4. Adicionar faixas à playlist (limite de 100 por vez)
    if (allTracks.length > 0) {
      // Spotify só permite adicionar 100 faixas por vez
      for (let i = 0; i < allTracks.length; i += 100) {
        const chunk = allTracks.slice(i, i + 100);
        await spotifyApi.addTracksToPlaylist(playlistId, chunk);
      }
    }
    
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
    // Obter token do cabeçalho Authorization
    if (!setTokenFromRequest(req)) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // 1. Obter o ID do usuário
    const userInfo = await spotifyApi.getMe();
    const userId = userInfo.body.id;
    
    // 2. Obter os artistas mais ouvidos
    const topArtists = await spotifyApi.getMyTopArtists({ 
      time_range: 'medium_term',
      limit: 10
    });
    
    // 3. Criar a playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlist = await spotifyApi.createPlaylist(userId, {
      name: `Meus Artistas Favoritos (${dateStr})`,
      description: `Playlist automática com músicas dos meus artistas favoritos. Criada em ${dateStr}`,
      public: false
    });
    
    const playlistId = playlist.body.id;
    
    // 4. Para cada artista, obter suas músicas mais populares
    let tracks = [];
    let allArtistsData = [];
    
    for (const artist of topArtists.body.items) {
      const artistTracks = await spotifyApi.getArtistTopTracks(artist.id, 'BR');
      
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
    }
    
    // 5. Adicionar músicas à playlist (limite de 100 por vez)
    if (tracks.length > 0) {
      // Spotify só permite adicionar 100 faixas por vez
      for (let i = 0; i < tracks.length; i += 100) {
        const chunk = tracks.slice(i, i + 100);
        await spotifyApi.addTracksToPlaylist(playlistId, chunk);
      }
    }
    
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
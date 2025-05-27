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

// Route to get user profile
app.get('/me', async (req, res) => {
  try {
    // Obter token do cabeçalho Authorization
    const authHeader = req.headers.authorization;
    let token = spotifyApi.getAccessToken();
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
      spotifyApi.setAccessToken(token);
    }
    
    if (!token) {
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
    // Obter token do cabeçalho Authorization
    const authHeader = req.headers.authorization;
    let token = spotifyApi.getAccessToken();
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
      spotifyApi.setAccessToken(token);
    }
    
    if (!token) {
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

// Create playlist with top artists' tracks
app.post('/create-artist-playlist', async (req, res) => {
  try {
    // Obter token do cabeçalho Authorization
    const authHeader = req.headers.authorization;
    let token = spotifyApi.getAccessToken();
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
      spotifyApi.setAccessToken(token);
    }
    
    if (!token) {
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
    
    for (const artist of topArtists.body.items) {
      const artistTracks = await spotifyApi.getArtistTopTracks(artist.id, 'BR');
      
      // Adicionar até 3 músicas mais populares de cada artista
      artistTracks.body.tracks.slice(0, 3).forEach(track => {
        tracks.push(track.uri);
      });
    }
    
    // 5. Adicionar músicas à playlist (limite de 100 por vez)
    if (tracks.length > 0) {
      await spotifyApi.addTracksToPlaylist(playlistId, tracks);
    }
    
    res.status(200).json({
      success: true,
      playlist: playlist.body
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
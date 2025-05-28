const express = require('express');
const router = express.Router();
const { spotifyApi } = require('../config/spotify');
const { registerUser } = require('../services/dataService');

// Login route
router.get('/login', (req, res) => {
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
router.get('/callback', async (req, res) => {
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

// Refresh token route
router.post('/refresh', async (req, res) => {
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

module.exports = router; 
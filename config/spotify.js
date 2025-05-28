require('dotenv').config();
const SpotifyWebApi = require('spotify-web-api-node');
const https = require('https');

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

module.exports = { spotifyApi, httpsAgent }; 
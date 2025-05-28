const { spotifyApi } = require('../config/spotify');

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

// Middleware para verificar autenticação do Spotify
function requireSpotifyAuth(req, res, next) {
  if (!setTokenFromRequest(req)) {
    return res.status(401).json({ error: 'No token provided' });
  }
  next();
}

module.exports = {
  setTokenFromRequest,
  checkAdminAuth,
  requireSpotifyAuth
}; 
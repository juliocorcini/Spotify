const express = require('express');
const router = express.Router();
const { requireSpotifyAuth } = require('../middleware/auth');
const { getSearchBasedRecommendations } = require('../services/recommendationService');
const fetch = require('node-fetch');

// Nova rota para obter recomendações do Spotify baseadas em busca
router.get('/search-recommendations', requireSpotifyAuth, async (req, res) => {
  try {
    const { seed_tracks, seed_artists, limit = 20 } = req.query;
    
    const seedTracksArray = seed_tracks ? seed_tracks.split(',') : [];
    const seedArtistsArray = seed_artists ? seed_artists.split(',') : [];
    
    if (seedTracksArray.length === 0 && seedArtistsArray.length === 0) {
      return res.status(400).json({ error: 'At least one seed track or artist is required' });
    }
    
    const result = await getSearchBasedRecommendations(seedTracksArray, seedArtistsArray, limit);
    res.status(200).json(result);
  } catch (err) {
    console.error('Error getting search-based recommendations:', err);
    res.status(400).json({ 
      error: 'Error getting search-based recommendations', 
      details: err.message 
    });
  }
});

// Nova rota para obter recomendações do Spotify
router.get('/recommendations', requireSpotifyAuth, async (req, res) => {
  try {
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
    res.status(400).json({ error: 'Error getting recommendations', details: err.message });
  }
});

module.exports = router; 
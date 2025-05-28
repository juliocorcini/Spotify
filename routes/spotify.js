const express = require('express');
const router = express.Router();
const { spotifyApi } = require('../config/spotify');
const { requireSpotifyAuth } = require('../middleware/auth');
const { withRetry } = require('../utils/retry');
const { findPreviewUrl, getCacheStats } = require('../services/previewService');

// Route to get user profile
router.get('/me', requireSpotifyAuth, async (req, res) => {
  try {
    const result = await spotifyApi.getMe();
    res.status(200).json(result.body);
  } catch (err) {
    console.error('Error getting user profile:', err);
    res.status(400).json({ error: 'Error getting user profile' });
  }
});

// Get user's top artists
router.get('/top-artists', requireSpotifyAuth, async (req, res) => {
  try {
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
router.get('/search-artist', requireSpotifyAuth, async (req, res) => {
  try {
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

// Nova rota para buscar preview de uma música
router.get('/track-preview/:trackId', requireSpotifyAuth, async (req, res) => {
  try {
    const { trackId } = req.params;
    console.log(`🎵 Buscando preview para track ID: ${trackId}`);
    
    // Primeiro, obter informações da música do Spotify
    const trackInfo = await withRetry(() => spotifyApi.getTrack(trackId));
    const track = trackInfo.body;
    
    console.log(`📀 Track encontrada: "${track.name}" por ${track.artists.map(a => a.name).join(', ')}`);
    console.log(`🎧 Preview URL do Spotify: ${track.preview_url || 'null'}`);
    
    // Se já tem preview_url do Spotify, retornar
    if (track.preview_url) {
      return res.json({ 
        success: true, 
        preview_url: track.preview_url,
        source: 'spotify_api'
      });
    }
    
    // Senão, buscar usando o preview finder
    const artistName = track.artists && track.artists[0] ? track.artists[0].name : '';
    console.log(`🔍 Buscando preview alternativo para: "${track.name}" - "${artistName}"`);
    
    const previewUrl = await findPreviewUrl(track.name, artistName, track.id);
    
    console.log(`🎶 Preview finder resultado: ${previewUrl || 'null'}`);
    
    if (previewUrl) {
      res.json({ 
        success: true, 
        preview_url: previewUrl,
        source: 'preview_finder'
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Preview não disponível para esta música',
        track_name: track.name,
        artist_name: artistName
      });
    }
  } catch (error) {
    console.error('❌ Erro ao buscar preview:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// Rota para obter estatísticas do cache de previews
router.get('/preview-cache-stats', requireSpotifyAuth, async (req, res) => {
  try {
    const stats = getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error('Erro ao obter estatísticas do cache:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router; 
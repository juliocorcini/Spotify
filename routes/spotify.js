const express = require('express');
const router = express.Router();
const { spotifyApi } = require('../config/spotify');
const { requireSpotifyAuth } = require('../middleware/auth');

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

module.exports = router; 
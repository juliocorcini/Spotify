const express = require('express');
const router = express.Router();
const path = require('path');
const { spotifyApi } = require('../config/spotify');
const { checkAdminAuth } = require('../middleware/auth');
const { getUsers, getPlaylists, getPlaylist } = require('../services/dataService');

// Admin dashboard route
router.get('/', checkAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Get all users
router.get('/users', checkAdminAuth, async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Error getting users' });
  }
});

// Get all playlists
router.get('/playlists', checkAdminAuth, async (req, res) => {
  try {
    const playlists = await getPlaylists();
    res.json(playlists);
  } catch (error) {
    console.error('Error getting playlists:', error);
    res.status(500).json({ error: 'Error getting playlists' });
  }
});

// Get specific playlist details
router.get('/playlist-details/:playlistId', checkAdminAuth, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const playlist = await getPlaylist(playlistId);
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.json(playlist);
  } catch (error) {
    console.error('Error getting playlist details:', error);
    res.status(500).json({ error: 'Error getting playlist details' });
  }
});

module.exports = router; 
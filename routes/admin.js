const express = require('express');
const router = express.Router();
const path = require('path');
const { checkAdminAuth } = require('../middleware/auth');
const { getUsers, getPlaylists, getPlaylist } = require('../services/dataService');

// Admin route para visualizar usuários
router.get('/users', checkAdminAuth, (req, res) => {
  res.json(getUsers());
});

// Admin route para visualizar playlists
router.get('/playlists', checkAdminAuth, (req, res) => {
  res.json(getPlaylists());
});

// Admin route para visualizar dashboard
router.get('/', checkAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Admin route para visualizar detalhes de uma playlist específica
router.get('/playlist-details/:playlistId', checkAdminAuth, (req, res) => {
  const { playlistId } = req.params;
  const playlist = getPlaylist(playlistId);
  
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist não encontrada' });
  }
  
  res.json({
    requestedArtists: playlist.requestedArtists || [],
    foundArtists: playlist.foundArtists || []
  });
});

module.exports = router; 
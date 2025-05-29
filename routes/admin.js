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

// Nova rota para recalcular artistas de playlists existentes
router.get('/recalculate-playlist-artists/:playlistId', checkAdminAuth, async (req, res) => {
  try {
    const { playlistId } = req.params;
    
    // Obter detalhes da playlist do banco
    const { getPlaylist } = require('../services/dataService');
    const playlistData = await getPlaylist(playlistId);
    
    if (!playlistData) {
      return res.status(404).json({ error: 'Playlist não encontrada' });
    }
    
    // Se a playlist já tem contagem de artistas, não recalcular
    if (playlistData.artists_count > 0) {
      return res.json({ 
        message: 'Playlist já possui contagem de artistas', 
        artists_count: playlistData.artists_count 
      });
    }
    
    // Usar a API do Spotify para obter as faixas da playlist
    const { spotifyApi } = require('../config/spotify');
    const { withRetry } = require('../utils/retry');
    
    // Para usar a API, precisamos de um token. Vamos usar um token de app (se configurado)
    // Por simplicidade, vou retornar um erro indicando que é necessário um token válido
    try {
      const playlistTracks = await withRetry(() => spotifyApi.getPlaylistTracks(playlistId));
      
      // Calcular artistas únicos
      const uniqueArtists = new Set();
      const artistsList = [];
      
      if (playlistTracks.body.items && playlistTracks.body.items.length > 0) {
        playlistTracks.body.items.forEach(item => {
          if (item.track && item.track.artists) {
            item.track.artists.forEach(artist => {
              if (!uniqueArtists.has(artist.id)) {
                uniqueArtists.add(artist.id);
                artistsList.push({
                  id: artist.id,
                  name: artist.name
                });
              }
            });
          }
        });
      }
      
      // Atualizar no banco de dados
      const { pool } = require('../config/database');
      const usingDatabase = pool && process.env.DATABASE_URL;
      
      if (usingDatabase) {
        await pool.query(`
          UPDATE playlists 
          SET artists_count = $1, extra_data = jsonb_set(
            COALESCE(extra_data, '{}'), 
            '{trackArtists}', 
            $2::jsonb
          )
          WHERE id = $3
        `, [
          uniqueArtists.size,
          JSON.stringify(artistsList),
          playlistId
        ]);
      }
      
      res.json({ 
        success: true, 
        artists_count: uniqueArtists.size,
        artists: artistsList
      });
      
    } catch (spotifyError) {
      console.error('Erro ao acessar API do Spotify:', spotifyError);
      res.status(400).json({ 
        error: 'Não foi possível acessar a API do Spotify. Certifique-se de que há um token válido.' 
      });
    }
    
  } catch (error) {
    console.error('Erro ao recalcular artistas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router; 
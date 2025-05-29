const express = require('express');
const router = express.Router();
const { spotifyApi } = require('../config/spotify');
const { requireSpotifyAuth } = require('../middleware/auth');
const { registerPlaylist } = require('../services/dataService');
const { withRetry } = require('../utils/retry');
const { compareArtistNames } = require('../utils/artistHelpers');

// Nova rota para criar playlist a partir de URIs de faixas específicas
router.post('/create-custom-tracks-playlist', requireSpotifyAuth, async (req, res) => {
  try {
    const { trackUris, playlistName, originalSearchedArtists } = req.body;
    
    if (!trackUris || !Array.isArray(trackUris) || trackUris.length === 0) {
      return res.status(400).json({ error: 'Invalid track URIs list' });
    }
    
    console.log('🎤 Received originalSearchedArtists:', originalSearchedArtists);
    
    // 1. Obter o ID do usuário
    const userInfo = await withRetry(() => spotifyApi.getMe());
    const userId = userInfo.body.id;
    
    // 2. Criar a playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlistTitle = playlistName || `Playlist Personalizada (${dateStr})`;
    
    const playlist = await withRetry(() => spotifyApi.createPlaylist(userId, {
      name: playlistTitle,
      description: `Playlist com músicas selecionadas manualmente. Criada em ${dateStr}`,
      public: false
    }));
    
    const playlistId = playlist.body.id;
    
    // 3. Adicionar faixas à playlist (limite de 100 por vez)
    for (let i = 0; i < trackUris.length; i += 100) {
      const chunk = trackUris.slice(i, i + 100);
      await withRetry(() => spotifyApi.addTracksToPlaylist(playlistId, chunk));
    }
    
    // 4. Obter informações sobre as faixas adicionadas para calcular artistas únicos
    const addedTracksResponse = await withRetry(() => spotifyApi.getPlaylistTracks(playlistId));
    
    // 5. Calcular artistas únicos das faixas adicionadas
    const uniqueArtists = new Set();
    const artistsList = [];
    
    if (addedTracksResponse.body.items && addedTracksResponse.body.items.length > 0) {
      addedTracksResponse.body.items.forEach(item => {
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
    
    // Registrar a playlist criada com contagem real de artistas
    const playlistDetails = {
      id: playlist.body.id,
      name: playlist.body.name,
      description: playlist.body.description,
      external_urls: playlist.body.external_urls,
      tracks: { total: trackUris.length }
    };
    
    // Preparar dados extras para salvar
    const extraData = { 
      type: 'custom',
      artistsCount: uniqueArtists.size,
      foundArtists: artistsList.map(artist => ({
        id: artist.id,
        name: artist.name,
        requestedName: artist.name
      })),
      trackArtists: artistsList
    };
    
    // Se foram fornecidos artistas pesquisados originalmente, adicioná-los
    if (originalSearchedArtists && Array.isArray(originalSearchedArtists) && originalSearchedArtists.length > 0) {
      extraData.requestedArtists = originalSearchedArtists;
      console.log('✅ Saving requestedArtists:', originalSearchedArtists);
    }
    
    await registerPlaylist(playlistDetails, userId, extraData);
    
    res.status(200).json({
      success: true,
      playlist: playlist.body,
      addedTracks: addedTracksResponse.body.items,
      uniqueArtistsCount: uniqueArtists.size,
      artists: artistsList,
      originalSearchedArtists: originalSearchedArtists || []
    });
  } catch (err) {
    console.error('Error creating playlist with custom tracks:', err);
    res.status(400).json({ 
      error: 'Error creating playlist with custom tracks',
      details: err.message
    });
  }
});

// Create playlist with custom artists
router.post('/create-custom-playlist', requireSpotifyAuth, async (req, res) => {
  try {
    const { artists, tracksPerArtist, playlistName } = req.body;
    
    if (!artists || !Array.isArray(artists) || artists.length === 0) {
      return res.status(400).json({ error: 'Invalid artists list' });
    }
    
    // 1. Obter o ID do usuário
    const userInfo = await withRetry(() => spotifyApi.getMe());
    const userId = userInfo.body.id;
    
    // 2. Criar a playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlistTitle = playlistName || `Playlist Personalizada (${dateStr})`;
    
    const playlist = await withRetry(() => spotifyApi.createPlaylist(userId, {
      name: playlistTitle,
      description: `Playlist com músicas dos artistas selecionados. Criada em ${dateStr}`,
      public: false
    }));
    
    const playlistId = playlist.body.id;
    
    // 3. Processar cada artista
    let allArtistsData = [];
    let allTracks = [];
    let foundArtists = []; // Para registrar os artistas encontrados
    
    for (const artistName of artists) {
      try {
        // Buscar o artista com retry - aumentando o limite para 5 para ter mais opções
        const searchResult = await withRetry(() => spotifyApi.searchArtists(artistName, { limit: 5 }));
        
        if (searchResult.body.artists.items.length === 0) {
          // Artista não encontrado
          allArtistsData.push({
            name: artistName,
            notFound: true
          });
          foundArtists.push({
            requestedName: artistName,
            notFound: true
          });
          continue;
        }
        
        // Procurar por um artista com nome correspondente entre os resultados
        let artist = null;
        for (const candidate of searchResult.body.artists.items) {
          if (compareArtistNames(artistName, candidate.name)) {
            artist = candidate;
            break;
          }
        }
        
        // Se não encontrou uma correspondência, registrar como não encontrado
        if (!artist) {
          allArtistsData.push({
            name: artistName,
            notFound: true
          });
          foundArtists.push({
            requestedName: artistName,
            notFound: true
          });
          continue;
        }
        
        // Obter faixas mais populares com retry
        const tracksResult = await withRetry(() => spotifyApi.getArtistTopTracks(artist.id, 'BR'));
        const limit = parseInt(tracksPerArtist, 10) || 5;
        const topTracks = tracksResult.body.tracks.slice(0, limit);
        
        // Adicionar à lista de faixas para a playlist
        const trackUris = topTracks.map(track => track.uri);
        allTracks = [...allTracks, ...trackUris];
        
        // Salvar dados do artista para exibição
        allArtistsData.push({
          id: artist.id,
          name: artist.name,
          image: artist.images.length > 0 ? artist.images[0].url : null,
          tracks: topTracks.map(track => ({
            id: track.id,
            name: track.name,
            uri: track.uri,
            duration_ms: track.duration_ms,
            album: {
              name: track.album.name,
              image: track.album.images.length > 0 ? track.album.images[0].url : null
            }
          }))
        });
        
        // Registrar o artista encontrado
        foundArtists.push({
          requestedName: artistName,
          id: artist.id,
          name: artist.name,
          exactMatch: artist.name.toLowerCase().trim() === artistName.toLowerCase().trim()
        });
      } catch (error) {
        console.error(`Error processing artist "${artistName}":`, error);
        allArtistsData.push({
          name: artistName,
          error: true,
          errorMessage: error.message || "Erro desconhecido"
        });
        foundArtists.push({
          requestedName: artistName,
          error: true,
          errorMessage: error.message || "Erro desconhecido"
        });
      }
    }
    
    // 4. Adicionar faixas à playlist (limite de 100 por vez)
    if (allTracks.length > 0) {
      // Spotify só permite adicionar 100 faixas por vez
      for (let i = 0; i < allTracks.length; i += 100) {
        const chunk = allTracks.slice(i, i + 100);
        await withRetry(() => spotifyApi.addTracksToPlaylist(playlistId, chunk));
      }
    }
    
    // Registrar a playlist criada
    const playlistDetails = {
      id: playlist.body.id,
      name: playlist.body.name,
      description: playlist.body.description,
      external_urls: playlist.body.external_urls,
      tracks: { total: allTracks.length },
      artistsCount: artists.length
    };
    
    await registerPlaylist(playlistDetails, userId, { 
      requestedArtists: artists, 
      foundArtists: foundArtists,
      type: 'custom',
      artistsCount: foundArtists.filter(a => !a.notFound && !a.error).length
    });
    
    res.status(200).json({
      success: true,
      playlist: playlist.body,
      artists: allArtistsData
    });
  } catch (err) {
    console.error('Error creating custom playlist:', err);
    res.status(400).json({ 
      error: 'Error creating custom playlist',
      details: err.message
    });
  }
});

// Create playlist with top artists' tracks
router.post('/create-artist-playlist', requireSpotifyAuth, async (req, res) => {
  try {
    // 1. Obter o ID do usuário
    const userInfo = await withRetry(() => spotifyApi.getMe());
    const userId = userInfo.body.id;
    
    // 2. Obter os artistas mais ouvidos
    const topArtists = await withRetry(() => spotifyApi.getMyTopArtists({ 
      time_range: 'medium_term',
      limit: 10
    }));
    
    // 3. Criar a playlist
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const playlist = await withRetry(() => spotifyApi.createPlaylist(userId, {
      name: `Meus Artistas Favoritos (${dateStr})`,
      description: `Playlist automática com músicas dos meus artistas favoritos. Criada em ${dateStr}`,
      public: false
    }));
    
    const playlistId = playlist.body.id;
    
    // 4. Para cada artista, obter suas músicas mais populares
    let tracks = [];
    let allArtistsData = [];
    let topArtistNames = [];
    let foundArtists = [];
    
    for (const artist of topArtists.body.items) {
      try {
        topArtistNames.push(artist.name);
        
        const artistTracks = await withRetry(() => spotifyApi.getArtistTopTracks(artist.id, 'BR'));
        
        // Adicionar até 5 músicas mais populares de cada artista
        const topTracks = artistTracks.body.tracks.slice(0, 5);
        const trackUris = topTracks.map(track => track.uri);
        tracks = [...tracks, ...trackUris];
        
        // Salvar dados do artista para exibição
        allArtistsData.push({
          id: artist.id,
          name: artist.name,
          image: artist.images.length > 0 ? artist.images[0].url : null,
          tracks: topTracks.map(track => ({
            id: track.id,
            name: track.name,
            uri: track.uri,
            duration_ms: track.duration_ms,
            album: {
              name: track.album.name,
              image: track.album.images.length > 0 ? track.album.images[0].url : null
            }
          }))
        });
        
        // Registrar o artista encontrado
        foundArtists.push({
          requestedName: artist.name, // Neste caso, o artista solicitado é o mesmo que o encontrado
          id: artist.id,
          name: artist.name
        });
      } catch (error) {
        console.error(`Error processing top artist ${artist.name}:`, error);
        allArtistsData.push({
          name: artist.name,
          error: true,
          errorMessage: error.message || "Erro desconhecido"
        });
        foundArtists.push({
          requestedName: artist.name,
          error: true,
          errorMessage: error.message || "Erro desconhecido"
        });
      }
    }
    
    // 5. Adicionar músicas à playlist (limite de 100 por vez)
    if (tracks.length > 0) {
      // Spotify só permite adicionar 100 faixas por vez
      for (let i = 0; i < tracks.length; i += 100) {
        const chunk = tracks.slice(i, i + 100);
        await withRetry(() => spotifyApi.addTracksToPlaylist(playlistId, chunk));
      }
    }
    
    // Registrar a playlist criada
    const playlistDetails = {
      id: playlist.body.id,
      name: playlist.body.name,
      description: playlist.body.description,
      external_urls: playlist.body.external_urls,
      tracks: { total: tracks.length },
      artistsCount: allArtistsData.length
    };
    
    await registerPlaylist(playlistDetails, userId, { 
      requestedArtists: topArtistNames, 
      foundArtists: foundArtists,
      type: 'top_artists',
      artistsCount: foundArtists.filter(a => !a.error).length
    });
    
    res.status(200).json({
      success: true,
      playlist: playlist.body,
      artists: allArtistsData
    });
  } catch (err) {
    console.error('Error creating playlist:', err);
    res.status(400).json({ 
      error: 'Error creating playlist',
      details: err.message
    });
  }
});

module.exports = router; 
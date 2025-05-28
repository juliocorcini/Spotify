const express = require('express');
const router = express.Router();
const { spotifyApi } = require('../config/spotify');
const { requireSpotifyAuth } = require('../middleware/auth');
const { withRetry } = require('../utils/retry');
const { processArtistName } = require('../utils/artistHelpers');

// Get artist's top tracks
router.get('/artist-top-tracks/:artistId', requireSpotifyAuth, async (req, res) => {
  try {
    const { artistId } = req.params;
    const { limit } = req.query;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }
    
    // Obtém as faixas mais populares (Spotify só retorna 10 por padrão)
    const result = await spotifyApi.getArtistTopTracks(artistId, 'BR');
    
    // Limita ao número solicitado (se fornecido)
    const tracks = limit ? result.body.tracks.slice(0, parseInt(limit, 10)) : result.body.tracks;
    
    res.status(200).json({ tracks });
  } catch (err) {
    console.error('Error getting artist top tracks:', err);
    res.status(400).json({ error: 'Error getting artist top tracks' });
  }
});

// Nova rota para obter mais faixas de um artista (não apenas as mais populares)
router.get('/artist-tracks/:artistId', requireSpotifyAuth, async (req, res) => {
  try {
    const { artistId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }
    
    // Primeiro, obter álbuns do artista
    const albumsResult = await withRetry(() => spotifyApi.getArtistAlbums(artistId, {
      include_groups: 'album,single',
      limit: 10,
      offset: 0
    }));
    
    // Lista para armazenar todas as faixas
    let allTracks = [];
    
    // Para cada álbum, obter faixas
    for (const album of albumsResult.body.items) {
      try {
        const tracksResult = await withRetry(() => spotifyApi.getAlbumTracks(album.id, { limit: 50 }));
        
        // Filtrar faixas onde o artista requisitado é um dos artistas
        const filteredTracks = tracksResult.body.items.filter(track => 
          track.artists.some(artist => artist.id === artistId)
        );
        
        // Adicionar detalhes do álbum para cada faixa
        const tracksWithAlbum = filteredTracks.map(track => ({
          ...track,
          album: {
            id: album.id,
            name: album.name,
            images: album.images
          }
        }));
        
        allTracks = [...allTracks, ...tracksWithAlbum];
      } catch (error) {
        console.error(`Error getting tracks for album ${album.id}:`, error);
      }
    }
    
    // Remover duplicatas (mesma música em vários álbuns)
    const uniqueTracks = [];
    const trackIds = new Set();
    
    for (const track of allTracks) {
      if (!trackIds.has(track.id)) {
        trackIds.add(track.id);
        uniqueTracks.push(track);
      }
    }
    
    // Aplicar offset e limit
    const paginatedTracks = uniqueTracks.slice(
      parseInt(offset, 10),
      parseInt(offset, 10) + parseInt(limit, 10)
    );
    
    res.status(200).json({ tracks: paginatedTracks });
  } catch (err) {
    console.error('Error getting artist tracks:', err);
    res.status(400).json({ error: 'Error getting artist tracks' });
  }
});

// Nova rota para buscar faixas de um artista por nome
router.get('/search-artist-tracks', requireSpotifyAuth, async (req, res) => {
  try {
    const { artistId, query } = req.query;
    
    if (!artistId || !query) {
      return res.status(400).json({ error: 'Artist ID and search query are required' });
    }
    
    // Buscar músicas usando a busca geral do Spotify
    const searchResult = await withRetry(() => spotifyApi.search(query, ['track'], { limit: 50 }));
    
    // Filtrar apenas faixas do artista solicitado
    const artistTracks = searchResult.body.tracks.items.filter(track => 
      track.artists.some(artist => artist.id === artistId)
    );
    
    res.status(200).json({ tracks: artistTracks });
  } catch (err) {
    console.error('Error searching artist tracks:', err);
    res.status(400).json({ error: 'Error searching artist tracks' });
  }
});

// Nova rota para buscar artistas com suporte a formatos especiais
router.get('/search-artist-special', requireSpotifyAuth, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    // Processar o nome do artista para detectar formatos especiais
    const processedArtist = processArtistName(query);
    
    // Array para armazenar resultados de todas as buscas
    let allResults = [];
    let primaryArtist = null;
    let individualArtists = []; // Para B2B, armazenar artistas individuais
    
    // Realizar busca para cada termo
    for (const [index, searchTerm] of processedArtist.searchTerms.entries()) {
      try {
        const result = await withRetry(() => spotifyApi.searchArtists(searchTerm, { limit: 5 }));
        
        // Para o primeiro termo, consideramos como resultado principal
        if (index === 0 && result.body.artists.items.length > 0) {
          primaryArtist = {
            ...result.body.artists.items[0],
            displayName: processedArtist.displayName,
            originalName: processedArtist.originalName,
            isB2B: processedArtist.isB2B,
            isSpecial: processedArtist.isSpecial,
            searchTerms: processedArtist.searchTerms
          };
        }
        
        // Para B2B, coletar artistas individuais
        if (processedArtist.isB2B && result.body.artists.items.length > 0) {
          // Cada termo de busca individual (não colaboração) representa um artista do B2B
          if (!searchTerm.includes(' ') || searchTerm.split(' ').length === 1 || 
              (searchTerm.split(' ').length === 2 && !searchTerm.toLowerCase().includes('featuring') && !searchTerm.toLowerCase().includes('feat'))) {
            const artistFound = result.body.artists.items[0];
            
            // Verificar se ainda não foi adicionado
            if (!individualArtists.find(a => a.id === artistFound.id)) {
              individualArtists.push({
                ...artistFound,
                searchTerm: searchTerm // Para saber qual termo de busca encontrou este artista
              });
            }
          }
        }
        
        // Adicionar resultados dessa busca ao array geral
        allResults.push(...result.body.artists.items);
      } catch (error) {
        console.error(`Error searching for term "${searchTerm}":`, error);
      }
    }
    
    // Se não encontramos um artista principal, usar o primeiro resultado de qualquer busca
    if (!primaryArtist && allResults.length > 0) {
      primaryArtist = {
        ...allResults[0],
        displayName: processedArtist.displayName,
        originalName: processedArtist.originalName,
        isB2B: processedArtist.isB2B,
        isSpecial: processedArtist.isSpecial,
        searchTerms: processedArtist.searchTerms
      };
    }
    
    // Para B2B, preparar as imagens dos artistas individuais
    let combinedImages = [];
    if (processedArtist.isB2B && individualArtists.length > 0) {
      combinedImages = individualArtists.map(artist => ({
        artistId: artist.id,
        artistName: artist.name,
        images: artist.images || []
      }));
    }
    
    // Responder com o artista principal e informações específicas do formato
    res.status(200).json({
      primaryArtist: primaryArtist,
      allResults: allResults,
      processedInfo: processedArtist,
      individualArtists: individualArtists, // Artistas individuais para B2B
      combinedImages: combinedImages, // Imagens dos artistas para B2B
      isB2B: processedArtist.isB2B,
      isSpecial: processedArtist.isSpecial
    });
    
  } catch (err) {
    console.error('Error in special artist search:', err);
    res.status(400).json({ error: 'Error searching for special artist format' });
  }
});

module.exports = router;
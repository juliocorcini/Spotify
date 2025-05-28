require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const spotifyRoutes = require('./routes/spotify');
const artistRoutes = require('./routes/artists');
const recommendationRoutes = require('./routes/recommendations');
const playlistRoutes = require('./routes/playlists');
const adminRoutes = require('./routes/admin');

// Import services for remaining routes
const { spotifyApi } = require('./config/spotify');
const { requireSpotifyAuth } = require('./middleware/auth');
const { withRetry } = require('./utils/retry');
const { processArtistName } = require('./utils/artistHelpers');

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', authRoutes);
app.use('/', spotifyRoutes);
app.use('/', artistRoutes);
app.use('/', recommendationRoutes);
app.use('/', playlistRoutes);
app.use('/admin', adminRoutes);

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Nova rota para buscar faixas personalizadas de um artista para o usuário
app.get('/personalized-artist-tracks/:artistId', requireSpotifyAuth, async (req, res) => {
  try {
    const { artistId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }
    
    // Obter as 50 principais faixas do artista primeiro
    const topTracksResult = await withRetry(() => spotifyApi.getArtistTopTracks(artistId, 'BR'));
    
    // Obter álbuns mais recentes
    const albumsResult = await withRetry(() => spotifyApi.getArtistAlbums(artistId, {
      include_groups: 'album,single',
      limit: 5,
      offset: 0
    }));
    
    // Lista para armazenar todas as faixas
    let allTracks = [...topTracksResult.body.tracks];
    
    // Adicionar algumas faixas dos álbuns mais recentes (não todas, para evitar álbuns completos)
    for (const album of albumsResult.body.items) {
      try {
        const tracksResult = await withRetry(() => spotifyApi.getAlbumTracks(album.id, { limit: 3 }));
        
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
    
    // Tentar obter recomendações baseadas nas faixas mais populares do artista usando a busca
    try {
      // Usar até 3 faixas populares como seed
      const seedTracks = topTracksResult.body.tracks.slice(0, 3).map(track => track.id);
      
      if (seedTracks.length > 0) {
        // Obter detalhes do artista para usar na busca
        const artistInfo = await withRetry(() => spotifyApi.getArtist(artistId));
        const artistName = artistInfo.body.name;
        
        // Consultas de busca para encontrar músicas relacionadas
        const searchQueries = [];
        
        // Adicionar o nome do artista como consulta básica
        searchQueries.push(artistName);
        
        // Adicionar consultas baseadas em faixas populares do artista
        for (const trackId of seedTracks) {
          try {
            const trackInfo = await withRetry(() => spotifyApi.getTrack(trackId));
            const trackName = trackInfo.body.name;
            
            // Criar consultas específicas para esta faixa
            searchQueries.push(`${artistName} similar to ${trackName}`);
          } catch (error) {
            console.error(`Error getting track info for ${trackId}:`, error);
          }
        }
        
        // Para cada consulta, fazer uma busca e coletar os resultados
        for (const query of searchQueries) {
          try {
            const searchResult = await withRetry(() => spotifyApi.search(query, ['track'], { limit: 10 }));
            
            if (searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
              // Filtrar apenas faixas do artista solicitado e pegar apenas resultados relevantes
              const artistRecommendations = searchResult.body.tracks.items
                .filter(track => track.artists.some(artist => artist.id === artistId))
                .slice(1); // Pular o primeiro resultado que provavelmente é a própria música
              
              // Adicionar as recomendações filtradas
              allTracks = [...allTracks, ...artistRecommendations];
            }
          } catch (error) {
            console.error(`Error searching for "${query}":`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error getting recommendations for artist tracks:', error);
    }
    
    // Remover duplicatas (mesma música em vários resultados)
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
    console.error('Error getting personalized artist tracks:', err);
    res.status(400).json({ error: 'Error getting personalized artist tracks' });
  }
});

// Nova rota para obter faixas para artistas especiais (B2B, special sets)
app.get('/artist-special-tracks/:artistId', requireSpotifyAuth, async (req, res) => {
  try {
    const { artistId } = req.params;
    const { limit = 10, displayName, searchTerms } = req.query;
    
    if (!artistId || !displayName) {
      return res.status(400).json({ error: 'Artist ID and display name are required' });
    }
    
    // Parse searchTerms if provided as a string
    let terms = [];
    try {
      terms = searchTerms ? JSON.parse(searchTerms) : [];
    } catch (error) {
      console.error('Error parsing search terms:', error);
      terms = [];
    }
    
    // Processar o nome do artista
    const processedArtist = processArtistName(displayName);
    
    // Se não temos termos passados, usar os do processamento
    if (terms.length === 0) {
      terms = processedArtist.searchTerms;
    }
    
    // Array para armazenar todas as faixas
    let allTracks = [];
    
    // Quantidade de faixas a buscar para cada termo, distribuindo o limite
    const tracksPerTerm = Math.ceil(parseInt(limit, 10) / Math.max(1, terms.length));
    
    // Para cada termo de busca, buscar faixas
    for (const [index, term] of terms.entries()) {
      try {
        // Para B2B sets, buscamos músicas que contenham ambos os artistas
        if (processedArtist.isB2B && index < 2) {
          // Buscar colaborações diretas entre os artistas
          const searchResult = await withRetry(() => spotifyApi.search(term, ['track'], { limit: 20 }));
          
          if (searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
            allTracks = [...allTracks, ...searchResult.body.tracks.items];
          }
        } 
        // Para special sets, buscamos músicas do artista com o tipo especial
        else if (processedArtist.isSpecial && index === 0) {
          // Buscar faixas específicas para o tipo de set especial
          const searchResult = await withRetry(() => spotifyApi.search(term, ['track'], { limit: 20 }));
          
          if (searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
            allTracks = [...allTracks, ...searchResult.body.tracks.items];
          }
        }
        // Caso seja um artista individual (seja parte de um B2B ou artista normal)
        else {
          // Obter o ID do artista através da busca
          const artistResult = await withRetry(() => spotifyApi.searchArtists(term, { limit: 1 }));
          
          if (artistResult.body.artists && artistResult.body.artists.items.length > 0) {
            const foundArtistId = artistResult.body.artists.items[0].id;
            
            // Buscar faixas populares deste artista
            const tracksResult = await withRetry(() => spotifyApi.getArtistTopTracks(foundArtistId, 'BR'));
            
            if (tracksResult.body.tracks && tracksResult.body.tracks.length > 0) {
              // Limitar ao número desejado por termo
              const topTracks = tracksResult.body.tracks.slice(0, tracksPerTerm);
              allTracks = [...allTracks, ...topTracks];
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching tracks for term "${term}":`, error);
      }
    }
    
    // Remover duplicatas baseadas no ID da faixa
    const uniqueTracks = [];
    const trackIds = new Set();
    
    for (const track of allTracks) {
      if (!trackIds.has(track.id)) {
        trackIds.add(track.id);
        uniqueTracks.push(track);
      }
    }
    
    // Limitar ao número solicitado
    const limitedTracks = uniqueTracks.slice(0, parseInt(limit, 10));
    
    // Retornar as faixas encontradas
    res.status(200).json({
      displayName: displayName,
      originalName: processedArtist.originalName,
      isB2B: processedArtist.isB2B,
      isSpecial: processedArtist.isSpecial,
      tracks: limitedTracks
    });
    
  } catch (err) {
    console.error('Error getting tracks for special artist:', err);
    res.status(400).json({ error: 'Error getting tracks for special artist format' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 
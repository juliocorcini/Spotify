require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Inicializar banco de dados se disponível
async function initializeApp() {
  try {
    const { initializeDatabase } = require('./config/database');
    await initializeDatabase();
  } catch (error) {
    console.log('📁 Continuando sem banco de dados (desenvolvimento)');
  }
}

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
        
        // Para cada track filtrada, obter dados completos incluindo preview_url
        for (const track of filteredTracks) {
          try {
            const fullTrackResult = await withRetry(() => spotifyApi.getTrack(track.id));
            const fullTrack = fullTrackResult.body;
            
            // Adicionar detalhes do álbum para cada faixa
            const trackWithAlbum = {
              ...fullTrack,
              album: {
                ...fullTrack.album,
                id: album.id,
                name: album.name,
                images: album.images
              }
            };
            
            allTracks.push(trackWithAlbum);
          } catch (error) {
            console.error(`Error getting full track data for ${track.id}:`, error);
            // Se falhar ao obter dados completos, usar dados básicos sem preview_url
            const trackWithAlbum = {
              ...track,
              preview_url: null, // Marcar como não disponível
              album: {
                id: album.id,
                name: album.name,
                images: album.images
              }
            };
            allTracks.push(trackWithAlbum);
          }
        }
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
    
    // Remover duplicatas similares (mesmo nome, versões diferentes)
    const finalUniqueTracksFiltered = removeSimilarDuplicates(uniqueTracks);
    console.log(`🎵 Final unique tracks after similar duplicates removal: ${finalUniqueTracksFiltered.length}`);
    
    // Aplicar offset e limit
    const paginatedTracks = finalUniqueTracksFiltered.slice(
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
    const { limit = 10, displayName, searchTerms, individualArtists } = req.query;
    
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
    
    // Parse individualArtists if provided (for B2B)
    let artists = [];
    try {
      artists = individualArtists ? JSON.parse(individualArtists) : [];
    } catch (error) {
      console.error('Error parsing individual artists:', error);
      artists = [];
    }
    
    // Processar o nome do artista
    const processedArtist = processArtistName(displayName);
    
    // Se não temos termos passados, usar os do processamento
    if (terms.length === 0) {
      terms = processedArtist.searchTerms;
    }
    
    // Para artistas especiais, calcular um limite maior para garantir variedade
    let actualLimit = parseInt(limit, 10) || 10;
    
    // Para B2B, o limite já vem multiplicado pelo frontend (ex: 5 por artista × 2 artistas = 10 total)
    // Não multiplicar novamente aqui, apenas garantir que temos faixas suficientes para buscar
    if (processedArtist.isB2B) {
      // Aumentar o limite de busca interna para ter mais opções antes da filtragem
      const searchLimit = Math.max(actualLimit * 3, 50); // Buscar mais para ter variedade
      console.log(`🎧 B2B detected: user wants ${actualLimit} total tracks, searching ${searchLimit} tracks for variety`);
    }
    
    // Array para armazenar todas as faixas
    let allTracks = [];
    
    // Se é B2B e temos artistas individuais, implementar busca balanceada
    if (processedArtist.isB2B && artists.length > 0) {
        console.log(`🎧 B2B Processing for: ${artists.map(a => a.name).join(' B2B ')}`);
        
        // Primeiro, buscar colaborações entre os artistas
        try {
            console.log(`🔍 Searching for collaborations between artists...`);
            
            // Criar termos de busca para colaborações
            const collaborationQueries = [];
            
            // Buscar por combinações dos nomes dos artistas
            for (let i = 0; i < artists.length; i++) {
                for (let j = i + 1; j < artists.length; j++) {
                    collaborationQueries.push(`${artists[i].name} ${artists[j].name}`);
                    collaborationQueries.push(`${artists[j].name} ${artists[i].name}`);
                }
            }
            
            // Buscar colaborações usando cada query
            for (const query of collaborationQueries) {
                try {
                    const searchResult = await withRetry(() => spotifyApi.search(query, ['track'], { limit: 50 }));
                    
                    if (searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
                        // Filtrar apenas faixas onde AMBOS os artistas do B2B estão creditados
                        const collaborationTracks = searchResult.body.tracks.items.filter(track => {
                            const trackArtistIds = track.artists.map(artist => artist.id);
                            const foundArtists = artists.filter(artist => trackArtistIds.includes(artist.id));
                            return foundArtists.length >= 2; // Ambos os artistas devem estar presentes
                        });
                        
                        // Adicionar as colaborações encontradas com prioridade máxima
                        collaborationTracks.forEach(track => {
                            const b2bArtistsInTrack = artists.filter(artist => 
                                track.artists.some(trackArtist => trackArtist.id === artist.id)
                            );
                            
                            console.log(`🎭 Real collaboration found: "${track.name}" by ${track.artists.map(a => a.name).join(', ')}`);
                            
                            const trackWithInfo = {
                                ...track,
                                fromArtist: {
                                    id: 'collaboration',
                                    name: b2bArtistsInTrack.map(a => a.name).join(' & '),
                                    searchTerm: query
                                },
                                isFromB2B: true,
                                isCollaboration: true,
                                collaboratingArtists: b2bArtistsInTrack.map(artist => ({ 
                                    id: artist.id, 
                                    name: artist.name 
                                })),
                                allTrackArtists: track.artists.map(artist => ({
                                    id: artist.id,
                                    name: artist.name
                                })),
                                b2bArtistsCount: b2bArtistsInTrack.length,
                                hasOtherArtists: track.artists.length > b2bArtistsInTrack.length
                            };
                            
                            allTracks.push(trackWithInfo);
                        });
                    }
                } catch (error) {
                    console.error(`Error searching for collaboration "${query}":`, error);
                }
            }
        } catch (error) {
            console.error('Error searching for B2B collaborations:', error);
        }
        
        console.log(`✅ Found ${allTracks.length} collaboration tracks`);
        
        // Remover duplicatas similares das colaborações antes de continuar
        allTracks = removeSimilarDuplicates(allTracks);
        console.log(`🧹 After removing similar duplicates: ${allTracks.length} collaboration tracks`);
        
        // Buscar faixas individuais de cada artista para complementar
        const remainingLimit = Math.max(0, actualLimit - allTracks.length);
        if (remainingLimit > 0) {
            const tracksPerIndividualArtist = Math.ceil(remainingLimit / artists.length);
            console.log(`🎵 Need ${remainingLimit} more tracks, ${tracksPerIndividualArtist} per artist`);
            
            for (const artist of artists) {
                try {
                    console.log(`🔍 Fetching top tracks for ${artist.name}...`);
                    
                    // Buscar faixas populares do artista
                    const tracksResult = await withRetry(() => spotifyApi.getArtistTopTracks(artist.id, 'BR'));
                    
                    if (tracksResult.body.tracks && tracksResult.body.tracks.length > 0) {
                        // Filtrar faixas que já não estão na lista (evitar duplicatas)
                        const existingTrackIds = new Set(allTracks.map(track => track.id));
                        const newTracks = tracksResult.body.tracks
                            .filter(track => !existingTrackIds.has(track.id))
                            .slice(0, tracksPerIndividualArtist);
                        
                        console.log(`➕ Adding ${newTracks.length} tracks from ${artist.name}`);
                        
                        // Adicionar informação sobre qual artista do B2B cada faixa pertence
                        const tracksWithArtistInfo = newTracks.map(track => ({
                            ...track,
                            fromArtist: {
                                id: artist.id,
                                name: artist.name,
                                searchTerm: artist.searchTerm
                            },
                            isFromB2B: true,
                            isCollaboration: false,
                            collaboratingArtists: [],
                            allTrackArtists: track.artists.map(artist => ({
                                id: artist.id,
                                name: artist.name
                            })),
                            b2bArtistsCount: 1,
                            hasOtherArtists: track.artists.length > 1
                        }));
                        
                        allTracks = [...allTracks, ...tracksWithArtistInfo];
                    }
                    
                    // Se ainda precisamos de mais faixas, buscar em álbuns
                    const currentArtistTracks = allTracks.filter(track => 
                        track.fromArtist && track.fromArtist.id === artist.id
                    ).length;
                    
                    if (currentArtistTracks < tracksPerIndividualArtist) {
                        try {
                            console.log(`🎵 Searching albums for more ${artist.name} tracks...`);
                            
                            const albumsResult = await withRetry(() => spotifyApi.getArtistAlbums(artist.id, {
                                include_groups: 'album,single',
                                limit: 10
                            }));
                            
                            if (albumsResult.body.items && albumsResult.body.items.length > 0) {
                                for (const album of albumsResult.body.items.slice(0, 5)) {
                                    try {
                                        const albumTracksResult = await withRetry(() => spotifyApi.getAlbumTracks(album.id, { limit: 50 }));
                                        
                                        if (albumTracksResult.body.items && albumTracksResult.body.items.length > 0) {
                                            const existingTrackIds = new Set(allTracks.map(track => track.id));
                                            const filteredTracks = albumTracksResult.body.items
                                                .filter(track => !existingTrackIds.has(track.id))
                                                .slice(0, 2); // Máximo 2 faixas por álbum
                                            
                                            // Para cada track filtrada, obter dados completos incluindo preview_url
                                            for (const track of filteredTracks) {
                                                try {
                                                    const fullTrackResult = await withRetry(() => spotifyApi.getTrack(track.id));
                                                    const fullTrack = fullTrackResult.body;
                                                    
                                                    const albumTrackWithFullData = {
                                                        ...fullTrack,
                                                        album: {
                                                            ...fullTrack.album,
                                                            id: album.id,
                                                            name: album.name,
                                                            images: album.images
                                                        },
                                                        fromArtist: {
                                                            id: artist.id,
                                                            name: artist.name,
                                                            searchTerm: artist.searchTerm
                                                        },
                                                        isFromB2B: true,
                                                        isCollaboration: false,
                                                        collaboratingArtists: [],
                                                        allTrackArtists: fullTrack.artists.map(artist => ({
                                                            id: artist.id,
                                                            name: artist.name
                                                        })),
                                                        b2bArtistsCount: 1,
                                                        hasOtherArtists: fullTrack.artists.length > 1
                                                    };
                                                    
                                                    allTracks.push(albumTrackWithFullData);
                                                } catch (error) {
                                                    console.error(`Error getting full track data for ${track.id}:`, error);
                                                    // Se falhar ao obter dados completos, usar dados básicos sem preview_url
                                                    const albumTrackBasic = {
                                                        ...track,
                                                        preview_url: null, // Marcar como não disponível
                                                        album: {
                                                            id: album.id,
                                                            name: album.name,
                                                            images: album.images
                                                        },
                                                        fromArtist: {
                                                            id: artist.id,
                                                            name: artist.name,
                                                            searchTerm: artist.searchTerm
                                                        },
                                                        isFromB2B: true,
                                                        isCollaboration: false,
                                                        collaboratingArtists: [],
                                                        allTrackArtists: track.artists.map(artist => ({
                                                            id: artist.id,
                                                            name: artist.name
                                                        })),
                                                        b2bArtistsCount: 1,
                                                        hasOtherArtists: track.artists.length > 1
                                                    };
                                                    
                                                    allTracks.push(albumTrackBasic);
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        console.error(`Error getting album tracks for ${album.id}:`, error);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`Error getting albums for artist ${artist.id}:`, error);
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching tracks for B2B artist "${artist.name}":`, error);
                }
            }
        }
    } else {
      // Lógica original para não-B2B ou quando não temos artistas individuais
      const tracksPerTerm = Math.ceil(actualLimit / Math.max(1, terms.length));
      
      // Para cada termo de busca, buscar faixas
      for (const [index, term] of terms.entries()) {
        try {
          // Para special sets, buscamos músicas do artista com o tipo especial
          if (processedArtist.isSpecial && index === 0) {
            // Buscar faixas específicas para o tipo de set especial
            const searchResult = await withRetry(() => spotifyApi.search(term, ['track'], { limit: 20 }));
            
            if (searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
              const tracksWithInfo = searchResult.body.tracks.items.map(track => ({
                ...track,
                isSpecialSet: true,
                specialType: processedArtist.originalName
              }));
              allTracks = [...allTracks, ...tracksWithInfo];
            }
          }
          // Caso seja um artista individual
          else {
            // Obter o ID do artista através da busca
            const artistResult = await withRetry(() => spotifyApi.searchArtists(term, { limit: 1 }));
            
            if (artistResult.body.artists && artistResult.body.artists.items.length > 0) {
              const foundArtistId = artistResult.body.artists.items[0].id;
              const foundArtistName = artistResult.body.artists.items[0].name;
              
              // Buscar faixas populares deste artista
              const tracksResult = await withRetry(() => spotifyApi.getArtistTopTracks(foundArtistId, 'BR'));
              
              if (tracksResult.body.tracks && tracksResult.body.tracks.length > 0) {
                // Limitar ao número desejado por termo
                const topTracks = tracksResult.body.tracks.slice(0, tracksPerTerm).map(track => ({
                  ...track,
                  fromArtist: {
                    id: foundArtistId,
                    name: foundArtistName,
                    searchTerm: term
                  }
                }));
                allTracks = [...allTracks, ...topTracks];
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching tracks for term "${term}":`, error);
        }
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
    
    // Remover duplicatas similares (mesmo nome, versões diferentes)
    const finalUniqueTracksFiltered = removeSimilarDuplicates(uniqueTracks);
    console.log(`🎵 Final unique tracks after similar duplicates removal: ${finalUniqueTracksFiltered.length}`);
    
    // Para B2B, embaralhar as faixas para misturar os artistas
    if (processedArtist.isB2B) {
      // Separar colaborações das faixas individuais
      const collaborations = finalUniqueTracksFiltered.filter(track => track.isCollaboration);
      const individualTracks = finalUniqueTracksFiltered.filter(track => !track.isCollaboration);
      
      // Separar faixas individuais por artista
      const artistBuckets = new Map();
      
      individualTracks.forEach(track => {
        const artistKey = track.fromArtist ? track.fromArtist.id : 'unknown';
        if (!artistBuckets.has(artistKey)) {
          artistBuckets.set(artistKey, []);
        }
        artistBuckets.get(artistKey).push(track);
      });
      
      // Intercalar faixas dos diferentes artistas
      const interleavedTracks = [];
      const maxLength = Math.max(...Array.from(artistBuckets.values()).map(bucket => bucket.length));
      
      for (let i = 0; i < maxLength; i++) {
        for (const [artistId, tracks] of artistBuckets.entries()) {
          if (i < tracks.length) {
            interleavedTracks.push(tracks[i]);
          }
        }
      }
      
      // Combinar: colaborações primeiro, depois faixas individuais intercaladas
      const finalTracks = [...collaborations, ...interleavedTracks];
      
      // Limitar ao número solicitado
      const limitedTracks = finalTracks.slice(0, actualLimit);
      
      // Retornar as faixas encontradas com informações B2B
      res.status(200).json({
        displayName: displayName,
        originalName: processedArtist.originalName,
        isB2B: processedArtist.isB2B,
        isSpecial: processedArtist.isSpecial,
        tracks: limitedTracks,
        individualArtists: artists,
        totalTracksRequested: actualLimit,
        artistDistribution: Array.from(artistBuckets.entries()).map(([artistId, tracks]) => ({
          artistId,
          artistName: tracks[0]?.fromArtist?.name || 'Unknown',
          trackCount: tracks.length
        }))
      });
    } else {
      // Limitar ao número solicitado para não-B2B
      const limitedTracks = finalUniqueTracksFiltered.slice(0, actualLimit);
      
      // Retornar as faixas encontradas
      res.status(200).json({
        displayName: displayName,
        originalName: processedArtist.originalName,
        isB2B: processedArtist.isB2B,
        isSpecial: processedArtist.isSpecial,
        tracks: limitedTracks
      });
    }
    
  } catch (err) {
    console.error('Error getting tracks for special artist:', err);
    res.status(400).json({ error: 'Error getting tracks for special artist format' });
  }
});

// Função para remover duplicatas similares
function removeSimilarDuplicates(tracks) {
    const seen = new Map(); // Map de nome normalizado -> melhor track
    const result = [];
    
    // Função para normalizar nome da música (remover feat., VIP, remix, etc. para comparação)
    function normalizeTrackName(name) {
        return name
            .toLowerCase()
            .replace(/\s*\(.*?\)\s*/g, '') // Remove tudo entre parênteses
            .replace(/\s*\[.*?\]\s*/g, '') // Remove tudo entre colchetes
            .replace(/\s*feat\.?\s*.*/i, '') // Remove feat. e tudo depois
            .replace(/\s*ft\.?\s*.*/i, '') // Remove ft. e tudo depois
            .replace(/\s*-\s*vip\s*mix.*/i, '') // Remove VIP mix
            .replace(/\s*-\s*remix.*/i, '') // Remove remix
            .replace(/\s+/g, ' ') // Normaliza espaços
            .trim();
    }
    
    // Função para determinar qual track é melhor (prioridade: original > VIP > remix > extended)
    function getTrackPriority(track) {
        const name = track.name.toLowerCase();
        const albumName = track.album?.name?.toLowerCase() || '';
        
        // Prioridade mais alta para originais
        if (!name.includes('(') && !name.includes('[')) {
            return 100;
        }
        
        // Penalizar VIP mixes
        if (name.includes('vip')) {
            return 30;
        }
        
        // Penalizar remixes
        if (name.includes('remix')) {
            return 20;
        }
        
        // Penalizar extended versions
        if (name.includes('extended')) {
            return 15;
        }
        
        // Preferir álbuns principais vs compilações
        if (albumName.includes('annual') || albumName.includes('compilation') || albumName.includes('best of')) {
            return 10;
        }
        
        // Default
        return 50;
    }
    
    tracks.forEach(track => {
        const normalizedName = normalizeTrackName(track.name);
        const priority = getTrackPriority(track);
        
        if (seen.has(normalizedName)) {
            const existingTrack = seen.get(normalizedName);
            const existingPriority = getTrackPriority(existingTrack);
            
            // Se o novo track tem prioridade maior, substitui
            if (priority > existingPriority) {
                console.log(`🔄 Replacing "${existingTrack.name}" with "${track.name}" (priority ${priority} > ${existingPriority})`);
                seen.set(normalizedName, track);
            } else {
                console.log(`⏭️ Skipping "${track.name}" - keeping "${existingTrack.name}" (priority ${existingPriority} >= ${priority})`);
            }
        } else {
            seen.set(normalizedName, track);
        }
    });
    
    // Converter Map de volta para array
    return Array.from(seen.values());
}

// Start the server
async function startServer() {
  await initializeApp();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌐 Access: http://localhost:${PORT}`);
  });
}

startServer().catch(console.error); 
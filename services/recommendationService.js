const { spotifyApi } = require('../config/spotify');
const { withRetry } = require('../utils/retry');
const fetch = require('node-fetch');

// Serviço para obter recomendações baseadas em busca
async function getSearchBasedRecommendations(seedTracks, seedArtists, limit = 20) {
  // Coletar informações sobre artistas e faixas para usar na busca
  let searchQueries = [];
  let allResults = [];
  let artistsInfo = new Map(); // Para armazenar informações dos artistas
  let trackGenres = new Set(); // Para armazenar gêneros
  
  // Se temos seed_artists, coletar informações sobre eles primeiro
  if (seedArtists && seedArtists.length > 0) {
    // Processar cada artista
    for (const artistId of seedArtists) {
      try {
        const artistInfo = await withRetry(() => spotifyApi.getArtist(artistId));
        const artist = artistInfo.body;
        
        if (artist && artist.name) {
          // Armazenar informações do artista
          artistsInfo.set(artistId, {
            name: artist.name,
            genres: artist.genres || [],
            popularity: artist.popularity || 0,
            resultsCount: 0 // Contador para balanceamento
          });
          
          // Coletar gêneros
          if (artist.genres && artist.genres.length > 0) {
            artist.genres.forEach(genre => trackGenres.add(genre));
          }
          
          // Adicionar consultas baseadas no nome do artista
          searchQueries.push({
            query: artist.name,
            artistId: artistId,
            weight: 1.0
          });
          
          // Se o artista tem gêneros, usar nas consultas
          if (artist.genres && artist.genres.length > 0) {
            const topGenres = artist.genres.slice(0, 2); // Usar até 2 gêneros principais
            topGenres.forEach(genre => {
              searchQueries.push({
                query: `${genre} ${artist.name}`,
                artistId: artistId,
                weight: 1.2
              });
            });
          }
        }
      } catch (error) {
        console.error(`Error getting artist info for ${artistId}:`, error);
      }
    }
  }
  
  // Se temos seed_tracks, buscar informações sobre elas
  if (seedTracks && seedTracks.length > 0) {
    for (const trackId of seedTracks) {
      try {
        const trackInfo = await withRetry(() => spotifyApi.getTrack(trackId));
        const track = trackInfo.body;
        
        if (track && track.artists && track.artists.length > 0) {
          const mainArtist = track.artists[0];
          const trackName = track.name;
          const artistId = mainArtist.id;
          
          // Adicionar ao mapa de artistas se ainda não existe
          if (!artistsInfo.has(artistId)) {
            try {
              const artistInfo = await withRetry(() => spotifyApi.getArtist(artistId));
              const artist = artistInfo.body;
              
              artistsInfo.set(artistId, {
                name: artist.name,
                genres: artist.genres || [],
                popularity: artist.popularity || 0,
                resultsCount: 0
              });
              
              // Coletar gêneros
              if (artist.genres && artist.genres.length > 0) {
                artist.genres.forEach(genre => trackGenres.add(genre));
              }
            } catch (error) {
              console.error(`Error getting artist info for track's artist ${artistId}:`, error);
              artistsInfo.set(artistId, {
                name: mainArtist.name,
                genres: [],
                popularity: 0,
                resultsCount: 0
              });
            }
          }
          
          // Tentar obter atributos da faixa (audio features)
          try {
            const audioFeatures = await withRetry(() => spotifyApi.getAudioFeaturesForTrack(trackId));
            
            if (audioFeatures.body) {
              const features = audioFeatures.body;
              
              // Criar consultas baseadas em características da música
              const artistName = artistsInfo.get(artistId).name;
              
              // Consulta baseada no ritmo (dançabilidade + energia)
              if (features.danceability > 0.7 || features.energy > 0.7) {
                searchQueries.push({
                  query: `${artistName} upbeat energetic dance`,
                  artistId: artistId,
                  weight: 1.3
                });
              } else if (features.danceability < 0.4 && features.energy < 0.4) {
                searchQueries.push({
                  query: `${artistName} calm slow`,
                  artistId: artistId,
                  weight: 1.3
                });
              }
              
              // Consulta baseada na instrumentalidade vs. vocal
              if (features.instrumentalness > 0.5) {
                searchQueries.push({
                  query: `${artistName} instrumental`,
                  artistId: artistId,
                  weight: 1.2
                });
              } else if (features.speechiness > 0.3) {
                searchQueries.push({
                  query: `${artistName} vocal rap`,
                  artistId: artistId,
                  weight: 1.2
                });
              }
            }
          } catch (error) {
            console.error(`Error getting audio features for ${trackId}:`, error);
          }
          
          // Consultas específicas baseadas na faixa
          searchQueries.push({
            query: `${artistsInfo.get(artistId).name} similar to ${trackName}`,
            artistId: artistId,
            weight: 1.5
          });
        }
      } catch (error) {
        console.error(`Error getting track info for ${trackId}:`, error);
      }
    }
  }
  
  // Adicionar consultas de gênero se temos gêneros suficientes
  if (trackGenres.size > 0) {
    const genres = Array.from(trackGenres).slice(0, 5); // Limitar a 5 gêneros para evitar muitas consultas
    
    genres.forEach(genre => {
      searchQueries.push({
        query: `${genre} music`,
        artistId: null, // Não está associado a um artista específico
        weight: 1.0
      });
    });
  }
  
  // Se não conseguimos construir nenhuma consulta, retornar erro
  if (searchQueries.length === 0) {
    throw new Error('Could not create search queries from provided seeds');
  }
  
  // Randomizar a ordem das consultas para melhor distribuição
  searchQueries.sort(() => Math.random() - 0.5);
  
  // Para cada consulta, fazer uma busca e coletar os resultados
  for (const queryInfo of searchQueries) {
    try {
      const searchResult = await withRetry(() => spotifyApi.search(queryInfo.query, ['track'], { limit: 15 }));
      
      if (searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
        // Pegar os resultados a partir do segundo item para evitar a mesma música
        const items = searchResult.body.tracks.items.slice(1);
        
        // Dar peso aos resultados
        const weightedItems = items.map(item => ({
          track: item,
          weight: queryInfo.weight,
          artistId: queryInfo.artistId
        }));
        
        allResults = [...allResults, ...weightedItems];
        
        // Atualizar contador de resultados para este artista
        if (queryInfo.artistId) {
          const artistInfo = artistsInfo.get(queryInfo.artistId);
          if (artistInfo) {
            artistInfo.resultsCount += items.length;
            artistsInfo.set(queryInfo.artistId, artistInfo);
          }
        }
      }
    } catch (error) {
      console.error(`Error searching for "${queryInfo.query}":`, error);
    }
  }
  
  // Verificar o balanceamento entre artistas
  const artistCounts = Array.from(artistsInfo.values()).map(info => info.resultsCount);
  const maxCount = Math.max(...artistCounts, 1);
  const minCount = Math.min(...artistCounts, 1);
  
  // Se há um grande desequilíbrio, reajustar os pesos
  if (maxCount > minCount * 3 && artistsInfo.size > 1) {
    console.log(`Balanceando resultados. Max: ${maxCount}, Min: ${minCount}`);
    
    // Ajustar os pesos para balancear resultados
    allResults = allResults.map(result => {
      if (result.artistId) {
        const artistInfo = artistsInfo.get(result.artistId);
        if (artistInfo && artistInfo.resultsCount > 0) {
          // Quanto mais resultados o artista já tem, menor o peso
          const balanceFactor = 1 - (artistInfo.resultsCount / (maxCount * 2));
          result.weight *= (balanceFactor + 0.5); // Nunca reduzir a menos de 50% do peso original
        }
      }
      return result;
    });
  }
  
  // Ordenar por peso (importância)
  allResults.sort((a, b) => b.weight - a.weight);
  
  // Extrair as faixas após a ordenação
  const sortedTracks = allResults.map(result => result.track);
  
  // Remover duplicatas baseadas no ID da faixa
  const uniqueTracks = [];
  const seenIds = new Set();
  
  for (const track of sortedTracks) {
    if (!seenIds.has(track.id)) {
      seenIds.add(track.id);
      uniqueTracks.push(track);
    }
  }
  
  // Filtrar músicas das seeds (não queremos incluir as próprias seeds)
  const seedTrackIds = seedTracks ? new Set(seedTracks) : new Set();
  const filteredTracks = uniqueTracks.filter(track => !seedTrackIds.has(track.id));
  
  // Balancear resultados finais entre os artistas
  let balancedTracks = [];
  const artistBuckets = new Map();
  
  // Criar "buckets" para cada artista semente
  artistsInfo.forEach((info, artistId) => {
    artistBuckets.set(artistId, []);
  });
  
  // Adicionar também um bucket para resultados não relacionados diretamente a artistas sementes
  artistBuckets.set('other', []);
  
  // Distribuir faixas nos buckets apropriados
  filteredTracks.forEach(track => {
    let assigned = false;
    
    // Verificar se a faixa pertence a algum dos artistas sementes
    for (const [artistId, bucket] of artistBuckets.entries()) {
      if (artistId !== 'other' && track.artists.some(artist => artist.id === artistId)) {
        bucket.push(track);
        assigned = true;
        break;
      }
    }
    
    // Se não foi atribuída a nenhum bucket específico, colocar em "outros"
    if (!assigned) {
      artistBuckets.get('other').push(track);
    }
  });
  
  // Construir a lista final de forma intercalada, para balancear os artistas
  const maxTracksPerArtist = Math.ceil(parseInt(limit, 10) / (artistBuckets.size || 1));
  let remaining = parseInt(limit, 10);
  
  while (remaining > 0 && balancedTracks.length < remaining) {
    let addedThisRound = false;
    
    // Pegar uma faixa de cada bucket, em ordem
    for (const [artistId, bucket] of artistBuckets.entries()) {
      if (bucket.length > 0) {
        balancedTracks.push(bucket.shift());
        addedThisRound = true;
        remaining--;
        
        if (remaining <= 0) break;
      }
    }
    
    // Se não adicionamos nada nesta rodada, significa que todos os buckets estão vazios
    if (!addedThisRound) break;
  }
  
  // Se ainda não temos faixas suficientes, adicionar mais do bucket "outros"
  if (balancedTracks.length < parseInt(limit, 10) && artistBuckets.get('other').length > 0) {
    const moreNeeded = parseInt(limit, 10) - balancedTracks.length;
    balancedTracks = [...balancedTracks, ...artistBuckets.get('other').slice(0, moreNeeded)];
  }
  
  return {
    tracks: balancedTracks,
    seeds: []
  };
}

module.exports = {
  getSearchBasedRecommendations
}; 
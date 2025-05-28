// Importar spotifyPreviewFinder como função direta (não constructor)
const spotifyPreviewFinder = require('spotify-preview-finder');

// Cache para armazenar previews encontrados (evitar requests repetidos)
const previewCache = new Map();

/**
 * Buscar preview URL para uma música
 * @param {string} trackName - Nome da música
 * @param {string} artistName - Nome do artista
 * @param {string} trackId - ID da música no Spotify (opcional, para cache)
 * @returns {Promise<string|null>} URL do preview ou null se não encontrado
 */
async function findPreviewUrl(trackName, artistName, trackId = null) {
  try {
    // Verificar cache primeiro
    const cacheKey = trackId || `${artistName}-${trackName}`;
    if (previewCache.has(cacheKey)) {
      return previewCache.get(cacheKey);
    }

    // Buscar preview usando a busca direta do pacote
    const searchQuery = `${trackName} ${artistName}`;
    const result = await spotifyPreviewFinder(searchQuery, 1); // Limitar a 1 resultado
    
    let previewUrl = null;
    if (result && result.success && result.results && result.results.length > 0) {
      const firstResult = result.results[0];
      if (firstResult.previewUrls && firstResult.previewUrls.length > 0) {
        previewUrl = firstResult.previewUrls[0];
      }
    }

    // Armazenar no cache (limitado a 1000 entradas para não consumir muita memória)
    if (previewCache.size < 1000) {
      previewCache.set(cacheKey, previewUrl);
    }

    return previewUrl;
  } catch (error) {
    console.error(`Erro ao buscar preview para "${trackName}" - "${artistName}":`, error.message);
    return null;
  }
}

/**
 * Buscar previews para múltiplas músicas
 * @param {Array} tracks - Array de objetos com {name, artists, id}
 * @returns {Promise<Array>} Array de objetos com preview_url adicionado
 */
async function enrichTracksWithPreviews(tracks) {
  const enrichedTracks = [];

  for (const track of tracks) {
    try {
      const artistName = track.artists && track.artists[0] ? track.artists[0].name : '';
      const previewUrl = await findPreviewUrl(track.name, artistName, track.id);
      
      enrichedTracks.push({
        ...track,
        preview_url: previewUrl || track.preview_url // Manter o original se existir
      });

      // Pequeno delay para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Erro ao processar preview para track ${track.name}:`, error.message);
      enrichedTracks.push(track); // Adicionar sem preview em caso de erro
    }
  }

  return enrichedTracks;
}

/**
 * Limpar cache (útil para manutenção)
 */
function clearCache() {
  previewCache.clear();
}

/**
 * Obter estatísticas do cache
 */
function getCacheStats() {
  return {
    size: previewCache.size,
    maxSize: 1000
  };
}

module.exports = {
  findPreviewUrl,
  enrichTracksWithPreviews,
  clearCache,
  getCacheStats
}; 
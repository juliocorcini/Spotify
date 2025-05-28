// Função para comparar nomes de artistas
function compareArtistNames(requested, found) {
  // Converter para minúsculas e remover espaços extras
  const requestedClean = requested.toLowerCase().trim();
  const foundClean = found.toLowerCase().trim();
  
  // 1. Verificar correspondência exata
  if (requestedClean === foundClean) {
    return true;
  }
  
  // 2. Verificar se o nome encontrado contém o nome solicitado completamente
  if (foundClean.includes(requestedClean) || requestedClean.includes(foundClean)) {
    return true;
  }
  
  // 3. Calcular a similaridade usando distância de Levenshtein
  const maxLength = Math.max(requestedClean.length, foundClean.length);
  if (maxLength === 0) return true; // Ambos vazios
  
  const distance = levenshteinDistance(requestedClean, foundClean);
  const similarity = (maxLength - distance) / maxLength;
  
  // Exigir pelo menos 80% de similaridade
  return similarity >= 0.8;
}

// Função para calcular a distância de Levenshtein (similaridade entre strings)
function levenshteinDistance(a, b) {
  const matrix = [];
  
  // Inicializar a matriz
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  // Preencher a matriz
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substituição
          matrix[i][j - 1] + 1,     // inserção
          matrix[i - 1][j] + 1      // exclusão
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Nova função para processar nomes de artistas especiais (B2B, special sets, etc.)
function processArtistName(artistName) {
  const originalName = artistName.trim();
  let processedInfo = {
    originalName: originalName,
    displayName: originalName,
    searchTerms: [],
    isB2B: false,
    isSpecial: false
  };
  
  // Verificar se é um B2B (back-to-back, dois artistas juntos)
  if (originalName.includes('B2B')) {
    processedInfo.isB2B = true;
    
    // Extrair os nomes dos artistas
    const artists = originalName.split('B2B').map(name => name.trim());
    
    // Nome de exibição permanece o mesmo
    processedInfo.displayName = originalName;
    
    // Adicionar termos de busca para encontrar colaborações entre os artistas
    if (artists.length >= 2) {
      // Buscar colaborações entre os artistas
      processedInfo.searchTerms.push(`${artists[0]} ${artists[1]}`);
      processedInfo.searchTerms.push(`${artists[1]} ${artists[0]}`);
      
      // Também buscar cada artista individualmente
      artists.forEach(artist => {
        if (artist && artist.length > 0) {
          processedInfo.searchTerms.push(artist);
        }
      });
    } else {
      // Fallback se não conseguirmos dividir corretamente
      processedInfo.searchTerms.push(originalName);
    }
  } 
  // Verificar se é um special set ou similar (entre parênteses)
  else if (originalName.includes('(') && originalName.includes(')')) {
    processedInfo.isSpecial = true;
    
    // Extrair o nome base do artista e o tipo de set
    const baseArtist = originalName.substring(0, originalName.indexOf('(')).trim();
    const specialType = originalName.match(/\((.*?)\)/)[1].trim();
    
    // Nome de exibição permanece o mesmo
    processedInfo.displayName = originalName;
    
    // Buscar pelo set especial primeiro
    processedInfo.searchTerms.push(`${baseArtist} ${specialType}`);
    
    // Depois buscar pelo artista normal
    processedInfo.searchTerms.push(baseArtist);
  } 
  // Artista normal
  else {
    processedInfo.searchTerms.push(originalName);
  }
  
  return processedInfo;
}

module.exports = {
  compareArtistNames,
  levenshteinDistance,
  processArtistName
}; 
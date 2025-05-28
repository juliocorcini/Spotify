// Função utilitária para tentativas com retry
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Verificar se é um erro de rede (timeout, conexão recusada, etc.)
      const isNetworkError = error.code === 'ETIMEDOUT' || 
                            error.code === 'ENETUNREACH' || 
                            error.code === 'ECONNREFUSED' ||
                            error.code === 'ENOTFOUND';
      
      // Se não for erro de rede ou for a última tentativa, propagar o erro
      if (!isNetworkError || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Registrar a tentativa
      console.log(`Tentativa ${attempt + 1} falhou. Tentando novamente em ${delay}ms...`);
      lastError = error;
      
      // Esperar antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Aumentar o delay para a próxima tentativa (backoff exponencial)
      delay *= 2;
    }
  }
  
  throw lastError;
}

module.exports = { withRetry }; 
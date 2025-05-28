const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Inicializar tabelas se não existirem
async function initializeDatabase() {
  try {
    console.log('🗄️ Inicializando banco de dados...');
    
    // Criar tabela de usuários
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        display_name VARCHAR(255),
        email VARCHAR(255),
        followers INTEGER DEFAULT 0,
        images JSONB,
        first_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Criar tabela de playlists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        user_id VARCHAR(255) REFERENCES users(id),
        external_urls JSONB,
        tracks_total INTEGER DEFAULT 0,
        extra_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Criar índices para melhor performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON playlists(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login)`);
    
    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    // Não falhar completamente se não conseguir conectar ao DB
    // Vai usar fallback para arquivo local em desenvolvimento
  }
}

module.exports = { pool, initializeDatabase }; 
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        country VARCHAR(10),
        profile_url VARCHAR(500)
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
        artists_count INTEGER DEFAULT 0,
        type VARCHAR(50) DEFAULT 'custom',
        extra_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Adicionar a coluna type se não existir (para playlists existentes)
    await pool.query(`
      ALTER TABLE playlists 
      ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'custom'
    `);
    
    // Adicionar a coluna artists_count se não existir
    await pool.query(`
      ALTER TABLE playlists 
      ADD COLUMN IF NOT EXISTS artists_count INTEGER DEFAULT 0
    `);
    
    // Adicionar colunas faltantes na tabela users
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS country VARCHAR(10)
    `);
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS profile_url VARCHAR(500)
    `);
    
    // Migrar playlists existentes para definir o tipo correto baseado na descrição
    await pool.query(`
      UPDATE playlists 
      SET type = CASE 
        WHEN description LIKE '%artistas favoritos%' OR name LIKE '%Artistas Favoritos%' THEN 'top_artists'
        ELSE 'custom'
      END
      WHERE type IS NULL OR type = 'custom'
    `);
    
    // Tentar atualizar artists_count para playlists que têm dados do extra_data
    await pool.query(`
      UPDATE playlists 
      SET artists_count = CASE 
        WHEN extra_data ? 'requestedArtists' THEN 
          json_array_length((extra_data->>'requestedArtists')::json)
        ELSE 0 
      END
      WHERE artists_count = 0 OR artists_count IS NULL
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
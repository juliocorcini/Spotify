const fs = require('fs');
const path = require('path');

// Tentar importar configuração do banco de dados
let pool = null;
try {
  const { pool: dbPool } = require('../config/database');
  pool = dbPool;
} catch (error) {
  console.log('📁 Banco de dados não configurado, usando arquivos locais');
}

// Caminhos para arquivos de dados (fallback)
const USERS_DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');
const PLAYLISTS_DATA_FILE = path.join(__dirname, '..', 'data', 'playlists.json');

// Função para carregar dados do arquivo (fallback)
function loadData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error(`Erro ao carregar dados de ${filePath}:`, error);
    return [];
  }
}

// Função para salvar dados no arquivo (fallback)
function saveData(filePath, data) {
  try {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Erro ao salvar dados em ${filePath}:`, error);
  }
}

// Carregar dados existentes (só para fallback)
let users = [];
let playlists = [];

// Verificar se estamos usando banco de dados ou arquivos
const usingDatabase = pool && process.env.DATABASE_URL;

if (!usingDatabase) {
  users = loadData(USERS_DATA_FILE);
  playlists = loadData(PLAYLISTS_DATA_FILE);
  console.log('📁 Usando armazenamento em arquivos locais');
} else {
  console.log('🗄️ Usando PostgreSQL para persistência de dados');
}

// Função para registrar usuário
async function registerUser(userData) {
  if (usingDatabase) {
    try {
      // Verificar se usuário já existe
      const existingUser = await pool.query('SELECT id FROM users WHERE id = $1', [userData.id]);
      
      if (existingUser.rows.length > 0) {
        // Atualizar usuário existente
        await pool.query(`
          UPDATE users SET 
            display_name = $2, 
            email = $3, 
            country = $4,
            profile_url = $5,
            followers = $6, 
            images = $7, 
            last_login = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [
          userData.id, 
          userData.display_name, 
          userData.email, 
          userData.country,
          userData.profileUrl,
          userData.followers?.total || 0, 
          JSON.stringify(userData.images || [])
        ]);
      } else {
        // Inserir novo usuário
        await pool.query(`
          INSERT INTO users (id, display_name, email, country, profile_url, followers, images, first_login, last_login)
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          userData.id, 
          userData.display_name, 
          userData.email, 
          userData.country,
          userData.profileUrl,
          userData.followers?.total || 0, 
          JSON.stringify(userData.images || [])
        ]);
      }
    } catch (error) {
      console.error('Erro ao registrar usuário no banco:', error);
      // Fallback para arquivo
      registerUserFile(userData);
    }
  } else {
    registerUserFile(userData);
  }
}

// Função para registrar usuário em arquivo (fallback)
function registerUserFile(userData) {
  const existingUserIndex = users.findIndex(u => u.id === userData.id);
  
  if (existingUserIndex >= 0) {
    // Atualizar usuário existente
    users[existingUserIndex] = {
      ...users[existingUserIndex],
      ...userData,
      lastLogin: new Date().toISOString()
    };
  } else {
    // Adicionar novo usuário
    users.push({
      ...userData,
      firstLogin: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    });
  }
  
  saveData(USERS_DATA_FILE, users);
}

// Função para registrar playlist
async function registerPlaylist(playlistData, userId, extraData = {}) {
  if (usingDatabase) {
    try {
      await pool.query(`
        INSERT INTO playlists (id, name, description, user_id, external_urls, tracks_total, artists_count, type, extra_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          tracks_total = EXCLUDED.tracks_total,
          artists_count = EXCLUDED.artists_count,
          type = EXCLUDED.type,
          extra_data = EXCLUDED.extra_data
      `, [
        playlistData.id,
        playlistData.name,
        playlistData.description || '',
        userId,
        JSON.stringify(playlistData.external_urls || {}),
        playlistData.tracks?.total || 0,
        extraData.artistsCount || playlistData.artistsCount || 0,
        extraData.type || playlistData.type || 'custom',
        JSON.stringify(extraData)
      ]);
    } catch (error) {
      console.error('Erro ao registrar playlist no banco:', error);
      // Fallback para arquivo
      registerPlaylistFile(playlistData, userId, extraData);
    }
  } else {
    registerPlaylistFile(playlistData, userId, extraData);
  }
}

// Função para registrar playlist em arquivo (fallback)
function registerPlaylistFile(playlistData, userId, extraData = {}) {
  playlists.push({
    ...playlistData,
    userId,
    createdAt: new Date().toISOString(),
    type: extraData.type || playlistData.type || 'custom',
    artistsCount: extraData.artistsCount || playlistData.artistsCount || 0,
    trackCount: playlistData.tracks?.total || 0,
    ...extraData
  });
  
  saveData(PLAYLISTS_DATA_FILE, playlists);
}

// Função para obter todos os usuários
async function getUsers() {
  if (usingDatabase) {
    try {
      const result = await pool.query(`
        SELECT 
          id, 
          display_name, 
          email, 
          country,
          profile_url as "profileUrl",
          followers, 
          images, 
          first_login as "firstLogin", 
          last_login as "lastLogin"
        FROM users 
        ORDER BY last_login DESC
      `);
      
      return result.rows.map(user => ({
        ...user,
        images: typeof user.images === 'string' ? JSON.parse(user.images) : user.images
      }));
    } catch (error) {
      console.error('Erro ao buscar usuários no banco:', error);
      return users; // Fallback
    }
  }
  
  return users;
}

// Função para obter todas as playlists
async function getPlaylists() {
  if (usingDatabase) {
    try {
      const result = await pool.query(`
        SELECT 
          p.id, 
          p.name, 
          p.description, 
          p.user_id as "userId", 
          p.external_urls as "external_urls", 
          p.tracks_total, 
          p.artists_count,
          p.type,
          p.extra_data, 
          p.created_at as "createdAt",
          u.display_name as "userDisplayName"
        FROM playlists p
        LEFT JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
      `);
      
      return result.rows.map(playlist => ({
        ...playlist,
        trackCount: playlist.tracks_total,
        artistsCount: playlist.artists_count,
        external_urls: typeof playlist.external_urls === 'string' ? JSON.parse(playlist.external_urls) : playlist.external_urls,
        extra_data: typeof playlist.extra_data === 'string' ? JSON.parse(playlist.extra_data) : playlist.extra_data
      }));
    } catch (error) {
      console.error('Erro ao buscar playlists no banco:', error);
      return playlists; // Fallback
    }
  }
  
  return playlists;
}

// Função para obter uma playlist específica
async function getPlaylist(playlistId) {
  if (usingDatabase) {
    try {
      const result = await pool.query(`
        SELECT 
          p.id, 
          p.name, 
          p.description, 
          p.user_id as "userId", 
          p.external_urls as "external_urls", 
          p.tracks_total, 
          p.artists_count,
          p.type,
          p.extra_data, 
          p.created_at as "createdAt",
          u.display_name as "userDisplayName"
        FROM playlists p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.id = $1
      `, [playlistId]);
      
      if (result.rows.length > 0) {
        const playlist = result.rows[0];
        return {
          ...playlist,
          trackCount: playlist.tracks_total,
          artistsCount: playlist.artists_count,
          external_urls: typeof playlist.external_urls === 'string' ? JSON.parse(playlist.external_urls) : playlist.external_urls,
          extra_data: typeof playlist.extra_data === 'string' ? JSON.parse(playlist.extra_data) : playlist.extra_data
        };
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao buscar playlist específica no banco:', error);
      return playlists.find(p => p.id === playlistId); // Fallback
    }
  }
  
  return playlists.find(p => p.id === playlistId);
}

module.exports = {
  registerUser,
  registerPlaylist,
  getUsers,
  getPlaylists,
  getPlaylist
}; 
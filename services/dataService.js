const fs = require('fs');
const path = require('path');

// Caminhos para arquivos de dados
const USERS_DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');
const PLAYLISTS_DATA_FILE = path.join(__dirname, '..', 'data', 'playlists.json');

// Função para carregar dados do arquivo
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

// Função para salvar dados no arquivo
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

// Carregar dados existentes
let users = loadData(USERS_DATA_FILE);
let playlists = loadData(PLAYLISTS_DATA_FILE);

// Função para registrar usuário
function registerUser(userData) {
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
function registerPlaylist(playlistData, userId, extraData = {}) {
  playlists.push({
    ...playlistData,
    userId,
    createdAt: new Date().toISOString(),
    ...extraData
  });
  
  saveData(PLAYLISTS_DATA_FILE, playlists);
}

// Função para obter todos os usuários
function getUsers() {
  return users;
}

// Função para obter todas as playlists
function getPlaylists() {
  return playlists;
}

// Função para obter uma playlist específica
function getPlaylist(playlistId) {
  return playlists.find(p => p.id === playlistId);
}

module.exports = {
  registerUser,
  registerPlaylist,
  getUsers,
  getPlaylists,
  getPlaylist
}; 
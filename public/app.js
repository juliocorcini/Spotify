// Elementos DOM
const loginButton = document.getElementById('login-button');
const profileSection = document.querySelector('.profile-section');
const loginSection = document.querySelector('.login-section');
const playlistSection = document.querySelector('.playlist-section');
const profileImage = document.getElementById('profile-image');
const displayName = document.getElementById('display-name');
const userId = document.getElementById('user-id');
const email = document.getElementById('email');
const followers = document.getElementById('followers');
const createPlaylistButton = document.getElementById('create-playlist-button');
const createCustomPlaylistButton = document.getElementById('create-custom-playlist-button');
const artistsInput = document.getElementById('artists-input');
const tracksPerArtist = document.getElementById('tracks-per-artist');
const playlistNameInput = document.getElementById('playlist-name-input');
const resultMessage = document.getElementById('result-message');
const playlistName = document.getElementById('playlist-name');
const playlistDescription = document.getElementById('playlist-description');
const playlistLink = document.getElementById('playlist-link');
const playlistArtists = document.getElementById('playlist-artists');
const backToProfileButton = document.getElementById('back-to-profile');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Armazenar tokens
let accessToken = '';
let refreshToken = '';
let expiresIn = 0;

// Verificar se temos um token no localStorage ou nos parâmetros de URL
function checkAuth() {
    // Verificar parâmetros de URL para tokens (se redirecionado após login)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('access_token');
    const refresh = urlParams.get('refresh_token');
    const expires = urlParams.get('expires_in');
    
    if (token) {
        // Temos tokens na URL após login
        accessToken = token;
        refreshToken = refresh;
        expiresIn = expires;
        
        // Salvar tokens
        localStorage.setItem('spotify_access_token', accessToken);
        localStorage.setItem('spotify_refresh_token', refreshToken);
        localStorage.setItem('spotify_token_expiry', new Date().getTime() + (expiresIn * 1000));
        
        // Limpar a URL para não mostrar os tokens
        window.history.replaceState({}, document.title, '/');
        
        // Mostrar o perfil
        showProfile();
        return;
    }
    
    // Verificar se já temos um token guardado
    accessToken = localStorage.getItem('spotify_access_token');
    refreshToken = localStorage.getItem('spotify_refresh_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');
    
    if (accessToken && tokenExpiry && new Date().getTime() < parseInt(tokenExpiry)) {
        // Token existe e não expirou
        showProfile();
    } else if (refreshToken) {
        // Token expirou mas temos refresh token
        refreshAccessToken();
    } else {
        // Não temos nenhum token válido
        showLogin();
    }
}

// Obter perfil do usuário
async function fetchProfile() {
    try {
        const response = await fetch('/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (response.status === 401) {
            // Token inválido, tentar refresh
            await refreshAccessToken();
            return fetchProfile();
        }
        
        if (!response.ok) {
            throw new Error('Error fetching profile');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching profile:', error);
        showLogin();
        return null;
    }
}

// Atualizar a UI com dados do perfil
async function showProfile() {
    loginSection.classList.add('hidden');
    profileSection.classList.remove('hidden');
    playlistSection.classList.add('hidden');
    
    try {
        const profile = await fetchProfile();
        
        if (!profile) return;
        
        // Preencher dados do perfil
        displayName.textContent = profile.display_name || 'Usuário Spotify';
        userId.textContent = `ID: ${profile.id}`;
        email.textContent = profile.email || 'Email não disponível';
        followers.textContent = profile.followers?.total || 0;
        
        // Definir imagem do perfil
        if (profile.images && profile.images.length > 0) {
            profileImage.src = profile.images[0].url;
        } else {
            profileImage.src = 'https://placehold.co/150x150?text=No+Image';
        }
    } catch (error) {
        console.error('Error showing profile:', error);
    }
}

// Mostrar tela de login
function showLogin() {
    profileSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    playlistSection.classList.add('hidden');
    
    // Limpar localStorage
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expiry');
}

// Renovar token expirado
async function refreshAccessToken() {
    try {
        const response = await fetch('/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        
        if (!response.ok) {
            throw new Error('Error refreshing token');
        }
        
        const data = await response.json();
        
        // Atualizar tokens
        accessToken = data.access_token;
        expiresIn = data.expires_in;
        
        // Salvar no localStorage
        localStorage.setItem('spotify_access_token', accessToken);
        localStorage.setItem('spotify_token_expiry', new Date().getTime() + (expiresIn * 1000));
        
        return true;
    } catch (error) {
        console.error('Error refreshing token:', error);
        showLogin();
        return false;
    }
}

// Formatar duração de faixas
function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Renderizar artistas e faixas na página de playlist
function renderPlaylistDetails(artists) {
    playlistArtists.innerHTML = '';
    
    artists.forEach(artist => {
        if (artist.notFound) {
            // Artista não encontrado
            const artistElement = document.createElement('div');
            artistElement.className = 'artist-item';
            artistElement.innerHTML = `
                <div class="artist-info">
                    <div class="artist-name">${artist.name}</div>
                    <div class="artist-not-found">(Artista não encontrado)</div>
                </div>
            `;
            playlistArtists.appendChild(artistElement);
            return;
        }
        
        if (artist.error) {
            // Erro ao processar o artista
            const artistElement = document.createElement('div');
            artistElement.className = 'artist-item';
            artistElement.innerHTML = `
                <div class="artist-info">
                    <div class="artist-name">${artist.name}</div>
                    <div class="artist-error">(Erro ao processar este artista: ${artist.errorMessage || 'Erro desconhecido'})</div>
                </div>
            `;
            playlistArtists.appendChild(artistElement);
            return;
        }
        
        // Artista encontrado com faixas
        const artistElement = document.createElement('div');
        artistElement.className = 'artist-item';
        
        // Info do artista
        const artistInfo = document.createElement('div');
        artistInfo.className = 'artist-info';
        
        // Imagem do artista
        const artistImageSrc = artist.image || 'https://placehold.co/80x80?text=No+Image';
        artistInfo.innerHTML = `
            <img src="${artistImageSrc}" alt="${artist.name}" class="artist-image">
            <div class="artist-name">${artist.name}</div>
        `;
        
        // Lista de faixas
        const trackList = document.createElement('ul');
        trackList.className = 'track-list';
        
        if (!artist.tracks || artist.tracks.length === 0) {
            const noTracksItem = document.createElement('li');
            noTracksItem.className = 'no-tracks';
            noTracksItem.textContent = 'Nenhuma faixa encontrada para este artista.';
            trackList.appendChild(noTracksItem);
        } else {
            artist.tracks.forEach(track => {
                const trackItem = document.createElement('li');
                trackItem.className = 'track-item';
                
                const albumImageSrc = track.album.image || 'https://placehold.co/50x50?text=No+Image';
                trackItem.innerHTML = `
                    <img src="${albumImageSrc}" alt="${track.album.name}" class="track-image">
                    <div class="track-details">
                        <div class="track-name">${track.name}</div>
                        <div class="track-album">${track.album.name}</div>
                    </div>
                    <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                `;
                
                trackList.appendChild(trackItem);
            });
        }
        
        // Adicionar tudo ao elemento do artista
        artistElement.appendChild(artistInfo);
        artistElement.appendChild(trackList);
        
        // Adicionar à lista de artistas
        playlistArtists.appendChild(artistElement);
    });
}

// Criar playlist com músicas dos artistas favoritos
async function createArtistPlaylist() {
    // Mostrar mensagem de carregamento
    resultMessage.textContent = 'Criando playlist... Isso pode levar alguns segundos.';
    resultMessage.classList.remove('hidden');
    resultMessage.classList.remove('success', 'error');
    createPlaylistButton.disabled = true;
    
    try {
        const response = await fetch('/create-artist-playlist', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 401) {
            // Token inválido, tentar refresh
            await refreshAccessToken();
            return createArtistPlaylist();
        }
        
        if (!response.ok) {
            throw new Error('Error creating playlist');
        }
        
        const data = await response.json();
        
        // Mostrar mensagem de sucesso
        resultMessage.textContent = 'Playlist criada com sucesso!';
        resultMessage.classList.add('success');
        
        // Mostrar detalhes da playlist
        profileSection.classList.add('hidden');
        loginSection.classList.add('hidden');
        playlistSection.classList.remove('hidden');
        
        playlistName.textContent = data.playlist.name;
        playlistDescription.textContent = data.playlist.description;
        playlistLink.href = data.playlist.external_urls.spotify;
        
        // Renderizar artistas e faixas
        renderPlaylistDetails(data.artists);
        
    } catch (error) {
        console.error('Error creating playlist:', error);
        resultMessage.textContent = 'Erro ao criar playlist. Tente novamente.';
        resultMessage.classList.add('error');
    } finally {
        createPlaylistButton.disabled = false;
    }
}

// Criar playlist com artistas personalizados
async function createCustomPlaylist(event) {
    event.preventDefault();
    
    // Obter valores do formulário
    const artistsText = artistsInput.value.trim();
    if (!artistsText) {
        resultMessage.textContent = 'Digite pelo menos um artista.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
        return;
    }
    
    // Dividir por linha e remover linhas vazias
    const artistsList = artistsText.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
    
    if (artistsList.length === 0) {
        resultMessage.textContent = 'Digite pelo menos um artista válido.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
        return;
    }
    
    // Obter número de músicas e nome da playlist
    const tracksCount = tracksPerArtist.value;
    const customPlaylistName = playlistNameInput.value.trim();
    
    // Mostrar mensagem de carregamento
    resultMessage.textContent = 'Criando playlist... Isso pode levar alguns segundos.';
    resultMessage.classList.remove('hidden', 'success', 'error');
    createCustomPlaylistButton.disabled = true;
    
    try {
        const response = await fetch('/create-custom-playlist', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                artists: artistsList,
                tracksPerArtist: tracksCount,
                playlistName: customPlaylistName
            })
        });
        
        if (response.status === 401) {
            // Token inválido, tentar refresh
            await refreshAccessToken();
            return createCustomPlaylist(event);
        }
        
        if (!response.ok) {
            throw new Error('Error creating custom playlist');
        }
        
        const data = await response.json();
        
        // Mostrar mensagem de sucesso
        resultMessage.textContent = 'Playlist criada com sucesso!';
        resultMessage.classList.add('success');
        
        // Mostrar detalhes da playlist
        profileSection.classList.add('hidden');
        loginSection.classList.add('hidden');
        playlistSection.classList.remove('hidden');
        
        playlistName.textContent = data.playlist.name;
        playlistDescription.textContent = data.playlist.description;
        playlistLink.href = data.playlist.external_urls.spotify;
        
        // Renderizar artistas e faixas
        renderPlaylistDetails(data.artists);
        
    } catch (error) {
        console.error('Error creating custom playlist:', error);
        resultMessage.textContent = 'Erro ao criar playlist. Tente novamente.';
        resultMessage.classList.add('error');
    } finally {
        createCustomPlaylistButton.disabled = false;
    }
}

// Alternar abas
function switchTab(event) {
    const tabId = event.target.getAttribute('data-tab');
    
    // Desativar todas as abas
    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.add('hidden'));
    
    // Ativar a aba selecionada
    event.target.classList.add('active');
    document.getElementById(`${tabId}-tab`).classList.remove('hidden');
}

// Event listeners
loginButton.addEventListener('click', () => {
    window.location.href = '/login';
});

createPlaylistButton.addEventListener('click', createArtistPlaylist);

createCustomPlaylistButton.addEventListener('click', createCustomPlaylist);

backToProfileButton.addEventListener('click', showProfile);

// Event listeners para as abas
tabs.forEach(tab => {
    tab.addEventListener('click', switchTab);
});

// Inicializar app
document.addEventListener('DOMContentLoaded', checkAuth); 
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
const loader = document.getElementById('loader');

// Armazenar tokens
let accessToken = '';
let refreshToken = '';
let expiresIn = 0;

// Armazenar dados da pré-visualização da playlist
let previewPlaylistData = null;

// Mostrar/esconder loader
function showLoader() {
    loader.classList.remove('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}

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
function renderPlaylistDetails(artists, isPreview = false) {
    playlistArtists.innerHTML = '';
    
    // Se for pré-visualização, adicionar botão para criar playlist
    if (isPreview) {
        const createButtonDiv = document.createElement('div');
        createButtonDiv.className = 'create-playlist-action';
        createButtonDiv.innerHTML = `
            <button id="confirm-create-playlist" class="btn primary">Criar Playlist</button>
            <button id="cancel-create-playlist" class="btn tertiary">Voltar</button>
        `;
        playlistArtists.appendChild(createButtonDiv);
        
        // Adicionar event listeners
        document.getElementById('confirm-create-playlist').addEventListener('click', confirmCreatePlaylist);
        document.getElementById('cancel-create-playlist').addEventListener('click', () => {
            playlistSection.classList.add('hidden');
            profileSection.classList.remove('hidden');
        });
    }
    
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

// Carregar prévia das músicas dos artistas favoritos
async function previewTopArtists() {
    showLoader();
    
    try {
        const response = await fetch('/top-artists', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (response.status === 401) {
            // Token inválido, tentar refresh
            await refreshAccessToken();
            return previewTopArtists();
        }
        
        if (!response.ok) {
            throw new Error('Error fetching top artists');
        }
        
        const topArtistsData = await response.json();
        const artists = topArtistsData.items.slice(0, 10); // Limitar a 10 artistas
        
        // Preparar dados para pré-visualização
        const previewArtists = [];
        
        for (const artist of artists) {
            try {
                // Obter as faixas mais populares do artista
                const tracksResponse = await fetch(`/artist-top-tracks/${artist.id}?limit=5`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (!tracksResponse.ok) {
                    throw new Error(`Error fetching tracks for ${artist.name}`);
                }
                
                const tracksData = await tracksResponse.json();
                
                previewArtists.push({
                    id: artist.id,
                    name: artist.name,
                    image: artist.images.length > 0 ? artist.images[0].url : null,
                    tracks: tracksData.tracks.map(track => ({
                        id: track.id,
                        name: track.name,
                        uri: track.uri,
                        duration_ms: track.duration_ms,
                        album: {
                            name: track.album.name,
                            image: track.album.images.length > 0 ? track.album.images[0].url : null
                        }
                    }))
                });
            } catch (error) {
                console.error(`Error processing artist ${artist.name}:`, error);
                previewArtists.push({
                    name: artist.name,
                    error: true,
                    errorMessage: error.message || "Erro desconhecido"
                });
            }
        }
        
        // Armazenar dados para criar a playlist depois
        previewPlaylistData = {
            type: 'top',
            artists: previewArtists
        };
        
        // Mostrar prévia
        showPlaylistPreview("Prévia - Meus Artistas Favoritos", "Estas faixas serão adicionadas à sua playlist.");
        
    } catch (error) {
        console.error('Error previewing top artists:', error);
        resultMessage.textContent = 'Erro ao carregar artistas favoritos. Tente novamente.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
    } finally {
        hideLoader();
    }
}

// Carregar prévia das músicas dos artistas personalizados
async function previewCustomArtists(event) {
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
    const customPlaylistName = playlistNameInput.value.trim() || 'Minha Playlist Personalizada';
    
    showLoader();
    
    try {
        // Preparar dados para pré-visualização
        const previewArtists = [];
        
        for (const artistName of artistsList) {
            try {
                // Buscar o artista
                const searchResponse = await fetch(`/search-artist?query=${encodeURIComponent(artistName)}`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (!searchResponse.ok) {
                    throw new Error(`Error searching for ${artistName}`);
                }
                
                const searchData = await searchResponse.json();
                
                if (searchData.artists.items.length === 0) {
                    // Artista não encontrado
                    previewArtists.push({
                        name: artistName,
                        notFound: true
                    });
                    continue;
                }
                
                const artist = searchData.artists.items[0];
                
                // Obter as faixas mais populares do artista
                const tracksResponse = await fetch(`/artist-top-tracks/${artist.id}?limit=${tracksCount}`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (!tracksResponse.ok) {
                    throw new Error(`Error fetching tracks for ${artistName}`);
                }
                
                const tracksData = await tracksResponse.json();
                
                previewArtists.push({
                    id: artist.id,
                    name: artist.name,
                    image: artist.images.length > 0 ? artist.images[0].url : null,
                    tracks: tracksData.tracks.map(track => ({
                        id: track.id,
                        name: track.name,
                        uri: track.uri,
                        duration_ms: track.duration_ms,
                        album: {
                            name: track.album.name,
                            image: track.album.images.length > 0 ? track.album.images[0].url : null
                        }
                    }))
                });
            } catch (error) {
                console.error(`Error processing artist ${artistName}:`, error);
                previewArtists.push({
                    name: artistName,
                    error: true,
                    errorMessage: error.message || "Erro desconhecido"
                });
            }
        }
        
        // Armazenar dados para criar a playlist depois
        previewPlaylistData = {
            type: 'custom',
            artists: previewArtists,
            tracksPerArtist: tracksCount,
            playlistName: customPlaylistName
        };
        
        // Mostrar prévia
        showPlaylistPreview(`Prévia - ${customPlaylistName}`, "Estas faixas serão adicionadas à sua playlist.");
        
    } catch (error) {
        console.error('Error previewing custom artists:', error);
        resultMessage.textContent = 'Erro ao carregar artistas. Tente novamente.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
    } finally {
        hideLoader();
    }
}

// Mostrar a prévia da playlist
function showPlaylistPreview(title, description) {
    profileSection.classList.add('hidden');
    loginSection.classList.add('hidden');
    playlistSection.classList.remove('hidden');
    
    playlistName.textContent = title;
    playlistDescription.textContent = description;
    playlistLink.textContent = "Criar Playlist";
    playlistLink.removeAttribute('href');
    playlistLink.classList.add('hidden');
    
    // Renderizar artistas e faixas em modo de prévia
    renderPlaylistDetails(previewPlaylistData.artists, true);
}

// Confirmar criação da playlist após prévia
async function confirmCreatePlaylist() {
    if (!previewPlaylistData) return;
    
    showLoader();
    
    try {
        let response;
        
        if (previewPlaylistData.type === 'top') {
            // Criar playlist com top artistas
            response = await fetch('/create-artist-playlist', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
        } else {
            // Criar playlist com artistas personalizados
            const artistNames = previewPlaylistData.artists
                .map(artist => artist.notFound ? null : artist.name)
                .filter(name => name !== null);
                
            response = await fetch('/create-custom-playlist', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    artists: artistNames,
                    tracksPerArtist: previewPlaylistData.tracksPerArtist,
                    playlistName: previewPlaylistData.playlistName
                })
            });
        }
        
        if (response.status === 401) {
            // Token inválido, tentar refresh
            await refreshAccessToken();
            return confirmCreatePlaylist();
        }
        
        if (!response.ok) {
            throw new Error('Error creating playlist');
        }
        
        const data = await response.json();
        
        // Mostrar mensagem de sucesso
        resultMessage.textContent = 'Playlist criada com sucesso!';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('success');
        
        // Atualizar a UI com a playlist criada
        playlistName.textContent = data.playlist.name;
        playlistDescription.textContent = data.playlist.description;
        playlistLink.textContent = "Abrir no Spotify";
        playlistLink.href = data.playlist.external_urls.spotify;
        playlistLink.classList.remove('hidden');
        
        // Renderizar artistas e faixas (sem o botão de criar)
        renderPlaylistDetails(data.artists);
        
    } catch (error) {
        console.error('Error creating playlist:', error);
        resultMessage.textContent = 'Erro ao criar playlist. Tente novamente.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
    } finally {
        hideLoader();
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

createPlaylistButton.addEventListener('click', previewTopArtists);

createCustomPlaylistButton.addEventListener('click', previewCustomArtists);

backToProfileButton.addEventListener('click', showProfile);

// Event listeners para as abas
tabs.forEach(tab => {
    tab.addEventListener('click', switchTab);
});

// Inicializar app
document.addEventListener('DOMContentLoaded', checkAuth); 
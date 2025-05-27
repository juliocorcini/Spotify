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
    // Esconder o loader caso esteja visível
    hideLoader();
    
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
    } finally {
        // Garantir que o loader seja escondido em qualquer caso
        hideLoader();
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
        
        // Adicionar botões de controle de conta
        const profileContainer = document.getElementById('profile-container');
        
        // Criar div para os botões se não existir
        let accountControls = document.getElementById('account-controls');
        if (!accountControls) {
            accountControls = document.createElement('div');
            accountControls.id = 'account-controls';
            accountControls.className = 'account-controls';
            profileContainer.appendChild(accountControls);
        }
        
        // Botão de desconectar
        if (!document.getElementById('disconnect-button')) {
            const disconnectButton = document.createElement('button');
            disconnectButton.id = 'disconnect-button';
            disconnectButton.className = 'btn tertiary disconnect-btn';
            disconnectButton.textContent = 'Desconectar Conta';
            disconnectButton.addEventListener('click', disconnectAccount);
            accountControls.appendChild(disconnectButton);
        }
        
        // Botão de excluir dados
        if (!document.getElementById('delete-data-button')) {
            const deleteButton = document.createElement('button');
            deleteButton.id = 'delete-data-button';
            deleteButton.className = 'btn tertiary delete-btn';
            deleteButton.textContent = 'Excluir Meus Dados';
            deleteButton.addEventListener('click', requestDataDeletion);
            accountControls.appendChild(deleteButton);
        }
    } catch (error) {
        console.error('Error showing profile:', error);
    } finally {
        // Garantir que o loader seja escondido
        hideLoader();
    }
}

// Função para desconectar a conta
function disconnectAccount() {
    if (confirm('Tem certeza que deseja desconectar sua conta do Spotify? Você precisará autorizar novamente para usar o aplicativo.')) {
        // Limpar tokens e dados de autenticação
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expiry');
        
        // Mostrar mensagem de sucesso
        alert('Sua conta foi desconectada com sucesso.');
        
        // Redirecionar para a tela de login
        showLogin();
    }
}

// Função para solicitar exclusão de dados
async function requestDataDeletion() {
    if (confirm('ATENÇÃO: Esta ação excluirá permanentemente todos os seus dados em nossos servidores, incluindo histórico de playlists criadas. Esta ação não pode ser desfeita. Deseja continuar?')) {
        
        try {
            showLoader();
            
            // Obter ID do usuário atual
            const profile = await fetchProfile();
            if (!profile || !profile.id) {
                throw new Error('Não foi possível obter o ID do usuário');
            }
            
            // Enviar solicitação para excluir dados
            const response = await fetch(`/api/user-data/${profile.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha ao excluir dados');
            }
            
            // Desconectar a conta após exclusão bem-sucedida
            localStorage.removeItem('spotify_access_token');
            localStorage.removeItem('spotify_refresh_token');
            localStorage.removeItem('spotify_token_expiry');
            
            alert('Seus dados foram excluídos com sucesso. Você será redirecionado para a página inicial.');
            showLogin();
            
        } catch (error) {
            console.error('Erro ao excluir dados:', error);
            alert(`Erro ao excluir dados: ${error.message}`);
        } finally {
            hideLoader();
        }
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
    
    // Garantir que o loader seja escondido
    hideLoader();
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
    } finally {
        // Garantir que o loader seja escondido
        hideLoader();
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
                    <div class="artist-not-found">(Artista não encontrado${artist.reason ? ': ' + artist.reason : ''})</div>
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
        
        // Adicionar aviso se o nome do artista não for exatamente o solicitado
        const nameWarningHtml = artist.nameWarning ? 
            `<div class="artist-name-warning">${artist.nameWarning}</div>` : '';
        
        artistInfo.innerHTML = `
            <img src="${artistImageSrc}" alt="${artist.name}" class="artist-image">
            <div class="artist-details">
                <div class="artist-name">${artist.name}</div>
                ${nameWarningHtml}
            </div>
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
                
                // Encontrar o artista mais próximo usando a função compareNames
                const artist = findBestArtistMatch(artistName, searchData.artists.items);
                
                // Se não encontrou um artista suficientemente similar
                if (!artist) {
                    previewArtists.push({
                        name: artistName,
                        notFound: true,
                        reason: "Não foi possível encontrar este artista com exatidão suficiente."
                    });
                    continue;
                }
                
                // Verificar se o nome é exatamente o mesmo (ignorando case e espaços)
                const exactMatch = artist.name.toLowerCase().trim() === artistName.toLowerCase().trim();
                const nameWarning = !exactMatch ? 
                    `Aviso: Encontrado "${artist.name}" em vez de "${artistName}"` : null;
                
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
                    nameWarning: nameWarning,
                    originalName: artistName,
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

// Encontrar o melhor artista correspondente entre os resultados da busca
function findBestArtistMatch(requestedName, candidates) {
    if (!candidates || candidates.length === 0) return null;
    
    // Normalizar o nome solicitado
    const requestedClean = requestedName.toLowerCase().trim();
    
    // Primeiro, procurar por correspondência exata
    for (const artist of candidates) {
        const artistNameClean = artist.name.toLowerCase().trim();
        if (artistNameClean === requestedClean) {
            return artist;
        }
    }
    
    // Segundo, procurar por inclusão
    for (const artist of candidates) {
        const artistNameClean = artist.name.toLowerCase().trim();
        if (artistNameClean.includes(requestedClean) || requestedClean.includes(artistNameClean)) {
            return artist;
        }
    }
    
    // Terceiro, calcular similaridade usando Levenshtein e aceitar se for alta o suficiente
    for (const artist of candidates) {
        const artistNameClean = artist.name.toLowerCase().trim();
        const similarity = calculateSimilarity(requestedClean, artistNameClean);
        if (similarity >= 0.8) {
            return artist;
        }
    }
    
    // Se a similaridade for muito baixa, não retornar nenhum artista
    return null;
}

// Calcular similaridade entre duas strings (simplificado)
function calculateSimilarity(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0; // Ambas vazias
    
    let matches = 0;
    const minLength = Math.min(str1.length, str2.length);
    
    // Contar caracteres correspondentes
    for (let i = 0; i < minLength; i++) {
        if (str1.charAt(i) === str2.charAt(i)) {
            matches++;
        }
    }
    
    // Similaridade básica
    return matches / maxLength;
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
document.addEventListener('DOMContentLoaded', () => {
    // Garantir que o loader esteja escondido inicialmente
    hideLoader();
    checkAuth();
}); 
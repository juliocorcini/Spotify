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

// Variável global para controlar o áudio atual
let currentAudio = null;
let currentPlayingElement = null;

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

// Função para verificar se um nome de artista é especial (B2B, special set, etc.)
function isSpecialArtistFormat(artistName) {
    if (!artistName) return false;
    return artistName.includes('B2B') || (artistName.includes('(') && artistName.includes(')'));
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

        // Criar seção de recomendações
        const recommendationsCount = artists.reduce((count, artist) => {
            if (artist.tracks && !artist.notFound && !artist.error) {
                return count + (parseInt(tracksPerArtist.value) * 2 || 10);
            }
            return count;
        }, 0);

        if (recommendationsCount > 0) {
            const recommendationsSection = document.createElement('div');
            recommendationsSection.className = 'recommendations-section';
            recommendationsSection.innerHTML = `
                <div class="recommendations-title">
                    <h3>🎵 Músicas Recomendadas</h3>
                    <div class="recommendations-info">
                        <p>Baseado nos seus artistas favoritos, encontramos ${recommendationsCount} recomendações para você!</p>
                        <button id="load-recommendations" class="btn secondary">Carregar Recomendações</button>
                    </div>
                </div>
                <div id="recommendations-list" class="hidden"></div>
            `;
            playlistArtists.appendChild(recommendationsSection);
            
            // Event listener para carregar recomendações
            document.getElementById('load-recommendations').addEventListener('click', async () => {
                await loadRecommendations(artists);
            });
        }
        
        // Adicionar o botão "Voltar para criar playlist" na parte inferior
        const bottomCreateAction = document.createElement('div');
        bottomCreateAction.className = 'bottom-create-action';
        bottomCreateAction.innerHTML = `
            <button id="bottom-back-to-create" class="btn tertiary">← Voltar para criar playlist</button>
        `;
        playlistArtists.appendChild(bottomCreateAction);
        
        // Event listener para o botão inferior
        document.getElementById('bottom-back-to-create').addEventListener('click', () => {
            playlistSection.classList.add('hidden');
            profileSection.classList.remove('hidden');
        });
    }
    
    // Renderizar cada artista
    artists.forEach((artist, index) => {
        const artistElement = document.createElement('div');
        artistElement.className = 'artist-item';
        
        if (artist.notFound) {
            artistElement.innerHTML = `
                <div class="artist-not-found">
                    <h3>❌ ${artist.name}</h3>
                    <p>Artista não encontrado no Spotify</p>
                </div>
            `;
        } else if (artist.error) {
            artistElement.innerHTML = `
                <div class="artist-not-found">
                    <h3>⚠️ ${artist.name}</h3>
                    <p>Erro: ${artist.errorMessage}</p>
                </div>
            `;
        } else {
            // Determinar se é B2B para mostrar imagens duplas
            let artistImageHtml = '';
            if (artist.isB2B && artist.allArtists && artist.allArtists.length >= 2) {
                // Para B2B, mostrar fotos dos dois artistas lado a lado
                const artist1 = artist.allArtists[0];
                const artist2 = artist.allArtists[1];
                const img1 = artist1.images && artist1.images.length > 0 ? artist1.images[0].url : '/default-artist.png';
                const img2 = artist2.images && artist2.images.length > 0 ? artist2.images[0].url : '/default-artist.png';
                
                artistImageHtml = `
                    <div class="artist-b2b-images">
                        <img src="${img1}" alt="${artist1.name}" class="artist-image-small">
                        <img src="${img2}" alt="${artist2.name}" class="artist-image-small">
                    </div>
                `;
            } else {
                // Artista normal ou especial - uma foto só
                const imageUrl = artist.image || '/default-artist.png';
                artistImageHtml = `<img src="${imageUrl}" alt="${artist.name}" class="artist-image">`;
            }
            
            artistElement.innerHTML = `
                <div class="artist-info">
                    ${artistImageHtml}
                    <div class="artist-details">
                        <h3 class="artist-name">${artist.name}</h3>
                        ${artist.isB2B ? '<span class="artist-b2b-tag">🎧 B2B Set</span>' : ''}
                        ${artist.isSpecial ? '<span class="artist-special-tag">⭐ Set Especial</span>' : ''}
                        ${artist.nameWarning ? `<p class="artist-name-warning">${artist.nameWarning}</p>` : ''}
                        <p class="track-count">${artist.tracks.length} música(s)</p>
                    </div>
                </div>
                <div class="track-list" id="track-list-${index}">
                    ${artist.tracks.map((track, trackIndex) => {
                        // Para cada música, mostrar de qual artista ela vem
                        let artistInfo = '';
                        if (track.artists && track.artists.length > 0) {
                            const mainArtist = track.artists[0].name;
                            const allArtists = track.artists.map(a => a.name).join(', ');
                            artistInfo = `<span class="track-artist-info">🎤 ${allArtists}</span>`;
                        }
                        
                        return `
                            <div class="track-item">
                                <input type="checkbox" class="track-checkbox" id="track-${index}-${trackIndex}" data-uri="${track.uri}" checked>
                                <img src="${track.album && track.album.image ? track.album.image : (track.album && track.album.images && track.album.images.length > 0 ? track.album.images[0].url : '/default-track.png')}" 
                                     alt="${track.name}" 
                                     class="track-image ${track.preview_url ? 'playable' : ''}"
                                     ${track.preview_url ? `onclick="togglePreview('${track.preview_url}', this)"` : ''}
                                     title="${track.preview_url ? 'Clique para ouvir uma prévia' : 'Prévia não disponível'}">
                                <div class="track-details">
                                    <div class="track-name">${track.name}</div>
                                    ${artistInfo}
                                    <div class="track-album">${track.album ? track.album.name : 'Album desconhecido'}</div>
                                    <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="artist-controls">
                    <button class="load-more-btn" onclick="loadMoreTracks('${artist.id}', 'track-list-${index}', '${artist.name.replace(/'/g, "\\'")}', '${artist.originalName}', ${artist.isB2B || false}, ${artist.isSpecial || false})">
                        Carregar mais músicas
                    </button>
                    <div class="track-search-container" id="search-container-${index}">
                        <input type="text" placeholder="Buscar música específica..." id="search-input-${index}">
                        <button onclick="searchTracksByName('${artist.id}', 'search-input-${index}', 'track-list-${index}')">🔍</button>
                    </div>
                </div>
            `;
        }
        
        playlistArtists.appendChild(artistElement);
    });
}

// Função para tocar/pausar preview das músicas
function togglePreview(previewUrl, imageElement) {
    // Se já há um áudio tocando e é o mesmo elemento, pausar
    if (currentAudio && currentPlayingElement === imageElement) {
        currentAudio.pause();
        currentAudio = null;
        currentPlayingElement = null;
        imageElement.classList.remove('playing');
        return;
    }
    
    // Se há outro áudio tocando, pausar
    if (currentAudio) {
        currentAudio.pause();
        if (currentPlayingElement) {
            currentPlayingElement.classList.remove('playing');
        }
    }
    
    // Criar novo áudio e tocar
    currentAudio = new Audio(previewUrl);
    currentPlayingElement = imageElement;
    imageElement.classList.add('playing');
    
    // Configurar eventos do áudio
    currentAudio.addEventListener('ended', () => {
        imageElement.classList.remove('playing');
        currentAudio = null;
        currentPlayingElement = null;
    });
    
    currentAudio.addEventListener('error', () => {
        imageElement.classList.remove('playing');
        currentAudio = null;
        currentPlayingElement = null;
        alert('Erro ao reproduzir a prévia desta música.');
    });
    
    // Tocar o áudio
    currentAudio.play().catch(error => {
        console.error('Error playing preview:', error);
        imageElement.classList.remove('playing');
        currentAudio = null;
        currentPlayingElement = null;
        alert('Não foi possível reproduzir a prévia desta música.');
    });
}

// Atualizar a função loadMoreTracks para lidar com B2B
async function loadMoreTracks(artistId, trackListElementId, artistName, originalName, isB2B, isSpecial) {
    try {
        showLoader();
        
        let response;
        
        if (isB2B || isSpecial) {
            // Para B2B e sets especiais, usar o endpoint específico
            const searchTerms = JSON.stringify([originalName]); // Simplificado para esta implementação
            const limit = isB2B ? 20 : 10; // Dobrar para B2B
            
            response = await fetch(`/artist-special-tracks/${artistId}?limit=${limit}&displayName=${encodeURIComponent(originalName)}&searchTerms=${encodeURIComponent(searchTerms)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });
        } else {
            // Para artistas normais
            response = await fetch(`/personalized-artist-tracks/${artistId}?limit=10&offset=10`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const tracks = data.tracks || [];
        
        if (tracks.length === 0) {
            hideLoader();
            alert('Nenhuma música adicional encontrada para este artista.');
            return;
        }
        
        // Encontrar o elemento da lista de faixas
        const trackListElement = document.getElementById(trackListElementId);
        if (!trackListElement) {
            hideLoader();
            console.error('Track list element not found:', trackListElementId);
            return;
        }
        
        // Encontrar o índice atual para os checkboxes
        const existingTracks = trackListElement.querySelectorAll('.track-item');
        let nextIndex = existingTracks.length;
        
        // Obter o índice do artista a partir do ID da lista
        const artistIndex = trackListElementId.split('-')[2]; // track-list-X
        
        // Adicionar as novas faixas
        tracks.forEach((track, trackIndex) => {
            // Para cada música, mostrar de qual artista ela vem
            let artistInfo = '';
            if (track.artists && track.artists.length > 0) {
                const allArtists = track.artists.map(a => a.name).join(', ');
                artistInfo = `<span class="track-artist-info">🎤 ${allArtists}</span>`;
            }
            
            const trackElement = document.createElement('div');
            trackElement.className = 'track-item';
            trackElement.innerHTML = `
                <input type="checkbox" class="track-checkbox" id="track-${artistIndex}-${nextIndex + trackIndex}" data-uri="${track.uri}" checked>
                <img src="${track.album && track.album.image ? track.album.image : (track.album && track.album.images && track.album.images.length > 0 ? track.album.images[0].url : '/default-track.png')}" 
                     alt="${track.name}" 
                     class="track-image ${track.preview_url ? 'playable' : ''}"
                     ${track.preview_url ? `onclick="togglePreview('${track.preview_url}', this)"` : ''}
                     title="${track.preview_url ? 'Clique para ouvir uma prévia' : 'Prévia não disponível'}">
                <div class="track-details">
                    <div class="track-name">${track.name}</div>
                    ${artistInfo}
                    <div class="track-album">${track.album ? track.album.name : 'Album desconhecido'}</div>
                    <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                </div>
            `;
            
            trackListElement.appendChild(trackElement);
        });
        
        hideLoader();
        showResult(`${tracks.length} músicas adicionais carregadas para ${artistName}!`, 'success');
        
    } catch (error) {
        hideLoader();
        console.error('Error loading more tracks:', error);
        showResult('Erro ao carregar mais músicas. Tente novamente.', 'error');
    }
}

// Função para buscar faixas de um artista por nome
async function searchTracksByName(artistId, query, trackListElement) {
    if (!query.trim()) {
        alert('Digite um termo de busca.');
        return;
    }
    
    try {
        showLoader();
        
        // Obter IDs das faixas já exibidas
        const existingTrackIds = Array.from(trackListElement.querySelectorAll('.track-item'))
            .map(item => item.dataset.trackId);
        
        // Buscar faixas do artista que correspondem à busca
        const response = await fetch(`/search-artist-tracks?artistId=${artistId}&query=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao buscar músicas');
        }
        
        const data = await response.json();
        
        if (data.tracks.length === 0) {
            alert('Nenhuma música encontrada com este nome.');
            return;
        }
        
        // Filtrar faixas que já estão na lista
        const newTracks = data.tracks.filter(track => !existingTrackIds.includes(track.id));
        
        if (newTracks.length === 0) {
            alert('Todas as músicas encontradas já estão na lista.');
            return;
        }
        
        // Adicionar novas faixas à lista
        newTracks.forEach(track => {
            const trackItem = document.createElement('li');
            trackItem.className = 'track-item';
            trackItem.dataset.trackUri = track.uri;
            trackItem.dataset.trackId = track.id;
            
            const albumImageSrc = track.album?.images?.length > 0 ? 
                track.album.images[0].url : 'https://placehold.co/50x50?text=No+Image';
            
            trackItem.innerHTML = `
                <input type="checkbox" class="track-checkbox">
                <img src="${albumImageSrc}" alt="${track.album?.name || 'Album'}" class="track-image">
                <div class="track-details">
                    <div class="track-name">${track.name}</div>
                    <div class="track-album">${track.album?.name || ''}</div>
                </div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            `;
            
            trackListElement.appendChild(trackItem);
        });
        
    } catch (error) {
        console.error('Erro ao buscar músicas:', error);
        alert(`Erro ao buscar músicas: ${error.message}`);
    } finally {
        hideLoader();
    }
}

// Função para carregar recomendações baseadas nas músicas dos artistas
async function loadRecommendations(artists, limit = 10) {
    try {
        // Coletar IDs de faixas dos artistas para usar como seed
        const seedTracks = [];
        const seedArtists = [];
        
        artists.forEach(artist => {
            if (artist.tracks && artist.tracks.length > 0 && !artist.notFound && !artist.error) {
                // Usar algumas faixas como seed
                const tracks = artist.tracks.slice(0, 2);
                seedTracks.push(...tracks.map(t => t.id));
                
                // Usar o artista como seed
                seedArtists.push(artist.id);
            }
        });
        
        // Limitar a 5 seeds no total (limitação da API do Spotify)
        const finalSeedTracks = seedTracks.slice(0, 3);
        const finalSeedArtists = seedArtists.slice(0, 2);
        
        if (finalSeedTracks.length === 0 && finalSeedArtists.length === 0) {
            console.log('Não há seeds suficientes para recomendações');
            return; // Não há seeds suficientes
        }
        
        showLoader();
        
        // Buscar recomendações
        let query = '';
        if (finalSeedTracks.length > 0) {
            query += `seed_tracks=${finalSeedTracks.join(',')}`;
        }
        
        if (finalSeedArtists.length > 0) {
            if (query) query += '&';
            query += `seed_artists=${finalSeedArtists.join(',')}`;
        }
        
        // Adicionar parâmetros extras para melhorar recomendações
        query += `&limit=${limit}`;
        
        const response = await fetch(`/recommendations?${query}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            console.error('Erro na resposta da API:', response.status, response.statusText);
            throw new Error(`Erro ao buscar recomendações: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.tracks || data.tracks.length === 0) {
            console.log('Nenhuma recomendação encontrada');
            return; // Nenhuma recomendação encontrada
        }
        
        // Criar seção de recomendações
        const recommendationsSection = document.createElement('div');
        recommendationsSection.className = 'artist-item recommendations-section';
        
        // Título da seção
        const titleDiv = document.createElement('div');
        titleDiv.className = 'recommendations-title';
        titleDiv.innerHTML = `
            <h3>Músicas Recomendadas</h3>
            <button class="toggle-all-btn" data-action="select-all">Marcar Todas</button>
            <button class="toggle-all-btn" data-action="unselect-all">Desmarcar Todas</button>
            <div class="recommendations-info">
                Baseado no seu gosto musical e artistas selecionados
            </div>
        `;
        
        // Lista de faixas recomendadas
        const trackList = document.createElement('ul');
        trackList.className = 'track-list';
        
        data.tracks.forEach(track => {
            const trackItem = document.createElement('li');
            trackItem.className = 'track-item';
            trackItem.dataset.trackUri = track.uri;
            trackItem.dataset.trackId = track.id;
            
            const albumImageSrc = track.album?.images?.length > 0 ? 
                track.album.images[0].url : 'https://placehold.co/50x50?text=No+Image';
            
            // O artista da faixa
            const artistName = track.artists.map(a => a.name).join(', ');
            
            trackItem.innerHTML = `
                <input type="checkbox" class="track-checkbox">
                <img src="${albumImageSrc}" alt="${track.album?.name || 'Album'}" class="track-image">
                <div class="track-details">
                    <div class="track-name">${track.name}</div>
                    <div class="track-album">${artistName} - ${track.album?.name || ''}</div>
                </div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            `;
            
            trackList.appendChild(trackItem);
        });
        
        // Montar seção de recomendações
        recommendationsSection.appendChild(titleDiv);
        recommendationsSection.appendChild(trackList);
        
        // Event listeners para os botões de marcar/desmarcar todas
        recommendationsSection.querySelector('[data-action="select-all"]').addEventListener('click', () => {
            const checkboxes = recommendationsSection.querySelectorAll('.track-checkbox');
            checkboxes.forEach(checkbox => checkbox.checked = true);
        });

        recommendationsSection.querySelector('[data-action="unselect-all"]').addEventListener('click', () => {
            const checkboxes = recommendationsSection.querySelectorAll('.track-checkbox');
            checkboxes.forEach(checkbox => checkbox.checked = false);
        });
        
        // Adicionar à lista de artistas
        playlistArtists.appendChild(recommendationsSection);
        
        // Adicionar o botão de criar playlist abaixo da seção de recomendações
        const bottomCreateButtonDiv = document.createElement('div');
        bottomCreateButtonDiv.className = 'create-playlist-action bottom-create-action';
        bottomCreateButtonDiv.innerHTML = `
            <button id="bottom-confirm-create-playlist" class="btn primary">Criar Playlist</button>
            <button id="bottom-cancel-create-playlist" class="btn tertiary">Voltar</button>
        `;
        playlistArtists.appendChild(bottomCreateButtonDiv);
        
        // Adicionar event listeners
        document.getElementById('bottom-confirm-create-playlist').addEventListener('click', confirmCreatePlaylist);
        document.getElementById('bottom-cancel-create-playlist').addEventListener('click', () => {
            playlistSection.classList.add('hidden');
            profileSection.classList.remove('hidden');
        });
        
    } catch (error) {
        console.error('Erro ao carregar recomendações:', error);
    } finally {
        hideLoader();
    }
}

// Função para carregar mais faixas de artistas especiais (B2B, special sets)
async function loadMoreSpecialTracks(artistId, trackListElement, artistName, originalName, specialInfo) {
    try {
        showLoader();
        
        // Obter IDs das faixas já exibidas para evitar duplicação
        const existingTrackIds = Array.from(trackListElement.querySelectorAll('.track-item'))
            .map(item => item.dataset.trackId);
        
        // Criar termos de busca com base no tipo de set especial
        let searchTerms = [];
        const processedArtist = processArtistName(originalName || artistName);
        
        // Usar os termos de busca do processamento
        searchTerms = processedArtist.searchTerms;
        
        // Buscar faixas usando o endpoint para artistas especiais
        const response = await fetch(
            `/artist-special-tracks/${artistId}?displayName=${encodeURIComponent(originalName || artistName)}&limit=10&searchTerms=${encodeURIComponent(JSON.stringify(searchTerms))}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Erro ao buscar mais músicas para ${artistName}`);
        }
        
        const data = await response.json();
        
        // Filtrar faixas que já estão na lista
        const newTracks = data.tracks.filter(track => !existingTrackIds.includes(track.id));
        
        if (newTracks.length === 0) {
            alert('Não há mais músicas disponíveis para este artista/conjunto.');
            return;
        }
        
        // Adicionar novas faixas à lista
        newTracks.forEach(track => {
            const trackItem = document.createElement('li');
            trackItem.className = 'track-item';
            trackItem.dataset.trackUri = track.uri;
            trackItem.dataset.trackId = track.id;
            
            const albumImageSrc = track.album?.images?.length > 0 ? 
                track.album.images[0].url : 'https://placehold.co/50x50?text=No+Image';
            
            trackItem.innerHTML = `
                <input type="checkbox" class="track-checkbox">
                <img src="${albumImageSrc}" alt="${track.album?.name || 'Album'}" class="track-image">
                <div class="track-details">
                    <div class="track-name">${track.name}</div>
                    <div class="track-album">${track.album?.name || ''}</div>
                </div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            `;
            
            trackListElement.appendChild(trackItem);
        });
        
    } catch (error) {
        console.error('Erro ao carregar mais músicas:', error);
        alert(`Erro ao carregar mais músicas: ${error.message}`);
    } finally {
        hideLoader();
    }
}

// Função para processar nomes de artistas especiais no frontend (igual à do backend)
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
    
    showLoader();
    
    const artistNames = document.getElementById('artists-input').value
        .split('\n')
        .map(name => name.trim())
        .filter(name => name);
    
    if (artistNames.length === 0) {
        hideLoader();
        showResult('Por favor, insira pelo menos um artista.', 'error');
        return;
    }
    
    const tracksPerArtist = document.getElementById('tracks-per-artist');
    const playlistName = document.getElementById('playlist-name-input').value.trim();
    
    try {
        let artistsData = [];
        
        for (const artistName of artistNames) {
            try {
                const response = await fetch(`/search-artist-special?query=${encodeURIComponent(artistName)}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.primaryArtist) {
                    const artist = data.primaryArtist;
                    
                    // Determinar quantas músicas buscar baseado no tipo
                    let trackLimit = parseInt(tracksPerArtist.value) || 5;
                    if (artist.isB2B) {
                        trackLimit = trackLimit * 2; // Dobrar para B2B
                    }
                    
                    // Buscar faixas específicas para artistas especiais
                    const tracksResponse = await fetch(`/artist-special-tracks/${artist.id}?limit=${trackLimit}&displayName=${encodeURIComponent(artist.displayName)}&searchTerms=${encodeURIComponent(JSON.stringify(artist.searchTerms))}`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                        }
                    });
                    
                    if (!tracksResponse.ok) {
                        throw new Error(`HTTP error! status: ${tracksResponse.status}`);
                    }
                    
                    const tracksData = await tracksResponse.json();
                    
                    artistsData.push({
                        id: artist.id,
                        name: artist.displayName,
                        originalName: artist.originalName,
                        isB2B: artist.isB2B,
                        isSpecial: artist.isSpecial,
                        searchTerms: artist.searchTerms,
                        image: artist.images && artist.images.length > 0 ? artist.images[0].url : null,
                        tracks: tracksData.tracks || [],
                        allArtists: data.allResults || [] // Para B2B, guardar informações de ambos artistas
                    });
                } else {
                    // Artista não encontrado
                    artistsData.push({
                        name: artistName,
                        originalName: artistName,
                        notFound: true
                    });
                }
            } catch (error) {
                console.error(`Error processing artist "${artistName}":`, error);
                artistsData.push({
                    name: artistName,
                    originalName: artistName,
                    error: true,
                    errorMessage: error.message
                });
            }
        }
        
        hideLoader();
        
        // Mostrar preview da playlist
        const title = playlistName || `Playlist Personalizada (${new Date().toLocaleDateString()})`;
        const description = `Playlist com ${artistsData.length} artista(s) selecionado(s)`;
        
        showPlaylistPreview(title, description);
        renderPlaylistDetails(artistsData, true);
        
    } catch (error) {
        hideLoader();
        console.error('Error creating playlist:', error);
        showResult('Erro ao criar playlist. Tente novamente.', 'error');
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
    try {
        showLoader();
        
        // Coletar todas as faixas selecionadas
        const selectedTracks = [];
        const checkboxes = document.querySelectorAll('.track-checkbox:checked');
        
        checkboxes.forEach(checkbox => {
            const trackUri = checkbox.getAttribute('data-uri');
            if (trackUri) {
                selectedTracks.push(trackUri);
            }
        });
        
        if (selectedTracks.length === 0) {
            hideLoader();
            showResult('Selecione pelo menos uma música para criar a playlist.', 'error');
            return;
        }
        
        // Obter o nome da playlist
        const playlistName = document.getElementById('playlist-name-input').value.trim() || 
                           `Playlist Personalizada (${new Date().toLocaleDateString()})`;
        
        // Criar a playlist com as faixas selecionadas
        const response = await fetch('/create-custom-tracks-playlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({
                trackUris: selectedTracks,
                playlistName: playlistName
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        hideLoader();
        
        if (result.success) {
            // Mostrar informações da playlist criada
            const playlistContainer = document.getElementById('playlist-container');
            const playlistNameElement = document.getElementById('playlist-name');
            const playlistDescriptionElement = document.getElementById('playlist-description');
            const playlistLinkElement = document.getElementById('playlist-link');
            
            playlistNameElement.textContent = result.playlist.name;
            playlistDescriptionElement.textContent = `${selectedTracks.length} música(s) adicionada(s)`;
            playlistLinkElement.href = result.playlist.external_urls.spotify;
            
            // Mostrar seção da playlist criada
            playlistSection.classList.remove('hidden');
            profileSection.classList.add('hidden');
            
            showResult(`Playlist "${result.playlist.name}" criada com sucesso!`, 'success');
        } else {
            showResult('Erro ao criar playlist. Tente novamente.', 'error');
        }
        
    } catch (error) {
        hideLoader();
        console.error('Error creating playlist:', error);
        showResult('Erro ao criar playlist. Tente novamente.', 'error');
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
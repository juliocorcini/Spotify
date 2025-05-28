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

// Controle de áudio para preview das músicas
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

// Funções para controle de preview de áudio
function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    if (currentPlayingElement) {
        currentPlayingElement.classList.remove('playing');
        const playIcon = currentPlayingElement.querySelector('.play-icon');
        if (playIcon) {
            playIcon.textContent = '▶️';
            playIcon.title = 'Reproduzir preview';
        }
        currentPlayingElement = null;
    }
}

function playTrackPreview(previewUrl, trackImageContainer) {
    // Parar áudio atual se houver
    stopCurrentAudio();
    
    if (!previewUrl) {
        alert('Preview não disponível para esta música.');
        return;
    }
    
    // Criar novo elemento de áudio
    currentAudio = new Audio(previewUrl);
    currentPlayingElement = trackImageContainer;
    
    // Adicionar classe visual para indicar que está tocando
    trackImageContainer.classList.add('playing');
    
    // Atualizar ícone de play
    const playIcon = trackImageContainer.querySelector('.play-icon');
    if (playIcon) {
        playIcon.textContent = '⏸️';
        playIcon.title = 'Pausar preview';
    }
    
    // Event listeners para o áudio
    currentAudio.addEventListener('ended', () => {
        stopCurrentAudio();
    });
    
    currentAudio.addEventListener('error', () => {
        alert('Erro ao reproduzir preview da música.');
        stopCurrentAudio();
    });
    
    // Reproduzir o áudio
    currentAudio.play().catch(error => {
        console.error('Erro ao reproduzir áudio:', error);
        alert('Erro ao reproduzir preview da música.');
        stopCurrentAudio();
    });
}

function toggleTrackPreview(previewUrl, trackImageContainer) {
    // Se este elemento já está tocando, pausar
    if (currentPlayingElement === trackImageContainer && currentAudio && !currentAudio.paused) {
        stopCurrentAudio();
    } else {
        // Caso contrário, reproduzir
        playTrackPreview(previewUrl, trackImageContainer);
    }
}

// Função para verificar se um nome de artista é especial (B2B, special set, etc.)
function isSpecialArtistFormat(artistName) {
    if (!artistName) return false;
    return artistName.includes('B2B') || (artistName.includes('(') && artistName.includes(')'));
}

// Função para adicionar botões flutuantes no final
function addBottomButtons() {
    // Verificar se já existem os botões para evitar duplicação
    if (document.getElementById('bottom-confirm-create-playlist')) {
        return; // Botões já existem
    }
    
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
        stopCurrentAudio();
        playlistSection.classList.add('hidden');
        profileSection.classList.remove('hidden');
    });
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
            try {
                loadRecommendations(artists, recommendationsCount);
            } catch (error) {
                console.error('Erro ao carregar recomendações:', error);
            }
        }
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
        artistElement.dataset.artistId = artist.id;
        
        // Para B2B, armazenar informações dos artistas individuais
        if (artist.isSpecialFormat && artist.specialInfo && artist.specialInfo.isB2B && artist.individualArtists) {
            artistElement.dataset.individualArtists = JSON.stringify(artist.individualArtists);
        }
        
        // Info do artista
        const artistInfo = document.createElement('div');
        artistInfo.className = 'artist-info';
        
        // Para B2B, mostrar imagens dos artistas individuais
        let artistImageHtml = '';
        if (artist.isSpecialFormat && artist.specialInfo && artist.specialInfo.isB2B && artist.combinedImages && artist.combinedImages.length > 0) {
            // B2B: mostrar imagens dos 2 artistas
            artistImageHtml = '<div class="b2b-artist-images">';
            artist.combinedImages.forEach(artistImg => {
                const imgSrc = artistImg.images && artistImg.images.length > 0 ? 
                    artistImg.images[0].url : 'https://placehold.co/40x40?text=No+Image';
                artistImageHtml += `<img src="${imgSrc}" alt="${artistImg.artistName}" title="${artistImg.artistName}">`;
            });
            artistImageHtml += '</div>';
        } else {
            // Artista normal ou special set: imagem única
            const artistImageSrc = artist.image || 'https://placehold.co/80x80?text=No+Image';
            artistImageHtml = `<img src="${artistImageSrc}" alt="${artist.name}" class="artist-image">`;
        }
        
        // Adicionar aviso se o nome do artista não for exatamente o solicitado
        const nameWarningHtml = artist.nameWarning ? 
            `<div class="artist-name-warning">${artist.nameWarning}</div>` : '';
        
        // Adicionar info se for um formato especial (B2B ou Special Set)
        let specialFormatHtml = '';
        if (artist.isSpecialFormat) {
            if (artist.specialInfo && artist.specialInfo.isB2B) {
                const totalTracks = artist.tracks ? artist.tracks.length : 0;
                const collaborations = artist.tracks ? artist.tracks.filter(t => t.isCollaboration).length : 0;
                
                let collabInfo = '';
                if (collaborations > 0) {
                    collabInfo = ` (${collaborations} colaboração${collaborations > 1 ? 'ões' : ''})`;
                }
                
                specialFormatHtml = `<div class="artist-special-format">🎧 B2B Set (Conjunto de artistas) - ${totalTracks} músicas${collabInfo}</div>`;
            } else if (artist.specialInfo && artist.specialInfo.isSpecial) {
                specialFormatHtml = `<div class="artist-special-format">✨ Set Especial</div>`;
            }
        }
        
        artistInfo.innerHTML = `
            ${artistImageHtml}
            <div class="artist-details">
                <div class="artist-name">${artist.name}</div>
                ${nameWarningHtml}
                ${specialFormatHtml}
            </div>
        `;
        
        // Adicionar controles do artista (botões)
        const artistControls = document.createElement('div');
        artistControls.className = 'artist-controls';
        artistControls.innerHTML = `
            <button class="toggle-all-btn" data-action="select-all">Marcar Todas</button>
            <button class="toggle-all-btn" data-action="unselect-all">Desmarcar Todas</button>
            <button class="load-more-btn">Carregar Mais Músicas</button>
            <button class="search-track-btn">Buscar Música</button>
        `;

        // Campo de busca (inicialmente oculto)
        const searchContainer = document.createElement('div');
        searchContainer.className = 'track-search-container';
        searchContainer.innerHTML = `
            <input type="text" placeholder="Digite o nome da música..." class="track-search-input">
            <button class="track-search-execute">Buscar</button>
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
                trackItem.dataset.trackUri = track.uri;
                trackItem.dataset.trackId = track.id;
                
                const albumImageSrc = track.album.image || 'https://placehold.co/50x50?text=No+Image';
                
                // Para B2B, mostrar de qual artista a música vem
                let artistSourceHtml = '';
                if (track.fromArtist && track.isFromB2B) {
                    if (track.isCollaboration) {
                        // Colaboração entre os artistas B2B
                        const collabArtists = track.collaboratingArtists ? 
                            track.collaboratingArtists.map(a => a.name).join(' & ') : 
                            track.fromArtist.name;
                        artistSourceHtml = `<div class="track-artist-source collaboration">🎭 Colaboração: ${collabArtists}</div>`;
                    } else {
                        // Música individual de um dos artistas
                        artistSourceHtml = `<div class="track-artist-source b2b">🎵 De: ${track.fromArtist.name}</div>`;
                    }
                } else if (track.fromArtist) {
                    artistSourceHtml = `<div class="track-artist-source">🎵 Artista: ${track.fromArtist.name}</div>`;
                } else if (track.isSpecialSet) {
                    artistSourceHtml = `<span class="special-set-indicator">${track.specialType}</span>`;
                }
                
                trackItem.innerHTML = `
                    <input type="checkbox" class="track-checkbox" checked>
                    <div class="track-image-container">
                        <img src="${albumImageSrc}" alt="${track.album.name}" class="track-image" 
                             data-preview-url="${track.preview_url || ''}" 
                             title="${track.preview_url ? 'Clique para ouvir preview' : 'Preview não disponível'}">
                        <div class="play-icon">▶️</div>
                    </div>
                    <div class="track-details">
                        <div class="track-name">${track.name}</div>
                        <div class="track-album">${track.album.name}</div>
                        ${artistSourceHtml}
                    </div>
                    <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                `;
                
                // Adicionar event listener para preview de áudio
                const trackImage = trackItem.querySelector('.track-image');
                const playIcon = trackItem.querySelector('.play-icon');
                
                trackImage.addEventListener('click', (e) => {
                    e.preventDefault();
                    const previewUrl = trackImage.dataset.previewUrl;
                    if (previewUrl) {
                        toggleTrackPreview(previewUrl, trackImage.parentElement);
                    } else {
                        alert('Preview não disponível para esta música.');
                    }
                });
                
                playIcon.addEventListener('click', (e) => {
                    e.preventDefault();
                    const previewUrl = trackImage.dataset.previewUrl;
                    if (previewUrl) {
                        toggleTrackPreview(previewUrl, trackImage.parentElement);
                    } else {
                        alert('Preview não disponível para esta música.');
                    }
                });
                
                trackList.appendChild(trackItem);
            });
        }
        
        // Adicionar tudo ao elemento do artista
        artistElement.appendChild(artistInfo);
        artistElement.appendChild(artistControls);
        artistElement.appendChild(searchContainer);
        artistElement.appendChild(trackList);
        
        // Event listeners para os botões
        artistElement.querySelector('.load-more-btn').addEventListener('click', () => {
            if (artist.isSpecialFormat) {
                // Para formatos especiais, usar o endpoint específico
                loadMoreSpecialTracks(artist.id, trackList, artist.name, artist.originalName, artist.specialInfo);
            } else {
                // Para artistas normais, usar o endpoint padrão
                loadMoreTracks(artist.id, trackList, artist.name);
            }
        });

        artistElement.querySelector('.search-track-btn').addEventListener('click', () => {
            const searchContainer = artistElement.querySelector('.track-search-container');
            searchContainer.classList.toggle('visible');
            if (searchContainer.classList.contains('visible')) {
                searchContainer.querySelector('input').focus();
            }
        });

        artistElement.querySelector('.track-search-execute').addEventListener('click', () => {
            const searchInput = artistElement.querySelector('.track-search-input');
            searchTracksByName(artist.id, searchInput.value, trackList);
        });

        artistElement.querySelector('.track-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchInput = artistElement.querySelector('.track-search-input');
                searchTracksByName(artist.id, searchInput.value, trackList);
            }
        });

        // Event listeners para os botões de marcar/desmarcar todas
        artistElement.querySelector('[data-action="select-all"]').addEventListener('click', () => {
            const checkboxes = artistElement.querySelectorAll('.track-checkbox');
            checkboxes.forEach(checkbox => checkbox.checked = true);
        });

        artistElement.querySelector('[data-action="unselect-all"]').addEventListener('click', () => {
            const checkboxes = artistElement.querySelectorAll('.track-checkbox');
            checkboxes.forEach(checkbox => checkbox.checked = false);
        });
        
        // Adicionar à lista de artistas
        playlistArtists.appendChild(artistElement);
    });

    // O botão só será adicionado após a seção de recomendações (se existir)
    // Essa lógica é tratada após o carregamento das recomendações
    if (!isPreview) {
        // Adicionar botão de criar playlist no final da página
        addBottomButtons();
    }
}

// Função para carregar mais faixas de um artista
async function loadMoreTracks(artistId, trackListElement, artistName) {
    try {
        showLoader();
        
        // Obter IDs das faixas já exibidas para evitar duplicação
        const existingTrackIds = Array.from(trackListElement.querySelectorAll('.track-item'))
            .map(item => item.dataset.trackId);
        
        // Tentar buscar mais faixas do artista baseadas no gosto do usuário
        const response = await fetch(`/personalized-artist-tracks/${artistId}?offset=${existingTrackIds.length}&limit=10`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        // Se não tivermos faixas personalizadas ou ocorrer erro, buscar faixas normais
        let data;
        if (!response.ok) {
            console.log('Faixas personalizadas não disponíveis, buscando faixas populares');
            
            // Buscar mais faixas do artista (normal)
            const regularResponse = await fetch(`/artist-tracks/${artistId}?offset=${existingTrackIds.length}&limit=10`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!regularResponse.ok) {
                throw new Error(`Erro ao buscar mais músicas para ${artistName}`);
            }
            
            data = await regularResponse.json();
        } else {
            data = await response.json();
        }
        
        // Filtrar faixas que já estão na lista
        const newTracks = data.tracks.filter(track => !existingTrackIds.includes(track.id));
        
        if (newTracks.length === 0) {
            alert('Não há mais músicas disponíveis para este artista.');
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
                <div class="track-image-container">
                    <img src="${albumImageSrc}" alt="${track.album?.name || 'Album'}" class="track-image" 
                         data-preview-url="${track.preview_url || ''}" 
                         title="${track.preview_url ? 'Clique para ouvir preview' : 'Preview não disponível'}">
                    <div class="play-icon">▶️</div>
                </div>
                <div class="track-details">
                    <div class="track-name">${track.name}</div>
                    <div class="track-album">${track.album?.name || ''}</div>
                </div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            `;
            
            // Adicionar event listener para preview de áudio
            const trackImage = trackItem.querySelector('.track-image');
            const playIcon = trackItem.querySelector('.play-icon');
            
            trackImage.addEventListener('click', (e) => {
                e.preventDefault();
                const previewUrl = trackImage.dataset.previewUrl;
                if (previewUrl) {
                    toggleTrackPreview(previewUrl, trackImage.parentElement);
                } else {
                    alert('Preview não disponível para esta música.');
                }
            });
            
            playIcon.addEventListener('click', (e) => {
                e.preventDefault();
                const previewUrl = trackImage.dataset.previewUrl;
                if (previewUrl) {
                    toggleTrackPreview(previewUrl, trackImage.parentElement);
                } else {
                    alert('Preview não disponível para esta música.');
                }
            });
            
            trackListElement.appendChild(trackItem);
        });
        
    } catch (error) {
        console.error('Erro ao carregar mais músicas:', error);
        alert(`Erro ao carregar mais músicas: ${error.message}`);
    } finally {
        hideLoader();
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
                <div class="track-image-container">
                    <img src="${albumImageSrc}" alt="${track.album?.name || 'Album'}" class="track-image" 
                         data-preview-url="${track.preview_url || ''}" 
                         title="${track.preview_url ? 'Clique para ouvir preview' : 'Preview não disponível'}">
                    <div class="play-icon">▶️</div>
                </div>
                <div class="track-details">
                    <div class="track-name">${track.name}</div>
                    <div class="track-album">${track.album?.name || ''}</div>
                </div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            `;
            
            // Adicionar event listener para preview de áudio
            const trackImage = trackItem.querySelector('.track-image');
            const playIcon = trackItem.querySelector('.play-icon');
            
            trackImage.addEventListener('click', (e) => {
                e.preventDefault();
                const previewUrl = trackImage.dataset.previewUrl;
                if (previewUrl) {
                    toggleTrackPreview(previewUrl, trackImage.parentElement);
                } else {
                    alert('Preview não disponível para esta música.');
                }
            });
            
            playIcon.addEventListener('click', (e) => {
                e.preventDefault();
                const previewUrl = trackImage.dataset.previewUrl;
                if (previewUrl) {
                    toggleTrackPreview(previewUrl, trackImage.parentElement);
                } else {
                    alert('Preview não disponível para esta música.');
                }
            });
            
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
                <div class="track-image-container">
                    <img src="${albumImageSrc}" alt="${track.album?.name || 'Album'}" class="track-image" 
                         data-preview-url="${track.preview_url || ''}" 
                         title="${track.preview_url ? 'Clique para ouvir preview' : 'Preview não disponível'}">
                    <div class="play-icon">▶️</div>
                </div>
                <div class="track-details">
                    <div class="track-name">${track.name}</div>
                    <div class="track-album">${artistName} - ${track.album?.name || ''}</div>
                </div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            `;
            
            // Adicionar event listener para preview de áudio
            const trackImage = trackItem.querySelector('.track-image');
            const playIcon = trackItem.querySelector('.play-icon');
            
            trackImage.addEventListener('click', (e) => {
                e.preventDefault();
                const previewUrl = trackImage.dataset.previewUrl;
                if (previewUrl) {
                    toggleTrackPreview(previewUrl, trackImage.parentElement);
                } else {
                    alert('Preview não disponível para esta música.');
                }
            });
            
            playIcon.addEventListener('click', (e) => {
                e.preventDefault();
                const previewUrl = trackImage.dataset.previewUrl;
                if (previewUrl) {
                    toggleTrackPreview(previewUrl, trackImage.parentElement);
                } else {
                    alert('Preview não disponível para esta música.');
                }
            });
            
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
        addBottomButtons();
        
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
        
        // Obter informações dos artistas individuais se estiver no elemento pai
        const artistElement = trackListElement.closest('.artist-item');
        let individualArtists = [];
        if (artistElement && artistElement.dataset.individualArtists) {
            try {
                individualArtists = JSON.parse(artistElement.dataset.individualArtists);
            } catch (e) {
                console.error('Error parsing individual artists:', e);
            }
        }
        
        // Criar termos de busca com base no tipo de set especial
        let searchTerms = [];
        const processedArtist = processArtistName(originalName || artistName);
        
        // Usar os termos de busca do processamento
        searchTerms = processedArtist.searchTerms;
        
        // Preparar URL para buscar mais faixas
        let tracksUrl = `/artist-special-tracks/${artistId}?displayName=${encodeURIComponent(originalName || artistName)}&limit=10&searchTerms=${encodeURIComponent(JSON.stringify(searchTerms))}`;
        
        // Para B2B, incluir informações dos artistas individuais
        if (processedArtist.isB2B && individualArtists.length > 0) {
            tracksUrl += `&individualArtists=${encodeURIComponent(JSON.stringify(individualArtists))}`;
        }
        
        // Buscar faixas usando o endpoint para artistas especiais
        const response = await fetch(tracksUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
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
            
            // Para B2B, mostrar de qual artista a música vem
            let artistSourceHtml = '';
            if (track.fromArtist && track.isFromB2B) {
                if (track.isCollaboration) {
                    // Colaboração entre os artistas B2B
                    const collabArtists = track.collaboratingArtists ? 
                        track.collaboratingArtists.map(a => a.name).join(' & ') : 
                        track.fromArtist.name;
                    artistSourceHtml = `<div class="track-artist-source collaboration">🎭 Colaboração: ${collabArtists}</div>`;
                } else {
                    // Música individual de um dos artistas
                    artistSourceHtml = `<div class="track-artist-source b2b">🎵 De: ${track.fromArtist.name}</div>`;
                }
            } else if (track.fromArtist) {
                artistSourceHtml = `<div class="track-artist-source">🎵 Artista: ${track.fromArtist.name}</div>`;
            } else if (track.isSpecialSet) {
                artistSourceHtml = `<span class="special-set-indicator">${track.specialType}</span>`;
            }
            
            trackItem.innerHTML = `
                <input type="checkbox" class="track-checkbox">
                <div class="track-image-container">
                    <img src="${albumImageSrc}" alt="${track.album?.name || 'Album'}" class="track-image" 
                         data-preview-url="${track.preview_url || ''}" 
                         title="${track.preview_url ? 'Clique para ouvir preview' : 'Preview não disponível'}">
                    <div class="play-icon">▶️</div>
                </div>
                <div class="track-details">
                    <div class="track-name">${track.name}</div>
                    <div class="track-album">${track.album?.name || ''}</div>
                    ${artistSourceHtml}
                </div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            `;
            
            // Adicionar event listener para preview de áudio
            const trackImage = trackItem.querySelector('.track-image');
            const playIcon = trackItem.querySelector('.play-icon');
            
            trackImage.addEventListener('click', (e) => {
                e.preventDefault();
                const previewUrl = trackImage.dataset.previewUrl;
                if (previewUrl) {
                    toggleTrackPreview(previewUrl, trackImage.parentElement);
                } else {
                    alert('Preview não disponível para esta música.');
                }
            });
            
            playIcon.addEventListener('click', (e) => {
                e.preventDefault();
                const previewUrl = trackImage.dataset.previewUrl;
                if (previewUrl) {
                    toggleTrackPreview(previewUrl, trackImage.parentElement);
                } else {
                    alert('Preview não disponível para esta música.');
                }
            });
            
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
                        preview_url: track.preview_url,
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
                // Verificar se é um formato especial (B2B ou special set)
                if (isSpecialArtistFormat(artistName)) {
                    // Usar o endpoint especial para buscar artistas especiais
                    const searchResponse = await fetch(`/search-artist-special?query=${encodeURIComponent(artistName)}`, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });
                    
                    if (!searchResponse.ok) {
                        throw new Error(`Error searching for ${artistName}`);
                    }
                    
                    const searchData = await searchResponse.json();
                    
                    if (!searchData.primaryArtist) {
                        // Artista não encontrado
                        previewArtists.push({
                            name: artistName,
                            notFound: true
                        });
                        continue;
                    }
                    
                    const artist = searchData.primaryArtist;
                    
                    // Preparar URL para buscar faixas, incluindo artistas individuais para B2B
                    let tracksUrl = `/artist-special-tracks/${artist.id}?displayName=${encodeURIComponent(artist.displayName)}&limit=${tracksCount}&searchTerms=${encodeURIComponent(JSON.stringify(artist.searchTerms))}`;
                    
                    // Se temos artistas individuais (B2B), adicionar à URL
                    if (searchData.individualArtists && searchData.individualArtists.length > 0) {
                        tracksUrl += `&individualArtists=${encodeURIComponent(JSON.stringify(searchData.individualArtists))}`;
                    }
                    
                    // Usar o endpoint especial para buscar faixas
                    const tracksResponse = await fetch(tracksUrl, {
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
                        name: artist.displayName || artist.name,
                        originalName: artistName,
                        image: artist.images && artist.images.length > 0 ? artist.images[0].url : null,
                        tracks: tracksData.tracks.map(track => ({
                            id: track.id,
                            name: track.name,
                            uri: track.uri,
                            duration_ms: track.duration_ms,
                            preview_url: track.preview_url,
                            album: {
                                name: track.album ? track.album.name : 'Unknown Album',
                                image: track.album && track.album.images && track.album.images.length > 0 ? track.album.images[0].url : null
                            },
                            // Preservar informações de origem do artista para B2B
                            fromArtist: track.fromArtist,
                            isFromB2B: track.isFromB2B,
                            isSpecialSet: track.isSpecialSet,
                            specialType: track.specialType
                        })),
                        isSpecialFormat: true,
                        specialInfo: {
                            isB2B: searchData.isB2B || artist.isB2B,
                            isSpecial: searchData.isSpecial || artist.isSpecial
                        },
                        // Para B2B, incluir informações dos artistas individuais e suas imagens
                        individualArtists: searchData.individualArtists || [],
                        combinedImages: searchData.combinedImages || []
                    });
                } else {
                    // Buscar artista normal
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
                            preview_url: track.preview_url,
                            album: {
                                name: track.album.name,
                                image: track.album.images.length > 0 ? track.album.images[0].url : null
                            }
                        }))
                    });
                }
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
        // Obter todas as faixas selecionadas pelo usuário
        const selectedTracks = Array.from(document.querySelectorAll('.track-checkbox:checked'))
            .map(checkbox => checkbox.closest('.track-item').dataset.trackUri);
        
        if (selectedTracks.length === 0) {
            alert('Selecione pelo menos uma música para criar a playlist.');
            hideLoader();
            return;
        }
        
        let response;
        
        if (previewPlaylistData.type === 'top') {
            // Criar playlist com top artistas, mas usando as faixas selecionadas
            response = await fetch('/create-custom-tracks-playlist', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    trackUris: selectedTracks,
                    playlistName: 'Meus Artistas Favoritos'
                })
            });
        } else {
            // Criar playlist com artistas personalizados, mas usando as faixas selecionadas
            response = await fetch('/create-custom-tracks-playlist', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    trackUris: selectedTracks,
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
            throw new Error('Erro ao criar playlist');
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
        
        // Rolar para o topo da página após criar a playlist
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Criar botão para copiar link da playlist
        if (!document.getElementById('copy-playlist-link')) {
            const copyLinkButton = document.createElement('a');
            copyLinkButton.id = 'copy-playlist-link';
            copyLinkButton.className = 'btn secondary';
            copyLinkButton.textContent = "Copiar Link";
            copyLinkButton.href = "#";
            copyLinkButton.addEventListener('click', (e) => {
                e.preventDefault();
                navigator.clipboard.writeText(data.playlist.external_urls.spotify)
                    .then(() => {
                        alert('Link copiado para a área de transferência!');
                    })
                    .catch(err => {
                        console.error('Erro ao copiar link:', err);
                    });
            });
            
            // Inserir o botão após o link para abrir no Spotify
            const playlistContainer = document.getElementById('playlist-container');
            playlistContainer.insertBefore(copyLinkButton, playlistLink.nextSibling);
        }
    } catch (error) {
        console.error('Erro ao criar playlist:', error);
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

backToProfileButton.addEventListener('click', () => {
    stopCurrentAudio();
    showProfile();
});

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

// Parar áudio quando sair da página ou navegar
window.addEventListener('beforeunload', () => {
    stopCurrentAudio();
}); 
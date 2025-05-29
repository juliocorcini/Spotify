// Elementos DOM
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');
const userSearchInput = document.getElementById('user-search');
const playlistSearchInput = document.getElementById('playlist-search');
const userSortSelect = document.getElementById('user-sort');
const playlistSortSelect = document.getElementById('playlist-sort');
const userSortDirButton = document.getElementById('user-sort-dir');
const playlistSortDirButton = document.getElementById('playlist-sort-dir');
const usersTableBody = document.getElementById('users-body');
const playlistsTableBody = document.getElementById('playlists-body');
const totalUsersElement = document.getElementById('total-users');
const totalPlaylistsElement = document.getElementById('total-playlists');
const customPlaylistsElement = document.getElementById('custom-playlists');
const topPlaylistsElement = document.getElementById('top-playlists');
const modal = document.getElementById('modal');
const closeModal = document.querySelector('.close');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

// Estado da aplicação
let users = [];
let playlists = [];
let userSortField = 'lastLogin';
let userSortDirection = 'desc';
let playlistSortField = 'createdAt';
let playlistSortDirection = 'desc';
let userFilter = '';
let playlistFilter = '';

// Função para carregar dados
async function loadData() {
    try {
        // Obter a senha da URL
        const urlParams = new URLSearchParams(window.location.search);
        const password = urlParams.get('password');
        
        if (!password) {
            alert('Senha de administração não fornecida!');
            return;
        }
        
        // Carregar usuários
        const usersResponse = await fetch(`/admin/users?password=${password}`);
        if (!usersResponse.ok) {
            throw new Error('Falha ao carregar usuários');
        }
        users = await usersResponse.json();
        
        // Carregar playlists
        const playlistsResponse = await fetch(`/admin/playlists?password=${password}`);
        if (!playlistsResponse.ok) {
            throw new Error('Falha ao carregar playlists');
        }
        playlists = await playlistsResponse.json();
        
        // Atualizar estatísticas
        updateStats();
        
        // Renderizar tabelas
        renderUserTable();
        renderPlaylistTable();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert(`Erro ao carregar dados: ${error.message}`);
    }
}

// Atualizar estatísticas
function updateStats() {
    totalUsersElement.textContent = users.length;
    totalPlaylistsElement.textContent = playlists.length;
    
    const customPlaylists = playlists.filter(p => p.type === 'custom').length;
    const topPlaylists = playlists.filter(p => p.type === 'top_artists').length;
    
    customPlaylistsElement.textContent = customPlaylists;
    topPlaylistsElement.textContent = topPlaylists;
}

// Formatar data
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
}

// Obter nome de usuário pelo ID
function getUserName(userId) {
    const user = users.find(u => u.id === userId);
    return user ? user.display_name || user.id : userId;
}

// Renderizar tabela de usuários
function renderUserTable() {
    // Filtrar usuários
    let filteredUsers = users;
    if (userFilter) {
        const filter = userFilter.toLowerCase();
        filteredUsers = users.filter(user => 
            (user.display_name && user.display_name.toLowerCase().includes(filter)) ||
            (user.email && user.email.toLowerCase().includes(filter)) ||
            user.id.toLowerCase().includes(filter)
        );
    }
    
    // Ordenar usuários
    filteredUsers.sort((a, b) => {
        let valueA = a[userSortField] || '';
        let valueB = b[userSortField] || '';
        
        // Converter para data se for campo de data
        if (userSortField === 'firstLogin' || userSortField === 'lastLogin') {
            valueA = new Date(valueA).getTime();
            valueB = new Date(valueB).getTime();
        }
        
        // Ordenar string
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            return userSortDirection === 'asc' 
                ? valueA.localeCompare(valueB) 
                : valueB.localeCompare(valueA);
        }
        
        // Ordenar número/data
        return userSortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    });
    
    // Limpar tabela
    usersTableBody.innerHTML = '';
    
    // Preencher tabela
    filteredUsers.forEach(user => {
        const userPlaylists = playlists.filter(p => p.userId === user.id).length;
        
        // Extrair URL da imagem do array de images
        const imageUrl = user.images && user.images.length > 0 ? user.images[0].url : null;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <img src="${imageUrl || 'https://via.placeholder.com/40'}" alt="${user.display_name || 'User'}" class="user-avatar">
            </td>
            <td>${user.display_name || 'N/A'}</td>
            <td>${user.email || 'N/A'}</td>
            <td>${formatDate(user.firstLogin)}</td>
            <td>${formatDate(user.lastLogin)}</td>
            <td>${userPlaylists}</td>
            <td>
                <button class="action-button view-user" data-id="${user.id}">Ver detalhes</button>
                <button class="action-button view-user-playlists" data-id="${user.id}">Ver playlists</button>
            </td>
        `;
        
        // Adicionar event listeners para os botões
        const viewUserButton = row.querySelector('.view-user');
        viewUserButton.addEventListener('click', () => showUserDetails(user.id));
        
        const viewUserPlaylistsButton = row.querySelector('.view-user-playlists');
        viewUserPlaylistsButton.addEventListener('click', () => showUserPlaylists(user.id));
        
        usersTableBody.appendChild(row);
    });
}

// Renderizar tabela de playlists
function renderPlaylistTable() {
    // Filtrar playlists
    let filteredPlaylists = playlists;
    if (playlistFilter) {
        const filter = playlistFilter.toLowerCase();
        filteredPlaylists = playlists.filter(playlist => 
            playlist.name.toLowerCase().includes(filter) ||
            playlist.type.toLowerCase().includes(filter) ||
            (getUserName(playlist.userId) || '').toLowerCase().includes(filter)
        );
    }
    
    // Ordenar playlists
    filteredPlaylists.sort((a, b) => {
        let valueA = a[playlistSortField] || '';
        let valueB = b[playlistSortField] || '';
        
        // Converter para data se for campo de data
        if (playlistSortField === 'createdAt') {
            valueA = new Date(valueA).getTime();
            valueB = new Date(valueB).getTime();
        }
        
        // Ordenar string
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            return playlistSortDirection === 'asc' 
                ? valueA.localeCompare(valueB) 
                : valueB.localeCompare(valueA);
        }
        
        // Ordenar número/data
        return playlistSortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    });
    
    // Limpar tabela
    playlistsTableBody.innerHTML = '';
    
    // Preencher tabela
    filteredPlaylists.forEach(playlist => {
        const row = document.createElement('tr');
        
        // Determinar classe de badge com base no tipo
        const badgeClass = playlist.type === 'custom' ? 'badge-custom' : 'badge-top';
        const typeText = playlist.type === 'custom' ? 'Personalizada' : 'Top Artistas';
        
        row.innerHTML = `
            <td>${playlist.name}</td>
            <td><span class="badge ${badgeClass}">${typeText}</span></td>
            <td>${playlist.artistsCount || 'N/A'}</td>
            <td>${playlist.tracks_total || playlist.trackCount || '0'}</td>
            <td>${formatDate(playlist.createdAt)}</td>
            <td>${getUserName(playlist.userId)}</td>
            <td>
                <button class="action-button view-playlist" data-id="${playlist.id}">Ver detalhes</button>
                <a href="${playlist.external_urls?.spotify || '#'}" target="_blank" class="action-button">Abrir no Spotify</a>
            </td>
        `;
        
        // Adicionar event listeners para os botões
        const viewPlaylistButton = row.querySelector('.view-playlist');
        viewPlaylistButton.addEventListener('click', () => showPlaylistDetails(playlist.id));
        
        playlistsTableBody.appendChild(row);
    });
}

// Mostrar detalhes do usuário
function showUserDetails(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    modalTitle.textContent = `Detalhes do Usuário: ${user.display_name || user.id}`;
    
    // Extrair URL da imagem do array de images
    const imageUrl = user.images && user.images.length > 0 ? user.images[0].url : null;
    
    // Preparar seção do país - só mostrar se tiver informação válida
    const countrySection = user.country && user.country !== 'N/A' ? 
        `<p><strong>País:</strong> ${user.country}</p>` : '';
    
    modalBody.innerHTML = `
        <div class="user-details">
            <div class="user-profile">
                <img src="${imageUrl || 'https://via.placeholder.com/150'}" alt="${user.display_name || 'User'}" class="user-detail-avatar">
                <h3>${user.display_name || 'N/A'}</h3>
                <p><strong>ID:</strong> ${user.id}</p>
                <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
                ${countrySection}
                <p><strong>Primeiro Login:</strong> ${formatDate(user.firstLogin)}</p>
                <p><strong>Último Login:</strong> ${formatDate(user.lastLogin)}</p>
                <p><a href="${user.profileUrl || '#'}" target="_blank" class="profile-link">Ver Perfil no Spotify</a></p>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Mostrar playlists do usuário
function showUserPlaylists(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    const userPlaylists = playlists.filter(p => p.userId === userId);
    
    modalTitle.textContent = `Playlists de ${user.display_name || user.id}`;
    
    if (userPlaylists.length === 0) {
        modalBody.innerHTML = `<p>Este usuário não tem playlists.</p>`;
    } else {
        modalBody.innerHTML = `
            <div class="user-playlists">
                <table class="modal-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Tipo</th>
                            <th>Faixas</th>
                            <th>Criada em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${userPlaylists.map(playlist => {
                            const badgeClass = playlist.type === 'custom' ? 'badge-custom' : 'badge-top';
                            const typeText = playlist.type === 'custom' ? 'Personalizada' : 'Top Artistas';
                            
                            return `
                                <tr>
                                    <td>${playlist.name}</td>
                                    <td><span class="badge ${badgeClass}">${typeText}</span></td>
                                    <td>${playlist.trackCount || '0'}</td>
                                    <td>${formatDate(playlist.createdAt)}</td>
                                    <td>
                                        <a href="${playlist.url}" target="_blank" class="action-button">Abrir no Spotify</a>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    modal.style.display = 'block';
}

// Mostrar detalhes da playlist
function showPlaylistDetails(playlistId) {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    
    const user = users.find(u => u.id === playlist.userId);
    
    modalTitle.textContent = `Detalhes da Playlist: ${playlist.name}`;
    
    const badgeClass = playlist.type === 'custom' ? 'badge-custom' : 'badge-top';
    const typeText = playlist.type === 'custom' ? 'Personalizada' : 'Top Artistas';
    
    let userInfo = 'Usuário não encontrado';
    if (user) {
        userInfo = `<strong>${user.display_name || user.id}</strong>`;
        if (user.email) {
            userInfo += ` (${user.email})`;
        }
    }
    
    // Verificar se temos dados adicionais na playlist (artistas solicitados vs encontrados)
    if (playlist.requestedArtists || (playlist.extra_data && playlist.extra_data.requestedArtists)) {
        renderFullPlaylistDetails(playlist, userInfo, badgeClass, typeText);
    } else {
        // Fazer uma solicitação para obter detalhes completos da playlist
        fetch(`/admin/playlist-details/${playlistId}?password=${password}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Falha ao carregar detalhes da playlist');
                }
                return response.json();
            })
            .then(details => {
                // Atualizar o objeto de playlist com os detalhes completos
                Object.assign(playlist, details);
                renderFullPlaylistDetails(playlist, userInfo, badgeClass, typeText);
            })
            .catch(error => {
                console.error('Erro ao carregar detalhes da playlist:', error);
                renderBasicPlaylistDetails(playlist, userInfo, badgeClass, typeText);
            });
    }
}

// Renderizar detalhes básicos da playlist (sem informações dos artistas)
function renderBasicPlaylistDetails(playlist, userInfo, badgeClass, typeText) {
    // Tentar extrair nomes dos artistas do extra_data
    let artistsList = 'N/A';
    
    console.log('🔍 Debug playlist data:', playlist);
    console.log('🔍 Extra data:', playlist.extra_data);
    
    // PRIORIDADE 1: Artistas solicitados/pesquisados originalmente (quando o usuário pesquisou artistas específicos)
    if (playlist.extra_data && playlist.extra_data.requestedArtists && Array.isArray(playlist.extra_data.requestedArtists)) {
        console.log('🎤 Requested artists found:', playlist.extra_data.requestedArtists);
        artistsList = playlist.extra_data.requestedArtists.join(', ');
    }
    // PRIORIDADE 2: Artistas encontrados (filtrar apenas os que foram encontrados com sucesso)
    else if (playlist.extra_data && playlist.extra_data.foundArtists && Array.isArray(playlist.extra_data.foundArtists)) {
        const foundArtistsNames = playlist.extra_data.foundArtists
            .filter(artist => !artist.notFound && !artist.error)
            .map(artist => artist.name || artist.requestedName)
            .filter(name => name);
        
        console.log('✅ Found artists:', foundArtistsNames);
        
        if (foundArtistsNames.length > 0) {
            artistsList = foundArtistsNames.join(', ');
        }
    }
    // PRIORIDADE 2.5: FALLBACK - Extrair artistas do nome da playlist se começar com "Mix" e não tiver dados salvos
    else if (playlist.name && playlist.name.startsWith('Mix ')) {
        // Extrair artistas do nome da playlist (ex: "Mix Gloria Groove, Vintage Culture, ARTBAT")
        const nameWithoutMix = playlist.name.replace(/^Mix\s+/, ''); // Remove "Mix " do início
        
        // Verificar se parece conter artistas (tem vírgulas ou "&")
        if (nameWithoutMix.includes(',') || nameWithoutMix.includes('&')) {
            // Dividir por vírgulas e limpar espaços
            const extractedArtists = nameWithoutMix
                .split(/[,&]/) // Dividir por vírgula ou &
                .map(artist => artist.trim())
                .filter(artist => artist.length > 0 && artist !== 'e'); // Remover vazios e palavras conectoras
            
            if (extractedArtists.length > 0) {
                artistsList = extractedArtists.join(', ');
                console.log('🎵 Extracted artists from playlist name:', extractedArtists);
            }
        } else {
            // Se não tem vírgulas, pode ser um artista único (ex: "Mix Alok")
            const singleArtist = nameWithoutMix.trim();
            if (singleArtist.length > 0) {
                artistsList = singleArtist;
                console.log('🎵 Extracted single artist from playlist name:', singleArtist);
            }
        }
    }
    // PRIORIDADE 3: Fallback para trackArtists (mas limitado aos primeiros para evitar lista muito longa)
    else if (playlist.extra_data && playlist.extra_data.trackArtists && Array.isArray(playlist.extra_data.trackArtists)) {
        // Mostrar apenas os primeiros 5 artistas únicos para evitar lista muito longa
        const artistNames = playlist.extra_data.trackArtists
            .slice(0, 5) // Limitar a 5 artistas
            .map(artist => artist.name)
            .filter(name => name);
        
        console.log('🎵 Track artists (limited):', artistNames);
        
        if (artistNames.length > 0) {
            const remaining = playlist.extra_data.trackArtists.length - artistNames.length;
            artistsList = artistNames.join(', ');
            if (remaining > 0) {
                artistsList += ` (+${remaining} outros)`;
            }
        }
    }

    console.log('✅ Final artists list:', artistsList);

    // Preparar seção adicional com todos os artistas únicos das faixas (se diferente dos pesquisados)
    let allArtistsSection = '';
    if (playlist.extra_data && playlist.extra_data.trackArtists && Array.isArray(playlist.extra_data.trackArtists)) {
        const allTrackArtists = playlist.extra_data.trackArtists.map(artist => artist.name).join(', ');
        const artistCount = playlist.extra_data.trackArtists.length;
        
        // Só mostrar se tem artistas pesquisados E se a lista é diferente
        if ((playlist.extra_data.requestedArtists || artistsList !== 'N/A') && allTrackArtists !== artistsList) {
            allArtistsSection = `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                    <p><strong>Todos os artistas únicos das faixas (${artistCount}):</strong></p>
                    <p style="font-size: 0.9em; color: #666; max-height: 100px; overflow-y: auto;">${allTrackArtists}</p>
                </div>
            `;
        }
    }

    modalBody.innerHTML = `
        <div class="playlist-details">
            <p><strong>Nome:</strong> ${playlist.name}</p>
            <p><strong>Descrição:</strong> ${playlist.description || 'N/A'}</p>
            <p><strong>Tipo:</strong> <span class="badge ${badgeClass}">${typeText}</span></p>
            <p><strong>Artistas pesquisados:</strong> ${artistsList}</p>
            <p><strong>Faixas:</strong> ${playlist.tracks_total || playlist.trackCount || '0'}</p>
            <p><strong>Criada em:</strong> ${formatDate(playlist.createdAt)}</p>
            <p><strong>Criada por:</strong> ${userInfo}</p>
            <p><strong>Link:</strong> <a href="${playlist.external_urls?.spotify || '#'}" target="_blank" class="playlist-link">Abrir no Spotify</a></p>
            ${allArtistsSection}
        </div>
    `;
    
    modal.style.display = 'block';
}

// Renderizar detalhes completos da playlist com informações dos artistas
function renderFullPlaylistDetails(playlist, userInfo, badgeClass, typeText) {
    let artistsSection = '';
    
    // Buscar requestedArtists na estrutura correta
    const requestedArtists = playlist.requestedArtists || (playlist.extra_data && playlist.extra_data.requestedArtists);
    const foundArtists = playlist.foundArtists || (playlist.extra_data && playlist.extra_data.foundArtists);
    
    if (requestedArtists && requestedArtists.length > 0) {
        artistsSection = `
            <div class="artists-section">
                <h4>Análise de Artistas</h4>
                <p><strong>Artistas solicitados:</strong> ${requestedArtists.length}</p>
                
                <div class="artists-grid">
                    ${requestedArtists.map((artist, index) => {
                        const foundArtist = foundArtists ? foundArtists[index] : null;
                        const status = foundArtist && !foundArtist.notFound && !foundArtist.error ? 'found' : 'not-found';
                        const statusText = status === 'found' ? '✅ Encontrado' : '❌ Não encontrado';
                        const foundName = foundArtist && foundArtist.name ? foundArtist.name : 'N/A';
                        
                        return `
                            <div class="artist-card ${status}">
                                <div class="artist-info">
                                    <strong>Solicitado:</strong> ${artist}<br>
                                    <strong>Encontrado:</strong> ${foundName}<br>
                                    <span class="status">${statusText}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // Extrair lista de artistas para exibição
    let artistsList = 'N/A';
    
    // PRIORIDADE 1: Artistas solicitados/pesquisados
    if (requestedArtists && Array.isArray(requestedArtists)) {
        artistsList = requestedArtists.join(', ');
        console.log('🎤 Using requested artists:', requestedArtists);
    }
    // PRIORIDADE 2: Artistas encontrados (filtrar apenas os que foram encontrados com sucesso)
    else if (foundArtists && Array.isArray(foundArtists)) {
        const foundArtistsNames = foundArtists
            .filter(artist => !artist.notFound && !artist.error)
            .map(artist => artist.name || artist.requestedName)
            .filter(name => name);
        
        if (foundArtistsNames.length > 0) {
            artistsList = foundArtistsNames.join(', ');
            console.log('✅ Using found artists:', foundArtistsNames);
        }
    }
    // PRIORIDADE 3: FALLBACK - Extrair artistas do nome da playlist se começar com "Mix"
    else if (playlist.name && playlist.name.startsWith('Mix ')) {
        const nameWithoutMix = playlist.name.replace(/^Mix\s+/, '');
        
        if (nameWithoutMix.includes(',') || nameWithoutMix.includes('&')) {
            const extractedArtists = nameWithoutMix
                .split(/[,&]/)
                .map(artist => artist.trim())
                .filter(artist => artist.length > 0 && artist !== 'e');
            
            if (extractedArtists.length > 0) {
                artistsList = extractedArtists.join(', ');
                console.log('🎵 Extracted artists from playlist name (full view):', extractedArtists);
            }
        } else {
            const singleArtist = nameWithoutMix.trim();
            if (singleArtist.length > 0) {
                artistsList = singleArtist;
                console.log('🎵 Extracted single artist from playlist name (full view):', singleArtist);
            }
        }
    }

    console.log('✅ Final artists list:', artistsList);

    // Preparar seção adicional com todos os artistas únicos das faixas (se diferente dos pesquisados)
    let allArtistsSection = '';
    if (playlist.extra_data && playlist.extra_data.trackArtists && Array.isArray(playlist.extra_data.trackArtists)) {
        const allTrackArtists = playlist.extra_data.trackArtists.map(artist => artist.name).join(', ');
        const artistCount = playlist.extra_data.trackArtists.length;
        
        // Só mostrar se tem artistas pesquisados E se a lista é diferente
        if ((playlist.extra_data.requestedArtists || artistsList !== 'N/A') && allTrackArtists !== artistsList) {
            allArtistsSection = `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                    <p><strong>Todos os artistas únicos das faixas (${artistCount}):</strong></p>
                    <p style="font-size: 0.9em; color: #666; max-height: 100px; overflow-y: auto;">${allTrackArtists}</p>
                </div>
            `;
        }
    }

    modalBody.innerHTML = `
        <div class="playlist-details">
            <p><strong>Nome:</strong> ${playlist.name}</p>
            <p><strong>Descrição:</strong> ${playlist.description || 'N/A'}</p>
            <p><strong>Tipo:</strong> <span class="badge ${badgeClass}">${typeText}</span></p>
            <p><strong>Artistas pesquisados:</strong> ${artistsList}</p>
            <p><strong>Faixas:</strong> ${playlist.tracks_total || playlist.trackCount || '0'}</p>
            <p><strong>Criada em:</strong> ${formatDate(playlist.createdAt)}</p>
            <p><strong>Criada por:</strong> ${userInfo}</p>
            <p><strong>Link:</strong> <a href="${playlist.external_urls?.spotify || '#'}" target="_blank" class="playlist-link">Abrir no Spotify</a></p>
            
            ${artistsSection}
        </div>
    `;
    
    modal.style.display = 'block';
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Carregar dados iniciais
    loadData();
    
    // Event listeners para tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.dataset.tab;
            
            // Remover classe active de todas as tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Adicionar classe active à tab selecionada
            this.classList.add('active');
            document.getElementById(targetTab + '-tab').classList.add('active');
        });
    });
    
    // Event listeners para busca
    userSearchInput.addEventListener('input', function() {
        userFilter = this.value;
        renderUserTable();
    });
    
    playlistSearchInput.addEventListener('input', function() {
        playlistFilter = this.value;
        renderPlaylistTable();
    });
    
    // Event listeners para ordenação
    userSortSelect.addEventListener('change', function() {
        userSortField = this.value;
        renderUserTable();
    });
    
    playlistSortSelect.addEventListener('change', function() {
        playlistSortField = this.value;
        renderPlaylistTable();
    });
    
    userSortDirButton.addEventListener('click', function() {
        userSortDirection = userSortDirection === 'asc' ? 'desc' : 'asc';
        this.textContent = userSortDirection === 'asc' ? '↑' : '↓';
        renderUserTable();
    });
    
    playlistSortDirButton.addEventListener('click', function() {
        playlistSortDirection = playlistSortDirection === 'asc' ? 'desc' : 'asc';
        this.textContent = playlistSortDirection === 'asc' ? '↑' : '↓';
        renderPlaylistTable();
    });
    
    // Event listener para fechar modal
    closeModal.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    // Fechar modal clicando fora dele
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});
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
    return user ? user.displayName || user.id : userId;
}

// Renderizar tabela de usuários
function renderUserTable() {
    // Filtrar usuários
    let filteredUsers = users;
    if (userFilter) {
        const filter = userFilter.toLowerCase();
        filteredUsers = users.filter(user => 
            (user.displayName && user.displayName.toLowerCase().includes(filter)) ||
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
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <img src="${user.imageUrl || 'https://via.placeholder.com/40'}" alt="${user.displayName || 'User'}" class="user-avatar">
            </td>
            <td>${user.displayName || 'N/A'}</td>
            <td>${user.email || 'N/A'}</td>
            <td>${user.country || 'N/A'}</td>
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
    
    modalTitle.textContent = `Detalhes do Usuário: ${user.displayName || user.id}`;
    
    modalBody.innerHTML = `
        <div class="user-details">
            <div class="user-profile">
                <img src="${user.imageUrl || 'https://via.placeholder.com/150'}" alt="${user.displayName || 'User'}" class="user-detail-avatar">
                <h3>${user.displayName || 'N/A'}</h3>
                <p><strong>ID:</strong> ${user.id}</p>
                <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
                <p><strong>País:</strong> ${user.country || 'N/A'}</p>
                <p><strong>Primeiro Login:</strong> ${formatDate(user.firstLogin)}</p>
                <p><strong>Último Login:</strong> ${formatDate(user.lastLogin)}</p>
                <p><a href="${user.profileUrl}" target="_blank" class="profile-link">Ver Perfil no Spotify</a></p>
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
    
    modalTitle.textContent = `Playlists de ${user.displayName || user.id}`;
    
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
        userInfo = `<strong>${user.displayName || user.id}</strong>`;
        if (user.email) {
            userInfo += ` (${user.email})`;
        }
    }
    
    // Solicitar detalhes adicionais da playlist se necessário
    const urlParams = new URLSearchParams(window.location.search);
    const password = urlParams.get('password');
    
    // Verificar se temos dados adicionais na playlist (artistas solicitados vs encontrados)
    if (playlist.requestedArtists) {
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
    if (playlist.extra_data && playlist.extra_data.foundArtists) {
        const foundArtistsNames = playlist.extra_data.foundArtists
            .filter(artist => !artist.notFound && !artist.error)
            .map(artist => artist.name || artist.requestedName)
            .filter(name => name);
        
        if (foundArtistsNames.length > 0) {
            artistsList = foundArtistsNames.join(', ');
        }
    } else if (playlist.extra_data && playlist.extra_data.requestedArtists) {
        // Fallback para artistas solicitados
        artistsList = playlist.extra_data.requestedArtists.join(', ');
    }

    modalBody.innerHTML = `
        <div class="playlist-details">
            <p><strong>Nome:</strong> ${playlist.name}</p>
            <p><strong>Descrição:</strong> ${playlist.description || 'N/A'}</p>
            <p><strong>Tipo:</strong> <span class="badge ${badgeClass}">${typeText}</span></p>
            <p><strong>Artistas:</strong> ${artistsList}</p>
            <p><strong>Faixas:</strong> ${playlist.tracks_total || playlist.trackCount || '0'}</p>
            <p><strong>Criada em:</strong> ${formatDate(playlist.createdAt)}</p>
            <p><strong>Criada por:</strong> ${userInfo}</p>
            <p><strong>Link:</strong> <a href="${playlist.external_urls?.spotify || '#'}" target="_blank" class="playlist-link">Abrir no Spotify</a></p>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Renderizar detalhes completos da playlist com informações dos artistas
function renderFullPlaylistDetails(playlist, userInfo, badgeClass, typeText) {
    let artistsSection = '';
    
    if (playlist.requestedArtists && playlist.requestedArtists.length > 0) {
        artistsSection = `
            <div class="artists-comparison">
                <h3>Artistas Solicitados vs. Encontrados</h3>
                <table class="artists-table">
                    <thead>
                        <tr>
                            <th>Artista Solicitado</th>
                            <th>Artista Encontrado</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        playlist.requestedArtists.forEach(reqArtist => {
            const foundArtist = playlist.foundArtists && playlist.foundArtists.find(a => a.requestedName === reqArtist);
            
            let status, artistName;
            if (!foundArtist) {
                status = '<span class="status-error">Não encontrado</span>';
                artistName = 'N/A';
            } else if (foundArtist.error) {
                status = `<span class="status-error">Erro: ${foundArtist.errorMessage || 'Desconhecido'}</span>`;
                artistName = 'N/A';
            } else {
                status = '<span class="status-success">Encontrado</span>';
                artistName = foundArtist.name;
            }
            
            artistsSection += `
                <tr>
                    <td>${reqArtist}</td>
                    <td>${artistName}</td>
                    <td>${status}</td>
                </tr>
            `;
        });
        
        artistsSection += `
                    </tbody>
                </table>
            </div>
        `;
    }
    
    modalBody.innerHTML = `
        <div class="playlist-details">
            <p><strong>Nome:</strong> ${playlist.name}</p>
            <p><strong>Descrição:</strong> ${playlist.description || 'N/A'}</p>
            <p><strong>Tipo:</strong> <span class="badge ${badgeClass}">${typeText}</span></p>
            <p><strong>Artistas:</strong> ${playlist.foundArtists ? 
                playlist.foundArtists
                    .filter(artist => !artist.notFound && !artist.error)
                    .map(artist => artist.name || artist.requestedName)
                    .join(', ') || 'N/A' : 
                (playlist.artistsCount || 'N/A')}</p>
            <p><strong>Faixas:</strong> ${playlist.trackCount || '0'}</p>
            <p><strong>Criada em:</strong> ${formatDate(playlist.createdAt)}</p>
            <p><strong>Criada por:</strong> ${userInfo}</p>
            <p><strong>Link:</strong> <a href="${playlist.url}" target="_blank" class="playlist-link">Abrir no Spotify</a></p>
            ${artistsSection}
        </div>
    `;
    
    modal.style.display = 'block';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', loadData);

// Alternar entre abas
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Remover classe ativa de todos os botões e painéis
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        // Adicionar classe ativa ao botão clicado
        button.classList.add('active');
        
        // Ativar o painel correspondente
        const tabId = button.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

// Pesquisar usuários
userSearchInput.addEventListener('input', (e) => {
    userFilter = e.target.value;
    renderUserTable();
});

// Pesquisar playlists
playlistSearchInput.addEventListener('input', (e) => {
    playlistFilter = e.target.value;
    renderPlaylistTable();
});

// Ordenar usuários
userSortSelect.addEventListener('change', (e) => {
    userSortField = e.target.value;
    renderUserTable();
});

// Ordenar playlists
playlistSortSelect.addEventListener('change', (e) => {
    playlistSortField = e.target.value;
    renderPlaylistTable();
});

// Alternar direção de ordenação de usuários
userSortDirButton.addEventListener('click', () => {
    userSortDirection = userSortDirection === 'asc' ? 'desc' : 'asc';
    userSortDirButton.textContent = userSortDirection === 'asc' ? '↑' : '↓';
    renderUserTable();
});

// Alternar direção de ordenação de playlists
playlistSortDirButton.addEventListener('click', () => {
    playlistSortDirection = playlistSortDirection === 'asc' ? 'desc' : 'asc';
    playlistSortDirButton.textContent = playlistSortDirection === 'asc' ? '↑' : '↓';
    renderPlaylistTable();
});

// Fechar modal
closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

// Fechar modal ao clicar fora dele
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}); 
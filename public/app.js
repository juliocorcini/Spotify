// DOM Elements
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

// Store tokens
let accessToken = '';
let refreshToken = '';
let expiresIn = 0;

// Store playlist preview data
let previewPlaylistData = null;

// Show/hide loader
function showLoader() {
    loader.classList.remove('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}

// Check if we have a token in localStorage or URL parameters
function checkAuth() {
    // Hide the loader if visible
    hideLoader();
    
    // Check URL parameters for tokens (if redirected after login)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('access_token');
    const refresh = urlParams.get('refresh_token');
    const expires = urlParams.get('expires_in');
    
    if (token) {
        // We have tokens in URL after login
        accessToken = token;
        refreshToken = refresh;
        expiresIn = expires;
        
        // Save tokens
        localStorage.setItem('spotify_access_token', accessToken);
        localStorage.setItem('spotify_refresh_token', refreshToken);
        localStorage.setItem('spotify_token_expiry', new Date().getTime() + (expiresIn * 1000));
        
        // Clear URL to not show tokens
        window.history.replaceState({}, document.title, '/');
        
        // Show profile
        showProfile();
        return;
    }
    
    // Check if we already have a saved token
    accessToken = localStorage.getItem('spotify_access_token');
    refreshToken = localStorage.getItem('spotify_refresh_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');
    
    if (accessToken && tokenExpiry && new Date().getTime() < parseInt(tokenExpiry)) {
        // Token exists and hasn't expired
        showProfile();
    } else if (refreshToken) {
        // Token expired but we have refresh token
        refreshAccessToken();
    } else {
        // We don't have any valid token
        showLogin();
    }
}

// Get user profile
async function fetchProfile() {
    try {
        const response = await fetch('/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (response.status === 401) {
            // Invalid token, try refresh
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
        // Ensure the loader is hidden in any case
        hideLoader();
    }
}

// Update UI with profile data
async function showProfile() {
    loginSection.classList.add('hidden');
    profileSection.classList.remove('hidden');
    playlistSection.classList.add('hidden');
    
    try {
        const profile = await fetchProfile();
        
        if (!profile) return;
        
        // Fill profile data
        displayName.textContent = profile.display_name || 'Spotify User';
        userId.textContent = `ID: ${profile.id}`;
        email.textContent = profile.email || 'Email not available';
        followers.textContent = profile.followers?.total || 0;
        
        // Set profile image
        if (profile.images && profile.images.length > 0) {
            profileImage.src = profile.images[0].url;
        } else {
            profileImage.src = 'https://placehold.co/150x150?text=No+Image';
        }
        
        // Add account control buttons
        const profileContainer = document.getElementById('profile-container');
        
        // Create div for buttons if it doesn't exist
        let accountControls = document.getElementById('account-controls');
        if (!accountControls) {
            accountControls = document.createElement('div');
            accountControls.id = 'account-controls';
            accountControls.className = 'account-controls';
            profileContainer.appendChild(accountControls);
        }
        
        // Disconnect button
        if (!document.getElementById('disconnect-button')) {
            const disconnectButton = document.createElement('button');
            disconnectButton.id = 'disconnect-button';
            disconnectButton.className = 'btn tertiary disconnect-btn';
            disconnectButton.textContent = 'Disconnect Account';
            disconnectButton.addEventListener('click', disconnectAccount);
            accountControls.appendChild(disconnectButton);
        }
        
        // Delete data button
        if (!document.getElementById('delete-data-button')) {
            const deleteButton = document.createElement('button');
            deleteButton.id = 'delete-data-button';
            deleteButton.className = 'btn tertiary delete-btn';
            deleteButton.textContent = 'Delete My Data';
            deleteButton.addEventListener('click', requestDataDeletion);
            accountControls.appendChild(deleteButton);
        }
    } catch (error) {
        console.error('Error showing profile:', error);
    } finally {
        // Ensure the loader is hidden
        hideLoader();
    }
}

// Function to disconnect account
function disconnectAccount() {
    if (confirm('Are you sure you want to disconnect your Spotify account? You will need to authorize again to use the application.')) {
        // Clear tokens and authentication data
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expiry');
        
        // Show success message
        alert('Your account has been successfully disconnected.');
        
        // Redirect to login screen
        showLogin();
    }
}

// Function to request data deletion
async function requestDataDeletion() {
    if (confirm('WARNING: This action will permanently delete all your data on our servers, including created playlists history. This action cannot be undone. Do you want to continue?')) {
        
        try {
            showLoader();
            
            // Get current user ID
            const profile = await fetchProfile();
            if (!profile || !profile.id) {
                throw new Error('Could not get user ID');
            }
            
            // Send request to delete data
            const response = await fetch(`/api/user-data/${profile.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete data');
            }
            
            // Disconnect account after successful deletion
            localStorage.removeItem('spotify_access_token');
            localStorage.removeItem('spotify_refresh_token');
            localStorage.removeItem('spotify_token_expiry');
            
            alert('Your data has been successfully deleted. You will be redirected to the home page.');
            showLogin();
            
        } catch (error) {
            console.error('Error deleting data:', error);
            alert(`Error deleting data: ${error.message}`);
        } finally {
            hideLoader();
        }
    }
}

// Show login screen
function showLogin() {
    profileSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    playlistSection.classList.add('hidden');
    
    // Clear localStorage
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expiry');
    
    // Ensure the loader is hidden
    hideLoader();
}

// Refresh expired token
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
        
        // Update tokens
        accessToken = data.access_token;
        expiresIn = data.expires_in;
        
        // Save to localStorage
        localStorage.setItem('spotify_access_token', accessToken);
        localStorage.setItem('spotify_token_expiry', new Date().getTime() + (expiresIn * 1000));
        
        return true;
    } catch (error) {
        console.error('Error refreshing token:', error);
        showLogin();
        return false;
    } finally {
        // Ensure the loader is hidden
        hideLoader();
    }
}

// Format track duration
function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Render artists and tracks on playlist page
function renderPlaylistDetails(artists, isPreview = false) {
    playlistArtists.innerHTML = '';
    
    // If preview, add button to create playlist
    if (isPreview) {
        const createButtonDiv = document.createElement('div');
        createButtonDiv.className = 'create-playlist-action';
        createButtonDiv.innerHTML = `
            <button id="confirm-create-playlist" class="btn primary">Create Playlist</button>
            <button id="cancel-create-playlist" class="btn tertiary">Back</button>
        `;
        playlistArtists.appendChild(createButtonDiv);
        
        // Add event listeners
        document.getElementById('confirm-create-playlist').addEventListener('click', confirmCreatePlaylist);
        document.getElementById('cancel-create-playlist').addEventListener('click', () => {
            playlistSection.classList.add('hidden');
            profileSection.classList.remove('hidden');
        });
    }
    
    artists.forEach(artist => {
        if (artist.notFound) {
            // Artist not found
            const artistElement = document.createElement('div');
            artistElement.className = 'artist-item';
            artistElement.innerHTML = `
                <div class="artist-info">
                    <div class="artist-name">${artist.name}</div>
                    <div class="artist-not-found">(Artist not found${artist.reason ? ': ' + artist.reason : ''})</div>
                </div>
            `;
            playlistArtists.appendChild(artistElement);
            return;
        }
        
        if (artist.error) {
            // Error processing artist
            const artistElement = document.createElement('div');
            artistElement.className = 'artist-item';
            artistElement.innerHTML = `
                <div class="artist-info">
                    <div class="artist-name">${artist.name}</div>
                    <div class="artist-error">(Error processing this artist: ${artist.errorMessage || 'Unknown error'})</div>
                </div>
            `;
            playlistArtists.appendChild(artistElement);
            return;
        }
        
        // Artist found with tracks
        const artistElement = document.createElement('div');
        artistElement.className = 'artist-item';
        
        // Artist info
        const artistInfo = document.createElement('div');
        artistInfo.className = 'artist-info';
        
        // Artist image
        const artistImageSrc = artist.image || 'https://placehold.co/80x80?text=No+Image';
        
        // Add warning if artist name is not exactly as requested
        const nameWarningHtml = artist.nameWarning ? 
            `<div class="artist-name-warning">${artist.nameWarning}</div>` : '';
        
        artistInfo.innerHTML = `
            <img src="${artistImageSrc}" alt="${artist.name}" class="artist-image">
            <div class="artist-details">
                <div class="artist-name">${artist.name}</div>
                ${nameWarningHtml}
            </div>
        `;
        
        // Track list
        const trackList = document.createElement('ul');
        trackList.className = 'track-list';
        
        if (!artist.tracks || artist.tracks.length === 0) {
            const noTracksItem = document.createElement('li');
            noTracksItem.className = 'no-tracks';
            noTracksItem.textContent = 'No tracks found for this artist.';
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
        
        // Add everything to the artist element
        artistElement.appendChild(artistInfo);
        artistElement.appendChild(trackList);
        
        // Add to artists list
        playlistArtists.appendChild(artistElement);
    });
}

// Load preview of favorite artists songs
async function previewTopArtists() {
    showLoader();
    
    try {
        const response = await fetch('/top-artists', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (response.status === 401) {
            // Invalid token, try refresh
            await refreshAccessToken();
            return previewTopArtists();
        }
        
        if (!response.ok) {
            throw new Error('Error fetching top artists');
        }
        
        const topArtistsData = await response.json();
        const artists = topArtistsData.items.slice(0, 10); // Limit to 10 artists
        
        // Prepare data for preview
        const previewArtists = [];
        
        for (const artist of artists) {
            try {
                // Get artist's most popular tracks
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
                    errorMessage: error.message || "Unknown error"
                });
            }
        }
        
        // Store data to create playlist later
        previewPlaylistData = {
            type: 'top',
            artists: previewArtists
        };
        
        // Show preview
        showPlaylistPreview("Preview - My Favorite Artists", "These tracks will be added to your playlist.");
        
    } catch (error) {
        console.error('Error previewing top artists:', error);
        resultMessage.textContent = 'Error loading favorite artists. Please try again.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
    } finally {
        hideLoader();
    }
}

// Load preview of custom artists songs
async function previewCustomArtists(event) {
    event.preventDefault();
    
    // Get form values
    const artistsText = artistsInput.value.trim();
    if (!artistsText) {
        resultMessage.textContent = 'Enter at least one artist.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
        return;
    }
    
    // Split by line and remove empty lines
    const artistsList = artistsText.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
    
    if (artistsList.length === 0) {
        resultMessage.textContent = 'Enter at least one valid artist.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
        return;
    }
    
    // Get number of tracks and playlist name
    const tracksCount = tracksPerArtist.value;
    const customPlaylistName = playlistNameInput.value.trim() || 'My Custom Playlist';
    
    showLoader();
    
    try {
        // Prepare data for preview
        const previewArtists = [];
        
        for (const artistName of artistsList) {
            try {
                // Search for artist
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
                    // Artist not found
                    previewArtists.push({
                        name: artistName,
                        notFound: true
                    });
                    continue;
                }
                
                // Find closest artist using the compareNames function
                const artist = findBestArtistMatch(artistName, searchData.artists.items);
                
                // If no sufficiently similar artist was found
                if (!artist) {
                    previewArtists.push({
                        name: artistName,
                        notFound: true,
                        reason: "Could not find this artist with sufficient accuracy."
                    });
                    continue;
                }
                
                // Check if the name is exactly the same (ignoring case and spaces)
                const exactMatch = artist.name.toLowerCase().trim() === artistName.toLowerCase().trim();
                const nameWarning = !exactMatch ? 
                    `Warning: Found "${artist.name}" instead of "${artistName}"` : null;
                
                // Get artist's most popular tracks
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
                    errorMessage: error.message || "Unknown error"
                });
            }
        }
        
        // Store data to create playlist later
        previewPlaylistData = {
            type: 'custom',
            artists: previewArtists,
            tracksPerArtist: tracksCount,
            playlistName: customPlaylistName
        };
        
        // Show preview
        showPlaylistPreview(`Preview - ${customPlaylistName}`, "These tracks will be added to your playlist.");
        
    } catch (error) {
        console.error('Error previewing custom artists:', error);
        resultMessage.textContent = 'Error loading artists. Please try again.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
    } finally {
        hideLoader();
    }
}

// Find the best matching artist among search results
function findBestArtistMatch(requestedName, candidates) {
    if (!candidates || candidates.length === 0) return null;
    
    // Normalize the requested name
    const requestedClean = requestedName.toLowerCase().trim();
    
    // First, look for exact match
    for (const artist of candidates) {
        const artistNameClean = artist.name.toLowerCase().trim();
        if (artistNameClean === requestedClean) {
            return artist;
        }
    }
    
    // Second, look for inclusion
    for (const artist of candidates) {
        const artistNameClean = artist.name.toLowerCase().trim();
        if (artistNameClean.includes(requestedClean) || requestedClean.includes(artistNameClean)) {
            return artist;
        }
    }
    
    // Third, calculate similarity using Levenshtein and accept if high enough
    for (const artist of candidates) {
        const artistNameClean = artist.name.toLowerCase().trim();
        const similarity = calculateSimilarity(requestedClean, artistNameClean);
        if (similarity >= 0.8) {
            return artist;
        }
    }
    
    // If similarity is too low, don't return any artist
    return null;
}

// Calculate similarity between two strings (simplified)
function calculateSimilarity(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0; // Both empty
    
    let matches = 0;
    const minLength = Math.min(str1.length, str2.length);
    
    // Count matching characters
    for (let i = 0; i < minLength; i++) {
        if (str1.charAt(i) === str2.charAt(i)) {
            matches++;
        }
    }
    
    // Basic similarity
    return matches / maxLength;
}

// Show playlist preview
function showPlaylistPreview(title, description) {
    profileSection.classList.add('hidden');
    loginSection.classList.add('hidden');
    playlistSection.classList.remove('hidden');
    
    playlistName.textContent = title;
    playlistDescription.textContent = description;
    playlistLink.textContent = "Create Playlist";
    playlistLink.removeAttribute('href');
    playlistLink.classList.add('hidden');
    
    // Render artists and tracks in preview mode
    renderPlaylistDetails(previewPlaylistData.artists, true);
}

// Confirm playlist creation after preview
async function confirmCreatePlaylist() {
    if (!previewPlaylistData) return;
    
    showLoader();
    
    try {
        let response;
        
        if (previewPlaylistData.type === 'top') {
            // Create playlist with top artists
            response = await fetch('/create-artist-playlist', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
        } else {
            // Create playlist with custom artists
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
            // Invalid token, try refresh
            await refreshAccessToken();
            return confirmCreatePlaylist();
        }
        
        if (!response.ok) {
            throw new Error('Error creating playlist');
        }
        
        const data = await response.json();
        
        // Show success message
        resultMessage.textContent = 'Playlist created successfully!';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('success');
        
        // Update UI with created playlist
        playlistName.textContent = data.playlist.name;
        playlistDescription.textContent = data.playlist.description;
        playlistLink.textContent = "Open in Spotify";
        playlistLink.href = data.playlist.external_urls.spotify;
        playlistLink.classList.remove('hidden');
        
        // Render artists and tracks (without create button)
        renderPlaylistDetails(data.artists);
        
    } catch (error) {
        console.error('Error creating playlist:', error);
        resultMessage.textContent = 'Error creating playlist. Please try again.';
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
    } finally {
        hideLoader();
    }
}

// Switch tabs
function switchTab(event) {
    const tabId = event.target.getAttribute('data-tab');
    
    // Deactivate all tabs
    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.add('hidden'));
    
    // Activate selected tab
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

// Event listeners for tabs
tabs.forEach(tab => {
    tab.addEventListener('click', switchTab);
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Ensure the loader is hidden initially
    hideLoader();
    checkAuth();
}); 
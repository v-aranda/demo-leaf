// Configurações iniciais
const map = L.map('map').setView([-15.7889, -47.8799], 4);
let userMarkers = [];
let businessMarkers = [];
let currentUserMarker = null;
const GEOCODE_CACHE = new Map();

// Elementos da UI
const statusDiv = document.getElementById('status');
const usersList = document.getElementById('entities-list');
const userSearch = document.getElementById('user-search');

// Dados de exemplo
const users = [
    {
        id: 1,
        name: "Paulo Alves",
        type: "user",
        photo: "https://randomuser.me/api/portraits/men/31.jpg",
        location: { lat: -23.5505, lng: -46.6333 },
        lastActive: "Online agora"
    },
    {
        id: 2,
        name: "Teste Silva",
        type: "user",
        photo: "https://randomuser.me/api/portraits/men/32.jpg",
        location: { lat: -9.6529, lng: -35.7263 },
        lastActive: "Online agora"
    },
];

const businesses = [
    {
        id: 1001,
        name: "Loja Central",
        type: "business",
        photo: "https://www.vipsportsbr.com.br/escola/public/uploads/logos/DADqFoL0M14zibRHk8y1O0CqGSQXTBL64iFEf21X.png",
        category: "Varejo",
        location: { lat: -23.551, lng: -46.631 },
        address: "Av. Paulista, 1000"
    }
];

// Funções de UI
function showLoading() {
    const loading = document.createElement('div');
    loading.id = 'global-loading';
    loading.innerHTML = `
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <p>Carregando dados...</p>
        </div>
    `;
    document.body.appendChild(loading);
}

function hideLoading() {
    const loading = document.getElementById('global-loading');
    if (loading) {
        loading.remove();
    }
}

// Funções de mapa
function initMap() {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
}

// Funções de geocoding
async function reverseGeocode(coords) {
    const cacheKey = `${coords.lat.toFixed(4)}_${coords.lng.toFixed(4)}`;
    
    if (GEOCODE_CACHE.has(cacheKey)) {
        return GEOCODE_CACHE.get(cacheKey);
    }

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json`
        );
        const data = await response.json();
        
        const result = {
            city: data.address.city || data.address.town || 'N/A',
            state: data.address.state || 'N/A',
            country: data.address.country || 'N/A'
        };
        
        GEOCODE_CACHE.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error("Reverse geocode error:", error);
        return {
            city: 'N/A',
            state: 'N/A',
            country: 'N/A'
        };
    }
}

// Funções de marcadores
function createUserMarker(user) {
    const marker = L.marker([user.location.lat, user.location.lng], {
        icon: L.divIcon({
            className: 'user-marker',
            html: `<img src="${user.photo}" alt="${user.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`,
            iconSize: [45, 45],
            iconAnchor: [22, 45]
        })
    }).bindPopup(`
        <div class="user-popup">
            <img src="${user.photo}" class="popup-avatar">
            <h3>${user.name}</h3>
            <p>${user.lastActive}</p>
        </div>
    `);
    
    marker.entity = user;
    return marker;
}

function createBusinessMarker(business) {
    const marker = L.marker([business.location.lat, business.location.lng], {
        icon: L.divIcon({
            className: 'business-marker',
            html: `<img src="${business.photo}" alt="${business.name}" style="width:100%;height:100%;border-radius:8px;object-fit:cover;">`,
            iconSize: [40, 40],
            iconAnchor: [20, 40]
        })
    }).bindPopup(`
        <div class="business-popup">
            <img src="${business.photo}" class="popup-avatar">
            <h3>${business.name}</h3>
            <p>${business.category}</p>
            <p>${business.address}</p>
        </div>
    `);
    
    marker.entity = business;
    return marker;
}

// Funções de lista
function createEntityItem(entity) {
    const item = document.createElement('div');
    item.className = `entity-item ${entity.type}`;
    item.dataset.entityId = entity.id;
    
    const location = GEOCODE_CACHE.get(`${entity.location.lat.toFixed(4)}_${entity.location.lng.toFixed(4)}`);
    const icon = entity.type === 'user' ? '👤' : '🏢';
    
    item.innerHTML = `
        <img class="entity-image" src="${entity.photo}" alt="${entity.name}">
        <div class="entity-info">
            <div class="entity-name">${entity.name}</div>
            <div class="entity-location">${location ? `${location.city}, ${location.state}` : 'Carregando...'}</div>
        </div>
        <div class="entity-type-icon">${icon}</div>
    `;

    item.addEventListener('click', () => {
        document.querySelectorAll('.entity-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        const marker = entity.type === 'user' 
            ? userMarkers.find(m => m.entity.id === entity.id)
            : businessMarkers.find(m => m.entity.id === entity.id);
            
        if (marker) {
            map.setView(marker.getLatLng(), 12);
            marker.openPopup();
        }
    });

    return item;
}

function updateEntityList(entities) {
    const container = document.getElementById('items-container');
    container.innerHTML = '';
    
    entities.forEach(entity => {
        container.appendChild(createEntityItem(entity));
    });
}

// Funções principais
async function loadMapData() {
    showLoading();
    
    try {
        // Carrega geocoding em paralelo
        const geoPromises = [...users, ...businesses].map(entity => 
            reverseGeocode(entity.location)
        );
        
        await Promise.all(geoPromises);
        
        // Cria marcadores
        users.forEach(user => {
            const marker = createUserMarker(user);
            marker.addTo(map);
            userMarkers.push(marker);
        });

        businesses.forEach(business => {
            const marker = createBusinessMarker(business);
            marker.addTo(map);
            businessMarkers.push(marker);
        });

        // Atualiza lista
        updateEntityList([...users, ...businesses]);
        
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        statusDiv.textContent = "Erro ao carregar dados";
    } finally {
        hideLoading();
    }
}

// Geolocalização
async function updateLocation() {
    statusDiv.textContent = "Obtendo localização...";
    
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000
            });
        });

        const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        if (currentUserMarker) map.removeLayer(currentUserMarker);
        
        currentUserMarker = L.marker([coords.lat, coords.lng], {
            icon: L.divIcon({
                className: 'current-user-marker',
                html: '📍',
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            })
        }).addTo(map);

        map.setView([coords.lat, coords.lng], 12);
        statusDiv.textContent = `Localização: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
        
    } catch (error) {
        handleGeolocationError(error);
    }
}

function handleGeolocationError(error) {
    const messages = {
        1: "Permissão negada",
        2: "Localização indisponível",
        3: "Tempo esgotado"
    };
    statusDiv.textContent = `Erro: ${messages[error.code] || "Erro desconhecido"}`;
}

// Filtros
function applyFilters() {
    const searchTerm = document.getElementById('user-search').value.toLowerCase();
    const typeFilter = document.getElementById('filter-type').value;

    const filtered = [...users, ...businesses].filter(entity => {
        // Filtro de tipo
        if (typeFilter !== 'all' && entity.type !== typeFilter) return false;
        
        // Filtro de busca
        if (searchTerm && !entity.name.toLowerCase().includes(searchTerm)) return false;
        
        return true;
    });

    updateEntityList(filtered);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadMapData();
    
    // Event listeners
    document.getElementById('locate-btn').addEventListener('click', updateLocation);
    document.getElementById('user-search').addEventListener('input', applyFilters);
    document.getElementById('filter-type').addEventListener('change', applyFilters);
});
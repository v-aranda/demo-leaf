// Configurações iniciais
const map = L.map('map').setView([-15.7889, -47.8799], 4);
let userMarkers = [];
let businessMarkers = [];
let currentUserMarker = null;

// Sistema de Cache Avançado
const GeoCache = {
    storageKey: 'geocode_cache_v3',
    cache: new Map(),
    maxSize: 1000,
    ttl: 24 * 60 * 60 * 1000, // 24 horas em milissegundos

    init() {
        const savedCache = localStorage.getItem(this.storageKey);
        if (savedCache) {
            try {
                const parsed = JSON.parse(savedCache);
                const now = Date.now();

                parsed.forEach(([key, { data, timestamp }]) => {
                    // Verifica se o item ainda é válido
                    if (now - timestamp < this.ttl) {
                        // Garante a estrutura dos dados em cache
                        if (data.city && data.state && data.country) {
                            this.cache.set(key, data);
                        }
                    }
                });

                console.log(`Cache inicializado com ${this.cache.size} itens válidos`);
            } catch (e) {
                console.error("Erro ao carregar cache:", e);
                localStorage.removeItem(this.storageKey);
            }
        }
    },

    get(key) {
        return this.cache.get(key);
    },

    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
        this.persist();
    },

    persist() {
        const cacheArray = Array.from(this.cache.entries()).map(([key, data]) => [
            key,
            { data, timestamp: Date.now() }
        ]);
        localStorage.setItem(this.storageKey, JSON.stringify(cacheArray));
    }
};

// Inicializa o cache
GeoCache.init();

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
        photo: "https://images.vexels.com/media/users/3/142789/isolated/preview/2bfb04ad814c4995f0c537c68db5cd0b-logotipo-do-circulo-multicolorido.png",
        category: "Varejo",
        postalCode: "01311-000", // CEP da Av. Paulista, SP
        address: "Av. Paulista, 1000"
    },
    {
        id: 1002,
        name: "Teste Maceió",
        type: "business",
        photo: "https://marketplace.canva.com/EAGPJqKo-g0/1/0/1600w/canva-logo-simples-circular-esmaltaria-preto-tlIdkPoPItQ.jpg",
        category: "Varejo",
        postalCode: "57035-690", // CEP da Av. Paulista, SP
        address: "Av. Paulista, 1000"
    },
    // ... outros negócios
];

// Controle de Rate Limit para a API Nominatim
const GeocodeService = {
    lastRequestTime: 0,
    requestQueue: [],
    isProcessing: false,

    async reverseGeocode(coords) {
        const cacheKey = `geo_${coords.lat.toFixed(4)}_${coords.lng.toFixed(4)}`;

        // Verifica cache primeiro
        const cached = GeoCache.get(cacheKey);
        if (cached) {
            console.log('Retornando do cache:', cacheKey);
            // Garante que o objeto retornado tem a estrutura completa
            return {
                coords: { lat: coords.lat, lng: coords.lng },
                city: cached.city,
                state: cached.state,
                country: cached.country
            };
        }

        return new Promise((resolve) => {
            this.requestQueue.push({
                coords,
                resolve: (result) => {
                    const completeResult = {
                        coords: { lat: coords.lat, lng: coords.lng },
                        city: result.city,
                        state: result.state,
                        country: result.country
                    };
                    // Armazena apenas os dados necessários no cache
                    GeoCache.set(cacheKey, {
                        city: result.city,
                        state: result.state,
                        country: result.country
                    });
                    resolve(completeResult);
                }
            });
            if (!this.isProcessing) this.processQueue();
        });
    },

    async processQueue() {
        if (this.requestQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const { coords, resolve } = this.requestQueue.shift();

        try {
            // Respeita rate limit
            const now = Date.now();
            const delay = Math.max(0, 1000 - (now - this.lastRequestTime));
            await new Promise(res => setTimeout(res, delay));

            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&accept-language=pt-BR`
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.lastRequestTime = Date.now();

            // Extração robusta dos dados com fallbacks
            const address = data.address || {};
            const result = {
                city: address.city || address.town || address.village || 'N/A',
                state: address.state || address.region || 'N/A',
                country: address.country || 'N/A'
            };

            resolve(result);

        } catch (error) {
            console.error('Erro no reverse geocode:', error);
            resolve({
                city: 'N/A',
                state: 'N/A',
                country: 'N/A'
            });
        } finally {
            setTimeout(() => this.processQueue(), 0);
        }
    },
    async geocodePostalCode(postalCode) {
        const cacheKey = `postal_${postalCode}`;
        
        // Verifica o cache primeiro
        const cached = GeoCache.get(cacheKey);
        if (cached) {
            console.log('Retornando CEP do cache:', postalCode);
            return cached;
        }

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?postalcode=${postalCode}&format=json&country=Brasil`
            );
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            if (data.length === 0) {
                throw new Error("CEP não encontrado");
            }

            const result = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                address: data[0].display_name
            };

            GeoCache.set(cacheKey, result);
            return result;

        } catch (error) {
            console.error("Erro no geocode do CEP:", error);
            return null;
        }
    }
};

// Funções de UI
const UI = {
    showLoading() {
        let loading = document.getElementById('global-loading');
        if (!loading) {
            loading = document.createElement('div');
            loading.id = 'global-loading';
            loading.innerHTML = `
                <div class="loading-overlay">
                    <div class="loading-spinner"></div>
                    <p>Carregando dados...</p>
                </div>
            `;
            document.body.appendChild(loading);
        }
    },

    hideLoading() {
        const loading = document.getElementById('global-loading');
        if (loading) loading.remove();
    },

    updateStatus(text) {
        const status = document.getElementById('status');
        if (status) status.textContent = text;
    }
};
// Função das localiadades
class LocationManager {
    constructor() {
        this.locations = new Map();
        this.countries = new Set();
        this.states = new Map(); // { country: Set(states) }
        this.cities = new Map(); // { state: Set(cities) }
    }

    async init(entities) {
        // Processa todas as entidades para extrair locais
        const uniqueLocations = new Set(
            entities.map(e => `${e.location.lat},${e.location.lng}`)
        );

        // Processa em paralelo com limite de concorrência
        await this.processLocations(Array.from(uniqueLocations), 3);
        this.populateCountries();
    }

    async processLocations(locationKeys, concurrency) {
        const processBatch = async (batch) => {
            return Promise.all(batch.map(async locStr => {
                const [lat, lng] = locStr.split(',').map(Number);
                const details = await GeocodeService.reverseGeocode({ lat, lng });
                if (details) this.addLocation(details);
            }));
        };

        for (let i = 0; i < locationKeys.length; i += concurrency) {
            const batch = locationKeys.slice(i, i + concurrency);
            await processBatch(batch);
        }
    }

    addLocation(details) {
        try {
            // Verificação mais robusta da estrutura dos dados
            if (!details || typeof details !== 'object') {
                console.error('Dados de localização inválidos (não é objeto):', details);
                return;
            }

            // Verifica se temos coordenadas válidas
            if (!details.coords || typeof details.coords.lat !== 'number' || typeof details.coords.lng !== 'number') {
                console.error('Coordenadas inválidas:', details);
                return;
            }

            const locKey = `${details.coords.lat},${details.coords.lng}`;

            // Garante que temos pelo menos país e estado
            if (!details.country || !details.state) {
                console.error('Dados de localização incompletos:', details);
                return;
            }

            this.locations.set(locKey, details);

            // Países
            this.countries.add(details.country);

            // Estados
            if (!this.states.has(details.country)) {
                this.states.set(details.country, new Set());
            }
            this.states.get(details.country).add(details.state);

            // Cidades (opcional)
            if (details.city) {
                const stateKey = `${details.country}_${details.state}`;
                if (!this.cities.has(stateKey)) {
                    this.cities.set(stateKey, new Set());
                }
                this.cities.get(stateKey).add(details.city);
            }

        } catch (error) {
            console.error('Erro ao adicionar localização:', error, details);
        }
    }

    populateCountries() {
        const select = document.getElementById('country-select');
        select.innerHTML = '<option value="">Todos os Países</option>';

        Array.from(this.countries).sort().forEach(country => {
            select.appendChild(new Option(country, country));
        });

        select.disabled = false;
    }

    populateStates(country) {
        const select = document.getElementById('state-select');
        select.innerHTML = '<option value="">Todos os Estados</option>';

        if (country && this.states.has(country)) {
            Array.from(this.states.get(country)).sort().forEach(state => {
                select.appendChild(new Option(state, state));
            });
        }

        select.disabled = !country;
        this.populateCities(country, '');
    }

    populateCities(country, state) {
        const select = document.getElementById('city-select');
        select.innerHTML = '<option value="">Todas as Cidades</option>';

        const stateKey = `${country}_${state}`;
        if (country && state && this.cities.has(stateKey)) {
            Array.from(this.cities.get(stateKey)).sort().forEach(city => {
                select.appendChild(new Option(city, city));
            });
        }

        select.disabled = !(country && state);
    }

    getLocation(coords) {
        if (!coords || !coords.lat || !coords.lng) return null;
        const key = `${coords.lat},${coords.lng}`;
        return this.locations.get(key) || null;
    }

    addBusinessLocation(business) {
        if (!business.location) return;
        
        const details = {
            coords: business.location,
            city: this.extractCityFromAddress(business.address),
            state: this.extractStateFromAddress(business.address),
            country: "Brasil"
        };
        
        this.addLocation(details);
    }

    extractCityFromAddress(address) {
        // Exemplo: "Av. Paulista, 1000 - São Paulo/SP"
        const match = address.match(/\s-\s([^\/]+)\//);
        return match ? match[1].trim() : 'N/A';
    }

    extractStateFromAddress(address) {
        // Exemplo: "Av. Paulista, 1000 - São Paulo/SP"
        const match = address.match(/\/\s*([A-Z]{2})\b/);
        return match ? match[1].trim() : 'N/A';
    }
}
// Funções do Mapa
const MapManager = {
    init() {
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
    },

    createUserMarker(user) {
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
    },

    createBusinessMarker(business) {
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
    },

    async locateUser() {
        UI.updateStatus("Obtendo sua localização...");
        UI.showLoading();

        try {
            // Verifica se o navegador suporta geolocalização
            if (!navigator.geolocation) {
                throw new Error("Geolocalização não suportada pelo navegador");
            }

            // Promisify a geolocation API
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    }
                );
            });

            const coords = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            // Remove marcador anterior se existir
            if (currentUserMarker) {
                map.removeLayer(currentUserMarker);
            }

            // Cria novo marcador
            currentUserMarker = L.marker([coords.lat, coords.lng], {
                icon: L.divIcon({
                    className: 'current-user-marker',
                    html:'⚪',
                    iconSize: [30, 30],
                    iconAnchor: [20, 20]
                })
            }).addTo(map);

            // Centraliza o mapa
            map.setView([coords.lat, coords.lng], 15);

            // Atualiza status
            UI.updateStatus(`Você está aqui: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);

            // Opcional: Faz reverse geocode para mostrar o endereço
            try {
                const location = await GeocodeService.reverseGeocode(coords);
                if (location && location.city !== 'N/A') {
                    UI.updateStatus(`Você está em ${location.city}, ${location.state}`);
                }
            } catch (e) {
                console.log("Não foi possível obter endereço", e);
            }

            return coords;

        } catch (error) {
            console.error("Erro na geolocalização:", error);

            const messages = {
                1: "Permissão de localização negada pelo usuário",
                2: "Localização indisponível",
                3: "Tempo de solicitação excedido"
            };

            UI.updateStatus(messages[error.code] || "Não foi possível determinar sua localização");

            // Centraliza em uma localização padrão se falhar
            map.setView([-15.7889, -47.8799], 4);
            return null;

        } finally {
            UI.hideLoading();
        }
    }
};

// Gerenciador de Entidades
const EntityManager = {
    async loadAll() {
        UI.showLoading();

        try {
            const allEntities = [...users, ...businesses];

            // Processa geocoding primeiro
            await locationManager.init(allEntities);

            // Cria marcadores
            userMarkers = users.map(user => MapManager.createUserMarker(user));
            businessMarkers = businesses.map(business => MapManager.createBusinessMarker(business));

            // Adiciona ao mapa
            userMarkers.forEach(marker => marker.addTo(map));
            businessMarkers.forEach(marker => marker.addTo(map));

            // Atualiza UI
            this.updateEntityList(allEntities);

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            UI.updateStatus("Erro ao carregar dados");
        } finally {
            UI.hideLoading();
        }
    },

    async processWithConcurrency(entities, concurrency = 3) {
        const results = [];
        const executing = [];

        for (const entity of entities) {
            const p = GeocodeService.reverseGeocode(entity.location)
                .then(address => {
                    entity.address = address;
                    results.push(entity);
                });

            executing.push(p);
            if (executing.length >= concurrency) {
                await Promise.race(executing);
            }
        }

        await Promise.all(executing);
        return results;
    },

    createEntityItem(entity) {
        const item = document.createElement('div');
        item.className = `entity-item ${entity.type}`;
        item.dataset.entityId = entity.id;

        // Busca a localização CORRETA - usando o locationManager
        const location = locationManager.getLocation(entity.location) || {};
        const icon = entity.type === 'user' ? '👤' : '🏢';

        item.innerHTML = `
            <img class="entity-image" src="${entity.photo}" alt="${entity.name}">
            <div class="entity-info">
                <div class="entity-name">${entity.name}</div>
                <div class="entity-location">${location.city || 'N/A'}, ${location.state || 'N/A'}</div>
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
    },

    async loadBusinesses() {
        UI.showLoading();
        
        try {
            for (const business of businesses) {
                if (business.postalCode) {
                    const location = await GeocodeService.geocodePostalCode(business.postalCode);
                    
                    if (location) {
                        business.location = { 
                            lat: location.lat, 
                            lng: location.lng 
                        };
                        
                        // Adiciona ao LocationManager
                        locationManager.addBusinessLocation(business);
                    }
                }
            }
            
            // Cria marcadores após processar todos
            businessMarkers = businesses
                .filter(b => b.location)
                .map(business => MapManager.createBusinessMarker(business));
            
            businessMarkers.forEach(marker => marker.addTo(map));
            
        } catch (error) {
            console.error("Erro ao carregar negócios:", error);
        } finally {
            UI.hideLoading();
        }
    },

    updateEntityList(entities) {
        const container = document.getElementById('items-container');
        container.innerHTML = '';

        entities.forEach(entity => {
            container.appendChild(this.createEntityItem(entity));
        });
    },

    updateMapMarkers(filteredEntities) {
        const visibleIds = new Set(filteredEntities.map(e => e.id));

        userMarkers.forEach(marker => {
            visibleIds.has(marker.entity.id)
                ? marker.addTo(map)
                : marker.remove();
        });

        businessMarkers.forEach(marker => {
            visibleIds.has(marker.entity.id)
                ? marker.addTo(map)
                : marker.remove();
        });
    },

    applyFilters() {
        const country = document.getElementById('country-select').value;
        const state = document.getElementById('state-select').value;
        const city = document.getElementById('city-select').value;
        const searchTerm = document.getElementById('user-search').value.toLowerCase();
        const typeFilter = document.getElementById('filter-type').value;

        const filtered = [...users, ...businesses].filter(entity => {
            // Filtro de tipo
            if (typeFilter !== 'all' && entity.type !== typeFilter) return false;

            // Filtro de texto
            if (searchTerm && !entity.name.toLowerCase().includes(searchTerm)) return false;

            // Filtro de localização
            const location = locationManager.getLocation(entity.location);
            if (!location) return false;

            return (!country || location.country === country) &&
                (!state || location.state === state) &&
                (!city || location.city === city);
        });

        this.updateEntityList(filtered);
        this.updateMapMarkers(filtered);
    }
};


function updateMapMarkers(filteredEntities) {
    const visibleIds = new Set(filteredEntities.map(e => e.id));

    userMarkers.forEach(marker => {
        visibleIds.has(marker.entity.id)
            ? marker.addTo(map)
            : marker.remove();
    });

    businessMarkers.forEach(marker => {
        visibleIds.has(marker.entity.id)
            ? marker.addTo(map)
            : marker.remove();
    });
}

function clearInvalidCache() {
    localStorage.removeItem('geocode_cache_v2');
    localStorage.removeItem('geocode_cache_v1');
}

function setupEventListeners() {
    // Configura eventos
    document.getElementById('user-search').addEventListener('input', () => EntityManager.applyFilters());
    document.getElementById('filter-type').addEventListener('change', () => EntityManager.applyFilters());
    document.getElementById('country-select').addEventListener('change', (e) => {
        locationManager.populateStates(e.target.value);
        EntityManager.applyFilters();
    });
    document.getElementById('state-select').addEventListener('change', (e) => {
        const country = document.getElementById('country-select').value;
        locationManager.populateCities(country, e.target.value);
        EntityManager.applyFilters();
    });
    document.getElementById('city-select').addEventListener('change', () => EntityManager.applyFilters());


    // Botão de localização manual
    document.getElementById('locate-btn').addEventListener('click', async () => {
        const coords = await MapManager.locateUser();
        if (coords) {
            // Opcional: Atualiza filtros para mostrar itens próximos
            const location = await GeocodeService.reverseGeocode(coords);
            if (location) {
                document.getElementById('country-select').value = location.country;
                document.getElementById('state-select').value = location.state;
                document.getElementById('city-select').value = location.city;
                EntityManager.applyFilters();
            }
        }
    });
}






// INICIALIZAÇÃO
// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Inicializa componentes
        MapManager.init();
        locationManager = new LocationManager();

        // 1. Processa usuários (que já tem coordenadas)
        await locationManager.init(users); // Só usuários primeiro
        
        // 2. Processa negócios (com conversão de CEP para coordenadas)
        for (const business of businesses) {
            if (business.postalCode && !business.location) {
                try {
                    const geoData = await GeocodeService.geocodePostalCode(business.postalCode);
                    if (geoData) {
                        business.location = { 
                            lat: geoData.lat, 
                            lng: geoData.lng 
                        };
                        // Adiciona informações de localização ao manager
                        locationManager.addBusinessLocation(business);
                    }
                } catch (error) {
                    console.error(`Erro ao processar CEP ${business.postalCode}:`, error);
                }
            }
        }

        // 3. Carrega todos os dados no mapa e interface
        await EntityManager.loadAll();

        // 4. Atualiza filtros com os novos dados
        locationManager.populateCountries();
        EntityManager.applyFilters();

        // Configura eventos
        setupEventListeners();

        // Dispara geolocalização automática
        await MapManager.locateUser();

    } catch (error) {
        console.error("Erro na inicialização:", error);
        UI.updateStatus("Erro ao carregar o aplicativo");
    }
});
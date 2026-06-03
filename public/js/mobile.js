let socket;
let intentionalLogout = false;
let tables = [];
let products = [];
let selectedTableId = null;
let restaurantConfig = null;

// Cart state: Map of productId -> { product, quantity }
let cart = {};

// Filter state
let selectedZone = 'Barra'; // 'Barra', 'Bar', 'Salon', 'Terraza'
let selectedCategory = 'all';
let searchQuery = '';
let viewMode = 'dashboard'; // 'dashboard' or 'catalog'

// DOM Elements
const wsStatus = document.getElementById('wsStatus');
const mobileTablesGrid = document.getElementById('mobileTablesGrid');
const viewTables = document.getElementById('viewTables');
const viewOrder = document.getElementById('viewOrder');
const backToTables = document.getElementById('backToTables');
const homeMenuBtn = document.getElementById('homeMenuBtn');
const headerTitle = document.getElementById('headerTitle');
const categoriesTabs = document.getElementById('categoriesTabs');
const productsGrid = document.getElementById('productsGrid');
const productSearch = document.getElementById('productSearch');
const currentCartItems = document.getElementById('currentCartItems');
const cartEmptyState = document.getElementById('cartEmptyState');
const cartCountBadge = document.getElementById('cartCountBadge');
const orderNotes = document.getElementById('orderNotes');
const sendOrderBtn = document.getElementById('sendOrderBtn');
const existingOrderSummary = document.getElementById('existingOrderSummary');
const existingItemsList = document.getElementById('existingItemsList');
const screenBlocker = document.getElementById('screenBlocker');
const screenBlockerText = document.getElementById('screenBlockerText');
const dashboardView = document.getElementById('dashboardView');
const catalogView = document.getElementById('catalogView');
const mostUsedGrid = document.getElementById('mostUsedGrid');

// Auth Elements
const authOverlay = document.getElementById('authOverlay');
const authTabLogin = document.getElementById('authTabLogin');
const authTabRegister = document.getElementById('authTabRegister');
const authLoginForm = document.getElementById('authLoginForm');
const authRegisterForm = document.getElementById('authRegisterForm');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const registerName = document.getElementById('registerName');
const registerUser = document.getElementById('registerUser');
const registerPass = document.getElementById('registerPass');
const registerPassConfirm = document.getElementById('registerPassConfirm');
const authMessage = document.getElementById('authMessage');
const logoutBtn = document.getElementById('logoutBtn');

// WebSocket connection
function connectWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Comandero conectado por WS');
    intentionalLogout = false;
    wsStatus.textContent = 'En Línea';
    wsStatus.className = 'badge badge-free';
    hideBlocker();
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('Comandero recibió:', message.type);

      switch (message.type) {
        case 'INITIAL_STATE':
          tables = message.data.tables;
          products = message.data.products;
          restaurantConfig = message.data.restaurantConfig;

          if (restaurantConfig && !selectedTableId) {
            headerTitle.textContent = `${restaurantConfig.restaurant.name} POS`;
          }

          renderTables();
          renderDashboardCategories();
          renderCategoryTabs();
          renderMostUsedProducts();
          renderProducts();
          break;

        case 'STATE_UPDATE':
          tables = message.data.tables;
          renderTables();
          break;

        case 'ORDER_UPDATED':
          if (selectedTableId && Number(message.data.tableId) === Number(selectedTableId)) {
            renderExistingItems(message.data.activeOrder);
          }
          break;

        case 'PRODUCTS_UPDATED':
          products = message.data.products;
          renderMostUsedProducts();
          renderProducts();
          break;

        case 'ERROR':
          alert(`Error del Servidor: ${message.message}`);
          break;
      }
    } catch (err) {
      console.error('Error al procesar mensaje WS:', err);
    }
  };

  socket.onclose = () => {
    if (intentionalLogout) {
      console.log('Conexión cerrada intencionalmente.');
      return;
    }
    console.warn('Conexión perdida con el servidor. Reconectando...');
    wsStatus.textContent = 'Sin Conexión';
    wsStatus.className = 'badge badge-occupied';
    showBlocker('Desconectado. Reconectando...');
    setTimeout(connectWS, 2000);
  };
}

// Show/Hide tactile screen blockers
function showBlocker(text) {
  screenBlockerText.textContent = text;
  screenBlocker.classList.add('active');
}

function hideBlocker() {
  screenBlocker.classList.remove('active');
}

// Auth Session Helpers
function initAuth() {
  let users = localStorage.getItem('pos_users');
  if (!users) {
    users = [{ username: 'admin', password: 'admin', name: 'admin' }];
    localStorage.setItem('pos_users', JSON.stringify(users));
  }
}

function checkAuthSession() {
  const session = localStorage.getItem('pos_logged_in_user');
  if (session) {
    authOverlay.classList.remove('active');
    logoutBtn.style.display = 'inline-block';
    connectWS();
  } else {
    authOverlay.classList.add('active');
    logoutBtn.style.display = 'none';
  }
}

// Render Tables list for View 1, filtered by active zone
function renderTables() {
  mobileTablesGrid.innerHTML = '';
  const filtered = tables.filter(t => t.zone === selectedZone);
  
  if (filtered.length === 0) {
    mobileTablesGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85rem;">Cargando mesas...</div>`;
    return;
  }

  filtered.forEach(table => {
    const btn = document.createElement('button');
    btn.className = `mobile-table-btn ${table.status}`;
    
    btn.innerHTML = `
      <span>Mesa ${table.number}</span>
      <span class="mobile-table-btn-status">${table.status === 'free' ? 'Libre' : 'Ocupada'}</span>
    `;
    
    btn.addEventListener('click', () => {
      openTable(table);
    });
    
    mobileTablesGrid.appendChild(btn);
  });
}

// Open order view for Table. Always resets view to Página Principal (dashboard)
function openTable(table) {
  selectedTableId = table.id;
  cart = {}; // Reset local shopping cart
  orderNotes.value = ''; // Reset notes
  
  headerTitle.textContent = `${table.zone} Mesa ${table.number}`;
  backToTables.style.display = 'block';
  
  // Always boot into dashboard view mode
  setOrderingViewMode('dashboard');

  // Transition views
  viewTables.classList.remove('active');
  viewTables.classList.add('inactive');
  viewOrder.classList.add('active');

  // Load existing items if table is occupied
  if (table.status === 'occupied') {
    existingOrderSummary.style.display = 'block';
    existingItemsList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">Cargando comanda actual...</div>';
    
    socket.send(JSON.stringify({
      type: 'GET_TABLE_DETAILS',
      data: { tableId: table.id }
    }));
  } else {
    existingOrderSummary.style.display = 'none';
    existingItemsList.innerHTML = '';
  }

  updateCartUI();
}

// Toggle ordering screens between Dashboard and Catalog list
function setOrderingViewMode(mode) {
  viewMode = mode;
  if (mode === 'dashboard') {
    dashboardView.style.display = 'flex';
    catalogView.style.display = 'none';
    homeMenuBtn.style.display = 'none';
  } else {
    dashboardView.style.display = 'none';
    catalogView.style.display = 'flex';
    homeMenuBtn.style.display = 'inline-block';
    // Clear search
    productSearch.value = '';
    searchQuery = '';
    renderProducts();
  }
}

// Render mini-list of previously ordered items on this table
function renderExistingItems(activeOrder) {
  if (!activeOrder || !activeOrder.items || activeOrder.items.length === 0) {
    existingOrderSummary.style.display = 'none';
    existingItemsList.innerHTML = '';
    return;
  }

  existingOrderSummary.style.display = 'block';
  existingItemsList.innerHTML = '';
  activeOrder.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'existing-mini-item';
    row.innerHTML = `
      <span>${item.quantity}x ${item.product_name}</span>
      <span style="color: var(--text-muted); font-weight: 600;">${(item.price * item.quantity).toFixed(2)}€</span>
    `;
    existingItemsList.appendChild(row);
  });
}

// Render "Lo Más Usado" Favorites section (dynamic seeding binding)
function renderMostUsedProducts() {
  mostUsedGrid.innerHTML = '';
  const favorites = products.filter(p => p.is_most_used === 1);

  if (favorites.length === 0) {
    mostUsedGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.8rem;">Cargando favoritos...</div>`;
    return;
  }

  favorites.forEach(product => {
    const btn = document.createElement('div');
    btn.className = 'most-used-btn';
    btn.innerHTML = `
      <span class="most-used-name">${product.name}</span>
      <span class="most-used-price">${product.price.toFixed(2)}€</span>
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(product);
    });
    mostUsedGrid.appendChild(btn);
  });
}

// Render horizontal subcategory scroll inside Catalog view
function renderCategoryTabs() {
  categoriesTabs.innerHTML = '';
  
  // Tab for 'Todos'
  const tabAll = document.createElement('div');
  tabAll.className = `category-tab ${selectedCategory === 'all' ? 'active' : ''}`;
  tabAll.textContent = 'Todos';
  tabAll.addEventListener('click', () => {
    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
    tabAll.classList.add('active');
    selectedCategory = 'all';
    renderProducts();
  });
  categoriesTabs.appendChild(tabAll);

  if (restaurantConfig && restaurantConfig.categories) {
    restaurantConfig.categories.forEach(cat => {
      const tab = document.createElement('div');
      tab.className = `category-tab ${selectedCategory === cat.id ? 'active' : ''}`;
      tab.textContent = cat.label;
      
      tab.addEventListener('click', () => {
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedCategory = cat.id;
        renderProducts();
      });
      
      categoriesTabs.appendChild(tab);
    });
  }
}

// Render dynamic dashboard categories grid
function renderDashboardCategories() {
  const grid = document.querySelector('.dashboard-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  if (restaurantConfig && restaurantConfig.categories) {
    restaurantConfig.categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'dashboard-cat-card';
      card.setAttribute('data-cat', cat.id);
      card.innerHTML = `
        <span class="dashboard-cat-icon">${cat.icon || '🍽️'}</span>
        <span class="dashboard-cat-name">${cat.label}</span>
      `;
      card.addEventListener('click', () => {
        selectedCategory = cat.id;
        renderCategoryTabs();
        renderProducts();
        setOrderingViewMode('catalog');
      });
      grid.appendChild(card);
    });
  }
}

// Filter and render products inside Catalog view grid list
function renderProducts() {
  productsGrid.innerHTML = '';
  
  const filtered = products.filter(p => {
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    productsGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85rem;">No se encontraron productos.</div>`;
    return;
  }

  filtered.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    card.innerHTML = `
      <div class="product-card-name">${product.name}</div>
      <div class="product-card-price">${product.price.toFixed(2)} €</div>
    `;
    
    card.addEventListener('click', () => {
      addToCart(product);
    });
    
    productsGrid.appendChild(card);
  });
}

// Cart logic helpers
function addToCart(product) {
  if (cart[product.id]) {
    cart[product.id].quantity += 1;
  } else {
    cart[product.id] = {
      product: product,
      quantity: 1
    };
  }
  
  // Visual tactile feedback: play a tiny scale micro-animation on send btn
  sendOrderBtn.style.transform = 'scale(1.03)';
  setTimeout(() => sendOrderBtn.style.transform = '', 100);

  updateCartUI();
}

function updateCartUI() {
  currentCartItems.innerHTML = '';
  const cartEntries = Object.values(cart);
  
  if (cartEntries.length === 0) {
    cartEmptyState.style.display = 'block';
    cartCountBadge.textContent = '0 items';
    cartCountBadge.className = 'badge';
    sendOrderBtn.disabled = true;
    return;
  }

  cartEmptyState.style.display = 'none';
  let totalItemsCount = 0;

  cartEntries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'cart-item-row';
    totalItemsCount += entry.quantity;

    const subtotal = entry.product.price * entry.quantity;

    row.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name">${entry.product.name}</span>
        <span class="cart-item-subtotal">${subtotal.toFixed(2)} €</span>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="adjustQty(${entry.product.id}, -1)">-</button>
        <span class="qty-val">${entry.quantity}</span>
        <button class="qty-btn" onclick="adjustQty(${entry.product.id}, 1)">+</button>
      </div>
    `;
    currentCartItems.appendChild(row);
  });

  cartCountBadge.textContent = `${totalItemsCount} items`;
  cartCountBadge.className = 'badge badge-occupied';
  sendOrderBtn.disabled = false;
}

// Adjust quantity on cart
window.adjustQty = function(productId, delta) {
  if (!cart[productId]) return;
  
  cart[productId].quantity += delta;
  if (cart[productId].quantity <= 0) {
    delete cart[productId];
  }
  
  updateCartUI();
};

// Transition back to physical tables selection screen
function closeOrderView() {
  selectedTableId = null;
  backToTables.style.display = 'none';
  homeMenuBtn.style.display = 'none';
  if (restaurantConfig) {
    headerTitle.textContent = `${restaurantConfig.restaurant.name} POS`;
  } else {
    headerTitle.textContent = 'Comandero Móvil';
  }
  
  viewOrder.classList.remove('active');
  viewTables.classList.remove('inactive');
  viewTables.classList.add('active');
}

// Send Order to Server with screen lock
function submitOrder() {
  if (!selectedTableId) return;
  const cartEntries = Object.values(cart);
  if (cartEntries.length === 0) return;

  // Block the screen (Critical Requirement)
  showBlocker('Enviando a Cocina/Barra...');
  
  const notesText = orderNotes.value.trim();
  const items = cartEntries.map(entry => {
    return {
      productId: entry.product.id,
      quantity: entry.quantity,
      notes: notesText
    };
  });

  // Send WS message
  socket.send(JSON.stringify({
    type: 'NEW_ORDER',
    data: {
      tableId: selectedTableId,
      items: items
    }
  }));

  // Block UI for exactly 1 second (1000ms)
  setTimeout(() => {
    // Reset state
    cart = {};
    orderNotes.value = '';
    
    // Close order view and go back to Tables Selector
    closeOrderView();
    hideBlocker();
  }, 1000);
}

// Event Listeners setup
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  checkAuthSession();

  // Zone Tabs selection click events (tables selector)
  const zoneTabs = document.querySelectorAll('#mobileZoneTabs .mobile-zone-tab');
  zoneTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      zoneTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedZone = tab.getAttribute('data-zone');
      renderTables();
    });
  });

  // Dashboard category boxes click events
  const catCards = document.querySelectorAll('.dashboard-cat-card');
  catCards.forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.getAttribute('data-cat');
      
      // Filter catalog tabs
      selectedCategory = cat;
      const matchingTab = document.querySelector(`.category-tab[onclick]`); // helper or iterate
      document.querySelectorAll('.category-tab').forEach(t => {
        t.classList.remove('active');
        if (t.textContent.toLowerCase() === card.querySelector('.dashboard-cat-name').textContent.toLowerCase() || 
           (cat === 'all' && t.textContent === 'Todos')) {
          t.classList.add('active');
        }
      });
      
      // Sync subcategory navigation tabs highlights
      renderCategoryTabs();

      // Open catalog view
      setOrderingViewMode('catalog');
    });
  });

  // Home return menu button
  homeMenuBtn.addEventListener('click', () => {
    setOrderingViewMode('dashboard');
  });

  // Search input events
  productSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderProducts();
  });

  // Back Button events
  backToTables.addEventListener('click', closeOrderView);

  // Send Order click
  sendOrderBtn.addEventListener('click', submitOrder);

  // Auth Tab Toggles
  authTabLogin.addEventListener('click', () => {
    authTabLogin.classList.add('active');
    authTabRegister.classList.remove('active');
    authLoginForm.style.display = 'flex';
    authRegisterForm.style.display = 'none';
    authMessage.textContent = '';
    authMessage.className = 'auth-message';
  });

  authTabRegister.addEventListener('click', () => {
    authTabRegister.classList.add('active');
    authTabLogin.classList.remove('active');
    authRegisterForm.style.display = 'flex';
    authLoginForm.style.display = 'none';
    authMessage.textContent = '';
    authMessage.className = 'auth-message';
  });

  // Login submit handler
  authLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const userVal = loginUser.value.trim().toLowerCase();
    const passVal = loginPass.value;

    const users = JSON.parse(localStorage.getItem('pos_users') || '[]');
    const matched = users.find(u => u.username === userVal && u.password === passVal);

    if (matched) {
      localStorage.setItem('pos_logged_in_user', JSON.stringify(matched));
      authMessage.textContent = '¡Ingreso correcto!';
      authMessage.className = 'auth-message success';
      setTimeout(() => {
        authOverlay.classList.remove('active');
        logoutBtn.style.display = 'inline-block';
        connectWS();
        loginUser.value = '';
        loginPass.value = '';
        authMessage.textContent = '';
      }, 500);
    } else {
      authMessage.textContent = 'Usuario o contraseña incorrectos.';
      authMessage.className = 'auth-message error';
    }
  });

  // Register submit handler
  authRegisterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameVal = registerName.value.trim();
    const userVal = registerUser.value.trim().toLowerCase();
    const passVal = registerPass.value;
    const confirmVal = registerPassConfirm.value;

    if (passVal !== confirmVal) {
      authMessage.textContent = 'Las contraseñas no coinciden.';
      authMessage.className = 'auth-message error';
      return;
    }

    const users = JSON.parse(localStorage.getItem('pos_users') || '[]');
    if (users.some(u => u.username === userVal)) {
      authMessage.textContent = 'El usuario ya existe.';
      authMessage.className = 'auth-message error';
      return;
    }

    const newUser = { username: userVal, password: passVal, name: nameVal };
    users.push(newUser);
    localStorage.setItem('pos_users', JSON.stringify(users));

    authMessage.textContent = '¡Registro exitoso! Iniciando sesión...';
    authMessage.className = 'auth-message success';

    setTimeout(() => {
      localStorage.setItem('pos_logged_in_user', JSON.stringify(newUser));
      authOverlay.classList.remove('active');
      logoutBtn.style.display = 'inline-block';
      connectWS();
      registerName.value = '';
      registerUser.value = '';
      registerPass.value = '';
      registerPassConfirm.value = '';
      authMessage.textContent = '';
    }, 1000);
  });

  // Logout click handler
  logoutBtn.addEventListener('click', () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      localStorage.removeItem('pos_logged_in_user');
      intentionalLogout = true;
      if (socket) {
        socket.close();
      }
      authOverlay.classList.add('active');
      logoutBtn.style.display = 'none';
      
      // Go back to table select view and reset title
      closeOrderView();
      
      // Update WS state representation
      wsStatus.textContent = 'Desconectado';
      wsStatus.className = 'badge badge-occupied';
    }
  });
});

let socket;
let intentionalLogout = false;
let selectedTableId = null;
let desktopCart = [];
let tables = [];
let products = [];
let printerSettings = {};
let selectedZone = 'Barra';

// Phase 3 States
let activeCashShift = null;
let restaurantConfig = null;
let adminUnlocked = false;
let selectedCatalogCategory = 'all';

// DOM Elements
const wsStatus = document.getElementById('wsStatus');
const dbMode = document.getElementById('dbMode');
const tablesGrid = document.getElementById('tablesGrid');
const selectedTableTitle = document.getElementById('selectedTableTitle');
const selectedTableStatus = document.getElementById('selectedTableStatus');
const orderItemsList = document.getElementById('orderItemsList');
const totalAmount = document.getElementById('totalAmount');
const closeTableBtn = document.getElementById('closeTableBtn');
const manualItemForm = document.getElementById('manualItemForm');
const ticketScroller = document.getElementById('ticketScroller');
const screenBlocker = document.getElementById('screenBlocker');
const screenBlockerText = document.getElementById('screenBlockerText');
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const soundToggle = document.getElementById('soundToggle');

// Restaurant Brand Headers
const restaurantName = document.getElementById('restaurantName');
const restaurantDetails = document.getElementById('restaurantDetails');

// Cash Shift Controls elements
const cashShiftTitle = document.getElementById('cashShiftTitle');
const cashShiftBalance = document.getElementById('cashShiftBalance');
const openDrawerBtn = document.getElementById('openDrawerBtn');
const arqueoXBtn = document.getElementById('arqueoXBtn');
const cierreZBtn = document.getElementById('cierreZBtn');

// Modals Overlays
const paymentModal = document.getElementById('paymentModal');
const payCashBtn = document.getElementById('payCashBtn');
const payCardBtn = document.getElementById('payCardBtn');
const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');

const adminPinModal = document.getElementById('adminPinModal');
const adminPinInput = document.getElementById('adminPinInput');
const cancelPinBtn = document.getElementById('cancelPinBtn');
const confirmPinBtn = document.getElementById('confirmPinBtn');
const adminUnlockBtn = document.getElementById('adminUnlockBtn');

const openShiftModal = document.getElementById('openShiftModal');
const initialCashInput = document.getElementById('initialCashInput');
const confirmOpenShiftBtn = document.getElementById('confirmOpenShiftBtn');

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

// Sound synthesis helper: Chime "Ding-Ding"
function playNotificationSound() {
  if (!soundToggle.checked) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(659.25, now + 0.08);
    gain2.gain.setValueAtTime(0.06, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.65);
  } catch (err) {
    console.warn('Audio WebAudio error:', err);
  }
}

// Sound synthesis helper: Cajón Portamonedas "Cha-Ching"
function playCashChime() {
  if (!soundToggle.checked) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Part 1: Register bell (High pitch ding)
    const bellOsc = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bellOsc.type = 'sine';
    bellOsc.frequency.setValueAtTime(2200, now);
    bellGain.gain.setValueAtTime(0.12, now);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    bellOsc.connect(bellGain);
    bellGain.connect(ctx.destination);

    // Part 2: Metallic drawer sliding (white noise snap)
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    
    noiseNode.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // Part 3: Coin jingle (sequential high dings)
    [0.08, 0.14, 0.20].forEach((delay, idx) => {
      const coinOsc = ctx.createOscillator();
      const coinGain = ctx.createGain();
      coinOsc.type = 'sine';
      coinOsc.frequency.setValueAtTime(1800 + (idx * 300), now + delay);
      coinGain.gain.setValueAtTime(0.05, now + delay);
      coinGain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.08);
      coinOsc.connect(coinGain);
      coinGain.connect(ctx.destination);
      coinOsc.start(now + delay);
      coinOsc.stop(now + delay + 0.1);
    });

    bellOsc.start(now);
    noiseNode.start(now);
    bellOsc.stop(now + 0.45);
    noiseNode.stop(now + 0.15);
  } catch (err) {
    console.warn('Audio WebAudio cash error:', err);
  }
}

// WebSocket Connection Setup
function connectWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Conectado al servidor WebSocket');
    intentionalLogout = false;
    wsStatus.textContent = 'En Línea';
    wsStatus.className = 'badge badge-free';
    hideBlocker();
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('Evento recibido:', message.type);

      switch (message.type) {
        case 'INITIAL_STATE':
          tables = message.data.tables;
          products = message.data.products;
          printerSettings = message.data.printerSettings;
          activeCashShift = message.data.activeCashShift;
          restaurantConfig = message.data.restaurantConfig;
          
          dbMode.textContent = 'SQLite3 Activo';
          dbMode.className = 'badge badge-free';
          
          // Bind configuration metadata
          if (restaurantConfig) {
            restaurantName.textContent = restaurantConfig.restaurant.name;
            restaurantDetails.textContent = `${restaurantConfig.restaurant.address} | Tel: ${restaurantConfig.restaurant.phone}`;
          }

          syncCashShiftUI();
          populateTablesGrid();
          populatePrinterSettings();
          renderDesktopCatalog();
          if (selectedTableId) {
            updateActiveTableDetail();
          }
          break;

        case 'STATE_UPDATE':
          tables = message.data.tables;
          populateTablesGrid();
          if (selectedTableId) {
            updateActiveTableDetail();
          }
          break;

        case 'ORDER_UPDATED':
          if (Number(message.data.tableId) === Number(selectedTableId)) {
            renderOrderItems(message.data.activeOrder);
          }
          break;

        case 'NEW_ORDER_ALERT': {
          const { tableId } = message.data;
          playNotificationSound();
          
          const card = document.querySelector(`.table-card[data-id="${tableId}"]`);
          if (card) {
            card.classList.add('selected');
            card.style.animation = 'pulse 0.4s ease infinite alternate';
            setTimeout(() => {
              card.style.animation = '';
              if (selectedTableId !== Number(tableId)) {
                card.classList.remove('selected');
              }
            }, 2000);
          }
          break;
        }

        case 'PRINT_LOG':
          renderSimulatedTicket(message.data);
          break;

        case 'PRINTER_SETTINGS_UPDATED':
          printerSettings = message.data.printerSettings;
          populatePrinterSettings();
          break;

        case 'CASH_SHIFT_UPDATED':
          activeCashShift = message.data.activeCashShift;
          syncCashShiftUI();
          break;

        case 'CASH_DRAWER_OPENED':
          playCashChime();
          break;

        case 'PRODUCTS_UPDATED':
          products = message.data.products;
          renderDesktopCatalog();
          break;

        case 'ERROR':
          alert(`Error del Servidor: ${message.message}`);
          break;
      }
    } catch (err) {
      console.error('Error procesando mensaje WebSocket:', err);
    }
  };

  socket.onclose = () => {
    if (intentionalLogout) {
      console.log('Conexión cerrada intencionalmente.');
      return;
    }
    console.warn('Conexión WebSocket cerrada. Intentando reconectar...');
    wsStatus.textContent = 'Reconectando...';
    wsStatus.className = 'badge badge-occupied';
    showBlocker('Conexión perdida. Intentando reconectar...');
    setTimeout(connectWS, 2000);
  };
}

function showBlocker(text) {
  screenBlockerText.textContent = text;
  screenBlocker.classList.add('active');
}

function hideBlocker() {
  screenBlocker.classList.remove('active');
}

// Display Cash Shift Data
function syncCashShiftUI() {
  if (!activeCashShift) {
    cashShiftTitle.textContent = 'Turno de Caja Cerrado';
    cashShiftBalance.textContent = 'Caja: 0.00 €';
    cashShiftBalance.style.color = 'var(--color-occupied)';
    
    // Open opening shift modal
    openShiftModal.classList.add('active');
  } else {
    openShiftModal.classList.remove('active');
    
    const openTime = new Date(activeCashShift.opened_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    cashShiftTitle.textContent = `Turno #${activeCashShift.id} abierto (${openTime})`;
    
    const balance = activeCashShift.initial_cash + activeCashShift.sales_cash;
    cashShiftBalance.textContent = `Efectivo: ${balance.toFixed(2)} € | Tarjeta: ${activeCashShift.sales_card.toFixed(2)} €`;
    cashShiftBalance.style.color = 'var(--color-free)';
  }
}

// Render Tables list for active physical zone
function populateTablesGrid() {
  tablesGrid.innerHTML = '';
  const filtered = tables.filter(t => t.zone === selectedZone);

  filtered.forEach(table => {
    const card = document.createElement('div');
    card.className = `table-card ${table.status}`;
    card.setAttribute('data-id', table.id);
    if (selectedTableId === table.id) {
      card.classList.add('selected');
    }

    const totalVal = table.status === 'occupied' ? 'Cargando...' : 'Libre';
    const numberText = table.number === 0 ? "⚡ Venta Rápida" : table.number;
    const numberStyle = table.number === 0 ? 'font-size: 1.25rem; font-weight: 700; white-space: nowrap;' : '';
    
    card.innerHTML = `
      <div class="table-status-label">${table.status === 'free' ? 'Libre' : 'Ocupada'}</div>
      <div class="table-number" style="${numberStyle}">${numberText}</div>
      <div class="table-total" id="table-total-${table.id}">${totalVal}</div>
    `;

    if (table.status === 'occupied') {
      socket.send(JSON.stringify({
        type: 'GET_TABLE_DETAILS',
        data: { tableId: table.id }
      }));
    }

    card.addEventListener('click', () => {
      document.querySelectorAll('.table-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      selectedTableId = table.id;
      desktopCart = []; // Clear draft only on explicit table switch
      renderDesktopDraft();
      
      updateActiveTableDetail();
    });

    tablesGrid.appendChild(card);
  });
}

// Render Order details sidebar
async function updateActiveTableDetail() {
  const table = tables.find(t => t.id === selectedTableId);
  const desktopCatalogMenu = document.getElementById('desktopCatalogMenu');
  const mainContent = document.querySelector('.main-content');
  
  if (!table) {
    selectedTableTitle.textContent = 'Mesa No Seleccionada';
    selectedTableStatus.textContent = 'Selecciona una mesa para ver su cuenta';
    selectedTableStatus.className = 'badge';
    orderItemsList.innerHTML = `
      <div class="order-empty-state">
        <div class="order-empty-icon">🛒</div>
        <p>Selecciona una mesa del plano de sala para gestionar su comanda.</p>
      </div>
    `;
    closeTableBtn.style.display = 'none';
    manualItemForm.style.display = 'none';
    if (mainContent) mainContent.classList.remove('table-active');
    if (desktopCatalogMenu) desktopCatalogMenu.style.display = 'none';
    totalAmount.textContent = '0.00 €';
    return;
  }

  if (table.number === 0) {
    selectedTableTitle.textContent = `⚡ Venta Rápida (Barra)`;
  } else {
    selectedTableTitle.textContent = `${table.zone} Mesa ${table.number}`;
  }
  selectedTableStatus.textContent = table.status === 'free' ? 'Estado: LIBRE' : 'Estado: EN CONSUMO';
  selectedTableStatus.className = table.status === 'free' ? 'badge badge-free' : 'badge badge-occupied';

  if (desktopCatalogMenu) {
    desktopCatalogMenu.style.display = 'flex';
    if (mainContent) mainContent.classList.add('table-active');
    renderDesktopCatalog();
  }

  if (table.status === 'free') {
    orderItemsList.innerHTML = `
      <div class="order-empty-state">
        <div class="order-empty-icon">🟢</div>
        <p>Esta mesa está libre.</p>
        <p style="font-size: 0.8rem; color: var(--text-muted);">Añade un artículo de la carta o manual para abrir una cuenta.</p>
      </div>
    `;
    closeTableBtn.style.display = 'none';
    totalAmount.textContent = '0.00 €';
    manualItemForm.style.display = 'block';
  } else {
    orderItemsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Cargando comanda activa...</div>`;
    socket.send(JSON.stringify({
      type: 'GET_TABLE_DETAILS',
      data: { tableId: selectedTableId }
    }));
    manualItemForm.style.display = 'block';
  }
}

// Render active comanda items with admin deletion controls if unlocked
function renderOrderItems(activeOrder) {
  if (!activeOrder || !activeOrder.items || activeOrder.items.length === 0) {
    const table = tables.find(t => t.id === selectedTableId);
    if (table && table.status === 'occupied') {
      orderItemsList.innerHTML = `<div class="order-empty-state"><p>Sin productos todavía en la comanda.</p></div>`;
    }
    totalAmount.textContent = '0.00 €';
    closeTableBtn.style.display = 'none';
    adminUnlockBtn.style.display = 'none';
    return;
  }

  orderItemsList.innerHTML = '';
  activeOrder.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'order-item-row';
    
    const notesStr = item.notes ? `<span class="order-item-notes">${item.notes}</span>` : '';
    
    let priceDisplay = `<div class="order-item-price">${(item.price * item.quantity).toFixed(2)} €</div>`;
    let adminControls = '';
    if (adminUnlocked) {
      priceDisplay = `
        <div class="order-item-price" style="display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2;">
          <span style="font-size: 0.68rem; color: var(--color-primary); cursor: pointer; border-bottom: 1px dashed var(--color-primary); padding-bottom: 1px; user-select: none;" onclick="editItemPrice(${item.id}, ${item.price})" title="Haga clic para cambiar el precio de este artículo en esta mesa">
            U: ${item.price.toFixed(2)} € ✏️
          </span>
          <span style="font-weight: 700;">${(item.price * item.quantity).toFixed(2)} €</span>
        </div>
      `;
      adminControls = `
        <div class="admin-qty-controls" style="margin-left: 8px;">
          <button class="admin-btn" onclick="adjustItemQty(${item.id}, -1)">-</button>
          <span style="font-size:0.75rem; font-weight:700; width:12px; text-align:center;"></span>
          <button class="admin-btn" onclick="adjustItemQty(${item.id}, 1)">+</button>
          <button class="admin-delete-btn" onclick="deleteItem(${item.id})" title="Eliminar artículo">🗑️</button>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="order-item-qty">${item.quantity}</div>
      <div class="order-item-info">
        <span class="order-item-name">${item.product_name}</span>
        ${notesStr}
      </div>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
        ${priceDisplay}
        ${adminControls}
      </div>
    `;
    orderItemsList.appendChild(row);
  });

  const total = activeOrder.order.total;
  totalAmount.textContent = `${total.toFixed(2)} €`;

  const cardTotal = document.getElementById(`table-total-${selectedTableId}`);
  if (cardTotal) {
    cardTotal.textContent = `${total.toFixed(2)} €`;
  }

  closeTableBtn.style.display = 'block';
  closeTableBtn.setAttribute('data-order-id', activeOrder.order.id);
}

// Admin modifications handlers
window.adjustItemQty = function(itemId, delta) {
  if (!selectedTableId || !adminUnlocked) return;
  const row = document.querySelector(`.order-item-row`); // or direct fetch
  
  // Find item quantity locally to pre-calculate
  const table = tables.find(t => t.id === selectedTableId);
  if (!table) return;

  // Ask server to adjust quantity
  // Find current item quantity in local cart view to determine new quantity
  socket.send(JSON.stringify({
    type: 'GET_TABLE_DETAILS',
    data: { tableId: selectedTableId }
  }));

  // We fetch active items array by binding quantities directly.
  // To avoid asynchronous race, we let the server do the math:
  // Instead of passing absolute new quantity, the server receives the delta,
  // or we compute it if we keep track. Let's make the server get delta or quantity.
  // In server.js we added UPDATE_ORDER_ITEM_QTY. We will pass absolute new quantity.
  // Let's retrieve current quantity from DOM row.
  // The first sibling of row is order-item-qty
  const rows = Array.from(orderItemsList.children);
  const matchedRow = rows.find(r => r.querySelector(`button[onclick*="adjustItemQty(${itemId}"]`));
  if (!matchedRow) return;
  const currentQty = parseInt(matchedRow.querySelector('.order-item-qty').textContent, 10);
  const newQty = currentQty + delta;

  socket.send(JSON.stringify({
    type: 'UPDATE_ORDER_ITEM_QTY',
    data: {
      itemId,
      tableId: selectedTableId,
      quantity: newQty
    }
  }));
};

window.deleteItem = function(itemId) {
  if (!selectedTableId || !adminUnlocked) return;
  if (confirm('¿Seguro que deseas eliminar este artículo de la comanda?')) {
    socket.send(JSON.stringify({
      type: 'DELETE_ORDER_ITEM',
      data: {
        itemId,
        tableId: selectedTableId
      }
    }));
  }
};

window.editItemPrice = function(itemId, currentPrice) {
  if (!selectedTableId || !adminUnlocked) return;
  const newPriceVal = prompt(`Introduce el nuevo precio para este artículo en la comanda (€):`, currentPrice.toFixed(2));
  if (newPriceVal === null) return; // User cancelled
  const price = parseFloat(newPriceVal);
  if (isNaN(price) || price < 0) {
    alert('Por favor, introduce un precio válido (número positivo).');
    return;
  }
  socket.send(JSON.stringify({
    type: 'UPDATE_ORDER_ITEM_PRICE',
    data: {
      itemId,
      tableId: selectedTableId,
      price: price
    }
  }));
};

window.editPermanentPrice = function(productId, productName, currentPrice) {
  if (!adminUnlocked) return;
  const newPriceVal = prompt(`Cambiar precio definitivo en la CARTA para:\n"${productName}"\n\nNuevo precio (€):`, currentPrice.toFixed(2));
  if (newPriceVal === null) return; // User cancelled
  const price = parseFloat(newPriceVal);
  if (isNaN(price) || price < 0) {
    alert('Por favor, introduce un precio válido (número positivo).');
    return;
  }
  socket.send(JSON.stringify({
    type: 'UPDATE_PRODUCT_PRICE_PERMANENT',
    data: {
      productId,
      price: price
    }
  }));
};

// Sync unlock button label
function syncAdminUnlockButtonState() {
  const addNewProductBtn = document.getElementById('addNewProductBtn');
  if (adminUnlocked) {
    adminUnlockBtn.textContent = '🔒 Bloquear Cambios';
    adminUnlockBtn.className = 'admin-unlock-btn unlocked';
    if (addNewProductBtn) addNewProductBtn.style.display = 'inline-block';
  } else {
    adminUnlockBtn.textContent = '🔓 Desbloquear Cambios';
    adminUnlockBtn.className = 'admin-unlock-btn';
    if (addNewProductBtn) addNewProductBtn.style.display = 'none';
  }
}

// Display Simulated receipt paper in Right Panel
function renderSimulatedTicket(logData) {
  const { destination, success, mode, ticket } = logData;
  const ticketCard = document.createElement('div');
  ticketCard.className = 'simulated-ticket';
  const tagClass = destination.toLowerCase().replace(/\s+/g, '_');
  
  ticketCard.innerHTML = `
    <span class="ticket-tag ${tagClass}">${destination}</span>
    ${ticket}
  `;
  
  if (ticketScroller.firstElementChild && ticketScroller.firstElementChild.tagName === 'DIV' && ticketScroller.firstElementChild.textContent.includes('Aquí se visualizarán')) {
    ticketScroller.innerHTML = '';
  }
  
  ticketScroller.insertBefore(ticketCard, ticketScroller.firstChild);
}

// Populate printers inputs
function populatePrinterSettings() {
  if (printerSettings.BARRA) {
    document.getElementById('barraPrinterType').value = printerSettings.BARRA.type;
    document.getElementById('barraPrinterPath').value = printerSettings.BARRA.path || '';
  }
  if (printerSettings.COCINA) {
    document.getElementById('cocinaPrinterType').value = printerSettings.COCINA.type;
    document.getElementById('cocinaPrinterPath').value = printerSettings.COCINA.path || '';
  }
}

// Render dynamic visual product catalog for desktop sidebar
function renderDesktopCatalog() {
  const tabsContainer = document.getElementById('desktopCategoryTabs');
  const gridContainer = document.getElementById('desktopProductsGrid');
  if (!tabsContainer || !gridContainer) return;

  // 1. Render Category Tabs
  tabsContainer.innerHTML = '';
  
  // 'Todos' tab
  const tabAll = document.createElement('div');
  tabAll.className = `desktop-cat-tab ${selectedCatalogCategory === 'all' ? 'active' : ''}`;
  tabAll.textContent = '🏠 Todos';
  tabAll.addEventListener('click', () => {
    selectedCatalogCategory = 'all';
    renderDesktopCatalog();
  });
  tabsContainer.appendChild(tabAll);

  if (restaurantConfig && restaurantConfig.categories) {
    restaurantConfig.categories.forEach(cat => {
      const tab = document.createElement('div');
      tab.className = `desktop-cat-tab ${selectedCatalogCategory === cat.id ? 'active' : ''}`;
      tab.textContent = `${cat.icon || ''} ${cat.label}`;
      tab.addEventListener('click', () => {
        selectedCatalogCategory = cat.id;
        renderDesktopCatalog();
      });
      tabsContainer.appendChild(tab);
    });
  }

  // 2. Render Products Grid
  gridContainer.innerHTML = '';
  
  // Filter products by selectedCatalogCategory
  const filtered = products.filter(p => {
    return selectedCatalogCategory === 'all' || p.category === selectedCatalogCategory;
  });

  if (filtered.length === 0) {
    gridContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 20px;">No hay productos</div>';
    return;
  }

  // Sort alphabetically
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach(prod => {
    const btn = document.createElement('button');
    btn.className = 'desktop-product-btn';
    
    let editBtnHtml = '';
    if (adminUnlocked) {
      editBtnHtml = `
        <span class="catalog-edit-price-btn" onclick="event.stopPropagation(); editPermanentPrice(${prod.id}, '${prod.name.replace(/'/g, "\\'")}', ${prod.price})" style="cursor: pointer; padding: 2px 5px; background: var(--color-primary-light); border: 1px dashed var(--color-primary); border-radius: 4px; font-size: 0.65rem; color: var(--color-primary); font-weight: 700; display: inline-flex; align-items: center; gap: 2px; user-select: none;" title="Cambiar precio de este producto de forma definitiva en la carta">
          ✏️ Carta
        </span>
      `;
    }

    btn.innerHTML = `
      <span class="desktop-product-btn-name">${prod.name}</span>
      <div style="display: flex; align-items: center; width: 100%; justify-content: space-between; margin-top: auto;">
        <span class="desktop-product-btn-price">${prod.price.toFixed(2)} €</span>
        ${editBtnHtml}
      </div>
    `;

    btn.addEventListener('click', () => {
      if (!selectedTableId) {
        alert('Por favor selecciona una mesa primero.');
        return;
      }
      // Add to desktop draft cart instead of sending directly
      const existing = desktopCart.find(item => item.type === 'catalog' && item.product.id === prod.id);
      if (existing) {
        existing.quantity += 1;
      } else {
        desktopCart.push({
          type: 'catalog',
          product: prod,
          quantity: 1
        });
      }
      renderDesktopDraft();
    });
    gridContainer.appendChild(btn);
  });
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
    adminUnlockBtn.style.display = 'inline-flex';
    connectWS();
  } else {
    authOverlay.classList.add('active');
    logoutBtn.style.display = 'none';
    adminUnlockBtn.style.display = 'none';
  }
}

// Desktop Draft Cart Functions
function renderDesktopDraft() {
  const draftSection = document.getElementById('desktopDraftSection');
  const draftList = document.getElementById('desktopDraftList');
  if (!draftSection || !draftList) return;

  if (desktopCart.length === 0) {
    draftSection.style.display = 'none';
    return;
  }

  draftSection.style.display = 'block';
  draftList.innerHTML = '';

  desktopCart.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'order-item-row';
    row.style.backgroundColor = 'var(--bg-app)';
    row.style.borderStyle = 'dashed';

    const name = item.type === 'catalog' ? item.product.name : item.name;
    const dest = item.type === 'catalog' ? item.product.destination : item.destination;
    const destBadge = dest === 'BARRA' ? '<span class="badge badge-free" style="font-size: 0.65rem;">Barra</span>' : '<span class="badge badge-occupied" style="font-size: 0.65rem;">Cocina</span>';

    row.innerHTML = `
      <div class="order-item-qty">${item.quantity}</div>
      <div class="order-item-info">
        <span class="order-item-name">${name}</span>
        <div style="margin-top: 2px;">${destBadge}</div>
      </div>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
        <div class="admin-qty-controls">
          <button class="admin-btn" onclick="adjustDesktopDraftQty(${index}, -1)">-</button>
          <span style="font-size:0.75rem; font-weight:700; width:12px; text-align:center;">${item.quantity}</span>
          <button class="admin-btn" onclick="adjustDesktopDraftQty(${index}, 1)">+</button>
          <button class="admin-delete-btn" onclick="deleteDesktopDraftItem(${index})" title="Eliminar">🗑️</button>
        </div>
      </div>
    `;
    draftList.appendChild(row);
  });
}

window.adjustDesktopDraftQty = function(index, delta) {
  if (!desktopCart[index]) return;
  desktopCart[index].quantity += delta;
  if (desktopCart[index].quantity <= 0) {
    desktopCart.splice(index, 1);
  }
  renderDesktopDraft();
};

window.deleteDesktopDraftItem = function(index) {
  if (confirm('¿Deseas eliminar este artículo del pedido en preparación?')) {
    desktopCart.splice(index, 1);
    renderDesktopDraft();
  }
};

// DOM Setup
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  checkAuthSession();

  // Zone Tabs Click Event Handlers
  const zoneTabs = document.querySelectorAll('#zoneSelectorBar .zone-tab');
  zoneTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      zoneTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedZone = tab.getAttribute('data-zone');
      populateTablesGrid();
    });
  });

  // Settings Panel Toggle
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('active');
  });

  // Save Settings
  saveSettingsBtn.addEventListener('click', () => {
    const settings = {
      BARRA: {
        type: document.getElementById('barraPrinterType').value,
        path: document.getElementById('barraPrinterPath').value
      },
      COCINA: {
        type: document.getElementById('cocinaPrinterType').value,
        path: document.getElementById('cocinaPrinterPath').value
      }
    };
    
    socket.send(JSON.stringify({
      type: 'UPDATE_PRINTERS',
      data: { settings }
    }));
    
    alert('Configuración de impresoras guardada.');
    settingsPanel.classList.remove('active');
  });

  // Add Manual Item Handler
  document.getElementById('addManualBtn').addEventListener('click', () => {
    if (!selectedTableId) return;

    const nameInput = document.getElementById('manualName');
    const priceInput = document.getElementById('manualPrice');
    const qtyInput = document.getElementById('manualQty');
    const destSelect = document.getElementById('manualDest');

    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);
    const quantity = parseInt(qtyInput.value, 10);
    const destination = destSelect.value;

    if (!name || isNaN(price) || isNaN(quantity) || quantity < 1) {
      alert('Por favor rellena todos los campos válidos del artículo.');
      return;
    }

    // Add to desktop draft cart instead of sending directly
    desktopCart.push({
      type: 'manual',
      name,
      price,
      quantity,
      destination
    });
    renderDesktopDraft();

    nameInput.value = '';
    priceInput.value = '';
    qtyInput.value = '1';
  });



  // Cash Drawer manual kick
  openDrawerBtn.addEventListener('click', () => {
    socket.send(JSON.stringify({ type: 'OPEN_CASH_DRAWER' }));
  });

  // Shift: Arqueo X
  arqueoXBtn.addEventListener('click', () => {
    if (!activeCashShift) return;
    socket.send(JSON.stringify({ type: 'DO_ARQUEO' }));
    alert('Ticket de arqueo provisonal (X) enviado a imprimir.');
  });

  // Shift: Cierre Z
  cierreZBtn.addEventListener('click', () => {
    if (!activeCashShift) return;
    if (confirm('¿Estás seguro de cerrar la caja definitivamente? Esto imprimirá el cierre Zeta (Z) y cerrará el turno actual.')) {
      socket.send(JSON.stringify({ type: 'CLOSE_CASH_SHIFT' }));
    }
  });

  // Shift: Open Turno Modal
  confirmOpenShiftBtn.addEventListener('click', () => {
    const cash = parseFloat(initialCashInput.value);
    if (isNaN(cash) || cash < 0) {
      alert('Introduce un fondo inicial válido.');
      return;
    }
    socket.send(JSON.stringify({
      type: 'OPEN_CASH_SHIFT',
      data: { initialCash: cash }
    }));
    openShiftModal.classList.remove('active');
  });

  // Close Table: Payment Selection Modal trigger
  closeTableBtn.addEventListener('click', () => {
    const orderId = closeTableBtn.getAttribute('data-order-id');
    if (!orderId) return;

    // Show payment modal
    paymentModal.classList.add('active');
  });

  // Payment triggers
  payCashBtn.addEventListener('click', () => {
    const orderId = closeTableBtn.getAttribute('data-order-id');
    socket.send(JSON.stringify({
      type: 'CLOSE_TABLE',
      data: { orderId, paymentMethod: 'EFECTIVO' }
    }));
    paymentModal.classList.remove('active');
  });

  payCardBtn.addEventListener('click', () => {
    const orderId = closeTableBtn.getAttribute('data-order-id');
    socket.send(JSON.stringify({
      type: 'CLOSE_TABLE',
      data: { orderId, paymentMethod: 'TARJETA' }
    }));
    paymentModal.classList.remove('active');
  });

  cancelPaymentBtn.addEventListener('click', () => {
    paymentModal.classList.remove('active');
  });

  // Admin Unlock PIN controls
  adminUnlockBtn.addEventListener('click', () => {
    if (adminUnlocked) {
      // Toggle back to locked
      adminUnlocked = false;
      syncAdminUnlockButtonState();
      renderDesktopCatalog();
      updateActiveTableDetail();
    } else {
      // Prompt PIN
      adminPinInput.value = '';
      adminPinModal.classList.add('active');
      adminPinInput.focus();
    }
  });

  cancelPinBtn.addEventListener('click', () => {
    adminPinModal.classList.remove('active');
  });

  confirmPinBtn.addEventListener('click', () => {
    const enteredPin = adminPinInput.value.trim();
    const configPin = (restaurantConfig && restaurantConfig.restaurant.adminPin) ? restaurantConfig.restaurant.adminPin : '1111';
    
    if (enteredPin === configPin) {
      adminUnlocked = true;
      syncAdminUnlockButtonState();
      adminPinModal.classList.remove('active');
      
      // Force redraw of catalog and items
      renderDesktopCatalog();
      
      const table = tables.find(t => t.id === selectedTableId);
      if (table) {
        socket.send(JSON.stringify({
          type: 'GET_TABLE_DETAILS',
          data: { tableId: selectedTableId }
        }));
      }
    } else {
      alert('PIN Incorrecto. Vuelve a intentarlo.');
      adminPinInput.value = '';
      adminPinInput.focus();
    }
  });

  // Pressing enter in PIN input
  adminPinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      confirmPinBtn.click();
    }
  });

  // Clear Logs
  document.getElementById('clearLogsBtn').addEventListener('click', () => {
    ticketScroller.innerHTML = `<div style="color: var(--text-muted); text-align: center; margin-top: 40px; font-size: 0.85rem;">Logs Limpiados. Esperando nuevas comandas...</div>`;
  });

  // Open Add Product Modal
  const addNewProductBtn = document.getElementById('addNewProductBtn');
  const addProductModal = document.getElementById('addProductModal');
  const cancelAddProductBtn = document.getElementById('cancelAddProductBtn');
  const confirmAddProductBtn = document.getElementById('confirmAddProductBtn');
  
  if (addNewProductBtn) {
    addNewProductBtn.addEventListener('click', () => {
      // Populate category dropdown
      const newProdCategory = document.getElementById('newProdCategory');
      if (newProdCategory && restaurantConfig && restaurantConfig.categories) {
        newProdCategory.innerHTML = '';
        restaurantConfig.categories.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat.id;
          opt.textContent = `${cat.icon || ''} ${cat.label}`;
          newProdCategory.appendChild(opt);
        });
      }
      
      // Reset inputs
      document.getElementById('newProdName').value = '';
      document.getElementById('newProdPrice').value = '';
      document.getElementById('newProdMostUsed').checked = false;
      document.getElementById('newProdDest').value = 'BARRA';
      
      addProductModal.classList.add('active');
      document.getElementById('newProdName').focus();
    });
  }

  if (cancelAddProductBtn) {
    cancelAddProductBtn.addEventListener('click', () => {
      addProductModal.classList.remove('active');
    });
  }

  if (confirmAddProductBtn) {
    confirmAddProductBtn.addEventListener('click', () => {
      const name = document.getElementById('newProdName').value.trim();
      const priceVal = document.getElementById('newProdPrice').value;
      const category = document.getElementById('newProdCategory').value;
      const destination = document.getElementById('newProdDest').value;
      const is_most_used = document.getElementById('newProdMostUsed').checked ? 1 : 0;
      
      if (!name) {
        alert('Por favor, introduce el nombre del producto.');
        return;
      }
      const price = parseFloat(priceVal);
      if (isNaN(price) || price < 0) {
        alert('Por favor, introduce un precio válido (número positivo).');
        return;
      }

      socket.send(JSON.stringify({
        type: 'ADD_PRODUCT_PERMANENT',
        data: {
          name,
          price,
          category,
          destination,
          is_most_used
        }
      }));
      
      addProductModal.classList.remove('active');
    });
  }

  // Theme Toggle
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
  });

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

  // Send Draft Order click handler
  document.getElementById('desktopSendDraftBtn').addEventListener('click', () => {
    if (!selectedTableId || desktopCart.length === 0) return;

    // Send catalog items
    const catalogItems = desktopCart.filter(item => item.type === 'catalog');
    if (catalogItems.length > 0) {
      socket.send(JSON.stringify({
        type: 'NEW_ORDER',
        data: {
          tableId: selectedTableId,
          items: catalogItems.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            notes: ''
          }))
        }
      }));
    }

    // Send manual items
    const manualItems = desktopCart.filter(item => item.type === 'manual');
    manualItems.forEach(item => {
      socket.send(JSON.stringify({
        type: 'ADD_MANUAL_ITEM',
        data: {
          tableId: selectedTableId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          category: 'manual',
          destination: item.destination
        }
      }));
    });

    // Clear cart and re-render
    desktopCart = [];
    renderDesktopDraft();
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
      adminUnlockBtn.style.display = 'none';
      
      // Clear any table UI selection
      selectedTableId = null;
      updateActiveTableDetail();
      
      // Update WS state representation
      wsStatus.textContent = 'Desconectado';
      wsStatus.className = 'badge badge-occupied';
    }
  });
});

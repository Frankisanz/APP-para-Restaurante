const fs = require('fs');
const path = require('path');

let sqlite3;
let db;
let useFallback = false;

// Fallback JSON-based Database implementation
let fallbackData = {
  tables: [],
  products: [],
  orders: [],
  order_items: [],
  cash_shifts: []
};
const FALLBACK_FILE = path.join(__dirname, 'database_fallback.json');
const CONFIG_FILE = path.join(__dirname, 'restaurant_config.json');

// Helper to get active configuration
function getRestaurantConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error leyendo restaurant_config.json:', err);
  }
  // Fallback defaults if config file is broken
  return {
    restaurant: {
      name: "POS Restaurante",
      adminPin: "1234"
    },
    tablesSetup: { Barra: 5, Bar: 6, Salon: 10 },
    products: []
  };
}

// Attempt to load sqlite3
try {
  sqlite3 = require('sqlite3').verbose();
  console.log('SQLite3 cargado correctamente.');
} catch (err) {
  console.warn('ADVERTENCIA: No se pudo cargar sqlite3. Usando base de datos JSON de respaldo.');
  useFallback = true;
}

// Promisified SQLite functions
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Fallback persistence helpers
function saveFallback() {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(fallbackData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando base de datos fallback:', err);
  }
}

function loadFallback() {
  let needsSeed = false;
  if (fs.existsSync(FALLBACK_FILE)) {
    try {
      fallbackData = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
      if (!fallbackData.cash_shifts) {
        fallbackData.cash_shifts = [];
      }
      // Force reseeding if tables Setup changes
      const config = getRestaurantConfig();
      const expectedTablesCount = Object.values(config.tablesSetup).reduce((a, b) => a + b, 0) + 1;
      if (fallbackData.tables.length !== expectedTablesCount || !fallbackData.products || fallbackData.products.length !== config.products.length) {
        console.log('Detectado cambio de configuración en mesas o productos. Recreando fallback...');
        needsSeed = true;
      }
    } catch (err) {
      console.error('Error leyendo base de datos fallback. Recreando...', err);
      needsSeed = true;
    }
  } else {
    needsSeed = true;
  }

  if (needsSeed) {
    seedFallbackData();
    saveFallback();
  }
}

function seedFallbackData() {
  const config = getRestaurantConfig();
  fallbackData.tables = [];
  fallbackData.orders = [];
  fallbackData.order_items = [];
  fallbackData.cash_shifts = [];
  
  let currentId = 1;
  // Special Virtual table for fast checkout bar sales
  fallbackData.tables.push({ id: currentId++, number: 0, zone: 'Barra', status: 'free', active_order_id: null });

  for (const [zone, count] of Object.entries(config.tablesSetup)) {
    for (let i = 1; i <= count; i++) {
      fallbackData.tables.push({ id: currentId++, number: i, zone: zone, status: 'free', active_order_id: null });
    }
  }

  // Seed products from config
  fallbackData.products = config.products.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    price: p.price,
    category: p.category,
    destination: p.destination,
    is_most_used: p.is_most_used || 0
  }));
}

// Database Initialization
function initDB() {
  return new Promise((resolve, reject) => {
    if (useFallback) {
      loadFallback();
      console.log('Base de datos JSON de respaldo inicializada.');
      resolve();
      return;
    }

    const dbPath = path.join(__dirname, 'database.db');
    db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('Error al abrir la base de datos SQLite, usando fallback:', err);
        useFallback = true;
        loadFallback();
        resolve();
        return;
      }

      try {
        const config = getRestaurantConfig();

        // Drop tables if tables or products count mismatch configuration to allow reseed
        let tableResetNeeded = false;
        try {
          const tableCountRow = await get(`SELECT COUNT(*) as count FROM tables`);
          const expectedCount = Object.values(config.tablesSetup).reduce((a, b) => a + b, 0) + 1;
          if (tableCountRow.count !== expectedCount) {
            tableResetNeeded = true;
          }
          
          const productCountRow = await get(`SELECT COUNT(*) as count FROM products`);
          if (productCountRow.count !== config.products.length) {
            tableResetNeeded = true;
          }
        } catch (e) {
          tableResetNeeded = true;
        }

        if (tableResetNeeded) {
          console.log('Sincronizando base de datos con restaurant_config.json...');
          await run(`DROP TABLE IF EXISTS order_items`);
          await run(`DROP TABLE IF EXISTS orders`);
          await run(`DROP TABLE IF EXISTS products`);
          await run(`DROP TABLE IF EXISTS tables`);
          await run(`DROP TABLE IF EXISTS cash_shifts`);
        }

        // Create tables
        await run(`CREATE TABLE IF NOT EXISTS tables (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          number INTEGER,
          zone TEXT,
          status TEXT DEFAULT 'free',
          active_order_id INTEGER,
          UNIQUE(number, zone)
        )`);

        await run(`CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE,
          price REAL,
          category TEXT,
          destination TEXT,
          is_most_used INTEGER DEFAULT 0
        )`);

        await run(`CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_id INTEGER,
          status TEXT DEFAULT 'active',
          created_at TEXT,
          closed_at TEXT,
          total REAL DEFAULT 0.0,
          FOREIGN KEY (table_id) REFERENCES tables(id)
        )`);

        await run(`CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER,
          product_id INTEGER,
          quantity INTEGER,
          notes TEXT,
          price_at_sale REAL,
          printed_barra INTEGER DEFAULT 0,
          printed_cocina INTEGER DEFAULT 0,
          created_at TEXT,
          FOREIGN KEY (order_id) REFERENCES orders(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        )`);

        await run(`CREATE TABLE IF NOT EXISTS cash_shifts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          opened_at TEXT,
          closed_at TEXT,
          initial_cash REAL,
          sales_cash REAL DEFAULT 0.0,
          sales_card REAL DEFAULT 0.0,
          status TEXT DEFAULT 'open'
        )`);

        // Seed Tables from Configuration
        const tableCount = await get(`SELECT COUNT(*) as count FROM tables`);
        if (tableCount.count === 0) {
          // Special Virtual table for fast checkout bar sales
          await run(`INSERT INTO tables (number, zone, status) VALUES (0, 'Barra', 'free')`);

          for (const [zone, count] of Object.entries(config.tablesSetup)) {
            for (let i = 1; i <= count; i++) {
              await run(`INSERT INTO tables (number, zone, status) VALUES (?, ?, 'free')`, [i, zone]);
            }
          }
        }

        // Seed Products from Configuration
        const productCount = await get(`SELECT COUNT(*) as count FROM products`);
        if (productCount.count === 0) {
          for (const prod of config.products) {
            await run(
              `INSERT INTO products (name, price, category, destination, is_most_used) VALUES (?, ?, ?, ?, ?)`, 
              [prod.name, prod.price, prod.category, prod.destination, prod.is_most_used || 0]
            );
          }
        }

        // Auto open default cash shift if none is active to prevent blocking
        const activeShift = await get(`SELECT id FROM cash_shifts WHERE status = 'open'`);
        if (!activeShift) {
          const timestamp = new Date().toISOString();
          await run(`INSERT INTO cash_shifts (opened_at, initial_cash, sales_cash, sales_card, status) VALUES (?, 150.00, 0.0, 0.0, 'open')`, [timestamp]);
          console.log('Turno de caja inicial abierto automáticamente con 150.00 €.');
        }

        console.log('Base de datos SQLite configurada.');
        resolve();
      } catch (dbErr) {
        console.error('Error al configurar tablas de SQLite. Usando fallback JSON:', dbErr);
        useFallback = true;
        loadFallback();
        resolve();
      }
    });
  });
}

// Cash Shifts API Methods
async function getActiveCashShift() {
  if (useFallback) {
    if (!fallbackData.cash_shifts) fallbackData.cash_shifts = [];
    return fallbackData.cash_shifts.find(s => s.status === 'open') || null;
  }
  return await get(`SELECT * FROM cash_shifts WHERE status = 'open'`);
}

async function openCashShift(initialCash) {
  const timestamp = new Date().toISOString();
  if (useFallback) {
    const active = await getActiveCashShift();
    if (active) return active.id;

    const newId = fallbackData.cash_shifts.length + 1;
    fallbackData.cash_shifts.push({
      id: newId,
      opened_at: timestamp,
      closed_at: null,
      initial_cash: Number(initialCash),
      sales_cash: 0.0,
      sales_card: 0.0,
      status: 'open'
    });
    saveFallback();
    return newId;
  }

  const active = await get(`SELECT id FROM cash_shifts WHERE status = 'open'`);
  if (active) return active.id;

  const result = await run(
    `INSERT INTO cash_shifts (opened_at, initial_cash, sales_cash, sales_card, status) VALUES (?, ?, 0.0, 0.0, 'open')`,
    [timestamp, initialCash]
  );
  return result.id;
}

async function closeCashShift(shiftId) {
  const timestamp = new Date().toISOString();
  if (useFallback) {
    const idx = fallbackData.cash_shifts.findIndex(s => s.id === Number(shiftId));
    if (idx !== -1) {
      fallbackData.cash_shifts[idx].status = 'closed';
      fallbackData.cash_shifts[idx].closed_at = timestamp;
      const closed = fallbackData.cash_shifts[idx];
      saveFallback();
      return closed;
    }
    return null;
  }

  await run(`UPDATE cash_shifts SET status = 'closed', closed_at = ? WHERE id = ?`, [timestamp, shiftId]);
  return await get(`SELECT * FROM cash_shifts WHERE id = ?`, [shiftId]);
}

// Admin modification API Methods
async function updateOrderItemQty(itemId, newQty) {
  if (newQty <= 0) {
    return await deleteOrderItem(itemId);
  }

  let orderId;
  if (useFallback) {
    const itemIndex = fallbackData.order_items.findIndex(oi => oi.id === Number(itemId));
    if (itemIndex !== -1) {
      fallbackData.order_items[itemIndex].quantity = Number(newQty);
      orderId = fallbackData.order_items[itemIndex].order_id;
      saveFallback();
    }
  } else {
    const item = await get(`SELECT order_id FROM order_items WHERE id = ?`, [itemId]);
    if (item) {
      orderId = item.order_id;
      await run(`UPDATE order_items SET quantity = ? WHERE id = ?`, [newQty, itemId]);
    }
  }

  if (orderId) {
    await updateOrderTotal(orderId);
  }
  return { success: true, orderId };
}

async function deleteOrderItem(itemId) {
  let orderId;
  if (useFallback) {
    const itemIndex = fallbackData.order_items.findIndex(oi => oi.id === Number(itemId));
    if (itemIndex !== -1) {
      orderId = fallbackData.order_items[itemIndex].order_id;
      fallbackData.order_items.splice(itemIndex, 1);
      saveFallback();
    }
  } else {
    const item = await get(`SELECT order_id FROM order_items WHERE id = ?`, [itemId]);
    if (item) {
      orderId = item.order_id;
      await run(`DELETE FROM order_items WHERE id = ?`, [itemId]);
    }
  }

  if (orderId) {
    await updateOrderTotal(orderId);
  }
  return { success: true, orderId };
}

// API methods
async function getTables() {
  if (useFallback) {
    return fallbackData.tables;
  }
  return await all(`SELECT * FROM tables ORDER BY zone ASC, number ASC`);
}

async function getProducts() {
  if (useFallback) {
    return fallbackData.products;
  }
  return await all(`SELECT * FROM products ORDER BY name ASC`);
}

async function createOrder(tableId) {
  const timestamp = new Date().toISOString();
  if (useFallback) {
    const tableIndex = fallbackData.tables.findIndex(t => t.id === Number(tableId));
    if (tableIndex === -1) throw new Error('Mesa no encontrada');

    const newId = fallbackData.orders.length + 1;
    const newOrder = {
      id: newId,
      table_id: Number(tableId),
      status: 'active',
      created_at: timestamp,
      closed_at: null,
      total: 0.0
    };
    fallbackData.orders.push(newOrder);

    fallbackData.tables[tableIndex].status = 'occupied';
    fallbackData.tables[tableIndex].active_order_id = newId;

    saveFallback();
    return newId;
  }

  const result = await run(`INSERT INTO orders (table_id, status, created_at, total) VALUES (?, 'active', ?, 0.0)`, [tableId, timestamp]);
  const orderId = result.id;
  await run(`UPDATE tables SET status = 'occupied', active_order_id = ? WHERE id = ?`, [orderId, tableId]);
  return orderId;
}

async function addItemsToOrder(orderId, items) {
  const timestamp = new Date().toISOString();
  const addedItems = [];

  for (const item of items) {
    let product;
    if (useFallback) {
      product = fallbackData.products.find(p => p.id === Number(item.productId));
      if (!product) continue;

      const newItemId = fallbackData.order_items.length + 1;
      const newItem = {
        id: newItemId,
        order_id: Number(orderId),
        product_id: Number(item.productId),
        quantity: Number(item.quantity),
        notes: item.notes || '',
        price_at_sale: product.price,
        printed_barra: 0,
        printed_cocina: 0,
        created_at: timestamp
      };
      fallbackData.order_items.push(newItem);

      addedItems.push({
        id: newItemId,
        order_id: Number(orderId),
        product_id: Number(item.productId),
        product_name: product.name,
        category: product.category,
        destination: product.destination,
        quantity: Number(item.quantity),
        notes: item.notes || '',
        price: product.price
      });
    } else {
      product = await get(`SELECT * FROM products WHERE id = ?`, [item.productId]);
      if (!product) continue;

      const result = await run(
        `INSERT INTO order_items (order_id, product_id, quantity, notes, price_at_sale, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.productId, item.quantity, item.notes || '', product.price, timestamp]
      );

      addedItems.push({
        id: result.id,
        order_id: orderId,
        product_id: item.productId,
        product_name: product.name,
        category: product.category,
        destination: product.destination,
        quantity: item.quantity,
        notes: item.notes || '',
        price: product.price
      });
    }
  }

  await updateOrderTotal(orderId);

  if (useFallback) {
    saveFallback();
  }

  return addedItems;
}

async function addManualItemToTable(tableId, name, price, quantity, category, destination) {
  const table = await getTableById(tableId);
  if (!table) throw new Error('Mesa no encontrada');

  let orderId = table.active_order_id;
  if (!orderId) {
    orderId = await createOrder(tableId);
  }

  const timestamp = new Date().toISOString();
  let manualItemId;
  let finalProdId = 9999 + Math.floor(Math.random() * 10000);

  if (useFallback) {
    manualItemId = fallbackData.order_items.length + 1;
    const newItem = {
      id: manualItemId,
      order_id: Number(orderId),
      product_id: finalProdId,
      quantity: Number(quantity),
      notes: 'Ítem Manual',
      price_at_sale: Number(price),
      printed_barra: 0,
      printed_cocina: 0,
      created_at: timestamp
    };
    fallbackData.order_items.push(newItem);
    saveFallback();
  } else {
    const result = await run(
      `INSERT INTO order_items (order_id, product_id, quantity, notes, price_at_sale, created_at) VALUES (?, NULL, ?, ?, ?, ?)`,
      [orderId, quantity, `Manual: ${name}`, price, timestamp]
    );
    manualItemId = result.id;
  }

  await updateOrderTotal(orderId);

  const returnedItem = {
    id: manualItemId,
    order_id: Number(orderId),
    product_id: null,
    product_name: name,
    category: category || 'manual',
    destination: destination || 'COCINA',
    quantity: Number(quantity),
    notes: 'Añadido manualmente',
    price: Number(price)
  };

  return returnedItem;
}

async function updateOrderTotal(orderId) {
  if (useFallback) {
    const items = fallbackData.order_items.filter(oi => oi.order_id === Number(orderId));
    const total = items.reduce((sum, item) => sum + (item.quantity * item.price_at_sale), 0);
    const orderIndex = fallbackData.orders.findIndex(o => o.id === Number(orderId));
    if (orderIndex !== -1) {
      fallbackData.orders[orderIndex].total = total;
    }
    return total;
  }

  const items = await all(`SELECT quantity, price_at_sale FROM order_items WHERE order_id = ?`, [orderId]);
  const total = items.reduce((sum, item) => sum + (item.quantity * item.price_at_sale), 0);
  await run(`UPDATE orders SET total = ? WHERE id = ?`, [total, orderId]);
  return total;
}

async function getTableById(tableId) {
  if (useFallback) {
    return fallbackData.tables.find(t => t.id === Number(tableId));
  }
  return await get(`SELECT * FROM tables WHERE id = ?`, [tableId]);
}

async function getActiveOrderDetails(tableId) {
  const table = await getTableById(tableId);
  if (!table || !table.active_order_id) {
    return null;
  }

  const orderId = table.active_order_id;
  let order;
  let items = [];

  if (useFallback) {
    order = fallbackData.orders.find(o => o.id === Number(orderId));
    if (!order) return null;

    const oItems = fallbackData.order_items.filter(oi => oi.order_id === Number(orderId));
    for (const oi of oItems) {
      let prodName = 'Ítem Manual';
      let category = 'manual';
      let destination = 'COCINA';

      if (oi.product_id) {
        const prod = fallbackData.products.find(p => p.id === oi.product_id);
        if (prod) {
          prodName = prod.name;
          category = prod.category;
          destination = prod.destination;
        }
      } else {
        prodName = oi.notes.replace('Manual: ', '');
      }

      items.push({
        id: oi.id,
        product_id: oi.product_id,
        product_name: prodName,
        category: category,
        destination: destination,
        quantity: oi.quantity,
        notes: oi.notes,
        price: oi.price_at_sale
      });
    }
  } else {
    order = await get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (!order) return null;

    const dbItems = await all(`
      SELECT oi.*, p.name as product_name, p.category, p.destination 
      FROM order_items oi 
      LEFT JOIN products p ON oi.product_id = p.id 
      WHERE oi.order_id = ?
    `, [orderId]);

    items = dbItems.map(item => {
      let name = item.product_name;
      let note = item.notes;
      if (!item.product_id) {
        name = item.notes.startsWith('Manual: ') ? item.notes.replace('Manual: ', '') : 'Artículo';
        note = 'Añadido manualmente';
      }
      return {
        id: item.id,
        product_id: item.product_id,
        product_name: name,
        category: item.category || 'manual',
        destination: item.destination || 'COCINA',
        quantity: item.quantity,
        notes: note,
        price: item.price_at_sale
      };
    });
  }

  return {
    order,
    items
  };
}

async function markItemsAsPrinted(orderId, itemIds, destination) {
  if (useFallback) {
    fallbackData.order_items.forEach(oi => {
      if (oi.order_id === Number(orderId) && itemIds.includes(oi.id)) {
        if (destination === 'BARRA') oi.printed_barra = 1;
        if (destination === 'COCINA') oi.printed_cocina = 1;
      }
    });
    saveFallback();
    return;
  }

  const field = destination === 'BARRA' ? 'printed_barra' : 'printed_cocina';
  const placeholders = itemIds.map(() => '?').join(',');
  await run(`UPDATE order_items SET ${field} = 1 WHERE order_id = ? AND id IN (${placeholders})`, [orderId, ...itemIds]);
}

async function closeOrder(orderId, paymentMethod = 'EFECTIVO') {
  const timestamp = new Date().toISOString();
  let closedOrder;
  let items = [];
  let tableId;

  if (useFallback) {
    const orderIndex = fallbackData.orders.findIndex(o => o.id === Number(orderId));
    if (orderIndex === -1) throw new Error('Comanda no encontrada');

    fallbackData.orders[orderIndex].status = 'closed';
    fallbackData.orders[orderIndex].closed_at = timestamp;
    closedOrder = fallbackData.orders[orderIndex];
    tableId = closedOrder.table_id;

    // Add to cash shift
    const activeShift = await getActiveCashShift();
    if (activeShift) {
      const shiftIndex = fallbackData.cash_shifts.findIndex(s => s.id === activeShift.id);
      if (shiftIndex !== -1) {
        if (paymentMethod === 'EFECTIVO') {
          fallbackData.cash_shifts[shiftIndex].sales_cash += closedOrder.total;
        } else {
          fallbackData.cash_shifts[shiftIndex].sales_card += closedOrder.total;
        }
      }
    }

    // Free table
    const tableIndex = fallbackData.tables.findIndex(t => t.id === tableId);
    if (tableIndex !== -1) {
      fallbackData.tables[tableIndex].status = 'free';
      fallbackData.tables[tableIndex].active_order_id = null;
    }

    const oItems = fallbackData.order_items.filter(oi => oi.order_id === Number(orderId));
    items = oItems.map(oi => {
      let name = 'Ítem Manual';
      if (oi.product_id) {
        const prod = fallbackData.products.find(p => p.id === oi.product_id);
        name = prod ? prod.name : 'Desconocido';
      } else {
        name = oi.notes.replace('Manual: ', '');
      }
      return {
        product_name: name,
        quantity: oi.quantity,
        price: oi.price_at_sale
      };
    });

    saveFallback();
  } else {
    const order = await get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (!order) throw new Error('Comanda no encontrada');
    tableId = order.table_id;

    // Update order status
    await run(`UPDATE orders SET status = 'closed', closed_at = ? WHERE id = ?`, [timestamp, orderId]);
    
    // Add to cash shift in DB
    const activeShift = await getActiveCashShift();
    if (activeShift) {
      const field = paymentMethod === 'EFECTIVO' ? 'sales_cash' : 'sales_card';
      await run(`UPDATE cash_shifts SET ${field} = ${field} + ? WHERE id = ?`, [order.total, activeShift.id]);
    }

    await run(`UPDATE tables SET status = 'free', active_order_id = NULL WHERE id = ?`, [tableId]);

    closedOrder = await get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    const dbItems = await all(`
      SELECT oi.*, p.name as product_name 
      FROM order_items oi 
      LEFT JOIN products p ON oi.product_id = p.id 
      WHERE oi.order_id = ?
    `, [orderId]);

    items = dbItems.map(oi => {
      let name = oi.product_name;
      if (!oi.product_id) {
        name = oi.notes.startsWith('Manual: ') ? oi.notes.replace('Manual: ', '') : 'Artículo';
      }
      return {
        product_name: name,
        quantity: oi.quantity,
        price: oi.price_at_sale
      };
    });
  }

  return {
    order: closedOrder,
    items,
    tableId
  };
}

module.exports = {
  initDB,
  getTables,
  getProducts,
  createOrder,
  addItemsToOrder,
  addManualItemToTable,
  getActiveOrderDetails,
  markItemsAsPrinted,
  closeOrder,
  getActiveCashShift,
  openCashShift,
  closeCashShift,
  updateOrderItemQty,
  deleteOrderItem,
  getRestaurantConfig,
  isFallback: () => useFallback
};

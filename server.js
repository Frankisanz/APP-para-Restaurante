const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const printer = require('./printer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API route to get simulated receipt files list
app.get('/api/receipts', (req, res) => {
  const receiptsDir = path.join(__dirname, 'receipts');
  try {
    if (!fs.existsSync(receiptsDir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(receiptsDir)
      .filter(f => f.endsWith('.txt'))
      .map(f => {
        const stats = fs.statSync(path.join(receiptsDir, f));
        return { name: f, time: stats.mtime };
      })
      .sort((a, b) => b.time - a.time);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', async (ws) => {
  clients.add(ws);
  console.log(`Cliente POS conectado. Total: ${clients.size}`);

  // Send initial state
  try {
    const tables = await db.getTables();
    const products = await db.getProducts();
    const printerSettings = printer.getPrinterSettings();
    const activeCashShift = await db.getActiveCashShift();
    const restaurantConfig = db.getRestaurantConfig();

    ws.send(JSON.stringify({
      type: 'INITIAL_STATE',
      data: {
        tables,
        products,
        printerSettings,
        activeCashShift,
        restaurantConfig
      }
    }));
  } catch (err) {
    console.error('Error al enviar estado inicial:', err);
  }

  ws.on('message', async (messageStr) => {
    try {
      const message = JSON.parse(messageStr);
      console.log('Mensaje recibido:', message.type);

      switch (message.type) {
        case 'GET_INITIAL_STATE': {
          const tables = await db.getTables();
          const products = await db.getProducts();
          const printerSettings = printer.getPrinterSettings();
          const activeCashShift = await db.getActiveCashShift();
          const restaurantConfig = db.getRestaurantConfig();
          ws.send(JSON.stringify({
            type: 'INITIAL_STATE',
            data: { tables, products, printerSettings, activeCashShift, restaurantConfig }
          }));
          break;
        }

        case 'NEW_ORDER': {
          const { tableId, items } = message.data;
          if (!items || items.length === 0) return;

          const tables = await db.getTables();
          const table = tables.find(t => t.id === Number(tableId));
          if (!table) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Mesa no encontrada' }));
            return;
          }

          let orderId = table.active_order_id;
          if (!orderId) {
            orderId = await db.createOrder(tableId);
          }

          const addedItems = await db.addItemsToOrder(orderId, items);

          // Split Barra/Cocina
          const barraItems = addedItems.filter(item => item.destination === 'BARRA');
          const cocinaItems = addedItems.filter(item => item.destination === 'COCINA');
          const timestamp = new Date().toISOString();

          if (barraItems.length > 0) {
            printer.printJob('BARRA', 'COMANDA BARRA', table.number, orderId, timestamp, barraItems)
              .then(async (result) => {
                const itemIds = barraItems.map(item => item.id);
                await db.markItemsAsPrinted(orderId, itemIds, 'BARRA');
                
                broadcast({
                  type: 'PRINT_LOG',
                  data: { destination: 'BARRA', success: result.success, mode: result.mode, ticket: result.ticket }
                });
                
                broadcast({
                  type: 'NEW_ORDER_ALERT',
                  data: { tableId, tableNumber: table.number, destination: 'BARRA', ticket: result.ticket }
                });
              });
          }

          if (cocinaItems.length > 0) {
            printer.printJob('COCINA', 'COMANDA COCINA', table.number, orderId, timestamp, cocinaItems)
              .then(async (result) => {
                const itemIds = cocinaItems.map(item => item.id);
                await db.markItemsAsPrinted(orderId, itemIds, 'COCINA');
                
                broadcast({
                  type: 'PRINT_LOG',
                  data: { destination: 'COCINA', success: result.success, mode: result.mode, ticket: result.ticket }
                });

                broadcast({
                  type: 'NEW_ORDER_ALERT',
                  data: { tableId, tableNumber: table.number, destination: 'COCINA', ticket: result.ticket }
                });
              });
          }

          const updatedTables = await db.getTables();
          broadcast({ type: 'STATE_UPDATE', data: { tables: updatedTables } });

          const activeOrder = await db.getActiveOrderDetails(tableId);
          broadcast({ type: 'ORDER_UPDATED', data: { tableId, activeOrder } });
          break;
        }

        case 'ADD_MANUAL_ITEM': {
          const { tableId, name, price, quantity, category, destination } = message.data;
          const newItem = await db.addManualItemToTable(tableId, name, price, quantity, category, destination);
          
          const tables = await db.getTables();
          const table = tables.find(t => t.id === Number(tableId));
          const orderId = table.active_order_id;
          
          printer.printJob(destination, `MANUAL - ${destination}`, table.number, orderId, new Date().toISOString(), [newItem])
            .then(async (result) => {
              const itemIds = [newItem.id];
              await db.markItemsAsPrinted(orderId, itemIds, destination);

              broadcast({
                type: 'PRINT_LOG',
                data: { destination, success: result.success, mode: result.mode, ticket: result.ticket }
              });

              broadcast({
                type: 'NEW_ORDER_ALERT',
                data: { tableId, tableNumber: table.number, destination, ticket: result.ticket }
              });
            });

          const updatedTables = await db.getTables();
          broadcast({ type: 'STATE_UPDATE', data: { tables: updatedTables } });

          const activeOrder = await db.getActiveOrderDetails(tableId);
          broadcast({ type: 'ORDER_UPDATED', data: { tableId, activeOrder } });
          break;
        }

        case 'CLOSE_TABLE': {
          const { orderId, paymentMethod } = message.data;
          console.log(`Cobrando comanda ID ${orderId} vía ${paymentMethod}`);

          // Settle order closure
          const { order, items, tableId } = await db.closeOrder(orderId, paymentMethod || 'EFECTIVO');
          const tables = await db.getTables();
          const table = tables.find(t => t.id === tableId);
          const timestamp = new Date().toISOString();

          // Print cash ticket invoice
          printer.printJob('COCINA', 'FACTURA / TICKET FINAL', table.number, orderId, timestamp, items, order.total)
            .then((result) => {
              broadcast({
                type: 'PRINT_LOG',
                data: { destination: 'FACTURA', success: result.success, mode: result.mode, ticket: result.ticket }
              });
            });

          // Automate drawer opening pulse (Critical requirement)
          printer.triggerCashDrawerOpen(`Cobro Mesa ${table.number}`)
            .then((drawerResult) => {
              broadcast({
                type: 'PRINT_LOG',
                data: { destination: 'CAJÓN', success: true, mode: 'simulated', ticket: drawerResult.ticket }
              });
              broadcast({ type: 'CASH_DRAWER_OPENED', data: { origin: `Mesa ${table.number}` } });
            });

          // Sync rooms state
          broadcast({ type: 'STATE_UPDATE', data: { tables } });
          broadcast({ type: 'ORDER_UPDATED', data: { tableId, activeOrder: null } });

          // Send updated cash shift total
          const activeCashShift = await db.getActiveCashShift();
          broadcast({ type: 'CASH_SHIFT_UPDATED', data: { activeCashShift } });
          break;
        }

        // Cash Drawer Manual kick open
        case 'OPEN_CASH_DRAWER': {
          printer.triggerCashDrawerOpen('Botón Manual')
            .then((result) => {
              broadcast({
                type: 'PRINT_LOG',
                data: { destination: 'CAJÓN', success: true, mode: 'simulated', ticket: result.ticket }
              });
              broadcast({ type: 'CASH_DRAWER_OPENED', data: { origin: 'Botón Escritorio' } });
            });
          break;
        }

        // Cash Shifts: Open Turno
        case 'OPEN_CASH_SHIFT': {
          const { initialCash } = message.data;
          const shiftId = await db.openCashShift(initialCash);
          const activeCashShift = await db.getActiveCashShift();
          broadcast({ type: 'CASH_SHIFT_UPDATED', data: { activeCashShift } });
          break;
        }

        // Cash Shifts: Arqueo X Report
        case 'DO_ARQUEO': {
          const activeShift = await db.getActiveCashShift();
          if (activeShift) {
            const ticket = printer.formatShiftReportTicket('ARQUEO DE CAJA (X)', activeShift);
            broadcast({
              type: 'PRINT_LOG',
              data: { destination: 'ARQUEO', success: true, mode: 'simulated', ticket }
            });
          }
          break;
        }

        // Cash Shifts: Cierre Z Report
        case 'CLOSE_CASH_SHIFT': {
          const activeShift = await db.getActiveCashShift();
          if (activeShift) {
            const closedShift = await db.closeCashShift(activeShift.id);
            const ticket = printer.formatShiftReportTicket('CIERRE DE CAJA (ZETA)', closedShift);
            
            // Print report
            broadcast({
              type: 'PRINT_LOG',
              data: { destination: 'CIERRE Z', success: true, mode: 'simulated', ticket }
            });

            // Open a fresh shift automatically to prevent POS blocking
            await db.openCashShift(150.00); 
            
            const nextShift = await db.getActiveCashShift();
            broadcast({ type: 'CASH_SHIFT_UPDATED', data: { activeCashShift: nextShift } });
          }
          break;
        }

        // Admin: Delete mistakenly added item
        case 'DELETE_ORDER_ITEM': {
          const { itemId, tableId } = message.data;
          console.log(`Admin: Eliminando item ID ${itemId} de Mesa ${tableId}`);
          
          await db.deleteOrderItem(itemId);
          
          const updatedTables = await db.getTables();
          broadcast({ type: 'STATE_UPDATE', data: { tables: updatedTables } });

          const activeOrder = await db.getActiveOrderDetails(tableId);
          broadcast({ type: 'ORDER_UPDATED', data: { tableId, activeOrder } });
          break;
        }

        // Admin: Update item quantity
        case 'UPDATE_ORDER_ITEM_QTY': {
          const { itemId, tableId, quantity } = message.data;
          console.log(`Admin: Actualizando item ID ${itemId} a cantidad ${quantity}`);

          await db.updateOrderItemQty(itemId, quantity);
          
          const updatedTables = await db.getTables();
          broadcast({ type: 'STATE_UPDATE', data: { tables: updatedTables } });

          const activeOrder = await db.getActiveOrderDetails(tableId);
          broadcast({ type: 'ORDER_UPDATED', data: { tableId, activeOrder } });
          break;
        }

        case 'UPDATE_PRINTERS': {
          const { settings } = message.data;
          printer.updatePrinterSettings(settings);
          const printerSettings = printer.getPrinterSettings();
          broadcast({ type: 'PRINTER_SETTINGS_UPDATED', data: { printerSettings } });
          break;
        }

        case 'GET_TABLE_DETAILS': {
          const { tableId } = message.data;
          const activeOrder = await db.getActiveOrderDetails(tableId);
          ws.send(JSON.stringify({
            type: 'ORDER_UPDATED',
            data: { tableId, activeOrder }
          }));
          break;
        }

        default:
          console.warn('Mensaje desconocido:', message.type);
      }
    } catch (err) {
      console.error('Error procesando WS:', err);
      ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Cliente POS desconectado. Total: ${clients.size}`);
  });
});

db.initDB()
  .then(() => {
    server.listen(PORT, () => {
      const config = db.getRestaurantConfig();
      console.log(`================================================================`);
      console.log(` SERVIDOR POS MULTI-RESTAURANTE EN LÍNEA`);
      console.log(` Establecimiento: ${config.restaurant.name}`);
      console.log(` Dirección Local: http://localhost:${PORT}`);
      console.log(` Comandero Móvil: http://localhost:${PORT}/mobile.html`);
      console.log(`================================================================`);
    });
  })
  .catch((err) => {
    console.error('Fallo crítico al iniciar el servidor:', err);
  });

const fs = require('fs');
const path = require('path');
const net = require('net');

// Directory where simulated text tickets are written
const RECEIPTS_DIR = path.join(__dirname, 'receipts');

if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

// Default configuration for printers
let printerSettings = {
  BARRA: { type: 'simulated', path: 'Simulador Barra' },
  COCINA: { type: 'simulated', path: 'Simulador Cocina' }
};

const SETTINGS_FILE = path.join(__dirname, 'printer_settings.json');

// Load configurations
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    printerSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (err) {
    console.error('Error al cargar configuraciones de impresora:', err);
  }
}

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;

const CMD_INIT = Buffer.from([ESC, 0x40]);
const CMD_ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const CMD_ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const CMD_ALIGN_RIGHT = Buffer.from([ESC, 0x61, 0x02]);
const CMD_BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const CMD_BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
const CMD_SIZE_DOUBLE = Buffer.from([GS, 0x21, 0x11]);
const CMD_SIZE_NORMAL = Buffer.from([GS, 0x21, 0x00]);
const CMD_CUT_PAPER = Buffer.from([GS, 0x56, 0x41, 0x08]);
const CMD_OPEN_DRAWER = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]); // RJ11 Drawer Pulse

/**
 * Format raw ESC/POS byte buffer for a ticket
 */
function buildEscPosBuffer(title, tableNumber, orderId, timestamp, items) {
  let buffers = [];

  buffers.push(CMD_INIT);
  buffers.push(CMD_ALIGN_CENTER);
  buffers.push(CMD_SIZE_DOUBLE);
  buffers.push(CMD_BOLD_ON);
  buffers.push(Buffer.from(`${title}\n`));
  
  buffers.push(CMD_SIZE_NORMAL);
  buffers.push(CMD_BOLD_OFF);
  buffers.push(Buffer.from(`================================\n`));
  buffers.push(Buffer.from(`MESA: ${tableNumber}  |  ORDEN: #${orderId}\n`));
  buffers.push(Buffer.from(`FECHA: ${new Date(timestamp).toLocaleTimeString('es-ES')}\n`));
  buffers.push(Buffer.from(`================================\n`));
  
  buffers.push(CMD_ALIGN_LEFT);
  for (const item of items) {
    buffers.push(CMD_BOLD_ON);
    buffers.push(Buffer.from(`${item.quantity} x ${item.product_name}\n`));
    buffers.push(CMD_BOLD_OFF);
    if (item.notes) {
      buffers.push(Buffer.from(`   * NOTA: ${item.notes}\n`));
    }
    buffers.push(Buffer.from(`--------------------------------\n`));
  }

  buffers.push(CMD_ALIGN_CENTER);
  buffers.push(Buffer.from(`\n\n\n\n`));
  buffers.push(CMD_CUT_PAPER);

  return Buffer.concat(buffers);
}

/**
 * Creates a beautiful ASCII visual layout of the ticket for logs and simulation
 */
function buildAsciiTicket(title, tableNumber, orderId, timestamp, items, total = null) {
  const timeStr = new Date(timestamp).toLocaleString('es-ES');
  let text = '';
  text += `┌────────────────────────────────────────┐\n`;
  text += `│ ${title.padEnd(38)} │\n`;
  text += `├────────────────────────────────────────┤\n`;
  if (tableNumber !== undefined && tableNumber !== null && tableNumber !== '') {
    const tableLabel = tableNumber === 0 ? 'V. Rápida' : tableNumber.toString();
    text += `│ Mesa: ${tableLabel.padEnd(10)} | Orden: #${orderId.toString().padEnd(14)} │\n`;
  } else {
    text += `│ Transacción de Caja                    │\n`;
  }
  text += `│ Hora: ${timeStr.padEnd(32)} │\n`;
  text += `├────────────────────────────────────────┤\n`;
  
  for (const item of items) {
    const qtyStr = `${item.quantity}x`.padEnd(5);
    const nameStr = item.product_name.substring(0, 31);
    text += `│ ${qtyStr}${nameStr.padEnd(33)} │\n`;
    
    if (item.notes) {
      text += `│   └─ NOTA: ${item.notes.substring(0, 31).padEnd(29)} │\n`;
    }
    if (total !== null) {
      const priceStr = `${(item.price * item.quantity).toFixed(2)} €`;
      text += `│     ${priceStr.padStart(32)} │\n`;
    }
    text += `│ -------------------------------------- │\n`;
  }
  
  if (total !== null) {
    const totalStr = `TOTAL: ${total.toFixed(2)} €`;
    text += `│ ${totalStr.padStart(38)} │\n`;
  } else {
    text += `│            ENVIADO A PREPARAR          │\n`;
  }
  
  text += `└────────────────────────────────────────┘\n`;
  return text;
}

/**
 * Trigger physical drawer open command, and write virtual log
 */
function triggerCashDrawerOpen(origin = 'Panel Central') {
  return new Promise((resolve) => {
    const timeStr = new Date().toLocaleString('es-ES');
    let text = '';
    text += `┌────────────────────────────────────────┐\n`;
    text += `│           CAJÓN PORTAMONEDAS           │\n`;
    text += `├────────────────────────────────────────┤\n`;
    text += `│           [APERTURA DE CAJÓN]          │\n`;
    text += `│                                        │\n`;
    text += `│ Hora: ${timeStr.padEnd(32)} │\n`;
    text += `│ Origen: ${origin.padEnd(30)} │\n`;
    text += `└────────────────────────────────────────┘\n`;

    const filename = `cajon_abierto_${Date.now()}.txt`;
    fs.writeFileSync(path.join(RECEIPTS_DIR, filename), text, 'utf8');

    // Send RJ11 pulse to Cocina/Barra printer if physical
    const config = printerSettings.BARRA; // route drawer kickoff to Barra printer
    if (config.type === 'network' && config.path) {
      const parts = config.path.split(':');
      const host = parts[0];
      const port = parseInt(parts[1] || '9100', 10);
      const client = new net.Socket();
      client.setTimeout(2000);
      client.connect(port, host, () => {
        client.write(CMD_OPEN_DRAWER, () => {
          client.destroy();
        });
      });
      client.on('error', () => {}); // swallow silently
    }

    resolve({ success: true, mode: 'simulated', ticket: text });
  });
}

/**
 * Format Arqueo (X) or Cierre (Z) report
 */
function formatShiftReportTicket(title, shiftData) {
  const openTime = new Date(shiftData.opened_at).toLocaleString('es-ES');
  const nowTime = new Date().toLocaleString('es-ES');
  const expectedTotal = shiftData.initial_cash + shiftData.sales_cash;
  const salesTotal = shiftData.sales_cash + shiftData.sales_card;

  let text = '';
  text += `┌────────────────────────────────────────┐\n`;
  text += `│ ${title.padEnd(38)} │\n`;
  text += `├────────────────────────────────────────┤\n`;
  text += `│ Turno ID: #${shiftData.id.toString().padEnd(28)} │\n`;
  text += `│ Apertura: ${openTime.padEnd(28)} │\n`;
  text += `│ Reporte:  ${nowTime.padEnd(28)} │\n`;
  text += `├────────────────────────────────────────┤\n`;
  
  const initStr = `${shiftData.initial_cash.toFixed(2)} €`;
  text += `│ Fondo Inicial: ${initStr.padStart(23)} │\n`;
  
  const cashStr = `${shiftData.sales_cash.toFixed(2)} €`;
  text += `│ Ventas Efectivo: ${cashStr.padStart(21)} │\n`;
  
  const cardStr = `${shiftData.sales_card.toFixed(2)} €`;
  text += `│ Ventas Tarjeta: ${cardStr.padStart(22)} │\n`;
  
  text += `├────────────────────────────────────────┤\n`;
  const expStr = `${expectedTotal.toFixed(2)} €`;
  text += `│ ESPERADO EN CAJA: ${expStr.padStart(20)} │\n`;
  
  const totalStr = `${salesTotal.toFixed(2)} €`;
  text += `│ TOTAL VENTAS TURNO: ${totalStr.padStart(18)} │\n`;
  
  if (shiftData.status === 'closed') {
    text += `├────────────────────────────────────────┤\n`;
    text += `│          TURNO CERRADO CON ÉXITO       │\n`;
  }
  text += `└────────────────────────────────────────┘\n`;

  const filename = `${title.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.txt`;
  fs.writeFileSync(path.join(RECEIPTS_DIR, filename), text, 'utf8');

  return text;
}

/**
 * Sends a job asynchronously to the configured printer,
 * while saving a simulated copy locally.
 */
function printJob(destination, title, tableNumber, orderId, timestamp, items, total = null) {
  return new Promise((resolve) => {
    const config = printerSettings[destination] || { type: 'simulated', path: '' };
    
    // Build simulated representation
    const asciiTicket = buildAsciiTicket(title, tableNumber, orderId, timestamp, items, total);
    
    // Save to receipts folder
    const filename = `${destination.toLowerCase()}_mesa_${tableNumber}_ord_${orderId}_${Date.now()}.txt`;
    const filepath = path.join(RECEIPTS_DIR, filename);
    
    fs.writeFileSync(filepath, asciiTicket, 'utf8');
    
    // Build ESC/POS commands buffer
    const escPosBuffer = buildEscPosBuffer(title, tableNumber, orderId, timestamp, items);

    // If it's a physical network printer
    if (config.type === 'network' && config.path) {
      const parts = config.path.split(':');
      const host = parts[0];
      const port = parts[1] ? parseInt(parts[1], 10) : 9100;
      const client = new net.Socket();
      
      client.setTimeout(3000);
      client.connect(port, host, () => {
        client.write(escPosBuffer, () => {
          client.destroy();
          resolve({ success: true, mode: 'network', path: config.path, ticket: asciiTicket });
        });
      });
      
      client.on('error', (err) => {
        resolve({ success: false, error: err.message, mode: 'simulated', ticket: asciiTicket });
      });
      
      client.on('timeout', () => {
        client.destroy();
        resolve({ success: false, error: 'Timeout', mode: 'simulated', ticket: asciiTicket });
      });
      
    } 
    // If it's a serial / USB / COM port printer
    else if (config.type === 'serial' && config.path) {
      fs.writeFile(config.path, escPosBuffer, (err) => {
        if (err) {
          resolve({ success: false, error: err.message, mode: 'simulated', ticket: asciiTicket });
        } else {
          resolve({ success: true, mode: 'serial', path: config.path, ticket: asciiTicket });
        }
      });
    } 
    // Default simulated mode
    else {
      setTimeout(() => {
        resolve({ success: true, mode: 'simulated', path: config.path, ticket: asciiTicket });
      }, 300);
    }
  });
}

function updatePrinterSettings(newSettings) {
  printerSettings = { ...printerSettings, ...newSettings };
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(printerSettings, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

function getPrinterSettings() {
  return printerSettings;
}

module.exports = {
  printJob,
  triggerCashDrawerOpen,
  formatShiftReportTicket,
  updatePrinterSettings,
  getPrinterSettings
};

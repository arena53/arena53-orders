// Owner Password
const ownerPassword = 'arena53';
let editingExpenseIndex = null;
let isAuthenticated = sessionStorage.getItem('arena53_authenticated') === 'true';

// Google Sheets Integration Config - UPDATE WITH NEW DEPLOYMENT URL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwfMuXK3o2Cn0guZC0JS-QrO1nNSp0g7BbLbL37ER_fdFdaROtABBZH906Jxtbkj6f1UA/exec'; // Replace with new GAS deployment URL
const SECRET_KEY = 'arena53_secret'; // Match in GAS

// Global gstRates
const gstRates = {
  'laps': 0.18,
  'mojitos': 0.05, 'cold-coffee': 0.05, 'ice-creams': 0.05, 'barista': 0.05,
  'tea': 0.05, 'smoothies': 0.05, 'desserts': 0.05, 'fresh-juice': 0.05,
  'soups': 0.05, 'starters-veg': 0.05, 'quick-bites': 0.05, 'momos': 0.05,
  'starters-nonveg': 0.05, 'rice-noodles': 0.05, 'burgers': 0.05,
  'sandwiches': 0.05, 'pasta': 0.05, 'pizzas': 0.05
};

// Global variables - Multi-table cart system
let activeTable = 1;
let tableCarts = {
  1: [], 2: [], 3: [], 4: [], 5: [], 6: []
};
let cart = tableCarts[activeTable]; // Reference to current table's cart
let salesData = JSON.parse(localStorage.getItem('arena53_sales')) || [];
let categorySalesData = JSON.parse(localStorage.getItem('arena53_category_sales')) || {};
let expensesData = JSON.parse(localStorage.getItem('arena53_expenses')) || [];
let tempSaleData = null;

// Optimized Sync to Google Sheets
async function syncToSheets(action, payload, button = null) {
  if (!GAS_URL || GAS_URL.includes('YOUR_NEW_DEPLOY_ID')) {
    console.warn('GAS_URL not updated - skipping sync. Update with new deployment URL.');
    if (button) button.disabled = false;
    return false;
  }
  const maxRetries = 2;
  if (button) {
    button.disabled = true;
    button.textContent = 'Syncing...';
  }
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = { secret: SECRET_KEY, action, ...payload };
      const response = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }, // Bypass preflight
        body: JSON.stringify(data)
      });
      const resultText = await response.text();
      const resultObj = JSON.parse(resultText || '{}');
      if (resultObj.result === 'Success' || resultObj.result === 'Preflight OK') {
        console.log(`Synced to Sheets: ${action} (attempt ${attempt})`);
        if (button) {
          button.disabled = false;
          button.textContent = button.dataset.originalText || button.textContent.replace('Syncing...', '');
        }
        return true;
      } else {
        throw new Error(resultObj.result || 'Unknown GAS response');
      }
    } catch (error) {
      console.error(`Sync attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        console.error('Final sync failed. Data saved locally.');
        if (button) button.disabled = false;
        alert(`Sync failed (${action}). Data saved locally. Check GAS Executions or redeploy.`);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 300 * attempt));
    }
  }
  if (button) button.disabled = false;
  return false;
}

// Store original button text before sync
function prepareButtonForSync(button, originalText) {
  if (button) button.dataset.originalText = originalText;
}

// Load data FROM Google Sheets
async function loadFromSheets(button = null) {
  if (!GAS_URL || GAS_URL.includes('YOUR_NEW_DEPLOY_ID')) {
    alert('Google Sheets URL not configured. Update GAS_URL in script.js');
    return false;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Loading from Sheets...';
  }

  try {
    const data = { secret: SECRET_KEY, action: 'getData' };
    const response = await fetch(GAS_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(data)
    });

    const resultText = await response.text();
    const resultObj = JSON.parse(resultText || '{}');

    if (resultObj.result === 'Success' && resultObj.data) {
      // Parse and load sales data
      if (resultObj.data.sales && Array.isArray(resultObj.data.sales)) {
        // Convert sheet date format (D-MM-YYYY or DD-MM-YYYY) to ISO (YYYY-MM-DD)
        salesData = resultObj.data.sales.map(sale => {
          let dateStr = sale.date;
          if (dateStr && dateStr.includes('-')) {
            const parts = dateStr.split('-');
            // Check if last part is 4 digits (year) - means DD-MM-YYYY or D-MM-YYYY format
            if (parts.length === 3 && parts[2].length === 4) {
              // Pad day and month with leading zeros
              const day = parts[0].padStart(2, '0');
              const month = parts[1].padStart(2, '0');
              const year = parts[2];
              dateStr = `${year}-${month}-${day}`;
            }
          }
          return {
            ...sale,
            date: dateStr,
            grandTotal: parseFloat(sale.grandTotal) || 0,
            items: sale.items || []
          };
        });
        localStorage.setItem('arena53_sales', JSON.stringify(salesData));
      }

      // Parse and load expenses data
      if (resultObj.data.expenses && Array.isArray(resultObj.data.expenses)) {
        expensesData = resultObj.data.expenses.map(exp => {
          let dateStr = exp.date;
          if (dateStr && dateStr.includes('-')) {
            const parts = dateStr.split('-');
            // Check if last part is 4 digits (year) - means DD-MM-YYYY format
            if (parts.length === 3 && parts[2].length === 4) {
              const day = parts[0].padStart(2, '0');
              const month = parts[1].padStart(2, '0');
              const year = parts[2];
              dateStr = `${year}-${month}-${day}`;
            }
          }
          return {
            ...exp,
            date: dateStr,
            amount: parseFloat(exp.amount) || 0
          };
        });
        localStorage.setItem('arena53_expenses', JSON.stringify(expensesData));
      }

      console.log(`Loaded from Sheets: ${salesData.length} sales, ${expensesData.length} expenses`);
      alert(`✅ Loaded ${salesData.length} sales and ${expensesData.length} expenses from Google Sheets!`);

      // Refresh dashboard
      updateQuickStats();
      loadDashboard();
      loadExpenses();

      if (button) {
        button.disabled = false;
        button.textContent = 'Load from Sheets';
      }
      return true;
    } else {
      throw new Error(resultObj.result || 'Failed to get data from Sheets');
    }
  } catch (error) {
    console.error('Load from Sheets failed:', error);
    alert(`❌ Failed to load from Sheets: ${error.message}\n\nMake sure your Google Apps Script supports the 'getData' action.`);
    if (button) {
      button.disabled = false;
      button.textContent = 'Load from Sheets';
    }
    return false;
  }
}

// Theme Toggle
function toggleTheme() {
  const body = document.body;
  const sunIcon = document.getElementById('sun-icon');
  const moonIcon = document.getElementById('moon-icon');
  if (body.getAttribute('data-theme') === 'dark') {
    body.setAttribute('data-theme', 'light');
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
    localStorage.setItem('theme', 'light');
  } else {
    body.setAttribute('data-theme', 'dark');
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
    localStorage.setItem('theme', 'dark');
  }
}

// Menu data
const menu = {
  laps: {
    '8 laps': 423, '12 laps': 635, '16 laps': 847, '20 laps': 1060, '24 laps': 1271,
    '2 person x 12 laps': 1228, '2 person x 16 laps': 1525,
    'double seat 8 laps': 550, 'double seat 12 laps': 847, 'Student x 8 laps': 381
  },
  mojitos: {
    'Lemon Mojito': 100, 'Green Apple Mojito': 100, 'Lime Soda': 90, 'Virgin Mojito': 90,
    'Cranberry Mojito': 100, 'Raspberry Mojito': 110, 'Orange Punch Mojito': 100,
    'Blue Berry Mojito': 110, 'Mojito Pitcher': 100, 'Watermelon Mojito': 90, 'Pineapple Mojito': 90
  },
  'cold-coffee': { 'Iced Coffee': 120, 'Cafe Frappe': 130, 'Iced Americano': 140, 'Caramel Frappe': 140, 'Oreo Frappe': 160 },
  'ice-creams': { 'Vanilla': 80, 'Mango': 100, 'Chocolate': 110, 'Butterscotch': 120 },
  barista: { 'Cappuccino': 130, 'Caramel Latte': 160, 'Espresso': 110, 'Cafe Americano': 120, 'Cafe Latte': 150 },
  tea: { 'Ginger Lemon Tea': 80, 'Green Tea': 70, 'Hot Lemon Tea': 70, 'Iced Tea': 110, 'Black Tea': 80, 'Black Ginger Tea': 90 },
  smoothies: {
    'Vanilla Milk Smoothie': 110, 'Mango Milk Smoothie': 120, 'Chocolate Milk Smoothie': 120,
    'Butterscotch Smoothie': 130, 'Green Apple Smoothie': 110, 'Blueberry Smoothie': 100,
    'Strawberry Smoothie': 110, 'Oreo Smoothie': 140
  },
  desserts: { 'Cupcakes': 60, 'Brownie': 120, 'Cheesecake': 170, 'Water Bottle 500mL': 20 },
  'fresh-juice': {
    'Watermelon Juice': 100, 'Pineapple Juice': 110, 'Orange Juice': 130, 'Muskmelon Juice': 100
  },
  soups: {
    'Manchow Soup': 110, 'Hot & Sour Soup': 125, 'Clear Soup': 150, 'Tom Yum Soup': 120
  },
  'starters-veg': {
    'Mushroom Chilly': 180, 'Burnt Pepper Mushroom': 190, 'Baby Corn Manchurian': 200,
    'Thai Chilly Baby Corn': 210, 'Paneer Manchurian': 220, 'Paneer Chilly': 230, 'Oyster Paneer': 225
  },
  'quick-bites': {
    'French Fries': 120, 'Peri Peri Fries': 135, 'Cheese Fries': 160, 'Cheese Ball': 140,
    'Chicken Nuggets': 150, 'Chicken Strips': 170, 'Veg Popcorn': 145, 'Chicken Popcorn': 180,
    'Cheese Garlic Bread': 165, 'Veg Nachos': 145, 'Chicken Nachos': 175
  },
  momos: {
    'Veg Momos': 120, 'Chicken Momos': 150, 'Veg Fried Momos': 140, 'Chicken Fried Momos': 170
  },
  'starters-nonveg': {
    'Chicken Lollipop': 220, 'Crispy Chicken Wings': 190, 'Dragon Chicken': 250,
    'Kung Pao Chicken': 225, 'Chicken Manchurian': 210, 'Burnt Garlic Chicken': 200,
    'Lemon Basil Chicken': 230, 'Thai Fried Chicken': 220
  },
  'rice-noodles': {
    'Veg Fried Rice': 140, 'Chicken Fried Rice': 165, 'Veg Schezwan Rice': 150,
    'Chicken Schezwan Rice': 170, 'Veg Egg Noodles': 150, 'Chicken Noodles': 180
  },
  burgers: {
    'Veg BBQ Burger': 150, 'Crispy Chicken BBQ Burger': 180, 'Paneer Tandoori Burger': 170,
    'Veg American Burger': 160, 'Chicken American Burger': 175
  },
  sandwiches: {
    'Veg Club Sandwich': 120, 'Chicken Club Sandwich': 160, 'Paneer Sandwich': 155,
    'Tandoori Chicken Sandwich': 170, 'Egg Veg Sandwich': 135, 'Egg Chicken Sandwich': 180
  },
  pasta: {
    'Veg White Sauce Pasta': 210, 'Chicken White Sauce Pasta': 240,
    'Veg Red Sauce Pasta': 215, 'Chicken Red Sauce Pasta': 250
  },
  pizzas: {
    'Margherita Pizza': { 8: 180, 10: 210 }, 'Corn Pizza': { 8: 190, 10: 215 },
    'Mushroom Cheese Pizza': { 8: 200, 10: 225 }, 'Plain Cheese Pizza': { 8: 175, 10: 205 },
    'Paneer Tikka Pizza': { 8: 210, 10: 240 }, 'Chicken Tikka Pizza': { 8: 220, 10: 250 },
    'Double Cheese Pizza': { 8: 220, 10: 260 }, 'BBQ Chicken Pizza': { 8: 225, 10: 265 }
  }
};

document.addEventListener('DOMContentLoaded', function () {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date').value = today;
  document.getElementById('endDate').value = today;
  document.getElementById('expenseDate').value = today;
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('ownerPasswordInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') verifyPassword();
  });
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  if (savedTheme === 'dark') {
    document.getElementById('moon-icon').style.display = 'block';
    document.getElementById('sun-icon').style.display = 'none';
  } else {
    document.getElementById('moon-icon').style.display = 'none';
    document.getElementById('sun-icon').style.display = 'block';
  }
  if (document.getElementById('owner').classList.contains('active') && isAuthenticated) {
    showDashboard();
  }
  if (document.getElementById('owner').classList.contains('active') && !isAuthenticated) {
    document.getElementById('passwordOverlay').style.display = 'flex';
    document.getElementById('ownerPasswordInput').focus();
  }

  // Initialize the new menu grid with LAPS category
  selectCategory('laps', document.querySelector('.cat-tab[data-category="laps"]'));
  renderCart();
});

function verifyPassword() {
  const input = document.getElementById('ownerPasswordInput');
  const error = document.getElementById('passwordError');
  if (input.value === ownerPassword) {
    isAuthenticated = true;
    sessionStorage.setItem('arena53_authenticated', 'true');
    showDashboard();
  } else {
    error.style.display = 'block';
    setTimeout(() => error.style.display = 'none', 3000);
    input.value = ''; // Clear input on failure
    input.focus();
  }
}

function showDashboard() {
  document.getElementById('passwordOverlay').style.display = 'none';
  document.getElementById('dashboardContent').style.display = 'block';
  document.getElementById('exportAllBtn').style.display = 'block';
  document.getElementById('exportSalesBtn').style.display = 'block';
  document.getElementById('loadFromSheetsBtn').style.display = 'block';

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('startDate').value = today;
  document.getElementById('endDate').value = today;

  // Update quick stats immediately
  updateQuickStats();

  setTimeout(() => {
    loadDashboard();
    loadExpenses();
  }, 100);
}

// Date preset buttons
function setDatePreset(preset) {
  const today = new Date();
  let startDate, endDate;

  // Update active button
  document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  switch (preset) {
    case 'today':
      startDate = endDate = today.toISOString().split('T')[0];
      break;
    case 'yesterday':
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = endDate = yesterday.toISOString().split('T')[0];
      break;
    case 'week':
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      startDate = weekStart.toISOString().split('T')[0];
      endDate = today.toISOString().split('T')[0];
      break;
    case 'month':
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate = monthStart.toISOString().split('T')[0];
      endDate = today.toISOString().split('T')[0];
      break;
    case 'all':
      // Find earliest sale date or default to 30 days ago
      if (salesData.length > 0) {
        const dates = salesData.map(s => new Date(s.date));
        const earliest = new Date(Math.min(...dates));
        startDate = earliest.toISOString().split('T')[0];
      } else {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        startDate = thirtyDaysAgo.toISOString().split('T')[0];
      }
      endDate = today.toISOString().split('T')[0];
      break;
  }

  document.getElementById('startDate').value = startDate;
  document.getElementById('endDate').value = endDate;
  loadDashboard();
}

// Update quick stats cards
function updateQuickStats() {
  const today = new Date().toISOString().split('T')[0];

  // Today's sales and orders
  const todaySales = salesData.filter(s => s.date === today);
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.grandTotal, 0);
  const todayOrders = todaySales.length;

  // All-time stats
  const totalRevenue = salesData.reduce((sum, s) => sum + s.grandTotal, 0);
  const totalOrders = salesData.length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Update UI
  document.getElementById('statTodaySales').textContent = `₹${todayRevenue.toFixed(0)}`;
  document.getElementById('statTodayOrders').textContent = todayOrders;
  document.getElementById('statAvgOrder').textContent = `₹${avgOrder.toFixed(0)}`;
  document.getElementById('statTotalRevenue').textContent = `₹${totalRevenue.toFixed(0)}`;
}

// Fixed switchTab: Clears password input and hides error when switching to owner tab
function switchTab(tabName, btnElement) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const tab = document.getElementById(tabName);
  if (tab) tab.classList.add('active');
  if (btnElement) btnElement.classList.add('active');

  if (tabName === 'owner') {
    if (isAuthenticated) {
      showDashboard();
    } else {
      document.getElementById('passwordOverlay').style.display = 'flex';
      document.getElementById('dashboardContent').style.display = 'none';
      const passwordInput = document.getElementById('ownerPasswordInput');
      passwordInput.value = ''; // Clear the password field
      document.getElementById('passwordError').style.display = 'none'; // Hide any error
      passwordInput.focus();
    }
  } else {
    if (isAuthenticated) {
      isAuthenticated = false;
      sessionStorage.removeItem('arena53_authenticated');
    }
  }
}

function updateItemSelect() {
  const category = document.getElementById('categorySelect').value;
  const itemSelect = document.getElementById('itemSelect');
  const sizeDiv = document.getElementById('sizeSelectDiv');
  itemSelect.innerHTML = '<option value="">Select Item</option>';
  sizeDiv.style.display = 'none';
  if (category && menu[category]) {
    const items = menu[category];
    for (let item in items) {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = `${item} - ₹${typeof items[item] === 'object' ? 'Varies by size' : items[item]}`;
      itemSelect.appendChild(option);
    }
    if (category === 'pizzas') sizeDiv.style.display = 'block';
  }
}

function updatePriceAndSize() { }

function addToCart() {
  const category = document.getElementById('categorySelect').value;
  const item = document.getElementById('itemSelect').value;
  const sizeSelect = document.getElementById('sizeSelect');
  const size = (category === 'pizzas') ? sizeSelect.value : '';
  const qty = parseInt(document.getElementById('cartQty').value) || 1;
  if (!category || !item || qty < 1) return alert('Select category, item, and qty');

  const items = menu[category];
  let price, displayName;
  if (typeof items[item] === 'object') {
    price = items[item][parseInt(size)];
    displayName = `${item} ${size}"`;
  } else {
    price = items[item];
    displayName = item;
  }
  cart.push({ category, name: displayName, price, qty });
  updateCartDisplay();
  document.getElementById('categorySelect').value = '';
  document.getElementById('itemSelect').innerHTML = '<option value="">Select Item</option>';
  document.getElementById('sizeSelectDiv').style.display = 'none';
  document.getElementById('cartQty').value = 1;
}

function updateCartDisplay() {
  const tbody = document.getElementById('cartTable');
  let html = '', subtotal = 0;
  cart.forEach((cartItem, index) => {
    const amount = cartItem.price * cartItem.qty;
    subtotal += amount;
    const rate = cartItem.price.toFixed(0);
    html += `
      <tr>
        <td>${cartItem.category.toUpperCase()}</td>
        <td>${cartItem.name}</td>
        <td>₹${rate}</td>
        <td>${cartItem.qty}</td>
        <td>₹${amount.toFixed(2)}</td>
        <td><button class="remove-cart" onclick="removeFromCart(${index})">Remove</button></td>
      </tr>`;
  });
  tbody.innerHTML = html;
  document.getElementById('cartSubtotal').textContent = `Subtotal: ₹${subtotal.toFixed(2)}`;
  document.getElementById('cartSection').style.display = cart.length ? 'block' : 'none';
}

function removeFromCart(i) { cart.splice(i, 1); updateCartDisplay(); renderCart(); updateTableBadges(); }

// ========== PC-FRIENDLY BILLING FUNCTIONS ==========

let currentCategory = 'laps';
let selectedPizzaSize = 8;

// Render the menu grid for a selected category
function selectCategory(category, btnElement) {
  currentCategory = category;

  // Update tab active states
  document.querySelectorAll('.cat-tab').forEach(tab => tab.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  // Show/hide pizza size bar
  const pizzaSizeBar = document.getElementById('pizzaSizeBar');
  if (category === 'pizzas') {
    pizzaSizeBar.style.display = 'flex';
  } else {
    pizzaSizeBar.style.display = 'none';
  }

  // Populate menu grid
  const grid = document.getElementById('menuGrid');
  const items = menu[category];
  let html = '';

  if (items) {
    for (let itemName in items) {
      const itemData = items[itemName];
      let displayPrice;
      let priceAttr;

      if (typeof itemData === 'object') {
        // Pizza with sizes
        displayPrice = `₹${itemData[selectedPizzaSize]}`;
        priceAttr = itemData[selectedPizzaSize];
      } else {
        displayPrice = `₹${itemData}`;
        priceAttr = itemData;
      }

      html += `
        <button class="menu-item-btn" onclick="quickAddToCart('${category}', '${itemName.replace(/'/g, "\\'")}', ${priceAttr})">
          <span class="item-name">${itemName}</span>
          <span class="item-price">${displayPrice}</span>
        </button>`;
    }
  }

  grid.innerHTML = html || '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px;">No items in this category</div>';
}

// Handle pizza size selection
function selectPizzaSize(size, btnElement) {
  selectedPizzaSize = size;

  // Update button states
  document.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  // Refresh menu grid to show updated prices
  selectCategory('pizzas', document.querySelector('.cat-tab[data-category="pizzas"]'));
}

// Quick add to cart (one-click from menu grid)
function quickAddToCart(category, itemName, price) {
  let displayName = itemName;

  // For pizzas, add size to name
  if (category === 'pizzas') {
    displayName = `${itemName} ${selectedPizzaSize}"`;
  }

  // Check if item already exists in cart
  const existingIndex = cart.findIndex(c => c.name === displayName && c.category === category);

  if (existingIndex >= 0) {
    // Increment quantity
    cart[existingIndex].qty += 1;
  } else {
    // Add new item
    cart.push({ category, name: displayName, price, qty: 1 });
  }

  updateCartDisplay();
  renderCart();
  updateTableBadges();

  // Brief visual feedback
  const buttons = document.querySelectorAll('.menu-item-btn');
  buttons.forEach(btn => {
    if (btn.querySelector('.item-name').textContent === itemName) {
      btn.style.transform = 'scale(0.95)';
      btn.style.boxShadow = '0 0 0 3px var(--accent)';
      setTimeout(() => {
        btn.style.transform = '';
        btn.style.boxShadow = '';
      }, 150);
    }
  });
}

// Render the visual cart panel
function renderCart() {
  const container = document.getElementById('cartItems');
  let subtotal = 0;

  if (cart.length === 0) {
    container.innerHTML = '<div class="cart-empty">No items yet<br><span style="font-size: 12px; opacity: 0.7;">Click menu items to add</span></div>';
    document.getElementById('cartSubtotal').textContent = '₹0.00';
    return;
  }

  let html = '';
  cart.forEach((item, index) => {
    const itemTotal = item.price * item.qty;
    subtotal += itemTotal;

    html += `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">₹${item.price} each</div>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn${item.qty === 1 ? ' remove' : ''}" onclick="adjustQty(${index}, -1)">${item.qty === 1 ? '✕' : '−'}</button>
          <span class="qty-display">${item.qty}</span>
          <button class="qty-btn" onclick="adjustQty(${index}, 1)">+</button>
        </div>
        <div class="cart-item-total">₹${itemTotal.toFixed(0)}</div>
      </div>`;
  });

  container.innerHTML = html;
  document.getElementById('cartSubtotal').textContent = `₹${subtotal.toFixed(2)}`;
}

// Adjust cart item quantity
function adjustQty(index, delta) {
  if (cart[index]) {
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
      cart.splice(index, 1);
    }
    updateCartDisplay();
    renderCart();
    updateTableBadges();
  }
}

// ========== MULTI-TABLE FUNCTIONS ==========

// Select a table and load its cart
function selectTable(tableNum, btnElement) {
  activeTable = tableNum;
  cart = tableCarts[activeTable];

  // Update button active states
  document.querySelectorAll('.table-btn').forEach(btn => btn.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  // Update cart header label
  document.getElementById('cartTableLabel').textContent = `Table ${tableNum}`;

  // Render the selected table's cart
  updateCartDisplay();
  renderCart();
  updateTableBadges();
}

// Update all table badges with item counts
function updateTableBadges() {
  for (let t = 1; t <= 6; t++) {
    const badge = document.getElementById(`tableBadge${t}`);
    const btn = document.querySelector(`.table-btn[data-table="${t}"]`);
    const itemCount = tableCarts[t].reduce((sum, item) => sum + item.qty, 0);

    if (itemCount > 0) {
      badge.textContent = itemCount;
      badge.classList.add('show');
      btn.classList.add('has-items');
    } else {
      badge.classList.remove('show');
      btn.classList.remove('has-items');
    }
  }
}

// Clear entire cart for current table
function clearCart() {
  if (cart.length === 0) return;
  if (confirm(`Clear all items from Table ${activeTable}?`)) {
    tableCarts[activeTable] = [];
    cart = tableCarts[activeTable];
    updateCartDisplay();
    renderCart();
    updateTableBadges();
  }
}

function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const key = `inv_${year}`;
  let count = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, count);
  return `INV-${year}-${String(count).padStart(3, '0')}`;
}

function toDDMMYYYY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function updateCategoryStorage(sale, isAdd = true) {
  if (!categorySalesData[sale.date]) categorySalesData[sale.date] = {};
  const operation = isAdd ? 1 : -1;
  sale.items.forEach(item => {
    const cat = item.category;
    if (!categorySalesData[sale.date][cat]) categorySalesData[sale.date][cat] = { items: {}, revenue: {} };
    if (!categorySalesData[sale.date][cat].items[item.name]) {
      categorySalesData[sale.date][cat].items[item.name] = 0;
      categorySalesData[sale.date][cat].revenue[item.name] = 0;
    }
    const qtySold = item.qty * operation;
    const revenue = (item.price * item.qty) * (1 + gstRates[cat]) * operation;
    categorySalesData[sale.date][cat].items[item.name] += qtySold;
    categorySalesData[sale.date][cat].revenue[item.name] += revenue;
    if (categorySalesData[sale.date][cat].items[item.name] <= 0) {
      delete categorySalesData[sale.date][cat].items[item.name];
      delete categorySalesData[sale.date][cat].revenue[item.name];
    }
  });
  Object.keys(categorySalesData[sale.date]).forEach(cat => {
    if (Object.keys(categorySalesData[sale.date][cat].items).length === 0) delete categorySalesData[sale.date][cat];
  });
  if (Object.keys(categorySalesData[sale.date]).length === 0) delete categorySalesData[sale.date];
  localStorage.setItem('arena53_category_sales', JSON.stringify(categorySalesData));
}

async function saveSale(sale, button = null) {
  salesData.unshift(sale);
  localStorage.setItem('arena53_sales', JSON.stringify(salesData));
  updateCategoryStorage(sale, true);

  const orderTime = new Date(sale.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const groupedItems = {};
  sale.items.forEach(item => {
    const cat = item.category;
    if (!groupedItems[cat]) groupedItems[cat] = [];
    groupedItems[cat].push(`${item.name} x${item.qty}`);
  });
  const itemDisplay = Object.entries(groupedItems).map(([cat, items]) => `${cat.toUpperCase()}: ${items.join(', ')}`).join(' | ');
  let saleDataForGAS = [sale.invoice, toDDMMYYYY(sale.date), orderTime, sale.customer, itemDisplay, sale.grandTotal.toFixed(2), sale.payment];
  while (saleDataForGAS.length < 7) saleDataForGAS.push('');
  saleDataForGAS = saleDataForGAS.slice(0, 7).map(val => String(val));
  const addSaleSuccess = await syncToSheets('addSale', { saleData: saleDataForGAS, saleItems: sale.items }, button);

  if (addSaleSuccess) {
    salesData = salesData.map(s => ({ ...s, items: s.items || [] }));
    await syncToSheets('syncAll', { allData: { sales: salesData, expenses: expensesData } }, button);
  }
  console.log('Sale saved to dashboard and Sheets.');
}

async function removeSale(index, button = null) {
  if (!confirm('Are you sure you want to remove this sale? This will also update analytics and Google Sheets.')) {
    if (button) button.disabled = false;
    return;
  }
  const sale = salesData[index];
  salesData.splice(index, 1);
  localStorage.setItem('arena53_sales', JSON.stringify(salesData));
  updateCategoryStorage(sale, false);
  const syncSuccess = await syncToSheets('syncAll', { allData: { sales: salesData, expenses: expensesData } }, button);
  if (!syncSuccess) {
    alert('Local removal done, but Sheets sync failed. Check console and redeploy GAS.');
  }
  loadDashboard();
  console.log('Sale removed from local data, analytics, and Google Sheets.');
  if (button) button.disabled = false;
}

// Updated generateBill: Group GST by rate (consolidates duplicates), no category names, print button fixes
function generateBill() {
  if (!cart.length) return alert('Add items to cart first');
  const customer = document.getElementById('customerName').value.trim() || 'Walk-in';
  const paymentMethod = document.getElementById('paymentSelect').value;
  const dateISO = document.getElementById('date').value;

  let subtotal = 0, itemsHtml = '', gstHtml = '';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const tempItems = [...cart];

  // Per-category breakdown for storage/dashboard (unchanged)
  const gstBreakdownByCat = {}; // For tempSaleData

  // New: Aggregate GST by rate for clean receipt (consolidates across categories)
  const gstByRate = {}; // e.g., { '0.025': { cgst: 0, sgst: 0 } } for half-rate

  cart.forEach((c) => {
    const amt = c.price * c.qty;
    const rate = c.price.toFixed(0);
    subtotal += amt;
    const fullRate = gstRates[c.category];
    const halfRate = fullRate / 2;
    const cgst = amt * halfRate;
    const sgst = amt * halfRate;
    const rateKey = halfRate.toFixed(3); // e.g., '0.025' for 2.5%

    // For storage (per category)
    if (!gstBreakdownByCat[c.category]) {
      gstBreakdownByCat[c.category] = { subtotal: 0, cgst: 0, sgst: 0 };
    }
    gstBreakdownByCat[c.category].subtotal += amt;
    gstBreakdownByCat[c.category].cgst += cgst;
    gstBreakdownByCat[c.category].sgst += sgst;

    // For receipt: Aggregate by rate
    if (!gstByRate[rateKey]) {
      gstByRate[rateKey] = { cgst: 0, sgst: 0 };
    }
    gstByRate[rateKey].cgst += cgst;
    gstByRate[rateKey].sgst += sgst;

    itemsHtml += `<div class="item-line">
      <span class="item-name">${c.name}</span>
      <span class="item-qty">${c.qty}</span>
      <span class="item-rate">₹${rate}</span>
      <span class="item-amount">₹${amt.toFixed(2)}</span>
    </div>`;
  });

  // Generate GST lines by rate (one pair per unique rate, aggregated)
  Object.entries(gstByRate).forEach(([halfRateStr, taxes]) => {
    if (taxes.cgst > 0 || taxes.sgst > 0) {
      const halfPercent = (parseFloat(halfRateStr) * 100).toFixed(1);
      const cgstLabel = `CGST @${halfPercent}%`;
      const sgstLabel = `SGST @${halfPercent}%`;
      const cgstDots = '.'.repeat(Math.max(0, 30 - cgstLabel.length));
      const sgstDots = '.'.repeat(Math.max(0, 30 - sgstLabel.length));
      gstHtml += `<div class="total-line gst-line">
        <span class="label">${cgstLabel}</span>
        <span class="dots">${cgstDots}</span>
        <span class="amount">₹${taxes.cgst.toFixed(2)}</span>
      </div>
      <div class="total-line gst-line">
        <span class="label">${sgstLabel}</span>
        <span class="dots">${sgstDots}</span>
        <span class="amount">₹${taxes.sgst.toFixed(2)}</span>
      </div>`;
    }
  });

  const grandTotal = subtotal + Object.values(gstByRate).reduce((sum, t) => sum + t.cgst + t.sgst, 0);
  const totalCgst = Object.values(gstBreakdownByCat).reduce((sum, t) => sum + t.cgst, 0);
  const totalSgst = Object.values(gstBreakdownByCat).reduce((sum, t) => sum + t.sgst, 0);

  const inv = getNextInvoiceNumber();

  document.getElementById('invNum').textContent = inv;
  document.getElementById('invDate').textContent = toDDMMYYYY(dateISO);
  document.getElementById('invTime').textContent = timeStr;
  document.getElementById('invCustomer').textContent = customer;
  const itemsContainer = document.querySelector('#itemsList');
  const existingItems = itemsContainer.querySelectorAll('.item-line');
  existingItems.forEach(el => el.remove());
  itemsContainer.insertAdjacentHTML('beforeend', itemsHtml);
  document.getElementById('subtotal').textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById('gstRows').innerHTML = gstHtml;
  document.getElementById('grandTotal').textContent = `₹${grandTotal.toFixed(2)}`;
  document.getElementById('paymentMethod').textContent = paymentMethod;

  document.getElementById('invoiceDiv').style.display = 'block';
  const printButton = document.getElementById('printButton');
  printButton.style.display = 'block'; // Force show (block for full width in container)
  printButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); // Auto-scroll to button for visibility

  tempSaleData = {
    invoice: inv,
    date: dateISO,
    timestamp: now.toISOString(),
    customer: customer,
    payment: paymentMethod,
    items: tempItems,
    subtotal: subtotal,
    cgst: totalCgst,
    sgst: totalSgst,
    grandTotal: grandTotal
  };

  cart = [];
  updateCartDisplay();
}

// Updated printBill: Disable and change text during print
function printBill() {
  const printButton = document.getElementById('printButton');
  printButton.disabled = true; // Disable during print to prevent double-click
  printButton.textContent = 'Printing...';
  window.print();
}

// Updated afterprint: Save, then hide/reset UI for clean next bill
window.addEventListener('afterprint', async function () {
  if (tempSaleData) {
    const printButton = document.getElementById('printButton');
    await saveSale(tempSaleData, printButton); // Pass button for disabling during save
    tempSaleData = null;
    console.log('Bill printed and saved to dashboard/Sheets.');
  }
  // Reset UI: Hide invoice and button for clean next bill
  document.getElementById('invoiceDiv').style.display = 'none';
  const printButton = document.getElementById('printButton');
  printButton.style.display = 'none';
  printButton.disabled = false;
  printButton.textContent = 'Print Bill'; // Restore text
});

// Updated reprintBill: Group GST by rate (consolidates duplicates)
function reprintBill(saleIndex, button = null) {
  const sale = salesData[saleIndex];
  if (!sale) return alert('Sale not found');
  let subtotal = sale.subtotal || sale.items.reduce((s, i) => s + (i.price * i.qty), 0);
  let itemsHtml = '', gstHtml = '';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

  // Per-category for storage (unchanged)
  const gstBreakdownByCat = {};

  // Aggregate by rate for receipt
  const gstByRate = {};

  sale.items.forEach((item) => {
    const amt = item.price * item.qty;
    const rate = item.price.toFixed(0);
    const fullRate = gstRates[item.category];
    const halfRate = fullRate / 2;
    const cgst = amt * halfRate;
    const sgst = amt * halfRate;
    const rateKey = halfRate.toFixed(3);

    // For storage
    if (!gstBreakdownByCat[item.category]) {
      gstBreakdownByCat[item.category] = { subtotal: 0, cgst: 0, sgst: 0 };
    }
    gstBreakdownByCat[item.category].subtotal += amt;
    gstBreakdownByCat[item.category].cgst += cgst;
    gstBreakdownByCat[item.category].sgst += sgst;

    // For receipt: Aggregate by rate
    if (!gstByRate[rateKey]) {
      gstByRate[rateKey] = { cgst: 0, sgst: 0 };
    }
    gstByRate[rateKey].cgst += cgst;
    gstByRate[rateKey].sgst += sgst;

    itemsHtml += `<div class="item-line">
      <span class="item-name">${item.name}</span>
      <span class="item-qty">${item.qty}</span>
      <span class="item-rate">₹${rate}</span>
      <span class="item-amount">₹${amt.toFixed(2)}</span>
    </div>`;
  });

  // Generate GST lines by rate (one pair per unique rate)
  Object.entries(gstByRate).forEach(([halfRateStr, taxes]) => {
    if (taxes.cgst > 0 || taxes.sgst > 0) {
      const halfPercent = (parseFloat(halfRateStr) * 100).toFixed(1);
      const cgstLabel = `CGST @${halfPercent}%`;
      const sgstLabel = `SGST @${halfPercent}%`;
      const cgstDots = '.'.repeat(Math.max(0, 30 - cgstLabel.length));
      const sgstDots = '.'.repeat(Math.max(0, 30 - sgstLabel.length));
      gstHtml += `<div class="total-line gst-line">
        <span class="label">${cgstLabel}</span>
        <span class="dots">${cgstDots}</span>
        <span class="amount">₹${taxes.cgst.toFixed(2)}</span>
      </div>
      <div class="total-line gst-line">
        <span class="label">${sgstLabel}</span>
        <span class="dots">${sgstDots}</span>
        <span class="amount">₹${taxes.sgst.toFixed(2)}</span>
      </div>`;
    }
  });

  const grandTotal = subtotal + Object.values(gstByRate).reduce((sum, t) => sum + t.cgst + t.sgst, 0);

  document.getElementById('invNum').textContent = sale.invoice;
  document.getElementById('invDate').textContent = toDDMMYYYY(sale.date);
  document.getElementById('invTime').textContent = timeStr;
  document.getElementById('invCustomer').textContent = sale.customer;
  const itemsContainer = document.querySelector('#itemsList');
  const existingItems = itemsContainer.querySelectorAll('.item-line');
  existingItems.forEach(el => el.remove());
  itemsContainer.insertAdjacentHTML('beforeend', itemsHtml);
  document.getElementById('subtotal').textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById('gstRows').innerHTML = gstHtml;
  document.getElementById('grandTotal').textContent = `₹${(sale.grandTotal || grandTotal).toFixed(2)}`;
  document.getElementById('paymentMethod').textContent = sale.payment || 'Cash';

  document.getElementById('invoiceDiv').style.display = 'block';
  if (button) button.disabled = true;
  setTimeout(() => {
    window.print();
    if (button) button.disabled = false;
  }, 100);
}

async function loadDashboard() {
  const button = document.getElementById('loadDashboardBtn');
  prepareButtonForSync(button, 'Load Data');
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const filterCat = document.getElementById('filterCategory').value;
  const filteredSales = salesData.filter(sale => {
    const saleDate = new Date(sale.date);
    const start = new Date(startDate);
    const end = new Date(endDate + 'T23:59:59');
    const dateOk = saleDate >= start && saleDate <= end;
    // Handle items filter - check both items array and itemsString
    const items = sale.items || [];
    const catOk = !filterCat || items.some(item => item.category === filterCat) ||
      (sale.itemsString && sale.itemsString.toLowerCase().includes(filterCat.toLowerCase()));
    return dateOk && catOk;
  });

  if (!filteredSales.length) {
    document.getElementById('dashboardMetrics').innerHTML = '<p>No sales data for selected dates/category.</p>';
    document.getElementById('categoryTable').innerHTML = '';
    document.getElementById('salesTable').innerHTML = '';
    document.getElementById('topProductsDiv').innerHTML = '<p>No data available.</p>';
    await syncToSheets('syncAll', { allData: { sales: salesData, expenses: expensesData } }, button);
    return;
  }

  let totalItems = 0;
  let totalRevenue = 0;
  let totalBills = filteredSales.length;

  filteredSales.forEach(sale => {
    const items = sale.items || [];
    items.forEach(item => totalItems += (item.qty || 0));
    totalRevenue += sale.grandTotal || 0;
  });

  document.getElementById('dashboardMetrics').innerHTML = `
    <div class="metric-card">
      <div>Total Items Sold</div>
      <div class="metric-value">${totalItems}</div>
    </div>
    <div class="metric-card">
      <div>Total Bills</div>
      <div class="metric-value">${totalBills}</div>
    </div>
    <div class="metric-card">
      <div>Total Revenue</div>
      <div class="metric-value">₹${totalRevenue.toFixed(2)}</div>
    </div>
  `;

  const categoryStats = {};
  Object.keys(gstRates).forEach(cat => categoryStats[cat] = { items: 0, revenue: 0 });

  filteredSales.forEach(sale => {
    const items = sale.items || [];
    const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);

    items.forEach(item => {
      const cat = item.category;
      if (cat && categoryStats[cat]) {
        categoryStats[cat].items += item.qty || 0;

        // Use item.price if available, otherwise distribute grandTotal proportionally
        if (item.price && item.price > 0) {
          categoryStats[cat].revenue += ((item.price || 0) * (item.qty || 0)) * (1 + (gstRates[cat] || 0));
        } else if (totalQty > 0 && sale.grandTotal > 0) {
          // Distribute grandTotal based on item quantity ratio
          const itemShare = ((item.qty || 0) / totalQty) * (sale.grandTotal || 0);
          categoryStats[cat].revenue += itemShare;
        }
      }
    });
  });

  let catHtml = '';
  for (let cat in categoryStats) {
    if (categoryStats[cat].items > 0) {
      catHtml += `<tr>
        <td>${cat.replace('-', ' ').toUpperCase()}</td>
        <td>${categoryStats[cat].items}</td>
        <td>₹${categoryStats[cat].revenue.toFixed(2)}</td>
      </tr>`;
    }
  }
  document.getElementById('categoryTable').innerHTML = catHtml;

  let topProductsHtml = '';
  Object.keys(gstRates).forEach(cat => {
    const productStats = {};
    filteredSales.forEach(sale => {
      const items = sale.items || [];
      const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);

      items.forEach(item => {
        if (item.category === cat) {
          if (!productStats[item.name]) productStats[item.name] = { qty: 0, revenue: 0 };
          productStats[item.name].qty += (item.qty || 0);

          // Use item.price if available, otherwise distribute grandTotal proportionally
          if (item.price && item.price > 0) {
            productStats[item.name].revenue += ((item.price || 0) * (item.qty || 0)) * (1 + (gstRates[cat] || 0));
          } else if (totalQty > 0 && sale.grandTotal > 0) {
            const itemShare = ((item.qty || 0) / totalQty) * (sale.grandTotal || 0);
            productStats[item.name].revenue += itemShare;
          }
        }
      });
    });

    const topProducts = Object.entries(productStats)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .slice(0, 3)
      .map(([name, stats]) => `<tr><td>${name}</td><td>${stats.qty}</td><td>₹${stats.revenue.toFixed(2)}</td></tr>`);

    if (topProducts.length > 0) {
      topProductsHtml += `
        <div class="category-group">
          <div class="category-header">${cat.replace('-', ' ').toUpperCase()}</div>
          <table class="dashboard-table">
            <thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue (₹)</th></tr></thead>
            <tbody>${topProducts.join('')}</tbody>
          </table>
        </div>`;
    }
  });
  document.getElementById('topProductsDiv').innerHTML = topProductsHtml || '<p>No top products data.</p>';

  let salesHtml = '';
  filteredSales.forEach((sale) => {
    // Get original index in salesData for actions
    const originalIndex = salesData.indexOf(sale);
    const items = sale.items || [];
    let itemDisplay = '';

    if (items.length > 0) {
      const groupedItems = {};
      items.forEach(item => {
        const cat = item.category || 'OTHER';
        if (!groupedItems[cat]) groupedItems[cat] = [];
        groupedItems[cat].push(`${item.name} x${item.qty}`);
      });
      itemDisplay = Object.entries(groupedItems).map(([cat, itms]) => `${cat.toUpperCase()}: ${itms.join(', ')}`).join(' | ');
    } else if (sale.itemsString) {
      // Use itemsString from sheets if items array is empty
      itemDisplay = sale.itemsString;
    }

    const orderTime = sale.time || (sale.timestamp ? new Date(sale.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A');
    salesHtml += `<tr>
      <td>${sale.invoice}</td>
      <td>${toDDMMYYYY(sale.date)}</td>
      <td>${orderTime}</td>
      <td>${sale.customer}</td>
      <td>${itemDisplay}</td>
      <td>₹${sale.grandTotal.toFixed(2)}</td>
      <td>
        <button class="reprint-btn" onclick="reprintBill(${originalIndex}, this)">Print Bill</button>
        <button class="remove-btn" style="background: #dc3545;" onclick="removeSale(${originalIndex}, this)">Remove</button>
      </td>
    </tr>`;
  });
  document.getElementById('salesTable').innerHTML = salesHtml;

  await syncToSheets('syncAll', { allData: { sales: salesData, expenses: expensesData } }, button);
}

async function saveExpense() {
  const button = document.getElementById('addExpenseBtn');
  prepareButtonForSync(button, button.textContent);
  const date = document.getElementById('expenseDate').value;
  const name = document.getElementById('expenseName').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
  if (!date || !name || amount <= 0) {
    button.disabled = false;
    return alert('Please enter a valid date, expense name, and amount.');
  }

  let syncSuccess;
  if (editingExpenseIndex !== null) {
    expensesData[editingExpenseIndex] = { date, name, amount };
    localStorage.setItem('arena53_expenses', JSON.stringify(expensesData));
    syncSuccess = await syncToSheets('syncAll', { allData: { sales: salesData, expenses: expensesData } }, button);
    if (!syncSuccess) {
      alert('Local update done, but Sheets failed. Check GAS.');
    }
    editingExpenseIndex = null;
    button.textContent = 'Add Expense';
    document.getElementById('cancelEditBtn').style.display = 'none';
    console.log('Expense updated in local data and Google Sheets.');
  } else {
    const expense = { date, name, amount };
    expensesData.unshift(expense);
    localStorage.setItem('arena53_expenses', JSON.stringify(expensesData));
    syncSuccess = await syncToSheets('addExpense', { date: toDDMMYYYY(date), name, amount }, button);
    if (syncSuccess) {
      await syncToSheets('syncAll', { allData: { sales: salesData, expenses: expensesData } }, button);
    }
    if (!syncSuccess) {
      alert('Local add done, but Sheets failed. Check GAS.');
    }
    console.log('Expense added to local data and Google Sheets.');
  }

  document.getElementById('expenseName').value = '';
  document.getElementById('expenseAmount').value = '';
  const currentEnd = document.getElementById('endDate').value;
  if (new Date(date) > new Date(currentEnd)) {
    document.getElementById('endDate').value = date;
  }
  loadExpenses();
  loadDashboard();
}

function editExpense(index, button = null) {
  const expense = expensesData[index];
  document.getElementById('expenseDate').value = expense.date;
  document.getElementById('expenseName').value = expense.name;
  document.getElementById('expenseAmount').value = expense.amount;
  editingExpenseIndex = index;
  document.getElementById('addExpenseBtn').textContent = 'Update Expense';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
  if (button) button.disabled = false;
}

function cancelEdit() {
  editingExpenseIndex = null;
  document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('expenseName').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('addExpenseBtn').textContent = 'Add Expense';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

async function removeExpense(index, button = null) {
  if (!confirm('Are you sure you want to remove this expense? This will update Google Sheets too.')) {
    if (button) button.disabled = false;
    return;
  }
  expensesData.splice(index, 1);
  localStorage.setItem('arena53_expenses', JSON.stringify(expensesData));
  const syncSuccess = await syncToSheets('syncAll', { allData: { sales: salesData, expenses: expensesData } }, button);
  if (!syncSuccess) {
    alert('Local removal done, but Sheets sync failed. Check console and redeploy GAS.');
  }
  loadExpenses();
  console.log('Expense removed from local data and Google Sheets.');
  if (button) button.disabled = false;
}

function loadExpenses(showAll = false) {
  const button = document.getElementById(showAll ? 'loadAllExpensesBtn' : null);
  if (button) prepareButtonForSync(button, 'Load All Expenses');
  let filteredExpenses = expensesData;
  let visibleIndices = [];
  if (!showAll) {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate + 'T23:59:59') : null;
    if (start && end) {
      visibleIndices = expensesData.map((exp, idx) => {
        const expDate = new Date(exp.date);
        if (expDate >= start && expDate <= end) return idx;
        return -1;
      }).filter(idx => idx !== -1);
      filteredExpenses = visibleIndices.map(idx => expensesData[idx]);
    }
  } else {
    visibleIndices = expensesData.map((_, idx) => idx);
  }

  const tbody = document.getElementById('expensesTableBody');
  let html = '', total = 0;
  filteredExpenses.forEach((exp, filteredIdx) => {
    const fullIdx = visibleIndices[filteredIdx];
    total += exp.amount;
    html += `<tr>
      <td>${toDDMMYYYY(exp.date)}</td>
      <td>${exp.name}</td>
      <td>₹${exp.amount.toFixed(2)}</td>
      <td>
        <button class="reprint-btn" onclick="editExpense(${fullIdx}, this)" style="margin-right: 5px; padding: 4px 8px; font-size: 11px;">Edit</button>
        <button class="remove-btn" style="background: #dc3545; padding: 4px 8px; font-size: 11px;" onclick="removeExpense(${fullIdx}, this)">Remove</button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = filteredExpenses.length > 0 ? html : '<tr><td colspan="4">No expenses found.</td></tr>';

  const table = document.getElementById('expensesTable');
  const totalDiv = document.getElementById('expenseTotal');
  if (filteredExpenses.length > 0) {
    table.style.display = 'table';
    totalDiv.style.display = 'block';
    totalDiv.textContent = `Total Expenses: ₹${total.toFixed(2)}`;
  } else {
    table.style.display = 'none';
    totalDiv.style.display = 'none';
  }
  if (button) button.disabled = false;
}

function loadAllExpenses() {
  loadExpenses(true);
}

function exportExpensesCSV() {
  if (expensesData.length === 0) return console.warn('No expenses data to export.');
  let csv = 'Date,Expense Name,Amount\n';
  expensesData.forEach(exp => {
    csv += `"${toDDMMYYYY(exp.date)}","${exp.name}","${exp.amount}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arena53_expenses_all_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  console.log('Expenses data exported successfully!');
}

function exportSalesCSV() {
  if (salesData.length === 0) return console.warn('No sales data to export.');
  let csv = 'Invoice,Date,Time,Customer,Items by Category,Grand Total (₹),Payment Mode\n';
  salesData.forEach(sale => {
    const orderTime = sale.timestamp ? new Date(sale.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A';
    const groupedItems = {};
    sale.items.forEach(item => {
      const cat = item.category;
      if (!groupedItems[cat]) groupedItems[cat] = [];
      groupedItems[cat].push(`${item.name} x${item.qty}`);
    });
    const itemDisplay = Object.entries(groupedItems).map(([cat, items]) => `${cat.toUpperCase()}: ${items.join(', ')}`).join(' | ');
    csv += `"${sale.invoice}","${toDDMMYYYY(sale.date)}","${orderTime}","${sale.customer}","${itemDisplay}","${sale.grandTotal}","${sale.payment}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arena53_sales_all_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  console.log('Sales data exported successfully!');
}

function exportCategoryCSV() {
  if (salesData.length === 0) return console.warn('No sales data for category summary.');
  const categoryStats = {};
  Object.keys(gstRates).forEach(cat => categoryStats[cat] = { items: 0, revenue: 0 });
  salesData.forEach(sale => {
    sale.items.forEach(item => {
      const cat = item.category;
      categoryStats[cat].items += item.qty;
      categoryStats[cat].revenue += (item.price * item.qty) * (1 + gstRates[cat]);
    });
  });
  let csv = 'Category,Items Sold,Revenue (₹)\n';
  for (let cat in categoryStats) {
    if (categoryStats[cat].items > 0) {
      csv += `"${cat.replace('-', ' ').toUpperCase()}",${categoryStats[cat].items},"${categoryStats[cat].revenue.toFixed(2)}"\n`;
    }
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arena53_category_summary_all_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  console.log('Category summary exported.');
}

function exportTopProductsCSV() {
  if (salesData.length === 0) return console.warn('No sales data for top products summary.');
  let csv = 'Category,Product,Qty Sold,Revenue (₹)\n';
  Object.keys(gstRates).forEach(cat => {
    const productStats = {};
    salesData.forEach(sale => {
      sale.items.forEach(item => {
        if (item.category === cat) {
          if (!productStats[item.name]) productStats[item.name] = { qty: 0, revenue: 0 };
          productStats[item.name].qty += item.qty;
          productStats[item.name].revenue += (item.price * item.qty) * (1 + gstRates[cat]);
        }
      });
    });
    const topProducts = Object.entries(productStats)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .slice(0, 3);
    topProducts.forEach(([name, stats]) => {
      csv += `"${cat.replace('-', ' ').toUpperCase()}","${name}",${stats.qty},"${stats.revenue.toFixed(2)}"\n`;
    });
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arena53_top_products_all_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  console.log('Top products exported.');
}

async function exportAllReports() {
  if (salesData.length === 0 && expensesData.length === 0) return console.warn('No data available for export. Generate some sales or expenses first.');
  setTimeout(() => exportSalesCSV(), 100);
  setTimeout(() => exportExpensesCSV(), 300);
  setTimeout(() => exportCategoryCSV(), 500);
  setTimeout(() => exportTopProductsCSV(), 700);
  await syncToSheets('syncAll', { allData: { sales: salesData, expenses: expensesData } });
  console.log('All reports exported! Check your downloads for 4 CSV files: Sales, Expenses, Category Summary, and Top Products. Synced to Sheets too.');
}

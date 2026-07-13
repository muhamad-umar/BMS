// Main Entry Module
import * as mod_init from './modules/init.js';
Object.assign(window, mod_init);
import * as mod_core from './modules/core.js';
Object.assign(window, mod_core);
import * as mod_api from './modules/api.js';
Object.assign(window, mod_api);
import * as mod_forms from './modules/forms.js';
Object.assign(window, mod_forms);
import * as mod_customers from './modules/customers.js';
Object.assign(window, mod_customers);
import * as mod_inventory from './modules/inventory.js';
Object.assign(window, mod_inventory);
import * as mod_sales from './modules/sales.js';
Object.assign(window, mod_sales);
import * as mod_movements from './modules/movements.js';
Object.assign(window, mod_movements);
import * as mod_expenses from './modules/expenses.js';
Object.assign(window, mod_expenses);
import * as mod_profit from './modules/profit.js';
Object.assign(window, mod_profit);
import { initMobile } from './modules/mobile.js';
import { initSettings } from './modules/settings.js';
document.addEventListener('DOMContentLoaded', () => {
    initMobile();
    initSettings();
});

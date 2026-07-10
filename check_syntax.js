const fs = require('fs');
const content = fs.readFileSync('src/js/modules/inventory.js', 'utf8');

try {
    new Function(content);
    console.log("Syntax is OK according to new Function");
} catch(e) {
    console.error("Syntax Error:", e.message);
}

// This script will fix the test-api.js file by replacing all instances of originalResponse with fullResponse

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'test-api.js');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Replace all instances of originalResponse with fullResponse
content = content.replace(/originalResponse/g, 'fullResponse');

// Write the updated content back to the file
fs.writeFileSync(filePath, content);

console.log('Successfully updated test-api.js to use fullResponse instead of originalResponse');

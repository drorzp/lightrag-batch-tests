const fs = require('fs');
const path = require('path');

// Read the CSV file
const csvFilePath = path.join(__dirname, 'test-results.csv');
const outputFilePath = path.join(__dirname, 'test-results-deduped.csv');

// Read the file content
const fileContent = fs.readFileSync(csvFilePath, 'utf8');
const lines = fileContent.split('\n');

// Track unique IDs
const uniqueIds = new Set();
const uniqueLines = [];

// Process each line
lines.forEach(line => {
  if (!line.trim()) {
    // Keep empty lines
    uniqueLines.push(line);
    return;
  }
  
  const columns = line.split(',');
  if (columns.length < 1) {
    // Keep lines that don't have enough columns
    uniqueLines.push(line);
    return;
  }
  
  const id = columns[0];
  
  // If we haven't seen this ID before, add it to our results
  if (!uniqueIds.has(id)) {
    uniqueIds.add(id);
    uniqueLines.push(line);
  }
});

// Write the deduplicated content to a new file
fs.writeFileSync(outputFilePath, uniqueLines.join('\n'));

console.log(`Original file had ${lines.length} lines`);
console.log(`Deduplicated file has ${uniqueLines.length} lines`);
console.log(`Removed ${lines.length - uniqueLines.length} duplicate entries`);
console.log(`Deduplicated file saved to: ${outputFilePath}`);

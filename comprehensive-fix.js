const fs = require('fs');
const path = require('path');

// Path to the test-api.js file
const testApiPath = path.join(__dirname, 'test-api.js');

// Read the current content of the file
const content = fs.readFileSync(testApiPath, 'utf8');

// Check if the medium query test section is missing
const hasMediumQueryTest = content.includes('Testing medium query');

// Define the medium query test section to insert if it's missing
const mediumQueryTestSection = `
        // Add a small delay between requests to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Test medium query with timeout handling
        console.log(\`Testing medium query for row \${i+1}...\`);
        console.log(\`Question: "\${row.medium_query}"\`);
        const mediumResponse = await makeApiCall(row.medium_query);
        
        if (mediumResponse.error) {
          console.log(\`Medium query error: \${mediumResponse.error}\`);
          error += \`Medium query error: \${mediumResponse.error}; \`;
        } else {
          // Check if file_name is in the full response (original method)
          const originalCheck = mediumResponse.fullResponse && 
                                mediumResponse.fullResponse.response && 
                                mediumResponse.fullResponse.response.includes(file_name);
          
          // Check if file_name is in the top 3 ranked chunks
          let rerankCheck = false;
          if (mediumResponse.rankedChunks && mediumResponse.rankedChunks.length > 0) {
            // Get the top 3 chunks (or fewer if less than 3 are available)
            const topChunks = mediumResponse.rankedChunks.slice(0, 3);
            console.log('Top 3 ranked chunks for medium query:', 
              topChunks.map(c => \`\${c.file_path} (score: \${c.relevance_score})\`).join(', '));
            
            // Check if any of the top chunks have the matching file path
            rerankCheck = topChunks.some(chunk => 
              chunk.file_path && chunk.file_path.includes(file_name));
          }
          
          // Pass if either check is true
          mediumPassed = originalCheck || rerankCheck;
          console.log(\`Medium query: \${mediumPassed ? 'PASSED' : 'FAILED'} (original: \${originalCheck}, rerank: \${rerankCheck})\`);
        }
        
        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
`;

// Find the position to insert the medium query test section if it's missing
let updatedContent = content;
if (!hasMediumQueryTest) {
  // Look for the pattern that comes right before where the medium query test should be
  const easyQueryEndPattern = "// Add a small delay between requests to avoid overwhelming the API\n        await new Promise(resolve => setTimeout(resolve, 1000));";
  const hardQueryStartPattern = "// Test hard query with timeout handling";
  
  // If we don't find the hard query pattern, look for another pattern
  const alternativePattern = "console.log(`Question: \"${row.hard_query}\"`);";
  
  let insertPosition;
  
  if (content.includes(easyQueryEndPattern) && content.includes(hardQueryStartPattern)) {
    insertPosition = content.indexOf(easyQueryEndPattern) + easyQueryEndPattern.length;
  } else if (content.includes(easyQueryEndPattern) && content.includes(alternativePattern)) {
    insertPosition = content.indexOf(easyQueryEndPattern) + easyQueryEndPattern.length;
  } else {
    console.error('Could not find the appropriate position to insert the medium query test section');
    process.exit(1);
  }
  
  // Insert the medium query test section
  updatedContent = 
    content.substring(0, insertPosition) + 
    mediumQueryTestSection + 
    content.substring(insertPosition);
  
  console.log('Inserted the missing medium query test section');
}

// Replace all instances of originalResponse with fullResponse
updatedContent = updatedContent.replace(/originalResponse/g, 'fullResponse');
console.log('Replaced all instances of originalResponse with fullResponse');

// Write the updated content back to the file
fs.writeFileSync(testApiPath, updatedContent);
console.log('Successfully updated test-api.js');

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const axios = require('axios');

// Path to input and output files
const inputCsvPath = path.join(__dirname, 'test-data', 'lightrag-valid-test-data.csv');
const outputCsvPath = path.join(__dirname, 'test-results.csv');

// Configuration
const START_FROM_ROW = 6; // Start from the 7th row (0-indexed)

// Create CSV writer
const csvWriter = createCsvWriter({
  path: outputCsvPath,
  header: [
    { id: 'id', title: 'id' },
    { id: 'file_name', title: 'file_name' },
    { id: 'decision_type', title: 'decision_type' },
    { id: 'keywordid', title: 'keywordid' },
    { id: 'url_pdf', title: 'url_pdf' },
    { id: 'easy_query_passed', title: 'easy_query_passed' },
    { id: 'medium_query_passed', title: 'medium_query_passed' },
    { id: 'hard_query_passed', title: 'hard_query_passed' },
    { id: 'all_passed', title: 'all_passed' },
    { id: 'error', title: 'error' }
  ]
});

// Function to make API call
async function makeApiCall(query) {
  try {
    // Set a timeout for the API call (10 seconds)
    const response = await axios.post('http://localhost:9621/query', {
      query: query,
      mode: 'mix',
      only_need_context: false,
      only_need_prompt: false,
      response_type: 'string',
      top_k: 60,
      max_token_for_text_unit: 4000,
      max_token_for_global_context: 4000,
      max_token_for_local_context: 8000,
      history_turns: 3,
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
      // Timeout removed as requested
    });
    return response.data;
  } catch (error) {
    console.error('API call error:', error.message);
    // Return a structured error object
    return { 
      error: error.message,
      response: null 
    };
  }
}

// Main function to process CSV and make API calls
async function processCSV() {
  const results = [];
  let count = 0;
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputCsvPath)
      .pipe(csv())
      .on('data', async (row) => {
        // Process only the first 100 rows
        if (count < 100) {
          results.push(row);
          count++;
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Process each row and check results
async function runTests() {
  try {
    console.log('Reading CSV file...');
    const rows = await processCSV();
    console.log(`Processing ${rows.length} rows starting from row ${START_FROM_ROW + 1}...`);
    
    const testResults = [];
    
    // Process each row sequentially to avoid overwhelming the API
    for (let i = START_FROM_ROW; i < rows.length; i++) {
      const row = rows[i];
      console.log(`Processing row ${i+1}/${rows.length}: ${row.id}`);
      
      const file_name = row.file_name;
      let easyPassed = false;
      let mediumPassed = false;
      let hardPassed = false;
      let error = '';
      
      try {
        // Test easy query with timeout handling
        console.log(`Testing easy query for row ${i+1}...`);
        console.log(`Question: "${row.easy_query}"`);
        const easyResponse = await makeApiCall(row.easy_query);
        if (easyResponse.error) {
          console.log(`Easy query error: ${easyResponse.error}`);
          error += `Easy query error: ${easyResponse.error}; `;
        } else {
          easyPassed = easyResponse.response && easyResponse.response.includes(file_name);
          console.log(`Easy query: ${easyPassed ? 'PASSED' : 'FAILED'}`);
        }
        
        // Add a small delay between requests to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Test medium query with timeout handling
        console.log(`Testing medium query for row ${i+1}...`);
        console.log(`Question: "${row.medium_query}"`);
        const mediumResponse = await makeApiCall(row.medium_query);
        if (mediumResponse.error) {
          console.log(`Medium query error: ${mediumResponse.error}`);
          error += `Medium query error: ${mediumResponse.error}; `;
        } else {
          mediumPassed = mediumResponse.response && mediumResponse.response.includes(file_name);
          console.log(`Medium query: ${mediumPassed ? 'PASSED' : 'FAILED'}`);
        }
        
        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Test hard query with timeout handling
        console.log(`Testing hard query for row ${i+1}...`);
        console.log(`Question: "${row.hard_query}"`);
        const hardResponse = await makeApiCall(row.hard_query);
        if (hardResponse.error) {
          console.log(`Hard query error: ${hardResponse.error}`);
          error += `Hard query error: ${hardResponse.error}`;
        } else {
          hardPassed = hardResponse.response && hardResponse.response.includes(file_name);
          console.log(`Hard query: ${hardPassed ? 'PASSED' : 'FAILED'}`);
        }
        
        // Check if all tests passed
        const allPassed = easyPassed && mediumPassed && hardPassed;
        
        testResults.push({
          id: row.id,
          file_name: file_name,
          decision_type: row.decision_type_fr,
          keywordid: row.keywordid,
          url_pdf: row.url_pdf,
          easy_query_passed: easyPassed ? 'true' : 'false',
          medium_query_passed: mediumPassed ? 'true' : 'false',
          hard_query_passed: hardPassed ? 'true' : 'false',
          all_passed: allPassed ? 'true' : 'false',
          error: error
        });
        
        // Log progress
        console.log(`Row ${i+1} complete: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
        
        // Write results after each row to ensure we save progress even if script crashes later
        await csvWriter.writeRecords(testResults);
        console.log(`Progress saved to ${outputCsvPath}`);
        
      } catch (error) {
        console.error(`Error processing row ${i+1}:`, error);
        testResults.push({
          id: row.id,
          file_name: file_name,
          decision_type: row.decision_type_fr,
          keywordid: row.keywordid,
          url_pdf: row.url_pdf,
          easy_query_passed: easyPassed ? 'true' : 'false',
          medium_query_passed: mediumPassed ? 'true' : 'false',
          hard_query_passed: hardPassed ? 'true' : 'false',
          all_passed: 'false',
          error: error.message || 'Unknown error'
        });
        
        // Save progress even when an error occurs
        try {
          await csvWriter.writeRecords(testResults);
          console.log(`Progress saved to ${outputCsvPath} after error`);
        } catch (writeError) {
          console.error('Error saving progress:', writeError);
        }
      }
      
      // Add a delay between rows to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Write results to CSV
    console.log('Writing results to CSV...');
    await csvWriter.writeRecords(testResults);
    console.log(`Test results written to ${outputCsvPath}`);
    
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run the tests
runTests();

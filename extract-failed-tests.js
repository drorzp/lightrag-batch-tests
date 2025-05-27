const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

// File paths
const testResultsPath = path.join(__dirname, 'test-results-final.csv');
const validTestDataPath = path.join(__dirname, 'test-data', 'lightrag-valid-test-data.csv');
const outputPath = path.join(__dirname, 'test-data', 'failed-tests-data.csv');

// First, let's check if we need to install dependencies
try {
  require.resolve('csv-parser');
  require.resolve('csv-writer');
} catch (e) {
  console.log('Installing required dependencies...');
  require('child_process').execSync('npm install csv-parser csv-writer', { stdio: 'inherit' });
  console.log('Dependencies installed.');
}

// Function to read CSV file and return rows as array of objects
function readCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

async function main() {
  try {
    // Read test results
    console.log('Reading test results...');
    const testResults = await readCsvFile(testResultsPath);
    
    // Find rows where all queries failed
    const failedTests = testResults.filter(row => {
      // Check if all three query types failed
      // Note: CSV values might be strings, so we need to handle different formats
      const easyFailed = row.easy_query_passed?.toLowerCase() === 'false';
      const mediumFailed = row.medium_query_passed?.toLowerCase() === 'false';
      const hardFailed = row.hard_query_passed?.toLowerCase() === 'false';
      
      return easyFailed && mediumFailed && hardFailed;
    });
    
    console.log(`Found ${failedTests.length} tests that failed all three query types.`);
    
    if (failedTests.length === 0) {
      console.log('No failed tests found. Exiting.');
      return;
    }
    
    // Get the file names of failed tests
    const failedFileNames = failedTests.map(row => row.file_name);
    console.log('Failed file names:', failedFileNames);
    
    // Read valid test data
    console.log('Reading valid test data...');
    const validTestData = await readCsvFile(validTestDataPath);
    
    // Find matching entries in valid test data
    const matchingEntries = validTestData.filter(row => 
      failedFileNames.includes(row.file_name)
    );
    
    console.log(`Found ${matchingEntries.length} matching entries in valid test data.`);
    
    if (matchingEntries.length === 0) {
      console.log('No matching entries found in valid test data. Exiting.');
      return;
    }
    
    // Get headers from valid test data
    const headers = Object.keys(validTestData[0]).map(key => ({
      id: key,
      title: key
    }));
    
    // Write matching entries to new CSV
    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: headers
    });
    
    await csvWriter.writeRecords(matchingEntries);
    console.log(`Successfully created ${outputPath} with ${matchingEntries.length} entries.`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();

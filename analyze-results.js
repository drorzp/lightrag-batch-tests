const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Function to analyze test results
async function analyzeResults(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        results.push(row);
      })
      .on('end', () => {
        console.log(`Read ${results.length} rows from the results file.`);
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Main function
async function main() {
  // Get the file path from command line arguments or use a default
  const filePath = process.argv[2] || path.join(__dirname, 'test-results-valid-2025-05-27T00-15-22-141Z.csv');
  
  try {
    console.log(`Analyzing results from: ${filePath}`);
    const results = await analyzeResults(filePath);
    
    // Initialize counters
    const stats = {
      totalRows: results.length,
      totalQuestions: results.length * 3, // 3 questions per row
      passedQuestions: 0
    };
    
    // Count by file type
    const fileTypeStats = {};
    
    // Count by year (extracted from file name if possible)
    const yearStats = {};
    
    // Process each result
    results.forEach(result => {
      // Count query success
      if (result.easy_query_passed === 'true') stats.passedQuestions++;
      if (result.medium_query_passed === 'true') stats.passedQuestions++;
      if (result.hard_query_passed === 'true') stats.passedQuestions++;
      
      // Extract file type (Arrêt, Jugement, etc.)
      const fileType = result.decision_type || 'Unknown';
      fileTypeStats[fileType] = (fileTypeStats[fileType] || 0) + 1;
      
      // Try to extract year from file name
      let year = 'Unknown';
      if (result.file_name) {
        const yearMatch = result.file_name.match(/\d{4}/);
        if (yearMatch) {
          year = yearMatch[0];
        }
      }
      yearStats[year] = (yearStats[year] || 0) + 1;
    });
    
    // Calculate overall success rate
    const successRate = (stats.passedQuestions / stats.totalQuestions * 100).toFixed(2);
    
    // Print summary
    console.log('\n===== SUMMARY =====');
    console.log(`Total documents analyzed: ${stats.totalRows}`);
    console.log(`Total questions: ${stats.totalQuestions} (3 per document)`);
    console.log(`Passed questions: ${stats.passedQuestions}`);
    console.log(`Overall success rate: ${successRate}%`);
    
    // Calculate success rates by document type
    console.log('\nSuccess rates by document type:');
    Object.keys(fileTypeStats).forEach(fileType => {
      const typeResults = results.filter(r => r.decision_type === fileType);
      const totalTypeQuestions = typeResults.length * 3;
      let passedTypeQuestions = 0;
      
      typeResults.forEach(r => {
        if (r.easy_query_passed === 'true') passedTypeQuestions++;
        if (r.medium_query_passed === 'true') passedTypeQuestions++;
        if (r.hard_query_passed === 'true') passedTypeQuestions++;
      });
      
      console.log(`- ${fileType}: ${passedTypeQuestions}/${totalTypeQuestions} (${(passedTypeQuestions / totalTypeQuestions * 100).toFixed(2)}%)`);
    });
    
    // Calculate success rates by year
    console.log('\nSuccess rates by year:');
    Object.keys(yearStats).sort().forEach(year => {
      const yearResults = results.filter(r => {
        if (!r.file_name) return false;
        const yearMatch = r.file_name.match(/\d{4}/);
        return yearMatch && yearMatch[0] === year;
      });
      
      const totalYearQuestions = yearResults.length * 3;
      let passedYearQuestions = 0;
      
      yearResults.forEach(r => {
        if (r.easy_query_passed === 'true') passedYearQuestions++;
        if (r.medium_query_passed === 'true') passedYearQuestions++;
        if (r.hard_query_passed === 'true') passedYearQuestions++;
      });
      
      console.log(`- ${year}: ${passedYearQuestions}/${totalYearQuestions} (${(passedYearQuestions / totalYearQuestions * 100).toFixed(2)}%)`);
    });
    
  } catch (error) {
    console.error('Error analyzing results:', error);
  }
}

// Run the main function
main();

# LightRAG API Test Script

This Node.js script tests the LightRAG API by reading data from a CSV file, making API calls, and checking if the expected file name appears in the response.

## Features

- Reads the first 100 rows from the CSV file in the test-data directory
- For each row, tests three different queries (easy, medium, and hard)
- Checks if the file_name from the CSV appears in each API response
- Writes test results to a CSV file with detailed pass/fail information

## Requirements

- Node.js
- npm

## Dependencies

- csv-parser: For reading CSV files
- csv-writer: For writing CSV files
- axios: For making API calls

## Usage

1. Make sure the LightRAG API server is running at http://localhost:9621
2. Run the script:

```
node test-api.js
```

3. Check the results in `test-results.csv`

## Output CSV Format

The output CSV file contains the following columns:

- id: The ID from the original CSV
- file_name: The file name from the original CSV
- decision_type: The decision type (e.g., Arrêt, Jugement) from the original CSV
- keywordid: The keyword ID from the original CSV
- url_pdf: The URL to the PDF document from the original CSV
- easy_query_passed: Whether the easy query test passed (true/false)
- medium_query_passed: Whether the medium query test passed (true/false)
- hard_query_passed: Whether the hard query test passed (true/false)
- all_passed: Whether all three query tests passed (true/false)
- error: Any error message that occurred during testing

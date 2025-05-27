const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const axios = require('axios');
const { OpenAI } = require('openai');

// Initialize OpenAI client


// Path to input and output files
const inputCsvPath = path.join(__dirname, 'test-data', 'lightrag-valid-test-data.csv');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

// Create results directory if it doesn't exist
const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const outputCsvPath = path.join(resultsDir, `test-results-valid-${timestamp}.csv`);

// Configuration
const START_FROM_ROW = 0; // Start from the first row (0-indexed)
const MAX_ROWS = 399; // Process only the first 399 rows

// Create CSV writer - will be initialized in runTests to ensure a fresh file for each run
let csvWriter;

// Function to parse document chunks from API response
function parseDocumentChunks(responseText) {
  try {
    // Find the document chunks section
    const docChunksMarker = '-----Document Chunks(DC)-----';
    const docChunksIndex = responseText.indexOf(docChunksMarker);
    
    if (docChunksIndex === -1) {
      console.warn('Document chunks section not found in response');
      return [];
    }
    
    // Extract the text after the marker
    let docChunksText = responseText.substring(docChunksIndex + docChunksMarker.length).trim();
    
    // Check if the chunks are in markdown code blocks
    if (docChunksText.includes('```json')) {
      try {
        // Extract content between the markdown code blocks
        const jsonStartMarker = '```json';
        const jsonEndMarker = '```';
        
        const jsonStartIndex = docChunksText.indexOf(jsonStartMarker);
        if (jsonStartIndex !== -1) {
          // Get content after the start marker
          const contentAfterStart = docChunksText.substring(jsonStartIndex + jsonStartMarker.length).trim();
          
          // Find the end marker
          const jsonEndIndex = contentAfterStart.lastIndexOf(jsonEndMarker);
          if (jsonEndIndex !== -1) {
            // Extract just the JSON content
            const jsonContent = contentAfterStart.substring(0, jsonEndIndex).trim();
            
            // Parse the JSON
            const parsedChunks = JSON.parse(jsonContent);
            // console.log('Successfully parsed JSON chunks:', parsedChunks);
            
            // Map to our expected format
            return parsedChunks.map(chunk => ({
              id: chunk.id,
              content: chunk.content,
              file_path: chunk.file_path
            }));
          }
        }
      } catch (jsonError) {
        console.error('Error parsing JSON chunks from markdown blocks:', jsonError);
      }
    }
    
    // Try direct JSON parsing if markdown parsing failed
    try {
      if (docChunksText.includes('[{"id":')) {
        // Find the start of the JSON array
        const jsonStartIndex = docChunksText.indexOf('[');
        if (jsonStartIndex !== -1) {
          // Find the end of the JSON array
          let bracketCount = 0;
          let jsonEndIndex = -1;
          
          for (let i = jsonStartIndex; i < docChunksText.length; i++) {
            if (docChunksText[i] === '[') bracketCount++;
            if (docChunksText[i] === ']') bracketCount--;
            
            if (bracketCount === 0) {
              jsonEndIndex = i + 1;
              break;
            }
          }
          
          if (jsonEndIndex !== -1) {
            const jsonContent = docChunksText.substring(jsonStartIndex, jsonEndIndex);
            console.log('Extracted direct JSON content:', jsonContent);
            
            // Parse the JSON
            const parsedChunks = JSON.parse(jsonContent);
            // console.log('Successfully parsed direct JSON chunks:', parsedChunks);
            
            // Map to our expected format
            return parsedChunks.map(chunk => ({
              id: chunk.id,
              content: chunk.content,
              file_path: chunk.file_path
            }));
          }
        }
      }
    } catch (directJsonError) {
      console.error('Error parsing direct JSON chunks:', directJsonError);
    }
    
    // Fallback to line-by-line parsing if JSON parsing failed
    console.log('Falling back to line-by-line parsing');
    const chunks = [];
    let currentChunk = '';
    let currentId = '';
    let currentFilePath = '';
    let chunkStarted = false;
    
    // Remove markdown code blocks if present
    if (docChunksText.startsWith('```')) {
      docChunksText = docChunksText.replace(/```json\n|```/g, '').trim();
    }
    
    // Process the text line by line
    const lines = docChunksText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for chunk ID pattern
      if (line.includes('id:') && line.includes('file_path:')) {
        // If we were already processing a chunk, save it
        if (chunkStarted && currentId && currentFilePath) {
          chunks.push({
            id: currentId,
            content: currentChunk.trim(),
            file_path: currentFilePath
          });
        }
        
        // Start a new chunk
        const idMatch = line.match(/id:\s*"([^"]+)"/i);
        const filePathMatch = line.match(/file_path:\s*"([^"]+)"/i);
        
        currentId = idMatch ? idMatch[1] : '';
        currentFilePath = filePathMatch ? filePathMatch[1] : '';
        currentChunk = '';
        chunkStarted = true;
      } else if (chunkStarted) {
        // Add line to current chunk content
        currentChunk += line + '\n';
      }
    }
    
    // Add the last chunk if there is one
    if (chunkStarted && currentId && currentFilePath) {
      chunks.push({
        id: currentId,
        content: currentChunk.trim(),
        file_path: currentFilePath
      });
    }
    
    return chunks;
  } catch (error) {
    console.error('Error parsing document chunks:', error);
    return [];
  }
}

// Function to rerank document chunks using OpenAI
async function rerankChunks(query, chunks) {
  if (!chunks || chunks.length === 0) {
    console.warn('No chunks to rerank');
    return [];
  }
  
  try {
    // Create a prompt for OpenAI
    const prompt = `You are a helpful assistant that ranks document chunks based on their relevance to a query. 
Please analyze the following query and document chunks, then rank the chunks by their relevance to the query.

IMPORTANT: You MUST return ONLY a valid JSON array of objects. Each object MUST have these exact properties:
- chunk_id: The ID of the chunk (as a string)
- file_path: The file path of the chunk (as a string)
- relevance_score: A number from 0-100 indicating relevance (higher is more relevant)

Query: ${query}

Document Chunks:
${chunks.map(chunk => `
ID: ${chunk.id}
File Path: ${chunk.file_path}
Content: ${chunk.content.substring(0, 1000)}${chunk.content.length > 1000 ? '...' : ''}
---
`).join('\n')}

EXPECTED OUTPUT FORMAT (you must follow this EXACTLY):
[
  {
    "chunk_id": "1",
    "file_path": "example.txt",
    "relevance_score": 95
  },
  {
    "chunk_id": "2",
    "file_path": "another_file.txt",
    "relevance_score": 80
  }
]

DO NOT include any explanations, notes, or text outside the JSON array. Return ONLY the JSON array.
    `;
    
    // Call OpenAI API for reranking
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using GPT-4o for best reranking performance
      messages: [
        { role: "system", content: "You are a helpful assistant that ranks document chunks based on their relevance to a query. You MUST respond with ONLY valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
      // response_format parameter removed as it's not supported by all models
    });
    
    // Parse the response
    let content = response.choices[0].message.content;
    console.log('OpenAI response content:', content);
    
    try {
      // Check if the response is wrapped in markdown code blocks
      if (content.includes('```json') || content.includes('```')) {
        // Extract the JSON content from markdown code blocks
        const jsonStartMarker = '```json';
        const jsonEndMarker = '```';
        
        // Handle ```json marker
        if (content.includes(jsonStartMarker)) {
          const jsonStartIndex = content.indexOf(jsonStartMarker);
          content = content.substring(jsonStartIndex + jsonStartMarker.length);
        } 
        // Handle just ``` marker
        else if (content.startsWith('```')) {
          content = content.substring(3);
        }
        
        // Remove closing markdown marker if present
        const jsonEndIndex = content.lastIndexOf(jsonEndMarker);
        if (jsonEndIndex !== -1) {
          content = content.substring(0, jsonEndIndex);
        }
        
        // Trim any extra whitespace
        content = content.trim();
      }
      
      // Parse the JSON
      const rankedChunks = JSON.parse(content);
      
      // Validate the structure of the returned data
      if (Array.isArray(rankedChunks)) {
        // Make sure each chunk has the required properties
        const validChunks = rankedChunks.filter(chunk => 
          chunk && typeof chunk === 'object' && 
          'chunk_id' in chunk && 
          'file_path' in chunk && 
          'relevance_score' in chunk
        );
        
        // Sort by relevance score in descending order
        return validChunks.sort((a, b) => b.relevance_score - a.relevance_score);
      } else {
        console.error('OpenAI did not return an array:', rankedChunks);
        return [];
      }
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Raw content:', content);
      return [];
    }
  } catch (error) {
    console.error('Error reranking chunks with OpenAI:', error);
    return [];
  }
}

// Function to make API call
async function makeApiCall(query) {
  try {
    console.log(`Making API calls with query: "${query}"`);
    
    // First API call to get document chunks (only_need_context: true)
    console.log('Making first API call to get document chunks...');
    const contextResponse = await axios.post('http://localhost:9621/query/stream', {
      query: query,
      mode: 'mix',
      only_need_context: true,
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
    });
    
    // Parse document chunks from the response
    const contextResponseText = contextResponse.data.response || '';
    const documentChunks = parseDocumentChunks(contextResponseText);
    console.log(`Parsed ${documentChunks.length} document chunks from response`);
    
    // Rerank the chunks using OpenAI
    const rankedChunks = await rerankChunks(query, documentChunks);
    console.log(`Reranked chunks with OpenAI, got ${rankedChunks.length} ranked chunks`);
    
    // Second API call to get the full response (only_need_context: false)
    console.log('Making second API call to get full response...');
    const fullResponse = await axios.post('http://localhost:9621/query', {
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
    });
    
    // Return both responses and the processed chunks
    return {
      contextResponse: contextResponse.data,
      fullResponse: fullResponse.data,
      documentChunks: documentChunks,
      rankedChunks: rankedChunks
    };
  } catch (error) {
    console.error('API call error:', error.message);
    // Return a structured error object
    return { 
      error: error.message,
      contextResponse: null,
      fullResponse: null,
      documentChunks: [],
      rankedChunks: []
    };
  }
}

// Main function to process CSV and make API calls
async function processCSV() {
  const results = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputCsvPath)
      .pipe(csv())
      .on('data', (row) => {
        results.push(row);
      })
      .on('end', () => {
        console.log(`Read ${results.length} rows from the valid tests data file.`);
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
    // Initialize the CSV writer here to ensure a fresh file for each run
    csvWriter = createCsvWriter({
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
    console.log('Reading CSV file...');
    const rows = await processCSV();
    console.log(`Processing ${rows.length} rows starting from row ${START_FROM_ROW + 1}...`);
    
    const testResults = [];
    
    // Process each row sequentially to avoid overwhelming the API
    let i = 0;
    for await (const row of rows) {
      // Skip rows until we reach the starting point
      if (i < START_FROM_ROW) {
        i++;
        continue;
      }
      
      // Stop after processing MAX_ROWS
      if (i >= MAX_ROWS) {
        console.log(`Reached maximum number of rows (${MAX_ROWS}). Stopping processing.`);
        break;
      }
      
      console.log(`Processing row ${i+1}/${rows.length}: ${row.id}`);
      
      const file_name = row.file_name;
      i++; // Increment counter
      let easyPassed = false;
      let mediumPassed = false;
      let hardPassed = false;
      let error = '';
      
      try {
        // Test easy query with timeout handling
        console.log(`Testing easy query for row ${i+1}...`);
        console.log(`Question: "${row.easy_query}"`);
        console.log('Goal File Name:', file_name);
        const easyResponse = await makeApiCall(row.easy_query);
        
        if (easyResponse.error) {
          console.log(`Easy query error: ${easyResponse.error}`);
          error += `Easy query error: ${easyResponse.error}; `;
        } else {
          // Check if file_name is in the full response (original method)
          const originalCheck = easyResponse.fullResponse && 
                                easyResponse.fullResponse.response && 
                                easyResponse.fullResponse.response.includes(file_name);
          
          // Check if file_name is in the top 3 ranked chunks
          let rerankCheck = false;
          if (easyResponse.rankedChunks && easyResponse.rankedChunks.length > 0) {
            // Get the top 3 chunks (or fewer if less than 3 are available)
            const topChunks = easyResponse.rankedChunks.slice(0, 3);
            console.log('Top 3 ranked chunks for easy query:', 
              topChunks.map(c => `${c.file_path} (score: ${c.relevance_score})`).join(', '));
            
            // Check if any of the top chunks have the matching file path
            rerankCheck = topChunks.some(chunk => 
              chunk.file_path && chunk.file_path.includes(file_name));
          }
          
          // Pass if either check is true
          easyPassed = originalCheck || rerankCheck;
          console.log(`Easy query: ${easyPassed ? 'PASSED' : 'FAILED'} (original: ${originalCheck}, rerank: ${rerankCheck})`);
        }
        
        // Test medium query with timeout handling
        console.log(`Testing medium query for row ${i+1}...`);
        console.log(`Question: "${row.medium_query}"`);
        const mediumResponse = await makeApiCall(row.medium_query);
        
        if (mediumResponse.error) {
          console.log(`Medium query error: ${mediumResponse.error}`);
          error += `Medium query error: ${mediumResponse.error}; `;
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
              topChunks.map(c => `${c.file_path} (score: ${c.relevance_score})`).join(', '));
            
            // Check if any of the top chunks have the matching file path
            rerankCheck = topChunks.some(chunk => 
              chunk.file_path && chunk.file_path.includes(file_name));
          }
          
          // Pass if either check is true
          mediumPassed = originalCheck || rerankCheck;
          console.log(`Medium query: ${mediumPassed ? 'PASSED' : 'FAILED'} (original: ${originalCheck}, rerank: ${rerankCheck})`);
        }
        
        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Test hard query with timeout handling
        console.log(`Testing hard query for row ${i+1}...`);
        console.log(`Question: "${row.hard_query}"`);
        const hardResponse = await makeApiCall(row.hard_query);
        
        if (hardResponse.error) {
          console.log(`Hard query error: ${hardResponse.error}`);
          error += `Hard query error: ${hardResponse.error}`;
        } else {
          // Check if file_name is in the full response (original method)
          const originalCheck = hardResponse.fullResponse && 
                                hardResponse.fullResponse.response && 
                                hardResponse.fullResponse.response.includes(file_name);
          
          // Check if file_name is in the top 3 ranked chunks
          let rerankCheck = false;
          if (hardResponse.rankedChunks && hardResponse.rankedChunks.length > 0) {
            // Get the top 3 chunks (or fewer if less than 3 are available)
            const topChunks = hardResponse.rankedChunks.slice(0, 3);
            console.log('Top 3 ranked chunks for hard query:', 
              topChunks.map(c => `${c.file_path} (score: ${c.relevance_score})`).join(', '));
            
            // Check if any of the top chunks have the matching file path
            rerankCheck = topChunks.some(chunk => 
              chunk.file_path && chunk.file_path.includes(file_name));
          }
          
          // Pass if either check is true
          hardPassed = originalCheck || rerankCheck;
          console.log(`Hard query: ${hardPassed ? 'PASSED' : 'FAILED'} (original: ${originalCheck}, rerank: ${rerankCheck})`);
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
        
        // Write only the current result to avoid duplicates
        await csvWriter.writeRecords([testResults[testResults.length - 1]]);
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
          await csvWriter.writeRecords([testResults[testResults.length - 1]]);
          console.log(`Progress saved to ${outputCsvPath} after error`);
        } catch (writeError) {
          console.error('Error saving progress:', writeError);
        }
        
        // Log progress
        console.log(`Row ${i+1} complete: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
        
        // Write only the current result to avoid duplicates
        await csvWriter.writeRecords([testResults[testResults.length - 1]]);
        console.log(`Progress saved to ${outputCsvPath}`);
        
      }
    }
    
    // Write final summary to a separate file
    const summaryPath = outputCsvPath.replace('.csv', '-summary.csv');
    const summaryCsvWriter = createCsvWriter({
      path: summaryPath,
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
    
    console.log('Writing summary results to CSV...');
    await summaryCsvWriter.writeRecords(testResults);
    console.log(`Summary results written to ${summaryPath}`);
    
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run the tests
runTests();

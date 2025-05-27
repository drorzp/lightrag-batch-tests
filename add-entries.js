const fs = require('fs');
const path = require('path');

// Path to the deduplicated CSV file
const csvFilePath = path.join(__dirname, 'test-results-deduped.csv');

// New entries to add
const newEntries = [
  '8623,juportal.be_BE_CASS_2007_ARR.20070612.2_FR.txt,Arrêt,KUD2-29-2-3,https://juportal.be/JUPORTAwork/ECLI:BE:CASS:2007:ARR.20070612.2_FR.pdf?Version=1607979575,true,false,false,false,',
  '8625,juportal.be_BE_TTBRL_2015_JUG.20150105.5_FR.txt,Jugement,KUD2-29-2-5,https://juportal.be/JUPORTAwork/ECLI:BE:TTBRL:2015:JUG.20150105.5_FR.pdf?Version=1607974289,true,true,true,true,',
  '8627,juportal.be_BE_TTLIE_2006_JUG.20061129.24_FR.txt,Jugement,KUD2-10-9,https://juportal.be/JUPORTAwork/ECLI:BE:TTLIE:2006:JUG.20061129.24_FR.pdf?Version=1607979936,true,true,true,true,',
  '8628,juportal.be_BE_CASS_2011_ARR.20110628.2_FR.txt,Arrêt,KUD2-10-9-4,https://juportal.be/JUPORTAwork/ECLI:BE:CASS:2011:ARR.20110628.2_FR.pdf?Version=1607976672,false,false,true,false,',
  '8632,juportal.be_BE_CTBRL_2011_ARR.20110106.8_FR.txt,Arrêt,KUD2-10-3-5,https://juportal.be/JUPORTAwork/ECLI:BE:CTBRL:2011:ARR.20110106.8_FR.pdf?Version=1607977062,true,true,true,true,',
  '8639,juportal.be_BE_CASS_2008_ARR.20080110.1_FR.txt,Arrêt,KUD2-10-10-1,https://juportal.be/JUPORTAwork/ECLI:BE:CASS:2008:ARR.20080110.1_FR.pdf?Version=1607979228,true,true,true,true,'
];

// Read the existing file content
let fileContent = fs.readFileSync(csvFilePath, 'utf8');
const lines = fileContent.split('\n');

// Create a Set of existing IDs to check for duplicates
const existingIds = new Set();
lines.forEach(line => {
  if (line.trim()) {
    const columns = line.split(',');
    if (columns.length > 0) {
      existingIds.add(columns[0]);
    }
  }
});

// Add only new entries that don't already exist (based on ID)
let addedCount = 0;
newEntries.forEach(entry => {
  const id = entry.split(',')[0];
  if (!existingIds.has(id)) {
    lines.push(entry);
    existingIds.add(id);
    addedCount++;
  }
});

// Write the updated content back to the file
fs.writeFileSync(csvFilePath, lines.join('\n'));

console.log(`Added ${addedCount} new entries to ${csvFilePath}`);
console.log(`Total entries in file: ${lines.length}`);

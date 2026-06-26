const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/Dashboard.tsx');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

function printRange(start, end) {
  console.log(`=== Lines ${start} to ${end} ===`);
  for (let i = start - 1; i < end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

printRange(250, 300);
printRange(430, 490);

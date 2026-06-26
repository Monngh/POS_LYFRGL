const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/Dashboard.tsx');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

const start = 740;
const end = 860;
for (let i = start - 1; i < end; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}

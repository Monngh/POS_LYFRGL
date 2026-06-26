const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/Dashboard.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
let startLine = -1;
lines.forEach((line, idx) => {
  if (line.includes('searchResults.map') || line.includes('searchResults.length > 0')) {
    startLine = idx + 1;
  }
});

if (startLine !== -1) {
  console.log(`Found searchResults rendering starting around line ${startLine}`);
  const start = Math.max(1, startLine - 10);
  const end = Math.min(lines.length, startLine + 40);
  for (let i = start - 1; i < end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
} else {
  console.log("searchResults rendering not found in JSX");
}

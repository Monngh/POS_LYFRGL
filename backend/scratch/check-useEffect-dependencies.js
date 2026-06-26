const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/Dashboard.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
console.log("=== useEffect dependencies in Dashboard.tsx ===");
lines.forEach((line, idx) => {
  if (line.includes('useEffect(')) {
    // Print the useEffect hook structure (around 10 lines)
    const end = Math.min(lines.length, idx + 15);
    let hookLines = [];
    for (let i = idx; i < end; i++) {
      hookLines.push(`${i+1}: ${lines[i]}`);
      if (lines[i].includes('],')) {
        break;
      }
    }
    console.log(hookLines.join('\n'));
    console.log("------------------------");
  }
});

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/Dashboard.tsx');
const content = fs.readFileSync(filePath, 'utf8');

// Find all occurrences of product search/filtering
const queries = ['search', 'buscar', 'product', 'debounce', 'timeout', 'input'];
queries.forEach(query => {
  const matches = [];
  let index = content.toLowerCase().indexOf(query.toLowerCase());
  while (index !== -1) {
    matches.push(index);
    index = content.toLowerCase().indexOf(query.toLowerCase(), index + 1);
  }
  console.log(`Query "${query}": found ${matches.length} matches`);
});

// Let's find the JSX input for searching products in the dashboard
// Typically it looks like value={search} or onChange={...} or similar.
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('search') && (line.includes('input') || line.includes('onChange') || line.includes('fetch') || line.includes('api.get'))) {
    console.log(`Line ${idx+1}: ${line.trim()}`);
  }
});

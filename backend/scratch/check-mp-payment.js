const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/Dashboard.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const queries = ['QR_MERCADOPAGO', 'mercadopago', 'mpPaymentId'];
queries.forEach(query => {
  const matches = [];
  let index = content.toLowerCase().indexOf(query.toLowerCase());
  while (index !== -1) {
    matches.push(index);
    index = content.toLowerCase().indexOf(query.toLowerCase(), index + 1);
  }
  console.log(`Query "${query}": found ${matches.length} matches`);
  if (matches.length > 0) {
    matches.slice(0, 2).forEach((matchIndex, i) => {
      const start = Math.max(0, matchIndex - 200);
      const end = Math.min(content.length, matchIndex + 200);
      console.log(`  Match ${i+1}: "${content.substring(start, end).replace(/\n/g, ' ')}"`);
    });
  }
});

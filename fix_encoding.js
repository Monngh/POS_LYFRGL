const fs = require('fs');
const path = require('path');

const replacements = {
  'ÃƒÂ¡': 'á',
  'ÃƒÂ©': 'é',
  'ÃƒÂ­': 'í',
  'ÃƒÂ³': 'ó',
  'ÃƒÂº': 'ú',
  'ÃƒÂ ': 'Á', // Could be Á followed by a space? Or just Á? Let's check RÃƒÂ PIDOS -> RÁPIDOS. So ÃƒÂ  is Á.
  'ÃƒÂ\x81': 'Á',
  'Ãƒâ€œ': 'Ó',
  'ÃƒÂ±': 'ñ',
  'Ãƒâ€˜': 'Ñ',
  'Ã¢â‚¬â€ ': '—',
  'Ã¢â‚¬Â¢': '•',
  'Ã°Å¸â€ºâ€™': '🛒',
  'Ã¢Â Å’': '❌',
  'Ã¢Å“â€œ': '✅',
  'Ã¢Å¡Â Ã¯Â¸Â ': '⚠️',
  'Ã¢Â­Â ': '⭐',
  'Ã¢Å“â€¢': '📝',
  'Ã°Å¸â€˜Â¤': '👤',
  'Ã°Å¸â€œÂ±': '📱',
  'RÃƒÂ PIDOS': 'RÁPIDOS' // Specific fix just in case
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.md')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('frontend/src/pos');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  for (const [bad, good] of Object.entries(replacements)) {
    if (content.includes(bad)) {
      content = content.split(bad).join(good);
      changed = true;
    }
  }
  
  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Fixed ${file}`);
  }
});

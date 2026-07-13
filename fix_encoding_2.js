const fs = require('fs');
const path = require('path');

const replacements = {
  'Ã¢â‚¬â€ ': '—',
  'Ã¢â€ â€™': '→',
  'Ã‚Â¡': '¡',
  'Ã‚Â¿': '¿',
  'Ã°Å¸â€ â€”': '🔗',
  'Ã°Å¸â€ â€ž': '🔄',
  'Ã¢Å¡Â Ã¯Â¸Â ': '⚠️',
  'Ã¢Â Å’': '❌',
  'Ãƒâ€°': 'É',
  'Ã¢Â­Â ': '⭐',
  'Ã°Å¸â€˜Â¤': '👤',
  'Ã°Å¸â€œÂ±': '📱',
  'ÃƒÂ ': 'à',
  'ÃƒÂ¨': 'è',
  'ÃƒÂ¬': 'ì',
  'ÃƒÂ²': 'ò',
  'ÃƒÂ¹': 'ù',
  'ÃƒÂ¤': 'ä',
  'ÃƒÂ«': 'ë',
  'ÃƒÂ¯': 'ï',
  'ÃƒÂ¶': 'ö',
  'ÃƒÂ¼': 'ü',
  'ÃƒÂ¢': 'â',
  'ÃƒÂª': 'ê',
  'ÃƒÂ®': 'î',
  'ÃƒÂ´': 'ô',
  'ÃƒÂ»': 'û',
  'ÃƒÂ§': 'ç',
  'Ãƒâ‚¬': 'À',
  'ÃƒË†': 'È',
  'ÃƒÅ’': 'Ì',
  'Ãƒâ€™': 'Ò',
  'Ãƒâ„¢': 'Ù',
  'Ãƒâ€ž': 'Ä',
  'Ãƒâ€¹': 'Ë',
  'ÃƒÂ ': 'Ï', // Wait Ï
  'Ãƒâ€“': 'Ö',
  'ÃƒÅ“': 'Ü',
  'Ãƒâ€š': 'Â',
  'ÃƒÅ ': 'Ê',
  'ÃƒÅ½': 'Î',
  'Ãƒâ€ ': 'Ô',
  'Ãƒâ€º': 'Û',
  'Ãƒâ€¡': 'Ç',
  'ÃƒÂ ': 'Á'
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

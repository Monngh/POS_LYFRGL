const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../../frontend/src/pages/admin/InventarioView.tsx');
const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const first = content.indexOf('<<<<<<< ours\n        subtitle={activeTab === "existencias" ? `Existencias ${scope}` : undefined}\n      />');
const last = content.indexOf('>>>>>>> theirs\n        </div>\n      )}\n    </div>\n  );\n};\n\nconst styles');
const div = content.indexOf('\n=======\n', first);

fs.writeFileSync(path.join(__dirname, 'substring.txt'), content.substring(first, div), 'utf8');
console.log("Substring written to backend/scratch/substring.txt");

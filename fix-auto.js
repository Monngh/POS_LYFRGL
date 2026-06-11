const fs = require('fs');
let content = fs.readFileSync('frontend/src/pages/Autofacturacion.tsx', 'utf8');
content = content.replace('import {', 'import { API_BASE_URL } from \'../services/api\';\nimport {');
content = content.replace(/"http:\/\/localhost:4000(.*?)"/g, '`${API_BASE_URL}$1`');
fs.writeFileSync('frontend/src/pages/Autofacturacion.tsx', content);

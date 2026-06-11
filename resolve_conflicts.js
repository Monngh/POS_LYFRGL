const fs = require('fs');

function resolveAutofacturacion() {
  const file = 'frontend/src/pages/Autofacturacion.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // Replace imports
  const importRegex = /<<<<<<< HEAD\r?\nimport \{ API_BASE_URL \} from "\.\.\/services\/api";\r?\n=======\r?\n(.*?)>>>>>>> origin\/feature\/impuestos-promos/s;
  content = content.replace(importRegex, 'import { API_BASE_URL } from "../services/api";\n$1');

  // Replace post login
  const loginRegex = /<<<<<<< HEAD\r?\n\s*const response = await axios\.post\(`\$\{API_BASE_URL\}\/api\/customers\/login`, \{\r?\n\s*phone: loginPhone,\r?\n=======\r?\n\s*const response = await axios\.post\("http:\/\/localhost:4000\/api\/customers\/login", \{\r?\n\s*phone: normalizePhoneInput\(loginPhone\),\r?\n>>>>>>> origin\/feature\/impuestos-promos/s;
  content = content.replace(loginRegex, 'const response = await axios.post(`${API_BASE_URL}/api/customers/login`, {\n        phone: normalizePhoneInput(loginPhone),');

  // Replace post register
  const registerRegex = /<<<<<<< HEAD\r?\n\s*const response = await axios\.post\(`\$\{API_BASE_URL\}\/api\/customers\/register`, \{\r?\n\s*phone: registerPhone,\r?\n=======\r?\n\s*const response = await axios\.post\("http:\/\/localhost:4000\/api\/customers\/register", \{\r?\n\s*phone: normalizePhoneInput\(registerPhone\),\r?\n>>>>>>> origin\/feature\/impuestos-promos/s;
  content = content.replace(registerRegex, 'const response = await axios.post(`${API_BASE_URL}/api/customers/register`, {\n        phone: normalizePhoneInput(registerPhone),');

  // Replace profile put
  const profileRegex = /<<<<<<< HEAD\r?\n\s*await axios\.put\(`\$\{API_BASE_URL\}\/api\/customers\/profile`, \{\r?\n\s*taxId: profileRfc\.trim\(\)\.toUpperCase\(\),\r?\n\s*name: profileLegalName\.trim\(\)\.toUpperCase\(\),\r?\n=======\r?\n\s*await axios\.put\("http:\/\/localhost:4000\/api\/customers\/profile", \{\r?\n\s*taxId: normalizeRfcInput\(profileRfc\),\r?\n\s*name: normalizeSpaces\(profileLegalName\)\.toUpperCase\(\),\r?\n>>>>>>> origin\/feature\/impuestos-promos/s;
  content = content.replace(profileRegex, 'await axios.put(`${API_BASE_URL}/api/customers/profile`, {\n        taxId: normalizeRfcInput(profileRfc),\n        name: normalizeSpaces(profileLegalName).toUpperCase(),');

  fs.writeFileSync(file, content);
  console.log('Autofacturacion done');
}

function resolveDashboard() {
  const file = 'frontend/src/pages/Dashboard.tsx';
  let content = fs.readFileSync(file, 'utf8');

  const importRegex = /<<<<<<< HEAD\r?\nimport api, \{ LONG_OPERATION_TIMEOUT \} from "\.\.\/services\/api";\r?\nimport \{ ticketPdfFilename \} from "\.\.\/utils\/ticketEmailDocument\.util";\r?\n=======\r?\nimport api from "\.\.\/services\/api";\r?\nimport \{\r?\n\s*printTicketElementById,\r?\n\s*TICKET_PRINT_MEDIA_STYLES,\r?\n\s*ticketPdfFilename,\r?\n\} from "\.\.\/utils\/ticketEmailDocument\.util";\r?\n>>>>>>> origin\/feature\/impuestos-promos/s;
  content = content.replace(importRegex, 'import api, { LONG_OPERATION_TIMEOUT } from "../services/api";\nimport {\n  printTicketElementById,\n  TICKET_PRINT_MEDIA_STYLES,\n  ticketPdfFilename,\n} from "../utils/ticketEmailDocument.util";');

  const submitRegex = /<<<<<<< HEAD\r?\n\s*\/\/ Candado: evita doble envío si la petición anterior sigue en curso\r?\n\s*if \(checkoutLoading\) return;\r?\n\s*setCheckoutError\(null\);\r?\n=======\r?\n\s*setCheckoutError\(null\);\r?\n\s*setCheckoutFieldErrors\(\{\}\);\r?\n>>>>>>> origin\/feature\/impuestos-promos/s;
  content = content.replace(submitRegex, '// Candado: evita doble envío si la petición anterior sigue en curso\n    if (checkoutLoading) return;\n    setCheckoutError(null);\n    setCheckoutFieldErrors({});');

  fs.writeFileSync(file, content);
  console.log('Dashboard done');
}

function resolveDepositos() {
  const file = 'frontend/src/pages/admin/DepositosView.tsx';
  let content = fs.readFileSync(file, 'utf8');
  
  const blockRegex = /<<<<<<< HEAD.*?=======.*?\n\s*<\/div>\r?\n>>>>>>> origin\/feature\/impuestos-promos/s;
  // Let's just keep the incoming version (theirs) for DepositosView and FacturacionGlobalView
  // Wait, DepositosView HEAD had formatCommentsHtml. We should keep it. Actually, the html content block is huge.
}

try {
  resolveAutofacturacion();
  resolveDashboard();
} catch (e) {
  console.error(e);
}

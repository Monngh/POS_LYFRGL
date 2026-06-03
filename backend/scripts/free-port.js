// Libera el puerto del backend antes de arrancar el server en desarrollo.
// Mata cualquier proceso que haya quedado colgado escuchando en el puerto.
// Cross-platform (Windows / macOS / Linux). Sin dependencias externas.
const { execSync } = require('child_process');

const PORT = process.env.PORT || 4000;

function freePortWindows(port) {
  let out = '';
  try {
    out = execSync('netstat -ano', { encoding: 'utf8' });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split('\n')) {
    const p = line.trim().split(/\s+/);
    // Columnas: Proto | Dirección local | Dirección remota | Estado | PID
    if (p.length >= 5 && p[0] === 'TCP' && p[1].endsWith(`:${port}`) && p[3] === 'LISTENING') {
      pids.add(p[4]);
    }
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      console.log(`Puerto ${port}: proceso ${pid} colgado liberado.`);
    } catch {
      /* el proceso ya no existe, ok */
    }
  }
}

function freePortUnix(port) {
  try {
    execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' });
  } catch {
    /* nada escuchando en el puerto, ok */
  }
}

if (process.platform === 'win32') {
  freePortWindows(PORT);
} else {
  freePortUnix(PORT);
}

console.log(`Puerto ${PORT} libre. Arrancando...`);

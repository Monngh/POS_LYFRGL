module.exports = {
  apps: [
    {
      name: 'pos-backend',
      script: 'dist/server.js',
      // Instancia única y modo 'fork' (no 'cluster'): sessionRegistry.ts y
      // securityEvents.ts viven en memoria de un solo proceso Node (Map/EventEmitter,
      // sin Redis ni almacenamiento compartido). En modo cluster cada worker de PM2
      // tiene su propia copia, así que "Sesiones Activas" salía vacía y el SSE de
      // revocación no llegaba a todos los clientes conectados a otro worker.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Variables importantes que deben cargarse del .env de producción
        // DATABASE_URL: "sqlserver://...",
      },
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      merge_logs: true
    }
  ]
};

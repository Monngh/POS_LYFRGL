module.exports = {
  apps: [
    {
      name: 'pos-backend',
      script: 'dist/server.js',
      instances: 'max', // Utiliza todos los núcleos disponibles del servidor
      exec_mode: 'cluster',
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

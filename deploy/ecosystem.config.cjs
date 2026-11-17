// PM2 process of the institute API (the server also runs another project in
// PM2: this file only manages `jil-api`). Secrets come from /var/www/jil/backend/.env.
module.exports = {
  apps: [
    {
      name: 'jil-api',
      script: 'dist/main.js',
      cwd: '/var/www/jil/backend',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
      // The server has 3.8 GB shared with another project: restart a leaking process
      max_memory_restart: '700M',
      kill_timeout: 8000,
      time: true,
    },
  ],
};

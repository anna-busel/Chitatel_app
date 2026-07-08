module.exports = {
  apps: [
    {
      name: 'chitatel-api',
      script: 'src/server.js',
      // nvm node20 на VPS (без этого PM2 берёт системный node18). См. AI-CONTEXT.
      interpreter: '/home/deploy/.nvm/versions/node/v20.20.2/bin/node',
      // ⚠️ Строго fork + 1 инстанс (аудит 07.07, блок D): cluster mode ломает
      // доставку Socket.io-эмитов (io в памяти процесса, emitToClub из HTTP не
      // долетит до сокетов другого воркера). Redis-адаптер — только при онлайне
      // >2-3k. Без явного exec_mode некоторые сборки PM2 ставят cluster.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

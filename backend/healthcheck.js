/**
 * myPodFlow — Health Check
 * Criado por Eslem Marques © 2026 — mypodflow.com.br
 */
const http = require('http');
const options = { host: 'localhost', port: process.env.PORT || 3001, path: '/api/health', timeout: 5000 };
const req = http.request(options, res => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.on('timeout', () => process.exit(1));
req.end();

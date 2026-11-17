// Petit serveur statique pour jouer en réseau local : node serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = +process.argv[2] || 8000;
const FILES = new Set(['index.html', 'play.html', 'game.js', 'host.js', 'play.js', 'style.css']); // liste blanche : rien d'autre n'est servi
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  let name;
  try { name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html'; } catch (e) { return res.writeHead(400).end(); }
  if (!FILES.has(name)) return res.writeHead(404).end('404');
  fs.readFile(path.join(root, name), (err, data) => {
    if (err) return res.writeHead(500).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(port, '0.0.0.0', () => {
  const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('Hexalia prêt :', ips.map(ip => `http://${ip}:${port}`).join('  ') || `http://localhost:${port}`);
});

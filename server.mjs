import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import QRCode from 'qrcode'

const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const assets = { '/shopper.webp': ['shopper.webp', 'image/webp'], '/visuals.js': ['visuals.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/model.js': ['model.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] }
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/qr') {
    const code = url.searchParams.get('code') || ''
    if (!/^[-A-Z0-9_]{1,100}$/.test(code)) { res.writeHead(400).end('Invalid pack serial'); return }
    try {
      const svg = await QRCode.toString(code, { type: 'svg', errorCorrectionLevel: 'M' })
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'X-Content-Type-Options': 'nosniff' }).end(svg)
    } catch { res.writeHead(500).end('Could not generate label') }
    return
  }
  const asset = Object.hasOwn(assets, url.pathname) && assets[url.pathname]
  if (!asset) { res.writeHead(404).end('Not found'); return }
  try {
    const body = await readFile(new URL('./dist/' + asset[0], import.meta.url))
    res.writeHead(200, { 'Content-Type': asset[1].startsWith('text/') ? asset[1] + '; charset=utf-8' : asset[1], 'X-Content-Type-Options': 'nosniff' }).end(body)
  } catch { res.writeHead(500).end('Could not load Verifi') }
}).listen(Number(option('--port', process.env.PORT || 3000)), option('--host', '127.0.0.1'), function () {
  console.log('Verifi is ready at http://localhost:' + this.address().port)
})

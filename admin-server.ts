#!/usr/bin/env bun

const adminHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Label Watcher Admin</title>
    <meta charset="UTF-8">
</head>
<body>
    <h1>Label Watcher Admin</h1>
    <p>This actually works!</p>
</body>
</html>`

Bun.serve({
  port: 3501,
  fetch(req) {
    const url = new URL(req.url)
    
    if (url.pathname === '/admin' || url.pathname === '/') {
      return new Response(adminHTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }
    
    return new Response('Not Found', { status: 404 })
  }
})

console.log('Admin server running on http://localhost:3501')
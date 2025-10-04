import { serve } from "bun"
import { ConfigService } from "./ConfigService"
import { Metrics } from "./Metrics"
import { Cursor } from "./Cursor"
import { Effect, Layer } from "effect"

const adminHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Label Watcher Admin</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .form { margin: 20px 0; padding: 20px; border: 1px solid #ddd; }
        input, select, button { padding: 8px; margin: 5px; }
        button { background: #007bff; color: white; border: none; cursor: pointer; }
        .error { color: red; }
        .success { color: green; }
    </style>
</head>
<body>
    <h1>Label Watcher Admin</h1>
    
    <div class="form">
        <h3>Authentication</h3>
        <input type="password" id="apiKey" placeholder="API Key">
        <button onclick="authenticate()">Login</button>
        <div id="authResult"></div>
    </div>

    <div class="form">
        <h3>Add Label</h3>
        <input type="text" id="labelName" placeholder="Label name">
        <select id="labelType">
            <option value="curate">Curate</option>
            <option value="mod">Moderation</option>
        </select>
        <button onclick="addLabel()">Add</button>
        <div id="addResult"></div>
    </div>

    <div class="form">
        <h3>Current Labels</h3>
        <button onclick="loadLabels()">Refresh</button>
        <div id="labelsList"></div>
    </div>

    <script>
        let apiKey = '';
        
        function authenticate() {
            apiKey = document.getElementById('apiKey').value;
            fetch('/admin/config', {
                headers: { 'Authorization': 'Bearer ' + apiKey }
            }).then(r => {
                if (r.ok) {
                    document.getElementById('authResult').innerHTML = '<span class="success">Authenticated!</span>';
                    loadLabels();
                } else {
                    document.getElementById('authResult').innerHTML = '<span class="error">Invalid API key</span>';
                }
            });
        }
        
        function addLabel() {
            const name = document.getElementById('labelName').value;
            const type = document.getElementById('labelType').value;
            
            fetch('/admin/labels', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ label: name, listType: type })
            }).then(r => r.text()).then(text => {
                document.getElementById('addResult').innerHTML = '<span class="success">' + text + '</span>';
                document.getElementById('labelName').value = '';
                loadLabels();
            }).catch(e => {
                document.getElementById('addResult').innerHTML = '<span class="error">' + e.message + '</span>';
            });
        }
        
        function loadLabels() {
            fetch('/admin/config', {
                headers: { 'Authorization': 'Bearer ' + apiKey }
            }).then(r => r.json()).then(data => {
                const html = data.map(label => 
                    '<div>' + label.label + ' (' + label.listType + ') - ' + 
                    (label.enabled ? 'enabled' : 'disabled') + '</div>'
                ).join('');
                document.getElementById('labelsList').innerHTML = html;
            });
        }
    </script>
</body>
</html>`

export const startSimpleServer = () => {
  serve({
    port: 3501,
    fetch(req) {
      const url = new URL(req.url)
      
      if (url.pathname === '/admin') {
        return new Response(adminHTML, {
          headers: { 'Content-Type': 'text/html' }
        })
      }
      
      if (url.pathname === '/health') {
        return new Response('OK')
      }
      
      if (url.pathname === '/metrics') {
        // Return metrics - simplified for now
        return new Response(JSON.stringify({ status: 'working' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      return new Response('Not Found', { status: 404 })
    }
  })
  
  console.log('Simple server running on port 3501')
}
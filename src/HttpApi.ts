import { Cursor } from "@/Cursor"
import { Metrics } from "@/Metrics"
import { ConfigService } from "@/ConfigService"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpServer,
  HttpServerRequest,
} from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer, Schema, Config } from "effect"

// A simple API for checking on the service
const ServerApi = HttpApi.make("ServerApi").add(
  HttpApiGroup.make("Health")
    .add(
      HttpApiEndpoint.get("health")`/health`.addSuccess(
        Schema.String,
      ),
    )
    .add(HttpApiEndpoint.get("cursor")`/cursor`.addSuccess(Schema.Number))
    .add(HttpApiEndpoint.get("metrics")`/metrics`.addSuccess(Schema.Any))
    .add(HttpApiEndpoint.get("admin")`/admin`.addSuccess(Schema.String))
    .add(
      HttpApiEndpoint.get("not-found", "*").addSuccess(Schema.String),
    )
).add(
  HttpApiGroup.make("Admin")
    .add(HttpApiEndpoint.get("config")`/admin/config`.addSuccess(Schema.Any))
    .add(HttpApiEndpoint.post("addLabel")`/admin/labels`.addSuccess(Schema.String))
    .add(HttpApiEndpoint.del("removeLabel")`/admin/labels/${Schema.String}`.addSuccess(Schema.String))
    .add(HttpApiEndpoint.put("updateLabel")`/admin/labels/${Schema.String}`.addSuccess(Schema.String))
    .add(HttpApiEndpoint.post("toggleLabel")`/admin/labels/${Schema.String}/toggle`.addSuccess(Schema.String))
).addError(
  HttpApiError.NotFound,
  {
    status: 404,
  },
)

const NotFound = () => Effect.fail(new HttpApiError.NotFound())

// Implement the "Health" group
const checkApiKey = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    const adminKey = yield* Config.string("ADMIN_API_KEY").pipe(Config.withDefault("admin123"))
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return yield* Effect.fail(new HttpApiError.Unauthorized())
    }
    const token = authHeader.slice(7)
    if (token !== adminKey) {
      return yield* Effect.fail(new HttpApiError.Unauthorized())
    }
  })

const HealthLive = HttpApiBuilder.group(ServerApi, "Health", (handlers) => {
  return handlers
    .handle(
      "not-found",
      NotFound,
    )
    .handle("health", () => Effect.succeed("Looks ok."))
    .handle("cursor", () => Cursor.get)
    .handle("metrics", () => Metrics.getMetrics)
    .handle("admin", () => Effect.succeed(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Label Watcher Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .login-form { background: white; padding: 30px; border-radius: 8px; max-width: 400px; margin: 100px auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: 500; }
        input, select, button { padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        input, select { width: 100%; }
        button { background: #007bff; color: white; border: none; cursor: pointer; }
        button:hover { background: #0056b3; }
        button.danger { background: #dc3545; }
        button.danger:hover { background: #c82333; }
        .label-item { display: flex; align-items: center; justify-content: between; padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; }
        .label-info { flex: 1; }
        .label-actions { display: flex; gap: 10px; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .badge.curate { background: #d4edda; color: #155724; }
        .badge.mod { background: #f8d7da; color: #721c24; }
        .badge.disabled { background: #f8f9fa; color: #6c757d; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .metric { text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .metric-label { font-size: 14px; color: #666; }
        .hidden { display: none; }
        .error { color: #dc3545; margin-top: 10px; }
        .success { color: #28a745; margin-top: 10px; }
    </style>
</head>
<body>
    <div id="loginForm" class="login-form">
        <h2>Label Watcher Admin</h2>
        <div class="form-group">
            <label>API Key</label>
            <input type="password" id="apiKey" placeholder="Enter API key">
        </div>
        <button onclick="login()">Login</button>
        <div id="loginError" class="error"></div>
    </div>
    <div id="adminPanel" class="hidden">
        <div class="container">
            <div class="header">
                <h1>Label Watcher Admin</h1>
                <button onclick="logout()" style="float: right;">Logout</button>
            </div>
            <div class="grid">
                <div class="card">
                    <h3>Add New Label</h3>
                    <div class="form-group">
                        <label>Label Name</label>
                        <input type="text" id="newLabel" placeholder="e.g., spam, quality-content">
                    </div>
                    <div class="form-group">
                        <label>List Type</label>
                        <select id="newLabelType">
                            <option value="curate">Curate List</option>
                            <option value="mod">Moderation List</option>
                        </select>
                    </div>
                    <button onclick="addLabel()">Add Label</button>
                    <div id="addError" class="error"></div>
                    <div id="addSuccess" class="success"></div>
                </div>
                <div class="card">
                    <h3>Metrics</h3>
                    <div class="metrics" id="metrics">
                        <div class="metric">
                            <div class="metric-value" id="usersAdded">-</div>
                            <div class="metric-label">Users Added</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value" id="usersRemoved">-</div>
                            <div class="metric-label">Users Removed</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value" id="addFailures">-</div>
                            <div class="metric-label">Add Failures</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value" id="cursor">-</div>
                            <div class="metric-label">Current Cursor</div>
                        </div>
                    </div>
                    <h4 style="margin-top: 20px;">API Endpoints</h4>
                    <div style="font-size: 14px; line-height: 1.6;">
                        <div><strong>Health:</strong> <a href="/health" target="_blank">/health</a></div>
                        <div><strong>Cursor:</strong> <a href="/cursor" target="_blank">/cursor</a></div>
                        <div><strong>Metrics:</strong> <a href="/metrics" target="_blank">/metrics</a></div>
                    </div>
                </div>
            </div>
            <div class="card">
                <h3>Configured Labels</h3>
                <div id="labelsList"></div>
            </div>
        </div>
    </div>
    <script>
        let apiKey = '';
        async function login() {
            const key = document.getElementById('apiKey').value;
            if (!key) return;
            try {
                const response = await fetch('/admin/config', {
                    headers: { 'Authorization': \`Bearer \${key}\` }
                });
                if (response.ok) {
                    apiKey = key;
                    document.getElementById('loginForm').classList.add('hidden');
                    document.getElementById('adminPanel').classList.remove('hidden');
                    loadData();
                } else {
                    document.getElementById('loginError').textContent = 'Invalid API key';
                }
            } catch (error) {
                document.getElementById('loginError').textContent = 'Connection error';
            }
        }
        function logout() {
            apiKey = '';
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('adminPanel').classList.add('hidden');
            document.getElementById('apiKey').value = '';
            document.getElementById('loginError').textContent = '';
        }
        async function loadData() {
            await Promise.all([loadConfig(), loadMetrics(), loadCursor()]);
        }
        async function loadConfig() {
            try {
                const response = await fetch('/admin/config', {
                    headers: { 'Authorization': \`Bearer \${apiKey}\` }
                });
                const config = await response.json();
                renderLabels(config);
            } catch (error) {
                console.error('Failed to load config:', error);
            }
        }
        async function loadMetrics() {
            try {
                const response = await fetch('/metrics');
                const metrics = await response.json();
                document.getElementById('usersAdded').textContent = metrics.usersAdded || 0;
                document.getElementById('usersRemoved').textContent = metrics.usersRemoved || 0;
                document.getElementById('addFailures').textContent = metrics.addFailures || 0;
            } catch (error) {
                console.error('Failed to load metrics:', error);
            }
        }
        async function loadCursor() {
            try {
                const response = await fetch('/cursor');
                const cursor = await response.text();
                document.getElementById('cursor').textContent = cursor;
            } catch (error) {
                console.error('Failed to load cursor:', error);
            }
        }
        function renderLabels(config) {
            const container = document.getElementById('labelsList');
            container.innerHTML = config.map(label => \`
                <div class="label-item">
                    <div class="label-info">
                        <strong>\${label.label}</strong>
                        <span class="badge \${label.listType}">\${label.listType}</span>
                        \${!label.enabled ? '<span class="badge disabled">disabled</span>' : ''}
                    </div>
                    <div class="label-actions">
                        <select onchange="updateLabelType('\${label.label}', this.value)">
                            <option value="curate" \${label.listType === 'curate' ? 'selected' : ''}>Curate</option>
                            <option value="mod" \${label.listType === 'mod' ? 'selected' : ''}>Mod</option>
                        </select>
                        <button onclick="toggleLabel('\${label.label}')">
                            \${label.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button class="danger" onclick="removeLabel('\${label.label}')">Remove</button>
                    </div>
                </div>
            \`).join('');
        }
        async function addLabel() {
            const label = document.getElementById('newLabel').value.trim();
            const listType = document.getElementById('newLabelType').value;
            if (!label) return;
            try {
                const response = await fetch('/admin/labels', {
                    method: 'POST',
                    headers: {
                        'Authorization': \`Bearer \${apiKey}\`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ label, listType })
                });
                if (response.ok) {
                    document.getElementById('newLabel').value = '';
                    document.getElementById('addSuccess').textContent = 'Label added successfully';
                    document.getElementById('addError').textContent = '';
                    setTimeout(() => document.getElementById('addSuccess').textContent = '', 3000);
                    loadConfig();
                } else {
                    const error = await response.text();
                    document.getElementById('addError').textContent = error;
                    document.getElementById('addSuccess').textContent = '';
                }
            } catch (error) {
                document.getElementById('addError').textContent = 'Failed to add label';
                document.getElementById('addSuccess').textContent = '';
            }
        }
        async function removeLabel(label) {
            if (!confirm(\`Remove label "\${label}"?\`)) return;
            try {
                await fetch(\`/admin/labels/\${label}\`, {
                    method: 'DELETE',
                    headers: { 'Authorization': \`Bearer \${apiKey}\` }
                });
                loadConfig();
            } catch (error) {
                console.error('Failed to remove label:', error);
            }
        }
        async function toggleLabel(label) {
            try {
                await fetch(\`/admin/labels/\${label}/toggle\`, {
                    method: 'POST',
                    headers: { 'Authorization': \`Bearer \${apiKey}\` }
                });
                loadConfig();
            } catch (error) {
                console.error('Failed to toggle label:', error);
            }
        }
        async function updateLabelType(label, listType) {
            try {
                await fetch(\`/admin/labels/\${label}\`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': \`Bearer \${apiKey}\`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ listType })
                });
                loadConfig();
            } catch (error) {
                console.error('Failed to update label type:', error);
            }
        }
        setInterval(() => {
            if (!document.getElementById('adminPanel').classList.contains('hidden')) {
                loadMetrics();
                loadCursor();
            }
        }, 30000);
    </script>
</body>
</html>`))
})

const AdminLive = HttpApiBuilder.group(ServerApi, "Admin", (handlers) => {
  return handlers
    .handle("config", ({ request }) => 
      Effect.gen(function* () {
        yield* checkApiKey(request)
        return yield* ConfigService.loadConfig()
      })
    )
    .handle("addLabel", ({ request }) =>
      Effect.gen(function* () {
        yield* checkApiKey(request)
        const body = yield* HttpServerRequest.schemaBodyJson(Schema.Struct({
          label: Schema.String,
          listType: Schema.Literal("curate", "mod")
        }))(request)
        yield* ConfigService.addLabel(body.label, body.listType)
        return "Label added successfully"
      })
    )
    .handle("removeLabel", ({ request, path }) =>
      Effect.gen(function* () {
        yield* checkApiKey(request)
        yield* ConfigService.removeLabel(path)
        return "Label removed successfully"
      })
    )
    .handle("updateLabel", ({ request, path }) =>
      Effect.gen(function* () {
        yield* checkApiKey(request)
        const body = yield* HttpServerRequest.schemaBodyJson(Schema.Struct({
          listType: Schema.Literal("curate", "mod")
        }))(request)
        yield* ConfigService.updateLabelType(path, body.listType)
        return "Label updated successfully"
      })
    )
    .handle("toggleLabel", ({ request, path }) =>
      Effect.gen(function* () {
        yield* checkApiKey(request)
        yield* ConfigService.toggleLabel(path)
        return "Label toggled successfully"
      })
    )
})

// Provide the implementation for the API
const ServerApiLive = HttpApiBuilder.api(ServerApi).pipe(
  Layer.provide(Layer.merge(HealthLive, AdminLive)),
)

// Set up the server using BunHttpServer on port 3500
export const ApiLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ServerApiLive),
  HttpServer.withLogAddress,

  Layer.provide(BunHttpServer.layer({ port: 3500 })),
  Layer.provide(Layer.mergeAll(Cursor.Default, Metrics.Default, ConfigService.Default)),
)

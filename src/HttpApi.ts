import { Cursor } from "@/Cursor"
import { Metrics } from "@/Metrics"
import { ConfigService } from "@/ConfigService"
import { FileSystem } from "@effect/platform"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import { BunHttpServer, BunFileSystem } from "@effect/platform-bun"
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
    .handle("admin", () => 
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const html = yield* fs.readFileString("public/admin.html")
        return html
      })
    )
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
  Layer.provide(Layer.mergeAll(Cursor.Default, Metrics.Default, ConfigService.Default, BunFileSystem.layer)),
)

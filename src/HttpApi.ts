import { Cursor } from "@/Cursor"
import { Metrics } from "@/Metrics"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpServer,
} from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer, Schema } from "effect"

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
    .add(
      HttpApiEndpoint.get("not-found", "*").addSuccess(Schema.String),
    ),
).addError(
  HttpApiError.NotFound,
  {
    status: 404,
  },
)

const NotFound = () => Effect.fail(new HttpApiError.NotFound())

// Implement the "Health" group
const HealthLive = HttpApiBuilder.group(ServerApi, "Health", (handlers) => {
  return handlers
    .handle(
      "not-found",
      NotFound,
    )
    .handle("health", () => Effect.succeed("Looks ok."))
    .handle("cursor", () => Cursor.get)
    .handle("metrics", () => Metrics.getMetrics)
})

// Provide the implementation for the API
const ServerApiLive = HttpApiBuilder.api(ServerApi).pipe(
  Layer.provide(HealthLive),
)

// Set up the server using BunHttpServer on port 3500
export const ApiLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ServerApiLive),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: 3500 })),
  Layer.provide(Layer.merge(Cursor.Default, Metrics.Default)),
)

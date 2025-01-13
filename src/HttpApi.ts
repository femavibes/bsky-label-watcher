import { Cursor } from "@/Cursor"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpServer,
} from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer, Schema } from "effect"

// A simple API for checking on the service
const ServerApi = HttpApi.make("ServerApi").add(
  HttpApiGroup.make("Health")
    .add(
      HttpApiEndpoint.get("health-check")`/health`.addSuccess(
        Schema.String,
      ),
    )
    .add(HttpApiEndpoint.get("cursor")`/cursor`.addSuccess(Schema.Number)),
)

// Implement the "Health" group
const HealthLive = HttpApiBuilder.group(ServerApi, "Health", (handlers) => {
  return handlers
    .handle("health-check", () => Effect.succeed("Looks ok."))
    .handle("cursor", () => Cursor.get)
})

// Provide the implementation for the API
export const ServerApiLive = HttpApiBuilder.api(ServerApi).pipe(
  Layer.provide(HealthLive),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({})),
)

// an effect that starts the server and runs until interrupted
const run = Layer.launch(ServerApiLive)

export class Api extends Effect.Service<Api>()("@labelwatcher/Api", {
  accessors: true,
  succeed: { runApi: run },
}) {
}

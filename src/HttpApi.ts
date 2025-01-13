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

// Define our API with one group named "Greetings" and one endpoint called "hello-world"
const ServerApi = HttpApi.make("ServerApi").add(
  HttpApiGroup.make("Health")
    .add(HttpApiEndpoint.get("hello-world")`/`.addSuccess(Schema.String))
    .add(
      HttpApiEndpoint.get("health-check")`/health-check`.addSuccess(
        Schema.String,
      ),
    )
    .add(HttpApiEndpoint.get("cursor")`/cursor`.addSuccess(Schema.Number)),
)

// Implement the "Greetings" group
const HealthLive = HttpApiBuilder.group(ServerApi, "Health", (handlers) => {
  return handlers
    .handle("hello-world", () => Effect.succeed("Hello, World!"))
    .handle("health-check", () => Effect.succeed("Looks ok."))
    .handle("cursor", () => Cursor.get)
})

// Provide the implementation for the API
export const ServerApiLive = HttpApiBuilder.api(ServerApi).pipe(
  Layer.provide(HealthLive),
  HttpServer.withLogAddress,
  Layer.provide(Cursor.Default),
  Layer.provide(BunHttpServer.layer({})),
)

const run = Layer.launch(ServerApiLive)

export class Api extends Effect.Service<Api>()("@ldr/Api", {
  accessors: true,
  succeed: { runApi: run },
}) {
}

// Launch the server
// Layer.launch(ServerLive).pipe(BunRuntime.runMain)

import { Did } from "#/packages/shared"
import { Schema } from "effect"

const LabelsType = Schema.Literal("#labels")

export const Header = Schema.Struct({
  t: Schema.String,
  op: Schema.Literal(1, -1),
})
export type Header = Schema.Schema.Type<typeof Header>
export const parseHeader = Schema.decode(Header)

const MessageError = Schema.Struct({
  op: Schema.Literal(-1),
  t: Schema.Unknown,
  body: Schema.Struct({ error: Schema.Unknown }),
})

const MessageUnknown = Schema.Struct({
  op: Schema.Literal(1),
  t: Schema.String,
  body: Schema.Unknown,
})

export const Label = Schema.String.pipe(
  Schema.brand("@@atproto/label"),
).annotations({
  description: "The label being removed or applied",
})
export type Label = Schema.Schema.Type<typeof Label>

const LabelBody = Schema.Struct({
  cts: Schema.Unknown,
  src: Did.annotations({
    description: "The did of the labeler",
  }),
  uri: Did.annotations({
    description: "The did of the subject",
  }),
  neg: Schema.optional(Schema.Boolean).annotations({
    description: "Indicates if the label is being removed",
  }),
  val: Label,
  ver: Schema.Literal(1),
  sig: Schema.Struct({
    buf: Schema.Uint8Array,
  }),
})

export const MessageLabels = Schema.Struct({
  op: Schema.Literal(1),
  t: LabelsType,
  body: Schema.Struct({
    seq: Schema.Number.pipe(Schema.positive()).annotations({
      description:
        "The id of the latest label, to be used as a cursor when reconnecting.",
    }),
    labels: Schema.Array(LabelBody),
  }),
})
export type MessageLabels = Schema.Schema.Type<typeof MessageLabels>

export const SubscribeLabelsMessage = Schema.Union(
  MessageError,
  MessageUnknown,
  MessageLabels,
)
export type SubscribeLabelsMessage = Schema.Schema.Type<
  typeof SubscribeLabelsMessage
>
export const parseSubscribeLabelsMessage = Schema.decode(SubscribeLabelsMessage)

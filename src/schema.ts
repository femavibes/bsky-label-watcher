import { AtUri } from "@atproto/api"
import { Schema } from "effect"

/**
 * Effect Schema for AtProto APIs
 *
 * This should eventually be moved out into a separate package and made complete.
 */

export const DidTypeId = Symbol.for("@@did")
export const Did = Schema.TemplateLiteral("did:", Schema.String).pipe(
  Schema.brand(DidTypeId),
  Schema.annotations({
    identifier: "Did",
  }),
)
export type Did = Schema.Schema.Type<typeof Did>

export const CidTypeId = Symbol.for("@@cid")
export const Cid = Schema.NonEmptyString.pipe(Schema.brand(CidTypeId))
export type Cid = Schema.Schema.Type<typeof Cid>

export const HandleTypeId = Symbol.for("@@handle")
export const Handle = Schema.String.pipe(Schema.brand(HandleTypeId))
export type Handle = Schema.Schema.Type<typeof Handle>

export const RkeyTypeId = Symbol.for("@@rkey")
export const Rkey = Schema.String.pipe(Schema.brand(RkeyTypeId))
export type Rkey = Schema.Schema.Type<typeof Rkey>

export const AtUriPrefix = Schema.Literal("at://")

// we can't make this a union of other template literals yet
export const HandleOrDid = Schema.Union(Handle, Did)

export const AtUriSchema = Schema.TemplateLiteral(AtUriPrefix, Schema.String)
export type AtUriSchemaType = Schema.Schema.Type<typeof AtUriSchema>

export const BskyPostCollection = Schema.Literal("app.bsky.feed.post")
export type BskyPostCollection = Schema.Schema.Type<typeof BskyPostCollection>

export const BskyPostUrlTuple = Schema.TemplateLiteralParser(
  "https://bsky.app/profile/",
  Handle,
  "/post/",
  Rkey,
)
export type BskyPostUrlTuple = Schema.Schema.Type<typeof BskyPostUrlTuple>
export type BskyPostUrl = Schema.Schema.Encoded<typeof BskyPostUrlTuple>

export const parseBskyPostUrl = (url: string) =>
  Schema.decodeUnknown(BskyPostUrlTuple)(url)

export function makePostUri(userDid: Did, rkey: Rkey): string {
  return AtUri.make(userDid, "app.bsky.feed.post", rkey).toString()
}

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
  uri: Schema.Union(Did, AtUriSchema).annotations({
    description:
      "The DID of the subject (for account labels) or the AT-URI of the content (for record labels)",
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

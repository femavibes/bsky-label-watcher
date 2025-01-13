# Bluesky Directory Maker

A Typescript service for creating lists based on a Bluesky labeler's labels. The server will subscribe to the configured labeler, and create a list on the labeler account for each configured label. It will then replay all of the labeler's actions to populate the lists.

## Configuration

The expected environment variables are:

```
# No need to provide this unless you'd like the override the default
BSKY_SERVICE="https://bsky.social"

############################   Labeler Info   #########################
# this is the endpoint used by the Bluesky relay to subscribe to labels.
# start the cursor at 0 to get all labels ever applied
LABELER_SOCKET_URL=wss://<labeler-domain>/xrpc/com.atproto.label.subscribeLabels?cursor=0
LABELER_DID=
# should be an App Password
LABELER_APP_PASSWORD=

############################  Machine Config  #########################
# (defaults shown)
LABELER_CURSOR_FILEPATH=cursor.txt
LOG_FILEPATH=log.txt

############################    List Config   #########################
# A comma separated list of labels to subscribe to and generate lists for
LABELS_TO_LIST=label-identifier-a,label-identifier-b,label-identifier-c
```

## Deploying

The easiest way to deploy this service is to use the "Deploy to Render" button below. This will create a new service on Render, and configure it with the environment variables in the Render dashboard.

<a href="https://render.com/deploy?repo=https://github.com/kristojorg/bsky-labeler-directory">
<img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" />
</a>

## Running Code

This packages uses Bun and Effect.

```
pnpm i
```

```
pnpm start
```

## TODO

- [ ] Add tests

## Operations

**Building**

To build the package:

```sh
pnpm build
```

**Testing**

To test the package:

```sh
pnpm test
```

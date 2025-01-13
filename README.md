# Bluesky Label Watcher

Make lists from your Bluesky labeler! 

A Typescript service for creating lists based on a Bluesky labeler's labels. The server will subscribe to the configured labeler, and create a list on the labeler account for each configured label. It will then replay all of the labeler's actions to populate the lists.

## Features

*  Sets up lists on your labelers account based on your label's display name and description.
*  Subscribes to your labeler's websocket
    *  Allows starting from `cursor=0` to get all existing labels
*  Retries the socket on failures
*  Validates payloads as label messages
*  Adds or removes users from lists in order of labeling.
    * Does not resolve net changes before applying, so adding a label then removing the label will result in two actions when it could be none.
*  Saves cursor state to filesystem every 1 second to reconnect at the last known value across deploys or disconnects.
*  Has a basic HttpApi:
    * GET /health
    * GET /cursor

## Configuration

The expected environment variables are:

```sh
# (default shown)
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
# DEBUG, INFO, WARNING, FATAL, NONE, ALL
LOG_LEVEL=INFO

############################    List Config   #########################
# A comma separated list of labels to subscribe to and generate lists for
LABELS_TO_LIST=label-identifier-a,label-identifier-b,label-identifier-c
```

## Deploying

The easiest way to deploy this service is to use the "Deploy to Render" button below. Using this button will create a new service on Render which you can configure. It will not have auto-deploy enabled, so you will need to manually redeploy the service if you want to pull in new updates from this git repo.

<a href="https://render.com/deploy?repo=https://github.com/kristojorg/bsky-labeler-watcher">
<img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" />
</a>


Alternatively, you may clone this repository and deploy it to whatever service you prefer. I would gladly accept PRs to add alternative deploy buttons or a Dockerfile!

## Making changes

When you apply a label to an account, it will automatically add that account to the list for that label (if you have enabled it). If you create a _new label_ in your labeler, and you want to create a list for it, you will need to update the `LABELS_TO_LIST` environment variable and redeploy the service.

Ensure that you update the `LABELS_TO_LIST` environment variable with the new label id and redeploy **before applying any labels with it**. If you don't, the service will "miss" any labels that were applied before you updated. If this happens, you can fix it by rewinding the cursor in the `LABELER_CURSOR_FILEPATH` file and redeploying.

## Rate limits

Bluesky has a [pretty sensible rate limits](https://docs.bsky.app/docs/advanced-guides/rate-limits), and I wouldn't expect this service to hit them. However, if you do run in to them, please open an issue and we can make the service a little more rate-limit-aware.

# Development

This packages uses [Bun](https://bun.sh/) and [Effect](https://effect.website/). Effect can be a bit intimidating at first, but it is an extremely powerful tool that has enabled me to develop this package with much more certainty and developer efficiency than I would have had otherwise.

First install dependencies:
```sh
pnpm i
```

Then start the development server:
```sh
pnpm dev
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

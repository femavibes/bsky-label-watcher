# Bluesky Label Watcher

Make lists from your Bluesky labeler! 

A Typescript service for creating lists based on a Bluesky labeler's labels. The server will subscribe to the configured labeler, and create a list on the labeler account for each configured label. It will then replay all of the labeler's actions to populate the lists.

## Features

*  **Supports both regular and moderation lists** - Configure per-label whether to create curate lists or mod lists
*  Sets up lists on your labelers account based on your label's display name and description.
    * Initializes lists with the same name and description as the label in your labelers service record.
*  Subscribes to your labeler's websocket
    *  Allows starting from `cursor=0` to get all existing labels
*  **Retry logic with exponential backoff** - Automatically retries failed operations 3 times
*  **Prevents duplicate notifications** - Checks if users are already in lists before adding during backfill
*  **Handles large lists** - Supports lists with more than 100 members via pagination
*  Retries the socket on failures
*  Validates payloads as label messages
*  Adds or removes users from lists in order of labeling.
*  Saves cursor state to filesystem every 1 second to reconnect at the last known value across deploys or disconnects.
*  **Comprehensive metrics and auditing**:
    * GET /health
    * GET /cursor  
    * GET /metrics - Track success rates, failures, and per-label statistics
*  Writes logs to both `stdout` and `LOG_FILEPATH` (default: `log.txt`)
*  **Runs on port 3501** by default (3500 internally)

## Configuration

The expected environment variables are:

```sh
# (default shown)
BSKY_SERVICE="https://bsky.social"

############################   Labeler Info   #########################
# this is the endpoint used by the Bluesky relay to subscribe to labels.
# The service will automatically append the correct cursor.
# Do NOT include `?cursor=` in this URL.
LABELER_SOCKET_URL=wss://<labeler-domain>/xrpc/com.atproto.label.subscribeLabels
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
# Format: "label" (defaults to curate list) or "label:type" where type is "curate" or "mod"
# Examples: "spam:mod,quality-content:curate,news" (news defaults to curate)
# The first label will appear at the top of the Bluesky Lists page.
LABELS_TO_LIST=label-identifier-a:curate,label-identifier-b:mod,label-identifier-c
```

## Deploying

### Docker (Recommended)

**Quick Start - 3 commands:**

```bash
# Download the config files
wget https://raw.githubusercontent.com/femavibes/bsky-label-watcher/main/docker-compose.yml
wget https://raw.githubusercontent.com/femavibes/bsky-label-watcher/main/.env

# Edit .env with your credentials
nano .env

# Run the service
docker compose up -d
```

**That's it!** The service will:
- Pull the latest image automatically
- Create a `data/` directory for persistent storage
- Run on port 3501 with auto-restart

#### Manual Docker Run

If you prefer not to use docker-compose:

```bash
wget https://raw.githubusercontent.com/femavibes/bsky-label-watcher/main/.env
nano .env  # Edit with your credentials
mkdir data

docker run -d \
  --name label-watcher \
  --pull always \
  -v $(pwd)/data:/var/data \
  --env-file .env \
  -e LABELER_CURSOR_FILEPATH=/var/data/cursor.txt \
  -e LOG_FILEPATH=/var/data/log.txt \
  -p 3501:3500 \
  --restart unless-stopped \
  ghcr.io/femavibes/bsky-label-watcher:latest
```

#### Accessing the API
Once running, you can access:
- Health check: `http://localhost:3501/health`
- Current cursor: `http://localhost:3501/cursor`  
- Metrics & auditing: `http://localhost:3501/metrics`

#### Backfilling Historical Data

To populate lists with users who were labeled before the service started:

```bash
# Backfill a specific label
docker compose exec label-watcher node backfill.js carbrain

# Backfill multiple labels
docker compose exec label-watcher node backfill.js nimby
docker compose exec label-watcher node backfill.js spam
```

The backfill script will:
- Query your labeler for all historical users with the specified label
- Find the matching list in your Bluesky account
- Add users to the list (skipping duplicates)
- Show progress as it runs


### Render

The easiest way to deploy this service is to use the "Deploy to Render" button below. Using this button will create a new service on Render which you can configure. It will not have auto-deploy enabled, so you will need to manually redeploy the service if you want to pull in new updates from this git repo.

<a href="https://render.com/deploy?repo=https://github.com/femavibes/bsky-label-watcher">
<img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" />
</a>

### Other

You may also clone the repo and deploy it another way, or submit a PR to add a deployment method.

## Making changes

When you apply a label to an account, it will automatically add that account to the list for that label (if you have enabled it). If you create a _new label_ in your labeler, and you want to create a list for it, you will need to update the `LABELS_TO_LIST` environment variable and redeploy the service.

Ensure that you update the `LABELS_TO_LIST` environment variable with the new label id and redeploy **before applying any labels with it**. If you don't, the service will "miss" any labels that were applied before you updated. If this happens, you can fix it by rewinding the cursor in the `LABELER_CURSOR_FILEPATH` file and redeploying.

## Metrics & Auditing

The service provides comprehensive metrics at `http://localhost:3500/metrics` to track:

- **Global stats**: Total users added/removed, failures, retries
- **Per-label breakdown**: Success/failure rates for each specific label
- **Audit trail**: Exactly how many users with each label were successfully added to lists

Example metrics output:
```json
{
  "usersAdded": 150,
  "usersRemoved": 23, 
  "addFailures": 2,
  "removeFailures": 1,
  "addRetries": 5,
  "removeRetries": 2,
  "labelStats": {
    "spam": {
      "added": 45,
      "removed": 12,
      "addFailures": 1,
      "removeFailures": 0
    }
  }
}
```

## List Types

You can now create both regular curation lists and moderation lists:

- **Curate lists** (`label:curate` or just `label`): Regular lists that users can subscribe to
- **Moderation lists** (`label:mod`): Moderation lists for blocking/filtering

Example configuration:
```bash
LABELS_TO_LIST=spam:mod,harassment:mod,quality-content:curate,news
```

## Rate limits

Bluesky has a [pretty sensible rate limits](https://docs.bsky.app/docs/advanced-guides/rate-limits), and I wouldn't expect this service to hit them. However, if you do run in to them, please open an issue and we can make the service a little more rate-limit-aware.

# Development

This packages uses [Bun](https://bun.sh/) and [Effect](https://effect.website/). Effect can be a bit intimidating at first, but it is an extremely powerful tool that has enabled me to develop this package with much more certainty and developer efficiency than I would have had otherwise.

First install dependencies:
```sh
bun i
```

Then start the development server:
```sh
bun dev
```

## TODO

- [ ] Add tests
- [ ] Allow more sophisticated list configuration
  - [ ] Custom list names
  - [ ] Custom list descriptions
- [ ] Export as a package to integrate into a larger server

## Operations

### Building

When run using Bun, you don't need to build this package. Just run the source code directly using Bun.

```sh
bun dev
```

### Testing

To test the package:

```sh
bun test
```# Docker Image Available at ghcr.io/femavibes/bsky-label-watcher

# OAuth verification reviewer runbook

## Application identity

- Application: `gswitch`
- Google Cloud project: `supercorks-gswitch`
- Project number: `1015770073522`
- Desktop OAuth client ID: `1015770073522-ht4vkjoaaq0n3n1ipg92no747sdqi569.apps.googleusercontent.com`
- Application type: local command-line integration platform

The application has no hosted login, application password, server-side test
tenant, or backend that receives Google user data. Reviewers authenticate with a
Google-owned test account. The staging package contains only the Desktop OAuth
client configuration needed to identify gswitch to Google. It never contains a
Google user access token, refresh token, or account password.

## Prerequisites

1. Install Node.js 16 or later.
2. Install the Google Cloud CLI and `@googleworkspace/cli` (`gws`).
3. Install the supplied staging package:

```bash
npm install -g @googleworkspace/cli
npm install -g /path/to/supercorks-gswitch-review.tgz
```

## Authorization

Choose a short local alias and substitute the reviewer's Google account email:

```bash
gswitch new review reviewer@example.com --gmail --calendar --drive --force-consent
```

`--force-consent` makes the complete consent screen visible even if the reviewer
account previously authorized gswitch. This opens one gswitch OAuth flow. Expand
**Show all services** and verify that
the browser address bar contains the gswitch client ID listed above. The
authorization request contains exactly these submitted scopes:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/cloud-platform
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/drive
```

After consent, gswitch saves the authorized-user credential locally with file
mode `0600`. It configures the named gcloud profile, Application Default
Credentials, Google client libraries, and `gws` to use that same credential.

## Console scope justifications

### Calendar and Google Cloud

gswitch is a local CLI integration platform for user-directed agents and
scripts. `--calendar` opts into full Calendar management: list, read, create,
update, share, and delete calendars and events. Calendar event or read-only
scopes cannot manage calendars or perform writes. `cloud-platform` lets the same
selected-account credential run gcloud and Google Cloud client-library commands
against resources the user can access, including create, update, and delete
workflows; `cloud-platform.read-only` cannot support those writes. One OAuth flow
creates one local ADC for gcloud, client libraries, and gws. gswitch has no
backend; Google data flows only between the user's computer and Google APIs.

### Drive

Users explicitly opt into Drive access with `--drive`. Local agents and scripts
can find, read, create, update, move, and trash arbitrary existing files across
My Drive and shared drives, including Docs and Sheets operations. `drive.file`
is insufficient because it is limited to app-created or picker-selected files;
gswitch is a local CLI with no Google Picker and must operate on existing files
selected by user commands. Separate Docs and Sheets scopes are unnecessary
because `drive` authorizes those APIs. The credential and data remain on the
user's computer; gswitch has no backend.

### Gmail

Users explicitly opt into Gmail access with `--gmail`. User-directed gws
commands can search and read existing messages, create and delete drafts, create
and manage labels, and change message state such as read, unread, starred,
archived, or trashed. `gmail.readonly` and `gmail.metadata` cannot perform these
changes, while `gmail.compose` cannot manage existing messages or labels.
`gmail.modify` supports these workflows without granting permanent message
deletion. The credential and message data remain on the user's computer;
gswitch has no backend.

## Functional verification

All commands run in the isolated `review` account context. They do not change a
different globally active Google account.

### Google Cloud

Choose a Cloud Storage bucket that the reviewer account can write to, then create,
inspect, and remove one disposable object:

```bash
printf 'gswitch OAuth verification review\n' > /tmp/gswitch-oauth-review.txt
gswitch run review -- gcloud storage cp \
  /tmp/gswitch-oauth-review.txt \
  gs://REVIEW_BUCKET/gswitch-oauth-review/demo.txt
gswitch run review -- gcloud storage objects describe \
  gs://REVIEW_BUCKET/gswitch-oauth-review/demo.txt
gswitch run review -- gcloud storage rm \
  gs://REVIEW_BUCKET/gswitch-oauth-review/demo.txt
```

The `cloud-platform` scope is required because users run arbitrary user-directed
Google Cloud CLI and client-library operations against resources their selected
account can access. The read-only variant would prevent create, update, and delete
workflows. `gswitch run` points Cloud SDK at the same local ADC created by the
consent flow; it does not fall back to a separately authenticated Cloud SDK user.

### Gmail

Create a disposable label and draft, then update both. The example raw values are
base64url-encoded RFC 2822 messages. Copy the returned label and draft IDs:

```bash
gswitch run review -- gws gmail users labels create \
  --params '{"userId":"me"}' \
  --json '{"name":"gswitch OAuth review","labelListVisibility":"labelShow","messageListVisibility":"show"}'
gswitch run review -- gws gmail users drafts create \
  --params '{"userId":"me"}' \
  --json '{"message":{"raw":"VG86IHJldmlld2VyQGV4YW1wbGUuY29tDQpTdWJqZWN0OiBnc3dpdGNoIE9BdXRoIHJldmlldw0KDQpEaXNwb3NhYmxlIHJldmlldyBkcmFmdC4"}}'
gswitch run review -- gws gmail users labels update \
  --params '{"userId":"me","id":"LABEL_ID"}' \
  --json '{"id":"LABEL_ID","name":"gswitch OAuth review - updated","labelListVisibility":"labelShow","messageListVisibility":"show"}'
gswitch run review -- gws gmail users drafts update \
  --params '{"userId":"me","id":"DRAFT_ID"}' \
  --json '{"id":"DRAFT_ID","message":{"raw":"VG86IHJldmlld2VyQGV4YW1wbGUuY29tDQpTdWJqZWN0OiBnc3dpdGNoIE9BdXRoIHJldmlldyAtIHVwZGF0ZWQNCg0KVGhpcyBkaXNwb3NhYmxlIGRyYWZ0IHdhcyB1cGRhdGVkLg"}}'
```

Confirm the updated draft and label in Gmail. Then remove only those disposable
items:

```bash
gswitch run review -- gws gmail users drafts delete \
  --params '{"userId":"me","id":"DRAFT_ID"}'
gswitch run review -- gws gmail users labels delete \
  --params '{"userId":"me","id":"LABEL_ID"}'
```

The `gmail.modify` scope supports reading mail plus user-directed message-state,
draft, and label changes without granting permanent message deletion.

### Calendar

Create a disposable secondary calendar:

```bash
gswitch run review -- gws calendar calendars insert \
  --json '{"summary":"gswitch OAuth review","timeZone":"America/Toronto"}'
```

Copy the returned calendar `id`, then create an event and confirm it in Google
Calendar:

```bash
gswitch run review -- gws calendar events insert \
  --params '{"calendarId":"CALENDAR_ID"}' \
  --json '{"summary":"gswitch review event","start":{"dateTime":"2026-09-01T14:00:00-04:00"},"end":{"dateTime":"2026-09-01T14:30:00-04:00"}}'
gswitch run review -- gws calendar events patch \
  --params '{"calendarId":"CALENDAR_ID","eventId":"EVENT_ID"}' \
  --json '{"summary":"gswitch review event - updated"}'
```

After review, delete only the disposable secondary calendar:

```bash
gswitch run review -- gws calendar calendars delete \
  --params '{"calendarId":"CALENDAR_ID"}'
```

Full Calendar access is required for users who direct local agents to manage
calendars as well as events; event-only scopes cannot create, update, or remove
calendars.

### Drive

Select a pre-existing disposable file that was created outside gswitch. Rename
it and confirm the change in Google Drive:

```bash
gswitch run review -- gws drive files update \
  --params '{"fileId":"FILE_ID","fields":"id,name,webViewLink"}' \
  --json '{"name":"gswitch OAuth review fixture - updated"}'
gswitch run review -- gws drive files update \
  --params '{"fileId":"FILE_ID","fields":"id,name,webViewLink"}' \
  --json '{"name":"gswitch OAuth review fixture - original"}'
```

Full Drive access is required because a local CLI has no Google Picker and users
direct agents to operate on arbitrary existing files. `drive.file` is limited to
files created by the app or explicitly shared with it through a picker.

## Expected isolation result

```bash
gswitch run review -- gws gmail users getProfile --params '{"userId":"me"}'
gswitch run review -- gcloud config get-value account
```

Both commands must identify the same reviewer-selected Google account. Removing
the local alias with `gswitch rm review` deletes its local profile and credentials
without deleting Google data or revoking another account.

# Verifi

Verifi is a Nigeria-first product verification pilot for packaged food and drinks. It separates regulatory registration from evidence about an individual pack. A recognised serial can be copied, and an unknown code is inconclusive.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm test
VERIFI_BUSINESS_KEY='choose-a-long-random-key' VERIFI_ADMIN_KEY='choose-a-different-long-random-key' npm start
```

Open http://127.0.0.1:3000. The workspace keys enable the manufacturer and administrator views respectively. Omit a key to disable that workspace. Use HTTPS for camera and location outside localhost. The database defaults to `.verifi/verifi.sqlite`. Set `VERIFI_DB` to use a different database file. Keep the file private.

Try `DEMO-1204` for a sample registration, `DEMO-2306` for a sample expired registration, and `VF-DEMO-001` for a sample item serial. Lookups show the recorded source and check date. Demo records are fictional. Manufacturers can add catalogue entries and download QR labels for newly issued serials. Administrators can import sourced registration records, review reports and download case records for manual referral. Imported records are snapshots of their sources.

Report location is optional and submitted only with the report. Scan history is stored in the current browser. The admin workspace is the only role that can see report contents and locations.

## Pilot scope

This release is a responsive web application with a web manifest. Native iOS and Android packages, live NAFDAC/SON feeds, verified multi-company accounts, report photo uploads, recall alerts, automated referrals and advertising are future work. Shared role keys and anonymous reports and reviews are intended for a controlled pilot. Before public deployment, add individual accounts and tenant isolation, abuse controls, review moderation, and a location retention policy.

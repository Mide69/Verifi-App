# Verifi | Nigeria pilot

A product verification pilot with a public site, server-backed workspaces and a separate sample walkthrough.

## Run on Windows

If v1 is running, stop it with Ctrl+C in its PowerShell window. Extract this ZIP into a new folder, open PowerShell in the extracted folder (the one containing package.json), and run:

```powershell
npm.cmd ci
npm.cmd start
```

Open http://localhost:3000 for the public site. The sample walkthrough is at `/demo`. If the previous screen is still displayed, press Ctrl+F5. Browser data from the previous version is retained when using the same localhost address. Press Ctrl+C in PowerShell to stop the server. Run `npm.cmd test` to check the verification and case-grouping rules.

## Walk through the pilot

On Home, try both pack checks. Pack B loads fictional cross-area scan evidence and shows an unusual-activity result. Submit a report from that result, then use its reference to follow it in History and in the investigation evidence.

Start a consumer demo session. Check `VF-DEMO-001` for a matching rice pack, `DEMO-NG-1001` for registration only, `VF-DEMO-EXPIRED` for an expiry warning, or any unknown code. Enter Lagos and Ikeja in a private report to join the seeded case. Explore the catalogue, post a review or discussion, and check your history.

Switch to Operator, open Cases, and refer the rice case to NAFDAC. Switch to Regulator to inspect the case, mark it confirmed in the demo, or export an aggregate case summary. Select SON to see its separately scoped view.

In Company, use the approved sample workspace to add a product and batch, then open QR labels for a downloadable SVG or export the serial list. You can also submit a sample company application, approve it in Operator, then return to Company to add products under the approved workspace.

## Demo boundaries

Use fictional data only. Workspaces share browser-local data on this device, and the role switch intentionally simulates access. Sign-in choices are simulated. Registration records are sample data. Referrals stay inside the demo. Camera detection depends on browser support and permission, so every check also accepts typed codes. Locations are entered manually as state and LGA. Clear the site's browser data to reset the pilot.

## Server-backed workspace

Open `http://localhost:3000/live` (or `http://localhost:3001/live` if using port 3001). The sample environment is at `/demo`. The product workspace starts with an empty database and stores data in `data/verifi.sqlite`. Use Node.js 24. Run `npm.cmd test` to exercise the HTTP workflow and role boundaries.

Shoppers register in the browser with an email and password. A Verifi administrator verifies partners out of band before creating accounts. From PowerShell, repeat the following for each account with a distinct password:

```powershell
Read-Host -MaskInput 'Manufacturer password' | node provision.mjs manufacturer manufacturer@example.test "Example Foods"
Read-Host -MaskInput 'Operator password' | node provision.mjs operator operator@example.test
Read-Host -MaskInput 'Regulator password' | node provision.mjs regulator regulator@example.test NAFDAC
```

Use the same working directory and `VERIFI_DB` setting for provisioning and serving. Manufacturer accounts have individually scoped catalogues. The operator chooses the referral agency, and only a regulator account provisioned for that agency can acknowledge the referral. A code match means the issued serial exists in Verifi. The workspace has no live registration or government integration.

This is a private pilot foundation. Before public deployment it needs verified email and recovery, MFA for privileged users, partner onboarding and revocation, backup and restore verification, abuse monitoring and a security review. If running a private pilot behind an HTTPS reverse proxy, set `VERIFI_ORIGIN` to the exact public origin and `VERIFI_SECURE_COOKIE=1`. Keep SQLite on a persistent volume and protect the database and its WAL files. Do not use real agency credentials or regulated records without an agreed pilot process.


## Public site and company onboarding

Home (`/`) shows aggregate activity from the live database. Product checks are counted
from this release onward. The sample environment is at `/demo` and its actions do
not affect live totals. Shopper signup and sign-in use separate forms.

The company form creates a private application and returns a reference. Operators
can view submissions in the live workspace. Verify the company and product details
before provisioning a manufacturer account using the existing CLI. The form does
not grant access or send email. Approved manufacturers sign in to register batches
and issue pack codes.

## Report submission retries

The live shopper form assigns a random request ID to each report form. Retrying the
same form with the same details returns its original reference, including after a
server restart or case referral. Duplicate retries do not add reports, submission
audit events or public report totals. A changed payload with the same request ID
returns a conflict instead of silently overwriting evidence. IDs are scoped to the
authenticated shopper. The additional SQLite table is created on startup without
altering existing reports.

This protection lasts while that form remains open. Reloading, signing out or
starting another check creates a new form: check Your reports before submitting
again. The ID stays in page memory; report text is not added to browser storage.
Older API clients may omit `requestId` for compatibility and do not receive retry
protection. New API clients should generate a UUID v4 once per report intention,
then retain it unchanged with the same code, area and reason for retries.

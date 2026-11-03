# Verifi | Nigeria pilot

A local demo for trying consumer product checks, manufacturer onboarding and pack labelling, regulator surveillance, and Verifi operations.

## Run on Windows

If v1 is running, stop it with Ctrl+C in its PowerShell window. Extract this ZIP into a new folder, open PowerShell in the extracted folder (the one containing package.json), and run:

```powershell
npm.cmd ci
npm.cmd start
```

Open http://localhost:3000 in your browser. The header reads **DEMO DATA · V5**. If the previous screen is still displayed, press Ctrl+F5. Browser data from the previous version is retained when using the same localhost address. Press Ctrl+C in PowerShell to stop the server. Run `npm.cmd test` to check the verification and case-grouping rules.

## Walk through the pilot

Start a consumer demo session. Check `VF-DEMO-001` for a matching rice pack, `DEMO-NG-1001` for registration only, `VF-DEMO-EXPIRED` for an expiry warning, or any unknown code. Enter Lagos and Ikeja in a private report to join the seeded case. Explore the catalogue, post a review or discussion, and check your history.

Switch to Operator, open Cases, and refer the rice case to NAFDAC. Switch to Regulator to inspect the case, mark it confirmed in the demo, or export an aggregate case summary. Select SON to see its separately scoped view.

In Company, use the approved sample workspace to add a product and batch, then open QR labels for a downloadable SVG or export the serial list. You can also submit a sample company application, approve it in Operator, then return to Company to add products under the approved workspace.

## Demo boundaries

Use fictional data only. Workspaces share browser-local data on this device, and the role switch intentionally simulates access. Sign-in choices are simulated. Registration records are sample data. Referrals stay inside the demo. Camera detection depends on browser support and permission, so every check also accepts typed codes. Locations are entered manually as state and LGA. Clear the site's browser data to reset the pilot.

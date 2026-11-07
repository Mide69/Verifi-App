# Retrying a referral or acknowledgement

`POST /api/report-action` accepts retries of the same report transition after a
lost response. An operator repeating `refer` for the same agency receives HTTP 200
with the current `{agency, stage}`. If the assigned regulator has already
acknowledged the case, the response remains `acknowledged`; it is never regressed.
A regulator repeating `acknowledge` receives the current state only when their
account belongs to the assigned agency. Each real transition writes one audit
event, retaining the actor and timestamp of the first successful action.

Changing the agency after referral still returns 409. This endpoint does not
correct routing. Other roles, invalid actions, unknown reports and wrong-agency
acknowledgements retain their existing rejection behavior. Retries survive server
restart without a new table or client request key. Existing clients that ignore
the response body remain compatible.

A referral means the report is available to an assigned agency account inside
Verifi. Acknowledgement records an action by that account. Neither state proves
external delivery, an independently verified agency receipt, investigation or
resolution. External agency integration, escalation and routing correction remain
separate product requirements.

The regression test exercises the real HTTP handler and a temporary SQLite file
with fictional accounts and reports. It checks concurrent retries, cross-agency
and role rejection, prevention of rerouting and state regression, restart
persistence, unchanged report totals and exactly one audit event per transition.
It is not evidence of a live agency integration, mobile usability or pilot
traction.

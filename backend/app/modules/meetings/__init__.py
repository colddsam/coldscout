"""
Native in-app video meetings (branded LiveKit rooms).

Replaces external Google Meet / Calendly links with a white-labeled room
served at ``/meet/{room_id}``. The freelancer (host) sees the lead's CRM /
audit data in a sidebar during the call; guests get a branded waiting room;
and the linked lead is auto-advanced to "interviewed" once the meeting
exceeds the configured threshold.

Submodules
----------
* ``livekit_client`` — lazy SDK wrapper: token issuance + webhook verification.
* ``service``        — DB/business logic: room CRUD, branding, CRM, notes,
                       lifecycle, and the 5-minute interview rule.
* ``transcription``  — optional, config-gated post-call transcription + AI
                       summary / next-steps (no-op unless configured).

Everything degrades gracefully: when LiveKit is unconfigured the API layer
returns a clean 503 and the rest of the platform is unaffected.
"""

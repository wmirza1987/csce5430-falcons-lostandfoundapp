# Test case traceability (Phase 2)

Maps every case in the D4 Phase 2 test catalog to the automated tests that cover it.
Test names carry the catalog ID, so `grep -rn "UT-CLM-06" src/backend/tests` finds the test.

| Catalog ID | What it tests | Automated in |
|---|---|---|
| UT-MATCH-01 | Two listings, same category. Action: Run matching engine. | matchingService.test.js |
| UT-MATCH-02 | Two listings, same building. Action: Run matching engine. | matchingService.test.js |
| UT-MATCH-03 | Lost and Found items 1 day apart. Action: Run matching engine. | matchingService.test.js |
| UT-MATCH-04 | Listings share 3 of 5 description keywords. Action: Run matching engine. | matchingService.test.js |
| UT-MATCH-05 | Perfect category + location, poor date + keywords. Action: Calculate combined score. | matchingService.test.js |
| UT-MATCH-06 | Lost item category A, Found item category B. Action: Run matching engine. | matchingService.test.js |
| UT-MATCH-07 | Listings in different buildings. Action: Run matching engine. | matchingService.test.js |
| UT-MATCH-08 | Lost and Found items 30 days apart. Action: Run matching engine. | matchingService.test.js |
| UT-MATCH-09 | Listings with completely different description words. Action: Run matching engine. | matchingService.test.js |
| UT-MATCH-10 | Dataset with 5,000 listings; new listing posted. Action: Trigger matching engine. | phase2Traceability.test.js |
| UT-MATCH-11 | 50 concurrent users; matching engine processing. Action: Run load test. | phase2Traceability.test.js |
| UT-MATCH-12 | Match with detailed score components calculated. Action: Serialize public match response. | matchApi.test.js |
| UT-MATCH-13 | Verified user creates Found item; Lost items exist. Action: Submit Found listing. | matchApi.test.js |
| UT-MATCH-14 | New Lost item; only Found items in database. Action: Run matching engine. | matchingService.test.js |
| UT-CLM-01 | Match received; claimant authenticated. Input: description text. Action: Submit claim. | claims.test.js |
| UT-CLM-02 | Match received; up to 3 JPEG/PNG images. Action: Submit claim with images. | claims.test.js |
| UT-CLM-03 | Match received; description field blank. Action: Submit claim. | claims.test.js |
| UT-CLM-04 | Image >5 MB uploaded with claim. Action: Submit claim. | claims.test.js |
| UT-CLM-05 | Claim submitted by claimant; owner authenticated. Action: Check owner's claim review interface. | claims.test.js |
| UT-CLM-06 | Owner reviewing claim with matching evidence. Action: Select approve. | claims.test.js |
| UT-CLM-07 | Owner reviewing claim; evidence does not match private details. Action: Select reject. | claims.test.js |
| UT-CLM-08 | Claim pending; User B attempts approval (not owner). Action: Call approve endpoint. | claims.test.js |
| UT-CLM-09 | Claim submitted; User C attempts to view evidence (not claimant/owner). Action: Call claim detail endpoint. | claims.test.js |
| UT-CLM-10 | Claim submitted with identifying details. Action: Serialize public listing. | claims.test.js |
| UT-CLM-11 | Authenticated user; admin-only claim report action. Action: Call admin endpoint. | phase2Traceability.test.js |
| UT-CLM-12 | Claim with exactly 3 images, each <=5 MB. Action: Submit claim. | phase2Traceability.test.js |
| UT-CLM-13 | Claim payload includes 4 image files. Action: Submit claim. | claims.test.js |
| UT-CLM-14 | Claim pending on listing owned by User A; User B (ordinary user). Action: Attempt claim review. | claims.test.js, phase2Traceability.test.js |
| UT-CLM-15 | Claimant submits claim with text and images; owner retrieves it. Action: Submit claim and owner opens claim detail. | claims.test.js |
| UT-CLM-16 | Owner approves claim; database write mocked to fail. Action: Submit approval. | claims.test.js |
| UT-CLM-17 | Claim already approved; owner attempts second approval. Action: Call approve endpoint again. | claims.test.js |
| UT-CLM-18 | Claim form with invalid image, valid description. Action: Submit and correct image. | phase2Traceability.test.js |
| UT-NOTIF-01 | Match generated between listings. Action: Trigger matching engine. | notificationService.test.js |
| UT-NOTIF-02 | Match generated; notification service triggered. Action: Verify email delivery. | notificationService.test.js |
| UT-NOTIF-03 | Claimant submits evidence. Action: Monitor notification service. | phase2Traceability.test.js |
| UT-NOTIF-04 | Claimant submits evidence. Action: Check email delivery. | notificationService.test.js |
| UT-NOTIF-05 | Owner approves claim. Action: Verify email. | phase2Traceability.test.js |
| UT-NOTIF-06 | Owner rejects claim. Action: Verify email. | phase2Traceability.test.js |
| UT-NOTIF-07 | User preference set to email off. Match found. Action: Verify email not sent. | notificationService.test.js |
| UT-NOTIF-08 | Email service failure mocked. Action: Attempt notification send. | notificationService.test.js |
| UT-NOTIF-09 | Notification marked Failed. Action: Trigger retry process. | notificationService.test.js |
| UT-NOTIF-10 | Notification created with match and claim data. Action: Serialize notification body. | notificationService.test.js |
| UT-NOTIF-11 | Match found, claim submitted, approval triggered. Action: Monitor notification service. | phase2Traceability.test.js |
| UT-NOTIF-12 | Many matches queued in short time. Action: Trigger high volume matching. | phase2Traceability.test.js |
| UT-MSG-01 | Owner approves claim. Action: Check messaging interface. | messaging.test.js |
| UT-MSG-02 | Thread opened; claimant authenticated. Input: message text. Action: Submit message. | messaging.test.js |
| UT-MSG-03 | Thread exists; claimant sent message; finder authenticated. Input: response text. Action: Submit message. | messaging.test.js |
| UT-MSG-04 | Thread exists between finder and claimant; User C attempts read. Action: Call message endpoint. | messaging.test.js |
| UT-MSG-05 | Thread exists; User C attempts to send message. Action: Call message send endpoint. | messaging.test.js |
| UT-MSG-06 | Thread exists; empty message text. Action: Submit message. | messaging.test.js |
| UT-MSG-07 | Messages exchanged in thread. Action: Retrieve public listing. | messaging.test.js |
| UT-MSG-08 | Thread exists; non-participant user. Action: Call list message threads endpoint. | messaging.test.js |
| UT-MSG-09 | Messages exchanged; moderator authenticated. Action: Access message thread as moderator. | messaging.test.js |
| UT-MSG-10 | Message contains concerning content; moderator authenticated. Action: Flag message. | messaging.test.js |
| UT-MSG-11 | Message text 1000 characters. Action: Submit message. | messaging.test.js |
| UT-MSG-12 | Message contains HTML/script tags. Action: Submit and retrieve message. | messaging.test.js |
| UT-MSG-13 | Message sent. Action: Retrieve message with metadata. | messaging.test.js |
| UT-MSG-14 | Thread opened via claim approval; both participants can reference claim. Action: View thread details. | phase2Traceability.test.js |
| UT-MSG-15 | Message submitted; database write forced to fail. Action: Submit message. | messaging.test.js |
| UT-MSG-16 | Messages exchanged. Action: Inspect message text and metadata. | messaging.test.js |
| UT-AUTH-01 | Registered unverified account; claim submission attempted. Action: Call claim endpoint. | claims.test.js |
| UT-AUTH-02 | Listing owned by User A; User B attempts to review claim. Action: Call claim review endpoint. | phase2Traceability.test.js |
| UT-AUTH-03 | Thread established; User C attempts message send. Action: Call message send endpoint. | messaging.test.js |
| UT-AUTH-04 | Listing owned by User A; multiple claims submitted. Action: User A calls claim review endpoint. | phase2Traceability.test.js |
| UT-AUTH-05 | Thread opened via approved claim. Claimant authenticated. Action: Send message. | phase2Traceability.test.js |
| UT-AUTH-06 | Ordinary user authenticated. Admin-only claim report action. Action: Call admin endpoint. | phase2Traceability.test.js |
| UT-AUTH-07 | Moderator authenticated. Action: List all message threads. | auth.test.js |
| UT-AUTH-08 | Ordinary user direct API call to claim approve (UI button hidden). Action: Call API endpoint directly. | phase2Traceability.test.js |
| UT-PRIV-01 | Found listing with private details; match notification sent. Action: Check notification content. | notificationService.test.js |
| UT-PRIV-02 | Match with component scores calculated. Action: Serialize for public API. | matchApi.test.js |
| UT-PRIV-03 | Claim submitted with evidence. User C (not owner/claimant) calls claim endpoint. Action: Retrieve claim. | claims.test.js |
| UT-PRIV-04 | Messages exchanged. Action: Inspect server logs. | messaging.test.js |
| UT-PRIV-05 | Claim submitted. Unauthorized user views claim. Action: Call claim endpoint. | messaging.test.js |
| UT-PRIV-06 | Thread established; message sent. Finder attempts to extract claimant email. Action: Inspect thread metadata. | phase2Traceability.test.js |
| UT-PRIV-07 | Match with internal weight details. Ordinary user attempts to view. Action: Call match endpoint. | matchApi.test.js |
| UT-PRIV-08 | Found listing with private details; search performed. Action: Search and inspect results. | phase2Traceability.test.js |
| UT-PRIV-09 | Claim notification sent to owner. Action: Inspect notification message. | notificationService.test.js |
| UT-PRIV-10 | Moderator flags message; participants notified. Action: Check notification sent to participants. | phase2Traceability.test.js |
| UT-PRIV-11 | Match scoring process. Action: Inspect debug/application logs. | phase2Traceability.test.js |
| UT-PRIV-12 | Matching or claim operation error triggered. Action: Inspect error response. | phase2Traceability.test.js |
| INT-01 | New listing posted matching existing item. Action: Monitor notification service. | integrationFlows.test.js |
| INT-02 | Notification received by claimant; claim form opened. Action: Submit claim. | integrationFlows.test.js |
| INT-03 | Owner approves claim. Action: Check for opened thread. | integrationFlows.test.js |
| INT-04 | Owner approves claim. Action: Monitor notifications and threads. | phase2Traceability.test.js |
| INT-05 | Match notification sent. Action: Inspect email/in-app message. | integrationFlows.test.js |
| INT-06 | Match found; claimant submits evidence; owner approves; messages exchanged. Action: Execute full workflow. | integrationFlows.test.js |
| INT-07 | Owner rejects claim. Action: Monitor notifications. | phase2Traceability.test.js |
| INT-08 | Claimant submits evidence with sensitive details. Owner retrieves. Unauthorized user attempts retrieval. Action: Observe evidence in each case. | integrationFlows.test.js |
| INT-09 | Match created between listings with private details. Action: Check notification, public listing, and internal storage. | integrationFlows.test.js |
| INT-10 | Thread established. Participants and non-participants access attempted. Action: Authorized access then unauthorized. | integrationFlows.test.js |
| INT-11 | Match generated; unverified claimant attempts claim; verified claimant submits claim. Action: Call endpoints. | integrationFlows.test.js |
| INT-12 | Thread established between finder and claimant. Third party attempts read/write. Action: API calls. | integrationFlows.test.js |
| INT-13 | Claimant receives 5 match notifications in rapid succession. Action: Monitor notification service. | phase2Traceability.test.js |
| INT-14 | Match generated; Claimant A submits; Claimant B submits. Action: Owner reviews both claims. | phase2Traceability.test.js |
| INT-15 | Thread opened; 10 messages exchanged. Action: Retrieve full thread history. | phase2Traceability.test.js |
| INT-16 | 5000 listings in database; new listing triggers matching. Action: Measure completion time. | phase2Traceability.test.js |
| INT-17 | 50 concurrent users; 100 matches per second generated. Action: Monitor notification throughput. | phase2Traceability.test.js |
| INT-18 | Claim form with invalid image and missing description. Action: Submit and correct each field. | integrationFlows.test.js |
| INT-19 | Message form rendered; user types long message. Action: Send message. | integrationFlows.test.js |
| INT-20 | Owner approves claim; database fails mid transaction. Action: Monitor rollback. | claims.test.js |
| INT-21 | Participant sends message; database write fails. Action: Verify state. | messaging.test.js |
| INT-22 | Email service temporarily unavailable; notification queued. Action: Wait and monitor retry. | integrationFlows.test.js |
| INT-23 | Moderator authenticated; multiple threads and claims exist. Action: Access monitoring views. | phase2Traceability.test.js |
| INT-24 | New listing posted; match found; claim submitted; approved; message thread established; notifications sent. Action: Execute complete workflow. | integrationFlows.test.js |

## Notes

- The catalog document says 128 cases; its appendix lists 104 distinct case IDs. All 104 listed here are automated (not covered: none).
- UT-CLM-12 and UT-CLM-13 in the catalog assume three claim photos; FR-CLM-01 and the implementation allow two, so the tests check two accepted and three rejected.
- UT-CLM-18 (valid fields kept after an error) is a front-end behavior: the claim form keeps its state after a validation error. The API side is covered by returning a specific error message.
- UT-NOTIF-12 (notification rate limits): notifications are stored without loss or duplication under a burst; there is no separate batching queue, because email sends are sequential per notification.
- Performance cases (UT-MATCH-10, UT-MATCH-11, INT-16, INT-17) run against a local test database with 5,000 listings and 50 concurrent requests.

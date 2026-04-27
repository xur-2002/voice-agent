# Final Demo Test Report

## What Worked

- Normal visitor submission succeeds end to end: voice agent → backend → database → WeCom notification.
- WeCom message includes approve/reject links when `PUBLIC_BASE_URL` is set.
- Approve link updates the visitor status to `approved` and shows `已确认放行`.
- Reject link updates the visitor status to `rejected`.
- `/guard` shows recent visitor status and decision timestamps.
- `/guard/query` supports deterministic Chinese analytics questions without an LLM.
- Returning visitor lookup works as a bonus endpoint by phone, plate number, or caller number.
- `call_id` idempotency prevents duplicate visitor records and duplicate WeCom pushes.

## Issues Found During Real Calls

- Chinese phone numbers are easy for ASR to misrecognize when users speak quickly.
- Chinese license plates can be transcribed as artifacts such as `?A12345` or `互为12345`.
- Company names can be confused, for example `蓝色金鱼` vs `蓝色鲸鱼`.
- Cloudflare Quick Tunnel URLs are temporary and change after restart.

## Fixes

- Final demo uses digit-by-digit explicit phone collection:
  `收到，手机号麻烦一位一位说一下。`
- Backend normalizes Chinese spoken digits:
  `一三三，八六六，五二五，一零` → `13386652510`.
- Assistant submits immediately once it can parse an 11-digit phone; no phone repeat-confirmation step.
- Plate normalization repairs common Shanghai plate ASR artifacts.
- Company aliases map `蓝色金鱼`, `蓝色鲸鱼`, and `蓝鲸` to `蓝色鲸鱼科技`.
- Vapi can be reset to the stable explicit-phone flow with:
  `npm.cmd run vapi:revert-phone-flow`.

## Final Demo Checklist

1. Start backend:
   `npm.cmd run dev`
2. Start tunnel:
   `cloudflared tunnel --url http://127.0.0.1:3000`
3. Set `PUBLIC_BASE_URL` to the new tunnel URL.
4. Run:
   `npm.cmd run vapi:revert-phone-flow`
5. Verify:
   `PUBLIC_BASE_URL/health`
6. Call Vapi number and say:
   `沪，A，一二三四五，来蓝色鲸鱼送货。`
7. Say phone:
   `一三三，八六六，五二五，一零。`
8. Check WeCom notification.
9. Click approve link and confirm `/guard` shows `approved`.

## Target Timing

The happy path should complete within about 25 seconds:

- first prompt and vehicle/company/reason: 6-8s
- digit-by-digit phone: 5-8s
- backend save and WeCom push: normally under 2s locally

## Known Limitations

- `/guard/query` is deterministic keyword parsing, not free-form LLM analytics.
- Gate opening is mocked; production should replace `src/services/gate-control.ts`.
- Quick Tunnel URLs are temporary; run the Vapi revert/update script after every tunnel change.
- Debug pages should be protected before a public deployment.
- The cloud branch uses Neon PostgreSQL; SQLite is retained only for isolated test runs.

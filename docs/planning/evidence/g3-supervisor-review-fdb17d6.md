# G3 targeted recheck — fdb17d6

Exact source: `fdb17d605034b6867645dca541d929942a95d0a8`. Supervisor verdict: **NEEDS_FIXES**, superseding the independent bounded PASS for earlier remediation traces. The accepted local Docker application remains55c05e1.

The first fixes add safe text nodes, timer disposal, stable callback refs, SDK control calls, a minimum JWT lifetime, environment guards and more browser assertions. These improvements do not establish the complete media adapter behavior.

- **SG3-06:** Installed Toolkit2.6.0-1 `Participant` declares `audio`, `muted`, `sharerOn`, and `bVideoOn`. The adapter still reads nonexistent `bAudioOn` and `bShareOn`; its spy supplies those invented fields. With an unmuted real-shaped participant, the adapter reports muted and its unmute method returns false. SDK operations can also resolve structured errors instead of throwing; the adapter ignores those results. `startShareScreen()` is invoked without a share element. Missing optional methods and unavailable display capture can still appear successful.
- **SG3-07:** The adapter reports connected immediately after the join promise resolves, before a joined event. The host also publishes an initial connected label even if the handle is joining. Epoch checks do not serialize asynchronous old-handle teardown with a new singleton Toolkit session; cleanup invokes leave and then a destroy that leaves again. Require delayed join/cleanup/new-session and independent retry tests with actual state assertions.
- **Remaining token/contract checks:** The handler releases the session lock before signing/auditing the token. Complete mint/audit and identity checks with the locked current state; respect explicit provider configuration and document the additive producer/consumer contract.

Supervisor executed the immutable adapter JavaScript in an isolated Chrome contract fixture. No application DB, Zoom credentials or network was used; only the stylesheet import was omitted to load the JavaScript fixture. Observations: `statusBeforeJoinedEvent=connected`, `mutedDespiteSdkUnmuted=true`, `unmuteResult=false`, share called with zero arguments, and a fulfilled `INVALID_PARAMETERS` result produced no error event. See [g3-fdb-sdk-shape-probe.json](g3-fdb-sdk-shape-probe.json). This is a defect reproduction, not a real-provider test.

Assigned to the same frontend writer. Native Toolkit controls are an acceptable implementation path for real Zoom; custom mock controls must remain explicitly simulated and unsupported operations must not manufacture success.

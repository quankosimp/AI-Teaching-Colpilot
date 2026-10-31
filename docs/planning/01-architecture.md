# Child plan ARCH

Profile: worker-antigravity-architecture

Status: approved plan; task progress and evidence are tracked by supervisor.

## Ownership

- Design specification only; read-only runtime code

## Inputs and dependencies

- Approved SRS baseline and supervisor decisions
- Task prerequisites: approved master/SRS

## Tasks

| Task | Work | SRS / gate | Acceptance |
|---|---|---|---|
| ARCH-01 | Domain/source revisions and state machines | Supporting coverage; canonical RTM defines exact execution mapping / G0 | Conforms to approved contracts and relevant SRS criteria; independent review and exact-commit evidence required. |
| ARCH-02 | Actor/tenant permissions, OAuth and invites | Supporting coverage; canonical RTM defines exact execution mapping / G0 | Conforms to approved contracts and relevant SRS criteria; independent review and exact-commit evidence required. |
| ARCH-03 | REST, events, errors, idempotency and files | Supporting coverage; canonical RTM defines exact execution mapping / G0 | Conforms to approved contracts and relevant SRS criteria; independent review and exact-commit evidence required. |
| ARCH-04 | Media/AI adapters and presentation view-models | Supporting coverage; canonical RTM defines exact execution mapping / G0 | Conforms to approved contracts and relevant SRS criteria; independent review and exact-commit evidence required. |
| ARCH-05 | Migration, audit, health, flags and environment | Supporting coverage; canonical RTM defines exact execution mapping / G0 | Conforms to approved contracts and relevant SRS criteria; independent review and exact-commit evidence required. |
| ARCH-06 | Contract freeze, ownership and change impact review | Supporting coverage; canonical RTM defines exact execution mapping / G0 | Conforms to approved contracts and relevant SRS criteria; independent review and exact-commit evidence required. |

## Outputs and completion

- Domain/state/permission specification
- API/event/provider/UI contract specification
- Contract/ownership audit
- Task is complete only after relevant checks pass, evidence records tested commit/contracts/environment, reviewer blockers are resolved and supervisor accepts the gate.
- Only supervisor updates canonical RTM/gate status. Do not claim a mocked provider as real integration.
- Changes to shared contracts require impact review and a recorded decision before consumers change.

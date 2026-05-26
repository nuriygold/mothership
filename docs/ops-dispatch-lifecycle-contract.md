# Ops and Dispatch Lifecycle Contract

Status: source contract only. Runtime verification depends on the real database
containing the dispatch lease fields.

## Design order

1. Define the lifecycle mapping contract.
2. Implement the Durable Ops to Dispatch bridge in source.
3. Push the dispatch lease schema through the real DB toolchain.
4. Verify runtime behavior against the live database.

## Runtime verification order

1. The real database must contain the dispatch lease fields.
2. The bridge can then be tested.
3. Duplicate-run and crash recovery tests can then be trusted.

## Authoritative control split

- Durable Ops is the campaign system of record.
- Legacy Dispatch is the MVP execution worker.
- `/api/ops/campaigns` is the intended user-facing campaign ingress.
- Dispatch execution truth is translated back into Durable Ops status, events,
  and artifacts.

## State mapping

| Dispatch state | Durable Ops state | Intended durable event |
| --- | --- | --- |
| `PLANNED` | `queued` | `dispatch_task_planned` |
| `QUEUED` | `queued` | `dispatch_task_queued` |
| `RUNNING` | `running` | `dispatch_task_started` |
| `DONE` | `running` unless all required tasks complete | `dispatch_task_completed` |
| `FAILED` | `blocked` | `dispatch_task_failed` |
| `CANCELED` | `archived` | `dispatch_task_canceled` |
| all required tasks done | `completed` | `campaign_completed` |
| required task failed | `blocked` | `campaign_blocked` |

## Durable binding

The bridge stores its binding in Durable Ops campaign metadata:

- `executionBackend = "dispatch"`
- `dispatchBinding.dispatchCampaignId`
- `dispatchBinding.dispatchStatus`
- `dispatchBinding.durableStatus`
- `dispatchBinding.taskSummary`
- `dispatchBinding.lastSyncedAt`
- `dispatchBinding.lifecycleContractVersion`

This keeps the control-plane reference durable without requiring a new mission
control schema migration just to establish the binding.

## Bridge responsibilities

1. Create a dispatch campaign for each dispatch-backed ops campaign.
2. Generate and approve the dispatch task plan.
3. Queue dispatch execution.
4. Mirror dispatch status into Durable Ops campaign status.
5. Mirror completed dispatch task outputs into Durable Ops artifacts.
6. Mirror failed dispatch task outcomes into Durable Ops blockers.

## Verification prerequisites

Before runtime bridge verification, confirm the real DispatchCampaign table has:

- `executionOwner`
- `executionLeaseUntil`
- `heartbeatAt`
- `attemptCount`

The source bridge should not be treated as runtime-proven until those fields
exist in the live database and can be observed during execution.

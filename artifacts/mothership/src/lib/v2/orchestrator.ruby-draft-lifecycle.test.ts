import assert from 'node:assert/strict';

type LifecycleStatus = 'idle' | 'generating' | 'generated' | 'finalized' | 'failed';

type LifecycleRecord = {
  emailExternalId: string;
  status: LifecycleStatus;
  generationLeaseUntil: Date | null;
  generationOwner: string | null;
  lastGeneratedDraftId: string | null;
  finalizedAt: Date | null;
  failureReason: string | null;
};

function createLifecycleRecord(emailExternalId: string, status: LifecycleStatus, generationLeaseUntil: Date | null = null): LifecycleRecord {
  return {
    emailExternalId,
    status,
    generationLeaseUntil,
    generationOwner: null,
    lastGeneratedDraftId: null,
    finalizedAt: null,
    failureReason: null,
  };
}

function claimLifecycle(record: LifecycleRecord | null, now: Date) {
  if (!record) {
    return {
      claimed: true,
      next: createLifecycleRecord('email-1', 'generating', new Date(now.getTime() + 5 * 60 * 1000)),
    };
  }

  if (record.status === 'finalized') {
    return { claimed: false, next: record };
  }

  if (record.status === 'generating' && record.generationLeaseUntil && record.generationLeaseUntil.getTime() > now.getTime()) {
    return { claimed: false, next: record };
  }

  return {
    claimed: true,
    next: {
      ...record,
      status: 'generating' as const,
      generationLeaseUntil: new Date(now.getTime() + 5 * 60 * 1000),
      failureReason: null,
    },
  };
}

function shouldTriggerGeneration(status: LifecycleStatus | null) {
  return status !== 'finalized' && status !== 'generating';
}

async function run() {
  const now = new Date('2026-05-26T12:00:00.000Z');

  const firstClaim = claimLifecycle(null, now);
  assert.equal(firstClaim.claimed, true);
  assert.equal(firstClaim.next.status, 'generating');
  assert.ok(firstClaim.next.generationLeaseUntil);

  const secondClaim = claimLifecycle(firstClaim.next, now);
  assert.equal(secondClaim.claimed, false);
  assert.equal(secondClaim.next.status, 'generating');

  const staleRecord = createLifecycleRecord('email-1', 'generating', new Date(now.getTime() - 1000));
  const staleClaim = claimLifecycle(staleRecord, now);
  assert.equal(staleClaim.claimed, true);
  assert.equal(staleClaim.next.status, 'generating');
  assert.ok(staleClaim.next.generationLeaseUntil!.getTime() > now.getTime());

  const finalizedRecord = createLifecycleRecord('email-1', 'finalized');
  const finalizedClaim = claimLifecycle(finalizedRecord, now);
  assert.equal(finalizedClaim.claimed, false);
  assert.equal(shouldTriggerGeneration(finalizedRecord.status), false);

  assert.equal(shouldTriggerGeneration('generating'), false);
  assert.equal(shouldTriggerGeneration('idle'), true);
  assert.equal(shouldTriggerGeneration('failed'), true);
  assert.equal(shouldTriggerGeneration('generated'), true);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

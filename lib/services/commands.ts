import { prisma } from '@/lib/prisma';
import { CommandStatus } from '@/lib/db/enums';

export async function listCommands(limit = 20) {
  return prisma.command.findMany({
    include: { requestedBy: true, run: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function createCommand(input: {
  input: string;
  sourceChannel: string;
  requestedById?: string | null;
}) {
  const command = await prisma.command.create({
    data: {
      input: input.input,
      sourceChannel: input.sourceChannel,
      requestedById: input.requestedById ?? null,
      status: CommandStatus.RECEIVED,
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'command',
      entityId: command.id,
      eventType: 'received',
      actorId: input.requestedById ?? null,
      metadata: { sourceChannel: input.sourceChannel },
    },
  });

  return command;
}

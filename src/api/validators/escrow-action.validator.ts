import { z } from 'zod';

export const EscrowStatusEnum = z.enum([
  'PROPOSED',
  'FUNDED',
  'RELEASED',
  'DISPUTED',
  'REFUNDED'
]);

export const EventTypeEnum = z.enum([
  'EscrowProposed',
  'EscrowFunded',
  'EscrowReleased',
  'EscrowDisputed',
  'EscrowRefunded'
]);

// Maps status to event type
export const statusToEventType: Record<string, string> = {
  'PROPOSED': 'EscrowProposed',
  'FUNDED': 'EscrowFunded',
  'RELEASED': 'EscrowReleased',
  'DISPUTED': 'EscrowDisputed',
  'REFUNDED': 'EscrowRefunded'
};

export const createEscrowEventSchema = z.object({
  action: EscrowStatusEnum,
  user_id: z.coerce.number().int().nonnegative('User ID must be a non-negative integer'),
});

export type CreateEscrowEventInput = z.infer<typeof createEscrowEventSchema>;
export type EscrowStatus = z.infer<typeof EscrowStatusEnum>;
export type EventType = z.infer<typeof EventTypeEnum>;

import { z } from 'zod';

export const EscrowStateEnumValues = {
  PROPOSED: "PROPOSED",
  FUNDED: "FUNDED",
  RELEASED: "RELEASED",
  DISPUTED: "DISPUTED",
  REFUNDED: "REFUNDED"
}

// Define the state enum
export const EscrowStateEnum = z.enum([
  'PROPOSED',
  'FUNDED',
  'RELEASED',
  'DISPUTED',
  'REFUNDED'
]);

export const createEscrowEventSchema = z.object({
  action: EscrowStateEnum,
  user_id: z.number().int().nonnegative('User ID must be a non-negative integer'),
});

export type CreateEscrowEventInput = z.infer<typeof createEscrowEventSchema>;
export type EscrowState = z.infer<typeof EscrowStateEnum>;

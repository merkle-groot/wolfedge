import { z } from 'zod';

export const createEscrowMetadataSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  buyer_id: z.number().int().nonnegative('Buyer ID must be a non-negative integer'),
  seller_id: z.number().int().nonnegative('Seller ID must be a non-negative integer'),
  arbiter_id: z.number().int().nonnegative('Arbiter ID must be a non-negative integer'),
});

export type CreateEscrowMetadataInput = z.infer<typeof createEscrowMetadataSchema>;

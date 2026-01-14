export interface EscrowEvent {
  id: number;
  escrow_id: number;
  event_type: EventType;
  user_id: number;
  event_data?: EventData;
  version: number;
  created_at: Date;
}

export type EventType =
  | 'EscrowProposed'
  | 'EscrowFunded'
  | 'EscrowReleased'
  | 'EscrowDisputed'
  | 'EscrowRefunded';

export interface EventData {
  buyer_id?: number;
  seller_id?: number;
  arbiter_id?: number;
  amount?: number;
  [key: string]: any;
}

export interface EscrowState {
  status: EscrowStatus;
  buyer_id: number | null;
  seller_id: number | null;
  amount: number | null;
  version: number;
  isFinal: boolean;
}

export type EscrowStatus =
  | 'PROPOSED'
  | 'FUNDED'
  | 'RELEASED'
  | 'DISPUTED'
  | 'REFUNDED';

export interface EscrowMetadata {
  escrow_id: number;
  amount: number;
  buyer_id: number;
  seller_id: number;
  arbiter_id: number;
  created_at: Date;
}

export interface CreateEscrowMetadata {
  amount: number;
  buyer_id: number;
  seller_id: number;
  arbiter_id: number;
}

export interface CreateEscrowEvent {
  action: EscrowStatus;
  user_id: number;
}

export type SealReason = 'ok' | 'failed' | 'skipFile' | 'pullDisabled';

export interface MarkSealResponse {
  seal: boolean;
  reason: SealReason;
}

export interface SealCoordinatorApi {
  ping: () => Promise<boolean>;
  markSeal: (cid: string) => Promsie<MarkSealResponse>;
  unMarkSeal: (cid: string) => Promise<MarkSealResponse>;
}

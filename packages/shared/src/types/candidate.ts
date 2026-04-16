export interface Candidate {
  id: string;
  name: string;
  email: string;
  token: string | null;
  tokenExpiresAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateCreateInput {
  name: string;
  email: string;
}

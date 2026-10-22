export type ExternalAccount = {
  externalId: string;
  name: string;
  email: string | null;
  createdAt: string | null;
  metrics: Record<string, number | string>;
};

/** Leitura das contas na plataforma de origem. Cobrança/plano ficam no admin, não na origem. */
export interface Connector {
  description: string;
  configured(): boolean;
  listAccounts(): Promise<ExternalAccount[]>;
}

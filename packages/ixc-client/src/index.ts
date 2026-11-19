export interface IxcClientConfig {
  baseUrl: string;
  apiToken: string;
  requestTimeoutMs?: number;
}

export interface IxcSubscriberReference {
  id: string;
  login?: string;
}

/** Contract only. The HTTP implementation belongs to milestone M7. */
export interface IxcClient {
  findSubscriberByLogin(login: string): Promise<IxcSubscriberReference | null>;
}

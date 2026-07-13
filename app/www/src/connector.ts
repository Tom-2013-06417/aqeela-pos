import {
  AbstractPowerSyncDatabase,
  BaseObserver,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncCredentials
} from '@powersync/web';
import { Session, SupabaseClient, createClient } from '@supabase/supabase-js';

const FATAL_RESPONSE_CODES = [
  new RegExp('^22...$'),
  new RegExp('^23...$'),
  new RegExp('^42501$')
];

export type SupabaseConnectorListener = {
  initialized: () => void;
  sessionStarted: (session: Session) => void;
  sessionEnded: () => void;
};

export class SupabaseConnector
  extends BaseObserver<SupabaseConnectorListener>
  implements PowerSyncBackendConnector
{
  readonly client: SupabaseClient;
  readonly supabaseUrl: string;
  readonly powersyncUrl: string;

  ready = false;
  currentSession: Session | null = null;
  private authSubscription: { unsubscribe: () => void } | null = null;

  constructor() {
    super();
    this.supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    this.powersyncUrl = import.meta.env.VITE_POWERSYNC_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!this.supabaseUrl || !anonKey || !this.powersyncUrl) {
      throw new Error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or VITE_POWERSYNC_URL');
    }

    this.client = createClient(this.supabaseUrl, anonKey, {
      auth: { persistSession: true }
    });
  }

  async init() {
    if (this.ready) {
      this.iterateListeners((cb) => cb.initialized?.());
      return;
    }

    if (!this.authSubscription) {
      const { data } = this.client.auth.onAuthStateChange((_event, session) => {
        this.updateSession(session);
      });
      this.authSubscription = data.subscription;
    }

    const { data } = await this.client.auth.getSession();
    this.updateSession(data.session);
    this.ready = true;
    this.iterateListeners((cb) => cb.initialized?.());
  }

  async login(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.updateSession(data.session);
  }

  async logout() {
    this.updateSession(null);
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }

  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const { data, error } = await this.client.auth.getSession();
    if (!data.session || error) {
      throw new Error(`Could not fetch Supabase credentials: ${error?.message}`);
    }

    return {
      endpoint: this.powersyncUrl,
      token: data.session.access_token
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastOp: CrudEntry | null = null;
    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = this.client.from(op.table);
        let result: { error: { code?: string; message: string } | null };

        switch (op.op) {
          case UpdateType.PUT: {
            const record = { ...op.opData, id: op.id };
            result = await table.upsert(record);
            break;
          }
          case UpdateType.PATCH:
            result = await table.update(op.opData ?? {}).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
          default:
            continue;
        }

        if (result.error) {
          result.error.message = `Supabase upload failed: ${result.error.message}`;
          throw result.error;
        }
      }

      await transaction.complete();
    } catch (ex: unknown) {
      const err = ex as { code?: string };
      if (typeof err.code === 'string' && FATAL_RESPONSE_CODES.some((regex) => regex.test(err.code!))) {
        console.error('Discarding fatal upload transaction:', lastOp, ex);
        await transaction.complete();
      } else {
        throw ex;
      }
    }
  }

  private updateSession(session: Session | null) {
    const hadSession = this.currentSession !== null;
    this.currentSession = session;
    if (session) {
      this.iterateListeners((cb) => cb.sessionStarted?.(session));
    } else if (hadSession) {
      this.iterateListeners((cb) => cb.sessionEnded?.());
    }
  }
}

import { AppSchema } from './schema';
import { PowerSyncDatabase } from '@powersync/web';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'pos.db'
  }
});

import {createTestDb} from '../tests/db.mjs';
const db=await createTestDb();console.log('All migrations executed successfully in PostgreSQL/PGlite.');await db.close();

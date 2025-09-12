import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Hardcoded DATABASE_URL to avoid environment variable dependency
const DATABASE_URL = "postgresql://neondb_owner:npg_yG8JFioduCL1@ep-proud-darkness-agtw4exm.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require";

export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle({ client: pool, schema });

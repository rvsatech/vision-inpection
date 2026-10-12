import { config } from 'dotenv';

// Procura .env no pacote e na raiz do monorepo (o primeiro valor encontrado vence).
config({ path: ['.env', '../../.env'], quiet: true });

// MongoDB client (official driver). Cached on globalThis for dev reloads.
import { MongoClient } from 'mongodb';

const g = globalThis;
g.__finditMongo ??= { client: null, connecting: null, database: null };
const state = g.__finditMongo;

export function useMongoDatabase(name) {
  if (state.client) throw new Error('Mongo client already created');
  state.database = name;
}

export async function getMongoDb() {
  if (!state.client) {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
    state.connecting ??= new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
    }).connect().then((client) => {
      state.client = client;
      return client;
    }).finally(() => {
      state.connecting = null;
    });
    await state.connecting;
  }
  return state.client.db(state.database ?? process.env.MONGODB_DB ?? 'findit');
}

export async function collection(name) {
  return (await getMongoDb()).collection(name);
}

export async function closeMongo() {
  if (state.client) {
    await state.client.close();
    state.client = null;
  }
}

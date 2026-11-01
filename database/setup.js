// Builds (or rebuilds) both FindIt databases from scratch.
//   npm run db:setup              -> MYSQL_DATABASE / MONGODB_DB
// WARNING: drops and recreates the target MySQL database and clears the
// FindIt MongoDB collections.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { initMongo } from './mongo/init.js';
import { seedMongo } from './mongo/seed.js';

const SQL_FILES = [
  '01_schema.sql',
  '02_functions_procedures.sql',
  '03_views.sql',
  '04_triggers.sql',
  '05_seed.sql',
  '06_alter_migration.sql',
  '07_sync_outbox.sql',
];

// Splits a MySQL script into statements, honouring DELIMITER directives
// (which are a mysql-client feature, not something the server understands).
export function splitSql(script) {
  const statements = [];
  let delimiter = ';';
  let buffer = [];
  for (const line of script.split(/\r?\n/)) {
    const directive = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (directive) {
      delimiter = directive[1];
      continue;
    }
    buffer.push(line);
    if (line.trimEnd().endsWith(delimiter)) {
      const text = buffer.join('\n').trimEnd();
      const statement = text.slice(0, text.length - delimiter.length).trim();
      if (statement.replace(/--.*$/gm, '').trim()) statements.push(statement);
      buffer = [];
    }
  }
  if (buffer.join('').replace(/--.*$/gm, '').trim()) {
    throw new Error('SQL script ends with an unterminated statement');
  }
  return statements;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export function mysqlConfig(database) {
  return {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: requireEnv('MYSQL_USER'),
    password: process.env.MYSQL_PASSWORD ?? '',
    database,
    dateStrings: true,
  };
}

export async function setupDatabases({ mysqlDatabase, mongoDatabase, log = console.log }) {
  if (!/^[A-Za-z0-9_]+$/.test(mysqlDatabase)) throw new Error(`Invalid database name: ${mysqlDatabase}`);

  const admin = await mysql.createConnection(mysqlConfig(undefined));
  await admin.query(`DROP DATABASE IF EXISTS \`${mysqlDatabase}\``);
  await admin.query(`CREATE DATABASE \`${mysqlDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await admin.end();

  const conn = await mysql.createConnection(mysqlConfig(mysqlDatabase));
  const mongo = new MongoClient(requireEnv('MONGODB_URI'), { serverSelectionTimeoutMS: 15000 });
  try {
    for (const file of SQL_FILES) {
      const script = readFileSync(fileURLToPath(new URL(`./mysql/${file}`, import.meta.url)), 'utf8');
      const statements = splitSql(script);
      for (const statement of statements) {
        try {
          await conn.query(statement);
        } catch (err) {
          throw new Error(`${file}: ${err.message}\n--- statement ---\n${statement.slice(0, 400)}`);
        }
      }
      log(`  mysql  ${file.padEnd(30)} ${statements.length} statements`);
    }

    await mongo.connect();
    const db = mongo.db(mongoDatabase);
    await initMongo(db);
    const counts = await seedMongo(db, conn);
    log(`  mongo  ${mongoDatabase}: ${counts.templates} templates, ${counts.itemDetails} item_details, ${counts.activity} activity events`);
  } finally {
    await conn.end();
    await mongo.close();
  }

  // Run the real matching engine over the seeded reports (including
  // already-resolved ones, so admins see confirmed match history).
  const { useMysqlDatabase, closeMysql } = await import('../src/lib/db/mysql.js');
  const { useMongoDatabase, closeMongo } = await import('../src/lib/db/mongo.js');
  await closeMysql();
  await closeMongo();
  useMysqlDatabase(mysqlDatabase);
  useMongoDatabase(mongoDatabase);
  const { rematchAll } = await import('../src/lib/services/matchingService.js');
  try {
    const m = await rematchAll({ includeResolved: true });
    log(`  match  ${m.reports} reports scored, ${m.matches} matches stored, ${m.notifiedPairs} strong matches notified`);
  } finally {
    await closeMysql();
    await closeMongo();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mysqlDatabase = requireEnv('MYSQL_DATABASE');
  const mongoDatabase = process.env.MONGODB_DB ?? 'findit';
  console.log(`Setting up MySQL "${mysqlDatabase}" and MongoDB "${mongoDatabase}"...`);
  setupDatabases({ mysqlDatabase, mongoDatabase })
    .then(() => console.log('Done.'))
    .catch((err) => {
      console.error(`Setup failed: ${err.message}`);
      process.exit(1);
    });
}

import { Pool } from 'pg'
import 'dotenv/config'

function getConnectionString(): string | undefined {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  const user = process.env.DB_USER
  const pass = process.env.DB_PASS
  const host = process.env.DB_HOST
  const port = process.env.DB_PORT || '5432'
  const name = process.env.DB_NAME
  if (user && pass && host && name) {
    return `postgresql://${user}:${encodeURIComponent(pass)}@${host}:${port}/${name}`
  }
  return undefined
}

const pool = new Pool({
  connectionString: getConnectionString(),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})

export default pool

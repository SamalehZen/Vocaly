import { run, get, all } from './utils'

export type MatchType = 'app' | 'domain'

export type AppTarget = {
  id: string
  userId: string
  name: string
  matchType: MatchType
  domain: string | null
  toneId: string | null
  iconBase64: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type Tone = {
  id: string
  userId: string | null
  name: string
  promptTemplate: string
  isSystem: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

type AppTargetRow = {
  id: string
  user_id: string
  name: string
  match_type: string
  domain: string | null
  tone_id: string | null
  icon_base64: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type ToneRow = {
  id: string
  user_id: string | null
  name: string
  prompt_template: string
  is_system: number
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function mapAppTargetRowToAppTarget(row: AppTargetRow): AppTarget {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    matchType: (row.match_type as MatchType) || 'app',
    domain: row.domain,
    toneId: row.tone_id,
    iconBase64: row.icon_base64,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

function mapToneRowToTone(row: ToneRow): Tone {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    promptTemplate: row.prompt_template,
    isSystem: Boolean(row.is_system),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export const AppTargetTable = {
  async findAll(userId: string): Promise<AppTarget[]> {
    const rows = await all<AppTargetRow>(
      `SELECT id, user_id, name, match_type, domain, tone_id, icon_base64, 
       created_at, updated_at, deleted_at
       FROM app_targets WHERE user_id = ? AND deleted_at IS NULL ORDER BY name`,
      [userId]
    )
    return rows.map(mapAppTargetRowToAppTarget)
  },

  async findById(id: string, userId: string): Promise<AppTarget | null> {
    const row = await get<AppTargetRow>(
      `SELECT id, user_id, name, match_type, domain, tone_id, icon_base64,
       created_at, updated_at, deleted_at
       FROM app_targets WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [id, userId]
    )
    return row ? mapAppTargetRowToAppTarget(row) : null
  },

  async findByDomain(domain: string, userId: string): Promise<AppTarget | null> {
    const row = await get<AppTargetRow>(
      `SELECT id, user_id, name, match_type, domain, tone_id, icon_base64,
       created_at, updated_at, deleted_at
       FROM app_targets 
       WHERE domain = ? AND user_id = ? AND match_type = 'domain' AND deleted_at IS NULL`,
      [domain, userId]
    )
    return row ? mapAppTargetRowToAppTarget(row) : null
  },

  async upsert(data: {
    id: string
    userId: string
    name: string
    matchType?: MatchType
    domain?: string | null
    toneId?: string | null
    iconBase64?: string | null
  }): Promise<AppTarget> {
    const now = new Date().toISOString()

    await run(
      `INSERT INTO app_targets (id, user_id, name, match_type, domain, tone_id, icon_base64, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, user_id) DO UPDATE SET
         name = excluded.name,
         match_type = excluded.match_type,
         domain = excluded.domain,
         tone_id = COALESCE(excluded.tone_id, app_targets.tone_id),
         icon_base64 = COALESCE(excluded.icon_base64, app_targets.icon_base64),
         updated_at = excluded.updated_at,
         deleted_at = NULL`,
      [
        data.id,
        data.userId,
        data.name,
        data.matchType ?? 'app',
        data.domain ?? null,
        data.toneId ?? null,
        data.iconBase64 ?? null,
        now,
        now,
      ]
    )

    const result = await AppTargetTable.findById(data.id, data.userId)
    if (!result) {
      throw new Error('Failed to upsert app target')
    }
    return result
  },

  async updateTone(
    id: string,
    userId: string,
    toneId: string | null
  ): Promise<void> {
    const now = new Date().toISOString()

    await run(
      `UPDATE app_targets SET tone_id = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [toneId, now, id, userId]
    )
  },

  async delete(id: string, userId: string): Promise<void> {
    const now = new Date().toISOString()

    await run(
      `UPDATE app_targets SET deleted_at = ? WHERE id = ? AND user_id = ?`,
      [now, id, userId]
    )
  },

  async deleteAllUserData(userId: string): Promise<void> {
    await run(`DELETE FROM app_targets WHERE user_id = ?`, [userId])
  },
}

export const ToneTable = {
  async findAll(userId: string): Promise<Tone[]> {
    const rows = await all<ToneRow>(
      `SELECT id, user_id, name, prompt_template, 
       is_system, sort_order,
       created_at, updated_at, deleted_at
       FROM tones 
       WHERE (user_id IS NULL OR user_id = ?) AND deleted_at IS NULL 
       ORDER BY sort_order`,
      [userId]
    )
    return rows.map(mapToneRowToTone)
  },

  async findById(id: string): Promise<Tone | null> {
    const row = await get<ToneRow>(
      `SELECT id, user_id, name, prompt_template,
       is_system, sort_order,
       created_at, updated_at, deleted_at
       FROM tones WHERE id = ?`,
      [id]
    )
    return row ? mapToneRowToTone(row) : null
  },

  async deleteAllUserData(userId: string): Promise<void> {
    await run(`DELETE FROM tones WHERE user_id = ?`, [userId])
  },
}

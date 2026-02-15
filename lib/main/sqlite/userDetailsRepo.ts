import { run, get, all } from './utils'
import type { UserDetails, UserAdditionalInfo } from './models'
import { v4 as uuidv4 } from 'uuid'

export class UserDetailsTable {
  static async findByUserId(userId: string): Promise<UserDetails | undefined> {
    const query = 'SELECT * FROM user_details WHERE user_id = ?'
    return await get<UserDetails>(query, [userId])
  }

  static async upsert(
    userId: string,
    details: Omit<UserDetails, 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<void> {
    const now = new Date().toISOString()
    const query = `
      INSERT INTO user_details (user_id, full_name, occupation, company_name, role, email, phone_number, business_address, website, linkedin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        full_name = excluded.full_name,
        occupation = excluded.occupation,
        company_name = excluded.company_name,
        role = excluded.role,
        email = excluded.email,
        phone_number = excluded.phone_number,
        business_address = excluded.business_address,
        website = excluded.website,
        linkedin = excluded.linkedin,
        updated_at = excluded.updated_at
    `
    await run(query, [
      userId,
      details.full_name,
      details.occupation,
      details.company_name || null,
      details.role || null,
      details.email || null,
      details.phone_number || null,
      details.business_address || null,
      details.website || null,
      details.linkedin || null,
      now,
      now,
    ])
  }

  static async deleteByUserId(userId: string): Promise<void> {
    await run('DELETE FROM user_additional_info WHERE user_id = ?', [userId])
    await run('DELETE FROM user_details WHERE user_id = ?', [userId])
  }

  static async deleteAllUserData(userId: string): Promise<void> {
    await this.deleteByUserId(userId)
  }
}

export class UserAdditionalInfoTable {
  static async findAllByUserId(userId: string): Promise<UserAdditionalInfo[]> {
    const query =
      'SELECT * FROM user_additional_info WHERE user_id = ? ORDER BY sort_order ASC'
    return await all<UserAdditionalInfo>(query, [userId])
  }

  static async replaceAll(
    userId: string,
    items: { key: string; value: string }[],
  ): Promise<void> {
    await run('DELETE FROM user_additional_info WHERE user_id = ?', [userId])
    const now = new Date().toISOString()
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.key.trim() && !item.value.trim()) continue
      await run(
        'INSERT INTO user_additional_info (id, user_id, info_key, info_value, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), userId, item.key, item.value, i, now, now],
      )
    }
  }
}

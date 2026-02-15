import { create } from 'zustand'

interface AdditionalInfoRow {
  key: string
  value: string
}

type UserDetailsField =
  | 'fullName'
  | 'occupation'
  | 'companyName'
  | 'role'
  | 'email'
  | 'phoneNumber'
  | 'businessAddress'
  | 'website'
  | 'linkedin'

interface UserDetailsState {
  fullName: string
  occupation: string
  companyName: string
  role: string
  email: string
  phoneNumber: string
  businessAddress: string
  website: string
  linkedin: string
  additionalInfo: AdditionalInfoRow[]
  isLoading: boolean
  isSaving: boolean
  isDirty: boolean
  saveError: string | null

  setField: (field: UserDetailsField, value: string) => void
  setAdditionalInfo: (info: AdditionalInfoRow[]) => void
  addAdditionalInfoRow: () => void
  removeAdditionalInfoRow: (index: number) => void
  updateAdditionalInfoRow: (
    index: number,
    field: 'key' | 'value',
    value: string,
  ) => void
  loadDetails: () => Promise<void>
  saveDetails: () => Promise<boolean>
}

export const useUserDetailsStore = create<UserDetailsState>((set, get) => ({
  fullName: '',
  occupation: '',
  companyName: '',
  role: '',
  email: '',
  phoneNumber: '',
  businessAddress: '',
  website: '',
  linkedin: '',
  additionalInfo: [],
  isLoading: false,
  isSaving: false,
  isDirty: false,
  saveError: null,

  setField: (field, value) =>
    set({ [field]: value, isDirty: true, saveError: null }),

  setAdditionalInfo: info => set({ additionalInfo: info, isDirty: true }),

  addAdditionalInfoRow: () => {
    const { additionalInfo } = get()
    set({
      additionalInfo: [...additionalInfo, { key: '', value: '' }],
      isDirty: true,
    })
  },

  removeAdditionalInfoRow: index => {
    const { additionalInfo } = get()
    set({
      additionalInfo: additionalInfo.filter((_, i) => i !== index),
      isDirty: true,
    })
  },

  updateAdditionalInfoRow: (index, field, value) => {
    const { additionalInfo } = get()
    const updated = [...additionalInfo]
    updated[index] = { ...updated[index], [field]: value }
    set({ additionalInfo: updated, isDirty: true })
  },

  loadDetails: async () => {
    set({ isLoading: true })
    try {
      const result = await window.api.userDetails.get()
      if (result.details) {
        set({
          fullName: result.details.full_name || '',
          occupation: result.details.occupation || '',
          companyName: result.details.company_name || '',
          role: result.details.role || '',
          email: result.details.email || '',
          phoneNumber: result.details.phone_number || '',
          businessAddress: result.details.business_address || '',
          website: result.details.website || '',
          linkedin: result.details.linkedin || '',
        })
      }
      if (result.additionalInfo && result.additionalInfo.length > 0) {
        set({
          additionalInfo: result.additionalInfo.map((item: any) => ({
            key: item.info_key,
            value: item.info_value,
          })),
        })
      }
      set({ isDirty: false })
    } catch (error) {
      console.error('[UserDetails] Failed to load:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  saveDetails: async () => {
    const state = get()
    set({ isSaving: true, saveError: null })
    try {
      await window.api.userDetails.save({
        details: {
          full_name: state.fullName,
          occupation: state.occupation,
          company_name: state.companyName || undefined,
          role: state.role || undefined,
          email: state.email || undefined,
          phone_number: state.phoneNumber || undefined,
          business_address: state.businessAddress || undefined,
          website: state.website || undefined,
          linkedin: state.linkedin || undefined,
        },
        additionalInfo: state.additionalInfo.filter(
          row => row.key.trim() || row.value.trim(),
        ),
      })
      set({ isDirty: false })
      return true
    } catch (error) {
      console.error('[UserDetails] Failed to save:', error)
      set({ saveError: 'Failed to save. Please try again.' })
      return false
    } finally {
      set({ isSaving: false })
    }
  },
}))

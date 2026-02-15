import React, { useEffect, useState } from 'react'
import { useUserDetailsStore } from '../../../../store/useUserDetailsStore'
import { Button } from '../../../ui/button'

export default function MyDetailsSettingsContent() {
  const {
    fullName,
    occupation,
    companyName,
    role,
    email,
    phoneNumber,
    businessAddress,
    website,
    linkedin,
    additionalInfo,
    isLoading,
    isSaving,
    isDirty,
    saveError,
    setField,
    addAdditionalInfoRow,
    removeAdditionalInfoRow,
    updateAdditionalInfoRow,
    loadDetails,
    saveDetails,
  } = useUserDetailsStore()

  const [errors, setErrors] = useState<{
    fullName?: string
    occupation?: string
  }>({})
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    loadDetails()
  }, [])

  const handleSave = async () => {
    const newErrors: { fullName?: string; occupation?: string } = {}
    if (!fullName.trim()) newErrors.fullName = 'This field is required'
    if (!occupation.trim()) newErrors.occupation = 'This field is required'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})
    const success = await saveDetails()
    if (success) {
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    }
  }

  const inputClass =
    'w-80 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto max-h-[calc(100vh-200px)]">
      <div className="space-y-8 pb-8">
        {/* Section 1: Personal Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Personal Information
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Full Name *
              </label>
              <div className="flex flex-col">
                <input
                  type="text"
                  className={inputClass}
                  value={fullName}
                  onChange={e => {
                    setField('fullName', e.target.value)
                    if (errors.fullName)
                      setErrors(prev => ({ ...prev, fullName: undefined }))
                  }}
                  placeholder="John Doe"
                />
                {errors.fullName && (
                  <span className="text-xs text-red-500 mt-1">
                    {errors.fullName}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Occupation / Title *
              </label>
              <div className="flex flex-col">
                <input
                  type="text"
                  className={inputClass}
                  value={occupation}
                  onChange={e => {
                    setField('occupation', e.target.value)
                    if (errors.occupation)
                      setErrors(prev => ({ ...prev, occupation: undefined }))
                  }}
                  placeholder="Software Engineer"
                />
                {errors.occupation && (
                  <span className="text-xs text-red-500 mt-1">
                    {errors.occupation}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Company
              </label>
              <input
                type="text"
                className={inputClass}
                value={companyName}
                onChange={e => setField('companyName', e.target.value)}
                placeholder="Acme Inc."
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">Role</label>
              <input
                type="text"
                className={inputClass}
                value={role}
                onChange={e => setField('role', e.target.value)}
                placeholder="Team Lead"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">Email</label>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={e => setField('email', e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">Phone</label>
              <input
                type="tel"
                className={inputClass}
                value={phoneNumber}
                onChange={e => setField('phoneNumber', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200" />

        {/* Section 2: Contact Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Contact Information
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Business Address
              </label>
              <input
                type="text"
                className={inputClass}
                value={businessAddress}
                onChange={e => setField('businessAddress', e.target.value)}
                placeholder="123 Main St, City, Country"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Website
              </label>
              <input
                type="url"
                className={inputClass}
                value={website}
                onChange={e => setField('website', e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                LinkedIn
              </label>
              <input
                type="url"
                className={inputClass}
                value={linkedin}
                onChange={e => setField('linkedin', e.target.value)}
                placeholder="https://linkedin.com/in/johndoe"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200" />

        {/* Section 3: Additional Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Additional Information
          </h3>
          {additionalInfo.length === 0 ? (
            <p className="text-sm text-gray-400">
              Add custom information that will help personalize your experience
            </p>
          ) : (
            <div className="space-y-2">
              {additionalInfo.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={row.key}
                    onChange={e =>
                      updateAdditionalInfoRow(index, 'key', e.target.value)
                    }
                    placeholder="Key"
                  />
                  <input
                    type="text"
                    className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={row.value}
                    onChange={e =>
                      updateAdditionalInfoRow(index, 'value', e.target.value)
                    }
                    placeholder="Value"
                  />
                  <button
                    onClick={() => removeAdditionalInfoRow(index)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={addAdditionalInfoRow}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            ＋ Add
          </button>
        </div>

        <div className="border-t border-gray-200" />

        {/* Save button */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          {showSaved && (
            <span className="text-sm text-green-600 font-medium">✓ Saved</span>
          )}
          {saveError && (
            <span className="text-sm text-red-500">{saveError}</span>
          )}
        </div>
      </div>
    </div>
  )
}

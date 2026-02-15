import { create } from 'zustand'
import { useAuthStore } from './useAuthStore'

export type Note = {
  id: string
  content: string
  user_id: string
  interaction_id: string | null
  created_at: string
  updated_at: string
}

interface NotesStore {
  notes: Note[]
  loadNotes: () => Promise<void>
  addNote: (content: string) => Promise<void>
  updateNote: (id: string, content: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: [],

  loadNotes: async () => {
    console.log('[DEBUG][NotesStore] loadNotes called')
    try {
      const notes = await window.api.notes.getAll()
      console.log('[DEBUG][NotesStore] loadNotes received notes:', notes?.length, notes)
      set({ notes })
    } catch (error) {
      console.error('[DEBUG][NotesStore] Failed to load notes from database:', error)
    }
  },

  addNote: async (content: string) => {
    const { user } = useAuthStore.getState()
    console.log('[DEBUG][NotesStore] addNote called:', { content, user })
    if (!user) {
      console.error('[DEBUG][NotesStore] Cannot add a note without a logged-in user.')
      return
    }
    try {
      const noteToAdd = {
        content: content.trim(),
        user_id: user.id,
      }
      console.log('[DEBUG][NotesStore] Calling window.api.notes.add with:', noteToAdd)
      const newNote = await window.api.notes.add(noteToAdd)
      console.log('[DEBUG][NotesStore] addNote result:', newNote)
      set(state => ({ notes: [newNote, ...state.notes] }))
    } catch (error) {
      console.error('[DEBUG][NotesStore] Failed to add note to database:', error)
    }
  },

  updateNote: async (id: string, content: string) => {
    try {
      await window.api.notes.updateContent(id, content)
      // For an immediate UI update, we can call loadNotes again
      // or manually update the state.
      get().loadNotes()
    } catch (error) {
      console.error('Failed to update note in database:', error)
    }
  },

  deleteNote: async (id: string) => {
    try {
      await window.api.notes.delete(id)
      set(state => ({
        notes: state.notes.filter(note => note.id !== id),
      }))
    } catch (error) {
      console.error('Failed to delete note from database:', error)
    }
  },
}))

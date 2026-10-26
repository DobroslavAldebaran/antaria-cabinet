const key = (uid: string) => `antaria.folder.${uid}`

export type FolderBinding = {
  folderId: string
  folderName: string
}

export function loadFolderBinding(uid: string): FolderBinding | null {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as FolderBinding
    if (!parsed.folderId) return null
    return parsed
  } catch {
    return null
  }
}

export function saveFolderBinding(uid: string, binding: FolderBinding): void {
  localStorage.setItem(key(uid), JSON.stringify(binding))
}

export function clearFolderBinding(uid: string): void {
  localStorage.removeItem(key(uid))
}

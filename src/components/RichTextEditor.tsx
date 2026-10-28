import { useEffect, useRef, useState } from 'react'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  ensureMediaFolder,
  uploadMediaFile,
} from '../lib/drive'
import { sanitizeHtml } from '../lib/sanitize'

export function RichTextEditor({
  value,
  onChange,
  disabled,
  folderId,
  getAccessToken,
}: {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  folderId?: string
  getAccessToken?: () => Promise<string>
}) {
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const skipEmit = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: sanitizeHtml(value || ''),
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      if (skipEmit.current) return
      onChange(sanitizeHtml(ed.getHTML()))
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    const next = sanitizeHtml(value || '')
    const current = editor.getHTML()
    if (next === current) return
    if (next === '<p></p>' && (current === '' || current === '<p></p>')) return
    skipEmit.current = true
    editor.commands.setContent(next, { emitUpdate: false })
    skipEmit.current = false
  }, [editor, value])

  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Ссылка (https://…)', prev ?? 'https://')
    if (url === null) return
    const trimmed = url.trim()
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: trimmed })
      .run()
  }

  const uploadImage = async (file: File) => {
    if (!editor || !folderId || !getAccessToken) {
      setUploadErr('Нет доступа к Drive для загрузки картинки')
      return
    }
    setUploadErr(null)
    setUploading(true)
    try {
      const token = await getAccessToken()
      const media = await ensureMediaFolder(token, folderId)
      const { url } = await uploadMediaFile(
        token,
        media.id,
        file,
        file.name,
        file.type || 'image/png',
      )
      editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setUploading(false)
    }
  }

  if (!editor) return null

  return (
    <div className={disabled ? 'rich-text is-disabled' : 'rich-text'}>
      <div className="rich-text-toolbar" role="toolbar" aria-label="Форматирование">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled}
          aria-pressed={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Ж
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled}
          aria-pressed={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          К
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled}
          aria-pressed={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • Список
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled}
          aria-pressed={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. Список
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled}
          aria-pressed={editor.isActive('link')}
          onClick={setLink}
        >
          Ссылка
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled || uploading || !folderId}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'Загрузка…' : 'Картинка'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void uploadImage(file)
          }}
        />
      </div>
      <EditorContent editor={editor} className="rich-text-body" />
      {uploadErr ? <p className="error">{uploadErr}</p> : null}
    </div>
  )
}

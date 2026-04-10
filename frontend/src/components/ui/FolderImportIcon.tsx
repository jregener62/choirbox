interface FolderImportIconProps {
  size?: number
}

export function FolderImportIcon({ size = 24 }: FolderImportIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Folder body */}
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
      {/* Plus sign */}
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  )
}

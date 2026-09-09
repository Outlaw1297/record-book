export function DeleteRecordButton({
  label,
  confirmText,
  onDelete,
  compact = false,
}: {
  label: string;
  confirmText: string;
  onDelete: () => void | Promise<void>;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={compact ? 'btn danger' : 'btn danger block'}
      style={compact ? undefined : { marginTop: '0.75rem' }}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        void onDelete();
      }}
    >
      {label}
    </button>
  );
}

export function DeleteRecordButton({
  label,
  confirmText,
  onDelete,
}: {
  label: string;
  confirmText: string;
  onDelete: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      className="btn danger block"
      style={{ marginTop: '0.75rem' }}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        void onDelete();
      }}
    >
      {label}
    </button>
  );
}

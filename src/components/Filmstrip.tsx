import { useEditor } from "../state/store";

export function Filmstrip() {
  const photoOrder = useEditor((s) => s.photoOrder);
  const photos = useEditor((s) => s.photos);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const setActivePhoto = useEditor((s) => s.setActivePhoto);
  const removePhoto = useEditor((s) => s.removePhoto);

  if (photoOrder.length === 0) return null;

  return (
    <div className="filmstrip">
      {photoOrder.map((id) => {
        const photo = photos[id];
        if (!photo) return null;
        const isActive = id === activePhotoId;
        const needsFile = !photo.sourceFile;
        return (
          <button
            key={id}
            type="button"
            className={`filmstrip-item ${isActive ? "active" : ""} ${needsFile ? "needs-file" : ""}`}
            onClick={() => setActivePhoto(id)}
            title={photo.filename}
          >
            {photo.thumbnailUrl ? (
              <img
                className="filmstrip-thumb"
                src={photo.thumbnailUrl}
                alt=""
                draggable={false}
              />
            ) : (
              <span className="filmstrip-thumb filmstrip-thumb-placeholder" />
            )}
            {needsFile && <span className="filmstrip-badge">reopen</span>}
            <span
              className="filmstrip-remove"
              role="button"
              tabIndex={-1}
              title="Remove from catalog"
              onClick={(e) => {
                e.stopPropagation();
                removePhoto(id);
              }}
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
}

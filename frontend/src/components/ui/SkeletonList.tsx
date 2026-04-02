/**
 * Skeleton-Platzhalter für Dateilisten.
 * Imitiert die .file-item-Struktur mit animierten Balken,
 * um Layout-Sprünge beim Laden zu vermeiden.
 */

const WIDTHS = ['70%', '55%', '80%', '45%', '65%', '75%', '50%', '60%'];

export default function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="file-list skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="file-item skeleton-item">
          <div className="file-icon-box skeleton-bone skeleton-icon" />
          <div className="file-info">
            <div
              className="skeleton-bone skeleton-name"
              style={{ width: WIDTHS[i % WIDTHS.length] }}
            />
            <div className="skeleton-bone skeleton-meta" />
          </div>
        </li>
      ))}
    </ul>
  );
}

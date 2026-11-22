import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Inbox, X, type LucideIcon } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'default' | 'teal' | 'amber' | 'rose' | 'violet';
  hint?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon size={18} strokeWidth={2} />
        </span>
      </div>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`card stat-card stat-${tone} stat-clickable`}
        onClick={onClick}
        aria-label={`View ${label} details`}
      >
        {content}
        <ChevronRight className="stat-chevron" size={16} aria-hidden="true" />
      </button>
    );
  }

  return <Card className={`stat-card stat-${tone}`}>{content}</Card>;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md';
  icon?: LucideIcon;
}) {
  return (
    <button className={`btn btn-${variant} btn-${size}`} {...props}>
      {Icon && <Icon size={15} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

export function Badge({ value }: { value: string }) {
  const key = value.toLowerCase().replace(/[\s_]+/g, '-');
  return <span className={`badge badge-${key}`}>{value.replace(/_/g, ' ')}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  emptyText = 'No records found.',
  getRowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
  getRowKey?: (row: T) => string | number;
}) {
  const rowKey = (row: T, index: number) =>
    getRowKey?.(row) ?? (row as { id?: number }).id ?? index;
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Inbox size={28} strokeWidth={1.6} />
        <p>{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Banner({ kind, text }: { kind: 'error' | 'success'; text: string }) {
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div className={`banner banner-${kind}`}>
      <Icon size={16} />
      <span>{text}</span>
    </div>
  );
}

export function Loader() {
  return <div className="loader"><span className="spinner" /> Loading...</div>;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

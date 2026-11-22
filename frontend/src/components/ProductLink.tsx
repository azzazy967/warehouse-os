import { Link } from 'react-router-dom';

interface ProductLinkProps {
  id?: number | null;
  name: string;
  sku?: string | null;
  className?: string;
  onClick?: () => void;
}

/** Navigates to the full product page from any product reference in the app. */
export function ProductLink({ id, name, sku, className = '', onClick }: ProductLinkProps) {
  const label = sku ? `${sku} - ${name}` : name;
  if (!id) return <span className={className}>{name}</span>;
  return (
    <Link
      to={`/products/${id}`}
      className={`product-link ${className}`.trim()}
      title={`Open ${label}`}
      onClick={onClick}
    >
      {name}
    </Link>
  );
}

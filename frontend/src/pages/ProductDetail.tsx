import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import {
  ArrowLeft,
  Boxes,
  Download,
  ImageOff,
  MapPin,
  Pencil,
  Printer,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  api,
  apiMessage,
  imageUrl,
  type InventoryRow,
  type Product,
  type StockMovement,
} from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  Field,
  Loader,
  Modal,
  PageHeader,
  formatDateTime,
  formatMoney,
  type Column,
} from '../ui';

interface ProductForm {
  sku: string;
  name: string;
  description: string;
  category: string;
  unitOfMeasure: string;
  reorderLevel: string;
  unitCost: string;
  weight: string;
  isActive: boolean;
}

const formFromProduct = (product: Product): ProductForm => ({
  sku: product.sku,
  name: product.name,
  description: product.description || '',
  category: product.category || '',
  unitOfMeasure: product.unitOfMeasure,
  reorderLevel: String(product.reorderLevel),
  unitCost: String(product.unitCost),
  weight: String(product.weight),
  isActive: product.isActive,
});

const payloadFromForm = (form: ProductForm) => ({
  ...form,
  reorderLevel: Number(form.reorderLevel),
  unitCost: Number(form.unitCost),
  weight: Number(form.weight),
  category: form.category || null,
  description: form.description || null,
});

function useProductData(id: number | undefined) {
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const silentReload = useRef(false);

  const load = useCallback(() => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      setError('Invalid product id.');
      setLoading(false);
      return () => undefined;
    }
    // Background refreshes after an action keep the page mounted (and modal focus intact).
    const silent = silentReload.current;
    silentReload.current = false;
    let active = true;
    if (!silent) setLoading(true);
    setError('');
    Promise.all([
      api.get<Product>(`/products/${id}`),
      api.get<StockMovement[]>(`/movements?productId=${id}`),
    ])
      .then(([detail, history]) => {
        if (!active) return;
        setProduct(detail.data);
        setMovements(history.data);
      })
      .catch((caught) => {
        if (active) setError(apiMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  useEffect(() => load(), [load]);
  return {
    product,
    movements,
    loading,
    error,
    setProduct,
    reload: () => {
      silentReload.current = true;
      setReloadKey((key) => key + 1);
    },
  };
}

function ImagePanel({
  product,
  canManage,
  busy,
  onUpload,
  onRemove,
}: {
  product: Product;
  canManage: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const source = imageUrl(product.imagePath);
  return (
    <div className="product-image-frame">
      {source ? (
        <img src={source} alt={product.name} className="product-image" />
      ) : (
        <div className="product-image-placeholder">
          <Boxes size={46} strokeWidth={1.4} />
          <span>No image uploaded</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="visually-hidden"
        aria-label="Product image file"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = '';
        }}
      />
      {canManage && (
        <div className="product-image-actions">
          <Button
            size="sm"
            icon={Upload}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {source ? 'Replace' : 'Upload'}
          </Button>
          {source && (
            <Button
              size="sm"
              variant="secondary"
              icon={ImageOff}
              disabled={busy}
              onClick={onRemove}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function BarcodeCard({ product }: { product: Product }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { theme } = useTheme();
  const light = theme === 'light';
  const value = product.barcode || product.sku;

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, value, {
      format: 'CODE128',
      lineColor: light ? '#0f172a' : '#e4e4f0',
      background: 'transparent',
      width: 2,
      height: 64,
      displayValue: true,
      font: 'monospace',
      fontSize: 16,
      textMargin: 8,
      margin: 4,
    });
  }, [value, light]);

  const download = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${product.sku}-barcode.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Defer revocation so Safari/Firefox finish reading the blob before it is freed.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Card className="barcode-card">
      <div className="card-heading">
        <h2>Barcode</h2>
        <span className="muted-text">Code 128</span>
      </div>
      <div className="barcode-scroll">
        <svg ref={svgRef} role="img" aria-label={`Code 128 barcode for ${value}`} />
      </div>
      <div className="barcode-actions">
        <Button size="sm" variant="secondary" icon={Download} onClick={download}>
          Download SVG
        </Button>
        <Button size="sm" variant="ghost" icon={Printer} onClick={() => window.print()}>
          Print label
        </Button>
      </div>
    </Card>
  );
}

function DetailsCard({ product }: { product: Product }) {
  const facts: Array<[string, string]> = [
    ['SKU', product.sku],
    ['Category', product.category || 'Uncategorized'],
    ['Unit of measure', product.unitOfMeasure],
    ['Unit cost', formatMoney(product.unitCost)],
    ['Weight (kg)', String(product.weight)],
    ['Reorder level', String(product.reorderLevel)],
    ['Created', formatDateTime(product.createdAt)],
    ['Updated', formatDateTime(product.updatedAt)],
  ];
  return (
    <Card className="product-details-card">
      <div className="card-heading">
        <h2>Product details</h2>
        <Badge value={product.isActive ? 'ACTIVE' : 'INACTIVE'} />
      </div>
      <div className="fact-grid">
        {facts.map(([label, value]) => (
          <div className="fact" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {product.description && (
        <div className="product-description">
          <span>Description</span>
          <p>{product.description}</p>
        </div>
      )}
    </Card>
  );
}

function StockCard({ rows }: { rows: InventoryRow[] }) {
  const columns: Column<InventoryRow>[] = [
    {
      key: 'location',
      header: 'Location',
      render: (row) => (
        <div className="cell-stack">
          <strong className="mono">{row.location?.code || '-'}</strong>
          <small>{row.location?.warehouse || '-'}</small>
        </div>
      ),
    },
    {
      key: 'zone',
      header: 'Zone',
      render: (row) => [row.location?.zone, row.location?.aisle, row.location?.rack, row.location?.bin]
        .filter(Boolean)
        .join(' / ') || '-',
    },
    { key: 'onHand', header: 'On hand', render: (row) => row.quantityOnHand },
    { key: 'reserved', header: 'Reserved', render: (row) => row.quantityReserved },
    {
      key: 'available',
      header: 'Available',
      render: (row) => row.quantityOnHand - row.quantityReserved,
    },
  ];
  return (
    <Card>
      <div className="card-heading">
        <h2><MapPin size={16} /> Stock by location</h2>
        <span className="muted-text">{rows.length} location(s)</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        emptyText="No stock recorded for this product."
      />
    </Card>
  );
}

function MovementsCard({ rows }: { rows: StockMovement[] }) {
  const columns: Column<StockMovement>[] = [
    { key: 'date', header: 'Date', render: (row) => formatDateTime(row.createdAt) },
    { key: 'type', header: 'Type', render: (row) => <Badge value={row.type} /> },
    {
      key: 'quantity',
      header: 'Quantity',
      render: (row) => <span className={row.quantity < 0 ? 'negative' : 'positive'}>{row.quantity}</span>,
    },
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '-' },
    {
      key: 'location',
      header: 'Location',
      render: (row) => row.location?.code || '-',
    },
  ];
  return (
    <Card>
      <div className="card-heading">
        <h2>Movement history</h2>
        <span className="muted-text">Most recent first</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        emptyText="No stock movements recorded yet."
      />
    </Card>
  );
}

export function ProductDetailPage() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can('ADMIN', 'MANAGER');
  const { product, movements, loading, error, setProduct, reload } = useProductData(id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProductForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const runAction = async (message: string, action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setActionError('');
    try {
      await action();
      setNotice(message);
      reload();
      return true;
    } catch (caught) {
      setActionError(apiMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openEdit = () => {
    if (!product) return;
    setActionError('');
    setForm(formFromProduct(product));
    setEditing(true);
  };

  const saveEdit = () => {
    if (!form || !product) return;
    void runAction('Product updated.', async () => {
      await api.patch(`/products/${product.id}`, payloadFromForm(form));
      setEditing(false);
    });
  };

  const uploadImage = (file: File) => {
    if (!product) return;
    const data = new FormData();
    data.append('image', file);
    void runAction('Image updated.', async () => {
      const response = await api.post<{ imagePath: string }>(`/products/${product.id}/image`, data);
      setProduct({ ...product, imagePath: response.data.imagePath });
    });
  };

  const removeImage = () => {
    if (!product) return;
    void runAction('Image removed.', async () => {
      await api.delete(`/products/${product.id}/image`);
      setProduct({ ...product, imagePath: null });
    });
  };

  const toggleActive = () => {
    if (!product) return;
    void runAction(product.isActive ? 'Product deactivated.' : 'Product activated.', async () => {
      await api.patch(`/products/${product.id}`, { isActive: !product.isActive });
    });
  };

  const removeProduct = () => {
    if (!product || !window.confirm(`Delete product ${product.sku}? This cannot be undone.`)) return;
    const target = canManage ? '/products' : '/';
    void runAction('Product deleted.', async () => {
      await api.delete(`/products/${product.id}`);
    }).then((success) => {
      // Navigate only after the action has finished updating state on this page.
      if (success) navigate(target);
    });
  };

  if (loading) return <Loader />;
  if (error || !product || !Number.isInteger(id)) {
    return (
      <>
        <Banner kind="error" text={error || 'Product not found.'} />
        <Button icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`SKU ${product.sku} - product overview and management`}
        actions={
          <div className="row-actions">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
            {canManage && (
              <>
                <Button variant="secondary" icon={Pencil} onClick={openEdit}>Edit</Button>
                <Button variant="secondary" onClick={toggleActive} disabled={busy}>
                  {product.isActive ? 'Deactivate' : 'Activate'}
                </Button>
                {can('ADMIN') && (
                  <Button variant="danger" icon={Trash2} onClick={removeProduct} disabled={busy}>
                    Delete
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />
      {notice && <Banner kind="success" text={notice} />}
      {actionError && <Banner kind="error" text={actionError} />}

      <div className="product-hero">
        <Card className="product-media-card">
          <div className="card-heading"><h2>Image</h2></div>
          <ImagePanel
            product={product}
            canManage={canManage}
            busy={busy}
            onUpload={uploadImage}
            onRemove={removeImage}
          />
        </Card>
        <DetailsCard product={product} />
        <BarcodeCard product={product} />
      </div>

      <div className="product-sections">
        <StockCard rows={product.inventory || []} />
        <MovementsCard rows={movements} />
      </div>

      <Modal
        open={editing && !!form}
        title="Edit product"
        onClose={() => setEditing(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</Button>
          </>
        }
      >
        {form && (
          <div className="form-grid">
            <Field label="SKU"><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></Field>
            <Field label="Product name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Category"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Unit of measure"><input value={form.unitOfMeasure} onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })} /></Field>
            <Field label="Reorder level"><input type="number" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></Field>
            <Field label="Unit cost"><input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></Field>
            <Field label="Weight (kg)"><input type="number" min="0" step="0.001" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field>
            <label className="check-inline field-check">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
            <Field label="Description" hint="Optional">
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}

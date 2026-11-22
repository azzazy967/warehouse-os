import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, apiMessage, type Product } from '../api';
import { useAuth } from '../auth';
import { ProductLink } from '../components/ProductLink';
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

const emptyForm: ProductForm = {
  sku: '',
  name: '',
  description: '',
  category: '',
  unitOfMeasure: 'EA',
  reorderLevel: '0',
  unitCost: '0',
  weight: '0',
  isActive: true,
};

export function ProductsPage() {
  const { can } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (lowStock) params.set('lowStock', 'true');
    Promise.all([api.get<Product[]>(`/products?${params}`), api.get<string[]>('/products/categories')])
      .then(([productsResponse, categoriesResponse]) => {
        setProducts(productsResponse.data);
        setCategories(categoriesResponse.data);
      })
      .catch((caught) => setError(apiMessage(caught)))
      .finally(() => setLoading(false));
  }, [search, category, lowStock]);

  useEffect(() => {
    const timer = window.setTimeout(load, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
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
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        reorderLevel: Number(form.reorderLevel),
        unitCost: Number(form.unitCost),
        weight: Number(form.weight),
        category: form.category || null,
        description: form.description || null,
      };
      if (editing) {
        await api.patch(`/products/${editing.id}`, payload);
        setNotice('Product updated successfully.');
      } else {
        await api.post('/products', payload);
        setNotice('Product created successfully.');
      }
      setModalOpen(false);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (product: Product) => {
    if (!window.confirm(`Delete product ${product.sku}? This cannot be undone.`)) return;
    try {
      await api.delete(`/products/${product.id}`);
      setNotice('Product deleted.');
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const columns: Column<Product>[] = [
    {
      key: 'sku',
      header: 'SKU',
      render: (row) => <span className="mono accent-text">{row.sku}</span>,
    },
    {
      key: 'name',
      header: 'Product',
      render: (row) => (
        <div className="cell-stack">
          <strong><ProductLink id={row.id} name={row.name} sku={row.sku} /></strong>
          {row.description && <small>{row.description}</small>}
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (row) => row.category || '-' },
    { key: 'uom', header: 'UOM', render: (row) => row.unitOfMeasure },
    { key: 'cost', header: 'Unit cost', render: (row) => formatMoney(row.unitCost) },
    {
      key: 'stock',
      header: 'On hand',
      render: (row) => {
        const total = (row.inventory || []).reduce((sum, item) => sum + item.quantityOnHand, 0);
        return <span className={total <= row.reorderLevel ? 'negative' : ''}>{total}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge value={row.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'actions-col',
      render: (row) => (
        <div className="row-actions">
          {can('ADMIN', 'MANAGER') && (
            <>
              <button className="icon-btn" onClick={() => openEdit(row)} title="Edit" aria-label="Edit product">
                <Pencil size={15} />
              </button>
              {can('ADMIN') && (
                <button className="icon-btn danger" onClick={() => remove(row)} title="Delete" aria-label="Delete product">
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Maintain your catalog of stock-keeping units"
        actions={
          can('ADMIN', 'MANAGER') && (
            <Button icon={Plus} onClick={openCreate}>Add product</Button>
          )
        }
      />

      {error && !modalOpen && <Banner kind="error" text={error} />}
      {notice && <Banner kind="success" text={notice} />}

      <Card>
        <div className="toolbar">
          <div className="input-wrap search-wrap">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className="check-inline">
            <input type="checkbox" checked={lowStock} onChange={(event) => setLowStock(event.target.checked)} />
            Low stock only
          </label>
        </div>

        {loading ? <Loader /> : <DataTable columns={columns} rows={products} emptyText="No products found." />}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? 'Edit product' : 'New product'}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save product'}</Button>
          </>
        }
      >
        {error && modalOpen && <Banner kind="error" text={error} />}
        <div className="form-grid">
          <Field label="SKU"><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="EL-1004" required /></Field>
          <Field label="Product name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Wireless scanner" required /></Field>
          <Field label="Category"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Electronics" /></Field>
          <Field label="Unit of measure"><input value={form.unitOfMeasure} onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })} placeholder="EA" /></Field>
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
      </Modal>
    </>
  );
}

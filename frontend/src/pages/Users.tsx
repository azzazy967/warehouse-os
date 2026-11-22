import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Shield, Trash2, UserCog } from 'lucide-react';
import { api, apiMessage, type AuthUser } from '../api';
import { useAuth } from '../auth';
import {
  Badge, Banner, Button, Card, DataTable, Field, Loader, Modal, PageHeader,
  type Column,
} from '../ui';

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
}

const emptyForm: UserForm = { name: '', email: '', password: '', role: 'PICKER', isActive: true };

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get<AuthUser[]>('/users')
      .then((response) => setRows(response.data))
      .catch((caught) => setError(apiMessage(caught)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (row: AuthUser) => {
    setEditing(row);
    setForm({ name: row.name, email: row.email, password: '', role: row.role, isActive: row.isActive });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        isActive: form.isActive,
      };
      if (!editing || form.password) payload.password = form.password;
      if (editing) {
        await api.patch(`/users/${editing.id}`, payload);
        setNotice('User updated successfully.');
      } else {
        await api.post('/users', payload);
        setNotice('User created successfully.');
      }
      setModalOpen(false);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: AuthUser) => {
    if (row.id === currentUser?.id) {
      setError('You cannot delete your own account.');
      return;
    }
    if (!window.confirm(`Delete user ${row.name}?`)) return;
    try {
      await api.delete(`/users/${row.id}`);
      setNotice('User deleted.');
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const columns: Column<AuthUser>[] = [
    {
      key: 'name', header: 'User',
      render: (row) => (
        <div className="user-cell">
          <span className="avatar avatar-sm">{row.name.slice(0, 1).toUpperCase()}</span>
          <div className="cell-stack"><strong>{row.name}</strong><small>{row.email}</small></div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (row) => <Badge value={row.role} /> },
    { key: 'id', header: 'ID', render: (row) => <span className="mono muted">#{row.id}</span> },
    {
      key: 'actions', header: '', className: 'actions-col',
      render: (row) => (
        <div className="row-actions">
          <button className="icon-btn" onClick={() => openEdit(row)} aria-label="Edit user" title="Edit"><Pencil size={15} /></button>
          <button className="icon-btn danger" onClick={() => remove(row)} aria-label="Delete user" title="Delete"><Trash2 size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users & Roles"
        subtitle="Control who can access warehouse operations"
        actions={<Button icon={Plus} onClick={openCreate}>Add user</Button>}
      />
      {error && !modalOpen && <Banner kind="error" text={error} />}
      {notice && <Banner kind="success" text={notice} />}

      <div className="role-legend">
        <Card><Shield size={17} /><div><strong>Administrator</strong><small>Full access including users and settings</small></div></Card>
        <Card><UserCog size={17} /><div><strong>Manager</strong><small>Manage catalog, receipts, picks and shipments</small></div></Card>
        <Card><Badge value="PICKER" /><div><strong>Picker</strong><small>Execute assigned pick orders</small></div></Card>
      </div>

      <Card>
        {loading ? <Loader /> : <DataTable columns={columns} rows={rows} emptyText="No users found." />}
      </Card>

      <Modal
        open={modalOpen} title={editing ? 'Edit user' : 'New user'} onClose={() => setModalOpen(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name || !form.email || (!editing && !form.password) || (!!form.password && form.password.length < 8)}>{saving ? 'Saving...' : 'Save user'}</Button>
        </>}
      >
        {error && <Banner kind="error" text={error} />}
        <div className="form-grid">
          <Field label="Full name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label={editing ? 'New password' : 'Password'} hint={editing ? 'Leave blank to keep current password' : 'Minimum 8 characters'}>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="ADMIN">Administrator</option>
              <option value="MANAGER">Manager</option>
              <option value="PICKER">Picker</option>
            </select>
          </Field>
          <label className="check-inline field-check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Active account</label>
        </div>
      </Modal>
    </>
  );
}

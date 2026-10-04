export function MenuManagement() {
  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <h1>Manage the menu in Admin</h1>
      <p>Names, descriptions, photos, prices, sizes and availability are managed together in Admin.</p>
      <p>Existing Studio menu documents are retained as read-only import sources. Editing them no longer changes the public menu.</p>
      <a href="/admin/menu">Open menu management →</a>
    </div>
  );
}
